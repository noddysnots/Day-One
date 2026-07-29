'use client';

import { useState } from 'react';
import type { Rule } from '@/lib/contract-schema';
import { ConfidenceBar } from './primitives';
import Transcript from './transcript';

const SOURCE: Record<Rule['provenance']['source'], string> = {
  voice_note: 'from the voice note',
  email: 'from the email thread',
  invoice_sample: 'read off a sample invoice',
  inferred: 'inferred — nobody said this',
};

export type RuleSources = {
  voice_note: string | null;
  email: string | null;
  invoice_sample: string | null;
};

export default function Rulebook({ rules, sources }: { rules: Rule[]; sources: RuleSources }) {
  const [active, setActive] = useState<Rule | null>(null);
  const source = active?.provenance.source ?? null;
  const panelText = source && source !== 'inferred' ? sources[source] : null;

  return (
    <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_22rem] lg:items-start lg:gap-12">
      <ol>
        {rules.map((rule) => (
          <li
            key={rule.id}
            id={rule.id}
            tabIndex={0}
            onMouseEnter={() => setActive(rule)}
            onFocus={() => setActive(rule)}
            className="border-t border-rule py-7 first:border-t-0 first:pt-0"
          >
            <span className="font-mono text-small">{rule.id}</span>
            <h3 className="mt-1 font-display text-head">When {rule.when.replace(/^when\s+/i, '')}</h3>
            <p className="mt-2 text-body">
              <span className="font-mono text-small tracking-[0.1em] uppercase">then {rule.then}</span>
              <span className="opacity-40"> — </span>
              {rule.detail}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
              <ConfidenceBar value={rule.confidence} />
              <span className="text-micro opacity-70">{SOURCE[rule.provenance.source]}</span>
            </div>
          </li>
        ))}
      </ol>

      <div className="lg:sticky lg:top-8">
        <Transcript
          text={panelText}
          quote={source && source !== 'inferred' ? (active?.provenance.quote ?? null) : null}
          ruleId={active?.id ?? null}
          label={active ? SOURCE[active.provenance.source] : 'Source'}
          empty={
            !active
              ? { what: 'Hover or focus a clause to see the line it came from.' }
              : source === 'inferred'
                ? {
                    what: `${active.id} is inferred — nobody stated it outright, so there is nothing to point at.`,
                    fix: 'Its confidence is capped below 0.7 to reflect that.',
                  }
                : {
                    what: `The ${SOURCE[active.provenance.source].replace('from the ', '').replace('read off a ', '')} was not supplied to this compile.`,
                    fix: 'Nothing is on file to check this clause against.',
                  }
          }
        />
      </div>
    </div>
  );
}
