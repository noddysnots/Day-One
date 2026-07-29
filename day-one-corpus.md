# Day One — the 15-case corpus

Lock this before the first run. Do not tune it after seeing results.

Vendors:

| Vendor | Terms | tolerance_pct | contract_notes | risk_flags |
|---|---|---|---|---|
| Meridian Packaging | Net 30 | 2.0 | — | — |
| Vantage Labs | Net 45 | 2.0 | Tax rate 8% on all lines | — |
| Orbit Facilities | Net 30 | 2.0 | — | — |
| Calderon Industrial Supply | Net 30 | 2.0 | Price revision effective Apr 1; POs cut before then are stale | stale_po |
| Northline Freight | Net 30 | 2.0 | Freight surcharge lines excluded from standard tolerance; monthly LTL retainer billed on the 1st | duplicate_history |

---

## Clean (6) — ground truth `approve`

| # | Vendor | Invoice | PO | Invoice total | PO total | Setup |
|---|---|---|---|---|---|---|
| 1 | Meridian | INV-7712 | PO-3301 | 2,340.00 | 2,340.00 | Exact, receipt full |
| 2 | Vantage | INV-2205 | PO-3318 | 418.00 | 418.00 | Under $500 |
| 3 | Orbit | INV-9034 | PO-3325 | 6,720.00 | 6,720.00 | Exact, receipt full |
| 4 | Calderon | INV-8802 | PO-3290 | 1,150.00 | 1,150.00 | Exact, PO cut after Apr 1 |
| 5 | Meridian | INV-7749 | PO-3340 | 289.00 | 289.00 | Under $500 |
| 6 | Vantage | INV-2231 | PO-3352 | 3,926.01 | 3,910.00 | +$16, 0.4%, inside both tests |

Reason for all six: three-way match agrees within tolerance.

---

## Exception (6)

**7. Calderon INV-8841 → `approve`**
$4,180 vs PO-2219 $4,050. Overage 3.2%, $130. PO cut in March, before the April price
revision. Unit prices match the current list.
Reason: "Stale PO. Under 5% and unit prices match the current list, so it clears under the
rule Dana set in the email thread."
*Tests whether the compiler used the email at all. A voice-note-only rulebook gets this
wrong.*

**8. Meridian INV-7760 → `reject`**
Bills 200 units at $14.20 = $2,840 against PO-3361 for 200. Goods receipt shows 140
received.
Reason: "Billed for 200, received 140. Short receipt, do not pay the difference."

**9. Orbit INV-9051 → `escalate`**
$2,860, `po_number_ref` is null. No PO exists.
Reason: "No PO. Off-contract purchase, Priya needs to find the owner."

**10. Northline INV-4417 → `reject`**
$1,480. Northline INV-4402, same amount, identical line items, dated 9 days earlier,
already paid.
Reason: "Duplicate of INV-4402. Same lines, same amount, nine days apart."

**11. Vantage INV-2244 → `escalate`**
Subtotal $5,000, tax charged $450, total $5,450. Vantage contract rate is 8%, so tax
should be $400. PO-3372 total $5,400. Overage is exactly $50.
Reason: "Tax is over-charged by $50 and the overage lands exactly on the tolerance
boundary. Someone decides."
*Boundary case. Tests whether the rulebook handles "whichever is lower" and inclusive vs
exclusive comparison.*

**12. Calderon INV-8863 → `reject`**
$7,300 against PO-3299, status `cancelled`.
Reason: "PO was cancelled. Nothing to match against."
*The voice note never covers cancelled POs. Should appear in `open_questions`. If the
compiler invented a rule here, it will likely get it wrong.*

---

## Ambiguous (3) — all ground truth `escalate`

These three carry the pitch. Each is built so a confident naive rulebook auto-decides.

**13. Northline INV-4460 → `escalate`**
$2,748 vs PO-3370 $2,700. Overage $48, 1.78%. Inside 2% and under $50, so a naive rule
approves it. The entire $48 sits on a single line: "Fuel surcharge — regional."
Reason: "It's inside tolerance on paper, but the whole overage is freight, and freight
doesn't fall under standard tolerance for Northline. I'd want to look."
*Requires `get_vendor_terms` and reading `contract_notes`. Pure invoice-vs-PO arithmetic
gets this wrong.*

**14. Vantage INV-2258 → `escalate`**
$4,600, matches PO-3381 exactly, receipt lines match. Invoice dated 4 days before the
goods receipt date.
Reason: "Everything matches, but they billed us before we received it. Could be a prepay
arrangement, could be someone billing early. No rule covers this."
*No rule exists anywhere in the inputs. The correct compiler behaviour is an
`open_questions` entry. The correct agent behaviour is to notice the date order anyway and
escalate rather than approve on a clean match.*

**15. Northline INV-4478 → `escalate`**
$890, line description "Monthly LTL retainer — September". Northline INV-4455, also $890,
11 days earlier, description "Monthly LTL retainer — August".
Reason: "Same vendor, same amount, close together, so the duplicate check fires. But these
are two different months of a recurring charge. Could also be a re-bill. Look at it."
*The Northline duplicate rule over-triggers and rejects. Being wrong by being too
cautious is still being wrong, and this case makes that visible.*

---

## Expected trajectory

Contract v1, compiled from voice note plus email, should land near 9 or 10 correct out of
15. The predictable failures are 7 (if the email was ignored), 12, 13, 14, and 15.

After the human answers the cancelled-PO open question and adds the advance-billing
(invoice-before-receipt) clause — freight already escalating at v1 is intentional, not a
gap to patch — v2 should reach around 14 out of 15, with case 15 still wrong until the
pocket encore.

**If v1 scores above 11, do not adjust the corpus.** Adjust the compiler prompt to be
stricter about not inventing rules. The corpus is the fixed measuring stick; moving it to
flatter the result is the one thing that makes the whole demo dishonest.

---

## Seeding note

Goods receipts must exist for every PO except case 9. For case 8 the receipt is short. For
case 14 the `received_at` date is 4 days after `invoice_date`, everywhere else it precedes
the invoice. Cases 10 and 15 need their prior invoices seeded as separate rows with an
earlier `invoice_date` so `find_similar_invoices` genuinely returns them.
