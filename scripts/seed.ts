/**
 * Reproducible seed. Renders the 17 documents, uploads them to Supabase Storage, then
 * writes the matched ledger: vendors, purchase orders, goods receipts, invoices with
 * ground truth. Safe to re-run; it clears the demo tables first.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import {
  vendors,
  purchaseOrders,
  receipts,
  invoices,
  priceListItems,
  invoiceTotals,
  sumLines,
  testCases,
  validateCorpus,
} from '../data/corpus';
import { renderInvoiceDoc, vendorFor } from './render-docs';

async function main() {
  const problems = validateCorpus();
  if (problems.length) {
    console.error('Corpus is invalid, refusing to seed:');
    for (const p of problems) console.error('  - ' + p);
    process.exit(1);
  }

  const { db, DOC_BUCKET } = await import('../lib/supabase');

  // --- storage bucket ---
  const { error: bucketError } = await db.storage.createBucket(DOC_BUCKET, { public: true });
  if (bucketError && !/exists/i.test(bucketError.message)) {
    throw new Error(`could not create bucket ${DOC_BUCKET}: ${bucketError.message}`);
  }

  // --- clear, children first ---
  console.log('clearing previous seed');
  for (const table of [
    'runs',
    'contracts',
    'invoices',
    'goods_receipts',
    'purchase_orders',
    'price_list_items',
    'vendors',
  ]) {
    const { error } = await db.from(table).delete().not('id', 'is', null);
    if (error) throw new Error(`could not clear ${table}: ${error.message} (has schema.sql been run?)`);
  }

  // --- vendors ---
  const { data: vendorRows, error: vendorError } = await db
    .from('vendors')
    .insert(
      vendors.map((v) => ({
        name: v.name,
        payment_terms: v.payment_terms,
        tolerance_pct: v.tolerance_pct,
        contract_notes: v.contract_notes,
        risk_flags: v.risk_flags,
      })),
    )
    .select('id, name');
  if (vendorError) throw new Error(`vendors: ${vendorError.message}`);
  const vendorId = new Map<string, string>();
  for (const v of vendors) {
    const row = vendorRows!.find((r) => r.name === v.name);
    if (!row) throw new Error(`vendor ${v.name} did not come back from insert`);
    vendorId.set(v.key, row.id);
  }
  console.log(`vendors        ${vendorRows!.length}`);

  // --- current price lists ---
  const { error: listError } = await db.from('price_list_items').insert(
    priceListItems.map((p) => ({
      vendor_id: vendorId.get(p.vendor),
      sku: p.sku,
      description: p.description,
      unit_price: p.unit_price,
      effective_from: p.effective_from,
    })),
  );
  if (listError) throw new Error(`price_list_items: ${listError.message}`);
  console.log(`price list     ${priceListItems.length} SKUs`);

  // --- purchase orders ---
  const { error: poError } = await db.from('purchase_orders').insert(
    purchaseOrders.map((p) => ({
      vendor_id: vendorId.get(p.vendor),
      po_number: p.po_number,
      line_items: p.line_items,
      total: p.total,
      currency: 'USD',
      status: p.status,
      po_date: p.po_date,
    })),
  );
  if (poError) throw new Error(`purchase_orders: ${poError.message}`);
  console.log(`purchase orders ${purchaseOrders.length}`);

  // --- goods receipts ---
  const { error: grError } = await db.from('goods_receipts').insert(
    receipts.map((r) => ({
      po_number: r.po_number,
      received_lines: r.received_lines,
      received_at: r.received_at,
    })),
  );
  if (grError) throw new Error(`goods_receipts: ${grError.message}`);
  console.log(`goods receipts  ${receipts.length}`);

  // --- documents, then invoices ---
  console.log('rendering and uploading documents');
  const docUrl = new Map<string, string>();
  for (const inv of invoices) {
    const buf = await renderInvoiceDoc(inv, vendorFor(inv.vendor));
    const path = `${inv.invoice_number}.jpg`;
    const { error } = await db.storage
      .from(DOC_BUCKET)
      .upload(path, buf, { contentType: 'image/jpeg', upsert: true });
    if (error) throw new Error(`upload ${path}: ${error.message}`);
    docUrl.set(inv.key, db.storage.from(DOC_BUCKET).getPublicUrl(path).data.publicUrl);
  }

  const { error: invError } = await db.from('invoices').insert(
    invoices.map((inv) => {
      const t = invoiceTotals(inv);
      return {
        vendor_id: vendorId.get(inv.vendor),
        invoice_number: inv.invoice_number,
        po_number_ref: inv.po_number_ref,
        line_items: inv.line_items,
        subtotal: t.subtotal,
        tax: t.tax,
        total: t.total,
        invoice_date: inv.invoice_date,
        doc_url: docUrl.get(inv.key),
        source: 'synthetic',
        gt_action: inv.gt_action,
        gt_reason: inv.gt_reason,
        difficulty: inv.difficulty,
        case_no: inv.case_no,
      };
    }),
  );
  if (invError) throw new Error(`invoices: ${invError.message}`);
  console.log(`invoices        ${invoices.length} (${testCases.length} test cases, ${invoices.length - testCases.length} ledger history)`);

  await verify(db);
}

/** Build order step 1's verification: a real three-way read across all 15 cases. */
async function verify(db: Awaited<typeof import('../lib/supabase')>['db']) {
  const { data: invRows, error } = await db
    .from('invoices')
    .select('case_no, invoice_number, po_number_ref, total, invoice_date, difficulty, gt_action, doc_url, vendors(name)')
    .not('difficulty', 'is', null)
    .order('case_no');
  if (error) throw new Error(`verify: ${error.message}`);

  const { data: poRows } = await db.from('purchase_orders').select('po_number, total, status, po_date');
  const { data: grRows } = await db.from('goods_receipts').select('po_number, received_lines, received_at');

  console.log('\nthree-way match across the corpus\n');
  const counts: Record<string, number> = {};
  let incoherent = 0;

  for (const inv of invRows!) {
    counts[inv.difficulty!] = (counts[inv.difficulty!] ?? 0) + 1;
    const po = poRows!.find((p) => p.po_number === inv.po_number_ref);
    const gr = grRows!.find((g) => g.po_number === inv.po_number_ref);
    const received = gr
      ? (gr.received_lines as { qty_received: number }[]).reduce((s, l) => s + l.qty_received, 0)
      : null;

    // Case 9 is the only case allowed to have no PO. Every PO must carry a receipt.
    const expectNoPo = inv.case_no === 9;
    const ok = expectNoPo ? !po && !gr : Boolean(po && gr) && Boolean(inv.doc_url);
    if (!ok) incoherent++;

    console.log(
      [
        String(inv.case_no).padStart(2),
        // @ts-expect-error embedded relation is typed loosely by the generated client
        (inv.vendors?.name ?? '?').padEnd(27),
        inv.invoice_number.padEnd(9),
        inv.difficulty!.padEnd(9),
        inv.gt_action.padEnd(8),
        ('inv ' + Number(inv.total).toFixed(2)).padStart(13),
        (po ? 'po ' + Number(po.total).toFixed(2) : 'no PO').padStart(13),
        (po ? po.status! : '—').padEnd(9),
        (received === null ? 'no receipt' : `received ${received}`).padEnd(13),
        ok ? 'ok' : 'INCOHERENT',
      ].join(' '),
    );
  }

  console.log(`\ndistribution ${JSON.stringify(counts)}`);
  const distributionOk = counts.clean === 6 && counts.exception === 6 && counts.ambiguous === 3;
  if (!distributionOk) throw new Error('difficulty distribution is not 6/6/3');
  if (incoherent) throw new Error(`${incoherent} case(s) failed the three-way coherence check`);
  console.log('seed verified: 6/6/3 and every case resolves coherently');
}

void main().catch((e) => {
  console.error('\nseed failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
