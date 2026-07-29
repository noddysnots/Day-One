/**
 * Headless version of the live amendment: cancelled-PO open question answered + advance-billing
 * clause (former pocket Clause A) on a parent contract, filed as version parent+1. No browser.
 *
 * Freight is not in this set — on the measured compile it already escalates at v1, and that is
 * the product working (judgment before any human edit), not a gap to patch on camera.
 *
 * Usage: npx tsx scripts/amend-v2.ts <parentContractId>
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import type { ContractSpec, Rule } from '../lib/contract-schema';

const CANCELLED = {
  when: 'The invoice references a purchase order whose status is cancelled',
  detail:
    'A cancelled purchase order is not a live commitment, so there is nothing to three-way match against and ' +
    'nothing to pay. Reject and ask the vendor to re-raise against a live PO. This settles the open question ' +
    'and replaces the CANCELLED_PO default of escalate in the exception schedule.',
};

const ADVANCE = {
  when: 'The invoice is dated before the goods receipt for the purchase order it bills against',
  detailFor: (cites: string) =>
    `Compare invoice_date on the invoice with received_at on the goods receipt before applying ${cites}. ` +
    'A three-way match on lines, quantities, tax and total says nothing about the order of events: if the ' +
    `invoice predates the receipt, the vendor billed before delivery, and ${cites} does not license approving ` +
    'it. Nothing in get_vendor_terms establishes whether this vendor bills in advance, so the agent has no ' +
    'basis to settle it — escalate to Priya Raghunathan and name both dates so she can confirm a prepay ' +
    'arrangement or send the invoice back.',
};

function nextId(rules: Rule[]) {
  const highest = rules.reduce((n, r) => Math.max(n, Number(/(\d+)\s*$/.exec(r.id)?.[1] ?? 0)), 0);
  return `R-${String(highest + 1).padStart(2, '0')}`;
}

/** Prefer the ≥$500 three-way approval — case 14 is $4,600 — else any approve-on-match that is not the under-$500 rule. */
function threeWayCite(rules: Rule[]): string {
  const under500 = (when: string) => /under|below|less than/i.test(when) && /\$?\s*500|five hundred/i.test(when);
  const over500 = rules.find(
    (r) =>
      r.then === 'approve' &&
      /match/i.test(r.when) &&
      /goods receipt|purchase order/i.test(r.when) &&
      !under500(r.when) &&
      (/\$?\s*500|five hundred/i.test(r.when) || /or greater|and above|over \$?500/i.test(r.when)),
  );
  if (over500) return over500.id;
  const any = rules.find(
    (r) =>
      r.then === 'approve' &&
      /match/i.test(r.when) &&
      /goods receipt|purchase order/i.test(r.when) &&
      !under500(r.when),
  );
  return any?.id ?? 'R-01';
}

async function main() {
  const parentId = process.argv[2];
  if (!parentId) throw new Error('usage: amend-v2.ts <parentContractId>');

  const { db } = await import('../lib/supabase');
  const { data: parent, error } = await db
    .from('contracts')
    .select('id, name, version, spec, transcript')
    .eq('id', parentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!parent) throw new Error(`contract ${parentId} not on file`);

  const spec = structuredClone(parent.spec) as ContractSpec;
  const cites = threeWayCite(spec.rules);

  // Edit one — answer the cancelled-PO open question (panel shrinks).
  const cancelledId = nextId(spec.rules);
  spec.rules.push({
    id: cancelledId,
    when: CANCELLED.when,
    then: 'reject',
    detail: CANCELLED.detail,
    provenance: { source: 'inferred', quote: 'written by hand in the editor: cancelled-PO open question answered' },
    confidence: 1,
  });
  spec.open_questions = spec.open_questions.filter((q) => !/cancel/i.test(q));

  // Edit two — advance-billing (former pocket Clause A), live amendment.
  const advanceId = nextId(spec.rules);
  spec.rules.push({
    id: advanceId,
    when: ADVANCE.when,
    then: 'escalate',
    detail: ADVANCE.detailFor(cites),
    provenance: {
      source: 'inferred',
      quote:
        'written by hand in the editor: the handover never says what to do when an invoice is dated before its goods receipt',
    },
    confidence: 1,
  });

  const { data: child, error: insertError } = await db
    .from('contracts')
    .insert({
      name: parent.name,
      version: (parent.version as number) + 1,
      spec,
      transcript: parent.transcript,
      parent_id: parent.id,
    })
    .select('id, version')
    .single();
  if (insertError) throw new Error(insertError.message);

  console.log(`v${child.version} filed as ${child.id}`);
  console.log(`  added ${cancelledId} (cancelled PO) and ${advanceId} (advance billing, cites ${cites})`);
  console.log(`  ${spec.rules.length} clauses, ${spec.open_questions.length} open question(s) remaining`);
}

void main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
