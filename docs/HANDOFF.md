# Session Handoff — MMS Platform (2026-06-20)

The originating chat context does not carry across sessions — **this file is the durable pickup point.**
Read it alongside [`docs/context/INDEX.md`](context/INDEX.md) (research map — decisions, QA gate, rubric,
red-team, v7.2 prototype), [`ROADMAP.md`](../ROADMAP.md), [`.claude/LEARNINGS.md`](../.claude/LEARNINGS.md),
[`CHANGELOG.md`](../CHANGELOG.md), and [`docs/BACKEND_ARCHITECTURE.md`](BACKEND_ARCHITECTURE.md).
**Next up: M3 — group cart.**

## Where we are — M1 + M2 complete (merged)

The QR app is feature-complete through the solo pay path + tax/promos/scheduling/grocery + the QBO
accounting seam. Per-phase detail is in `ROADMAP.md` + `CHANGELOG.md`; the load-bearing facts:

- **M1 (walking pay path) ✅** — anon-auth session (`AnonAuthGate`/`useAnonSession`; `POST /api/session`
  mints a `table_session` + member + open cart and returns `cartId`), **one authz guard**
  (`apps/qr/lib/authz.ts`, `assertCartMember`) on every mutation, server-authoritative cart/tax/totals
  (`lib/cart.ts`/`lib/tax.ts`/`lib/totals.ts`, **cents end-to-end**), two-step checkout → Payment Element
  → signature-verified **idempotent** webhook (`mms_fulfill_order`) → `/track` live timeline via Realtime,
  nonce CSP (`apps/qr/proxy.ts`), fail-fast env (`requireEnv`).
