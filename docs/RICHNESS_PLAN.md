# Richness Track (R1–R9) — Delivery-Grade UI/UX for the QR App

> **Naming:** this is the **Richness track** (slices R1–R9), a focused UI/UX-quality initiative — **distinct from the roadmap's far-future `M6` (Kiosk · Terminal · EBT, 2027)**. It runs next, before that milestone.
>
> **Status:** plan / handoff. Built from three research reports (delivery richness catalog · QR per-surface gap map · feasibility + constraints). This doc is the spec a future session builds from — each slice is one PR per the M5 discipline. Read alongside `docs/MOTION_AND_PERF.md` (the rulebook QR already absorbed in M5·P5.3), `docs/QR_FROM_DELIVERY.md`, `docs/M5_DESIGN.md`, the `≥4.3` bar in `docs/context/RUBRIC.md`, and the reference `docs/prototype/v7.2.html`.

**Where QR is today:** correctness, a11y, server-auth money, information design, and the `@mms/ui` primitive library are at or near the bar. Richness is a _deliberately stripped build_ — average ~2.5/5 vs the ≥4.3 target. Zero number-roll, zero celebration moments, no menu item sheet, flat cards with no hover/press, and **dark mode is dead** (the full Night palette exists in `packages/ui/src/tokens.css` but nothing ever sets `.dark` on `<html>`). The Richness track closes that gap without forking QR's tight token base or breaching the mobile GPU budget that already caused a prod iOS crash in delivery.

---

## 1. North star — the richness bar (QR-adapted)

**Every surface layered, every number alive, every interaction responsive — on a restrained editorial palette with maximal-but-tasteful motion, at 60fps, reduced-motion-safe, AA-locked, token-pure, and bilingual.** Concretely for QR: every card carries printed-matter depth (gradient-masked dot/line grids + grain + a registration-tick detail) drawn entirely in CSS, never an image and never a `blur()` on mobile; every money/loyalty number physically rolls (`NumberFlow`) and rolls **only real server-derived values** — never a fabricated ETA, count, or countdown; every interactive element answers the pointer with a spring (tilt/magnetic where appropriate, press-scale + accent-glow everywhere, a tactile ripple on press) and confirms success with exactly **one celebratory thunk** at the moment it's earned (pay-success, tier-up), not a perpetual carnival. Restraint lives in the palette, type, and composition — QR's clay/blue/sage triad cycles on **non-text shapes only**, deep clay (`--ac`/`#9a3412`-class) is the only accent that passes AA for text, stars stay amber. Maximalism lives in motion, texture, and depth. The disqualifier is the default Tailwind/AI-template flat look; the gate is the same one delivery holds — `transform`/`opacity` only, rAF-throttled pointer, offscreen-paused loops (CSS _and_ framer JS), reduced-motion honored in both CSS and JS, decoration `pointer-events-none` + `aria-hidden`, opaque-on-mobile / blur-only-`md:+`, and the contrast-audit test green in both themes.

---

## 2. framer-motion decision — **ADOPT, lazily and scoped**

**Recommendation: add framer-motion as a single root `LazyMotion features={domAnimation} strict` provider, with `domMax` nested only on routes that actually drag or layout-morph.** This is delivery's proven topology and the right call for QR.

**Rationale:**

