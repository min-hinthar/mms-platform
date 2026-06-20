# QuickBooks Online sync — paid orders → Sales Receipts (M2·P2.4)

How a **paid** QR order lands in QuickBooks, the accounting model, and the activation steps. The code
is **fail-safe and off by default** (`QBO_SYNC_ENABLED` unset → every entry point is a logged no-op),
so it ships dark and is switched on only once a QBO company + its refs are wired.

## The two-ledger clearing model

A QR sale is collected by Stripe and paid out to the bank a day or two later. To keep the books honest
in between, each paid order posts as a **Sales Receipt deposited to a _Stripe clearing_ account** (an
Other-Current-Asset / bank-type account), **not** straight to the operating bank account:

```
Order paid  →  Sales Receipt  →  Dr  Stripe clearing      (money is "in transit")
                                  Cr  Sales / Sales tax payable / Tips payable
Stripe payout (later)          →  Dr  Bank
                                  Cr  Stripe clearing      (clears to zero; the fee is its own expense)
```

So "two ledgers": sales hit **clearing** on order; the **bank** ledger clears it on payout. The clearing
account should net to ~zero once payouts catch up — a standing reconciliation check.

## How an order maps to a Sales Receipt

`apps/qr/lib/qbo/mapping.ts` (`buildSalesReceipt`, **pure**) turns one `qr_order` + its `qr_order_items`
into a Sales Receipt whose lines sum **exactly** to what Stripe charged:

| Order part      | Sales Receipt line                                                      |
| --------------- | ----------------------------------------------------------------------- |
| each order item | `SalesItemLineDetail` (Qty × UnitPrice), `ItemRef` = QBO_ITEM_SALES_REF |
| promo discount  | `DiscountLineDetail` (reduces the subtotal)                             |
| service charge  | a line, `ItemRef` = QBO_ITEM_SERVICE_REF                                |
| sales tax (CA)  | a line, `ItemRef` = QBO_ITEM_TAX_REF (maps to a tax-payable liability)  |
| tip             | a line, `ItemRef` = QBO_ITEM_TIP_REF (maps to a tips-payable liability) |

**Tax is posted as an explicit line** and the receipt is sent with `GlobalTaxCalculation: "NotApplicable"`
so QBO's Automated Sales Tax does **not** recompute/override our category-aware figure — otherwise the
receipt total wouldn't reconcile against the charge. The mapper **throws** (never posts) if the items
don't reconcile to the stored subtotal, if the parts don't sum to the total, or if a non-zero amount
has no item ref configured. The full Stripe PI id rides in `PrivateNote` (QBO's `PaymentRefNum` caps at
21 chars).

## Idempotency, durability & failure isolation

- **One Sales Receipt per order.** `qbo_sync_queue` (migration `20260620000400`) holds one row per order
  (`order_id` PK). The webhook enqueues `status='pending'` on fulfillment; the post flips it to `synced`
  (+ `qbo_doc_id`) / `error` (+ `last_error`) / `skipped` (disabled). A re-post is short-circuited once a
  row is `synced` with a doc id, and the create carries a stable `requestid` (the order id) so a retry
  after a lost response returns the same receipt rather than duplicating. _(Today the only trigger is one
  `after()` per fulfillment — Stripe retries skip the fulfill branch — so there's no live concurrent
  poster; a per-order advisory lock around the check-and-post lands with the cron drain below, before two
  posters can ever race.)_
- **Trust-but-verify the total.** After posting, QBO's returned `TotalAmt` is compared to the Stripe
  charge; a mismatch is recorded as `error` (not `synced`), so a line QBO interprets differently can't
  silently drift the clearing account.
- **Never blocks the money path.** The webhook posts to QBO inside Next's `after()` — QBO latency/outage
  can't delay the Stripe 200 ack or fulfillment. A failure is caught, recorded, and retryable; it never
  5xxs the webhook.
- **Drain on demand.** If `after()` never runs (cold kill) the row stays `pending`; `processPendingQboSyncs()`
  re-drives `pending`/`error` rows (wire it to a cron or an admin action — deferred).
- **Service-role only.** `qbo_sync_queue` is RLS default-deny with no policy (like `promo_codes`); `anon`
  /`authenticated` have no SELECT and it isn't GraphQL-discoverable.

## Activation steps (when switching it on — sandbox first)

1. **Connect a QBO company** (sandbox for dev) and complete the OAuth2 authorization-code flow to obtain a
   **refresh token** + the **realmId**. Create an Intuit app for the `QBO_CLIENT_ID`/`QBO_CLIENT_SECRET`.
2. In that company's chart of accounts / lists, create + note the ids for: a **Stripe clearing** account
   (`QBO_CLEARING_ACCOUNT_REF`), a generic **"QR Diner"** customer (`QBO_CUSTOMER_REF`), and the product/
   service items for sales, service charge, sales-tax-payable, and tips (`QBO_ITEM_*_REF`).
3. Set the env (below) in Vercel — **`QBO_ENV=sandbox`** to start — and `QBO_SYNC_ENABLED=true`.
4. Drive one test order through; confirm a Sales Receipt appears, deposited to clearing, with a total
   equal to the charge, and the `qbo_sync_queue` row is `synced`.
5. Flip `QBO_ENV=production` + the production company's refs/token at go-live.

### Env (server-only secrets — see `docs/ENV.md`)

`QBO_SYNC_ENABLED`, `QBO_ENV` (`sandbox`|`production`), `QBO_REALM_ID`, `QBO_CLIENT_ID`,
`QBO_CLIENT_SECRET`, `QBO_REFRESH_TOKEN`, `QBO_CUSTOMER_REF`, `QBO_CLEARING_ACCOUNT_REF`,
`QBO_ITEM_SALES_REF`, and (only if those amounts ever appear) `QBO_ITEM_SERVICE_REF`,
`QBO_ITEM_TAX_REF`, `QBO_ITEM_TIP_REF`.

## Deferred (follow-ups, tracked for activation — not in this slice)

- **Refresh-token rotation.** Intuit rotates the refresh token on each exchange; production must persist
  the rotated token (a secrets row / scheduled re-auth), not rely forever on the env value. Today we mint
  an access token per cold start from the env refresh token (fine for sandbox/dev).
- **Cron drain + concurrency lock.** Wire `processPendingQboSyncs` to a schedule (or an admin endpoint)
  for retrying `error`/stranded `pending` rows; add a per-order `pg_advisory_xact_lock` (or `select … for
update` on the queue row) around the synced-check-and-post so a cron run can't race the inline `after()`
  poster (the `requestid` is a backstop, not a substitute).
- **Mapper unit test.** Commit a `mapping.test.ts` (balanced total · throws on imbalance · throws on
  missing ref · multi-qty · zero discount) once a test runner is added — today the invariant is checked
  manually via a standalone balance script.
- **Payout reconciliation.** A periodic check that the Stripe clearing account nets to ~zero against
  Stripe payouts (catches a mismatched fee/refund mapping).
- **Refunds.** `charge.refunded` → a QBO Refund Receipt / credit (the webhook has the seam; not mapped yet).
