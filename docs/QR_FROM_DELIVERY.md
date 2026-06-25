# QR ← Delivery — transfer backlog (M5)

**Status: backlog of record (2026-06-24).** The synthesis behind the reshaped M5 (see
[`docs/M5_DESIGN.md`](M5_DESIGN.md)). M5 is **no longer a repo migration** — the two apps stay **separate
repos** (own deploys, own CI, own Supabase projects, the shared Stripe account). Instead, the younger **QR**
app absorbs the **production-hardened patterns, mobile/a11y craft, and reusable primitives** the live
**delivery** PWA already paid for. Full-repo co-location is reconsidered at **M6**, only if Terminal/kiosk
create a concrete shared-runtime need.

> **Sourced from two parallel adversarial audits (2026-06-24):** a catalog of delivery's app-agnostic wisdom
> (`min-hinthar/mandalay-morning-star-delivery-app`) and a posture/gap audit of QR (`apps/qr` + `@mms/ui`).
> Delivery file paths below are relative to that repo's root; QR targets are in this monorepo.

## The one correction to make first

The delivery catalog recommends "fork our design tokens into QR." **Do not.** QR's `@mms/ui/tokens.css` is the
**tighter, WCAG-AA-verified, 107-line single source**; delivery's `src/styles/tokens.css` is a 34 KB accreted
system (a "Pepper" red/gold base **plus** a `--hero-*` warm-paper layer plus de-versioned cruft). **QR keeps
its own tokens.** The transfer is *behavior + craft + primitives*, each built to **QR's** tokens — never a
design-system import.

## Already absorbed — do NOT re-transfer (QR is already strong here)

The QR audit confirmed these are production-grade in QR; re-porting delivery's versions is wasted work:

- **Money / auth / RLS** — server-authoritative pricing (`apps/qr/lib/cart.ts`), the single authz guard
  (`apps/qr/lib/authz.ts`), category-aware tax (`apps/qr/lib/tax.ts`), RLS on every table.
- **Stripe webhook correctness** — idempotent on the PI id, cross-tender guard, amount reconcile, per-side-effect
  `after()` isolation + a pg-cron backstop (`apps/qr/app/api/stripe/webhook/route.ts`). Delivery's "500 on DB
  error", `.update().select("id")` row-count, and email idempotency-key learnings are **already practiced** here.
- **Design tokens** — WCAG-AA across light/Night, bilingual fonts (`@mms/ui/tokens.css`).
- **Baseline a11y** — 44px targets, focus-to-heading on error boundaries, `prefers-reduced-motion` in CSS.
- **Image/font optimization** — `next/image` + Supabase remotePatterns, avif/webp, per-script font subsets.

## Transfer backlog (mapped to the reshaped M5 slices)

Priority = value to QR · Effort = S/M/L. Items QR can adopt without a design-system change come first.

### P5.2 — iOS / mobile hardening sweep `[the highest value:effort ratio]` — ✅ shipped (2026-06-24)

> Shipped: `--sheet-max-h` (dvh) token + safe-area in the shared `.mms-sheet`; position-based safe-area insets
> on CartBar / grocery CTA / recovery alert / RefundActionSheet; a single mobile-16px form-control base rule
> (covers the inputs QR had missed). Nested-scroll + breakpoint-overlay items audited clean. The
> swipe-to-close two-layer fix is carried to **P5.4** (it needs the `@mms/ui` Drawer that slice adds).

Concrete production bugs delivery already hit and fixed; QR has the latent versions. Each is a small, contained
edit to QR's shared `@mms/ui` Sheet, checkout forms, and any overlay.

