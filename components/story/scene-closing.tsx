'use client';

import Link from 'next/link';
import SceneShell from './scene-shell';

export default function SceneClosing({ contractId }: { contractId: string | null }) {
  return (
    <SceneShell className="items-center text-center">
      <p className="font-mono text-micro tracking-[0.2em] text-paper/50 uppercase">Day one, every day after</p>
      <h2
        className="name-reveal mt-3 font-display leading-[0.95] uppercase"
        style={{ fontSize: 'clamp(2.25rem, 8vw, 5.5rem)' }}
      >
        See the real thing
      </h2>
      <p className="name-reveal mt-5 max-w-lg text-body text-paper/70" style={{ animationDelay: '120ms' }}>
        Every clause cites its source. Every run is graded against what actually happened. Nothing here
        was invented — including this walkthrough.
      </p>
      <div className="name-reveal mt-8 flex flex-wrap items-center justify-center gap-4" style={{ animationDelay: '240ms' }}>
        {contractId ? (
          <Link href={`/contract/${contractId}`} className="hud-corners inline-block bg-paper px-5 py-2.5 font-mono text-small text-ink">
            Read the contract
          </Link>
        ) : null}
        <Link href="/" className="font-mono text-small text-paper/70 underline underline-offset-4 hover:text-paper">
          Back to the handover
        </Link>
      </div>
    </SceneShell>
  );
}
