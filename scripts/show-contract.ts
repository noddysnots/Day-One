/** Read-only: print a contract version's spec as the agent is given it, plus raw JSON. */
import { config } from 'dotenv';
config({ path: '.env.local' });

async function main() {
  const { db } = await import('../lib/supabase');
  const { serializeContract, ContractSpec } = await import('../lib/contract-schema');

  const wanted = process.argv[2];
  const query = db.from('contracts').select('id, version, parent_id, spec');
  const { data } = wanted
    ? await query.eq('id', wanted).maybeSingle()
    : await query.order('version', { ascending: false }).limit(1).maybeSingle();
  if (!data) throw new Error('no such contract');

  const spec = ContractSpec.parse(data.spec);
  console.log(`contract ${data.id}  version ${data.version}  parent ${data.parent_id ?? '—'}\n`);
  for (const r of spec.rules) {
    console.log(`${r.id}  ${r.then.toUpperCase().padEnd(8)} conf ${r.confidence}  [${r.provenance.source}]`);
    console.log(`    WHEN   ${r.when}`);
    console.log(`    DETAIL ${r.detail}`);
    console.log(`    QUOTE  ${r.provenance.quote}`);
  }
  console.log(`\nopen questions (${spec.open_questions.length}):`);
  for (const q of spec.open_questions) console.log(`  - ${q}`);
  console.log(`\nescalation: ${JSON.stringify(spec.escalation)}`);
  console.log(`taxonomy: ${spec.exception_taxonomy.map((e) => `${e.code}->${e.default_action}`).join(', ')}`);
  console.log(`\n${'='.repeat(90)}\nas the agent receives it:\n${'='.repeat(90)}`);
  console.log(serializeContract(spec));
}

void main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
