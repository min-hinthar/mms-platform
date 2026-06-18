# Session Handoff — MMS Platform (2026-06-18)

The originating chat context does not carry across sessions — **this file is the durable pickup
point.** Read it alongside [`docs/context/INDEX.md`](context/INDEX.md) (the research map — decisions,
QA gate, rubric, red-team, v7.2 prototype), [`ROADMAP.md`](../ROADMAP.md),
[`.claude/LEARNINGS.md`](../.claude/LEARNINGS.md), and [`docs/BACKEND_ARCHITECTURE.md`](BACKEND_ARCHITECTURE.md).

## Where we are

- **Milestone M1 (walking pay path).** Backend foundation **and P1.1 anonymous-auth wiring** are
  done (+ the P1.0a leftovers: Zod input layer, DB-drift CI, `config.toml`). Next: \*\*P1.2 cart-create
  - line-merge → Payment Element (P1.3) → fulfillment/Track\*\*.
- **P1.1 shipped (this session):** `AnonAuthGate` (`signInAnonymously` on load, SSR cookies) +
  `useAnonSession()`; `@mms/db/server` `serverClient(cookies)`; `POST /api/session` verifies the
  Bearer anon token → `seat_id = auth.uid()` (idempotent, sets `host_seat`); **one authz guard**
  (`apps/qr/lib/authz.ts`) gates every mutation (`addItem`/`setQty`/`applyPromo`/`scanAdd`/
  `create-intent`) on membership + lock; `getCartTotals` moved to internal `lib/totals.ts` (the
  webhook still calls it server-to-server). Zod = `@mms/db/schemas`. (Closes REVIEW.md gate #3.)
- **QR runs on its OWN Supabase project** — `fasnpdhtvqtzjlvruqcu` ("MMS QR Platform", org
  `iqphcmcmbydhkssfhrdt`), separate from the live delivery app (`ukuzkhuppqwtrdkjqrkv`). No
  shared-project blast radius; the catalog is owned here.
- **Schema applied + advisor-clean** (`supabase/migrations/20260618000000_qr_platform_init.sql`
  - `…000100_lockdown_grants.sql`): catalog owned here (`menu_categories`/`menu_items`/
    `modifier_*`/`grocery_items`) with `tax_category` as a **column**; `qr_*` session/cart/order
    tables; cents tax engine (`mms_tax_rate`/`mms_taxable`/`mms_line_tax`); **anonymous-auth
    membership RLS** (`is_member`/`is_host` keyed on `session_members.seat_id = auth.uid()`);
    realtime private-channel policies; idempotent `mms_fulfill_order`.
- **Seeded** from `supabase/seed.sql` — 60 menu items + 6 grocery SKUs, real data, cents,
  CA tax classified.
- **Types** generated → `packages/db/src/database.types.ts`, wired into `createClient<Database>`.
  Public catalog reads use `publicClient()` (anon key, RLS); writes use `serviceClient()`.
- **Smoke-tested** end-to-end (DB: pricing/tax/modifier-intersection/fulfillment/idempotency/
  reconcile-guard/grants; app: `/menu` renders all 60 items with cents→$ prices + Burmese names).

## Environment facts (read before running anything)

- **App env** (set in Vercel by Min) → all point at the **new** project:
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` _or_ `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  (both accepted by `@mms/db`), `SUPABASE_SERVICE_ROLE_KEY`.
- ⚠️ **This sandbox injects `NEXT_PUBLIC_SUPABASE_*` + `SUPABASE_SERVICE_ROLE_KEY` pointing at the
  DELIVERY project**, and Next.js lets real shell env override `.env.local`. So local `pnpm dev`/
  build here hits **delivery** unless you inline-override:
  ```bash
  NEXT_PUBLIC_SUPABASE_URL=https://fasnpdhtvqtzjlvruqcu.supabase.co \
  NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable key> \
  pnpm --filter @mms/qr dev
  ```
- **Supabase MCP** is scoped per `project_ref` — ensure it targets `fasnpdhtvqtzjlvruqcu`. Run
  `get_advisors` (security + performance) after every migration.
- **Anonymous sign-ins**: enabled as code in `supabase/config.toml` (applies to the local stack /
  CI). ⚠️ **Still must be toggled ON for the LIVE project** (dashboard → Auth, or `supabase config
push` once linked) before the anon-auth flow works in Vercel preview/prod. **Leaked-password
  protection is Pro-only** — accepted; that advisor warning is benign.
- **Local Supabase stack** boots in the sandbox (Docker) with `supabase start -x edge-runtime`
  (the edge-runtime container hits an rlimit/TLS wall here; we have no edge functions). That's how
  to regenerate types: `pnpm db:types` (stack up) → commits `database.types.ts` (raw `--local
--schema public`; prettier-ignored — CI's `types-fresh` diffs it raw).

## Next tasks (in order)

### P1.2 — Cart create + line-merge (actions authz already landed in P1.1)

1. **create-cart action** — a `"use server"` action (or extend `/api/session`) that returns the
   cart id for a session so the client has a real `cartId` to drive `/cart`. (Today `/api/session`
   creates the host cart but doesn't return its id; the grocery page still mints a demo
   `crypto.randomUUID()` — now correctly **rejected** by the authz guard until this lands.)
2. **Merge identical lines** in `addItem` (same `menu_item_id` + same `modifiers`) → bump `qty`
   instead of inserting a duplicate row (QA §B perf; `qty` is currently hardcoded to 1).
3. Wire the client: `useAnonSession()` → POST `/api/session` (Bearer) on a scanned table; pass the
   anon `accessToken` + `seat` into `useGroupCart` so Realtime authorizes.

### P1.3 — Payment Element

- Cart page mounts `<Elements>` against `/api/stripe/create-intent` (already member-gated); surface
  Apple/Google Pay. **No real card until the M1 gate (`docs/REVIEW.md`) is fully green.**

### Then P1.4+ (see ROADMAP): fulfillment end-to-end → Track timeline.

## Verify

- Gate: `pnpm turbo lint typecheck build`
- Advisors: `get_advisors` (security|performance) on `fasnpdhtvqtzjlvruqcu`
- Local app smoke (with the override env above): `curl "localhost:3000/menu?mode=dinein"`

## Open decisions / notes

- **ESLint pinned 9.x** — ESLint 10 breaks `eslint-config-next`'s react plugin; flip when upstream
  is ready.
- **Staging project** — add one when QR has live traffic; the single project is dev+prod-in-one now.
- **Tax nuance** — cold salads filed under the `sides` category inherit `hot_prepared`; confirm
  per-item with the restaurant and override `menu_items.tax_category` where a cold item is exempt
  to-go (e.g. `lemon-salad`).
- `docs/DATA_RECONCILIATION.md` is **historical** (the delivery-owned-menu era); the catalog is
  owned here now.
