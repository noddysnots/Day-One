/** Exercises the predicate that decides what reaches a tape, against prose and against scratchpad. */
import { readsAsReasoning } from '../lib/trace';

const SHOULD_KEEP = [
  'The invoice references PO-2219, cut on 14 March, before the April price revision. Under R-07 I must check the billed unit prices against the current list.',
  'R-05 applies: INV-4478 matches INV-4455 on vendor and amount inside fourteen days, so this is a duplicate.',
  'I need the vendor contract notes before I can apply R-02, because Northline excludes freight from tolerance.',
  'Tolerance is 2% and the overage is $48 on $2,700, which is inside it (1.8%).',
  'Escalating. The contract does not settle a cancelled PO.',
];

const SHOULD_DROP = [
  // The step that actually leaked onto case 7's tape.
  '/0.9/1.0)\n`reason`: "PO PO-2219 is stale (issued 2025-03-14 before Apr 1 price revision)."\n`route_to`: "Priya Raghunathan"\n\nWait! Let\'s check `decide` parameters:\n`action`: "escalate"\n`confidence`: 0.95\n`rationale`: "R-08: Invoice references stale',
  '`action`: "escalate"\n`confidence`: 0.95',
  'action: "reject"\nconfidence: 1\nrationale: "duplicate"',
  'Let me look up the purchase order:',
  'The invoice total of $4,180 exceeds the PO total of $4,050 by $130, so under R-07 I need to verify the unit prices against the live price list, which',
];

let failures = 0;
for (const [label, samples, want] of [
  ['keep', SHOULD_KEEP, true],
  ['drop', SHOULD_DROP, false],
] as const) {
  console.log(`\n${label}:`);
  for (const text of samples) {
    const got = readsAsReasoning(text);
    if (got !== want) failures++;
    console.log(`  ${got === want ? 'PASS' : 'FAIL'}  ${got ? 'kept' : 'dropped'}  ${text.replace(/\n/g, ' ⏎ ').slice(0, 88)}`);
  }
}

console.log(failures ? `\n${failures} disagreement(s).` : '\nThe predicate agrees on every sample.');
if (failures) process.exit(1);
