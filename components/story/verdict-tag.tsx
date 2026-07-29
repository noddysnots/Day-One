import type { VerdictTag } from '@/lib/copy';

const TONE_CLASS: Record<VerdictTag['tone'], string> = {
  pass: 'border-pass text-pass',
  flag: 'border-flag text-flag',
  stamp: 'border-stamp text-stamp',
  neutral: 'border-paper/40 text-paper/70',
};

/**
 * Purely presentational — takes an already-resolved verdict rather than computing one, so this
 * component never has to import lib/copy.ts's runtime code (which reaches the Supabase client
 * through lib/queries.ts) into the client bundle.
 */
export default function VerdictBadge({ verdict }: { verdict: VerdictTag }) {
  return (
    <div className={`inline-block border px-4 py-2 ${TONE_CLASS[verdict.tone]}`}>
      <p className="font-mono text-small tracking-[0.1em] uppercase">{verdict.tag}</p>
      {verdict.detail ? <p className="mt-1 text-micro opacity-80">{verdict.detail}</p> : null}
    </div>
  );
}
