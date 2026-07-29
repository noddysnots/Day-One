import Link from 'next/link';
import Rulebook from '@/components/rulebook';
import RunButton from '@/components/run-button';
import Stepper from '@/components/stepper';
import { EmptyScreen, Label, Notice } from '@/components/primitives';
import { absent } from '@/lib/copy';
import { longDate } from '@/lib/format';
import { emailThread } from '@/lib/intake';
import { documentText, correctProvenance } from '@/lib/provenance';
import { getContract, latestRunFor } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contract = await getContract(id);

  if (!contract) {
    const copy = await absent('That rulebook', 'Compile one from the handover and it will be filed under a new id.');
    return <EmptyScreen title="No such rulebook" {...copy} />;
  }
  if (!contract.spec) {
    return (
      <EmptyScreen
        title="The rulebook will not parse"
        what="A contract is filed under this id, but its spec does not match ContractSpec."
        fix={`Zod reported: ${contract.specError}. Compile again, or repair the row in the contracts table.`}
      />
    );
  }

  const spec = contract.spec;
  const lastRun = await latestRunFor(contract.id);
  const emailText = await emailThread();
  const rules = correctProvenance(spec.rules, { emailThread: emailText, transcript: contract.transcript });

  return (
    <>
      <Stepper current="contract" />
      <main className="mx-auto max-w-6xl px-5 pt-14 pb-32 sm:px-8">
        <Label>
          Employment contract · version {contract.version}
          {contract.parent_id ? ' · amended' : ''} · filed {longDate(contract.created_at)}
        </Label>
        <h1 className="mt-3 font-display text-title">{contract.name}</h1>
        <p className="mt-4 max-w-2xl text-body">What the AI extracted. Two things nobody ever settled.</p>

        <section className={`mt-8 border p-5 ${spec.open_questions.length ? 'border-stamp' : 'border-rule'}`}>
          <Label>Unresolved — nobody ever settled these</Label>
          {spec.open_questions.length ? (
            <ol className="mt-3 space-y-2">
              {spec.open_questions.map((question) => (
                <li key={question} className="text-body">
                  {question}
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 text-body">
              Nothing is open. Every situation the handover described has a clause, which is either thorough or
              over-confident — the driving test will say which.
            </p>
          )}
          <p className="mt-4 text-small">
            <Link href={`/contract/${contract.id}/edit`} className="underline underline-offset-4">
              Answer these and amend the contract
            </Link>
          </p>
        </section>

        <section className="mt-10 max-w-2xl">
          <p className="text-body">{spec.role}</p>
          <p className="mt-3 text-body opacity-80">{spec.scope}</p>
          <p className="mt-4 font-mono text-micro opacity-70">{spec.tools_allowed.join('  ·  ')}</p>
        </section>

        {rules.length ? (
          <Rulebook
            rules={rules}
            sources={{ voice_note: contract.transcript, email: emailText, invoice_sample: documentText() }}
          />
        ) : (
          <div className="mt-8 max-w-2xl">
            <Notice
              what="The contract has no clauses."
              fix="The compiler returned a valid spec with an empty rules array. Check the compiler's inputs — most likely the voice note and email thread never reached it."
            />
          </div>
        )}

        <section className="mt-14 grid gap-10 border-t border-rule pt-6 sm:grid-cols-2">
          <div>
            <Label>Schedule — exceptions</Label>
            <dl className="mt-3 space-y-2 text-small">
              {spec.exception_taxonomy.map((item) => (
                <div key={item.code} className="flex flex-wrap gap-x-3">
                  <dt className="font-mono">{item.code}</dt>
                  <dd className="flex-1">
                    {item.description} <span className="font-mono opacity-70">→ {item.default_action}</span>
                  </dd>
                </div>
              ))}
              {spec.exception_taxonomy.length ? null : <p className="opacity-70">No exception codes were extracted.</p>}
            </dl>
          </div>
          <div>
            <Label>Escalation</Label>
            <p className="mt-3 text-small">
              Below <span className="font-mono">{spec.escalation.min_confidence}</span> confidence, hand it to{' '}
              {spec.escalation.route_to}.{' '}
              {spec.escalation.always_escalate_above_amount === null
                ? 'No unconditional amount ceiling was set.'
                : `Everything above ${spec.escalation.always_escalate_above_amount} goes up regardless.`}
            </p>
          </div>
        </section>

        <div className="mt-14 border-t border-rule pt-8">
          <RunButton contractId={contract.id} />
          {lastRun ? (
            <p className="mt-5 text-small">
              <Link href={`/run/${lastRun.id}`} className="underline underline-offset-4">
                The last test taken against this version
              </Link>
            </p>
          ) : null}
        </div>
      </main>
    </>
  );
}
