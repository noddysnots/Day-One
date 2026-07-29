import { invoiceTotals, invoices, lineTotal, vendors } from '@/data/corpus';
import type { ContractSpec, Rule } from './contract-schema';
import { findQuote } from './quote';

/**
 * Where a clause is allowed to have got its quote from, and whether it really did.
 *
 * A quote that is not verbatim in the source it cites is the most damaging failure this product
 * can have — the whole claim is that every clause quotes the line it came from — so it is checked
 * by string search and never by eye. This lives beside the schema rather than inside one script
 * because the compiler test and the compile itself both have to ask the question the same way; two
 * copies of the haystack would let one of them pass on a text the other never showed the model.
 *
 * Note what the voice_note check can and cannot prove. The compiler returns the transcript in the
 * same pass as the rules, so a voice_note quote found in that transcript proves the clause is
 * faithful to what the model heard, not that the model heard correctly. Fidelity to the audio is a
 * separate question and scripts/verify-voice-note.ts is what answers it, by transcribing the file
 * again on a cold call and checking the operating figures survive.
 */

/** The five documents the compiler is shown. Cases 1 to 5. */
export const SAMPLE_CASES = [1, 2, 3, 4, 5];

/** What is actually printed on the rendered sample sheets, so invoice_sample quotes are checkable. */
export function documentText(): string {
  const vendorName = new Map(vendors.map((v) => [v.key, v.name]));
  const terms = (key: string) => vendors.find((v) => v.key === key)?.payment_terms;

  return invoices
    .filter((i) => i.case_no !== null && SAMPLE_CASES.includes(i.case_no))
    .map((inv) => {
      const t = invoiceTotals(inv);
      const lines = inv.line_items
        .map((l) => `${l.sku} ${l.description} ${l.qty} ${l.unit_price.toFixed(2)} ${lineTotal(l).toFixed(2)}`)
        .join('\n');
      return [
        vendorName.get(inv.vendor),
        `INVOICE ${inv.invoice_number}`,
        `Date ${inv.invoice_date}`,
        `Terms ${terms(inv.vendor)}`,
        'BILL TO Aldercroft Manufacturing Co. 1400 Foundry Road Cleveland, OH 44115',
        `PURCHASE ORDER ${inv.po_number_ref ?? 'none supplied'}`,
        'ITEM DESCRIPTION QTY UNIT PRICE AMOUNT',
        lines,
        `Subtotal ${t.subtotal.toFixed(2)}`,
        t.tax > 0 ? `Sales tax ${t.tax.toFixed(2)}` : '',
        `Total due ${t.total.toFixed(2)}`,
        `Payment terms: ${terms(inv.vendor)}. Remit to ${vendorName.get(inv.vendor)}.`,
        'Questions regarding this invoice should be directed to accounts receivable.',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');
}

export type ProvenanceSource = Rule['provenance']['source'];

/** The texts actually put in front of the model, as the compile saw them. */
export type ProvenanceSources = {
  emailThread: string | null;
  /** What the compiler transcribed the audio to, or null when no audio was supplied. */
  transcript: string | null;
};

export type QuoteVerdict = {
  ruleId: string;
  source: ProvenanceSource;
  quote: string;
  /** False only when the clause cites a real source and the quote is not in it. */
  verbatim: boolean;
  /** An `inferred` clause is not claiming to quote anything, so there is nothing to check. */
  checked: boolean;
  /** A source that does hold the quote, when the cited one does not. Names a mis-citation. */
  foundInstead: ProvenanceSource | null;
  /** Set when the clause cites a source that was never supplied to this compile. */
  sourceAbsent: boolean;
};

export function verifyProvenance(spec: ContractSpec, sources: ProvenanceSources): QuoteVerdict[] {
  const haystacks: Record<Exclude<ProvenanceSource, 'inferred'>, string | null> = {
    email: sources.emailThread,
    voice_note: sources.transcript,
    invoice_sample: documentText(),
  };

  return spec.rules.map((rule) => {
    const { source, quote } = rule.provenance;
    const base = { ruleId: rule.id, source, quote };

    if (source === 'inferred') {
      return { ...base, verbatim: true, checked: false, foundInstead: null, sourceAbsent: false };
    }

    const cited = haystacks[source];
    if (cited === null) {
      return { ...base, verbatim: false, checked: true, foundInstead: null, sourceAbsent: true };
    }

    if (findQuote(cited, quote)) {
      return { ...base, verbatim: true, checked: true, foundInstead: null, sourceAbsent: false };
    }

    const elsewhere = (Object.keys(haystacks) as Exclude<ProvenanceSource, 'inferred'>[]).find(
      (k) => k !== source && haystacks[k] && findQuote(haystacks[k]!, quote),
    );
    return {
      ...base,
      verbatim: false,
      checked: true,
      foundInstead: elsewhere ?? null,
      sourceAbsent: false,
    };
  });
}

/**
 * Corrects a compiled spec's provenance against the sources actually supplied, rather than
 * trusting what the model labelled. A quote genuinely verbatim in a different source than the one
 * cited gets relabelled to the source that actually holds it. A quote that is not verbatim
 * anywhere is not a fabricated citation — it is marked `inferred` and its confidence is capped
 * below 0.7, since nothing was really quoted.
 */
export function correctProvenance(rules: Rule[], sources: ProvenanceSources): Rule[] {
  const haystacks: Record<Exclude<ProvenanceSource, 'inferred'>, string | null> = {
    email: sources.emailThread,
    voice_note: sources.transcript,
    invoice_sample: documentText(),
  };

  return rules.map((rule) => {
    const { source, quote } = rule.provenance;
    if (source === 'inferred') return rule;

    const cited = haystacks[source];
    if (cited && findQuote(cited, quote)) return rule;

    const elsewhere = (Object.keys(haystacks) as Exclude<ProvenanceSource, 'inferred'>[]).find(
      (k) => k !== source && haystacks[k] && findQuote(haystacks[k]!, quote),
    );
    if (elsewhere) {
      return { ...rule, provenance: { ...rule.provenance, source: elsewhere } };
    }

    return {
      ...rule,
      provenance: { ...rule.provenance, source: 'inferred' },
      confidence: Math.min(rule.confidence, 0.65),
    };
  });
}

/** One line per clause, for a script that has to print the whole verdict. */
export function describeVerdict(v: QuoteVerdict): string {
  if (!v.checked) return `${v.ruleId} [inferred] not a quotation — nothing to verify`;
  if (v.verbatim) return `${v.ruleId} [${v.source}] verbatim`;
  if (v.sourceAbsent) return `${v.ruleId} [${v.source}] CITES A SOURCE THIS COMPILE NEVER SAW`;
  if (v.foundInstead) return `${v.ruleId} [${v.source}] NOT in ${v.source} — but is verbatim in ${v.foundInstead}`;
  return `${v.ruleId} [${v.source}] NOT FOUND in ${v.source}: ${JSON.stringify(v.quote.slice(0, 100))}`;
}
