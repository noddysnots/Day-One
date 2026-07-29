'use client';

import { motion } from 'motion/react';
import type { EmailMessage } from '@/lib/story';

/** A generic thread view in Day One's own tokens — deliberately not any real mail client's chrome. */
export default function InboxMock({ messages }: { messages: EmailMessage[] }) {
  return (
    <div className="border border-paper/20 bg-paper text-ink">
      <div className="border-b border-rule px-4 py-2 font-mono text-micro tracking-[0.08em] uppercase opacity-60">
        Inbox · {messages[0]?.subject || 'Thread'}
      </div>
      <ol className="max-h-[46vh] overflow-y-auto">
        {messages.map((m, i) => (
          <motion.li
            key={i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: i * 0.12 }}
            className="border-b border-rule px-4 py-3 last:border-b-0"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-mono text-small">{m.from.split('<')[0].trim()}</span>
              <span className="font-mono text-micro opacity-50">{m.date}</span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-small opacity-90">{m.body}</p>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}
