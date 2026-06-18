# 🗺 Roadmap — MMS Platform

Milestones → phases → tasks (the delivery-app rhythm). Each **milestone** ships a usable increment; each **phase** is a PR-sized unit with an exit criterion. Mirrored to the [GitHub Project board](https://github.com/min-hinthar/mms-platform/projects) via the `milestone:Mx` + `phase` labels. Changelog: [`CHANGELOG.md`](CHANGELOG.md).

**Legend:** ✅ done · 🟡 in progress · ⬜ todo · ⏸ deferred

---

## Now / Next / Later

- **Now →** M1 · Walking pay path (the smallest end-to-end real charge).
- **Next →** M2 tax/promos/scheduling · M3 group cart.
- **Later →** M4 rewards · M5 migrate delivery app · M6 kiosk + Terminal + EBT (2027).

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
- **P1.0a Backend infra** — create a free-tier **staging** Supabase project; move SQL to `supabase/migrations/` (CLI timestamp format, one history with delivery); wire `supabase gen types` + a **Zod** input layer into `@mms/db`; add `migrations-check` + `types-fresh` CI jobs. See `docs/BACKEND_ARCHITECTURE.md`. ⬜
- **P1.1 Anonymous-auth session** — enable **Supabase Anonymous Auth** (staging-first; audit the delivery `authenticated` RLS for anon exposure); swap `is_member`/`is_host` to the membership model (`seat_id = auth.uid()`); client `signInAnonymously()` (SSR cookies); `POST /api/session` verifies the anon JWT and records membership; RLS + private Realtime authorize off `auth.uid()`. ⬜
- **P1.2 Cart create + actions authz** — create-cart action; gate `addItem`/`setQty`/`applyPromo`/`create-intent` on session membership + lock; merge identical lines. ⬜
- **P1.3 Payment Element** — cart page mounts `<Elements>` against `/api/stripe/create-intent`; Apple/Google Pay surface. ⬜
- **P1.4 Fulfillment** — webhook reconciles `intent.amount` vs `getCartTotals`; `mms_fulfill_order` snapshots order + awards gems. ⬜
- **P1.5 Track** — order-status timeline via Realtime. ⬜
- **P1.6 Hardening** — nonce-based CSP, ESLint flat config + `packages/config`, env wired in Vercel preview. ⬜

**Exit:** a Stripe **test** charge completes, fulfills idempotently, and shows in Track; Claude review + CI green; QA-checklist P0s ticked.

## ⬜ M2 — Tax, promos & scheduling &nbsp;`milestone:M2`

- **P2.1** Server-validated promo codes (`promo_codes` + redemption caps/rate-limit). ⬜
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

### How we work each phase

Cowork/Claude Code remote → branch → PR → **Claude review + security + CI** gates → merge → Vercel preview → milestone-exit **adversarial pass** (Cowork) → tick the box here + a `CHANGELOG.md` entry. See [`docs/WORKFLOW.md`](docs/WORKFLOW.md).
