import Link from 'next/link';
import DocThumb from '@/components/doc-thumb';
import { Amount, EmptyScreen, Label } from '@/components/primitives';
import { PoRecord, ReceiptRecord, VendorRecord } from '@/components/records';
import Stepper from '@/components/stepper';
import TraceTape from '@/components/trace-tape';
import { absent, inWords } from '@/lib/copy';
import { docSrc, longDate } from '@/lib/format';
import { getCase, getContract, getMatchRecords, getRun, getTrace, getVendorByName } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function CasePage({ params }: { params: Promise<{ id: string; caseId: string }> }) {
  const { id, caseId } = await params;
  const [run, result] = await Promise.all([getRun(id), getCase(id, caseId)]);
  if (!run || !result) {
    const copy = await absent('That case', 'Open the driving test and pick a case from the list on the left.');
    return <EmptyScreen title="No such case" {...copy} />;
  }

  const invoice = result.invoice;
  const [trace, records, vendor, contract] = await Promise.all([
    getTrace(caseId),
    getMatchRecords(invoice.po_number_ref),
    getVendorByName(invoice.vendor_name),
    run.contract_id ? getContract(run.contract_id) : null,
  ]);
  const agreed = result.action ? result.action === invoice.gt_action : null;
  const failure = inWords(result.failure_mode);

  return (
    <>
      <Stepper current={contract?.parent_id ? 'rerun' : 'run'} />
      <main className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
        <Label>
          Case {String(invoice.case_no ?? 0).padStart(2, '0')} · {invoice.difficulty ?? 'ledger history'}
        </Label>
        <div className="mt-3 mb-8 flex flex-wrap items-baseline justify-between gap-4">
          <h1 className="font-display text-title">
            {invoice.vendor_name} <span className="font-mono text-head">{invoice.invoice_number}</span>
          </h1>
          <Link href={`/run/${id}`} className="text-small underline underline-offset-4">
            Back to the test
          </Link>
        </div>

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <section>
            <Label>The tape</Label>
            <div className="mt-3">
              <TraceTape
                steps={trace}
                contractId={run.contract_id}
                empty={{
                  what: `Nothing was written while ${invoice.invoice_number} was under review.`,
                  fix: 'Either the case has not been picked up yet, or the run stopped before reaching it. The server log will say which.',
                }}
              />
            </div>
          </section>

          <aside className="space-y-6">
            <div className="border border-rule">
              <DocThumb
                src={docSrc(invoice)}
                alt={`Scanned invoice ${invoice.invoice_number}`}
                className="w-full object-cover object-top"
              />
              <div className="flex items-baseline justify-between gap-3 border-t border-rule px-3 py-2">
                <span className="font-mono text-micro opacity-70">{longDate(invoice.invoice_date)}</span>
                <Amount value={invoice.total} className="text-small" />
              </div>
            </div>
            <PoRecord po={records.po} poNumber={invoice.po_number_ref} />
            <ReceiptRecord receipt={records.receipt} />
            <VendorRecord vendor={vendor} />
          </aside>
        </div>

        <section className="mt-16 max-w-3xl border-t border-rule pt-6">
          <Label>Sign-off — what the controller would have done</Label>
          <p className="mt-3 font-mono text-small tracking-[0.14em] uppercase">{invoice.gt_action}</p>
          <p className="mt-3 text-body">{invoice.gt_reason}</p>
          <p className="mt-5 text-small">
            {agreed === null ? (
              <span className="opacity-70">The agent has not decided this one yet.</span>
            ) : agreed ? (
              <span className="text-pass">The agent reached the same conclusion.</span>
            ) : (
              <span className="text-flag">
                The agent said {result.action}
                {failure ? ` — ${failure}` : ''}.
              </span>
            )}
          </p>
        </section>
      </main>
    </>
  );
}
