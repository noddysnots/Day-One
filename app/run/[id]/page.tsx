import Link from 'next/link';
import { EmptyScreen, Label, LINK_BUTTON } from '@/components/primitives';
import PrimaryAction from '@/components/primary-action';
import RunScreen from '@/components/run-screen';
import Stepper from '@/components/stepper';
import type { DiffBase } from '@/components/run-diff';
import { absent } from '@/lib/copy';
import type { Scorecard } from '@/lib/rows';
import { getCases, getContract, getRun, getTrace, latestRunFor, testCaseCount } from '@/lib/queries';
import { score } from '@/lib/score';
import { autoPick, toWire, type RunState } from '@/lib/wire';

export const dynamic = 'force-dynamic';

/** When this contract amends another, line the run up against the last test the parent sat. */
async function baseline(parentId: string, thisRunId: string) {
  const parentRun = await latestRunFor(parentId);
  if (!parentRun || parentRun.id === thisRunId) return { base: null, previous: null };
  const [parent, cases, expected] = await Promise.all([getContract(parentId), getCases(parentRun.id), testCaseCount()]);
  if (!cases.length) return { base: null, previous: null };
  const base: DiffBase = {
    runId: parentRun.id,
    version: parent?.version ?? 1,
    cases: Object.fromEntries(cases.map((c) => [c.invoice.invoice_number, { action: c.action, correct: c.correct }])),
  };
  return { base, previous: score(cases, expected) as Scorecard };
}

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await getRun(id);
  if (!run) {
    const copy = await absent(
      'That driving test',
      'Open a rulebook and start a test from there; it will be filed under a new id.',
    );
    return <EmptyScreen title="No such test" {...copy} />;
  }

  const [cases, contract, expected] = await Promise.all([
    getCases(id),
    run.contract_id ? getContract(run.contract_id) : null,
    testCaseCount(),
  ]);
  const wire = cases.map(toWire);
  const selected = autoPick(wire);
  const { base, previous } = contract?.parent_id ? await baseline(contract.parent_id, id) : { base: null, previous: null };

  const initial: RunState = {
    finished: Boolean(run.finished_at),
    scorecard: score(cases, expected),
    cases: wire,
    traceFor: selected,
    trace: selected ? await getTrace(selected) : [],
  };

  return (
    <>
      <Stepper current={contract?.parent_id ? 'rerun' : 'run'} />
      <main className="mx-auto max-w-7xl px-5 pt-12 pb-32 sm:px-8">
        <Label>
          Driving test · {contract ? `${contract.name} version ${contract.version}` : 'contract unknown'} ·{' '}
          {run.finished_at ? 'complete' : 'in progress'}
        </Label>
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-4">
          <h1 className="font-display text-title">Probation</h1>
          {contract ? (
            <Link href={`/contract/${contract.id}`} className="text-small underline underline-offset-4">
              Read the contract
            </Link>
          ) : null}
        </div>
        <p className="mt-4 mb-8 max-w-2xl text-body">
          The new hire working a fortnight of invoices against that contract.
        </p>

        <RunScreen runId={id} contractId={run.contract_id} initial={initial} base={base} previous={previous} />

        {contract ? (
          <PrimaryAction>
            <Link href={`/contract/${contract.id}/edit`} className={LINK_BUTTON}>
              Amend the contract
            </Link>
          </PrimaryAction>
        ) : null}
      </main>
    </>
  );
}
