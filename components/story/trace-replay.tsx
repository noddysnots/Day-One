'use client';

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import type { TraceStep } from '@/lib/rows';
import { STAMP, inlineArgs, stepArgs, stepTerminal, stepText } from '@/lib/trace';

/** Structural tags — what kind of step this is, no correctness claim. Only the terminal decision
 *  step carries a verdict, rendered separately as VerdictBadge once this replay finishes. */
const STRUCTURAL: Record<string, string> = {
  tool_call: 'Gathering evidence',
  tool_result: 'Evidence returned',
  thought: 'Weighing it',
  text: 'Weighing it',
  reasoning: 'Weighing it',
  decision: 'The call',
};

function Row({ step }: { step: TraceStep }) {
  const label = STRUCTURAL[step.kind] ?? step.kind;

  if (step.kind === 'decision') {
    const terminal = stepTerminal(step);
    return (
      <div>
        <p className="font-mono text-micro tracking-[0.1em] text-paper/50 uppercase">{label}</p>
        {terminal ? (
          <p className="mt-1 font-mono text-small tracking-[0.1em] uppercase text-paper">{STAMP[terminal.action]}</p>
        ) : null}
        {terminal?.rationale ? <p className="mt-2 text-small text-paper/85">{terminal.rationale}</p> : null}
      </div>
    );
  }

  if (step.kind === 'tool_call') {
    return (
      <div>
        <p className="font-mono text-micro tracking-[0.1em] text-paper/50 uppercase">{label}</p>
        <p className="mt-1 font-mono text-small text-paper/80">
          {step.tool_name} <span className="opacity-60">{inlineArgs(stepArgs(step))}</span>
        </p>
      </div>
    );
  }

  if (step.kind === 'thought' || step.kind === 'text' || step.kind === 'reasoning') {
    return (
      <div>
        <p className="font-mono text-micro tracking-[0.1em] text-paper/50 uppercase">{label}</p>
        <p className="mt-1 text-small text-paper/85">{stepText(step)}</p>
      </div>
    );
  }

  return <p className="font-mono text-micro tracking-[0.1em] text-paper/50 uppercase">{label}</p>;
}

/**
 * Real trace steps from an already-finished run, revealed one at a time on an interval — a replay
 * of something that already happened, never a live model call. Tool results are real but numerous;
 * only reasoning, tool calls, and the terminal decision get a beat here, so the centerpiece scene
 * doesn't crawl. Presenter navigation (the global Next/Back controls) never waits on this pacing.
 */
export default function TraceReplay({ steps, onComplete }: { steps: TraceStep[]; onComplete?: () => void }) {
  const featured = steps.filter((s) =>
    ['thought', 'text', 'reasoning', 'tool_call', 'decision'].includes(s.kind),
  );
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (shown >= featured.length) {
      if (featured.length > 0) onComplete?.();
      return;
    }
    const t = window.setTimeout(() => setShown((s) => s + 1), 550);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onComplete is a stable callback the caller memoises
  }, [shown, featured.length]);

  if (!featured.length) {
    return <p className="text-small text-paper/60">Nothing was written to this case's tape.</p>;
  }

  return (
    <ol className="space-y-5 border-l border-paper/20 pl-5">
      {featured.slice(0, shown).map((step) => (
        <motion.li key={step.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35 }}>
          <Row step={step} />
        </motion.li>
      ))}
    </ol>
  );
}
