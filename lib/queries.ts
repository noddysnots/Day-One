import { ContractSpec } from './contract-schema';
import type { CaseResult, Contract, GoodsReceipt, Invoice, PurchaseOrder, Run, TraceStep, Vendor } from './rows';
import { maybeNum, num } from './rows';
import { tryDb } from './supabase';
import { z } from 'zod';

const INVOICE_COLS =
  'id, invoice_number, po_number_ref, line_items, subtotal, tax, total, invoice_date, doc_url, gt_action, gt_reason, difficulty, case_no, vendors(name)';

type RawInvoice = Record<string, unknown> & { vendors?: { name?: string } | null };

function toInvoice(row: RawInvoice): Invoice {
  return {
    id: String(row.id),
    vendor_name: row.vendors?.name ?? 'Unknown vendor',
    invoice_number: String(row.invoice_number),
    po_number_ref: (row.po_number_ref as string | null) ?? null,
    line_items: (row.line_items as Invoice['line_items']) ?? [],
    subtotal: maybeNum(row.subtotal),
    tax: maybeNum(row.tax),
    total: num(row.total),
    invoice_date: (row.invoice_date as string | null) ?? null,
    doc_url: (row.doc_url as string | null) ?? null,
    gt_action: row.gt_action as Invoice['gt_action'],
    gt_reason: String(row.gt_reason ?? ''),
    difficulty: (row.difficulty as Invoice['difficulty']) ?? null,
    case_no: (row.case_no as number | null) ?? null,
  };
}

function toContract(row: Record<string, unknown>): Contract {
  const parsed = ContractSpec.safeParse(row.spec);
  return {
    id: String(row.id),
    name: String(row.name ?? 'Rulebook'),
    version: Number(row.version ?? 1),
    transcript: (row.transcript as string | null) ?? null,
    parent_id: (row.parent_id as string | null) ?? null,
    created_at: (row.created_at as string | null) ?? null,
    spec: parsed.success ? parsed.data : null,
    specError: parsed.success ? null : z.prettifyError(parsed.error),
  };
}

/** Has supabase/schema.sql actually been run against this project? Checked only on empty paths. */
export async function schemaReady(): Promise<boolean> {
  const db = tryDb();
  if (!db) return false;
  // A real GET: a HEAD against a missing table comes back clean, so it proves nothing.
  const { error } = await db.from('contracts').select('id').limit(1);
  return !error;
}

export async function latestContract(): Promise<Contract | null> {
  const db = tryDb();
  if (!db) return null;
  const { data } = await db.from('contracts').select('*').order('created_at', { ascending: false }).limit(1);
  return data?.[0] ? toContract(data[0]) : null;
}

/**
 * The pair the story walkthrough needs. Prefers the newest root that has a *finished* driving
 * test — an OPEN run on a newer compile must not blank the walkthrough after the splash.
 * Amended is the newest child of that root that also has a finished run (score-scene optional).
 */
export async function storyContracts(): Promise<{ root: Contract | null; amended: Contract | null }> {
  const db = tryDb();
  if (!db) return { root: null, amended: null };
  const { data } = await db.from('contracts').select('*').order('created_at', { ascending: false });
  if (!data?.length) return { root: null, amended: null };
  const rows = data.map(toContract);
  const roots = rows.filter((c) => !c.parent_id);

  for (const root of roots) {
    const finished = await latestFinishedRunFor(root.id);
    if (!finished) continue;
    const children = rows.filter((c) => c.parent_id === root.id);
    let amended: Contract | null = null;
    for (const child of children) {
      if (await latestFinishedRunFor(child.id)) {
        amended = child;
        break;
      }
    }
    return { root, amended };
  }

  return { root: null, amended: null };
}

export async function getContract(id: string): Promise<Contract | null> {
  const db = tryDb();
  if (!db) return null;
  const { data } = await db.from('contracts').select('*').eq('id', id).maybeSingle();
  return data ? toContract(data) : null;
}

/** The newest run against a contract, used both for "already tested" links and for the diff. */
export async function latestRunFor(contractId: string): Promise<Run | null> {
  const db = tryDb();
  if (!db) return null;
  const { data } = await db
    .from('runs')
    .select('id, contract_id, started_at, finished_at')
    .eq('contract_id', contractId)
    .order('started_at', { ascending: false })
    .limit(1);
  return (data?.[0] as Run | undefined) ?? null;
}

