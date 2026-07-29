'use client';

import { useActionState, useState } from 'react';
import { amend } from '@/lib/actions';
import type { ContractSpec, Rule } from '@/lib/contract-schema';
import type { AmendState } from '@/lib/rows';
import { Button, Label, Notice } from './primitives';

const ACTIONS: Rule['then'][] = ['approve', 'reject', 'escalate', 'check'];

function nextId(rules: Rule[]) {
  const highest = rules.reduce((n, r) => Math.max(n, Number(/(\d+)\s*$/.exec(r.id)?.[1] ?? 0)), 0);
  return `R-${String(highest + 1).padStart(2, '0')}`;
}

function RuleFields({ rule, onChange }: { rule: Rule; onChange: (r: Rule) => void }) {
  return (
    <li className="border-t border-rule py-6">
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="font-mono text-small">{rule.id}</span>
        <select
          aria-label={`${rule.id} action`}
          value={rule.then}
          onChange={(e) => onChange({ ...rule, then: e.target.value as Rule['then'] })}
          className="border border-rule bg-paper px-2 py-1 font-mono text-micro tracking-[0.1em] uppercase"
        >
          {ACTIONS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>
      <textarea
        aria-label={`${rule.id} condition`}
        value={rule.when}
        rows={2}
        onChange={(e) => onChange({ ...rule, when: e.target.value })}
        className="mt-3 w-full border border-rule bg-paper p-3 font-display text-head"
      />
      <textarea
        aria-label={`${rule.id} detail`}
        value={rule.detail}
        rows={3}
        onChange={(e) => onChange({ ...rule, detail: e.target.value })}
        className="mt-2 w-full border border-rule bg-paper p-3 text-body"
      />
    </li>
  );
}

export default function ContractEditor({ contractId, spec, version }: { contractId: string; spec: ContractSpec; version: number }) {
  const [rules, setRules] = useState<Rule[]>(spec.rules);
  const [questions, setQuestions] = useState<string[]>(spec.open_questions);
  const [state, action, pending] = useActionState<AmendState, FormData>(amend, { error: null });

  const add = (seed: string) =>
    setRules((rs) => [
      ...rs,
      {
        id: nextId(rs),
        when: seed,
        then: 'escalate',
        detail: '',
        provenance: { source: 'inferred', quote: seed || 'written by hand in the editor' },
        confidence: 1,
      },
    ]);

  const answer = (question: string) => {
    add(question);
    setQuestions((qs) => qs.filter((q) => q !== question));
  };

  const edited: ContractSpec = { ...spec, rules, open_questions: questions };

  return (
    <form action={action}>
      <input type="hidden" name="contractId" value={contractId} />
      <input type="hidden" name="spec" value={JSON.stringify(edited)} />

      <section className={`border p-5 ${questions.length ? 'border-stamp' : 'border-rule'}`}>
        <Label>Unresolved — {questions.length} left</Label>
        {questions.length ? (
          <ul className="mt-3 space-y-3">
            {questions.map((q) => (
              <li key={q} className="flex flex-wrap items-baseline justify-between gap-3">
                <span className="max-w-xl text-body">{q}</span>
                <button type="button" onClick={() => answer(q)} className="text-small underline underline-offset-4">
                  answer this
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-body">Every question has a rule against it now.</p>
        )}
      </section>

      <ol className="mt-10">
        {rules.map((rule, i) => (
          <RuleFields
            key={rule.id}
            rule={rule}
            onChange={(next) => setRules((rs) => rs.map((r, j) => (j === i ? next : r)))}
          />
        ))}
      </ol>

      <div className="mt-8 border-t border-rule pt-8">
        <button type="button" onClick={() => add('')} className="text-small underline underline-offset-4">
          Add a rule
        </button>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-5">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save and test again'}
        </Button>
        <span className="text-small opacity-70">
          The current version stays on file. This writes a new one underneath it.
        </span>
      </div>

      {state.error ? (
        <div className="mt-6 max-w-2xl">
          <Notice what={state.error} fix="Fix the rule it names and save again. Nothing has been written yet." />
        </div>
      ) : null}
    </form>
  );
}
