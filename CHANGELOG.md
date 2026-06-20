# Changelog

All notable changes to **MMS Platform**. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this repo tracks milestones (see [`ROADMAP.md`](ROADMAP.md)), not semver releases yet.

## [Unreleased]

### Added — M3·P3.1 group cart join + presence (dine-in, multi-device) (2026-06-20)

- **A second phone joins the SAME dine-in cart**, two ways: a scanned **table sticker** deep-link
  (`/menu?mode=dinein&t=<token>`) or the host's **server-issued invite code** (an unguessable 8-char
  code, shared as a code/link or entered via the entry "Join a table" sheet, `&j=<code>`). The
  `qr_code` doubles as the join key, so `/api/session` find-or-join converges every phone on one
  session + cart. **Schema-light:** one partial unique index (`table_sessions_active_qr_uniq`) makes
  concurrent same-sticker joins race-safe (collide → re-read → converge, no split-brain) — indexes
  don't touch the generated types, so no `types-fresh` drift. The host-start session code is minted
  **server-side** (`apps/qr/lib/session-code.ts`); a wrong invite code is **join-only** (404, never
  mints a phantom host-table); a guessable sticker token still requires anon-auth membership on top.
- **Live presence guest list — dine-in ONLY** (RED-TEAM #3 honesty; solo Scan&Go/Pickup never show
  presence). `useGroupCart` wires the existing private `table:{sessionId}` channel (RLS-gated on
  `realtime.messages`); presence is keyed by the **stable seat** (no ghost-churn, LEARNINGS #4), the
  client-asserted name is **sanitized on ingest** (strip control/RTL chars + clamp), and a new guest
  joining is announced through the **single** existing live region. Avatars + "party of N" built to
  the v7.2 party aesthetic; a failed mint surfaces an inline retry, not a silently missing strip.
- **Name your own seat** (`setDisplayName`, `apps/qr/lib/members.ts`): member-authz'd, scoped to the
  caller's own seat, Zod-capped **+** a new column CHECK; never sent to PostHog (opaque seat only).
- Scope boundaries held: live cart-change sync is **P3.2**, split-the-bill / **split-tender** is
  **P3.3** (pulls the S4.3 seam forward per the milestone decision) — neither is over-promised in the
  P3.1 copy. Reviewed by a fresh-context adversarial subagent (0 blockers; 5 should-fix addressed).

### Added — M2·P2.4 QuickBooks Online sync of paid orders (2026-06-20)

- **Paid orders post to QBO as Sales Receipts, two-ledger clearing.** Each paid `qr_order` becomes a
  QuickBooks Sales Receipt **deposited to a Stripe _clearing_ account** (sales land in clearing on order;
  the Stripe payout later clears it to the bank). Tax is posted as an **explicit line** with
  `GlobalTaxCalculation:"NotApplicable"` so QBO's Automated Sales Tax can't recompute/override our
  category-aware figure — the receipt total reconciles to the cent against the Stripe charge.
- **Pure, self-checking mapper** (`apps/qr/lib/qbo/mapping.ts`): `buildSalesReceipt` **throws rather than
  posts** if the line items don't reconcile to the stored subtotal, the parts don't sum to the total, or a
  non-zero amount (service/tax/tip) has no configured item ref. Validated locally (balances to total;
  throws on imbalance + missing ref).
- **Fail-safe, idempotent, out-of-band client** (`apps/qr/lib/qbo/client.ts`): a no-op unless
  `QBO_SYNC_ENABLED=true` (records `skipped`); OAuth2 refresh-token → cached access token; one Sales
  Receipt per order guarded by the new `qbo_sync_queue` ledger (migration `20260620000400`, RLS
  default-deny, **service-role only** — verified `anon`/`authenticated` denied + `service_role` r/w on the
  live project, advisor-clean). The webhook enqueues on fulfillment then posts inside `after()`, so
  QuickBooks latency/outage **never** blocks the Stripe ack or fulfillment; `processPendingQboSyncs` drains
  stranded/errored rows on demand.
- **Off by default.** Ships dark; activation (sandbox QBO company + refs/creds, then the first post) is a
  documented step. See [`docs/QBO_SYNC.md`](docs/QBO_SYNC.md) + the QBO rows in `docs/ENV.md`. Deferred:
  refresh-token rotation persistence, a cron drain, and refund mapping.

### Added — M2·P2.3 grocery Scan & Go session/cart (2026-06-20)

- **Real server-issued Scan & Go session.** `/grocery` now mints its cart via `useTableSession("scango")`
  — the same anon-auth `table_sessions` / `session_members` / `qr_carts` + membership-authz the dine-in
  and pickup flows use — replacing the demo client-minted `crypto.randomUUID()` that the `assertCartMember`
  guard rightly rejected (a client-asserted session id was the very thing M1·P1.1 closes). So `scanAdd` is
  now authorized like every other mutation, prices/taxes stay server-derived, and the cart carries to
  `/cart` + Stripe checkout. The dishonest "Scan & Go opens with grocery sessions (M2)" placeholder is gone.
- **Name-search fallback for unknown barcodes.** When a barcode won't scan or isn't in the catalog, a
  debounced name search (`searchGroceryItems`, a public read of the public-RLS `grocery_items`, returning
  only available + non-weighed items, LIKE-metacharacters escaped, length-bounded input) lets the diner
  find the item by name; a tap adds it through the **same** authorized `scanAdd` (server re-derives price +
  category-aware tax). EBT-eligible hits are tagged.
- **Fixed in passing:** the barcode scanner tore down + restarted the camera on every render (a fresh
  `onScan` each time) — now memoized so it starts once; and `/grocery` had two live regions (the scanned-
  lines `aria-live` + the status toast) → collapsed to one (the toast announces each add).

- **Capacity-limited pickup slots + a server fire-time.** Migration `20260620000100_pickup_scheduling`
  adds a tunable single-row `pickup_config` (tz, hours, slot interval, **capacity per slot**, lead, prep,
  hold TTL — seeded 10:30am–6:30pm · 15-min · 6/slot for Covina), `pickup_slot` + `fire_at` columns on
  `qr_carts` → carried to `qr_orders`, and two service-role-only SECURITY DEFINER functions:
  - **`mms_pickup_slots(p_exclude_cart)`** — tz-aware, returns today's bookable slots from
    `max(open, now+lead)` to close with **remaining capacity = capacity − (paid orders + live holds)**.
    A "hold" is an open cart that picked the slot and is still active (session unexpired, touched within
    the hold TTL) — so **capacity is honest _during_ ordering, not only after payment** (without this,
    N diners all see the last seat free before any has a paid row → overbook). `p_exclude_cart` drops
    the caller's own hold so a diner sees their slot's true availability.
  - **`mms_set_pickup_slot`** — race-safe (a per-slot `pg_advisory_xact_lock` serializes concurrent
    picks of the same slot) + status-atomic; sets `pickup_slot` + `fire_at = slot − prep`.
- **Fire-time = the S2 seam.** `fire_at` is computed + stored now for S2's KDS to consume; M2 has no
  kitchen actor, so nothing fires yet — no second timer grown (per the roadmap touch-point).
- **`/track` echoes the chosen slot as the ETA** ("Ready ~11:45 AM") with the pickup step variant
  (`Order placed → In the kitchen → Ready for pickup → Picked up`) — **no fabricated countdown, no
  "we'll text you"** promise the code can't keep. create-intent re-validates the slot still has room at
  the pay boundary (excluding the cart's own hold) and requires a slot for pickup orders; the cart
  surfaces the reason ("Pick a pickup time first." / "That pickup time just filled — pick another.").
- **Snappier cart/slot interactions** (perceived latency): each Add was two sequential server
  round-trips (mutate, then a full `getCartView` re-fetch) with no feedback until both landed —
  `addItem` now **returns the fresh view** (one round-trip) and the cart count bumps **optimistically**
  on tap; picking a slot drops the redundant post-set refetch and the tapped chip shows an immediate
  "Setting…" state. (The SQL was never the bottleneck — `mms_pickup_slots` runs ~10ms; the cost was
  round-trips + cold serverless starts on preview.)
- **Next-day rollover** (migration `20260620000200`): slots span today + `horizon_days` (default 2), so
  an after-hours browser pre-orders for tomorrow instead of hitting an empty "today only" wall. The sheet
  groups by day (Today / Tomorrow / weekday); the chip + `/track` ETA prefix the day when it isn't today.
- **UI (v7.2):** the "Pick a pickup time" sheet (`PickupSlotSheet`, capacity-aware, auto-opens on first
  pickup load), a header chip showing/Changing the slot (`PickupSlotChip`), tz-correct time display.
- **Validated** on a local Postgres stack (slot generation, fire-offset, hold-based capacity, exclude-self
  re-pick, advisory-lock serialization, stale-hold freeing, fulfillment carry) and **applied to the live
  QR project** (grant lockdown verified `anon=false`; advisors clean apart from the intentional
  `pickup_config` default-deny). **Pre-PR adversarial subagent: FAIL → fixed → PASS** — it caught the
  capacity-overbooking race (paid-only count); the holds + advisory lock + exclude-self close it.
- _Deferred:_ an inline slot-picker on `/cart` (today a slot-less checkout shows a clear reason and the
  diner picks via the menu chip); a hold/abandoned-cart sweep (holds self-expire via the TTL).

### Fixed — M2·P2.2 same-day slot alignment (2026-06-20)

- **Same-day pickup slots rendered off-grid and were false-rejected at checkout** — a regression from the
  `20260620000200` multiday rewrite, which moved `now+lead` into today's `generate_series` lower bound,
  anchoring the grid at a non-aligned instant that drifts every second. Two breakages across the whole
  operating window (any time `now+lead > open`): (1) slots showed arbitrary times (e.g. 11:18, 11:33)
  instead of the aligned :00/:15/:30/:45; (2) the grid shifted between a diner's pick and the
  re-validation — and **both** `mms_set_pickup_slot` and the create-intent pay-boundary check re-call
  `mms_pickup_slots` — so a valid same-day slot matched nothing on the fresh grid → set returned
  `unavailable` and checkout 409'd "that pickup time just filled". Migration
  `20260620000300_pickup_slots_align_fix` restores `…0100`'s pattern: anchor each day's series at the
  day's **open** (aligned) and **filter** `slot ≥ now+lead`. Future days keep all slots; same-day drops
  only past/too-soon ones, and the grid is now stable across the selection→checkout window. Caught by the
  **pre-merge adversarial subagent** (the after-hours manual smoke test had only exercised the next-day
  path); verified old-vs-new on the live stack (`12:31,12:46,…` → `12:45,13:00,…`).

### Added — M2·P2.1 server-validated promo codes (2026-06-20)

- **Real promo enforcement, server-authoritative.** Migration `20260620000000_promo_validation` gives
  `promo_codes` real semantics (`valid_from`/`valid_until`, `min_subtotal_cents`, `per_session_limit`,
  plus `CHECK`s: `value ≥ 0`, pct `≤ 1`, etc.), adds two RLS-default-deny ledgers
  (`promo_redemptions` audit + per-session cap; `promo_attempts` rate-limit), and five service-role-only
  SECURITY DEFINER functions:
  - **`mms_promo_check`** — the single apply gate: active + window + `min_subtotal` + global `max_uses`
    - per-session cap → returns a stable `reason` enum + the computed discount.
  - **`mms_promo_discount`** — the single **pricing** source `getCartTotals` now calls (replacing the
    inline TS), so the displayed/charged discount can't drift. Caps are a redemption budget (apply +
    fulfillment), not a pricing gate, so the discount stays stable through checkout.
  - **`mms_promo_attempt`** — per-session **rate-limit** (anti-enumeration): 10 / 5-min window,
    count-first so a capped session is rejected without recording (the window can drain), self-GC'ing.
  - **`mms_promo_consume`** — redemption at **fulfillment**: soft global cap (the charge already
    reconciled the discount, so `used` may overrun by the count of concurrently-applied-but-unfulfilled
    carts — accepted) + a **hard per-session cap re-checked under a row lock** (a DB invariant, not just
    the app-layer apply gate). `mms_fulfill_order` now calls it (after its idempotency early-return, so
    consumption is exactly-once under Stripe's ≤72h retries).
- **`applyPromo` returns a discriminated result** (`{ok, discountCents} | {ok:false, reason}`) instead of
  throwing — Next redacts thrown Server Action errors in prod, so the cart now shows the _specific_
  reason (invalid / expired / min-not-met / exhausted / used-at-this-table / rate-limited …) via a
  `Record<PromoReason, string>` map. Seeded test codes: `WELCOME10` (10% off) and `TEAHOUSE5` ($5 off
  ≥ $20).
- **Validated end-to-end on a local Postgres stack** (discount math, min-subtotal gate, rate-limit
  10/window, consume + per-session backstop, global exhaustion) and **applied to the live QR project**;
  `get_advisors` clean apart from documented/intentional lints.
- **Pre-PR adversarial subagent: PASS** (zero Critical/High). Folded in its hardening (per-session cap as
  a DB invariant; rate-limit window-drain + bound; honest soft-cap comment). **Advisors then caught a
  real EXECUTE-grant gap the subagent missed:** `revoke … from public` alone left the promo functions
  callable by `anon`/`authenticated` (Supabase explicitly grants them too) — `mms_promo_consume` was
  directly callable to burn a code's budget. Fixed: `revoke … from public, anon, authenticated`
  (verified `has_function_privilege('anon', …) = false`), plus a covering index on
  `promo_redemptions.order_id` (advisor 0001).
- **Fixed in passing — the live QR project was missing P1.5's `track_realtime`** (CI only tests a local
  stack; nothing had applied it to prod), so `qr_orders` wasn't in the realtime publication and `/track`
  live updates were silently broken in production. Applied it.
- _Deferred:_ tell the diner the exact shortfall on `min_not_met` ("add $X more") — a UX assist, not a
  correctness gap; a `promo_attempts` global retention job (today it self-GCs per active session).

### Added — M1·P1.6 hardening: nonce CSP + fail-fast env (2026-06-20)

- **Nonce-based Content-Security-Policy.** New `apps/qr/proxy.ts` (Next 16's rename of the
  `middleware` convention) mints a **fresh nonce per request** and emits
  `script-src 'self' 'nonce-…' 'strict-dynamic' https://js.stripe.com` — so we finally **drop
  `script-src 'unsafe-inline'`**, the one directive that made the old static CSP toothless against an
  injected `<script>`. `'strict-dynamic'` trusts the nonced framework bootstrap and whatever it loads
  (Stripe.js via `loadStripe`; PostHog via the same-origin `/ingest` proxy), so the host allow-list is
  just a pre-CSP3 fallback. The CSP **moved out of `next.config.ts`** (a per-request nonce can't be a
  static header) into the proxy; the nonce-free headers (Referrer-Policy / `nosniff` /
  Permissions-Policy / HSTS) stay in `next.config.ts` so they still cover the API + static responses
  the proxy matcher skips. Also tightened: `object-src 'none'`, `form-action 'self'`,
  `worker-src 'self' blob:`.
- **`frame-src` includes `https://*.js.stripe.com`** (with `js.stripe.com` + `hooks.stripe.com`): the
  Payment Element mounts iframes on per-origin `*.js.stripe.com` shards, and `frame-src` is a plain
  host allow-list that `'strict-dynamic'` does **not** cover — without the wildcard the card field can
  fail to render. `'unsafe-eval'` is added to `script-src` **in development only**
  (`NODE_ENV === "development"`): React's dev runtime + Turbopack HMR evaluate via `eval()`, which a
  nonce can't authorize, so `pnpm dev` would otherwise be broken by its own CSP; production never ships
  `'unsafe-eval'`. (Both surfaced by the pre-PR adversarial subagent — production-mode smoke testing
  alone had masked them.)
- **All routes render dynamically** (`export const dynamic = "force-dynamic"` in the root layout):
  Next can only stamp the per-request nonce onto its `<script>` tags during a per-request render, so a
  statically prerendered shell would ship scripts with no nonce and `'strict-dynamic'` would block
  them. The app is anon-auth + DB-driven, so the four otherwise-static shells lose no meaningful
  optimization. Verified end-to-end in **both** modes: the response CSP nonce matches the nonce on
  **all 18** rendered `<script>` tags and rotates per request; `/api/*` correctly gets no CSP;
  `'unsafe-eval'` is present under `next dev` and absent under `next start`.
- **Fixed in passing — `Permissions-Policy: camera=(self)`.** The header was `camera=()`, an empty
  allow-list that blocks the camera for **all** origins including our own — which would silently break
  the grocery Scan & Go viewfinder (`getUserMedia`). Now first-party only; mic/geo stay fully off.
- **Fail-fast env reads (hardening).** `packages/db/src/server.ts` now reads
  `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / the publishable key through a
  `requireEnv` guard that throws `Missing required env var: …` instead of the old `process.env.X!`
  feeding `undefined` to `createClient` (which resurfaced as a cryptic auth/network failure deeper in
  the stack — and once masked the delivery-vs-QR project mix-up). The Stripe **webhook** now returns a
  clear `500 "Webhook not configured"` when `STRIPE_WEBHOOK_SECRET` is unset (so Stripe redelivers once
  it's wired) instead of feeding `undefined` to `constructEvent` and masquerading as a `400 "Bad
signature"`; a missing `stripe-signature` header is an explicit 400.
- **`docs/ENV.md`** — the variable inventory (client/server, secret/not) + the Vercel **preview→prod**
  matrix (test keys on Preview, live on Production; staging when QR gets traffic), and the steps to
  wire the Preview env that unblock the Payment Element on PR previews. _Remaining (infra, Min):_ set
  those Preview env vars in Vercel.
- **ESLint flat config + `packages/config`** (the third P1.6 line item) already landed in M0·P0.9 —
  `@mms/config/eslint` is the shared base and `apps/qr/eslint.config.mjs` extends it; verified, no
  change needed.

### Added — M1·P1.5 live order tracking via Realtime (2026-06-19)

- **`/track` is now live.** After the Payment Element redirect, `apps/qr/components/OrderTracker.tsx` subscribes (`apps/qr/lib/useOrderStatus.ts`) to **Realtime Postgres Changes** on the diner's own `qr_orders` row — keyed by the `payment_intent` Stripe appends to the `return_url` — so the order appears **the moment the async webhook fulfills, with no manual refresh** (closes the deferred processing-state polling). Authorization is the existing `qr_order_read` RLS (`is_member(session_id)`), enforced per-subscriber, so a guessed `payment_intent` reveals nothing. Migration `20260619000400_track_realtime` adds `qr_orders` to the `supabase_realtime` publication (guarded/idempotent; no schema/type change). A **bounded fallback re-fetch** (~30s) covers the redirect→insert race / a cold socket so the order reliably surfaces even if the live channel is slow.
- **Status timeline built to v7.2.** `Order placed → In the kitchen → Ready → Served` ported from the prototype's `.tk` rail (18px dots, 2.5px connector, accent **pulse** on the active step → `globals.css` `mmsPulse`, success-green when done) — tokens only, no hardcoded colors. a11y: an `<ol>` with `aria-current="step"`, a single polite live region announcing the phase change, decorative dots `aria-hidden`, `prefers-reduced-motion` disables the pulse. Honest microcopy — no fabricated ETA countdown (real ETA needs the KDS).
- **Forward-compatible by design.** M1 has no kitchen actor, so the active step rests at "Order placed"; **S2's kitchen-status updates flow through the same subscription** with no client change (the timeline reads the future status). Dine-in / pickup step variants arrive with the S-track / M2.2.
- **Folded in the P1.4 adversarial findings** (PR #12 verdict, all non-blocking): `payment_succeeded` PostHog `capture` moved **inside** the fulfilled branch so a duplicate Stripe redelivery no longer double-counts analytics; the full `fulfillErr` (code/details/hint) is logged, not just `.message`; `getCartTotals` is wrapped in try/catch for context-rich 500s; `.env.example` `NEXT_PUBLIC_SUPABASE_URL` reverted to a `YOUR_QR_PROJECT` placeholder so local dev can't silently target the live DB.

### Fixed — M1·P1.4 webhook fulfillment is retry-safe (2026-06-19)

- **No more silent charged-but-unfulfilled orders.** `apps/qr/app/api/stripe/webhook/route.ts` previously `await`ed `mms_fulfill_order` without checking its result — and supabase-js returns a Postgres error in `{ error }` (it does **not** throw), so a failed fulfillment still returned `200 { received: true }`. Stripe treats 2xx as handled and never retries → the diner is charged but no `qr_orders` row exists. Now a non-null `error` logs + returns **5xx**, so Stripe redelivers (up to 72h); fulfillment stays idempotent on the PaymentIntent id, so a later successful retry is safe.
- **Observability:** a `payment_intent.succeeded` whose intent metadata is missing `cartId` (anomalous — `create-intent` always sets it; can't fulfill and a retry won't help) is now `console.error`'d instead of vanishing.
- **Already in place (P1.0), unchanged:** signature verification, idempotency on the PI id, and the amount-reconcile (`getCartTotals` vs `intent.amount` → 409 on mismatch before fulfilling). _Gem awarding stays deferred → M4_ (anon diner ↔ `loyalty_rewards.user_id NOT NULL`).
- **Docs:** `.env.example` corrected — QR runs on its **own** Supabase project (`fasnpdhtvqtzjlvruqcu`), not the shared delivery one; added the webhook-endpoint + `stripe listen` guidance for `STRIPE_WEBHOOK_SECRET`.

### Added — M1·P1.3 Stripe Payment Element (test mode) (2026-06-19)

- **Two-step checkout** in `apps/qr/components/Checkout.tsx`: a **review** step (line steppers, promo, tip, server totals) → **"Continue to payment"** POSTs the member-gated `/api/stripe/create-intent` `{cartId, tipRate}` → a **pay** step that mounts `<Elements>` + `<PaymentElement>` (`apps/qr/components/PaymentSection.tsx`) on the returned `clientSecret`, with an **"← Edit order"** way back. The amount is server-authoritative throughout (review breakdown from `getCartView`; tip-inclusive grand total from `create-intent`); the tip-chip `<small>` is a labeled preview only.
- **Tip selector** faithful to the v7.2 prototype — `No extra / 15% / 18% / 20%` chips, `aria-pressed`, `<small>` preview on the **discounted** base; the exact tip is re-derived server-side (`getCartTotals`, capped 0–50% by Zod).
- **PCI/SAQ-A intact** — `getStripePromise()` (`apps/qr/lib/stripe-client.ts`) loads Stripe.js once; PAN lives only in the Payment Element iframe. The Element **appearance is derived from `@mms/ui` tokens at runtime** (light = editorial, `.dark` = Night). Apple/Google Pay surface via `automatic_payment_methods`. `confirmPayment` returns to **`/track`**, now a real confirmation driven by Stripe's `redirect_status` (succeeded / processing / failed); the live timeline stays P1.5.
- **Folded-in deferrals**: `sessionMintOutput` Zod-parses the `/api/session` response (`useTableSession`); the promo live region is `aria-atomic`; focus moves to the heading when a stepper removes the last unit of a line.
- **Adversarial-pass hardening (zero-critical verdict).** A11y: focus moves to the heading on every **review↔pay transition** (the trigger button unmounts while focused — WCAG 2.4.3), and decorative `←` glyphs (Edit order / back links) are `aria-hidden` so they aren't announced. UX/trust: the **review summary now previews the selected tip** as a "Tip" row + "Estimated total" (identical `Math.round(netCents·rate)` to the server, so it reconciles exactly with the pay-step total — no surprise jump); the `/track` **processing** state gets a reassurance copy + a way off the page, and `/track` sets a per-state tab title via `generateMetadata`. Security: `create-intent` 500s return a generic `"Payment service error"` (the raw SDK message is logged server-side only — no recon surface before live keys).
- _Deferred (documented in `docs/REVIEW.md`):_ **cart-lock-during-pay → the group-cart Realtime phase.** Locking at intent-create strands a cart if the diner abandons the pay screen (no auto-release), and a lock only matters under concurrent editing (not wired yet); the signature-verified webhook **already reconciles** the live total vs `intent.amount` before fulfilling (a mutated cart 409s, never mis-fulfills), which is the P1.3 guard. Test-mode only — no real cards.

### Added — M1·P1.2 cart-create + line-merge + the cart flow (2026-06-19)

- **Server-issued cart.** `POST /api/session` now **find-or-creates the session's open cart** and returns `cartId` (idempotent — reuses the active session's open cart, or starts a fresh one after a previous cart is paid). The client never invents a cart id.
- **`useTableSession(mode)`** (client) — waits for the anon session, then mints/joins the table session via the Bearer-verified `/api/session` and exposes the `cartId`. A stable per-device QR identity per mode (localStorage) reuses the same session/cart across navigations instead of minting a new one each load.
- **Menu ordering.** `TableCartProvider` establishes the session once and shares a live, server-authoritative cart view; each item gets an `AddButton` (sends an item id, never a price; disabled until the cart exists and when sold out — a disabled control, not a missing one) and a sticky `CartBar` (live count + subtotal → `/cart`).
- **Line-merge.** `addItem` merges identical lines — same `menu_item_id` + the **normalized (order-independent) modifier set** → bumps `qty` instead of inserting a duplicate row (QA §B; keeps the cart bounded). Unit-checked for order-independence + jsonb-null safety.
- **Cart + checkout page.** `getCartView` (member-gated, RED-TEAM #2 — not an IDOR read) returns lines + server totals; the cart page renders them with 44px quantity steppers (`setQty`, `0` removes), server-validated promo, and the SB-1524 disclosure — re-fetching totals after every mutation (never client math). One polite live region (promo result); the rolling total is not `aria-live`. The pay CTA is a placeholder until **P1.3** mounts the Stripe Payment Element here.
- **Concurrency + a11y hardening (from the adversarial review).** Migration `20260619000000_cart_concurrency` adds an **atomic `mms_cart_item_inc_qty`** RPC (line-merge now `qty = qty + 1` in-DB — no lost-update race under concurrent group adds) and a **partial unique index** `qr_carts(session_id) WHERE status='open'` (so the find-or-create can't leave two open carts — `/api/session` re-reads on the conflict). `assertCartMember` now rejects non-`open` carts (paid carts are immutable). A11y: `aria-busy` on AddButton; `CartBar` is a real `<button>` (Enter+Space, QA §A P1); Stepper qty is an `<output>`; one polite notice region surfaces add failures; promo status clears on resubmit.
- **Money-path + a11y hardening (second review/adversarial pass).** Migration `20260619000100_cart_item_qty_cap` makes the increment **bounded + status-atomic**: `mms_cart_item_inc_qty` now JOINs the parent cart and requires `status='open'` and `qty < 99` in one UPDATE (closes a group-cart qty-inflation vector — `qty × unit_price` is the future Stripe amount — and a webhook `status='paid'` flip racing the app-layer guard), with a column `CHECK (qty between 1 and 99)` backstop for every write path. Client: `Checkout.refresh()`/`changeQty` swallow the post-payment 403 (no uncaught rejection on a paid cart); the Stepper `+` disables at 99; `TableCartProvider` announces a brief **success** confirmation as well as failures (WCAG 4.1.3) without making the rolling total `aria-live`; `applyPromo`'s PostHog `distinctId` is the verified `uid` (joins the diner profile), not the cart id.
- **Status-atomic mutations + grant lockdown + a11y (third review/adversarial pass — gate PASS).** Migration `20260619000200_cart_mutations_status_atomic` adds `mms_cart_item_insert_if_open` and `mms_cart_item_set_qty_if_open` so **every** cart write (insert / increment / setQty / delete) carries the `status='open'` guard into one SQL statement — closing the post-payment TOCTOU on the insert + setQty paths, not just the increment. It also fixes the **EXECUTE-grant gap**: the earlier `revoke … from anon, authenticated` was a no-op (Postgres grants new functions to `PUBLIC`), so all three cart RPCs now `revoke … from public` + `grant execute … to service_role` (mirrors `20260618000100_lockdown_grants`). Client a11y/UX: `TableCartProvider.refresh()` + the initial-load effect swallow the paid-cart 403 (no false-negative "Couldn't add", no unhandled rejection); the Stepper count is a plain `<span>` (not `<output>` — its implicit `role="status"` is announced on every press by NVDA/VoiceOver); the disabled pay CTA uses a visible `aria-describedby` note instead of `title`; AddButton says "Sold out" (not "86'd"); `CartBar` `encodeURIComponent`s the cart id.
- **Final symmetry + UX (fourth review/adversarial pass — gate PASS).** Migration `20260619000300_inc_qty_signal_closed` makes `mms_cart_item_inc_qty` **raise** on a closed cart instead of silently no-op'ing (it was the one path whose 0-row result the caller couldn't see → a phantom "Added"); the 99-cap stays a deliberate silent no-op on an open cart (signature unchanged → no type drift). `applyPromo`'s `qr_carts` write is now status-atomic too (`.eq("status","open")` + check) — so **all four** mutation paths are symmetric. The provider's live region is explicitly `aria-atomic`.
- **Reliability + observability (fifth pass — gate PASS, "correct and complete").** `/api/session` now checks the `session_members` insert error and 500s on any non-`23505` failure (a swallowed error previously returned a `cartId` that every later `assertCartMember` would 403 on — a silently broken session). `qr_carts.updated_at` touch failures are logged (non-fatal). Promo error UX: since Next redacts Server Action errors in production, the client can't read the failure reason off the thrown error — replaced the brittle message-match with one honest retry-safe message (per-reason promo messaging via a result-based return → M2).
- _Deferred (documented in `docs/REVIEW.md`):_ promo redemption caps/rate-limit → **M2·P2.1** (consume-on-fulfillment; no codes seeded today); **lock-cart-at-`create-intent`** (the stuck-payment vector) → **P1.3** with the unlock-on-failure lifecycle + webhook reconcile; `setQty` last-write-wins + the first-add double-insert merge → the **group-cart realtime** phase (neither is a charge error; no realtime concurrency is wired yet); `modKey` by option **id** vs label → when the modifier sheet ships; **qrCode host-squatting** (HMAC-signed QR payloads) → **M3** QR provisioning; raw `cartId` in the URL / paid-cart distinct message / Stepper debounce → later (the auth gate, not the id, is the guard).

### Added — M1·P1.1 anonymous-auth session wiring + Zod input layer + DB-drift CI (2026-06-18)

- **Anonymous-auth wiring (P1.1).** Diner identity is now a real, verified `auth.uid()` end-to-end (Supabase Anonymous Auth, decision #2):
  - **`AnonAuthGate`** (mounted in the root layout) calls `signInAnonymously()` on first load; the session persists in cookies via `@supabase/ssr`. **`useAnonSession()`** surfaces `{ accessToken, seat }` to client code (Realtime `setAuth`, Bearer fetches).
  - **`@mms/db/server` `serverClient(cookies)`** — SSR cookie-backed client so Server Actions / routes can read + **verify** the caller's `auth.uid()` (kept Next-agnostic via a cookie adapter).
  - **`POST /api/session`** verifies the `Authorization: Bearer` anon token (`getUser(token)`), records `session_members.seat_id = uid` (idempotent on rejoin), sets `host_seat`, and creates the host's cart — no client-asserted identity, no custom JWT (replaced the placeholder `crypto.randomUUID()` seat).
- **Per-action authorization (RED-TEAM #2; closes REVIEW.md gate #3 + QA §C "group-cart auth").** One guard — **`apps/qr/lib/authz.ts`** (`getCallerUid` + `assertCartMember`/`assertCartItemMember`) — gates **every** mutation: `addItem` / `setQty` / `applyPromo` (`cart.ts`), `scanAdd` (`grocery.ts`), and `create-intent` (closes `TODO(C3)`). Membership + cart-lock are re-checked from the verified uid before any write; `by_seat` provenance comes from the uid, not the client. `getCartTotals` moved to an internal `lib/totals.ts` (not a Server Action ⇒ no IDOR-read; the signature-verified webhook still calls it server-to-server).
- **Zod input layer (P1.0a).** `@mms/db/schemas` validates every external input at the trust boundary — ids `uuid`, money/qty non-negative `int`, tip capped ≤ 50%, barcode `^\d{8,14}$`, names length-capped. Routes return 400 on bad shape; actions throw. Pricing stays server-authoritative (the client only asserts _shape_: an item id + modifier ids).
- **DB-drift CI (P1.0a) + `supabase/config.toml`.** New `ci.yml` **`migrations-check`** boots a local stack (`supabase start`) applying `supabase/migrations` + seed, and **`types-fresh`** regenerates `database.types.ts` (`--local`) and fails on any drift. `config.toml` enables anonymous sign-ins (rate-limited, short JWT) as code; `db:types` regenerates the committed types the same way. (Generated `database.types.ts` added to knip ignore.)
- **Notes:** the live project's anonymous sign-ins must be toggled on (dashboard / `supabase config push`) for preview runtime. Grocery Scan & Go's demo cart is now correctly rejected by the authz guard until its real server-issued session lands (M2·P2.3) — the page degrades gracefully.

### Added — In-repo research context for remote sessions (`docs/context/`) (2026-06-18)

- **Problem:** Claude Code remote sessions only have `main`, but the decision-grade research (prototypes, red-team, QA gate, rubric, $0 stack) lived only in Min's Cowork workspace — so remote sessions built blind, and `CLAUDE.md`/`README` pointed at `../POS & Self-Serve 2026/…` paths that don't exist in a clone.
- **`docs/context/`** — distilled, durable subset that travels with every clone: `INDEX.md` (the map), `RESEARCH-DIGEST.md` (business · product · design · compliance · pricing _why_), `QA-CHECKLIST.md` (the canonical in-repo launch gate), `RUBRIC.md` (the 10-dim ≥4.3 bar), `RED-TEAM.md` (standing security/UX standards + known traps), `FREE-KIT-MAP.md` ($0 stack). Principle: **conclusions in git, process in Cowork.**
- **`docs/prototype/v7.2.html`** — the canonical visual/interaction reference (graded ≈4.3), copied byte-for-byte from the Cowork prototype.
- **`DESIGN-RESEARCH.md`** — distilled UI/UX research: the job-to-be-done + conversion evidence, the Sunday north-star teardown (with the review-gating FTC trap called out so a session doesn't copy it), the **paid UI-kit buy-list** (HeroUI Pro · Motion+ · shadcnblocks · Mobbin · optional React Bits), and the component/motion/voice craft bar — paired with the free stack.
- **Wired in:** `CLAUDE.md` + `README` + `docs/HANDOFF.md` index `docs/context/`; the SessionStart hook (`learning-context.mjs`) points every session at it; the PR-review prompt cross-checks `QA-CHECKLIST.md` + `RUBRIC.md` + `RED-TEAM.md`. Fixed the two broken `../POS%20…` README links and corrected the stale "one Supabase project" model in **`CLAUDE.md` and `README`** (QR + delivery are separate Supabase projects; QR owns its catalog).
- **Review workflow:** professional **`claude/<type>/<slug>` branch convention** (`CLAUDE.md` + `docs/WORKFLOW.md`); the diff-scoped **`adversarial-pr` gate is now fail-closed** (no verdict ⇒ fail, not pass) and re-promptable before merge via the **`adversarial` label**, with an **`adversarial-signed-off`** escape hatch for workflow-editing PRs that skip their own review under the anti-tampering guard. New labels added to `setup.sh`.
- **Product decisions captured:** `docs/context/ORDER-MODEL.md` — the dine-in service model (table-owned order · edit-rights by **line-state × role** · loss-gated voids + manager-PIN + **owner remote-approve** on one approvals primitive · **trust/secure tabs** on server discretion · **soft** multi-door convergence + one-tap merge · unified basket with to-go **fire-at-checkout**). Sequenced into `ROADMAP.md` as the **S1–S4 service-model track** with dependency notes + a recommended interleave (`M1→M2→M3→S1→S2→S3→M4→S4→M5→M6`).

### Added — Dedicated Supabase project: clean schema applied + seeded (2026-06-18)

- **QR now has its own Supabase project** (`MMS QR Platform`, ref `fasnpdhtvqtzjlvruqcu`) — no longer bending around the live delivery DB. The project came pre-seeded with an unrelated app's template tables (10 tables + a `handle_new_user` trigger on `auth.users`); cleared them after confirming 0 rows (the trigger would have broken anonymous sign-ins).
- **Applied a clean init schema** (`supabase/migrations/20260618000000_qr_platform_init.sql`): the catalog is **owned here** (`menu_categories`/`menu_items`/`modifier_groups`/`modifier_options`/`item_modifier_groups`/`grocery_items`), `tax_category` is a **first-class column on `menu_items`** (the `mms_menu_tax*` side-tables + resolver are gone), session/cart/order tables (`qr_*`), the cents tax engine, anonymous-auth **membership RLS**, realtime private-channel policies, and `mms_fulfill_order`.
- **Seeded the real menu** from `supabase/seed.sql` — 8 categories · 60 items · 7 modifier groups · 14 options · 6 grocery SKUs, with CA CDTFA tax classification.
- **Hardened grants** (`..._lockdown_grants.sql`): revoke `EXECUTE` from `PUBLIC` (Postgres' default) so `mms_fulfill_order` is service-role-only and `is_member`/`is_host` are `authenticated`-only; revoke `anon` SELECT on session-scoped tables. `get_advisors` is clean apart from documented, intentional exceptions.
- **Generated types + wired them in** (`packages/db/src/database.types.ts` → `createClient<Database>` in `@mms/db`): dropped the `as unknown` menu-embed cast and refactored `cart.ts` to read `tax_category` from the column (removed the deleted RPC). Old `packages/db/migrations/000{1,2}` superseded by `supabase/migrations/`.

### Added — Backend & database architecture design + advisor hardening (2026-06-18)

- **`docs/BACKEND_ARCHITECTURE.md`** — design of record for the four locked decisions: free-tier + a dedicated **staging** Supabase project (promote to prod manually), **Supabase Anonymous Auth** for diners (RLS off `auth.uid()`), **service-role Server Actions** as the authoritative write path, and **generated Supabase types + Zod** input validation. Covers the env/migration workflow (converge on the CLI timestamped format the delivery app already uses), the membership-based RLS model, the full backend routing map, the `@mms/db` package shape, and a phased plan (P1.0a infra → P1.1 auth → P1.2–P1.6).
- **⚠️ Documented the anon-auth blast radius:** enabling anonymous sign-ins on the _shared_ project grants every QR diner the `authenticated` Postgres role, so the delivery app's `authenticated` RLS must be audited on staging before enabling on prod (mitigations in §1).
- **Migration hardening (grounded in live `get_advisors`):** every QR function now pins `search_path` (bodies schema-qualified) and **revokes `EXECUTE` from `anon`/`authenticated`** (advisors 0028/0029); added **covering indexes** on every QR foreign key (advisor 0001). `mms_fulfill_order` / `mms_menu_tax_category` / the tax helpers are service-role-only.
- **ROADMAP:** inserted **P1.0a** (staging project, CLI migrations, typegen + Zod, CI `migrations-check`/`types-fresh`) and rewrote **P1.1** to the Anonymous-Auth membership model (was: custom HS256 table-session JWT). Updated `/api/session` + `useGroupCart` comments to the new model.

### Changed — M1·P1.0 schema reconciliation (2026-06-18)

- **Namespaced the QR session tables** `qr_carts` / `qr_cart_items` / `qr_orders` / `qr_order_items` so they no longer silently collide with the live delivery `carts`/`orders`/`order_items` (whose `create table if not exists` was no-op'ing). Repointed every query: `lib/cart.ts`, `lib/grocery.ts`, `app/api/session/route.ts`, the Stripe webhook, and the cart page.
- **Reads the real, delivery-owned menu.** `priceItem` + the menu RSC now hit the live `menu_items` (`name_en`/`name_my`, `base_price_cents`, `category_id → menu_categories`); modifiers are derived from the normalized `item_modifier_groups → modifier_groups → modifier_options.price_delta_cents` and **intersected server-side** so a client can't price a foreign/cheaper option id. Dropped the placeholder `menu_items` table + seed from `0001`.
- **Money is integer cents end-to-end** (parity with the delivery schema): `CartTotals`/`CartItem`, `lib/tax.ts` (`mms_line_tax` now `amount_cents → tax_cents`), the migrations (`*_cents` columns, grocery `price_cents`), and `create-intent` (no more `×100`). Dollars are formatted only at the UI edge.
- **Tax category sourced QR-side** without touching the delivery menu: `mms_menu_category_tax` (per-category default, seeded for all 8 live categories) + `mms_menu_tax` (per-item override), resolved by `mms_menu_tax_category()`.
- **Fulfillment** rewritten: `mms_fulfill_order` writes `qr_orders`/`qr_order_items` in cents and **reconciles** the breakdown against the PaymentIntent amount (the webhook recomputes `getCartTotals` with the `tipRate` carried in intent metadata; the function re-checks the sum == the charge and is idempotent on the PI id). Closes the L2 amount-reconcile TODO. ⚠️ Gem awarding stays deferred — `loyalty_rewards.user_id` is `NOT NULL`, so anonymous QR diners need an account link (M4) first.
- Validated read-only against prod (seed covers every category; cents tax math matches `lib/tax.ts`). Migrations are **not** applied to prod; Supabase branching needs the Pro plan, so apply on a branch before merge. See [`docs/DATA_RECONCILIATION.md`](docs/DATA_RECONCILIATION.md). Gate green.

### Changed — Toolchain refresh to latest stable + M1 unblocking (2026-06-17)

- **Monorepo on latest stable:** pnpm 9.12→**11.7**, turbo 2.3→**2.9**, TypeScript 5.6→**6.0**, Next 16.1.2→**16.2.9**, React **19.2.7**, Stripe SDK 17→**22** (apiVersion pinned to the SDK's `2026-05-27.dahlia`, derived from the constructor type so future bumps can't drift it), `@supabase/supabase-js` **2.108**/`ssr` **0.12**, plus `@number-flow/react`, `@zxing/library`, `zustand`, Radix, Tailwind, prettier, knip. The supply-chain `minimumReleaseAge` guard auto-pinned PostHog to the latest release older than the cutoff.
- **pnpm 11 migration:** moved `overrides` from `package.json` to `pnpm-workspace.yaml`; added `allowBuilds` approval for `sharp`/`unrs-resolver` (and skipped `core-js`'s funding postinstall); bumped `pnpm/action-setup` + `setup.sh`.
- **Build fix:** `next/font/google` fetched via Turbopack's Rust fetcher failed behind a TLS-intercepting proxy; `next.config.ts` now opts Turbopack into the system trust store (no-op on Vercel) so the build is green in CI/remote sandboxes.
- **Lint upgrade:** re-enabled Next `core-web-vitals` (a11y/perf/react-hooks) — it ships a native flat config now — and fixed the warnings it surfaced (`react-hooks/exhaustive-deps` in `useGroupCart`, anonymous default exports). ESLint pinned to latest **9.x**: its bundled `eslint-plugin-react` still uses a context API removed in ESLint 10.
- **Types:** declared `@types/node` + `server-only` on `@mms/db` and set `types: ["node"]` (pnpm's symlinked store isn't picked up by TS auto-inclusion); dropped deprecated `baseUrl` (removed in TS 7); knip config modernized for v6.
- **⚠️ Data-migration blocker surfaced:** the live shared Supabase project already has `carts`/`orders`/`order_items`/`menu_items` with different shapes, so QR `0001`'s `create table if not exists` would silently no-op. Guarded the migration + documented the reconciliation plan in [`docs/DATA_RECONCILIATION.md`](docs/DATA_RECONCILIATION.md); added **M1·P1.0** to the roadmap. Nothing applied to prod.

### Added — Theme-color viewport (2026-06-17)

- `apps/qr/app/layout.tsx`: split `themeColor` out of `metadata` into a separate `viewport` export (Next 16 contract). Light/dark schemes set so the mobile address-bar matches Day and Night surfaces.

### Added — Claude config + CI (2026-06-16, learned from the delivery app)

- **Claude Code config:** root `CLAUDE.md` (monorepo guide + developer profile), `.claude/settings.json` with hooks — SessionStart **learning-context**, SessionEnd **retro**, and a PostToolUse **auto-format** (Prettier + ESLint --fix on edited files, an improvement over the delivery app) — plus `.claude/LEARNINGS.md` + `.claude/ERROR_HISTORY.md` memory, and `.mcp.json` (Supabase / GitHub / Sentry MCP).
- **Quality:** `@mms/config` shared preset (ESLint flat + Prettier) + root `eslint.config.mjs` / `prettier.config.mjs` / `.prettierignore` / `knip.json`; root scripts `lint`/`format`/`knip`.
- **Reviews/CI:** ported the delivery app's richer `claude-review.yml` (Vercel-preview-grounded, ultrathink/Opus, fork-safe, OAuth token) + `.github/claude-review-prompt.md` spec, and `ensure-preview.yml` (webhook-drop safety net).

### Planned (M1 — walking pay path)

- Sign the table-session JWT (`/api/session`); authz on every Server Action; Payment Element; webhook amount-reconcile; nonce CSP. See `ROADMAP.md`.

## [M0] — 2026-06-16 — Scaffold

### Added

- Turborepo + pnpm monorepo (`apps/qr`, `packages/{ui,db}`); `@mms/*` aliases; root config.
- `@mms/db`: Supabase browser/service/session clients, shared types, migrations.
  - `0001_qr_ordering.sql` — `table_sessions`, `session_members`, `carts`, `cart_items`, `orders`, `order_items`, `promo_codes`; RLS keyed to active-session membership (`is_member`/`is_host`); **private Realtime authorization**; **category-aware tax** (`mms_taxable`/`mms_line_tax`) replacing the flat 10.5%; menu seed; idempotent `mms_fulfill_order`.
  - `0002_grocery.sql` — UPC-keyed `grocery_items` (tax category + `ebt_eligible`) + seed.
- `@mms/ui`: editorial-forward + Night tokens, Radix-based accessible `Sheet`, NumberFlow.
- `apps/qr`: App Router shell, entry mode-picker, **menu RSC**, broad screen stubs (track/rewards/account/cart); **server-authoritative cart** actions; Stripe **create-intent** + **webhook** routes; **Realtime group-cart** hook; **grocery Scan & Go** (`BarcodeScanner` + `scanAdd` + `/grocery`); PostHog client; CSP/security headers; `next/image` policy.
- CI/reviews: `ci.yml` (turbo lint/typecheck/build), `claude-review.yml` (Claude PR + security review), `adversarial.yml` (weekly), `setup.sh` (public repo + Turbo link), `.github` templates + CODEOWNERS.
- Docs: `ARCHITECTURE.md`, `GROCERY_SCANGO.md`, `REVIEW.md`, `WORKFLOW.md`, `ROADMAP.md`.

### Fixed (post-scaffold red-team)

- Tax computed on the **discounted taxable base** (not a pro-rata of the rounded aggregate).
- Removed an over-broad host RLS `UPDATE` policy; all writes go through service-role Server Actions.
- `is_host()` reads a custom `app_role` claim (Supabase reserves top-level `role`).
- Realtime presence uses a **stable** seat from the JWT (no per-subscribe churn).
- Stripe `create-intent` passes an idempotency key.

### Lineage

Productionizes the **v7.2 prototype** (design ≈4.3/5 on a 10-dimension world-class rubric; hardened across four parallel red-teams). The decision-grade research is distilled in-repo at [`docs/context/`](docs/context/INDEX.md) with the v7.2 reference at `docs/prototype/v7.2.html`; the full iteration history + Design Hub stay in Min's Cowork workspace (`../POS & Self-Serve 2026/02-design/`), outside git.
