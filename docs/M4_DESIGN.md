# M4 — Rewards & account (design of record)

**Status: pre-build design + threat model (2026-06-23).** The plan for M4 per `ROADMAP.md`, written
the way `docs/S3_DESIGN.md` was: full context, the spine it plugs into, the QR-local model, a per-phase
threat model, and the new money/auth/RLS/PII surface the build must clear. Companion reading:
`docs/BACKEND_ARCHITECTURE.md` (the dedicated-project topology + the anon→account upgrade path),
`docs/context/ORDER-MODEL.md`, `CLAUDE.md` (money/auth/RLS/SAQ-A/a11y/brand-voice bars).

## What M4 is

A diner who keeps coming back gets a **durable account** and earns **Morning Star Rewards** — the same
Burmese-gem loyalty language as the delivery app. Three phases (ROADMAP):

- **P4.1 — account spine + rewards earn + the rewards hub** (this PR's build).
- **P4.2 — account surfaces**: order history, reorder-with-modifiers, settings (theme/lang), **reward
  redemption at checkout**.
- **P4.3 — feedback + ungated review triage.**

## The decision that reshapes M4 (confirmed with Min, 2026-06-23)

The `ARCHITECTURE.md`/`BACKEND_ARCHITECTURE.md §3` plan ("anon uid upgrades in place → the SAME uid →
`loyalty_rewards` unlocks") was written under the **old shared-Supabase-project** assumption. Reality
(per `CLAUDE.md` + `BACKEND_ARCHITECTURE §0`): **QR runs on its own project** (`fasnpdhtvqtzjlvruqcu`);
`loyalty_rewards`/`profiles` live in the **separate delivery project**. So a cross-project gem write is a
real architectural fork. **Confirmed decisions:**

1. **QR-local ledger now; unify at M5.** Build the rewards ledger + account in the QR project. M5
   (migrate the delivery app) is the natural point to reconcile the two ledgers. No fragile cross-project
   dual-write, no cross-`auth.users` identity-matching problem today.
2. **Account = the anonymous uid, upgraded in place.** `supabase.auth.updateUser({ email })` (email
   OTP / magic-link) **or** `linkIdentity({ provider: 'google' })` — both keep the **same `auth.uid()`**,
   so the diner's past `qr_orders` (which we now stamp with their uid) and earned rewards carry over with
   zero migration.
3. **Earn rules mirror the delivery app exactly** (so M5 unifies without a user-facing rename) — sourced
   from `min-hinthar/mandalay-morning-star-delivery-app` `src/lib/loyalty/`:
   - **Stars = count of the diner's _qualifying paid_ orders.** Every `MILESTONE_STEP` stars → one
     **Kyay-Zu-Par!** reward coupon (issued server-side, 60-day expiry, $50 redemption minimum).
   - **Tier = lifetime _net spend_** (`Σ subtotal − discount`, **excludes** tax + tip + voided/comped +
     refunded), derived **server-side**, never client-set. Tier **ids are stable** (display name/emoji can
     change without a migration — delivery's hard-won rule): `new` "New Friend" ($0) · `jade` "Sein"
     (Diamond 💎, $250 / 25000¢) · `ruby` ($750 / 75000¢) · `gold` ($1500 / 150000¢). Early-access
     capability = `tier ≥ ruby`.
   - Thresholds + `MILESTONE_STEP` + reward scaling live in a **tunable `mms_rewards_config`** singleton
     (parity with `mms_tab_config`/`mms_loss_config`), seeded to the delivery values.

## The spine M4 plugs into (current-state facts)

- **Diners are anonymous** (`auth.users`, `is_anonymous=true`; RLS off `auth.uid()`). The upgrade flips
  `is_anonymous=false` on the **same row** — the uid is stable, which is the whole reason earning can be
  retroactive.
- **`qr_orders` is the settled-order ledger** — snapshots `subtotal_cents`/`discount_cents`/`tax_cents`/
  `tip_cents`/`total_cents`, `session_id`, `settled_by`, `tender`, `status='paid'`, the PI id. Voided/
  comped lines are already excluded from those snapshots (S2.3). **It has no earner column yet** → M4 adds
  `earned_by uuid` (the diner who paid). Net loyalty spend per order = `subtotal_cents − discount_cents`.
- **`create-intent` already resolves the payer uid** (`assertCartMember` → `uid`); it rides in the PI
  metadata so the **signature-verified webhook** can stamp `earned_by` at fulfillment — the same
  server-authoritative, idempotent path that already reconciles the amount. **No client ever asserts who
  earned what.**
- **Cash/staff closes have no diner uid** (`settled_by` = staff): those orders earn nothing (`earned_by`
  null) — honest (the house settled it, not a known diner). A diner who wants rewards pays on their phone
  or upgrades first.
- **The promo engine** (`mms_promo*`, `applyPromo`) is the redemption rail for a reward coupon in P4.2.
- **Money stays server-authoritative, cents end-to-end, SAQ-A.** Rewards add **no** price math and touch
  no card data; the tier/stars are **derived from already-settled orders**, not a balance the client holds.

## Earn flow (P4.1)

```
diner pays (create-intent, uid in PI metadata)
  └─ webhook payment_intent.succeeded → mms_fulfill_order(..., p_earned_by := uid)
       └─ qr_orders.earned_by = uid; status=paid
       └─ mms_reward_on_fulfill(uid): recompute Stars (count of paid orders for uid);
            if Stars crossed a MILESTONE_STEP boundary → issue ONE mms_rewards coupon
            (idempotent on (user_id, milestone_index); 60-day expiry). Never on redelivery.
```

- **Derived, not a drifting counter.** Stars + net spend + tier are **computed from `qr_orders`** for the
  uid (a `mms_rewards_summary(uid)` SECURITY-DEFINER read) — single source of truth, no reconcile bug. Only
  the **issued coupons** are materialized (they must persist + expire + be redeemed exactly once).
- **Anonymous diners see a teaser, upgraded diners own it.** Pre-upgrade the hub shows "You'd have N
  stars — keep them: create an account." Because the uid is stable, upgrading retroactively claims every
  order that uid already paid for. No data moves.

## Threat model & hardening — per phase

### P4.1 — account spine + earn

- **R1 — rewards are server-authoritative + derived.** Stars/spend/tier come from a SECURITY-DEFINER read
  over the uid's **paid** `qr_orders`; the client never sends a balance, tier, or star count. Mirrors the
  delivery rule "tier is server-computed, never client-set."
- **R2 — earn integrity.** Only `status='paid'` orders earn; net spend excludes tax/tip and the
  voided/comped lines **already excluded from the order snapshot at settle time** (S2.3 — a line voided
  before settlement is never in `subtotal_cents`). One Star per single-pay paid order. Coupons are issued
  **only** by the service-role fulfillment path, **idempotent on `(user_id, milestone_index)`** so a Stripe
  redelivery (or a recompute) can't mint a second coupon. **Post-settlement refunds do NOT currently claw
  back Stars or spend** — `qr_orders.status` has no `refunded` state (refunds are tracked out-of-band in
  `qr_refunds_needed`), so a refunded order keeps its Star/spend; an issued coupon is likewise never clawed
  back. Refund-aware recede needs a refund signal on `qr_orders` → **deferred** (note it, don't pretend the
  derived read reflects it). **Split-tender orders don't earn in P4.1** (the split fulfill stamps no
  earner) — single-pay is the P4.1 earn path; split-earn attribution (host-of-record vs per-share) is P4.2.
- **R3 — identity-upgrade safety + session hygiene.** `updateUser(email)`/`linkIdentity` keep the **same
  uid**; the email is only "real" after OTP/magic-link **verification** (Supabase-enforced) — we never
  report an account before the gateway confirms it (honest-microcopy parity with S3.2 T7). A failed/
  abandoned upgrade leaves the anon session fully intact. **The AnonAuthGate seam (caught in P4.1 build):**
  the gate signs out any non-anonymous session on a diner route (it assumed non-anon = staff) — after M4 an
  upgraded diner is non-anon and would be orphaned. The gate now distinguishes via a **server-side** check
  (`getSessionKind` → `getStaffAuth`): keep a diner (anon or upgraded), swap only **confirmed staff** — never
  a client-writable marker a staff user could forge to dodge the swap. On resolver error it keeps the
  session (a stray staff uid on a diner route is still server-side authz-safe — not a session member).
- **R5 — anon→PII boundary + orphan-cleanup safety.** `mms_profiles` (email/display_name/locale/theme) is
  **owner-RLS** (`auth.uid() = id`), **not** on the realtime publication, never fanned to a table session.
  When the anon-orphan cleanup lands (BACKEND §1.5, not yet built), it **must** exclude
  `is_anonymous=false` (an upgraded account is never reaped) and any uid with a `mms_profiles` row.
- **R6 — PII minimization.** Store only email + display name + locale + theme. No card data (SAQ-A
  untouched). Analytics/audit stay non-PII (a uid hash or the existing event shape, never the email).
- **R7 — cross-project boundary.** QR-local only; **no** write to the delivery project. Tier ids +
  thresholds + `MILESTONE_STEP` mirror delivery so M5's reconciliation is a data merge, not a rename.

### P4.2 — account surfaces + redemption (planned)

- **R4 — coupon redemption integrity.** A reward coupon is **single-use, user-bound, server-expiry-checked**
  (60 d), redeemed **atomically** (a row-locked `redeemed_at` flip in the same txn as apply) so it can't
  double-redeem or apply after expiry; it can't drive a total negative or below the configured minimum.
  Redemption rides the existing server-authoritative promo path (`getCartTotals` re-derives), never a
  client discount.
- **R8 — reorder safety.** "Reorder with modifiers" re-prices **server-side** from the live menu
  (`priceItem`) — never replays a stale snapshot price; a since-86'd item is surfaced, not silently
  dropped or charged.

### P4.3 — feedback + reviews (planned)

- **R9 — reviews ungated** (SB-1524 / the compliance bar in `CLAUDE.md`): never gate a review on a rating;
  triage is internal routing, not suppression.

## New money / auth / RLS / PII surface (review checklist for the build)

- **`mms_profiles`** — `id uuid PK references auth.users`, `email`, `display_name`, `locale`, `theme`,
  timestamps. RLS: `auth.uid() = id` for select/update; insert via the upgrade server action; **anon
  excluded** from owning a profile (a profile implies an upgraded account). Owner-only; off realtime.
- **`mms_rewards`** (issued coupons) — `id`, `user_id`, `reward_code` (unique), `amount_cents`,
  `kind ('milestone')`, `milestone_index int`, `issued_at`, `expires_at`, `redeemed_at`,
  `redeemed_order_id`. **Unique `(user_id, milestone_index)`** (idempotent issue). RLS owner-read;
  service-role write. Off realtime.
- **`mms_rewards_config`** (singleton) — `milestone_step`, `reward_base_cents` + per-tier scaling, tier
  thresholds (or a `mms_reward_tiers` table). Service-role read. Seeded to delivery's values.
- **`qr_orders.earned_by uuid`** — service-role write (set at fulfillment from PI metadata). Nullable
  (cash/staff closes don't earn). Indexed for the summary read.
- **`mms_reward_on_fulfill(p_user uuid)`** — SECURITY DEFINER; recompute Stars, issue the milestone
  coupon idempotently; `revoke from public/anon/authenticated`, `grant to service_role`; `search_path=''`.
- **`mms_rewards_summary(p_user uuid)`** — SECURITY DEFINER read returning `{ stars, spend_cents, tier_id,
next_milestone, orders_to_next }`; service-role (called by a member-gated server action that resolves
  `auth.uid()`), so a diner only ever reads **their own** summary.
- **`mms_fulfill_order`** gains `p_earned_by uuid default null` (additive; the webhook passes the metadata
  uid). The cash/split fulfill paths pass null / the payer as applicable.
- **Stripe:** `create-intent` adds `earnerUid` to the PI metadata (no new route). Webhook threads it.
- **Auth config:** enable email (OTP/magic-link) + Google provider in `supabase/config.toml`; leaked-
  password protection already on the checklist.
- **UI:** `/account` rewards hub (tier ladder · Stars · coupon wallet — built to v7.2 _language_, bilingual
  EN/MY, tokens, 44px, reduced-motion) + the upgrade flow (email OTP / Google, honest "verify to keep your
  rewards" copy). The diner cart/track surfaces a post-order rewards teaser (parity with delivery's
  highest-intent moment) — **only truthful numbers**, never a fabricated balance.

## Open decisions — ✅ CONFIRMED (Min, 2026-06-23)

1. **Ledger topology:** ✅ **QR-local now, unify at M5.**
2. **Account identity:** ✅ **email magic-link/OTP _and_ Google OAuth**, upgrading the same anon uid.
3. **Build scope:** ✅ **this design doc + P4.1 first** (account spine + earn + hub); P4.2/P4.3 follow as
   separate PRs.
4. **Earn rules:** ✅ **mirror the delivery app** (Stars = paid-order count; tiers new/jade/ruby/gold by
   lifetime net spend at 0/25000/75000/150000¢; milestone-step reward coupons, 60-day, $50 min) — pinned in
   a tunable `mms_rewards_config`.

## Out of scope (deferred)

- Cross-project gem unification with the delivery ledger → **M5**.
- Referrals / lifecycle marketing crons (win-back, anniversary, abandoned-cart) → post-M4 / delivery-owned.
- ✅ Reward redemption at checkout (P4.2) · ✅ **order history** (P4.2) · ✅ **split-tender earn** (P4.2). Feedback/reviews → **P4.3**.
- ✅ **Split-tender earn attribution** — the **host-of-record** earns the table's split order (the order-count
  model: one order = one Star; net spend credited to the organizer, parity with the S3 host-of-record). The
  webhook split-fulfill resolves the host uid (`table_sessions.host_seat`), stamps `qr_orders.earned_by`, and
  awards exactly-once. **Per-share attribution** (each payer earns for their share) is a future refinement —
  it needs a per-payer earn ledger (today `earned_by` is one uid per order); noted, not blocking.
- **Reorder-with-modifiers** → **blocked, own slice.** Two real blockers, not just UX: (1) the QR cart is
  **table-session-bound**, so reorder needs an ACTIVE open cart to add into (a diner at `/account` usually
  isn't in a session); and decisively (2) cart/order lines persist modifier **labels**, not option **ids**
  (`insertOrIncLine` stores `optLabels`; the order snapshot copies them) — so `priceItem` (which needs option
  ids) **cannot faithfully re-price** a reorder without first persisting `modifier_option_ids` on the lines
  (a schema + write-path change). A label→id reverse match would be lossy/ambiguous (breaks R8 + honesty).
  Prereq: capture option ids at order time; then reorder into the active cart, re-priced, unavailable surfaced.
- **Account settings (theme / language)** → deferred (marginal / needs infra). Today the theme is pure
  `prefers-color-scheme` (no `.dark` class / theme provider to override) — every diner already gets their OS
  theme — and there is **no diner i18n framework** (bilingual = menu `name_en`/`name_my` only). A stored
  `mms_profiles.theme`/`locale` has nothing to apply to yet; shipping toggles now would be a hollow promise.
  Real value needs a theme-override provider + a full i18n layer (its own initiative). Low value/effort for a
  transient-diner app — revisit with the i18n initiative. The `mms_profiles` columns already exist for it.
- **Refund-aware tier recede** → **blocked on refund infra (S4.3).** `qr_orders.status` has no `refunded`
  state (refunds are out-of-band in `qr_refunds_needed`; line-level auto-refund is S4.3), so there is no
  signal to recede against. Build once S4.3 lands a refund-state on the order.
