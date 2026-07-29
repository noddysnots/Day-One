'use client';

import { useEffect, useState } from 'react';
import type { Scorecard } from '@/lib/rows';

/**
 * Same count-up spirit as `useSettling` in components/scorecard.tsx, duplicated rather than
 * extracted into a shared hook — deliberately, to avoid touching a production component that
 * isn't otherwise in scope for this build.
 */
function useCountUp(target: number): number {
  const [p, setP] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setP(1);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const v = Math.min(1, (now - start) / 700);
      setP(v);
      if (v < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
  return target * p;
}

function Bar({ label, before, after, format }: { label: string; before: number; after: number; format: (n: number) => string }) {
  const beforeVal = useCountUp(before);
  const afterVal = useCountUp(after);
  const max = Math.max(before, after, 1);

  return (
    <div>
      <p className="font-mono text-micro tracking-[0.1em] text-paper/60 uppercase">{label}</p>
      <div className="mt-2 space-y-1.5">
        <div className="flex items-center gap-3">
          <span className="w-7 font-mono text-micro text-paper/50">v1</span>
          <div className="h-2.5 flex-1 bg-paper/10">
            <div className="h-full bg-paper/40" style={{ width: `${(beforeVal / max) * 100}%` }} />
          </div>
          <span className="w-14 text-right font-mono text-micro tabular-nums text-paper/70">{format(beforeVal)}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="w-7 font-mono text-micro text-paper/50">v2</span>
          <div className="h-2.5 flex-1 bg-paper/10">
            <div className="h-full bg-pass" style={{ width: `${(afterVal / max) * 100}%` }} />
          </div>
          <span className="w-14 text-right font-mono text-micro tabular-nums text-paper">{format(afterVal)}</span>
        </div>
      </div>
    </div>
  );
}

export default function BarCompare({ before, after }: { before: Scorecard; after: Scorecard }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <Bar label="Correct" before={before.correct} after={after.correct} format={(n) => `${Math.round(n)}/${after.total}`} />
      <Bar
        label="Touchless"
        before={before.touchless * 100}
        after={after.touchless * 100}
        format={(n) => `${Math.round(n)}%`}
      />
      <Bar label="Over-escalated" before={before.over} after={after.over} format={(n) => `${Math.round(n)}`} />
      <Bar label="Under-escalated" before={before.under} after={after.under} format={(n) => `${Math.round(n)}`} />
    </div>
  );
}
