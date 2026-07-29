/**
 * Proves a folded tool result never displays an identifier the record does not contain.
 *
 * Two halves. The fixtures need nothing but lib/trace, and carry the four strings that were
 * actually on file when this was written — case 7's escalate reason folded to "PO-221" against a
 * record reading "PO-2219". The scan then reads every tool_result persisted and re-folds it, so a
 * tape that regresses is caught against real payloads rather than against remembered ones.
 *
 * Usage: npx tsx scripts/check-summaries.ts        (fixtures, then the scan if DATABASE creds exist)
 *        npx tsx scripts/check-summaries.ts --fixtures-only
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { clip, stepResult, summarise } from '../lib/trace';
import type { TraceStep } from '../lib/rows';

/** Identifier-shaped tokens the corpus uses: PO-3301, INV-4460, R-07. */
const TOKEN = /\b([A-Z]{1,4}-\d+)/g;

/**
 * Every token the summary shows that is a strict prefix of a longer token in the record. This is
 * the failure that matters: not a shortened line, but a line asserting a number nothing holds.
 */
function phantoms(summary: string, record: string): { shown: string; actual: string }[] {
  const out: { shown: string; actual: string }[] = [];
  for (const m of summary.matchAll(TOKEN)) {
    // A marked elision cannot be misread as complete, so it is not a phantom.
    if (summary[m.index + m[1].length] === '…') continue;
    const longer = new RegExp(`\\b${m[1]}\\d+`).exec(record);
    if (longer) out.push({ shown: m[1], actual: longer[0] });
  }
  return out;
}

/** The four real payload shapes that were folding to phantom identifiers, plus the edge cases. */
const FIXTURES: { label: string; value: unknown }[] = [
  {
    label: 'case 7 escalate (the reported defect)',
    value: {
      recorded: true,
      reason: 'Invoice INV-8841 references stale PO-2219, cut 2025-03-14 before the April revision.',
      route_to: 'Priya Raghunathan',
      confidence: 0.95,
    },
  },
  {
    label: 'case 4 decide',
    value: {
      recorded: true,
      action: 'approve',
      confidence: 1,
      rationale: 'R-01: The invoice, purchase order (PO-3290) and goods receipt agree exactly.',
    },
  },
  {
    label: 'case 3 decide',
    value: { recorded: true, action: 'approve', confidence: 1, rationale: 'R-01: The invoice, purchase order (PO-3325) and receipt agree.' },
  },
  {
    label: 'case 1 decide',
    value: { recorded: true, action: 'approve', confidence: 1, rationale: 'R-01: The invoice, purchase order (PO-3301) and receipt agree.' },
  },
  { label: 'short value untouched', value: { po_number: 'PO-3301', status: 'open', total: 2340 } },
  { label: 'not found', value: { found: false, po_number: 'PO-9999' } },
  { label: 'unbroken token longer than the budget', value: { doc_url: 'https://example.supabase.co/storage/v1/object/public/invoices/INV-2244.jpg' } },
];

let failures = 0;

console.log('fixtures');
for (const { label, value } of FIXTURES) {
  const summary = summarise(value);
  const found = phantoms(summary, JSON.stringify(value));
  if (found.length) failures++;
  console.log(`  ${found.length ? 'FAIL' : 'PASS'}  ${label}`);
  console.log(`        ${summary}`);
  for (const p of found) console.log(`        shows "${p.shown}" but the record says "${p.actual}"`);
}

// A shortened line still has to say it was shortened.
const marked = clip('Invoice INV-8841 references stale PO-2219, cut 2025-03-14 before the revision.');
if (!marked.endsWith('…')) {
  failures++;
  console.log(`  FAIL  a clipped value is not marked as clipped: ${marked}`);
} else {
  console.log(`  PASS  a clipped value is marked: ${marked}`);
}
if (clip('short enough') !== 'short enough') {
  failures++;
  console.log('  FAIL  a value inside the budget was altered');
} else {
  console.log('  PASS  a value inside the budget is passed through untouched');
}

async function scan() {
  const { db } = await import('../lib/supabase');
  const { data: steps, error } = await db
    .from('trace_steps')
    .select('id, seq, kind, tool_name, payload, rule_id, created_at, case_result_id')
    .eq('kind', 'tool_result')
    .order('id');
  if (error) throw new Error(`trace_steps: ${error.message}`);

  console.log(`\nscan: ${steps?.length ?? 0} tool_result steps on file`);
  let bad = 0;
  for (const s of steps ?? []) {
    const result = stepResult(s as unknown as TraceStep);
    const found = phantoms(summarise(result), JSON.stringify(result));
    for (const p of found) {
      bad++;
      console.log(`  FAIL  step ${s.id} (${s.tool_name}) shows "${p.shown}" but the record says "${p.actual}"`);
    }
  }
  if (bad) failures += bad;
  else console.log('  PASS  every folded result on file agrees with its record');
}

async function main() {
  if (!process.argv.includes('--fixtures-only')) await scan();
  console.log(failures ? `\n${failures} phantom identifier(s).` : '\nNo folded result displays an identifier its record does not hold.');
  // exitCode rather than exit(): node 24 on Windows trips a libuv teardown assertion when the
  // process is torn down from inside an async frame, which would turn a pass into a crash code.
  process.exitCode = failures ? 1 : 0;
}

void main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
