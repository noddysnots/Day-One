'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { ContractSpec } from './contract-schema';
import type { AmendState } from './rows';
import { tryDb } from './supabase';

/** An amendment is never an edit in place: it is a new version with the old one as its parent. */
export async function amend(_previous: AmendState, form: FormData): Promise<AmendState> {
  const db = tryDb();
  if (!db) {
    return {
      error:
        'There is no database behind this build, so the amendment cannot be filed. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local and restart the server.',
    };
  }

  const parentId = String(form.get('contractId') ?? '');
  let candidate: unknown;
  try {
    candidate = JSON.parse(String(form.get('spec') ?? ''));
  } catch {
    return { error: 'The edited contract did not survive the trip to the server. Reload the page and make the change again.' };
  }

  const parsed = ContractSpec.safeParse(candidate);
  if (!parsed.success) return { error: `That is not a valid contract yet. ${z.prettifyError(parsed.error)}` };

  const parent = await db.from('contracts').select('id, name, version, transcript').eq('id', parentId).maybeSingle();
  if (parent.error) return { error: `The contracts table would not answer: ${parent.error.message}` };
  if (!parent.data) return { error: 'The contract being amended is no longer on file. Compile again from the handover.' };

  const written = await db
    .from('contracts')
    .insert({
      name: parent.data.name,
      version: Number(parent.data.version) + 1,
      spec: parsed.data,
      transcript: parent.data.transcript,
      parent_id: parent.data.id,
    })
    .select('id')
    .maybeSingle();

  if (written.error || !written.data) {
    return { error: `The amendment would not save: ${written.error?.message ?? 'the insert returned no row'}.` };
  }

  redirect(`/contract/${written.data.id}`);
}
