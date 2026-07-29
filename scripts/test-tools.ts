/**
 * Build order step 2's verification: every tool callable in isolation against the real
 * database, returning valid JSON. Also proves the two planted duplicates are genuinely
 * discovered by SQL and that a missing PO reports {found:false}.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

let failures = 0;

function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? 'pass' : 'FAIL'}  ${label}`);
  if (!ok) {
    failures++;
    if (detail !== undefined) console.log('      ' + JSON.stringify(detail));
  }
}

async function main() {
  const { db } = await import('../lib/supabase');
  const { executeTool, TOOL_NAMES } = await import('../lib/tools');

  const { data: cases, error } = await db
    .from('invoices')
    .select('id, case_no, invoice_number, vendor_id, po_number_ref, total, invoice_date')
    .not('difficulty', 'is', null)
    .order('case_no');
  if (error) throw new Error(`could not read corpus: ${error.message} (run npm run seed first)`);

  const byCase = new Map(cases!.map((c) => [c.case_no as number, c]));
  const c1 = byCase.get(1)!;
  const c7 = byCase.get(7)!;
  const c9 = byCase.get(9)!;
  const c10 = byCase.get(10)!;
  const c13 = byCase.get(13)!;
  const c15 = byCase.get(15)!;

  console.log(`eight tools declared: ${TOOL_NAMES.join(', ')}\n`);
  check('all eight tools are declared', TOOL_NAMES.length === 8, TOOL_NAMES);

  // --- get_invoice ---
  const inv = await executeTool('get_invoice', { invoice_id: c1.id }, { invoiceId: c1.id });
  const invRes = inv.result as { found: boolean; line_items: unknown[]; total: number };
  check('get_invoice returns the record with line items', invRes.found && Array.isArray(invRes.line_items) && invRes.line_items.length > 0);

  // --- lookup_po, both branches ---
  const po = await executeTool('lookup_po', { po_number: c1.po_number_ref }, { invoiceId: c1.id });
  const poRes = po.result as { found: boolean; status: string; line_items_subtotal: number; po_date: string };
  check('lookup_po finds a real PO with status and cut date', poRes.found && Boolean(poRes.status) && Boolean(poRes.po_date));

  const missing = await executeTool('lookup_po', { po_number: 'PO-DOES-NOT-EXIST' }, { invoiceId: c9.id });
  check('lookup_po returns {found:false} for a PO that does not exist', (missing.result as { found: boolean }).found === false, missing.result);
  check('case 9 (missing PO) carries no PO reference at all', c9.po_number_ref === null, c9.po_number_ref);

  // --- get_goods_receipt ---
  const gr = await executeTool('get_goods_receipt', { po_number: c1.po_number_ref }, { invoiceId: c1.id });
  const grRes = gr.result as { found: boolean; received_lines: unknown[]; received_at: string };
  check('get_goods_receipt returns received lines and a date', grRes.found && Array.isArray(grRes.received_lines));

  const grMissing = await executeTool('get_goods_receipt', { po_number: 'PO-DOES-NOT-EXIST' }, { invoiceId: c9.id });
  check('get_goods_receipt returns {found:false} when nothing was received', (grMissing.result as { found: boolean }).found === false);

  // --- get_vendor_terms: the freight carve-out must be reachable ---
  const terms = await executeTool('get_vendor_terms', { vendor_id: c13.vendor_id }, { invoiceId: c13.id });
  const termsRes = terms.result as { found: boolean; contract_notes: string; risk_flags: string[]; tolerance_pct: number };
  check('get_vendor_terms exposes tolerance, notes and risk flags', termsRes.found && typeof termsRes.tolerance_pct === 'number');
  check(
    'the freight carve-out is discoverable in Northline contract notes',
    /freight surcharge lines excluded/i.test(termsRes.contract_notes ?? ''),
    termsRes.contract_notes,
  );

  // --- get_price_list: case 7's billed prices must match the live list ---
  const list = await executeTool('get_price_list', { vendor_id: c7.vendor_id }, { invoiceId: c7.id });
  const listRes = list.result as {
    found: boolean;
    items: { sku: string; unit_price: number | null }[];
  };
  check('get_price_list returns Calderon SKUs', listRes.found && listRes.items.length >= 2, listRes);
  const inv7 = await executeTool('get_invoice', { invoice_id: c7.id }, { invoiceId: c7.id });
  const inv7Lines = (inv7.result as { line_items: { sku: string; unit_price: number }[] }).line_items;
  const listMatch = inv7Lines.every((line) =>
    listRes.items.some((p) => p.sku === line.sku && Number(p.unit_price) === Number(line.unit_price)),
  );
  check('case 7 invoice unit prices match the current price list', listMatch, { inv7Lines, list: listRes.items });

  const listMissing = await executeTool('get_price_list', { vendor_id: '00000000-0000-0000-0000-000000000000' }, { invoiceId: c7.id });
  check('get_price_list returns {found:false} for an unknown vendor', (listMissing.result as { found: boolean }).found === false);

  // --- find_similar_invoices: the two planted duplicates ---
  const dup10 = await executeTool(
    'find_similar_invoices',
    { vendor_id: c10.vendor_id, amount: Number(c10.total), days: 14 },
    { invoiceId: c10.id },
  );
  const dup10Res = dup10.result as { found: boolean; matches: { invoice_number: string; days_apart: number }[] };
  check(
    'find_similar_invoices finds the case 10 duplicate INV-4402 nine days back',
    dup10Res.found && dup10Res.matches.some((m) => m.invoice_number === 'INV-4402' && m.days_apart === 9),
    dup10Res.matches,
  );

  const dup15 = await executeTool(
    'find_similar_invoices',
    { vendor_id: c15.vendor_id, amount: Number(c15.total), days: 14 },
    { invoiceId: c15.id },
  );
  const dup15Res = dup15.result as { found: boolean; matches: { invoice_number: string; days_apart: number }[] };
  check(
    'find_similar_invoices finds the case 15 near-duplicate INV-4455 eleven days back',
    dup15Res.found && dup15Res.matches.some((m) => m.invoice_number === 'INV-4455' && m.days_apart === 11),
    dup15Res.matches,
  );

  const noDup = await executeTool(
    'find_similar_invoices',
    { vendor_id: c1.vendor_id, amount: Number(c1.total), days: 14 },
    { invoiceId: c1.id },
  );
  check('find_similar_invoices stays quiet on a clean case', (noDup.result as { found: boolean }).found === false, noDup.result);

  // --- terminals ---
  const decided = await executeTool('decide', { action: 'approve', confidence: 0.91, rationale: 'R-01 match exact' }, { invoiceId: c1.id });
  check('decide is terminal and echoes the decision', decided.terminal?.action === 'approve');

  const escalated = await executeTool('escalate', { reason: 'freight variance', route_to: 'Priya', confidence: 0.4 }, { invoiceId: c13.id });
  check('escalate is terminal and routes', escalated.terminal?.action === 'escalate' && escalated.terminal?.route_to === 'Priya');

  // --- bad input is reported, not thrown ---
  const bad = await executeTool('decide', { action: 'maybe', confidence: 3 }, { invoiceId: c1.id });
  check('invalid arguments come back as an error result, not an exception', Boolean((bad.result as { error?: string }).error));

  console.log('');
  if (failures) {
    console.error(`${failures} check(s) failed`);
    process.exit(1);
  }
  console.log('all tool checks passed');
}

void main().catch((e) => {
  console.error('\ntool test failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
