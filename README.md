# Day One

A controller leaves. What she knew about paying invoices exists in an email thread, a voice note and
a fortnight of paperwork. One model call compiles that handover into an **employment contract** — a
schema-checked rulebook where every clause quotes the line it came from — and a second model call
puts that contract through a **driving test**: fifteen invoices, one independent agent loop each,
with the serialised contract as the entire system prompt. The contract is the program. Amending it
is a versioned edit, and the run screen shows what the edit bought, case by case.

Next 16 (App Router, server components), Supabase Postgres and Storage, Gemini, Zod, Tailwind 4.

- The corpus, locked before the first run: [`day-one-corpus.md`](day-one-corpus.md)
- Presenting it: [`docs/demo-runbook.md`](docs/demo-runbook.md)
- Live paste text + pocket encore (Clause B only): [`docs/pocket-clauses.md`](docs/pocket-clauses.md)

---

## Setup from cold

You need Node 20+, a Supabase project, a Gemini API key, and — only for the `scripts/ui/` passes —
Chrome installed locally (`playwright-core` drives the browser you already have and downloads
nothing).

**1. Install.**

```bash
npm install
```

**2. Credentials.** Copy `.env.example` to `.env.local` and fill it in.

| Variable | Needed for |
|---|---|
| `GEMINI_API_KEY` | both model calls |
| `NEXT_PUBLIC_SUPABASE_URL` | every read and write. Cannot be derived from the keys — take it from the dashboard |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only, bypasses RLS. `sb_secret_...` is fine |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | unused today; every read goes through server components on the secret key |
| `SUPABASE_PROJECT_REF` | `scripts/apply-schema.ts` only |
| `SUPABASE_DB_PASSWORD` | `scripts/apply-schema.ts` only |
| `DATABASE_URL` | the `pg`-based scripts (`verify-step1`, `why-wrong`). Written into `.env.local` for you by `apply-schema` |

**3. Apply the schema.** Either paste [`supabase/schema.sql`](supabase/schema.sql) into the Supabase
SQL editor, or:

```bash
npx tsx scripts/apply-schema.ts
```

The script exists because `db.<ref>.supabase.co` no longer resolves for this project. It walks the
regional poolers until one accepts the credentials, applies the DDL, then caches the working
endpoint as `DATABASE_URL` in `.env.local`. The password is passed as a discrete connection field,
never interpolated into a URL or a shell command, because it contains a `$`.

The schema drops and recreates the demo tables. It is not migration-safe and is not meant to be.

**4. Seed.**

```bash
npm run seed
```

Validates the corpus, renders all 17 invoice documents, uploads them to the public `invoices`
bucket, writes vendors, **current price lists**, purchase orders, goods receipts and invoices with
ground truth, then reads the whole thing back as a three-way join and refuses to finish unless the
distribution is 6/6/3 and every case resolves coherently. Safe to re-run; it clears the demo tables
first, **including contracts and runs**. To correct one document without destroying a scored run,
use `npx tsx scripts/resync-invoice.ts INV-2231`.

**5. Run it.**

```bash
npm run build && npx next start --port 3111
```

Port 3111 is what the `scripts/ui/` passes expect (`DAY_ONE_BASE` overrides it). Then open
`http://localhost:3111` and press **Compile the rulebook**.

Use the production build for anything you are timing, demonstrating or screenshotting. Two reasons,
both visible on screen: `next dev` compiles routes on first request, which lands the compile cost
inside the first navigation, and it plants the Next dev-tools badge in the bottom-left corner of
every page. `next build` is verified clean on this machine — it does fetch the three Google faces at
build time, so it needs the network for that step.

---

## Verification

Each of these exists to prove one claim, and each prints `pass`/`FAIL` or exits non-zero.

