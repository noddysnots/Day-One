'use client';

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import type { EmailMessage } from '@/lib/story';
import InboxMock from './inbox-mock';
import SceneShell from './scene-shell';

/** A generic compose window types out the real first message, then "sends" into a generic inbox. */
export default function SceneEmail({ messages }: { messages: EmailMessage[] }) {
  const first = messages[0] ?? null;
  const [typed, setTyped] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!first) return;
    const body = first.body;
    let i = 0;
    const id = window.setInterval(() => {
      i += 3;
      setTyped(body.slice(0, i));
      if (i >= body.length) window.clearInterval(id);
    }, 12);
    return () => window.clearInterval(id);
  }, [first]);

  return (
    <SceneShell className="max-w-4xl">
      <p className="font-mono text-micro tracking-[0.2em] text-paper/50 uppercase">And puts it in writing</p>
      <h2 className="mt-3 font-display text-title">She sends the team an email</h2>

      {!first ? (
        <p className="mt-8 text-body text-paper/70">No thread is on file.</p>
      ) : !sent ? (
        <div className="mt-8 border border-paper/20 bg-paper text-ink">
          <div className="border-b border-rule px-4 py-2 font-mono text-micro tracking-[0.08em] uppercase opacity-60">
            New message
          </div>
          <div className="space-y-1 border-b border-rule px-4 py-3 font-mono text-micro opacity-70">
            <p>To: {first.to || '—'}</p>
            {first.cc ? <p>Cc: {first.cc}</p> : null}
            <p>Subject: {first.subject || '—'}</p>
          </div>
          <p className="min-h-40 whitespace-pre-wrap px-4 py-4 text-small">
            {typed}
            <span className="animate-pulse">▍</span>
          </p>
          <div className="border-t border-rule px-4 py-3">
            <button
              type="button"
              onClick={() => setSent(true)}
              disabled={typed.length < first.body.length}
              className="hud-corners bg-ink px-5 py-2 font-mono text-small text-paper disabled:cursor-not-allowed disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mt-8">
          <InboxMock messages={messages} />
        </motion.div>
      )}
    </SceneShell>
  );
}
