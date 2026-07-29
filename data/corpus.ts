/**
 * The corpus, transcribed from day-one-corpus.md. That file is the fixed measuring stick:
 * 15 cases at exactly 6 clean / 6 exception / 3 ambiguous, plus the two prior invoices that
 * cases 10 and 15 need so find_similar_invoices genuinely returns them.
 *
 * Do not tune these numbers to flatter a run. If v1 scores too well, tighten the compiler
 * prompt instead.
 *
 * Money convention: line_items and `tax` are what the paper says. subtotal = sum(line_items),
 * total = subtotal + tax, and `expected_total` restates the figure from the corpus doc so the
 * seed fails loudly if the arithmetic ever drifts. Only Vantage bills tax (8% by contract), so
 * Vantage PO totals are tax-inclusive and every other PO total equals its line sum.
 */

export type LineItem = { sku: string; description: string; qty: number; unit_price: number };

export type VendorSeed = {
  key: string;
  name: string;
  payment_terms: string;
  tolerance_pct: number | null;
  contract_notes: string | null;
  risk_flags: string[];
};

export type PoSeed = {
  po_number: string;
  vendor: string;
  po_date: string;
  status: 'open' | 'closed' | 'cancelled';
  line_items: LineItem[];
  /** Approved value. Tax-inclusive for Vantage, line sum for everyone else. */
  total: number;
};

export type ReceiptSeed = {
  po_number: string;
  received_lines: { sku: string; qty_received: number }[];
  received_at: string;
};

export type InvoiceSeed = {
  key: string;
  case_no: number | null;
  vendor: string;
  invoice_number: string;
  po_number_ref: string | null;
  line_items: LineItem[];
  tax: number;
  invoice_date: string;
  expected_total: number;
  gt_action: 'approve' | 'reject' | 'escalate';
  gt_reason: string;
  difficulty: 'clean' | 'exception' | 'ambiguous' | null;
  layout: 0 | 1 | 2 | 3;
};

export type PriceListSeed = {
  vendor: string;
  sku: string;
  description: string;
  unit_price: number;
  /** When this list price took effect. Calderon's April revision is the one case 7 turns on. */
  effective_from: string;
};

/** Vantage's contractual rate. Every other vendor bills no separate tax line. */
export const VANTAGE_TAX_RATE = 0.08;

export const vendors: VendorSeed[] = [
  {
    key: 'meridian',
    name: 'Meridian Packaging',
    payment_terms: 'Net 30',
    tolerance_pct: 2,
    contract_notes: null,
    risk_flags: [],
  },
  {
    key: 'vantage',
    name: 'Vantage Labs',
    payment_terms: 'Net 45',
    tolerance_pct: 2,
    contract_notes: 'Tax rate 8% on all lines',
    risk_flags: [],
  },
  {
    key: 'orbit',
    name: 'Orbit Facilities',
    payment_terms: 'Net 30',
    tolerance_pct: 2,
    contract_notes: null,
    risk_flags: [],
  },
  {
    key: 'calderon',
    name: 'Calderon Industrial Supply',
    payment_terms: 'Net 30',
    tolerance_pct: 2,
    contract_notes: 'Price revision effective Apr 1; POs cut before then are stale',
    risk_flags: ['stale_po'],
  },
  {
    // The freight carve-out lives here and nowhere in the compiler's inputs. That gap is
    // what case 13 exists to expose.
    key: 'northline',
    name: 'Northline Freight',
    payment_terms: 'Net 30',
    tolerance_pct: 2,
    contract_notes:
      'Freight surcharge lines excluded from standard tolerance; monthly LTL retainer billed on the 1st',
    risk_flags: ['duplicate_history'],
  },
];

