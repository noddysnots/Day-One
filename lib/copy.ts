import { schemaReady } from './queries';
import { supabaseConfigured } from './supabase';

/** Shared empty-state wording. Every one of these says what happened and what to do next. */

const NO_CREDENTIALS = {
  what: 'There is no database behind this build yet.',
  fix: 'Copy .env.example to .env.local and fill it in, run supabase/schema.sql in the Supabase SQL editor, then npm run seed. Reload and the file will be here.',
};

const NO_SCHEMA = {
  what: 'The database answers, but none of the tables exist yet.',
  fix: 'Run supabase/schema.sql in the Supabase SQL editor, then npm run seed. Nothing on these screens can be filled in until the ledger is there.',
};

/**
 * Distinguishes the three reasons a record can be absent, because "not found" is useless advice
 * when the real problem is that the schema was never applied.
 */
export async function absent(thing: string, fix: string) {
  if (!supabaseConfigured) return NO_CREDENTIALS;
  if (!(await schemaReady())) return NO_SCHEMA;
  return { what: `${thing} is not on file.`, fix };
}

/**
 * The runtime files a failure as a code because it is a column. A reader is owed the sentence, so
 * nothing on a screen ever says over_escalated at a person.
 */
const FAILURE: Record<string, string> = {
  over_escalated: 'it sent up a case the contract could settle',
  under_escalated: 'it settled a case that needed a human',
  wrong_action: 'the wrong call on a case the contract does settle',
  no_decision: 'it worked the case but never decided it',
};

/** Falls back to the code with its underscores opened out, so a new mode is still readable. */
export const inWords = (failureMode: string | null | undefined): string | null =>
  failureMode ? (FAILURE[failureMode] ?? failureMode.replace(/_/g, ' ')) : null;

export type VerdictTag = { tag: string; tone: 'pass' | 'flag' | 'stamp' | 'neutral'; detail: string | null };

/**
 * The short badge for a case's terminal decision, for the story walkthrough. Built entirely from
 * `correct` / `failure_mode` — the same two real fields the scorecard and the diff already use —
 * so a tag is never a claim the data doesn't back. An over-escalation is graded separately from a
 * genuine miss on purpose: sending something up that the contract could have settled costs ten
 * minutes, not money, and reads differently to a reader than a wrong call does.
 */
export function verdictTag(c: { correct: boolean | null; failureMode: string | null }): VerdictTag {
  if (c.correct === true) return { tag: 'Held', tone: 'pass', detail: "matched the controller's own call" };
  if (c.failureMode === 'over_escalated') return { tag: 'Played it safe', tone: 'flag', detail: inWords(c.failureMode) };
  if (c.failureMode === 'under_escalated' || c.failureMode === 'wrong_action') {
    return { tag: 'Missed it', tone: 'stamp', detail: inWords(c.failureMode) };
  }
  if (c.failureMode === 'no_decision') return { tag: 'Stalled', tone: 'neutral', detail: inWords(c.failureMode) };
  return { tag: 'Unresolved', tone: 'neutral', detail: null };
}
