/**
 * Reads the persisted traces for the cases the agent got wrong, so the diagnosis comes from
 * what it actually did rather than from a guess.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
import { Client } from 'pg';

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const { rows: run } = await client.query(
      `select id from runs order by started_at desc limit 1`,
    );
    const runId = run[0].id;

    const { rows: cases } = await client.query(
      `select cr.id, i.case_no, i.invoice_number, i.gt_action, cr.action, cr.confidence, cr.rationale, cr.failure_mode
         from case_results cr join invoices i on i.id = cr.invoice_id
        where cr.run_id = $1 and cr.correct = false
        order by i.case_no`,
      [runId],
    );

    for (const c of cases) {
      const { rows: steps } = await client.query(
        `select seq, kind, tool_name, rule_id, payload from trace_steps where case_result_id = $1 order by seq`,
        [c.id],
      );
      const tools = steps.filter((s) => s.kind === 'tool_call').map((s) => s.tool_name);
      const rulesCited = [...new Set(steps.map((s) => s.rule_id).filter(Boolean))];

      console.log(`\n${'='.repeat(100)}`);
      console.log(`CASE ${c.case_no}  ${c.invoice_number}  ground truth ${c.gt_action} -> agent ${c.action}  (${c.failure_mode}, conf ${c.confidence})`);
      console.log(`tools called: ${tools.join(' -> ')}`);
      console.log(`rule ids cited in trace: ${rulesCited.length ? rulesCited.join(', ') : 'none'}`);
      console.log(`\nrationale:\n${c.rationale}`);

      const thoughts = steps.filter((s) => s.kind === 'thought');
      if (thoughts.length) {
        console.log(`\nreasoning:`);
        for (const t of thoughts) {
          const text = (t.payload as { text?: string })?.text ?? '';
          console.log('  ' + text.replace(/\n/g, '\n  ').slice(0, 1400));
        }
      }
    }
  } finally {
    await client.end();
  }
}
void main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
