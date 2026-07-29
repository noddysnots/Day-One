'use client';

import { useEffect, useRef } from 'react';
import { findQuote } from '@/lib/quote';
import { Label, Notice } from './primitives';

/** The source document behind the hovered clause, with the phrase held under the reader's eye. */
export default function Transcript({
  text,
  quote,
  ruleId,
  label = 'Source',
  empty,
}: {
  text: string | null;
  quote: string | null;
  ruleId: string | null;
  label?: string;
  /** What to say when there is nothing to show — no clause hovered, or its source isn't on file. */
  empty?: { what: string; fix?: string };
}) {
  const mark = useRef<HTMLElement>(null);
  const span = text && quote ? findQuote(text, quote) : null;

  useEffect(() => {
    mark.current?.scrollIntoView({ block: 'center', behavior: 'auto' });
  }, [ruleId]);

  if (!text) {
    return (
      <Notice
        what={empty?.what ?? 'No source is filed with this rulebook.'}
        fix={
          empty?.fix ??
          'The compiler stores what it read in contracts.transcript. Compile again once the intake is complete and the clauses will link back to their source.'
        }
      />
    );
  }

  return (
    <div className="border border-rule">
      <div className="flex items-baseline justify-between gap-3 border-b border-rule px-4 py-2">
        <Label>{label}</Label>
        {ruleId && !span ? (
          <span className="text-micro opacity-70">{ruleId} paraphrases; no exact phrase to point at</span>
        ) : null}
      </div>
      <div className="max-h-[70vh] overflow-y-auto p-4 text-small whitespace-pre-wrap" tabIndex={0}>
        {span ? (
          <>
            {text.slice(0, span[0])}
            <mark ref={mark} className="bg-rule text-ink">
              {text.slice(span[0], span[1])}
            </mark>
            {text.slice(span[1])}
          </>
        ) : (
          text
        )}
      </div>
    </div>
  );
}
