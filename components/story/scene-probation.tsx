'use client';

import { useState } from 'react';
import type { StoryCase } from '@/lib/story';
import CaseReveal from './case-reveal';
import SceneShell from './scene-shell';

type Cases = { clean: StoryCase | null; judged: StoryCase | null; miss: StoryCase | null };

const SLOTS: { key: keyof Cases; label: string }[] = [
  { key: 'clean', label: 'The clean case' },
  { key: 'judged', label: 'The judgment call' },
  { key: 'miss', label: 'The miss' },
];

/** Three real cases, picked by outcome. Its own in-scene tabs, separate from the global scene nav. */
export default function SceneProbation({ cases }: { cases: Cases }) {
  const available = SLOTS.filter((s) => cases[s.key]);
  const [i, setI] = useState(0);
  const current = available[i];

  return (
    <SceneShell className="max-w-5xl">
      <p className="font-mono text-micro tracking-[0.2em] text-paper/50 uppercase">Meanwhile — day one, on probation</p>
      <h2 className="mt-3 font-display text-title">The new hire works the invoices</h2>

      {available.length ? (
        <>
          <div className="mt-6 flex flex-wrap gap-2">
            {available.map((s, idx) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setI(idx)}
                className={`border px-3 py-1.5 font-mono text-micro tracking-[0.08em] uppercase ${
                  idx === i ? 'border-paper bg-paper text-ink' : 'border-paper/30 text-paper/60'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          {current ? <CaseReveal key={current.key} storyCase={cases[current.key]!} /> : null}
        </>
      ) : (
        <p className="mt-8 text-body text-paper/70">No decided cases are on file for this run yet.</p>
      )}
    </SceneShell>
  );
}
