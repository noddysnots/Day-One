'use client';

import { useMemo, useState } from 'react';
import { parseEmailThread, type EmailMessage } from '@/lib/story';

function nameOf(address: string): string {
  const name = address.split('<')[0].trim();
  return name || address;
}

function Field({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="grid grid-cols-[3.25rem_1fr] gap-x-2 font-mono text-micro leading-relaxed">
      <span className="opacity-50">{label}</span>
      <span className="min-w-0 break-words">{value}</span>
    </div>
  );
}

function MessageSheet({ message, ordinal, total }: { message: EmailMessage; ordinal: number; total: number }) {
  return (
    <article className="border border-rule bg-paper">
      <header className="border-b border-rule px-3 py-2.5 sm:px-4">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <span className="font-mono text-micro tracking-[0.1em] uppercase opacity-50">
            Message {String(ordinal).padStart(2, '0')} of {String(total).padStart(2, '0')}
          </span>
          <span className="font-mono text-micro opacity-50">{message.date || '—'}</span>
        </div>
        <div className="space-y-0.5">
          <Field label="From" value={nameOf(message.from)} />
          <Field label="To" value={nameOf(message.to)} />
          {message.cc ? <Field label="Cc" value={nameOf(message.cc)} /> : null}
          <Field label="Subject" value={message.subject} />
        </div>
      </header>
      <div className="px-3 py-3 text-small leading-relaxed whitespace-pre-wrap sm:px-4 sm:py-4">{message.body}</div>
    </article>
  );
}

/**
 * Intake correspondence: list + selected sheet. Same parse as the walkthrough so message
 * boundaries never disagree. Client so the selected index can move without a round trip.
 */
export default function EmailThread({ markdown }: { markdown: string }) {
  const messages = useMemo(() => parseEmailThread(markdown), [markdown]);
  const [selected, setSelected] = useState(0);
  const active = messages[selected] ?? messages[0] ?? null;

  if (!messages.length) {
    return (
      <p className="px-4 py-6 text-small opacity-70">
        The thread is on disk but no messages could be read from it. Check the From / To / Subject
        headers and the <span className="font-mono">---</span> separators.
      </p>
    );
  }

  const subject = messages[0]?.subject || 'Thread';

  return (
    <div className="p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-rule pb-3">
        <p className="min-w-0 font-mono text-small break-words">{subject}</p>
        <p className="shrink-0 font-mono text-micro opacity-50">
          {messages.length} message{messages.length === 1 ? '' : 's'}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)]">
        <ol className="max-h-[28rem] space-y-1 overflow-y-auto border border-rule bg-paper">
          {messages.map((message, i) => {
            const isActive = i === selected;
            const preview = message.body.replace(/\s+/g, ' ').trim().slice(0, 72);
            return (
              <li key={`${message.from}-${message.date}-${i}`} className="border-b border-rule last:border-b-0">
                <button
                  type="button"
                  onClick={() => setSelected(i)}
                  aria-current={isActive ? 'true' : undefined}
                  className={`w-full px-3 py-2.5 text-left transition-[background-color,border-color] ${
                    isActive ? 'bg-panel' : 'bg-paper hover:bg-panel/60'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-small">{nameOf(message.from)}</span>
                    <span className="shrink-0 font-mono text-micro opacity-50">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                  </div>
                  <p className="mt-0.5 font-mono text-micro opacity-50">{message.date}</p>
                  <p className="mt-1 truncate text-micro opacity-70">{preview}{preview.length >= 72 ? '…' : ''}</p>
                </button>
              </li>
            );
          })}
        </ol>

        {active ? <MessageSheet message={active} ordinal={selected + 1} total={messages.length} /> : null}
      </div>
    </div>
  );
}
