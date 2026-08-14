# W6C_PLAN — Stripe Terminal (M6·P6.2 pulled forward)

**Status: SHIPPED (2026-08-06).** Opened S11 (on-reader tipping follow-up) + S12 (live bring-up,
hardware-gated). In-person card at the register: the S700 takes chip/contactless
and the charge settles into the **same order ledger** through the **existing webhook fulfillment**.
Design parents: `docs/M6_DESIGN.md` §3 (server-driven, amount from `getCartTotals`, SAQ posture
holds) + `docs/PRODUCTION_PLAN.md` §W6c. **Hardware-gated at the edges only**: the code ships
feature-off (unset reader env), test mode drives a **simulated reader** through the identical API,
and the live S700 registration + smoke are owed on the owner's hardware + Terminal enablement
(the C7/W11-restore posture).

Grounded by a five-reader map (online Stripe path · register settle · locks/splits · env gating ·
fulfillment SQL). Two **premise corrections** the map forced:

- **No connection-token endpoint.** M6_DESIGN named one as "the only new secret surface" — that is
  the **SDK-driven** integration's requirement. The S700 is driven **server-side**
  (`stripe.terminal.readers.processPaymentIntent`), so no client SDK, no token mint, no new secret
  surface at all: `STRIPE_TERMINAL_READER_ID` is server-only **config** (a device name, not a
  credential), and every reader command runs inside staff-gated server actions.
- **The W11 pin is split-only.** `settle_expected_cents` / `capture_started_at` are split-tender
  machinery. A Terminal single-tender settle reconciles the way online single-pay does: the webhook
  **re-derives** `getCartTotals` at delivery and 409s + writes `qr_refunds_needed` on any delta.
  That makes the freeze-held-across-the-collect rule load-bearing (below), because a cart edit
  between mint and webhook is a stranded charge.

## The settle model — closeSecureTab is the template, not settleCash

A Terminal charge is **async** (mint PI → reader collects → webhook fulfills), so the freeze
lifecycle copies `closeSecureTab` exactly, never `settleCash`'s blanket `finally` release:

1. `settleCard` (staff-gated action): `openCartFor` → `paymentInFlightReason` fast check → item
   count **fail-closed** → **`acquireSettlement(cart.id, caller.uid)`** — the race-closing claim,
   taken **before** any money derivation (HANDOFF's standing warning: Terminal must route through
   the settlement mutex or the double-collect guard has a hole).
2. `getCartTotals(cart.id, 0)` (`.catch → null` — a thrown totals read must never strand the
   button on "Settling…"), then mint the PI: `payment_method_types: ['card_present']`,
   `amount = totals.totalCents`, **per-attempt idempotency key** `pi_<cart>_term_<uuid>` (a stable
   key caches a decline for 24h — the freeze, not the key, is the double-charge guard), metadata
   `{ cartId, tipRate: '0', kind: 'terminal', settledByStaffId }`.
3. `readers.processPaymentIntent(READER_ID, { payment_intent, process_config: { skip_tipping:
true } })`. Any failure here (reader offline/busy/unset): cancel the PI best-effort, **release
   the freeze**, return a discriminated refusal with honest copy.
4. On success the action returns and the freeze **stays held** — the webhook's atomic open→paid
   flip is the terminal state; `SETTLE_TTL` + `qr_refunds_needed` are the orphan backstops.
5. The register UI **polls** `terminalStatus` (~2.5s): it retrieves the PI **and
   `extendSettlement`s the still-fresh freeze on every poll** — the split-tender pattern — so a
   slow chip interaction can't outlive the 10-min TTL and hand the cart to `acquireCartLock`,
   `openSettlement`, or `kioskReset`'s stale-freeze disjunct mid-collect (the map's central race).
6. Staff **Cancel**: `readers.cancelAction` + `paymentIntents.cancel` + `releaseSettlement`. A PI
   observed `processing` is treated like closeSecureTab's processing branch: keep the freeze, let
   the webhook decide.

**Tip = 0 in v1, decided.** The webhook reconcile recomputes `getCartTotals(cartId,
metadata.tipRate)` and a reader-added dollar tip has **no rate that reproduces it** — every tipped
tap would 409-loop and write a spurious refunds row. So v1 runs `skip_tipping: true` with
`tipRate: '0'`, exactly the cash rule (`tip_cents = 0`, counter tips stay off-system — Min's
standing call). On-reader tipping is a registry follow-up that needs an absolute-cents tip channel
(webhook reading `amount_details.tip` + both reconciles accepting base + tip == amount).

## The webhook arm (kind: 'terminal')

The PI rides the **existing** `payment_intent.succeeded` path — reconcile-then-
`mms_fulfill_order`, idempotent on the PI id, cross-tender guard (`card_after_settle`) included —
with a `metadata.kind === 'terminal'` discriminator (never `'split_share'`: that routes into
share-ledger code with no row to find). The kind gates three deltas:

