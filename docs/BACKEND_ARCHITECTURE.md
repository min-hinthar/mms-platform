# Backend & Database Architecture — MMS Platform

**Status: design of record (2026-06-18).** Deep-think pass over DB architecture, backend routing, the
migration/environment workflow, and full-stack typing for the Turborepo monorepo. Supersedes the
auth/RLS sketch in `ARCHITECTURE.md §2–3` where they differ; `ARCHITECTURE.md` stays the product/spec
overview. Companion: `docs/DATA_RECONCILIATION.md` (now historical — see banner below).

> **UPDATE (2026-06-18): dedicated project, not shared.** QR now runs on its **own** Supabase
> project — **`fasnpdhtvqtzjlvruqcu` ("MMS QR Platform")**, a different org from the live delivery
> app. This **moots the §1 anon-auth blast radius** (no foreign app shares the DB) and replaces the
> "delivery-owned menu" model: the catalog (`menu_categories`/`menu_items`/`modifier_*`/
> `grocery_items`) is **owned here**, seeded from `supabase/seed.sql` (60 real items), and
> `tax_category` is a **first-class column on `menu_items`** (the `mms_menu_tax*` side-tables +
> resolver are gone). Schema = `supabase/migrations/20260618000000_qr_platform_init.sql` +
> `..._lockdown_grants.sql`, applied + advisor-clean; types in `packages/db/src/database.types.ts`
> wired into the clients. Delivery stays on its own project until a future migration. The §2
> topology below now reads: local → this project (apply directly; it has no live traffic yet) →
> a staging project added later when QR goes live.

## 0 · The four decisions (locked 2026-06-18)

| #   | Decision                  | Choice                                                                           | Why                                                                                                                                                             |
| --- | ------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Environments + migrations | **Free-tier + a dedicated `staging` Supabase project**, promote to prod manually | Branching needs Pro; a staging project gives a real apply target + a safe place to audit the anon-auth blast radius (see §1) without paying for per-PR branches |
| 2   | Diner identity            | **Supabase Anonymous Auth**                                                      | A real `auth.users` row per diner → RLS off `auth.uid()`, stable presence key, and a clean upgrade-to-account path at M4 (gems)                                 |
| 3   | Authoritative writes      | **Service-role Server Actions**                                                  | App is the source of truth; clients are default-deny on writes (SELECT only). Already built; simplest to reason about                                           |
| 4   | Typing + validation       | **Generated Supabase types + Zod**                                               | End-to-end DB typing (kills the embed/array footgun) + runtime validation of every external input                                                               |

---

## 1 · ⚠️ Cross-app blast radius of Anonymous Auth (read first)

