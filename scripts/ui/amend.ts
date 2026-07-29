/**
 * Files the amendment the way the demo does it: answer the cancelled-PO question the compiler
 * raised, add the advance-billing clause by hand, press File version 2.
 *
 * Two clauses and no more. Usage: npx tsx scripts/ui/amend.ts <parentContractId>
 *
 * Cancelled-PO first so the unresolved panel visibly shrinks before the second paste.
 * Advance-billing is the former pocket Clause A — now a live amendment. Freight is not edited
 * on camera: escalating it at v1 is the product working.
 */
import { BASE, open, shot, since } from './driver';

const CANCELLED = {
  when: 'The invoice references a purchase order whose status is cancelled',
  detail:
    'A cancelled purchase order is not a live commitment, so there is nothing to three-way match against and ' +
    'nothing to pay. Reject and ask the vendor to re-raise against a live PO. This settles the open question ' +
    'and replaces the CANCELLED_PO default of escalate in the exception schedule.',
};

const ADVANCE = {
  when: 'The invoice is dated before the goods receipt for the purchase order it bills against',
  detail:
    'Compare invoice_date on the invoice with received_at on the goods receipt before applying the three-way ' +
    'approval (check the id on screen — often R-01 on a ≥$500 invoice). A three-way match on lines, quantities, ' +
    'tax and total says nothing about the order of events: if the invoice predates the receipt, the vendor billed ' +
    'before delivery, and that approval rule does not license approving it. Nothing in get_vendor_terms establishes ' +
    'whether this vendor bills in advance, so the agent has no basis to settle it — escalate to Priya Raghunathan ' +
    'and name both dates so she can confirm a prepay arrangement or send the invoice back.',
};

async function main() {
  const parentId = process.argv[2];
  if (!parentId) throw new Error('name the contract being amended');

  const { browser, page } = await open();
  try {
    const t0 = Date.now();
    await page.goto(`${BASE}/contract/${parentId}/edit`, { waitUntil: 'domcontentloaded' });
    console.log(`editor loaded in ${since(t0)}`);

    const unresolved = await page.locator('section').first().textContent();
    console.log(`unresolved panel: ${unresolved?.replace(/\s+/g, ' ').trim().slice(0, 200)}`);
    const rulesBefore = await page.locator('form ol > li').count();
    console.log(`clauses on file before the amendment: ${rulesBefore}`);
    await shot(page, 'edit-before');

    // --- edit one: answer the cancelled-PO open question (panel shrinks) ---
    const questions = page.locator('section li', { has: page.getByRole('button', { name: 'write the clause' }) });
    const count = await questions.count();
    console.log(`\n${count} unresolved question(s) on the panel`);
    for (let i = 0; i < count; i++) {
      console.log(`  [${i}] ${(await questions.nth(i).locator('span').first().textContent())?.trim()}`);
    }
    const cancelled = questions.filter({ hasText: /cancel/i });
    if ((await cancelled.count()) !== 1) {
      throw new Error(`expected exactly one cancelled-PO question, found ${await cancelled.count()}`);
    }
    const questionText = (await cancelled.locator('span').first().textContent())?.trim();
    console.log(`\nedit 1 — answering: ${questionText}`);
    await cancelled.getByRole('button', { name: 'write the clause' }).click();
    const firstId = (await page.locator('form ol > li').last().locator('span.font-mono').first().textContent())?.trim();
    console.log(`  seeded as ${firstId} from the question text`);
    await page.getByLabel(`${firstId} action`).selectOption('reject');
    await page.getByLabel(`${firstId} condition`).fill(CANCELLED.when);
    await page.getByLabel(`${firstId} detail`).fill(CANCELLED.detail);
    console.log(`  then = ${await page.getByLabel(`${firstId} action`).inputValue()}`);

    const afterOne = await page.locator('section').first().textContent();
    console.log(`unresolved panel after edit 1: ${afterOne?.replace(/\s+/g, ' ').trim().slice(0, 160)}`);

    // --- edit two: advance-billing (former pocket Clause A) ---
    await page.getByRole('button', { name: 'Add a clause' }).click();
    const secondId = (await page.locator('form ol > li').last().locator('span.font-mono').first().textContent())?.trim();
    console.log(`\nedit 2 — added ${secondId} for advance billing`);
    await page.getByLabel(`${secondId} condition`).fill(ADVANCE.when);
    await page.getByLabel(`${secondId} detail`).fill(ADVANCE.detail);
    const advanceAction = await page.getByLabel(`${secondId} action`).inputValue();
    console.log(`  then = ${advanceAction} (left as filed — escalate)`);

    const remaining = await page.locator('section').first().textContent();
    console.log(`\nunresolved panel now: ${remaining?.replace(/\s+/g, ' ').trim().slice(0, 160)}`);
    const rulesAfter = await page.locator('form ol > li').count();
    console.log(`clauses after the two edits: ${rulesAfter} (was ${rulesBefore})`);
    if (rulesAfter !== rulesBefore + 2) throw new Error('expected exactly two new clauses');
    await shot(page, 'edit-after');

    // --- file it ---
    const file = page.getByRole('button', { name: /File version/i });
    console.log(`\nfiling: "${(await file.textContent())?.trim()}"`);
    const tFile = Date.now();
    await file.click();
    await page.waitForURL((u) => /\/contract\/[0-9a-f-]{36}$/.test(u.pathname), { timeout: 60_000 });
    const newContractId = page.url().split('/contract/')[1];
    if (newContractId === parentId) throw new Error('the editor stayed on the parent; the amendment did not file');
    console.log(`filed in ${since(tFile)} and landed on ${newContractId}`);

    const header = (await page.locator('main > span').first().textContent())?.replace(/\s+/g, ' ').trim();
    console.log(`new contract header: ${header}`);
    await shot(page, 'v2-contract');

    console.log(`\nv2 contract id: ${newContractId}`);
    console.log(`amendment took ${since(t0)} end to end`);
  } finally {
    await browser.close();
  }
}

void main().catch((e) => {
  console.error('\nfailed:', e instanceof Error ? e.stack : e);
  process.exit(1);
});
