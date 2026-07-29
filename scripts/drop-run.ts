/**
 * Takes a superseded driving test off the file. case_results and trace_steps cascade, so the run
 * row is the only delete needed, but the counts are read before and after because a cascade that
 * silently did not fire would leave orphaned tapes behind.
 *
 * Refuses to remove the only run a contract has: a contract with no test against it reads as
 * untested rather than as superseded.
 *
 * Usage: npx tsx scripts/drop-run.ts <runId> [--apply]
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

async function main() {
  const runId = process.argv[2];
  const apply = process.argv.includes('--apply');
  if (!runId) throw new Error('name a run id');

  const { db } = await import('../lib/supabase');

  const { data: run, error } = await db
    .from('runs')
    .select('id, contract_id, started_at, finished_at, scorecard')
    .eq('id', runId)
    .maybeSingle();
  if (error) throw new Error(`read run: ${error.message}`);
  if (!run) throw new Error(`run ${runId} is not on file`);

  const { data: cases } = await db.from('case_results').select('id').eq('run_id', runId);
  const caseIds = (cases ?? []).map((c) => String(c.id));
  const { count: stepCount } = await db
    .from('trace_steps')
    .select('id', { count: 'exact', head: true })
    .in('case_result_id', caseIds);
  const card = run.scorecard as Record<string, number> | null;

  const { data: siblings } = await db.from('runs').select('id').eq('contract_id', run.contract_id);
  console.log(
    `run ${runId}\n  contract ${run.contract_id}\n  started ${run.started_at}\n` +
      `  ${card ? `correct ${card.correct}/${card.total}` : 'no scorecard'}\n` +
      `  ${caseIds.length} case results, ${stepCount ?? 0} trace steps\n` +
      `  the contract has ${siblings?.length ?? 0} run(s) on file`,
  );
  if ((siblings?.length ?? 0) < 2) {
    throw new Error('this is the only run against its contract; removing it would read as untested');
  }

  if (!apply) {
    console.log('\nDry run. Pass --apply to take it off the file.');
    return;
  }

  const { error: deleteError } = await db.from('runs').delete().eq('id', runId);
  if (deleteError) throw new Error(`delete run: ${deleteError.message}`);

  const { data: goneRun } = await db.from('runs').select('id').eq('id', runId).maybeSingle();
  const { data: goneCases } = await db.from('case_results').select('id').eq('run_id', runId);
  const { count: goneSteps } = await db
    .from('trace_steps')
    .select('id', { count: 'exact', head: true })
    .in('case_result_id', caseIds);
  console.log(
    `\nafter: run row ${goneRun ? 'STILL THERE' : 'gone'}, ` +
      `${goneCases?.length ?? 0} case results, ${goneSteps ?? 0} trace steps`,
  );
  if (goneRun || (goneCases?.length ?? 0) || (goneSteps ?? 0)) throw new Error('the cascade left rows behind');
  console.log('Off the file, tapes and all.');
}

void main().catch((e) => {
  console.error('\ndrop failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
