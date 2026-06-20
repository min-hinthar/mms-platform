# Session Handoff — MMS Platform (2026-06-20)

The originating chat context does not carry across sessions — **this file is the durable pickup
point.** Read it alongside [`docs/context/INDEX.md`](context/INDEX.md) (the research map — decisions,
QA gate, rubric, red-team, v7.2 prototype), [`ROADMAP.md`](../ROADMAP.md),
[`.claude/LEARNINGS.md`](../.claude/LEARNINGS.md), and [`docs/BACKEND_ARCHITECTURE.md`](BACKEND_ARCHITECTURE.md).

## Where we are

- **M1 (walking pay path) — code-complete + merged** (P1.1–P1.6). M1 infra is **sorted**: prod is
  public (Vercel Auth → "Only Preview Deployments") and env is wired; the nonce CSP is verified live.
  ⚠️ **Stripe key MODE:** prod currently has **live** keys, so a _test_ card is declined ("live mode,
  known test card"). For the M1 test-charge smoke, run prod on **test** keys (all three: publishable +
  secret + a **test**-mode `whsec_…`), then flip back to live for launch — or test locally via
  `stripe listen`. See `docs/ENV.md`.
- **M2 in progress.** **P2.1 promo codes — done + merged** (`mms_promo_*` SECURITY DEFINER fns;
  per-reason `applyPromo` result; migration `20260620000000`). **P2.2 pickup scheduling — done** (this
  session; PR on `claude/feat/m2-p2-pickup-scheduling`): capacity-limited slots + server `fire_at` (the
  S2 KDS seam) + `/track` echoes the chosen slot; `mms_pickup_slots`/`mms_set_pickup_slot` (migration
  `20260620000100`). Both M2 migrations are **applied to the live QR project**. **Durable lessons (in
  LEARNINGS):** (1) `revoke … from public` does NOT lock a fn from anon/authenticated — Supabase grants
  them too; revoke all three + verify `has_function_privilege` + `get_advisors`. (2) CI green ≠
  migration applied to live — apply + verify after merge. (3) Capacity-limited slots must count
  in-progress **holds** (open carts), not just paid rows, + a per-slot advisory lock + an exclude-self
  arg. **To regen types / test migrations locally:** download the pinned `supabase` CLI (2.107.0) from
  GitHub releases, `sudo dockerd &`, `supabase start -x edge-runtime,…` (the pg-delta TLS error is
  benign). **Next M2:** P2.3 grocery session · P2.4 QBO sync.
- **P1.6 shipped (this session):** `apps/qr/proxy.ts` (Next 16's `middleware` rename) emits a
  **per-request nonce CSP** with `'strict-dynamic'` and **no `'unsafe-inline'`** on `script-src`; the
  static nonce-free headers stay in `next.config.ts`; the root layout is `force-dynamic` so the nonce
  reaches every page's scripts (verified: nonce on all 18 `<script>`s, rotates per request, `/api`
  skipped). Server secrets now fail fast via `requireEnv` (`@mms/db/server.ts` + the webhook secret).
  `Permissions-Policy` fixed to `camera=(self)` (the grocery scanner needs it). `docs/ENV.md` is the
  Vercel env map. **If you add an external origin, allow-list it in `proxy.ts`.**
- **P1.3 shipped:** two-step checkout (review + tip → pay) — `Checkout.tsx` "Continue to payment"
  POSTs the member-gated `/api/stripe/create-intent` `{cartId, tipRate}`; `PaymentSection.tsx` mounts
  `<Elements>`/`<PaymentElement>` (appearance from `@mms/ui` tokens, light/Night) on the returned
  `clientSecret`; `confirmPayment` → `/track` (renders Stripe's `redirect_status`). Tip chips (v7.2),
  Apple/Google Pay via `automatic_payment_methods`, server-authoritative amount throughout.
  **Cart-lock-during-pay is deferred to the Realtime phase** (locking at intent-create strands an
  abandoned cart; the webhook amount-reconcile is the P1.3 guard — see `docs/REVIEW.md`). **Test mode
  only.** Needs `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` + `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`
  in Vercel (test keys) for the preview to mount the Element.
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

### P1.4 — Fulfillment end-to-end (the webhook + order record already exist)

- The webhook (`/api/stripe/webhook`) already signature-verifies, reconciles `getCartTotals` vs
  `intent.amount`, and calls `mms_fulfill_order` (idempotent on the PI id; writes `qr_orders` +
  `qr_order_items`, flips the cart to `paid`). P1.4 is the **end-to-end verification + polish**:
  confirm a test-mode PaymentIntent drives a `qr_orders` row; surface the order to the diner.
- **Gems stay deferred** — `loyalty_rewards.user_id` is `NOT NULL`; award on account-link (M4).

### P1.5 — Track timeline

- Replace `/track`'s P1.3 `redirect_status` confirmation with the live **placed → kitchen → ready →
  served** timeline + ETA via Supabase Realtime on `qr_orders` (member-gated read). Dine-in refill
  bell; pickup "I'm here." (The confirmation screen is already on-brand; build the timeline under it.)

### Deferred from P1.3 (track here)

- **Cart-lock-during-pay → Realtime phase.** Don't lock at intent-create (strands an abandoned
  cart); the lock only matters under concurrent group editing and wants the realtime sync's natural
  release point. The webhook amount-reconcile is the interim guard. See `docs/REVIEW.md`.

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
