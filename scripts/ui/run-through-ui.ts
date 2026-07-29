/**
 * Starts a driving test the way a person does: load the contract screen, press the button,
 * watch the test screen fill in. Nothing here calls runContract directly.
 *
 * Usage: npx tsx scripts/ui/run-through-ui.ts <contractId> <shot-prefix>
 */
import { BASE, open, readCaseList, readScorecard, shot, since, waitForRunToFill } from './driver';

async function main() {
  const contractId = process.argv[2];
  const prefix = process.argv[3] ?? 'run';
  if (!contractId) throw new Error('name a contract id');

  const { browser, page } = await open();
  try {
    const t0 = Date.now();
    await page.goto(`${BASE}/contract/${contractId}`, { waitUntil: 'domcontentloaded' });
    console.log(`contract screen loaded in ${since(t0)}`);

    const version = (await page.locator('main > span').first().textContent()) ?? '';
    console.log(`header: ${version.replace(/\s+/g, ' ').trim()}`);

    const button = page.getByRole('button', { name: /run the driving test/i });
    const label = await button.textContent();
    console.log(`button reads: "${label?.trim()}"`);

    const tClick = Date.now();
    await button.click();
    await page.waitForURL(/\/run\/[0-9a-f-]{36}/, { timeout: 60_000 });
    const runId = page.url().split('/run/')[1];
    console.log(`run screen reached in ${since(tClick)}  run ${runId}`);

    const fill = await waitForRunToFill(page, (decided, total, ms) => {
      console.log(`  ${String(decided).padStart(2)}/${total} sat at ${(ms / 1000).toFixed(1)}s`);
    });
    console.log(`all cases in after ${(fill / 1000).toFixed(1)}s from the run screen appearing`);

    // The scorecard counts up over 600ms once the run closes; let it settle before reading it.
    await page.waitForTimeout(1200);
    const card = await readScorecard(page);
    console.log('\nscorecard as the screen shows it:');
    for (const [label, cell] of Object.entries(card)) {
      console.log(`  ${label.padEnd(16)} ${cell.figure.padStart(5)}${cell.delta ? `  (${cell.delta})` : ''}   ${cell.note}`);
    }

    console.log('\ncase list as the screen shows it:');
    for (const row of await readCaseList(page)) console.log(`  ${row.label.padEnd(18)} ${row.status}`);

    await shot(page, `${prefix}-run-screen`);
    console.log(`\nrun id: ${runId}`);
    console.log(`total wall clock from cold contract screen to scored run: ${since(t0)}`);
  } finally {
    await browser.close();
  }
}

void main().catch((e) => {
  console.error('\nfailed:', e instanceof Error ? e.stack : e);
  process.exit(1);
});
