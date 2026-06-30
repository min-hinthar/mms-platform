# R7 — Checkout + the pay-success celebration (build plan)

> Richness **R7**: "the one celebratory thunk" + roll the money. Built from a 5-reader context sweep
> (current checkout/track code · v7.2 prototype · rubric+plan · delivery patterns · available primitives).
> Owner decisions locked **2026-06-30**. Reference: `docs/RICHNESS_PLAN.md` §R7, `docs/prototype/v7.2.html`
> (cart-sheet checkout + `successSheet`/`celebrate`), `docs/context/{RUBRIC,DESIGN-RESEARCH}.md`,
> `docs/MOTION_AND_PERF.md`.

## Owner decisions (locked)

1. **Gems pill → display rule (1c).** Show **"✦ +N gems earned"** with `N = round(total)` — a deterministic
   display rule (≈1 gem/$) over the **real paid total**, not a fabricated balance and not a persisted loyalty
   earn (QR has no per-order points earn today; `RewardField` only _redeems_). Revisit wiring to a real earn
   if/when loyalty awards per-order points.
2. **Celebration richness → v7.2 + draw-on checkmark (2a).** A drawn **SVG checkmark** (pathLength) instead of
   the prototype's emoji ✅, + bespoke confetti + the gems pill + a success haptic. NOT the heavier delivery
   treatment (wax-seal crest / tier-up / shared-element route morph) — out of scope, and tier-up needs a real
   loyalty-tier system.
3. **Cadence → split into two gated PRs (3b).** **R7a** = the pay-success celebration + the NumberFlow
   money-roll (the signature moment, focused review). **R7b** = checkout review/pay polish (tip-chip + button
   press/glow, card-interactive lines, spring step-transition).

## Data / placement reality (de-risks the build)

- **`confirmPayment` HARD-REDIRECTS** to `/track?...&redirect_status=succeeded` (`PaymentSection` `return_url`).
  There is **no in-checkout success moment** — so the celebration lives on **`/track` arrival** in
  `OrderTracker`, gated by a new `justPaid` prop (`redirect_status === "succeeded"`, or split `paid=1`).
- **Confetti = bespoke, no new dep.** The v7.2 prototype used canvas-confetti (a CDN demo), but **delivery**
  uses bespoke framer/transform particles, and the plan says rebuild. So R7a ships a small CSS-animation
  confetti (≤90 transform/opacity spans, token colors) — cheaper than 90 framer nodes, off-main-thread, and
  within the mobile GPU budget (no blur/backdrop-filter).
- **Money stays presentation-only.** NumberFlow rolls the **displayed** total only; the charge is
  server-authoritative (`getCartTotals`/create-intent). Never touch tip/tax/discount/total math.

## R7a — pay-success celebration + money-roll ✅ shipped 2026-06-30

- **`components/Confetti.tsx`** (new) — one-shot ≤90-span CSS-animated confetti (transform/opacity only,
  deterministic spread, token triad gold/jade/clay, `display:none` under reduced-motion).
- **`components/PaySuccess.tsx`** (new) — draw-on SVG checkmark (`m.circle` scale + `m.path` pathLength,
  reduced-motion → final state) + **"Paid — thank you!"** + **"✦ +N gems earned"** pill. Confetti gated on
  `shouldAnimate && useDeviceTier()!=="low"`; one-shot success haptic `[10,40,18]` (ref-guarded). No second
  live region (the tracker's `role="status"` is the only one).
- **`components/OrderTracker.tsx`** — new `justPaid` prop; on a fresh successful payment the celebration is the
  `<h1>` with a compact mode·status·ETA row beneath, then the existing timeline. `gems = round(total)` shown
  once the order lands.
- **`app/track/page.tsx`** — passes `justPaid` (single-pay `redirect_status==="succeeded"`; split `paid=1`).
- **NumberFlow money-roll** — `CartBar` subtotal + the Checkout `Total`/`Estimated total` row (currency format,
  snaps under reduced-motion; static `aria-label` kept so the amount isn't re-announced per tap).
- **`globals.css`** — `.pay-success*`, `.mms-confetti*` + `@keyframes mmsConfettiFall`, `.track-statusrow`
  (all transform/opacity, reduced-motion off-switch).

## R7b — checkout polish ✅ shipped 2026-06-30

Built, with one thoughtful deviation: **cart lines use `card-textured`, not `card-interactive`** — the lines
aren't clickable (they hold a Stepper), so a hover-lift would be a false affordance; the texture adds the
"layered surface" richness without implying interactivity. Everything is **CSS `@media`-gated** (not the
`shouldAnimate` hook — applying the R7a reduced-motion-race learning proactively):

- **Tip chips** (`.checkout-tip`) — press settle (scale .97) + a smooth tint/preview transition on rate change.
- **CTAs** — `.checkout-cta` (Continue / Pay): accent glow (`--sh-glow`) on hover + press settle;
  `.checkout-cta-ghost` (Edit): quiet hover + press.
- **Cart lines** — `card card-textured` (richer surface, no false-clickable hover-lift).
- **Order summary** — the grand total reads as the hero figure (hairline divider + display serif + 20px),
  presentation-only.
- **Step transition** (`.checkout-step`) — a **keyed** wrapper enter-slides on each view change
  (review ↔ pay ↔ settle); keyed on the view so the animation replays while the always-mounted `<h1>` stays
  the focus target. The pay step's **Stripe Element mounts with the wrapper**, and the enter is a `transform`
  on the wrapper, so the embedded Payment Element iframe never reloads (its appearance is mount-time — a
  remount would wipe in-progress card entry, R2 known limitation).

## Guardrails (every R7 PR)

Mobile GPU budget (no stacked `backdrop-filter`/`blur()`; confetti is transform/opacity, count-capped);
60fps transform/opacity; reduced-motion in CSS + JS; device-tier gate on the particle field; AA contrast both
themes; **money presentation-only, server-authoritative** (never touch totals math); tokens not hex;
celebrate the EARNED moment once (no loop); Pre-PR self-review sweep ending in a fresh-context adversarial
subagent, verdict posted on the PR.
