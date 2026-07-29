'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import type { StoryCase } from '@/lib/story';
import TraceReplay from './trace-replay';
import VerdictBadge from './verdict-tag';

/**
 * One real case: the invoice scales into view, a click reveals the real trace (not a live call),
 * and the terminal verdict lands once the replay's done. Remounted (keyed) per case by the parent,
 * so switching cases naturally replays the entrance every time.
 */
export default function CaseReveal({ storyCase }: { storyCase: StoryCase }) {
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const { wire } = storyCase;

  return (
    <div className="mt-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="border border-paper/20 bg-paper text-ink"
      >
        <div className="flex items-baseline justify-between gap-3 border-b border-rule px-4 py-2">
          <p className="font-mono text-micro tracking-[0.08em] uppercase opacity-60">{wire.invoiceNumber}</p>
          <p className="text-small">{wire.vendor}</p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- real scan, sized to its own aspect ratio so nothing is cropped */}
        <img
          src={wire.doc}
          alt={`Scanned invoice ${wire.invoiceNumber}`}
          className="mx-auto block h-auto max-h-[58vh] w-auto max-w-full"
        />
      </motion.div>

      <div className="mt-8">
        {!running ? (
          <button
            type="button"
            onClick={() => setRunning(true)}
            className="hud-corners bg-paper px-5 py-2.5 font-mono text-small text-ink"
          >
            Run it through the model
          </button>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
            <TraceReplay steps={storyCase.trace} onComplete={() => setDone(true)} />
            {done ? (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mt-6">
                <VerdictBadge verdict={storyCase.verdict} />
              </motion.div>
            ) : null}
          </motion.div>
        )}
      </div>
    </div>
  );
}