| Command | What it proves |
|---|---|
| `npm run typecheck` | no `any` creep, no drift between the Zod schemas and the code |
| `npx tsx scripts/check-corpus.ts` | corpus invariants with no database at all: 6/6/3, every total equals its line sum plus tax, only Vantage bills tax and only case 11 disagrees with the contracted rate, only case 14 predates its receipt |
| `npx tsx scripts/storage-check.ts` | the bucket exists, uploads land, and the public URLs return real images |
| `npx tsx scripts/verify-step1.ts` | the same invariants in SQL, as one join across invoices, POs and receipts for all 15 cases. Needs `DATABASE_URL` |
| `npm run test:tools` | all eight tools callable in isolation against the real database; case 7's invoice unit prices match the live list; the two planted near-duplicates are genuinely discovered by SQL; missing PO and missing receipt both report `{found:false}`; bad arguments come back as an error result rather than an exception |
| `npm run test:compiler` | three compiles on identical inputs, all schema-valid, ≥6 rules, ≥1 open question, and **every provenance quote found verbatim in the input it claims to come from**, by string search |
| `npx tsx scripts/run-v1.ts` | compiles v1, runs all fifteen cases, prints the honest first number |
| `npx tsx scripts/compile-intake.ts` | one compile from the **complete** intake — documents, email and the voice note as inline audio — then verifies every quote and reports where the freight hedge landed |
| `npx tsx scripts/check-provenance.ts <contractId>...` | every quoted clause on a stored contract is verbatim in the source it cites, checked against the transcript **on the row** rather than the one held during the compile, and at least one clause cites the voice note |
| `npx tsx scripts/check-summaries.ts` | no folded tool result displays an identifier its record does not hold — the mid-token truncation that rendered `PO-221` from `PO-2219`. Fixtures plus a scan of every tape on file |
| `npx tsx scripts/drive.ts <contractId>` | runs one contract against all fifteen cases and writes the scorecard to `artifacts/` |
| `npx tsx scripts/ui/time-path.ts` | cold load → compiled contract → scored run in one take, with every gap between compiler status lines measured. Deletes its throwaway contract unless `--keep` |
| `npx tsx scripts/ui/run-through-ui.ts <contractId> <prefix>` | the driving test starts and fills in from the screen, not from a direct `runContract` call |
| `npx tsx scripts/ui/amend.ts <contractId>` | the amendment as the demo does it: the cancelled-PO question answered, the advance-billing clause added by hand, a new version filed |
| `npx tsx scripts/ui/verify-diff.ts <v2RunId>` | the diff panel on screen agrees with the two runs in the database |
| `npx tsx scripts/ui/visual-pass.ts <runId> [caseNo]` and `check-entry.ts` | one stamp per screen, rule citations land where they should, tape timestamps separate steps, nothing overflows at 390px, focus is visible |
| `npx tsx scripts/ui/verify-fixes.ts <runId>` | every tape row is separable to the millisecond, a finished tape opens on its decision, an open run shows no deltas and no diff while its absolute figures stay live, no scratchpad or unresolvable rule badge survives on a tape, both screens measure exactly 390, and the console is silent. Briefly clears and restores the run's `finished_at` to see the open-run case |
| `npx tsx scripts/check-reasoning.ts` | the predicate that decides what reaches a tape keeps genuine reasoning and drops drafted parameters, lead-ins and truncated fragments — no database, no model |
| `npx tsx scripts/prune-trace.ts` | every reasoning step on file still reads as reasoning, by the same predicate the runtime writes with. `--apply` removes any that do not |
| `npx tsx scripts/probe-pro.ts` | which model strings this key actually answers on, so `lib/models.ts` is never quoting a stale entitlement |

Read-only inspection, for when a number needs explaining: `scripts/state.ts` (contracts and runs on
file), `show-contract.ts` (a version exactly as the agent receives it), `run-detail.ts` (every case
against ground truth), `trace.ts <runId> <caseNo>` (one persisted tape), `why-wrong.ts` (the tapes
for the cases that missed).

For the encore / paste helpers in `docs/pocket-clauses.md`: `pocket-clause.ts <parentId> A|B|AB`
files advance-billing (`A`, now a live edit) or Clause B (`B`, pocket encore) as a throwaway version
on a parent, and `cleanup-demo.ts <v2ContractId>` takes everything but the demo pair back off the
file. Prefer `amend-v2.ts` for the live cancelled-PO + advance-billing pair.

