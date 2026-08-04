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

### W10d pre-merge review — what the adversarial pass caught (2026-08-04)

Five lenses (money-correctness · concurrency · error-recovery · guard-adequacy · doc-fidelity), 22
findings, 16 surviving independent refutation. Every HIGH was re-derived against the real code before
being acted on, because a review is evidence, not a verdict.

**The three regressions this slice introduced.** All three came from the same place: a fix written for
one failure mode, without re-checking the rule the surrounding code already carried.

1. **`.or()` + `.select()` on the claim UPDATE.** M39 needed the claim to accept a row pointing at
   either the replaced intent or the just-minted one, so the `.eq()`/`.is()` filters became a top-level
   `.or()` — while `.select("id").maybeSingle()` stayed. That combination is the PostgREST-14
   `return=representation` or-tree re-projection that took production checkout down on 2026-07-08, and
   `lib/lock.ts` carries a fourteen-line comment forbidding it. It would have 400'd every share mint
   with 42703, so `updErr` was truthy on every request and the retry derived the same key and 500'd
   again — **M39 shipping completely inert.** Now `{ count: "exact" }`, the pattern already proven here.
   The lesson worth keeping: a rule written as a comment in the file where it was learned does not
   travel; the sibling file three directories away re-made the mistake nine months later.
2. **A bare `catch {}` that M39 turned dangerous.** The pre-mint cancel had always swallowed its error,
   and that was _fine_ under the old key, because the re-create replayed the very intent it had failed
   to cancel — so the row kept pointing at it. M39 made the re-create mint a genuinely new intent, and
   the claim then overwrites `stripe_payment_intent_id`, which is the only record of the old one. The
   swallow silently became "forget a possibly-live ~7-day hold". A correct fix made a pre-existing,
   harmless swallow into a money leak.
3. **`payment_intent_unexpected_state` classified as benign.** M40's new abandoned-hold log filtered
   that code out as "already dead". It is also Stripe's code for a **succeeded** PaymentIntent —
   `captureAllIfReady` retrieves on it for exactly that reason, thirty lines away in a sibling file. So
   the log excluded precisely the case where the DELETE on the next line destroys a share whose card was
   really charged. The added observability was blind in the one direction that mattered.

**The three pre-existing HIGH.**

4. **A `$0` by-person seat permanently bricks the table.** Reproduced rather than reasoned about:
   `deriveShareBreakdowns({3000, 0, 150, 289}, [a,b,c], lines owned by a+b)` returns `baseCents: 0` for
   seat `c` — structural, not fixture luck, since a zero-weight seat's fractional part is exactly 0 and
   largest-remainder never gives it a penny. `openSettlement` auto-settles it to `captured` with a NULL
   PaymentIntent so it can't block the all-covered gate. Three separate call sites then read `captured`
   as "money moved": abort threw _"Payment already completed — the order will finish"_ when nothing
   would ever finish, re-open threw _"Payments are already in progress"_, and `paymentInFlightReason`
   returned `split_in_progress` **independent of the freshness TTL**, refusing cash-settle, clear-table,
   voids, comps, approvals and every staff line edit forever. Worst of all, any other seat's live hold
   could never be released, because the M40 release sits behind that same refusal. All three now
   discriminate on the PaymentIntent, not the status.
5. **Abort cancels from a stale snapshot.** The share SELECT, N Stripe round-trips and the DELETE are
   three statements with nothing serializing them. `SharePay` mints on mount, so a payer merely opening
   the sheet mid-abort has their row repointed to a brand-new intent — and the DELETE then destroys it
   with the intent never cancelled. Fixed by making the DELETE return what it removed (it is the
   serialization point) and releasing anything the loop never tried.
6. **The whole M40 rule could not fail.** Nothing imported `lib/split.ts` from any test, and
   `verify:slice`'s `MUTANTS` targeted eight other files. Reverting the widened cancel predicate _or_
   deleting the `deleteErr` throw left the suite green and `verify:slice` clean. This is the same class
   the mutation harness exists to kill, and it went unnoticed because the _rule_ was new while the
   _file_ was old — nothing prompts you to notice a file has never had a test.

