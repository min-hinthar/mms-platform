# 🗺 Roadmap — MMS Platform

Milestones → phases → tasks (the delivery-app rhythm). Each **milestone** ships a usable increment; each **phase** is a PR-sized unit with an exit criterion. Mirrored to the [GitHub Project board](https://github.com/min-hinthar/mms-platform/projects) via the `milestone:Mx` + `phase` labels. Changelog: [`CHANGELOG.md`](CHANGELOG.md).

**Legend:** ✅ done · 🟡 in progress · ⬜ todo · ⏸ deferred

---

## Now / Next / Later

- **Now →** M1 · Walking pay path (the smallest end-to-end real charge).
- **Next →** M2 tax/promos/scheduling · M3 group cart.
- **Later →** M4 rewards · M5 migrate delivery app · M6 kiosk + Terminal + EBT (2027).
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
- **P2.2** Honest pickup scheduling — ✅ tunable `pickup_config` (hours/interval/capacity/lead/prep/hold); tz-aware `mms_pickup_slots` returns today's bookable slots + **remaining capacity counting paid orders AND live holds** (open carts actively holding the slot — so capacity is honest _during_ ordering, not only post-pay); `mms_set_pickup_slot` is race-safe (per-slot advisory lock) + status-atomic; `fire_at = slot − prep` stored as the **S2 KDS seam**; create-intent re-checks room at the pay boundary; `/track` echoes the slot as the ETA (no fabricated countdown); the v7.2 slot sheet + header chip; **next-day rollover** (slots span today + `horizon_days`, grouped Today/Tomorrow/weekday — an after-hours browser pre-orders for tomorrow). Migrations `20260620000100` + `20260620000200`. ⬜ _deferred:_ inline slot-picker on `/cart` (the slot-less-checkout recovery routes via the menu today). ✅
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

## ⬜ M5 — Migrate delivery app &nbsp;`milestone:M5`

- **P5.1** `git clone` delivery app → `apps/delivery`, drop its `.git`, dedupe deps to root. ⬜
- **P5.2** Point its Supabase/Stripe imports at `@mms/db`; share `@mms/ui` tokens. ⬜
- **P5.3** Second Vercel project (Root Directory `apps/delivery`); turbo-ignore. ⬜

**Exit:** both apps build/deploy from the monorepo on one Supabase + Stripe.

## ⏸ M6 — Kiosk · Terminal · EBT (2027) &nbsp;`milestone:M6`

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

### ⬜ S4 — Unified basket & fulfillment routing &nbsp;`milestone:S4`

Dine-in + take-out + grocery in one cart, one payment, mixed fulfillment. **Dep:** S2 (line-state/KDS) · M2 (fire-time) · grocery (M2.3).

- **S4.1** Per-line **fulfillment tag** (dine-in / to-go / grocery) → KDS-now / KDS-at-checkout / bag-only; cart **grouped by destination** for legibility. ⬜
- **S4.2** To-go timing — **fire at checkout** (= tab-close, or the explicit **"make it now"** toggle on pay-now) + a **"ready in ~X"** departure-readiness signal. ⬜
- **S4.3** **Split-tender seam** — a payment covers a **subset** of lines (single-tender at launch) + **line-level refunds**; lets M6 EBT be a tender-time branch, not a rewrite. 🟡 _pulled forward:_ **M3·P3.3** builds the per-seat split-tender (each guest pays their own share); S4.3 then generalizes it to arbitrary line subsets + mixed-basket fulfillment. ⬜

**Exit:** one basket pays for served + to-go + grocery with correct per-line tax; to-go is fresh at departure; a payment can already target a line subset.

### Recommended build order (number ≠ priority)

`M1 → M2 → M3 → S1 → S2 → S3 → M4 → S4 → M5 → M6 (2027)`

Staff/floor + line authority (S1/S2) land right after group cart since they're core to the room; tabs (S3) follow; rewards (M4) and the unified basket (S4) slot next; delivery-migration (M5) and the 2027 EBT/kiosk (M6) stay last. **Reorder by what's hurting most — but respect the deps:** S2 needs S1, S3 needs S1, S4 needs S2.

---

### How we work each phase

Cowork/Claude Code remote → branch → PR → **Claude review + security + CI** gates → merge → Vercel preview → milestone-exit **adversarial pass** (Cowork) → tick the box here + a `CHANGELOG.md` entry. See [`docs/WORKFLOW.md`](docs/WORKFLOW.md).
