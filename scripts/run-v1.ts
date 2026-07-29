/**
 * Build order step 4: compile contract v1, store it, put it through all fifteen cases, and
 * print the honest first number. Nothing here tunes anything — it measures.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { compileContract, type CompileInputs } from '../lib/compile-contract';
import { COMPILER_MODEL, RUNTIME_MODEL } from '../lib/models';
import { invoices } from '../data/corpus';

const SAMPLE_CASES = [1, 2, 3, 4, 5];
const AUDIO = [['.m4a', 'audio/mp4'], ['.mp3', 'audio/mpeg'], ['.wav', 'audio/wav'], ['.ogg', 'audio/ogg'], ['.webm', 'audio/webm']] as const;

async function buildInputs(): Promise<{ inputs: CompileInputs; note: string; provisional: boolean }> {
  const emailThread = await readFile(path.join('public', 'intake', 'email-thread.md'), 'utf8');
  const samples = await Promise.all(
    invoices
      .filter((i) => i.case_no !== null && SAMPLE_CASES.includes(i.case_no))
      .map(async (inv) => ({
        name: inv.invoice_number,
        data: await readFile(path.join('public', 'docs', `${inv.invoice_number}.jpg`)),
        mimeType: 'image/jpeg',
      })),
  );

  for (const [ext, mime] of AUDIO) {
    const p = path.join('public', 'intake', `voice-note${ext}`);
    if (existsSync(p)) {
      return {
        inputs: { emailThread, voiceNote: { data: await readFile(p), mimeType: mime }, invoiceSamples: samples },
        note: `voice note: real audio at ${p}`,
        provisional: false,
      };
    }
  }

  const script = ['voice-note-script.md', 'voice-note.md', 'voice-note-script.txt']
    .map((f) => path.join('public', 'intake', f))
    .find((p) => existsSync(p));
  if (script) {
    const text = await readFile(script, 'utf8');
    return {
      inputs: {
        emailThread: `${emailThread}\n\n--- Controller voice note (transcript) ---\n${text}`,
        voiceNote: null,
        invoiceSamples: samples,
      },
      note: `voice note: NO AUDIO, using script text at ${script}`,
      provisional: true,
    };
  }

  return {
    inputs: { emailThread, voiceNote: null, invoiceSamples: samples },
    note: 'voice note: ABSENT and no script text. Compiled from the email thread and invoice images only',
    provisional: true,
  };
}

async function main() {
  const { db } = await import('../lib/supabase');
  const { runContract } = await import('../lib/run-contract');

  const { inputs, note, provisional } = await buildInputs();
  console.log(`compiler ${COMPILER_MODEL} | runtime ${RUNTIME_MODEL}`);
  console.log(note + '\n');

  console.log('compiling contract v1');
  const compiled = await compileContract(inputs);
  console.log(`  ${compiled.spec.rules.length} rules, ${compiled.spec.open_questions.length} open question(s)`);

  const { data: contract, error } = await db
    .from('contracts')
    .insert({
      name: 'AP three-way match',
      version: 1,
      spec: compiled.spec,
      transcript: compiled.transcript,
    })
    .select('id')
    .single();
  if (error) throw new Error(`contracts insert: ${error.message}`);
  console.log(`  stored as contract ${contract.id}\n`);

  console.log('running the driving test, 15 cases, concurrency 6');
  const started = Date.now();
  const { runId, outcomes, scorecard } = await runContract(contract.id as string, (o) => {
    console.log(
      `  case ${String(o.caseNo).padStart(2)} ${o.invoiceNumber.padEnd(9)} ${String(o.action).padEnd(8)} ${o.correct ? 'correct' : 'WRONG  '} ${o.toolCalls} tool calls`,
    );
  });
  console.log(`  done in ${((Date.now() - started) / 1000).toFixed(0)}s, run ${runId}\n`);

  // trace integrity
  const { data: traceCounts } = await db
    .from('trace_steps')
    .select('case_result_id, kind')
    .in('case_result_id', outcomes.map((o) => o.caseResultId));
  const toolCallsByCase = new Map<string, number>();
  const stepsByCase = new Map<string, number>();
  for (const s of traceCounts ?? []) {
    stepsByCase.set(s.case_result_id as string, (stepsByCase.get(s.case_result_id as string) ?? 0) + 1);
    if (s.kind === 'tool_call') toolCallsByCase.set(s.case_result_id as string, (toolCallsByCase.get(s.case_result_id as string) ?? 0) + 1);
  }

  const gt = new Map(invoices.filter((i) => i.case_no).map((i) => [i.case_no!, i]));

  console.log('case  invoice    difficulty  ground truth  agent      correct  failure mode      conf   tools  steps');
  for (const o of outcomes) {
    const inv = gt.get(o.caseNo ?? 0);
    console.log(
      [
        String(o.caseNo).padStart(4),
        o.invoiceNumber.padEnd(10),
        (inv?.difficulty ?? '?').padEnd(11),
        o.gtAction.padEnd(13),
        String(o.action ?? 'none').padEnd(10),
        (o.correct ? 'yes' : 'NO').padEnd(8),
        (o.failureMode ?? '-').padEnd(17),
        (o.confidence === null ? '-' : o.confidence.toFixed(2)).padStart(5),
        String(toolCallsByCase.get(o.caseResultId) ?? 0).padStart(6),
        String(stepsByCase.get(o.caseResultId) ?? 0).padStart(6),
      ].join(' '),
    );
  }

  const minTools = Math.min(...outcomes.map((o) => toolCallsByCase.get(o.caseResultId) ?? 0));
  const ambiguous = outcomes.filter((o) => [13, 14, 15].includes(o.caseNo ?? 0));

  console.log('\n--- scorecard ---');
  console.log(`accuracy               ${scorecard.correct}/${scorecard.total} = ${(scorecard.accuracy * 100).toFixed(1)}%`);
  console.log(`touchless rate         ${(scorecard.touchless_rate * 100).toFixed(1)}%`);
  console.log(`over escalations       ${scorecard.over_escalations}`);
  console.log(`under escalations      ${scorecard.under_escalations}   <- the dangerous one`);
  console.log(`avg confidence on errors ${scorecard.avg_confidence_on_errors.toFixed(2)}`);
  console.log(`min tool calls in any case ${minTools} ${minTools >= 3 ? '(pass, >= 3)' : '(FAIL, need >= 3)'}`);
  console.log(`\nambiguous cases 13/14/15 escalated: ${ambiguous.map((a) => `${a.caseNo}=${a.action}`).join(' ')}`);
  if (provisional) console.log('\nNOTE: no voice note audio was supplied. This score is PROVISIONAL.');
}

void main().catch((e) => {
  console.error('\nrun failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