**Also fixed, same review:** `openSettlement`'s replace-delete got M40's rule (it deleted the prior
share set and cancelled nothing, and past the 10-minute TTL a re-open is the table's only forward
exit); a lost claim re-reads the row rather than asserting _"Your share was just settled"_ on a
`pending` share (two tip taps ~1s apart mint two intents at different amounts, so the loser is the
request the client is listening to, and "refresh to see it" discarded the tip they had just chosen);
`SettlementBoard`'s `canPay` accepts `canceled`, which the server's claim predicate always did.

**Deliberately not fixed — `M45`.** `captureAllIfReady` reads `settle_at` once and then loops, so an
abort can release payer A's hold and only then meet payer B's already-captured one. The abort now
refuses and re-freezes, but A is cancelled and B is charged, `every(authorized|captured)` never passes,
and the host is told _"the order will finish"_ when it cannot. Closing it means stamping the share
capture-claimed **before** each `paymentIntents.capture` and widening abort's refusal to include that
stamp — a schema change, so it is out of this slice.

**New coverage.** `lib/split-hold.ts` (the `released | gone | captured | unknown` classifier both paths
now share) and `lib/split.test.ts` (18 tests on the query-recording mock), plus eight `split/*` and
`split-hold/*` mutants. Every rule was watched fail before commit: the mutations were applied by hand
first, and `verify:slice` re-applies all 38 on every run.

### W10d pre-merge RE-review — the fix layer's own defects (2026-08-04)

The re-review was deliberately scoped to the fix layer, because this repo's history says that is where
the damage lands: on W10c, five rounds all returned BLOCK and **every HIGH was in the newest fix layer**.
That held again — three more HIGH, and the shape of them is worth keeping.

1. **A fix can be correct and still leave the statement it edited broken.** `pay-guard`'s count read
   never destructured `error`, so the shared money mutex failed OPEN. The `$0` narrowing added to that
   exact statement was right; nobody re-read the two lines around it. The sibling count read in
   `staff-cart.ts` already fails closed, with a comment saying why.
2. **Symmetry is not automatic.** `abortSettlement` and `openSettlement` were given the same hold-release
   rule in the same commit, and only one of them was given the `captured`-is-fatal arm. The re-open
   detected a succeeded charge, logged it as a "hold", and inserted a fresh share set — the second-payment
   bug, created by the fix for the first. Both paths now read-then-release-then-delete, with a survivor
   check, and the code says so in both places.
3. **The guard gap moves with the fix.** Four rules added by the fix layer could not fail. The worst was
   the `{ count: "exact" }` claim: a reviewer reverted it to the exact shape that took production
   checkout down on 2026-07-08, and the suite stayed green, `tsc` clean, `eslint` clean. There was no
   route test, because there had never been one. **Closing a guard gap in file A does not close it in the
   file the fix touched.**

**A structural finding worth acting on (M46).** No vitest config in this repo runs `.test.tsx`, and the
orphan guard flags one — so any decision rule living inline in a component is unguarded _by construction_.
The board's "finishing up…" gate was such a rule, and it had silently stopped agreeing with
`captureAllIfReady` the moment `canPay` learned `canceled`. It moved to `lib/split-board.ts` to become
testable. That is right for a money rule but it is a workaround, not a policy.

**And a doc bug worth remembering.** An unescaped `|` inside the M45 row widened it to 6 cells against a
5-cell header; per GFM a header/delimiter mismatch means the table is not recognised **at all**, so the
whole 45-row money registry rendered as one raw pipe paragraph. `prettier` is what widened the delimiter
to match, so `format:check` passes — the gate cannot catch this. A second table on `main` was broken the
same way. Both fixed, and the docs sweep now validates every header/delimiter pair.

**Net.** 267 qr tests and 49 mutants, with four suites that did not exist before this round:
`lib/split.test.ts` (31), `create-share-intent/route.test.ts` (13), `lib/pay-guard.test.ts` (9),
`lib/split-board.test.ts` (5).

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

## W10d — a split table can always finish ✅ (2026-08-02, hardened 2026-08-04)

> **Pre-merge review returned BLOCK — 6 HIGH, three of them regressions this slice introduced.** The
> findings and their fixes are in §W10d pre-merge below; read that before trusting any claim above it.

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
