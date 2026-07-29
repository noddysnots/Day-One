/**
 * Names the element that forces horizontal scroll at 390px by hiding candidate subtrees one at a
 * time and watching the document's scrollWidth fall back to the viewport.
 */
import { BASE, open } from './driver';

async function main() {
  const [runId, caseId] = [process.argv[2], process.argv[3]];
  const { browser, page } = await open(390, 844);
  try {
    for (const [name, url, probes] of [
      [
        'run',
        `${BASE}/run/${runId}`,
        [
          'section:has(ol.border-t)',
          'ol.border-t',
          'ol.border-t li button span.text-right',
          'section.border',
          'ol.bg-paper',
          'ol.bg-paper li p.font-mono',
          'ol.bg-paper li details',
          'div.grid.grid-cols-2',
        ],
      ],
      [
        'case',
        `${BASE}/run/${runId}/case/${caseId}`,
        ['ol.bg-paper', 'ol.bg-paper li p.font-mono', 'ol.bg-paper li details', 'aside', 'section.mt-16'],
      ],
    ] as const) {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1600);
      const base = await page.evaluate('document.documentElement.scrollWidth');
      console.log(`\n${name}: baseline document scrollWidth ${base} at 390px viewport`);

      for (const selector of probes) {
        const result = await page.evaluate(
          `(function () {
            var sel = ${JSON.stringify(selector)};
            var els = document.querySelectorAll(sel);
            if (!els.length) return { n: 0, scroll: null };
            var saved = [];
            for (var i = 0; i < els.length; i++) { saved.push(els[i].style.display); els[i].style.display = 'none'; }
            var w = document.documentElement.scrollWidth;
            for (var j = 0; j < els.length; j++) els[j].style.display = saved[j];
            return { n: els.length, scroll: w };
          })()`,
        ) as { n: number; scroll: number | null };
        if (!result.n) {
          console.log(`  ${selector.padEnd(38)} not present`);
          continue;
        }
        const verdict = result.scroll! <= 391 ? '  <-- THIS IS THE CULPRIT' : '';
        console.log(`  hiding ${String(result.n).padStart(2)} x ${selector.padEnd(36)} -> ${result.scroll}${verdict}`);
      }
    }
  } finally {
    await browser.close();
  }
}

void main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e);
  process.exit(1);
});
