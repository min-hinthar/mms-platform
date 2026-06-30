# R6 — Menu signature slice (build plan)

> Richness **R6** (the single biggest gap): the menu from ~2.2/5 → the ≥4.3 bar. Built from a 5-reader
> context sweep (current menu · v7.2 prototype UX · data model · constraints · primitives). Owner decisions
> locked **2026-06-30**. Reference: `docs/RICHNESS_PLAN.md` §R6, `docs/prototype/v7.2.html` (menu + item sheet),
> `docs/context/{RUBRIC,DESIGN-RESEARCH}.md`, `docs/MOTION_AND_PERF.md`.

## Owner decisions (locked)

1. **Cadence → split into two gated PRs.** **R6a** = browse layer (search · category jump-rail · dietary
   filters · blur-up images · badges). **R6b** = the item detail sheet (modifiers · live price · upsell) —
   the customize moment + money-adjacent, its own adversarial review.
2. **Hero → item-sheet hero only.** No menu-top hero band (keeps the menu top lean: search + rail in view on
   load → smaller initial composite, the iOS-OOM budget). The big photo-hero lives in the R6b item sheet,
   where the prototype actually puts it.
3. **Upsell → hardcoded pairing rules** (small curated map in code: sides↔mains, rice↔curries,
   parata↔goat-curry). Ships the "Goes well with" moment in R6b, no schema change. (Revisit a curated
   `upsell_item_ids` column later if it earns its keep.)
4. **Live price → client preview, server-final.** The sheet sums base + the modifier `price_delta_cents`
   already loaded with the item for an instant preview; the server re-derives the real amount on add via
   `priceItem` (client sends modifier ids, never a price). No new endpoint; server-authoritative for what's
   charged.

## Data reality (de-risks the build)

- **Modifiers are real + seeded.** 7 groups across the 7 items that have them (most of ~60 items have none):
  required single-select curry styles (`min_select=1`), optional multi-select add-ons (`min_select=0`,
  e.g. Brains **+$2**). `min_select` decides required (radio) vs optional (checkbox). `priceItem(menuItemId,
  modifierIds)` is the server-authoritative engine; `addItem(cartId, menuItemId, modifierIds)` already takes
  the ids. Modifier names are **EN-only** (no `name_my`).
- **Dietary data is real.** `menu_items.tags` (`vegan`/`vegetarian`/`vegan-optional`/`allergen-reviewed`/
  `spicy`/`popular`) + `menu_items.allergens` (`shellfish`/`fish`/`egg`/`soy`/`peanuts`/`dairy`/`tree_nuts`/
  `gluten_wheat`/`sesame`). **Fail-safe:** a free-from chip excludes any item that declares that allergen
  AND any item with **no declared allergens unless it carries `allergen-reviewed`** (unknown ≠ safe).
- **Honesty:** there is **no `signature`/`most-loved` tag** — badges show only REAL tags (Popular, Vegan,
  Vegetarian, Spicy) + Sold-out. Never fabricate a "Signature" badge.
- No pairing table → upsell is the hardcoded rules map (decision 3).

## R6a — browse layer (this PR)

**Architecture:** the RSC page (`app/(order)/menu/page.tsx`) fetches items (now incl. `description_en`,
`tags`, `allergens`) + categories and passes them to a new **client** `MenuBrowser` that owns the
search/category/diet state and renders the sticky toolbar + grouped sections. Keeps data server-fetched,
moves the interactive list client-side. `force-dynamic`/nonce-CSP unchanged.

- **`MenuSearch`** — sticky text input, client-filter on `name_en`/`name_my`/`description_en`. Placeholder
  "Search dishes, drinks…", `aria-label="Search the menu"`, 🔍 `aria-hidden`; `text-base` (≥16px, iOS
  no-zoom). Debounced render is unnecessary (client array is small).
- **`CategoryRail`** — `role="tablist"` chip row; each chip `role="tab"` + `aria-selected`; active = lit
  (`--ac`/`--oa`), inactive = ghost (`--sf`/`--t2`); horizontal scroll, 44px targets. Tap → smooth
  `scrollIntoView` to the section (instant under reduced-motion). **Scroll-spy** (IntersectionObserver)
  marks the active tab. Large-title collapse on scroll (rAF-throttled, >42px → compact) — transform/opacity.
- **`DietFilterChips`** — toggle chips (Vegetarian 🌱, Vegan 🌿, Gluten-free 🌾, No nuts 🥜, No shellfish 🦐),
  `aria-pressed`; selected = jade tint. Fail-safe filter logic in a small `lib/menu/dietary.ts`. Inline
  **disclaimer** (one live region, shown only when a free-from chip is active): the v7.2 line — honest,
  muted, not a popover.
- **`BlurUpImage`** — `next/image` `onLoad` → `filter: blur(8px) scale(1.05)` → `blur(0)`, opacity 0→1;
  gradient placeholder; `onError` removes broken img. transform/opacity/filter only (GPU-safe), no loop.
- **Badges** — `@mms/ui` Badge for the item's real tags (Popular/Vegan/Vegetarian/Spicy) + Sold-out;
  warn-tone never abused for body text.
- **Empty state** — "Nothing matches" + a "Clear filters" ghost button (focus moves to it).

**a11y:** one live region (result-count / disclaimer); tablist roving semantics; chips are real toggles;
search labelled; 44px targets; reduced-motion off-switches on collapse + blur-up; decorative emoji
`aria-hidden`.

## R6b — item detail sheet (next PR)

Tap a row → `@mms/ui` `Sheet` (R5b swipe-to-close) with: big photo-hero (blur-up, RM-gated), name + MY +
description, real badges + the fail-safe disclaimer, **required (radio) then optional (checkbox) modifier
groups** from `min_select`, **live price preview** (sum base + loaded deltas; `aria` rolled value), a
**"Goes well with"** horizontal upsell from the hardcoded rules, and a sticky **Add to order** CTA that
calls `addItem(cartId, menuItemId, modifierIds)` (server re-derives). Sold-out/locked → disabled CTA.
Money path: client never sends a price; preview is advisory; the server is the sole authority on add.

## Guardrails (every R6 PR)

Mobile GPU budget (no stacked `backdrop-filter`/`blur()`; radial-gradient glows; in-view-on-load budgeted);
60fps transform/opacity; reduced-motion in CSS + JS; AA contrast (both themes); inputs ≥16px;
server-authoritative pricing untouched; tokens not hex; Pre-PR self-review sweep ending in a fresh-context
adversarial subagent, verdict posted on the PR.