- **Bundle.** `m` + `LazyMotion(domAnimation)` ≈ 17–18KB gz vs ≈34KB for full `motion`/`domMax`. `strict` forbids the un-treeshakeable `motion.*` and forces `m.*`, so you can't accidentally pull the full bundle. `domMax` (drag, `layout`/`layoutId`, `popLayout`) is the heavy half — load it **only** where used via a nested `DomMaxProvider` (`loadDomMax = () => import("framer-motion").then(m => m.domMax)`), an async chunk that never touches initial JS.
- **What genuinely needs framer (CSS cannot do it):** spring-physics drag (swipe-to-close sheets, drag-to-assign in split-the-bill), `AnimatePresence` real exit animations (the current `Sheet` _fakes_ unmount), shared-element `layoutId` morphs (menu card → item sheet), and gesture-coupled springs (`useTilt`/`useMagnetic`/`useRipple` from delivery's `interactions.ts`, all built on `useSpring`).
- **What stays CSS — do NOT framer-ize:** the `/track` pulse, skeleton shimmer, sheet slide-up, hover scale/glow, entrance fades, press transitions. QR's existing keyframes are correct and cheaper. **~80% of QR richness stays CSS;** framer is a per-interaction dependency, not a blanket one.
- **Fit.** framer-motion 12 supports React 19 + RSC (`"use client"` on any `m.*` consumer). QR is `force-dynamic` everywhere (nonce CSP, see `apps/qr/app/layout.tsx:28`), so no static-prerender hydration concern. `LazyMotion` async-loads features after hydration — never blocks first paint.

**Carry these caveats verbatim (delivery war stories):**

- `strict` + a nested `LazyMotion` breaks framer test mocks. QR's Vitest is node-env/pure-logic today with **no framer mock** — so the first framer PR must also land a shared framer test stub (or keep `m.*` components out of jsdom suites by stubbing them).
- `domMax` only where drag/layout is used; at root it inflates every route's chunk.
- A spread carrying its own `style` (e.g. `useSwipeToClose().motionProps`) **replaces** an earlier `style` prop wholesale — spread hook props FIRST, then explicit `style`.
- framer `repeat: Infinity` loops ignore CSS `.hero-anim-paused` _and_ ignore `prefers-reduced-motion` unless gated — wire every loop through `useAnimationPreference().shouldAnimate && useInView().inView` (the primitives QR already ships in `packages/ui/src/motion.ts`).

---

## 3. The phased slices

Sequenced so foundations (tokens, texture system, dark mode, motion primitives) land before any per-screen signature moment. Each slice = one gated PR; branch `claude/feat/rich-rN-<slug>`. Effort is rough dev-session units (S ≈ ½ session, M ≈ 1, L ≈ 2).

### Dependency order (build top-to-bottom)

```
R1 tokens + texture system  ─┐
R2 dark-mode activation     ─┼─ foundations (R1/R2/R3 parallel-safe except R4 needs R1)
R3 framer adoption + test stub ─┤
R4 interactions.ts → @mms/ui  ─┘  (needs R3 for useSpring)
        │
        ├─ R5 primitive richness (Card/Stepper/AddButton/ModeCard/Sheet)   (needs R1, R4)
        │        │
        │        ├─ R6 menu (search/filters/hero/blur-up/item sheet)        (needs R5)
        │        ├─ R7 checkout + pay-success celebration                   (needs R4, R5)
        │        ├─ R8 /track + rewards signature moments                   (needs R1, NumberFlow)
        │        └─ R9 staff floor + homepage polish                        (needs R5)
```

---

### R1 — Token + texture foundation

**Goal:** add the ~12–14 depth/motion tokens QR is missing, plus the mobile-safe CSS texture utilities, **built onto QR's clean 107-line base — NOT a port of delivery's accreted 34KB `--hero-*` system.**

**Scope (`packages/ui/src/tokens.css` + `apps/qr/app/globals.css`):**

- _Easing/duration:_ `--ease-in-out`, reuse/alias `--spring` for non-sheet transitions, add `--dur-fast` (~120ms, micro-interactions) and `--dur-slow` (~480ms, hero entrance). QR has only `--dur-base`/`--dur-sheet` today.
- _Texture vars:_ `--tex-dot` / `--tex-line` (`color-mix` of `--bd`/`--ac` at low alpha), `--tex-grain-opacity` (single tunable scalar), `--glow-ac` / `--glow-gold` (radial-gradient stop colors — the **mobile-safe glow that replaces `blur()`**).
- _Surface-layer vars:_ `--surface-glass` (`md:`-only frosted fill), `--surface-vellum` (warm translucent), `--surface-elevated` (theme-true white/dark for over-card/over-photo chrome — the delivery `.menu-paper` learning: floating chrome must use a token the card-invert does NOT remap), `--sh-glow` (soft accent-tinted shadow distinct from neutral `--sh*`).
- _CSS utilities in `globals.css` `@layer`:_ `.tex-dotgrid` / `.tex-linegrid` (gradient-masked `background-image`, never uniform full-bleed), `.tex-grain` (inline-SVG `feTurbulence`, zero network cost), `.surface-glass`/`.surface-vellum`/`.surface-paper` (two-tier shadow + inner-highlight, opaque mobile / `backdrop-filter` only `md:+`). Add the `.steam`/`pop`/`fade` keyframes the prototype has and QR lacks.

**Port vs rebuild:** port the _technique_ from delivery (`globals.css` `.hero-dotgrid`/`.hero-linegrid`/`.hero-paper-grain`, the `.hero-surface-*` shadow recipes) but **re-skin to QR tokens and re-author** — do not import delivery CSS.

**Mobile-safety:** all texture layers are gradient-masked `background-image` (GPU-light); glows are `radial-gradient` falloff, never `blur()`; glass surfaces opaque on mobile, `backdrop-filter` gated behind `md:`. Cap concurrent decorative layer count per surface.

**Tokens added:** the ~14 above, each mapped in **both** `:root` and `.dark`.

**Guardrail:** `contrast-audit.test.ts` **parses `tokens.css` at test time** (no hardcoded hex — a token edit is auto-checked); the _semantic combos_ (which text sits on which surface) are the fixtures. So additive non-text tokens (texture/glow) need no change, but a new **text-bearing** surface (e.g. `--surface-elevated`) must get its own `tx-on-surface` combo added in the same PR. Every non-default utility must be a real top-level/`@layer` class (Tailwind v4 has no `@config`) — grep built CSS to confirm it emits.

**Effort: M.**

---

### R2 — Dark-mode activation (explicit, early — the M5 audit found it dead) — ✅ SHIPPED

> **Shipped 2026-06-29.** Nonce blocking inline script + `ThemeSync` (live OS flip); no next-themes. A verified
> per-surface dark audit found only small latent bugs (all fixed): 6× undefined `var(--bg)`→`var(--sf)`, a
> hardcoded shadow→`var(--sh-md)`, `SharePay`→shared `stripeAppearance()`. Stripe theme is mount-time (not
> re-keyed live — a remount would wipe in-progress card entry). Rewards + staff were already dark-clean.

**Goal:** make the existing Night palette reachable. Today nothing sets `.dark`; `stripe-client.ts:13` and `SharePay.tsx:36` _read_ `classList.contains("dark")` but no code ever adds it — dark is unreachable at runtime.

**Recommendation: system-driven `prefers-color-scheme` inline script — NOT next-themes.** QR has no settings UI, the design intent is "light = editorial, dark = Night" as a system response, and next-themes is a provider/dep QR doesn't otherwise need (delivery uses it because it has an in-app `ThemeSelector`; QR doesn't, so the lean path wins).

