/**
 * Build order step 1's verification, done in SQL rather than joined in JavaScript: one query
 * across invoices, purchase_orders and goods_receipts for all 15 test cases.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
import { Client } from 'pg';

const JOIN = `
select
  i.case_no,
  v.name                                   as vendor,
  i.invoice_number,
  i.difficulty,
  i.gt_action,
  i.total                                  as invoice_total,
  po.po_number,
  po.total                                 as po_total,
  po.status                                as po_status,
  po.po_date,
  gr.received_at,
  (select sum((l->>'qty_received')::int)
     from jsonb_array_elements(gr.received_lines) l) as units_received,
  round(i.total - po.total, 2)             as variance,
  (i.doc_url is not null)                  as has_doc,
  (i.invoice_date < gr.received_at)        as invoiced_before_receipt
from invoices i
join vendors v            on v.id = i.vendor_id
left join purchase_orders po on po.po_number = i.po_number_ref
left join goods_receipts gr  on gr.po_number = i.po_number_ref
where i.difficulty is not null
order by i.case_no
`;

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const { rows } = await client.query(JOIN);
    console.log(`three-way join returned ${rows.length} rows\n`);
    console.log('case vendor                     invoice    diff      gt        inv total  po        po total  status    recvd  var      doc');
    for (const r of rows) {
      console.log(
        [
          String(r.case_no).padStart(4),
          String(r.vendor).padEnd(26),
          String(r.invoice_number).padEnd(10),
          String(r.difficulty).padEnd(9),
          String(r.gt_action).padEnd(9),
          Number(r.invoice_total).toFixed(2).padStart(9),
          String(r.po_number ?? 'none').padEnd(9),
          (r.po_total === null ? '—' : Number(r.po_total).toFixed(2)).padStart(9),
          String(r.po_status ?? '—').padEnd(9),
          String(r.units_received ?? '—').padStart(5),
          (r.variance === null ? '—' : Number(r.variance).toFixed(2)).padStart(8),
          r.has_doc ? 'yes' : 'NO',
        ].join(' '),
      );
    }

    const { rows: dist } = await client.query(
      `select difficulty, count(*)::int n from invoices where difficulty is not null group by difficulty order by difficulty`,
    );
    console.log('\ndistribution: ' + dist.map((d) => `${d.difficulty} ${d.n}`).join(', '));

    const { rows: checks } = await client.query(`
      select
        (select count(*) from invoices where difficulty is not null)::int                      as test_cases,
        (select count(*) from invoices where difficulty is null)::int                          as history_rows,
        (select count(*) from invoices i where i.difficulty is not null and i.doc_url is null)::int as missing_doc,
        (select count(*) from invoices i
           left join purchase_orders po on po.po_number = i.po_number_ref
          where i.difficulty is not null and po.po_number is null and i.case_no <> 9)::int     as missing_po,
        (select count(*) from purchase_orders po
           left join goods_receipts gr on gr.po_number = po.po_number
          where gr.po_number is null)::int                                                    as po_without_receipt,
        (select count(*) from invoices i
           join goods_receipts gr on gr.po_number = i.po_number_ref
          where i.invoice_date < gr.received_at and i.case_no <> 14)::int                      as early_invoices
    `);
    const c = checks[0];
    console.log('\nassertions');
    const rules: [string, boolean, unknown][] = [
      ['15 test cases', c.test_cases === 15, c.test_cases],
      ['2 ledger history rows', c.history_rows === 2, c.history_rows],
      ['distribution is 6/6/3', dist.find((d) => d.difficulty === 'clean')?.n === 6 && dist.find((d) => d.difficulty === 'exception')?.n === 6 && dist.find((d) => d.difficulty === 'ambiguous')?.n === 3, dist.map((d) => `${d.difficulty}:${d.n}`).join(' ')],
      ['every test case has a doc_url', c.missing_doc === 0, c.missing_doc],
      ['every case except 9 joins to a PO', c.missing_po === 0, c.missing_po],
      ['every PO has a goods receipt', c.po_without_receipt === 0, c.po_without_receipt],
      ['only case 14 predates its receipt', c.early_invoices === 0, c.early_invoices],
    ];
    let failed = 0;
    for (const [label, ok, detail] of rules) {
      if (!ok) failed++;
      console.log(`  ${ok ? 'pass' : 'FAIL'}  ${label}${ok ? '' : ` (got ${detail})`}`);
    }
    console.log(failed ? `\nSTEP 1 FAILED` : `\nSTEP 1 VERIFIED`);
    process.exitCode = failed ? 1 : 0;
  } finally {
    await client.end();
  }
}
void main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
