/**
 * Pinned model identifiers. Re-probed by scripts/probe-pro.ts on 28 Jul 2026, after billing was
 * enabled on the account — an earlier note here recorded a free-tier refusal that no longer holds.
 *
 * The build spec asks for Gemini 2.5 Pro and 2.5 Flash. Neither string is callable, and it is not a
 * question of entitlement: gemini-2.5-pro, gemini-2.5-flash and gemini-2.5-flash-lite all answer
 * 404, "no longer available to new users". They are retired, so no billing change brings them back.
 *
 * Pro is reachable now. gemini-3.1-pro-preview and gemini-pro-latest both answer, where before
 * billing every Pro string came back 429 with "generate_content_free_tier_requests, limit: 0".
 * Staying on flash is therefore a choice, not a limit: gemini-3.6-flash answers in about a third of
 * Pro's latency, which is what keeps a cold load to a scored run inside two minutes, and all four
 * paths this build needs are verified on it — text, image input (it read INV-2244's total off the
 * JPEG), inline audio/wav, and function calling.
 *
 * Point COMPILER_MODEL at gemini-3.1-pro-preview for a stronger compile at the cost of that latency.
 */
export const COMPILER_MODEL = 'gemini-3.6-flash';
export const RUNTIME_MODEL = 'gemini-3.6-flash';

/** Confirmed callable on this key, strongest first. Useful if one starts rate limiting. */
export const FLASH_FALLBACKS = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3-flash-preview'] as const;
