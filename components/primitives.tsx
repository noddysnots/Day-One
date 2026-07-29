import Link from 'next/link';
import { usd } from '@/lib/format';

/** Machine figures are always mono and always aligned. */
export function Amount({ value, className = '' }: { value: number | null | undefined; className?: string }) {
  return <span className={`font-mono tabular-nums ${className}`}>{usd(value)}</span>;
}

export function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-micro tracking-[0.14em] uppercase opacity-60">{children}</span>;
}

/**
 * Every empty and error state on the site. Says what happened, then what to do about it.
 * `edge="stamp"` spends the one permitted --stamp on the screen.
 */
export function Notice({
  what,
  fix,
  edge = 'rule',
}: {
  what: string;
  fix?: React.ReactNode;
  edge?: 'rule' | 'stamp';
}) {
  return (
    <div className={`border p-5 ${edge === 'stamp' ? 'border-stamp' : 'border-rule'}`}>
      <p className="text-body font-medium">{what}</p>
      {fix ? <p className="mt-2 text-small opacity-80">{fix}</p> : null}
    </div>
  );
}

/** A whole screen that has nothing to show. Still a screen, still says what to do. */
export function EmptyScreen({ title, what, fix }: { title: string; what: string; fix?: string }) {
  return (
    <main className="mx-auto max-w-2xl px-5 py-20 sm:px-8">
      <Label>Day One</Label>
      <h1 className="mt-3 font-display text-title">{title}</h1>
      <div className="mt-8">
        <Notice what={what} fix={fix} />
      </div>
      <p className="mt-8 text-small">
        <Link href="/" className="underline underline-offset-4">
          Back to the handover
        </Link>
      </p>
    </main>
  );
}

export function Button({ children, className = '', ...rest }: React.ComponentProps<'button'>) {
  return (
    <button
      {...rest}
      className={`hud-corners bg-ink px-5 py-2.5 font-mono text-small tracking-[0.04em] text-paper transition-opacity disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}

/** Same control surface as Button, for a <Link> that has to look like the one primary action. */
export const LINK_BUTTON =
  'hud-corners inline-block bg-ink px-5 py-2.5 font-mono text-small tracking-[0.04em] text-paper transition-opacity hover:opacity-90';

/** Confidence as a hairline bar. 0 to 1, read left to right, no colour spent on it. */
export function ConfidenceBar({ value }: { value: number }) {
  const filled = Math.round(Math.max(0, Math.min(1, value)) * 24);
  return (
    <span className="inline-flex items-center gap-2">
      <span className="flex h-[7px] w-[86px] border border-rule" aria-hidden>
        <span className="bg-ink" style={{ width: `${(filled / 24) * 100}%` }} />
      </span>
      <span className="font-mono text-micro tabular-nums">{value.toFixed(2)}</span>
    </span>
  );
}
