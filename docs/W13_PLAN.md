# W13_PLAN — The premium-feel slice (the add moment · line media · motion · bilingual)

**Status: SHIPPED (2026-08-14).** Owner directive: maximalist UI/UX production polish — "added to
cart visuals, cart items photos, micro-interactions, snappy smooth feels, back-forward steps,
bilingual touches." Design parents: `docs/context/RUBRIC.md` (axis #5 micro-interactions **names
the add moment verbatim**: "Add→stepper morph; number-roll total; haptic weight hierarchy; one
celebratory 'thunk'"), `docs/context/DESIGN-RESEARCH.md` §6 (the signature moments + "photos
sell ≈ +35% orders"), `docs/prototype/v7.2.html` (the toast spring, the cart-bar spring, the
micro-gem burst, the 50px cart-line thumb, the bilingual toast), `docs/MOTION_AND_PERF.md`
(the 8 binding rules).

## The audit (what the map found)

The morph, ripple, and money number-roll already meet the bar. The gaps, in rubric terms:

- **The toast hard-appears and hard-disappears** — the single highest-frequency moment in the
  app is the least animated thing in it (v7.2 springs it: `translate(-50%,30px)+fade → none`).
- **The cart bar hard-mounts** (`null → bar` at count 1) — v7.2 springs it up
  (`translateY(140%) → none`); its count is plain text (no capsule, no pop).
- **Haptics exist at exactly one site** (pay success) — the rubric demands a _hierarchy_
  (light stepper · medium add · success pay).
- **No burst** — v7.2 prescribes `microGems`: a 5-particle ✦/◆ burst at the Add control.
- **Cart/bill lines are text-only** — v7.2 prescribes a 50px thumb (`.crow .ph`) + a 44px
  receipt variant; `getCartView` returns no image field. Grocery basket rows don't even render
  the designed placeholder (`{imageUrl && …}` gates the whole slot away).
- **28/60 menu rows hotlink a generic `fallback.jpg`** instead of falling to the _designed_
  `PhotoPlaceholder`.
- **The stage/step flips are directionless** — `checkoutStepIn` always enters from the right,
  so "← Back to your order" _slides forward_. The J1 route layer already has directional
  drift CSS; the in-checkout steps never got it.
- **The entire post-add path is English-only** (`Checkout`, the toast) while `name_my`
  coverage is 100% on both catalogs and every pre-add surface renders it.

## W13·1 — the added-to-cart moment

- **Toast springs** (v7.2 `.toast` pattern): enter `translate(-50%, 12px) + fade → none` on the
  `--spring` curve, exit reversed; the single-slot machinery, placement, and one-live-region
  rule unchanged. Toast text gains a **per-glyph MY fallback** (`--font-body, --font-my`) and an
  optional `my` segment rendered as its own `lang="my"` span — the add toast becomes
  **"Added to your order · ထည့်ပြီးပါပြီ"**.
- **The cart bar springs up** on its first mount (`translateY(140%) → none`, `--spring`), and
  the item count becomes the v7.2 **capsule badge** with the keyed `.mms-pop` count bounce
  (NOT a live region — the RED-TEAM no-per-tap-announce rule).
- **Haptic hierarchy** (`lib/haptics.ts`): `hapticTap(8)` on quick-add + grocery add success,
  `hapticTap(12)` on sheet-add; the **synchronous `matchMedia` reduced-motion guard copied from
  `PaySuccess`** (the `useAnimationPreference` first-paint seed would buzz an RM user once) +
  try/catch (iOS Safari has no `vibrate`).
- **`MicroBurst`** — the v7.2 `microGems` moment as deterministic CSS spans (the Confetti
  idiom: token colors, no `Math.random`, transform/opacity only, own RM block, unmount on
  animationend): 5 ✦/◆ particles from the Add control on success. Wired on the menu
  `AddButton` morph and the ItemSheet add; the scan door keeps toast+haptic (no button to
  burst from mid-camera). One burst at a time; z-index 2 inside the `card-textured` stacking
  rule.

## W13·2 — photos + Burmese on the money path (one server-view change)

`getCartView` lines gain **`imageUrl: string | null` + `nameMy: string | null`**:

