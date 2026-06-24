# M5 design — migrate the delivery app into the monorepo

**Status: pre-build design of record (2026-06-24).** Read before building M5. Companion to `ROADMAP.md` §M5,
[`docs/BACKEND_ARCHITECTURE.md`](BACKEND_ARCHITECTURE.md) (the locked topology), [`docs/M4_DESIGN.md`](M4_DESIGN.md)
(the rewards ledger), and [`docs/DATA_RECONCILIATION.md`](DATA_RECONCILIATION.md) (the delivery schema, historical).
This doc is the M5 equivalent of `S2_DESIGN.md`/`S4_DESIGN.md`: the threat-model + slice plan + the open
decisions, surfaced **before** the first commit so M5 doesn't discover its load-bearing seams mid-build.

## What M5 is — and is NOT

**M5 brings the existing live delivery PWA into this Turborepo as `apps/delivery`, so both apps build/deploy
from one monorepo, share UI/config/tooling + the one Stripe account, and stop drifting.** It is a **code
co-location**, not a database merge.

**Locked topology (resolves the S4-audit P0-2 contradiction):**

- **Two databases, never merged.** QR keeps `fasnpdhtvqtzjlvruqcu`; delivery keeps `ukuzkhuppqwtrdkjqrkv`.
  There is **no shared schema** — merging would re-arm the `qr_*`-vs-delivery `create table` collision the M1
  reconciliation defused (`docs/DATA_RECONCILIATION.md:12-29`).
- **One Stripe account, shared** (CLAUDE.md:15) — both apps' webhooks/keys point at the same account; test vs
  live per environment as today.
- **Shared packages:** `@mms/ui` (tokens + Radix primitives), `@mms/config` (eslint/prettier), the root
  tooling (turbo, pnpm single-version), and — to the extent below — `@mms/db`.

**Explicit non-goals for M5:** no diner-data migration; no unified rewards wallet (see §5 — a separate
post-M5 design); no rewrite of delivery's order model onto QR's `qr_*` schema. Delivery ships as-is, just
_inside_ the repo and sharing the design system.

## The real work: `@mms/db` is the only QR-coupled package

The recon is unambiguous on where M5's effort lives:

- **`@mms/ui` + `@mms/config` are already app-agnostic** (`packages/ui/src/index.ts:1-3` — `Sheet`,
  `NumberFlow`; `packages/config` — eslint/prettier only). **No change needed.** Delivery adopts tokens by
  importing `@mms/ui/tokens.css`.
- **QR imports only from package roots** (`@mms/db/server`, `@mms/db/schemas`, `@mms/db`, `@mms/ui`) — no deep
  paths, so the package boundary is clean to extend.
- **`@mms/db` is QR-only and the hinge of M5:**
  - **Clients are bound to one project's env** — `packages/db/src/server.ts` reads a single
    `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` at module load, returning
    `SupabaseClient<Database>` where `Database` is **QR's generated type** (`database.types.ts` =
    `qr_*`/`table_sessions`/`mms_*` only).
  - **Types are QR's schema** — delivery's tables (`loyalty_rewards`, `profiles`, its order/address/courier
    fields) are absent, so a delivery query typed against `@mms/db`'s `Database` would mis-type and its RLS
    would fail at runtime.

### The recommended `@mms/db` shape (the P5.0 prep slice)

Make `@mms/db` a **generic, project-parameterized** client toolkit, with each app binding its own schema type

- env — rather than forcing delivery onto QR's types (wrong) or duplicating client boilerplate per app (drift):

1. **Extract a generic factory.** `@mms/db` exports `createServiceClient<DB>(url, key)` /
   `createBrowserClient<DB>(url, key)` (the construction + cookie/auth wiring, today's logic, minus the
   hardcoded env read). The env read moves to a thin per-app binding.
2. **Per-app typed bindings + types.** `database.types.qr.ts` (from `fasnpdhtvqtzjlvruqcu`) and
   `database.types.delivery.ts` (from `ukuzkhuppqwtrdkjqrkv`). QR's `apps/qr/lib/db.ts` binds the QR type +
   QR env; delivery's binds its own. `@mms/db` root stays the **shared contract**, not a QR dump.
3. **Namespace the QR-only surface (closes audit P2).** `@mms/db/schemas` (Zod) is QR-only but root-exported
   today — move QR schemas under `@mms/db/qr` (or `apps/qr`) so the `@mms/db` root is genuinely shared. The
   QR-specific domain types (`CartItem`/`CartTotals`/`TaxCategory` — dine-in line-state, fulfillment routing)
   are **not** delivery's model and stay QR-scoped.

This keeps QR working unchanged (it just imports its bound client) and gives delivery a typed client the same
way, each against its own project. **Do P5.0 as its own gated PR _before_ the delivery clone** so QR's full
gate proves the refactor in isolation (no delivery noise).

## CI & tooling: the second-stack problem

`.github/workflows/ci.yml` `migrations-check` + `types-fresh` boot **one** local Supabase stack, apply
`supabase/migrations/**` + `seed.sql`, and diff `packages/db/src/database.types.ts` byte-for-byte. Adding
delivery breaks this assumption (its migrations aren't QR's; its types are a second file). Options:

- **(Recommended) Per-app matrix.** Split migrations into `supabase/qr/migrations/**` +
  `supabase/delivery/migrations/**`; the CI job runs a matrix over apps (changed-path-aware), each booting
  its own stack and diffing its own `database.types.<app>.ts`. Cleanest long-term; mirrors the
  two-project reality.