**Scope (`apps/qr/app/layout.tsx`, a small client component, `proxy.ts`):**

1. Tiny **blocking** inline `<script nonce={nonce}>` first in `<head>` (read the nonce via `headers()` in the `force-dynamic` RSC layout — already available) doing `document.documentElement.classList.toggle("dark", matchMedia("(prefers-color-scheme: dark)").matches)`. Blocking + first = no flash of wrong theme. **Hard constraint:** QR runs nonce CSP with `strict-dynamic` (`proxy.ts` mints a per-request nonce) — the script **must carry the request nonce** or it's blocked.
2. A `matchMedia` change listener (in `AnonAuthGate` or a tiny client component) to toggle the class live when the OS theme flips.
3. Keep the existing `themeColor` export (address bar).
4. **Re-resolve the Stripe Element theme on change** — `stripe-client.ts`/`SharePay.tsx` read `.dark` at mount; re-key the Payment Element on theme flip, or document mount-time resolution as a known limitation.

**Port vs rebuild:** rebuild lean. Do **not** port delivery's `ThemeProvider`/`DynamicThemeProvider`/`ThemeSelector` next-themes stack.

**Mobile-safety:** N/A (no new GPU layers). The risk is contrast, not memory.

**QA surface (where regressions hide — this is the bulk of the slice):** every screen swept in dark **for the first time**. The contrast-audit proves the _token matrix_ in both themes but does NOT prove _component usage_ — sweep for (a) over-card/over-photo chrome using tokens that invert wrong (the `.menu-paper` melding bug — favorite/close/checkmark), (b) bright-yellow `text-secondary` traps (unreadable on light), (c) shadows (Night uses heavier `--sh*` — verify elevation still reads), (d) the Stripe Element swap, (e) `--ac` focus rings on Night surfaces. Add dark checks to the QA-CHECKLIST §A items the work touches.

