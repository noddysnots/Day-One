import Link from 'next/link';
import type { TraceStep } from '@/lib/rows';
import { splitRuleIds, tapeClock } from '@/lib/format';
import { STAMP, inlineArgs, pretty, stepArgs, stepResult, stepTerminal, stepText, summarise } from '@/lib/trace';
import { ConfidenceBar, Notice } from './primitives';

/** Rule citations in the agent's prose link straight back to the clause that drove the step. */
function Cited({ text, contractId }: { text: string; contractId: string | null }) {
  return (
    <>
      {splitRuleIds(text).map((part, i) =>
        part.ruleId && contractId ? (
          <Link key={i} href={`/contract/${contractId}#${part.ruleId}`} className="font-mono underline underline-offset-4">
            {part.text}
          </Link>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

function Body({ step, contractId }: { step: TraceStep; contractId: string | null }) {
  // Only the terminal step is stamped, so a tape carries exactly one --stamp however many times
  // the agent called decide along the way.
  if (step.kind === 'decision') {
    const terminal = stepTerminal(step);
    const stated = (step.payload as { rationale?: unknown } | null)?.rationale;
    const rationale = terminal?.rationale || (typeof stated === 'string' ? stated : '');
    return (
      <div>
        {terminal ? (
          <span className="stamp">{STAMP[terminal.action]}</span>
        ) : (
          <span className="inline-block border border-rule px-3 py-1.5 font-mono text-small tracking-[0.14em] uppercase">
            no decision
          </span>
        )}
        {rationale ? (
          <p className="mt-3 text-small">
            <Cited text={rationale} contractId={contractId} />
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
          {terminal?.confidence != null ? <ConfidenceBar value={terminal.confidence} /> : null}
          {terminal?.routeTo ? <span className="text-micro opacity-70">routed to {terminal.routeTo}</span> : null}
        </div>
      </div>
    );
  }

  if (step.kind === 'tool_call') {
    return (
      <p className="pl-4 font-mono text-small break-words">
        <span className="opacity-40">→ </span>
        {step.tool_name ?? 'call'} <span className="opacity-70">{inlineArgs(stepArgs(step))}</span>
      </p>
    );
  }

  if (step.kind === 'tool_result') {
    const result = stepResult(step);
    return (
      // break-words on the summary as well as the call above it: a folded result routinely carries
      // a storage URL with no break opportunity in it, and one unbreakable run of characters here
      // is enough to widen the whole document past the viewport.
      <details className="pl-4 font-mono text-small break-words">
        <summary className="cursor-pointer marker:text-ink">
          <span className="opacity-40">← </span>
          <span className="opacity-70">{summarise(result)}</span>
        </summary>
        <pre className="mt-2 overflow-x-auto border-l border-rule pl-3 text-micro opacity-80">{pretty(result)}</pre>
      </details>
    );
  }

  if (step.kind === 'thought' || step.kind === 'text' || step.kind === 'reasoning') {
    return (
      <p className="text-small">
        <Cited text={stepText(step)} contractId={contractId} />
      </p>
    );
  }

  return (
    <details className="font-mono text-small break-words">
      <summary className="cursor-pointer">{step.kind}</summary>
      <pre className="mt-2 overflow-x-auto text-micro opacity-80">{pretty(step.payload)}</pre>
    </details>
  );
}

/**
 * The tape. One continuous strip: timestamps in the gutter, a single hairline down the left edge
 * of the content, every step hanging off it in the order the runtime wrote it.
 */
export default function TraceTape({
  steps,
  contractId,
  empty,
}: {
  steps: TraceStep[];
  contractId: string | null;
  empty?: { what: string; fix?: string };
}) {
  if (!steps.length) {
    return <Notice what={empty?.what ?? 'Nothing has been written to this tape yet.'} fix={empty?.fix} />;
  }

  // The gutter is measured in characters of the face that fills it rather than in pixels guessed at
  // it, so it is exactly wide enough for the longest time it will hold and no wider. minmax(0,_)
  // drops the content column's min-content floor: without it one long unbroken token in a payload
  // pushes the column, and the document, wider than the viewport.
  const clock = tapeClock(steps.map((s) => s.created_at));
  const gutter = clock.withHour ? 'w-[12ch]' : 'w-[9ch]';

  return (
    <ol className="bg-paper">
      {steps.map((step) => (
        <li key={step.id} className="step-in grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 sm:gap-x-3">
          <span className={`${gutter} pt-px font-mono text-micro tabular-nums opacity-50`}>
            {clock.read(step.created_at)}
          </span>
          <div className="min-w-0 border-l border-rule pt-px pb-6 pl-3 sm:pl-4">
            {step.rule_id && contractId ? (
              <Link
                href={`/contract/${contractId}#${step.rule_id}`}
                className="mb-1 inline-block font-mono text-micro underline underline-offset-4"
              >
                {step.rule_id}
              </Link>
            ) : null}
            <Body step={step} contractId={contractId} />
          </div>
        </li>
      ))}
    </ol>
  );
}
