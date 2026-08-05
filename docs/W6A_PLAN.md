# W6A_PLAN — The FOH register (walk-up · phone · start-a-table)

**Status: SHIPPED (2026-08-05).** Closed **K6** (high — no FOH register) + **K17** (staff adds are
modifier-less); opened **K18** (staff per-line re-route) + **K19** (cash-path hours gate). Plan-of-
record parent: `docs/PRODUCTION_PLAN.md` §W6a. Kiosk shell (W6b/S5) and Terminal (W6c/M6·P6.2) are
explicitly out of scope. ⚠️ Prod `db push` of `20260805230000_w6a_register_day_index.sql` waits for
the owner's Supabase restore.

The premise, from two grounded machinery maps (session-mint/pricing/settle · firing/KDS/expo): **the
register is almost entirely composition.** Server-authoritative pricing (`priceItem` +
`insertOrIncLine`), tax (`lineTax`), totals (`getCartTotals`), the cash settle
(`settleCash` → `mms_fulfill_cash_order`, idempotent, subtotal-reconciled), the settlement freeze, and
the whole post-settle firing chain (`mms_fire_pending_food` → `mms_init_togo_status` → EBT snapshot)
already exist and are mutation-tested. What's missing is a way for an order to **exist** without a
diner's phone, and a staff entry surface worthy of a counter.

## Order model — the three arms

One Server Action, `openRegisterOrder(kind)`, staff-gated, **service-role mint** (never
`POST /api/session`: its join/mutation rate limits key on one anon seat and would choke the counter;
staff paths are unthrottled by design):

| Arm               | Session it mints                                                                                               | Why                                                                                                                     |
| ----------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Walk-up**       | `mode='pickup'`, `qr_code='reg-<code>'`, `table_number=null`, **no member row**, one session per order         | To-go tax basis, KDS shows name+`#CODE`, expo eligible, ticket survives session close, `customer_name` machinery exists |
| **Phone**         | Same as walk-up (name captured at entry)                                                                       | Identical routing; the name is the call-out                                                                             |
| **Start a table** | `mode='dinein'` + real `table_number` via the K2 registry resolve (find-or-create on the table's sticker code) | The floor drill-down + staff add + fire + cash settle already run a table end-to-end; only the mint was missing         |

Decisions the maps forced, and their rationale:

- **`mode='pickup'` for counter arms — no new enum value, no migration for the mint.** A distinct
  `'register'` mode would touch the `table_sessions` CHECK, the Zod enum, floor types, the KDS channel
  derivation, and the create-intent allowlist — for zero v1 behavior we can't get from `pickup` + the
  `reg-` code prefix as the marker.
- **One session per order** (the pickup/scango solo model): dodges the 4h TTL, the one-open-cart
  index, and the party-size trigger; the register queue is "open `reg-` carts", not one long session.
- **No member row** ⇒ invisible to every diner surface and to `is_member` — correct for a counter
  order; all staff reads/writes go through the service client.
- **"For here" at the counter = Start a table.** The eat-in tax basis (cold food/cold drink taxable
  dine-in only) and expo/KDS routing both key off the line `fulfillment`, and **staff have no
  re-route action** (`staff-cart.ts:89` — deliberate). Rather than build one now, the dine-in arm
  carries eat-in orders on a real table with the right basis by construction. A per-line staff
  toggle stays an open row (below).

## The register surface — `/staff/register`

Counter home, server-gated (`requireStaffPage`), three zones:

1. **Start:** Walk-up · Phone order · Start a table (table picker off the K2 registry). Mint →
   straight into the order screen.
2. **Open counter orders:** the open `reg-` carts (name · items · running total · started-ago), tap
   to resume. The floor board **filters `reg-` sessions out** (they'd pile up labelled with raw
   codes); the counter queue lives here instead.
3. **Today's cash:** the Z-report-lite (below).

## The order screen — staff add grows up (closes K17)

Extends the existing `/staff/table/[id]/add` surface (both arms share it):

- **Search** over the menu (name EN/MY, category filter) — today it's one long alphabetical scroll.
- **The modifier sheet**, reusing the diner's `ModGroup`/`initialSelection`/`isSelectionValid`
  machinery and the menu page's nested groups query. Required-modifier items **open the sheet**;
  `staffAddItem` widens to `{qty (1–9), modifierIds}` and passes **`enforceCardinality: true`** —
  the server refuses a curry with no style, same as the diner path. Pricing stays 100%
  server-derived (`priceItem` sums `base + Σ delta`; foreign option ids already rejected).
- **Qty + notes** (existing `setLineNotes`), line edit via existing `staffSetQty`.
- **Name capture:** new staff action `setCartCustomerName(sessionId, name)` —
  `qr_carts.customer_name` column + CHECK + the cash RPC's snapshot already exist; only the
  create-intent (card) write path exists today, so a cash walk-up currently has **no call-out
  identity** on expo. This closes that.

## Settle + handoff

`settleCash` runs unchanged (freeze → totals → idempotent RPC → fire/togo/EBT drains). Register
additions are UI-level: **tendered/change-due** arithmetic (display-only — the charge is
server-derived; change math never touches the ledger) and the **handoff card**: settleCash already
returns `orderId`, so the register shows `#CODE` (last-6) + name for the customer, matching the KDS/
expo/board call-out. `/track` for cash orders stays out (S1 receipt artifact owns durable customer
receipts — W7 arc).

## Day cash summary (Z-report-lite)

`lib/register.ts` `getDayCashSummary()` — **manager-gated** (`requireStaff("manager")`), one
LA-day window over `qr_orders`: count + gross by `tender` (cash vs card vs split), cash total
prominent, refund-aware note (refunds live in `mms_refunds`; v1 shows the order-status split, not a
net drawer figure — honest label). Pure aggregation math lives in `lib/register-math.ts` (mutable by
`verify:slice`).

**Migration (one, additive): `qr_orders_created_idx on (created_at)`** — the day window is a new
query on an unindexed column. Rides CI's real-stack `migrations-check`; prod `db push` owed on the
owner's Supabase restore (same caveat as W11).

## Known edges carried deliberately (registry rows on close-out)

- **No staff per-line for-here↔to-go re-route** (the counter arms are to-go by construction; eat-in
  rides Start-a-table). New row.
- **The cash path has no open-hours/capacity gate** (`mms_pickup_asap` runs only at the card
  boundary). Staff-mediated — the operator IS the kitchen — so a refusal would be in their way; a
  soft "kitchen closed" hint on the register is the eventual shape. New row, low.
- **Repeat-last-order is blocked on M3** (order lines snapshot modifier _labels_, not option ids —
  a faithful re-price can't be derived). Deferred with the M3 dependency named; do not ship a lossy
  repeat that silently drops modifiers.
- **Dine-in KDS tickets die when the session closes** (`kitchen.ts:184`) — pre-existing floor
  behavior, unchanged by this slice; staff clear started tables after service like any table.

## Slices

- **W6a·1** — `openRegisterOrder` mint (3 arms) + `/staff/register` shell + counter queue + floor
  `reg-` filter + "New order" entry on the floor.
- **W6a·2** — order screen: search · modifier sheet (`enforceCardinality: true`) · qty · name
  capture. Closes K17.
- **W6a·3** — settle handoff (tendered/change, `#CODE` card) · day cash summary + `created_at`
  index migration · expo/KDS identity verification.
- **W6a·4** — gate · new mutants (cardinality-on-staff-adds, qty bounds, summary math,
  name-write status guard) · ONE capped adversarial pass (≤3 lenses, ≤10 agents, ~15 min,
  kill+hand-triage on stall) · docs sweep · PR.