| Item | Why QR needs it | Delivery source | QR target | Pri/Eff |
|---|---|---|---|---|
| Safe-area insets via **position, not padding** (`bottom: calc(… + env(safe-area-inset-bottom))`) | QR sheets/fixed CTAs clip behind the iPhone notch/home-bar; padding shifts layout, position doesn't | `src/components/ui/feedback/FeedbackFAB.tsx`; learnings `mobile-ux.md §8` | `@mms/ui/sheet.tsx`, QR `CartBar`/checkout CTAs | High/S |
| `--sheet-max-h` = `calc(100dvh - env(safe-area-inset-top) - 1rem)` for bottom sheets (not `vh`) | iOS `vh` is the *large* viewport → a `95vh` sheet's close button hides under the status bar | `src/styles/tokens.css`, `src/components/ui/Drawer.tsx` | `@mms/ui/tokens.css` + `sheet.tsx` | High/S |
| 16px input font on mobile (`text-base sm:text-sm`) | iOS auto-zooms on focusing any `<input>`/`<textarea>` <16px and never zooms back | learnings `mobile-ux.md`; all delivery inputs | QR checkout/grocery-search inputs | High/S |
| Single scroll container per axis (nested `overflow-y-auto` blocks wheel) | Modal-wrapping-Drawer eats wheel events with no resolved height | learnings `mobile-ux.md §3` | QR Modal/Sheet nesting | Med/S |
| Breakpoint-coupled overlay anchor uses **one** breakpoint | A dropdown that flips anchor at `sm:` but whose trigger moves at `md:` opens off-screen at 640–767px | learnings `mobile-ux.md` (ProfileMenu) | QR staff/account overlays | Med/S |
| Swipe-to-close two-layer fix (`height:auto` + drop `touchAction:pan-y` on non-scrollable content) | `height:full` + `pan-y` captures all touch → swipe-close never fires | `src/components/ui/feedback/FeedbackSheet.tsx`; `mobile-ux.md §7` | `@mms/ui` Drawer (if added in P5.4) | Med/M |

### P5.3 — Motion discipline + perf budget `[adopt before QR adds heavier motion]` — ✅ shipped (2026-06-24)

> Shipped: `@mms/ui` foundation primitives `useAnimationPreference` / `useInView` / `useDeviceTier` (lean,
> SSR-safe) + **`docs/MOTION_AND_PERF.md`** (the full discipline) + the `/track` pulse as the canonical
> offscreen-pause consumer. `useRipple`/`useTilt` carried to **P5.4** (need component consumers).

QR's motion is light today (CSS keyframes only). Adopt the *discipline* now so richer motion lands safe.

| Item | Why QR needs it | Delivery source | QR target | Pri/Eff |
|---|---|---|---|---|
| `useAnimationPreference()` JS gate (`shouldAnimate`) + in-app override | QR honors reduced-motion in CSS but has no JS gate — any future framer `repeat:Infinity` loop ignores it | `src/lib/hooks/useAnimationPreference.ts` | new QR hook (built to QR tokens) | High/S |
| `useInView` offscreen-pause for any infinite loop | framer JS loops keep ticking offscreen (battery/jank); `.hero-anim-paused` only stops CSS | catalog §4.2 | wherever QR adds looping motion | High/S |
| Mobile GPU/blur budget rules (no stacked `backdrop-filter` / large `blur()` on mobile; radial-gradient glows) | The exact rule set that fixed delivery's **iOS WebKit OOM tab crash** — pre-empt it in QR | `docs/hero-design-language.md §7.1`; `useHeroFx.ts` | QR design-rules doc + lint note | High/S (doc) |
| Device-tier gating (SSR-safe low→desktop) for expensive FX | Capability-based gating; the primitive QR needs before any WebGL/particle/parallax | `src/lib/hooks/useDeviceCapability.ts` (+ FX budget in `useHeroFx.ts`) | new QR hook | Med/S |
| `useRipple()` / `useTilt()` interaction hooks | Per-element micro-interaction, app-agnostic math — re-skin to QR tokens | `src/components/ui/.../interactions.ts`, `useTiltEffect.ts` | `@mms/ui` motion hooks | Med/M |

> Carry the hard-won caveats verbatim: **no 3D tilt on a card whose body holds the primary CTA** (square
> shadow artifact + the Add button slides out from under the cursor), and **disable tilt on keyboard focus**.