export const purchaseOrders: PoSeed[] = [
  // Cut in March, before the April price revision. Case 7 turns on this date.
  {
    po_number: 'PO-2219',
    vendor: 'calderon',
    po_date: '2025-03-14',
    status: 'open',
    line_items: [
      { sku: 'CAL-1180', description: 'Steel bar stock 1in x 12ft', qty: 50, unit_price: 45.0 },
      { sku: 'CAL-2240', description: 'Tapered roller bearing 32210', qty: 40, unit_price: 45.0 },
    ],
    total: 4050.0,
  },
  {
    po_number: 'PO-3290',
    vendor: 'calderon',
    po_date: '2025-04-02',
    status: 'open',
    line_items: [
      { sku: 'CAL-4402', description: 'Hex bolt M12x60 zinc, box/100', qty: 25, unit_price: 22.0 },
      { sku: 'CAL-4407', description: 'Lock washer M12, box/500', qty: 20, unit_price: 30.0 },
    ],
    total: 1150.0,
  },
  {
    po_number: 'PO-3299',
    vendor: 'calderon',
    po_date: '2025-04-02',
    status: 'cancelled',
    line_items: [
      { sku: 'CAL-6610', description: 'Structural channel C6x8.2, 20ft', qty: 40, unit_price: 182.5 },
    ],
    total: 7300.0,
  },
  {
    po_number: 'PO-3301',
    vendor: 'meridian',
    po_date: '2025-04-03',
    status: 'open',
    line_items: [
      { sku: 'MER-1120', description: 'Corrugated carton 18x12x12', qty: 900, unit_price: 1.85 },
      { sku: 'MER-1134', description: 'Stretch wrap 80ga 18in roll', qty: 25, unit_price: 27.0 },
    ],
    total: 2340.0,
  },
  {
    po_number: 'PO-3318',
    vendor: 'vantage',
    po_date: '2025-04-03',
    status: 'open',
    line_items: [
      { sku: 'VAN-5510', description: 'Nitrile glove, powder-free, box/100', qty: 16, unit_price: 24.19 },
    ],
    total: 418.0,
  },
  {
    po_number: 'PO-3325',
    vendor: 'orbit',
    po_date: '2025-04-04',
    status: 'open',
    line_items: [
      { sku: 'ORB-SVC-JAN', description: 'Janitorial service, monthly', qty: 1, unit_price: 4200.0 },
      { sku: 'ORB-7702', description: 'Restroom consumables kit', qty: 24, unit_price: 105.0 },
    ],
    total: 6720.0,
  },
  {
    po_number: 'PO-3340',
    vendor: 'meridian',
    po_date: '2025-04-04',
    status: 'open',
    line_items: [
      { sku: 'MER-1140', description: 'Poly mailer 10x13, case/500', qty: 4, unit_price: 47.5 },
      { sku: 'MER-1145', description: 'Packing tape 48mm, case/36', qty: 3, unit_price: 33.0 },
    ],
    total: 289.0,
  },
  {
    po_number: 'PO-3352',
    vendor: 'vantage',
    po_date: '2025-04-05',
    status: 'open',
    line_items: [
      { sku: 'VAN-5522', description: 'Buffer solution pH 7.0, 5L', qty: 34, unit_price: 68.5 },
      { sku: 'VAN-SVC-PM', description: 'Analyzer preventive-maintenance visit', qty: 1, unit_price: 1291.37 },
    ],
    total: 3910.0,
  },
  {
    po_number: 'PO-3361',
    vendor: 'meridian',
    po_date: '2025-04-05',
    status: 'open',
    line_items: [{ sku: 'MER-1150', description: 'Kraft paper roll 36in', qty: 200, unit_price: 14.2 }],
    total: 2840.0,
  },
  {
    po_number: 'PO-3365',
    vendor: 'northline',
    po_date: '2025-04-01',
    status: 'open',
    line_items: [
      { sku: 'NL-LTL', description: 'LTL freight, lane CHI-ATL', qty: 1, unit_price: 1240.0 },
      { sku: 'NL-FUEL', description: 'Fuel surcharge \u2014 regional', qty: 1, unit_price: 240.0 },
    ],
    total: 1480.0,
  },
  {
    po_number: 'PO-3370',
    vendor: 'northline',
    po_date: '2025-04-08',
    status: 'open',
    line_items: [
      { sku: 'NL-LTL', description: 'LTL freight, lane DAL-DEN', qty: 1, unit_price: 2400.0 },
      { sku: 'NL-FUEL', description: 'Fuel surcharge \u2014 regional', qty: 1, unit_price: 300.0 },
    ],
    total: 2700.0,
  },
  {
    po_number: 'PO-3372',
    vendor: 'vantage',
    po_date: '2025-04-08',
    status: 'open',
    line_items: [
      { sku: 'VAN-5540', description: 'HPLC column C18 250mm', qty: 4, unit_price: 985.0 },
      { sku: 'VAN-5545', description: 'Acetonitrile, HPLC grade, 4L', qty: 20, unit_price: 53.0 },
    ],
    total: 5400.0,
  },
  // Annual blanket covering twelve monthly retainer periods; cases 15 and its prior draw on it.
  {
    po_number: 'PO-3374',
    vendor: 'northline',
    po_date: '2025-04-09',
    status: 'open',
    line_items: [{ sku: 'NL-RET', description: 'Monthly LTL retainer', qty: 12, unit_price: 890.0 }],
    total: 10680.0,
  },
  {
    po_number: 'PO-3381',
    vendor: 'vantage',
    po_date: '2025-04-09',
    status: 'open',
    line_items: [
      { sku: 'VAN-6601', description: 'Digital pressure calibrator DPC-9', qty: 1, unit_price: 2450.0 },
      { sku: 'VAN-SVC-CAL', description: 'Calibration and certification', qty: 1, unit_price: 1809.26 },
    ],
    total: 4600.0,
  },
];

