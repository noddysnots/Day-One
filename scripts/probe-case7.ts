/**
 * Compile a fresh v1 from the complete intake, then run case 7 four times on that
 * contract and report whether each decision is grounded in a get_price_list result.
 *
 * Usage: npx tsx scripts/probe-case7.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { GoogleGenAI, type Content } from '@google/genai';
import { serializeContract, type ContractSpec } from '../lib/contract-schema';
import { compileContract } from '../lib/compile-contract';
import { compileInputs } from '../lib/intake';
import { COMPILER_MODEL, RUNTIME_MODEL } from '../lib/models';

async function main() {
  const { db } = await import('../lib/supabase');
  const { executeTool, functionDeclarations } = await import('../lib/tools');
  type TerminalDecision = NonNullable<Awaited<ReturnType<typeof executeTool>>['terminal']>;

  async function runCase7(
    ai: GoogleGenAI,
    spec: ContractSpec,
    invoice: { id: string; vendor_id: string; invoice_number: string },
  ): Promise<{
    action: string | null;
    rationale: string | null;
    calledPriceList: boolean;
    grounded: boolean;
    toolCalls: string[];
  }> {
    const allowed = new Set(spec.tools_allowed);
    const declarations = functionDeclarations.filter(
      (d) => d.name === 'decide' || d.name === 'escalate' || allowed.has(d.name!),
    );
    const history: Content[] = [
      {
        role: 'user',
        parts: [
          {
            text:
              `Case brief.\n\ninvoice_id: ${invoice.id}\nvendor_id: ${invoice.vendor_id}\n\n` +
              'Work the invoice against your contract. Pull whatever records you need before you ' +
              'decide, and state which rule id you are applying as you go. Finish by calling decide ' +
              'or escalate exactly once.',
          },
        ],
      },
    ];

    let terminal: TerminalDecision | null = null;
    const toolCalls: string[] = [];
    let calledPriceList = false;

    for (let turn = 0; turn < 8 && !terminal; turn++) {
      const response = await ai.models.generateContent({
        model: RUNTIME_MODEL,
        contents: history,
        config: {
          systemInstruction: serializeContract(spec),
          tools: [{ functionDeclarations: declarations }],
          temperature: 0.2,
        },
      });

      const parts = response.candidates?.[0]?.content?.parts ?? [];
      const calls = response.functionCalls ?? [];
      if (!calls.length) {
        history.push({ role: 'model', parts: parts.length ? parts : [{ text: '(no output)' }] });
        history.push({ role: 'user', parts: [{ text: 'Call a tool, or finish with decide or escalate.' }] });
        continue;
      }

      history.push({ role: 'model', parts });
      const responseParts: Record<string, unknown>[] = [];
      for (const call of calls) {
        toolCalls.push(call.name!);
        const outcome = await executeTool(call.name!, call.args, { invoiceId: invoice.id });
        if (call.name === 'get_price_list') calledPriceList = true;
        if (outcome.terminal) terminal = outcome.terminal;
        responseParts.push({
          functionResponse: { name: call.name, response: { result: outcome.result } },
        });
      }
      history.push({ role: 'user', parts: responseParts });
    }

    const rationale = terminal?.rationale ?? null;
    const grounded =
      calledPriceList &&
      Boolean(rationale) &&
      /price\s*list|list\s+price|current\s+list|live\s+pric|get_price_list|unit\s+prices?\s+match/i.test(rationale!);

    return { action: terminal?.action ?? null, rationale, calledPriceList, grounded, toolCalls };
  }

  const { inputs, note } = await compileInputs();
  if (!inputs.voiceNote) throw new Error('voice note required');

  console.log(`compiler ${COMPILER_MODEL} | runtime ${RUNTIME_MODEL}`);
  console.log(note);

  const compiled = await compileContract(inputs);
  console.log(
    `\nv1: ${compiled.spec.rules.length} clauses, ${compiled.spec.open_questions.length} open, ` +
      `${compiled.droppedUnverifiable.length} unverifiable dropped`,
  );
  if (compiled.droppedUnverifiable.length) {
    for (const d of compiled.droppedUnverifiable) console.log(`  dropped ${d.id} (needed ${d.tools.join(', ')})`);
  }
  console.log(`tools_allowed: ${compiled.spec.tools_allowed.join(', ')}`);
  const stale = compiled.spec.rules.filter((r) => /stale|price\s*list|current\s+list/i.test(`${r.when} ${r.detail}`));
  console.log(`stale/price-list rules kept: ${stale.map((r) => r.id).join(', ') || '(none)'}`);

  const { data: contract, error } = await db
    .from('contracts')
    .insert({ name: 'AP three-way match', version: 1, spec: compiled.spec, transcript: compiled.transcript })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  console.log(`filed ${contract.id}\n`);

  const { data: c7, error: c7err } = await db
    .from('invoices')
    .select('id, vendor_id, invoice_number')
    .eq('case_no', 7)
    .single();
  if (c7err) throw new Error(c7err.message);

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const results = [];
  for (let i = 1; i <= 4; i++) {
    const r = await runCase7(ai, compiled.spec, c7);
    results.push(r);
    console.log(
      `run ${i}: ${String(r.action).padEnd(8)} grounded=${r.grounded} price_list=${r.calledPriceList} ` +
        `tools=[${r.toolCalls.join(', ')}]`,
    );
    console.log(`         ${(r.rationale ?? '(none)').slice(0, 220)}`);
  }

  const actions = new Set(results.map((r) => r.action));
  const allGrounded = results.every((r) => r.grounded);
  const coinFlip = actions.size > 1 && results.some((r) => !r.grounded);
  console.log(`\nactions seen: ${[...actions].join(', ')}`);
  console.log(`all four grounded in price-list tool result: ${allGrounded ? 'YES' : 'NO'}`);
  console.log(`coin flip (unacceptable): ${coinFlip ? 'YES' : 'no'}`);
  console.log(`\ncontract id: ${contract.id}`);
}

void main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
