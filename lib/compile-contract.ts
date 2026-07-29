import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { AVAILABLE_TOOLS, ContractSpec, dropUnverifiableRules } from './contract-schema';
import { COMPILER_MODEL } from './models';
import { correctProvenance } from './provenance';

/**
 * Gemini call 1: the contract compiler.
 *
 * Reads the handover pack — invoice documents, the finance team's email thread, and the
 * controller's voice note as inline audio — and emits a ContractSpec. The audio path is live:
 * pass a voiceNote and it goes to the model as an inline part in the same pass that produces
 * the rules, so the transcript and the clauses come out together and provenance can be
 * highlighted against the transcript.
 */

export type CompileInputs = {
  emailThread: string | null;
  voiceNote?: { data: Buffer; mimeType: string } | null;
  invoiceSamples: { name: string; data: Buffer; mimeType: string }[];
};

export type CompileResult = {
  spec: ContractSpec;
  transcript: string | null;
  /** Which inputs were actually present. Recorded so a score can be labelled honestly. */
  sources: { email: boolean; voiceNote: boolean; invoiceSamples: number };
  attempts: number;
  /** Rules the unverifiable-source check removed from the executable set. */
  droppedUnverifiable: { id: string; tools: string[] }[];
};

/**
 * Something that has actually happened inside the one model call, reported as it happens.
 *
 * The compile is a single generateContent, so there is no honest way to say which document is
 * being read — they all went in together and the model does not report its progress through
 * them. What is genuinely observable is the reply being written: the clauses arrive in order, one
 * complete JSON object at a time, and a clause that has arrived is a fact. Everything here is read
 * out of bytes already received, which is why none of it can be ahead of the truth.
 */
export type CompileProgress =
  | { kind: 'clause'; id: string; then: string; when: string }
  | { kind: 'transcript' }
  | { kind: 'questions'; count: number };

const Envelope = ContractSpec.extend({
  voice_note_transcript: z.string().nullable().optional(),
});

const TOOL_LIST = AVAILABLE_TOOLS.join(', ');

const SYSTEM = `You are compiling an employment contract for a digital employee that will process
accounts payable invoices. You are given real invoice documents, an email thread between
the finance team, and (when supplied) a voice note from the controller.

Extract EVERY operating rule that actually governs this process — exhaustive, not a sample
or a representative subset. If the inputs state a rule, it must appear as a clause. Rules must
be specific and executable, not principles. "Check the invoice carefully" is not a rule. "If
the invoice total exceeds the PO total by more than 2 percent or 50 USD, whichever is lower,
escalate to the AP manager" is a rule.

Every rule must cite the exact phrase from the input it came from. The quote must be a
verbatim substring of the input, copied character for character. Do not paraphrase, do not
tidy the grammar, do not merge two sentences. If you inferred a rule rather than extracting
it, mark provenance as "inferred" and lower its confidence.

Anything you cannot determine from the inputs goes in open_questions. Do not invent a
rule to fill a gap. A missing rule is recoverable; a wrong rule is not.

Number rules R-01 upward. Available tools the employee may use: ${TOOL_LIST}.
tools_allowed MUST list every tool the rules depend on. A rule that needs a data source
(price list, goods receipt, vendor terms, purchase order, ledger search) is only executable
when the matching tool is in tools_allowed.

Return only JSON matching this shape. No prose, no markdown fences.
{
  "role": string,
  "scope": string,
  "tools_allowed": string[],
  "rules": [{
    "id": string,
    "when": string,
    "then": "approve" | "reject" | "escalate" | "check",
    "detail": string,
    "provenance": { "source": "voice_note" | "email" | "invoice_sample" | "inferred", "quote": string },
    "confidence": number
  }],
  "exception_taxonomy": [{ "code": string, "description": string, "default_action": "approve" | "reject" | "escalate" }],
  "escalation": { "min_confidence": number, "always_escalate_above_amount": number | null, "route_to": string },
  "open_questions": string[],
  "voice_note_transcript": string | null
}

voice_note_transcript must be a faithful transcript of the audio when audio is supplied,
and null when it is not.`;

function buildParts(inputs: CompileInputs) {
  const parts: Record<string, unknown>[] = [];

  for (const doc of inputs.invoiceSamples) {
    parts.push({ text: `Invoice document: ${doc.name}` });
    parts.push({ inlineData: { mimeType: doc.mimeType, data: doc.data.toString('base64') } });
  }

  if (inputs.emailThread) {
    parts.push({ text: `Email thread between the finance team:\n\n${inputs.emailThread}` });
  }

  if (inputs.voiceNote) {
    parts.push({ text: 'Voice note from the controller:' });
    parts.push({
      inlineData: { mimeType: inputs.voiceNote.mimeType, data: inputs.voiceNote.data.toString('base64') },
    });
  } else {
    parts.push({
      text:
        'No voice note was supplied with this handover pack. Compile from the documents and the ' +
        'email thread alone, and do not attribute any rule to a voice note.',
    });
  }

  return parts;
}

