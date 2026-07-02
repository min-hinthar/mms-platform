# World-Class UX Plan — QR app (2026-07-02)

**Direction (owner-chosen):** _elevate_ the existing **editorial-forward light + v4 Night** language to
world-class — keep the lineage, raise the ceiling. Not a reskin, not a convergence onto delivery's warm-paper.
**Identity:** a **typographic wordmark** (Fraunces display lockup + the ✦ Morning Star mark + favicon) —
no commissioned illustration. **Scope:** the **flagship diner path first** (homepage → menu → item sheet →
cart → checkout → track), then staff + grocery. **This session's deliverable:** this plan + one **proof
screen** (the homepage) shipped as its own PR.

## Why now (the gap is craft + identity, not breakage)

The R1–R9 Richness track gave QR **excellent infrastructure** — disciplined motion (reduced-motion + offscreen
gates), dark mode, a token system, and a11y scaffolding; the audit found only polish-tier bugs. So "world-class"
is a **ceiling raise** on three axes the audit + rubric surface:

1. **Identity.** The flagship hero uses an **emoji ☕** as the brand mark; QR ships **no `public/` assets**
   (no logo, favicon, or OG). World-class products have a distinctive mark; QR borrows an emoji.
2. **Craft rigor.** Screens carry **inline magic numbers** off the 4/8/16/24/32 grid (`fontSize: 30`,
   `gap: 13`, `maxWidth: 440`, `margin: "6px 0 2px"`) and there is **no type-scale token set** — the spacing
   tokens (`--s1..--s8`) exist but aren't used on the homepage. Rubric #3 (type) + #4 (spacing) drag.
3. **Evenness.** Grocery missed the Richness pass (flat cards, static total, `<a>` CTA); scrim/`themeColor`
   seams remain. Rubric #10 (design-system consistency).

## The system additions (shared, land in the proof, reused by every later slice)

- **Type scale** (new tokens in `@mms/ui/tokens.css`, additive — the contrast test parses that file but new
  font-size/line-height tokens don't touch the color matrix): a modular scale + per-role line-heights +
  display tracking. Kills `fontSize: 30`-style magic numbers app-wide.
- **Wordmark identity:** a Fraunces display lockup + the **✦ gold Morning Star** mark (the shared brand
  motif; a geometric glyph, not an illustration) + an SVG **favicon** + OG metadata. `apps/qr/public/` is
  created here (it didn't exist).
- **Grid discipline:** every spacing value from `--s*`; a `--w-content` token for the entry column.
- **`themeColor` fix:** `#fffaf2/#0f1115` → the real `--pg` values `#faf9f5/#171221` (audit U-Q5).

## Rubric-scored gaps across the flagship path (score → target ≥4.3)

| Screen                | Weakest dims today                                                             | World-class moves                                                                                   |
| --------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| **Homepage** (proof)  | #3 type (inline 30px), #4 grid (13/22/440), #10 identity (emoji)               | Wordmark lockup · type scale · grid tokens · favicon/OG/themeColor                                  |
| **Menu**              | #1 perceived-perf (blur-up exists; add skeletons), #6 IA (rail solid), #3 type | Skeleton menu rows matching geometry; type-scale headings; optical category-rail alignment          |
| **Item sheet**        | #5 micro-interactions (upsell swap loses scroll/focus — audit U-Q1), #2 motion | Scroll-to-top + focus on item swap; spring-physics modifier reveal; live price number-roll (exists) |
| **Cart**              | #1 optimistic UI, #9 edge/empty                                                | Optimistic qty writes; designed empty-cart CTA; per-line skeletons on refetch                       |
| **Checkout**          | #9 edge/error, #8 focus (settling-flip drops focus — audit U-Q7)               | Focus on view-key change; inline field validation; specific retry copy; Stripe-iframe-safe          |
| **Track**             | #1 perceived-perf, #7 voice                                                    | Skeleton timeline; honest sensory status copy; the pulse already offscreen-gated                    |
| _(later)_ **Grocery** | missed Richness pass (#5, #10)                                                 | R5 pass: `card-textured`, NumberFlow total, `<button>` CTA (audit U-Q4)                             |

**Perennial laggards to design first (rubric §How-to):** #9 edge/empty/error and #1 perceived performance —
skeletons + optimistic UI + designed empty/error states, not last-minute.

**Tracked (pre-existing, not this proof): the homepage hero is English-only.** The v7.2 prototype greeting is
bilingual (`မင်္ဂလာပါ` / "Good morning"); the current hero hardcodes English (predates this work). The
bilingual EN/MY moat is a first-class brand rule — fold a `lang="my"` Burmese line into the wordmark/greeting
in a later flagship-path slice (needs the app-wide EN↔MY toggle wired, so it's a system task, not a one-string
fix).

## Sequenced build (each slice = one gated PR, adversarial pre-merge review)

1. **Proof — homepage** (this PR): type-scale tokens · wordmark identity + favicon/OG · grid tokens ·
   themeColor. Establishes the system every later slice reuses.
2. **Menu**: skeletons + type-scale headings + rail optical alignment.
3. **Item sheet**: fix the upsell scroll/focus (U-Q1) + spring modifier reveal.
4. **Cart + Checkout**: optimistic UI, designed empty/error, focus-on-view-change (U-Q7), scrim token (U-Q6).
5. **Track**: skeleton timeline + honest sensory voice.
6. **Grocery + staff**: the missed-pass R5 treatment (U-Q4) + staff-surface consistency.

**Guardrails (unchanged from Richness):** reduced-motion + offscreen gates on every animation; mobile GPU
budget (no backdrop-filter / large blur on mobile — radial-gradient glows only); tokens not hardcoded colors;
one live region per view; 44px targets; the contrast-audit test re-run on any token change; build to the v7.2
prototype + QA-CHECKLIST §A + RUBRIC ≥4.3 in the first commit.
