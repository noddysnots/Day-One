/**
 * The visual pass. Loads the real screens against real data and measures the things a screenshot
 * alone cannot settle: how many stamps are on a screen, where a rule citation actually lands,
 * whether the tape's timestamps still separate steps, whether anything overflows at 390px, and
 * whether focus is visible.
 *
 * Usage: npx tsx scripts/ui/visual-pass.ts <runId> [caseNo]
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import type { Page } from 'playwright-core';
import { BASE, open, readStamps, shot } from './driver';

const rule = (s: string) => console.log(`\n${'─'.repeat(78)}\n${s}\n${'─'.repeat(78)}`);

async function stampReport(page: Page, where: string) {
  const stamps = await readStamps(page);
  console.log(`  stamps on ${where}: ${stamps.length}`);
  for (const s of stamps) console.log(`    "${s.text}"  rotate ${s.rotate}  colour ${s.color}`);
  if (stamps.length !== 1) console.log(`    ^^ expected exactly 1, found ${stamps.length}`);
  return stamps.length;
}

async function overflow(page: Page) {
  return page.evaluate(`(function () {
    var d = document.documentElement;
    var worst = [];
    var all = document.querySelectorAll('body *');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      var r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > d.clientWidth + 1) {
        worst.push({
          tag: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').slice(0, 3).join('.') : ''),
          right: Math.round(r.right),
          text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40)
        });
      }
    }
    return {
      viewport: d.clientWidth,
      docScrollWidth: d.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      offenders: worst.slice(0, 8)
    };
  })()`) as Promise<{ viewport: number; docScrollWidth: number; bodyScrollWidth: number; offenders: { tag: string; right: number; text: string }[] }>;
}

async function tapeReport(page: Page) {
  return page.evaluate(`(function () {
    var lis = document.querySelectorAll('ol.bg-paper > li, ol > li.step-in');
    var steps = [];
    for (var i = 0; i < lis.length; i++) {
      var li = lis[i];
      var gutter = li.querySelector('span.font-mono');
      var body = li.querySelector('div');
      var cs = body ? getComputedStyle(body) : null;
      steps.push({
        clock: gutter ? (gutter.textContent || '').trim() : '',
        borderLeft: cs ? cs.borderLeftWidth + ' ' + cs.borderLeftStyle + ' ' + cs.borderLeftColor : '',
        kind: (li.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 70),
        ruleLink: li.querySelector('a[href*="#R-"]') ? li.querySelector('a[href*="#R-"]').getAttribute('href') : null
      });
    }
    var counts = {};
    for (var j = 0; j < steps.length; j++) counts[steps[j].clock] = (counts[steps[j].clock] || 0) + 1;
    var dupes = [];
    for (var k in counts) if (counts[k] > 1) dupes.push(k + ' x' + counts[k]);
    return { total: steps.length, steps: steps, duplicateClocks: dupes };
  })()`) as Promise<{ total: number; steps: { clock: string; borderLeft: string; kind: string; ruleLink: string | null }[]; duplicateClocks: string[] }>;
}

async function main() {
  const runId = process.argv[2];
  const caseNo = Number(process.argv[3] ?? 13);
  if (!runId) throw new Error('name a run id');

  const { db } = await import('../../lib/supabase');
  const { data: rows } = await db
    .from('case_results')
    .select('id, invoices(case_no, invoice_number, gt_action)')
    .eq('run_id', runId);
  type R = { id: string; invoices: { case_no: number; invoice_number: string; gt_action: string } };
  const cases = (rows ?? []) as unknown as R[];
  const target = cases.find((c) => c.invoices.case_no === caseNo)!;

  const { browser, page } = await open(1440, 1000);
  try {
    // ================= /run/[id] =================
    rule(`/run/${runId}  at 1440px`);
    await page.goto(`${BASE}/run/${runId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
    await shot(page, 'pass-run-full');
    await stampReport(page, 'the run screen');

    const weight = await page.evaluate(`(function () {
      var cells = document.querySelectorAll('div.grid.grid-cols-2 > div');
      var out = [];
      for (var i = 0; i < cells.length; i++) {
        var cs = getComputedStyle(cells[i]);
        var label = (cells[i].querySelector('span') || {}).textContent || '';
        out.push({ label: label.trim(), bg: cs.backgroundColor, fg: cs.color });
      }
      return out;
    })()`) as { label: string; bg: string; fg: string }[];
    console.log('\n  scorecard cell weight (over- vs under-escalation):');
    for (const c of weight) console.log(`    ${c.label.padEnd(17)} background ${c.bg.padEnd(22)} text ${c.fg}`);

    const tape = await tapeReport(page);
    console.log(`\n  tape on the run screen: ${tape.total} steps`);
    console.log(`  hairline on every step: ${new Set(tape.steps.map((s) => s.borderLeft)).size === 1 ? 'yes, identical' : 'NO — varies'} (${[...new Set(tape.steps.map((s) => s.borderLeft))].join(' / ')})`);
    console.log(`  timestamps that repeat: ${tape.duplicateClocks.length ? tape.duplicateClocks.join(', ') : 'none'}`);
    console.log(`  of ${tape.total} steps, ${tape.total - new Set(tape.steps.map((s) => s.clock)).size} share a second with an earlier step`);

    // ================= rule citation -> clause =================
    rule('a cited rule id, followed to the clause');
    const cited = page.locator('a[href*="#R-"]').first();
    const href = await cited.getAttribute('href');
    const citedText = (await cited.textContent())?.trim();
    console.log(`  first citation on the tape: "${citedText}" -> ${href}`);
    await cited.click();
    await page.waitForURL(/#R-\d+/, { timeout: 30_000 });
    await page.waitForTimeout(1200);
    const anchor = href!.split('#')[1];
    const landing = await page.evaluate(
      `(function () {
        var el = document.getElementById(${JSON.stringify(anchor)});
        if (!el) return { found: false };
        var r = el.getBoundingClientRect();
        return {
          found: true,
          id: el.id,
          inViewport: r.top >= -4 && r.top < window.innerHeight,
          top: Math.round(r.top),
          heading: (el.querySelector('h3') || {}).textContent || '',
          then: (el.querySelector('p span') || {}).textContent || ''
        };
      })()`,
    ) as { found: boolean; id?: string; inViewport?: boolean; top?: number; heading?: string; then?: string };
    console.log(`  landed on ${page.url()}`);
    console.log(`  target #${anchor} present: ${landing.found}`);
    if (landing.found) {
      console.log(`  clause in view: ${landing.inViewport} (top ${landing.top}px)`);
      console.log(`  clause reads: ${landing.id} — ${landing.heading?.trim()} / ${landing.then?.trim()}`);
    }
    await shot(page, 'pass-clause-landing');
    await stampReport(page, 'the contract screen');

    // ================= /run/[id]/case/[caseId] =================
    rule(`case ${caseNo} ${target.invoices.invoice_number} — the case file`);
    await page.goto(`${BASE}/run/${runId}/case/${target.id}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await shot(page, `pass-case-${caseNo}`);
    await stampReport(page, 'the case screen');
    const caseTape = await tapeReport(page);
    console.log(`\n  tape: ${caseTape.total} steps, ${caseTape.duplicateClocks.length ? 'repeated clocks ' + caseTape.duplicateClocks.join(', ') : 'no repeated clocks'}`);
    for (const s of caseTape.steps) console.log(`    ${s.clock}  ${s.ruleLink ? '[' + s.ruleLink.split('#')[1] + '] ' : ''}${s.kind}`);

    // ================= focus rings =================
    rule('keyboard focus');
    await page.goto(`${BASE}/run/${runId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    for (let i = 0; i < 7; i++) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(`(function () {
        var el = document.activeElement;
        if (!el || el === document.body) return null;
        var cs = getComputedStyle(el);
        return {
          tag: el.tagName.toLowerCase(),
          text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 46),
          outline: cs.outlineStyle + ' ' + cs.outlineWidth + ' ' + cs.outlineColor,
          offset: cs.outlineOffset
        };
      })()`) as { tag: string; text: string; outline: string; offset: string } | null;
      if (focused) console.log(`  tab ${i + 1}: <${focused.tag}> "${focused.text}"  outline ${focused.outline} offset ${focused.offset}`);
    }
    await shot(page, 'pass-focus-ring', false);

    // ================= 390px =================
    rule('390px');
    await page.setViewportSize({ width: 390, height: 844 });
    for (const [name, url] of [
      ['run', `${BASE}/run/${runId}`],
      ['case', `${BASE}/run/${runId}/case/${target.id}`],
    ] as const) {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1600);
      const o = await overflow(page);
      console.log(`\n  ${name} screen at ${o.viewport}px: document scrollWidth ${o.docScrollWidth}, body ${o.bodyScrollWidth}`);
      console.log(`  horizontal overflow: ${o.docScrollWidth > o.viewport + 1 ? 'YES' : 'no'}`);
      for (const off of o.offenders) console.log(`    overflows to ${off.right}px — ${off.tag}  "${off.text}"`);
      await shot(page, `pass-390-${name}`);
      await stampReport(page, `${name} at 390px`);
    }

    // ================= empty and error states =================
    rule('empty and error states');
    await page.setViewportSize({ width: 1440, height: 1000 });
    const dead = '00000000-0000-0000-0000-0000000000ff';
    for (const [name, url] of [
      ['no such run', `${BASE}/run/${dead}`],
      ['no such case', `${BASE}/run/${runId}/case/${dead}`],
      ['no such contract', `${BASE}/contract/${dead}`],
      ['nothing to amend', `${BASE}/contract/${dead}/edit`],
    ] as const) {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(500);
      const h1 = (await page.locator('h1').first().textContent())?.trim();
      const body = await page.evaluate(`(function () {
        var n = document.querySelector('div.border p');
        var f = document.querySelectorAll('div.border p')[1];
        return { what: n ? (n.textContent||'').trim() : '', fix: f ? (f.textContent||'').trim() : '' };
      })()`) as { what: string; fix: string };
      console.log(`\n  ${name}: HTTP ${response?.status()}  h1 "${h1}"`);
      console.log(`    what: ${body.what}`);
      console.log(`    fix : ${body.fix}`);
      await shot(page, `pass-empty-${name.replace(/\s+/g, '-')}`);
    }
  } finally {
    await browser.close();
  }
}

void main().catch((e) => {
  console.error('\nfailed:', e instanceof Error ? e.stack : e);
  process.exit(1);
});
