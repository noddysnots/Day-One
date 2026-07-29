import { Type, type FunctionDeclaration } from '@google/genai';
import { z } from 'zod';
import { db } from './supabase';

/** Postgres numeric can arrive as a string. Never compare money as a string. */
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const money = (n: number) => Math.round(n * 100) / 100;

export type ToolContext = {
  /** The invoice under review. Anchors the date window for find_similar_invoices. */
  invoiceId: string;
};

export type TerminalDecision = {
  action: 'approve' | 'reject' | 'escalate';
  confidence: number;
  rationale: string;
  route_to?: string;
};

const Args = {
  get_invoice: z.object({ invoice_id: z.string() }),
  lookup_po: z.object({ po_number: z.string() }),
  get_goods_receipt: z.object({ po_number: z.string() }),
  get_vendor_terms: z.object({ vendor_id: z.string() }),
  get_price_list: z.object({ vendor_id: z.string() }),
  find_similar_invoices: z.object({ vendor_id: z.string(), amount: z.number(), days: z.number() }),
  decide: z.object({
    action: z.enum(['approve', 'reject', 'escalate']),
    confidence: z.number().min(0).max(1),
    rationale: z.string(),
  }),
  escalate: z.object({ reason: z.string(), route_to: z.string(), confidence: z.number().min(0).max(1) }),
};

export const TERMINAL_TOOLS = ['decide', 'escalate'] as const;
export const TOOL_NAMES = Object.keys(Args) as (keyof typeof Args)[];

/** Query tools the contract may grant. Terminals are always available. */
export const QUERY_TOOLS = [
  'get_invoice',
  'lookup_po',
  'get_goods_receipt',
  'get_vendor_terms',
  'get_price_list',
  'find_similar_invoices',
] as const;

export const functionDeclarations: FunctionDeclaration[] = [
  {
    name: 'get_invoice',
    description: 'Fetch the full invoice record under review, including every line item and the stated tax.',
    parameters: {
      type: Type.OBJECT,
      properties: { invoice_id: { type: Type.STRING, description: 'The invoice id given to you in the case brief.' } },
      required: ['invoice_id'],
    },
  },
  {
    name: 'lookup_po',
    description: 'Look up a purchase order by number. Returns {found:false} when no such PO exists.',
    parameters: {
      type: Type.OBJECT,
      properties: { po_number: { type: Type.STRING, description: 'Purchase order number, e.g. PO-3301.' } },
      required: ['po_number'],
    },
  },
  {
    name: 'get_goods_receipt',
    description:
      'Fetch the goods receipt for a purchase order: which SKUs were received, how many, and on what date. Returns {found:false} when nothing was ever received against it.',
    parameters: {
      type: Type.OBJECT,
      properties: { po_number: { type: Type.STRING } },
      required: ['po_number'],
    },
  },
  {
    name: 'get_vendor_terms',
    description:
      'Fetch a vendor master record: payment terms, contractual price tolerance, free-text contract notes and risk flags. The contract notes routinely contain vendor-specific carve-outs that override the general rules.',
    parameters: {
      type: Type.OBJECT,
      properties: { vendor_id: { type: Type.STRING } },
      required: ['vendor_id'],
    },
  },
  {
    name: 'get_price_list',
    description:
      'Fetch the vendor\'s current (live) unit price list: SKU, description, unit price and the date each price took effect. Use this when a rule requires billed unit prices to match the current list — especially stale-PO cases where the PO carries pre-revision prices.',
    parameters: {
      type: Type.OBJECT,
      properties: { vendor_id: { type: Type.STRING } },
      required: ['vendor_id'],
    },
  },
  {
    name: 'find_similar_invoices',
    description:
      'Search the ledger for other invoices from the same vendor with a similar total inside a window of days around the invoice under review. Use this to test for duplicates and re-bills.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        vendor_id: { type: Type.STRING },
        amount: { type: Type.NUMBER, description: 'Amount to match against, normally the invoice total.' },
        days: { type: Type.NUMBER, description: 'Half-width of the date window in days, e.g. 14.' },
      },
      required: ['vendor_id', 'amount', 'days'],
    },
  },
  {
    name: 'decide',
    description:
      'Terminal. Record your decision on this invoice. Only call this when you can justify the action against a specific rule.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: { type: Type.STRING, enum: ['approve', 'reject', 'escalate'] },
        confidence: { type: Type.NUMBER, description: 'Between 0 and 1.' },
        rationale: { type: Type.STRING, description: 'Cite the rule ids that drove this.' },
      },
      required: ['action', 'confidence', 'rationale'],
    },
  },
  {
    name: 'escalate',
    description:
      'Terminal. Hand the invoice to a human because the contract does not settle it. Escalating a case the contract cannot decide is correct behaviour, not failure.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        reason: { type: Type.STRING },
        route_to: { type: Type.STRING },
        confidence: { type: Type.NUMBER },
      },
      required: ['reason', 'route_to', 'confidence'],
    },
  },
];

async function getInvoice(invoice_id: string) {
  const { data, error } = await db
    .from('invoices')
    .select('id, vendor_id, invoice_number, po_number_ref, line_items, subtotal, tax, total, invoice_date, doc_url')
    .eq('id', invoice_id)
    .maybeSingle();
  if (error) throw new Error(`get_invoice failed: ${error.message}`);
  if (!data) return { found: false as const, invoice_id };
  return {
    found: true as const,
    ...data,
    subtotal: num(data.subtotal),
    tax: num(data.tax),
    total: num(data.total),
  };
}

