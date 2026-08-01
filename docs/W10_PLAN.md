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

## W10b — staff surfaces (planned)

The boards must NEVER redirect to login on an outage (`getStaffAuth` needs the same
transport-vs-verdict split → keep-last-known-snapshot + stale banner everywhere; FloorBoard is
missing the fails≥2 banner its siblings have); queue reads must stop conflating error with empty
("All done" during an outage); StaffLogin/PinUnlock need honest outage states (a cook who locks the
console mid-outage currently cannot get back in and is told to check their connection). Full list:
`W10_MATRIX.md` §staff (12 findings, 5 HIGH).

## W10c — money-path outage hardening (planned — REAL bugs, priority)

- **`getCartTotals` treats an unreadable cart as an EMPTY cart (zeros)** — inside the webhook path
  that misroutes an outage into the tamper/mismatch arm. Must throw on read failure.
- **`split-settle` webhook handlers swallow `{ error }` on every DB write** — a DB outage converts
  Stripe's retry durability into permanent silent loss. Must return non-2xx so Stripe redelivers.
- SharePay unbounded spinner on a money action that succeeded at the card network; RewardField
  missing catches (stuck `aria-busy`); create-intent client copy for 503. Full list:
  `W10_MATRIX.md` §money-webhooks (12 findings, 4 HIGH).
- **Runbook note:** Stripe redelivers for 72h — an outage longer than that needs a manual dashboard
  resend after recovery.

## Deliberately deferred

- Realtime channel-status surfacing + reconnect circuit-breakers (LOW class) — fold into W10b.
- Per-segment error.tsx boundaries — the root boundary is branded and now outage-aware; add only
  where a segment needs different recovery (staff, W10b).
- `/rewards` loading.tsx skeleton (LOW).
