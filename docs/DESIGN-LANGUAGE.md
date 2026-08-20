# MMS QR — Design Language (distilled M1 → W22)

The QR app's accumulated design doctrine — what M1…M4 and W13…W22 proved out, written down so the
next surface starts from it instead of rediscovering it. Sibling to the research context
(`docs/context/DESIGN-RESEARCH.md`, the v7.2 prototype, `RUBRIC.md` ≥4.3); this file is the
**as-built** language. The delivery repo's `docs/hero-design-language.md` is the cousin standard —
M5's thesis is that QR _learns from_ delivery, and W22 is where the borrowing actually landed:
W22a·depth took the texture/shadow kit and the print ceremony, W22r the receipt-as-document and
email-shell patterns (`docs/QR_FROM_DELIVERY.md` § "W22 — the second wave").

## 1 · Aesthetic — warm editorial paper

Cream card surfaces on a softly graded ground; **gold is the color of selection and favor**, the
accent (crimson→pink in dark "Night") is the color of action. Display serif for hero figures (the
Bill total, headings), UI sans for controls, **Padauk** for Burmese — always. Light = editorial
daylight; dark = Night. Tokens only (`@mms/ui/tokens.css`) — a hardcoded color is a bug, and
`contrast-audit`-style checks treat token changes as API changes.

**Depth (W22a·depth, as-built):** every `.card` is gently-lifted warm paper — inset `--sheen` lip
over the two-tier `--sh-paper` (tight ambient + negative-spread wide diffuse; a zero-spread wide
layer reads as a hard square frame; hover deepens through `--sh-paper-hover`, never back to a
flat shadow). Diner mains sit on the `PaperAmbient` — a gradient-masked hairline grid + gold
bloom + grain, fixed at z:-1 with **no host isolation**: the page ground lives on `<html>` ONLY
(the canvas paints below negative-z content), because an `isolation:isolate` host traps its own
fixed overlays — tier-up scrims, toasts, confetti — beneath the app header (the #195 review
lesson; never reintroduce a body background or an isolate host for this layer). Never full-bleed
uniform; the fade means opaque sticky chrome never hard-cuts it. Pages carry LINES, cards carry
DOTS (`.card-textured`) — the two textures never read identical. Surface tiers: `.surface-vellum`
(the warm wash) marks moments of consideration (ConfirmSwap); glass frost is md:+ only, on the
sticky chrome. Mobile stays opaque and blur-free — the GPU budget is a hard limit.

## 2 · The selection vocabulary — one language, every surface

A selected thing wears the **lit gold cap**: gradient fill + `--oa` ink + inner sheen + a soft
`--glow-gold` halo (`.checkout-pill-on`, `.checkout-tip-on`, `.slot-time-on`, `.taste-chip-on`,
`.slot-day-on`, the `#1` rank seal). Idle candidates are **vellum ghosts** — warm translucent
fill, gold hairline. Two hard rules learned the expensive way:

- **Self-contained active state.** Background and label live on ONE element — never a separately
  measured/positioned indicator supplying the contrast behind selected text (the recurring
  dark-on-dark active-tab bug, root-caused in the delivery repo and honored here).
- **The mode pills, tip chips, day cards, taste chips and rank seals may never drift apart.**
  New selectable surfaces adopt the existing classes or extend them in `globals.css` beside them.

## 3 · Motion idioms — small, meaningful, always escorted

| Idiom                     | Meaning                             | Where                                |
| ------------------------- | ----------------------------------- | ------------------------------------ |
| `.mms-pop`                | a VALUE changed under you           | tip previews, cart count capsule     |
| `.mms-rise`               | something ARRIVED                   | tip reactions, notices, scanned rows |
| `.mms-stagger`            | a once-per-session premiere         | arrival beat, Start-here band        |
| press glow + sheen sweep  | you COMMITTED                       | Pay CTA, ConfirmSwap proceed         |
| `--tip-heat` ladder       | encouragement as gradient, not nag  | tip chips warm 15%→30%               |
| NumberFlow rolls          | money settles like an odometer      | Bill hero total                      |
| `MarqueeRail` drift       | an ambient conveyor, never a hijack | Start-here twin rows (W22)           |
| thermal print reveal      | the moment becomes an ARTIFACT      | /track paid slip (W22a·depth)        |
| `.mms-send-beat` + settle | the order visibly LEAVES the table  | send-to-kitchen success              |

Rules: transform/opacity only (60 fps); **every** new animation/transition joins a
`prefers-reduced-motion` block the moment it's written; entrance effects premiere once per session
(SurfaceMemory) — arrival is a moment, not a loop; the haptic weights the **gesture**, not the
network (buzz on tap, never after the round trip). Ambient AUTO-motion (the W22 drift) adds three
more: it rides the native scroller (manual input always wins and pauses it), it ships a visible
pause control (WCAG 2.2.2 — hover luck is not a stop mechanism), and reduced-motion gets the
static surface exactly, duplicate DOM included (no loop set at all).

## 4 · The optimistic doctrine (W20–W21) — instant, serialized, honest

