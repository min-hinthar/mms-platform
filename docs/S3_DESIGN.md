# S3 — Tabs (deferred settlement) — design + adversarial review

Pre-build design + threat model for the S-track's third milestone, in the house style of
[`S2_DESIGN.md`](S2_DESIGN.md). Read alongside [`docs/context/ORDER-MODEL.md`](context/ORDER-MODEL.md)
§"tabs" / §"multi-door convergence" and the `ROADMAP.md` S3 phases. **Dep:** S1 (staff close · floor) ·
M1 (ledger · Payment Element · webhook) · reuses **S2's approvals primitive** for after-hours / manager
closes.

## What S3 is

> "Keep the tab open" — the table order accumulates across the night and settles **once at close**, with
> any tender, **tip on the final total**.

A tab is **just the table order with settlement deferred** — and the spine already supports that: a
`qr_carts` row stays `open` until a settle RPC flips it `paid`, lines accumulate, and S2's `fire_batch`
already lets a table fire round after round. So S3 is **not** a new ledger; it is the **explicit lifecycle,
authority, and risk-control** around deferred settlement that today is implicit:

1. **S3.1 Trust tab (default)** — a server formally _opens a tab_ on a table (marks the cart), the order
   accumulates and fires in rounds, and at close the server settles once with **any tender** (cash → the
   S1.3 cash RPC; card → the M1 Payment Element; card-on-file → S3.2), with a **tip on the final total**.
2. **S3.2 Secure tab** — a card saved via **SetupIntent** at open _or attached mid-tab_; an **off-session**
   charge at close. Validate the card at open; handle a close-time decline like any failed payment.
3. **S3.3 Server-discretion gating** — courtesy-framed: a **light nudge** to secure a large/new table, a
   **silent ceiling** that flags a ballooning trust tab (surfaced, never auto-converted), host-of-record on
   group tabs, and **logging the tab type + who set it** for walk-out post-mortems.

S3 is mostly **net-new staff surfaces** (the floor drill-down + a tab panel) — the v7.2 prototype's "tabs"
are bottom-nav, not restaurant tabs, so there's no prototype screen to copy; build to the v7.2 _language_
(tokens, motion, 44px, brand voice) and the diner cart reuses the existing `/cart` + Payment Element.

## The spine S3 plugs into (current-state facts that shape it)

- **`qr_carts` is already the table-owned, settle-late ledger.** `status` (`open`→`paid`/`cancelled`),
  `locked`/`locked_at`/`locked_by` (the single-pay mutex), `settle_at`/`settle_by` (the split freeze),
  `pickup_slot`, `promo_code`, `fire_at`. A trust tab is an `open` cart that simply lives longer.
- **Settlement is already decoupled and three-headed** — `mms_fulfill_order` (card/webhook, idempotent on
  the PI id, **reconciles `intent.amount` vs `getCartTotals`**), `mms_fulfill_cash_order` (idempotent on
  `cart_id`, subtotal-reconciled, `tip=0` off-system), `mms_fulfill_split_order`. **Tab-close reuses these**
  — the new work is the _tab lifecycle_ + secure card-on-file, not a fourth fulfill path.
- **The pay mutex is built** — `paymentInFlightReason` (`lib/pay-guard.ts`) + `acquireCartLock` already
  refuse concurrent settle/clear/mutate. Tab-close is a settle → it goes **through** this guard, and a
  closing tab is "money moving" for everything else.
- **S2's approvals primitive** (`mms_request_approval`/`mms_resolve_approval`, the durable `mms_approvals`
  ledger, the manager-PIN step-up) is the consumer-ready gate for an **after-hours / manager-gated close**
  and for **converting/forcing a secure tab** — "void" was consumer #1; "tab action" is the next consumer.
- **Money is server-authoritative, cents end-to-end, SAQ-A.** A secure tab stores only **Stripe tokens**
  (Customer id + PaymentMethod id) — never PAN; the card lives in the Payment Element iframe. The close
  amount comes from `getCartTotals`, never a client total.
