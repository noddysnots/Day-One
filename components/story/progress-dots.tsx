'use client';

const LABELS = ['Day one', 'The team', 'The voice note', 'The email', 'The rulebook', 'Probation', 'The improvement', 'Try it'];

/** Presenter-facing position indicator. Purely state, no motion-dependent content — always legible. */
export default function ProgressDots({
  total,
  current,
  onSelect,
}: {
  total: number;
  current: number;
  onSelect: (i: number) => void;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-20 flex flex-col items-center gap-3 px-6 sm:bottom-10">
      <div className="pointer-events-auto flex items-center gap-2">
        {Array.from({ length: total }).map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Go to ${LABELS[i] ?? `scene ${i + 1}`}`}
            aria-current={i === current ? 'step' : undefined}
            onClick={() => onSelect(i)}
            className={`h-1.5 w-6 border border-paper/50 transition-opacity ${
              i === current ? 'bg-paper opacity-100' : 'bg-transparent opacity-40 hover:opacity-70'
            }`}
          />
        ))}
      </div>
      <p className="font-mono text-micro tracking-[0.14em] text-paper/60 uppercase">{LABELS[current]}</p>
    </div>
  );
}