- **(Bridge) Keep delivery migrations external** until P5 is stable, validating only QR in CI, then fold
  delivery's migration history in via a dedicated PR. Lower upfront churn; leaves delivery DDL unguarded in
  the monorepo meanwhile.

Vercel: delivery gets its **own** project (Root Directory `apps/delivery`) + `apps/delivery/vercel.json` with
`ignoreCommand: "npx turbo-ignore @mms/delivery"`, mirroring `apps/qr/vercel.json:3`. Each Vercel project
carries its **own** Supabase env (so the shared `NEXT_PUBLIC_SUPABASE_*` names resolve per-app — no collision
in prod; the only collision is **local dev**, where the existing inline-env-override pattern from
`docs/HANDOFF.md` "Environment facts" applies per app).

## Rewards unification is a separate, post-M5 design (not an M5 blocker)

M4 built a **QR-local** ledger (`mms_rewards`/`mms_reward_tiers`/`mms_rewards_config`, earn via
`qr_orders.earned_by` + `mms_reward_on_fulfill`) deliberately mirroring delivery's live `loyalty_rewards`
"so M5 unifies without a rename" (`docs/M4_DESIGN.md:19-44`). But with **two separate databases**, a single
shared wallet is a **cross-project data problem, not a code move** — and the M5 roadmap is code-only. So:

> **M5 ships with two reward ledgers.** A person earns QR Stars on QR and delivery Stars on delivery; they do
> not yet sum. This is a known, documented limitation — surface it honestly, do not promise a unified wallet.

Unification is **"M5a"** (a follow-up design call), with at least three shapes to weigh: a scheduled
cross-project ETL keyed on a reconciled identity; a small rewards aggregation service both apps read; or a
shared/replicated rewards store (a tier-cost + identity-reconciliation question). Pick when M5 lands — it
needs its own threat model (identity matching across two anon/account spaces is the hard part).

## Slice plan (one slice = one gated PR)

- **P5.0 · `@mms/db` multi-project restructure** _(prep; do FIRST, QR-only gate)_ — extract the generic
  client factory; split types per app (QR file now, delivery file lands in P5.2); namespace QR schemas off the
  `@mms/db` root (audit P2). QR imports updated to its bound client. **Exit:** QR builds/typechecks/`types-fresh`
  green with zero behavior change; `@mms/db` root exports only the shared contract.
- **P5.1 · Clone delivery → `apps/delivery`** — `git clone` the delivery repo into `apps/delivery`, drop its
  `.git`, dedupe deps to root (pnpm single-version), wire its scripts into turbo. No behavior change; it builds
  standalone in the monorepo against its own env.
- **P5.2 · Wire delivery to the shared layer** — point delivery's Supabase client at the `@mms/db` factory
  bound to `database.types.delivery.ts` + delivery env; adopt `@mms/ui` tokens (`tokens.css`) + `@mms/config`;
  share the Stripe account wiring. Fold delivery migrations into the CI matrix (per §CI).
- **P5.3 · Second Vercel project + CI** — `apps/delivery/vercel.json` + a second Vercel project (Root
  Directory `apps/delivery`, turbo-ignore); confirm the per-app CI matrix is green for both.

**Exit (M5):** both apps build/deploy from the monorepo, sharing packages + the one Stripe account, each on
its own Supabase project (no DB merge); `types-fresh`/migrations-check green per app.

## Threat model & risks (rank-ordered)

1. **Env/project cross-wiring (P0).** A delivery deploy reading QR's env (or vice versa) = one app writing the
   other's DB. Mitigation: per-app bound clients + per-Vercel-project env; never a shared module-load env read.
   Verify each app's client resolves its own `project_ref` in a smoke test before prod.
2. **Type/schema mismatch (P0).** Forcing delivery onto QR's `Database` type mis-types every query + breaks
   RLS at runtime. Mitigation: per-app generated types; `@mms/db` root never re-exports QR's `Database` as
   "the" Database.
3. **CI single-stack assumption (P1).** `types-fresh`/migrations-check silently validate only one schema.
   Mitigation: per-app matrix (above) — otherwise delivery DDL ships unguarded.
4. **Dep-version skew on the clone (P1).** Delivery's pinned next/react vs the root single-version overrides
   (`pnpm-workspace.yaml`) — a mismatch breaks the shared install. Mitigation: dedupe to root pins in P5.1;
   expect a few peer-dep fixups.
5. **Rewards-wallet honesty (P2).** Don't let copy imply a unified wallet pre-M5a (§5).
6. **Stripe webhook routing.** Two apps, one account → ensure each app's webhook endpoint filters to its own
   PaymentIntents (metadata/`cartId` shape) so a delivery event can't reach QR's `mms_fulfill_order` and vice
   versa. Audit both webhook handlers' event-ownership guards in P5.2.

## Open decisions for Min (surface before P5.0)

1. **`@mms/db` scope** — the recommended generic-factory + per-app-types restructure (more unification, one
   client idiom) vs. the minimal "delivery keeps its own DB layer; share only UI/config/tooling/Stripe" (less
   refactor, faster, but two client idioms). _Recommendation: the generic factory — it's a contained P5.0 and
   pays off at M6 (Terminal/kiosk touch both apps)._
2. **CI** — per-app matrix now (recommended) vs. bridge (delivery migrations external until stable).
3. **Rewards unification timing** — confirm it's **post-M5 (M5a)**, shipping M5 with two ledgers + honest copy.
4. **Delivery migration history** — does the live delivery project even use file-based migrations we can fold
   in, or is it dashboard-managed? Determines whether `supabase/delivery/migrations/**` is a real import or a
   baseline snapshot. _Needs a look at the delivery repo at P5.1._
