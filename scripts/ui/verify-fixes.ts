/**
 * Proves the defects closed in this pass are closed, on the real screens against real data.
 *
 * The mid-run check is the awkward one: the fix is that a partial run stops being compared to a
 * finished baseline, and the only honest way to see it is to have the screen believe a run is open.
 * So this reopens the v2 run by clearing finished_at, reads the screen, and puts it back in a
 * finally — it is the one field touched and it is restored whether the pass succeeds or throws.
 *
 * Usage: npx tsx scripts/ui/verify-fixes.ts <runId>
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import type { Page } from 'playwright-core';
import { BASE, open, readScorecard, shot } from './driver';

const rule = (s: string) => console.log(`\n${'─'.repeat(78)}\n${s}\n${'─'.repeat(78)}`);
const verdict = (ok: boolean, text: string) => console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${text}`);

let failures = 0;
const check = (ok: boolean, text: string) => {
  if (!ok) failures++;
  verdict(ok, text);
};

/** The tape's gutter, and whether the decision stamp is inside the scroller's visible box. */
async function tapeReport(page: Page) {
  return page.evaluate(`(function () {
    var scroller = document.querySelector('div.overflow-y-auto.bg-paper') || document.querySelector('div.overflow-y-auto');
    var lis = document.querySelectorAll('ol.bg-paper > li');
    var clocks = [];
    for (var i = 0; i < lis.length; i++) {
      var g = lis[i].querySelector('span.font-mono');
      clocks.push(g ? (g.textContent || '').trim() : '');
    }
    var seen = {}, repeats = 0;
    for (var j = 0; j < clocks.length; j++) {
      if (seen[clocks[j]]) repeats++;
      seen[clocks[j]] = true;
    }
    var stamp = document.querySelector('.stamp');
    var visible = null, gutterPx = null;
    if (stamp) {
      var sr = stamp.getBoundingClientRect();
      if (scroller) {
        var cr = scroller.getBoundingClientRect();
        visible = sr.top >= cr.top - 1 && sr.bottom <= cr.bottom + 1;
      } else {
        visible = sr.top >= -1 && sr.bottom <= window.innerHeight + 1;
      }
    }
    var firstGutter = lis.length ? lis[0].querySelector('span.font-mono') : null;
    if (firstGutter) gutterPx = Math.round(firstGutter.getBoundingClientRect().width * 10) / 10;
    return {
      steps: clocks.length,
      clocks: clocks,
      repeats: repeats,
      gutterPx: gutterPx,
      stampText: stamp ? (stamp.textContent || '').trim() : null,
      stampVisible: visible,
      scroll: scroller ? { top: Math.round(scroller.scrollTop), height: scroller.scrollHeight, client: scroller.clientHeight } : null
    };
  })()`) as Promise<{
    steps: number;
    clocks: string[];
    repeats: number;
    gutterPx: number | null;
    stampText: string | null;
    stampVisible: boolean | null;
    scroll: { top: number; height: number; client: number } | null;
  }>;
}

async function overflow(page: Page) {
  return page.evaluate(`(function () {
    var d = document.documentElement;
    var offenders = [];
    var all = document.querySelectorAll('body *');
    for (var i = 0; i < all.length; i++) {
      var r = all[i].getBoundingClientRect();
      if (r.width > 0 && r.right > d.clientWidth + 1) {
        offenders.push({
          tag: all[i].tagName.toLowerCase() + (typeof all[i].className === 'string' && all[i].className ? '.' + all[i].className.split(' ').slice(0, 3).join('.') : ''),
          right: Math.round(r.right),
          text: (all[i].textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 50)
        });
      }
    }
    return { viewport: d.clientWidth, docScrollWidth: d.scrollWidth, bodyScrollWidth: document.body.scrollWidth, offenders: offenders.slice(0, 6) };
  })()`) as Promise<{
    viewport: number;
    docScrollWidth: number;
    bodyScrollWidth: number;
    offenders: { tag: string; right: number; text: string }[];
  }>;
}

/** Every rule badge on the tape, and every rule id the contract actually defines. */
async function badges(page: Page) {
  return page.evaluate(`(function () {
    var out = [];
    var links = document.querySelectorAll('ol.bg-paper > li > div > a[href*="#"]');
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute('href') || '';
      out.push({ text: (links[i].textContent || '').trim(), anchor: href.split('#')[1] || '' });
    }
    return out;
  })()`) as Promise<{ text: string; anchor: string }[]>;
}