- **Diners are anonymous** (`is_anonymous` authenticated). A secure tab therefore needs an **ephemeral
  Stripe Customer per tab** to hold the saved PaymentMethod; it is not a durable account (that's M4).

## Threat model & hardening — per phase

### S3.1 — Trust tab (open · accumulate · close with tip)

- **T1 — a "tab" must not weaken the settle invariants.** Close is a settle: it MUST go through
  `paymentInFlightReason` + the atomic open→paid flip + the subtotal reconcile, exactly like cash/card
  today. No new charge-with-no-order window. A voided/comped line stays $0 at close (the S2 exclusion holds
  across `getCartTotals` + all snapshots).
- **T2 — tip on the final total, server-derived.** The close-tip is applied to the **final** subtotal at
  close, never a stale running figure; the staff close flow re-reads `getCartTotals` at the moment of close.
  Cash-tab tip is now _first-class_ (S1.3 cash was `tip=0`) — model it as an explicit close-tip input, still
  off-rail for cash, on-rail for card.
- **T3 — who may open/close.** Opening a tab marks the cart; closing settles it. **Both staff and a diner
  member** may open (confirmed) — staff via `requireStaff`, the diner via cart membership (`assertCartMember`)
  — gated in the SQL, not just the client. A diner can open/hold and settle their own tab on their phone, or
  hand it to a server; either way the close goes through the same settle invariants (T1). The two
  open-authorities converge on the one table-owned cart (no second ledger).
- **T4 — concurrency.** Two servers closing one tab, or a diner paying their phone while a server closes:
  the close RPC row-locks the cart + requires `status='open'`, so the loser gets a benign "already settled".
- **T5 — turnover.** Clear-table / merge already refuse mid-payment; a _closing_ tab is mid-payment. An
  abandoned-but-open tab is swept by the existing `expires_at` lifecycle (sliding renewal on staff touch so
  an active tab isn't reaped).

### S3.2 — Secure tab (SetupIntent → off-session at close)

- **T6 — card data stays SAQ-A.** Collect the card **only** in the Payment Element / SetupIntent iframe.
  Store on the cart **only** `stripe_customer_id` + `stripe_payment_method_id` + `tab_secured_at` — tokens,
  never PAN. These columns are **service-role-write only**; a diner/member can read that a tab is secured
  (a boolean is enough — don't even expose the ids to the client).
- **T7 — validate at open.** A `SetupIntent` with `usage:'off_session'` confirmed at open validates the
  card; a failed setup means the tab is **not** secured (stays trust, or the server re-asks). Never report a
  card "on file" the gateway didn't accept (honest-microcopy rule).
- **T8 — the off-session close charge must reconcile.** At close, derive the amount from `getCartTotals`,
  create a PI with `customer` + `payment_method` + `off_session:true, confirm:true`, idempotency-keyed on
  the cart; the **webhook reconciles `intent.amount` vs the server total** (the M1 path) and fulfills — no
  bespoke "trust the client" close. A decline / `authentication_required` is handled like any failed
  payment: surface it, fall back to **another tender** (cash/fresh card) or retry, **never strand the table
  as paid** (the fulfill only flips on a `succeeded` webhook).
- **T9 — convert mid-tab (trust → secure).** Attaching a card to an already-open trust tab is a SetupIntent
  on the same ephemeral Customer; it sets `tab_secured_at`. Convert is **additive** — it never charges, it
  only saves a method for the eventual close.
- **T10 — ephemeral Customer hygiene.** One Customer per tab/session; it holds at most the saved PM. No PII
  beyond what Stripe needs; don't reuse a Customer across tables.

### S3.3 — Server-discretion gating (nudge · ceiling · log)

- **T11 — the ceiling is a _flag_, never an auto-charge.** When a trust tab's running subtotal crosses the
  configured ceiling, the floor **surfaces** "Tab at $X — convert or check in?" — it never auto-converts or
  auto-charges (that would be the exact walk-the-customer-into-a-charge failure ORDER-MODEL warns against).
- **T12 — the nudge must not read as profiling.** A _system_ hint ("large/new table → consider a secure
  tab") paired with courtesy scripting, consistent and logged — not unaided per-customer judgment. Config-
  driven thresholds (party size / tab age), tunable like `mms_loss_config`/`pickup_config`.
- **T13 — log the tab type + who set it** (open, convert, force-secure) for the walk-out post-mortem and
  for **reviewing discretion patterns** (the real control is the audit trail + anomaly review, not the tap).
  Reuse the durable `mms_approvals` ledger or a sibling `mms_tab_events` log — append-only, non-PII,
  service-role write, owner-read RLS (same shape as `mms_approvals`).
- **T14 — host-of-record on a group tab.** The host who opens the tab is cardholder-of-record for a secure
  tab; at close it's host-pays-all or the existing split feature; tip lands on the final total.

## New money / auth / RLS surface S3 introduces (review checklist for the build)

- **`qr_carts` tab columns** — `tab_type text check (tab_type in ('none','trust','secure')) default 'none'`,
  `tab_opened_at`/`tab_opened_by` (staff uid), and for secure: `stripe_customer_id`, `stripe_payment_method_id`,
  `tab_secured_at`. All **service-role-write**; the client reads at most a derived `secured` boolean. Backfill
  existing carts `tab_type='none'` (correct — nothing was a formal tab pre-S3).
- **`mms_open_tab(cart, staff)`** — marks `tab_type='trust'`, stamps opener; requires the cart `open` +
  dine-in; idempotent (re-open is a no-op). INVOKER (service-role-only caller), locked down.
- **`mms_close_tab(...)`** — the tab-aware settle. For cash → delegates to the cash reconcile with an
  explicit close-tip; for card/card-on-file → mints the (off-session for secure) PI whose webhook fulfills.
  Goes through the pay-guard; atomic open→paid; subtotal+tip reconcile. **No new charge-with-no-order path.**
- **`mms_secure_tab(cart, customer, payment_method)`** / **`mms_convert_tab`** — record the saved-card tokens
  after a confirmed SetupIntent; set `tab_secured_at`. Never charges.
- **`mms_tab_config`** (singleton, parity with `mms_loss_config`) — `ceiling_cents`, nudge thresholds
  (`nudge_party_size`, `nudge_tab_age_min`). Service-role read in the floor query.
- **`mms_tab_events`** (or extend `mms_approvals`) — append-only tab-action log (open/convert/secure/close/
  force), non-PII, RLS default-deny + owner-read, service-role write.
- **Stripe:** a SetupIntent route (member/staff-gated, mints/reuses the ephemeral Customer) + an off-session
  close route; the **existing webhook reconcile** covers the close charge — extend it to recognize a tab-close
  PI (same idempotent fulfill).
- **Tax/money:** S3 moves no prices and adds no per-line math. Close re-derives from the single engine
  (`lib/totals.ts`); tip is additive on the final total; SB-1524 service charge already applied.

## Open decisions — ✅ CONFIRMED (Min, S3 kickoff)

1. **Tab open/close authority & framing:** ✅ **staff _and_ diner self-open.** A server opens/closes a tab
   from the floor drill-down **and** a diner can "keep my tab open / settle later" from `/cart` — both write
   the same table-owned cart. Each open-authority is gated in the SQL (staff via `requireStaff`; the diner
   via cart membership), and a diner-opened tab is still closeable by **any tender** (the diner settles on
   their phone, or hands it to a server). This widens **T3** — the diner self-open path is a first-class,
   hardened authority, not a deferred follow-up.
2. **Secure-tab scope:** ✅ **build S3.2 now** — SetupIntent at open / attach mid-tab + the off-session
   close + decline recovery, reusing the M1 Payment Element + webhook reconcile. The off-session close only
   smoke-tests end-to-end with proper Stripe **test** config (an activation dep, flagged like the live
   cutover — no real off-session charge until then).
3. **Tab thresholds:** ✅ **$400 silent ceiling · nudge at party ≥ 10** — a looser, light-touch setting for
   a trusting regular base; both tunable in `mms_tab_config` (parity with `mms_loss_config`).

## Recommended build order (PR slices)

1. **S3.1 Trust tab** — the `qr_carts` tab columns + `mms_open_tab`/`mms_close_tab` + `mms_tab_config`
   (ceiling, used in S3.3) + the staff **Open tab / Close tab** flow on the floor drill-down (tender picker +
   close-tip + running total) **and** the diner **"Keep tab open / settle later"** affordance on `/cart`
   (both gated in SQL per T3), plus floor legibility (tab badge + running total). The spine + the trust path,
   end-to-end, from both doors.
2. **S3.2 Secure tab** — the ephemeral Customer + SetupIntent (open / convert mid-tab) + the off-session
   close charge + decline recovery; the secured-tab affordance on the drill-down + the diner-assisted
   card-save on `/cart`.
3. **S3.3 Discretion gating** — `mms_tab_config` nudge thresholds + the silent-ceiling flag + the
   large/new-table nudge + the `mms_tab_events` log (open/convert/force) for post-mortem & anomaly review.

Each slice: build to v7.2 + the research bar in the **first commit** (money/auth/RLS/tokens/a11y/error-paths),
run the Pre-PR self-review sweep ending with a **fresh-context adversarial subagent** (a11y · perf ·
security/privacy · product-UX), post its verdict as a PR comment, gate green (`turbo lint typecheck build`),
**apply the migration to live + verify** (`service_role`-only, advisors clean), then merge. **Deps are real:**
S3.2 needs S3.1's tab lifecycle; S3.3's ceiling/nudge sit on S3.1's config + S3.2's convert path.
