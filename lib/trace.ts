import { RULE_ID } from './format';
import type { Action, TraceStep } from './rows';

/**
 * The agent runtime owns the payload shape; the tape only has to survive it. Everything here
 * reads defensively, so an unfamiliar step renders as a monospace row rather than a blank.
 */

/**
 * The rule the agent cited, and only if the contract has that clause. A badge is a promise that
 * the reader can follow it to a clause, so an id scraped out of text that names no real rule has
 * to resolve to no badge at all.
 */
export function citedRule(text: string | undefined | null, clauses: Set<string>): string | null {
  for (const m of text?.matchAll(RULE_ID) ?? []) if (clauses.has(m[1])) return m[1];
  return null;
}

/** A parameter line: `route_to`: "Priya Raghunathan", or  action: "escalate". */
const PARAM_LINE = /^\s*[`'"]?[a-z][a-z0-9_]*[`'"]?\s*:\s*\S/;

/**
 * Whether a text part is the agent's account of its reasoning, or the model working out loud
 * towards the call it is about to make. Only the first belongs on the tape — the second is
 * already recorded, properly, by the tool_call step a moment later, so nothing is lost by
 * leaving it off. To earn a place it has to read as prose: open at the start of a sentence,
 * close at the end of one, and not be a list of arguments.
 */
export function readsAsReasoning(text: string): boolean {
  if (!/^[("']?[A-Za-z]/.test(text)) return false;
  if (!/[.!?]["')`]?$/.test(text)) return false;
  return text.split('\n').filter((line) => PARAM_LINE.test(line)).length < 2;
}

const asObject = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

export function stepArgs(step: TraceStep): unknown {
  const p = asObject(step.payload);
  if (!p) return step.payload;
  return p.args ?? p.arguments ?? p.input ?? p;
}

export function stepResult(step: TraceStep): unknown {
  const p = asObject(step.payload);
  if (!p) return step.payload;
  return p.result ?? p.output ?? p.response ?? p;
}

export function stepText(step: TraceStep): string {
  if (typeof step.payload === 'string') return step.payload;
  const p = asObject(step.payload);
  const value = p?.text ?? p?.thought ?? p?.message ?? p?.content ?? p?.reasoning;
  return typeof value === 'string' ? value : JSON.stringify(step.payload ?? '');
}

export type Terminal = { action: Action; confidence: number | null; rationale: string; routeTo: string | null };

export function stepTerminal(step: TraceStep): Terminal | null {
  const p = asObject(step.payload) ?? {};
  const inner = asObject(p.result) ?? asObject(p.decision) ?? p;
  const action = (inner.action ?? p.action ?? (step.tool_name === 'escalate' ? 'escalate' : null)) as Action | null;
  if (action !== 'approve' && action !== 'reject' && action !== 'escalate') return null;
  const rationale = inner.rationale ?? inner.reason ?? p.rationale ?? p.reason;
  const confidence = inner.confidence ?? p.confidence;
  return {
    action,
    confidence: confidence === undefined || confidence === null ? null : Number(confidence),
    rationale: typeof rationale === 'string' ? rationale : '',
    routeTo: typeof inner.route_to === 'string' ? inner.route_to : null,
  };
}

export const STAMP: Record<Action, string> = { approve: 'approved', reject: 'rejected', escalate: 'escalated' };

const BUDGET = 40;

/**
 * Fold one value onto a line without inventing a shorter identifier than the record holds.
 *
 * A hard slice at the budget renders "PO-221" out of "PO-2219" — a purchase order that does not
 * exist — and the tape is the record rather than a log, so that is a wrong row and not an untidy
 * one. Cut at the last space inside the budget when there is one, so a token is dropped whole
 * instead of halved, and always mark the cut: an elided value has to be legible as elided, or the
 * reader takes what is left for the whole of it.
 */
export function clip(text: string, budget = BUDGET): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= budget) return flat;

  const cut = flat.slice(0, budget);
  const boundary = cut.lastIndexOf(' ');
  // A boundary in the first half would fold the value away to nothing worth reading; below that,
  // keep the character cut and let the ellipsis carry the whole warning.
  const kept = boundary >= budget / 2 ? cut.slice(0, boundary) : cut;
  return `${kept.replace(/[\s,;:.\-–—([{]+$/, '')}…`;
}

const brief = (v: unknown): string => {
  if (v === null || v === undefined) return '—';
  if (Array.isArray(v)) return `${v.length}`;
  if (typeof v === 'object') return '{…}';
  return clip(String(v));
};

/** A tool result folded down to one line. The full record is a keystroke away underneath. */
export function summarise(value: unknown): string {
  if (value === null || value === undefined) return 'nothing came back';
  if (typeof value !== 'object') return String(value);
  if (Array.isArray(value)) return `${value.length} rows`;
  const o = value as Record<string, unknown>;
  if (o.found === false) return 'not found';
  if (Array.isArray(o.matches)) return `${o.matches.length} similar invoice${o.matches.length === 1 ? '' : 's'}`;
  if (Array.isArray(o.items)) return `${o.items.length} list price${o.items.length === 1 ? '' : 's'}`;
  const skip = new Set(['found', 'line_items', 'received_lines', 'items', 'id', 'vendor_id']);
  const parts = Object.entries(o)
    .filter(([k]) => !skip.has(k))
    .slice(0, 4)
    .map(([k, v]) => `${k} ${brief(v)}`);
  return parts.length ? parts.join('   ') : 'ok';
}

export const pretty = (value: unknown) => JSON.stringify(value, null, 2);

/** Compact one-line argument list: po_number "PO-3301". */
export function inlineArgs(value: unknown): string {
  const o = asObject(value);
  if (!o) return value === undefined ? '' : String(value);
  return Object.entries(o)
    .map(([k, v]) => `${k} ${typeof v === 'string' ? JSON.stringify(v) : brief(v)}`)
    .join('  ');
}
