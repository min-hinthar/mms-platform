# World-class rubric — the quality bar

The scorecard that makes "world-class" objective. **Grade against it after each iteration; target ≥ 4.3 / 5 overall before shipping a surface.** Benchmarked on Sunday, Square, Toast, Uber Eats, Apple HIG, Linear, and craft writing (Rauno Freiberg, Emil Kowalski). The v7.2 prototype reference sits at ≈ 4.3.

| #   | Dimension             | Good                        | World-class (the target)                                                                             |
| --- | --------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1   | Perceived performance | Spinner while loading       | Skeletons matching component geometry; **optimistic UI** (write locally first); no layout shift      |
| 2   | Motion & animation    | Fades; decorative           | Every motion = spatial/state purpose; **spring physics** (~170/15), ≤ 300 ms; reduced-motion honored |
| 3   | Typographic craft     | Readable hierarchy          | Defined scale + ratio; per-role line-height; optical sizing; no widows; display character            |
| 4   | Spacing & hierarchy   | Roughly consistent          | Strict 4/8/16/24/32 grid; optical icon↔label alignment; space (not rules) for section breaks         |
| 5   | Micro-interactions    | Press registers             | Add→stepper morph; **number-roll** total; haptic weight hierarchy; one celebratory "thunk"           |
| 6   | IA / flow efficiency  | Reachable                   | Sticky jump-nav; persistent cart in one tap; item = sheet not page; checkout ≤ 3 steps               |
| 7   | Content & voice       | Clear; matches menu         | Sensory descriptions; **action** modifiers ("Add chili oil +$0.50"); errors say what to do           |
| 8   | Accessibility         | AA contrast, ≥ 24px targets | WCAG 2.2 AA + 44px; aria-live on cart/status; visible focus ring; offline announced                  |
| 9   | Edge / empty / error  | Generic "error" exists      | Every state designed: empty CTA, out-of-stock pre-disabled, inline validation, specific retry        |
| 10  | Design system         | Looks similar               | Single token source; no magic numbers; every component has all states; dark-mode clean swap          |

## How to use it

- Score each dimension 1–5, weight none, average. **< 4.3 ⇒ not shippable** — name the dimensions dragging it and fix those, don't average your way past a 2.5.
- The two perennial laggards across every iteration were **#9 edge/empty/error** and **#1 perceived performance** — design those _first_, not last.
- The real Next.js stack buys several dimensions almost for free vs. the prototype: `next/image` + RSC streaming (#1), React keyed state (#5 INP), the token package `@mms/ui` (#10). Don't regress them by hand-rolling.
- This is the bar the prototype was graded on; the real app inherits the same bar. The PR review weights a11y (#8) and the adversarial pass weights edge cases (#9).

> Design language north star (chosen): **editorial-forward light + v4 Night dark** — type-led, warm, unhurried, with real Burmese character on functional surfaces. Not a sports-bar POS. See [`RESEARCH-DIGEST.md`](RESEARCH-DIGEST.md) §3.

## Journey axes — score the PATH, not the screen (J0)

The ten dimensions above grade a *surface*; three initiatives proved you can max them and still ship an
app that feels assembled. These seven grade a *path* — one score per axis per mode's end-to-end journey
(scan→paid), same 1–5 scale, same **≥ 4.3 shippable** bar. Every J-phase PR reports before/after. Full
rationale: [`../JOURNEY_PLAN.md`](../JOURNEY_PLAN.md).

| #   | Axis             | Good                                | World-class (the target)                                                                    |
| --- | ---------------- | ----------------------------------- | ------------------------------------------------------------------------------------------- |
| J-A | Continuity       | Screens share tokens/type           | Route changes are choreographed: shared elements persist/move, direction has grammar, chrome never re-animates — one camera move, not cuts |
| J-B | Progress clarity | Each screen is self-explanatory     | At every step the diner knows where they are, what just happened, and what happens next — without reading |
| J-C | Effort           | Everything is reachable             | Taps/decisions per step at the theoretical floor; the next likely action is always the nearest one |
| J-D | Emotional arc    | Pleasant throughout                 | Designed peak-*start* (arrival) and peak-*end* (goodbye) per the peak-end rule; the middle breathes |
| J-E | Dead-time        | Waiting shows a status              | Waiting is *designed*: real-data narration, anticipation, a right-moment next action — never a spinner-shaped void |
| J-F | Recognition      | Returning users aren't broken       | Visit N ≠ visit 1: welcomed back, remembered, one tap to the usual                           |
| J-G | Recovery         | Errors have retry                   | No dead ends anywhere on the path; every failure names its way out (extends QA §D to the journey) |

**Baseline (2026-07-11, scored against shipped code — the J0 "before"):**

| Path | J-A | J-B | J-C | J-D | J-E | J-F | J-G | Avg |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Dine-in (scan→send→pay→track) | 2 | 3.5 | 4 | 2.5 | 1.5 | 1 | 4.5 | **2.7** |
| Pickup (scan→slot→pay→track) | 2 | 3.5 | 4 | 2.5 | 2 | 1 | 4.5 | **2.9** |
| Grocery (scan→basket→pay) | 2.5 | 4 | 4 | 2 | 4.5¹ | 1 | 4 | **3.1** |

¹ Grocery's dead-time score is high *by design absence* — the mode's job is to have no wait; J6 protects that.

The spread tells the story: **J-G (recovery) is already world-class** (the hardening sessions worked) and
**J-C (effort) is close** — while **J-A/J-D/J-E/J-F are the gap** — exactly the four the Journey track
phases J1–J5 attack. Funnel evidence lives in PostHog (`J0 ·` insights): client journey funnel
(menu view → first add, median time-to-first-add) + server commitment funnel (add → send/slot → paid,
joined on uid). Known split: client events carry a cookieless anon id, server events the Supabase uid —
they can't join in one funnel; bridging via `posthog.identify(uid)` is a **consent-posture decision
deferred to J5**, not an analytics default.
