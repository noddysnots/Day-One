/**
 * Times the demo path the way a room experiences it: wall clock from a cold load, and the gap
 * between every line the compiler streams, so any silence longer than a breath is named and
 * measured rather than guessed at.
 *
 * The compile writes a throwaway contract. Pass --keep to leave it; by default it is deleted
 * again, because the v1-to-v2 comparison depends on nothing else being on file.
 *
 * Usage: npx tsx scripts/ui/time-path.ts [--keep]
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { BASE, open, shot } from './driver';

const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

async function main() {
  const keep = process.argv.includes('--keep');
  const { browser, page } = await open();
  const marks: { label: string; at: number }[] = [];
  const t0 = Date.now();
  const mark = (label: string) => {
    marks.push({ label, at: Date.now() - t0 });
    console.log(`  ${secs(Date.now() - t0).padStart(7)}  ${label}`);
  };

  try {
    console.log('COLD LOAD -> COMPILED CONTRACT -> SCORED RUN, one take\n');

    await page.goto(BASE, { waitUntil: 'commit' });
    mark('navigation committed');
    await page.waitForSelector('h1', { timeout: 60_000 });
    mark(`first paint of the handover ("${(await page.locator('h1').first().textContent())?.trim()}")`);

    const splash = await page.locator('div.fixed.inset-0.z-50').count();
    mark(`boot sequence overlay present: ${splash > 0}`);

    const compile = page.getByRole('button', { name: /compile the rulebook/i });
    await compile.waitFor({ state: 'visible', timeout: 60_000 });
    mark('compile button interactive — the room can start');
    await shot(page, 'timing-01-cold-home');

    // --- the compile, watching every streamed line as it lands ---
    const seen = new Map<string, number>();
    const tCompile = Date.now();
    await compile.click();
    mark('compile pressed');

    let contractUrl: string | null = null;
    for (;;) {
      const lines = await page.evaluate(`(function () {
        var out = [];
        var items = document.querySelectorAll('ol.font-mono li');
        for (var i = 0; i < items.length; i++) {
          out.push((items[i].textContent || '').replace(/\\s+/g, ' ').trim());
        }
        return out;
      })()`) as string[];
      for (const line of lines) {
        if (!seen.has(line)) {
          seen.set(line, Date.now() - tCompile);
          console.log(`      +${secs(Date.now() - tCompile).padStart(6)}  stream: ${line}`);
        }
      }
      if (/\/contract\/[0-9a-f-]{36}$/.test(new URL(page.url()).pathname)) {
        contractUrl = page.url();
        break;
      }
      if (Date.now() - tCompile > 180_000) throw new Error('the compile never finished inside 3 minutes');
      await page.waitForTimeout(150);
    }
    mark('landed on the compiled contract');
    const contractId = contractUrl!.split('/contract/')[1];
    await page.waitForSelector('h1', { timeout: 30_000 });
    mark('contract screen painted');
    await shot(page, 'timing-02-contract');

    // --- where the silence is ---
    const ordered = [...seen.entries()].sort((a, b) => a[1] - b[1]);
    console.log('\nGAPS BETWEEN COMPILER LINES (this is where dead air lives)');
    let prev = 0;
    let prevLabel = 'button press';
    for (const [line, at] of ordered) {
      console.log(`  ${secs(at - prev).padStart(7)} of silence between "${prevLabel.slice(0, 46)}" and "${line.slice(0, 46)}"`);
      prev = at;
      prevLabel = line;
    }
    console.log(`  ${secs(Date.now() - tCompile - prev).padStart(7)} of silence between "${prevLabel.slice(0, 46)}" and the contract screen`);
    console.log(`\ncompile leg total: ${secs(Date.now() - tCompile)}`);

    // --- the run leg, same take ---
    const run = page.getByRole('button', { name: /run the driving test/i });
    const tRun = Date.now();
    await run.click();
    await page.waitForURL(/\/run\/[0-9a-f-]{36}/, { timeout: 60_000 });
    mark('run screen reached');
    const runId = page.url().split('/run/')[1];

    let firstCase = 0;
    let last = -1;
    for (;;) {
      const text = (await page.locator('text=/^\\d+\\/\\d+ sat$/').first().textContent()) ?? '0/15 sat';
      const [decided, total] = text.replace(' sat', '').split('/').map(Number);
      if (decided !== last) {
        last = decided;
        if (decided === 1 && !firstCase) {
          firstCase = Date.now() - tRun;
          mark(`first case on the board (${secs(firstCase)} after pressing run)`);
        }
        if (decided >= total) break;
      }
      if (Date.now() - tRun > 300_000) throw new Error('the run never filled');
      await page.waitForTimeout(200);
    }
    mark('all 15 cases in');
    await page.waitForTimeout(1300);
    mark('scorecard settled');
    await shot(page, 'timing-03-scored');

    console.log(`\nrun leg total: ${secs(Date.now() - tRun)}`);
    console.log(`\nWHOLE PATH, cold load to scored run: ${secs(Date.now() - t0)}`);
    console.log(`  under two minutes: ${Date.now() - t0 < 120_000 ? 'YES' : 'NO'}`);
    console.log(`\nthrowaway contract ${contractId}, run ${runId}`);

    if (!keep) {
      const { db } = await import('../../lib/supabase');
      await db.from('runs').delete().eq('id', runId);
      const { error } = await db.from('contracts').delete().eq('id', contractId);
      console.log(error ? `could not remove the throwaway: ${error.message}` : 'throwaway contract and run removed');
    }
  } finally {
    await browser.close();
  }
}

void main().catch((e) => {
  console.error('\nfailed:', e instanceof Error ? e.stack : e);
  process.exit(1);
});
