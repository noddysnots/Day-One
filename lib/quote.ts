/** Typographic quotes and dashes differ between the transcript and the extracted clause. */
const flatten = (s: string) => s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, '-');

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Locate a clause's source phrase in the transcript. Tries it verbatim, then again allowing any
 * whitespace between words, because the compiler quotes across line wraps. Returns null when the
 * phrase genuinely is not there — a paraphrase, or a clause the compiler inferred — and the panel
 * says so rather than highlighting the wrong sentence.
 */
export function findQuote(transcript: string, quote: string): [number, number] | null {
  const haystack = flatten(transcript);
  const needle = flatten(quote).trim();
  if (needle.length < 4) return null;

  const direct = haystack.indexOf(needle);
  if (direct !== -1) return [direct, direct + needle.length];

  const words = needle.split(/\s+/).map(escapeRe);
  if (words.length < 2) return null;
  const match = new RegExp(words.join('\\s+'), 'i').exec(haystack);
  return match ? [match.index, match.index + match[0].length] : null;
}
