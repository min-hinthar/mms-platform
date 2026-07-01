# R9 — Staff floor + homepage (build plan)

> Richness **R9**, the final slice. **Owner override:** the plan marks these ops surfaces "restrained —
> maximalism is wrong here"; the owner has overridden that to **full enrichment** (customer-surface parity).
> The §4 hard guardrails (perf / a11y / honesty) are NOT lifted — only the "keep it subtle" policy is.
> Built from a 5-reader context sweep. Owner decisions locked **2026-07-01**. Reference:
> `docs/RICHNESS_PLAN.md` §R9, `docs/context/RUBRIC.md`, `docs/MOTION_AND_PERF.md`.

## Owner decisions (locked)

1. **Cadence → split** R9a (staff boards) / R9b (homepage). Zero shared files; the boards touch live
   money-adjacent data + realtime, the homepage is pure decorative composition — separate reviews.
2. **Board motion → full but informative** (event-driven only). Max spring/entrance/flash/pulse on REAL
   events (subtotal roll+flash, card-enter on scan-in, one-shot status pulse, press) — **no idle loops
   behind live data** (constant motion washes out the peripheral change-signal a server relies on + burns
   GPU on a board that's fully in view on load). The responsible read of "full" on a live ops board.
3. **Scope → all staff boards now** (not just the 3 named floor files): FloorBoard, FloorDetailLive,
   TableCard + KdsBoard, ExpoBoard, ApprovalsBoard, StaffOrdersBoard.
4. **Homepage hero → maximal** (glow + steam + draw-on ring + pointer/gyro parallax) — R9b.

## R9a — staff boards (live-notice) ✅ shipped 2026-07-01

The "live-notice" signature: a saturated server registers a change **peripherally**, without staring.

- **`LiveMoney`** (new) — a money figure that ROLLS (NumberFlow) + briefly FLASHES on change (accent up /
  muted down). Self-contained (own prev value); rAF-deferred setState (lint-safe); reduced-motion gated
  (CSS `@media` + `shouldAnimate`). `aria-hidden` reels + `sr-only` real value, unless `srHidden` (the
  parent's composed label already names it). Real cents only — money stays display-only.
- **`StaggerList`** (new) — a shared `role="list"` wrapper: framer **card-enter on arrival + exit on
  removal**, keyed so ONLY added/removed items animate (existing cards don't re-animate on a realtime
  refresh); initial-mount stagger (40ms gap, capped 500ms); reduced-motion → `initial={false}` +
  zero-duration. `m.li` under the root `domAnimation` (no `layout` prop → no `domMax`). Adds no live region.
- **FloorBoard** — status-diff tracking (prevStatus ref seeded from the initial snapshot → no false pulse on
  the first refresh) feeds `justChanged` to each `TableCard` (cleared after 1s); routes the list through
  `StaggerList`. The board's single `role="status"` stays the only live region.
- **TableCard** (stays a Server Component) — `interactive` (it's a real `Link`) + `textured`; a one-shot
  **status-change ring** (`.floor-card-pulse`, keeps the base `--sh` as the 2nd shadow layer) when
  `justChanged`; running subtotal → `<LiveMoney srHidden>` (card `aria-label` carries the value).
- **FloorDetailLive** — running subtotal → `<LiveMoney>` (its own sr-only value). `FloorStatusChip` kept
  **static by design** — its warn color/bg is the attention cue, and the floor card already pulses on a
  status change, so a chip pulse would be redundant/over-animation (the "informative not decorative" line).
- **KDS / Expo / Approvals / StaffOrders** — routed through `StaggerList` (card-enter/stagger/exit); cards →
  `card-textured` (NOT `interactive` — they're not links, a hover-lift would be a false affordance); primary
  action buttons → `.staff-btn` (quiet press + hover). Each board keeps its single existing live region.
- **`globals.css`** R9 block — `.floor-live/-up/-down` (background wash, no layout shift) + `floorFlashUp/Down`,
  `.floor-card-pulse` + `floorCardPulse`, `.staff-btn` press/hover; every one with a `@media
  (prefers-reduced-motion)` off-switch. Transform/opacity/color + one-shot box-shadow only — no
  blur/backdrop-filter (mobile GPU). Built-CSS grep confirms all emit.

### Pre-PR review fixes (5 P2, all fixed)

A fresh-context adversarial review (4 lenses → verify) confirmed 5 P2 craft gaps in the change-cue, all
fixed: (1) **StaggerList exit** inherited the entrance stagger delay → a removed card lingered ~680ms;
exit now carries its own zero-delay transition. (2) **LiveMoney flash** + (3) **card pulse** didn't restart
on a rapid same-target repeat (unchanged class → no keyframe restart); both are now **keyed decorative
overlays** that remount per change. (4) **Cross-table pulse truncation** — the shared Set+timer yanked one
table's ring when another changed; replaced with a per-session nonce map + per-session timers (merged, not
replaced). (5) **Fabricated liveness** — the pulse fired on TTL-derived status *self-reverts*
(`paying`/`settling` → `ordering`/`seated` when the 5-/10-min window elapsed with no real event); a status
change is now only "real" if it isn't such a revert.

## R9b — homepage hero (maximal) — PENDING

`app/page.tsx` + `ModeCard` + a new hero: gradient-masked dot-texture backdrop; finish the card stagger
(grocery card index + header lines); a hero signature moment — radial glow behind the ☕ + `.mms-steam`
wisps + a draw-on SVG ring + device-tier-gated pointer/gyro parallax (rAF-throttled, IO-gated, passive).

## Guardrails (every R9 change)

Event-driven motion only on the live board (no idle loops); 60fps transform/opacity/color + one-shot
box-shadow; no blur/backdrop-filter (mobile GPU); reduced-motion off-switch on every animation (CSS
`@media`, not the `shouldAnimate` hook, for mount-time motion); ONE live region per board (add none); animate
REAL server values only (no fabricated liveness); money display-only (no totals math); `interactive` only on
genuinely-clickable cards; tokens not hex; Tailwind-v4 class-emit + no color-only box-shadow; Pre-PR
self-review sweep ending in a fresh-context adversarial subagent, verdict posted on the PR.