async function lookupPo(po_number: string) {
  const { data, error } = await db
    .from('purchase_orders')
    .select('po_number, vendor_id, line_items, total, currency, status, po_date')
    .eq('po_number', po_number)
    .maybeSingle();
  if (error) throw new Error(`lookup_po failed: ${error.message}`);
  if (!data) return { found: false as const, po_number };
  const line_items_subtotal = money(
    (data.line_items as { qty: number; unit_price: number }[]).reduce((s, l) => s + l.qty * l.unit_price, 0),
  );
  return { found: true as const, ...data, total: num(data.total), line_items_subtotal };
}

async function getGoodsReceipt(po_number: string) {
  const { data, error } = await db
    .from('goods_receipts')
    .select('po_number, received_lines, received_at')
    .eq('po_number', po_number)
    .maybeSingle();
  if (error) throw new Error(`get_goods_receipt failed: ${error.message}`);
  if (!data) return { found: false as const, po_number };
  return { found: true as const, ...data };
}

async function getVendorTerms(vendor_id: string) {
  const { data, error } = await db
    .from('vendors')
    .select('id, name, payment_terms, tolerance_pct, contract_notes, risk_flags')
    .eq('id', vendor_id)
    .maybeSingle();
  if (error) throw new Error(`get_vendor_terms failed: ${error.message}`);
  if (!data) return { found: false as const, vendor_id };
  return { found: true as const, ...data, tolerance_pct: num(data.tolerance_pct) };
}

async function getPriceList(vendor_id: string) {
  const { data, error } = await db
    .from('price_list_items')
    .select('sku, description, unit_price, effective_from')
    .eq('vendor_id', vendor_id)
    .order('sku');
  if (error) throw new Error(`get_price_list failed: ${error.message}`);
  if (!data?.length) return { found: false as const, vendor_id, items: [] as const };
  return {
    found: true as const,
    vendor_id,
    items: data.map((r) => ({
      sku: r.sku as string,
      description: r.description as string | null,
      unit_price: num(r.unit_price),
      effective_from: r.effective_from as string,
    })),
  };
}

/**
 * Real query: same vendor, total within 2% of the amount asked about, invoice_date inside a
 * window of `days` either side of the invoice under review, excluding the invoice itself.
 */
async function findSimilarInvoices(args: z.infer<typeof Args.find_similar_invoices>, ctx: ToolContext) {
  const anchor = await db.from('invoices').select('invoice_date').eq('id', ctx.invoiceId).maybeSingle();
  if (anchor.error) throw new Error(`find_similar_invoices failed: ${anchor.error.message}`);
  const anchorDate = anchor.data?.invoice_date as string | undefined;
  if (!anchorDate) return { found: false as const, matches: [] };

  const shift = (days: number) => {
    const d = new Date(anchorDate + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const band = Math.max(0.5, money(Math.abs(args.amount) * 0.02));

  const { data, error } = await db
    .from('invoices')
    .select('id, invoice_number, po_number_ref, total, invoice_date, line_items')
    .eq('vendor_id', args.vendor_id)
    .neq('id', ctx.invoiceId)
    .gte('total', money(args.amount - band))
    .lte('total', money(args.amount + band))
    .gte('invoice_date', shift(-Math.abs(args.days)))
    .lte('invoice_date', shift(Math.abs(args.days)))
    .order('invoice_date', { ascending: true });
  if (error) throw new Error(`find_similar_invoices failed: ${error.message}`);

  const matches = (data ?? []).map((r) => {
    const days_apart = Math.round(
      (Date.parse(anchorDate + 'T00:00:00Z') - Date.parse((r.invoice_date as string) + 'T00:00:00Z')) / 86_400_000,
    );
    return {
      invoice_number: r.invoice_number,
      po_number_ref: r.po_number_ref,
      total: num(r.total),
      invoice_date: r.invoice_date,
      days_apart,
      already_on_file: days_apart > 0,
      line_items: r.line_items,
    };
  });

  return { found: matches.length > 0, amount_band: band, window_days: Math.abs(args.days), matches };
}

export type ToolOutcome = { result: unknown; terminal?: TerminalDecision };

export async function executeTool(name: string, rawArgs: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  const schema = Args[name as keyof typeof Args];
  if (!schema) return { result: { error: `no such tool: ${name}` } };

  const parsed = schema.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    return { result: { error: 'invalid arguments', detail: z.prettifyError(parsed.error) } };
  }

  switch (name) {
    case 'get_invoice':
      return { result: await getInvoice((parsed.data as z.infer<typeof Args.get_invoice>).invoice_id) };
    case 'lookup_po':
      return { result: await lookupPo((parsed.data as z.infer<typeof Args.lookup_po>).po_number) };
    case 'get_goods_receipt':
      return { result: await getGoodsReceipt((parsed.data as z.infer<typeof Args.get_goods_receipt>).po_number) };
    case 'get_vendor_terms':
      return { result: await getVendorTerms((parsed.data as z.infer<typeof Args.get_vendor_terms>).vendor_id) };
    case 'get_price_list':
      return { result: await getPriceList((parsed.data as z.infer<typeof Args.get_price_list>).vendor_id) };
    case 'find_similar_invoices':
      return {
        result: await findSimilarInvoices(parsed.data as z.infer<typeof Args.find_similar_invoices>, ctx),
      };
    case 'decide': {
      const d = parsed.data as z.infer<typeof Args.decide>;
      return { result: { recorded: true, ...d }, terminal: d };
    }
    case 'escalate': {
      const e = parsed.data as z.infer<typeof Args.escalate>;
      return {
        result: { recorded: true, ...e },
        terminal: { action: 'escalate', confidence: e.confidence, rationale: e.reason, route_to: e.route_to },
      };
    }
    default:
      return { result: { error: `no such tool: ${name}` } };
  }
}
