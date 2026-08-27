# QR ← Delivery — transfer backlog (M5)

**Status: backlog of record (2026-06-24; second wave logged 2026-08-17).** The synthesis behind the reshaped M5 (see
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
its own tokens.** The transfer is _behavior + craft + primitives_, each built to **QR's** tokens — never a
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

| Item                                                                                              | Why QR needs it                                                                                      | Delivery source                                                           | QR target                                       | Pri/Eff |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------- | ------- |
| Safe-area insets via **position, not padding** (`bottom: calc(… + env(safe-area-inset-bottom))`)  | QR sheets/fixed CTAs clip behind the iPhone notch/home-bar; padding shifts layout, position doesn't  | `src/components/ui/feedback/FeedbackFAB.tsx`; learnings `mobile-ux.md §8` | `@mms/ui/sheet.tsx`, QR `CartBar`/checkout CTAs | High/S  |
| `--sheet-max-h` = `calc(100dvh - env(safe-area-inset-top) - 1rem)` for bottom sheets (not `vh`)   | iOS `vh` is the _large_ viewport → a `95vh` sheet's close button hides under the status bar          | `src/styles/tokens.css`, `src/components/ui/Drawer.tsx`                   | `@mms/ui/tokens.css` + `sheet.tsx`              | High/S  |
| 16px input font on mobile (`text-base sm:text-sm`)                                                | iOS auto-zooms on focusing any `<input>`/`<textarea>` <16px and never zooms back                     | learnings `mobile-ux.md`; all delivery inputs                             | QR checkout/grocery-search inputs               | High/S  |
| Single scroll container per axis (nested `overflow-y-auto` blocks wheel)                          | Modal-wrapping-Drawer eats wheel events with no resolved height                                      | learnings `mobile-ux.md §3`                                               | QR Modal/Sheet nesting                          | Med/S   |
| Breakpoint-coupled overlay anchor uses **one** breakpoint                                         | A dropdown that flips anchor at `sm:` but whose trigger moves at `md:` opens off-screen at 640–767px | learnings `mobile-ux.md` (ProfileMenu)                                    | QR staff/account overlays                       | Med/S   |
| Swipe-to-close two-layer fix (`height:auto` + drop `touchAction:pan-y` on non-scrollable content) | `height:full` + `pan-y` captures all touch → swipe-close never fires                                 | `src/components/ui/feedback/FeedbackSheet.tsx`; `mobile-ux.md §7`         | `@mms/ui` Drawer (if added in P5.4)             | Med/M   |

### P5.3 — Motion discipline + perf budget `[adopt before QR adds heavier motion]` — ✅ shipped (2026-06-24)

> Shipped: `@mms/ui` foundation primitives `useAnimationPreference` / `useInView` / `useDeviceTier` (lean,
> SSR-safe) + **`docs/MOTION_AND_PERF.md`** (the full discipline) + the `/track` pulse as the canonical
> offscreen-pause consumer. `useRipple`/`useTilt` carried to **P5.4** — and **shipped with Richness R4**
> (`packages/ui/src/interactions.ts`: `useTilt`/`useMagnetic`/`useHeroParallax`/`useRipple`, exported
> from the package root, each reduced-motion-gated).

QR's motion is light today (CSS keyframes only). Adopt the _discipline_ now so richer motion lands safe.

| Item                                                                                                          | Why QR needs it                                                                                          | Delivery source                                                        | QR target                        | Pri/Eff      |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------- | ------------ |
| `useAnimationPreference()` JS gate (`shouldAnimate`) + in-app override                                        | QR honors reduced-motion in CSS but has no JS gate — any future framer `repeat:Infinity` loop ignores it | `src/lib/hooks/useAnimationPreference.ts`                              | new QR hook (built to QR tokens) | High/S       |
| `useInView` offscreen-pause for any infinite loop                                                             | framer JS loops keep ticking offscreen (battery/jank); `.hero-anim-paused` only stops CSS                | catalog §4.2                                                           | wherever QR adds looping motion  | High/S       |
| Mobile GPU/blur budget rules (no stacked `backdrop-filter` / large `blur()` on mobile; radial-gradient glows) | The exact rule set that fixed delivery's **iOS WebKit OOM tab crash** — pre-empt it in QR                | `docs/hero-design-language.md §7.1`; `useHeroFx.ts`                    | QR design-rules doc + lint note  | High/S (doc) |
| Device-tier gating (SSR-safe low→desktop) for expensive FX                                                    | Capability-based gating; the primitive QR needs before any WebGL/particle/parallax                       | `src/lib/hooks/useDeviceCapability.ts` (+ FX budget in `useHeroFx.ts`) | new QR hook                      | Med/S        |
| `useRipple()` / `useTilt()` interaction hooks                                                                 | Per-element micro-interaction, app-agnostic math — re-skin to QR tokens                                  | `src/components/ui/.../interactions.ts`, `useTiltEffect.ts`            | `@mms/ui` motion hooks           | Med/M        |

> Carry the hard-won caveats verbatim: **no 3D tilt on a card whose body holds the primary CTA** (square
> shadow artifact + the Add button slides out from under the cursor), and **disable tilt on keyboard focus**.

### P5.4 — Primitive component library in `@mms/ui` `[QR's biggest structural gap]` — ✅ a/b/c shipped

> **P5.4a ✅** shipped (+ 3-lens deep pre-merge review): `@mms/ui` lint config + `Badge` (semantic `tone`
> presets owning the AA-on-tint rule; dedups RoleBadge/FloorStatusChip) + `EmptyState` (dedups Kds/Approvals
> **+ ExpoBoard** boards). **P5.4b-1 ✅:** Avatar (GuestList + SplitSection) · tabChip→Badge (floor pills
> unified). **P5.4b-2 ✅:** Skeleton (PickupSlotSheet + SettlementBoard; `@keyframes` in app `globals.css`,
> not the pkg) · Stepper (StaffLineEditor + Checkout — a context sweep found **2 drifted consumers, not 1**).
> Skeleton fast-follow consumers surfaced + deferred: **SharePay** ("Preparing your payment…"), **MergeTableButton**
> (staff). **P5.4c ✅:** `Card` primitive — **NO variants.** A sweep overturned the planned elevated/outlined/filled
> taxonomy (that was _delivery_'s, not QR's): QR's 25 `.card` sites are surface-uniform; the only fork was
> accidental shadow-drift in 10 inline copies. Shipped a polymorphic `<Card>` (applies `.card`, `ref`-forwarding)
>
> - migrated the 10 drifters (9 gained the canonical shadow). **Tinted ok/warn status surfaces → a future
>   `Callout`, not a Card variant.** **Deferred — still no QR consumer:** Tooltip, Drawer. (Consumer audit:
>   STRONG for Badge/EmptyState/Avatar/Skeleton/Stepper/Card; NONE for Tooltip/Drawer.) **Superseded:** tilt +
>   ripple shipped with Richness R4 (`packages/ui/src/interactions.ts`); a toast consumer emerged but as
>   app-level CSS (`.mms-toast`, owned by `TableCartProvider`) — promote it only on a second consumer.

QR ships ~50 bespoke domain components and rebuilds primitives inline each time. Promote the missing ones into
`@mms/ui`, **built to QR tokens**, with delivery's component APIs as the reference (not a copy).

- **Skeleton** (QR uses inline "…"), **Toast/notification stack** (QR has none — errors only via `aria-live`),
  **EmptyState**, **Stepper** (QR inlines step counters), **Card** (a polymorphic wrapper over the single `.card`
  class — **no** elevated/outlined/filled variants; QR's cards are surface-uniform, so variants were not built),
  **Drawer** (side/bottom, distinct from `Sheet`), **Badge**, **Avatar**, **Tooltip**.
- Each lands with the P5.2 mobile-hardening baked in (dvh sizing, safe-area, single-scroll) and a Storybook-or-
  example entry. Pri **Med-High**, Eff **L** (the long tail; ship incrementally, most-used first).

### P5.5 — Contrast-audit test + QR test infra `[lock in the AA claim]` — ✅ shipped (2026-06-29)

> Shipped: **Vitest 4** wired into `packages/ui` + `apps/qr` (node-env, pure-logic — no `server-only`/CSS),
> the turbo `test` gate uncommented in CI, and the **contrast-audit** ported to `packages/ui`. The port
> improves on delivery's: it **parses `tokens.css` at test time** (resolving `var()` aliases + flattening the
> `color-mix` tints) instead of mirroring hex fixtures, so a token edit is checked automatically — no fixture
> to drift. Asserts the full text×surface matrix (both themes) **plus negative anti-regression guards** (plain
> `--ac`/`--gold` as text must STAY <4.5 in light — the reason the `-strong` variants exist). + `apps/qr/lib/
avatars.test.ts` (seat-hue×`#fff` AA + `seatColor`/`seatInitial` logic). **Finding:** every production combo
> clears AA in both themes — **and W22d-1 falsifies that claim twice over.** It was only ever true of
> the combos the audit DEFINED. Ruby was not one of them (failing at 4.47/4.32 on the tier tints), and
> two LIGHT call sites were failing worse than ruby ever did: `.lend-banner-back` at **3.53** and
> `.wb-method` at **3.70**, both rendering plain `--ac` on an accent tint over `--sf` — the exact
> pairing the audit's own negative guard already declared illegal. Tightest now: light `ac-strong` on
> the accent tint over `sf` **4.63**; dark **4.66** (`ruby-strong` on the wallet chip's hover blend).
> ⚠️ **Re-measured 2026-08-27:** this line said `jade-strong` at **4.52** until M86/PR A lifted
> `--jade-strong` off its alias to `#62b380` — a lift KEPT through that PR's revert — which moved jade
> to **4.6827** and left `ruby-strong` binding first at **4.6561**. The lift falsified the very line
> that justified it, and this line has now been stale twice (it also briefly claimed "4.61"), so
> MEASURE this pairing rather than quoting it.
>
> Separately, the P5.4b-1 "seat hues sub-AA" worry was a **phantom**: all five `PCOL` hues clear 4.5:1 (lightest `#A65F10` = 4.92);
> the `avatar.tsx` comment was corrected. (`esbuild` had to be added to `pnpm-workspace.yaml allowBuilds`.)
> _Deferred fast-follow:_ pure money-math tests (`tax.ts`, `split-math.ts`); component tests (need jsdom +
> `@vitejs/plugin-react` + `@testing-library`).

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

## W22 — the second wave (2026-08-16/17): what actually got borrowed

The P5.x slices above transferred _discipline and primitives_. W22 (`docs/W22_DESIGN_PROPOSAL.md`)
transferred **look and ceremony** — still never a design-system import: every borrow was rebuilt on QR's
own `@mms/ui/tokens.css` (see "The one correction to make first").

| Ported (W22)                                                                                                                                    | Delivery source                                                                                                     | QR as-built                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Two-tier diffuse shadow — tight ambient + a **negative-spread** wide layer (a zero-spread wide layer reads as a hard square frame over a photo) | `docs/hero-design-language.md` (card-elevation gotcha)                                                              | `--sh-paper` / `--sh-paper-hover` in `packages/ui/src/tokens.css`, both themes; `.card` + `.surface-paper` wear it under the inset `--sheen` lip; `.card-interactive:hover` deepens through the hover token, never back to a flat shadow                                                                                 |
| The R1 texture kit, finally CONSUMED                                                                                                            | `Hero/HeroCardLayers.tsx`, `hero-dotgrid` / `hero-linegrid`                                                         | `.surface-vellum` on the ConfirmSwap decision card; `PaperAmbient` (fixed z:-1, gradient-masked hairline LINE grid + gold bloom + grain) behind every diner main; cards keep the DOTS via `.card-textured` — pages LINES, cards DOTS, never identical. The host must NOT isolate: the page ground moved to `<html>` only |
| Mobile GPU budget honored on the way in                                                                                                         | `hero-design-language.md` §7.1 (the iOS WebKit OOM incident)                                                        | frost is `md:`+ only (`.app-header` / `.menu-toolbar`); mobile stays opaque and blur-free; the ambient glow is a `radial-gradient`, never a `blur()`                                                                                                                                                                     |
| The thermal-receipt print reveal                                                                                                                | `src/components/ui/checkout/CheckoutSummaryV8.tsx`                                                                  | `.receipt-slip` / `.receipt-slip-clip` / `.receipt-tear` + `mmsPrintReveal` / `mmsPrintHead` (1.05s, identical curve) on the /track paid slip; the print-head is a SIBLING of the clipped element; totals presentation-only; reduced motion renders it at rest                                                           |
| The email shell                                                                                                                                 | `src/emails/components/{BrandHeader,BrandFooter,SupportSection}.tsx`                                                | `apps/qr/emails/MmsEmailLayout.tsx` — solid 3-cell triad bar (clients drop gradients), hosted true-PNG badge, "Mingalabar · မင်္ဂလာပါ" kicker, identity footer + socials, and a **per-template** `reason` prop; `apps/qr/lib/email.tsx` adds a plain-text part rendered from the same element + a real `replyTo`         |
| The email logo asset                                                                                                                            | `public/images/email-logo.png`                                                                                      | `apps/qr/public/email-logo.png` — copied byte-for-byte (md5-identical, true PNG 400×250). QR's own `logo.png` is WebP bytes behind a `.png` name: fine in a browser, undecodable in mail                                                                                                                                 |
| The identity constants                                                                                                                          | `src/lib/email/constants.ts` (`BUSINESS_ADDRESS`), `homepage/SiteFooter.tsx` (phone), email `BrandFooter` (socials) | `apps/qr/lib/brand.ts` — name · address · display/tel phone · email · Instagram/Facebook, every string verbatim. **No hours** (none exist in either repo, so none were invented)                                                                                                                                         |
| The support/contact block                                                                                                                       | `src/emails/components/SupportSection.tsx`                                                                          | the identity foot on the receipt artifact, the email footer, and the live-order page; `tel:` / `mailto:` padded to 44px with a matching negative margin so the fine print never inflates                                                                                                                                 |

**Deliberately NOT ported:** delivery's `RollingDigit` baseline-anchor fix — QR rolls money on
`@number-flow/react`, which owns its own baseline; that lesson applies to hand-rolled reels only. And
`HeroCardLayers.tsx` itself: the layers were rebuilt to QR tokens, never imported.

**Still deferred after W22:** the installed-native PWA pass + live order chip (W22b — see also P5.6), the
gesture layer / swipe-to-close on every sheet + a haptics vocabulary (W22c; P5.2's two-layer swipe fix
still waits on a `@mms/ui` Drawer), designed Night mode (W22d — note there are no contrast FIXTURES to recompute; the audit parses `tokens.css`. W22d-1 shipped the coverage gaps instead), honest
personalization (W22e), the opt-in sound identity (W22f). `@mms/ui` primitives still without a QR
consumer: **Drawer** and **Tooltip**.

## What stays delivery-only (explicitly out of scope)

Driver routing / offline driver queue, COD approval, multi-day delivery scheduling, bearing-based delivery
zones, Google Maps/Leaflet coverage maps, win-back/abandoned-cart crons, high-contrast "sunlight" mode (driver
need). The _underlying_ idempotency/offline-queue pattern is noted above only where a customer surface could reuse it.