export const receipts: ReceiptSeed[] = [
  { po_number: 'PO-2219', received_at: '2025-04-13', received_lines: [{ sku: 'CAL-1180', qty_received: 50 }, { sku: 'CAL-2240', qty_received: 40 }] },
  { po_number: 'PO-3290', received_at: '2025-04-10', received_lines: [{ sku: 'CAL-4402', qty_received: 25 }, { sku: 'CAL-4407', qty_received: 20 }] },
  // PO cancelled: the receipt was raised and reversed, nothing was taken in.
  { po_number: 'PO-3299', received_at: '2025-04-05', received_lines: [{ sku: 'CAL-6610', qty_received: 0 }] },
  { po_number: 'PO-3301', received_at: '2025-04-08', received_lines: [{ sku: 'MER-1120', qty_received: 900 }, { sku: 'MER-1134', qty_received: 25 }] },
  { po_number: 'PO-3318', received_at: '2025-04-09', received_lines: [{ sku: 'VAN-5510', qty_received: 16 }] },
  { po_number: 'PO-3325', received_at: '2025-04-10', received_lines: [{ sku: 'ORB-SVC-JAN', qty_received: 1 }, { sku: 'ORB-7702', qty_received: 24 }] },
  { po_number: 'PO-3340', received_at: '2025-04-11', received_lines: [{ sku: 'MER-1140', qty_received: 4 }, { sku: 'MER-1145', qty_received: 3 }] },
  { po_number: 'PO-3352', received_at: '2025-04-11', received_lines: [{ sku: 'VAN-5522', qty_received: 34 }, { sku: 'VAN-SVC-PM', qty_received: 1 }] },
  // Case 8: billed 200, dock signed for 140.
  { po_number: 'PO-3361', received_at: '2025-04-12', received_lines: [{ sku: 'MER-1150', qty_received: 140 }] },
  { po_number: 'PO-3365', received_at: '2025-04-03', received_lines: [{ sku: 'NL-LTL', qty_received: 1 }, { sku: 'NL-FUEL', qty_received: 1 }] },
  { po_number: 'PO-3370', received_at: '2025-04-16', received_lines: [{ sku: 'NL-LTL', qty_received: 1 }, { sku: 'NL-FUEL', qty_received: 1 }] },
  { po_number: 'PO-3372', received_at: '2025-04-14', received_lines: [{ sku: 'VAN-5540', qty_received: 4 }, { sku: 'VAN-5545', qty_received: 20 }] },
  // Retainer periods accrued through the September billing cycle; both retainer invoices draw on it.
  { po_number: 'PO-3374', received_at: '2025-08-31', received_lines: [{ sku: 'NL-RET', qty_received: 2 }] },
  // Case 14: received four days AFTER Wexler-style advance billing. This is the only
  // receipt in the corpus dated later than its invoice.
  { po_number: 'PO-3381', received_at: '2025-04-18', received_lines: [{ sku: 'VAN-6601', qty_received: 1 }, { sku: 'VAN-SVC-CAL', qty_received: 1 }] },
];

