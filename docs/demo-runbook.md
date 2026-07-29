# Demo runbook

Cold load to a scored run, then two live amendments on camera and a re-run that shows what they
bought. Every timing below was measured on this machine, on this path, on the production build, with
the voice note in the pack, eight tools, and **six cases at a time**. Treat the numbers as the shape
of the take, not a promise — do not cut cases, trim the splash, or raise concurrency further to
chase the clock.

---

## Before the room

- `npm run build && npx next start --port 3111`. **Not `next dev`.** Two things go wrong on the
  dev server and both are on camera: it compiles routes on first request, which puts the compile cost
  inside the first navigation, and it plants the Next dev-tools badge in the bottom-left corner.
  Port 3111 is what the UI scripts expect (`DAY_ONE_BASE` overrides it).
- Check nothing stale is holding the port.
- Seed applied, one browser tab, 100% zoom, `sessionStorage` clear so the four-line boot sequence
  plays once — including `granting tool access ....... 8 scopes`.
- Know what is already on file: `npx tsx scripts/state.ts`. It should print **exactly two contracts
  and two runs** — v1 around a dozen correct out of fifteen, v2 two better after the two amendments —
  and they are the fallback if the live compile misbehaves. Anything else on file contradicts the
  figures below; `npx tsx scripts/cleanup-demo.ts <v2ContractId> --apply` takes it off.
- Confirm the audio is where the intake screen looks for it: `public/intake/voice-note.wav`.
- `docs/pocket-clauses.md` open in another window, not on the shared screen — only Clause B is
  held back for the encore.

**The live compile writes a new contract every time.** Clause count has been stable at about a dozen
across three identical intakes at temperature 0.2, but the open-question phrasing and provenance
quotes still move — so quote shapes on camera, not exact figures: *"about a dozen clauses, a couple
still unresolved."* What is stable across compiles is the shape of the score: the clean six pass,
the duplicate and short-receipt cases pass, a few clauses carry `voice_note` provenance, freight
escalates on its own, and the live misses land on cancelled-PO and advance-billing until you amend.
If a live compile comes out visibly odd — no open questions, or a clause the room can pick apart —
say so, and switch to the pair already on file.

---

## The sourcing disclosure — say it once, early

Say this out loud during the compiler's silence, not in answer to a challenge:

> "The invoice documents here are generated. DocILE, the public invoice dataset, is behind a
> registration form and a secret token, and its ungated upstream — the UCSF industry documents
> library — is 1990s legal invoices that are largely illegible and carry no SKU, quantity or
> unit-price lines. The ERP records behind the paper are constructed either way, because no public
> dataset publishes matched purchase orders and goods receipts, so the corpus loader is swappable
> and real DocILE scans drop straight in if the token arrives."

**Second disclosure — the voice note is synthesized.** One line covers it: "the voice note is
synthesized from a script — I wrote what a controller would say and had it read out. What's real is
the path: it goes to the model as audio, in the same call that writes the rules, and the clauses
that come back cite the transcript."

---

## Act one — cold load to a scored run

Quote the shape, not the stopwatch:

| On screen | What to say |
|---|---|
| Boot sequence, then the handover: "Day One", sheets, email, voice-note player | "Dana left on Monday. This is what she left: a fortnight of paperwork, an email thread and a voice note." |
| **Compile the rulebook** pressed | "One model call. It reads the pack — including the audio — and writes an employment contract." |
| Status: documents + email, voice note as audio/wav, extracting clauses | the sourcing disclosure, then the synthesized-audio disclosure |
| **About a dozen clauses land one at a time** | "That's it writing them. Each one is a rule with the line it came from attached." |
| A couple of questions it will not answer; filed as version 1 | "And a couple of things it refused to guess at." |
| Contract screen | "Every clause quotes the line it came from — a few of these came out of the audio. The unresolved panel is the important part: it declined to invent a rule for cancelled POs." |
| Run screen filling in | "Fifteen cases, six at a time, each one an independent agent loop with the contract as its system prompt." |
| Scorecard settles around a dozen correct | "Most of fifteen on day one. Watch the expensive column — under-escalations." |

Last measured whole path: **94.1s** cold load to scored v1 (compile leg ~28s, run leg ~64s)
with concurrency 6 and eight tools. The long silence is still between "extracting clauses" and the
first clause landing (~17s). No progress bar: a bar that moves while nothing is happening is a lie.
Streaming true progress as clauses arrive is honest; do not fake motion during the wait.

Land on **under-escalated**: the cases it settled that should have gone to a human. That is the
number the amendment is about. On the measured pair, v1 is **12/15** — wrong on case 12
(over-escalated cancelled PO) and cases 14 and 15 (under). Case 13 — freight — already
escalates at v1. That is not a miss.

### Freight escalating at v1 is the product working

Say this exactly when the room lands on case 13 or asks why freight was not edited:

> "It knew what it didn't know. The compiler heard Dana say freight is different — she'd have to
> pull the contract, ask me — and refused to invent a rule she didn't give. Freight escalating at
> v1 is judgment before any human edit."

