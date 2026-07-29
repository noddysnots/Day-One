'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Fault } from '@/lib/pipeline';
import { Button, Notice } from './primitives';
import PrimaryAction from './primary-action';

export default function RunButton({ contractId }: { contractId: string }) {
  const router = useRouter();
  const [fault, setFault] = useState<Fault | null>(null);
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    setFault(null);
    try {
      const response = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contractId }),
      });
      const body = (await response.json()) as Fault & { runId?: string };
      if (!response.ok || !body.runId) {
        setFault({ what: body.what ?? 'The test would not start.', fix: body.fix ?? 'Check the server log and try again.' });
        return;
      }
      router.push(`/run/${body.runId}`);
    } catch (error) {
      setFault({
        what: `The test would not start: ${error instanceof Error ? error.message : String(error)}.`,
        fix: 'Check that the dev server is still running, then try again.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {fault && (
        <div className="mb-5 max-w-xl">
          <Notice what={fault.what} fix={fault.fix} />
        </div>
      )}
      <PrimaryAction>
        <Button onClick={start} disabled={busy}>
          {busy ? 'Starting…' : 'Start the probation run'}
        </Button>
      </PrimaryAction>
    </div>
  );
}
