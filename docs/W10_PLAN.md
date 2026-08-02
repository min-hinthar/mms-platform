# W10 — The app tells the truth when the kitchen is unreachable

**Trigger:** the QR Supabase project hit the free-tier idle pause (status `INACTIVE`, 2026-08-01) —
a **live reproduction** of a full platform outage: every PostgREST/auth/realtime/RPC call failing on
every surface at once. An 8-surface audit (78 findings, full trace in
[`W10_MATRIX.md`](W10_MATRIX.md)) mapped what every user actually experienced. The recurring classes:

1. **Eternal skeletons** — auth-plane failure left `useAnonSession` null forever; every "no session
   yet" guard reads as still-loading, indefinitely. No failure state existed at all.
2. **False verdicts** — transport failures returned as judgments: `401 Invalid session`,
   `404 no_cart`, "This order isn't available on this device", "The menu catalog is empty",
   "All done" on staff queues.
3. **Blame-shifting copy** — "check your connection" asserted with zero evidence on six surfaces
   (no `navigator.onLine` usage existed anywhere in the app).
4. **Cached lies** — `getMostLoved` cached its error-`[]` for an hour past recovery; the menu's
   `revalidate = 300` was a dead line (cookie reads force dynamic rendering).
5. **Money-path outage bugs** — see W10c: real correctness issues, not copy.

## W10a — the truth layer + flagship surfaces ✅ (this slice)

- **`/api/health`** (DB-less HEAD probe, 2.5s timeout, never cached) + **`useConnectionTruth`**
  (module-cached, online/offline listeners) → the three truths: `you-offline` / `we-down` /
  `unknown`. **"Check your connection" is now only permitted when `navigator.onLine === false`.**
  `failureCopy()` is the one copy matrix.
- **`AuthzError` gains `unavailable` (503)** — `isTransportFailure` separates network failure from
  verdict in `getCallerUid` + every `assertCartMember`/`assertSessionMember`/`assertCartItemMember`
  read; the mint + peek routes map auth transport failure to 503 + `Retry-After`, never
  `401 Invalid session`.
- **@mms/ui primitives**: `OutageState` (bilingual 🫖 medallion card, retry escalation after 2
  failures, exit slot), `DegradedStrip` (role=status/note, honest inline staleness),
  `RetryButton` (44px, survives its own tap), `EmptyState tone="error"`, `offline` icon.
- **Boundaries**: branded `not-found.tsx` (was Next's unbranded default); `error.tsx` now
  bilingual + outage-aware (probes health, keys copy off the truth) + escalates after 3
  error-mounts/90s.
- **Menu**: last-good catalog cache (module state, never stores failures) → a failed read serves
  the previous menu with an honest staleness strip; a cold instance shows the outage state; "The
  menu catalog is empty." is dead. `getMostLoved` restructured so errors THROW inside the cache
  boundary (never cached) and degrade outside it.
- **/cart**: `unavailable` renders "We can't reach your order right now — it's safe" + in-place
  retry, replacing the audit's worst-rated copy.
- **Auth plane**: `AnonAuthGate` publishes `establishing|ok|failed`; `SessionUnavailableStrip` on
  the home page ends the silent-limbo class with diagnosed copy + a real retry.
- **HomeResumeCard** consumes `statusWord` (the W9c honesty floor) — no more eternal
  "Confirming your order".
- **Copy sweep** (diagnosed truth): grocery add ×2, GroceryBrowse aisles failure, Checkout promo —
  each flashes a neutral line immediately and upgrades when the probe returns a verdict. The
  grocery session banner got an honest static hedge (not diagnosed — it renders pre-hook). The
  REMAINING connection-blaming strings (dine-in join copy, staff PIN/login) ride W10b.

## W10b — staff surfaces ✅ (2026-08-01)

The stance: **a staff board is a ledger, not a website** — mid-service its most valuable asset is
the last-known state, so an outage must never blank it, redirect it, or fake liveness over it.

- **`StaffAuth` gains `unavailable`** — `getStaffAuth` separates transport failure from verdict at
  `getUser()` AND both staff-row reads (an unread row is not `not_staff`); `requireStaff` throws
  503 `code:"unavailable"`; `requireStaffPage` returns `null` → pages render `StaffOutageShell` in
  place (URL kept, one-tap route-refresh retry) instead of a login redirect. New `staffGate()`
  gives every mutation arm a discriminated `{ok,caller}|{ok:false,error}` with the shared
  `STAFF_WRITE_OUTAGE` copy.
- **One frozen-board vocabulary** (`lib/staff-outage.ts`): `frozenBoardCopy` names the freeze
  moment from the snapshot's own server clock and escalates past 2 minutes to "take new orders on
  paper; nothing here is lost"; `raceTimeout` turns a HUNG poll into the ordinary failure path (the
  `inFlight` lock can no longer freeze a board wearing its live face); `isRetryableAuthShape` is
  the client twin of `isTransportFailure` for login/PIN surfaces.