Anonymous sign-in issues a JWT with the **`authenticated`** Postgres role and `is_anonymous: true`.
On the **shared** project that means _every QR diner is `authenticated`_ — so any delivery-app RLS
policy written as `to authenticated using (true)` (or that doesn't also check ownership) would now be
readable/writable by an anonymous diner.

**Guardrails (do all before enabling anonymous sign-ins on prod):**

1. **Audit every delivery `authenticated` policy** on the **staging** project (decision #1 exists for
   this). Most delivery policies already key off `auth.uid() = user_id`, so a random anon uid with no
   matching rows reads nothing — likely safe. The ones to verify are any broad `using (true)` grants
   on non-public tables.
2. Where a policy must exclude anonymous users, add
   `and (select (auth.jwt() ->> 'is_anonymous'))::boolean is not true`.
3. Keep QR tables (`qr_*`, `table_sessions`, `session_members`) on **membership-scoped** policies
   (§3) so an anon uid only ever sees its own active table session.
4. Enable Supabase Auth **rate limiting** for anonymous sign-ins + (optionally) CAPTCHA — anon
   sign-in is an unauthenticated create endpoint; cap abuse. Set a short JWT expiry; rely on refresh.
5. A periodic **cleanup** of orphan anonymous users (no membership in the last N hours) — anon users
   accumulate in `auth.users`. A scheduled `pg_cron` job (or the staging→prod promote checklist).

This risk is the single most important consequence of decisions #1+#2 and is why staging-first matters.

---

## 2 · Environments & the migration workflow

### Topology

> **⚠️ SUPERSEDED by the 2026-06-18 banner above (re-confirmed at the S4 audit, P0-2).** The diagram below
> is the original **shared-prod** sketch and is **no longer the design of record.** QR runs on its **OWN**
> project (`fasnpdhtvqtzjlvruqcu`), delivery on **its** own (`ukuzkhuppqwtrdkjqrkv`) — **no shared database.**
> M5 unifies the monorepo _packages_ + the one Stripe account, not the DB (see `ROADMAP.md` M5). The QR path
> is now: `local (supabase start) ▶ the QR project (apply directly; no live traffic yet) ▶ a staging QR
project added when QR goes live`. The shared-prod text below is kept only as the migration-era history.

```
local dev ──▶ staging Supabase project ──▶ prod (mandalay-morning-star-delivery-app)
(supabase start)   (new; free tier)            (ukuzkhuppqwtrdkjqrkv — shared, live)
```

- **prod** = the existing live delivery project. Shared by `apps/delivery` + `apps/qr`.
- **staging** = a new free-tier project that mirrors prod's schema. The apply/audit target for every
  QR migration (and the place to run the §1 anon-auth audit). _Create once; not done yet — it's an
  operational setup step (free tier allows 2 active projects/org; `civic-test-prep` is INACTIVE)._
- **local** = `supabase start` (Docker) for fast iteration where Docker is available; otherwise apply
  to staging directly.

> We **don't** adopt per-PR DB branches (would need Pro). The Vercel preview per PR points at
> **staging** env vars; prod is only touched on merge.

### Migration format — converge on the Supabase CLI

The delivery app **already uses CLI-style timestamped migrations**
(`20260612120000_rpc_rls_lockdown`, …). For one ordered history across both apps, the QR migrations
should move from `packages/db/migrations/000x_*.sql` to the CLI layout:

```
supabase/                      ← new, repo root (one project config for the monorepo)
├─ config.toml                 ← anonymous sign-ins, auth rate limits, etc. as code
└─ migrations/
   ├─ 20260612120000_*.sql     ← (delivery history, pulled via `supabase db pull` once)
   ├─ 20260618_qr_ordering.sql ← was packages/db/migrations/0001 (timestamp-renamed)
   ├─ 20260618_grocery.sql     ← was 0002
   └─ 20260618_qr_hardening.sql
```

`packages/db` keeps the **clients + generated types + Zod schemas** (TS); the **SQL** moves under
`supabase/`. Until that move lands, the existing `packages/db/migrations/000x` files remain the source
and are applied with `supabase db push --db-url <staging>`.

### The loop (per migration)

1. Write/edit the migration SQL.
2. `supabase db push` to **staging** → `supabase gen types typescript --linked > packages/db/src/database.types.ts`.
3. Run `get_advisors` (security + performance) against staging; fix lints.
4. PR with the migration + regenerated types; gate green; preview points at staging.
5. On merge: a **manual** apply to **prod** (off-peak), then `get_advisors` on prod.
   ⚠️ **NOT `db push`** — prod's `schema_migrations` versions are MCP-generated and share no
   value with the repo filenames, so `db push` would replay the entire chain from
   `create table`. Use the MCP `apply_migration` per file, in timestamp order, verifying each
   (signature · ACL · `has_function_privilege`) before the next. See `CLAUDE.md`.

### CI additions

- **`migrations-check`** job: `supabase db push --dry-run` (or apply to an ephemeral local) so a PR
  that changes `supabase/migrations/**` is proven to apply cleanly.
- **`types-fresh`** job: regenerate types in CI and `git diff --exit-code` so committed
  `database.types.ts` can't drift from the SQL.
- Both wired into `ci.yml` alongside the existing `lint typecheck build`.

---

## 3 · Auth & RLS model (Anonymous Auth + membership)

### Flow

```
scan QR ─▶ client supabase.auth.signInAnonymously()        (authenticated role, is_anonymous=true)
        ─▶ POST /api/session { qrCode, mode, name } + Bearer <anon access token>
             server verifies token → auth.uid(); creates/joins table_session;
             inserts session_members(session_id, seat_id = uid, role); host creates qr_cart
        ─▶ client reads cart/menu with its anon session (RLS); joins private Realtime channel
        ─▶ mutations call Server Actions (service-role) which re-check membership + lock
M4 upgrade: anonymous user → updateUser(email)/linkIdentity(OAuth) keeps the SAME uid →
             past qr_orders + a new profiles row + loyalty_rewards all tie to that uid (gems unlock)
```

### RLS = membership is data, not a claim

The custom-JWT sketch baked `session_id` into the token (one session per token; needs a re-mint to
switch tables). With Anonymous Auth we instead **join the membership table** — simpler, and a diner's
access is exactly the rows that say so:

```sql
-- SECURITY DEFINER so the membership lookup itself isn't subject to RLS recursion;
-- search_path pinned; auth.uid() wrapped in (select …) so it's evaluated once per query (initplan).
create or replace function is_member(sess uuid) returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.session_members m
    join public.table_sessions s on s.id = m.session_id
    where m.session_id = sess
      and m.seat_id = (select auth.uid())
      and s.status <> 'closed' and s.expires_at > now()
  );
$$;
```

- `seat_id` now holds the diner's **`auth.uid()`** (stable → no presence ghosts, satisfies the old
  "stable seat" learning natively).
