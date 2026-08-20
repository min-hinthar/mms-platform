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

## W22a · Depth & ceremony — the Anthropic warm-paper pass ⭐ **SHIPPED 2026-08-16**

> As-built: `--sh-paper` two-tier shadows on every card + `.surface-paper`; `.surface-vellum`
> consumed (ConfirmSwap); md:+ chrome frost; `PaperAmbient` behind the diner mains; the
> thermal-print /track slip (clip + sibling print-head + torn foot, totals presentation-only);
> the send-to-kitchen paper beat. Digits needed no work — NumberFlow owns its baseline (the
> delivery lesson applies to hand-rolled reels). Details: CHANGELOG · DESIGN-LANGUAGE §1/§3.

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

## W22r · Documents — receipts, the receipt email, live tracking ⭐ **SHIPPED 2026-08-17**

> Owner-driven, outside the a→f sequence: _"Receipts, email templates, should be as detailed, styled
> per W22 designs, and polished as delivery app with restaurant logos, addresses, contact
> information, etc., live trackings should also be detailed, styled, and polished."_
>
> As-built: `apps/qr/lib/brand.ts` — the identity ONCE, verbatim from delivery's production
> constants, no invented hours; the receipt artifact as a complete business document (badge lockup,
> identity foot, destination group headings, per-line kitchen notes, pickup contact name); the email
> shell rebuilt to delivery's (hosted true-PNG badge, solid triad bar, bilingual kicker, identity
> footer + socials, a per-template reason line, a plain-text part + reply-to); and the /track slip
> itemized off ONE shared shape (`lib/track-order.ts`: one select + one mapper replacing three
> hand-copied ones) with REAL step timestamps only. No migration — every column already existed.
> Details: CHANGELOG · DESIGN-LANGUAGE §5/§8/§10 · QR_FROM_DELIVERY § "W22 — the second wave".

## W22b · Installed-native — PWA polish + the live order chip ⭐ **SHIPPED 2026-08-17**

