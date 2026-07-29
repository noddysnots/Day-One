import { z } from 'zod';

export const Action = z.enum(['approve', 'reject', 'escalate']);

export const Rule = z.object({
  id: z.string(),
  when: z.string(),
  then: z.enum(['approve', 'reject', 'escalate', 'check']),
  detail: z.string(),
  provenance: z.object({
    source: z.enum(['voice_note', 'email', 'invoice_sample', 'inferred']),
    quote: z.string(),
  }),
  confidence: z.number().min(0).max(1),
});

export const ContractSpec = z.object({
  role: z.string(),
  scope: z.string(),
  tools_allowed: z.array(z.string()),
  rules: z.array(Rule),
  exception_taxonomy: z.array(
    z.object({
      code: z.string(),
      description: z.string(),
      default_action: Action,
    }),
  ),
  escalation: z.object({
    min_confidence: z.number(),
    always_escalate_above_amount: z.number().nullable(),
    route_to: z.string(),
  }),
  open_questions: z.array(z.string()),
});

export type Rule = z.infer<typeof Rule>;
export type ContractSpec = z.infer<typeof ContractSpec>;
export type Action = z.infer<typeof Action>;

/** Kept here (not imported from tools) so schema consumers never pull the Supabase client. */
export const AVAILABLE_TOOLS = [
  'get_invoice',
  'lookup_po',
  'get_goods_receipt',
  'get_vendor_terms',
  'get_price_list',
  'find_similar_invoices',
  'decide',
  'escalate',
] as const;

/**
 * Data sources a rule may depend on, and the tool that can read them. If a rule needs one of
 * these and the tool is absent from tools_allowed, the rule is unverifiable.
 */
const DATA_SOURCES: { tool: string; label: string; pattern: RegExp }[] = [
  {
    tool: 'get_price_list',
    label: 'the current / live price list',
    pattern: /\bget_price_list\b|price\s*lists?|current\s+(?:price\s+)?list|live\s+(?:unit\s+)?pric(?:e|ing|es)?|list\s+prices?/i,
  },
  {
    tool: 'get_goods_receipt',
    label: 'goods receipts',
    pattern: /\bget_goods_receipt\b|goods\s+receipts?|received_at|qty_received|dock\s+(?:sign|recei)/i,
  },
  {
    tool: 'find_similar_invoices',
    label: 'the invoice ledger (duplicates / re-bills)',
    pattern: /\bfind_similar_invoices\b|similar\s+invoices?|duplicates?|re-?bills?|already\s+on\s+file/i,
  },
  {
    tool: 'get_vendor_terms',
    label: 'vendor terms / contract notes',
    pattern: /\bget_vendor_terms\b|contract_notes|vendor\s+terms|tolerance_pct|risk_flags|contract\s+notes/i,
  },
  {
    tool: 'lookup_po',
    label: 'purchase orders',
    pattern: /\blookup_po\b|purchase\s+orders?|\bPO-\d+/i,
  },
  {
    tool: 'get_invoice',
    label: 'the invoice record',
    pattern: /\bget_invoice\b/,
  },
];

/**
 * Structural guarantee: a rule that depends on a data source whose tool is not in tools_allowed
 * is not emitted as executable — it becomes an open question that says plainly why.
 */
export function dropUnverifiableRules(spec: ContractSpec): {
  spec: ContractSpec;
  dropped: { id: string; tools: string[] }[];
} {
  const allowed = new Set(spec.tools_allowed);
  const kept: Rule[] = [];
  const questions = [...spec.open_questions];
  const dropped: { id: string; tools: string[] }[] = [];

  for (const rule of spec.rules) {
    const text = `${rule.when}\n${rule.detail}`;
    const missing = DATA_SOURCES.filter((d) => d.pattern.test(text) && !allowed.has(d.tool));
    if (!missing.length) {
      kept.push(rule);
      continue;
    }
    dropped.push({ id: rule.id, tools: missing.map((m) => m.tool) });
    const need = missing.map((m) => `${m.label} (tool ${m.tool})`).join('; ');
    const tools = missing.map((m) => m.tool).join(', ');
    questions.push(
      `Unverifiable rule (was ${rule.id}): "${rule.when}" — dropped because it requires ${need}, ` +
        `but ${tools} ${missing.length === 1 ? 'is' : 'are'} not in tools_allowed, so nothing can verify it.`,
    );
  }

  return { spec: { ...spec, rules: kept, open_questions: questions }, dropped };
}

/**
 * The contract is the program: this serialisation is the agent's entire system
 * prompt, so every clause the compiler extracted becomes executable instruction.
 */
export function serializeContract(spec: ContractSpec): string {
  const rules = spec.rules
    .map((r) => `${r.id}. WHEN ${r.when}\n    THEN ${r.then.toUpperCase()} — ${r.detail}`)
    .join('\n');

  const taxonomy = spec.exception_taxonomy
    .map((e) => `${e.code}: ${e.description} → default ${e.default_action}`)
    .join('\n');

  const questions = spec.open_questions.length
    ? spec.open_questions.map((q) => `- ${q}`).join('\n')
    : '- none';

  const tools = spec.tools_allowed.length ? spec.tools_allowed.join(', ') : '(none declared)';

  return `ROLE
${spec.role}

SCOPE
${spec.scope}

TOOLS ALLOWED
${tools}

RULES (cite the rule id in your reasoning whenever one drives a step)
${rules}

EXCEPTION TAXONOMY
${taxonomy}

ESCALATION POLICY
Escalate when your confidence is below ${spec.escalation.min_confidence}.
${
  spec.escalation.always_escalate_above_amount === null
    ? 'No unconditional amount ceiling is defined.'
    : `Always escalate invoices above ${spec.escalation.always_escalate_above_amount}.`
}
Route escalations to ${spec.escalation.route_to}.

UNRESOLVED QUESTIONS
These were never settled by the finance team. If a case turns on one of them, you do not
have authority to decide it — escalate and name the question.
${questions}`;
}
