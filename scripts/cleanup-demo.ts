/**
 * Leaves the database holding exactly the two contracts the demo uses and their runs.
 *
 * Anything else is a throwaway from a measuring pass or a superseded lineage, and a stale contract
 * with a different score on it contradicts the ledger the runbook quotes — which is worse than
 * clutter, because the fallback the presenter navigates to has to be the pair that was measured.
 *
 * Deletes in foreign-key order by hand. runs.contract_id and contracts.parent_id are plain
 * references with no cascade, so runs go before their contract and a child version goes before its
 * parent; case_results and trace_steps do cascade off runs, and the counts are read back to prove
 * the cascade fired.
 *
 * Dry run unless --apply.
 *
 * Usage: npx tsx scripts/cleanup-demo.ts <v2ContractId> [--apply]
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

type ContractRow = { id: string; version: number; parent_id: string | null; created_at: string | null; spec: unknown };
type RunRow = { id: string; contract_id: string | null; finished_at: string | null; scorecard: Record<string, number> | null };

async function main() {
  const keepV2 = process.argv[2];
  const apply = process.argv.includes('--apply');
  if (!keepV2) throw new Error('name the v2 contract the demo uses');

  const { db } = await import('../lib/supabase');

  const { data: contractData, error: cErr } = await db
    .from('contracts')
    .select('id, version, parent_id, created_at, spec')
    .order('created_at');
  if (cErr) throw new Error(`contracts: ${cErr.message}`);
  const contracts = (contractData ?? []) as unknown as ContractRow[];

  const v2 = contracts.find((c) => c.id === keepV2);
  if (!v2) throw new Error(`contract ${keepV2} is not on file`);
  if (!v2.parent_id) throw new Error(`contract ${keepV2} has no parent, so it is not the amended version`);
  const v1 = contracts.find((c) => c.id === v2.parent_id);
  if (!v1) throw new Error(`the parent ${v2.parent_id} is not on file`);

  const keep = new Set([v1.id, v2.id]);

  const { data: runData, error: rErr } = await db.from('runs').select('id, contract_id, finished_at, scorecard').order('started_at');
  if (rErr) throw new Error(`runs: ${rErr.message}`);
  const runs = (runData ?? []) as unknown as RunRow[];

  const runsToDrop = runs.filter((r) => !r.contract_id || !keep.has(r.contract_id));
  const contractsToDrop = contracts.filter((c) => !keep.has(c.id));

  const card = (r: RunRow) => (r.scorecard ? `${r.scorecard.correct}/${r.scorecard.total}` : 'no scorecard');
  const clauses = (c: ContractRow) => (c.spec as { rules?: unknown[] } | null)?.rules?.length ?? '?';

  console.log('KEEP');
  console.log(`  v${v1.version}  ${v1.id}  ${clauses(v1)} clauses  (parent of the pair)`);
  for (const r of runs.filter((x) => x.contract_id === v1.id)) console.log(`      run ${r.id}  ${card(r)}`);
  console.log(`  v${v2.version}  ${v2.id}  ${clauses(v2)} clauses  parent ${v2.parent_id}`);
  for (const r of runs.filter((x) => x.contract_id === v2.id)) console.log(`      run ${r.id}  ${card(r)}`);

  console.log('\nDROP');
  if (!contractsToDrop.length && !runsToDrop.length) console.log('  nothing — the database already holds only the demo pair');
  for (const c of contractsToDrop) {
    console.log(`  v${c.version}  ${c.id}  ${clauses(c)} clauses  parent ${c.parent_id ?? '—'}  ${c.created_at}`);
    for (const r of runs.filter((x) => x.contract_id === c.id)) console.log(`      run ${r.id}  ${card(r)}`);
  }
  const orphanRuns = runsToDrop.filter((r) => !r.contract_id || !contractsToDrop.some((c) => c.id === r.contract_id));
  for (const r of orphanRuns) console.log(`  orphan run ${r.id}  contract ${r.contract_id ?? '—'}  ${card(r)}`);

  if (!apply) {
    console.log('\nDry run. Pass --apply to take them off the file.');
    return;
  }

  // --- runs first: case_results and trace_steps cascade off them ---
  const caseIds: string[] = [];
  for (const r of runsToDrop) {
    const { data: cases } = await db.from('case_results').select('id').eq('run_id', r.id);
    caseIds.push(...(cases ?? []).map((c) => String(c.id)));
  }
  for (const r of runsToDrop) {
    const { error } = await db.from('runs').delete().eq('id', r.id);
    if (error) throw new Error(`delete run ${r.id}: ${error.message}`);
  }
  console.log(`\ndropped ${runsToDrop.length} run(s)`);

  if (caseIds.length) {
    const { count: leftCases } = await db.from('case_results').select('id', { count: 'exact', head: true }).in('id', caseIds);
    const { count: leftSteps } = await db.from('trace_steps').select('id', { count: 'exact', head: true }).in('case_result_id', caseIds);
    if (leftCases || leftSteps) throw new Error(`the cascade left ${leftCases} case result(s) and ${leftSteps} trace step(s) behind`);
    console.log(`  cascade cleared ${caseIds.length} case result(s) and their tapes`);
  }

  // --- contracts, children before parents ---
  const remaining = [...contractsToDrop];
  while (remaining.length) {
    const leaf = remaining.find((c) => !remaining.some((other) => other.parent_id === c.id));
    if (!leaf) throw new Error(`a parent cycle is left in ${remaining.map((c) => c.id).join(', ')}`);
    const { error } = await db.from('contracts').delete().eq('id', leaf.id);
    if (error) throw new Error(`delete contract ${leaf.id}: ${error.message}`);
    console.log(`  dropped contract ${leaf.id} (v${leaf.version})`);
    remaining.splice(remaining.indexOf(leaf), 1);
  }

  // --- read the whole thing back ---
  const { data: afterContracts } = await db.from('contracts').select('id, version, parent_id').order('version');
  const { data: afterRuns } = await db.from('runs').select('id, contract_id, scorecard').order('started_at');
  console.log('\nafter');
  for (const c of afterContracts ?? []) console.log(`  contract v${c.version}  ${c.id}  parent ${c.parent_id ?? '—'}`);
  for (const r of afterRuns ?? []) {
    const s = r.scorecard as Record<string, number> | null;
    console.log(`  run ${r.id}  contract ${r.contract_id}  ${s ? `${s.correct}/${s.total}` : 'no scorecard'}`);
  }

  const ok = (afterContracts ?? []).length === 2 && (afterContracts ?? []).every((c) => keep.has(String(c.id)));
  console.log(ok ? '\nThe file holds exactly the demo pair.' : '\nSomething other than the demo pair is still on file.');
  if (!ok) process.exitCode = 1;
}

void main().catch((e) => {
  console.error('\ncleanup failed:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
