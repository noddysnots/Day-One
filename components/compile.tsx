'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { clock } from '@/lib/format';
import type { CompileEvent, Fault } from '@/lib/pipeline';
import { Button, Notice } from './primitives';
import PrimaryAction from './primary-action';

type Line = { at: string; text: string };

/**
 * Sticky compile dock for intake: status rail + primary action + live tape while compiling.
 * Behaviour unchanged — still streams /api/compile and routes to the new contract.
 */
export default function Compile({
  readyLabel = 'Handover ready',
}: {
  readyLabel?: string;
}) {
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>([]);
  const [fault, setFault] = useState<Fault | null>(null);
  const [busy, setBusy] = useState(false);

  async function compile() {
    setBusy(true);
    setLines([]);
    setFault(null);
    try {
      const response = await fetch('/api/compile', { method: 'POST' });
      if (!response.body) throw new Error('the server closed the connection before it said anything');
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const rows = buffer.split('\n');
        buffer = rows.pop() ?? '';
        for (const row of rows) {
          if (!row.trim()) continue;
          const event = JSON.parse(row) as CompileEvent;
          if (event.kind === 'status') setLines((l) => [...l, { at: clock(new Date().toISOString()), text: event.text }]);
          if (event.kind === 'fault') setFault({ what: event.what, fix: event.fix });
          if (event.kind === 'done') router.push(`/contract/${event.contractId}`);
        }
      }
    } catch (error) {
      setFault({
        what: `The compile did not finish: ${error instanceof Error ? error.message : String(error)}.`,
        fix: 'Check that the server is still running, then try again.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {fault ? (
        <div className="mx-auto mt-8 max-w-5xl px-5 sm:px-8">
          <Notice what={fault.what} fix={fault.fix} />
        </div>
      ) : null}

      <PrimaryAction>
        <div className="hud-corners max-w-[min(100vw-2.5rem,24rem)] border border-ink bg-paper">
          <div className="flex items-center gap-2 border-b border-rule px-3 py-2 font-mono text-micro tracking-[0.1em] uppercase">
            <span className="led" aria-hidden />
            <span className="truncate opacity-70">{busy ? 'Compiling…' : readyLabel}</span>
          </div>
          {lines.length > 0 ? (
            <ol className="max-h-28 overflow-y-auto border-b border-rule px-3 py-2 font-mono text-micro">
              {lines.map((line, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-[52px] shrink-0 opacity-50">{line.at}</span>
                  <span className="min-w-0 break-words">{line.text}</span>
                </li>
              ))}
            </ol>
          ) : null}
          <div className="p-2">
            <Button onClick={compile} disabled={busy} className="w-full">
              {busy ? 'Compiling the contract…' : 'Compile the contract'}
            </Button>
          </div>
        </div>
      </PrimaryAction>
    </>
  );
}
