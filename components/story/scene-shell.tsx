'use client';

import { motion } from 'motion/react';

/**
 * The one enter/exit transition every scene uses. A slide-plus-fade rather than a bare opacity
 * change — bare fades read as "just appearing" to a lot of viewers rather than as animation, and
 * this app had exactly none until today, so the first impression needs to be unambiguous.
 */
export default function SceneShell({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      className={`mx-auto flex min-h-full flex-col justify-center px-6 py-24 ${className}`}
    >
      {children}
    </motion.section>
  );
}
