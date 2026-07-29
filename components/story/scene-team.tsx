'use client';

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import Figure from './figure';
import SceneShell from './scene-shell';

/** The human stakes, told with two pictogram figures rather than prose alone: Dana leaves no one
 *  trained, and a beat later, they find the thing that helps. Auto-plays once on arrival — a single
 *  short beat, not a loop — so the presenter doesn't have to click through a figure gesture. */
export default function SceneTeam() {
  const [relieved, setRelieved] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setRelieved(true), 1700);
    return () => clearTimeout(t);
  }, []);

  return (
    <SceneShell className="items-center text-center">
      <p className="font-mono text-micro tracking-[0.2em] text-paper/50 uppercase">Monday morning, no Dana</p>
      <h2 className="mt-3 font-display text-title">Priya and Marcus are left holding it</h2>

      <div className="mt-10 flex items-end justify-center gap-12 sm:gap-16">
        <div className="flex flex-col items-center gap-3">
          <Figure pose={relieved ? 'relieved' : 'uncertain'} />
          <p className="font-mono text-micro tracking-[0.08em] text-paper/60 uppercase">Priya</p>
        </div>
        <motion.div
          animate={{ opacity: relieved ? 1 : 0, scale: relieved ? 1 : 0.7 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col items-center gap-2 pb-8"
        >
          <span className="led" />
          <p className="font-mono text-micro tracking-[0.14em] text-paper uppercase">Day one</p>
        </motion.div>
        <div className="flex flex-col items-center gap-3">
          <Figure pose={relieved ? 'relieved' : 'uncertain'} />
          <p className="font-mono text-micro tracking-[0.08em] text-paper/60 uppercase">Marcus</p>
        </div>
      </div>

      <p className="mt-10 max-w-lg text-body text-paper/70">
        {relieved
          ? "Neither of them has Dana's judgment — but the AI reading her handover might."
          : "She trained no one. Whatever they do next, they're guessing."}
      </p>
    </SceneShell>
  );
}
