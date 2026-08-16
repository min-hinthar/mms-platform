# W22 proposal — the next level (world-class creativity · polish · iOS + Anthropic-grade UI/UX)

The owner's ask (2026-08-16): _"propose next level improvements to maximize worldclass creativity
polishness iOS Anthropic UI/UX designs."_ Grounded in what M1→W21 built
(`docs/DESIGN-LANGUAGE.md`) and what the delivery repo already **proved in production**
(`docs/hero-design-language.md` — the Anthropic "warm paper" system, texture primitives, motion
hooks, mobile GPU budget). Recommendation-led; each slice is one PR.

## The pick: start with W22a, then W22b

**W22a is the biggest visible lift for the least new risk** — it ports primitives the delivery
app already hardened (M5's whole thesis is QR-learns-from-delivery), and it upgrades every screen
at once rather than one flow. **W22b** then makes the app _feel_ installed-native, which is where
"iOS-grade" is actually won or lost on a phone.

---

## W22a · Depth & ceremony — the Anthropic warm-paper pass ⭐ recommended first

Port the delivery repo's proven texture/motion kit into `@mms/ui` and give the QR surfaces real
depth: paper grain + gradient-masked dot/line grids behind key sections (never uniform
full-bleed), layered card surfaces (glass/vellum/paper tiers), soft two-tier diffuse shadows
(never the hard square frame), and odometer digits with a real baseline. Then the **ceremony**:
pay success becomes a thermal-receipt print reveal (clip-path + print-head light — delivery's
`CheckoutSummaryV8` pattern, totals presentation-only); send-to-kitchen gets a one-beat paper
"whoosh" settle.

- Constraints already known: **mobile GPU budget is a HARD limit** (no backdrop-filter / large
  blurs on mobile — the delivery iOS OOM incident), offscreen loops pause, RM everywhere.
- Effort: M. Risk: low (visual only). Impact: every screen.

## W22b · Installed-native — PWA polish + the live order chip

Make "add to home screen" feel like the App Store version: manifest + iOS splash/status-bar
theme, app-icon set, standalone display with safe-area discipline, and a **persistent live order
chip** — a Dynamic-Island-style pill that follows the diner across menu/cart/track with the real
kitchen state (fired → cooking → ready), expanding on tap. It's the J3 timeline made ambient;
every value in it is already real (kitchen taps).

- Effort: M. Risk: low-medium (service-worker update discipline — delivery's Serwist learnings
  apply). Impact: retention + the single most "native" feeling surface.

## W22c · The gesture layer — hands-first interactions

Swipe-to-close on every sheet (drag physics with spring settle), pull-to-refresh with a small
brand moment (the ✦ star spinning up as the ambient signal), edge-consistency on back
navigation, and a defined **haptics vocabulary** (today's 8/12ms taps codified: pick < commit <
celebrate). iOS keyboard floors audited (16px inputs — no focus zoom).

- Effort: S–M. Risk: low (framer drag ⇒ mind the bundle; delivery's domMax lessons apply).
- Impact: the "feels lagged" class of complaint never comes back.

## W22d · Night, designed — the candlelit teahouse

Dark mode graduates from inverted tokens to a designed theme: deeper espresso ground, gold used
even more sparingly (glow economy — selection only), photo treatment tuned for dark (slight
warmth lift), and the contrast fixtures recomputed. The delivery repo's dark-lift audit pattern
(hardcoded-fixture contrast tests) comes with it.

- Effort: S–M. Risk: low. Impact: half of real usage is evenings.

## W22e · Personal continuity — "your usual," honestly

The arrival beat grows one data-backed card: **"Your usual? ✦ Mohinga + Tea — add both"** built
strictly from the diner's own paid-order history (≥2 occurrences, same honesty bar as the rank
seals), one tap to re-add. The taste picker starts learning from actual orders (still only
declared tags/categories — never an invented affinity). First-timers keep Start-here; regulars
get recognition.

- Effort: M. Risk: low (reads existing RLS-scoped history). Impact: the return-visit wow.

## W22f · A sound identity (opt-in, off by default)

A two-note "service bell" on send-to-kitchen and a soft chime on pay success — the sonic version
of the gold cap. Strictly opt-in (a toggle beside reduced motion), silent by default, never on
error paths.

- Effort: S. Risk: none if default-off. Impact: delight for the diners who turn it on.

---

## Sequencing & the bar

`W22a → W22b → W22c` is the recommended order (each rides the previous); d–f slot in as
appetite allows. Every slice holds the standing gates: tokens only, RM-escorted motion, one live
region, 44px, data-backed claims, server-authoritative money, `verify:slice` + `check:docs` +
the two-reviewer pre-merge pass (in-session adversarial + Codex), K15 for any new MY.
