/**
 * Puts a contract already on file through all fifteen cases and prints the per-case table.
 *
 * Separate from run-v1.ts on purpose: that script compiles and then runs, so re-measuring a score
 * with it means compiling again, and a second compile is a different rulebook. This runs the
 * contract that is on file, which is the one every other number in the report refers to.
 *
 * Usage: npx tsx scripts/drive.ts <contractId> [--label "v1 with audio"]
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { invoices } from '../data/corpus';
import { RUNTIME_MODEL } from '../lib/models';

async function main() {
  const contractId = process.argv[2];
  if (!contractId) throw new Error('name the contract id to drive');
  const labelAt = process.argv.indexOf('--label');
  const label = labelAt > -1 ? process.argv[labelAt + 1] : contractId;

  const { db } = await import('../lib/supabase');
  const { runContract } = await import('../lib/run-contract');

  const { data: contract, error } = await db
    .from('contracts')
    .select('id, version, parent_id, spec, transcript')
    .eq('id', contractId)
    .maybeSingle();
  if (error) throw new Error(`contracts: ${error.message}`);
  if (!contract) throw new Error(`contract ${contractId} is not on file`);
  const spec = contract.spec as { rules: unknown[]; open_questions: unknown[] };

  console.log(`runtime ${RUNTIME_MODEL}`);
  console.log(
    `contract ${contractId}  v${contract.version}  parent ${contract.parent_id ?? '—'}  ` +
      `${spec.rules.length} clauses, ${spec.open_questions.length} open  transcript ${contract.transcript ? 'yes' : 'no'}`,
  );
  console.log(`label: ${label}\n`);

  const started = Date.now();
  const { runId, outcomes, scorecard } = await runContract(contractId, (o) => {
    console.log(
      `  case ${String(o.caseNo).padStart(2)} ${o.invoiceNumber.padEnd(9)} ` +
        `${String(o.action).padEnd(8)} ${o.correct ? 'correct' : 'WRONG  '} ${o.toolCalls} tool calls`,
    );
  });
  const wall = (Date.now() - started) / 1000;
  console.log(`\n  all fifteen in ${wall.toFixed(1)}s, run ${runId}`);

  const gt = new Map(invoices.filter((i) => i.case_no).map((i) => [i.case_no!, i]));

  console.log('\n  # invoice    difficulty  truth     agent     ok   failure mode      conf');
  for (const o of outcomes) {
    console.log(
      [
        String(o.caseNo).padStart(3),
        o.invoiceNumber.padEnd(10),
        (gt.get(o.caseNo ?? 0)?.difficulty ?? '—').padEnd(11),
        o.gtAction.padEnd(9),
        String(o.action ?? 'none').padEnd(9),
        (o.correct ? ' ok' : '  X').padEnd(4),
        (o.failureMode ?? '—').padEnd(17),
        (o.confidence === null ? '—' : o.confidence.toFixed(2)).padStart(5),
      ].join(' '),
    );
  }

  const ambiguous = outcomes.filter((o) => [13, 14, 15].includes(o.caseNo ?? 0));
  console.log('\n--- scorecard ---');
  console.log(`accuracy            ${scorecard.correct}/${scorecard.total} = ${(scorecard.accuracy * 100).toFixed(1)}%`);
  console.log(`touchless           ${(scorecard.touchless_rate * 100).toFixed(1)}%`);
  console.log(`over-escalated      ${scorecard.over_escalations}`);
  console.log(`under-escalated     ${scorecard.under_escalations}   <- the expensive one`);
  console.log(`avg conf on errors  ${scorecard.avg_confidence_on_errors.toFixed(2)}`);
  console.log(`wrong cases         ${outcomes.filter((o) => !o.correct).map((o) => o.caseNo).join(', ') || 'none'}`);
  console.log(`ambiguous 13/14/15  ${ambiguous.map((a) => `${a.caseNo}=${a.action}`).join(' ')}`);
  console.log(`all three escalate  ${ambiguous.every((a) => a.action === 'escalate') ? 'YES' : 'no'}`);

  await mkdir('artifacts', { recursive: true });
  const artifact = path.join('artifacts', `run-${runId}.json`);
  await writeFile(artifact, JSON.stringify({ contractId, runId, label, wall, scorecard, outcomes }, null, 2));
  console.log(`\nrun id: ${runId}`);
  console.log(`written to ${artifact}`);
}

void main().catch((e) => {
  console.error('\ndrive failed:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
