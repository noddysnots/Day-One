import Compile from '@/components/compile';
import HandoverDeck from '@/components/handover-deck';
import InstrumentPanel from '@/components/instrument-panel';
import { Label } from '@/components/primitives';
import Stepper from '@/components/stepper';
import Link from 'next/link';
import { emailThread, intakeDocs, voiceNote } from '@/lib/intake';
import { latestContract } from '@/lib/queries';

export const dynamic = 'force-dynamic';

const HOW_IT_WORKS = [
  { step: '01', label: 'Compile', detail: 'the handover becomes a contract' },
  { step: '02', label: 'Test', detail: 'fifteen invoices, judged against it' },
  { step: '03', label: 'Fix', detail: 'fix what the test got wrong' },
  { step: '04', label: 'Re-run', detail: 'prove the fix actually held' },
] as const;

function Briefing() {
  return (
    <details className="hud-corners group mt-8 border border-rule bg-panel">
      <summary className="cursor-pointer list-none px-4 py-3 [&::-webkit-details-marker]:hidden sm:px-5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="inline-flex items-center gap-2 font-mono text-micro tracking-[0.14em] uppercase opacity-60">
            <span className="opacity-40">SYS</span> Briefing
          </span>
          <span className="font-mono text-micro opacity-40 group-open:hidden">open +</span>
          <span className="hidden font-mono text-micro opacity-40 group-open:inline">close −</span>
        </div>
        <p className="mt-2 text-small opacity-70 group-open:hidden">What this is, and the four stages of the driving test.</p>
      </summary>
      <div className="space-y-5 border-t border-rule px-4 py-4 sm:px-5 sm:py-5">
        <div>
          <p className="text-micro tracking-[0.14em] uppercase opacity-60">What is this?</p>
          <p className="mt-2 max-w-2xl text-body">
            Dana Whitfield ran accounts payable by herself for years. She knew exactly which invoices to pay, which to
            question, and which to send up the chain — but none of it was written down. When she resigned, that
            judgment would have walked out with her, except for what she left behind on her last afternoon: a voice
            note, an email argument with her team, and two weeks of real invoices she&rsquo;d already handled.
          </p>
          <p className="mt-3 max-w-2xl text-body">
            This site turns that handover into a written rulebook, where every rule links back to the exact line it
            came from — nothing is invented. Then it gives that rulebook to an AI and watches it work through Dana&rsquo;s
            real invoices, to see whether it makes the calls she would have. Where it gets one wrong, you fix the
            rulebook and test it again.
          </p>
        </div>
        <ol className="grid gap-px overflow-hidden border border-rule bg-rule sm:grid-cols-4">
          {HOW_IT_WORKS.map((s) => (
            <li key={s.step} className="bg-paper px-4 py-3">
              <span className="font-mono text-micro tracking-[0.1em] text-stamp">{s.step}</span>
              <p className="mt-1 font-mono text-small uppercase tracking-[0.04em]">{s.label}</p>
              <p className="mt-1 text-micro opacity-70">{s.detail}</p>
            </li>
          ))}
        </ol>
      </div>
    </details>
  );
}

export default async function Intake() {
  const docs = intakeDocs();
  const thread = await emailThread();
  const voice = voiceNote();
  const onFile = await latestContract();

  const readyBits = [
    `${docs.length} docs`,
    thread ? 'thread' : 'no thread',
    voice ? 'voice' : 'no voice',
  ];
  const readyLabel = `Handover ready · ${readyBits.join(' · ')}`;

  return (
    <>
      <Stepper current="intake" />
      <main className="mx-auto max-w-5xl px-5 pt-14 pb-40 sm:px-8">
        <Label>Aldercroft Manufacturing · accounts payable</Label>
        <h1 className="mt-3 font-display text-title">Day One</h1>
        <p className="mt-4 max-w-2xl text-body">Everything Dana knew, in the three places she left it.</p>

        <div className="mt-6 flex flex-wrap items-baseline gap-x-5 gap-y-2">
          <p className="text-small">
            <Link href="/story" className="underline underline-offset-4">
              Watch the walkthrough
            </Link>
            <span className="opacity-60"> · Dana&rsquo;s handover, the AI on probation, and the score.</span>
          </p>
          {onFile ? (
            <p className="text-small">
              <Link href={`/contract/${onFile.id}`} className="underline underline-offset-4">
                Version {onFile.version} is already on file
              </Link>
              <span className="opacity-60"> · compiling again writes a new one.</span>
            </p>
          ) : null}
        </div>

        <p className="mt-6 font-mono text-micro tracking-[0.08em] text-ink/50 uppercase sm:hidden">
          Compile sits bottom-right →
        </p>

        <Briefing />

        <section className="mt-12">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <Label>The handover</Label>
            <p className="font-mono text-micro opacity-50">[ / ] switch stage · ← → browse scans</p>
          </div>
          <HandoverDeck docs={docs} thread={thread} voice={voice} />
        </section>

        <InstrumentPanel status="Ready to file" className="mt-10 hidden sm:block">
          <div className="px-4 py-3 font-mono text-micro tracking-[0.06em] uppercase opacity-60">
            Primary action is docked bottom-right · {readyLabel}
          </div>
        </InstrumentPanel>
      </main>

      <Compile readyLabel={readyLabel} />
    </>
  );
}