- **Boards keep the ledger**: KDS/Expo stop redirecting on outage (reason `"outage"` freezes the
  snapshot and keeps polling; genuine `signin`/`locked` still redirect); FloorBoard gains the
  stale/frozen banner its siblings had; FloorDetailLive discriminates `closed` (bounce) from
  `outage` (freeze); ApprovalsBoard inherits the vocabulary and its resolve arm says "still
  pending" instead of a generic error.
- **False-verdict sweep**: every queue/anchor read error-checks — a failed read can no longer
  render "All clear" / "No bags waiting" / "the floor is quiet" / "no open order" / "no card on
  file" / "nothing to settle" / an empty roster/approver/merge-candidate list. All 24
  `requireStaff().catch(() => null)` arms discriminate outage from sign-out.
- **Login/PIN/sign-out honesty**: StaffLogin's three handlers (Google, send-code, verify) branch on
  the retryable shape ("your email/code is fine") instead of blaming the address or the code;
  PinUnlock's outage reason says no attempt was burned; both sign-out paths stop asserting
  "check your connection" without evidence; `app/staff/error.tsx` gives /staff routes a
  staff-voiced boundary ("your sign-in is fine; run on paper").

Deferred from the matrix: realtime channel-status surfacing (LOW, unchanged).

## W10c — money-path outage hardening ✅ (2026-08-02)

The half of W10 where being wrong costs money rather than goodwill. One root cause runs through it:
**postgrest-js RESOLVES a transport failure into `{ data: null, error }` — it does not reject.** A
destructure of only `{ data }` therefore produces a confident, perfectly-shaped, WRONG answer during
an outage, and every finding below is a place that answer was believed.

- **`getCartTotals` no longer answers with a number it isn't sure of (M30).** All three reads
  (`qr_cart_items`, `mms_promo_discount`, `mms_reward_discount`) check `error` and throw. Two ways
  that paid off: in the webhook's `payment_intent.succeeded` branch a zeroed total made the derived
  amount disagree with a REAL charge, so the event was triaged as **tampering** — wrong alarm, wrong
  `refunds_needed` reason, no retry; throwing routes it to the "Totals lookup failed; will retry" 500
  that already existed. And in `create-intent` the **partial** failure was the worse one — items
  readable, `mms_promo_discount` not, discount silently 0, diner charged MORE than the cart in front
  of them showed. Pinned by `lib/totals.test.ts` (4 cases, including a happy path so a blanket-throw
  mutant can't pass) + `verify:slice` mutants (29 total across the slice, from 20).
- **`split-settle` stops converting Stripe's retry durability into silent loss (M31).** Every
  `qr_cart_shares`/`qr_carts` read and write in `cartIdForPi` · `onShareAuthorized` ·
  `captureAllIfReady` · `onShareCaptured` · `onShareFailed` · `onShareCanceled` throws on `error`
  (`cartIdForPi` returns null only for a genuine no-row), and the webhook's split branches 500 so
  Stripe redelivers. The 500-and-retry machinery was already there — the libs were simply never
  telling it anything had gone wrong. The post-capture mark is self-healing on redelivery:
  re-capturing a captured PI raises `payment_intent_unexpected_state`, which the branch tolerates.
- **The client surfaces stop lying about what already happened.**
  - `RewardField` — apply/remove had **no** try/catch, and both Server Actions throw under an outage
    (`assertCartMember` rejects before any discriminated reason exists). `setBusy(false)` never ran,
    so `busy` latched TRUE: every coupon button, or Remove stuck on "…", disabled forever with no
    message. `try/catch/finally` + per-direction honesty (a failed apply didn't burn the reward; a
    failed remove left it on the order). The applied branch got its own error line — `remove()`'s
    message was being set into a paragraph that branch never rendered.
  - `SharePay` — a payer whose Element mounted before the outage **can** authorize: Stripe is up and
    a real hold lands. `onAuthorized` fires, the board sync fails, and the form deliberately keeps
    its spinner waiting for a row flip that never comes. Now bounded (25s ≈ 4 board polls), after
    which it says the true thing — card authorized, nothing captured until the table is in, the
    board is the part that's behind. The tip group locks at the same moment: re-minting cancels the
    live hold, and a control that quietly falsifies the sentence beside it is the bug.
  - `/track` — once BOTH the live read and the uid-scoped fallback give up, ask the health probe. If
    it's us, drop the "taking longer than usual / refresh to check" vocabulary (which makes the
    DINER'S order the thing that's wrong) for _your payment is safe, show this screen to staff_
    plus a payment reference taken from the page's own URL. The `/account` link is withdrawn in that
    state — same backend, second broken screen.
  - `SettlementBoard` — the 5s poll backs off to a 30s cap while the board can't be read and returns
    to 5s the instant it answers. Self-scheduling off each load's outcome, so recovery is never a
    slow tick late.
