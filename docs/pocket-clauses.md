# Pocket clauses (and the live advance-billing paste)

The live Act-two edit set is **cancelled-PO** then **advance-billing** (case 14). Freight is not
edited on camera — escalating it at v1 is the product working. Only **Clause B** (case 15) is held
back as a pocket encore if the room asks for more.

Advance-billing used to be pocket Clause A. It is now a **live amendment**. The paste text stays
here so the presenter has one place to copy from; it is not "held in reserve."

Apply a pocket encore the same way as the live edits: **Add a clause** on the editor, paste, file,
re-run. The editor's **Add a clause** button already defaults the action to `escalate`, assigns the
id automatically as the highest on file plus one, and stamps provenance as `inferred` with the
quote `written by hand in the editor`. So through the UI you paste two fields and touch nothing
else. The full `Rule` objects below are for the record and for amending by script —
`scripts/pocket-clause.ts` is that script (`B` for the encore; `A` still files the advance-billing
clause if you need it headless).

**Status: measured 28 Jul 2026** against live v1 `70a15735` (12/15) → v2 `c844e3b4` (14/15) after
cancelled-PO + advance-billing. Case 15 still wrong. Clause ids on that v2 are R-01 to R-14; the
encore lands as **R-15**. Figures below are measured on that pair.

| Applied | Correct | Over | Under | Touchless | Intended flip |
|---|---|---|---|---|---|
| Live v2 (cancelled-PO + advance-billing) | **14/15** | 0 | 1 (case 15) | 73.3% | case 12 `escalate` → `reject`; case 14 `approve` → `escalate` ✓ |
| Clause B alone on that v2 | expect **15/15** | 0 | 0 | ~67% | case 15 `reject` → `escalate`; case 10 stays `reject` |

Case 7 is grounded via `get_price_list` on this lineage — four of four v1 probes approved with the
tool cited — so it is no longer the coin-flip footnote it was.

---

## Check the citation before you paste

Each detail cites the clause it qualifies, and **the number depends on the compile**. In the
measured lineage:

- Advance-billing cites **R-01**, the standard three-way-match approval (case 14 is $4,600, so it
  is not the under-$500 rule).
- Clause B cites **R-05**, the duplicate rule.

---

## Advance-billing — case 14, billed before the goods arrived (LIVE edit two)

**Not pocket.** This is the second live amendment in `docs/demo-runbook.md`. Paste text kept here
for the presenter.

**Fixes:** case 14, Vantage INV-2258. Ground truth `escalate`; v1 **approves**.

**Why it happens:** the agent calls `get_goods_receipt`, confirms every line against the invoice,
and approves under the three-way rule. The invoice is dated before `received_at`. It never compares
the two dates, because no clause asks it to.

**Paste into the editor** — action stays `escalate`.

Condition:

```
The invoice is dated before the goods receipt for the purchase order it bills against
```

Detail (cite the three-way approval on screen — **R-01** on the measured lineage):

```
Compare invoice_date on the invoice with received_at on the goods receipt before applying R-01. A three-way match on lines, quantities, tax and total says nothing about the order of events: if the invoice predates the receipt, the vendor billed before delivery, and R-01 does not license approving it. Nothing in get_vendor_terms establishes whether this vendor bills in advance, so the agent has no basis to settle it — escalate to Priya Raghunathan and name both dates so she can confirm a prepay arrangement or send the invoice back.
```

**Measured effect on the live v2.** Case 14 moved `approve` → **`escalate`**. Together with the
cancelled-PO answer (case 12 `escalate` → `reject`), score moved **12 → 14/15**; case 15 stayed
wrong.

**Say while pasting:** "It read the receipt date and the invoice date and never put them side by
side, because nothing told it to — and I can't tell it to approve prepay either, because nothing in
Vantage's terms says they're a prepay vendor, so the clause sends it to a human."

**Notes.** Nothing else in the corpus is invoiced before its receipt — the seed asserts case 14 is
the only one — so this clause cannot touch the other fourteen cases.

By script (throwaway measure, then clean up):

```bash
npx tsx scripts/pocket-clause.ts <v1ContractId> A --cite-a R-01
```

Prefer `scripts/amend-v2.ts` for the full live pair (cancelled-PO + advance-billing).

---

## Clause B — case 15, a recurring charge caught by the duplicate rule (POCKET encore)

**Fixes:** case 15, Northline INV-4478. Ground truth `escalate`; v1 and live v2 both **reject as a
duplicate**.

**Why it happens:** the agent holds all the evidence — different period descriptions, a blanket PO
with periods unconsumed — and rejects on vendor-plus-amount alone under R-05.

**Paste into the editor** — action stays `escalate`.

Condition:

```
The invoice looks like a duplicate under R-05, but the two invoices name different billing periods, or the purchase order is a blanket with periods still unconsumed on the goods receipt
```

Detail:

```
Before rejecting under R-05, read the line descriptions find_similar_invoices returned against the ones on the invoice, and call lookup_po and get_goods_receipt on the purchase order behind them. Same vendor and same amount is not enough: descriptions naming different periods, or a blanket PO whose goods receipt still shows periods unconsumed, mean the second bill may be the next period falling due rather than a re-bill of the first. R-05 was written for re-bills and does not settle that — escalate to Priya Raghunathan, name both invoice numbers and both periods, and say how many periods of the blanket remain, so she can confirm the later period is genuinely due.
```

**Expected effect.** Case 15 moves `reject` → **`escalate`**. Correct ~14 → **~15/15**; case 10
holds `reject`; over-escalated stays at 0. Touchless drops a notch — say the trade out loud if you
apply it.

**Say while pasting:** "The trace shows it read 'August' and 'September' and a blanket PO with
periods left, and rejected on vendor-plus-amount anyway — this clause says that when the two bills
name different periods, you don't get to call it a duplicate, you name both periods and ask."

---

## Case 7 is grounded

Case 7 used to coin-flip because R-07 needs the current price list and no tool could read one.
`get_price_list` is live. Four consecutive runs on the measured v1 all approved, each calling the
tool and stating that billed unit prices match the list (stale PO, variance under 5%). Seed pins
the invariant: list prices equal the case 7 invoice, not the stale PO.

If it ever escalates on camera anyway, read the tape — the rationale should still name the list
result, not invent a match.

---

## Applying Clause B on camera

0. Check the clause ids on screen first. Clause B's detail cites the duplicate rule; if you are
   amending a differently numbered compile, correct the citation before you paste.
1. From the contract screen, **Answer these and amend the contract**.
2. **Add a clause** at the foot of the list. It appears with the next id and action `escalate`.
3. Paste the condition, paste the detail. Do not touch the action.
4. **File version N+1**.
5. **Re-run the driving test** on the new version.

By script:

```bash
npx tsx scripts/pocket-clause.ts <v2ContractId> B --cite-b R-05
npx tsx scripts/drive.ts <newContractId>
npx tsx scripts/cleanup-demo.ts <v2ContractId> --apply
```
