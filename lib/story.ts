import type { Contract, Run, Scorecard, TraceStep } from './rows';
import type { WireCase } from './wire';
import type { VerdictTag } from './copy';
import type { DiffBase } from '@/components/run-diff';

/**
 * Support code for the /story walkthrough only — parsing the real email thread into discrete
 * messages, and picking a handful of real cases to feature by outcome rather than showing all
 * fifteen. Nothing here talks to the database; app/story/page.tsx owns the fetching and calls
 * these as pure functions on what it already has.
 */

export type EmailMessage = { from: string; to: string; cc: string | null; subject: string; date: string; body: string };

const HEADER = /^(From|To|Cc|Subject|Date):\s*(.*)$/;

/** Splits the handover thread on its `---` message separators and lifts the header block off each. */
export function parseEmailThread(md: string): EmailMessage[] {
  // The file on disk is CRLF. Left alone, every line keeps a trailing \r that the header regex's
  // `$` anchor never matches, so parsing would silently fail on every line and dump the whole raw
  // block into `body` instead — caught by actually looking at the walkthrough, not by the types.
  return md
    .replace(/\r\n/g, '\n')
    .split(/^-{3,}$/m)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split('\n');
      const header: Record<string, string> = {};
      let i = 0;
      for (; i < lines.length; i++) {
        const m = HEADER.exec(lines[i]);
        if (!m) break;
        header[m[1].toLowerCase()] = m[2].trim();
      }
      while (i < lines.length && lines[i].trim() === '') i++;
      return {
        from: header.from ?? '',
        to: header.to ?? '',
        cc: header.cc ?? null,
        subject: header.subject ?? '',
        date: header.date ?? '',
        body: lines.slice(i).join('\n').trim(),
      };
    });
}

export type Representative = { clean: WireCase | null; judged: WireCase | null; miss: WireCase | null };

/**
 * Three cases, not fifteen — picked by outcome rather than by a hardcoded invoice number, so a
 * reseed doesn't quietly break the story. `clean` is a correct approve, `judged` is a correct
 * escalate or reject (the contract knowing what it doesn't know), `miss` is a genuine wrong call.
 * Any slot can come back null if the run doesn't have that shape — the scenes render only what's
 * real.
 */
export function pickRepresentative(cases: WireCase[]): Representative {
  const used = new Set<string>();
  const take = (predicate: (c: WireCase) => boolean): WireCase | null => {
    const found = cases.find((c) => c.action !== null && !used.has(c.id) && predicate(c));
    if (found) used.add(found.id);
    return found ?? null;
  };

  const clean = take((c) => c.correct === true && c.action === 'approve');
  const judged = take((c) => c.correct === true && c.action === 'escalate') ?? take((c) => c.correct === true && c.action === 'reject');
  const miss = take((c) => c.correct === false);

  return { clean, judged, miss };
}

/**
 * The verdict is resolved server-side (in app/story/page.tsx, via lib/copy.ts#verdictTag) and
 * carried here as plain data rather than recomputed client-side — lib/copy.ts transitively reaches
 * the Supabase client through lib/queries.ts, which has no business in a client bundle.
 */
export type StoryCase = { wire: WireCase; trace: TraceStep[]; verdict: VerdictTag };

export type StoryData = {
  root: { contract: Contract; run: Run; scorecard: Scorecard } | null;
  amended: { contract: Contract; run: Run; scorecard: Scorecard; cases: WireCase[]; diffBase: DiffBase } | null;
  cases: { clean: StoryCase | null; judged: StoryCase | null; miss: StoryCase | null };
  voice: { src: string; type: string } | null;
  transcript: string | null;
  emailMessages: EmailMessage[];
};
