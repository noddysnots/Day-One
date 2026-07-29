/** Read-only: every case of a run, side by side with ground truth. */
import { config } from 'dotenv';
config({ path: '.env.local' });

async function main() {
  const { db } = await import('../lib/supabase');
  const runId = process.argv[2];
  if (!runId) throw new Error('name a run id');

  const { data: run } = await db.from('runs').select('id, contract_id, finished_at, scorecard').eq('id', runId).maybeSingle();
  if (!run) throw new Error('no such run');
  const { data: contract } = await db.from('contracts').select('version, parent_id').eq('id', run.contract_id!).maybeSingle();

  const { data } = await db
    .from('case_results')
    .select('id, action, confidence, correct, failure_mode, rationale, invoices(case_no, invoice_number, gt_action, difficulty)')
    .eq('run_id', runId);

  type Row = {
    id: string;
    action: string | null;
    confidence: number | null;
    correct: boolean | null;
    failure_mode: string | null;
    rationale: string | null;
    invoices: { case_no: number | null; invoice_number: string; gt_action: string; difficulty: string | null };
  };
  const rows = ((data ?? []) as unknown as Row[]).sort((a, b) => (a.invoices.case_no ?? 99) - (b.invoices.case_no ?? 99));

  console.log(`run ${runId}  contract v${contract?.version}  parent ${contract?.parent_id ?? '—'}  ${run.finished_at ? 'finished' : 'OPEN'}`);
  console.log(`scorecard ${JSON.stringify(run.scorecard)}\n`);
  console.log('  # invoice    difficulty  truth     agent     conf  ok   failure');
  for (const r of rows) {
    const i = r.invoices;
    console.log(
      [
        String(i.case_no).padStart(3),
        i.invoice_number.padEnd(10),
        (i.difficulty ?? '—').padEnd(11),
        i.gt_action.padEnd(9),
        (r.action ?? 'none').padEnd(9),
        (r.confidence === null ? '—' : Number(r.confidence).toFixed(2)).padStart(5),
        (r.correct ? ' ok' : '  X').padEnd(4),
        r.failure_mode ?? '',
      ].join(' '),
    );
  }

  const wrong = rows.filter((r) => !r.correct);
  console.log(`\n${rows.filter((r) => r.correct).length}/${rows.length} correct. Wrong: ${wrong.map((r) => r.invoices.case_no).join(', ')}`);
  for (const r of wrong) {
    console.log(`\ncase ${r.invoices.case_no} ${r.invoices.invoice_number} — ${r.failure_mode}`);
    console.log(`  ${(r.rationale ?? '').replace(/\n/g, '\n  ')}`);
  }
}

void main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
