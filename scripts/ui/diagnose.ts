/**
 * Three narrow questions the visual pass raised: what is 404ing on every screen, which element
 * actually forces horizontal scroll at 390px, and how often the tape's one-second gutter fails
 * to separate two steps.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { BASE, open } from './driver';

async function main() {
  const runId = process.argv[2];
  const { db } = await import('../../lib/supabase');

  // ---------- 1. the 404 ----------
  console.log('THE 404 ON EVERY SCREEN');
  const { browser, page } = await open(1440, 1000);
  try {
    const failures: string[] = [];
    page.on('response', (r) => {
      if (r.status() >= 400) failures.push(`${r.status()} ${r.request().resourceType()} ${r.url()}`);
    });
    await page.goto(`${BASE}/run/${runId}`, { waitUntil: 'load' });
    await page.waitForTimeout(2500);
    console.log(failures.length ? failures.map((f) => `  ${f}`).join('\n') : '  nothing 4xx');

    // ---------- 2. what forces the 390px scroll ----------
    console.log('\nWHAT FORCES HORIZONTAL SCROLL AT 390px');
    for (const [name, url] of [
      ['run', `${BASE}/run/${runId}`],
      ['case', `${BASE}/run/${runId}/case/${process.argv[3]}`],
    ] as const) {
      if (url.endsWith('undefined')) continue;
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1600);
      const culprits = await page.evaluate(`(function () {
        var out = [];
        var all = document.querySelectorAll('body *');
        for (var i = 0; i < all.length; i++) {
          var el = all[i];
          if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
            var cs = getComputedStyle(el);
            out.push({
              tag: el.tagName.toLowerCase(),
              cls: (typeof el.className === 'string' ? el.className : '').slice(0, 74),
              client: el.clientWidth,
              scroll: el.scrollWidth,
              overflowX: cs.overflowX,
              minWidth: cs.minWidth,
              wrap: cs.overflowWrap + '/' + cs.wordBreak,
              text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 54)
            });
          }
        }
        return { docScroll: document.documentElement.scrollWidth, culprits: out };
      })()`) as {
        docScroll: number;
        culprits: { tag: string; cls: string; client: number; scroll: number; overflowX: string; minWidth: string; wrap: string; text: string }[];
      };
      console.log(`\n  ${name}: document scrollWidth ${culprits.docScroll} (viewport 390)`);
      for (const c of culprits.culprits) {
        console.log(`    <${c.tag}> client ${c.client} scroll ${c.scroll}  overflow-x:${c.overflowX}  min-width:${c.minWidth}  ${c.wrap}`);
        console.log(`      class "${c.cls}"`);
        console.log(`      text  "${c.text}"`);
      }
      if (!culprits.culprits.length) console.log('    no element reports scrollWidth > clientWidth');
    }
  } finally {
    await browser.close();
  }

  // ---------- 3. how often the gutter clock repeats ----------
  console.log('\nHOW OFTEN TWO STEPS SHARE A DISPLAYED SECOND');
  const { data: cases } = await db
    .from('case_results')
    .select('id, invoices(case_no, invoice_number)')
    .eq('run_id', runId);
  type C = { id: string; invoices: { case_no: number; invoice_number: string } };
  const list = ((cases ?? []) as unknown as C[]).sort((a, b) => a.invoices.case_no - b.invoices.case_no);

  let steps = 0;
  let collided = 0;
  let subSecondGaps = 0;
  let gaps = 0;
  for (const c of list) {
    const { data: rows } = await db.from('trace_steps').select('created_at').eq('case_result_id', c.id).order('seq');
    const clocks = (rows ?? []).map((r) => String(r.created_at).slice(11, 19));
    const stamps = (rows ?? []).map((r) => Date.parse(String(r.created_at)));
    const unique = new Set(clocks).size;
    steps += clocks.length;
    collided += clocks.length - unique;
    for (let i = 1; i < stamps.length; i++) {
      gaps++;
      if (stamps[i] - stamps[i - 1] < 1000) subSecondGaps++;
    }
    console.log(
      `  case ${String(c.invoices.case_no).padStart(2)} ${c.invoices.invoice_number}: ${String(clocks.length).padStart(2)} steps, ` +
        `${String(unique).padStart(2)} distinct seconds, ${clocks.length - unique} share a second with an earlier step`,
    );
  }
  console.log(
    `\n  across the run: ${collided} of ${steps} steps (${((collided / steps) * 100).toFixed(0)}%) show the same second as an earlier step`,
  );
  console.log(
    `  ${subSecondGaps} of ${gaps} consecutive step gaps (${((subSecondGaps / gaps) * 100).toFixed(0)}%) are under one second, so the gutter cannot order them`,
  );
}

void main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e);
  process.exit(1);
});