The owner's standing directive: _"make optimistic and instant feedback, instead of checking with
server database first."_ The doctrine that survived two adversarial reviews and two Codex rounds:

1. **Flip the UI the instant of the tap.** The write runs in the background.
2. **Serialize the writes** (a promise chain): commit order = issue order, so the last ok write IS
   the server's state. Two independent serverless fetches otherwise commit in arbitrary order.
3. **Token-gate the OUTCOME, not the record.** Only the latest write's outcome may touch the UI —
   but EVERY successful write updates the locally-held **confirmed value**.
4. **Revert to CONFIRMED, re-read as belt.** On refusal: snap to the last value the server is
   known to hold (works with a dead radio), then fire the authoritative re-read. Never restore a
   captured `prev` — mid-burst, `prev` is the previous _guess_.
5. **Drain before charging.** Anything that mints money awaits the pending chains first
   (`settled()` before navigating to /cart; `writesRef` before create-intent) — a lock acquired
   under an in-flight write silently refuses it and charges the stale state.
6. **Amounts are never optimistic.** Counts, pills, chips flip instantly; a dollar figure waits
   for the server. A wrong-for-a-moment subtotal on a money surface is worse than a beat's latency.

## 5 · Honesty — the claim must be data-backed, the promise must be kept

- **Rank seals only when real paid-order counts curated the rail**, tie-aware
  (`competitionRanks` — tied dishes share a numeral; a sold-out #2 never promotes #3).
- **Recommendation cards SAY the literal rule they matched** ("🍛 Rich curries"), and chip names
  state their rules ("Salads & veggies", not "Fresh & light" over a fritter). `vegan-optional` is
  NOT plant-based — the fail-safe dietary rule owns that call everywhere.
- **Surprise picks are framed as "How about this?"** — never as a data-backed match.
- No fabricated ETAs, counts, averages, or per-head splits; a value that cannot be attributed is
  reported as unattributable (`/staff/tips`' shared bucket).
- **Copy promises only what the code keeps**: "we'll call your name" only where a caller exists;
  the pickup phone was not _required_ until a staff surface could read it; "Sales tax (10.5%)"
  is computed from `taxRate()`, never typed.
- Empty states answer honestly and point somewhere useful ("try **different** cravings" — the
  matching is OR; "fewer" could only shrink the answer).
- **Only real clocks on a status rail (W22r).** The /track steps print `created_at` and the expo's
  `togo_ready_at` / `togo_picked_up_at`, and only once the step is reached — "In the kitchen" stays
  deliberately BARE, because no honest cooking-start timestamp exists (the fulfillment webhook's
  insert is not one). A plausible time is still a fabricated one.
- **Identity is copied, never composed (W22r).** Every string in `apps/qr/lib/brand.ts` is verbatim
  from the delivery repo's production constants. There are NO business hours anywhere in either
  repo, so the receipts and emails offer none — inventing "Open 11–9" would read exactly like a
  promise the owner made.

## 6 · Bilingual — one surface, two tongues

EN is the primary voice, Burmese the Padauk accent **on the same surface** — no toggle, no locale
state. `lang="my"` on every MY span (SR pronunciation); ≥13px floor for stacked diacritics; the
gap between tongues is a **margin, never a whitespace text node** (flex containers drop
whitespace-only children — the "Sales tax(10.5%)" bug, twice). Guest-facing register is spoken
and warm (တယ်/မယ်/နော်); kitchen is **မီးဖိုချောင်** (owner-corrected, W21). Every Claude-authored MY
string joins the K15 native-check ledger the day it ships.

## 7 · a11y — the floor, not the ceiling

≥44px touch targets; **one live region per view** (new features route through it, never mount a
second); focus moves on remove/route/step change — and lands on **the user's own selection**, not
the app's default (the slot sheet focuses _your_ chip, not Soonest); toggles are `aria-pressed`;
decorative seals/emoji are `aria-hidden` with an sr-only twin saying it in words; controls stay
rendered-and-disabled with a reason, never vanish.

## 8 · Money surfaces — receipt language

Server-authoritative always (the client sends ids and rates, never amounts). Name a money value
**once** and derive every reader from it. The Bill speaks receipt: dotted leaders, destination
groups ("At your table / To-go / Grocery" — headings only when the basket spans 2+), the tax rate
named beside its amount, the hero total in display serif rolling on NumberFlow. The pay step is
never totals-only — the diner itemizes what the card is about to buy, bound to the **locked**
cart's lines.

**Receipt detail (W22r, as-built).** THREE surfaces render the same receipt — the /track slip, the
session-less `?r=` artifact, and the emailed copy — and all three derive from ONE pure module
(`apps/qr/lib/receipt-view.ts`: `buildReceiptRows` · `groupReceiptLines` · `fulfillmentLabel` ·
`tenderLabel` · `receiptStatusLabel` · `SERVICE_CHARGE_DISCLOSURE`), so they cannot disagree. The
rules that module owns: every figure is the **fulfillment-time snapshot rendered verbatim** —
nothing on a receipt recomputes, and tax stays ONE order-level row (M7); rows are **zero-gated**
(discount / service / tax / tip appear only when charged); a **refunded** order keeps its receipt
but is stamped "Refunded — this charge was returned to you", never "Paid in full"; the tender is
NAMED ("Card · reader" is not online card); and the **SB-1524 disclosure rides the fee wherever it
shows**, including a pre-2026-08-15 order reopened on the tracker — the charge is retired, the
historical row is not. Line order is the deterministic `id` sort in `apps/qr/lib/track-order.ts`
(PostgREST gives an embedded relation none), so the live slip lists the same lines in the same
order as the durable page. A receipt is a **document**, so it carries what a document carries: the
badge lockup, the pickup contact name, per-line kitchen notes (the item sheet promised the kitchen
would see them — this is the paper proof), and the identity foot (§10). It also has to survive the
printer: `@media print` re-pins the light tokens on `html.dark` (the live tokens never
re-evaluate for paper), flattens `.receipt-artifact` to plain paper, and hides `.paper-ambient`.

## 9 · Voice — a warm host, never a nag

Declining is never met with a reaction ("None" sits last and quiet; no guilt line). Generosity is
met warmly and proportionally (`tipReaction` climbs the ladder). Encouragement is a gradient
(`--tip-heat`), not a modal. Exits are named and honest ("Back to the start keeps your table ·
Leave this table lets this phone go — the table stays open for everyone else"). Every mode has a
door out; leaving is a navigation, never a server mutation.

## 10 · Identity + the surfaces that leave the app (W22r)

`apps/qr/lib/brand.ts` is the restaurant's identity, ONCE: `BRAND_NAME`, `BRAND_ADDRESS` ("750
Terrado Plaza, Suite 33, Covina, CA 91723"), `BRAND_PHONE_DISPLAY` / `BRAND_PHONE_TEL`,
`BRAND_EMAIL`, `BRAND_INSTAGRAM` / `BRAND_FACEBOOK` — every string verbatim from the delivery repo's
production constants, no hours (§5). It is the single source **going forward**; surfaces adopt it as
they're touched, and two literals are still outstanding (`PickupSlotSheet`'s abbreviated address,
the tracker's help-line phone). The **identity block** — name · street address · tel · mailto —
rides the receipt foot, the email footer, and the live-order page, because a diner mid-order is
exactly who wants the phone number without hunting for it. Its `tel:` / `mailto:` links reach 44px
via padding plus a matching negative margin, so the fine-print line box never inflates and print is
unchanged.

**Email is the one surface with no tokens** — clients strip external CSS and custom properties, so
the literal light-palette hex in `apps/qr/emails/` is the sanctioned exception. The shell
(`MmsEmailLayout`) carries four rules learned from the delivery app's production templates:

- **No gradients.** Clients drop them. The triad is THREE solid table cells (`#e8a83c` / `#a65f10`
  / `#1b1714`), never a `linear-gradient`.
- **A hosted, genuinely decodable badge.** `apps/qr/public/email-logo.png` is a true PNG (400×250,
  byte-identical to the delivery repo's), served absolute via `siteUrl()`. The app's own `logo.png`
  is **WebP bytes behind a `.png` name** — fine in a browser, undecodable in mail. On screen and in
  print the app logo is still the right asset; only the email needs the true PNG.
- **The reason line is PER TEMPLATE.** A shared receipt-flavored default told staff sign-in and
  invite recipients they'd asked for a receipt — so `reason` is a prop each template supplies, and
  omitting it renders no line at all rather than a house guess.
- **A plain-text part rendered from the SAME element** (`render(element, { plainText: true })`) plus
  a `replyTo` that lands in the owner's real inbox — one element, two parts, no way to drift.

The kicker is bilingual on the one surface, verbatim from the delivery shell (owner-run, so it does
not need a K15 entry): "Mingalabar · မင်္ဂလာပါ" (§6).

## 11 · Installed-native — the chip and the install (W22b)

**The live order chip is a DISCLOSURE inside the header, not a floating island.** `.app-header` is
`position: sticky` with no `overflow`, so an absolutely-positioned sibling is _contained but
unclipped_: it inherits the header's stacking context and lands above every page surface and below
any sheet scrim, for free. That single placement decision is why the chip needed no new z token, no
published height variable, no `--chrome-top` offset, no page-padding change on six routes, and no
exposure to the PaperAmbient no-isolation rule. **Before adding a new floating layer to this app,
check whether an existing sticky ancestor can contain it** — the bottom edge is already four bands
deep (CartBar · grocery CTA · offline pill · toasts) and the top edge three.

- **Disclosure, not dialog.** `aria-expanded` + an `aria-controls` that is only present while the
  panel is mounted (no dangling IDREF). `aria-haspopup="dialog"` stays reserved for the ≥2-order
  tray, so that vocabulary keeps meaning "there is more than one order".
- **Esc closes and restores focus to the trigger; an outside pointerdown closes and does NOT move
  focus** (a tap elsewhere is not a request to be sent back to the header).
- **A route change closes the panel at RENDER time, not in an effect.** The header is snapshotted
  as an image during a J1 view transition — a panel caught mid-navigation is baked into that
  snapshot.
- **A control can vanish under its own open panel.** The order retires the moment it reads
  terminal, so the chip can leave the DOM with focus inside it. Two problems, two places: fold the
  state at render, and re-park focus in an effect, because a restore to a removed node silently
  falls to `<body>` and strands a keyboard user with nothing announced.
- **Open wears the lit-gold cap; a STATUS never does.** "Ready" keeps its own `--ok` recipe. The
  gold cap is the selection vocabulary — extend it, never hand it to a state the diner didn't choose.
- **Ambient chrome is not a live region.** Kitchen transitions are ambient state, every diner route
  already owns its one announcer, and this is chrome mounted once in the root layout — an
  `aria-live` here would be the second announcer on every screen. Same rule as `TableTimeline`,
  `LendModeBanner` and the offline pill; put the reason in the component header so the next
  reviewer doesn't "fix" it.

**What an ambient order surface may say.** Stored values only, derived in `lib/live-order-panel.ts`
rather than in the component (there is no React test runner here — a rule in a `.tsx` cannot be
guarded at all). Real expo timestamps, the diner's own pickup slot as an ABSOLUTE time, the
fulfillment-time total rendered verbatim. **Never** an ETA, an elapsed cook time, a queue position,
a stage counter, or a staff name. **"In the kitchen" gets no clock** — `togo_status='preparing'` is
stamped by the Stripe webhook at payment, so using it as a cook-start would be a fabricated time
wearing a real column's clothes. A capped countdown belongs to exactly one surface (/track, which
owns the tick and the ±caps); a second copy is a second thing to keep true.

**The install.** `id` is pinned to `start_url` — without it a PWA's identity is _derived_ from
start_url, so any later move mints a second home-screen icon for everyone already installed, with
no way to merge them. `scope` is the whole origin deliberately: narrowing it would kick `/staff`,
`/kiosk` and `/board` out to the browser. `orientation` is deliberately **unset** — a lock applies
to the whole scope, including the landscape wall display. Icons descend from ONE badge source via
`scripts/gen-pwa-icons.mjs`; `public/logo.png` is WebP bytes behind a `.png` name and must never be
that source, which is what `app/manifest.test.ts`'s magic-byte assertion exists to prevent.

**Two accepted limitations, documented so they are not "fixed" into something worse:**

1. **The Android launcher splash cannot be theme-aware.** `background_color` is a single value, so
   a Night-mode install flashes cream before the app paints. Hardcoding the dark ground just moves
   the seam onto every light install, which is the larger population. The address/status bar is
   already correct via `viewport.themeColor`'s media pair.
2. **iOS splash + status bar are inert and deliberately untouched.** Next emits only
   `mobile-web-app-capable`, and iOS honours `apple-touch-startup-image` only alongside the legacy
   tag — so `statusBarStyle` does nothing today. Adding the legacy tag makes it live, and neither
   value is safe against two grounds (`default` = white bar over Night; `black-translucent` = white
   text over cream **and** flips `env(safe-area-inset-top)` at 19 call sites at once). That needs a
   real notched device in both themes, per the red-first rule. Registry: **M62**.

## 12 · Hands — gestures, haptics, and what a refresh may claim (W22c)

**Haptics are a vocabulary, not a number.** `haptic(moment)` takes one of four names —
`pick` (6ms, a reversible adjustment: a stepper step, a modifier option) · `add` (8ms, one tap put
an item in the basket) · `commit` (12ms, a configured dish entered the basket from a sheet) ·
`celebrate` (a pattern; money moved, exactly one caller). The old `hapticTap(ms)` is deleted rather
than re-typed, because the numeric API let one weight mean two things and it did: **8ms was both a
PICK and a COMMIT**, so a thumb heard "you chose something" and "you bought something" in identical
language. Taking a moment instead of a duration makes a raw millisecond a compile error.

- **Reduced motion is read synchronously from `matchMedia`**, inside `haptic()` — never via
  `useAnimationPreference`, which seeds `shouldAnimate = true` before its effect resolves (SSR-safe
  by design). A haptic is irreversible: an RM user would be buzzed once per first tap, every session.
- **A haptic may never be the only feedback for an event.** iOS Safari implements no
  `navigator.vibrate` at all, so on this app's most common device every one of these is a silent
  no-op. Each moment ships with its visible half — the stepper digit, the cart-count capsule, the
  sheet closing, the confetti. A new moment brings its own.
- **Adding a fifth name is a design decision, not a plumbing one.** Four exist because v7.2 designed
  three add-weights; a fifth needs a distinction a diner can feel and a visible partner.

**A gesture may never be the ONLY way to reach a function** (WCAG 2.5.1 Pointer Gestures, 2.1.1
Keyboard). A path-based drag is unreachable by keyboard, by switch access, and — because VoiceOver
claims single-finger drags for explore-by-touch — under a screen reader. Ship the real control and
let the gesture be the shortcut. "The browser can reload" is not the alternative when the whole point
of the in-place refetch is that a reload throws state away.

**Ambient work stays silent unless it has news; a gesture is a question and is always owed an
answer.** `announce` is a single-slot **visible** toast, so anything it says replaces whatever the
diner was reading — an unrequested "Menu is up to date." on every app switch overwrites the "Added
Mohinga" confirmation of the thing they just tapped. Wake re-reads inherit the J3 pattern, which
re-fetches _without speaking_; if a new surface makes an ambient path talk, that is the bug.

**Never suppress a retry because the last attempt failed.** The first draft disabled the whole
pull-to-refresh while the catalog was stale, reasoning that "pulling toward a read we know is failing
would promise a freshness the strip has just denied." That is backwards: a stale flag says the LAST
read failed, not that the next one will — and with the wake path suppressed too, one blip stranded
the diner on the last-good copy with no path back short of a hard reload, the one action that throws
the last-good copy away. Honesty about a failing read belongs in the SENTENCE, never in removing the
retry.

**Gestures may not move a page that hosts fixed children.** Pull-to-refresh translates the
INDICATOR only. `/menu`'s `<main>` hosts `PaperAmbient` and `CartBar`, both `position: fixed`, and a
`transform` on an ancestor becomes their containing block — so pulling the page would drag the
primary CTA off the bottom of the screen and crop the ambient. Same family as W22a·depth's
`isolation: isolate` rule on `PaperAmbient`'s host: **a page-level visual property is a contract with
every fixed descendant.** The rubber band is asymptotic (never "the page tore off") and arms at the
curve's own midpoint — computed, because a threshold a diner trips by accident on a long menu is
worse than no gesture at all.

**`overscroll-behavior-x: contain` on every horizontal rail, and `-x` only — never the shorthand.**
The shorthand claims the vertical axis too, which would kill the pull-to-refresh on the same screen.
The corollary is that a vertical gesture on a page with horizontal rails **must test axis dominance
before it calls `preventDefault`**: that call cancels the browser's scroll for the touch on BOTH
axes, and a thumb arc across a rail drifts 10–30px vertically (far more with tremor or limited
dexterity), so without the test the rail simply does not move. Hand the gesture back, too, the moment
`e.cancelable` goes false — the compositor already owns that pan, and running alongside it gives one
drag two responses.

**What a refresh may SAY is a three-state union, and the third state is load-bearing.**
`router.refresh()` returns `void` and cannot report failure, so freshness has to be **proven** by the
caller (a render stamp that changed), never inferred from the data that came back. Rules, all in
`lib/catalog-freshness.ts` so they can carry mutants:

- **A RENDER THAT LANDED IS NOT A READ THAT SUCCEEDED**, and they are two flags, not one. `/menu`
  serves a last-good catalog when the live read fails (W10a) — and that stale render still advances
  the stamp, so a single "did it land?" flag certifies a render where the database was never reached.
  Two false claims came out of conflating them: the DegradedStrip and "Menu is up to date." on screen
  together, and — because `readLastGoodCatalog` is per-INSTANCE module state bounded by traffic, not
  a TTL — a refresh landing on another warm instance serving an **older** cache and diffing it into
  "Mohinga is back on." about a dish that is still 86'd.
- **A render stamp used as proof must be captured when the work STARTS, not held in a long-lived
  baseline.** Any `router.refresh()` on the route advances the props' stamp, and there is one in the
  root layout (`AnonAuthGate`, on every cold QR scan) that no feature component knows about. Compare
  against the value observed at fire time, or the next unrelated refresh somebody adds silently
  becomes your evidence.
- **Never adopt a snapshot you just refused to trust.** Declining to _speak_ from an unverified
  snapshot while still _remembering_ it makes the untrusted rows the reference for the next
  comparison — so the real change that lands afterwards is measured against a cache and reported
  once, or lost.
- **A failed read is `unverified`, never a sold-out restaurant.** An empty snapshot diffed against a
  full one makes every dish read as newly 86'd — the app would announce to every diner in the room at
  once that the whole kitchen had run out. The delivery repo's "a failure must never read as empty",
  at a new boundary.
- **Never collapse `unverified` into `unchanged`.** "We couldn't check" and "nothing changed" produce
  the same screen and are different sentences; only one of them is true when the wifi drops.
- **Price movement is a COUNT, never a delta.** W17b ships a live staff price editor, so prices
  really do move mid-service — but the server owns the number, and a client-stated "+$1.00" starts an
  argument the client cannot win.
- **Nothing ever "just" sold out.** `sold_out_at` is not in the menu page's select, so recency is not
  a fact this module holds. "now" is true relative to what the diner was looking at; "just" is not.
- The sentence is spoken into the view's **existing** live region. A gesture does not mint a second
  announcer (§7).

## 13 · Night — what the contrast audit does and does not prove (W22d-1)

`packages/ui/src/__tests__/contrast-audit.test.ts` **parses `tokens.css` at test time** and resolves
`var()` aliases, so a token edit is checked automatically and there are no hex fixtures to refresh.
That is real rigour, and it is exactly why the next rule is easy to forget:

- **A green audit proves the combos it DEFINES, not the palette.** Dark `--ruby-strong` aliased
  `--ruby` and scored 4.47 / 4.32 / 4.23 as text on its own tint for as long as the tier UI existed,
  with the suite fully green — because ruby was never in the matrix. **Adding a hue to `tokens.css`
  is not done until the combo is in the audit.** The tokens are derived; the list of what to check
  is still hand-written, and that list is the actual coverage.
- **`color-mix(… , transparent)` and `color-mix(… , <opaque>)` are different blends.** Mixing with
  `transparent` is premultiplied, so the interpolation space cancels and sRGB alpha compositing gives
  the identical answer — which is why the tint recipes can be modelled with a simple alpha flatten.
  Mixing against an opaque colour genuinely interpolates in OKLab and lands somewhere else. The
  tightest real failure in the app lived in that second form, unmodelled.
- **Check the state that reduces contrast, not just the resting one.** The wallet chip's hover raises
  its tint from 12% to 18%; rest passed at 4.70 and hover failed at 4.23. A guard that only sees the
  default state is half a guard.
- **Fix the TEXT variant, not the hue.** `--ruby` paints the dot, glyph and border, where it is fine.
  Only `-strong` is rendered as text, so only `-strong` moves — the smallest lift that clears, same
  OKLab hue and chroma, searched numerically. A hue nudged by eye to pass a ratio changes the design.
- **Order matters: fix the floor BEFORE deepening the ground.** A darker ground raises every dark
  ratio. Land the palette first and a contrast guard written afterwards is born green — the bug is
  never learned, and it stays live on every surface the new ground does not cover.

**Some hex cannot be a token, and that is where drift hides.** The service worker's offline shell is
a string baked into `sw.ts` and ships before any stylesheet exists; `viewport.themeColor` is consumed
by browser chrome before first paint. Neither can read a custom property, so both carry hand-copied
values, and the only way to SEE a mismatch is to go offline, or to look at the address bar, in both
themes. Two had already drifted. `scripts/check-theme-parity.mjs` pins them; add a row to it rather
than a comment when the next one appears.

**A theme-aware function needs theme-aware fallbacks.** `stripeAppearance` branched correctly on
`.dark` while every fallback stayed light — and those fallbacks are not decorative: a custom property
read before the stylesheet applies returns `""`, so a cold load on a slow connection painted the
light palette into an iframe Stripe was rendering as `night`.

**An `!important` on an ancestor does not reach an inline style on a descendant.** The print block's
`.receipt-artifact { color: … !important }` could not override `ReceiptCard`'s inline
`color: var(--warn)`, so printing from Night put a dark-ground orange onto forced white. Re-pin every
token reachable from inside a print artifact, not just the ones set on its own node.

**A surface that cannot read a token must still NAME the tokens it means.** Six surfaces in this app
resolve no custom property — the offline shell, `viewport.themeColor`, the print re-pin, Stripe's
appearance fallbacks, the Satori OpenGraph card, and the emails — so each one bakes literals. The
literal is not the problem; the missing link back is. Put the values in ONE table where each entry
names the token it mirrors, pin that table to `tokens.css` in a guard, and **refuse a raw colour
anywhere else on the surface** — a guard on the table alone passes happily on files that never use
it. Where the value is a composite (an alpha border flattened for clients that drop rgba),
**recompute it** in the guard rather than storing the answer, so it tracks a change in either half.

**The source is not the artifact.** Pinning the table proves what the templates _say_; only rendering
proves what a person _receives_. An email's `<Hr>` inherited a library default as a **shorthand**
(`border-top: 1px solid #eaeaea`) that the override merged beside rather than replaced — correct in a
browser, off-palette in the output, and invisible to every guard that reads source. Render the thing
and scan the output, but scan it where colours actually live: whole-document greps flag spacing
entities (`&#8202;`) and any four-hex-digit order reference as rogue colours.

**Assert a surface in the theme it actually ships.** The emails bake light values and declare
`color-scheme: light`; running their pairs against the dark map would be a claim about values they
never send. It is not even a safe one — `--oa` on `--ink` is 1.01:1 in dark, because `--ink` is a
CONSTANT that `.dark` deliberately never re-declares while `--oa` flips. Which is the other half of
the same lesson: **a `.dark` block OVERRIDES `:root`, it does not replace it**, so a parser that reads
the dark block alone reports every deliberately-constant token as missing.

## 14 · Recognition — what the app may say it knows about you (W22e)

`mostLoved` set the bar for claims about the ROOM. W22e applies it to ONE diner, which is harder:
a personal history is small enough that a single coincidence looks like a pattern, and a wrong guess
lands on someone who knows the truth.

- **Never join two things with a `+` unless they co-occurred.** "Mohinga + Tea" asserts one meal. Two
  separate habits rendered as a pair is the most confident kind of fabrication: specific, plausible,
  and about the diner themselves.
- **Break ties on a fact you hold — never on row order.** Recency is real; insertion order is an
  accident of the query. And a comparator must return **0** for equal entries — but the reason is the
  opposite of what an earlier draft of this section claimed. Returning 0 is what PRESERVES insertion
  order (ES2019 sorts are stable); returning a non-zero value makes the result
  **implementation-defined** — measured on this V8, returning `-1` for equals REVERSES the input. So
  a broken comparator does not "fall through to database order", it produces a sort artifact. Either
  way the order is not a fact about the person, which is why equal entries need an explicit final
  rung (name) rather than whatever the engine leaves behind.
- **Count the unit the CLAIM is about.** "Usual" is about visits, so count distinct DAYS in the
  restaurant's own timezone — not rows (three of something in one sitting), not orders (this app
  mints a fresh cart after every payment, so a second round is a second order an hour later), and not
  UTC days (an 8pm dinner in Covina is already tomorrow in UTC, which splits one evening in two).
- **Never offer a one-tap action the server will refuse.** A dish with a required modifier group
  throws on a bare add (`enforceCardinality`), so a card offering it promises something the code
  cannot keep — and the refusal surfaces as a misdiagnosed session error, not as "choose an option".
  Availability is not only `is_sold_out`.
- **Attribution you do not have is not attribution you may assume.** `earned_by` is who PAID. Where
  the payer may not be the person who chose — a dine-in host covering a table — the honest move is to
  exclude that history, not to average over it. Same call `/staff/tips` makes about `settled_by`.
- **Filter availability BEFORE ranking, not after.** After-the-fact filtering both offers dishes that
  are gone (the last-tap refusal) and lets an unavailable favourite crowd out the one that could have
  been offered.
- **ASK, don't tell, and never quote the count.** "Your usual?" with the question mark: enough
  evidence to ask, nowhere near enough to assert. A question that misses is a shrug; a statement that
  misses is the app claiming to know someone it does not. "You've ordered this 7 times" is equally
  true and reads like surveillance — recognition should feel like a host, not an audit.
- **Below the threshold, render nothing.** Not a placeholder, not a softer variant. A card that
  appears for a first-timer is a guess wearing recognition's clothes.

**A personal read takes no id.** The uid comes from the SSR-verified session and never from an
argument — the moment such a function accepts one, it is an endpoint for reading strangers' habits.
Keep it out of Server Actions, pin the query to the caller, and let only what the diner can already
see leave the module.

**Recognition is not a selection, so it does not wear the gold cap** (§2). Vellum and a hairline are
enough to read as "for you" without diluting the one signal that means _you chose this_.

## 15 · Sound — what the diner's phone may make a noise about (W22f)

The app has a voice (§9) and a touch (§12). Sound is the third channel, and it is the only one that
reaches **people who did not ask for it** — everyone else at the table, the next table, a quiet room.
So it is the one channel that is off until someone says otherwise.

- **Off by default, and off means silent.** An unset preference is OFF. So is a preference the store
  could not be read from — private mode, partitioned storage and a locked-down browser all THROW, and
  **a broken store is not consent**. There is no "probably on". (Same direction as the delivery
  repo's "a failure must never read as empty", one boundary out: a failure must never read as _yes_.)
- **Never on an error path.** No sound fires when something goes wrong, and no `error` moment may be
  added. A sound on failure turns a recoverable, private problem into a public one — the whole table
  looks over at someone whose card just declined. Errors are read, not heard.
- **Sound is never the only feedback.** Exactly the §12 haptics rule. Every moment that makes a noise
  already owns a visible half, because the default state of this channel is silence: a diner who
  never turns it on must lose nothing at all.
- **Only ceremony, never traffic.** Two moments — sending to the kitchen, and being paid — because
  those are the two the app already treats as ceremony everywhere else. An add, a tap, a step is
  traffic. Giving traffic a sound is how an app becomes a slot machine.
- **The moments are one phrase, not two alerts.** `sent` lifts G5→C6; `paid` picks up on C6 and
  resolves home to G5. A beginning and an end across the meal, in the same register as the gold cap —
  a restaurant's sound rather than a notification tone.
- **A guest's phone is not a working device.** The kitchen chime defaults to 0.8 because a cook must
  hear a ticket land across a hot line. The diner level is 0.22: loud enough for the person holding
  the phone, quiet enough not to announce their dinner to the room.
- **Enabled and armed are two facts and neither implies the other.** Browsers create an AudioContext
  `suspended` and resume it only from a real user gesture (strictly, on iOS). A diner can therefore
  have sound ON with no usable context at all — from a previous session, or a refused resume. That
  state is **silence**, never a throw on the send or pay path.
- **If the only gesture available is the toggle itself, the toggle must do the arming.** Staff get an
  explicit "Enable sound" tap at shift start; a diner never does. So the switch arms inside its own
  handler and reports ON **only if audio is genuinely usable afterwards** — otherwise it rolls the
  write back and says the device refused. A control that reads "on" while nothing can sound is an
  unkept copy promise (§5) wearing a switch.
- **A stored preference is the store, not a mirror of it.** Read it through `useSyncExternalStore`
  with an explicit server snapshot of the OFF default. Copying it into state in an effect is both
  what React Compiler forbids and a real staleness bug the moment a second surface writes the value.

**A preference outlives the page; the thing that makes it work does not.** A browser's audio context
is per-document and dies on every navigation, while the preference sits in storage and does not — so
"the diner turned it on" and "this page can make a sound" are two facts with different lifetimes, and
a switch that shows the first while implying the second is wrong on every load after the first. Re-arm
from the first gesture of each document, and re-arm again when the tab becomes visible (an interrupted
context does not resume itself). This generalises: **any capability unlocked by a gesture must be
re-unlocked per document, even though the preference that asked for it was not.**

**Some moments cannot carry a sound at all, and the copy is what has to change.** A payment returns
through a hard navigation from the processor, so the page that celebrates it has no user activation —
and on iOS an audio context in that document can never resume. That moment's bell is best-effort
forever. The honest response is not to promise it and quietly miss: it is to promise only what every
device can keep (the kitchen bell), let the rest play where it can, and lean on the rule that the
sound is never the only feedback. This is the same bargain the haptic layer already lives with, where
the most common device implements nothing at all.

**A resume is not an arrival.** Deep-links back into a post-payment screen tend to reuse the
processor's own return-URL shape, because that is what resolves the view — which means the screen
cannot tell "I just paid" from "I am checking on the order I paid for hours ago" unless the link says
so. Every celebration on that screen fires on both: confetti, the haptic, the headline, the bell. Mark
the resume in the link and gate the celebration on it. The audible channel is what exposed this, but
it was wrong in three channels before sound existed — a celebration nobody questioned because nobody
had to hear it twice.

**Shared engine, split policy.** The kitchen and diner chimes share a mallet envelope and agree on
nothing else — default, arming, level, and what a failure costs all invert. Unify the ~15 lines of
synthesis if you like; never unify the policy, and never convert the kitchen's chime as a side effect
of a diner change (the cook's ticket sound is load-bearing; this one is garnish).

## 16 · Sheets — what a dismissal may cost (M82)

A bottom sheet is the app's most-used modal and its most-dismissed surface: four ways out, three of
them one careless thumb away. That is right for a dish sheet and wrong for a sheet that is spending
someone's money.

- **Enumerate the exits, in a type.** A `Sheet` can be dismissed by **Esc**, the **scrim**, the **✕**
  and a **downward drag** — four, not three. Radix funnels the first three into one `onOpenChange`
  and the drag is ours, which is what makes a complete guard possible at all; it is also what makes
  an _incomplete_ one invisible, because three-quarters of a guard looks exactly like a whole one
  a guard on that callback cheap. Map the vectors onto the **channels** the code can actually
  distinguish and assert the mapping: that proves one gate covers three exits, and stops a later edit
  moving one onto a path of its own. Do not claim more than that — the entry that asked for this
  feature miscounted the vectors, and an early draft of this section said the miscount "would have
  leaked the scrim". It would not have, in this shape. A documentation error is worth fixing on its
  own; dressing it as a near-miss is the same overclaim this file forbids elsewhere.
- **`busy` is for an irreversible write, and nothing else.** Dismissing does not cancel the write. It
  only guarantees nobody sees how it ended — usually on a tree that unmounted while the server was
  still answering. Of eleven callers, three qualify; the other eight write nothing irreversible, or
  write into a provider that outlives the sheet and shows the result plainly afterwards. **Do not add
  it "for consistency"** — a lock with no reason is a lock a user cannot predict.
- **A blocked exit must look blocked.** The local version of this rule swallowed the ✕'s click and
  let the handle rubber-band, which is a control that looks live and does nothing — the thing the
  feature request itself said to avoid. Keep the ✕ **visible, 44×44 and named**, mark it
  `aria-disabled`, and say _why_ in the name. Never native `disabled`: it is the **first** tabbable
  element in the sheet (the container above it is `tabIndex={-1}` — focusable, not tabbable), and
  disabling a focused control destroys the user's place (§7).
- **Mark the region busy; do not announce it.** `aria-busy` is a state — it tells assistive tech to
  hold off re-reading. A live region in the primitive would be the _second_ one in any sheet that
  already has a `role="status"` in its body, and four do. The caller already owns the message
  ("Refunding…", "Working…"); the primitive owns the state.
- **A lock that cannot clear is a trap.** All four exits blocked, inside a trapped focus scope, is
  WCAG 2.1.2 if the flag ever strands. Drive it from a transition or a `finally`, never a bare
  boolean a branch can miss. The primitive cannot enforce this and should say so rather than imply
  it has.
- **Thresholds are rules, not constants.** "A drag closes past 120px or 700px/s" decides whether a
  wandering scroll discards a half-filled form. It belongs next to the policy it serves, with a test
  — including that it is **downward only**, since an upward tug is someone pulling the sheet further
  open, and a sheet that closes when you try to see more of it is the opposite of the gesture.
