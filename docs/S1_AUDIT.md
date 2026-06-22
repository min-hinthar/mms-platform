# S1 — Staff & Floor: retrospective adversarial audit

A **post-merge** red-team of the shipped S1 work (S1.1a identity · S1.1b PIN · S1.2 floor · S1.3 staff
write + cash settle · S1.4 merge), run as **four parallel specialist agents** (the project's RED-TEAM
four-lens model): security/authz/RLS/money · concurrency/atomicity · a11y/UX/fidelity · auth-lifecycle/
privacy/abuse. Each read merged code on `main` and cited `file:line`. This report orchestrates their
findings. **Nothing here is fixed yet — this is the triage input.**

> Why audit shipped, gate-passed code: LEARNINGS — "a milestone-level red-team is worth running on
> ALREADY-SHIPPED milestones." Per-phase reviews catch feature logic; a milestone sweep catches
> foundation/integration issues (a config-dependent RLS gate, a cross-action race) that no single PR saw.

## Executive summary

| #      | Severity   | Finding                                                                                                                                                                                                      | Lens                   | Fix surface                          |
| ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- | ------------------------------------ |
| **B1** | 🔴 BLOCKER | SQL `is_staff()` has **no `email_verified` gate** → live cross-table diner-PII + staff-roster **read** escalation via RLS/Realtime (bypasses app `getStaffAuth`)                                             | security + auth (both) | SQL migration **+** live auth config |
| **B2** | 🔴 BLOCKER | **Card-after-cash double-charge** window — the pay-guard mutex is one-directional; a cash settle leaves no in-flight marker, so a diner card pay started during the settle window is captured then orphaned  | concurrency            | `settleCash` + SQL                   |
| **B3** | 🔴 BLOCKER | `RoleBadge` "server" uses `--ac` text on an accent tint → **sub-AA contrast** (the exact documented `--ac`-on-tint trap)                                                                                     | a11y                   | 1-line token swap                    |
| S1     | 🟠 SHOULD  | `mms_fulfill_order` card path is exists-check **+ separate** claim (not atomic like the cash twin) → TOCTOU double-record                                                                                    | concurrency            | SQL                                  |
| S2     | 🟠 SHOULD  | `mms_fulfill_cash_order` not gated on **session** open — correct only because clear-table cancels the cart first (fragile, caller-ordering-dependent)                                                        | security               | SQL                                  |
| S3     | 🟠 SHOULD  | Cross-tender stranded charge has **no durable recovery** (log + PostHog only; `charge.refunded` is a TODO)                                                                                                   | security               | code + SQL                           |
| S4     | 🟠 SHOULD  | **Sold-out line can still be incremented** in `StaffLineEditor` (the 86 trap) — UI offers an action the server rejects                                                                                       | a11y/UX                | type + UI                            |
| S5     | 🟠 SHOULD  | **Two polite live regions** co-resident on the drill-down (`FloorDetailLive` status + `ClearTableButton` status)                                                                                             | a11y                   | UI                                   |
| S6     | 🟠 SHOULD  | **Focus dropped** on `MergeTableButton` step transitions and on `CashSettleButton`/`ClearTableButton` confirm-card appearance                                                                                | a11y                   | UI                                   |
| S7     | 🟠 SHOULD  | `provisionStaff` is an **account-existence oracle** (project-wide) + **no audit row** + no rate limit on the auth-admin path                                                                                 | security + auth        | code                                 |
| S8     | 🟠 SHOULD  | Send-email hook has **no fail-fast timeout** on the Resend call + no app-side cap (relies entirely on GoTrue's live rate limit)                                                                              | auth                   | code + config                        |
| N1–N6  | ⚪ NIT     | app-vs-DB clock skew on lock freshness · stale-snapshot has no UI signal · merge source-dup cleanliness · `hashtext` 32-bit advisory key · `insertOrIncLine` dup TOCTOU · "Added ✓" glyph in accessible name | mixed                  | low                                  |

**Confirmed clean (independently verified):** PIN lifecycle (atomic 5/15-min lockout, no timing leak,
trivial-PIN rejection, lapsed-reset), secret isolation (`staff_pins` default-deny, hash never client-
reachable), PIN keyed on resolved `staffId` not `uid`, the lock-cookie threat-model framing, provisioning
owner-gate + orphan rollback, the **money re-derivation** spine (no client price/total trusted anywhere;
merge re-parents priced snapshots without recompute; promo refusal), and **PII handling** (every staff
PostHog event is `staff:{staffId}` + role/ids/counts — no names/emails; webhooks mask recipients; no card
data anywhere). The IDOR sweep found every S1 Server Action re-checks `requireStaff()` + acts via service-role.

---

## BLOCKERs

### B1 — `is_staff()` escalates on an unverified email claim (live PII read leak)

> **✅ CODE FIXED** in `supabase/migrations/20260622000000_is_staff_email_verified.sql` — the RLS email
> branch now matches via a `staff_session_email_match()` SECURITY DEFINER helper that reads `auth.users`
> for the current `auth.uid()` and requires the email be **confirmed** _and_ from a **provider-verified
> OAuth identity** (`provider <> 'email'`), never the spoofable JWT `email` claim. Verified on the local
> stack (provisioned-uid ✓ · confirmed-Google email-match ✓ · email/password auto-confirm attacker ✗ ·
> unconfirmed ✗ · stranger ✗). **⚠️ Still requires the Min config backstop** (below) — under
> email-confirmations-OFF, GoTrue auto-confirms email/password signups, so `provider <> 'email'` is what
> blocks them at the RLS layer; the binding control is disabling public email signup / confirmations ON.

**Where:** `supabase/migrations/20260621120000_staff_oauth_email.sql:18-27` (`is_staff` / `is_staff_at_least`),
folded into the SELECT RLS on `table_sessions`/`session_members`/`qr_carts`/`qr_cart_items`/`qr_orders`/
`qr_order_items` (`20260621100000_staff_identity.sql:56-65`), the floor Realtime read (`20260621140000`),
and `staff_read_self` (the full staff roster + emails).

**The hole:** `is_staff()` matches `s.user_id = auth.uid() OR lower(s.email) = lower(auth.jwt()->>'email')`
with **no `email_verified`/`email_confirmed_at` check**. The app guard `getStaffAuth` (`lib/staff.ts:60`)
_does_ require `email_confirmed_at` — but **RLS is evaluated by PostgREST/Realtime directly**, bypassing the
TS guard entirely. Anonymous diners are `authenticated`, and the SELECT policies + base-table grant are
`to authenticated`. With **`enable_confirmations = false`** (`config.toml:230`, and the live value is
dashboard-managed = not enforced in-repo), anyone who does an email/password signup as a provisioned staff
address gets a JWT whose `email` claim matches a `staff` row → `is_staff()` returns **true** without ever
owning the mailbox.

**Impact:** read of **every active table's** sessions/members/carts/line-items/orders, restaurant-wide,
live, **plus the entire staff roster including every staff email**. Both the security and auth-lifecycle
agents flagged this independently and decisively. Writes are **not** exposed (all mutations go through
`requireStaff` → `getStaffAuth`, which checks `email_confirmed_at`). The team's own HANDOFF flagged this as
a "deferred to S1.2" follow-up — but **S1.2 is exactly what shipped**, so the dependency merged without its
guard, and the HANDOFF undersells it ("only the not-yet-built floor-view read") — that surface is now live.

**Fix (both, neither alone is sufficient):**

1. **SQL migration (durable):** add the verified-email gate to `is_staff()`, `is_staff_at_least()`, and the
   `staff_read_self` email branch — `… and ((select auth.jwt())->>'email_verified')::boolean is true` (the
   `user_id = auth.uid()` branch stays unconditional; provisioned users are `email_confirm:true`). **Pin the
   exact claim path against the live JWT first** — GoTrue may carry it top-level or under `user_metadata`
   (`auth.jwt()->'user_metadata'->>'email_verified'`); confirm on the live token, don't guess.
2. **Live config (backstop):** `enable_confirmations = ON` (or disable email/password signup entirely — only
   OAuth + admin-provisioned OTP are needed), restrict Google to the workspace domain, confirm automatic
   cross-provider linking is off.

### B2 — Card-after-cash double-charge (the pay-guard mutex is one-directional)

**Where:** `apps/qr/lib/staff-cart.ts:145-188` (`settleCash`), `apps/qr/app/api/stripe/create-intent/route.ts`,
`apps/qr/lib/pay-guard.ts:35-52`.

`paymentInFlightReason` protects cash/clear/merge **against an in-flight card/split** (it reads
`locked`/`settle_at`/captured-shares). The reverse is **not** symmetric: a cash settle in progress sets **no
marker** on the cart, and `create-intent` never consults the mutex. Sequence: (1) cashier taps Settle →
`settleCash` calls `getCartTotals` (a multi-read, tens of ms); (2) in that window the diner taps Pay →
`acquireCartLock` succeeds (cart still `open`) → Stripe PI created → **card captured**; (3) the cash RPC's
atomic flip wins → cart `paid`; (4) the late card webhook hits the cross-tender guard and correctly records
**no** second order — **but the card was already charged.** Recovery today is a manual Stripe refund. The
migration comment names a _related_ scenario (a stale lock) but not a card pay **freshly started during the
cash settle**, which `create-intent` allows because the cart is open and unlocked.

**Fix:** make the freeze bidirectional and in-SQL. Preferred: `settleCash` **acquires the existing
settle-freeze atomically** (`update qr_carts set settle_at = now() where id=$ and status='open' and
locked=false and (settle_at is null or stale)`) **before** deriving totals — `acquireCartLock` already
excludes `settle_at is null or stale` (`lock.ts:52`), so a concurrent card pay loses for free; release on
failure. (Folds in N1 — derive freshness in SQL, not the app clock.)

### B3 — `RoleBadge` "server" role fails AA contrast

**Where:** `RoleBadge.tsx:20-24` — `server` role renders `fg: var(--ac)` on `bg: color-mix(--ac 14%,
transparent)`. `tokens.css:49-52` documents that plain `--ac` on a ~9–14% accent tint is ~4.0–4.3:1
(sub-AA) and that **`--ac-strong` exists precisely for text on these tints**. High-traffic surface (floor
home, profile, every team row). **Fix:** `fg: var(--ac-strong)` for `server`; re-measure the `owner`
(jade) / `manager` (gold) tints the same way (gold-on-light is suspect).

---

## SHOULD-FIX (details)

- **S1 — `mms_fulfill_order` TOCTOU** (`20260621150000_staff_order.sql:133-154`): the cross-tender guard is
  `if not exists(… status='open')` then a _separate_ `insert … select` and `update … set paid`, with no
  `FOR UPDATE`. Its **cash twin** (`:71-73`) and `mms_fulfill_split_order` both use a single atomic `update
… where status='open' returning` as the claim. Make the card path match: claim atomically, drive the
  insert from the returned `session_id`, drop the separate check. (Closes the same race family as B2.)
- **S2 — cash RPC not session-gated** (`staff_order.sql:42-90`): flips cart `open→paid` but never checks
  `table_sessions.status`. Safe _today_ only because `clearTable` cancels the cart before closing the
  session — an invariant living in caller ordering, not the RPC. Add `and exists(select 1 from
table_sessions where id=v_session and status<>'closed')`; same for `mms_merge_table_orders`.
- **S3 — stranded charge has no recovery** (`webhook/route.ts:84-96`, `:225` TODO): the cross-tender branch
  acks 200 + logs + PostHog, but the customer **was charged** and there's no durable `refunds_needed` row,
  operator alert, or `charge.refunded` handler. Add a durable refund-needed ledger (or auto-refund via the
  Stripe API) on this branch — telemetry is not recovery. (Ties to S4.3, which owns line-level refunds.)
- **S4 — sold-out increment** (`StaffLineEditor.tsx:82-90`, `floor-types.ts:42-48`): the `+` is gated only
  by `busy || qty>=99`; `TableLineView` has no sold-out flag, so an 86'd line still shows a live `+` (the
  add-page handles this; the editor doesn't). Thread `soldOut` onto `TableLineView`, disable with an
  accessible name.
- **S5 — dual live regions** (`FloorDetailLive.tsx:205-211` shared status **+** `ClearTableButton.tsx:75`
  own `role="status"`): two polite regions on one view (QA §A wants one). Route ClearTableButton's error
  through the parent shared region (as `StaffLineEditor` does); keep assertive `role="alert"`s (they're fine).
- **S6 — dropped focus** (`MergeTableButton.tsx:74,110` step transitions; `CashSettleButton.tsx:41-59` &
  `ClearTableButton.tsx:53` confirm cards): focus falls to `<body>` when the trigger unmounts. Move focus to
  the new panel/group heading on each step; restore to the trigger on cancel (parity with `StaffLogin`/
  `FloorDetailLive`).
- **S7 — provisioning oracle + no audit** (`staff-actions.ts:27-77`): `createUser` after `requireStaff
('owner')` is correctly gated, but surfaces "email already has an account" project-wide (existence
  oracle), writes **no** audit row (only clear/merge/settle log to PostHog), and has no rate limit. Add a
  generic "couldn't create" message, an audit event, and a coarse `mms_rate_limit` keyed by `staffId`.
- **S8 — send-email hook** (`api/auth/send-email/route.ts`, `lib/email.tsx:37`): signature-verified (good)
  but relays every GoTrue request to Resend with no fail-fast timeout (a hung send → GoTrue retry storm —
  the HANDOFF's own deferred note) and no app-side cap. Add an `AbortController` (~5s) on the Resend send;
  consider a per-recipient cooldown via `mms_rate_limit`. (Min-config: set a sane live `email_sent` cap.)

## NITs

- **N1** lock freshness uses the **app clock** (`lock.ts:39-40`, `pay-guard.ts:13-15`) while RPCs use DB
  `now()` — skew can disagree; derive freshness in SQL (folds into B2).
- **N2** stale floor/detail snapshot is kept on fetch error with **no UI staleness signal** — after N
  consecutive failures, surface "Reconnecting — showing last known state" (announce once).
- **N3** merge re-parent doesn't coalesce two _source_ duplicates against an already-moved line (cleanliness;
  no unit loss) — `table_merge.sql:55-77`.
- **N4** PIN advisory lock keys on `hashtext()` (32-bit) — harmless collisions; `hashtextextended(…,0)` is
  the cleaner 64-bit idiom (both agents noted).
- **N5** `insertOrIncLine` dup-detection is a read-then-write (`order-lines.ts:75-99`) — concurrent adds can
  create a duplicate line (no lost units/undercharge); pre-existing diner behavior, now shared by staff.
- **N6** `StaffAddButton` "Added ✓" bakes the glyph into the accessible name — prefer text + `aria-hidden`
  glyph.

---

## Recommended remediation order

1. **B1 first (live exposure).** SQL `email_verified` gate (pin the live claim path) **+** live config
   (`enable_confirmations` ON / restrict provider). This is a live PII leak — do it before any S2 work.
2. **B2 + S1 + S2 together (money atomicity).** One migration hardening the fulfill/settle/merge claims to
   be atomic + session-gated, plus `settleCash` acquiring the settle-freeze. Add S3's durable refund-needed
   ledger in the same pass (it's the same money-recovery theme).
3. **B3 + S4–S6 (a11y batch).** Token swap, sold-out flag, single live region, focus moves — one UI PR.
4. **S7 + S8 (auth hardening).** Provisioning audit/oracle/rate-limit + the send-email timeout.
5. **NITs** opportunistically (N1 rides B2; N4 is a one-liner).

Each fix follows the loop: build to the bar, Pre-PR sweep + fresh-context adversarial subagent, apply any
migration to live + verify (`service_role`-only, advisors clean), gate green, merge. B1 and B2/S1/S2 carry
migrations → live-apply needs Min (classifier-gated) + the verify step.
