# Motion & mobile-perf budget — QR

**The guardrail for adding motion/FX to QR (M5·P5.3).** Read before adding any animation, decorative
layer, or capability-gated effect. Ported from the delivery app's hard-won rules (its hero design
language §7) — the point is that QR adopts the discipline **before** it adds richer motion (P5.4
primitives and beyond), so it never reintroduces the prod **iOS WebKit OOM crash** delivery hit.

> **QR today:** motion is CSS-only (`fade`/`up` on the Sheet, `mmsPulse` on the `/track` active step) —
> all already reduced-motion-gated in `globals.css`. There is no framer-motion. The `/track` pulse is
> the one infinite loop, and it is now the **canonical example** of the rules below (reduced-motion +
> offscreen-pause via the primitives). Heavy FX (WebGL/particles/parallax) do not exist yet — when they
> land, they go through `useDeviceTier` per §4.

## Foundation primitives (`@mms/ui`)

Import from the package root: `import { useAnimationPreference, useInView, useDeviceTier } from "@mms/ui"`.
They are intentionally lean (no in-app motion-settings store yet — add one when QR has that UI).

| Primitive | Returns | Use for |
|---|---|---|
| `useAnimationPreference()` | `{ shouldAnimate, prefersReducedMotion }` | The JS off-switch for **JS-driven** motion (CSS motion uses the `@media` query instead). SSR-safe + reactive to OS changes. |
| `useInView(opts?)` | `{ ref, inView }` | **Offscreen-pause.** Put `ref` on a STABLE wrapper; gate the loop with `shouldAnimate && inView`. |
| `useDeviceTier()` | `"low" \| "mid" \| "high" \| "desktop"` | Capability gate for **expensive** FX. SSR-safe (`"low"` first paint). |

## The rules

1. **Reduced motion is non-negotiable.** Every animation needs an off-switch. CSS animations → wrap the
   keyframe use in `@media (prefers-reduced-motion: reduce) { … animation: none }` (see `globals.css`).
   JS animations (framer loops, rAF, libs that don't self-gate) → gate on
   `useAnimationPreference().shouldAnimate`, so JS matches what the CSS already does.
2. **60fps or don't ship it.** Animate **`transform` / `opacity` only** — never `width`/`height`/`top`/
   layout-affecting props (they trigger layout/paint). rAF-throttle any pointer-driven handler.
   _Bounded exception:_ the `/track` `mms-track-now` halo animates `box-shadow` — paint-only on a single
   tiny static-position dot (no layout), and it's gated + offscreen-paused, so it stays cheap. Don't
   generalize box-shadow loops to large or many elements.
3. **Pause every loop offscreen.** A CSS `infinite` animation or a framer `repeat: Infinity` keeps
   ticking when scrolled out of view (battery + jank). Gate it with `useInView`:
   `const loop = shouldAnimate && inView`, then apply the animating class / run the loop only when `loop`.
   The ref must sit on a **stable** element — a ref on a conditionally-rendered or moving target breaks
   the observer (LEARNINGS). _(The `/track` pulse does exactly this — ref on the `<ul>`, not the dot.)_
4. **Mobile GPU / memory budget — HARD limit (caused a prod iOS crash on the sibling app).** Stacked
   `backdrop-filter` + large/full-screen `blur()` layers allocate huge GPU buffers and **OOM-crash the
   iOS WebKit tab** ("Can't open page" / endless reload, no error report — the tab dies first). On mobile:
   - **No `backdrop-filter`** (opaque surfaces; `backdrop-blur` only `md:`+ via `hidden md:block` /
     `md:` variants).
   - **No large/full-screen `blur()`** — use a `radial-gradient` transparent falloff for glows instead.
   - Gate heavy decorative layers behind `md:`; cap floating-element/filter counts.
   - The first screen is **in view on load**, so offscreen-pause (§3) does NOT cut peak load — budget the
     **initial composite**.
5. **Gate the heaviest GPU on `desktop` ONLY.** WebGL, particle systems, live maps, full-screen blur →
   render only when `useDeviceTier() === "desktop"`. **`high`/`mid`/`low` are all mobile**; a high-core
   iPhone reports `"high"` but a high core count does **not** lift WebKit's per-tab memory ceiling, so
   `>= "high"` is the wrong gate. Put the heavy loader inside a conditionally-**rendered** child so its
   SDK never loads on mobile (a parent that always mounts loads it regardless).
6. **Mind the animation COUNT.** Dedupe competing layers; more concurrent animations = overload + battery
   drain. Decorative layers are `pointer-events-none` + `aria-hidden`.
7. **No scroll-coupled background parallax** (motion sickness) — pointer/gyro only, if at all.
8. **Confirm CSS utilities actually emit.** Tailwind v4 silently no-ops unknown utility classes (it does
   not load `tailwind.config.ts`). After adding a non-default utility, grep the built CSS
   (`.next/static/chunks/*.css`) — "build green" ≠ "the class exists".

## Deferred to P5.4

`useRipple()` / `useTilt()` interaction hooks are **not** in P5.3 — they're meaningless without component
consumers (a ref + pointer wiring on a real element), so they land in **P5.4** alongside the primitive
component library that uses them. Port from the delivery repo's `Hero/interactions.ts` /
`useTiltEffect.ts`, re-skinned to QR tokens. **Carry the caveats verbatim:** no 3D tilt on a card whose
body holds the primary CTA (the swing moves the CTA out from under the cursor + a square shadow
artifact), and disable tilt on keyboard focus.
