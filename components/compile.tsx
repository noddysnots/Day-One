'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { clock } from '@/lib/format';
import type { CompileEvent, Fault } from '@/lib/pipeline';
import { Button, Notice } from './primitives';
import PrimaryAction from './primary-action';

type Line = { at: string; text: string };

/** Streams whatever the compiler actually reports. If it reports nothing, neither does this. */
export default function Compile() {
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
        fix: 'Check that the dev server is still running, then try again.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {lines.length > 0 && (
        <ol className="border-t border-rule pt-4 font-mono text-micro">
          {lines.map((line, i) => (
            <li key={i} className="flex gap-4">
              <span className="w-[60px] shrink-0 opacity-60">{line.at}</span>
              <span>{line.text}</span>
            </li>
          ))}
        </ol>
      )}
      {fault && (
        <div className="mt-5">
          <Notice what={fault.what} fix={fault.fix} />
        </div>
      )}
      <PrimaryAction>
        <Button onClick={compile} disabled={busy}>
          {busy ? 'Compiling the contract…' : 'Compile the contract'}
        </Button>
      </PrimaryAction>
    </div>
  );
}