- The **menu half rides the existing `menu_items` availability query** (add
  `image_url,name_my` to that select — zero extra round trips); the **grocery half** is one
  `grocery_items.select("barcode,image_url,name_my").in("barcode", …)` over the non-uuid refs
  (the `uuidRe` partition already in `cart.ts`, the barcode-Map template from `grocery.ts`).
- **URL containment enforced in a shared pure helper** (`lib/media-url.ts`, unit-pinned
  red-first): relative or `https://*.supabase.co/` only — `next/image` **throws at render** on
  non-allowlisted hosts, and the CSP `img-src` mirror keeps the same boundary.
- **Checkout line cards get the v7.2 50px thumb** (BlurUpImage + `PhotoPlaceholder` fallback
  ALWAYS rendered), the **bill receipt rows a 40px variant**; both carry the **`name_my`
  subline** (`lang="my"`, `--font-my`) — the post-add path finally speaks both tongues.
- **Grocery basket rows** (page list + `GroceryBasketSheet`): the `{imageUrl && …}` gate
  inverts to always-render-with-placeholder.
- **`fallback.jpg` is filtered to null at the menu mapping** — the designed placeholder beats
  a generic stock photo (28/60 rows affected; W2a's real-photography bucket unblocks them).
- Money discipline: presentation-only read-shape addition — no charged amount, no mutation
  path touched; `CartItem` gains the two optional fields.

## W13·3 — directional steps + bilingual accents

- **Directional stage/step transitions**: the checkout's keyed step wrapper learns direction —
  forward flips (order→bill, review→pay) enter from the right as today; **back flips
  (bill→order, pay→review) enter from the left** (`checkoutStepBackIn`, mirrored keyframe, same
  RM block). Tracked by `stepDir` state written at each transition call — the J1 rule
  ("back slides back") finally applies inside `/cart`.
- **Bilingual accents** (the established `lang="my"` span idiom, casual-warm register):
  the two moment headings ("Your order · **သင့်အော်ဒါ**", "Your bill · **သင့်ဘောက်ချာ**"),
  the empty-cart subtitle, and the add toast (W13·1). `/track` bilingualization is deferred
  (registry note — the order snapshot carries no `name_my`; needs its own read change).

## Hardening + the rules that bind

- Every new keyframe with a hardcoded duration gets its **own RM block** (no global reset
  exists — the 48-block pattern); token-duration animations ride the token collapse.
- Transform/opacity only; **no `backdrop-filter`/large blur** (the iOS OOM rule); burst ≤5
  particles, one at a time (the animation-count rule).
- `view-transition-name` uniqueness untouched (no new `vt-*` consumers).
- No `.test.tsx` (M46): the pinnable rules live in `lib/` — `lib/media-url.ts`
  (containment) red-first; haptics/burst are effectful chrome, hand-verified.
- The count capsule + NumberFlow stay **non-live** (the no-per-tap-announce rule); the toast
  remains each view's one announcer.
- New cart-line mounts use `.mms-rise` (SurfaceMemory zeroes `.mms-stagger` on revisit).
- `sizes="50px"` thumbs; BlurUpImage's cache-hit guard untouched.

## Deliberately out (registry)

- Real photography + the QR-project bucket migration (W2a, owner-gated) — the thumb SLOT ships
  now, fed by whatever `image_url` holds; grocery stays placeholder-first until photos exist.
- The app-wide EN↔MY toggle + money-moment localization (W5 — its own milestone; W13 ships
  _accents_, not the toggle).
- `/track` line photos + Burmese (order snapshot carries neither — needs its own read change).
- A toast/notification stack primitive (QR_FROM_DELIVERY deferred item — the single-slot toast
  is a deliberate design, not a gap).

## Slices

- **W13·1** — toast spring + bilingual segment · cart-bar spring + count capsule · haptic
  hierarchy · MicroBurst.
- **W13·2** — `media-url` helper (red-first) · `getCartView` imageUrl/nameMy join · checkout +
  bill thumbs & MY sublines · grocery placeholder-always · `fallback.jpg` filter.
- **W13·3** — directional step transitions · heading/empty-state MY accents.
- **W13·4** — docs sweep · gates · ONE capped review · PR → auto-merge.
