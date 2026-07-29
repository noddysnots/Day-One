/**
 * Files a clause from docs/pocket-clauses.md as a throwaway version on top of a parent, so the
 * clause can be measured before anyone promises a number out loud.
 *
 * A = advance-billing (case 14) — now a LIVE amendment; still scriptable here for headless checks.
 * B = recurring-charge (case 15) — the pocket encore.
 * Prefer scripts/amend-v2.ts for the live cancelled-PO + advance-billing pair.
 *
 * Mirrors lib/actions.ts amend() — new row, version parent+1, parent_id set, the parent's
 * transcript carried forward — and never edits a version in place.
 *
 * The clause ids are taken from the parent on file rather than assumed, and the rule each detail
 * cites is passed in, because a citation copied from a differently numbered compile is the one
 * mistake on screen a reader can catch.
 *
 * Usage: npx tsx scripts/pocket-clause.ts <parentContractId> A|B|AB [--cite-a R-01] [--strict-a]
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import type { ContractSpec, Rule } from '../lib/contract-schema';

const arg = (flag: string, fallback: string) => {
  const at = process.argv.indexOf(flag);
  return at > -1 ? process.argv[at + 1] : fallback;
};

/** Clause A — case 14, billed before the goods arrived. */
function clauseA(id: string, cites: string, strict: boolean): Rule {
  const opening = strict
    ? `Before applying ${cites}, read invoice_date off the invoice and received_at off the goods receipt, state both dates in your reasoning, and say which is earlier. `
    : `Compare invoice_date on the invoice with received_at on the goods receipt before applying ${cites}. `;
  return {
    id,
    when: 'The invoice is dated before the goods receipt for the purchase order it bills against',
    then: 'escalate',
    detail:
      opening +
      'A three-way match on lines, quantities, tax and total says nothing about the order of events: if the ' +
      `invoice predates the receipt, the vendor billed before delivery, and ${cites} does not license approving ` +
      'it. Nothing in get_vendor_terms establishes whether this vendor bills in advance, so the agent has no ' +
      'basis to settle it — escalate to Priya Raghunathan and name both dates so she can confirm a prepay ' +
      'arrangement or send the invoice back.',
    provenance: {
      source: 'inferred',
      quote:
        'written by hand in the editor: the handover never says what to do when an invoice is dated before its goods receipt',
    },
    confidence: 1,
  };
}

/** Clause B — case 15, a recurring charge caught by the duplicate rule. */
function clauseB(id: string, cites: string): Rule {
  return {
    id,
    when:
      `The invoice looks like a duplicate under ${cites}, but the two invoices name different billing periods, ` +
      'or the purchase order is a blanket with periods still unconsumed on the goods receipt',
    then: 'escalate',
    detail:
      `Before rejecting under ${cites}, read the line descriptions find_similar_invoices returned against the ` +
      'ones on the invoice, and call lookup_po and get_goods_receipt on the purchase order behind them. Same ' +
      'vendor and same amount is not enough: descriptions naming different periods, or a blanket PO whose goods ' +
      'receipt still shows periods unconsumed, mean the second bill may be the next period falling due rather ' +
      `than a re-bill of the first. ${cites} was written for re-bills and does not settle that — escalate to ` +
      'Priya Raghunathan, name both invoice numbers and both periods, and say how many periods of the blanket ' +
      'remain, so she can confirm the later period is genuinely due.',
    provenance: {
      source: 'inferred',
      quote: `written by hand in the editor: ${cites} was written for re-bills, not for the next period of a recurring charge`,
    },
    confidence: 1,
  };
}

/** The editor's rule: highest number on file plus one. */
function nextId(rules: Rule[]) {
  const highest = rules.reduce((n, r) => Math.max(n, Number(/(\d+)\s*$/.exec(r.id)?.[1] ?? 0)), 0);
  return `R-${String(highest + 1).padStart(2, '0')}`;
}

async function main() {
  const parentId = process.argv[2];
  const which = (process.argv[3] ?? '').toUpperCase();
  if (!parentId || !['A', 'B', 'AB'].includes(which)) {
    throw new Error('usage: pocket-clause.ts <parentContractId> A|B|AB [--cite-a R-01] [--cite-b R-05] [--strict-a]');
  }

  const { db } = await import('../lib/supabase');

  const { data: parent, error } = await db
    .from('contracts')
    .select('id, name, version, spec, transcript')
    .eq('id', parentId)
    .maybeSingle();
  if (error) throw new Error(`contracts: ${error.message}`);
  if (!parent) throw new Error(`contract ${parentId} is not on file`);

  const spec = parent.spec as ContractSpec;
  const rules = [...spec.rules];
  const added: Rule[] = [];

  if (which.includes('A')) {
    const rule = clauseA(nextId(rules), arg('--cite-a', 'R-01'), process.argv.includes('--strict-a'));
    rules.push(rule);
    added.push(rule);
  }
  if (which.includes('B')) {
    const rule = clauseB(nextId(rules), arg('--cite-b', 'R-05'));
    rules.push(rule);
    added.push(rule);
  }

  const edited: ContractSpec = { ...spec, rules };

  const { data: written, error: writeError } = await db
    .from('contracts')
    .insert({
      name: parent.name,
      version: Number(parent.version) + 1,
      spec: edited,
      transcript: parent.transcript,
      parent_id: parent.id,
    })
    .select('id')
    .single();
  if (writeError) throw new Error(`insert: ${writeError.message}`);

  console.log(`parent   ${parentId}  v${parent.version}  ${spec.rules.length} clauses`);
  console.log(`filed    ${written.id}  v${Number(parent.version) + 1}  ${rules.length} clauses`);
  for (const r of added) {
    console.log(`\nadded ${r.id} → ${r.then.toUpperCase()}`);
    console.log(`  WHEN ${r.when}`);
    console.log(`  THEN ${r.detail}`);
  }
  console.log(`\ncontract id: ${written.id}`);
}

void main().catch((e) => {
  console.error('\nfailed:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