- **M2 (tax · promos · scheduling · grocery · QBO) ✅ — all shipped THIS session:**
  - **P2.1 promos** (#18): `mms_promo_*` SECURITY DEFINER fns, per-reason `applyPromo`, migration `…0000`.
  - **P2.2 pickup** (#19): capacity slots counting **paid + live holds**, per-slot advisory lock,
    `fire_at` (the S2 KDS seam), `/track` echoes the chosen slot, next-day rollover. Migrations
    `…0100`/`0200` + the **same-day slot-alignment fix `…0300`** (anchor the grid at the _stable_ day-open,
    filter by `now+lead`; never anchor the series at `now+lead` — LEARNINGS).
  - **P2.3 grocery** (#21): Scan & Go now mints a real `useTableSession("scango")` session (not a client
    uuid); name-search fallback (`searchGroceryItems`) over public-RLS `grocery_items`.
  - **P2.4 QBO sync** (#22): paid order → QBO **Sales Receipt deposited to a Stripe clearing account**
    (two-ledger). Pure total-preserving mapper (`lib/qbo/mapping.ts` — throws unless Σ(lines) == charge),
    fail-safe idempotent client (`lib/qbo/client.ts`, a no-op unless `QBO_SYNC_ENABLED=true`),
    `qbo_sync_queue` ledger (migration `…0400`, RLS default-deny), webhook posts in `after()` so QBO never
    blocks the money path. **Off by default.** See `docs/QBO_SYNC.md`.
- **All M2 migrations are applied to the live QR project** (`fasnpdhtvqtzjlvruqcu`) + advisor-clean (only
  the intentional `rls_enabled_no_policy` INFO on the default-deny tables).

## ⚠️ Pending activation — needs Min (config, not code; like the Stripe live cutover)

1. **QBO sync ships dark.** Sandbox company **"Mandalay Morning Star"** is connected; the mapper's entities
   exist (recorded in `docs/QBO_SYNC.md` → `QBO_CUSTOMER_REF=126`, sales `740` (Non-Inventory), service
   `737`, tax `738`, tip `739`). Remaining (the connector can't do these): create a **Stripe Clearing** GL
   account, get the **realm id**, create an Intuit **Developer app** (`QBO_CLIENT_ID`/`SECRET` +
   `QBO_REFRESH_TOKEN`), set all in Vercel, `QBO_ENV=sandbox`, `QBO_SYNC_ENABLED=true`, run one test order.
   QBO UI cleanups: **deactivate** the old Service-typed "QR Sales" (736); **remap** "QR Sales Tax"/"QR Tip"
   to liability accounts.
2. **Stripe live webhook + keys** at production cutover (`docs/ENV.md` "Wiring Production"). ⚠️ Prod
   currently has **live** Stripe keys → a _test_ card is declined; for a test-charge smoke, run prod on
   test keys (incl. a test-mode `whsec_…`) or use `stripe listen`.

## Next: M3 — Group cart (multi-device) — what to build & what ALREADY exists

**Exit (ROADMAP M3):** two phones at one table order together; only members read/mutate; host lock holds.

- **P3.1** Join flow: scan → session → guest list (presence). ⬜
- **P3.2** Realtime broadcast of cart changes; server-authoritative merge. ⬜
- **P3.3** Per-person split + assignment; host lock/remove with `canMutate` parity to the prototype. ⬜
- **P3.4** Abuse limits: rate limits, session expiry, RLS membership tests. ⬜

**The foundation is already in place — M3 is mostly Realtime wiring + UX, not new auth/schema:**

- **Sessions + membership already exist.** `/api/session` find-or-joins a `table_session` (sets
  `host_seat`, idempotent membership, returns `role: host|guest`); `session_members` + the `is_member`/
  `is_host` RLS helpers keyed on `seat_id = auth.uid()` shipped in the **init** migration. A second phone
  POSTing the same `qrCode` already becomes a `guest` member of the same session + cart. So P3.1 is largely
  the **guest-list UX + presence**, not new backend.
- **Realtime is authorized by table RLS.** Private-channel policies on `realtime.messages` are in the init
  schema; `qr_orders` is already in the `supabase_realtime` publication (P1.5 `track_realtime`). Postgres
  Changes are gated by RLS when the client calls `supa.realtime.setAuth(accessToken)` (LEARNINGS #48). To
  broadcast cart changes (P3.2), add `qr_carts`/`qr_cart_items` to the publication (guarded/idempotent `do
  $$
  … alter publication …`; not a schema change, so `types-fresh` won't drift). **Presence seat MUST be
  the stable session JWT seat, not a fresh `crypto.randomUUID()` per subscribe** (LEARNINGS #4 — ghosts).
  $$
- **The cart is already session-scoped, member-authz'd, and status-atomic**, so multi-writer is safe at the
  DB. What's missing is the realtime broadcast + an optimistic, server-authoritative **merge** (keyed React
  state, never an innerHTML rebuild — RED-TEAM #7 / QA-CHECKLIST), and the join/guest-list/split/host-lock
  **UX**.
- **Cart-lock-during-pay lands HERE** (deferred from P1.3 on purpose — locking at intent-create strands an
  abandoned cart; it wants the realtime sync's natural release point). `qr_carts.locked` + `is_host` already
  exist; wire the lock/unlock lifecycle + a `canMutate` gate with prototype parity (host holds the lock;
  guests see a read-only cart). See the deferred note in `docs/REVIEW.md`.
- **Build to v7.2.** `docs/prototype/v7.2.html` has the join, guest-list/presence, per-person split +
  assignment, and host-lock screens — match them (tokens, motion, a11y, brand voice) in the **first commit**
  to the QA-CHECKLIST §A / RUBRIC ≥4.3 bar. **Split math** must reconcile to the cent incl. promo + tax +
  service (QA-CHECKLIST).

## Environment facts (read before running anything)

- **QR runs on its OWN Supabase project** — `fasnpdhtvqtzjlvruqcu` ("MMS QR Platform", org
  `iqphcmcmbydhkssfhrdt`), separate from the live **delivery** app (`ukuzkhuppqwtrdkjqrkv`). No
  shared-project blast radius; the catalog is owned here (`tax_category` is a column).
- **App env** (set in Vercel by Min): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` _or_
  `…_PUBLISHABLE_KEY` (both accepted), `SUPABASE_SERVICE_ROLE_KEY`, the Stripe + PostHog keys, and the QBO
  vars (`docs/ENV.md`).
- ⚠️ **This sandbox injects `NEXT_PUBLIC_SUPABASE_*` + `SUPABASE_SERVICE_ROLE_KEY` pointing at the DELIVERY
  project**, and Next lets real shell env override `.env.local` — so local `pnpm dev`/build hits **delivery**
  unless you inline-override:
  ```bash
  NEXT_PUBLIC_SUPABASE_URL=https://fasnpdhtvqtzjlvruqcu.supabase.co \
  NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable key> \
  pnpm --filter @mms/qr dev
  ```
- **Supabase MCP** is scoped per `project_ref` — target `fasnpdhtvqtzjlvruqcu`. Run `get_advisors`
  (security + performance) after every migration.
- **Anonymous sign-ins ENABLED** on the live project (verified against the auth endpoint). Leaked-password
  protection is Pro-only — that advisor WARN is accepted/benign.
- **Regen types via the pinned local CLI** (CI's `types-fresh` diffs it byte-identical): `sudo dockerd &`,
  download `supabase` **2.107.0** from GitHub releases, `supabase start -x
edge-runtime,studio,imgproxy,logflare,vector,mailpit` (the pg-delta/edge-runtime TLS error at boot is
  benign — migrations still apply), then `pnpm db:types`. The committed `database.types.ts` is the raw
  `--local --schema public` output, prettier-ignored.

## The loop (how every phase ships here)

- Build to v7.2 + the research bar in the **FIRST commit** (money/auth/RLS/tokens/a11y/error-paths). Run the
  **Pre-PR self-review sweep** (CLAUDE.md), ending with a **fresh-context adversarial subagent** (the Agent
  tool) across a11y · perf · security/privacy · product-UX — fix its findings, then **post its verdict as a
  PR comment**. CI runs only zero-token green stub checks; the in-session subagent **is** the review.
- Gate: `pnpm turbo lint typecheck build`. One phase = one PR on `claude/<type>/<slug>`;
  `enable_pr_auto_merge` (squash) lands it on green.
- **After a migration merges, APPLY it to the live project + verify the object state** (LEARNINGS #59 — CI
  green ≠ applied to live). New tables → RLS default-deny + `revoke select from anon, authenticated`; new
  SECURITY DEFINER fns → `revoke … from public, anon, authenticated` + `grant to service_role` (LEARNINGS
  #25/#58), then verify `has_function_privilege` + `get_advisors`.

## Verify

- Gate: `pnpm turbo lint typecheck build`
- Advisors: `get_advisors` (security|performance) on `fasnpdhtvqtzjlvruqcu`
- Local app smoke (with the override env above): `curl "localhost:3000/menu?mode=dinein"`

## Open decisions / notes

- **ESLint pinned 9.x** — ESLint 10 breaks `eslint-config-next`'s react plugin; flip when upstream is ready.
- **Staging project** — add one when QR has live traffic; today one project is dev+prod-in-one (so Preview
  and Production share the QR project until then — `docs/ENV.md`).
- **Tax nuance** — cold salads filed under `sides` inherit `hot_prepared`; confirm per-item and override
  `menu_items.tax_category` where a cold item is exempt to-go (e.g. `lemon-salad`).
- **`loyalty_rewards.user_id` is `NOT NULL`** — anon diners can't earn gems until an account link (M4); don't
  wire gem awards into `mms_fulfill_order` before then.
- `docs/DATA_RECONCILIATION.md` is **historical** (the delivery-owned-menu era); the catalog is owned here.
- **P1.2 follow-up (small, still open):** a modifier-customization sheet — `AddButton` adds the base item;
  for items with modifier groups, open a Radix `Sheet` with `role="radiogroup"` per group respecting
  `min_select`/`max_select`, then `addItem(cartId, id, modifierOptionIds)` (line-merge already keys on the
  normalized modifier set).