### P5.4 — Primitive component library in `@mms/ui` `[QR's biggest structural gap]` — 🚧 in progress

> **P5.4a ✅** shipped: `@mms/ui` lint config + `Badge` (dedups RoleBadge/FloorStatusChip) + `EmptyState`
> (dedups Kds/Approvals boards). **P5.4b next:** Avatar (GuestList) · Skeleton (loading) · Stepper (qty +/-).
> **P5.4c:** Card variants (20+ `.card` sites, own PR). **Deferred — no QR consumer:** Tooltip, Drawer, tilt;
> Toast + ripple only if a consumer emerges. (Consumer audit: STRONG for Badge/EmptyState/Avatar/Skeleton/
> Stepper/Card; NONE for Tooltip/Drawer.)

QR ships ~50 bespoke domain components and rebuilds primitives inline each time. Promote the missing ones into
`@mms/ui`, **built to QR tokens**, with delivery's component APIs as the reference (not a copy).

- **Skeleton** (QR uses inline "…"), **Toast/notification stack** (QR has none — errors only via `aria-live`),
  **EmptyState**, **Stepper** (QR inlines step counters), **Card variants** (one `.card` class today →
  elevated/outlined/filled), **Drawer** (side/bottom, distinct from `Sheet`), **Badge**, **Avatar**, **Tooltip**.
- Each lands with the P5.2 mobile-hardening baked in (dvh sizing, safe-area, single-scroll) and a Storybook-or-
  example entry. Pri **Med-High**, Eff **L** (the long tail; ship incrementally, most-used first).

### P5.5 — Contrast-audit test + QR test infra `[lock in the AA claim]`

QR has WCAG-AA tokens but **zero automated tests** — `turbo test` is commented out in `.github/workflows/ci.yml`
and QR has no test script. Two steps:

1. Wire a test runner (Vitest) into QR + uncomment the turbo `test` gate.
2. Port delivery's **contrast-audit** (harvests text×surface combos, asserts the ratio floor) with **QR token
   fixtures**. Source: delivery `e2e/contrast-audit.spec.ts` + the `contrast-audit.test.ts` fixture pattern.
   Caveat to carry: **fixtures hardcode token hex — they must be refreshed in the same PR as any token change**
   or the suite silently passes on a regressed token. Pri **High**, Eff **M**.

### P5.6 — PWA / offline `[deferred / optional for dine-in]`

Delivery rates this High; for QR (on-site, ~4h session, network assumed) it's **hygiene, not load-bearing** —
ranked last. If pickup/home-install demand grows: Serwist SW (`scripts/build-sw.mjs` pattern) + manifest +
offline cart via `idb-keyval` + a cooldown-guarded chunk-load `reload()` route boundary (`nextjs`/Serwist
learnings). Pri **Low**, Eff **L**.

## Cross-cutting learnings to fold into `.claude/LEARNINGS.md`

Delivery-proven, QR-relevant gotchas not already in QR's memory (port the wording, attribute the source):

- **Tailwind v4 never loads `tailwind.config.ts`** — JS-config utilities silently no-op; grep built CSS before
  relying on a non-default class.
- **`flex items-center` collapses a child without `w-full`** (intrinsic width → ~padding-only width).
- **Event listeners belong in `useEffect`, not `useCallback`** (changing ref accumulates listeners).
- **`useRef` on a conditional render target breaks observers** — use a stable always-rendered wrapper.
- **Zustand + async (IDB) persist:** use selectors, not `getState()` in `useMemo` (captures pre-hydration snapshot).
- **E2E:** assert DOM removal with `.count()`, not `.not.toBeVisible()`; never wrap `expect` in an unasserted guard.

## What stays delivery-only (explicitly out of scope)

Driver routing / offline driver queue, COD approval, multi-day delivery scheduling, bearing-based delivery
zones, Google Maps/Leaflet coverage maps, win-back/abandoned-cart crons, high-contrast "sunlight" mode (driver
need). The *underlying* idempotency/offline-queue pattern is noted above only where a customer surface could reuse it.
