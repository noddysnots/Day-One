/**
 * Reads the amendment diff off the run screen and checks it against the two runs in the
 * database, so "the diff is right" means the screen agrees with the ledger.
 *
 * Usage: npx tsx scripts/ui/verify-diff.ts <v2RunId>
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { BASE, open, readScorecard, shot } from './driver';

type DiffSide = { heading: string; rows: string[] };

async function readDiff(page: import('playwright-core').Page) {
  return page.evaluate(`(function () {
    var sections = document.querySelectorAll('section.border');
    for (var i = 0; i < sections.length; i++) {
      var s = sections[i];
      if (!/Against version/.test(s.textContent || '')) continue;
      var head = (s.querySelector('span') || {}).textContent || '';
      var link = s.querySelector('a');
      var cols = s.querySelectorAll('div.grid > div');
      var sides = [];
      for (var j = 0; j < cols.length; j++) {
        var label = (cols[j].querySelector('span') || {}).textContent || '';
        var items = cols[j].querySelectorAll('ul li');
        var rows = [];
        for (var k = 0; k < items.length; k++) {
          rows.push((items[k].textContent || '').replace(/\\s+/g, ' ').trim());
        }
        if (!items.length) {
          var p = cols[j].querySelector('p');
          if (p) rows.push('(' + (p.textContent || '').trim() + ')');
        }
        sides.push({ heading: label.trim(), rows: rows });
      }
      return { header: head.trim(), link: link ? link.getAttribute('href') : null, sides: sides };
    }
    return null;
  })()`) as Promise<{ header: string; link: string | null; sides: DiffSide[] } | null>;
}

async function main() {
  const runId = process.argv[2];
  if (!runId) throw new Error('name the v2 run id');

  const { db } = await import('../../lib/supabase');
  const { browser, page } = await open();
  try {
    await page.goto(`${BASE}/run/${runId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);

    const diff = await readDiff(page);
    if (!diff) throw new Error('no diff section rendered on the run screen');

    console.log(`diff header: ${diff.header}`);
    console.log(`links back to: ${diff.link}`);
    for (const side of diff.sides) {
      console.log(`\n  ${side.heading}`);
      for (const row of side.rows) console.log(`    ${row}`);
    }

    const card = await readScorecard(page);
    console.log('\nscorecard on the same screen:');
    for (const [label, cell] of Object.entries(card)) {
      console.log(`  ${label.padEnd(16)} ${cell.figure.padStart(5)}  delta ${cell.delta ?? '—'}`);
    }
    await shot(page, 'v2-diff');

    // --- now the same question, asked of the database ---
    const { data: run } = await db.from('runs').select('contract_id').eq('id', runId).maybeSingle();
    const { data: contract } = await db.from('contracts').select('parent_id, version').eq('id', run!.contract_id!).maybeSingle();
    const { data: parentRuns } = await db
      .from('runs')
      .select('id, started_at')
      .eq('contract_id', contract!.parent_id!)
      .order('started_at', { ascending: false });
    const baseRunId = parentRuns![0].id as string;

    const load = async (id: string) => {
      const { data } = await db
        .from('case_results')
        .select('action, correct, invoices(case_no, invoice_number, gt_action)')
        .eq('run_id', id);
      type R = { action: string | null; correct: boolean | null; invoices: { case_no: number; invoice_number: string; gt_action: string } };
      const map = new Map<number, R>();
      for (const r of (data ?? []) as unknown as R[]) map.set(r.invoices.case_no, r);
      return map;
    };
    const [before, after] = await Promise.all([load(baseRunId), load(runId)]);

    console.log(`\nledger check — base run ${baseRunId} (contract v${contract!.version} parent)`);
    const fixed: string[] = [];
    const broken: string[] = [];
    for (const [caseNo, a] of [...after.entries()].sort((x, y) => x[0] - y[0])) {
      const b = before.get(caseNo);
      if (!b) continue;
      if (!b.correct && a.correct) fixed.push(`${caseNo} ${a.invoices.invoice_number} ${b.action} -> ${a.action}`);
      if (b.correct && !a.correct) broken.push(`${caseNo} ${a.invoices.invoice_number} ${b.action} -> ${a.action}`);
    }
    console.log(`  now right (${fixed.length}): ${fixed.join('  |  ') || 'none'}`);
    console.log(`  now wrong (${broken.length}): ${broken.join('  |  ') || 'none'}`);

    const screenFixed = diff.sides[0]?.rows.filter((r) => !r.startsWith('(')) ?? [];
    const screenBroken = diff.sides[1]?.rows.filter((r) => !r.startsWith('(')) ?? [];
    const ok = screenFixed.length === fixed.length && screenBroken.length === broken.length;
    console.log(`\nscreen and ledger ${ok ? 'agree' : 'DISAGREE'}: screen says ${screenFixed.length} recovered / ${screenBroken.length} broken, ledger says ${fixed.length} / ${broken.length}`);
    if (!ok) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

void main().catch((e) => {
  console.error('\nfailed:', e instanceof Error ? e.stack : e);
  process.exit(1);
});
