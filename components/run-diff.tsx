'use client';

import Link from 'next/link';
import type { Action } from '@/lib/rows';
import type { WireCase } from '@/lib/wire';
import { Label } from './primitives';

export type DiffBase = {
  runId: string;
  version: number;
  cases: Record<string, { action: Action | null; correct: boolean | null }>;
};

function Row({ c, before, tone }: { c: WireCase; before: { action: Action | null }; tone: string }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 py-1.5">
      <span className="font-mono text-micro opacity-60">{String(c.caseNo ?? 0).padStart(2, '0')}</span>
      <span className="text-small">{c.vendor}</span>
      <span className="font-mono text-micro opacity-60">{c.invoiceNumber}</span>
      <span className={`font-mono text-micro ${tone}`}>
        {before.action ?? '—'} → {c.action ?? '—'}
      </span>
    </li>
  );
}

/**
 * The payoff: what the amendment actually bought, case by case.
 *
 * Sits directly under the scorecard strip and above the case list and the tape. The strip already
 * carries the headline of the same change as deltas — correct +1, under-escalated −1 — so the
 * reading order is the figure and then the cases behind it, and putting this first would ask the
 * room to read the itemisation before the total. It also mounts only once the run has finished,
 * at the same beat the deltas appear: above the strip it would shove the strip down the screen on
 * the one beat everyone is watching it, where below it the strip never moves.
 */
export default function RunDiff({ cases, base }: { cases: WireCase[]; base: DiffBase }) {
  const fixed: WireCase[] = [];
  const broken: WireCase[] = [];
  for (const c of cases) {
    const before = base.cases[c.invoiceNumber];
    if (!before || before.correct === null || c.correct === null) continue;
    if (!before.correct && c.correct) fixed.push(c);
    if (before.correct && !c.correct) broken.push(c);
  }

  return (
    <section className="mt-6 border border-rule">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule px-4 py-2">
        <Label>Against version {base.version}</Label>
        <Link href={`/run/${base.runId}`} className="text-micro underline underline-offset-4">
          the earlier test
        </Link>
      </div>
      <div className="grid gap-x-8 gap-y-6 p-4 sm:grid-cols-2">
        <div>
          <Label>Now right — {fixed.length}</Label>
          {fixed.length ? (
            <ul className="mt-2 divide-y divide-rule">
              {fixed.map((c) => (
                <Row key={c.id} c={c} before={base.cases[c.invoiceNumber]} tone="text-pass" />
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-small opacity-70">Nothing the earlier contract got wrong has been recovered.</p>
          )}
        </div>
        <div>
          <Label>Now wrong — {broken.length}</Label>
          {broken.length ? (
            <ul className="mt-2 divide-y divide-rule">
              {broken.map((c) => (
                <Row key={c.id} c={c} before={base.cases[c.invoiceNumber]} tone="text-flag" />
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-small opacity-70">The amendment broke nothing that was already working.</p>
          )}
        </div>
      </div>
    </section>
  );
}
