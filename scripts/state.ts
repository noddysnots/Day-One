/** Read-only: what contracts and runs are on file, and how each run scored. */
import { config } from 'dotenv';
config({ path: '.env.local' });

async function main() {
  const { db } = await import('../lib/supabase');

  const { data: contracts } = await db
    .from('contracts')
    .select('id, name, version, parent_id, created_at, spec')
    .order('version');
  console.log('contracts');
  for (const c of contracts ?? []) {
    const spec = c.spec as { rules?: unknown[]; open_questions?: unknown[] } | null;
    console.log(
      `  v${c.version}  ${c.id}  parent ${c.parent_id ?? '—'}  ` +
        `${spec?.rules?.length ?? '?'} rules, ${spec?.open_questions?.length ?? '?'} open  ${c.created_at}`,
    );
  }

  const { data: runs } = await db
    .from('runs')
    .select('id, contract_id, started_at, finished_at, scorecard')
    .order('started_at');
  console.log('\nruns');
  for (const r of runs ?? []) {
    const contract = (contracts ?? []).find((c) => c.id === r.contract_id);
    const s = r.scorecard as Record<string, number> | null;
    const { count } = await db.from('case_results').select('id', { count: 'exact', head: true }).eq('run_id', r.id);
    console.log(
      `  ${r.id}  contract v${contract?.version ?? '?'}  ${r.finished_at ? 'finished' : 'OPEN'}  ` +
        `rows ${count ?? 0}  ` +
        (s ? `correct ${s.correct}/${s.total} over ${s.over_escalations} under ${s.under_escalations}` : 'no scorecard'),
    );
  }
}

void main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
