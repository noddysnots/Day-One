'use client';

import { motion } from 'motion/react';

/**
 * The one enter/exit transition every scene uses. `absolute inset-0` on purpose, not normal flow:
 * without it, an entering scene and an exiting scene both occupy document flow simultaneously
 * during the transition, stacking one below the other rather than overlapping — which pushes the
 * new scene's content (and its buttons) down the page, out from under the viewport, for the
 * duration of the transition. `pointer-events-none` on exit means the outgoing scene can never
 * intercept a click meant for the one arriving, even if it's slow to finish fading out.
 */
export default function SceneShell({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18, pointerEvents: 'none' }}
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      className={`absolute inset-0 mx-auto flex flex-col justify-center overflow-y-auto px-6 py-24 ${className}`}
    >
      {children}
    </motion.section>
  );
}