Two that change the record, both dry-run by default: `prune-trace.ts` above, and
`drop-run.ts <runId>` (takes a superseded driving test off the file, tapes and all; refuses to remove
a contract's only run). `render-icon.ts` regenerates `app/favicon.ico` from the SVG in its source.

## Where it stands

| | correct | touchless | over-escalated | under-escalated |
|---|---|---|---|---|
| v1, compiled from the handover | 12/15 | 73.3% | 1 (case 12) | 2 (cases 14, 15) |
| v2, after cancelled-PO + advance-billing | 14/15 | 73.3% | 0 | 1 (case 15) |

Freight (case 13) already escalates at v1 — that is judgment, not a live edit. Case 15 stays wrong
for the pocket encore. Agent run concurrency is **6**. Cold load to scored v1: **94.1s** on the
last timed take (compile ~28s, run ~64s).

Clause count has been stable at 12 across three identical compiles at temperature 0.2, but
open-question phrasing and provenance quotes still move — treat the table as the shape of the
result and re-measure rather than quoting it.

**Case 7 is grounded.** Four consecutive runs on the measured v1 all approved, each calling
`get_price_list` and stating that billed unit prices match the live list (stale PO, variance under
5%). The unverifiable-rule check did not drop any clause on these compiles — `get_price_list` was
in `tools_allowed` whenever a price-list rule was emitted.

**The handover pack includes the voice note**, at `public/intake/voice-note.wav` — passed to the
compiler as an inline `audio/wav` part in the same pass that produces the rules. A few of v1's
dozen clauses carry `voice_note` provenance, and `scripts/check-provenance.ts` re-checks every
quote against the transcript stored on the contract row.

The recording is **synthesized, not a real human take** — `scripts/make-voice-note.ts` generates it
and `scripts/verify-voice-note.ts` transcribes the file again on a cold call. Say so if the room
asks; the disclosure is in the runbook.

### Tools (8 scopes)

| Tool | Reads |
|---|---|
| `get_invoice` | invoice under review |
| `lookup_po` | purchase order by number |
| `get_goods_receipt` | receipt lines and date for a PO |
| `get_vendor_terms` | tolerance, contract notes, risk flags |
| `get_price_list` | current unit prices for a vendor |
| `find_similar_invoices` | near-duplicates in the ledger |
| `decide` / `escalate` | terminals |

A compiled rule that depends on a data source whose tool is missing from `tools_allowed` is not
emitted as executable — it is raised in `open_questions` as unverifiable.

## Deviations from the build spec

**Models.** The spec asks for Gemini 2.5 Pro for the compiler and 2.5 Flash for the runtime. Both
run `gemini-3.6-flash` instead (`lib/models.ts`):

- `gemini-2.5-pro`, `gemini-2.5-flash` and `gemini-2.5-flash-lite` all return 404, "no longer
  available to new users". They are retired rather than refused, so no change of key or billing
  brings either spec model back.
- Pro is callable since billing was enabled: `gemini-3.1-pro-preview` and `gemini-pro-latest` both
  answer, where every Pro string previously came back 429 with `limit: 0`. Staying on flash is now a
  latency choice rather than a limit — flash answers in roughly a third of Pro's time, which is what
  keeps a cold load to a scored run inside two minutes. Point `COMPILER_MODEL` at
  `gemini-3.1-pro-preview` for the stronger compile the spec asks for and accept the wait on that one
  call.
- All four paths this build needs are verified on `gemini-3.6-flash`: text, image input, inline
  audio, and function calling. `scripts/probe-pro.ts` re-checks every string above against the key.

**Two additive schema columns**, both unavoidable rather than convenient:

- `purchase_orders.po_date` — case 7 turns entirely on whether the PO was cut before the April price
  revision. Without the date the stale-PO clause is unevaluable and the case is untestable.
- `invoices.case_no` — the corpus doc numbers the cases 1 to 15 and every script, screen and
  conversation refers to them by that number. Nothing else in the row is a stable handle:
  `invoice_number` is vendor-facing and the two ledger-history invoices deliberately have no case
  number at all (`case_no is null` is what separates a test case from history).

**`contracts.transcript`** holds the voice-note transcript the compiler returns in the same pass as
the rules, so provenance can be highlighted against the transcript on the contract screen and an
amendment can carry the parent's transcript forward. It is nullable and is null only when no audio
is supplied; with the voice note in the pack it holds 1,274 characters on both demo contracts.

## Security

The credentials in `.env.local` — the Gemini key, the Supabase service-role key and the database
password — passed through a chat transcript during this build. **Rotate all three before this
project goes anywhere but a laptop.** The service-role key bypasses RLS, and this schema is
deliberately single-tenant with no auth and no RLS, so that key is complete access to the project.
`.env.local` is gitignored; `.env.example` carries names only.
