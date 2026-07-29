'use client';

import { useEffect, useRef, useState } from 'react';
import { pct } from '@/lib/format';
import type { Scorecard } from '@/lib/rows';
import { Label } from './primitives';

/** Numbers count up once, at the moment the run closes. Nothing else on this screen moves. */
function useSettling(finished: boolean) {
  const [progress, setProgress] = useState(1);
  const was = useRef(finished);

  useEffect(() => {
    if (!finished || was.current) {
      was.current = finished;
      return;
    }
    was.current = true;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 600);
      setProgress(p);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    setProgress(0);
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [finished]);

  return progress;
}

function Cell({
  label,
  figure,
  note,
  delta,
  heavy,
}: {
  label: string;
  figure: string;
  note: string;
  delta?: string;
  heavy?: boolean;
}) {
  return (
    <div className={`p-4 ${heavy ? 'bg-ink text-paper' : 'bg-paper'}`}>
      <Label>{label}</Label>
      <p className="mt-2 flex items-baseline gap-2">
        <span className="font-mono text-title tabular-nums">{figure}</span>
        {delta ? <span className="font-mono text-micro tabular-nums opacity-70">{delta}</span> : null}
      </p>
      <p className="mt-1 text-micro opacity-70">{note}</p>
    </div>
  );
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

export default function ScorecardStrip({
  card,
  finished,
  previous,
}: {
  card: Scorecard;
  finished: boolean;
  previous?: Scorecard | null;
}) {
  const p = useSettling(finished);
  const n = (v: number) => Math.round(v * p);
  const touchlessCount = Math.round(card.touchless * card.decided);

  // A delta against a finished baseline only means anything once this run has finished too. Three
  // cases in, the figures on the left are true and the comparison beside them is not — every case
  // still to sit reads as a case this contract got wrong. So the figures stay live and the
  // comparison waits for the last case.
  const against = finished ? previous : null;

  return (
    <div className="grid grid-cols-2 gap-px border border-rule bg-rule sm:grid-cols-4">
      <Cell
        label="Touchless"
        figure={pct(card.touchless * p)}
        note={`${n(touchlessCount)} of ${card.decided} closed without a human`}
        delta={against ? `${signed(Math.round((card.touchless - against.touchless) * 100))}pt` : undefined}
      />
      <Cell
        label="Correct"
        figure={pct(card.accuracy * p)}
        note={`${n(card.correct)} of ${card.decided} matched the controller`}
        delta={against ? `${signed(card.correct - against.correct)}` : undefined}
      />
      <Cell
        label="Over-escalated"
        figure={String(n(card.over))}
        note="sent up something the contract could settle"
        delta={against ? signed(card.over - against.over) : undefined}
      />
      <Cell
        label="Under-escalated"
        figure={String(n(card.under))}
        note="settled something that needed a human — the expensive kind of wrong"
        delta={against ? signed(card.under - against.under) : undefined}
        heavy
      />
    </div>
  );
}