/** Newest completed run — what the walkthrough and score scenes actually need. */
export async function latestFinishedRunFor(contractId: string): Promise<Run | null> {
  const db = tryDb();
  if (!db) return null;
  const { data } = await db
    .from('runs')
    .select('id, contract_id, started_at, finished_at')
    .eq('contract_id', contractId)
    .not('finished_at', 'is', null)
    .order('finished_at', { ascending: false })
    .limit(1);
  return (data?.[0] as Run | undefined) ?? null;
}

export async function getRun(id: string): Promise<Run | null> {
  const db = tryDb();
  if (!db) return null;
  const { data } = await db.from('runs').select('id, contract_id, started_at, finished_at').eq('id', id).maybeSingle();
  return (data as Run | null) ?? null;
}

/** Case results plus a step count per case. Two cheap queries; no payloads travel. */
export async function getCases(runId: string): Promise<CaseResult[]> {
  const db = tryDb();
  if (!db) return [];
  const { data } = await db
    .from('case_results')
    .select(`id, action, confidence, rationale, correct, failure_mode, invoices(${INVOICE_COLS})`)
    .eq('run_id', runId);
  if (!data?.length) return [];

  const ids = data.map((r) => String(r.id));
  const { data: steps } = await db.from('trace_steps').select('case_result_id').in('case_result_id', ids);
  const counts = new Map<string, number>();
  for (const s of steps ?? []) {
    const k = String(s.case_result_id);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  return data
    .map((row) => ({
      id: String(row.id),
      invoice: toInvoice((row.invoices ?? {}) as unknown as RawInvoice),
      action: (row.action as CaseResult['action']) ?? null,
      confidence: maybeNum(row.confidence),
      rationale: (row.rationale as string | null) ?? null,
      correct: (row.correct as boolean | null) ?? null,
      failure_mode: (row.failure_mode as string | null) ?? null,
      steps: counts.get(String(row.id)) ?? 0,
    }))
    .sort((a, b) => (a.invoice.case_no ?? 99) - (b.invoice.case_no ?? 99));
}

/** How many cases the paper has, so the scorecard reads "3 of 15" from the first row onward. */
export async function testCaseCount(): Promise<number> {
  const db = tryDb();
  if (!db) return 0;
  const { count } = await db.from('invoices').select('id', { count: 'exact' }).not('difficulty', 'is', null);
  return count ?? 0;
}

export async function getTrace(caseResultId: string): Promise<TraceStep[]> {
  const db = tryDb();
  if (!db) return [];
  const { data } = await db
    .from('trace_steps')
    .select('id, seq, kind, tool_name, payload, rule_id, created_at')
    .eq('case_result_id', caseResultId)
    .order('seq', { ascending: true });
  return (data as TraceStep[] | null) ?? [];
}

export async function getCase(runId: string, caseResultId: string): Promise<CaseResult | null> {
  const db = tryDb();
  if (!db) return null;
  const { data } = await db
    .from('case_results')
    .select(`id, action, confidence, rationale, correct, failure_mode, invoices(${INVOICE_COLS})`)
    .eq('run_id', runId)
    .eq('id', caseResultId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: String(data.id),
    invoice: toInvoice((data.invoices ?? {}) as unknown as RawInvoice),
    action: (data.action as CaseResult['action']) ?? null,
    confidence: maybeNum(data.confidence),
    rationale: (data.rationale as string | null) ?? null,
    correct: (data.correct as boolean | null) ?? null,
    failure_mode: (data.failure_mode as string | null) ?? null,
    steps: 0,
  };
}

/** The records the agent pulled, shown alongside the tape on the case page. */
export async function getMatchRecords(
  poNumber: string | null,
): Promise<{ po: PurchaseOrder | null; receipt: GoodsReceipt | null }> {
  const db = tryDb();
  if (!db || !poNumber) return { po: null, receipt: null };
  const [poRes, grRes] = await Promise.all([
    db.from('purchase_orders').select('po_number, line_items, total, currency, status, po_date').eq('po_number', poNumber).maybeSingle(),
    db.from('goods_receipts').select('po_number, received_lines, received_at').eq('po_number', poNumber).maybeSingle(),
  ]);
  const po = poRes.data ? ({ ...poRes.data, total: num(poRes.data.total) } as PurchaseOrder) : null;
  return { po, receipt: (grRes.data as GoodsReceipt | null) ?? null };
}

export async function getVendorByName(name: string): Promise<Vendor | null> {
  const db = tryDb();
  if (!db) return null;
  const { data } = await db
    .from('vendors')
    .select('id, name, payment_terms, tolerance_pct, contract_notes, risk_flags')
    .eq('name', name)
    .maybeSingle();
  return data ? ({ ...data, tolerance_pct: maybeNum(data.tolerance_pct) } as Vendor) : null;
}
