/**
 * Holds the tapes already on file to the rule lib/run-contract.ts now enforces when it writes
 * them: a reasoning step has to read as the agent's own account of the case. A step that exists
 * but is unfit to read is a wrong record, not an untidy one, so it comes off the tape rather than
 * being hidden by the screen that renders it.
 *
 * Deliberately uses the same predicate as the writer, so there is one definition of what belongs
 * on a tape and no way for the two to drift.
 *
 * Usage: npx tsx scripts/prune-trace.ts [--apply]
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { readsAsReasoning, stepText } from '../lib/trace';
import type { TraceStep } from '../lib/rows';

async function main() {
  const apply = process.argv.includes('--apply');
  const { db } = await import('../lib/supabase');

  const { data, error } = await db
    .from('trace_steps')
    .select('id, seq, kind, tool_name, payload, rule_id, created_at, case_result_id')
    .eq('kind', 'thought')
    .order('created_at');
  if (error) throw new Error(`read trace_steps: ${error.message}`);

  const steps = (data ?? []) as (TraceStep & { case_result_id: string })[];
  const unfit = steps.filter((s) => !readsAsReasoning(stepText(s)));
  console.log(`${steps.length} reasoning steps on file, ${unfit.length} unfit to read\n`);

  for (const s of unfit) {
    const { data: owner } = await db
      .from('case_results')
      .select('run_id, invoices(case_no, invoice_number)')
      .eq('id', s.case_result_id)
      .maybeSingle();
    const inv = (owner as { invoices?: { case_no?: number; invoice_number?: string } } | null)?.invoices;
    console.log(`  seq ${s.seq}  case ${inv?.case_no} ${inv?.invoice_number}  rule badge ${s.rule_id ?? '—'}`);
    console.log(`    ${stepText(s).replace(/\n/g, ' ').slice(0, 120)}…`);
  }

  if (!unfit.length) {
    console.log('Every tape on file reads clean.');
    return;
  }
  if (!apply) {
    console.log('\nDry run. Pass --apply to take these off the tape.');
    return;
  }

  const { error: deleteError } = await db
    .from('trace_steps')
    .delete()
    .in(
      'id',
      unfit.map((s) => s.id),
    );
  if (deleteError) throw new Error(`delete trace_steps: ${deleteError.message}`);

  const { data: after } = await db.from('trace_steps').select('id, payload').eq('kind', 'thought');
  const left = ((after ?? []) as TraceStep[]).filter((s) => !readsAsReasoning(stepText(s)));
  console.log(`\nDeleted ${unfit.length}. ${left.length} unfit reasoning steps remain.`);
  if (left.length) throw new Error('the prune did not take');
}

void main().catch((e) => {
  console.error('\nprune failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
