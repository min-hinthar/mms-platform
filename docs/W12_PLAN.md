# W12_PLAN — The two-moment checkout (Order · Pay)

**Status: SHIPPED (2026-08-14). Opened S13 (tab never extends the session TTL).** Owner
directive: the dine-in cart "feels confusing to have
options to send to kitchen, open tab or secure tab" — simplify to world-class. Design parents:
`docs/context/ORDER-MODEL.md` ("the order belongs to the _table_"; **"'Checkout' = tab-close"**),
`docs/S3_DESIGN.md` (trust by default, secure on the server's call), `docs/JOURNEY_PLAN.md` J4
(settle & goodbye — peak-end completion).

## The diagnosis

The current `/cart` puts three **settlement models** side by side — pay now (`Continue · $X`),
trust tab (`Keep tab open`), card-secured tab (`Secure your tab`) — and asks the diner to pick.
No restaurant asks a guest that question. The benchmark products (me&u, sunday, Toast Order & Pay)
all converged on the same shape: **the tab is a state, not a choice.** The diner has exactly two
verbs, owned by two different moments:

1. **Order** (while hungry) — send the round to the kitchen. No money moves, no tip ceremony.
2. **Pay** (when done) — the bill: everything so far, tip, split, done.

Everything between those moments _is_ the open tab. It needs no name, no pill, no opt-in — which
is exactly what ORDER-MODEL already decided ("trust by default"; "checkout = tab-close"). The
screen never staged it; W12 stages it.

## The restage (presentation only — NO route change, NO money-path change)

One route (`/cart?cart=…`), one component (`Checkout.tsx`), every hardened layer preserved
verbatim: the pay-window lock + beacon release (W9b), realtime resync, the settling/SettlementBoard
view, split machinery, outage honesty (W10a), server-authoritative totals. The existing `viewKey`
mechanism (focus-to-heading + `checkout-step` enter animation on view flips) gains one more axis:

```
viewKey = settle | pay | review-order | review-bill   (dine-in)
        = settle | pay | review                        (pickup / scango — unchanged, already one-moment)
```

### The Order moment (dine-in `review-order`)

Heading **"Your order"**. Contents: the peer lockbar · `TimelineStrip` (the kitchen narrative) ·
the full editing surface (grouped line cards, steppers, for-here/to-go, make-it-now, notes) ·
**`Send to kitchen` promoted to the PRIMARY CTA** (the filled `.checkout-cta`, carrying the draft
count: "Send to kitchen · 3 items"; its undo-grace machinery rides along unchanged) · below it, a
quiet ghost bar **"View bill & pay · $X →"** with the live `NumberFlow` total — the bill stays
visible without dominating. When nothing is left to send: "Your order's with the kitchen." and the
View-bill bar becomes the primary. **No promo, no reward, no tip, no fee breakdown here** — those
are pay-moment concerns that forced bill-thinking while the diner was still hungry.

### The Pay moment (dine-in `review-bill`)

Heading **"Your bill"**. A back affordance ("← Back to your order", the pay step's quiet
`.nav-link` pattern). The bill renders as a true receipt: **per-line rows inside the textured
`.checkout-receipt` slip** (qty × name · dotted leader · amount; state chip for kitchen lines,
strike for voided, Comped tag; group lines carry the owner) above the existing breakdown
(promo → reward → service charge + SB-1524 disclosure → tax → tip ask → display-serif rolling
total). Then: **`Pay · $X`** (group: "Pay the whole order · $X") · the split reference /
`SplitSection` · and ONE quiet card-on-file line (below). Read-only lines — editing belongs to the
Order moment, one tap back.

Stage transitions ride the existing keyed `checkout-step` enter animation (reduced-motion-safe)
and the existing focus-to-heading effect. Initial stage is derived, then user-controlled: drafts
exist → Order; everything fired → Bill (the mid-meal settle-nudge journey lands ready to pay).
After a send the view STAYS on Order (the diner just ordered; they're eating, not paying — the
me&u insight; the View-bill bar is right there).

### Tab vocabulary retires (diner-side only)

- The **"or settle later" tray, the `Keep tab open` pill, and the diner `openTab` call are
  removed.** An unsettled dine-in table already _is_ the trust tab; opting into the default was
  the confusion. (`lib/tabs.ts` is untouched — staff keep `OpenTabButton`, the floor badge, the
  ceiling/nudge discretion flags, the audit trail. Server-side, tab state gates nothing about
  ordering — verified: merge rules + display + audit only.)
- The CTA is **always "Pay · $X"** — never "Settle tab · $X". One verb.
- **`SecureTabButton` reframes as a benefit, not a model**: one quiet line on the Bill —
  "Save a card — leave whenever, we'll close you out." → the same SetupIntent form. Rendered only
  for dine-in while `tabType !== "secure"`. Once secured, the note reads "Card on file — settle
  anytime, or just leave and we'll close it." A `trust` tab renders NOTHING diner-side (it is the
  default state; only staff surfaces name it).
- v7.2 note: this deliberately supersedes the prototype's settle-later tray strings (owner
  directive 2026-08-14). The tip ask, SB-1524 disclosure, and receipt copy stay verbatim.

### Explicitly unchanged

Pickup + scango (already one-moment pay-first; `canSendToKitchen`/`canTab` are false there) ·
the pay step + Payment Element + wallet flow · the settling view + split settle · every server
action and RPC · all charged amounts, tip semantics, totals derivations · the kiosk (own shell) ·
staff surfaces.

## Hardening

- `lib/checkout-stage.ts` — the one pinnable behavioral rule as a pure fn: `initialStage(items)`
  (any draft → "order"; fired-only → "bill"; empty → "order"). Unit-pinned red-first
  (`lib/checkout-stage.test.ts`). No mutants: W12 adds no money/authority rule (presentation
  restage; the charge authority is untouched), and the repo has no `.test.tsx` runner — decision
  logic that matters lives in `lib/` per the W10d M46 rule, which this follows.
- The Pre-PR sweep runs in full (a11y: heading-per-moment, focus on stage flip, one announcer per
  view, 44px, `aria-pressed`/`aria-disabled` discipline preserved; error paths: every removed
  state (`tabBusy`/`tabError`) leaves no dangling writer/reader).

## Registry (OPEN-ITEMS)

- **NEW S13**: an open tab does not extend the 4h session TTL (`lib/session-ttl.ts` flat
  `now()+4h`, no sweep consults `tab_type`) — an all-night trust tab's session can expire under
  it. Surfaced by the W12 periphery map; needs its own slice (TTL extend on tab activity, or a
  tab-aware sweep).
- **S3.1 note**: the diner-side "Keep tab open" affordance retired by W12 (the trust tab is the
  implicit default); staff open remains the deliberate path.

## Slices

- **W12·1** — the stage machinery + Order moment (Send promoted, View-bill bar) + Bill moment
  (receipt-slip lines, Pay CTA, back link) + heading/focus/animation.
- **W12·2** — tab vocabulary retirement: tray/pill/`openTab` removal, CTA relabel, the
  card-on-file reframe + copy.
- **W12·3** — `lib/checkout-stage.ts` + test (red-first) · docs sweep (ROADMAP · CHANGELOG ·
  OPEN-ITEMS S13/S3.1 · HANDOFF) · gate · ONE capped review · PR.
