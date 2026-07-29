'use client';

import DocThumb from './doc-thumb';
import { Amount } from './primitives';
import type { WireCase } from '@/lib/wire';

function Status({ c }: { c: WireCase }) {
  if (!c.action) {
    return <span className="font-mono text-micro opacity-50">{c.steps ? `working · ${c.steps}` : 'pending'}</span>;
  }
  const mark = c.correct === null ? '·' : c.correct ? '✓' : '✗';
  const tone = c.correct === null ? 'opacity-50' : c.correct ? 'text-pass' : 'text-flag';
  return (
    <span className="font-mono text-micro">
      {c.action}{' '}
      <span className={tone} aria-label={c.correct === null ? 'not marked' : c.correct ? 'correct' : 'wrong'}>
        {mark}
      </span>
    </span>
  );
}

export default function CaseList({
  cases,
  selected,
  onSelect,
}: {
  cases: WireCase[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <ol className="border-t border-rule">
      {cases.map((c) => (
        <li key={c.id} className={selected === c.id ? 'bg-rule' : ''}>
          <button
            type="button"
            onClick={() => onSelect(c.id)}
            aria-current={selected === c.id}
            className="grid w-full grid-cols-[30px_1fr_auto] items-center gap-3 border-b border-rule px-2 py-2 text-left"
          >
            <DocThumb
              src={c.doc}
              alt={`Invoice ${c.invoiceNumber}`}
              className="aspect-[3/4] w-[30px] border border-rule object-cover object-top"
            />
            <span className="min-w-0">
              <span className="block truncate text-small">{c.vendor}</span>
              <span className="block font-mono text-micro opacity-60">
                {c.caseNo ? `${String(c.caseNo).padStart(2, '0')} · ` : ''}
                {c.invoiceNumber}
              </span>
            </span>
            <span className="text-right">
              <Amount value={c.total} className="block text-small" />
              <Status c={c} />
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}
