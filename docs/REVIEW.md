# Scaffold Red-Team + Fixes (M0)

**June 16, 2026** — adversarial review of the M0 scaffold against the QA checklist, by an independent staff-engineer reviewer.

## Verdict

The scaffold **encodes the right P0 architecture** — the Stripe amount is genuinely server-derived and un-spoofable, RLS keys off a `session_id` JWT claim, Realtime is private, and the Payment Element keeps PAN off-DOM (SAQ-A). But M0 is a **blueprint**: three load-bearing pieces are deferred to M1, and there was one real money bug. Go to keep building; **no real card until the M1 items below land.**

## Fixed in this pass

- **Tax math (High)** — `getCartTotals` now computes tax on the **discounted taxable base** (per-line), not a pro-rata scale of the rounded aggregate. A flat promo across mixed taxable/exempt lines now stays CDTFA-correct. (`apps/qr/lib/cart.ts`)
- **Over-broad host RLS (High)** — removed the client `cart UPDATE` policy (it allowed a host client to write `promo_code`/`session_id` directly). All writes now go through service-role Server Actions; clients are default-deny on writes. (`migrations/0001`)
- **JWT claim collision** — `is_host()` reads a custom `app_role` claim (Supabase reserves top-level `role`). (`migrations/0001`)
- **Presence churn (Low)** — `useGroupCart` takes a stable `{seat,name}` from the session JWT instead of a fresh `crypto.randomUUID()` per subscribe. (`apps/qr/lib/realtime.ts`)
- **Stripe idempotency (Low)** — `create-intent` passes an idempotency key (`pi_{cart}_{amount}`) so double-submits don't mint duplicate intents. (`create-intent/route.ts`)
- **Poured 2 of the 3 missing beams** — added the `menu_items` table **+ seed** (the menu RSC + pricing now resolve) and the idempotent **`mms_fulfill_order`** function (the webhook no longer dead-ends). (`migrations/0001`)
- **Session-mint route shape (C2)** — added `POST /api/session` that creates/joins the table session and returns the seat/role; JWT signing is the one remaining TODO (clearly marked). (`app/api/session/route.ts`)

## Still open — the M1 "walking pay path" gate (do not run real cards until done)

1. **Sign the table-session JWT** in `/api/session` with `SUPABASE_JWT_SECRET` (claims: `session_id`, `seat`, `app_role`, `role:authenticated`) — until then RLS authorizes nothing and group cart is inert.
2. **Build the Payment Element client component + a cart-create action** — the cart page is a stub; nothing mounts `<Elements>` yet.
3. **Authz on every Server Action + `create-intent`** — `addItem`/`setQty`/`applyPromo`/create-intent are public POSTs; gate each on session membership + lock (IDOR otherwise). Merge identical cart lines (qty is hardcoded to 1).
4. **Reconcile the webhook amount** against `getCartTotals` before fulfilling (the cart could mutate between intent-create and webhook); award gems in `mms_fulfill_order`.
5. **CSP + lint/types** — drop `script-src 'unsafe-inline'` for a nonce-based CSP (Next middleware); add the flat ESLint config + `packages/config`; let `next dev` generate `next-env.d.ts`.

These are exactly the milestones in `ARCHITECTURE.md` §5 — the review confirms the design, and names the order to build it.

## Progress — M1·P1.1 anonymous-auth wiring (2026-06-18)

Maps to the open gate above (the dedicated-project + Anonymous-Auth architecture superseded the
custom-JWT plan, so item 1 is reframed):

- **Item 1 (session auth) — ✅ reframed.** No custom table-session JWT is signed. Diners use
  **Supabase Anonymous Auth**: `AnonAuthGate` signs in on load, `POST /api/session` verifies the
  `Bearer` anon token (`getUser(token)`) and records `session_members.seat_id = auth.uid()`. RLS
  (`is_member`/`is_host`) + private Realtime authorize off that uid — no `SUPABASE_JWT_SECRET`.
