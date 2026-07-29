/** Explicit locale everywhere: the server and the browser must format money identically. */
const usdFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const usd = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `$${usdFmt.format(n)}`);

export const pct = (fraction: number) => `${Math.round(fraction * 100)}%`;

/**
 * HH:MM:SS straight off the ISO string. Sliced, not parsed, so it cannot drift by timezone. Used
 * for the compile log, whose lines are seconds apart and need no finer reading.
 */
export function clock(iso: string | null | undefined): string {
  if (!iso) return '--:--:--';
  const t = iso.indexOf('T');
  if (t === -1) return '--:--:--';
  return iso.slice(t + 1).match(/^\d{2}:\d{2}:\d{2}/)?.[0] ?? '--:--:--';
}

/** Postgres hands back microseconds, and the fraction can be short when it ends in zeroes. */
const TIME = /^(\d{2}):(\d{2}:\d{2})(?:\.(\d+))?/;

function timeOf(iso: string | null | undefined): { hour: string; rest: string } | null {
  if (!iso) return null;
  const t = iso.indexOf('T');
  if (t === -1) return null;
  const m = iso.slice(t + 1).match(TIME);
  return m ? { hour: m[1], rest: `${m[2]}.${(m[3] ?? '').padEnd(3, '0').slice(0, 3)}` } : null;
}

/**
 * The clock for one tape, to the millisecond. The milliseconds are the whole point of the gutter:
 * steps land inside the same second constantly, and without them the column repeats itself and
 * cannot order the rows beside it.
 *
 * A run is minutes long, so a tape that does not cross an hour prints the same two digits at the
 * front of every row and says nothing by them. Dropping those pays for the milliseconds out of
 * the gutter's own width, rather than out of the type scale or the fit at 390px. A tape that does
 * cross an hour keeps them and is three characters wider.
 */
export function tapeClock(times: (string | null | undefined)[]) {
  const hours = new Set(times.map((t) => timeOf(t)?.hour).filter(Boolean));
  const withHour = hours.size > 1;
  return {
    withHour,
    read(iso: string | null | undefined): string {
      const at = timeOf(iso);
      if (!at) return withHour ? '--:--:--.---' : '--:--.---';
      return withHour ? `${at.hour}:${at.rest}` : at.rest;
    },
  };
}

/** 14 April 2025, UTC, no locale surprises. */
export function longDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** The uploaded scan once the seed has run, the locally rendered sheet before that. */
export const docSrc = (inv: { doc_url?: string | null; invoice_number: string }) =>
  inv.doc_url || `/docs/${inv.invoice_number}.jpg`;

export const RULE_ID = /\b([A-Z]-\d{1,3})\b/g;

/** Splits prose into text and rule-id tokens so rule citations can be linked in place. */
export function splitRuleIds(text: string): { text: string; ruleId?: string }[] {
  const out: { text: string; ruleId?: string }[] = [];
  let last = 0;
  for (const m of text.matchAll(RULE_ID)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: m[1], ruleId: m[1] });
    last = m.index + m[1].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}