- **`lib/lock` releases return their write error** instead of dropping it. They stay best-effort at
  every call site (the 5-min lock / 10-min settle TTLs are the real backstop) but the webhook's
  `payment_failed` branch now logs it. **Deliberately still 200:** unlike the split marks, these releases are
  UNCONDITIONAL by cart, so a late redelivery would clear a live `settle_at` on a split the table
  has since opened. A 500 here buys nothing and could cost something.
- **Runbook note (ops):** Stripe redelivers a failed webhook for **72 hours**. A pause longer than
  that outlives the retry window — after restoring the project, replay the failed deliveries from the
  Stripe dashboard (Developers → Webhooks → the endpoint → failed events → Resend) and run a
  shares-vs-orders sweep before trusting the settlement board.

## W10d — a split table can always finish ✅ (2026-08-02)

Two of the three defects the W10c reviews surfaced on the split-tender path. Closes OPEN-ITEMS
**M39** and **M40**. The third (**M1/M25**) was built, reviewed, and **reverted** — that is the most
useful thing in this slice, so it is written up below rather than quietly dropped.

- **A declined payer could not re-pay at the same tip (M39).** `create-share-intent` cancels the prior
  PaymentIntent and then calls `create` under the SAME `share_<id>_<amount>` idempotency key. Stripe
  caches a key's response for 24h, so it replayed the intent the route had just canceled. The key now
  carries the intent being REPLACED (`…_after-<pi>`): a retry is a new key, a double-tap still
  collapses onto one intent. Extracted to `lib/split-intent-key.ts` so the property is testable — its
  own test caught the first draft's sentinel collision, and a review caught that every retry fixture
  passed the same previous id, so the term was never actually pinned as being READ.
  **Reachability, stated precisely:** the common decline path re-confirms the SAME intent on the
  still-mounted Element and never calls this route (that path was fixed in W10c). This bug is reached
  by a remount, a tip toggle, or SharePay's own "Try again".
  A failed claim WRITE no longer cancels the minted intent either — the row still points at the
  previous id, so the retry derives the same key, and cancelling would recreate the exact dead end.
- **Abort abandoned live holds (M40).** The cancel loop covered only `authorized`/`pending` rows, then
  the delete removed every non-`captured` row — so a share marked `failed` whose PaymentIntent still
  carried a live authorization kept it for the full ~7-day window with no record left that could
  release it. A row's status is not its PaymentIntent's status. Cancel failures are now reported (the
  delete on the next line destroys the only record of the hold), and that delete checks its own error.

### Reverted: the real fulfillment reconcile (M1/M25) — and why

`mms_fulfill_split_order`'s sum guard compares a value to itself. Giving it a real second opinion (the
cart's total + per-payer tips) and running that reconcile BEFORE the first capture looked correct and
is not:

- **The cart total legitimately MOVES.** The webhook burns the applied reward immediately after
  fulfillment (`mms_reward_discount` filters `redeemed_at is null`), and a time-windowed promo can
  expire mid-settlement. Every sibling and redelivered `succeeded` event then computed a LARGER
  expectation than the pinned ledger, and the RPC's guard runs before its idempotent branch — so a
  self-healing no-op became a permanent 72h failure loop.
- **"Refusing costs nothing" is false on re-entry.** `captureAllIfReady` deliberately proceeds on a
  stale freeze and is re-entered by the straggler path after a PARTIAL capture. Refusing there leaves
  money already taken on the captured shares, and `abortSettlement` refuses too once any share is
  captured — the precise dead end the slice claimed to prevent.

**The design that works** (its own slice, needs a migration): persist the expected total at
`openSettlement`, reconcile the ledger against that PINNED constant pre-capture, and give a mismatch a
durable record plus a diner/staff surface instead of a `console.error` and a retry loop. Tracked as
**M1**/**M25**, with the new gaps the review found as **M42** (neither call site is pinned by any
test), **M43** (a dead-ended split tells no one) and **M44** (a released hold is never announced).

**Still deferred:** **M29** — only the host is stamped `earned_by`, so every other share payer's paid
order is invisible to them. Visibility is a bug; whether they also earn a Star is a product question
against the "one order = one Star" model.

## Deliberately deferred

- Realtime channel-status surfacing + reconnect circuit-breakers (LOW class) — fold into W10b.
- Per-segment error.tsx boundaries — the root boundary is branded and now outage-aware; add only
  where a segment needs different recovery (staff, W10b).
- `/rewards` loading.tsx skeleton (LOW).
