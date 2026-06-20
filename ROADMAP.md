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
- **P2.2** Honest pickup scheduling (slot capacity + fire-time; ETA echoes the slot). ⬜
- **P2.3** Grocery session/cart (replace the demo `crypto.randomUUID()`); name-search fallback for unknown barcodes. ⬜
- **P2.4** QBO sync of paid orders (two-ledger clearing). ⬜

**Exit:** mixed taxable/exempt carts reconcile to the cent; promos enforced server-side; pickup ETA truthful.

## ⬜ M3 — Group cart (multi-device) &nbsp;`milestone:M3`

- **P3.1** Join flow: scan → session → guest list (presence). ⬜
- **P3.2** Realtime broadcast of cart changes; server-authoritative merge. ⬜
- **P3.3** Per-person split + assignment; host lock/remove with `canMutate` parity to the prototype. ⬜
- **P3.4** Abuse limits: rate limits, session expiry, RLS membership tests. ⬜

**Exit:** two phones at one table order together; only members read/mutate; host lock holds.

## ⬜ M4 — Rewards & account &nbsp;`milestone:M4`

- **P4.1** Reuse the delivery app's gem ledger (tier ring, balance, perks). ⬜
- **P4.2** Account: order history, reorder-with-modifiers, settings (theme/lang). ⬜
- **P4.3** Feedback + ungated review triage. ⬜

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

### ⬜ S1 — Staff & floor &nbsp;`milestone:S1`

The door for humans; the single-source-of-truth across channels. **Dep:** M1 (ledger) · M3 (table session/presence).

- **S1.1** Staff auth + **roles** (server / manager / owner), distinct from anon diners; RLS so staff read/write **any** table session, diners only their own. ⬜
- **S1.2** **Floor view** — legible per-table state (live cart? seats? last activity?) on a staff device. ⬜
- **S1.3** **Staff write** to a table order (order _for_ a guest — "browse on phone, pay a human" closes here; cash is first-class). ⬜
- **S1.4** **Soft convergence** — warn on divergence (new order on a table with a live cart) · **one-tap merge** of two table orders (role-gated, logged) · session **expiry** + staff **"clear table"** on turnover. ⬜

**Exit:** a server can find any table, see/extend its cart, settle it (incl. cash), and a double-order is a one-tap merge. _Unlocks all four low-tech fallbacks._

### ⬜ S2 — Line lifecycle & authority &nbsp;`milestone:S2`

What lets the kitchen trust the screen + gives loss-controlled undo. **Dep:** S1 (staff roles) · a KDS fire signal.

- **S2.1** Line-state machine **draft → fired → in-progress → served → settled** + KDS fire/bump; grocery lines lock at **payment**, not fire. ⬜
- **S2.2** Post-fire edit rights — customer "Remove" becomes **"Ask server"**; ~5s **undo** grace before the ticket hits the KDS; enforced server-side via `canMutate(line_state, actor_role)`. ⬜
- **S2.3** **Voids/comps — loss-gated:** uncooked = server-solo + reason; cooked / money-out refund = **manager-PIN step-up** (per-person, server-verified, rate-limited); two-party audit. ⬜
- **S2.4** **Approvals primitive** (`request → notify → approve/deny → audit`) + **owner remote-approve** (async; safe-default on timeout; two approvers + SMS; one-glance push). Void is consumer #1. ⬜

**Exit:** a fired ticket can't be silently mutated by a guest; a cooked-item comp needs manager-PIN or owner remote-approve; every void is two-party logged.

### ⬜ S3 — Tabs (deferred settlement) &nbsp;`milestone:S3`

"Keep the tab open" — the table order settled at close. **Dep:** S1 (staff close) · M1 (ledger) · reuses S2's approvals for after-hours closes.

- **S3.1** **Trust tab** (default) — accumulate, settle at close with any tender; **tip on the final total**. ⬜
- **S3.2** **Secure tab** — SetupIntent card at open _or attached mid-tab_, off-session charge at close; validate at open; handle close-decline. ⬜
- **S3.3** **Server-discretion** gating — courtesy framing + a light **nudge** on large/new tables + a **silent ceiling** on a ballooning trust tab; host-of-record on group tabs. ⬜

**Exit:** a table runs a trust tab and settles once at close (any tender); a server can require/convert to a secure tab; tip lands on the final total.

### ⬜ S4 — Unified basket & fulfillment routing &nbsp;`milestone:S4`

Dine-in + take-out + grocery in one cart, one payment, mixed fulfillment. **Dep:** S2 (line-state/KDS) · M2 (fire-time) · grocery (M2.3).

- **S4.1** Per-line **fulfillment tag** (dine-in / to-go / grocery) → KDS-now / KDS-at-checkout / bag-only; cart **grouped by destination** for legibility. ⬜
- **S4.2** To-go timing — **fire at checkout** (= tab-close, or the explicit **"make it now"** toggle on pay-now) + a **"ready in ~X"** departure-readiness signal. ⬜
- **S4.3** **Split-tender seam** — a payment covers a **subset** of lines (single-tender at launch) + **line-level refunds**; lets M6 EBT be a tender-time branch, not a rewrite. ⬜

**Exit:** one basket pays for served + to-go + grocery with correct per-line tax; to-go is fresh at departure; a payment can already target a line subset.

### Recommended build order (number ≠ priority)

`M1 → M2 → M3 → S1 → S2 → S3 → M4 → S4 → M5 → M6 (2027)`

Staff/floor + line authority (S1/S2) land right after group cart since they're core to the room; tabs (S3) follow; rewards (M4) and the unified basket (S4) slot next; delivery-migration (M5) and the 2027 EBT/kiosk (M6) stay last. **Reorder by what's hurting most — but respect the deps:** S2 needs S1, S3 needs S1, S4 needs S2.

---

### How we work each phase

Cowork/Claude Code remote → branch → PR → **Claude review + security + CI** gates → merge → Vercel preview → milestone-exit **adversarial pass** (Cowork) → tick the box here + a `CHANGELOG.md` entry. See [`docs/WORKFLOW.md`](docs/WORKFLOW.md).
