'use client';

import { useEffect, useState } from 'react';
import type { StoryData } from '@/lib/story';
import SceneShell from './scene-shell';

const SOURCES = ['Voice note', 'Email thread', '17 invoices'];

/**
 * The bridge the walkthrough was missing: what Dana left behind doesn't just sit there — it becomes
 * the rulebook the AI runs on. The rule count ticking up is real (root.contract.spec.rules.length),
 * not a fabricated animation beat.
 */
export default function SceneCompile({ root }: { root: StoryData['root'] }) {
  const ruleCount = root?.contract.spec?.rules.length ?? 0;
  const openCount = root?.contract.spec?.open_questions.length ?? 0;
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!ruleCount) return;
    const id = window.setInterval(() => {
      setCount((c) => {
        if (c >= ruleCount) {
          window.clearInterval(id);
          return c;
        }
        return c + 1;
      });
    }, 90);
    return () => window.clearInterval(id);
  }, [ruleCount]);

  return (
    <SceneShell className="max-w-2xl items-center text-center">
      <p className="font-mono text-micro tracking-[0.2em] text-paper/50 uppercase">Everything she left behind</p>
      <h2 className="mt-3 font-display text-title">Becomes a rulebook the AI can follow</h2>

      {ruleCount ? (
        <>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {SOURCES.map((s) => (
              <span
                key={s}
                className="border border-paper/30 px-3 py-1.5 font-mono text-micro tracking-[0.06em] text-paper/70 uppercase"
              >
                {s}
              </span>
            ))}
          </div>

          <p className="mt-10 font-mono text-title tabular-nums text-paper" aria-hidden>
            R-{String(count).padStart(2, '0')}
          </p>
          <p className="mt-2 font-mono text-micro tracking-[0.1em] text-paper/60 uppercase">
            {count >= ruleCount
              ? `${ruleCount} rules extracted${openCount ? `, ${openCount} left open` : ''} — every one cites the line it came from`
              : 'extracting operating rules…'}
          </p>
        </>
      ) : (
        <p className="mt-8 text-body text-paper/70">No compiled rulebook is on file yet.</p>
      )}
    </SceneShell>
  );
}
