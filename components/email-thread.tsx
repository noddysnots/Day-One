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
      <header className="border-b border-rule px-3 py-2.5">
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
      <div className="px-3 py-3 text-small leading-relaxed whitespace-pre-wrap">{message.body}</div>
    </article>
  );
}

/**
 * The intake correspondence panel. Renders the handover thread as discrete messages with
 * From / To / Subject headers — the same register as a printed personnel file, not a wall of
 * raw markdown. Parsing lives in lib/story.ts so the walkthrough and the intake never disagree
 * about where one message ends and the next begins.
 */
export default function EmailThread({ markdown }: { markdown: string }) {
  const messages = parseEmailThread(markdown);

  if (!messages.length) {
    return (
      <p className="text-small opacity-70">
        The thread is on disk but no messages could be read from it. Check the From / To / Subject
        headers and the <span className="font-mono">---</span> separators.
      </p>
    );
  }

  const subject = messages[0]?.subject || 'Thread';

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-rule pb-2">
        <p className="min-w-0 font-mono text-small break-words">{subject}</p>
        <p className="shrink-0 font-mono text-micro opacity-50">
          {messages.length} message{messages.length === 1 ? '' : 's'}
        </p>
      </div>
      <ol className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
        {messages.map((message, i) => (
          <li key={`${message.from}-${message.date}-${i}`}>
            <MessageSheet message={message} ordinal={i + 1} total={messages.length} />
          </li>
        ))}
      </ol>
    </div>
  );
}
