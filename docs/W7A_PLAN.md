# W7A_PLAN — The receipt artifact (durable link · email · print)

**Status: SHIPPED (2026-08-15).** Owner directive: "plan-build next production readiness, receipt
artifact W7a world class." Closes registry **S1 (high)**: no post-pay receipt artifact — no email,
no print, no durable link; an anonymous diner's history dies with the 4h session TTL. Design
parents: `docs/PRODUCTION_PLAN.md` §W2e (the original spec: itemized receipt card + "Email me this
receipt" + `@media print`), `docs/context/DESIGN-RESEARCH.md` §Sunday teardown ("receipt by email —
no lingering receipt screen"; **"Trustpilot complaints cluster on fees that surface only on the
emailed receipt"** — the SB-1524 disclosure MUST ride the artifact), `docs/W12_PLAN.md` (the
receipt-slip visual language), the S12/S4-audit standing note (a session-less signed-order-token
`/track` path for walk-ups).

## What the map established (premise corrections)

- **The mailer already exists.** Resend + React Email are shipped and in production use for staff
  mail (`lib/email.tsx`, `emails/MmsEmailLayout.tsx`, the Svix-verified `/api/resend/webhook`).
  W7a adds ONE template + one sender + the C8 from-address decision — zero new deps.
- **`receipt_email` never existed in code** — it appears only in registry prose. The column, the
  capture, and the send are all net-new.
- **The full receipt data shape already exists once**: `getOrderHistory`'s entry (code, breakdown,
  lines, table, tender, slot). The receipt model extracts that shape, not a fourth SELECT.
- **Today's `/track` "receipt" is two numbers and a code** (`{N} items · $total` + `#CODE`) — no
  lines, no breakdown, no disclosure, and the whole view dies with the session (J7) or the anon
  uid's device storage.
- **No `@media print` rule exists anywhere in the repo.**

## The design

### W7a·1 — the durable receipt (token + session-less view + print)

- **`mms_receipt_tokens`** (migration): `{token text PK, order_id uuid NOT NULL REFERENCES
qr_orders ON DELETE CASCADE UNIQUE, created_at, expires_at}` — the `mms_merge_tokens` pattern
  exactly (opaque `randomBytes(32).base64url`, RLS on, `revoke all` from every client role,
  service-role only). **One token per order** (UNIQUE order_id; mint-or-return-existing) so the
  link is stable across re-asks. TTL **90 days** (the Square-ish norm; a receipt outlives the
  24h merge-token horizon by design). The token IS a bearer credential — an opaque lookup that
  shows one order's receipt; it never carries PII, never an email, and expiry bounds a forwarded
  link. This deliberately extends the `orders.ts` "a key is a lookup, never a credential"
  doctrine with a NEW, purpose-minted bearer (the doctrine survives: order ids / PI ids / `#CODE`
  still grant nothing).
- **`lib/receipt-token.ts`** — mint (service-role, idempotent per order) + resolve (token →
  order id, `null` on unknown/expired). Authority logic ⇒ **red-first tests + verify:slice
  mutants** ("an expired token still resolves", "resolve ignores expiry column", "mint reuses
  another order's row").
- **`/track?r=<token>`** — the third auth path, replacing the direct-visit dead-end stub: resolves
  server-side and renders the **session-less receipt view** — the full itemized artifact (below),
  honest "snapshot" framing (this is the durable copy, not a live tracker), the account link, and
  the reorder CTA (`reorderLink` from W14 — mode derived, never guessed). No live/Realtime layer,
  no session mint. This is also the S12 walk-up path's foundation (kiosk/register wiring of the
  link onto the `#CODE` card is a follow-up — registry).
- **`lib/receipt-view.ts`** — the pure receipt model (lines, breakdown rows, code, timestamps at
  the LA clock, the M7 rule: line PRICES + one order-level tax row, never per-line tax) shared by
  the receipt card, the session-less view, and the email. Mirrors `order-history-view.ts`;
  red-first.
- **`components/ReceiptCard.tsx`** — one renderer for the /track receipt card and the `?r=` view
  (OrderHistory keeps its fresh W14 markup — adopting it there is deliberate churn-avoidance,
  registry note). The W12 receipt-slip language: `.checkout-leader-row` dotted leaders, per-line
  rows with the amount on the title line, `lang="my"` sublines, **the SB-1524 service-charge
  disclosure verbatim from Checkout** whenever `service_charge_cents > 0`, the `#CODE` rail.
- **`@media print`** (globals.css — the repo's first): the receipt view prints as a clean slip —
  chrome/nav/actions hidden, white surface, black ink, dotted leaders survive, no textures. A
  visible "Print" affordance on the receipt view (hidden in print; `window.print()`).

### W7a·2 — the email receipt (capture + send)

- **Consent-first, one tap**: no auto-send. The earner (or a split payer) gets an **"Email me this
  receipt"** affordance on the /track receipt card at the post-pay moment — prefilled (never
  auto-submitted) with the upgraded account's email; anon diners type one. The v7.2 prototype's
  "Receipt sent to your phone" promise finally becomes true — and honest.
