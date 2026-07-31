# 🗺 Roadmap — MMS Platform

Milestones → phases → tasks (the delivery-app rhythm). Each **milestone** ships a usable increment; each **phase** is a PR-sized unit with an exit criterion. Mirrored to the [GitHub Project board](https://github.com/min-hinthar/mms-platform/projects) via the `milestone:Mx` + `phase` labels. Changelog: [`CHANGELOG.md`](CHANGELOG.md).

**Legend:** ✅ done · 🟡 in progress · ⬜ todo · ⏸ deferred

---

## Now / Next / Later

- **Now →** M1 · Walking pay path (the smallest end-to-end real charge).
- **Next →** M2 tax/promos/scheduling · M3 group cart.
- **Later →** M4 rewards · M5 QR learns from delivery (separate repos) · M6 kiosk + Terminal + EBT (2027).
- **Service-model arc →** S1 staff & floor · S2 line authority · S3 tabs · S4 unified basket — the dine-in/full-service layer from [`docs/context/ORDER-MODEL.md`](docs/context/ORDER-MODEL.md). Interleaves after M3 (see the track below; **build order ≠ milestone number**).

---

## ✅ M0 — Scaffold &nbsp;`milestone:M0`

Monorepo + the risky architecture, designed in.

- **P0.1 Monorepo** — turbo/pnpm workspaces, tsconfig base, `@mms/*` aliases, root config. ✅
- **P0.2 Packages** — `@mms/ui` (tokens · Radix Sheet · NumberFlow) · `@mms/db` (clients · types). ✅
- **P0.3 Data + RLS** — `0001` tables, RLS, `is_member`/`is_host`, private Realtime policies, category-aware tax fn, menu seed, idempotent fulfillment. ✅
- **P0.4 QR app shell** — App Router, layout/fonts, entry mode-picker, menu RSC, broad screen stubs. ✅
- **P0.5 Pay scaffolding** — server cart actions, Stripe intent + webhook routes, Realtime group-cart hook, PostHog. ✅
- **P0.6 Grocery** — `0002` UPC catalog, `scanAdd`, `BarcodeScanner`, `/grocery`. ✅
- **P0.7 CI/Reviews** — CI, Claude PR review (Vercel-preview-grounded) + security + scheduled adversarial, `ensure-preview`, `setup.sh`. ✅
- **P0.8 Claude config + quality** — `CLAUDE.md` + `.claude/` (settings, auto-format + memory hooks, LEARNINGS/ERROR*HISTORY) + `.mcp.json`; ESLint + Prettier + knip via `@mms/config`. ✅ &nbsp;·&nbsp; \_deferred to a later phase:* Vitest + Playwright + Storybook + Chromatic + Lighthouse CI + Sentry (port from the delivery app once there's UI/tests to cover).

**Exit:** repo builds, scaffold reviewed (`docs/REVIEW.md`), grade ≈4.3/5. ✅

- **P0.9 Toolchain refresh (2026-06-17)** — pnpm 9→11, turbo 2.3→2.9, TS 5.6→6.0, Next 16.1→16.2, React 19.2.7, Stripe 17→22, Supabase-js/ssr latest; `overrides`→`pnpm-workspace.yaml`, build-script `allowBuilds`; Turbopack font-fetch TLS fix; re-enabled Next `core-web-vitals` lint (ESLint pinned 9.x — its react plugin isn't ESLint-10 ready). Gate green. ✅

## 🟡 M1 — Walking pay path &nbsp;`milestone:M1`

Smallest slice that takes one real test charge end-to-end (solo Scan & Go). **No real card until this milestone's gate passes.**

- **P1.0 Schema reconciliation** — ✅ namespaced the session tables `qr_*` (was colliding with the **live delivery** `carts`/`orders`/`order_items`/`menu_items`); repointed pricing/menu at the real `menu_items` (**cents end-to-end** · `name_en`/`name_my` · normalized modifiers, intersected server-side); sourced `tax_category` via `mms_menu_category_tax`/`mms_menu_tax` (+ resolver); rewrote `mms_fulfill_order` to write `qr_*` in cents and reconcile vs `intent.amount`. Gems deferred (anon diner ↔ `loyalty_rewards.user_id NOT NULL`, M4). Apply on a Supabase branch (needs Pro). See `docs/DATA_RECONCILIATION.md`. ✅
- **P1.0a Backend infra** — 🟡 **dedicated QR Supabase project** created (`fasnpdhtvqtzjlvruqcu`, own org); cleared its template tables; applied a clean init schema to `supabase/migrations/` (catalog **owned here**, `tax_category` as a column, membership RLS) + a grant-lockdown migration; seeded the real 60-item menu (`supabase/seed.sql`); generated types wired into `@mms/db` (dropped the `as unknown` casts); `get_advisors` clean (only intentional exceptions). _Done since:_ **Zod** input layer (`@mms/db/schemas`, parsed at every action/route), `migrations-check` + `types-fresh` CI jobs, `supabase/config.toml` (anonymous sign-ins on + rate-limited; leaked-password protection is Pro-only, skipped). _Remaining:_ enable anon sign-ins on the **live** project (dashboard / `supabase config push`), env wiring (app → new project), a staging project for when QR goes live. See `docs/BACKEND_ARCHITECTURE.md`.
- **P1.1 Anonymous-auth session** — ✅ `AnonAuthGate` runs `signInAnonymously()` on load (SSR cookies via `@supabase/ssr`); `@mms/db/server` adds `serverClient(cookies)`; `POST /api/session` verifies the `Bearer` anon token (`getUser(token)`) and records `seat_id = auth.uid()` (idempotent, sets `host_seat`); `useAnonSession()` feeds the anon token to Realtime/Bearer callers. **Per-action authz landed here too** (RED-TEAM #2): one guard (`lib/authz.ts`) gates `addItem`/`setQty`/`applyPromo`/`scanAdd`/`create-intent` on membership + lock; `getCartTotals` moved to internal `lib/totals.ts` (no IDOR read). Closes REVIEW.md gate #3 + QA §C group-cart-auth. (Membership `is_member`/`is_host` RLS already shipped in the init schema.) ✅
- **P1.2 Cart create + actions authz** — ✅ `POST /api/session` find-or-creates the session's open cart and returns `cartId` (server-issued; the client never invents one); `useTableSession` (per-device QR identity) drives it; menu gets per-item `AddButton` + sticky `CartBar` via `TableCartProvider`; `addItem` **merges identical lines** (same item + normalized modifier set → qty bump, not a dup row); `getCartView` (member-gated) feeds the cart page + steppers/promo with re-fetched server totals (never client math). Actions authz was done in P1.1. _Follow-up:_ modifier-customization sheet (add currently sends the base item). ✅
- **P1.3 Payment Element** — ✅ two-step checkout (review + tip → pay): "Continue to payment" mints the intent via the member-gated `/api/stripe/create-intent`; `<Elements>` + `<PaymentElement>` mount on a stable `clientSecret` with appearance derived from `@mms/ui` tokens (light/Night); tip selector (v7.2 chips) → `tipRate`; `confirmPayment` → `/track` (renders the `redirect_status` confirmation). Apple/Google Pay via `automatic_payment_methods`. **Test mode only.** ✅
- **P1.4 Fulfillment** — ✅ webhook is signature-verified, idempotent on the PI id, **reconciles** `intent.amount` vs `getCartTotals` (409 on mismatch), and `mms_fulfill_order` snapshots the order in cents (landed in P1.0). **Hardened (this phase):** a failed `mms_fulfill_order` now returns 5xx so Stripe **redelivers** (was swallowed → 200 → charged-but-no-order); a `succeeded` intent missing `cartId` is logged. _Gem awarding deferred → M4_ (anon diner ↔ `loyalty_rewards.user_id NOT NULL`). ✅
- **P1.5 Track** — ✅ `/track` subscribes to **Realtime Postgres Changes** on the diner's own `qr_orders` row (keyed by the `payment_intent` Stripe appends to the return_url; authorized by the existing `qr_order_read` RLS) so the order appears live the moment the async webhook fulfills — no manual refresh (also closes the deferred processing-state polling). Status timeline (`Order placed → In the kitchen → Ready → Served`) built to the v7.2 `.tk` rail, tokens + a11y (`aria-current`, polite live region, reduced-motion). M1 has no kitchen actor → rests at "Order placed"; **S2's kitchen statuses ride the same subscription**. Migration `20260619000400` adds `qr_orders` to the realtime publication (no schema change). ✅
- **P1.6 Hardening** — ✅ **nonce-based CSP** via `apps/qr/proxy.ts` (Next 16's `middleware` rename): a fresh per-request nonce + `'strict-dynamic'` lets us **drop `script-src 'unsafe-inline'`** (the static CSP moved out of `next.config.ts`, which keeps the nonce-free headers); root layout is `force-dynamic` so the nonce reaches every page's framework scripts. **Env hardening:** fail-fast guards replace silent `process.env.X!` on the server secrets (`@mms/db/server.ts` URL/service-role/publishable + the Stripe webhook secret); `docs/ENV.md` documents the Vercel preview→prod matrix. Fixed-in-passing: `Permissions-Policy: camera=(self)` (the grocery scanner needs first-party camera; `camera=()` blocked it). **ESLint flat config + `packages/config`** already landed (M0·P0.9). _Remaining (infra, needs Min):_ set the Preview env vars (test Stripe keys + webhook secret) in Vercel. ✅

**Exit:** a Stripe **test** charge completes, fulfills idempotently, and shows in Track; Claude review + CI green; QA-checklist P0s ticked.

## ⬜ M2 — Tax, promos & scheduling &nbsp;`milestone:M2`

- **P2.1** Server-validated promo codes — ✅ `promo_codes` gains validity window + `min_subtotal_cents` + `per_session_limit` (+ `CHECK`s); `promo_redemptions`/`promo_attempts` ledgers (RLS default-deny); five service-role-only SECURITY DEFINER fns — `mms_promo_check` (apply gate: active + window + min + global/per-session caps → a stable reason enum), `mms_promo_discount` (single pricing source for `getCartTotals`), `mms_promo_attempt` (per-session rate-limit, anti-enumeration), `mms_promo_consume` (redemption at fulfillment, **soft cap**), and `mms_fulfill_order` now consuming the redemption. `applyPromo` returns a discriminated result (per-reason copy — Next redacts thrown errors in prod). Migration `20260620000000`. ✅
- **P2.2** Honest pickup scheduling — ✅ tunable `pickup_config` (hours/interval/capacity/lead/prep/hold); tz-aware `mms_pickup_slots` returns today's bookable slots + **remaining capacity counting paid orders AND live holds** (open carts actively holding the slot — so capacity is honest _during_ ordering, not only post-pay); `mms_set_pickup_slot` is race-safe (per-slot advisory lock) + status-atomic; `fire_at = slot − prep` stored as the **S2 KDS seam**; create-intent re-checks room at the pay boundary; `/track` echoes the slot as the ETA (no fabricated countdown); the v7.2 slot sheet + header chip; **next-day rollover** (slots span today + `horizon_days`, grouped Today/Tomorrow/weekday — an after-hours browser pre-orders for tomorrow). Migrations `20260620000100` + `20260620000200`. ✅ _(W5e closed the `/cart` gap: an **ASAP↔scheduled** choice at checkout (`PickupWhenChoice`) — ASAP snaps the earliest slot + fires now via `mms_pickup_asap`, still hours/capacity-gated; the menu no longer force-opens the slot sheet. Migration `20260722000000`.)_ ✅
- **P2.3** Grocery session/cart — ✅ Scan & Go now mints a **real server-issued session/cart** via `useTableSession("scango")` (the same anon-auth `table_sessions`/`session_members`/`qr_carts` + membership-authz the dine-in/pickup flows use), replacing the demo client-minted `crypto.randomUUID()` that `assertCartMember` rightly rejected — so `scanAdd` is authorized like every other mutation and the order carries to `/cart` + Stripe. **Name-search fallback** (`searchGroceryItems`, public-read `grocery_items`, debounced, available + non-weighed only): when a barcode won't scan or isn't in the catalog, the diner finds it by name and a tap adds it through the same authorized `scanAdd`. Fixed in passing: the scanner no longer tears down + restarts the camera on every render (memoized `onScan`), and one live region per view. ✅
- **P2.4** QBO sync of paid orders — ✅ _(code-complete + verified; off by default, first live post pending a QBO company + creds.)_ Each paid order posts to QuickBooks as a **Sales Receipt deposited to a Stripe _clearing_ account** (the two-ledger pattern: sales hit clearing on order, the Stripe payout clears it to bank). **Pure total-preserving mapper** (`lib/qbo/mapping.ts` — lines sum exactly to the charge or it throws; tax is an explicit line with `GlobalTaxCalculation:NotApplicable` so QBO's Automated Sales Tax can't override our category-aware figure); **fail-safe idempotent client** (`lib/qbo/client.ts`, a no-op unless `QBO_SYNC_ENABLED=true`); durable `qbo_sync_queue` ledger (migration `20260620000400`, RLS default-deny, service-role only). The webhook **enqueues + posts out-of-band in `after()`** so QuickBooks latency/outage never blocks the money path. Verified: mapper balances + throws on imbalance/missing-ref, RLS service-role-only on the live project, advisor-clean. See `docs/QBO_SYNC.md`. _Remaining (needs Min):_ connect a sandbox QBO company + set the refs/creds, flip the flag for the first post; refresh-token rotation + a cron drain are tracked follow-ups. ✅

**Exit:** mixed taxable/exempt carts reconcile to the cent; promos enforced server-side; pickup ETA truthful.

## ✅ M3 — Group cart (multi-device) &nbsp;`milestone:M3`

- **P3.1** Join flow: scan → session → guest list (presence) — ✅ a 2nd phone joins one dine-in cart via a table **sticker** (`?t=`) or the host's **server-issued invite code** (`?j=`, join-only — a wrong code 404s, never mints a phantom host-table); the `qr_code` doubles as the join key, find-or-join converges every phone on one cart, race-safe via a partial unique index (no split-brain, no types drift). Live **presence guest list — dine-in only** (RED-TEAM #3): stable-seat key (no ghosts), name sanitized on ingest, a join announced through the single live region, v7.2 party avatars + "party of N", inline retry on a failed mint. `setDisplayName` (member-authz'd, own-seat, Zod + column CHECK, no PII to PostHog). Schema-light: migration `20260620000500`. ✅
- **P3.2** Realtime broadcast of cart changes; server-authoritative merge (keyed React state, never an `innerHTML` rebuild) — ✅ `qr_carts`/`qr_cart_items` on the realtime publication (+ `replica identity full` for DELETE sync), a `useCartRealtime` Postgres-Changes hook (RLS-gated per-subscriber, door-agnostic like `/track`), consumer re-fetches `getCartView` (server-authoritative, keyed state); honest "[name] added [item]" peer announce through the single live region (self-filtered, no false attribution on qty/remove); `SUBSCRIBED` self-heal + `CHANNEL_ERROR` logging. Dine-in only. Migration `20260620000600` (no types drift). ✅
  - **P3.2-lock** cart-lock-at-pay (deferred from P1.3) — ✅ `create-intent` atomically locks the cart for the pay window so a peer can't mutate mid-checkout → webhook 409 / charged-no-order; `locked_at` (5-min TTL → abandoned pay-screen auto-releases) + `locked_by` (re-acquire by the same payer, scoped release); released on decline/Edit/TTL; effective-lock guard rejects every mutation; AddButton disabled + v7.2 lockbar. Migration `20260620000700` (types hand-edited). ✅ &nbsp;·&nbsp; _follow-up:_ grocery `scanAdd` keeps its plain insert (a barcode can't cast to the status-atomic RPC's `uuid` param); the in-SQL `status='open'` hardening for grocery needs the RPC param widened to `text` (near-unreachable today — grocery is solo).
- **P3.3a** Split-the-bill foundation (dine-in) — ✅ Even/By-person split UI on `/cart` + per-line **assignment**; **server-authoritative per-seat shares** (largest-remainder, Σ==total to the cent, promo+service+tax); **`canMutate(line_state, actor_role, isOwner)`** gate (host any line / guest own-only — cross-owner guard) enforced in `setQty` + `assignLine`; live across the table via the P3.2 sub; honest **reference** breakdown (order still paid in full at checkout). Schema-free. ✅
- **P3.3b** Split-tender (**Option A**, confirmed by UX research) — each guest **authorizes** their own server-derived share (N `capture_method:manual` PaymentIntents); **capture-all + fulfill the one order when the last share clears**; **cancel auths on abandon/decline** (no one charged for an incomplete order); a `qr_cart_shares` ledger. Weight tax by each seat's _taxable_ base + service by _net_ (not subtotal pro-rata). Pulls the **S4.3** seam forward per the milestone decision. ✅ _(share/line refunds deferred to **S4.3**, which owns line-level refunds — `charge.refunded` is an unhandled webhook event platform-wide, single-pay included.)_
- **P3.4** Abuse limits: join/mutation rate limits, session expiry/sweep, RLS membership tests, party-size caps. — ✅ generic per-**seat** rate limiter (`rate_events` + `mms_rate_limit`, count-first/self-GC/reject-without-record) on `/api/session` join (30/min → 429) + every cart mutation incl. both Stripe pay routes (120/min), **fail-open**; party cap **12** via an advisory-locked `session_members` `BEFORE INSERT` trigger (`mms_enforce_party_size`) + a friendly route 409 + cap-aware Invite UI; background `mms_sweep_expired_sessions()` on **pg_cron** (every 15 min, guarded so a local CI stack without pg_cron applies cleanly); RLS membership **negative tests** (`supabase/tests/rls_membership_test.sql`, wired into CI + verified live). Migration `20260621000000` applied to live, advisor-clean. Adversarial subagent **PASS**. **M3 complete.** ✅

**Exit:** two phones at one table order together; only members read/mutate; host lock holds; each guest can settle their own share.

## ⬜ M4 — Rewards & account &nbsp;`milestone:M4`

- **P4.1** Morning Star Rewards (QR-local; mirrors delivery's tiers/Stars so M5 unifies without a rename) — account upgrade (email OTP / Google, same anon uid), earn-on-fulfillment, tier ladder + Stars + reward wallet. ✅ (`docs/M4_DESIGN.md`; redemption + history → P4.2)
- **P4.2** Reward **redemption** ✅ · **order history** ✅ · **split-tender earn** ✅ (host-of-record earns the split order). Deferred w/ documented blockers (`docs/M4_DESIGN.md`): reorder ⬜ (lines store modifier _labels_ not _ids_ → can't re-price faithfully; needs option-id capture first) · settings theme/lang ⬜ (OS theme + bilingual menu already cover it; real lang = i18n initiative) · refund-recede ⬜ (blocked on S4.3 refund infra)
- **P4.3** Feedback + **ungated** review triage ✅ — post-order rating + comment on /track; the public Google link is offered to **every** rater (never gated by score); low ratings flagged for staff recovery on a manager `/staff/feedback` queue. (`docs/M4_DESIGN.md` R9/R10)

**Exit:** gems earned on QR orders appear in the shared ledger; reorder preserves modifiers.

## ⬜ M5 — QR learns from delivery (repos stay separate) &nbsp;`milestone:M5`

> **Reshaped 2026-06-24 (was "migrate delivery into the monorepo").** On review with Min we **changed
> direction**: the two apps stay **separate repos** (own deploys, own CI, own Supabase projects, the shared
> Stripe account) and the younger **QR** app instead **learns from** the mature, live **delivery** PWA —
> adopting its production-hardened mobile/iOS + a11y patterns, a motion/perf discipline layer, a reusable
> primitive component library (built to **QR's** tokens), and a contrast-audit test. Why: the monorepo's
> headline win (a shared `@mms/ui`) is unrealized while the apps run **different design lineages** (QR's tokens
> are the cleaner, AA-verified base — keep them); delivery's real value to QR is **craft + learnings**, a
> transfer that needs no repo merge; and the migration would **force-bump a live production app** (next/react/
> eslint/TS) — a regression surface not worth it. Full-repo co-location is **reconsidered at M6** if
> Terminal/kiosk need a shared runtime.
>
> **Full plan: [`docs/M5_DESIGN.md`](docs/M5_DESIGN.md)** + the transfer backlog
> [`docs/QR_FROM_DELIVERY.md`](docs/QR_FROM_DELIVERY.md). Topology unchanged: two DBs, **two repos**, one Stripe
> account. **Rewards unification stays post-M5 ("M5a") — two ledgers, surfaced honestly.**

- **P5.0** `@mms/db` generic client factory (#79) — retained as a clean internal QR refactor (zero behavior
  change); its "multi-app prep" rationale is moot now, but reverting is pure churn. ✅
- **P5.1** Reshape M5 → transfer workstream + land the prioritized backlog (`docs/QR_FROM_DELIVERY.md`),
  synthesized from two grounded audits (delivery wisdom · QR posture/gaps). _(docs)_ ⬜
- **P5.2** iOS / mobile hardening sweep — safe-area **position** insets, `--sheet-max-h` dvh sheets, 16px
  input-zoom audit, nested-scroll wheel-block, breakpoint-coupled overlay anchors. ✅
- **P5.3** Motion discipline + perf budget — `@mms/ui` foundation primitives (`useAnimationPreference` JS gate,
  `useInView` offscreen-pause, `useDeviceTier`) + `docs/MOTION_AND_PERF.md` (the mobile GPU/blur budget rules);
  `/track` pulse wired as the canonical offscreen-pause consumer. `useRipple`/`useTilt` deferred to P5.4 (need
  component consumers). ✅
- **P5.4** Primitive library in `@mms/ui` (QR tokens; delivery APIs as reference), shipped incrementally:
  - **P5.4a** ✅ — `@mms/ui` eslint/`lint` (+`react-hooks`) · `Badge` (dedups `RoleBadge`+`FloorStatusChip`) ·
    `EmptyState` (dedups Kds/Approvals boards).
  - **P5.4b** ✅ — `Avatar` (GuestList + SplitSection) + `tabChip`→`Badge` (floor pills unified) [b-1];
    `Skeleton` (PickupSlotSheet + SettlementBoard) + `Stepper` (StaffLineEditor + Checkout — **2** drifted
    consumers, not 1) [b-2]. (Skeleton fast-follow consumers: SharePay, MergeTableButton.)
  - **P5.4c** ✅ — `Card` primitive — **no variants** (a sweep overturned the planned elevated/outlined/filled
    taxonomy: QR's 25 `.card` sites are surface-uniform; the only fork was accidental shadow-drift in 10 inline
    copies). Shipped a polymorphic `<Card>` applying `.card` + migrated the 10 drifters (9 gain the canonical
    shadow). Tinted status surfaces → future `Callout`.
  - **Deferred (no QR consumer):** `Tooltip`, `Drawer`, tilt; `Toast` + ripple only if a real consumer emerges. ⬜
- **P5.5** ✅ Contrast-audit test + QR test infra — Vitest 4 in `packages/ui` + `apps/qr`, turbo `test` gate
  uncommented in CI; contrast-audit ported to `packages/ui` (parses `tokens.css` at test time — no hardcoded
  fixtures — + negative anti-regression guards) + `avatars.test.ts`. All combos clear AA both themes (the
  P5.4b-1 seat-hue sub-AA worry was a phantom — all 5 pass). 37 tests.
- **P5.6** PWA / offline _(deferred / optional)_ — Serwist SW + manifest + offline cart + chunk-load reload
  boundary. Low priority for dine-in. ⬜

**Exit:** QR has absorbed delivery's mobile/a11y/motion hardening + a reusable primitive layer + a
contrast-regression guard; both apps remain **independent repos** sharing only the Stripe account; co-location
reconsidered at M6.

> **Post-M5 audit (2026-06-29):** deep cross-slice adversarial audit — verdict **sound** (zero money/auth/RLS
> findings). Fixed the primitive-migration tail (EmptyState→Card, FloorBoard→EmptyState, SettlementBoard→Avatar)
>
> - corrected the false dark-mode doc claim. Tracked-deferred: **dark-mode activation is dead** (`.dark` never
>   set — now Richness-track R2), the live-region-at-the-seams a11y items, chips→Badge, split-avatar dim.

## 🎨 Richness track (R1–R9) — world-class UI/UX &nbsp;`next`

Bring delivery's **deep textures, layered surfaces, micro-interactions, and motion** to QR — built on QR's
clean token base, within the mobile-GPU/reduced-motion/AA guardrails M5 established. **The next initiative**
(distinct from the 2027 M6 kiosk milestone below). Full spec: **[`docs/RICHNESS_PLAN.md`](docs/RICHNESS_PLAN.md)**.

- **Foundations:** **R1 ✅** tokens + texture system (motion/depth tokens both themes + gradient-masked
  `.tex-*`/opaque-mobile `.surface-*` utilities + `pop`/`steam`) · **R2 ✅** dark-mode activation (nonce
  blocking inline script + `ThemeSync` live OS-flip + fixed the latent dark bugs the audit found:
  `--bg`→`--sf` ×6, hardcoded shadow→`--sh-md`, SharePay→shared appearance) · **R3 ✅** framer-motion adopted
  (root `LazyMotion domAnimation strict`; `domMax` deferred to R5 sheets) · **R4 ✅** `interactions.ts`
  (tilt/magnetic/parallax/ripple) ported → `@mms/ui`; first consumer = `AddButton` press-spring + ripple.
- **Primitive richness (R5 ✅ complete):** **R5a ✅** Card `textured`/`interactive` props (CSS-only, Server-safe) + masked-dotgrid `.card-textured` on menu rows · `.card-interactive` + gradient tile + stagger on ModeCard · Stepper count-bounce + button press. **R5b ✅** `Sheet` swipe-to-close — first `domMax` consumer (`DomMaxProvider` + handle-initiated `useDragControls` drag, body-scroll-safe). **R5c ✅** menu Add → quantity-stepper morph (`.mms-qty-stepper`; `+`=`add`, `−`=`setItemQty`/`qty<=0` removes) **in every mode**, enabled by **per-seat group lines** (`insertOrIncLine` merges by `by_seat` → each diner owns their own line; pre-attributes the split; no schema change). Live-sold-out + own-line/default-fulfillment match, settlement-freeze gate, focus-on-remove.
- **Signature moments:** R6 menu — **R6a ✅** browse layer (search · scroll-spy category jump-nav · fail-safe dietary filters · blur-up images · real-tag badges); **R6b ✅** item detail sheet (eager modifiers radio/checkbox · client-preview/server-final live price · required-modifier Choose guard · hardcoded "goes well with" upsell · blur-up photo-hero). · R7 checkout + pay-success — **R7a ✅** pay-success celebration (draw-on checkmark · bespoke confetti · "+N gems" pill · haptic, on `/track`) + NumberFlow money-roll (CartBar + checkout total); **R7b ✅** checkout review/pay polish (tip-chip + CTA press+glow · `card-textured` cart lines · hero-total summary · keyed CSS step-transition, Stripe-iframe-safe). · **R8 ✅** real Stars on /track + the rewards hub (retires the `gems=round` placeholder for real `mms_rewards_summary` Stars · "+N Star earned" pill gated on real `earned_by` attribution · SVG Stars ring · `NumberFlow` stars/spend · localStorage-deduped tier-up · honest "How it works" replacing the prototype's fictional perks) · R9 staff floor + homepage (**full enrichment** — owner overrode the plan's "restrained" for ops surfaces): **R9a ✅** staff-board live-notice (`LiveMoney` roll+directional-flash · shared `StaggerList` card-enter/stagger/exit · FloorBoard status-diff one-shot ring · `interactive`+`textured` table cards · `card-textured`+`.staff-btn` across KDS/Expo/Approvals/Orders · event-driven only, one live region/board) · **R9b ✅** maximal homepage hero (`HomeHero`: radial glow + draw-on SVG ring + `.mms-steam` wisps + device-tier-gated multi-layer pointer/gyro parallax · masked dot backdrop · finished ModeCard stagger — no blur, reduced-motion-gated).
- **Calls (decided in the plan):** adopt framer-motion lazily; dark via a nonce-carrying `prefers-color-scheme`
  inline script (not next-themes); `NumberFlow` (already in `@mms/ui`) over delivery's `RollingDigits`; rebuild
  textures on QR tokens, never import delivery's 34KB `--hero-*` system.

## 🧭 Journey track (J0–J6) — paths over screens &nbsp;`next`

The layer above Richness: every _screen_ now clears the rubric bar, but the _path_ between them was never
designed — hard cuts between routes, undesigned arrival/wait/goodbye, catalog-not-guided deciding, zero
return-visit memory. This track choreographs the surfaces we already have; one moment per PR, real data
only. Full spec: **[`docs/JOURNEY_PLAN.md`](docs/JOURNEY_PLAN.md)**.

- **J0 ✅** Measure the path (2026-07-11) — journey axes + scored baseline in `RUBRIC.md` (dine-in 2.7 ·
  pickup 2.9 · grocery 3.1 vs the 4.3 bar; J-A/D/E/F are the gap, J-G already world-class); PostHog
  **"J0 · Journey baseline"** dashboard (pinned) — four uid-joined funnels from `session_created` (mode-
  filtered) through add/send to `payment_succeeded`, + headline **time-to-first-add** (median). Visual
  walkthrough reel deferred to a browser-egress environment (sandbox Chromium can't reach the preview).
- **J1 ✅** Continuity engine (2026-07-11) — directional route grammar (`next-view-transitions` on stable
  React; forward/back drift, chrome pinned via its own `view-transition-name`, RM off-switch) + two live
  shared cuts: CartBar total → checkout hero total, header order pill → /track status chip; staggers once
  per session (`SurfaceMemory`). Honest cut revision: checkout→track is a Stripe full-page redirect (no
  client cut possible); item→sheet morph deferred to J2 (would double-animate against the framer sheet). ⬜→✅
- **J2 ✅** Arrival + guided start (2026-07-11) — bilingual place-setting beat (`ArrivalBeat`: မင်္ဂလာပါ +
  live-presence party copy, once per session via J1's SurfaceMemory); "Start here" band (`StartHereBand`,
  top-6 rail, hidden while searching/filtering); `popular` badge upgraded to a data-backed **Table
  favorite** (`mostLoved.ts`: counts-only aggregate over paid orders, ≥2 distinct orders/60d, cached 1h,
  honest fallback to the manual tag while history is thin). ⬜→✅
- **J3 ✅** The wait, designed (2026-07-11) — `TableTimeline` strip (menu header + cart review) narrating
  REAL kitchen taps (`fired → in_progress → served`; headline prioritizes the live tap; a qty-weighted
  counts line); right-moment lines (dessert/tea on all-served; a client-observed 20-min settle pointer);
  visibility refetch on BOTH cart surfaces (provider + checkout — poor-wifi/pickup freshness); honest
  pickup slot countdown on /track (arithmetic on the diner's own slot, "any minute now" once due,
  dropped when expo says ready or ~15 min past an un-actioned slot). **"I'm here" DEFERRED
  honestly:** the floor "channel" is postgres_changes (read-only per-subscriber RLS) — a diner→staff ping
  needs a `realtime.messages` is_staff broadcast policy or an orders column, i.e. the J5 migration window. ⬜→✅
- **J4 ✅** Settle & goodbye (2026-07-11) — `GoodbyeBeat` on /track (bilingual farewell + one rewards
  door for all; the earner's `StarsRing` drawn to the post-order cycle — the Star visibly arrives —
  with device-honest "with your rewards" copy); the receipt→"Your orders" shared cut (`.vt-receipt`,
  earner-gated so the metaphor is never false); one food-in-hand clock for goodbye + review ask
  (pickup/to-go at picked-up, pure grocery/dine-in immediately — line fulfillments now read
  client-side); the SettlementBoard's table-wide "everyone's paid 🎉" breath before the receipt
  redirect (one status region; abort can't clobber it; focus parked; dead cancel hidden). ⬜→✅
- **J5 ✅** Recognition (2026-07-12) — the track's one migration (`qr_favorites` own-rows RLS +
  `qr_orders.arrived_at`, applied to live, types regenerated); welcome-back in the arrival beat
  (upgraded name / "N orders with us this month" at N≥2 — orders, never invented "visits"); item-sheet
  heart + "Your favorites" rail (replaces start-here once hearts exist); `reorderOrder` on the add
  path's own primitives (earner-gated, every price re-derived today, per-item honest skips; modified
  lines return as base + "re-choose", qty resets to one) via /account "Order this again"; the J3
  "I'm here" ping shipped (member-gated `arrived_at` stamp → expo "Here now" chip on the existing
  floor realtime); `posthog.identify` decided NO (no identity bridging without a consent surface). ⬜→✅
- **J6 ✅** Mode tempo (2026-07-12) — **the track closes.** Grocery: the giant running total (40px
  rolling figure, display of the same client sum the CTA carries — charge stays server-derived) + the
  exit pass on /track for pure grocery baskets (big uuid-tail code, "✓ Paid — you're all set"),
  REPLACING the kitchen step rail that was false theater for self-scanned items (the togo_status
  initializer covers grocery, so it lit "Cooking" for a jar of pickled tea); mixed orders keep the rail.
  Pickup: the audit found the path already at floor+1 — the one further cut (defaulting the slot)
  REJECTED on honesty (silently commits a time the diner didn't pick; documented, not built). Dine-in:
  "Next round's with the kitchen" when dishes fire after others served — waves answered per-table by
  the real line states. Self-scored track close in JOURNEY_PLAN (dine-in 2.7→≈4.3, pickup 2.9→≈4.3,
  grocery 3.1→≈4.4; the funnels decide whether it's met in the room). ⬜→✅

### 🚪 Journey II track — one house, three doors ([`docs/JOURNEY2_PLAN.md`](docs/JOURNEY2_PLAN.md))

Owner findings after walking the shipped J-track: the HOUSE needs restructuring, not the hallways.
Decisions locked 2026-07-12 (recommendation-led): 3 doors · table registry · rewards continuity (all
three) · orders tray. Same working rules as the J-track (one phase = one PR, adversarial pre-PR +
pre-merge, per-PR merge go).

- **K0** Track spine — plan doc + `door` property on session_created + door-keyed funnels. ✅ (plan
  #122; `door` shipped with K5 — grocery emits it; menu-page wiring lands with the K1 doors;
  funnel re-pin at K6)
- **K1** Three doors — Dine-in · To-go · Grocery; "Scan & Go" retired diner-facing; no mode migration
  (presentation moves, plumbing stays); `?door=` threaded to the session mint (K0 menu wiring). ✅
  _(W5f: To-go collapsed from a Now/Schedule disclosure to ONE door → pickup menu; the now-vs-scheduled
  choice moved to checkout (W5e's `PickupWhenChoice`) — the door fork predated pickup-ASAP and became
  redundant. The "Now → scango" food path was dropped; scango stays for the Grocery scan-and-go door.)_
- **K2** Table registry — `qr_tables` (1–10, sticker-mapped, RLS-locked) + session `table_number` +
  denormalized `qr_orders.table_number`; picker (`/dine-in`) with honest occupancy (open→claim,
  seated→party-code join, per owner's call); mint resolves number→token server-side + race guards;
  the number flows to arrival/guest-list/invite/settle/floor/KDS/expo/track/receipt. ✅
- **K3a** Rewards presence — persistent tier-tinted wallet chip (menu header + checkout) for signed-in
  diners; AccountStatus (identity + honest sign-out) replaces the upgrade pitch when signed in; honest
  post-pay copy ("saved to your account" only when upgraded). ✅
- **K3b** Stars merge on sign-in — server-verified single-use merge token (survives the PKCE
  redirect); the coupon-reconciliation migration (move + contiguous re-index so the coupon ROWS ARE
  the watermark → merged orders can never double-mint, + a durable identity-redirect for a late
  webhook payment); a celebratory merge beat on /account; the track's deepest review, its own PR.
  Proven with a BEGIN/ROLLBACK invariant test before shipping. ✅
- **K4** Orders tray — `getMyLiveOrders()` (uid-scoped, 12h-bounded, **session-bounded for every kind**
  so the tray only shows orders /track can still read) + the header pill grows a count badge that opens
  a tray sheet (one row per in-flight order → its /track) + /account "Today". No new realtime channels
  (refetch on open/visibility). ✅
- **K5** Grocery grown up (PULLED FIRST — fixes a live money-display bug: a refresh hides items the
  server cart will still charge) — server-hydrated product list (photos, steppers on cart-line ids
  via existing setQty). Build order: K0 → K5 → K1 → K2 → K3a → K3b → K4 → K6. ✅
- **K6** Track close — the door dimension re-pins the J0 funnels by `door` (a breakdown on the existing
  `session_created` insights, no new events); self-scored re-score of the three door-paths on the J-axes
  (**dine-in / pickup / grocery all ≈4.5**, up from the J6 close's ≈4.3/4.3/4.4 — J-B/J-C/J-F carried the
  K-lift); QA sweep of every K-surface (all closed in the #123–128 adversarial passes). Honest: the door
  funnels are wired + pinned but await real diner traffic to read (no fabricated screenshots). **Journey
  II track CLOSED.** ✅

## 🏭 W-track — Production ("the working house") &nbsp;`next`

Owner brief 2026-07-16: _"improving but nowhere near production level polish / world-class design."_
Grounded in an 8-agent audit+benchmark pass (4 code audits · 4 world-class benchmarks); the honest diagnosis
of why the ≈4.5 self-scores missed the felt gap + the phased close across four fronts. **Plan-of-record:
[`docs/PRODUCTION_PLAN.md`](docs/PRODUCTION_PLAN.md).** Pulls M6·P6.1's kiosk shell forward; Terminal/EBT
stay hardware/FNS-gated below.

- **W0** Truth & the bar — `docs/OPEN-ITEMS.md` single registry (swept from HANDOFF/HOLISTIC/M6/plan; joins the "Gate before done" checklist) · **O-axes** ops scorecard + the grocery browse/exit widening in `RUBRIC.md` · design sources for the unprototyped surfaces: `SPEC-KDS.md` · `SPEC-GROCERY.md` · `SPEC-KIOSK.md` (benchmark-grounded, linked from context INDEX). ✅
- **W1** Stop the bleeding — ✅ **W1a** grocery money (service-charge base excludes grocery lines, discount pro-rated like tax; tip forced 0 on pure-grocery server-side; Checkout hides tip group + SB-1524 row honestly) + Q9 payer-uid idempotency · ✅ **W1b** Q4 split dead-end (extend-only `settle_at` refresh on payer activity + fully-covered capture relaxation + the $0-share-settles-last trigger) · Q6 seven-mutation rate-limit sweep · Q7 PIN-lockout DoS pre-check (approver pre-flight + per-caller STEPUP*RATE bucket) · ✅ **W1c** /track refund arm (honest terminal state) + Q11 (`requireStaffPage()` on all 10 staff pages · CSP Supabase-host pinning + prefetch fallback CSP · `getFeedbackState` earner-scoping). \_Still open from the tail: Q5 (M1 in OPEN-ITEMS).* ✅
- **W2** Finish the flagship — 🚧 _foundation + money-path craft shipped_ (this PR): ✅ designed missing-photo placeholder (`PhotoPlaceholder` + `BlurUpImage` fallback — never a broken tile) · ✅ SVG icon set retiring emoji chrome (`@mms/ui` `<Icon>` lucide set, diner path; staff deferred) · ✅ `loading.tsx` skeletons (menu/dine-in/track/grocery) + `error.tsx` chunk-reload guard · ✅ order code on the food /track receipt · ✅ **W2d** wallet-first Express Checkout + custom tip (server-confirmed rate) + fees-before-tip + amount-on-CTA + designed empty-cart (server-authoritative throughout; needs the Stripe wallet-domain registration to show wallets — C10). **Remaining:** real photography (C5) + bucket → QR project · the ~360-`fontSize` type-scale sweep + lint ban · itemized + email receipt + print. ⬜
- **W3** The kitchen you can trust — route pickup/scango into the KDS + HELD scheduled cards (`mms_fire_pending_food` all-modes; the paid-cart bump fix) · kitchen-scale ticket type (`--kfs-*` tier, Night default, full-bleed) + 2-threshold aging (`mms_kds_config`) + chime/re-chime + all-day rail + fixed grid/paging "+N more" · ticket bump + 6s undo + 2-min recall (SQL-enforced) · notes/allergy channel (bounded `notes`, never merges) · wake lock + honest 401/lock redirects · order-ready TV `/board` (sanitized device-token poll) + first-name capture at takeout checkout. Migration `20260716000000`, verified behaviorally on the local stack. ✅
- **W4** The market grows up — **W4a+W4b ✅ (2026-07-17):** 395-SKU real catalog from the owner price lists (aisle categories · brand · name_my · sizes · romanization synonyms; store-internal EAN-13s pending real UPCs; live import gated on price confirmation) + Browse|Scan hybrid over one catalog (aisle tiles, bilingual unit-priced cards, one-tap add on the scanAdd path, pg_trgm search, EBT subtotal). **W4e ✅ (2026-07-18):** honest "Compare at" Sale layer (real-competitor-grounded compare-at, 313/396 on sale 11–40%, charged price unchanged). **Still ⬜:** photos (C5/C6) · W4c scanner craft (haptic/flash/torch/leave-frame dedupe/failure ladder) · W4d QR exit pass + staff scan view + offline pass + weighed type-2 UPCs.
- **W5** One tongue — app-wide EN↔MY toggle · money-path localization (~20 moments) · modifier/category `name_my`. ⬜ _(data head-start shipped in the W5c depth slice: `description_my` 60/60 + modifier `name_my` 12 groups/25 options, rendered in the item sheet — the toggle + money-path moments remain.)_
- **W6** Front of house — staff register first (walk-up/phone orders can't be entered today; search + modifiers + day cash summary) · kiosk shell mode (attract/idle-reset/EN-MY tiles/HID scan/one upsell) · Terminal stays M6·P6.2. ⬜
- **W7** The shell — brand asset kit 🚧 (OG/twitter · `metadataBase` · apple-touch · `manifest` + maskable; `--star` token a follow-up) · Serwist SW + offline banner + grocery scan queue + chunk-reload boundary ⬜
- **W8** Proof — the money-path test harness. 🚧 **W8a–W8c shipped (2026-07-31)**: the pure `computeTotals` seam (differential-tested at 200k baskets, 0 divergences) + 7 charge invariants (mutation-tested, 6/6 breakages caught) · TS↔SQL tax parity pinned from both sides (4/4 drift drills run for real against Postgres 16) · the 50-cell `canMutateLine` matrix · `allocate`'s sum invariant · CI orphan-suite guard + globbed SQL tests with a count floor. 153 tests / 8 files, up from 35 / 5. **W8d** (pickup grid — SQL, not TS: `lib/pickup.ts` has zero arithmetic) and **W8e** remain. **Plan-of-record: [`docs/W8_PLAN.md`](docs/W8_PLAN.md).** A 2026-07-31 audit found **5 test files in the monorepo and zero on money/auth/journey** (`totals.ts`/`tax.ts`/`cart.ts`/`split*.ts`/`pickup.ts`/`authz.ts`/`permissions.ts` all uncovered; no Playwright, no `e2e/`) — every validation so far has been diff-review + manual smoke, which is exactly how the W5c over-charge nearly shipped. Slices: **W8a** pure `computeTotals` seam + the 7 charge invariants (+ M6/M7 pins) · **W8b** tax TS↔SQL parity in the `migrations-check` job (the "keep them in sync" rule, enforced) · **W8c** split cent-reconcile + the `canMutateLine` state×role matrix (+ M11 pin) · **W8d** pickup slot-grid regression pins · **W8e** journey smoke (recommended **deferred** — needs a staging project; preview/prod share one QR project on live Stripe keys). **W8 changes no charged amount.** ⬜

- **W9** Journeys that finish — the happy-path + craft close. **Plan-of-record: [`docs/W9_PLAN.md`](docs/W9_PLAN.md)** (a 14-agent audit: 6 journey walkers + 3 craft lenses → triage → 3 adversarial verifiers; **84 raw → 32 deduped → 24 CONFIRMED, 0 refuted**). Verdict: the money machinery survived adversarial reading intact, but **not one diner journey finishes end to end**. The theme: _the app already computed the answer and drops it at the last hop_ — `view.locked` never reaches `<Checkout>`, `loading` is on the cart context with zero consumers, `error` isn't destructured from the rewards RPC, `notes` isn't in reorder's SELECT, `?mode=` isn't on six `/menu` links. Slices: 🚧 **W9a** mode identity scan→reorder · **W9b** every dead control says why (lock · settle · mint · slot-load states) · **W9c** your paid order stays yours (post-pay reachability + honest history) · **W9d** the market reads like a market · **W9e** chrome that stays where it belongs (safe-area · sheet bounds · sticky exit). ⬜

**Order:** W0 → W1 → W3 → W2 → W7 → W4 → W5 → **W9a → W8 → W6** (photography + SKU data sprints start now in parallel —
[`docs/PRODUCTION_PLAN.md`](docs/PRODUCTION_PLAN.md) §5). **Exit:** every surface ≥4.3 on its applicable
scorecard **scored from real-device screenshots with the owner's felt-quality go**, per-front closing
re-scores like J6/K6.

## ⏸ M6 — Kiosk · Terminal · EBT (2027) &nbsp;`milestone:M6`

**Design of record: [`docs/M6_DESIGN.md`](docs/M6_DESIGN.md)** — per-phase plan grounded in the S4.3c EBT
seam; the critical path is **FNS retailer authorization** (months), so most of M6 is gated on real-world
prerequisites, not code. Distinct from the 🎨 Richness track above (which runs first).

- **P6.1** Kiosk shell + handheld HID scanner (no code change to grocery flow). ⬜
- **P6.2** Stripe **Terminal** (server-driven, S700) for in-person card. ⬜
- **P6.3** **EBT/SNAP** via Forage + FNS authorization (50%-rule → likely separate FNS firm); weighed-produce entry. ⏸ 2027

**Exit:** in-person card at a kiosk; EBT eligible items checkout (post-authorization).

---

## 🧩 Service-model track (dine-in full service) &nbsp;`milestone:S1…S4`

The full-service layer over the guest self-serve core: **staff/floor, line authority, tabs, and the unified basket** from [`docs/context/ORDER-MODEL.md`](docs/context/ORDER-MODEL.md). The spine is shared — one **table-owned order ledger** (M1) — so these _extend_ the app, they don't fork it. An `S` track (not `M7+`) so the existing numbering/labels stay put; **milestone number ≠ build order** (see the interleave at the end).

**Touch-points — build these M-phases with the S-track in mind:**

- **M3.3 `canMutate`** — give the host-lock the **state × role** signature (`canMutate(line_state, actor_role)`) so S2's post-fire locks extend it rather than refactor it.
- **M2.2 pickup fire-time** — make it the **same** fire/KDS mechanism S2 introduces; don't grow a second timer.
- **M6.3 EBT** — consumes S4's **split-tender seam** (a payment over a line subset).

### ✅ S1 — Staff & floor &nbsp;`milestone:S1`

The door for humans; the single-source-of-truth across channels. **Dep:** M1 (ledger) · M3 (table session/presence).

- **S1.1** Staff auth + **roles** (server / manager / owner), distinct from anon diners; RLS so staff read/write **any** table session, diners only their own. 🟡 _S1.1a shipped:_ magic-link/OTP auth + `staff` roles + `is_staff()` additive RLS (read-any) + owner provisioning at `/staff/team`. _S1.1b shipped:_ shared-tablet **PIN** fast-path — per-person bcrypt hash in a service-role-only `staff_pins` table, atomic `mms_staff_verify_pin` with 5-try/15-min lockout (the SAME primitive S2's manager step-up reuses), rotatable self-service at `/staff/profile`, and a "lock the console / unlock with PIN" affordance (`/staff/lock`).
- **S1.2** **Floor view** — legible per-table state (live cart? seats? last activity?) on a staff device. ✅ Live `/staff` floor (Postgres-Changes via the S1.1a `is_staff()` RLS — no `realtime.messages` change; that's S2 broadcast) of every active table — party, status (seated/ordering/paying/splitting/paid), running pre-tax subtotal or paid total, last activity; read-only per-table drill-down at `/staff/table/[id]` (the cart lines + party); and a guarded staff **"Clear table"** turnover (refuses mid-payment incl. a captured split share; logged). Migration `20260621140000` (publication add).
- **S1.3** **Staff write** to a table order (order _for_ a guest — "browse on phone, pay a human" closes here; cash is first-class). ✅ Staff edit a table's open cart from the drill-down — **add items** (`/staff/table/[id]/add`, the same public catalog, server-re-priced), **qty steppers / remove** (staff have authority over any line) — and **settle in cash** (`mms_fulfill_cash_order`: idempotent on `cart_id`, atomic open→paid flip, subtotal-reconcile against the single tax engine; `tip=0` off-system, SB-1524 service charge still applied). Server-authoritative pricing single-sourced (`lib/order-lines.ts`, shared with the diner path); the shared payment mutex (`lib/pay-guard.ts`) refuses write/settle/clear while a card payment or split is in flight. Migration `20260621150000` (`qr_orders.tender`/`cart_id`/`settled_by`).
- **S1.4** **Soft convergence** — ✅ **one-tap merge** of two table orders (`MergeTableButton` → `mergeTables` → atomic `mms_merge_table_orders`): folds a source table's open order into another (re-parents **already-server-priced** lines — bump-identical-or-re-parent so no units drop; `by_seat=null`), then closes the source; **any active staff**, logged (`staff_merge_tables`); refuses a closed/paid/cross-mode target or either side mid-payment (shared `pay-guard`). **Warn on divergence** is the explicit pick-and-confirm tool over the floor's legibility (the sticker `qr_code` is unique per active session, so two-labels-one-table isn't auto-detectable — no fabricated alarm). **Session expiry** already covered (`mms_sweep_expired_sessions` pg_cron + `expires_at` filter + sliding renewal, P3.4); staff **"clear table"** turnover shipped in S1.2. Migration `20260621160000`. ✅

**Exit:** a server can find any table, see/extend its cart, settle it (incl. cash), and a double-order is a one-tap merge. ✅ _Unlocks all four low-tech fallbacks._

### ⬜ S2 — Line lifecycle & authority &nbsp;`milestone:S2`

What lets the kitchen trust the screen + gives loss-controlled undo. **Dep:** S1 (staff roles) · a KDS fire signal. **Pre-build adversarial design review + hardening + PR slices: [`docs/S2_DESIGN.md`](docs/S2_DESIGN.md).**

- **S2.1** Line-state machine **draft → fired → in-progress → served → settled** + KDS fire/bump; grocery lines lock at **payment**, not fire. ✅ _**S2.1a + S2.1b shipped.** S2.1a: `qr_cart_items.state` (backfilled `draft`) + atomic legal-edge RPC `mms_line_transition` + **`canMutateLine` v2** (staff first-class; diner own-draft-only). S2.1b: `qr_cart_items.fire_at` (the unified timer) + `mms_fire_cart` (atomic `draft→fired`+`fire_at=now()`, dine-in-only — grocery/pickup/non-open all 0) + **KDS console** `/staff/kitchen` (live fire queue + two-stage Start→Ready bump on `postgres_changes`) + diner host & staff **Send to kitchen**. Migrations `20260622030000`, `20260622040000`. **S2.2 next:** post-fire "Ask server" client disable + the ~10s server-clocked undo grace._ &nbsp;Design: _Lives on `qr_cart_items` (PRE-settlement — the open cart is the table order until settle), not `qr_orders`. Transitions = atomic status-guarded RPC (`mms_line_transition`, legal-edge graph in SQL, parent-cart-`open` guard); **`canMutateLine` gains staff as a first-class actor** (post-fire = staff-only — the current `"host"` placeholder is a diner role, not staff). KDS v1 on `postgres_changes` (no broadcast); **unify the existing `fire_at`** (dine-in fires now, pickup `slot−prep`)._
- **S2.2** Post-fire edit rights — customer "Remove" becomes **"Ask server"**; **10s** **undo** grace before the ticket hits the KDS; enforced server-side via `canMutate(line_state, actor_role)`. ✅ _**Shipped.** `mms_fire_cart` stamps `fire_at = now()+10s`; the KDS already pulls only `fire_at ≤ now`, so undo within grace is a clean `fired→draft` the kitchen never saw; after, removal routes through a void (S2.3). **`mms_undo_fire`** reverses only the **latest in-grace batch** (`fire_at = max(in-grace)`, server-clocked, cart-open+dine-in guarded) — matches the "Undo (Ns)" countdown, never claws back an earlier send. `getCartView` threads the real `state`/`fire_at` into `CartItem`; a fired line shows a state chip ("Ask a server") instead of a stepper (`canMutateLine` keys on real state — fixes the solo-dine-in gap). Migration `20260622050000`._
- **S2.3** **Voids/comps — loss-gated:** uncooked = server-solo + reason; cooked / money-out refund = **manager-PIN step-up** (per-person, server-verified, rate-limited — reuses `mms_staff_verify_pin`); two-party audit. ✅ _**Shipped.** `mms_void_line` derives the gate SERVER-side from the line's state + value: a `fired`-but-uncooked under-ceiling void is server-solo + reason; a cooked (`in_progress`/`served`) line, any comp (giveaway), or a value over the `$20` ceiling (`mms_loss_config`) needs a manager PIN (the server taps the manager's name → PIN via `mms_staff_verify_pin`; a `server`-role or self approver is rejected — re-checked in SQL). The first **durable, append-only `mms_approvals` ledger** records initiator + approver + line + reason + amount + cooked, written in the SAME txn as the flip (no audit ⇒ no void). A voided/comped line is charged **$0 everywhere** (getCartTotals + both promo RPCs + the cash reconcile + all three order-snapshot copies exclude `state='voided' OR comped`); the diner cart shows a "Removed"/"Comped" chip, split shares exclude them. Staff void/comp from the drill-down (`LossActionSheet`), refused mid-payment. Refund of an **already-captured** line is the **S4.3** seam (`charge.refunded` unhandled today). Migration `20260622060000`._
- **S2.4** **Approvals primitive** (`request → notify → approve/deny → audit`), void as consumer #1. ✅ _**Shipped.** `mms_request_approval` creates a **default-safe `pending`** request without touching the line (still charged, food not un-fired); `mms_resolve_approval` is the manager's decision — approve applies the recorded void/comp + flips `approved`, deny flips `denied` & leaves the line live; resolves once (idempotent on `pending`), approver must be an active `manager`/`owner` ≠ the requester (re-checked in SQL). Manager-gated live `/staff/approvals` queue (polled — the audit table is owner-read RLS, off realtime) with Approve/Deny via the manager-PIN step-up; the `LossActionSheet` gains a "Request approval" path; the drill-down shows "Approval requested". Owner remote-approve (push/SMS) stays deferred — the `pending → approved/denied` states make it a later notify-add, not a refactor. Migration `20260622080000`._

**Exit:** a fired ticket can't be silently mutated by a guest; a cooked-item comp needs manager-PIN (owner remote-approve is the deferred follow-up); every void is two-party logged in a durable audit.

### ✅ S3 — Tabs (deferred settlement) &nbsp;`milestone:S3`

"Keep the tab open" — the table order settled at close. **Dep:** S1 (staff close) · M1 (ledger) · reuses S2's approvals for after-hours closes.

- **S3.1** **Trust tab** (default) — accumulate, settle at close with any tender; **tip on the final total**. ✅ (staff + diner open · floor legibility · close reuses the existing cash/card tenders)
- **S3.2** **Secure tab** — SetupIntent card at open _or attached mid-tab_, off-session charge at close; validate at open; handle close-decline. ✅ (tokens in a service-role sidecar off realtime · off-session close reuses the M1 fulfill webhook · no added tip off-session)
- **S3.3** **Server-discretion** gating — courtesy framing + a light **nudge** on large/new tables + a **silent ceiling** on a ballooning trust tab; host-of-record on group tabs. ✅ (durable `mms_tab_events` audit log · ceiling/nudge are flags-not-actions · config-driven thresholds)

**Exit:** a table runs a trust tab and settles once at close (any tender); a server can require/convert to a secure tab; tip lands on the final total.

### ✅ S4 — Unified basket & fulfillment routing &nbsp;`milestone:S4`

Dine-in + take-out + grocery in one cart, one payment, mixed fulfillment. **Dep:** S2 (line-state/KDS) · M2 (fire-time) · grocery (M2.3).

- **S4.1** Per-line **fulfillment tag** (dine-in / to-go / grocery) + the cart **grouped by destination**; the tag drives **per-line tax** (cold food taxable only dine-in) + a food **for-here/to-go toggle**; the tag supersedes session mode. ✅ (`docs/S4_DESIGN.md`; fire/KDS routing → S4.2)
- **S4.2** Per-line **fire routing** (dine-in → kitchen now · to-go → **fire at checkout** = tab-close or the explicit **"make it now"** toggle on pay-now · grocery never) + **KDS subset** + a **"ready in ~X"** departure-readiness signal. ✅ _(`docs/S4_DESIGN.md` S4.2; migration `20260623220000`. `mms_fire_cart` fires dinein-only; `mms_fire_line` = make-it-now; `mms_fire_pending_food` = the no-charge-with-no-fire safety net, fired best-effort after the untouched money RPCs (card · cash · split close); KDS reads open+paid carts + a To-go badge; honest "ready in ~X" from `pickup_config.prep_minutes`. Scoped to the dine-in basket — pickup/scango keep their M2 scheduled fire. Persistent "to-go ready" departure status + bagging/expo → S4.3.)_
- **S4.3** Bagging/expo station + the **split-tender seam** — a payment covers a **subset** of lines (single-tender at launch) + **line-level refunds**; lets M6 EBT be a tender-time branch, not a rewrite. 🟡 _pulled forward:_ **M3·P3.3** builds the per-seat split-tender; S4.3 generalizes it to arbitrary line subsets + mixed-basket fulfillment. **Three slices** (Min's "Everything" scope; `docs/S4_DESIGN.md` S4.3):
  - **S4.3a** To-go fulfillment loop — `/staff/expo` bagging station + `qr_orders.togo_status` + the diner "to-go ready" departure signal on `/track`; snapshots `qr_order_items.fulfillment`. ✅ (migration `20260624000000`)
  - **S4.3b** Line-level refunds — manager-gated `/staff/orders` surface + per-line refund (money-OUT): `mms_refund_authorize` (server-derived amount + PI) → Stripe refund (idempotency-keyed) → `mms_refunds` ledger + `mms_approvals` audit; `charge.refunded` webhook flips `qr_orders.status='refunded'` when fully refunded (unblocks M4 refund-recede; catches dashboard refunds). ✅ (migration `20260624010000`; split-tender line refunds deferred to the split path)
  - **S4.3c** Split-tender seam — `qr_order_items.ebt_eligible` (eligibility-at-sale, the 2027 EBT partition key) snapshotted off the money path via `mms_snapshot_ebt_eligibility` in the settlement `after()` drain; the payment↔line-subset association shape is deferred to the 2027 Forage build (documented, not guessed). ✅ (migration `20260624020000`) — **S4 COMPLETE**

**Exit:** one basket pays for served + to-go + grocery with correct per-line tax; to-go is fresh at departure; a payment can already target a line subset.

### Recommended build order (number ≠ priority)

`M1 → M2 → M3 → S1 → S2 → S3 → M4 → S4 → M5 → M6 (2027)`

Staff/floor + line authority (S1/S2) land right after group cart since they're core to the room; tabs (S3) follow; rewards (M4) and the unified basket (S4) slot next; delivery-migration (M5) and the 2027 EBT/kiosk (M6) stay last. **Reorder by what's hurting most — but respect the deps:** S2 needs S1, S3 needs S1, S4 needs S2.

---

### How we work each phase

Cowork/Claude Code remote → branch → PR → **Claude review + security + CI** gates → merge → Vercel preview → milestone-exit **adversarial pass** (Cowork) → tick the box here + a `CHANGELOG.md` entry. See [`docs/WORKFLOW.md`](docs/WORKFLOW.md).