> **Two claims in the original proposal were wrong, and are corrected here rather than quietly
> dropped.**
>
> 1. _"the real kitchen state (fired → cooking → ready)"_ — **there is no such state.**
>    `qr_orders.togo_status` is CHECK-constrained to `preparing | ready | picked_up`, and
>    `preparing` is stamped by the **Stripe webhook** (`mms_init_togo_status`) at PAYMENT, not by a
>    cook. `fired`/`in_progress` are LINE states on `qr_cart_items`, absent from `qr_order_items`,
>    and readable only while the table session holds. So the parenthetical described a three-stage
>    rail the data cannot source, and _"every value in it is already real (kitchen taps)"_ was
>    false for stage one — it is a payment event. The as-built chip speaks the vocabulary that was
>    already true (`liveOrderStatusWord`), and a genuine cooking stage is filed as its own slice.
> 2. _"follows the diner across menu/cart/track"_ cannot be literal. `.vt-order-status` is held by
>    the chip **and** by /track's status chip, and a duplicated `view-transition-name` makes the
>    browser skip the whole transition — the J1 morph would die app-wide, silently. The chip shows
>    on every diner route **except** the three that already own the affordance: `/` (the resume
>    card), `/track` (the tracker _is_ the chip) and `/account` ("Today"). That is the shipped
>    `track` flag, unchanged.
>
> As-built: the header pill became a **disclosure** — it expands in place inside `.app-header`
> (sticky, no `overflow`, so an absolute sibling is contained but unclipped and inherits the
> header's stacking context for free: no new z token, no offset var, no page-padding changes).
> Content is derived in `lib/live-order-panel.ts` — stored values only. The install half: `id`
> pinned, `scope`/`lang`/`dir`/`categories`, `launch_handler: navigate-existing`, the
> whole-origin `orientation` lock removed, real 192/512/maskable rasters generated from the one
> badge source, three-door shortcuts, and a precache trimmed 261.0KB → 93.1KB.
> Details: CHANGELOG · DESIGN-LANGUAGE §11.

**iOS splash + status bar were deliberately NOT shipped**, and not shipped partially. The chain is
broken at step one: Next 16.2.9 emits only `<meta name="mobile-web-app-capable">`, and iOS honours
`apple-touch-startup-image` only alongside the LEGACY `apple-mobile-web-app-capable` tag — so
`appleWebApp.statusBarStyle` is inert today, and adding startup images would emit links iOS
ignores while the CHANGELOG claimed a splash screen. Adding the legacy tag is trivial but makes
`statusBarStyle` live, and **neither value is theme-safe** against this app's two grounds:
`default` puts a white status bar over the Night `#171221`, and `black-translucent` forces white
text over the cream `#faf9f5` _and_ flips `env(safe-area-inset-top)` from ~0 to ~47–59px at 19
call sites at once. The red-first rule says that must be verified on a real notched device in both
themes, which a code-only PR cannot do. Filed as an OPEN-ITEMS row naming the prerequisite chain.

## W22c · The gesture layer — hands-first interactions ⭐ **SHIPPED 2026-08-20**

> **Three of the five parts listed below were already built, and this proposal is corrected here
> rather than quietly re-scoped.**
>
> 1. _"Swipe-to-close on every sheet"_ — **shipped at R5b.** `packages/ui/src/sheet.tsx` already
>    drags: handle-initiated `useDragControls` with `dragListener={false}`, so the sheet body keeps
>    its native scroll and only the grab zone starts a gesture. There is also **no `useSwipeToClose`
>    hook in this repo** — that is the delivery repo's name for the pattern, and `docs/HANDOFF.md`
>    had been pointing a future session at a seam that never existed here. Both claims are fixed.
> 2. _"iOS keyboard floors audited (16px inputs)"_ — **done earlier**, app-wide.
> 3. _"edge-consistency on back navigation"_ — **done earlier** too. What was missing on that axis
>    was narrower and is what actually shipped: `overscroll-behavior-x: contain` on the seven
>    horizontal rails, so a swipe running off the end of a rail stops there instead of triggering
>    the browser's back gesture. `-x` only, never the shorthand — the shorthand would also claim the
>    vertical axis and kill the pull-to-refresh this same slice adds.
> 4. _"today's 8/12ms taps codified: pick < commit < celebrate"_ — **three words were one too few.**
>    v7.2 designed THREE add-weights (6 stepper · 8 quick-add · 12 sheet-add), so the vocabulary
>    ships as four: `pick` 6 · `add` 8 · `commit` 12 · `celebrate` pattern. Collapsing quick-add and
>    sheet-add into one word would delete a designed distinction and re-create, one level up, the
>    exact ambiguity the vocabulary exists to remove.
>
> As-built: `lib/haptics.ts` — `haptic()` takes a MOMENT, not a duration, so a raw millisecond is a
> compile error and the old `hapticTap(ms)` is deleted rather than re-typed. That numeric API had let
> one weight mean two things and it did: **8ms was both a PICK and a COMMIT**. Reduced motion is read
> SYNCHRONOUSLY from `matchMedia` (never `useAnimationPreference` — it seeds `shouldAnimate = true`
> before its effect resolves, and a haptic is irreversible), and no moment may be the ONLY feedback
> for its event, because iOS Safari implements no `navigator.vibrate` at all. `lib/pull-refresh.ts` +
> `components/PullToRefresh.tsx` — the INDICATOR moves and the page never does (`/menu`'s `<main>`
> hosts two `position: fixed` descendants, and a `transform` on an ancestor would make it their
> containing block); the pull is the shortcut, and a real button beside it is the mechanism (WCAG
> 2.5.1). `lib/catalog-freshness.ts` decides what the refresh may SAY: freshness is proven by an RSC
> render stamp captured at FIRE time rather than inferred, a landed render and a succeeded read are
> two separate flags (`{ advanced, trusted }` — the adversarial round found the wiring conflating
> them, so a stale render was certified as verified), a failed read is `unverified` and never a
> sold-out restaurant, price movement is a COUNT and never a delta, and nothing ever "just" sold out.
> Plus the `RefundActionSheet` → canonical `Sheet` migration its own comment had been asking for
> since P1-5. Details: CHANGELOG · ROADMAP · DESIGN-LANGUAGE §12.

- Effort: S–M. Risk: low (framer drag ⇒ mind the bundle; delivery's domMax lessons apply).
- Impact: the "feels lagged" class of complaint never comes back.

## W22d · Night, designed — the candlelit teahouse

> **⭐ HUE DIRECTION DECIDED 2026-08-20 — see [`docs/W22D_HUE_DECISION.md`](W22D_HUE_DECISION.md).**
> Owner: _"brand logo maroon hue theme for light mode and slightly-purple-aubergine-hue theme for
> dark mode."_ **"Deeper espresso ground" below is superseded and retired.** Light rotates out of
> amber into the brand red; dark stays at its current hue 260° and goes ~+10–25° more purple. Build
> deferred. The note carries the measured blast radius (308 accent call sites in light, ~10 tokens in
> dark), the guard rewrite the light half requires first, and the open owner questions.

Dark mode graduates from inverted tokens to a designed theme: a deeper ground, gold used even more
sparingly (glow economy — selection only), and photo treatment tuned for dark (slight warmth lift).

> **Two claims here were wrong, and are corrected in place rather than quietly re-scoped.**
>
> 1. _"the contrast fixtures recomputed. The delivery repo's dark-lift audit pattern
>    (hardcoded-fixture contrast tests) comes with it."_ — **that port already happened, at M5·P5.5,
>    and it was improved on the way.** `packages/ui/src/__tests__/contrast-audit.test.ts` reads the
>    real `tokens.css` off disk and parses it, resolving `var()` aliases; there are **no hex fixtures
>    to recompute**. Porting delivery's version now would be a regression — it hardcodes 14 hex
>    constants and has already drifted inside its own file. What W22d actually owes the audit is
>    COVERAGE, not fixtures (see W22d-1 below).
> 2. _"deeper **espresso** ground"_ — shipped Night is **aubergine/indigo** (hue ~260°), not brown.
>    Espresso is a hue rotation, not a deepening, and it would move `--grad`, every purple-tinted
>    composite and the seat-avatar hues with it. Which direction to take is an open owner decision;
>    the word "espresso" should not smuggle it in.

### W22d-1 · The Night correctness floor ⭐ **SHIPPED 2026-08-20**

> Split out and shipped first, because the redesign would have HIDDEN the bug it found. Dark mode was
> already failing AA: `--ruby-strong` aliased `--ruby`, under a comment asserting it cleared, and
> scored 4.47 / 4.32 / 4.23 as text on its own tint across the rewards surfaces. Deepening the ground
> raises every dark ratio — so had the palette landed first, the guard would have been born green and
> the defect would have survived on every surface that is not `--cd`. Guard first, at 4.47.
>
> Also: the audit gained the tier tints, the wallet chip's oklab-over-opaque blend (rest AND hover),
> `t3 on surface-elevated` and an `--ac2` negative guard; the badge tint percentages are now PARSED
> out of `badge.tsx` instead of transcribed; and `scripts/check-theme-parity.mjs` pins the hex that
> escapes the token system entirely — the service worker's offline shell and `viewport.themeColor`,
> both of which ship before any stylesheet exists. Two of those had already drifted.

- Effort: S–M. Risk: low. Impact: half of real usage is evenings.

## W22e · Personal continuity — "your usual," honestly

The arrival beat grows one data-backed card: **"Your usual? ✦ Mohinga + Tea — add both"** built
strictly from the diner's own paid-order history (≥2 occurrences, same honesty bar as the rank
seals), one tap to re-add. The taste picker starts learning from actual orders (still only
declared tags/categories — never an invented affinity). First-timers keep Start-here; regulars
get recognition.

- Effort: M. Risk: low (reads existing RLS-scoped history). Impact: the return-visit wow.

## W22f · A sound identity (opt-in, off by default) ⭐ **SHIPPED 2026-08-20**

> As-built: `lib/chime.ts` (pure policy — the two moments, the level, and the rule that there is
> no error sound; six mutants) + `lib/diner-sound.ts` (the WebAudio engine, `kds-sound.ts`'s
> mallet envelope) + a `role="switch"` on `/account`. Details: CHANGELOG · DESIGN-LANGUAGE §7.

A two-note "service bell" on send-to-kitchen and a soft chime on pay success — the sonic version
of the gold cap. Strictly opt-in, silent by default, never on error paths.

**Two corrections the build forced, recorded rather than quietly re-scoped:**

1. **There is no "toggle beside reduced motion" to sit beside.** This proposal assumed a diner-facing
   motion setting; there is none, and there should not be one — reduced motion is honored from the OS
   media query alone (`MotionConfig reducedMotion="user"` plus explicit `shouldAnimate` gates), which
   is the accessible behaviour. Inventing a second, app-local motion switch to give the sound toggle a
   neighbour would have been a worse outcome than moving it. It lives on `/account`, the one surface
   already the diner's own.
2. **The toggle tap IS the arming gesture.** Browsers create an AudioContext `suspended` and resume it
   only from a real interaction (strictly, on iOS). The KDS gets an explicit "Enable sound" tap at
   shift start; a diner never does. So the switch arms inside its own handler and reports ON only if
   audio is genuinely usable afterwards — a switch reading "on" while the device refused the context
   would be promising a sound that cannot happen.

- Effort: S. Risk: none if default-off. Impact: delight for the diners who turn it on.

---

## Sequencing & the bar

`W22a → W22b → W22c` is the recommended order (each rides the previous); **a, b and c are
shipped**, as are **e and f**; **d** (the hue re-theme) is owner-blocked on the maroon/aubergine
decision recorded in `docs/W22D_HUE_DECISION.md` — its correctness floor (W22d-1) shipped ahead of it. Every slice holds the standing gates: tokens only, RM-escorted motion, one live
region, 44px, data-backed claims, server-authoritative money, `verify:slice` + `check:docs` +
the two-reviewer pre-merge pass (in-session adversarial + Codex), K15 for any new MY.