- `is_host(sess)` is the same lookup with `role = 'host'`.
- Realtime, cart, order policies all call `is_member(<session>)`. No custom-claim auth hook is
  needed (we deliberately avoid a Custom Access Token hook — fewer moving parts).
- **Writes stay default-deny** for clients; only service-role Server Actions mutate (decision #3).

### Function hardening (from the advisor findings)

Applied to every QR function (`is_member`/`is_host`/`mms_*`): pin `search_path`, and **`REVOKE
EXECUTE` from `anon`/`authenticated`** on everything except `is_member`/`is_host` (which RLS needs
the `authenticated` role to execute). `mms_fulfill_order` (SECURITY DEFINER, webhook-only) and the
tax helpers are service-role-only.

---

## 4 · Backend routing map

| Path                                      | Mechanism                                         | AuthZ                                                                         | Notes                                                                    |
| ----------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Menu / grocery catalog                    | **RSC** (service-role read, or anon + public RLS) | public                                                                        | Cacheable (`revalidate`); reads delivery-owned `menu_items`              |
| `addItem`/`setQty`/`applyPromo`/`scanAdd` | **Server Action** (service-role)                  | **re-check membership + cart lock** via the caller's uid (SSR cookie session) | Server-authoritative pricing; IDOR-by-default → authz every one          |
| `getCartTotals`                           | Server fn (service-role)                          | n/a (internal)                                                                | Single authoritative totals engine (cents)                               |
| `POST /api/session`                       | **Route handler** (service-role)                  | verify caller's anon JWT → uid                                                | Mints/joins the table session; records membership                        |
| `POST /api/stripe/create-intent`          | **Route handler** (service-role)                  | **verify caller is a member of the cart** (closes red-team C3)                | Amount = `getCartTotals().totalCents`; idempotency key                   |
| `POST /api/stripe/webhook`                | **Route handler** (service-role)                  | Stripe signature                                                              | Reconciles `intent.amount` vs `getCartTotals`; calls `mms_fulfill_order` |
| Group-cart realtime                       | Client (anon session)                             | RLS on `realtime.messages`                                                    | Private channel `table:{id}`; presence + broadcast                       |
| `/track?r=…` (durable receipt)            | **RSC** (service-role read)                       | the opaque 90-day bearer IS the authz (`mms_receipt_tokens`)                  | Session-less artifact; `noindex`; no live layer mounts                   |
| Receipt link / email (`lib/receipt.ts`)   | **Server Action** (service-role)                  | SSR uid is the order's **earner** or holds a `qr_order_payers` row            | Rate-limited 5/10min; the Resend send drains in `after()`                |
| Live order tracking                       | Client Realtime + RSC fallback                    | `qr_order_read` RLS per-subscriber; fallback `earned_by = uid` / payers row   | ONE `TRACK_ORDER_SELECT` + `shapeTrackedOrder` (`lib/track-order.ts`)    |

**Why Server Actions read uid from the SSR cookie session:** the anon session is persisted via
`@supabase/ssr` cookies, so a Server Action can `createServerClient()` → `getUser()` → uid, then
authz membership with the service role before mutating. The client never asserts identity.

---

## 5 · `@mms/db` package — typing & validation

```
packages/db/src/
├─ index.ts          ← browserClient() + shared hand types that AREN'T DB-derived (CartTotals…)
├─ server.ts         ← serviceClient() (service-role) + sessionClient(token) + serverClient(cookies)
├─ factory.ts        ← M5·P5.0: the generic, env-INJECTED client constructors both wrappers bind
├─ database.types.ts ← GENERATED (supabase gen types) — committed, regenerated in CI
└─ schemas.ts        ← Zod schemas for every Server Action / route input + parsers
```

- **Generated types** wire into the clients: `createClient<Database>(…)` so `.from("qr_cart_items")`
  is fully typed and embeds infer correctly (no more `as unknown` on the menu category embed).
- **Zod** validates external input at the trust boundary: `addItemInput`, `applyPromoInput`,
  `sessionMintInput`, `createIntentInput`, `scanInput`. Parse first, then touch the DB. Money fields
  are `z.number().int().nonnegative()` (cents). Inputs that are ids are `z.string().uuid()`.
- `CartTotals`/`CartItem` stay hand-typed (they're computed shapes, not table rows) but in **cents**.

---

## 6 · Schema map (current + planned)

**QR-owned — all of it (this repo owns its whole schema; all money in cents).** Sessions + cart/order
core: `table_sessions`, `session_members` (seat_id = auth.uid()), `qr_carts`, `qr_cart_items`,
`qr_orders`, `qr_order_items`, `qr_order_payers`, `qr_cart_shares`, `qr_tables`, `promo_codes`.
**Catalog — owned HERE since the §0 banner, not read from delivery:** `menu_categories`, `menu_items`
(with `tax_category` a first-class column — the `mms_menu_tax*` side-tables and their resolver were
dropped), `modifier_groups`, `modifier_options`, `item_modifier_groups`, `grocery_items`. Artifacts +
identity: `mms_receipt_tokens` (the durable receipt's 90-day bearer — `ARCHITECTURE.md §8`),
`mms_merge_tokens`, `mms_profiles`, `mms_rewards`/`mms_reward_tiers`, `staff`/`staff_pins`. Functions:
`is_member`/`is_host`, `mms_tax_rate`/`mms_taxable`/`mms_line_tax`, `mms_fulfill_order` (+
`mms_fulfill_split_order`/`mms_fulfill_cash_order`). This map names the load-bearing objects only —
`supabase/migrations/` is the authority.

**Nothing is delivery-owned.** The delivery app runs its own project (`ukuzkhuppqwtrdkjqrkv`) and QR
reads none of it; the two share **one Stripe account** and nothing else (`CLAUDE.md`).

**Indexing (added in hardening):** covering indexes on every QR FK — `qr_carts(session_id)`,
`qr_cart_items(cart_id)`, `qr_orders(session_id)`, `qr_order_items(order_id)`,
`session_members(session_id)`, and `session_members(seat_id)` (the hot `is_member` path).

---

## 7 · Phased implementation plan (maps to ROADMAP M1)

- **P1.0 ✅** Schema reconciliation (done) — `qr_*`, cents, real menu, tax map, fulfill reconcile.
- **P1.0a (infra)** Create the **staging** project; move SQL to `supabase/migrations/` (CLI format);
  wire `supabase gen types` + Zod into `@mms/db`; add `migrations-check` + `types-fresh` CI jobs.
- **P1.1 (auth)** Enable Anonymous Auth (staging first; run the §1 audit); swap `is_member`/`is_host`
  to the membership model + function hardening; `signInAnonymously()` on the client (SSR cookies);
  `/api/session` verifies the anon JWT and records `seat_id = uid`.
- **P1.2** Cart-create action + authz on every Server Action (membership + lock via SSR uid);
  merge identical lines.
- **P1.3** Payment Element on the cart page against `create-intent` (member-gated).
- **P1.4** Fulfillment end-to-end + Track timeline (gems still deferred — anon `loyalty_rewards`).
- **P1.6** Nonce CSP; finalize env wiring (preview→staging, prod→prod).

The function hardening (search_path + revoke execute) and the FK indexes are landed **now** in the
QR migration (they're pure best-practice hardening of P1.0's own objects); the membership-RLS swap
lands with its app wiring in **P1.1** so it's one reviewable unit.

---

## 8 · Best-practice checklist (grounded in live `get_advisors`)

Run `get_advisors` after every DDL. The live audit (2026-06-18) flagged, on the sister app, patterns
we explicitly avoid on the QR side:

- ✅ **No `SECURITY DEFINER` function executable by `anon`/`authenticated`** → revoke execute (the
  delivery app trips `0028`/`0029` on `is_admin`/`get_my_driver_id`/route fns).
- ✅ **`auth.*` wrapped in `(select …)`** in policies/functions → avoids `0003 auth_rls_initplan`.
- ✅ **One permissive policy per role/action** → avoids `0006 multiple_permissive_policies`.
- ✅ **Covering index on every FK** → avoids `0001 unindexed_foreign_keys`.
- ✅ **`search_path` pinned** on every function.
- ✅ **RLS enabled + at least a deny** on every table (no `0008 rls_enabled_no_policy`).
- ☐ **Enable leaked-password protection** + anon rate-limit in `supabase/config.toml` (shared Auth).
- ☐ Audit delivery `authenticated` policies for anon-auth exposure (§1) on staging.

Remediation references: <https://supabase.com/docs/guides/database/database-linter>.
