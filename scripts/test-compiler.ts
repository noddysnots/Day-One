/**
 * Build order step 3's verification. Runs the compiler three times on identical inputs and
 * checks, programmatically: schema validity, at least six rules, at least one open question,
 * and that every extracted provenance quote is genuinely present in the input it claims to
 * come from. A quote that is not there is the most damaging failure this product can have,
 * so it is checked by string search, never by eye.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { compileContract, type CompileInputs } from '../lib/compile-contract';
import { COMPILER_MODEL } from '../lib/models';
import { SAMPLE_CASES, describeVerdict, verifyProvenance } from '../lib/provenance';
import { invoices } from '../data/corpus';

/**
 * The mime type has to match the file. Handing the model a .wav labelled audio/mpeg is a decoder
 * error waiting to happen, and it would show up as the compiler mishearing rather than as a bad
 * header.
 */
const AUDIO_TYPES: Record<string, string> = {
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.webm': 'audio/webm',
};

async function main() {
  const emailThread = await readFile(path.join('public', 'intake', 'email-thread.md'), 'utf8');

  const scriptPath = ['voice-note-script.md', 'voice-note.md', 'voice-note-script.txt']
    .map((f) => path.join('public', 'intake', f))
    .find((p) => existsSync(p));
  const audioPath = Object.keys(AUDIO_TYPES)
    .map((e) => path.join('public', 'intake', `voice-note${e}`))
    .find((p) => existsSync(p));

  let voiceNote: CompileInputs['voiceNote'] = null;
  let voiceScript: string | null = null;
  let provenanceNote: string;

  if (audioPath) {
    const mimeType = AUDIO_TYPES[path.extname(audioPath).toLowerCase()];
    voiceNote = { data: await readFile(audioPath), mimeType };
    provenanceNote = `voice note: ${audioPath} as ${mimeType} (real audio, native multimodal path)`;
  } else if (scriptPath) {
    voiceScript = await readFile(scriptPath, 'utf8');
    provenanceNote = `voice note: NO AUDIO. Using script text at ${scriptPath} — scores are PROVISIONAL`;
  } else {
    provenanceNote = 'voice note: ABSENT, and no script text either. Compiled from email thread plus invoice images only';
  }

  const samples = await Promise.all(
    invoices
      .filter((i) => i.case_no !== null && SAMPLE_CASES.includes(i.case_no))
      .map(async (inv) => ({
        name: inv.invoice_number,
        data: await readFile(path.join('public', 'docs', `${inv.invoice_number}.jpg`)),
        mimeType: 'image/jpeg',
      })),
  );

  const emailForModel = voiceScript ? `${emailThread}\n\n--- Controller voice note (transcript) ---\n${voiceScript}` : emailThread;
  const inputs: CompileInputs = { emailThread: emailForModel, voiceNote, invoiceSamples: samples };

  console.log(`model: ${COMPILER_MODEL}`);
  console.log(`inputs: email thread (${emailThread.length} chars), ${samples.length} invoice images (cases ${SAMPLE_CASES.join(',')})`);
  console.log(provenanceNote + '\n');

  let allPassed = true;

  for (let run = 1; run <= 3; run++) {
    const started = Date.now();
    let result;
    try {
      result = await compileContract(inputs);
    } catch (e) {
      console.log(`run ${run}: FAILED — ${(e as Error).message.slice(0, 400)}\n`);
      allPassed = false;
      continue;
    }
    const { spec } = result;
    const secs = ((Date.now() - started) / 1000).toFixed(1);

    // Checked against this compile's own transcript, not against the email thread: with audio in
    // the pack a voice_note quote has nowhere else it could legitimately come from, and scoring it
    // against the thread would pass or fail it for the wrong reason.
    const verdicts = verifyProvenance(spec, {
      emailThread: emailForModel,
      transcript: voiceScript ?? result.transcript,
    });
    const missing = verdicts.filter((v) => v.checked && !v.verbatim);
    const inferredCount = verdicts.filter((v) => !v.checked).length;
    const voiceClauses = verdicts.filter((v) => v.source === 'voice_note');

    const okRules = spec.rules.length >= 6;
    const okQuestions = spec.open_questions.length >= 1;
    const okQuotes = missing.length === 0;
    // With audio supplied, a compile that attributes nothing to the voice note has not heard it.
    const okVoice = !voiceNote || voiceClauses.length >= 1;
    const passed = okRules && okQuestions && okQuotes && okVoice;
    if (!passed) allPassed = false;

    console.log(`--- run ${run} (${secs}s, ${result.attempts} attempt${result.attempts > 1 ? 's' : ''}) ---`);
    console.log(`  schema valid      yes`);
    console.log(`  rules             ${spec.rules.length} ${okRules ? 'pass' : 'FAIL (need >= 6)'}  [${inferredCount} inferred]`);
    console.log(`  open questions    ${spec.open_questions.length} ${okQuestions ? 'pass' : 'FAIL (need >= 1)'}`);
    console.log(`  verbatim quotes   ${spec.rules.length - missing.length}/${spec.rules.length} ${okQuotes ? 'pass' : 'FAIL'}`);
    for (const m of missing) console.log(`      ${describeVerdict(m)}`);
    console.log(`  transcript        ${result.transcript ? `${result.transcript.length} chars` : 'none'}`);
    console.log(`  voice_note clauses ${voiceClauses.length} ${okVoice ? 'pass' : 'FAIL (audio supplied but nothing attributed to it)'}`);

    if (run === 1) {
      console.log('\n  rules extracted:');
      for (const r of spec.rules) {
        console.log(`    ${r.id} ${r.then.toUpperCase().padEnd(8)} conf ${r.confidence.toFixed(2)} [${r.provenance.source}]  ${r.when.slice(0, 96)}`);
      }
      console.log('\n  open questions:');
      for (const q of spec.open_questions) console.log(`    - ${q.slice(0, 150)}`);
      console.log(`\n  escalation: min_confidence ${spec.escalation.min_confidence}, ceiling ${spec.escalation.always_escalate_above_amount}, route_to ${spec.escalation.route_to}`);
    }
    console.log('');
  }

  console.log(allPassed ? 'STEP 3 VERIFICATION PASSED' : 'STEP 3 VERIFICATION FAILED');
  process.exit(allPassed ? 0 : 1);
}

void main().catch((e) => {
  console.error('compiler test failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
