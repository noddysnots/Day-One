import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const SUPABASE_MISSING =
  'Supabase is not configured. Copy .env.example to .env.local and set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.';

export const supabaseConfigured = Boolean(url && key);

let client: SupabaseClient | null = null;

/**
 * Null when credentials are absent. Screens read through this so an unseeded machine renders
 * an empty state instead of a stack trace.
 */
export function tryDb(): SupabaseClient | null {
  if (!url || !key) return null;
  client ??= createClient(url, key, { auth: { persistSession: false } });
  return client;
}

/**
 * Service-role client. Server-only: never import this from a client component.
 * Resolved on first property access, so the missing-credentials error lands at the call site
 * rather than at import time (which would take the whole build down with it).
 */
export const db = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const live = tryDb();
    if (!live) throw new Error(SUPABASE_MISSING);
    const value = live[prop as keyof SupabaseClient];
    return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(live) : value;
  },
});

export const DOC_BUCKET = 'invoices';
