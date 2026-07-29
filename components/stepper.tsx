const STAGES = [
  { key: 'intake', label: 'Intake' },
  { key: 'contract', label: 'Contract' },
  { key: 'run', label: 'Probation run' },
  { key: 'amend', label: 'Amend' },
  { key: 'rerun', label: 'Re-run' },
] as const;

export type Stage = (typeof STAGES)[number]['key'];

/** Same component on every screen. Says where this screen sits in the five-stage pipeline. */
export default function Stepper({ current }: { current: Stage }) {
  return (
    <nav aria-label="Progress" className="border-b border-rule bg-paper">
      <ol className="mx-auto flex h-10 max-w-7xl items-center gap-2 px-5 font-mono text-micro tracking-[0.1em] uppercase sm:px-8">
        {STAGES.map((stage, i) => {
          const isCurrent = stage.key === current;
          return (
            <li key={stage.key} className="flex items-center gap-2">
              {i > 0 ? (
                <span aria-hidden className="opacity-30">
                  →
                </span>
              ) : null}
              <span
                aria-current={isCurrent ? 'step' : undefined}
                className={`inline-flex items-center gap-1.5 ${isCurrent ? 'opacity-100' : 'opacity-40'}`}
              >
                {isCurrent ? <span aria-hidden className="led" /> : null}
                {stage.label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
