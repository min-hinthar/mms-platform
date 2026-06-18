# Session Handoff — MMS Platform (2026-06-18)

The originating chat context does not carry across sessions — **this file is the durable pickup
point.** Read it alongside [`ROADMAP.md`](../ROADMAP.md), [`.claude/LEARNINGS.md`](../.claude/LEARNINGS.md),
and [`docs/BACKEND_ARCHITECTURE.md`](BACKEND_ARCHITECTURE.md).

## Where we are

- **Milestone M1 (walking pay path).** The backend foundation is done; the pay-path _wiring_
  (P1.1 onward) is next.
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
- **Anonymous sign-ins must be enabled** in the project's Auth settings (dashboard) before P1.1
  works. **Leaked-password protection is Pro-only** — accepted; that advisor warning is benign.

## Next tasks (in order)

### P1.1 — Anonymous-auth session wiring (the membership RLS already ships in the schema)

1. Enable Anonymous sign-ins (dashboard → Auth, or `supabase/config.toml`).
2. Client `supabase.auth.signInAnonymously()` on first load; persist via `@supabase/ssr` cookies
   (add browser+server SSR clients to `@mms/db`).
3. `apps/qr/app/api/session/route.ts`: read `Authorization: Bearer <anon token>`, verify with
   `sessionClient(token).auth.getUser()`, set `session_members.seat_id = user.id` (today it's a
   placeholder `crypto.randomUUID()` — see the `TODO(P1.1)` there).
4. `apps/qr/lib/realtime.ts`: `channel.socket.setAuth(anonAccessToken)` so the private-channel
   RLS (`is_member`) authorizes presence + broadcast.
5. Server Actions (`apps/qr/lib/cart.ts`, `grocery.ts`): authz each — read the caller's uid from
   the SSR cookie session + check `session_members` membership (and cart lock) before mutating.
   They are IDOR by default (see LEARNINGS).

### P1.0a leftovers — infra

- **Zod** input layer: add the dep (mind pnpm 11 `minimumReleaseAge` — delete the lockfile and
  reinstall so it auto-pins to a release older than the cutoff), create `packages/db/src/schemas.ts`,
  validate every Server Action / route input (ids = `z.string().uuid()`, money = `z.number().int()`).
- **CI**: `migrations-check` (apply `supabase/migrations` to an ephemeral Postgres) + `types-fresh`
  (regenerate types and `git diff --exit-code` so committed types can't drift).
- `supabase/config.toml` (anon sign-ins on; auth rate limits) — config-as-code.

### Then P1.2+ (see ROADMAP): cart-create + action authz → Payment Element → fulfillment/Track.

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
