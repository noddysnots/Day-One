'use client';

import { useCallback, useEffect, useState } from 'react';
import type { IntakeDoc } from '@/lib/intake';
import DocCarousel from './doc-carousel';
import EmailThread from './email-thread';
import InstrumentPanel from './instrument-panel';
import { Notice } from './primitives';

const STAGES = [
  { key: 'paper', index: '01', label: 'Paperwork' },
  { key: 'mail', index: '02', label: 'Correspondence' },
  { key: 'voice', index: '03', label: 'Recording' },
] as const;

type StageKey = (typeof STAGES)[number]['key'];

/**
 * One handover instrument: three stages, one active. Replaces the three competing accordions.
 * Splash and /story are unrelated — do not import this there.
 */
export default function HandoverDeck({
  docs,
  thread,
  voice,
}: {
  docs: IntakeDoc[];
  thread: string | null;
  voice: { src: string; type: string } | null;
}) {
  const [stage, setStage] = useState<StageKey>('paper');
  const stageIndex = STAGES.findIndex((s) => s.key === stage);

  const go = useCallback((next: number) => {
    const i = Math.max(0, Math.min(STAGES.length - 1, next));
    setStage(STAGES[i].key);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) {
        return;
      }
      // Don't steal arrows from the doc carousel when paperwork is active — carousel handles those.
      if (stage === 'paper' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return;
      if (e.key === 'ArrowRight' || e.key === ']') {
        e.preventDefault();
        go(stageIndex + 1);
      } else if (e.key === 'ArrowLeft' || e.key === '[') {
        e.preventDefault();
        go(stageIndex - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, stage, stageIndex]);

  const status =
    stage === 'paper'
      ? `Handover · Paperwork · ${docs.length} scans`
      : stage === 'mail'
        ? 'Handover · Correspondence · thread'
        : 'Handover · Recording · voice note';

  return (
    <InstrumentPanel status={status} active>
      <div className="flex flex-wrap border-b border-rule" role="tablist" aria-label="Handover artefacts">
        {STAGES.map((s) => {
          const active = s.key === stage;
          return (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setStage(s.key)}
              className={`flex min-w-[8.5rem] flex-1 items-center gap-2 border-r border-rule px-4 py-3 text-left font-mono text-micro tracking-[0.1em] uppercase last:border-r-0 transition-[background-color,color] ${
                active ? 'bg-paper text-ink' : 'bg-transparent text-ink/45 hover:text-ink/80'
              }`}
            >
              {active ? <span className="led" aria-hidden /> : <span className="inline-block h-[5px] w-[5px] rounded-full border border-rule" aria-hidden />}
              <span>
                <span className="opacity-50">{s.index}</span> {s.label}
              </span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel">
        {stage === 'paper' ? <DocCarousel docs={docs} /> : null}

        {stage === 'mail' ? (
          thread ? (
            <EmailThread markdown={thread} />
          ) : (
            <div className="p-4 sm:p-5">
              <Notice
                what="The email thread is missing from the intake folder."
                fix="Put it back at public/intake/email-thread.md. Without it the rulebook loses the stale-PO carve-out entirely."
              />
            </div>
          )
        ) : null}

        {stage === 'voice' ? (
          <div className="p-4 sm:p-5">
            {voice ? (
              <div className="space-y-4">
                <div className="border border-rule bg-paper px-4 py-3">
                  <p className="font-mono text-micro tracking-[0.12em] uppercase opacity-50">Source</p>
                  <p className="mt-1 text-body">Dana Whitfield · last afternoon</p>
                  <p className="mt-2 font-mono text-micro opacity-60">
                    The compiler hears this as inline audio — not a separate transcript pass.
                  </p>
                </div>
                <audio controls preload="metadata" className="w-full">
                  <source src={voice.src} type={voice.type} />
                  Your browser will not play this recording. The file is at {voice.src}.
                </audio>
              </div>
            ) : (
              <Notice
                edge="stamp"
                what="The voice note is not in the intake folder."
                fix="Drop the recording at public/intake/voice-note.mp3 — .m4a, .wav, .ogg and .webm are also read — and reload. Until then the rulebook will be compiled from the email thread alone, and no rule will carry a voice_note source."
              />
            )}
          </div>
        ) : null}
      </div>
    </InstrumentPanel>
  );
}
