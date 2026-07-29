/**
 * Drives the real screens in a real Chrome, because the only honest way to prove a screen works
 * is to load it and click it.
 *
 * playwright-core with no bundled browser: it drives the Chrome already installed on the machine,
 * so nothing is downloaded and what gets tested is a browser a person actually has.
 */
import { chromium, type Browser, type Page } from 'playwright-core';
import { mkdir } from 'node:fs/promises';

export const BASE = process.env.DAY_ONE_BASE ?? 'http://localhost:3111';
export const SHOTS = 'out/shots';

const CHROMES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

export async function open(width = 1440, height = 900): Promise<{ browser: Browser; page: Page }> {
  const { existsSync } = await import('node:fs');
  const executablePath = CHROMES.find((p) => existsSync(p));
  if (!executablePath) throw new Error('no Chrome or Edge found on this machine');

  const browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') console.log(`  [console error] ${m.text()}`);
  });
  page.on('pageerror', (e) => console.log(`  [page error] ${e.message}`));
  page.on('requestfailed', (r) => console.log(`  [request failed] ${r.url()} ${r.failure()?.errorText ?? ''}`));
  await mkdir(SHOTS, { recursive: true });
  return { browser, page };
}

export async function shot(page: Page, name: string, fullPage = true) {
  await mkdir(SHOTS, { recursive: true });
  const path = `${SHOTS}/${name}.png`;
  // caret: 'initial' keeps Playwright from injecting an inline caret-color style, which React
  // otherwise reports as a hydration mismatch that has nothing to do with the app.
  await page.screenshot({ path, fullPage, caret: 'initial' });
  console.log(`  shot  ${path}`);
  return path;
}

export const now = () => Date.now();
export const since = (t: number) => `${((Date.now() - t) / 1000).toFixed(1)}s`;

/** Reads the four scorecard cells off the screen, not out of the database. */
export async function readScorecard(page: Page) {
  return page.evaluate(() => {
    const cells = [...document.querySelectorAll('div.grid.grid-cols-2 > div')];
    const out: Record<string, { figure: string; note: string; delta: string | null }> = {};
    for (const cell of cells) {
      const label = cell.querySelector('span')?.textContent?.trim() ?? '';
      const ps = [...cell.querySelectorAll('p')];
      const figure = ps[0]?.querySelector('span')?.textContent?.trim() ?? '';
      const delta = ps[0]?.querySelectorAll('span')[1]?.textContent?.trim() ?? null;
      const note = ps[1]?.textContent?.trim() ?? '';
      if (label) out[label] = { figure, note, delta };
    }
    return out;
  });
}

/**
 * Reads the case list off the screen: case number, invoice, amount and the tick or cross.
 * Passed as source text because tsx compiles inline functions with helpers that do not exist
 * inside the page.
 */
export async function readCaseList(page: Page): Promise<{ label: string; amount: string; status: string }[]> {
  return page.evaluate(`(function () {
    var out = [];
    var rows = document.querySelectorAll('ol.border-t li button');
    for (var i = 0; i < rows.length; i++) {
      var spans = rows[i].querySelectorAll('span');
      var label = '', amount = '', status = '';
      for (var j = 0; j < spans.length; j++) {
        var s = spans[j];
        var t = (s.textContent || '').trim();
        if (!label && /^\\d\\d · INV-/.test(t)) label = t;
        if (!amount && /^\\$[\\d,]+\\.\\d\\d$/.test(t)) amount = t;
        if (!status && /^(approve|reject|escalate)\\b|^pending$|^working/.test(t)) status = t.replace(/\\s+/g, ' ');
      }
      out.push({ label: label, amount: amount, status: status });
    }
    return out;
  })()`) as Promise<{ label: string; amount: string; status: string }[]>;
}

/** Every element carrying the .stamp utility, and how it is rotated. */
export async function readStamps(page: Page): Promise<{ text: string; rotate: string; color: string }[]> {
  return page.evaluate(`(function () {
    var out = [];
    var els = document.querySelectorAll('.stamp');
    for (var i = 0; i < els.length; i++) {
      var cs = getComputedStyle(els[i]);
      out.push({
        text: (els[i].textContent || '').trim(),
        rotate: cs.rotate || cs.transform,
        color: cs.color,
      });
    }
    return out;
  })()`) as Promise<{ text: string; rotate: string; color: string }[]>;
}

/** How many cases the screen itself believes are in, read out of the live "n/15 sat" counter. */
export async function satCount(page: Page): Promise<{ decided: number; total: number }> {
  const text = (await page.locator('text=/^\\d+\\/\\d+ sat$/').first().textContent()) ?? '0/0 sat';
  const [decided, total] = text.replace(' sat', '').split('/').map(Number);
  return { decided, total };
}

/**
 * Waits on the screen's own counter rather than on the database, and never reloads: the point is
 * that the page fills in by itself. Calls back on every change so a caller can time the fill.
 */
export async function waitForRunToFill(
  page: Page,
  onProgress?: (decided: number, total: number, elapsedMs: number) => void,
  timeoutMs = 420_000,
) {
  const started = Date.now();
  let last = -1;
  for (;;) {
    const { decided, total } = await satCount(page);
    if (decided !== last) {
      last = decided;
      onProgress?.(decided, total, Date.now() - started);
    }
    if (total > 0 && decided >= total) return Date.now() - started;
    if (Date.now() - started > timeoutMs) throw new Error(`only ${decided}/${total} cases landed inside ${timeoutMs}ms`);
    await page.waitForTimeout(250);
  }
}
