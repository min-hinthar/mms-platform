# W11 — the split ledger becomes durable ✅ (2026-08-05)

The two migrations W10d designed but could not ship, plus the human surfaces. Closes OPEN-ITEMS
**M1 · M25 · M29 · M43 · M44 · M45**. One migration: `20260805210000_w11_split_ledger_durable.sql`.

> ⚠️ **Prod `db push` waits for the owner's Supabase restore** (the QR project is paused). The migration
> is CI-verified (`migrations-check + types-fresh` runs a real local stack); until pushed, prod runs the
> pre-W11 behaviour. Also still owed from W10d: one live-PostgREST smoke of a split mint.

## The pin (M1/M25)

`qr_carts.settle_expected_cents` is written once at `openSettlement`, from the SAME derivation that
produces the share rows — so it cannot diverge from the ledger except by a real fault.
`mms_fulfill_split_order(p_cart_id)` (the old tautological second parameter is deleted) reconciles
Σ(amount − tip) over the captured shares against that constant. Ordering is the whole design, learned
from the W10d revert: the **idempotent already-fulfilled branch runs first** (a redelivery of a
completed settlement can never re-enter the guard), and a mismatch **writes `qr_refunds_needed`
before raising** (the raise makes Stripe redeliver for 72h; the durable row is what turns that loop
into an operator surface). An unpinned open fails closed; a NULL pin (settlement opened mid-deploy)
degrades to the old behaviour for that one window rather than dead-ending a live table.

## The stamp (M45)

`qr_cart_shares.capture_started_at`, written **before** each `paymentIntents.capture`, fail-closed,
first-writer-wins. A capture that took no money clears it (a canceled share must not block the abort
that is now the table's only exit); a succeeded capture keeps it. Abort refuses while any share is
stamped; both exits' destructive deletes carry `.is("capture_started_at", null)`. This closes the
abort/re-open-vs-capture race at the only point both sides order through: a row write.

## The surfaces (M43 · M44 · M29)

- Every knowingly-abandoned hold / orphaned capture lands in `qr_refunds_needed`
  (`split_hold_abandoned` / `split_captured_orphaned` from TS, best-effort; `split_reconcile_mismatch`
  from SQL, idempotent on a synthetic `split:<cart>` key) — and the **approvals page** renders the
  unresolved rows as a manager refunds strip.
- The **board** edge-detects a host abort (ledger had rows → has none, cart still open) and tells the
  payer their hold was released — the diner most likely to think they still owe money.
- **`qr_order_payers`** persists who paid beyond the shares' lifetime: split payers get the full
  tracker, appear in account history (unioned with `earned_by`), and `didIPayForCart` probes it first.
  Whether non-host payers also EARN a Star stays a product decision — deliberately unmade.

## Guards

`lib/split-settle-capture.test.ts` (5 tests — stamp-before-capture as an ORDER assertion on one
chronological log; stamp failure captures nothing; clearing; the fulfill call carries only the cart
id) · pin + stamp + refunds tests in `lib/split.test.ts` (40) · `lib/orders-payers.test.ts` (5 —
the payers probes ARE the authorization; the coverage gate demanded it) · ten new `verify:slice`
mutants (62 total), each watched fail before commit.
