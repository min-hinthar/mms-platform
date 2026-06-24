# S4 audit — deep adversarial review in preparation for M5/M6 (2026-06-24)

Six fresh-context adversarial auditors swept the merged S4 milestone (PRs #71–75) across money/tax/refund,
auth/RLS/IDOR, concurrency/idempotency, M5/M6 integration seams, a11y/UX fidelity, and schema/hygiene/debt.
This is the consolidated, de-duplicated, prioritized record. Verdicts and `file:line` are the auditors'; the
P0/P1/P2 triage is the synthesis.

## Executive verdict

**S4 is structurally sound** — security is a clean PASS (every new SECURITY DEFINER fn is service-role-only,
layered action→SQL→RLS authz, no IDOR/PII gap, replay-safe webhook, fail-closed PIN); the TS↔SQL tax engine
is still byte-in-sync; the 3 fulfill RPCs' money logic is unchanged but for the additive `fulfillment`
snapshot; the split-settlement spine + `fulfillment`/`ebt_eligible` partition keys make M6 EBT a tender-time
**branch, not a rewrite**; and S4 honored every cross-milestone touch-point (one fire timer, `canMutate`
extended not refactored, `mms_approvals` reused).

**But the fast build left real defects** — **1 money BLOCKER** (silent tax under-refund), **several HIGH**
(over-refund on discounted orders; fire-at-checkout has no durable backstop; an undo race; a hand-rolled
refund dialog), and **M5 is blocked on a documentation contradiction** (project topology), not on code.

## P0 — must fix before M5 starts

### P0-1 · BLOCKER · per-unit tax under-refund on any qty>1 line (money-out, live)

`mms_refund_authorize` computes the refund as `oi.unit_price_cents * oi.qty + oi.tax_cents`
(`supabase/migrations/20260624010000_s4_line_refunds.sql:49`). But `tax_cents` is stored **per unit** —
`lineTax(unitPriceCents, …)` (`apps/qr/lib/tax.ts:26-28`), and `getCartTotals` only uses per-line `tax_cents`
as a `>0` taxable _flag_, computing the order's tax on `unit_price_cents * qty` (`apps/qr/lib/totals.ts:45-51`).
So goods scale with qty but **tax does not**: a qty=3 taxable line refunds 1 unit of tax, shorting the diner
~`(qty−1) × per-unit-tax`. **Fix:** `… + oi.tax_cents * oi.qty`. **Also:** audit live `mms_refunds` for any
qty>1 refund already issued (likely none — refunds are days old — but confirm + reconcile if found).

### P0-2 · BLOCKER (doc) · the M5 project-topology contradiction

`docs/BACKEND_ARCHITECTURE.md:8-18` (banner) says QR runs on its **own** dedicated Supabase project
(`fasnpdhtvqtzjlvruqcu`), which "moots the anon-auth blast radius (no foreign app shares the DB)" and makes
QR **own** the catalog — yet the **same doc** `:62-66` and `ROADMAP.md:84` say M5's exit is "**one** Supabase

- Stripe, **shared** by apps/delivery + apps/qr." These can't both hold, and M5's entire plan depends on which
  is true:

* **Shared project** → the un-prefixed `create table menu_items/grocery_items` (NOT `if not exists`) in
  `20260618000000_qr_platform_init.sql:51-115` will **collide** with delivery's live tables on apply (the
  LEARNINGS "QR 0001 collides" landmine, re-armed by the own-project pivot).
* **Own project** → M5's "`git clone` + repoint at `@mms/db`, one project" is impossible without migrating
  delivery's data into the QR project — far more than the roadmap's plan.

**This is the single biggest M5 blocker and it is a decision, not code.** Reconcile to one design-of-record
before M5. (Not an S4 defect — a pre-existing contradiction S4 inherits + sharpens by shipping a QR-owned,
seeded, `create table` catalog.)

### P0-3 · `docs/HANDOFF.md` is 3 milestones stale

Dated 2026-06-21, header "S2 … is UNDERWAY", "Next: S3". CLAUDE.md's first instruction is "Resuming work? Read
`docs/HANDOFF.md` first" — an M5 session would resume on a pointer 3 milestones out of date. **Refresh to
"S4 complete → M5 next" + this audit's P0/P1 set.** _(Done in this pass.)_

## P1 — should fix before M6 (M6 amplifies each)

