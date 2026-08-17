# Motion & mobile-perf budget — QR

**The guardrail for adding motion/FX to QR (M5·P5.3).** Read before adding any animation, decorative
layer, or capability-gated effect. Ported from the delivery app's hard-won rules (its hero design
language §7) — the point is that QR adopts the discipline **before** it adds richer motion (P5.4
primitives and beyond), so it never reintroduces the prod **iOS WebKit OOM crash** delivery hit.

> **QR today (2026-08-17):** motion is no longer CSS-only. framer-motion ships behind the root
> `MotionProvider` (`LazyMotion` + an async `domAnimation` loader, `strict` so only `m.*` compiles,
> `MotionConfig reducedMotion="user"`), with `DomMaxProvider` nested where drag/layout is needed;
> money rolls on `@number-flow/react` (re-exported from `@mms/ui`); and
> `packages/ui/src/interactions.ts` (`useTilt`/`useMagnetic`/`useHeroParallax`/`useRipple`) landed
> with Richness R4. `globals.css` now holds **eight CSS `infinite` loops** (pulse · shimmer · steam ·
> merge star · header dot · timeline · KDS red · kiosk drift) plus **one rAF loop** — the W22a
> `MarqueeRail` drift (§9). The `/track` pulse stays the **canonical example** of §1 + §3
> (reduced-motion + `useInView` offscreen-pause on a stable `<ul>`). Heavy FX (WebGL/particles) still
> do not exist — when they land they go through `useDeviceTier` per §5.

## Foundation primitives (`@mms/ui`)

Import from the package root: `import { useAnimationPreference, useInView, useDeviceTier } from "@mms/ui"`.
They are intentionally lean (no in-app motion-settings store yet — add one when QR has that UI).

| Primitive                  | Returns                                   | Use for                                                                                                                     |
| -------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `useAnimationPreference()` | `{ shouldAnimate, prefersReducedMotion }` | The JS off-switch for **JS-driven** motion (CSS motion uses the `@media` query instead). SSR-safe + reactive to OS changes. |
| `useInView(opts?)`         | `{ ref, inView }`                         | **Offscreen-pause.** Put `ref` on a STABLE wrapper; gate the loop with `shouldAnimate && inView`.                           |
| `useDeviceTier()`          | `"low" \| "mid" \| "high" \| "desktop"`   | Capability gate for **expensive** FX. SSR-safe (`"low"` first paint).                                                       |

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
9. **Auto-motion needs a real stop control — and must never own the scroller (W22a).** Content that
   moves without the diner asking (the `MarqueeRail` drift on the Start-here rows) ships a VISIBLE
   pause/play control — WCAG 2.2.2; hover luck is not a stop mechanism — placed BESIDE the heading,
   never inside it (a button inside an `<h2>` joins its accessible name and the rails'
   `aria-labelledby`). Build the drift ON the native scroller (write `scrollLeft`, never a transform
   track) so swipe, chevron nudges, keyboard tabbing and scroll-into-view all survive. Keep the
   position in a **float accumulator**: browsers quantize `scrollLeft`, so re-deriving from the
   read-back rounds a 0.18–0.5px/frame delta to zero and the row sits frozen on DPR-1 desktops and
   120Hz phones — read `scrollLeft` only to detect someone else steering, then ADOPT their position.
   Pause on hover (fine pointers only), press, focus-within, offscreen, hidden tab, and for 2.2s
   after any scroll the loop did not write; and **stop the rAF loop while blocked** rather than
   ticking a no-op at refresh rate. Listen for the pointer RELEASE on `window` — a mouse press that
   starts on the rail and releases outside it never delivers `pointerup` to the rail, which latches
   the pause forever. Reduced motion gets the exact static rail with the **duplicate DOM excluded**
   (`MarqueeRail` appends the loop copies only when motion is on, so there is no loop set at all),
   and the cleanup folds the offset back into the real set so a mid-visit RM flip does not jump. An on-screen loop duplicate stays `aria-hidden` + `tabIndex={-1}` but **clickable** —
   `inert` makes visible cards tap-dead — and a dupe activation moves focus to its real twin first,
   so no sheet ever restores focus onto an `aria-hidden` node.
10. **A `both`-filled reveal keeps its end state forever — size it outside the shadow spread
    (W22a·depth).** The thermal-print receipt animates `clip-path` with `animation-fill-mode: both`,
    so the final `inset()` is what the slip wears for the rest of the visit: it must clear the
    `--sh-paper` spread (the wide layer reaches ~10px sideways, ~24px below) or the freshly-printed
    slip carries a shaved shadow versus its revisit / reduced-motion twin. A moving light that tracks
    a clip frontier must be a **SIBLING** of the clipped element — a child gets clipped — on the
    identical duration and easing. Reduced motion renders the finished artifact at rest and
    `display:none`s the light: a static lingering glyph is noise, not a fallback. And omit `both` on
    a settle whose end state would outrank a consumer's inline style (`.mms-settle` has no fill mode
    for exactly that reason), while starting its fade from 0.4, not 0 — focus lands the same frame
    and a from-zero fade hides the focus ring (WCAG 2.4.7).

## Interaction hooks — shipped (Richness R4)

`useTilt` / `useMagnetic` / `useHeroParallax` / `useRipple` live in `packages/ui/src/interactions.ts` and
export from the package root — ported from the delivery repo's `Hero/interactions.ts` /
`useTiltEffect.ts`, re-skinned to `useAnimationPreference` (each hook no-ops under reduced motion,
rAF-throttles its window listeners, and detaches offscreen). They need framer-motion's `useSpring`, so a
consumer must be `"use client"` and sit under `MotionProvider`. **The caveats are carried verbatim in the
module header and still bind:** no 3D tilt on a card whose body holds the primary CTA (the swing moves
the CTA out from under the cursor + a hard square shadow artifact under `preserve-3d`), disable tilt on
keyboard focus (tilt is a pointer affordance), and `useHeroParallax` exposes a scroll value but must
never drive the page backdrop (§7).