- **Attribution + tender:** the fulfill call passes `p_settled_by` (staff id from metadata) and
  `p_tender: 'terminal'` (migration below) so the order is auditable and the Z-report can tell
  counter card from online card.
- **Counter-session close:** `settleCash`'s after()-drain closes `reg-` / counter-style `kiosk-`
  sessions — the webhook path has no such close, so settled counter card orders would squat in the
  active set for 12h and clog the register queue. The same rule (extracted into a shared helper)
  runs in the terminal arm's `after()`.
- **`payment_intent.canceled`:** split-only today; a terminal-kind cancel (staff Cancel already
  released everything — this is the redelivery/out-of-band case) releases the freeze best-effort,
  200-ack, same accepted-hazard posture as `payment_failed`'s generic branch.

`payment_failed` (decline at reader) keeps the generic branch: unconditional lock+freeze release
is what the retry flow wants — staff re-acquire on retry, and the late-redelivery hazard is the
same accepted, TTL-backstopped one the online path documents.

## The migration (one, guarded, restated from the LIVE body)

`qr_orders_tender_chk` grows `'terminal'` (drop + re-add, do-$$ guarded), and
**`mms_fulfill_order` re-signs** with `p_settled_by uuid default null` + `p_tender text default
'card'` — a signature change, so: `drop function if exists` **both** signatures, restate the
**full live body from `20260716000000_w3_kitchen.sql`** (the stale-baseline restate is the exact
W11-review near-miss — the live body carries `customer_name`/`notes`/`table_number`), keep the
PI-id idempotency lookup as the **first** statement, and re-issue the three-name revoke +
`service_role` grant for the new signature (grants don't survive a drop). `p_tender` is
CHECK-constrained by the column; existing callers change nothing (defaults preserve the online
path byte-for-byte). Types regen (`database.types.ts` — the generator is the formatter).

## The register UI (FloorDetailLive) + Z-report

- **Card** appears beside Cash in the settle section **only when the server says the reader is
  configured** (unset env ⇒ the button never renders — feature-off, the /board pattern; the
  action independently refuses `not_configured`).
- States: idle → **on reader** (live status line + Cancel; polling drives `extendSettlement`) →
  paid (the **existing** lifted handoff `#CODE` card — the poll sees the order minted and hands
  `{orderId, totalCents, changeCents: 0}` to the same parent state that survives the settle
  section's unmount) / failed (honest per-reason copy: declined · reader offline · canceled ·
  timed out — retry re-runs `settleCard`, which re-acquires the freeze).
- `summarizeDay` gains an explicit **terminal bucket** (today any non-cash tender silently lands
  in Card): the register page renders Cash · Card (counter) · Card (online). `register-math` is a
  verify:slice money module — the new bucket ships with a mutant.

## Hardening (new rules → mutants, each watched fail)

- `terminal/unset-reader-answers-open` — unset `STRIPE_TERMINAL_READER_ID` must refuse
  (`not_configured`), never mint.
- `terminal/freeze-not-acquired-before-mint` — the `acquireSettlement` call precedes PI creation
  in the statement order; dropping it reopens the diner-phone-vs-reader double-collect.
- `terminal/success-holds-the-freeze` — the success path must NOT release (a release-on-success
  mutation reopens the capture→webhook window).
- `terminal/skip-tipping-dropped` — `skip_tipping: true` missing ⇒ the reader can inflate the
  amount past every reconcile.
- `register-math/terminal-invisible-in-summary` — the terminal bucket collapses into card ⇒ the
  Z-report misstates counter takings.

SQL is pinned by CI's real stack (`migrations-check` applies the migration; `types-fresh` pins the
regenerated types), same as W11.

## Deliberately out (registry rows)

- **On-reader tipping** (needs the absolute-cents tip channel end to end) — registry row.
- **/track for walk-ups** (session-less signed-order-token — HANDOFF's standing note) — unchanged.
- **Refunds from the register UI** (the `qr_refunds_needed` ledger + Stripe dashboard remain the
  operator path).
- **Live reader registration + smoke** — owner-gated on the S700 + Terminal enablement; test mode
  uses a simulated reader through the identical server-driven API.
- Multi-reader routing (v1 = one env-configured reader; a readers table is a later shape).

## Slices

- **W6c·1** — migration: tender CHECK + `mms_fulfill_order` re-sign (live-body restate, grants) +
  types regen.
- **W6c·2** — `lib/terminal.ts` (settleCard · terminalStatus · cancelTerminal, staff-gated) +
  webhook terminal arm (kind gate, attribution, counter-session close, canceled release) + the
  shared session-close helper extraction.
- **W6c·3** — FloorDetailLive Card flow + day-summary terminal bucket + ENV.md/.env.example rows.
- **W6c·4** — guards + mutants · docs sweep · gate · ONE capped review · PR.
