'use client';

import { motion } from 'motion/react';

const ARM = {
  uncertain: 'M30 38 L14 54',
  relieved: 'M30 38 L10 22',
  forward: 'M30 38 L48 48',
};

export type Pose = keyof typeof ARM;

/** A pictogram, not a portrait — hairline strokes, matching the app's own no-icon, line-only language. */
export default function Figure({ pose, className = 'h-28 w-16 text-paper' }: { pose: Pose; className?: string }) {
  return (
    <svg viewBox="0 0 60 100" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="30" cy="16" r="11" />
      <path d="M30 27 L30 66" />
      <path d="M30 66 L18 98" />
      <path d="M30 66 L42 98" />
      <motion.path animate={{ d: ARM[pose] }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} />
      <path d="M30 38 L46 54" />
    </svg>
  );
}