async function main() {
  const runId = process.argv[2];
  if (!runId) throw new Error('name a run id');

  const { db } = await import('../../lib/supabase');
  const { data: rows } = await db
    .from('case_results')
    .select('id, action, failure_mode, invoices(case_no, invoice_number)')
    .eq('run_id', runId);
  type R = { id: string; action: string | null; failure_mode: string | null; invoices: { case_no: number; invoice_number: string } };
  const cases = ((rows ?? []) as unknown as R[]).sort((a, b) => a.invoices.case_no - b.invoices.case_no);
  const caseOf = (n: number) => cases.find((c) => c.invoices.case_no === n)!;

  const { data: run } = await db.from('runs').select('contract_id, finished_at').eq('id', runId).maybeSingle();
  const { data: contract } = await db.from('contracts').select('spec').eq('id', run!.contract_id).maybeSingle();
  const clauses = new Set(((contract!.spec as { rules: { id: string }[] }).rules ?? []).map((r) => r.id));
  const finishedAt = run!.finished_at as string;

  const errors: string[] = [];
  /**
   * Aborted ?_rsc= requests are router prefetches this harness cancels by navigating before they
   * land. They are not errors, they do not reach the console, and a reader clicking at human speed
   * never generates them — so they are counted separately rather than allowed to mask a real one.
   */
  const prefetchAborts: string[] = [];
  const { browser, page } = await open(1440, 1000);
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`page: ${e.message}`));
  page.on('requestfailed', (r) => {
    const aborted = r.failure()?.errorText === 'net::ERR_ABORTED';
    const target = aborted && r.url().includes('_rsc=') ? prefetchAborts : errors;
    target.push(`request failed ${r.url()} ${r.failure()?.errorText ?? ''}`);
  });

  try {
    // ============ the run screen, finished ============
    rule(`/run/${runId} at 1440px — finished`);
    await page.goto(`${BASE}/run/${runId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2200);
    await shot(page, 'fix-run-1440');

    const card = await readScorecard(page);
    for (const [label, cell] of Object.entries(card)) {
      console.log(`  ${label.padEnd(17)} ${cell.figure.padEnd(7)} delta ${String(cell.delta ?? '—').padEnd(6)} ${cell.note}`);
    }
    check(
      Object.values(card).every((c) => c.delta),
      'a finished run shows its deltas',
    );
    const diffPanel = await page.locator('text=/^Against version/').count();
    check(diffPanel === 1, 'a finished run shows the diff panel');

    const tape = await tapeReport(page);
    console.log(`\n  tape: ${tape.steps} steps, gutter ${tape.gutterPx}px, scroll ${JSON.stringify(tape.scroll)}`);
    console.log(`  gutter reads: ${tape.clocks.slice(0, 6).join('  ')}${tape.steps > 6 ? ' …' : ''}`);
    const msShape = /^\d{2}:\d{2}\.\d{3}$/;
    check(
      tape.clocks.every((c) => msShape.test(c)),
      'every gutter row reads MM:SS.mmm',
    );
    check(tape.repeats === 0, `no gutter row repeats an earlier one (${tape.repeats} repeats)`);
    check(tape.stampVisible === true, `the decision stamp "${tape.stampText}" is visible without scrolling`);

    // ============ the run screen, mid-run ============
    // The gate under test lives in the client: it reads `finished` off the polled state and hides
    // the comparison until it is true. So the run reports itself open by rewriting that one field
    // in the poll response. Nothing in the database moves — a pass that has to edit the record it
    // is checking is a pass that can leave the record edited, which is how this went wrong once.
    // One artifact to expect in fix-run-midrun.png: the header still reads "complete", because that
    // line is server-rendered from the row and the row is genuinely finished. A real mid-run says
    // "in progress" there. The gate being tested is the client's, and it is the client that is lied to.
    rule('the same screen with the run reporting itself open — deltas and diff must be suppressed');
    await page.route('**/api/run/*/state*', async (route) => {
      try {
        const response = await route.fetch();
        const state = (await response.json()) as { finished: boolean };
        await route.fulfill({ response, json: { ...state, finished: false } });
      } catch {
        // The screen polls every 700ms and navigating away cancels whichever poll is in flight.
        // There is no longer a request to answer, which is not a failure of anything under test.
      }
    });
    try {
      await page.goto(`${BASE}/run/${runId}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2600);
      await shot(page, 'fix-run-midrun');

      const midCard = await readScorecard(page);
      for (const [label, cell] of Object.entries(midCard)) {
        console.log(`  ${label.padEnd(17)} ${cell.figure.padEnd(7)} delta ${String(cell.delta ?? '—').padEnd(6)} ${cell.note}`);
      }
      check(
        Object.values(midCard).every((c) => !c.delta),
        'an open run shows no deltas',
      );
      check((await page.locator('text=/^Against version/').count()) === 0, 'an open run shows no diff panel');
      check(
        Object.values(midCard).some((c) => c.figure && c.figure !== '0%' && c.figure !== '0'),
        'the absolute figures are still live',
      );
      const listed = await page.locator('ol.border-t li button').count();
      check(listed === cases.length, `the case list is still live (${listed} cases)`);
      const tapeSteps = await page.locator('ol.bg-paper > li').count();
      check(tapeSteps > 0, `the tape is still live (${tapeSteps} steps)`);
    } finally {
      // Park the page first so the poll stops, then drop the interception.
      await page.goto('about:blank');
      await page.unrouteAll({ behavior: 'ignoreErrors' });
    }
    // The record is only ever read by this pass, so say so out loud rather than leave it implied.
    const { data: still } = await db.from('runs').select('finished_at').eq('id', runId).maybeSingle();
    check(still!.finished_at === finishedAt, 'the run row was never touched');

    // ============ case 7, where the scratchpad leaked ============
    for (const caseNo of [7, 13]) {
      const target = caseOf(caseNo);
      rule(`case ${caseNo} ${target.invoices.invoice_number} — the case file`);
      await page.goto(`${BASE}/run/${runId}/case/${target.id}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1600);
      await shot(page, `fix-case-${caseNo}`);

      const caseTape = await tapeReport(page);
      console.log(`  ${caseTape.steps} steps, gutter ${caseTape.gutterPx}px`);
      for (const c of caseTape.clocks) process.stdout.write(`${c}  `);
      console.log('');
      check(
        caseTape.clocks.every((c) => msShape.test(c)),
        'every gutter row reads MM:SS.mmm',
      );
      check(caseTape.repeats === 0, `no gutter row repeats an earlier one (${caseTape.repeats} repeats)`);

      const body = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
      check(!/Wait! Let's check/.test(body), 'no scratchpad aside on the tape');
      check(!/`(reason|route_to|action|confidence|rationale)`\s*:/.test(body), 'no drafted tool parameters on the tape');
      check(!/\/0\.9\/1\.0\)/.test(body), 'no fragment starting mid-token');
      check(!/[a-z]_[a-z]+ *\./.test(body.split('Sign-off')[1] ?? ''), 'the sign-off line carries no snake case');
      const signOff = (await page.locator('section.mt-16 p').last().innerText()).trim();
      console.log(`  sign-off: ${signOff}`);

      const marks = await badges(page);
      console.log(`  rule badges: ${marks.length ? marks.map((m) => m.text).join(', ') : 'none'}`);
      check(
        marks.every((m) => clauses.has(m.anchor)),
        'every rule badge names a clause the contract defines',
      );
    }

    // ============ 390px ============
    rule('390px');
    await page.setViewportSize({ width: 390, height: 844 });
    for (const [name, url] of [
      ['run', `${BASE}/run/${runId}`],
      ['case', `${BASE}/run/${runId}/case/${caseOf(7).id}`],
    ] as const) {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
      const o = await overflow(page);
      console.log(`\n  ${name}: viewport ${o.viewport}, document ${o.docScrollWidth}, body ${o.bodyScrollWidth}`);
      for (const off of o.offenders) console.log(`    overflows to ${off.right}px — ${off.tag}  "${off.text}"`);
      check(o.docScrollWidth === 390, `${name} screen measures exactly 390`);
      const t = await tapeReport(page);
      console.log(`    gutter ${t.gutterPx}px, ${t.steps} steps`);
      await shot(page, `fix-390-${name}`);
    }

    // ============ the console ============
    rule('the console, across every screen loaded above');
    console.log(`  ${prefetchAborts.length} router prefetches cancelled by this harness navigating away (not errors)`);
    for (const e of [...new Set(errors)]) console.log(`  ${e}`);
    check(!errors.some((e) => /favicon/i.test(e)), 'nothing failed on /favicon.ico');
    check(errors.length === 0, `no console errors, page errors or failed loads (${errors.length})`);
  } finally {
    await browser.close();
  }

  rule(failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`);
  if (failures) process.exit(1);
}

void main().catch((e) => {
  console.error('\nverify failed:', e instanceof Error ? e.stack : e);
  process.exit(1);
});