Do **not** weaken the compiler so freight fails, and do **not** paste a freight carve-out on
camera. The live edit set is two other gaps.

### Case 7 — grounded now

Case 7, Calderon INV-8841, used to coin-flip because R-07 needs unit prices to match the current
list and there was no tool for one. There is now: **`get_price_list`**. Four consecutive runs on
the measured v1 all **approved**, each calling the tool and stating the match in the rationale
(stale PO, under 5%, billed prices equal the live list). Do not promise the score out loud before
it lands, but you no longer have to apologise for a missing tool.

---

## Act two — two live amendments

From the contract screen: **Answer these and amend the contract**. Exactly two edits, in this
order.

**Why this order:** cancelled-PO first. Pressing **write the clause** on the open question makes
the unresolved panel shrink on camera — the room sees the gap close before the second paste.
Advance-billing is an **Add a clause** paste with no panel animation, so it goes second.

**Edit one — answer the open question (cancelled-PO).** Press **write the clause** on the
cancelled-PO question. Set the action to `reject` and paste:

Condition:

```
The invoice references a purchase order whose status is cancelled
```

Detail:

```
A cancelled purchase order is not a live commitment, so there is nothing to three-way match against and nothing to pay. Reject and ask the vendor to re-raise against a live PO. This settles the open question and replaces the CANCELLED_PO default of escalate in the exception schedule.
```

Say: "It left this open on purpose. I'm answering it — cancel means reject, not escalate."

**The unresolved panel goes from a couple to one, not to zero.** Leave the freight-tolerance
hedge for other vendors standing — that open question is the other side of "it knew what it
didn't know," not a live edit.

**Edit two — advance-billing (case 14).** Press **Add a clause**. Action stays `escalate`. Paste:

Condition:

```
The invoice is dated before the goods receipt for the purchase order it bills against
```

Detail (cite the three-way approval on screen — often **R-01** when the invoice is over $500):

```
Compare invoice_date on the invoice with received_at on the goods receipt before applying R-01. A three-way match on lines, quantities, tax and total says nothing about the order of events: if the invoice predates the receipt, the vendor billed before delivery, and R-01 does not license approving it. Nothing in get_vendor_terms establishes whether this vendor bills in advance, so the agent has no basis to settle it — escalate to Priya Raghunathan and name both dates so she can confirm a prepay arrangement or send the invoice back.
```

Glance at the rule ids before you paste — numbering moves with the compile. Correct the citation
if the three-way approval is not R-01 on this file.

Say: "It read the receipt date and the invoice date and never put them side by side, because
nothing told it to — and I can't tell it to approve prepay either, because nothing in Vantage's
terms says they're a prepay vendor, so the clause sends it to a human."

Then press **File version 2**.

---

## Act three — the re-run and the diff

**Re-run the driving test** on version 2.

On the measured pair:

- **Now right — 2**: case 12 `escalate → reject` (cancelled-PO answer); case 14 `approve → escalate`
  (advance-billing).
- **Now wrong — 0.**
- Scorecard: **14/15**, under-escalated **1** (case 15 still wrong), over-escalated **0**,
  touchless 73.3%.

Case 15 — the recurring Northline charge caught as a duplicate — stays visibly wrong. That is the
pocket encore (Clause B), not part of the two-minute take.

Both live edits paid, nothing regressed. Say: "Two edits, two cases flipped. It automates about as
much as it did and it is right more often, and the expensive column shrank."

If a room asks where the last miss went: it shows up in `docs/pocket-clauses.md` — Clause B only.

---

## What the audio bought, honestly

Do not oversell. The measured v1 with audio is around a dozen correct; the email-only baseline was
lower with a different miss shape. What the audio reliably buys:

- **Provenance across modalities** — a few clauses cite the voice note, verbatim.
- **The $10,000 ceiling** and the freight judgment (escalate when she said ask me — without inventing
  a tolerance carve-out she never stated).
- **A second open question** on freight tolerances outside the contracted vendor.

If someone asks whether the audio was worth it: the score is close and the provenance is the
product. Say it that way round.

---

## If the room asks for more

One amendment held in `docs/pocket-clauses.md`:

- **Clause B**, case 15: flips the recurring-charge reject to escalate; case 10 stays reject.
- Paste text for the advance-billing clause (the second live edit) is also in that file for the
  presenter — it is no longer "pocket," it is the live Act-two paste.

Check the clause each detail cites before you paste — numbering moves with the compile. On the
current lineage, advance-billing cites the three-way approval (**R-01**) and Clause B cites the
duplicate rule (**R-05**).

---

## Two questions you will get

**"Isn't the model just pattern-matching an obvious rulebook?"** The 15 cases are locked in
`day-one-corpus.md` and were written before the first run. Freight at v1 is the cleanest evidence:
the compiler heard that freight is different and refused to invent the missing rule — judgment,
not a failure to patch on camera.

**"How do you know the provenance quotes are real?"** `scripts/test-compiler.ts` and
`scripts/check-provenance.ts` string-search every quote against the input it claims. A quote that
is not verbatim is the most damaging failure this product can have, so it is never checked by eye.
