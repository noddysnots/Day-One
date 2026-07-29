import { FinishReason, GoogleGenAI, type Content } from '@google/genai';
import { serializeContract, type ContractSpec } from './contract-schema';
import { RUNTIME_MODEL } from './models';
import { db } from './supabase';
import { executeTool, functionDeclarations, type TerminalDecision } from './tools';
import { citedRule, readsAsReasoning } from './trace';

/**
 * Gemini call 2: the agent runtime.
 *
 * One independent loop per invoice, max 8 turns, concurrency 6. The system prompt is the
 * compiled contract serialised — the contract is the program. Every turn is written to
 * trace_steps as it happens, because the trace is the demo, not logging.
 */

const MAX_TURNS = 8;
const CONCURRENCY = 6;

export type CaseOutcome = {
  caseResultId: string;
  caseNo: number | null;
  invoiceNumber: string;
  gtAction: string;
  action: string | null;
  confidence: number | null;
  correct: boolean;
  failureMode: string | null;
  toolCalls: number;
  turns: number;
};

/** Trims tool output so a big line_items payload cannot crowd out the model's context. */
const forModel = (value: unknown): unknown => {
  const json = JSON.stringify(value);
  return json.length > 6000 ? { truncated: true, preview: json.slice(0, 6000) } : value;
};

async function runOneCase(
  ai: GoogleGenAI,
  spec: ContractSpec,
  clauses: Set<string>,
  declarations: typeof functionDeclarations,
  runId: string,
  invoice: { id: string; case_no: number | null; invoice_number: string; vendor_id: string; gt_action: string },
): Promise<CaseOutcome> {
  const { data: created, error } = await db
    .from('case_results')
    .insert({ run_id: runId, invoice_id: invoice.id })
    .select('id')
    .single();
  if (error) throw new Error(`case_results insert: ${error.message}`);
  const caseResultId = created.id as string;

  let seq = 0;
  const writeStep = async (kind: string, payload: unknown, toolName?: string | null, ruleId?: string | null) => {
    const { error: stepError } = await db.from('trace_steps').insert({
      case_result_id: caseResultId,
      seq: seq++,
      kind,
      tool_name: toolName ?? null,
      payload,
      rule_id: ruleId ?? null,
    });
    if (stepError) throw new Error(`trace_steps insert: ${stepError.message}`);
  };

  const history: Content[] = [
    {
      role: 'user',
      parts: [
        {
          text:
            `Case brief.\n\ninvoice_id: ${invoice.id}\nvendor_id: ${invoice.vendor_id}\n\n` +
            'Work the invoice against your contract. Pull whatever records you need before you ' +
            'decide, and state which rule id you are applying as you go. Finish by calling decide ' +
            'or escalate exactly once.',
        },
      ],
    },
  ];

  let terminal: TerminalDecision | null = null;
  let toolCalls = 0;
  let turns = 0;

  for (let turn = 0; turn < MAX_TURNS && !terminal; turn++) {
    turns = turn + 1;
    const response = await ai.models.generateContent({
      model: RUNTIME_MODEL,
      contents: history,
      config: {
        systemInstruction: serializeContract(spec),
        tools: [{ functionDeclarations: declarations }],
        temperature: 0.2,
        // No output ceiling. Any figure set here is a guess about how long a turn needs to be, and
        // the turn that overruns it is written to the tape cut in half. The turn budget bounds the
        // loop; the model's own limit is the only honest ceiling on a single turn.
      },
    });

    const candidate = response.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];
    const said = parts
      .filter((p) => typeof p.text === 'string' && p.text.trim() && !p.thought)
      .map((p) => p.text!.trim())
      .join('\n');

    // The tape is the product, so a step that is unfit to read is a wrong record rather than an
    // untidy one. Reasoning is persisted only when the turn ran to a stop and reads as the
    // agent's own account of the case.
    const complete = candidate?.finishReason !== FinishReason.MAX_TOKENS;
    const reasoning = said && complete && readsAsReasoning(said) ? said : null;
    if (reasoning) await writeStep('thought', { text: reasoning }, null, citedRule(reasoning, clauses));

    const calls = response.functionCalls ?? [];
    if (!calls.length) {
      // Nothing to execute and no decision: nudge once, then let the turn budget run out.
      history.push({ role: 'model', parts: parts.length ? parts : [{ text: said || '(no output)' }] });
      history.push({
        role: 'user',
        parts: [{ text: 'Call a tool, or finish with decide or escalate.' }],
      });
      continue;
    }

    history.push({ role: 'model', parts });
    const responseParts: Record<string, unknown>[] = [];

    for (const call of calls) {
      toolCalls++;
      // A tool call carries a rule badge only when the reasoning that reached it cited one.
      const ruleId = citedRule(reasoning, clauses);
      await writeStep('tool_call', { name: call.name, args: call.args ?? {} }, call.name, ruleId);
      const outcome = await executeTool(call.name!, call.args, { invoiceId: invoice.id });
      await writeStep('tool_result', outcome.result, call.name, ruleId);
      if (outcome.terminal) terminal = outcome.terminal;
      responseParts.push({
        functionResponse: { name: call.name, response: { result: forModel(outcome.result) } },
      });
    }

    history.push({ role: 'user', parts: responseParts });
  }

  const action = terminal?.action ?? null;
  const correct = action === invoice.gt_action;
  let failureMode: string | null = null;
  if (!action) failureMode = 'no_decision';
  else if (!correct) {
    if (action === 'escalate') failureMode = 'over_escalated';
    else if (invoice.gt_action === 'escalate') failureMode = 'under_escalated';
    else failureMode = 'wrong_action';
  }

  await writeStep(
    'decision',
    {
      action: action ?? 'none',
      confidence: terminal?.confidence ?? null,
      rationale: terminal?.rationale ?? 'The agent used its whole turn budget without deciding.',
      route_to: terminal?.route_to ?? null,
    },
    null,
    citedRule(terminal?.rationale, clauses),
  );

  const { error: updateError } = await db
    .from('case_results')
    .update({
      action,
      confidence: terminal?.confidence ?? null,
      rationale: terminal?.rationale ?? null,
      correct,
      failure_mode: failureMode,
    })
    .eq('id', caseResultId);
  if (updateError) throw new Error(`case_results update: ${updateError.message}`);

  return {
    caseResultId,
    caseNo: invoice.case_no,
    invoiceNumber: invoice.invoice_number,
    gtAction: invoice.gt_action,
    action,
    confidence: terminal?.confidence ?? null,
    correct,
    failureMode,
    toolCalls,
    turns,
  };
}

