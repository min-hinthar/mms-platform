# Session Handoff — MMS Platform (2026-06-21)

The originating chat context does not carry across sessions — **this file is the durable pickup point.**
Read it alongside [`docs/context/INDEX.md`](context/INDEX.md) (research map — decisions, QA gate, rubric,
red-team, v7.2 prototype), [`ROADMAP.md`](../ROADMAP.md), [`.claude/LEARNINGS.md`](../.claude/LEARNINGS.md),
[`CHANGELOG.md`](../CHANGELOG.md), and [`docs/BACKEND_ARCHITECTURE.md`](BACKEND_ARCHITECTURE.md).
**M1 + M2 + M3 are complete.** P3.4 abuse limits shipped this session (the migration is on live). **Next
up: the service-model track — S1 (staff & floor)** — see the build order `M1 → M2 → M3 → S1 → S2 → S3 →
M4 → S4 → M5 → M6` in `ROADMAP.md` and [`docs/context/ORDER-MODEL.md`](context/ORDER-MODEL.md).

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
- **M3 (group cart — multi-device) ✅ — P3.1–P3.4 shipped + merged:**
  - **P3.1 multi-device join** (#25): `qrCode` doubles as the join key (scanned sticker `?t=` or a
    server-minted 8-char invite `?j=`); partial unique index `table_sessions_active_qr_uniq` makes
    concurrent joiners converge on ONE session; presence guest list (`useGroupCart`, sanitized on
    ingest, keyed by the stable seat). Join model = **both (sticker primary)**.
  - **P3.2 live group-cart sync** (#26): Postgres Changes on `qr_carts`/`qr_cart_items` → consumers
    re-fetch the server-authoritative `getCartView` (keyed React state, never client math); `replica
identity full` for DELETE filtering; announce a peer's ADD only (by_seat).
  - **P3.2-lock cart-lock-at-pay** (#27): `locked`/`locked_at`/`locked_by` (TTL auto-release, re-acquire
    by the same payer); one atomic conditional UPDATE; the existing `locked` guard in every mutation.
  - **P3.3a split-the-bill foundation** (#28): Even/By-person UI on `/cart` + per-line assignment;
    `canMutate(line_state, actor_role, isOwner)` (host any line / guest own-only); optimistic
    cent-reconciled shares (`lib/split-math`). Schema-free.
  - **P3.3b split-tender** (#31, **Option A: authorize-all → capture-together**): each diner authorizes
    their server-derived share on a `capture_method:manual` PaymentIntent (`create-share-intent`,
    per-payer tip); the webhook captures all when the last authorizes → `mms_fulfill_split_order` (one
    order, idempotent) → release the freeze; abort/decline cancels the holds; `qr_cart_shares` ledger +
    `settle_at` table-wide freeze (mutually exclusive with the single-pay lock); live `SettlementBoard`
    (realtime + 5s poll backstop). Tax weighted by each seat's **taxable** base, service by **net**.
    Hardened across **three** adversarial passes (foundation, server flow, pre-merge) — the
    "never charged-with-no-order" invariant holds, fail-loud on the residual.
  - **P3.4 abuse limits** (this session): generic per-**seat** rate limiter (`rate_events` +
    `mms_rate_limit`, count-first/self-GC) on `/api/session` join (30/min) + every cart mutation incl.
    both pay routes (120/min), **fail-open**; party cap **12** via an advisory-locked `session_members`
    `BEFORE INSERT` trigger (`mms_enforce_party_size`) + friendly route 409 + cap-aware Invite UI;
    background `mms_sweep_expired_sessions()` on **pg_cron** (15-min, guarded for local CI); RLS
    membership **negative tests** (`supabase/tests/rls_membership_test.sql`, in CI + verified live).
    Migration `20260621000000` applied to live, advisor-clean. Adversarial subagent **PASS**.
- **Two fixes rode alongside M3 this session:**
  - **Dine-in session-expiry recovery** (#29): the 4h TTL stranded in-use tables ("Couldn't add that")
    because the mint found a session by `status='active'` only while authz/RLS reject on `expires_at`.
    Fix: sliding renewal on any authorized touch + rejoin; mint sweeps a stale session + re-mints;
    client re-mints on a failed op (honest renewed-vs-timed-out copy). Schema-free.
  - **Production error tracking** (#30): PostHog server-side capture (`instrumentation.ts onRequestError`,
    non-PII context) + branded `error.tsx`/`global-error.tsx` boundaries; client capture was already on.
    PostHog-only (Sentry would be redundant).
- **All M2 + M3 migrations are applied to the live QR project** (`fasnpdhtvqtzjlvruqcu`) + advisor-clean
  (only the intentional `rls_enabled_no_policy` INFO on the default-deny tables). **P3.3b's
  `20260620001000_split_tender` was applied to live mid-session** because the PR preview shares the live
  DB — a migration-requiring branch is broken on its preview until the (additive) migration lands on live
  (LEARNINGS — the inverse of "CI green ≠ applied").

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
3. **Staff sign-in + email — Resend.** Staff log in three ways, all resolving to the `staff.email`
   allowlist (`docs/ENV.md` "Staff sign-in"):
   - **Google OAuth (primary, NO email/SMTP needed — the recommended path):** Google Cloud OAuth web
     client (redirect URI `https://fasnpdhtvqtzjlvruqcu.supabase.co/auth/v1/callback`) → Supabase → Auth
     → **Providers → Google** (paste ID/secret) → add redirect URL
     `https://qr.mandalaymorningstar.com/staff/auth/callback`. This sidesteps the SMTP mess entirely.
   - **Bootstrap the first owner:** sign in once with Google (mints the auth user; bounced as non-staff),
     copy your UID from Auth → Users, then `insert into public.staff (user_id, email, role, display_name)
values ('<uid>','you@…','owner','Min');` → refresh `/staff`.
   - **Magic-link/OTP — via the Supabase Send-Email Hook (preferred, NO SMTP):** Supabase → Auth →
     **Hooks → Send Email Hook** → HTTPS, URL `https://qr.mandalaymorningstar.com/api/auth/send-email`,
     put its secret (`v1,whsec_…`) in `SEND_EMAIL_HOOK_SECRET`. The app renders a **React Email**
     template (code-prominent — dodges the link-prefetch `otp_expired` we saw) and sends via Resend, so
     there's no SMTP to misconfigure (this replaces the Gmail-`534`/429 mess). Needs `RESEND_API_KEY` +
     `RESEND_FROM`. _(SMTP→Resend + a code-only `{{ .Token }}` template is the only-if-you-skip-the-hook
     fallback.)_
   - **Auth hardening (config):** ensure email **confirmations are ON** (or email/password signup
     disabled) so an unconfirmed address can't assert a staff email; restrict the Google provider to the
     workspace domain; disable automatic cross-provider linking. (App-side, `getStaffAuth` already
     requires `email_confirmed_at` before the email-allowlist match; a matching `email_verified` gate on
     the SQL `is_staff` read-surface is a follow-up for **S1.2** once the live JWT claim path is confirmed
     — without it, only the not-yet-built floor-view RLS read is exposed, never a write.)
   - **App transactional:** set `RESEND_API_KEY` + `RESEND_FROM` + `NEXT_PUBLIC_SITE_URL`
     (`https://qr.mandalaymorningstar.com`) in Vercel → staff invite/deactivation emails send via the
     SDK (`lib/email.ts`, best-effort via `after()`; unset keys = silently skipped, action still succeeds).
   - **Events webhook:** in Resend add a webhook → `https://qr.mandalaymorningstar.com/api/resend/webhook`
     and set its Svix signing secret as `RESEND_SIGNING_SECRET` → `/api/resend/webhook` verifies + flags
     bounces/complaints (masked logs) + PII-free PostHog deliverability events. (`RESEND_WEBHOOK` was
     provisioned but the code doesn't consume it — only the signing secret is needed.)

## Next: the service-model track — S1 (staff & floor) — S1.1a SHIPPED

Per the build order (`M1 → M2 → M3 → S1 → S2 → S3 → M4 → S4 → M5 → M6`) the service-model layer is in
progress. Read [`docs/context/ORDER-MODEL.md`](context/ORDER-MODEL.md) + the `ROADMAP.md` S-track for the
S1 exit criteria. **Staff auth = magic-link/OTP + a shared-tablet PIN** (Min's call): S1.1a builds the
magic-link foundation; S1.1b adds the PIN.

**S1.1a shipped (this session):** `staff` table + roles (server/manager/owner) + `is_staff()`/
`is_staff_at_least()` additive RLS (staff read **any** table session; diners unchanged) + `/staff` console
(OTP login, role-gated shell, owner-only `/staff/team` provisioning). Migration `20260621100000` applied to
live + advisor-clean; RLS verified behaviorally; adversarial subagent run pre-PR (all fixes landed).

**⚠️ Bootstrap the first owner (one-time, before `/staff` is usable):** there is deliberately NO self-serve
first-owner path. In the Supabase dashboard → Authentication → **Add user** (auto-confirm) for the owner's
email, then run once (service-role / SQL editor):
`insert into public.staff (user_id, role, display_name) values ('<that-auth-user-id>', 'owner', 'Min');`
After that the owner signs in at `/staff/login` (OTP) and provisions everyone else from `/staff/team`. (If
an over-deactivation ever locks owners out, recover the same way: `update public.staff set active=true …`.)

**Needs live smoke** (couldn't E2E without a real inbox this session): the OTP send/verify round-trip and
team provisioning (`createUser` + row, orphan-rollback). The build/RLS/advisors are green; the auth flow
needs one manual pass on a preview once an owner is bootstrapped.

**OTP resend-loop — diagnosed + half-fixed (the other half is config).** The "Too many code requests"
loop was NOT a hanging Send-Email Hook (auth logs show GoTrue's `/otp` durations are all sub-second). It's
GoTrue's own **`over_email_send_rate_limit`** (429) — its email rate limit, which fires _before_ the hook,
so it's unrelated to Resend's quota. Two parts: (a) **code fix (shipped):** `StaffLogin`'s resend cooldown
was reset on _every keystroke_, so editing the email even one char wiped the 60s gate → instant re-tap →
trip the limit; the cooldown is now scoped to the address it was sent to and a 429 steers to Google +
honest copy (no false "wait a minute"). (b) **config (Min must do):** raise Supabase → Auth → **Rate
Limits → "Rate limit for sending emails"** (`docs/ENV.md` "Staff sign-in"); until then, **Google OAuth is
the reliable path** (no email, never rate-limited). _Deferred (no evidence it's needed): a fail-fast
timeout on the Resend send in the hook — a hung send WOULD hang the hook → GoTrue retry storm, but the
logs show sub-second sends, so it's hardening, not the bug._

**S1.1b next (PIN):** per-person PIN on a shared floor tablet — server-verified hash, rate-limited with
lockout, rotatable; it's the SAME PIN primitive S2's manager step-up reuses. Then **S1.2 floor view**
(staff realtime needs an `is_staff()` branch on the `realtime.messages` policies — deferred from S1.1a).

**Tracked / deferred (non-blocking, carry forward):**

- **S2 must privatize the realtime cart/shares channels before adding broadcast.** The `cart:`/`shares:`
  channels (`lib/realtime.ts`) are non-private — RLS-safe for postgres-changes today, but a `.send()`
  (e.g. a KDS/staff push) requires `{ config: { private: true } }` + a `realtime.messages` policy for
  `cart:*`/`shares:*` (mirroring `rt_member_read`), since table RLS doesn't cover broadcast. Load-bearing
  comments are in place; this is the S2 to-do.
- **Split-fulfill amount reconcile is tautological → fix WITH S4.3.** `mms_fulfill_split_order` compares
  Σ(share amounts) against a value derived from the same rows; not exploitable today (each share's
  `amount_cents` == its PI amount, client can't tamper), but it becomes load-bearing the moment S4.3 adds
  **partial capture** — then reconcile against Stripe `amount_received`.
- **Split share-math: P3.3a display vs P3.3b tender can diverge** (by-person + unassigned/mixed-tax) — the
  `/cart` SplitSection reference number can differ by cents from the authorized amount. Compute the display
  from `deriveShareBreakdowns`, or label it "approximate". (Tender is authoritative; the divergence is a
  display-honesty polish.)
- **Cross-owner line delete is host-only with no confirm** — QA §D accepts host-only as the alternative to
  a confirm; revisit if product wants a confirmation step.
- **P3.4 Low:** a mutate-rate 429 in `TableCartProvider.add` shows the session-recovery copy
  ("Reconnecting…") rather than a throttle message — self-correcting; precise copy needs a result
  discriminant (thrown Server Action errors are redacted in prod). 120/min is far above human use.
- **P3.3b follow-up:** the `onShareCaptured` `wasOpen` TOCTOU → a possible **duplicate analytics event**
  under a sub-ms double `succeeded` delivery (money unaffected — QBO upsert idempotent).
- **`charge.refunded` is unhandled platform-wide** (single-pay AND split) → owned by the **S4.3** seam
  (line-level refunds).
- **M1-money (from the M0–M2 red-team):** `getCartTotals` infers a line's taxability from `tax_cents>0`,
  so a sub-6¢ taxable SKU (where `round(price×0.0975)=0`) would be treated as exempt — no real MMS SKU is
  that cheap, but the clean fix carries an `is_taxable`/category onto the cart line rather than the rounded
  proxy (small data-model change). Also: order-level `qr_orders.tax_cents` (aggregate-rounded on the
  discounted base) won't sum-match the per-unit-rounded line `tax_cents` snapshots — the **charge is
  correct**; only a receipt that sums line tax disagrees by a cent or two. Both deferred (latent/cosmetic).
- **QBO production-activation** (already on the `docs/QBO_SYNC.md` checklist): Intuit refresh-token rotation
  on each exchange + a per-order advisory lock for the drain (`processPendingQboSyncs`) before
  `QBO_ENV=production`. Off by default today; no action for S1.

**Build to v7.2 + the bars.** `docs/prototype/v7.2.html` is the design source; hold every screen to
QA-CHECKLIST §A / RUBRIC ≥4.3 in the **first commit** (tokens, motion, a11y, brand voice). Read
`docs/context/INDEX.md` (RUBRIC · DESIGN-RESEARCH · QA-CHECKLIST · RED-TEAM) at the START of the phase.

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
