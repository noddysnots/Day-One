/**
 * Re-verifies the provenance of a contract already on file, against the transcript stored beside
 * it rather than the one held in memory during the compile.
 *
 * compile-intake.ts already checks every quote as it compiles. This asks the narrower question the
 * contract screen depends on: the screen highlights provenance quotes against the *stored*
 * transcript, so if the transcript column were empty, truncated or from a different compile, every
 * voice_note quote would fail to highlight even though the compile-time check passed. Verifying the
 * stored row is the only way to prove the screen has what it needs.
 *
 * Usage: npx tsx scripts/check-provenance.ts <contractId> [<contractId> ...]
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import type { ContractSpec } from '../lib/contract-schema';
import { describeVerdict, verifyProvenance } from '../lib/provenance';

async function main() {
  const ids = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (!ids.length) throw new Error('name at least one contract id');

  const { db } = await import('../lib/supabase');
  const { emailThread } = await import('../lib/intake');
  const thread = await emailThread();
  if (!thread) throw new Error('the email thread is not readable, so nothing can be verified against it');

  let bad = 0;

  for (const id of ids) {
    const { data, error } = await db
      .from('contracts')
      .select('id, version, spec, transcript')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`contracts: ${error.message}`);
    if (!data) throw new Error(`contract ${id} is not on file`);

    const spec = data.spec as ContractSpec;
    const transcript = (data.transcript as string | null) ?? null;

    console.log(`\ncontract ${id}  v${data.version}  ${spec.rules.length} clauses`);
    console.log(
      transcript
        ? `stored transcript: ${transcript.length} characters`
        : 'stored transcript: NONE — the contract screen cannot highlight a voice_note quote',
    );

    const verdicts = verifyProvenance(spec, { emailThread: thread, transcript });

    const bySource = new Map<string, number>();
    for (const v of verdicts) bySource.set(v.source, (bySource.get(v.source) ?? 0) + 1);
    console.log(
      `provenance mix: ${[...bySource.entries()].map(([s, n]) => `${s} ${n}`).join(', ')}`,
    );

    for (const v of verdicts) {
      const ok = !v.checked || v.verbatim;
      if (!ok) bad += 1;
      console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${describeVerdict(v)}`);
    }

    const quoted = verdicts.filter((v) => v.checked);
    const verbatim = quoted.filter((v) => v.verbatim);
    const voice = verdicts.filter((v) => v.source === 'voice_note');
    console.log(`  ${verbatim.length}/${quoted.length} quoted clauses verbatim in the source they cite`);
    console.log(`  ${voice.length} clause(s) carry voice_note provenance`);
    if (!voice.length) {
      bad += 1;
      console.log('  FAIL no clause cites the voice note, so the intake screen still has to say none does');
    }
  }

  console.log(bad ? `\n${bad} problem(s).` : '\nEvery quoted clause is verbatim in the source it cites.');
  process.exitCode = bad ? 1 : 0;
}

void main().catch((e) => {
  console.error('\nfailed:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