export async function runContract(
  contractId: string,
  onCase?: (o: CaseOutcome) => void,
  /** Fired as soon as the run row exists, so a caller can hand the reader a URL and let go. */
  onStart?: (runId: string) => void,
): Promise<{ runId: string; outcomes: CaseOutcome[]; scorecard: Record<string, number> }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set.');
  const ai = new GoogleGenAI({ apiKey });

  const { data: contractRow, error: contractError } = await db
    .from('contracts')
    .select('id, spec')
    .eq('id', contractId)
    .single();
  if (contractError) throw new Error(`contract ${contractId}: ${contractError.message}`);
  const spec = contractRow.spec as ContractSpec;
  const clauses = new Set(spec.rules.map((r) => r.id));
  const allowed = new Set(spec.tools_allowed);
  // Terminals are always callable; query tools follow tools_allowed so an unverifiable grant cannot sneak back in.
  const declarations = functionDeclarations.filter(
    (d) => d.name === 'decide' || d.name === 'escalate' || allowed.has(d.name!),
  );

  const { data: cases, error: casesError } = await db
    .from('invoices')
    .select('id, case_no, invoice_number, vendor_id, gt_action')
    .not('difficulty', 'is', null)
    .order('case_no');
  if (casesError) throw new Error(`invoices: ${casesError.message}`);

  const { data: run, error: runError } = await db
    .from('runs')
    .insert({ contract_id: contractId })
    .select('id')
    .single();
  if (runError) throw new Error(`runs: ${runError.message}`);
  const runId = run.id as string;
  onStart?.(runId);

  const queue = [...cases!];
  const outcomes: CaseOutcome[] = [];

  const worker = async () => {
    for (;;) {
      const next = queue.shift();
      if (!next) return;
      const outcome = await runOneCase(ai, spec, clauses, declarations, runId, next as Parameters<typeof runOneCase>[5]);
      outcomes.push(outcome);
      onCase?.(outcome);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  outcomes.sort((a, b) => (a.caseNo ?? 0) - (b.caseNo ?? 0));

  const total = outcomes.length;
  const decided = outcomes.filter((o) => o.action !== null);
  const autoDecided = outcomes.filter((o) => o.action && o.action !== 'escalate');
  const correct = outcomes.filter((o) => o.correct);
  const over = outcomes.filter((o) => o.action === 'escalate' && o.gtAction !== 'escalate');
  const under = outcomes.filter((o) => o.action && o.action !== 'escalate' && o.gtAction === 'escalate');
  const errors = outcomes.filter((o) => !o.correct && o.confidence !== null);

  const scorecard = {
    total,
    decided: decided.length,
    correct: correct.length,
    touchless_rate: total ? autoDecided.length / total : 0,
    accuracy: total ? correct.length / total : 0,
    over_escalations: over.length,
    under_escalations: under.length,
    avg_confidence_on_errors: errors.length ? errors.reduce((s, o) => s + (o.confidence ?? 0), 0) / errors.length : 0,
  };

  await db.from('runs').update({ finished_at: new Date().toISOString(), scorecard }).eq('id', runId);

  return { runId, outcomes, scorecard };
}