**Tokens added:** none (palette exists); may tune dark `--color-text-muted` if a swept combo fails AA.

**Effort: M** (script is small; the sweep is the work). Can land first / in parallel with R1.

---

### R3 — framer-motion adoption + test stub — ✅ SHIPPED

> **Shipped 2026-06-29 (with R4).** `framer-motion ^12.26.1` + `MotionProvider` (`LazyMotion domAnimation
strict`) at the root. `domMax`/`DomMaxProvider` deferred to R5 (sheet swipe). Framer Vitest stub deferred:
> QR's vitest is node-env and only matches `*.test.ts` (no jsdom component suite imports framer yet) — the
> first `*.test.tsx` adds the stub.

**Goal:** land the vendor and the topology so R4+ can use springs/drag/presence.

**Scope:**

- Add `framer-motion` dep; root `LazyMotion features={domAnimation} strict` provider (likely wrapping the order/app shell in `apps/qr/app/layout.tsx` or the client gate).
- Port the `DomMaxProvider` pattern verbatim from `/home/user/mandalay-morning-star-delivery-app/src/components/providers/DomMaxProvider.tsx` (6 lines, app-agnostic); mount it **only** on routes with drag/layout (checkout split, sheets).
- **Land the shared framer Vitest stub in the same PR** (QR has none) so existing jsdom-able suites and any future `m.*` consumer don't break.

**Port vs rebuild:** port `DomMaxProvider` verbatim. Provider wiring is QR-specific.

**Mobile-safety:** `LazyMotion` async-loads after hydration; `domMax` stays off initial chunks.

**Tokens added:** none.