- **Item 3 (authz on every Server Action + `create-intent`) — ✅ done.** One guard
  (`apps/qr/lib/authz.ts`, RED-TEAM #2) re-checks membership + cart-lock from the verified uid on
  `addItem`/`setQty`/`applyPromo`/`scanAdd`/`create-intent`. `getCartTotals` is now an internal
  (non-action) fn → no IDOR read. **Merge identical lines is still open → P1.2.**
- **Items 2, 4, 5 — still open** (Payment Element + cart UI → P1.3; webhook amount-reconcile already
  lands in the schema's `mms_fulfill_order`; nonce CSP → P1.6). No real cards until all are green.
- **Also closes QA-CHECKLIST §C "group-cart auth"** (server-issued QR-bound session, server-
  authoritative cart, per-action authz, RLS on order tables, private Realtime with verified
  membership). Plus the P1.0a infra: **Zod** input layer + **`migrations-check`/`types-fresh`** CI.

## Progress — M1·P1.2 cart-create + line-merge + cart flow (2026-06-19)

The first PR to run the (now-fixed) Claude review/adversarial gates with comments. Findings triaged:

- **Fixed** — atomic `mms_cart_item_inc_qty` RPC (line-merge lost-update race); partial unique index
  `qr_carts(session_id) WHERE status='open'` + `/api/session` conflict re-read (duplicate open carts);
  `assertCartMember` rejects non-`open` carts (post-payment immutability); a11y (`aria-busy`, CartBar
  real `<button>`, Stepper `<output>`, one polite notice region, promo-status clear-on-resubmit).
  Migration `20260619000000_cart_concurrency` applied to the live project; advisors clean (no new).
- **Verified-and-dismissed** — the reviewer claim that `mms_fulfill_order` "never sets status=paid" is
  wrong; the init migration already does `update qr_carts set status='paid'`.
- **Deferred (documented)** — **promo redemption caps/rate-limit → M2·P2.1** (`applyPromo` checks
  `used` but doesn't consume a redemption; the correct fix consumes on _fulfillment_, and no promo
  codes are seeded, so it's not exploitable now). Raw **`cartId` in the URL → later** (LOW; the
  membership auth gate, not the id, is the capability check).

### Second pass — review + adversarial on the fix commit (2026-06-19)

Both gates favorable on the P1.2 fix commit: **adversarial = PASS (zero Critical)**, **review = Approve
with notes**. New findings triaged:

- **Fixed** — migration `20260619000100_cart_item_qty_cap`: `mms_cart_item_inc_qty` is now bounded
  (`qty < 99`) **and** status-atomic (JOINs the cart, requires `status='open'`) in one UPDATE, with a
  `CHECK (qty between 1 and 99)` backstop — closes the qty-inflation vector (MEDIUM) and the
  webhook-flips-`paid`-mid-flight RPC race (adversarial MEDIUM) together. `Checkout.refresh()`/
  `changeQty` now swallow the post-payment 403 (MEDIUM — the read path would otherwise throw an
  uncaught rejection once a cart is paid); Stepper `+` disables at 99; `applyPromo` PostHog
  `distinctId` → verified `uid` (LOW); `TableCartProvider` announces a brief **success** message too
  (adversarial a11y MEDIUM, WCAG 4.1.3) without making the rolling total live.
- **Verified-and-dismissed** — `setQtyInput` "has no upper bound" is wrong: `packages/db/src/schemas.ts`
  already caps `qty` at `.max(99)`. `mms_cart_item_inc_qty` "should be SECURITY DEFINER" — no: it's
  service-role-only and revoked from `anon`/`authenticated`, so INVOKER is the _narrower_ (correct)
  privilege; DEFINER would only widen the surface. (Advisors confirm: the function is not flagged.)
- **Deferred (documented)** — `setQty` **last-write-wins** (absolute-value write) → the group-cart
  **realtime** phase, alongside the **first-add double-insert** merge (both: not a charge error — rows
  sum correctly; only matters once concurrent group editing is wired, which P1.2 does not do). The
  clean fix for both is a delta/`ON CONFLICT` RPC with a normalized modifier key. **`modKey` keyed on
  option labels vs ids** → when the modifier sheet ships (moot today: addItem sends no modifiers).
  **Promo enumeration rate-limit → M2** (with the redemption work). Stepper **debounce** + paid-cart
  **distinct message** + **`cartId`-in-URL** → later polish (Low; mitigated by `disabled`-while-pending
  / the auth gate).

### Third pass — review + security + adversarial (2026-06-19)

**adversarial = PASS**, **security review = clean except the findings below**, **code review = Approve**.
The reviews probed the _whole_ cart-mutation surface (not just the increment fixed in pass 2):

- **Fixed** — migration `20260619000200_cart_mutations_status_atomic`: `mms_cart_item_insert_if_open`
  - `mms_cart_item_set_qty_if_open` carry the `status='open'` guard into the INSERT (new line) and
    the setQty UPDATE/DELETE, so **every** cart write is status-atomic in one statement (closes the
    two MEDIUM TOCTOUs symmetric to the increment). Same migration closes a **MEDIUM grant gap**: the
    prior `revoke … from anon, authenticated` was a no-op (Postgres grants new fns to `PUBLIC`), so all
    three cart RPCs now `revoke … from public` + `grant execute … to service_role` (the
    `20260618000100_lockdown_grants` pattern). A11y/UX MEDIUM/LOWs: `TableCartProvider.refresh()` +
    initial-load `.catch()` (no false-negative "Couldn't add"; no unhandled rejection); Stepper count
    is a plain `<span>` not `<output>` (implicit `role=status`); pay-CTA `title` → visible
    `aria-describedby`; "86'd" → "Sold out"; `CartBar` `encodeURIComponent(cartId)`.
- **Deferred (documented)** — **lock-cart-at-`create-intent`** (the compound stuck-payment vector:
  a concurrent add after intent-create → webhook amount mismatch → 409 retries) → **P1.3**: the
  correct fix needs the unlock-on-failure/expiry lifecycle that lands with the payment flow, and the
  DB-level status guards added here already harden the underlying race. **qrCode host-squatting**
  (any anon can POST an arbitrary `qrCode` and become host) → **M3** QR provisioning (HMAC-signed
  payloads); dine-in interim codes should be non-guessable. `useTableSession` runtime mode-change
  no-op → documented invariant (remount to switch). The pass-2 deferrals stand.

### Fourth pass — review + security + adversarial (2026-06-19)

**adversarial = PASS (zero Critical)**, all required checks green. The reviews confirmed the pass-3
hardening and flagged the last two symmetry gaps + LOW polish:

- **Fixed** — migration `20260619000300_inc_qty_signal_closed`: `mms_cart_item_inc_qty` now **raises**
  (`P0001`) on a closed cart rather than silently no-op'ing — it was the one path whose 0-row result
  the caller couldn't see, so a webhook status flip would let `addItem` report a phantom "Added". The
  99-cap remains a deliberate _silent_ no-op on an open cart (the two cases are distinguished in the
  function; signature stays `void` so no type drift). `applyPromo` is now status-atomic too
  (`.eq("status","open")` + 0-row check) — **all four** mutation paths are symmetric. UX/a11y LOWs:
  the promo catch distinguishes a rejected code from a network/closed-cart error; the provider live
  region is explicit `aria-atomic="true"`.
- **Deferred (documented)** — `setQty`/qty-change **user-facing feedback** on locked/paid carts (the
  catches are silent today) → **P1.3** with the receipt-redirect UX (carts can't be locked/paid in
  P1.2); `set_qty_if_open` 0-row message imprecision (closed vs item-gone) → same; `/api/session`
  **no in-app retry** after a network error (page reload recovers) → later polish; **qrCode logged to
  PostHog** → **M3** (it's a per-device random id today, a real table id only at provisioning);
  the `0100` ineffective-`revoke` line → left as-is (append-only; `0200`/`0300` complete the lockdown
  and document it). All prior deferrals stand.

### Fifth pass — review + adversarial (2026-06-19)

**adversarial = PASS ("zero Critical … correct and complete")**, all required checks green. One real
MEDIUM + two LOWs:

- **Fixed** — `/api/session` now checks the `session_members` insert error and returns 500 on any
  non-`23505` failure (MEDIUM: a swallowed error handed back a `cartId` that every later
  `assertCartMember` 403s on — a silently broken session). `qr_carts.updated_at` touch errors are now
  logged in `addItem`/`setQty` (non-fatal — the line mutation already committed).
- **Reworked, not as suggested** — the promo-error LOW ("fragile `msg.includes('Invalid')`"): the
  reviewer's typed-`code` discriminant wouldn't help either, because **Next redacts Server Action
  errors in production** (generic message + digest), so the client can't read the reason off the
  thrown error at all. Replaced the brittle match with one honest, retry-safe message; proper
  per-reason promo messaging needs a **result-based return** from `applyPromo` → M2 promo phase.
- **Deferred (documented)** — the double `assertCartMember` round-trip per mutation (action +
  `refresh`) → the Realtime subscription phase (acceptable at P1.2 load). All prior deferrals stand.

## Progress — M1·P1.3 Stripe Payment Element (test mode) (2026-06-19)

First phase built under both bars (money-path hardening + v7.2 fidelity) up front, with a
self-adversarial + design-fidelity pass before the PR.

- **Closed M1 gate item 2 (Payment Element + cart-create) — ✅.** Two-step checkout (review + tip →
  pay): `Checkout.tsx` → member-gated `/api/stripe/create-intent` → `PaymentSection.tsx` mounts
  `<Elements>`/`<PaymentElement>` on the returned `clientSecret`. PAN stays in the Stripe iframe
  (SAQ-A); amount is server-authoritative (the chip `<small>` is a labeled preview, not the charge).
  Element appearance derived from `@mms/ui` tokens (light/Night). `confirmPayment` → `/track`
  (`redirect_status` confirmation; live timeline → P1.5).
- **M1 gate item 4 (webhook amount-reconcile) — already present** and is the P1.3 money guard: the
  signature-verified webhook recomputes `getCartTotals` and 409s a mismatch before `mms_fulfill_order`
  (idempotent on the PI id). No real cards (test mode).
- **Folded-in prior deferrals — ✅** `sessionMintOutput` Zod-parses the `/api/session` response;
  promo live region `aria-atomic`; focus moves to the heading when a stepper removes the last unit.
- **Deferred (documented, with rationale)** — **cart-lock-during-pay → the group-cart Realtime
  phase.** A self-adversarial pass caught that locking at intent-create _strands_ a cart when the
  diner abandons the pay screen (no auto-release; their next `addItem` throws "locked"). A lock only
  has value under **concurrent** editing (group carts, not wired) and wants the realtime sync's
  natural release point — so the earlier "lock-at-create-intent → P1.3" plan was revised. The webhook
  amount-reconcile already prevents mis-fulfillment, which is sufficient for solo test-mode P1.3.
  Also still open: `/cart` distinct paid-cart message (the diner is redirected to `/track`, not
  `/cart`, post-pay) and the Stripe-error UX beyond `error.message`.
- **Adversarial pass (zero Critical) — addressed in this PR.** A11y: focus → heading on every
  review↔pay transition (WCAG 2.4.3); decorative `←` glyphs `aria-hidden`. UX/trust: review summary
  previews the tip ("Tip" row + "Estimated total", exact-reconciling with the pay total); `/track`
  processing state gets reassurance copy + a back link; `/track` sets a per-state tab title.
  Security: `create-intent` 500 body is now generic (`"Payment service error"`), real message logged
  server-side only.
- **Still deferred → P1.5 Realtime:** the `/track` `processing` state has no live polling/auto-refresh
  (the page renders from the URL `redirect_status`, which is static) — it lands with the
  Realtime order timeline. Per-reason promo messaging stays M2.

## Progress — M1·P1.5 live order tracking + P1.4 follow-ups (2026-06-19)

- **Closed the M1 exit "shows in Track" — ✅.** `/track` mounts `OrderTracker` (client) which subscribes
  via `useOrderStatus` to **Realtime Postgres Changes** on the diner's own `qr_orders` row, keyed by the
  `payment_intent` Stripe appends to the return_url. The order surfaces the instant the async webhook
  fulfills — **no manual refresh** — which also **closes the deferred `processing`-state polling**.
- **Authorization reuses existing RLS (no new surface):** `qr_order_read` (`is_member(session_id)`) gates
  the subscription per-subscriber, so a guessed `payment_intent` returns nothing. Migration
  `20260619000400` only adds `qr_orders` to the `supabase_realtime` publication (RLS already on; no
  schema/type change → no `types-fresh` drift).
- **Resilience:** a bounded fallback re-fetch (~30s, stops on arrival) covers the redirect→insert race and
  a cold socket, so the order appears even if the live channel is slow — Realtime is the live path, not
  the only path.
- **Fidelity + a11y up front (RUBRIC ≥4.3):** timeline ported from the v7.2 `.tk` rail (tokens only,
  accent pulse with `prefers-reduced-motion` off-switch); `<ul role="list">` (WebKit semantics) + `aria-current="step"`; one polite live
  region for the phase change; decorative dots `aria-hidden`. **No fabricated ETA** (honest — real ETA
  needs the KDS).
- **Forward-compatible:** M1 has no kitchen actor so the active step rests at "Order placed"; **S2's
  kitchen-status updates ride the same subscription** with no client change. Dine-in/pickup step variants
  → S-track / M2.2.
- **P1.4 adversarial findings (PR #12, all non-blocking) — addressed here:** `payment_succeeded` capture
  moved inside the fulfilled branch (no analytics double-count on duplicate Stripe redelivery); full
  `fulfillErr` logged (not just `.message`); `getCartTotals` wrapped in try/catch for context-rich 500s;
  `.env.example` URL reverted to a `YOUR_QR_PROJECT` placeholder.
- **Still deferred:** kitchen lifecycle (`fired → in-progress → served`) + KDS + real ETA → **S2 / M2.2**;
  `/cart` distinct paid-cart message → later (diner is redirected to `/track` post-pay). Live end-to-end
  smoke needs the Stripe test webhook + keys wired on the deploy env (dashboard task).

## Progress — M1·P1.6 hardening: nonce CSP + fail-fast env (2026-06-20)

Closes **gate item 5** ("drop `script-src 'unsafe-inline'` for a nonce-based CSP; flat ESLint config +
`packages/config`"):

- **Nonce CSP — ✅ done.** `apps/qr/proxy.ts` (Next 16's `middleware` rename) sets a per-request nonce
  CSP with `'strict-dynamic'` and **no `'unsafe-inline'`** on `script-src`. The CSP moved out of
  `next.config.ts` (the nonce-free static headers stay there for API/static coverage). Root layout is
  `force-dynamic` so the nonce reaches every page's framework scripts. **Empirically verified** (`next
start`): the response CSP nonce matches the nonce on all 18 rendered `<script>` tags and rotates per
  request; `/api/*` gets no CSP; Stripe.js + PostHog (`/ingest`) are covered via `'strict-dynamic'`
  propagation. Tightened `object-src 'none'` + `form-action 'self'` + `worker-src 'self' blob:`.
- **Flat ESLint + `packages/config` — ✅ already landed** (M0·P0.9); `@mms/config/eslint` base extended
  by `apps/qr`. No change needed.
- **Env wiring — code ✅, infra pending.** Fail-fast `requireEnv` guards on the server secrets
  (`@mms/db/server.ts` + the Stripe webhook secret) replace silent `process.env.X!`; `docs/ENV.md`
  documents the Vercel preview→prod matrix. _Remaining (Min):_ set the Preview env vars (test Stripe
  keys + webhook secret) in Vercel — the only thing between here and a live PR-preview Payment Element.
- **Fixed in passing:** `Permissions-Policy: camera=(self)` (was `camera=()`, which blocked the
  grocery scanner's `getUserMedia` first-party).
- **Adversarial subagent (fresh-context, four lenses): FAIL → fixed → PASS.** It caught two real Highs
  my production-only smoke test had masked — (1) `frame-src` lacked `https://*.js.stripe.com`, the
  per-origin shards the Payment Element mounts (`'strict-dynamic'` doesn't cover `frame-src`), a
  money-path break; (2) `script-src` had no `'unsafe-eval'` in development, so `pnpm dev` (React/
  Turbopack `eval`) was broken by its own CSP. Both fixed in `proxy.ts` and **re-verified in both
  modes** (`'unsafe-eval'` present under `next dev`, absent under `next start`; `*.js.stripe.com` in
  `frame-src`). Plus the L2 stale `middleware.ts`→`proxy.ts` comment. Verdict posted to the PR.

## Progress — M2·P2.1 server-validated promo codes (2026-06-20)

First M2 phase. Promo validation, redemption caps (global soft + per-session hard), and apply
rate-limiting are now server-authoritative in SECURITY DEFINER functions (`mms_promo_check` /
`_discount` / `_attempt` / `_consume`); `getCartTotals` derives the discount from one SQL source;
`applyPromo` returns a per-reason result (Next redacts thrown errors in prod).

- **Local-stack validation** (booted the pinned `supabase` CLI in-sandbox): discount math, min-subtotal
  gate, rate-limit (10/window, drains), consume + per-session backstop, global exhaustion — all pass.
- **Adversarial subagent — PASS (zero Critical/High).** Folded in: per-session cap as a **DB invariant**
  (re-checked under a row lock in `consume`, not just the app-layer apply gate); rate-limit \*\*count-first
  - self-GC\*\* (window drains, ledger bounded); honest soft-cap comment (overrun ≈ concurrent unfulfilled
    carts).
- **`get_advisors` caught what the subagent missed — a real EXECUTE-grant gap.** `revoke … from public`
  alone did **not** lock the promo fns (Supabase also explicitly grants `anon`/`authenticated`), so
  `mms_promo_consume` was anon-callable via `/rest/v1/rpc` → burn a code's budget. Fixed with
  `revoke … from public, anon, authenticated` (verified `has_function_privilege('anon', …) = false`) +
  the `promo_redemptions.order_id` covering index. **Lesson: run advisors + verify grants after every
  function migration — the adversarial pass is necessary but not sufficient for grant-surface bugs.**
- **Applied to the live QR project** (also applied the **missing P1.5 `track_realtime`** — prod's
  `/track` realtime was silently off because nothing had applied that migration to live).

## Progress — M2·P2.2 honest pickup scheduling (2026-06-20)

Capacity-limited slots + a server fire-time; `/track` echoes the chosen slot (no fabricated countdown).
DB-authoritative (`mms_pickup_slots` / `mms_set_pickup_slot`, service-role only); the v7.2 slot sheet +
header chip; create-intent re-checks room at pay.

- **Local-stack validation:** slot generation + fire-offset, hold-based capacity, exclude-self re-pick,
  advisory-lock serialization, stale-hold freeing, fulfillment carry — all pass.
- **Adversarial subagent — FAIL → fixed → PASS.** It caught a **real overbooking race**: capacity counted
  only `paid` orders, which exist only post-webhook, so the whole order→pay window undercounted and N
  diners could book the last seat. Fixed by counting **live holds** (active open carts within a TTL) +
  a **per-slot advisory lock** + an **exclude-self** arg (so a diner sees their own slot's true
  availability and create-intent doesn't reject their in-progress order). Chose this over a hard cap in
  `mms_fulfill_order` (which would strand a charged diner — the P1.4 failure). Also folded: the
  `mms_set_pickup_slot` config `if not found` guard, the sheet's double live region.
- **`get_advisors` clean** apart from the intentional `pickup_config` default-deny (RLS-no-policy INFO);
  the EXECUTE lockdown (`revoke from public, anon, authenticated`) verified `anon=false` — the P2.1
  lesson applied correctly the first time.
- **Applied to the live QR project.**
- _Deferred (documented):_ inline `/cart` slot-picker (slot-less checkout recovers via the menu chip
  today); a sweep for abandoned holds (they self-expire via the `hold_minutes` TTL).

## Progress — M2·P2.3 grocery + P2.4 QBO sync (2026-06-20)

- **P2.3 Scan & Go** (#21): mints a real `useTableSession("scango")` session (not a client uuid); barcode + name-search fallback (`searchGroceryItems`) over public-RLS `grocery_items`. Adversarial pass clean.
- **P2.4 QBO accounting sync** (#22): paid order → QBO Sales Receipt deposited to a Stripe clearing account (two-ledger); total-preserving mapper (throws unless Σlines == charge); fail-safe idempotent client (no-op unless `QBO_SYNC_ENABLED`); `qbo_sync_queue` ledger (migration `…0400`, RLS default-deny); webhook posts in `after()`. **Off by default.** See `docs/QBO_SYNC.md`.

## Progress — M3 group cart (P3.1–P3.3b) (2026-06-20 → 06-21)

Per-PR detail in `CHANGELOG.md` + each PR's posted adversarial verdict; the load-bearing QA record:

- **P3.1 multi-device join** (#25) — `qrCode` doubles as the join key; partial unique index for race-safe convergence; sanitized presence guest list keyed by the stable seat. Pre-PR + pre-merge adversarial passes (caught: unbounded presence-name ingest → clamp on receive; join-vs-provision intent).
- **P3.2 live group-cart sync** (#26) — Postgres Changes → re-fetch the server-authoritative view; `replica identity full` for DELETE; announce a peer's ADD only. Adversarial pass: missing `.subscribe(status)` self-heal handler → added.
- **P3.2-lock cart-lock-at-pay** (#27) — atomic conditional UPDATE + TTL auto-release + scoped release; the existing `locked` guard enforces. **Pre-merge pass caught a BLOCKER:** routing grocery `scanAdd` through the uuid RPC broke text barcodes → reverted (CI's generated type masked it). Vindicated running both passes.
- **P3.3a split-the-bill foundation** (#28) — Even/By-person + assignment; isomorphic `canMutateLine`; optimistic cent-reconciled shares (`lib/split-math`). Pre-PR (2 must-fix: pay-vs-share footgun, status-atomic `assignLine`) + pre-merge UI/UX (4 should-fix: optimistic compute, announce, motion) passes.
- **Session-expiry recovery** (#29) — 4h TTL stranded in-use tables; sliding renewal + sweep-and-remint + client recovery. Adversarial pass: solo-mode recovery affordance + race-clean renewal + symmetric `assertSessionMember`. Pre-merge: AA-contrast on the recovery button.
- **Error tracking** (#30) — PostHog server `onRequestError` + branded error boundaries. **Pre-PR pass caught 2 BLOCKERS:** `request.path` leaked the `?t=`/`?j=` credentials to analytics → drop it; a stray `pnpm-workspace.yaml` placeholder → removed.
- **P3.3b split-tender** (#31, Option A) — the per-payer authorize → capture-all → fulfill spine. **Three adversarial passes:** foundation (B1 `$0`-share CHECK, S2 fail-loud fulfill), server flow (2 should-fix money races: capture-vs-abort, stale-takeover — gated capture on a live settlement + per-PI capture verify + claim-first abort), pre-merge (ship; 2 deferred NITs). `qr_cart_shares` ledger + `settle_at` freeze applied to live; `get_advisors` → `revoke select from anon` (advisor 0026). Tax weighted by each seat's **taxable** base. **"Never charged-with-no-order" holds; residual sub-ms races fail loud.**

**Deferred / tracked:** the P3.3b analytics double-fire NIT; `charge.refunded` handling (platform-wide → S4.3).

## Progress — M3·P3.4 abuse limits (2026-06-21) — **M3 complete**

Hardens the live group-cart + split-tender surface against a hostile-but-verified client (membership authz
stops a non-member; this bounds a member who FLOODS). Migration `20260621000000_abuse_limits` (additive)
applied to live; `get_advisors` clean apart from the intentional `rate_events` default-deny INFO.

- **Rate limits (per device).** Generic `mms_rate_limit(bucket, key, max, window)` over a `rate_events`
  ledger — the proven count-first / self-GC / reject-without-record window (`mms_promo_attempt`). Wired
  into `/api/session` join (30/min → 429) and every cart mutation (addItem/setQty/assignLine/scanAdd/
  setDisplayName/openSettlement + create-intent/create-share-intent, 120/min). Keyed by the **verified
  seat** (one device) not per-session, so one bad actor can't DoS co-diners' shared cart; **fail-open**
  (`lib/rate.ts`) so a limiter glitch never strands a paying diner.
- **Party-size cap (12).** Advisory-locked `session_members` `BEFORE INSERT` trigger (`mms_enforce_party_size`)
  — atomic under concurrent joins. Friendly route pre-check 409 on the common path; the trigger's
  `party_full` raise also maps to the 409. Cap-aware Invite UI (`GuestList`/`InviteSheet`) — honest copy,
  no retry on the terminal full case.
- **Session sweep.** `mms_sweep_expired_sessions()` on **pg_cron** (every 15 min) closes idle expired
  sessions (the backstop the `table_sessions_active_qr_uniq` index comment anticipated) + bounds the
  ephemeral ledgers. Schedule guarded so a local CI stack without pg_cron applies the migration cleanly.
- **RLS membership tests** (QA-CHECKLIST §C / RED-TEAM #4 — "trust boundaries are real"): a non-member
  can't read another table's session/members/cart/items/shares/order under RLS (+ a positive control).
  `supabase/tests/rls_membership_test.sql` (plain-SQL `assert`s, rolled back), wired into CI and
  **verified PASS against the live project**.
- **Adversarial subagent — PASS** (zero Critical/High). Two acceptable Lows: a mutate-rate 429 in
  `TableCartProvider.add` surfaces the session-recovery copy (self-correcting; precise per-reason copy
  needs a result discriminant — the thrown message is redacted in prod); the sweeper piggybacks
  `promo_attempts` GC (harmless, bounded).

## Milestone red-team — M3 (pre-S1) + hardening PR (2026-06-21)

Before S1, a **four-lens fresh-context adversarial pass** (money · auth/RLS/abuse · realtime/product-UX ·
a11y/perf) over the whole M3 surface (P3.1–P3.4). **Spine verdict: sound** — server-authoritative amounts,
the split-tender capture/abort race (fail-loud), idempotent fulfillment, lock×settle mutual exclusion,
IDOR coverage on every mutation, RLS default-deny + SECURITY-DEFINER lockdown, atomic party cap, anti-spoof
presence. Escapes were at the edges; fixed in the M3-hardening PR:

- **Critical** — split-tender completion redirected paid diners to the "no order placed" stub. Fixed:
  `/track?cart=…&paid=1` + member-gated `getSplitOrderId` (`lib/order.ts`) + order-id-keyed
  `useOrderStatus`/`OrderTracker` + honest "finalizing" fallback.
- **High** — join code (`?t=`/`?j=`) leaked to PostHog `$current_url` (client pageview). Fixed: `before_send`
  scrub + URL strip after consume. · SettlementBoard poll never terminated post-redirect. Fixed: `load()`
  short-circuit. · Sheet close ✕ < 44 px → 44 px tap target. · Menu `<ul>` missing `role="list"` → added.
- **Medium** — cart could increment a sold-out line (`getCartView` now carries `is_sold_out`); a
  `getSplitContext` read-miss while settling dropped a payer into an unwinnable plain checkout (now a
  retry); accent-on-tint contrast < 4.5 (`--ac-strong` token); sheet/scrim reduced-motion; non-private
  realtime channels (S2 broadcast guard comment).
- **Deferred (tracked):** split-fulfill reconcile tautology → fix WITH S4.3 partial-capture; P3.3a/P3.3b
  share-math display divergence (label/align); cross-owner-delete confirm (product sign-off); the P3.4 Low
  - P3.3b analytics double-fire. See `docs/HANDOFF.md`.
- Gate green (`turbo lint typecheck build`); no schema change (no migration/types/live-apply). Hardening-PR
  adversarial subagent re-review on the diff: see the PR.

## Milestone red-team — M0/M1/M2 (pre-S1) + hardening PR (2026-06-21)

Five fresh-context adversarial lenses across M0 (foundations), M1 (single-pay spine + security/infra), M2
(promos · pickup · grocery · QBO). **Spine verdict: sound across all three** — tax-on-discounted-base with
TS↔SQL parity, reconcile-before-write + double idempotency, server-authoritative amounts, promo
enumeration/cap lockdown, pickup overbooking guards (#61/#62/#63/#64 all present), QBO total-preserving +
off-by-default + never-blocks-money-path + `server-only` secrets, nonce CSP + SAQ-A + fail-fast env.
Per-lens: M1-sec PASS, M1-money PASS, M2-promo/pickup PASS, M2-grocery/QBO PASS, M0 CHANGES_REQUESTED.

Edge/foundation fixes shipped (no migration; hardening-diff adversarial subagent **PASS**):

- **High** — Padauk loaded `subsets:["latin"]` (a Myanmar face) → Burmese silently fell back to system sans.
  Now `["latin","myanmar"]`.
- **Med** — dark `--t3` was 4.40/4.10 on `--sf`/`--cd` (< AA) → `#9d95a8` (5.84/5.45), math independently
  reconfirmed; tokens.css "AA verified" comment corrected. Latent (no theme toggle until M5). · `scanAdd`
  gained the `settling` guard (parity; unreachable today).
- **Low** — analytics scrub widened to Stripe `payment_intent`/`redirect_status` + `disable_session_recording`;
  barcode comment; removed the dead `@mms/config/tsconfig` export + orphan file.
- **Deferred (tracked in HANDOFF):** M1-money sub-6¢ taxable-SKU inference (`tax_cents>0` proxy; no real SKU;
  needs a small data-model change) + order-vs-line `tax_cents` snapshot (charge correct, receipt cosmetic);
  QBO production-activation items. M2 by-design soft-caps (global promo cap, create-intent overbook-by-one).
- Gate green (`turbo lint typecheck build` 5/5); knip clean except the pre-existing QBO export.

## Progress — S1.1b staff PIN (shared-tablet fast-path + S2 step-up primitive) (2026-06-21)

Per-person PIN for a shared floor tablet — bcrypt hash in a **service-role-only `staff_pins`** table (NOT a
`staff` column, which `authenticated` can SELECT), atomic advisory-locked `mms_staff_verify_pin`
(**5-try / 15-min lockout**, lapsed-lock grants fresh budget), **fail-CLOSED** app wrapper; keyed by the
resolved staff-row PK (`StaffCaller.staffId`, not the session uid). Self-service set/rotate/remove at
`/staff/profile`; a shared-tablet **lock** (`/staff/lock`) on an httpOnly path-scoped cookie, documented as
an attribution/privacy affordance (not a hard boundary). The verify fn is exactly what S2's manager step-up
reuses.

- **Adversarial subagent (fresh context, four lenses): PASS.** No blockers. Security strong (IDOR-closed —
  every action `requireStaff` + operates on `caller.staffId`, never a body id; hash unreachable by any
  client read; all 3 fns `revoke public/anon/authenticated` + `grant service_role`; lockout atomic +
  un-bypassable; lock cookie honestly scoped). Recovery sound (fail-closed; no stranding — sign-out escape,
  lock refused without a PIN, `no_pin` branch). a11y clean (44px, labels, one live region/view, focus mgmt,
  glyphs `aria-hidden`, no animation). Fidelity good (tokens not hardcoded, honest microcopy).
- **Findings addressed before PR:** (Low) `PinUnlock.signOut()` now handles a failed `auth.signOut()` with
  honest copy; (Nit) trivial-PIN rejection made **algorithmic** (all-same / consecutive run at ANY 4–8
  length, so `000000`/`123456` are caught) instead of a fixed 4-digit list.
- Gate green (`turbo lint typecheck build` 5/5). Migration `20260621130000_staff_pin.sql` is additive;
  **verified on the local CI stack** (functional lockout test: correct → 5× wrong → lock → lapsed-reset →
  correct) + `gen types --local` byte-match. **✅ APPLIED to live `fasnpdhtvqtzjlvruqcu`** (Supabase MCP) +
  verified: RLS-on/0-policies, `anon`/`authenticated` have no table SELECT and no EXECUTE on the three
  `mms_staff_*` fns (service-role only), bcrypt resolves under `extensions`, `get_advisors` shows only the
  intentional `rls_enabled_no_policy` INFO on `staff_pins` (absent from the 0026/0027 GraphQL WARNs).
- **Pre-merge adversarial subagent (second pass, fresh context): MERGE** — both prior fixes verified
  correct; no merge-blocking findings; 3 non-blocking nits (per-page lock gate is deliberate;
  malformed-input `attemptsRemaining:0` commented; bcrypt cost 10 fine). Verdict posted to PR #44.
