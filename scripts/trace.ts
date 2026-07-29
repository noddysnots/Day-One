/** Read-only: the persisted tape for one case of one run. */
import { config } from 'dotenv';
config({ path: '.env.local' });

async function main() {
  const { db } = await import('../lib/supabase');
  const [runId, caseNo] = [process.argv[2], Number(process.argv[3])];
  if (!runId || !caseNo) throw new Error('usage: trace.ts <runId> <caseNo>');

  const { data: rows } = await db
    .from('case_results')
    .select('id, action, invoices(case_no, invoice_number)')
    .eq('run_id', runId);
  type Row = { id: string; action: string | null; invoices: { case_no: number; invoice_number: string } };
  const hit = ((rows ?? []) as unknown as Row[]).find((r) => r.invoices.case_no === caseNo);
  if (!hit) throw new Error(`case ${caseNo} not in run ${runId}`);

  const { data: steps } = await db
    .from('trace_steps')
    .select('seq, kind, tool_name, rule_id, payload, created_at')
    .eq('case_result_id', hit.id)
    .order('seq');

  console.log(`run ${runId}  case ${caseNo} ${hit.invoices.invoice_number} -> ${hit.action}\n`);
  for (const s of steps ?? []) {
    const at = String(s.created_at).slice(11, 23);
    const head = `${String(s.seq).padStart(2)} ${at} ${s.kind.padEnd(12)}${s.rule_id ? ` [${s.rule_id}]` : ''}`;
    if (s.kind === 'thought') {
      console.log(`${head}\n     ${String((s.payload as { text?: string })?.text ?? '').replace(/\n/g, '\n     ')}`);
    } else if (s.kind === 'tool_call') {
      console.log(`${head} ${s.tool_name} ${JSON.stringify((s.payload as { args?: unknown })?.args ?? {})}`);
    } else if (s.kind === 'tool_result') {
      console.log(`${head} ${s.tool_name} -> ${JSON.stringify(s.payload).slice(0, 320)}`);
    } else {
      console.log(`${head} ${JSON.stringify(s.payload).slice(0, 900)}`);
    }
  }
}

void main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
