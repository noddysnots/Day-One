/**
 * The dead-air question. The scorecard cannot move until a case decides, which took 16 seconds,
 * so this watches what is actually on the run screen during those first seconds: how many case
 * rows exist, how many are visibly working, and how many steps are on the tape.
 *
 * The run it starts is a throwaway and is deleted at the end unless --keep is passed.
 *
 * Usage: npx tsx scripts/ui/watch-run.ts <contractId> [--keep]
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { BASE, open, shot } from './driver';

const PROBES = [1, 2, 3, 5, 8, 12, 16, 22];

async function main() {
  const contractId = process.argv[2];
  const keep = process.argv.includes('--keep');
  if (!contractId) throw new Error('name a contract id');

  const { browser, page } = await open(1440, 1000);
  try {
    await page.goto(`${BASE}/contract/${contractId}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /run the driving test/i }).click();
    await page.waitForURL(/\/run\/[0-9a-f-]{36}/, { timeout: 60_000 });
    const t0 = Date.now();
    const runId = page.url().split('/run/')[1];
    console.log(`run ${runId} started; watching the screen\n`);
    console.log('   at    rows  working  decided  tape steps  stamp  what the reader sees');

    for (const at of PROBES) {
      const wait = at * 1000 - (Date.now() - t0);
      if (wait > 0) await page.waitForTimeout(wait);
      const state = await page.evaluate(`(function () {
        var rows = document.querySelectorAll('ol.border-t li button');
        var working = 0, decided = 0;
        for (var i = 0; i < rows.length; i++) {
          var t = (rows[i].textContent || '');
          if (/working/.test(t)) working++;
          if (/(approve|reject|escalate)\\s*[✓✗·]/.test(t)) decided++;
        }
        var sat = document.querySelector('span.font-mono.text-micro.opacity-60');
        return {
          rows: rows.length,
          working: working,
          decided: decided,
          steps: document.querySelectorAll('ol.bg-paper > li').length,
          stamps: document.querySelectorAll('.stamp').length,
          sat: sat ? (sat.textContent || '').trim() : '',
          lastStep: (function () {
            var lis = document.querySelectorAll('ol.bg-paper > li');
            return lis.length ? (lis[lis.length - 1].textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 46) : '(tape empty)';
          })()
        };
      })()`) as { rows: number; working: number; decided: number; steps: number; stamps: number; sat: string; lastStep: string };
      console.log(
        `  ${String(at).padStart(3)}s  ${String(state.rows).padStart(4)}  ${String(state.working).padStart(7)}  ` +
          `${String(state.decided).padStart(7)}  ${String(state.steps).padStart(10)}  ${String(state.stamps).padStart(5)}  ${state.lastStep}`,
      );
      if (at === 3 || at === 8 || at === 16) await shot(page, `watch-${String(at).padStart(2, '0')}s`);
    }

    if (!keep) {
      console.log('\nletting the run finish before removing it, so nothing writes to a deleted row');
      for (;;) {
        const text = (await page.locator('text=/^\\d+\\/\\d+ sat$/').first().textContent()) ?? '0/15 sat';
        const [decided, total] = text.replace(' sat', '').split('/').map(Number);
        if (decided >= total) break;
        if (Date.now() - t0 > 300_000) break;
        await page.waitForTimeout(1000);
      }
      await page.waitForTimeout(2500);
      const { db } = await import('../../lib/supabase');
      const { error } = await db.from('runs').delete().eq('id', runId);
      console.log(error ? `could not remove the throwaway run: ${error.message}` : `throwaway run ${runId} removed`);
    } else {
      console.log(`\nkept run ${runId}`);
    }
  } finally {
    await browser.close();
  }
}

void main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e);
  process.exit(1);
});
