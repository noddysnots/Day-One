/**
 * The two screens the earlier passes did not reach: the handover and the un-amended contract.
 * Checks the stamp accent is spent once per screen (both as .stamp and as the border-stamp edge),
 * and that the thumbnail for the corrected case agrees with the figure printed beside it.
 */
import { BASE, open, readStamps, shot } from './driver';

async function accents(page: import('playwright-core').Page, where: string) {
  const stamps = await readStamps(page);
  const edges = await page.evaluate(`(function () {
    var out = [];
    var all = document.querySelectorAll('body *');
    for (var i = 0; i < all.length; i++) {
      var cs = getComputedStyle(all[i]);
      if (cs.borderTopColor === 'rgb(180, 71, 31)' || cs.borderLeftColor === 'rgb(180, 71, 31)') {
        out.push((all[i].textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 60));
      }
    }
    return out;
  })()`) as string[];
  console.log(`  ${where}: ${stamps.length} .stamp element(s), ${edges.length} stamp-coloured edge(s)`);
  for (const s of stamps) console.log(`    stamp "${s.text}" rotate ${s.rotate}`);
  for (const e of edges) console.log(`    edge  "${e}"`);
}

async function main() {
  const v1 = process.argv[2];
  const v2 = process.argv[3];
  const { browser, page } = await open(1440, 1000);
  try {
    console.log('THE HANDOVER');
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await accents(page, 'home');
    const sheets = await page.evaluate(`(function () {
      var out = [];
      var lis = document.querySelectorAll('ul.grid li');
      for (var i = 0; i < lis.length; i++) {
        var ps = lis[i].querySelectorAll('p');
        var img = lis[i].querySelector('img');
        out.push({
          number: ps[0] ? (ps[0].textContent||'').trim() : '',
          total: ps[2] ? (ps[2].textContent||'').trim() : '',
          src: img ? img.getAttribute('src') : null,
          loaded: img ? (img.naturalWidth > 0) : false
        });
      }
      return out;
    })()`) as { number: string; total: string; src: string | null; loaded: boolean }[];
    console.log(`  ${sheets.length} sheets on the intake table`);
    const broken = sheets.filter((s) => !s.loaded);
    console.log(`  thumbnails that failed to load: ${broken.length ? broken.map((b) => b.number).join(', ') : 'none'}`);
    const c6 = sheets.find((s) => s.number === 'INV-2231');
    console.log(`  the corrected sheet: ${c6?.number} printed beside ${c6?.total}, image ${c6?.src}`);
    await shot(page, 'entry-home');
    await page.locator('img[src="/docs/INV-2231.jpg"]').first().screenshot({ path: 'out/shots/entry-inv2231-thumb.png' });
    console.log('  shot  out/shots/entry-inv2231-thumb.png');

    console.log('\nCONTRACT VERSION 1, still carrying its open question');
    await page.goto(`${BASE}/contract/${v1}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    await accents(page, 'contract v1');
    await shot(page, 'entry-contract-v1');

    console.log('\nCONTRACT VERSION 2, nothing left open');
    await page.goto(`${BASE}/contract/${v2}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    await accents(page, 'contract v2');
    const clauses = await page.locator('ol > li[id^="R-"]').count();
    const sources = await page.evaluate(`(function () {
      var out = [];
      var lis = document.querySelectorAll('ol > li[id^="R-"]');
      for (var i = 0; i < lis.length; i++) {
        var s = lis[i].querySelectorAll('span');
        out.push(lis[i].id + ' ' + (s[s.length-1] ? (s[s.length-1].textContent||'').trim() : ''));
      }
      return out;
    })()`) as string[];
    console.log(`  ${clauses} clauses on screen`);
    for (const s of sources) console.log(`    ${s}`);
    await shot(page, 'entry-contract-v2');
  } finally {
    await browser.close();
  }
}

void main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e);
  process.exit(1);
});
