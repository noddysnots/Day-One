import { compileContract } from './compile-contract';
import { compileInputs } from './intake';
import { COMPILER_MODEL, RUNTIME_MODEL } from './models';
import { runContract } from './run-contract';
import { supabaseConfigured, tryDb } from './supabase';

/**
 * The seam between the screens and the two Gemini calls.
 *
 * Compiling streams what has actually happened, in the order it happened. The long silence in the
 * middle is the model thinking; there is no filler for it, because a bar that moves while nothing
 * is happening is a lie. Running the driving test hands back a run id the moment the run row
 * exists and lets the fifteen cases finish in the background, which is what makes the test screen
 * fill in at genuinely different speeds.
 */

export type Fault = { what: string; fix: string };

export type CompileEvent = { kind: 'status'; text: string } | { kind: 'done'; contractId: string } | ({ kind: 'fault' } & Fault);

function credentialFault(): Fault | null {
  const missing: string[] = [];
  if (!process.env.GEMINI_API_KEY) missing.push('GEMINI_API_KEY');
  if (!supabaseConfigured) missing.push('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  if (!missing.length) return null;
  return {
    what: `No credentials on file for ${missing.join(', ')}.`,
    fix: 'Copy .env.example to .env.local, fill it in, run supabase/schema.sql, then npm run seed and restart the server.',
  };
}

const say = (error: unknown) => (error instanceof Error ? error.message : String(error));

export async function* compileRulebook(): AsyncGenerator<CompileEvent> {
  const fault = credentialFault();
  if (fault) {
    yield { kind: 'fault', ...fault };
    return;
  }

  let prepared: Awaited<ReturnType<typeof compileInputs>>;
  try {
    prepared = await compileInputs();
  } catch (error) {
    yield {
      kind: 'fault',
      what: `The handover could not be read: ${say(error)}.`,
      fix: 'Check public/intake and public/docs. Render the documents with npx tsx scripts/render-docs.ts if public/docs is empty.',
    };
    return;
  }

  const { inputs, note } = prepared;
  yield { kind: 'status', text: `read ${inputs.invoiceSamples.length} documents, ${inputs.emailThread?.length ?? 0} characters of email` };
  yield { kind: 'status', text: note };
  yield { kind: 'status', text: `extracting clauses with ${COMPILER_MODEL}` };

  // The clause count used to land into half a minute of nothing. The clauses themselves are the
  // only true thing available during that stretch — they arrive in order, and one that has arrived
  // has arrived — so they are forwarded as they come. Nothing here is predicted or paced: no line
  // appears until the bytes behind it have been received, which is why there is still no bar.
  const pending: CompileEvent[] = [];
  let wake: (() => void) | null = null;
  const bump = () => {
    const w = wake;
    wake = null;
    w?.();
  };

  type Settled = { ok: Awaited<ReturnType<typeof compileContract>> } | { err: unknown };
  let settled: Settled | null = null;
  // Read through a call so the compiler does not narrow it to the null it was initialised with:
  // every assignment to it happens inside a callback.
  const readSettled = (): Settled | null => settled;

  void compileContract(inputs, (p) => {
    if (p.kind === 'clause') {
      pending.push({ kind: 'status', text: `${p.id} ${p.then} — ${p.when}` });
    } else if (p.kind === 'transcript') {
      pending.push({ kind: 'status', text: 'transcribing the voice note' });
    } else {
      pending.push({ kind: 'status', text: `${p.count} question${p.count === 1 ? '' : 's'} it will not answer` });
    }
    bump();
  }).then(
    (ok) => {
      settled = { ok };
      bump();
    },
    (err) => {
      settled = { err };
      bump();
    },
  );

  let outcome: Settled;
  for (;;) {
    while (pending.length) yield pending.shift()!;
    const done = readSettled();
    if (done) {
      outcome = done;
      break;
    }
    await new Promise<void>((resolve) => {
      wake = resolve;
    });
  }

  if ('err' in outcome) {
    yield {
      kind: 'fault',
      what: `The compiler did not produce a usable contract: ${say(outcome.err)}`,
      fix: 'The reply is logged on the server. Compile again — the model is asked twice before it gives up, so a third attempt often lands.',
    };
    return;
  }
  const compiled = outcome.ok;

  yield {
    kind: 'status',
    text: `${compiled.spec.rules.length} clauses, ${compiled.spec.open_questions.length} unresolved, ${compiled.attempts} attempt${compiled.attempts > 1 ? 's' : ''}${compiled.droppedUnverifiable.length ? `, ${compiled.droppedUnverifiable.length} unverifiable dropped` : ''}`,
  };

  const db = tryDb();
  if (!db) {
    yield { kind: 'fault', ...credentialFault()! };
    return;
  }

  const written = await db
    .from('contracts')
    .insert({ name: 'AP three-way match', version: 1, spec: compiled.spec, transcript: compiled.transcript })
    .select('id')
    .maybeSingle();

  if (written.error || !written.data) {
    yield {
      kind: 'fault',
      what: `The contract compiled but would not file: ${written.error?.message ?? 'the insert returned no row'}.`,
      fix: 'Check that supabase/schema.sql has been run against this project, then compile again.',
    };
    return;
  }

  yield { kind: 'status', text: 'filed as version 1' };
  yield { kind: 'done', contractId: String(written.data.id) };
}

/**
 * Starts the run and resolves as soon as it has an id. The fifteen cases keep going on the server
 * afterwards; the test screen watches the rows land.
 */
export async function startRun(contractId: string): Promise<{ runId: string } | { fault: Fault }> {
  const fault = credentialFault();
  if (fault) return { fault };
  if (!contractId) {
    return { fault: { what: 'No contract was named.', fix: 'Open a rulebook and start the test from there.' } };
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: { runId: string } | { fault: Fault }) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    runContract(contractId, undefined, (runId) => finish({ runId })).then(
      () => finish({ fault: { what: 'The run finished without ever reporting an id.', fix: 'Reload; the test is filed against the contract either way.' } }),
      (error) => {
        console.error(`[day-one] run against ${contractId} failed:`, error);
        finish({
          fault: {
            what: `The driving test stopped: ${say(error)}`,
            fix: `Check the server log for the whole error. The two usual causes are supabase/schema.sql never having been run, and ${RUNTIME_MODEL} hitting its quota — it is called once per turn per case, which adds up quickly.`,
          },
        });
      },
    );
  });
}
