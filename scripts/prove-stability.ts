/**
 * Three compiles of the identical complete intake. Reports clause count, open_questions and
 * provenance quotes, and whether they are verbatim-stable across runs.
 *
 * Usage: npx tsx scripts/prove-stability.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { compileContract } from '../lib/compile-contract';
import { compileInputs } from '../lib/intake';
import { COMPILER_MODEL } from '../lib/models';
import { verifyProvenance } from '../lib/provenance';
import type { ContractSpec } from '../lib/contract-schema';

function fingerprint(spec: ContractSpec) {
  return {
    ruleCount: spec.rules.length,
    ruleIds: spec.rules.map((r) => r.id),
    questions: [...spec.open_questions].sort(),
    provenance: spec.rules.map((r) => ({
      id: r.id,
      source: r.provenance.source,
      quote: r.provenance.quote,
    })),
  };
}

async function main() {
  const { inputs, note } = await compileInputs();
  if (!inputs.voiceNote) throw new Error('voice note required');
  console.log(`compiler ${COMPILER_MODEL} temperature 0.2 (exhaustive extract)`);
  console.log(note + '\n');

  const runs: ReturnType<typeof fingerprint>[] = [];
  for (let i = 1; i <= 3; i++) {
    const started = Date.now();
    const compiled = await compileContract(inputs);
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    const fp = fingerprint(compiled.spec);
    runs.push(fp);
    const verdicts = verifyProvenance(compiled.spec, {
      emailThread: inputs.emailThread,
      transcript: compiled.transcript,
    });
    const missing = verdicts.filter((v) => v.checked && !v.verbatim);
    console.log(`--- compile ${i} (${secs}s, ${compiled.attempts} attempt(s)) ---`);
    console.log(`  clauses          ${fp.ruleCount}`);
    console.log(`  open_questions   ${fp.questions.length}`);
    for (const q of fp.questions) console.log(`    - ${q.slice(0, 140)}`);
    console.log(`  dropped          ${compiled.droppedUnverifiable.length}`);
    console.log(`  verbatim quotes  ${verdicts.length - missing.length}/${verdicts.length}`);
    console.log(`  tools_allowed    ${compiled.spec.tools_allowed.join(', ')}`);
    console.log('');
  }

  const countsEqual = runs.every((r) => r.ruleCount === runs[0].ruleCount);
  const questionsEqual = runs.every((r) => JSON.stringify(r.questions) === JSON.stringify(runs[0].questions));
  const provenanceEqual = runs.every((r) => JSON.stringify(r.provenance) === JSON.stringify(runs[0].provenance));

  console.log('--- stability ---');
  console.log(`  clause count identical:     ${countsEqual ? 'YES' : 'NO'} (${runs.map((r) => r.ruleCount).join(', ')})`);
  console.log(`  open_questions identical:   ${questionsEqual ? 'YES' : 'NO'}`);
  console.log(`  provenance quotes identical:${provenanceEqual ? 'YES' : 'NO'}`);
  if (!countsEqual || !questionsEqual || !provenanceEqual) {
    console.log('\nNOT stable. Diagnosis:');
    if (!countsEqual) console.log('  - clause count still moves at temperature 0.2; model sampling or non-deterministic extract order');
    if (!questionsEqual) console.log('  - open_question set still moves; phrasing or which gaps are named varies');
    if (!provenanceEqual) console.log('  - provenance quotes differ across runs even when rule count matches');
    process.exitCode = 1;
  } else {
    console.log('\nSTABLE across three identical compiles.');
  }
}

void main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
