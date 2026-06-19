# Session Handoff — MMS Platform (2026-06-18)

The originating chat context does not carry across sessions — **this file is the durable pickup
point.** Read it alongside [`docs/context/INDEX.md`](context/INDEX.md) (the research map — decisions,
QA gate, rubric, red-team, v7.2 prototype), [`ROADMAP.md`](../ROADMAP.md),
[`.claude/LEARNINGS.md`](../.claude/LEARNINGS.md), and [`docs/BACKEND_ARCHITECTURE.md`](BACKEND_ARCHITECTURE.md).

## Where we are

- **Milestone M1 (walking pay path).** Backend foundation, **P1.1 anonymous-auth wiring**, and now
  **P1.2 cart-create + line-merge + the cart flow** are done. Next up: **P1.3 Payment Element** →
  P1.4 fulfillment → P1.5 Track.
- **P1.2 shipped:** `POST /api/session` find-or-creates the session's open cart and returns `cartId`;
  `useTableSession` (per-device QR identity) + `TableCartProvider` drive the menu's `AddButton` +
  `CartBar`; `addItem` merges identical lines (item + normalized modifier set → qty bump);
  `getCartView` (member-gated) feeds the cart page (`Checkout`: steppers/promo/server totals,
  re-fetched, never client math). Pay CTA is a placeholder awaiting P1.3. _Follow-up:_ a
  modifier-customization sheet (Add currently sends the base item; respect modifier_groups
  min/max_select, `role="radiogroup"`).
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
- **Anonymous sign-ins**: **ENABLED on the live project** (`fasnpdhtvqtzjlvruqcu`) — verified
  2026-06-18 against the auth endpoint (anonymous `signup` returns a session with
  `is_anonymous: true`). Also set as code in `supabase/config.toml` for the local stack / CI.
  **Leaked-password protection is Pro-only** — accepted; that advisor warning is benign.
- **Local Supabase stack** boots in the sandbox (Docker) with `supabase start -x edge-runtime`
  (the edge-runtime container hits an rlimit/TLS wall here; we have no edge functions). That's how
  to regenerate types: `pnpm db:types` (stack up) → commits `database.types.ts`
  (raw `--local --schema public`; prettier-ignored — CI's `types-fresh` diffs it raw).

## Next tasks (in order)

### P1.3 — Payment Element (the cart UI from P1.2 is the mount point)

- In `apps/qr/components/Checkout.tsx`, replace the disabled "Continue to payment" CTA with the
  Stripe Payment Element: `loadStripe(NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)` → POST
  `/api/stripe/create-intent` `{ cartId, tipRate }` (already member-gated, returns
  `{ clientSecret, totals }`) → `<Elements options={{ clientSecret, appearance }}>` +
  `<PaymentElement/>` → `stripe.confirmPayment({ return_url: /track?... })`.
- **Tip selector** (e.g. 0/15/18/20%) → `tipRate`; a changed tip re-creates the intent (the
  idempotency key `pi_{cart}_{amount}` already makes a new amount a new intent). Show the
  tip-inclusive grand total from the intent response.
- Apple/Google Pay surface via the Payment Element. **Test mode only** — no real card until the M1
  gate (`docs/REVIEW.md`) is fully green. (`create-intent` + the webhook reconcile already exist.)

### Then P1.4+ (see ROADMAP): fulfillment end-to-end → Track timeline.

### P1.2 follow-up (small)

- **Modifier-customization sheet** — `AddButton` currently adds the base item with no modifiers. For
  items with modifier groups, open a `Sheet` (Radix, from `@mms/ui`) with `role="radiogroup"` per
  group, respecting `min_select`/`max_select`, then call `addItem(cartId, id, modifierOptionIds)`.
  Line-merge already keys on the normalized modifier set, so customized variants stay distinct.

## CI / infra follow-ups — DONE (2026-06-18)

- ✅ **Anonymous sign-ins enabled on the live project** (verified — see Environment facts).
- ✅ **`adversarial` + `adversarial-signed-off` labels created.** The `adversarial-pr` gate reads the
  verdict from the agent's execution log via an EPIPE-proof bash `case` match (see LEARNINGS), so
  normal PRs pass automatically. A PR that edits a `claude-*`/`adversarial-*` workflow (its own
  review is skipped, anti-tampering) is signed off with the `adversarial-signed-off` label **or** a
  collaborator (OWNER/MEMBER/COLLABORATOR) PR comment containing `ADVERSARIAL_SIGNOFF`.
- ✅ **Prettier doc drift fixed** (PR #5) — `pnpm format:check` is clean; `docs/prototype/v7.2.html`
  is prettier-ignored as a vendored reference.
- ✅ **Repo auto-merge enabled** — future PRs can `enable_pr_auto_merge` to merge on green.

Nothing infra-blocking remains for P1.2.

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