export const invoices: InvoiceSeed[] = [
  // ---------------- clean (6) : ground truth approve ----------------
  {
    key: 'C01',
    case_no: 1,
    vendor: 'meridian',
    invoice_number: 'INV-7712',
    po_number_ref: 'PO-3301',
    line_items: [
      { sku: 'MER-1120', description: 'Corrugated carton 18x12x12', qty: 900, unit_price: 1.85 },
      { sku: 'MER-1134', description: 'Stretch wrap 80ga 18in roll', qty: 25, unit_price: 27.0 },
    ],
    tax: 0,
    invoice_date: '2025-04-10',
    expected_total: 2340.0,
    gt_action: 'approve',
    gt_reason: 'Three-way match agrees within tolerance. Exact against PO-3301 and the receipt is full.',
    difficulty: 'clean',
    layout: 0,
  },
  {
    key: 'C02',
    case_no: 2,
    vendor: 'vantage',
    invoice_number: 'INV-2205',
    po_number_ref: 'PO-3318',
    line_items: [
      { sku: 'VAN-5510', description: 'Nitrile glove, powder-free, box/100', qty: 16, unit_price: 24.19 },
    ],
    tax: 30.96,
    invoice_date: '2025-04-11',
    expected_total: 418.0,
    gt_action: 'approve',
    gt_reason: 'Three-way match agrees within tolerance. Under $500 and tax is the contracted 8%.',
    difficulty: 'clean',
    layout: 1,
  },
  {
    key: 'C03',
    case_no: 3,
    vendor: 'orbit',
    invoice_number: 'INV-9034',
    po_number_ref: 'PO-3325',
    line_items: [
      { sku: 'ORB-SVC-JAN', description: 'Janitorial service, monthly', qty: 1, unit_price: 4200.0 },
      { sku: 'ORB-7702', description: 'Restroom consumables kit', qty: 24, unit_price: 105.0 },
    ],
    tax: 0,
    invoice_date: '2025-04-12',
    expected_total: 6720.0,
    gt_action: 'approve',
    gt_reason: 'Three-way match agrees within tolerance. Exact against PO-3325, receipt full.',
    difficulty: 'clean',
    layout: 2,
  },
  {
    key: 'C04',
    case_no: 4,
    vendor: 'calderon',
    invoice_number: 'INV-8802',
    po_number_ref: 'PO-3290',
    line_items: [
      { sku: 'CAL-4402', description: 'Hex bolt M12x60 zinc, box/100', qty: 25, unit_price: 22.0 },
      { sku: 'CAL-4407', description: 'Lock washer M12, box/500', qty: 20, unit_price: 30.0 },
    ],
    tax: 0,
    invoice_date: '2025-04-12',
    expected_total: 1150.0,
    gt_action: 'approve',
    gt_reason:
      'Three-way match agrees within tolerance. PO-3290 was cut after 1 April so the price revision does not apply and nothing is stale.',
    difficulty: 'clean',
    layout: 3,
  },
  {
    key: 'C05',
    case_no: 5,
    vendor: 'meridian',
    invoice_number: 'INV-7749',
    po_number_ref: 'PO-3340',
    line_items: [
      { sku: 'MER-1140', description: 'Poly mailer 10x13, case/500', qty: 4, unit_price: 47.5 },
      { sku: 'MER-1145', description: 'Packing tape 48mm, case/36', qty: 3, unit_price: 33.0 },
    ],
    tax: 0,
    invoice_date: '2025-04-13',
    expected_total: 289.0,
    gt_action: 'approve',
    gt_reason: 'Three-way match agrees within tolerance. Under $500, exact against PO-3340.',
    difficulty: 'clean',
    layout: 0,
  },
  {
    key: 'C06',
    case_no: 6,
    vendor: 'vantage',
    invoice_number: 'INV-2231',
    po_number_ref: 'PO-3352',
    line_items: [
      { sku: 'VAN-5522', description: 'Buffer solution pH 7.0, 5L', qty: 34, unit_price: 68.5 },
      { sku: 'VAN-SVC-PM', description: 'Analyzer preventive-maintenance visit', qty: 1, unit_price: 1306.19 },
    ],
    // Subtotal 3635.19 at the contracted 8% is 290.8152, which rounds to the 290.82 billed. The
    // earlier 1306.18 left the tax a cent light, so a rate check turned a clean case into an
    // escalation over rounding. The variance against PO-3352 is 16.01, still 0.4%.
    tax: 290.82,
    invoice_date: '2025-04-14',
    expected_total: 3926.01,
    gt_action: 'approve',
    gt_reason:
      'Three-way match agrees within tolerance. $16 over PO-3352, 0.4%, inside both the percentage and the dollar test, and the tax is the contracted 8%.',
    difficulty: 'clean',
    layout: 1,
  },

  // ---------------- exception (6) ----------------
  {
    // Tests whether the compiler used the email at all. A voice-note-only rulebook rejects this.
    key: 'E07',
    case_no: 7,
    vendor: 'calderon',
    invoice_number: 'INV-8841',
    po_number_ref: 'PO-2219',
    line_items: [
      { sku: 'CAL-1180', description: 'Steel bar stock 1in x 12ft', qty: 50, unit_price: 46.44 },
      { sku: 'CAL-2240', description: 'Tapered roller bearing 32210', qty: 40, unit_price: 46.45 },
    ],
    tax: 0,
    invoice_date: '2025-04-15',
    expected_total: 4180.0,
    gt_action: 'approve',
    gt_reason:
      'Stale PO. Under 5% and unit prices match the current list, so it clears under the rule Dana set in the email thread.',
    difficulty: 'exception',
    layout: 3,
  },
  {
    key: 'E08',
    case_no: 8,
    vendor: 'meridian',
    invoice_number: 'INV-7760',
    po_number_ref: 'PO-3361',
    line_items: [{ sku: 'MER-1150', description: 'Kraft paper roll 36in', qty: 200, unit_price: 14.2 }],
    tax: 0,
    invoice_date: '2025-04-15',
    expected_total: 2840.0,
    gt_action: 'reject',
    gt_reason: 'Billed for 200, received 140. Short receipt, do not pay the difference.',
    difficulty: 'exception',
    layout: 0,
  },
  {
    key: 'E09',
    case_no: 9,
    vendor: 'orbit',
    invoice_number: 'INV-9051',
    po_number_ref: null,
    line_items: [
      { sku: 'ORB-9020', description: 'Task chair, ergonomic', qty: 10, unit_price: 214.0 },
      { sku: 'ORB-9021', description: 'Monitor arm, dual', qty: 8, unit_price: 90.0 },
    ],
    tax: 0,
    invoice_date: '2025-04-16',
    expected_total: 2860.0,
    gt_action: 'escalate',
    gt_reason: 'No PO. Off-contract purchase, Priya needs to find the owner.',
    difficulty: 'exception',
    layout: 2,
  },
  {
    key: 'E10',
    case_no: 10,
    vendor: 'northline',
    invoice_number: 'INV-4417',
    po_number_ref: 'PO-3365',
    line_items: [
      { sku: 'NL-LTL', description: 'LTL freight, lane CHI-ATL', qty: 1, unit_price: 1240.0 },
      { sku: 'NL-FUEL', description: 'Fuel surcharge \u2014 regional', qty: 1, unit_price: 240.0 },
    ],
    tax: 0,
    invoice_date: '2025-04-14',
    expected_total: 1480.0,
    gt_action: 'reject',
    gt_reason: 'Duplicate of INV-4402. Same lines, same amount, nine days apart.',
    difficulty: 'exception',
    layout: 1,
  },
  {
    // Boundary case. Overage is exactly $50, which is exactly the dollar test.
    key: 'E11',
    case_no: 11,
    vendor: 'vantage',
    invoice_number: 'INV-2244',
    po_number_ref: 'PO-3372',
    line_items: [
      { sku: 'VAN-5540', description: 'HPLC column C18 250mm', qty: 4, unit_price: 985.0 },
      { sku: 'VAN-5545', description: 'Acetonitrile, HPLC grade, 4L', qty: 20, unit_price: 53.0 },
    ],
    tax: 450.0,
    invoice_date: '2025-04-16',
    expected_total: 5450.0,
    gt_action: 'escalate',
    gt_reason:
      'Tax is over-charged by $50 and the overage lands exactly on the tolerance boundary. Someone decides.',
    difficulty: 'exception',
    layout: 1,
  },
  {
    // The voice note never covers cancelled POs. This should surface in open_questions.
    key: 'E12',
    case_no: 12,
    vendor: 'calderon',
    invoice_number: 'INV-8863',
    po_number_ref: 'PO-3299',
    line_items: [
      { sku: 'CAL-6610', description: 'Structural channel C6x8.2, 20ft', qty: 40, unit_price: 182.5 },
    ],
    tax: 0,
    invoice_date: '2025-04-17',
    expected_total: 7300.0,
    gt_action: 'reject',
    gt_reason: 'PO was cancelled. Nothing to match against.',
    difficulty: 'exception',
    layout: 3,
  },

  // ---------------- ambiguous (3) : ground truth always escalate ----------------
  {
    // Requires get_vendor_terms and reading contract_notes. Arithmetic alone approves it.
    key: 'A13',
    case_no: 13,
    vendor: 'northline',
    invoice_number: 'INV-4460',
    po_number_ref: 'PO-3370',
    line_items: [
      { sku: 'NL-LTL', description: 'LTL freight, lane DAL-DEN', qty: 1, unit_price: 2400.0 },
      { sku: 'NL-FUEL', description: 'Fuel surcharge \u2014 regional', qty: 1, unit_price: 348.0 },
    ],
    tax: 0,
    invoice_date: '2025-04-18',
    expected_total: 2748.0,
    gt_action: 'escalate',
    gt_reason:
      "It's inside tolerance on paper, but the whole overage is freight, and freight doesn't fall under standard tolerance for Northline. I'd want to look.",
    difficulty: 'ambiguous',
    layout: 1,
  },
  {
    // No rule exists anywhere in the inputs. Compiler should raise an open question; the
    // agent should still notice the date order and escalate rather than approve a clean match.
    key: 'A14',
    case_no: 14,
    vendor: 'vantage',
    invoice_number: 'INV-2258',
    po_number_ref: 'PO-3381',
    line_items: [
      { sku: 'VAN-6601', description: 'Digital pressure calibrator DPC-9', qty: 1, unit_price: 2450.0 },
      { sku: 'VAN-SVC-CAL', description: 'Calibration and certification', qty: 1, unit_price: 1809.26 },
    ],
    tax: 340.74,
    invoice_date: '2025-04-14',
    expected_total: 4600.0,
    gt_action: 'escalate',
    gt_reason:
      'Everything matches, but they billed us before we received it. Could be a prepay arrangement, could be someone billing early. No rule covers this.',
    difficulty: 'ambiguous',
    layout: 2,
  },
  {
    // The duplicate rule over-triggers here and rejects. Too cautious is still wrong.
    key: 'A15',
    case_no: 15,
    vendor: 'northline',
    invoice_number: 'INV-4478',
    po_number_ref: 'PO-3374',
    line_items: [
      { sku: 'NL-RET', description: 'Monthly LTL retainer \u2014 September', qty: 1, unit_price: 890.0 },
    ],
    tax: 0,
    invoice_date: '2025-09-12',
    expected_total: 890.0,
    gt_action: 'escalate',
    gt_reason:
      'Same vendor, same amount, close together, so the duplicate check fires. But these are two different months of a recurring charge. Could also be a re-bill. Look at it.',
    difficulty: 'ambiguous',
    layout: 3,
  },

  // ---------------- prior invoices (ledger history, not test cases) ----------------
  {
    key: 'P10',
    case_no: null,
    vendor: 'northline',
    invoice_number: 'INV-4402',
    po_number_ref: 'PO-3365',
    line_items: [
      { sku: 'NL-LTL', description: 'LTL freight, lane CHI-ATL', qty: 1, unit_price: 1240.0 },
      { sku: 'NL-FUEL', description: 'Fuel surcharge \u2014 regional', qty: 1, unit_price: 240.0 },
    ],
    tax: 0,
    invoice_date: '2025-04-05',
    expected_total: 1480.0,
    gt_action: 'approve',
    gt_reason: 'Ledger history. Paid 5 April. Seeded so the case 10 duplicate is genuinely discoverable.',
    difficulty: null,
    layout: 1,
  },
  {
    key: 'P15',
    case_no: null,
    vendor: 'northline',
    invoice_number: 'INV-4455',
    po_number_ref: 'PO-3374',
    line_items: [
      { sku: 'NL-RET', description: 'Monthly LTL retainer \u2014 August', qty: 1, unit_price: 890.0 },
    ],
    tax: 0,
    invoice_date: '2025-09-01',
    expected_total: 890.0,
    gt_action: 'approve',
    gt_reason: 'Ledger history. August retainer, billed on the 1st and paid. Seeded so case 15 has something to match.',
    difficulty: null,
    layout: 3,
  },
];

