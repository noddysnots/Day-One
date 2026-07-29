import type { ReactNode } from 'react';

/**
 * Cream instrument frame for intake only. Status rail in mono, corner ticks, no glow.
 * Splash and /story do not use this — keep those screens untouched.
 */
export default function InstrumentPanel({
  status,
  children,
  className = '',
  active = false,
}: {
  status?: string;
  children: ReactNode;
  className?: string;
  active?: boolean;
}) {
  return (
    <div className={`hud-corners border bg-panel ${active ? 'border-ink' : 'border-rule'} ${className}`}>
      {status ? (
        <div className="flex items-center justify-between gap-3 border-b border-rule px-4 py-2 font-mono text-micro tracking-[0.1em] uppercase">
          <span className="inline-flex items-center gap-2">
            <span className="led" aria-hidden />
            {status}
          </span>
          <span className="opacity-40">LIVE</span>
        </div>
      ) : null}
      {children}
    </div>
  );
}