const stripFences = (s: string) =>
  s
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

/**
 * A clause head that has fully arrived: the id, a closed `when`, and the action. The closing quotes
 * are what make it safe to report — a field still being written has no closing quote yet, so it
 * does not match until the sentence is complete. All three are required rather than just the id and
 * the condition, so a clause never appears on the log without the action it resolves to and the
 * lines read the same way as each other.
 */
const CLAUSE_HEAD =
  /"id"\s*:\s*"([^"]+)"\s*,\s*"when"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"then"\s*:\s*"(approve|reject|escalate|check)"/g;

const unescape = (s: string) => s.replace(/\\"/g, '"').replace(/\\n/g, ' ').replace(/\\\\/g, '\\');

/** Reports every clause visible in the bytes received so far and not yet announced. */
function reportProgress(raw: string, seen: Set<string>, onProgress: (p: CompileProgress) => void) {
  CLAUSE_HEAD.lastIndex = 0;
  for (const m of raw.matchAll(CLAUSE_HEAD)) {
    const id = m[1];
    if (seen.has(id)) continue;
    seen.add(id);
    onProgress({ kind: 'clause', id, then: m[3], when: unescape(m[2]) });
  }

  if (!seen.has('\0transcript') && /"voice_note_transcript"\s*:\s*"/.test(raw)) {
    seen.add('\0transcript');
    onProgress({ kind: 'transcript' });
  }

  const questions = /"open_questions"\s*:\s*\[([\s\S]*?)\]/.exec(raw);
  if (questions && !seen.has('\0questions')) {
    seen.add('\0questions');
    const count = (questions[1].match(/"(?:[^"\\]|\\.)*"/g) ?? []).length;
    if (count) onProgress({ kind: 'questions', count });
  }
}

export async function compileContract(
  inputs: CompileInputs,
  /**
   * Called as the reply arrives. Optional, and the call is made the same way either way: the
   * response is streamed whether or not anyone is listening, so what a script measures is what a
   * screen gets.
   */
  onProgress?: (p: CompileProgress) => void,
): Promise<CompileResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set. Put it in .env.local.');
  const ai = new GoogleGenAI({ apiKey });

  const parts = buildParts(inputs);
  let correction = '';

  // One retry, with the validation error appended, exactly as the build spec requires.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const stream = await ai.models.generateContentStream({
      model: COMPILER_MODEL,
      contents: [{ role: 'user', parts: correction ? [...parts, { text: correction }] : parts }],
      config: {
        systemInstruction: SYSTEM,
        responseMimeType: 'application/json',
        temperature: 0.2,
        maxOutputTokens: 32000,
      },
    });

    let accumulated = '';
    const seen = new Set<string>();
    for await (const chunk of stream) {
      const piece = chunk.text ?? '';
      if (!piece) continue;
      accumulated += piece;
      if (onProgress) reportProgress(accumulated, seen, onProgress);
    }

    const raw = stripFences(accumulated);
    if (!raw) {
      correction = 'Your previous reply was empty. Return only the JSON object.';
      continue;
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch (e) {
      correction = `Your previous reply was not valid JSON (${(e as Error).message}). Return only the JSON object, no fences.`;
      continue;
    }

    const parsed = Envelope.safeParse(parsedJson);
    if (parsed.success) {
      const { voice_note_transcript, ...rawSpec } = parsed.data;
      const { spec: droppedSpec, dropped } = dropUnverifiableRules(rawSpec);
      const transcript = inputs.voiceNote ? (voice_note_transcript ?? null) : null;
      const spec = {
        ...droppedSpec,
        rules: correctProvenance(droppedSpec.rules, { emailThread: inputs.emailThread, transcript }),
      };
      return {
        spec,
        transcript,
        sources: {
          email: Boolean(inputs.emailThread),
          voiceNote: Boolean(inputs.voiceNote),
          invoiceSamples: inputs.invoiceSamples.length,
        },
        attempts: attempt,
        droppedUnverifiable: dropped,
      };
    }

    correction = `Your previous reply did not match the schema:\n${z.prettifyError(parsed.error)}\nReturn corrected JSON only.`;
  }

  throw new Error(`Compiler failed schema validation twice. Last error:\n${correction}`);
}