/**
 * Live unit prices. For every vendor except Calderon's pre-revision SKUs these match the open
 * POs. For CAL-1180 and CAL-2240 they match case 7's invoice — the April revision — and deliberately
 * differ from stale PO-2219. That is the whole point of the get_price_list tool.
 */
export const priceListItems: PriceListSeed[] = [
  // Meridian — matches open POs / clean invoices
  { vendor: 'meridian', sku: 'MER-1120', description: 'Corrugated carton 18x12x12', unit_price: 1.85, effective_from: '2025-01-01' },
  { vendor: 'meridian', sku: 'MER-1134', description: 'Stretch wrap 80ga 18in roll', unit_price: 27.0, effective_from: '2025-01-01' },
  { vendor: 'meridian', sku: 'MER-1140', description: 'Poly mailer 10x13, case/500', unit_price: 47.5, effective_from: '2025-01-01' },
  { vendor: 'meridian', sku: 'MER-1145', description: 'Packing tape 48mm, case/36', unit_price: 33.0, effective_from: '2025-01-01' },
  { vendor: 'meridian', sku: 'MER-1150', description: 'Kraft paper roll 36in', unit_price: 14.2, effective_from: '2025-01-01' },
  // Vantage — contracted list; case 6's service line may still sit inside tolerance against the PO
  { vendor: 'vantage', sku: 'VAN-5510', description: 'Nitrile glove, powder-free, box/100', unit_price: 24.19, effective_from: '2025-01-01' },
  { vendor: 'vantage', sku: 'VAN-5522', description: 'Buffer solution pH 7.0, 5L', unit_price: 68.5, effective_from: '2025-01-01' },
  { vendor: 'vantage', sku: 'VAN-SVC-PM', description: 'Analyzer preventive-maintenance visit', unit_price: 1306.19, effective_from: '2025-01-01' },
  { vendor: 'vantage', sku: 'VAN-5540', description: 'HPLC column C18 250mm', unit_price: 985.0, effective_from: '2025-01-01' },
  { vendor: 'vantage', sku: 'VAN-5545', description: 'Acetonitrile, HPLC grade, 4L', unit_price: 53.0, effective_from: '2025-01-01' },
  { vendor: 'vantage', sku: 'VAN-6601', description: 'Digital pressure calibrator DPC-9', unit_price: 2450.0, effective_from: '2025-01-01' },
  { vendor: 'vantage', sku: 'VAN-SVC-CAL', description: 'Calibration and certification', unit_price: 1809.26, effective_from: '2025-01-01' },
  // Orbit
  { vendor: 'orbit', sku: 'ORB-SVC-JAN', description: 'Janitorial service, monthly', unit_price: 4200.0, effective_from: '2025-01-01' },
  { vendor: 'orbit', sku: 'ORB-7702', description: 'Restroom consumables kit', unit_price: 105.0, effective_from: '2025-01-01' },
  { vendor: 'orbit', sku: 'ORB-9020', description: 'Task chair, ergonomic', unit_price: 214.0, effective_from: '2025-01-01' },
  { vendor: 'orbit', sku: 'ORB-9021', description: 'Monitor arm, dual', unit_price: 90.0, effective_from: '2025-01-01' },
  // Calderon — April 1 revision. Case 7 SKUs match the invoice, not PO-2219.
  { vendor: 'calderon', sku: 'CAL-1180', description: 'Steel bar stock 1in x 12ft', unit_price: 46.44, effective_from: '2025-04-01' },
  { vendor: 'calderon', sku: 'CAL-2240', description: 'Tapered roller bearing 32210', unit_price: 46.45, effective_from: '2025-04-01' },
  { vendor: 'calderon', sku: 'CAL-4402', description: 'Hex bolt M12x60 zinc, box/100', unit_price: 22.0, effective_from: '2025-04-01' },
  { vendor: 'calderon', sku: 'CAL-4407', description: 'Lock washer M12, box/500', unit_price: 30.0, effective_from: '2025-04-01' },
  { vendor: 'calderon', sku: 'CAL-6610', description: 'Structural channel C6x8.2, 20ft', unit_price: 182.5, effective_from: '2025-04-01' },
  // Northline
  { vendor: 'northline', sku: 'NL-LTL', description: 'LTL freight', unit_price: 2400.0, effective_from: '2025-01-01' },
  { vendor: 'northline', sku: 'NL-FUEL', description: 'Fuel surcharge \u2014 regional', unit_price: 300.0, effective_from: '2025-01-01' },
  { vendor: 'northline', sku: 'NL-RET', description: 'Monthly LTL retainer', unit_price: 890.0, effective_from: '2025-01-01' },
];

