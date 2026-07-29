'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Scorecard } from '@/lib/rows';
import { autoPick, type RunState } from '@/lib/wire';
import CaseList from './case-list';
import { Label, Notice } from './primitives';
import RunDiff, { type DiffBase } from './run-diff';
import ScorecardStrip from './scorecard';
import TraceTape from './trace-tape';

export default function RunScreen({
  runId,
  contractId,
  initial,
  base,
  previous,
}: {
  runId: string;
  contractId: string | null;
  initial: RunState;
  base: DiffBase | null;
  previous: Scorecard | null;
}) {
  const [state, setState] = useState(initial);
  const [pinned, setPinned] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tape = useRef<HTMLDivElement>(null);
  const inflight = useRef(false);

  const selected = pinned ?? autoPick(state.cases);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const refresh = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      const response = await fetch(`/api/run/${runId}/state?case=${selectedRef.current ?? ''}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`the run endpoint answered ${response.status}`);
      setState((await response.json()) as RunState);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      inflight.current = false;
    }
  }, [runId]);

  useEffect(() => {
    void refresh();
  }, [refresh, selected]);

  useEffect(() => {
    if (state.finished) return;
    const timer = window.setInterval(() => void refresh(), 700);
    return () => clearInterval(timer);
  }, [refresh, state.finished]);

  // While the run is open the tape follows the tail, unless the reader has pinned a case to read.
  // A finished tape lands on its decision however it was reached: the stamp is the payoff, and a
  // reloaded or shared link that opens with it clipped off the bottom buries the thing worth seeing.
  // Keyed on the trace actually rendered, so it fires once per tape rather than on every poll.
  useEffect(() => {
    const el = tape.current;
    if (!el || (pinned && !state.finished)) return;
    el.scrollTop = el.scrollHeight;
  }, [pinned, state.finished, state.traceFor, state.trace.length]);

  const current = state.cases.find((c) => c.id === selected) ?? null;

  return (
    <>
      <ScorecardStrip card={state.scorecard} finished={state.finished} previous={previous} />
      {/* Case by case against a finished baseline, so it waits for the last case: mid-run, every
          case not yet sat counts as neither recovered nor broken, and the panel reads as though the
          amendment bought nothing. */}
      {base && state.finished ? <RunDiff cases={state.cases} base={base} /> : null}
      {error ? (
        <div className="mt-6">
          <Notice
            what={`The screen lost contact with the run: ${error}.`}
            fix={
              state.finished
                ? 'Reload the page. Everything already written to the trace is in the database.'
                : 'It is still retrying. If the server has stopped, restart it and reload — nothing already written to the trace is lost.'
            }
          />
        </div>
      ) : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start lg:gap-10">
        <section>
          <div className="flex items-baseline justify-between gap-3">
            <Label>The cases</Label>
            <span className="font-mono text-micro opacity-60">
              {state.scorecard.decided}/{state.scorecard.total} sat
            </span>
          </div>
          <div className="mt-3">
            {state.cases.length ? (
              <CaseList cases={state.cases} selected={selected} onSelect={setPinned} />
            ) : (
              <Notice
                what="No cases have been entered for this run."
                fix="The runtime writes a case_results row per invoice as it picks it up. If this stays empty, check the server log for the run that started it."
              />
            )}
          </div>
        </section>

        <section className="border border-rule">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule px-4 py-2">
            <Label>{current ? `${current.vendor} · ${current.invoiceNumber}` : 'Trace'}</Label>
            <span className="flex gap-4">
              {pinned ? (
                <button type="button" onClick={() => setPinned(null)} className="text-micro underline underline-offset-4">
                  follow the run
                </button>
              ) : null}
              {current ? (
                <Link href={`/run/${runId}/case/${current.id}`} className="text-micro underline underline-offset-4">
                  open the case file
                </Link>
              ) : null}
            </span>
          </div>
          <div ref={tape} className="max-h-[68vh] overflow-y-auto bg-paper p-4" tabIndex={0}>
            <TraceTape
              steps={state.trace}
              contractId={contractId}
              empty={{
                what: current ? `${current.invoiceNumber} has not been picked up yet.` : 'No case is selected.',
                fix: current
                  ? 'Steps appear here the moment the agent writes them.'
                  : 'Choose a case on the left to read its tape.',
              }}
            />
          </div>
        </section>
      </div>
    </>
  );
}
