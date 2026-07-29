import Link from 'next/link';
import ContractEditor from '@/components/contract-editor';
import { EmptyScreen, Label } from '@/components/primitives';
import Stepper from '@/components/stepper';
import { absent } from '@/lib/copy';
import { getContract } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contract = await getContract(id);

  if (!contract?.spec) {
    const copy = await absent(
      'That rulebook',
      contract
        ? 'A row exists under this id but its spec does not parse, so there is nothing safe to edit. Compile again from the handover.'
        : 'Compile one from the handover first.',
    );
    return <EmptyScreen title="Nothing to amend" {...copy} />;
  }

  return (
    <>
      <Stepper current="amend" />
      <main className="mx-auto max-w-3xl px-5 py-14 sm:px-8">
        <Label>Amendment to version {contract.version}</Label>
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-4">
          <h1 className="font-display text-title">Amend the contract</h1>
          <Link href={`/contract/${contract.id}`} className="text-small underline underline-offset-4">
            Back to version {contract.version}
          </Link>
        </div>
        <p className="mt-4 mb-8 max-w-2xl text-body">Answer an open question, or fix a rule that was wrong.</p>
        <p className="mb-10 max-w-2xl text-body opacity-80">
          Filing creates version {contract.version + 1} with this one as its parent, and the next driving test is
          scored against the last.
        </p>

        <ContractEditor contractId={contract.id} spec={contract.spec} version={contract.version} />
      </main>
    </>
  );
}