**Effort: S** (mechanical, but the test stub is load-bearing — don't skip).

---

### R4 — Port `interactions.ts` → `@mms/ui` — ✅ SHIPPED

> **Shipped 2026-06-29 (with R3).** `useTilt`/`useMagnetic`/`useHeroParallax`/`useRipple` →
> `packages/ui/src/interactions.ts` (re-skinned to QR's `useAnimationPreference`; caveats carried). First
> consumer: `AddButton` press-spring (`m.button whileTap`) + ripple. The broader R5 primitive pass consumes
> the rest (tilt on non-CTA cards, etc.).

**Goal:** land the highest-value reusable richness: pointer-spring micro-interactions, gated and crash-safe.

**Scope:** port `useTilt` / `useMagnetic` / `useHeroParallax` / `useRipple` from `/home/user/mandalay-morning-star-delivery-app/src/components/ui/homepage/Hero/interactions.ts` into `packages/ui/src/motion.ts` (or a sibling). Pure pointer/spring math, no delivery domain coupling, already gated on `useAnimationPreference` + rAF-throttled + IntersectionObserver-detached.

**Port vs rebuild:** **port in full, re-skin none** (math is generic). Carry the caveats: tilt OFF on any card whose body holds the primary CTA (square-shadow artifact + CTA slides out from cursor) and on keyboard focus; **no scroll-coupled background parallax** (motion sickness — pointer/gyro only).

**Mobile-safety:** transform-only, rAF-throttled, offscreen-paused (already in the source). Mobile gets tap + gyro, no hover.

**Tokens added:** none. **Depends on R3** (`useSpring`).

**Effort: S.**

---

### R5 — Primitive richness pass (`@mms/ui` + shared components)

> **R5a ✅ shipped 2026-06-29** — `Card` opt-in `textured`/`interactive` props (CSS-only) + `.card-textured`
> on menu rows; `Stepper` count-bounce (a11y-safe) + button press; `ModeCard` gradient tile + stagger.
> **R5b ✅ shipped 2026-06-29** — `Sheet` swipe-to-close (first `domMax` consumer): `DomMaxProvider`
> (`packages/ui`) + handle-initiated `useDragControls` drag (`dragListener=false` → body scroll untouched).
> **R5c ✅ shipped 2026-06-29 (R5 complete)** — menu `AddButton` morphs into an inline accent quantity
> stepper (`.mms-qty-stepper`) once the viewer has the item in their OWN cart line, **in every mode incl.
> dine-in groups**: `+` reuses the server-authoritative `add`, `−` calls the new
> `TableCartProvider.setItemQty` (`qty<=0` removes → morphs back to Add).
> **Group-cart model → per-seat lines:** `insertOrIncLine` now scopes its merge by `by_seat`, so two diners
> ordering the same item get SEPARATE lines (each owns + manages their own qty) instead of folding into one
> shared first-adder line. That makes the morph unambiguous for everyone (your stepper targets your own line,
> `canMutateLine` own-draft always passes) and pre-attributes the by-person split. App-level only — no schema
> change (no unique constraint existed); solo carts unchanged; staff `by_seat=null` lines stay separate +
> assignable; totals/tax aggregate-identical; cart/KDS/split show one row per contributor. The `AddButton`
> lookup mirrors `insertOrIncLine`'s exact per-seat keys (item + no-mods + default fulfillment + draft + own
> `by_seat`, not comped); the in-cart `+` gates on live `line.soldOut`; menu controls gate on the new
> `settling` freeze. Focus moves to the Add pill on remove (focusable via `aria-disabled` when sold-out; waits
> for `busy` to clear). **CSS morph (no `layoutId`)** — root is `domAnimation`; the prototype's `.add → .stp`
> is a conditional render + `.mms-pop`. (Codex P1+P2s addressed: live-sold-out, fulfillment match,
> focusable/timed refocus, settlement freeze; cross-seat-merge resolved by the per-seat model.)

**Goal:** make the shared primitives feel alive so every screen inherits it — the cheapest broad win.

**Scope:**

- `packages/ui/src/card.tsx`: optional `textured`/`accent` prop dropping a `HeroCardLayers`-style 4-layer backdrop (dot-grid + grain + triad edge-glow + corner ticks, all `aria-hidden pointer-events-none`, clipped to radius), built on R1 utilities. Add `:active` press-scale + hover shadow-lift (transform/box-shadow only). Rebuild the layer component to QR's `Card` — do **not** import delivery's `HeroCardLayers.tsx`.
- `packages/ui/src/stepper.tsx`: press-scale(.9) + qty count-bounce (`pop`) on change; keep 44px targets.
- `apps/qr/components/AddButton.tsx`: `+` morphs into the inline `Stepper` with a `pop` bounce (the prototype's `.add → .stp` morph) instead of routing through the provider with no feedback. (`layoutId` morph if `domMax` present, else CSS.)
- `apps/qr/components/ModeCard.tsx`: press-scale(.98), gradient emoji tile (`--grad`), accent chevron; stagger-in on load (RM-gated).
- `Sheet` (`packages/ui/src/sheet.tsx`): add swipe-to-close (`useSwipeToClose` needs framer `domMax` — gate behind R3/R4). Keep the dvh `--sheet-max-h` sizing and 44px close — **do not redo** those (already correct).

**Port vs rebuild:** rebuild the textured-card layer to QR primitives; port the swipe-to-close gesture pattern.

**Mobile-safety:** all transform/opacity; texture is gradient-masked; spread `useSwipeToClose().motionProps` FIRST then explicit `style` (the safe-area-inset replace bug).

**Tokens added:** consumes R1.

**Effort: M.**

---

### R6 — Menu: search · filters · hero · blur-up · item sheet (the single biggest gap)

> **Split into two gated PRs (owner-confirmed 2026-06-30; build plan: `docs/R6_PLAN.md`).**
> **R6a ✅ shipped 2026-06-30** — browse layer: RSC fetches the catalog (+`description_en`/`tags`/`allergens`)
> → client `MenuBrowser` (search · scroll-spy category **jump-nav** (`<nav>`+`aria-current`, NOT tablist) ·
> fail-safe dietary filters in `lib/menu/dietary.ts` · `BlurUpImage` · real-tag `Badge`s · empty state). No
> menu-top hero band (decision: lean top; the photo-hero lives in the R6b sheet). **R6b next** = the item
> detail sheet (modifiers from `min_select` · client-preview/server-final live price · hardcoded "goes well
> with" upsell). Decisions recap: split · item-sheet-hero-only · hardcoded upsell · client-preview pricing.

**Goal:** lift the menu from ~2.2/5 to the bar. Today it's a flat RSC list (`apps/qr/app/(order)/menu/page.tsx`).

**Scope:**

- Sticky **search** field in header (`--sf`/`--bd`), live client filtering.
- Sticky **category jump-nav** chip rail (`role="tablist"`), scroll-spy, active lit / inactive ghost, smooth-scroll to section, large-title collapse on scroll (`--lt` 34→20px).
- **Dietary filter** chip row with the fail-safe disclaimer pattern (an item with no declared allergens is _unknown_ → excluded unless `allergen-reviewed`; show "based on declared ingredients — confirm with us" when a free-from chip is active).
- Editorial **hero band** (~158px) with `prefers-reduced-motion`-gated `.steam` wisps (transform/opacity).
- **Blur-up** images: `next/image` `onLoad` `filter:blur(8px) scale(1.05) → blur(0)`, gradient+emoji placeholder (no broken-image flash). Per-thumbnail 88px blur is GPU-safe.
- **Item detail sheet** (`openItem()` → `@mms/ui Sheet`): big photo, required-radio + optional add-on modifiers, **live price recalc** (server-derived shape — client sends ids, never a price), "Goes well with" upsell. This is the core browse→customize loop (RUBRIC #6 "item = sheet not page") and is entirely unbuilt today.
- `Badge` primitive for diet tags + `Signature`/`Most loved`/`Sold out` (sold-out stays a _disabled_ control, not removed).

**Port vs rebuild:** rebuild against the v7.2 prototype + QR primitives. Do not port delivery's menu components (different domain/design).

**Mobile-safety:** hero glow is `radial-gradient`, not `blur()`; steam is RM-gated transform; the menu top is **in view on load** — budget the initial composite (this is where OOM hits). Inputs ≥16px (iOS focus-zoom). Sheet sizes with `--sheet-max-h`.

**Tokens added:** consumes R1 (`--sf` may need adding if absent).

**Effort: L** (largest slice; consider splitting search+filters from the item sheet into two PRs).

---

### R7 — Checkout + the pay-success celebration (highest-impact single moment)

**Goal:** add the "one celebratory thunk" and roll the money. Checkout (`apps/qr/components/Checkout.tsx`) is functionally rich but visually flat.

**Scope:**

- **Number-roll** (`NumberFlow` — already exported from `@mms/ui`, cleaner than delivery's bespoke reels) on the `Total`/`Estimated total` row and `CartBar` subtotal. Carry only the _baseline-anchor + `sr-only` real value_ learning so the CTA accessible name keeps the amount.
- **Pay-success celebration** (the #1 missing moment): on `PaymentSection.confirmPayment` success before the `/track` redirect — success pop scale(0→1.12→1) ✅, confetti **≤90 particles** (canvas/transform, not blur — the prototype proves the budget), "+N Stars earned" pill, haptic. Gate on `useDeviceTier() !== "low"` + `shouldAnimate`.
- Tip chips: press-scale + existing `--ac` tint + soft fade on the `<small>` preview.
- Buttons: press-scale(.97) + accent glow (`--sh-glow`) — currently flat.
- Step transition (review↔pay): spring slide (focus management already moves correctly — just add motion).

**Port vs rebuild:** rebuild the celebration to QR (confetti as capped transform/opacity spans or a `HeroBurst`-style hook re-skinned). Use `NumberFlow`, do **not** port `RollingDigits`.

**Mobile-safety:** confetti is transform/opacity + count-capped + tier-gated; no blur. **Never change the tip/tax/discount/total math while reskinning** — totals stay presentation-only and server-authoritative.

**Tokens added:** consumes `--sh-glow`/`--glow-ac` from R1.

**Effort: M.**

---

### R8 — /track + rewards signature moments ✅ shipped 2026-06-30

> Shipped: **real Stars** on /track (retired R7a's `gems=round(total)` for `mms_rewards_summary`; "+N Star
> earned" pill gated on real `earned_by` attribution so split-tender non-host payers don't see a false
> claim) + the **Full** RewardsHub (SVG Stars ring · `NumberFlow` stars/spend · localStorage-deduped tier-up
> · honest "How it works" — the prototype's milk-tea/snacks/birthday perks are demo fiction and `isEarlyAccess`
> has no consumers, so they're NOT shipped). Deferred (→ R9 if wanted): the /track connector shimmer + a
> receipt-total `NumberFlow` (a final receipt shouldn't imply a changing total). See `docs/R8_PLAN.md`.

**Goal:** add the alive numbers + signature flourishes to the two surfaces that are honest-but-plain.

**Scope:**

- **/track** (`apps/qr/components/OrderTracker.tsx`, the best-realized port already): connector shimmer down the completed rail segment (transform/opacity, RM-gated); a **one-shot** celebratory pulse when `ready` first becomes true (the "your food's up" moment — not a loop); `NumberFlow` on the receipt total. The pulse is already correctly `useInView`-gated — keep that.
- **Rewards** (`apps/qr/components/RewardsHub.tsx`, ~2.4/5, plainest transactional surface): the **big SVG progress ring** (148px conic, `--ac` stroke-dashoffset, `✦{stars}` centered) as the rewards hero — replaces the flat bar; `NumberFlow` on stars + balance; press/hover on ladder rungs; a **tier-up celebration** when a tier is crossed (none exists). All numbers stay truthful (derived from paid orders — milestone rewards issue server-side; the card shows _progress_ only; `ordersToNextMilestone` is never ≤0).

**Port vs rebuild:** rebuild the ring + tier-up to QR. The delivery `HeroRewards` rail is delivery's homepage narrative — reference, don't port.

**Mobile-safety:** ring is SVG (cheap); pulses are one-shot transform/opacity; no blur. Honesty: animate REAL values only.

**Tokens added:** consumes R1.

**Effort: M.**

---

### R9 — Staff floor + homepage polish (restrained — ops surfaces)

**Goal:** add _state-change feedback_ (what matters on a live board) without making ops surfaces maximalist.

**Scope:**

- **Staff floor** (`apps/qr/components/staff/{FloorBoard,FloorDetailLive,TableCard}.tsx`): subtle card-enter when a new table scans in; a value-change flash / `NumberFlow` on `runningSubtotalCents` so a server _notices_ the room change without staring; hover-lift + `:active` press on `TableCard` (transform-only); a one-shot pulse on a freshly-changed table. Maximalism is **wrong** here — keep it subtle.
- **Homepage** (`apps/qr/app/page.tsx`): gradient-masked dot texture backdrop (NOT full-bleed), gentle stagger-in of cards on load (RM-gated). ModeCard richness already lands in R5.

**Port vs rebuild:** rebuild; reuse R5 primitives.

**Mobile-safety:** any future loop on a long board must `useInView`-gate (offscreen-pause). Texture gradient-masked, no blur.

**Tokens added:** consumes R1.

**Effort: S–M.**

---

## 4. Per-surface signature moments (the one premium moment each)

| Surface         | Signature moment                                                                                                                                                                 |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Menu**        | The **item sheet**: tap a row → card morphs (`layoutId`) into a bottom sheet with the big photo, modifiers, and a **live-recalculating price** that rolls as you toggle add-ons. |
| **Checkout**    | The **pay-success thunk**: success pop + ≤90-particle confetti + "+N Stars earned" pill + haptic, fired once on payment success before the `/track` redirect.                    |
| **/track**      | The **"your food's up" pulse**: a single celebratory pulse + connector shimmer the instant `ready` first becomes true.                                                           |
| **Rewards**     | The **conic progress ring**: a 148px SVG ring with stars rolling in the center, and a **tier-up celebration** when a tier is crossed.                                            |
| **Staff floor** | The **live-notice**: a value-change flash + rolling subtotal so a busy server registers a room change peripherally, without staring at the board.                                |
| **Sheets**      | **Swipe-to-close**: spring drag-down dismiss (the iOS-native expectation), symmetric with tap-scrim/Esc.                                                                         |

---

## 5. Guardrails (non-negotiable in every slice)

- **Perf budget (iOS OOM is the crash class):** NO stacked `backdrop-filter` + NO large/full-screen `blur()` on mobile. Glows = `radial-gradient` falloff. Glass surfaces opaque on mobile, `backdrop-filter` only `md:+`, never two stacked. Texture = gradient-masked `background-image`, count-capped. The first screen is **in view on load** — budget the _initial composite_, not just the offscreen-paused steady state.
- **60fps:** animate `transform`/`opacity` only (never layout/width/top). rAF-throttle all pointer handlers.
- **Reduced-motion:** every new animation needs a CSS `@media (prefers-reduced-motion)` / `motion-safe:` off-switch **and** a JS `shouldAnimate` gate. framer `repeat: Infinity` loops must use `const loop = shouldAnimate && inView` — they ignore CSS pause and RM otherwise.
- **AA contrast:** `contrast-audit.test.ts` parses `tokens.css` at test time (no hex fixtures — token edits auto-checked); add a `tx-on-surface` combo for any new **text-bearing** surface token, in the same PR. Sweep both themes (the test proves the token matrix, not component usage).
- **No fabricated data:** roll/animate REAL server-derived values only — no fake ETAs, counts, or countdowns. Money stays server-authoritative; reskins are presentation-only and never touch tip/tax/discount/total math.
- **Built-CSS reality:** Tailwind v4 has no `@config` here — any non-default utility must be a real `@layer`/`@theme` entry; grep the built CSS to confirm it emits (a green build does not prove the class exists).
- **a11y:** decoration `pointer-events-none` + `aria-hidden`; rolling digits `aria-hidden` with an `sr-only` real value; ≥44px targets; one live region per view; focus moved on remove/route/step; inputs ≥16px on mobile (iOS focus-zoom).
- **Adversarial-review discipline:** run the Pre-PR self-review sweep ending with a fresh-context adversarial subagent across a11y · perf · security/privacy · product-UX; fix findings before opening _and_ before merging; post the verdict as a PR comment. CI's `review`/`security`/`adversarial` are zero-token green stubs — this in-session pass is the only real gate.

---

## 6. Out of scope / explicitly NOT porting

**Delivery-only surfaces (different repo, different domain — never port):**

- Driver routing / maps / live WebGL Google map, offline at-least-once queue, COD `pending_approval` flow, multi-day delivery scheduling/cutoffs, distance-tiered fees, crons, sunlight mode.
- The whole delivery `Hero/` component tree (`HeroOrbitCluster`, `HeroSunburst` as-shipped, `HeroStatBand`, `DeliveryMapCard`, `HeroRewards`, `HeroCountdown`) — delivery's homepage narrative. Rebuild QR's richness from the _ported primitives_, not these.
- `ThemeProvider`/`DynamicThemeProvider`/`ThemeSelector` (next-themes — QR uses the lean inline-script).
- Delivery's `animations.css` (362 lines) and `--hero-*` token layer — port specific keyframes/techniques on demand, re-skinned; never bulk-import.
- Delivery's bespoke `RollingDigits` reels — QR uses `NumberFlow` (already exported from `@mms/ui`).

**Anti-patterns to avoid (delivery learnings, hard-won):**

- **No tilt on a card whose body holds the primary CTA** — under `preserve-3d` it renders a hard square color-shadow artifact and slides the Add/CTA button out from under the cursor. Use clean scale-up + clay-glow instead. Also disable tilt on keyboard focus.
- **No scroll-coupled background parallax** — motion sickness. Pointer + gyro only.
- **No stacked `backdrop-filter` / large `blur()` on mobile** — the documented prod iOS WebKit OOM crash ("Can't open page" / endless reload, no Sentry since the tab dies pre-report).
- **No live WebGL / heavy canvas on mobile** — `useDeviceTier() === "desktop"` only (a high-core iPhone reports `"high"` but core count does NOT lift WebKit's per-tab memory ceiling). Mostly moot for QR (no maps), but the rule governs any future heavy-canvas FX.
- **No `vh` on bottom sheets** — use `--sheet-max-h` (dvh + safe-area); iOS `vh` uses the large viewport and clips the top.
- **No measured-indicator pattern for active-tab contrast** — put the background + text on one element (a measurement race leaves dark label on bare rail, invisible on the dark rail).
- **No perpetual celebration** — one thunk at the earned moment, not a loop.
