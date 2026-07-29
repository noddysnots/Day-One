/**
 * Read-side shapes for the screens. These mirror supabase/schema.sql exactly; the client is
 * created without generated types, so every query is cast through the types here and money is
 * coerced out of Postgres numeric (which arrives as a string) before it reaches a component.
 */

export type Action = 'approve' | 'reject' | 'escalate';

export type LineItem = { sku: string; description: string; qty: number; unit_price: number };

export type Vendor = {
  id: string;
  name: string;
  payment_terms: string | null;
  tolerance_pct: number | null;
  contract_notes: string | null;
  risk_flags: string[] | null;
};

export type PurchaseOrder = {
  po_number: string;
  line_items: LineItem[];
  total: number;
  currency: string | null;
  status: string | null;
  po_date: string | null;
};

export type GoodsReceipt = {
  po_number: string;
  received_lines: { sku: string; qty_received: number }[];
  received_at: string | null;
};

export type Invoice = {
  id: string;
  vendor_name: string;
  invoice_number: string;
  po_number_ref: string | null;
  line_items: LineItem[];
  subtotal: number | null;
  tax: number | null;
  total: number;
  invoice_date: string | null;
  doc_url: string | null;
  gt_action: Action;
  gt_reason: string;
  difficulty: 'clean' | 'exception' | 'ambiguous' | null;
  case_no: number | null;
};

export type Contract = {
  id: string;
  name: string;
  version: number;
  transcript: string | null;
  parent_id: string | null;
  created_at: string | null;
  /** Validated against ContractSpec on read; null when the stored spec does not parse. */
  spec: import('./contract-schema').ContractSpec | null;
  specError: string | null;
};

export type Run = {
  id: string;
  contract_id: string | null;
  started_at: string | null;
  finished_at: string | null;
};

export type CaseResult = {
  id: string;
  invoice: Invoice;
  action: Action | null;
  confidence: number | null;
  rationale: string | null;
  correct: boolean | null;
  failure_mode: string | null;
  /** How many trace steps have landed. Drives pending / working / decided in the case list. */
  steps: number;
};

/**
 * Trace kinds the agent runtime is expected to write. Anything else renders as a generic
 * monospace row with its payload collapsed, so an unrecognised kind never blanks the tape.
 */
export type TraceKind = 'thought' | 'tool_call' | 'tool_result' | 'decision' | (string & {});

export type TraceStep = {
  id: number;
  seq: number;
  kind: TraceKind;
  tool_name: string | null;
  payload: unknown;
  rule_id: string | null;
  created_at: string | null;
};

export type Scorecard = {
  total: number;
  decided: number;
  correct: number;
  /** Share of decided cases the agent closed without sending them up. */
  touchless: number;
  accuracy: number;
  /** Escalated something the contract could in fact settle. Costs a human ten minutes. */
  over: number;
  /** Decided something that needed a human. This is the one that loses money. */
  under: number;
};

/** Result of filing an amendment. Null error means the action redirected instead of returning. */
export type AmendState = { error: string | null };

export const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0));
export const maybeNum = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
