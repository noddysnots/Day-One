import type { Action, CaseResult, Scorecard, TraceStep } from './rows';
import { docSrc } from './format';

/** What the live run screen polls for. Deliberately small: no line items, no ground-truth prose. */
export type WireCase = {
  id: string;
  caseNo: number | null;
  vendor: string;
  invoiceNumber: string;
  total: number;
  doc: string;
  action: Action | null;
  confidence: number | null;
  rationale: string | null;
  correct: boolean | null;
  failureMode: string | null;
  steps: number;
  gt: Action;
};

export type RunState = {
  finished: boolean;
  scorecard: Scorecard;
  cases: WireCase[];
  /** Steps for the one case the screen is showing, or an empty tape when none is selected. */
  traceFor: string | null;
  trace: TraceStep[];
};

/** Follow whichever case is doing the most work. Server and client must agree on this. */
export function autoPick(cases: WireCase[]): string | null {
  const working = cases.filter((c) => !c.action && c.steps > 0);
  if (working.length) return working.reduce((a, b) => (b.steps > a.steps ? b : a)).id;
  const started = cases.filter((c) => c.steps > 0);
  return started.at(-1)?.id ?? cases[0]?.id ?? null;
}

export function toWire(c: CaseResult): WireCase {
  return {
    id: c.id,
    caseNo: c.invoice.case_no,
    vendor: c.invoice.vendor_name,
    invoiceNumber: c.invoice.invoice_number,
    total: c.invoice.total,
    doc: docSrc({ doc_url: c.invoice.doc_url, invoice_number: c.invoice.invoice_number }),
    action: c.action,
    confidence: c.confidence,
    rationale: c.rationale,
    correct: c.correct,
    failureMode: c.failure_mode,
    steps: c.steps,
    gt: c.invoice.gt_action,
  };
}
