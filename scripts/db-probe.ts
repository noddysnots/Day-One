import { config } from 'dotenv';
config({ path: '.env.local' });

async function main() {
  const { db } = await import('../lib/supabase');
  const probes: [string, string][] = [
    ['vendors', 'id,name,payment_terms,tolerance_pct,contract_notes,risk_flags'],
    ['purchase_orders', 'id,po_number,line_items,total,currency,status,po_date'],
    ['goods_receipts', 'id,po_number,received_lines,received_at'],
    ['invoices', 'id,invoice_number,po_number_ref,subtotal,tax,total,doc_url,source,gt_action,gt_reason,difficulty,case_no'],
    ['contracts', 'id,name,version,spec,transcript,parent_id,created_at'],
    ['runs', 'id,contract_id,started_at,finished_at,scorecard'],
    ['case_results', 'id,run_id,invoice_id,action,confidence,rationale,correct,failure_mode'],
    ['trace_steps', 'id,case_result_id,seq,kind,tool_name,payload,rule_id,created_at'],
  ];
  let bad = 0;
  for (const [table, cols] of probes) {
    const { data, error } = await db.from(table).select(cols).limit(1);
    if (error) { bad++; console.log(`${table.padEnd(16)} MISSING/BAD: ${error.message.slice(0, 120)}`); }
    else console.log(`${table.padEnd(16)} ok, all columns present, ${data?.length ?? 0} sample row(s)`);
  }
  const { data: buckets } = await db.storage.listBuckets();
  console.log(`buckets          ${JSON.stringify((buckets ?? []).map((b) => b.name))}`);
  process.exit(bad ? 1 : 0);
}
void main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
