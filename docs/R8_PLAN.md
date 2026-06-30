# R8 — /track + rewards signature moments (build plan)

> Richness **R8**: bring **real loyalty Stars** + the signature rewards flourishes (the conic ring, a
> tier-up moment) to the two honest-but-plain surfaces — `/track` and `/account`. Built from a 5-reader
> context sweep (track/rewards code · the reward backend SQL · rubric+plan · delivery patterns · available
> primitives). Owner decisions locked **2026-06-30**. Reference: `docs/RICHNESS_PLAN.md` §R8,
> `docs/prototype/v7.2.html` (rewards ring + perk grid), `docs/context/{RUBRIC,DESIGN-RESEARCH}.md`.

## Owner decisions (locked)

1. **/track richness → Middle.** The success screen shows the honest **"+N Star(s) earned"** pill (the real
   per-order earn, 1 paid order = 1 Star) plus, once the milestone summary resolves, a **"N to your next
   reward"** caption — fetched race-correct and falling back to no claim if unavailable. The ring + tier-up
   stay **/account-only** (avoids the Stripe-redirect/webhook timing race on the transient success screen).
2. **/account RewardsHub → Full surface.** The flat progress bar becomes the **SVG Stars ring** hero,
   `NumberFlow` rolls the stars + lifetime spend, the tier ladder gets a CLS-safe entrance, a **tier-up
   celebration** fires on a genuine climb, and an honest **"How it works"** panel replaces the prototype's
   fictional perk grid.

## Data / honesty reality (de-risks the build)

- **Real Stars exist.** `mms_rewards_summary(p_user)` returns `stars` = count of the diner's PAID orders
  (1 order = 1 Star), `spend_cents` (lifetime net), `tier_id`, `milestone_step`, `orders_to_next` (strictly
  ≥1). This retires R7a's placeholder `gems = round(total)` display rule.
- **Per-order earn is +1, and attribution matters.** The webhook stamps `earned_by` and awards: single-pay →
  the **payer** earns; split-tender → **only the host** earns. So a non-host share-payer earns nothing —
  `getRewardsProgress(orderId)` server-checks `earned_by === auth.uid()` (`earnedThisOrder`) and the pill is
  gated on it, so we never claim a Star a diner didn't get.
- **Race-correct fetch.** `mms_reward_on_fulfill` + the `earned_by`/`status=paid` stamp happen in the webhook
  *before* the order row becomes visible to the client — so fetching once the order has **arrived** (Realtime-
  confirmed) guarantees `stars` counts it. No off-by-one.
- **The prototype perks are demo fiction.** Free milk tea / 10% off snacks / birthday sweet / skip-the-line
  are not deliverable (QR ships only the milestone reward coupon + spend tiers; `isEarlyAccess` has **zero
  consumers**). "How it works" states only the real mechanics — honesty over literal fidelity.
- **The "conic" ring is an SVG stroke arc.** QR has no `conic-gradient`; the prototype itself uses an SVG
  `stroke-dashoffset` ring (r=66, stroke 11), so R8 builds that — the visual the ask means.

## What shipped

### Slice A — real Stars on /track ✅

- **`lib/rewards.ts`** — new `getRewardsProgress(orderId?)` server action: SSR-uid-resolved, single
  `mms_rewards_summary` RPC (no coupon/profile reads), plus the `earnedThisOrder` attribution check. Returns
  null with no session (caller shows the bare success, no Star claim). Never trusts a client value.
- **`components/PaySuccess.tsx`** — prop `gems` → `{ starsEarned, ordersToNext }`; pill **"✦ +N Star(s)
  earned"** + an honest **"N order(s) to your next reward"** caption when the summary resolves. Class rename
  `.pay-success-gems` → `.pay-success-stars` + new `.pay-success-progress`.
- **`components/OrderTracker.tsx`** — removed `gems = round(total)`; fetches `getRewardsProgress(order.id)`
  once (ref-guarded) when `justPaid` and the order lands; passes `starsEarned` (gated on `earnedThisOrder`)
  + `ordersToNext`. The single `role="status"` live region stays the only announcer.

### Slice B — Stars ring ✅

- **`components/StarsRing.tsx`** (new) — 148px SVG ring (track + `stroke-dashoffset` arc tinted by tier),
  pure-CSS draw-on (`@media (prefers-reduced-motion)` off-switch — no `shouldAnimate` race), `✦{stars}`
  rolling via `NumberFlow`, ONE composed `role="img"` label (SVG + center `aria-hidden`).

### Slice C — tier-up moment ✅

- **`components/TierUpCelebration.tsx`** (new) — ported from delivery onto QR tokens: a `localStorage`
  last-seen-rank compare that fires **only on a strict upgrade** (first sight just records the baseline;
  revisit/downgrade stay silent), one eval per mount, storage-blocked → skip. Reveal is **rAF-deferred**
  (async setState — lint-safe vs `set-state-in-effect`) so the page paints first. Reuses `Confetti`,
  `role="status"`, ≥44px labelled dismiss + tap-anywhere, a real `z-index` (not a Tailwind-v4 no-op class).

### Slice D — RewardsHub full surface ✅

- **`components/RewardsHub.tsx`** — flat bar → `StarsRing` hero; `NumberFlow` on stars (ring) + lifetime
  spend; **honest "How it works"** (earn a Star / a reward every N Stars / climb the tiers — no fiction);
  tier ladder gets a CLS-safe scale entrance (**no hover-lift** — the rungs aren't interactive, so a lift
  would be a false affordance, per the R7b learning) with a soft glow on the current rung; `TierUpCelebration`
  mounted.
- **`globals.css`** — R8 block: `.stars-ring*` + `@keyframes starsRingDraw`, `.reward-rung*` + `rewardRungIn`,
  `.tier-up*` + `tierUpIn`, all transform/opacity/stroke + `@media (prefers-reduced-motion)` gated. Built-CSS
  grep confirms every class emits (Tailwind-v4 no-op trap).

## Deferred (tracked, not in this PR)

The plan's remaining **/track motion polish** — a connector shimmer down the completed rail and a `NumberFlow`
on the receipt total — is held back: the receipt total is a *final* figure, so rolling it would imply a
changing total (honesty), and the "your food's up" pulse already exists (`mms-track-now`, `useInView`-gated).
Fold into R9 if still wanted.

## Guardrails (every R8 change)

Money/rewards **server-derived, never a client value**; the "+N Star earned" claim **gated on real
attribution** (split non-host earns nothing); ONE live region on /track; mobile GPU budget (no
blur/backdrop-filter; SVG stroke + transform/opacity only); reduced-motion in **CSS** (no `shouldAnimate`
first-render race); AA contrast both themes; tokens not hex; celebrate the EARNED moment once (tier-up
deduped via localStorage); **no fabricated numbers/perks**; Pre-PR self-review sweep ending in a
fresh-context adversarial subagent, verdict posted on the PR.
