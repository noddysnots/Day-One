import Compile from '@/components/compile';
import DocThumb from '@/components/doc-thumb';
import { Amount, Label, Notice } from '@/components/primitives';
import Stepper from '@/components/stepper';
import Link from 'next/link';
import { emailThread, intakeDocs, voiceNote } from '@/lib/intake';
import { latestContract } from '@/lib/queries';

export const dynamic = 'force-dynamic';

function CardHeader({ index, label }: { index: string; label: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-micro tracking-[0.14em] uppercase opacity-60">
        <span className="font-mono opacity-50">{index}</span> {label}
      </span>
      <span className="font-mono text-micro opacity-40 group-open:hidden">expand +</span>
      <span className="hidden font-mono text-micro opacity-40 group-open:inline">collapse −</span>
    </div>
  );
}

function WhatIsThis() {
  return (
    <div className="hud-corners mt-8 border border-rule bg-panel p-5 sm:p-6">
      <p className="text-micro tracking-[0.14em] uppercase opacity-60">What is this?</p>
      <p className="mt-3 max-w-2xl text-body">
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
  );
}

const HOW_IT_WORKS = [
  { step: '01', label: 'Compile', detail: 'the handover becomes a contract' },
  { step: '02', label: 'Test', detail: 'fifteen invoices, judged against it' },
  { step: '03', label: 'Amend', detail: 'fix what the test got wrong' },
  { step: '04', label: 'Re-run', detail: 'prove the fix actually held' },
] as const;

function HowItWorks() {
  return (
    <ol className="mt-8 grid gap-px overflow-hidden border border-rule bg-rule sm:grid-cols-4">
      {HOW_IT_WORKS.map((s) => (
        <li key={s.step} className="bg-paper px-4 py-3">
          <span className="font-mono text-micro tracking-[0.1em] text-stamp">{s.step}</span>
          <p className="mt-1 font-mono text-small uppercase tracking-[0.04em]">{s.label}</p>
          <p className="mt-1 text-micro opacity-70">{s.detail}</p>
        </li>
      ))}
    </ol>
  );
}

export default async function Intake() {
  const docs = intakeDocs();
  const thread = await emailThread();
  const voice = voiceNote();
  const onFile = await latestContract();
  const representative = docs[0] ?? null;

  return (
    <>
      <Stepper current="intake" />
      <main className="mx-auto max-w-5xl px-5 pt-14 pb-32 sm:px-8">
        <Label>Aldercroft Manufacturing · accounts payable</Label>
        <h1 className="mt-3 font-display text-title">Day One</h1>
        <p className="mt-4 max-w-2xl text-body">Everything Dana knew, in the three places she left it.</p>
        <WhatIsThis />
        <HowItWorks />
        <p className="mt-4 text-small">
          <Link href="/story" className="underline underline-offset-4">
            Watch the walkthrough
          </Link>
          <span className="opacity-60"> · Dana&rsquo;s handover, the AI on probation, and the score.</span>
        </p>

        <section className="mt-12 border-t border-rule pt-4">
          <Label>The handover</Label>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <details className="hud-corners group border border-rule bg-panel">
              <summary className="cursor-pointer list-none px-4 py-3 [&::-webkit-details-marker]:hidden">
                <CardHeader index="01" label="Paperwork" />
                <p className="mt-2 text-body">{docs.length} documents</p>
                {representative ? (
                  <div className="mt-3 max-w-[220px] border border-rule">
                    <DocThumb
                      src={representative.src}
                      alt={`Scanned invoice ${representative.invoiceNumber} from ${representative.vendor}`}
                    />
                    <div className="border-t border-rule px-2 py-1.5">
                      <p className="font-mono text-micro">{representative.invoiceNumber}</p>
                      <p className="truncate text-micro opacity-70">{representative.vendor}</p>
                      <p>
                        <Amount value={representative.total} className="text-micro" />
                      </p>
                    </div>
                  </div>
                ) : null}
              </summary>
              <div className="border-t border-rule p-4">
                {docs.length ? (
                  <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {docs.map((doc) => (
                      <li key={doc.invoiceNumber} className="border border-rule">
                        <DocThumb src={doc.src} alt={`Scanned invoice ${doc.invoiceNumber} from ${doc.vendor}`} />
                        <div className="border-t border-rule px-2 py-1.5">
                          <p className="font-mono text-micro">{doc.invoiceNumber}</p>
                          <p className="truncate text-micro opacity-70">{doc.vendor}</p>
                          <p>
                            <Amount value={doc.total} className="text-micro" />
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Notice
                    what="No sheets are in the intake folder."
                    fix="Render them with npx tsx scripts/render-docs.ts and copy out/docs into public/docs, then reload."
                  />
                )}
              </div>
            </details>

            <details className="hud-corners group border border-rule bg-panel">
              <summary className="cursor-pointer list-none px-4 py-3 [&::-webkit-details-marker]:hidden">
                <CardHeader index="02" label="Correspondence" />
                <p className="mt-2 text-body">1 email thread</p>
                <p className="mt-1 font-mono text-micro opacity-60">7–8 April 2025</p>
              </summary>
              <div className="border-t border-rule p-4">
                {thread ? (
                  <div tabIndex={0} className="max-h-[22rem] overflow-y-auto text-small whitespace-pre-wrap">
                    {thread}
                  </div>
                ) : (
                  <Notice
                    what="The email thread is missing from the intake folder."
                    fix="Put it back at public/intake/email-thread.md. Without it the rulebook loses the stale-PO carve-out entirely."
                  />
                )}
              </div>
            </details>

            <details className="hud-corners group border border-rule bg-panel">
              <summary className="cursor-pointer list-none px-4 py-3 [&::-webkit-details-marker]:hidden">
                <CardHeader index="03" label="Recording" />
                <p className="mt-2 text-body">1 voice note</p>
                {voice ? <p className="mt-1 font-mono text-micro opacity-60">Dana Whitfield, last afternoon</p> : null}
              </summary>
              <div className="border-t border-rule p-4">
                {voice ? (
                  <audio controls preload="metadata" className="w-full">
                    <source src={voice.src} type={voice.type} />
                    Your browser will not play this recording. The file is at {voice.src}.
                  </audio>
                ) : (
                  <Notice
                    edge="stamp"
                    what="The voice note is not in the intake folder."
                    fix="Drop the recording at public/intake/voice-note.mp3 — .m4a, .wav, .ogg and .webm are also read — and reload. Until then the rulebook will be compiled from the email thread alone, and no clause will carry a voice_note source."
                  />
                )}
              </div>
            </details>
          </div>
        </section>

        <div className="mt-14 border-t border-rule pt-8">
          <Compile />
          {onFile ? (
            <p className="mt-5 text-small">
              <Link href={`/contract/${onFile.id}`} className="underline underline-offset-4">
                Version {onFile.version} is already on file
              </Link>
              <span className="opacity-60"> · compiling again writes a new one.</span>
            </p>
          ) : null}
        </div>
      </main>
    </>
  );
}