### P1-1 · HIGH · no order-level over-refund cap; discounted orders over-refund

`mms_refund_authorize` guards only _per-line_ idempotency — no aggregate `Σ refunds ≤ captured` check, and it
refunds **undiscounted** goods (`unit_price_cents*qty`) + undiscounted tax, while the diner paid the
_discounted_ net with tax on the discounted base (`totals.ts:42-51`). Refunding lines on a promo/reward order
returns more than was collected. Stripe caps a single refund at the charge (final backstop), but the app can
authorize a cumulative over-refund. **Fix:** make the refund amount discount-aware (the line's share of the
captured net + its share of order tax) **and** add a remaining-refundable guard in `mms_refund_authorize`
(`Σ existing mms_refunds.amount_cents + this ≤ total − service − tip`, or vs the charge's refundable). M6
split/EBT makes partial refunds the norm, so close this with P0-1.

### P1-2 · HIGH · fire-at-checkout has no durable backstop (silent charge-with-no-fire)

The settlement `after()` chain (`apps/qr/app/api/stripe/webhook/route.ts` single-pay + split;
`apps/qr/lib/staff-cart.ts` cash) runs `mms_fire_pending_food` → `mms_init_togo_status` →
`mms_snapshot_ebt_eligibility`. If `after()` never runs (serverless cold-stop after the 200 ack), the paid
cart's draft food is **never fired** — no reconciler scans for it, and Stripe redelivery is idempotent on the
PI so it never re-reaches the `if (orderId)` block. A paying guest is silently stranded with uncooked food —
the exact failure this slice exists to prevent. **Fix:** give fire-at-checkout the QBO-style durable drain (a
"needs-fire" marker + a reconciler), and **split the three RPCs into independent `after()`s / try-catch** so a
transport throw on one can't starve the next two.

### P1-3 · HIGH · `mms_undo_fire` claws back a make-it-now line

`mms_undo_fire` (`20260622050000_undo_grace.sql:53-73`) reverses the latest in-grace lines by **`max(fire_at)`,
not `fire_batch`**. S4.2's `mms_fire_line` ("make it now") stamps the same `now()+10s` grace, so a host's
grace-window Undo can silently revert a _guest's_ deliberate make-it-now togo line instead of the host's batch.
The `fire_batch` column exists to identify a send; undo ignores it. **Fix:** key `mms_undo_fire` on the latest
`fire_batch`, not `max(fire_at)`.

### P1-4 · MEDIUM · the >24h re-refund gap (backstop swallows failures)

The `charge.refunded` backstop (`webhook/route.ts`) re-records refunds from metadata via `refunds.list` +
`mms_record_refund`, but a list/record failure is **logged, not 5xx'd** — so a transient Stripe hiccup
permanently loses the ledger row while the money is gone; >24h later (Stripe idempotency key expired) a
re-refund issues a _second_ real refund. **Fix:** 5xx on the backstop's list/record failure so the 72h
redelivery window is the real recovery (mirrors the reconcile's existing 5xx).

### P1-5 · HIGH (a11y) · `RefundActionSheet` hand-rolls a dialog + a dead token

`apps/qr/components/staff/RefundActionSheet.tsx` re-implements a `role="dialog"` instead of the canonical
`packages/ui/src/sheet.tsx` (Radix) built to fix the v7.1 dialog findings: **no focus trap** (Tab escapes a
money-out modal to the list behind the scrim), **no visible labelled ✕ close**, `aria-label` instead of
`aria-labelledby`→heading, and `var(--scrim, rgba(0,0,0,0.45))` (`:182`) where **`--scrim` is undefined** so
the hardcoded rgba always renders (no Night-theme adapt). **Fix:** port to the canonical `Sheet`; define a
`--scrim` token (light+dark) in `packages/ui/src/tokens.css`. Do before M5 so the second app inherits one
dialog primitive.

### P1-6 · MEDIUM · refunded orders vanish from the diner's history

`getMyOrders` (`apps/qr/lib/rewards.ts:148-149`) filters `status='paid'`; once `charge.refunded` flips to
`'refunded'` the order disappears from the diner's `/account` history (they can't see what they were refunded
for). Reward recede is correct; this is a product/honesty gap. **Fix:** include `'refunded'` + render a
"Refunded" state.

## P2 — track as debt (fix opportunistically)

- **Indexes:** add `mms_refunds(order_id)` (advisor-confirmed unindexed FK, hit every `/staff/orders` load)
  and a partial `qr_orders(togo_status) where togo_status is not null` (the expo's hot poll seq-scans).
- **One live region on Checkout review** — `RewardField` + `SendToKitchenButton` each declare their own
  `role="status"` (2–3 polite regions on one view); route them through the parent's single region (the
  Expo/KDS boards are the model). Codify "parent owns the one live region."
- **`docs/REVIEW.md` verdict trail is dead since S1.2** — no S2/S3/M4/S4 entries in the canonical tracker.
- **No S4 `.claude/LEARNINGS.md` entries** for: the refund-backstop ↔ Stripe `apiVersion` coupling
  (`charge.refunds` not auto-expanded), the `types-fresh` 80-col wrapping, the re-assert-in-the-UPDATE TOCTOU
  pattern. Capture them.
- **`@mms/db/schemas.ts` is QR-only but exported from the package root** — namespace per-app so the `@mms/db`
  root stays the _shared_ contract for M5's delivery import.
- **Security L2** — normalize `mms_refunds_staff_read` with a `to authenticated` clause (functionally safe
  today via table-level revoke; legibility only).
- **Dashboard stale-read over-refund** — `getStaffOrders`/`mms_refund_authorize` don't reflect a
  dashboard-issued full refund until webhook lag clears; Stripe rejects the over-refund (not unbounded) but it
  surfaces as a generic `stripe_error`. Tighten the error class.
- **S4.1 bare `create function`** (`20260623100000:26-27`) isn't hand-replay-safe (fine under `db reset`/CI).
- a11y polish nits (Stepper glyph aria-hidden consistency; StaffOrdersBoard board-level confirmation region;
  the pure-dine-in `/track` resting state).

## M6 design notes (carry into the 2027 build — not S4 defects)

- **EBT is the deferred split-refund's twin.** `mms_refund_authorize` returns `split_unsupported` for null-PI
  (split) orders; M6 EBT (a 2nd, non-Stripe Forage tender) needs the same per-PI/per-tender refund model.
  2027 must add to `qr_cart_shares`: (a) a **tender-type/Forage-txn** column (the `stripe_payment_intent_id`
  field can't hold an EBT auth), and (b) the deferred **tender↔line-subset association** (a `qr_payment_lines`
  join or `paid_by_tender` stamp) — `mms_fulfill_split_order` snapshots order items without stamping which
  tender paid which line. Additive on a sound seam; `ROADMAP.md:147` slightly oversells `ebt_eligible` as
  "the" seam when the association table is the actual missing piece.
- **SNAP tax exemption is a tender-time fact.** The data model permits an `ebt_eligible=true` + taxable item;
  CDTFA exempts SNAP-paid otherwise-taxable items, but S4 fixes per-line `tax_cents` at sale time. The single
  per-line snapshot can't represent a tender-time tax reversal without an adjustment entry — M6 must build one
  - pin eligibility at **scan** (the snapshot currently runs at the settlement drain, not scan).
- **`/track` needs a session-less path for a kiosk/Terminal walk-up.** `useOrderStatus` requires a diner anon
  `session_members` JWT a walk-up lacks; the order fulfills + the expo sees it (staff path fine), but the
  customer-facing tracker can't resolve. Add a signed order-token tracking path (a third auth path on the
  existing dual-key hook, not a fourth key).
- **Terminal must route through the settlement mutex.** `acquireSettlement`/`paymentInFlightReason` serialize
  diner-card/cash/off-session on the app clock; a Terminal PI's async capture lifecycle isn't covered — M6
  must route Terminal through the same freeze or the double-collect guard has a hole.

## What's confirmed clean (no action)

Tax TS↔SQL parity after S4 · the 3 fulfill RPCs' money logic unchanged (additive `fulfillment` only) ·
`getCartTotals` correct under mixed fulfillment · integer-cents discipline · split-order refund deferral
consistent end-to-end · all SECURITY DEFINER fns service-role-only + `mms_refunds` RLS-on · all deferrals
tracked in S4*DESIGN/ROADMAP/CHANGELOG · `database.types.ts` fresh · no dead code / dangling `paid_by_intent` /
phantom token / S4 TODOs · S4 strictly additive to `qr*_`/`mms\__`, read-only on the shared catalog (M5-safe) ·
every cross-milestone touch-point honored.