- **Migration adds `qr_orders.receipt_email`** (`CHECK char_length <= 254`) **+
  `receipt_sent_at`**. Written POST-pay by the action — **no fulfill-RPC restatement** (the
  columns are never snapshotted cart→order; the three-RPC restatement hazard is deliberately
  avoided).
- **`setReceiptEmail` server action** (`lib/receipt.ts`): Zod
  (`trim().toLowerCase().email().max(254)` — the provisionStaff precedent) → **authorize on
  `earned_by` OR a `qr_order_payers` row** (the orders.ts doctrine: an order id is never a
  credential) → **`RECEIPT_RATE`** (new purpose-built bucket in `lib/limits.ts`, 5/10min per uid —
  `MUTATE_RATE`'s 120/min is a spam-relay budget for an outbound-email trigger) → write columns →
  send via `after()` (response never coupled to Resend). Re-send allowed deliberately ("Sent ✓ ·
  Send again"); the rate bucket bounds abuse. Discriminated result; honest failure copy;
  **feature-off when the from-address is unset** (the `lib/email.tsx` model): the affordance
  simply doesn't render (server-checked), never a dead button.
- **`emails/OrderReceiptEmail.tsx`** — the MmsEmailLayout shell: order code + date (LA clock),
  itemized lines (qty × name · amount), breakdown (subtotal / discount / service charge **with
  the SB-1524 disclosure** / tax / tip / total), table or pickup context, tender, the durable
  `?r=` link as the primary button ("View or print your receipt"), the bilingual farewell
  (`ကျေးဇူးတင်ပါတယ်` — the GoodbyeBeat line; full MY body waits on S2), footnote honesty
  (processor footnoted, brand dominant). Literal hex colors (the email-client sanctioned
  exception).
- **`sendOrderReceiptEmail`** in `lib/email.tsx`: from = **`RESEND_RECEIPT_FROM` ?? `RESEND_FROM`**
  (C8: the diner-facing identity is owner config; the fallback keeps the feature alive on the
  staff sender until C8 is decided — documented in ENV.md + .env.example, both of which also gain
  the missing `RESEND_*` trio).

### Deliberately out (registry)

- Kiosk/register **capture** moments (shared-device typed-and-forgotten email; QR of the durable
  link on the `#CODE` card) — S12 follow-up; the token infrastructure ships now.
- Auto-send to upgraded accounts at fulfillment (a consent + webhook-idempotency slice of its own).
- OrderHistory adopting ReceiptCard (fresh W14 markup; churn-avoidance).
- SMS receipts; full-MY email body (S2); Resend receipt-event wiring into the deliverability
  webhook (exists for auth mail; extending its event routing is a follow-up).
- PDF generation — print IS the artifact (browser print-to-PDF covers it).

## Hardening + the rules that bind

- Money: the receipt renders the fulfillment-time snapshots **verbatim** (the OrderHistory rule);
  no amount is recomputed anywhere; M7 respected (no per-line tax).
- The token resolve is scoped `token → its one order` and expiry-checked server-side; mutants pin
  both. Unset from-address = feature-off, never open.
- `setReceiptEmail` follows the placement rule: authorize → rate → validate → write; inputs
  bounded Zod + column CHECK; the action never leaks order existence (one generic refusal).
- a11y: the email affordance is a labeled form (44px, 16px input); "Sent" state announced through
  the existing view's announcer posture; print button ≥44px; the `?r=` view keeps the one-live-
  region rule (it has none — static).
- No new keyframes; `.vt-receipt` NOT extended to the `?r=` view (it pairs /track↔/account only).
- No `backdrop-filter`; print styles are static.
- New decision logic in `lib/` only (M46): `receipt-view.ts`, `receipt-token.ts`, `receipt.ts`.
- Migration guarded + idempotent; joins the prod-apply flow post-merge (the restore-catch-up
  path); `types-fresh` regenerated.

## Slices

- **W7a·1** — migration (tokens + columns) · `receipt-token.ts` (red-first + mutants) ·
  `receipt-view.ts` (red-first) · `ReceiptCard` · the `/track?r=` session-less view · itemized
  /track receipt card · `@media print`.
- **W7a·2** — `setReceiptEmail` + `RECEIPT_RATE` + schema input · `OrderReceiptEmail` +
  `sendOrderReceiptEmail` · the capture affordance · ENV docs.
- **W7a·3** — docs sweep (S1 → closed-with-residuals, F7, C8 note, S12 clause, W2e residual,
  CHANGELOG, ROADMAP, HANDOFF) · gates · ONE capped review · PR → auto-merge · prod migration
  apply + verify.
