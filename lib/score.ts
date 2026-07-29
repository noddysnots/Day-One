import type { CaseResult, Scorecard } from './rows';

/**
 * Derived from the case results on screen rather than read from runs.scorecard, so the figures can
 * never disagree with the list underneath them mid-run. The denominator is the whole paper, not the
 * cases answered so far, which matches what lib/run-contract.ts writes when the run closes.
 *
 * An escalation the controller would also have escalated is correct behaviour, not a miss.
 */
export function score(cases: CaseResult[], expectedTotal?: number): Scorecard {
  const total = Math.max(expectedTotal ?? 0, cases.length);
  let correct = 0;
  let touchless = 0;
  let over = 0;
  let under = 0;
  let decided = 0;

  for (const c of cases) {
    if (!c.action) continue;
    decided++;
    if (c.correct) correct++;
    if (c.action !== 'escalate') touchless++;
    if (c.action === 'escalate' && c.invoice.gt_action !== 'escalate') over++;
    if (c.action !== 'escalate' && c.invoice.gt_action === 'escalate') under++;
  }

  return {
    total,
    decided,
    correct,
    touchless: total ? touchless / total : 0,
    accuracy: total ? correct / total : 0,
    over,
    under,
  };
}