export const money = (n: number) => Math.round(n * 100) / 100;
export const lineTotal = (l: LineItem) => money(l.qty * l.unit_price);
export const sumLines = (items: LineItem[]) => money(items.reduce((s, l) => s + l.qty * l.unit_price, 0));

export function invoiceTotals(inv: InvoiceSeed) {
  const subtotal = sumLines(inv.line_items);
  return { subtotal, tax: money(inv.tax), total: money(subtotal + inv.tax) };
}

export const testCases = invoices.filter((i) => i.difficulty !== null);

/** Every invariant the corpus doc asserts, checked in code so the seed cannot drift. */
export function validateCorpus(): string[] {
  const errors: string[] = [];
  const vendorKeys = new Set(vendors.map((v) => v.key));
  const poByNumber = new Map(purchaseOrders.map((p) => [p.po_number, p]));

  const counts = { clean: 0, exception: 0, ambiguous: 0 };
  for (const inv of testCases) counts[inv.difficulty as keyof typeof counts]++;
  if (counts.clean !== 6 || counts.exception !== 6 || counts.ambiguous !== 3) {
    errors.push(`difficulty distribution must be 6/6/3, got ${counts.clean}/${counts.exception}/${counts.ambiguous}`);
  }

  for (const inv of invoices) {
    const { total } = invoiceTotals(inv);
    if (total !== inv.expected_total) {
      errors.push(`${inv.invoice_number}: computed total ${total} but corpus says ${inv.expected_total}`);
    }
    if (!vendorKeys.has(inv.vendor)) errors.push(`${inv.invoice_number}: unknown vendor ${inv.vendor}`);
    if (inv.difficulty === 'ambiguous' && inv.gt_action !== 'escalate') {
      errors.push(`${inv.invoice_number}: ambiguous cases must have gt_action escalate`);
    }
    if (inv.po_number_ref && !poByNumber.has(inv.po_number_ref)) {
      errors.push(`${inv.invoice_number}: references missing ${inv.po_number_ref}`);
    }
  }

  for (const po of purchaseOrders) {
    const lineSum = sumLines(po.line_items);
    const expected = po.vendor === 'vantage' ? money(lineSum + lineSum * VANTAGE_TAX_RATE) : lineSum;
    if (money(po.total) !== expected) {
      errors.push(`${po.po_number}: total ${po.total} does not equal expected ${expected}`);
    }
    if (!vendorKeys.has(po.vendor)) errors.push(`${po.po_number}: unknown vendor ${po.vendor}`);
  }

  // Tax must be the contracted rate to the cent. Only Vantage bills tax, and only case 11 is
  // allowed to disagree with the rate, because the over-charge is the whole point of that case.
  for (const inv of invoices) {
    const { subtotal, tax } = invoiceTotals(inv);
    if (inv.vendor !== 'vantage') {
      if (tax !== 0) errors.push(`${inv.invoice_number}: only Vantage bills tax, found ${tax}`);
      continue;
    }
    if (inv.case_no === 11) continue;
    const contracted = money(subtotal * VANTAGE_TAX_RATE);
    if (tax !== contracted) {
      errors.push(`${inv.invoice_number}: tax ${tax} is not the contracted 8% of ${subtotal} (${contracted})`);
    }
  }

  // Receipts exist for every PO. Case 9 is the only invoice with no PO at all.
  for (const po of purchaseOrders) {
    if (!receipts.some((r) => r.po_number === po.po_number)) {
      errors.push(`${po.po_number}: no goods receipt seeded`);
    }
  }

  // Only case 14 may be invoiced before its goods were received.
  for (const inv of invoices) {
    if (!inv.po_number_ref) continue;
    const receipt = receipts.find((r) => r.po_number === inv.po_number_ref);
    if (!receipt) continue;
    const invoicedBeforeReceipt = inv.invoice_date < receipt.received_at;
    if (invoicedBeforeReceipt && inv.case_no !== 14) {
      errors.push(`${inv.invoice_number}: invoiced before receipt, only case 14 may do that`);
    }
    if (!invoicedBeforeReceipt && inv.case_no === 14) {
      errors.push('case 14 must be invoiced before its goods receipt');
    }
  }

  // Price list coherence, and the case 7 invariant that pins the whole get_price_list story.
  const listByVendorSku = new Map(priceListItems.map((p) => [`${p.vendor}:${p.sku}`, p]));
  for (const p of priceListItems) {
    if (!vendorKeys.has(p.vendor)) errors.push(`price list: unknown vendor ${p.vendor}`);
  }

  // Case 7: current list matches the invoice and differs from the stale PO; variance under 5%.
  const case7 = invoices.find((i) => i.case_no === 7);
  const stalePo = purchaseOrders.find((p) => p.po_number === 'PO-2219');
  if (!case7 || !stalePo) {
    errors.push('case 7 / PO-2219 missing from corpus');
  } else {
    const variancePct = (case7.expected_total - stalePo.total) / stalePo.total;
    if (!(variancePct > 0 && variancePct < 0.05)) {
      errors.push(
        `case 7 variance must be under 5% and over the stale PO (got ${(variancePct * 100).toFixed(2)}%)`,
      );
    }
    for (const line of case7.line_items) {
      const list = listByVendorSku.get(`${case7.vendor}:${line.sku}`);
      if (!list) {
        errors.push(`case 7: no current list price for ${line.sku}`);
        continue;
      }
      if (list.unit_price !== line.unit_price) {
        errors.push(
          `case 7: list price for ${line.sku} is ${list.unit_price} but invoice bills ${line.unit_price} — they must match`,
        );
      }
      const poLine = stalePo.line_items.find((l) => l.sku === line.sku);
      if (!poLine) {
        errors.push(`case 7: stale PO-2219 has no line for ${line.sku}`);
      } else if (poLine.unit_price === line.unit_price) {
        errors.push(
          `case 7: invoice ${line.sku} at ${line.unit_price} must differ from the stale PO price (got the same)`,
        );
      }
    }
  }

  // Case 6 bills a within-tolerance service-line bump. The live list must match the invoice
  // on that SKU, or get_price_list turns a clean approve into an escalation.
  const case6 = invoices.find((i) => i.case_no === 6);
  if (case6) {
    for (const line of case6.line_items) {
      const list = listByVendorSku.get(`${case6.vendor}:${line.sku}`);
      if (!list || list.unit_price !== line.unit_price) {
        errors.push(
          `case 6: list price for ${line.sku} must equal the invoice unit price ${line.unit_price} (got ${list?.unit_price ?? 'missing'})`,
        );
      }
    }
  }

  return errors;
}
