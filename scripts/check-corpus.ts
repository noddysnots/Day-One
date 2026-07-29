import { invoices, testCases, purchaseOrders, invoiceTotals, sumLines, validateCorpus } from '../data/corpus';

const errors = validateCorpus();

const counts = testCases.reduce<Record<string, number>>((acc, i) => {
  acc[i.difficulty!] = (acc[i.difficulty!] ?? 0) + 1;
  return acc;
}, {});

const actions = testCases.reduce<Record<string, number>>((acc, i) => {
  acc[i.gt_action] = (acc[i.gt_action] ?? 0) + 1;
  return acc;
}, {});

console.log(`test cases: ${testCases.length}  distribution: ${JSON.stringify(counts)}`);
console.log(`ground truth actions: ${JSON.stringify(actions)}`);
console.log(`ledger history rows: ${invoices.length - testCases.length}\n`);

for (const inv of invoices) {
  const t = invoiceTotals(inv);
  const po = purchaseOrders.find((p) => p.po_number === inv.po_number_ref);
  const variance = po ? t.total - po.total : null;
  const pct = po && po.total ? ((variance! / po.total) * 100).toFixed(2) + '%' : '—';
  console.log(
    [
      (inv.case_no ?? '—').toString().padStart(2),
      inv.invoice_number.padEnd(9),
      (inv.difficulty ?? 'history').padEnd(9),
      inv.gt_action.padEnd(8),
      ('sub ' + t.subtotal.toFixed(2)).padStart(12),
      ('tax ' + t.tax.toFixed(2)).padStart(11),
      ('tot ' + t.total.toFixed(2)).padStart(12),
      (inv.po_number_ref ?? 'no PO').padEnd(8),
      ('po ' + (po ? po.total.toFixed(2) : '—')).padStart(12),
      ('var ' + (variance === null ? '—' : variance.toFixed(2))).padStart(11),
      pct.padStart(7),
    ].join(' '),
  );
}

console.log('');
for (const po of purchaseOrders) {
  console.log(`${po.po_number} ${po.vendor.padEnd(10)} ${po.status.padEnd(9)} cut ${po.po_date} lines ${sumLines(po.line_items).toFixed(2)} total ${po.total.toFixed(2)}`);
}

console.log('');
if (errors.length) {
  console.error(`FAIL ${errors.length} problem(s):`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log('OK all corpus invariants hold');
