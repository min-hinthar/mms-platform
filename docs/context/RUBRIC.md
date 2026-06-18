# World-class rubric — the quality bar

The scorecard that makes "world-class" objective. **Grade against it after each iteration; target ≥ 4.3 / 5 overall before shipping a surface.** Benchmarked on Sunday, Square, Toast, Uber Eats, Apple HIG, Linear, and craft writing (Rauno Freiberg, Emil Kowalski). The v7.2 prototype reference sits at ≈ 4.3.

| # | Dimension | Good | World-class (the target) |
|---|---|---|---|
| 1 | Perceived performance | Spinner while loading | Skeletons matching component geometry; **optimistic UI** (write locally first); no layout shift |
| 2 | Motion & animation | Fades; decorative | Every motion = spatial/state purpose; **spring physics** (~170/15), ≤ 300 ms; reduced-motion honored |
| 3 | Typographic craft | Readable hierarchy | Defined scale + ratio; per-role line-height; optical sizing; no widows; display character |
| 4 | Spacing & hierarchy | Roughly consistent | Strict 4/8/16/24/32 grid; optical icon↔label alignment; space (not rules) for section breaks |
| 5 | Micro-interactions | Press registers | Add→stepper morph; **number-roll** total; haptic weight hierarchy; one celebratory "thunk" |
| 6 | IA / flow efficiency | Reachable | Sticky jump-nav; persistent cart in one tap; item = sheet not page; checkout ≤ 3 steps |
| 7 | Content & voice | Clear; matches menu | Sensory descriptions; **action** modifiers ("Add chili oil +$0.50"); errors say what to do |
| 8 | Accessibility | AA contrast, ≥ 24px targets | WCAG 2.2 AA + 44px; aria-live on cart/status; visible focus ring; offline announced |
| 9 | Edge / empty / error | Generic "error" exists | Every state designed: empty CTA, out-of-stock pre-disabled, inline validation, specific retry |
| 10 | Design system | Looks similar | Single token source; no magic numbers; every component has all states; dark-mode clean swap |

## How to use it
- Score each dimension 1–5, weight none, average. **< 4.3 ⇒ not shippable** — name the dimensions dragging it and fix those, don't average your way past a 2.5.
- The two perennial laggards across every iteration were **#9 edge/empty/error** and **#1 perceived performance** — design those *first*, not last.
- The real Next.js stack buys several dimensions almost for free vs. the prototype: `next/image` + RSC streaming (#1), React keyed state (#5 INP), the token package `@mms/ui` (#10). Don't regress them by hand-rolling.
- This is the bar the prototype was graded on; the real app inherits the same bar. The PR review weights a11y (#8) and the adversarial pass weights edge cases (#9).

> Design language north star (chosen): **editorial-forward light + v4 Night dark** — type-led, warm, unhurried, with real Burmese character on functional surfaces. Not a sports-bar POS. See [`RESEARCH-DIGEST.md`](RESEARCH-DIGEST.md) §3.
