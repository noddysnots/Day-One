/**
 * Resyncs one invoice from data/corpus.ts into Storage and the ledger, without touching
 * contracts, runs or any other row.
 *
 * scripts/seed.ts is the wrong tool for a single-figure correction: it deletes runs and
 * contracts first, which would destroy a contract version and a scored run. This re-renders
 * the paper, re-uploads it, updates the invoice row, then reads the document back over HTTP
 * and compares bytes, so a stale CDN copy cannot pass as a fresh one.
 *
 * Usage: npx tsx scripts/resync-invoice.ts INV-2231
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { mkdir, writeFile } from 'node:fs/promises';
import { invoices, invoiceTotals, validateCorpus } from '../data/corpus';
import { renderInvoiceDoc, vendorFor } from './render-docs';

async function main() {
  const wanted = process.argv[2];
  if (!wanted) throw new Error('name an invoice, e.g. npx tsx scripts/resync-invoice.ts INV-2231');

  const problems = validateCorpus();
  if (problems.length) {
    console.error('Corpus is invalid, refusing to resync:');
    for (const p of problems) console.error('  - ' + p);
    process.exit(1);
  }

  const inv = invoices.find((i) => i.invoice_number === wanted);
  if (!inv) throw new Error(`${wanted} is not in the corpus`);

  const { db, DOC_BUCKET } = await import('../lib/supabase');
  const totals = invoiceTotals(inv);
  console.log(`${inv.invoice_number}  subtotal ${totals.subtotal}  tax ${totals.tax}  total ${totals.total}`);

  const { data: before, error: beforeError } = await db
    .from('invoices')
    .select('id, subtotal, tax, total, doc_url')
    .eq('invoice_number', inv.invoice_number)
    .maybeSingle();
  if (beforeError) throw new Error(`read ${inv.invoice_number}: ${beforeError.message}`);
  if (!before) throw new Error(`${inv.invoice_number} is not in the ledger; this script only corrects seeded rows`);
  console.log(`ledger before   subtotal ${before.subtotal}  tax ${before.tax}  total ${before.total}`);

  // --- paper ---
  const buf = await renderInvoiceDoc(inv, vendorFor(inv.vendor));
  await mkdir('out/docs', { recursive: true });
  await writeFile(`out/docs/${inv.invoice_number}.jpg`, buf);
  const path = `${inv.invoice_number}.jpg`;
  const { error: uploadError } = await db.storage
    .from(DOC_BUCKET)
    .upload(path, buf, { contentType: 'image/jpeg', upsert: true });
  if (uploadError) throw new Error(`upload ${path}: ${uploadError.message}`);
  const publicUrl = db.storage.from(DOC_BUCKET).getPublicUrl(path).data.publicUrl;
  console.log(`rendered        ${(buf.length / 1024).toFixed(0)} kB, uploaded to ${path}`);

  // --- ledger ---
  const { error: updateError } = await db
    .from('invoices')
    .update({
      line_items: inv.line_items,
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
      invoice_date: inv.invoice_date,
      gt_action: inv.gt_action,
      gt_reason: inv.gt_reason,
      doc_url: publicUrl,
    })
    .eq('id', before.id);
  if (updateError) throw new Error(`update ${inv.invoice_number}: ${updateError.message}`);

  const { data: after } = await db
    .from('invoices')
    .select('subtotal, tax, total, line_items, doc_url')
    .eq('id', before.id)
    .maybeSingle();
  console.log(`ledger after    subtotal ${after!.subtotal}  tax ${after!.tax}  total ${after!.total}`);

  const agrees =
    Number(after!.subtotal) === totals.subtotal &&
    Number(after!.tax) === totals.tax &&
    Number(after!.total) === totals.total;
  if (!agrees) throw new Error('the ledger row does not agree with the corpus after the update');

  // --- the paper the reader will actually be served ---
  const served = await fetch(String(after!.doc_url), { cache: 'no-store' });
  if (!served.ok) throw new Error(`document fetch answered ${served.status} for ${after!.doc_url}`);
  const servedBytes = Buffer.from(await served.arrayBuffer());
  console.log(
    `document over http  ${served.status}  ${served.headers.get('content-type')}  ${(servedBytes.length / 1024).toFixed(0)} kB`,
  );
  if (!servedBytes.equals(buf)) {
    throw new Error(
      `the document served at ${after!.doc_url} is not the one just rendered ` +
        `(${servedBytes.length} bytes served vs ${buf.length} rendered). A stale copy is being cached.`,
    );
  }

  console.log(`\nOK ${inv.invoice_number}: paper, ledger and corpus all state ${totals.total.toFixed(2)}`);
}

void main().catch((e) => {
  console.error('\nresync failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
