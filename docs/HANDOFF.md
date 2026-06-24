# Session Handoff — MMS Platform (2026-06-24)

The originating chat context does not carry across sessions — **this file is the durable pickup point.**
Read it alongside [`docs/context/INDEX.md`](context/INDEX.md) (research map — decisions, QA gate, rubric,
red-team, v7.2 prototype), [`ROADMAP.md`](../ROADMAP.md), [`.claude/LEARNINGS.md`](../.claude/LEARNINGS.md),
[`CHANGELOG.md`](../CHANGELOG.md), and [`docs/BACKEND_ARCHITECTURE.md`](BACKEND_ARCHITECTURE.md).
**M1 + M2 + M3 + S1 + S2 + S3 + M4 + S4 are all complete and merged.** Build order `M1 → M2 → M3 → S1 → S2 →
S3 → M4 → S4 → M5 → M6` in `ROADMAP.md`. **Next: M5 — RESHAPED 2026-06-24.** M5 is **no longer a migration**:
the two apps stay **separate repos** and the younger **QR** app **learns from** the live **delivery** PWA
(adopts its hardened mobile/iOS + a11y patterns, a motion/perf discipline layer, a reusable primitive library
built to QR's tokens, and a contrast-audit test). Why the change: the shared-`@mms/ui` payoff is unrealized
while the apps run different design lineages (QR's tokens are the cleaner base — keep them); delivery's real
value is **craft + learnings** (a transfer, not a repo merge); and the migration would **force-bump a live
production app** (regression risk — the #1 frustration). Full-repo co-location is **reconsidered at M6**. **Read
[`docs/M5_DESIGN.md`](M5_DESIGN.md)** (the reshaped design-of-record) + **[`docs/QR_FROM_DELIVERY.md`](QR_FROM_DELIVERY.md)**
(the prioritized transfer backlog from two grounded audits). P5.0 (the `@mms/db` factory, #79) is retained as a
clean internal refactor. P5.1 = this reshape + the backlog (docs). Slices P5.2–P5.6 are the actual transfers.

> **S4 — unified basket & fulfillment routing — COMPLETE (PRs #71–75, all merged + applied to live).**
> **S4.1** (#71, `20260623100000`) — per-line `qr_cart_items.fulfillment` (dinein/togo/grocery) drives BOTH
> routing and tax; `mms_set_line_fulfillment` (TOCTOU-fixed: re-asserts open+draft+not-grocery in the UPDATE
> WHERE). **S4.2** (#72, `20260623220000`) — per-line fire routing: `mms_fire_cart` fires only
> `fulfillment='dinein'`; `mms_fire_line` (togo make-it-now, guards in WHERE); `mms_fire_pending_food` (fires
> draft food of a PAID dinein cart at checkout) + KDS fulfillment subset + ready signal. **S4.3a** (#73,
> `20260624000000`) — to-go fulfillment loop: `qr_orders.togo_status` (preparing/ready/picked_up) +
> `qr_order_items.fulfillment` snapshot; `mms_init_togo_status`/`mms_set_togo_status`; the bagging/**expo**
> station `/staff/expo` + "to-go ready" signal. **S4.3b** (#74, `20260624010000`) — line-level **refunds**
> (money-out): `mms_refunds` ledger (unique stripe_refund_id + partial-unique on order_item_id, RLS-on,
> manager-read), `mms_approvals.kind` gains `'refund'`; `mms_refund_authorize`/`mms_record_refund`/
> `mms_apply_refund_reconcile`; manager-facing `/staff/orders` surface + `RefundActionSheet` + self-PIN
> step-up; `charge.refunded` webhook reconcile (fetches `refunds.list({charge})` — `charge.refunds` is NOT
> auto-expanded on Stripe apiVersion `2026-05-27.dahlia`). **S4.3c** (#75, `20260624020000`) — the EBT
> split-tender **seam** (data model only): `qr_order_items.ebt_eligible` + `mms_snapshot_ebt_eligibility`
> (marks grocery lines whose catalog item is EBT-eligible, in the settlement after() drain) — the 2027 Forage
> tender becomes a tender-time branch, not a rewrite. The 3 settlement after() drains (card webhook single +
> split, cash settle) chain `mms_fire_pending_food` → `mms_init_togo_status` → `mms_snapshot_ebt_eligibility`.
> **Design-of-record:** [`docs/S4_DESIGN.md`](S4_DESIGN.md). **All 5 migrations applied to live + advisor-clean.**

> **⚠️ S4 deep audit shipped — [`docs/S4_AUDIT.md`](S4_AUDIT.md)** (6 parallel adversarial auditors; money/tax,
> auth/RLS/IDOR, concurrency, M5/M6 seams, a11y/UX, schema/debt). **Verdict: structurally sound, security a
> clean PASS — but the fast build left real defects.** **Remediation SHIPPED (PR #77, `20260624030000`,
> applied to live + advisor-clean + dual-adversarial):**
>
> - **P0-1 (money BLOCKER) ✅** — `mms_refund_authorize` under-refunded qty>1 taxable lines (per-unit tax
>   added once); now the line's **pro-rata share of order tax** (scales with qty). **P1-1 ✅** — refund is
>   **discount-aware** (discounted goods + tax on the discounted base, mirrors `totals.ts`) + an **order-level
>   over-refund cap** (Σ refunds ≤ net+tax). UI shows the server-derived `refundableCents`.
> - **P1-2 ✅** — fire-at-checkout durable backstop: `mms_reconcile_settled_fulfillment` pg-cron (5-min) +
>   the 3 settlement `after()` paths split into independent try/catch.
> - **P1-3 ✅** — `mms_undo_fire` keys on a `fire_batch` (threaded send→client→undo), race-free; never claws
>   back a guest's make-it-now line. (`mms_fire_cart` now returns `(fired, batch, fire_deadline)`.)
> - **P1-4 ✅** — `charge.refunded` backstop 5xxs on a list/record failure (Stripe redelivers) instead of
>   swallowing → no >24h re-refund double-pay.
> - **P0-2 (M5 doc blocker) ✅** — topology reconciled (own project; shared packages + one Stripe account).
> - **Still open (deferred, NOT blockers):** **P1-5** (`RefundActionSheet` → canonical `Sheet` + a `--scrim`
>   token, a11y) · **P1-6** (refunded orders in `/account` history) · the **P2 debt** (indexes; Checkout live
>   regions; dead `docs/REVIEW.md`; no S4 LEARNINGS; `@mms/db/schemas.ts` QR-only but root-exported — **fold
>   the namespace into the M5 package restructure**; S4.1 bare `create function`).
> - **M6 carry-forward (not S4 defects):** EBT is the deferred split-refund's twin (2027 needs a Forage tender
>   column + a tender↔line-subset association on `qr_cart_shares`); SNAP tax exemption is a tender-time fact the
>   single per-line snapshot can't represent (needs an adjustment entry + scan-time eligibility); `/track` needs
>   a session-less signed-order-token path for kiosk/Terminal walk-ups; Terminal must route through the
>   settlement mutex or the double-collect guard has a hole.

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
   - **Auth hardening — ⚠️ STILL REQUIRED (S1-audit B1 binding backstop):** on the **live** project,
     **disable public email/password signup** (staff are admin-provisioned; diners use anonymous sign-in —
     neither needs it) **or** turn email **confirmations ON**; restrict the Google provider to the workspace
     domain; disable automatic cross-provider linking. The SQL side is now **CODE-FIXED** (migration
     `20260622000000`): `is_staff()`/`is_staff_at_least()` no longer trust the raw JWT `email` claim — the
     email branch resolves via `staff_session_email_match()` (reads `auth.users`, requires
     `email_confirmed_at` + a provider-verified OAuth identity, never `provider='email'`). **But** under
     confirmations-OFF auto-confirm, the `provider <> 'email'` guard is what holds the RLS layer, so the
     config above is the durable control — do it before the live cutover. (See `docs/S1_AUDIT.md` §B1.)
   - **App transactional:** set `RESEND_API_KEY` + `RESEND_FROM` + `NEXT_PUBLIC_SITE_URL`
     (`https://qr.mandalaymorningstar.com`) in Vercel → staff invite/deactivation emails send via the
     SDK (`lib/email.ts`, best-effort via `after()`; unset keys = silently skipped, action still succeeds).
   - **Events webhook:** in Resend add a webhook → `https://qr.mandalaymorningstar.com/api/resend/webhook`
     and set its Svix signing secret as `RESEND_SIGNING_SECRET` → `/api/resend/webhook` verifies + flags
     bounces/complaints (masked logs) + PII-free PostHog deliverability events. (`RESEND_WEBHOOK` was
     provisioned but the code doesn't consume it — only the signing secret is needed.)

## S1 (staff & floor) COMPLETE — S1.1a + S1.1b + S1.2 + S1.3 + S1.4 SHIPPED · Next: S2

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

**Smoke-tested on preview ✅** (this session, real inbox): Google OAuth round-trip and the email
magic-link/OTP send + in-page verify both work end-to-end on the PR-43 preview. Team provisioning
(`createUser` + row, orphan-rollback) still wants one live pass once an owner is bootstrapped, but the
auth path itself is confirmed.

**OTP resend-loop — FIXED (code, #43, preview-verified) + one config step left for Min.** The "Too many
code requests" loop was NOT a hanging Send-Email Hook (auth logs show GoTrue's `/otp` durations are all
sub-second). It's GoTrue's own **`over_email_send_rate_limit`** (429) — its email rate limit, which fires
_before_ the hook, so it's unrelated to Resend's quota. Two parts: (a) **code fix (shipped #43):**
`StaffLogin`'s resend cooldown was reset on _every keystroke_, so editing the email even one char wiped the
60s gate → instant re-tap → trip the limit; the cooldown/block is now scoped to the address it was sent to,
the honest 60s "Resend in Ns" countdown shows only after a _successful_ send, and a 429 blocks the address
and steers to Google (no misleading "wait a minute" that re-enables into the hourly cap). (b) **config (Min
must do):** raise Supabase → Auth → **Rate Limits → "Rate limit for sending emails"** (`docs/ENV.md` "Staff
sign-in"); until then, **Google OAuth is the reliable path** (no email, never rate-limited). _Deferred (no
evidence it's needed): a fail-fast timeout on the Resend send in the hook — a hung send WOULD hang the hook
→ GoTrue retry storm, but the logs show sub-second sends, so it's hardening, not the bug._

**S1.1b shipped (this session, PIN):** per-person shared-tablet **PIN** — bcrypt hash in a service-role-only
`staff_pins` table (NOT a `staff` column: `staff` is client-readable, so a hash column would leak — separate
default-deny table keeps it off every read surface); atomic `mms_staff_verify_pin` (advisory-locked,
**5-try / 15-min lockout**, lapsed-lock grants fresh budget) — the SAME primitive S2's manager step-up
reuses; **fail-CLOSED** app wrapper (`lib/staff-pin.ts`); keyed by the resolved staff-row PK
(`StaffCaller.staffId`, not the session uid). Self-service set/rotate/remove at `/staff/profile`
(`PinManager`, trivial-PIN rejection); a shared-tablet **lock** (`/staff/lock`, `LockButton`/`PinUnlock`) —
an httpOnly, path-scoped cookie the shell pages redirect on, documented as an **attribution/privacy
affordance, not a hard boundary** (the Supabase session + staff-row gate remain the real boundary; escapes:
"Forgot PIN? Sign out", lock refused without a PIN). Migration `20260621130000_staff_pin.sql` (additive),
types regenerated, gate green, adversarial subagent **PASS**.

**✅ `20260621130000_staff_pin.sql` is APPLIED to live (`fasnpdhtvqtzjlvruqcu`)** — applied via the Supabase
MCP after Min's go-ahead, then verified: `staff_pins` exists with RLS on + 0 policies (default-deny);
`anon`/`authenticated` have **no** SELECT on the table and **no** EXECUTE on any of the three `mms_staff_*`
fns (service-role only); bcrypt resolves at runtime under `extensions` (correct PIN matches, wrong
rejected); `get_advisors(security)` shows only the intentional `rls_enabled_no_policy` INFO on `staff_pins`
(it does NOT appear in the 0026/0027 GraphQL-exposure WARNs, confirming the anon/authenticated revoke took).
No further DB action for S1.1b.

**S1.2 shipped (this session, floor view):** live `/staff` floor (`FloorBoard`) of every active table —
party/status/running-subtotal-or-paid/last-activity — over **Postgres-Changes authorized by the existing
`is_staff()` SELECT RLS** (so NO `realtime.messages` change was needed; that's only for S2 staff
_broadcast_ — the postgres-changes READ path already saw staff via the `or public.is_staff()` folded into
each table policy). Read-only drill-down `/staff/table/[id]` (`FloorDetailLive`) shows the cart lines +
party. Staff **"Clear table"** turnover (`clearTable`, pulled forward from S1.4) closes the session +
cancels the cart, refusing mid-payment (fresh lock/settle **and** any `authorized`/`captured` split share);
logged non-PII via PostHog. Server layer `lib/floor.ts` (`getFloorView`/`getTableDetail`/`clearTable`, all
`requireStaff()`+service-role); `lib/useFloorRealtime.ts` (debounce + 5s poll backstop + self-heal).
**`qr_carts.updated_at` is never bumped** (no trigger; the cart RPCs don't write it) — so last-activity +
the detail live-refresh key off the latest `qr_cart_items` row, not that column (adversarial F1). Migration
`20260621140000_floor_realtime.sql` (publication add — no types impact). Gate green; adversarial subagent
PASS (F1/F2/F3 fixed pre-PR). **✅ `20260621140000` is APPLIED to live** — `table_sessions` +
`session_members` are on the live `supabase_realtime` publication (verified via MCP this session).

**S1.3 shipped (this session, staff write + cash settle):** staff order/edit a table order _for_ a guest +
**settle in cash** ("pay a human"), from the floor drill-down. The cart belongs to the **table**, not the
phone (ORDER-MODEL), so staff write the **same** ledger via the **same** server-authoritative pricing —
extracted to `lib/order-lines.ts` (`priceItem` + `insertOrIncLine`, shared with the diner `addItem` so
they can't drift); staff lines carry `by_seat = null`. Cash settle: `getCartTotals` (single tax engine,
`tip=0` off-system, SB-1524 service charge applied) → `mms_fulfill_cash_order` — **idempotent on `cart_id`**
(partial-unique), **atomic `open→paid` flip**, **subtotal-reconcile** (Σ lines in SQL vs passed breakdown).
A shared payment mutex (`lib/pay-guard.ts`, `paymentInFlightReason`; clear-table refactored onto it) refuses
write/settle/clear while a card payment or split is in flight — and the card-lock requires `status='open'`,
so card-after-cash can't start and cash-during-card is refused → no double-charge. UI: `StaffLineEditor`
(qty steppers), `StaffAddButton` + `/staff/table/[id]/add` (menu browser), `CashSettleButton` (two-step
confirm, all-in total). Migration `20260621150000` (`qr_orders.tender`/`cart_id`/`settled_by`; cash RPC
`revoke from public` + `grant service_role`). Types regenerated; gate green; money path verified on the
local stack (happy/idempotent/mismatch-raise/double-settle-raise); adversarial subagent run pre-PR.
**⚠️ Apply `20260621150000` to live before merge** — the PR preview shares the live DB, so a
migration-requiring branch is broken on its preview until the (additive) migration lands on live.

**S1.4 shipped (this session, soft convergence — completes S1):** **one-tap merge** of two table orders —
`MergeTableButton` on the drill-down → `mergeTables` (lib/floor.ts, `requireStaff` + service-role) → atomic
`mms_merge_table_orders`. Folds a source table's open order into another (re-parents the **already-server-
priced** lines — bumps an identical target line, same item + normalized modifier set, when it stays ≤99 else
re-parents it so **no units drop**; moved lines `by_seat=null`), then cancels the source cart + closes its
session. **Any active staff** may merge (non-loss turnover cleanup, like clear-table — no manager-PIN; that's
S2's loss-gate), logged non-PII (`staff_merge_tables`). Refuses a closed/paid table, a **cross-mode** target
(per-line tax basis is dine-in vs to-go), or either side **mid-payment** (shared `pay-guard`); both carts
row-locked + must be `open` so a concurrent settle/clear loses the race. **Divergence "warning" is the
explicit pick-and-confirm tool** — the sticker `qr_code` is unique per active session, so two-labels-one-table
isn't auto-detectable; no fabricated alarm (ORDER-MODEL §46–50). **Session expiry** already covered
(`mms_sweep_expired_sessions` pg_cron + `expires_at` floor filter + sliding renewal, P3.4). Migration
`20260621160000_table_merge.sql` (one SECURITY DEFINER fn, service-role-only); types regenerated; gate green;
money path verified on the local stack (merge / identical-bump-across-modifier-order / 99-cap re-parent with
no unit loss / non-open + same-cart raises / grant lockdown); adversarial subagent pre-PR.
**⚠️ Apply `20260621160000` to live before merge** (the PR preview shares the live DB — same as S1.3).

**Next: S2 — line lifecycle & authority.** A full pre-build adversarial design review is in
[`docs/S2_DESIGN.md`](S2_DESIGN.md) (threat model per phase, the new money/auth/RLS surface, the build-order
PR slices). Read it + [`docs/context/ORDER-MODEL.md`](context/ORDER-MODEL.md) §"edit rights"/"voids"/"approvals"
before building. **Three load-bearing seams it surfaces:**

- **The line lifecycle is PRE-settlement** — it lives on `qr_cart_items` (the open cart _is_ the table order
  until settle), NOT `qr_orders` (`/track` is post-pay). Dine-in fires food before payment.
- **`canMutateLine` is diner-only today** (`"host"|"guest"`, `LineState="draft"`) and its post-draft branch is
  a placeholder returning `actorRole==="host"` — **wrong for S2** (a diner host is not staff). Making **staff a
  first-class actor** in that gate is the #1 thing to get right; post-fire editing is staff-only.
- **KDS broadcast needs the `cart:*` channel privatized first** (`{private:true}` + a `realtime.messages`
  policy); recommend shipping the **v1 KDS on `postgres_changes`** (no broadcast, no new policy) to avoid it.
  And **unify the fire timer** — consume the existing `fire_at` (pickup) for dine-in immediate-fire too.

**Confirmed decisions (Min):** loss gate = **cooked-vs-uncooked + a ceiling** (uncooked void = server-solo +
reason; cooked/refund/over-ceiling = **manager-PIN step-up**, reusing `mms_staff_verify_pin`); S2.4 = build the
**approvals primitive + in-person manager-PIN + durable audit** now, **defer owner-remote-approve/SMS**.
**Still-open (in S2_DESIGN §Open decisions):** manager-PIN resolution model, KDS-as-console-view, ceiling
values, undo-grace length. **A full S1 retrospective audit shipped — [`docs/S1_AUDIT.md`](S1_AUDIT.md)** (4
parallel specialist agents): **B1** (`is_staff()` unverified-email RLS escalation, `20260622000000`) and
**B2/S1/S3** (card-after-cash double-charge + atomic fulfill claim + `qr_refunds_needed` recovery ledger,
`20260622010000` — which also restored two S1.3 regressions in `mms_fulfill_order`: the `pickup_slot`/
`fire_at` copy + the `mms_promo_consume` call) are now **code-fixed**; B1's live-config backstop is in
"Auth hardening" above. **B3 + the a11y batch** (RoleBadge AA contrast via `-strong` tokens, sold-out
`+` gate, dual-live-region → assertive alert, dropped-focus on confirm/step panels) are now **code-fixed**
too (no migration). Both money/auth migrations are **applied to live** (`20260622000000`, `20260622010000`)
and merged. **B3 + the a11y batch** (RoleBadge AA contrast, sold-out `+`, live-region, focus) merged (no
migration). **S2** (cash/merge RPCs session-gated on `table_sessions.status`, `20260622020000`) and **S7**
(staff-provisioning: generic create-failure message, per-owner `mms_rate_limit`, PostHog audit events)
close out the audit. **The S1 retrospective audit is now FULLY remediated** — both blockers + all seven
SHOULD-FIX done. Live migration state: `20260622000000` + `20260622010000` + `20260622020000` all
applied. B1's live-config backstop (disable public email signup, workspace-domain Google)
is in "Auth hardening" above — still the binding control there.

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
