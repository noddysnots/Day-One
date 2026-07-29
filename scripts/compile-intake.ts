/**
 * Compiles one contract from the COMPLETE handover — the five invoice documents, the email thread,
 * and the controller's voice note as inline audio — files it as version 1 with the transcript, and
 * checks every provenance quote against the source it cites.
 *
 * Deliberately one compile and no retry loop of its own. The clause set varies between compiles, so
 * a script that compiled twice and kept the better one would be choosing the answer instead of
 * measuring it. The spec is written to artifacts/ as it is filed, so every question asked afterwards
 * is asked of the compile that is on file rather than of a fresh one.
 *
 * Usage: npx tsx scripts/compile-intake.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { compileContract } from '../lib/compile-contract';
import { compileInputs } from '../lib/intake';
import { COMPILER_MODEL } from '../lib/models';
import { describeVerdict, verifyProvenance } from '../lib/provenance';

/** Words that would mark a clause or a question as being about the freight hedge. */
const FREIGHT = /freight|fuel|surcharge/i;

async function main() {
  const { db } = await import('../lib/supabase');

  const { inputs, note } = await compileInputs();
  console.log(`compiler ${COMPILER_MODEL}`);
  console.log(`intake   ${inputs.invoiceSamples.length} documents (${inputs.invoiceSamples.map((s) => s.name).join(', ')})`);
  console.log(`         ${inputs.emailThread?.length ?? 0} characters of email`);
  console.log(`         ${note}${inputs.voiceNote ? ` — ${inputs.voiceNote.data.length.toLocaleString()} bytes` : ''}`);
  if (!inputs.voiceNote) throw new Error('no audio in the intake: this script exists to compile WITH the voice note');

  const started = Date.now();
  const compiled = await compileContract(inputs);
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  const { spec, transcript, sources, attempts } = compiled;

  console.log(`\ncompiled in ${secs}s, ${attempts} attempt${attempts > 1 ? 's' : ''}`);
  console.log(`  sources seen: email ${sources.email}, voice note ${sources.voiceNote}, ${sources.invoiceSamples} documents`);
  console.log(`  ${spec.rules.length} clauses, ${spec.open_questions.length} open question(s)`);
  console.log(`  transcript: ${transcript ? `${transcript.length} characters` : 'NONE RETURNED'}`);

  const { data: contract, error } = await db
    .from('contracts')
    .insert({ name: 'AP three-way match', version: 1, spec, transcript })
    .select('id')
    .single();
  if (error) throw new Error(`contracts insert: ${error.message}`);
  const contractId = String(contract.id);
  console.log(`  filed as contract ${contractId}`);

  await mkdir('artifacts', { recursive: true });
  const artifact = path.join('artifacts', `v1-${contractId}.json`);
  await writeFile(artifact, JSON.stringify({ contractId, spec, transcript, sources, attempts, note }, null, 2));
  console.log(`  written to ${artifact}`);

  // --- the clause set, in full ---
  console.log('\n--- clauses ---');
  for (const r of spec.rules) {
    console.log(`${r.id}  ${r.then.toUpperCase().padEnd(8)} conf ${r.confidence.toFixed(2)}  [${r.provenance.source}]`);
    console.log(`      WHEN ${r.when}`);
    console.log(`      THEN ${r.detail}`);
    console.log(`      QUOTE ${JSON.stringify(r.provenance.quote)}`);
  }

  console.log('\n--- exception schedule ---');
  for (const e of spec.exception_taxonomy) console.log(`  ${e.code.padEnd(22)} default ${e.default_action.padEnd(9)} ${e.description}`);

  console.log('\n--- escalation ---');
  console.log(`  min_confidence ${spec.escalation.min_confidence}`);
  console.log(`  always_escalate_above_amount ${spec.escalation.always_escalate_above_amount}`);
  console.log(`  route_to ${spec.escalation.route_to}`);

  console.log('\n--- open questions ---');
  if (!spec.open_questions.length) console.log('  (none)');
  for (const q of spec.open_questions) console.log(`  - ${q}`);

  // --- provenance ---
  console.log('\n--- provenance, by string search ---');
  const verdicts = verifyProvenance(spec, { emailThread: inputs.emailThread, transcript });
  for (const v of verdicts) console.log(`  ${describeVerdict(v)}`);

  const failed = verdicts.filter((v) => v.checked && !v.verbatim);
  const bySource = new Map<string, number>();
  for (const v of verdicts) bySource.set(v.source, (bySource.get(v.source) ?? 0) + 1);
  console.log(`\n  by source: ${[...bySource].map(([s, n]) => `${s} ${n}`).join(', ')}`);
  console.log(`  ${verdicts.length - failed.length}/${verdicts.length} clauses account for their quote`);

  const voiceClauses = verdicts.filter((v) => v.source === 'voice_note');
  const voiceVerbatim = voiceClauses.filter((v) => v.verbatim);
  console.log(
    `  voice_note provenance: ${voiceClauses.length} clause(s)` +
      (voiceClauses.length ? `, ${voiceVerbatim.length} verbatim in the transcript` : ' — NONE, the intake screen would still be announcing that'),
  );

  // --- the knife-edge question ---
  console.log('\n--- the freight hedge ---');
  const freightRules = spec.rules.filter((r) => FREIGHT.test(`${r.when} ${r.detail} ${r.provenance.quote}`));
  const freightQuestions = spec.open_questions.filter((q) => FREIGHT.test(q));
  const freightExceptions = spec.exception_taxonomy.filter((e) => FREIGHT.test(`${e.code} ${e.description}`));

  console.log(`  clauses mentioning freight/fuel/surcharge: ${freightRules.length}`);
  for (const r of freightRules) {
    console.log(`    ${r.id} → ${r.then.toUpperCase()}  [${r.provenance.source}] conf ${r.confidence.toFixed(2)}`);
    console.log(`      WHEN ${r.when}`);
    console.log(`      THEN ${r.detail}`);
    console.log(`      QUOTE ${JSON.stringify(r.provenance.quote)}`);
  }
  console.log(`  open questions mentioning freight: ${freightQuestions.length}`);
  for (const q of freightQuestions) console.log(`    - ${q}`);
  console.log(`  exception codes mentioning freight: ${freightExceptions.length}`);
  for (const e of freightExceptions) console.log(`    ${e.code} default ${e.default_action} — ${e.description}`);

  console.log('\n--- transcript as filed ---');
  console.log(transcript ?? '(none)');

  console.log(`\ncontract id: ${contractId}`);
  if (failed.length) {
    console.log(`\n${failed.length} clause(s) do NOT account for their quote. This is a verification failure.`);
    process.exitCode = 1;
  }
}

void main().catch((e) => {
  console.error('\ncompile failed:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
