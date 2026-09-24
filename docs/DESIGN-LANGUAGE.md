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
flat shadow). Diner mains sit on the `PaperAmbient` — since **M126** a room rather than a layer:
three sibling planes (`.pa-far` genuinely out of focus, `.pa-mid` in focus, `.pa-grain` on the
lens), fixed at z:-1 with **no host isolation**: the page ground lives on `<html>` ONLY (the canvas
paints below negative-z content), because an `isolation:isolate` host traps its own fixed overlays
— tier-up scrims, toasts, confetti — beneath the app header (the #195 review lesson; never
reintroduce a body background or an isolate host for this layer). The `isolation:isolate` **inside**
`.paper-ambient` is a different thing and is required: it is the boundary the grain's blend needs.
The page grid is a **groove, not a ridge** — a dark line darkens the pixel under light text, and
that inversion is what took the worst Night ambient pixel from 4.4743 to 4.8443 (light 3.9670 →
4.6428). The mask is a floored **vignette**, never a cut-out: W22a's faded in viewport coordinates
on a fixed element, so the bottom third of every screen had no ambient at any scroll position.
Pages carry LINES, cards carry DOTS (`.card-textured`) — the two textures never read identical.
Surface tiers: `.surface-vellum` (the warm wash) marks moments of consideration (ConfirmSwap).

**The mobile GPU budget is now a DIAL, not a breakpoint (M126, owner go 2026-08-27).** W22a
forbade `blur()`/`backdrop-filter` below `md:` after a production iOS WebKit OOM; the owner lifted
that for M126, so glass frost runs at every viewport in **Night** and the heavy layers instead read
`--fx-glass-*` / `--fx-plane-blur` / `--fx-promote` from `tokens.css`. One attribute on `<html>` —
`data-fx="lite"` or `"off"` — scales the whole thing back with no redesign and no layout change
(`lite` drops the full-viewport defocus and un-promotes the mid plane, ~35 MB; `off` leaves no
backdrop-filter and no plane blur anywhere, and the static composition survives whole).
`prefers-reduced-transparency: reduce` takes the glass off at the dial's own specificity, so an
explicit `data-fx` cannot override the OS preference. **Glass is chrome you look THROUGH and never
a surface you READ**, it is **Night-only** (light has no luminance headroom — `--t3` on an opaque
`--sf` pane is 4.7601 there against Night's 6.4907, and dark-on-light glass is DARKENED by most
photography), it **never nests**, and a **selected element is never glass** (§2).

## 2 · The selection vocabulary — one language, every surface

A selected thing wears the **lit gold cap**: gradient fill + inner sheen + a soft `--glow-gold`
halo (`.checkout-pill-on`, `.checkout-tip-on`, `.slot-time-on`, `.taste-chip-on`, `.slot-day-on`,
the `#1` rank seal). Idle candidates are **vellum ghosts** — warm translucent fill, gold hairline.
Three hard rules learned the expensive way:

- **Self-contained active state.** Background and label live on ONE element — never a separately
  measured/positioned indicator supplying the contrast behind selected text (the recurring
  dark-on-dark active-tab bug, root-caused in the delivery repo and honored here).
- **The ink follows the FILL, not the vocabulary — `--oa` on an accent fill, `--ink` on a gold one.**
  This section itself read "gradient fill + `--oa` ink" with the rank seal listed beside the mode
  pills, and that sentence is what shipped the bug: every other surface here fills with
  `--ac` (or an `--ac`→`--ac-strong` ramp), where `--oa` is on-ACCENT ink and correct by
  construction. `.start-here-rank-top` is the one that fills with **`--gold`**, and `--oa` on gold
  measures **2.0458:1** in light — the band's most prominent numeral, unreadable in the default
  theme, from W20 until M131. `--ink` is the CONSTANT deep ink for a fill that is bright in both
  themes; on that gradient it clears 5.4353 (light) / 9.6157 (Night). Before writing an ink onto a
  new lit surface, ask what the FILL is, and remember that `contrast-audit.test.ts` cannot ask that
  question for you — it asserts token PAIRS and does not know which fill an ink lands on. A
  gradient or a `color-mix` ground belongs in `composite-contrast.test.ts` instead.
- **The mode pills, tip chips, day cards, taste chips and rank seals may never drift apart.**
  New selectable surfaces adopt the existing classes or extend them in `globals.css` beside them.

## 3 · Motion idioms — small, meaningful, always escorted

| Idiom                          | Meaning                                                          | Where                                  |
| ------------------------------ | ---------------------------------------------------------------- | -------------------------------------- |
| `.mms-pop`                     | a VALUE changed under you                                        | tip previews, cart count capsule       |
| `.mms-rise`                    | something ARRIVED                                                | tip reactions, notices, scanned rows   |
| `.mms-stagger`                 | a once-per-session premiere                                      | arrival beat, Start-here band          |
| press glow + sheen sweep       | you COMMITTED                                                    | Pay CTA, ConfirmSwap proceed           |
| `--tip-heat` ladder            | encouragement as gradient, not nag                               | tip chips warm 15%→30%                 |
| NumberFlow rolls               | money settles like an odometer                                   | Bill hero total                        |
| `MarqueeRail` drift            | an ambient conveyor, never a hijack                              | Start-here twin rows (W22)             |
| thermal print reveal           | the moment becomes an ARTIFACT                                   | /track paid slip (W22a·depth)          |
| `.mms-send-beat` + settle      | the order visibly LEAVES the table                               | send-to-kitchen success                |
| MicroBurst (✦◆)                | intent: the pill's 0→1 add                                       | menu row pill (never per stepper step) |
| `.mms-settle` on the "+" glyph | your add did not land — set back down                            | menu row pill (§23)                    |
| `.mms-remove` + FLIP close     | something was REMOVED — it sinks away as the list closes over it | /cart line removal (§24)               |

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
- **Plain words (owner, 2026-09-24: _"86 this dish doesn't make sense to my parents … same for
  customer facing"_).** Every visible string uses the words a guest or a parent would say out loud —
  no trade slang (86, fire, comp, void, bump), no payments/tech jargon; internal names stay in code.
  On the guest screens that means: "pay", never "settle"; "approved", never "authorized" / "hold" /
  "captured"; "the person who started your table", never "the host"; "the code on the package",
  never "barcode"; "on the house", never "comped"; "another window", never "another tab"; "table
  code", never "party code". A legal disclosure says what the charge is FOR, never a statute number.
  The Order / Basket nouns of §21 still bind — plain words never fork a settled vocabulary.

## 6 · Bilingual — one surface, two tongues

EN is the primary voice, Burmese the Padauk accent **on the same surface** — no toggle, no locale
state. `lang="my"` on every MY span (SR pronunciation); ≥13px floor for stacked diacritics; the
gap between tongues is a **margin, never a whitespace text node** (flex containers drop
whitespace-only children — the "Sales tax(10.5%)" bug, twice). Guest-facing register is spoken
and warm (တယ်/မယ်/နော်); kitchen is **မီးဖိုချောင်** (owner-corrected, W21). Every Claude-authored MY
string joins the K15 native-check ledger the day it ships.

**The staff kitchen surfaces invert the order (P1): the KDS ticket, its All-Day rail and the expo bag
line are Burmese-FIRST — the catalog's `name_my` as the primary line, English always beneath at full
contrast (the modifier size on the ticket, the chrome size on the rail, the row size on the expo).** The rules are `lib/ticket-names.ts`: a Burmese slot with no
`name_my` is `null` and the RENDERER marks the English fallback `lang="en"` (never pre-substituted,
never typeset in Padauk); the echo and rail classes are emitted only in the Burmese BRANCH of
`components/staff/TicketText.tsx` (its jsdom suite pins that), so an English-only line mounts
exactly what it mounted before; Padauk is declared at 700 (the heaviest cut it ships) with
`font-synthesis: none`; and the held card's two stacked fades are tokens the composite guard reads.
No Claude-authored Burmese reaches a ticket — every string is a DB row K15 corrects in place.

## 7 · a11y — the floor, not the ceiling

≥44px touch targets; **one live region per view** (new features route through it, never mount a
second); focus moves on remove/route/step change — and lands on **the user's own selection**, not
the app's default (the slot sheet focuses _your_ chip, not Soonest); toggles are `aria-pressed`;
decorative seals/emoji are `aria-hidden` with an sr-only twin saying it in words; controls stay
rendered-and-disabled with a reason, never vanish. **On a removal, focus lands on the neighbouring
item's NAME — never on a control that could repeat the action** (at qty 1 the neighbour's "−" IS
"Remove {next dish}"); the heading takes focus only when the view swaps, and a tablemate's change
moves focus only if it was inside what they removed (§24).

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
rather than in the component (M46 made a `.test.tsx` runnable, but a pure module is still falsified
by a value rather than a render, so decision logic stays in `lib/`). Real expo timestamps, the diner's own pickup slot as an ABSOLUTE time, the
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
answer.** `announce` is the view's one arbitrated slot (`lib/notice-slot.ts`, §23): news and
corrections are always visible, a claim may be quiet, a quiet line never blanks visible text and a
claim never erases a correction — but NEWS still replaces whatever the diner was reading, so an
unrequested "Menu is up to date." on every app switch overwrites the "Added
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
- **Attribution you do not have is not attribution you may assume — and when the gap is structural,
  close it rather than living with it.** `earned_by` is who PAID, so where the payer may not be the
  person who chose — a dine-in host covering a table — excluding that history was the only honest
  move available. It was also a real cost: the archetype the feature exists for was the one it could
  not serve. **M87 carried the seat into the order**, so the same surface now counts the person who
  CHOSE, and the payer only where no seat was ever recorded and the mode makes paying and choosing
  the same act. The lesson generalises: an exclusion made for honesty is correct and temporary — it
  names a missing fact, and the fix is usually to record the fact, not to loosen the rule. Where the
  fact is still missing, the old call stands (`/staff/tips` on `settled_by`).
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
  still answering. Of fourteen callers, five qualify (the refund, void/comp and modifier sheets, the
  report sheet, the cash confirm); the other nine write nothing irreversible, or
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
- **The exit is CSS, and the presence chain must reach a DOM node (M76, slice 4).** A closing sheet
  slides down and its scrim fades over one `--dur-sheet` — `[data-state="closed"]` rules beside the
  entrance, so CSS owns both beats and framer keeps only the drag; reduced motion names the closed
  selectors explicitly AND after them (the attribute selector ties the bare class on specificity,
  so source order decides). Radix's `Presence` holds the node while that animation runs, reading it
  off the ref each portal child forwards — so the portal's child must forward its `ref` to the
  content node (a context provider AS the child forwards none, and the sheet cuts again; the
  provider lives inside the child, where it mounts only with a sheet and its lazy chunk stays off
  every closed-sheet route). A parent that UNMOUNTS the sheet on close gives `Presence` nothing to
  hold: mount it through `useSheetSubject` — the subject is held through the exit, `open` follows
  the live subject, and `key` advances per open so each open is still a fresh instance. An exit's
  name never CONTAINS its entrance's (Radix ends the hold on `animationcancel` by substring). Any
  state a sheet resets "on close" is now visible for the whole slide — reset on the next open.
  And `onCloseAutoFocus` fires at UNMOUNT, after the exit: a caller that moves focus elsewhere on
  close does so under the sheet's own `aria-hidden`, and should unmount the sheet instead (the
  cash confirm's landing).
- **The ✕ speaks the caller's tongue through `closeLabel`, as DOM text (manager-9).** The staff
  sheets pass `sheetCloseLabel(lang)` — `{ idle, busy }` rendered sr-only inside the button, §17's
  circle idiom, never an `aria-label` (rule 3 cannot follow a name into the package, and DOM text
  keeps the Burmese language-marked); both states travel together so the busy name is never left
  in English at the one moment it matters. The diner sheets keep the English default.

## 17 · The staff console — one bar, every page (P7·1b)

The parents' console was rebuilt to feel like a tablet, not a web page, on a direction Min picked
from the canvas: the app's own paper-and-gold vocabulary, iOS STRUCTURE. These are the rules as
built.

- **One chrome, fixed positions.** `StaffBar` is the h1 of every console page. Leading = where you
  are: the Screens circle (`/staff?doors=1`, which `resolveStaffHome` honours over any remembered
  door) — a static `aria-hidden` mark on the doors themselves, and the way back UP on a sub-page
  (`{ kind: "back" }`, the arrow inside the dictionary label). Title = Burmese 30px with the English
  echo beneath, the ONLY English in the bar. Middle = the page's own control. Trailing = utilities in
  one order, the language switch then **Lock, last** — the thing you do on the way out. Sign out is
  never a bar control (a mis-tap costs a login; Lock costs a PIN); it ends the sign-in screen's
  signed-in card (A4·4 — the profile page folded into `/staff/login`). Help
  (the gold circle) takes the slot before the switch when PR 3 lands — not before, because a
  control that does nothing is forbidden by §16.
- **The bar spans the viewport; the page's column sits beneath it.** `.staff-main` is the
  full-bleed ground (the LINES) with NO horizontal padding; the bar is its first child; the page's
  own max-width and inset live on a `.staff-col` wrapper under the bar. A bar inside a centred
  640px column is a strip, not a bar — the blind pass on PR 1b asked, and the mock had answered.
  Inside the KDS root the bar cancels the root's `--kds-pad` exactly, so it is flush without
  overhanging the root (an overhang past a bare `<main>` is a horizontal scroll on the board).
- **The bar is chrome you look through in Night** — `--glass-chrome`, the ONE frosted pane whose
  floor `composite-contrast.test.ts` pins over white; never a second alpha nobody measured. Paper
  with a hairline in light. Sticky, and it clears `env(safe-area-inset-top)`; it is the ONLY sticky
  element on a page (a page-level sticky wrapper around it paid the notch inset twice).
- **A sheet opened from a class-themed subtree carries the theme itself** — `Sheet` portals to
  `<body>`, so `.kds-root.dark`'s Night never reaches it; the KDS passes `className="dark"`. A
  light sheet over a Night board is what "the sheet paints in the document's theme" looks like.
- **Circles are named by sr-only dictionary text through `<Chrome>`, never `aria-label`.** Rule 3
  of `check-staff-lang` refuses `sx()` on a control that has children, and it is right: the name is
  DOM text so the Burmese arrives marked and the {visible, aria} pair cannot drift. The busy state
  of the Lock circle is spoken through the same text.
- **Lines on the page, dots on the card** (§1), now on the staff surfaces too: `.staff-main` carries
  the 28px groove, `.card-textured` rides the doors, the counter row and every KDS ticket. The two
  never share an element.
- **Press = you committed.** `.staff-press` (scale .985 + one sheen sweep on release, transform and
  opacity only). A door is `haptic("commit")`; a station, a size or a language is `haptic("pick")`.
  Each ships its visible half — the press, the moving gold cap, the sheet — never the buzz alone
  (§12). The doors premiere once per session (`mms-stagger`, J1's SurfaceMemory zeroes the revisit).
- **The segmented control** (`.staff-seg`) is one track; the chosen segment wears the lit cap — the
  §2 recipe AS BUILT (an accent fill, on-accent ink, the inset sheen, a gold halo; Night's accent is
  gold-adjacent by design, so on the Night-forced board it reads as gold), never a second one. That
  rule reaches EVERY pressed `.kds-chip` (the all-day rail, the sizes in the sheet) and the language
  switch beside it, through ONE shared rule in `globals.css`. ⚠️ Until 2026-09-20 this sentence said
  "gold cap" and the chip wore a 20% gold-TINT gradient while the switch wore a solid accent fill —
  two vocabularies in one bar — and inside `.staff-seg` the tint was not even visible: the track's
  `.staff-seg > .kds-chip` (0,2,1) out-specified `.kds-chip[aria-pressed]` (0,2,0) and painted the
  fill transparent, leaving a sheen ring (K29's "grey disc"). `KdsBoard.test.tsx` parses the
  stylesheet and reddens the moment any of the six pressed selectors grows a second fill — the
  fifth is the register's open Start arm (`.staff-arm[aria-expanded="true"]`, counter-4): a
  selection is a selection whichever attribute says so, and it joins the rule rather than the
  accent outline it wore before; the sixth is `.staff-chip[aria-pressed="true"]` (manager-7), the
  ONE rest class every pressed chip outside the KDS root wears — the loss sheet's segment and
  reason rows, the menu browser's categories, the mod sheet's options, the cash settle's tip chips
  — because an INLINE fill beats any class, so five `*On` style objects had kept the rule from ever
  reaching them. Segments never drop under 44px (O-E): the thumb IS the target. The seventh is
  `.orb-table-up` (slice 5, board-9): the wall's `Food up` chip, an `<li>` pressed by its class
  rather than an attribute — it had worn a gold OUTLINE, which is §2's idle idiom, while the band's
  own comment called it the cap.
- **Never native `disabled` on a control that was just tapped** — it drops focus to `<body>` in a
  real browser, so a busy name spoken "through the same node" is spoken from nowhere. `aria-disabled`
  states it, the handler refuses re-entry (the Lock circle, after the language switch's own rule).
  The kitchen board's nine action buttons — Done (the bump) · Cook now · the line · the line's ⋯ ·
  the sheet's Mark sold out · undo · Bring back · the pager (‹ ›) — follow it since the K22/K28
  slice (2026-09-20; the ⋯ and its sheet since Phase 2b, measured from `KdsBoard.tsx` +
  `KdsLineMenu.tsx`), with the CSS keyed on the attribute; the lane's
  bump, the register's five controls and (slice 3) the manager rails — `Stepper` itself, the
  approvals card, the refund and void/comp sheets, the line editor, the mod sheet, the menu browser,
  the add button — are `aria-disabled` the same way since the same day, and 23 native `disabled`
  sites remain across 12 other staff components (K35 — measured native-only; `aria-disabled={` is
  not one, and two of the 23 are not taps: a `Stepper` prop and a roster dead-end). The register also shows the trap in the predicate: a `busy`
  computed at RENDER is the same stale `false` for every tap of one frame, so the handler reads the
  in-flight REF when the tap lands (LEARNINGS #126). **`aria-disabled` is the ZONE's fact; `aria-busy`
  is the ONE control's** — the register holds all five while a mint runs and marks busy only the
  control that minted (a draft that stamped busy on Walk-up for a phone mint told assistive tech
  the wrong element was updating). On a `.staff-btn`, busy is the attribute plus a dim; on the
  `@mms/ui` `.ui-btn` (the console's first is the table page's Send, Phase 2a) busy is `aria-busy`
  plus a full-ink spinner and a stated word ("Sending…", "Bringing it back…"), never dimmed (§20).
  Either way, never a label swap TO AN ELLIPSIS: `{pending ? "…" : label}` on a button with no `aria-label` makes its accessible name
  literally "…" for the round trip, and a 64px zone that collapses to an ellipsis moves under the
  thumb. A swap to a stated word is not that rule's subject — the register's Go says "Going…"
  (`reg.going`, both states echoing so the height holds), and only on the form that went.
- **Inset grouped rows** (`.staff-inset` · `.staff-row`) are the Settings idiom, Burmese first, a
  tinted glyph square, a disclosure chevron, hairlines drawn once per edge. Still one `role="list"`
  of real links, named by its visible heading.
- **Sheets, not chip rows, for settings** — the KDS text size opens from the bar's Aa circle into a
  `Sheet` (§16 owns its four exits); `Sheet.title` is a `ReactNode` so a dictionary title arrives
  marked.
- **The CSS a component's DOM is written against is held to a render** (LEARNINGS #101):
  `StaffBar.test.tsx` and `StaffDoors.test.tsx` extract every selector naming the title from
  `globals.css` and `querySelector` it against the rendered component, in the language it is written
  for. A dead selector is a red test, not a title at body size.
- **The front door wears the bar too** (P7·2). `/staff/login` and `/staff/lock` are a static glyph
  mark where the Screens circle would be (`{ kind: "here", icon }` — the people mark, a lock: there
  is nothing behind either door yet), the title, and the switch; never Lock, never a control that
  leads nowhere. Beneath it ONE textured card, top-aligned the way iOS sets a form — never centred in
  the viewport, which slid the card under the keyboard on a landscape tablet. The primary is the
  accent pill; the escape ("Sign out", "Use a different email") is a quiet link, LAST. `.entry-*` in
  `globals.css` is the whole vocabulary.
- **A live region takes a KEY, never only a string.** `StaffMsg` is a dictionary key with its slots
  OR a server sentence; `<MsgText>` renders whichever it is, marked, with no echo. A `msg: string`
  state is a wall against localization — the region can only ever show text, so nothing can hand it
  Burmese — and that is exactly how the PIN failures stayed English under a Burmese switch for two
  slices. Refusals are `aria-disabled` here as everywhere; a lockout makes a field `readOnly`, not
  `disabled`, because `submit` just moved focus into it. The KDS was the last board holding an
  `err: string` (2026-09-20): `KitchenActionResult`'s failure arm carries a `code` beside its
  sentence, `lib/kds-errors.ts` turns the code into the dictionary's sentence about the thing that
  was tapped, and **the mark rides each branch, never the region** — a `lang` on the `<p role="status">`
  itself announced every twin-less server sentence as Burmese.
- **The Help door is ONE gold circle and ONE sheet** (P7·3). The circle rides the bar's `help` slot
  — before the language switch, after the page's own utilities — on the screens that have something
  to explain (the board, the counter, the takeaway board), and nowhere else: a page passes the node
  or nothing, so no circle is ever parked dead. Behind it one sheet with views, never a second dialog
  over the first: the rows (the Settings idiom More uses), the four cards one at a time (Next → Got
  it, focus moved to each card's sentence from the first Next — on the auto-open the sheet's own
  initial focus stands, as on every sheet), the board's sizes on a real dish word with the chosen one
  under the gold cap. Every card's picture is the REAL control's own DECLARATION, made inert
  (`.help-pic`): the control's class where it has one, its exported style object where it is styled
  inline, or the one CSS rule naming both — never a new class that copies the look, which is the
  drift the picture exists to prevent (the first draft shipped four of them; the blind pass caught
  every one). A number the sheet quotes is true where it is shown or not shown at all ("{n} across"
  only inside the board's fixed envelope). "Opens itself the first time" is a DEVICE fact
  (localStorage, per screen) kept at open, not at close — written by the pass that opens, so
  StrictMode's discarded first pass cannot spend it.
- **"Something's wrong" is the sheet's third row, and it files a report three ways without
  pretending** (P7·4). The row is written FIRST, behind the gate, with the reporter's identity from
  the verified session (the input has no identity field to forge); the email and the GitHub issue
  run post-response and what they achieved is RECORDED on the row — the person's own list shows a
  status chip from the row and an "On the team's list" chip only when an issue really opened. The facts sent are the ones the app can SEE (the screen by the door's own word, the time, the board's own connection state handed in — or `page` where the door is rendered server-side with no feed state to hand in, the counter home; the deployed version stamped by the server, or `dev`), never a guess; the words are
  fenced in the issue so a person's markdown cannot restyle it — and the issue, on a PUBLIC repository, carries only the words and five bug facts; the person, the device and the ids stay on the row and in the email. A per-person ceiling (five in ten minutes) keeps a stuck tap off the public list. Before the table exists on prod the door says it is not switched on — one sentence in place of the form, never "try again" for a failure that cannot succeed on retry. The send is the sheet's one
  irreversible write: `busy` while in flight, Send `aria-disabled` with the refusal in the handler,
  the field 17px so iOS never zooms, an empty tap answered in the view's ONE live region with focus
  back on the field, success announced by moving focus to the sent card. The gate answers KEYS
  (`outage` · `auth` · `invalid` · `save`), so every refusal renders in the device language.
- **The console sends too (Phase 2a, P2k).** The table page carries ONE Send per table, in the
  order card between the pretax note and the card's one status region, so the page reads "send, then
  settle". It is `@mms/ui` Button primary · xl · block, and it is **primary** when staff own the
  send: the table is hostless, staff added any of the unsent dishes (a "mixed" note says the Send
  also fires the table's own), or the table has asked to pay (a check-with-the-table note). When a
  diner host runs the table and every unsent dish is theirs it is **secondary** under "{host} sends
  from their phone — send here only if the table asks." One tap sends; there is no confirm. A counter
  order is never offered a Send: its status row says "The kitchen starts this order when it’s paid."
  (until 2f).
- **Hints sit BELOW the control, never above.** A held or blocked Send (a dirty note on a sendable
  dish, a write still saving, a payment in flight) is `aria-disabled` — never natively disabled —
  with its reason as an `aria-describedby` hint under it; a hint collapsing can therefore never move
  the control under a thumb. Notes that describe the send vanish AT the tap. The control row holds
  64px (`--tap-bump`) through Send → Undo → the status rows (all sent · to-go at pay · counter at
  pay), which are rows, not pills: no fill, border, radius or cursor, focusable with tabIndex -1.
- **The console's Undo reads the diner's server clock and the one same-gesture hold.** The grace is
  `lib/send-grace.ts` (the server-measured duration from local receipt — the diner's
  SendToKitchenButton reads the same module). The Send turns into the Undo on the SAME node (focus
  stays), the verb is its whole accessible name and the countdown is a separate aria-hidden `· {n}s`
  span, and a tap within `SAME_GESTURE_MS` of ANY relabel under the finger (Send → Undo, Undo →
  Send, a count that moved) is ignored. The controller (`useStaffSend`) is owned by the host that
  owns the detail, so the refresh that zeroes the "not sent" count, or a view swap, cannot kill an
  open undo; an open undo also survives "← Floor" and a reload through a per-device
  `mms-staff-undo:{sessionId}` stash (display-only; the SQL re-checks). After a successful undo the
  control stays busy until the drafts are back (bounded at two detail commits), then focus returns to
  the Send; when the window closes with focus on the Undo, focus moves to the status row in place,
  without scrolling.
- **Drain before fire, on the console, is a hold.** A note typed on a sendable dish but not saved
  holds the Send (naming the dish) and a tap takes the finger to that note field — found by
  `data-note-for` within the order card, not by its id; any line write still in flight holds it too.
- **Outcomes take the view's ONE region** as `StaffMsg` keys: writeError > degraded > send warn >
  send ok, and each setter clears the other, so no send line — of either tone — masks the
  frozen-board signal (a frozen view must never look live). A send line also RETIRES once the fact
  it speaks to is superseded: the first read that started after it fixes the slot it was said over,
  and a later read showing a different slot (a colleague sent, the count moved) clears it
  (`sendNoteAfterCommit`). A send that THREW says "couldn't confirm — check the order" and re-reads
  at once; it never says "couldn't send" and never offers an Undo it has no batch for. An UNDO that
  threw is unknown too ("couldn't confirm the take-back"), keeps its window, and a retry that finds
  the batch already brought back answers `gone` — never "too late".
- **A staff write's refusal is CODED by where it happened.** `staffAddItem` answers
  `{ ok: false, error, code }`: the pre-read refusals are coded by the branch that refused (`signin`
  · `sentence` · `invalid` · `outage` · `closed` · `no-cart` · `paying`), and a throw inside the add
  by its PHASE (`lib/staff-add-outcome.ts` `addFailureCode`) — pricing writes nothing, so its failures
  are definite (`sold_out` · `gone` · `outage` · `failed`); anything thrown from the write is
  `unconfirmed`, because the RPC may have committed with its response lost. Never classify by message
  text. The Send's refusal union (`lib/staff-send.ts`) is coded the same way.
- **One add, one key.** A staff add may carry a client-minted `addKey` (uuid) riding the existing
  `p_scan_id` ledger (`mms_scan_events`, claimed in the insert's transaction), so a resend of the same
  key is an idempotent no-op. An `unconfirmed` add is resent under the SAME key, never re-tapped
  under a new one; the key dedupes per EVENT, so mint one per add.
- **Every exit to the floor asks for it BY NAME.** The bar's back control, a closed-table bounce and
  a cleared table go to `STAFF_DOOR_TARGET.counter`, never a bare `/staff` — that resolves by the
  door cookie and can land on the doors screen.
- **A live board's async read never acts on an unmounted view.** The poll effect owns an `alive` ref
  (re-armed at setup, cleared in cleanup) and nothing below the `await` — no setState, no router
  call — runs once it is false. A board that reports its connection state withdraws the report when
  it unmounts, so the screen's fold (`aggregateConnection`) reflects only boards on screen; and a
  realtime session channel is named per MOUNT (`{topic}:{sessionId}:{seq}`), so two consumers of one
  session, or a remount before the async removal settles, never share a joined channel.
- **A typed money amount is read once, on the whole string, in integer cents.** A staff money
  field's `onChange` only REFUSES characters (`sanitizeMoneyInput` — digits, one `.`, commas before
  the dot, ≤2 decimals, ≤12 chars); it never rewrites or drops a comma, because a keystroke cannot
  know what the next key will make of it. What a comma means is decided at read time by
  `parseMoneyCents` (a dot present → grouping; comma-only ending in 1–2 digits → decimal comma; else
  grouping), with integer arithmetic — never `parseFloat × 100`. A chip that fills a money field is
  lit by VALUE (`parseMoneyCents(field) === cents`), not by the field's spelling.
- **A rejected charge action is an UNKNOWN outcome, and says so.** When a Server Action that may
  have moved money rejects (the connection dropped), the control clears busy, closes its confirm
  (focus returns to the trigger) and renders its own `kind: "local"` dictionary sentence through
  `<Chrome>` (`settle.card.unknown`) — never the write-outage twin, whose "that change wasn’t saved"
  is false for a charge that may have landed. Server-returned sentences keep going through
  `<OutageText>`.
- **Sold out lives behind the line's ⋯, never one tap under the line (Phase 2b, K22).** A trailing
  `.kds-line-more` cell (48px × the row's full height, a `--bd` hairline on its left, the Ellipsis
  glyph at 1.15em against the text-size dial, `.staff-press`) renders only where `canEightySix(line)`
  holds — a menu dish not already sold out — named by sr-only `<Chrome k="kds.line.more">` ("More
  for {x}") with `aria-haspopup="dialog"` + `aria-expanded`. It opens ONE board-level `Sheet`
  (`className="dark kds-menu"`, titled by the dish): the hint, the sheet's ONE `role=status`
  region ABOVE the button (a refusal grows the sheet upward, away from the thumb), then a
  `Button variant="danger" size="xl" block` reading "Mark sold out". Two deliberate taps: the
  sheet's button refuses, with no visual, for `SAME_GESTURE_MS` from the sheet's mount and while the
  sheet is exiting. No Sheet `busy` (§16) — the write is reversible and resolves into the board.
- **The result resolves IN the sheet.** The button goes busy with its label kept; the dish's ⋯ is
  `aria-disabled` (and `aria-busy` on the opener); a refusal renders in the sheet's region in the
  device language and re-arms the button; a success UNMOUNTS the sheet (never a close — a closing
  sheet keeps the board `aria-hidden` through its exit) in the same commit as the override, the undo
  bar and the region's notice, and focus lands once on the dish's own line button. A cook who
  dismisses mid-write lands on the busy ⋯ and the write finishes at board level; a refusal then goes
  to the board's region. The board re-reads on EVERY outcome.
- **A confirmed override is keyed on the poll sequence, never "until the prop agrees".** Every
  refresh that actually starts stamps a sequence; an OK sold-out (or its Undo) records the latest
  started one, and a snapshot drops the override only when its fetch started later
  (`pruneSoldOut`). `overlaySoldOut` is the ONE binding the row, the tag, the ⋯, the sheet's subject
  and the line's spoken name read. The sheet's subject is the LIVE line; the id is cleared in the
  render that finds it gone, so a Bring back never reopens the sheet.
- **Sold out is a fact on the line and a clause in its name.** The tag row gains SOLD OUT
  (`kds.86.done`) in `--tx` beside a 0.55em `--warn` dot (warn ink pinned in
  `composite-contrast` on the started tint). The line button's `aria-label` replaces its content,
  so `al(kind:"line")` takes a REQUIRED `soldOut` and appends " — Sold out" after the unchanged name.
- **A dish's kitchen note sits directly under that dish, as its description.** `TicketNote` is a
  sibling after `.kds-item-row` inside the same `<li class="kds-item">` — never inside the line button
  (the Later fade never reaches it), never after a control. EXACTLY two flex children: the
  aria-hidden ⚠ and ONE `.ticket-note-text` span holding an sr-only "Kitchen note — " prefix and
  the note's script runs (§6 — Myanmar runs marked `lang="my"`, Latin runs bare). The line button is
  `aria-describedby` the Later slot, then the note — never an empty attribute. It is the ONLY warn
  band inside a ticket; the takeaway lane's bag line reuses it.
- **The bar's status slot (feed pages only, Phase 2b).** A page with a feed passes `live` to
  `StaffBar`: the counter passes `'counter'` (the pure `counterFold` of the floor and the bags —
  never the manager's approvals rail), the kitchen board and a table page their own `degraded ?
'not_updating' : 'live'` — the same truth their banner reads, so bar and banner never disagree.
  Only then are the h1 and the slot wrapped in `.staff-bar-head`, the slot OUTSIDE the h1 (the
  heading's name never changes). Three states, three SHAPES, never colour alone: a filled `--ok` dot
  (live, the word sr-only), a hollow `--warn` ring + "Not updating", the offline glyph + "Offline"
  (a SUSTAINED device offline outranks the feed). The mark box is reserved at SSR and EMPTY before
  the boards report — never a guessed "Live". Plain text, not a live region (the boards' regions
  speak their freeze); a change between drawn states pops the mark once, never on first paint.
- **The offline row (feedless pages only).** Menu, tips, glossary, team, sign-in, lock, the doors:
  after 2s (`NET_SHOW_MS`) of UNBROKEN device offline, one in-flow `role="note"` row INSIDE the
  sticky bar, last — "This device is offline — changes won’t save." It hides the moment the device
  is back. A feed page never draws it (its slot says Offline), so nothing covers the kitchen board's
  head. The device truth is `useDeviceOffline` (a store over `navigator.onLine` whose clock survives
  a soft-navigation remount). The row lives INSIDE the bar, so the bar is still the only sticky
  element.
- **`--staff-bar-h` has ONE publisher.** `StaffBarNet` (the bar's always-last child) publishes the
  header's measured height on `<html>`, and `:root:has(.staff-bar)` sets `scroll-padding-top` from
  it, so a keyboard-focused control never parks under the sticky bar (WCAG 2.4.11), the offline row
  included. Everything else that needs the bar's height READS the variable.
- **The takeaway lane's thumb-zone Undo.** "Picked up" / "Handed over" draws the `@mms/ui` Toast at
  `size="xl"` and `live={false}` — the lane's own region speaks the pick; the pill only draws. 64px,
  and the WHOLE pill takes the tap (a thumb that misses Undo lands on the pill, never on a control
  beneath it); a leaving pill takes none. It shows ONLY the pick that opened it; after its own Undo
  it stays visible and inert for `SAME_GESTURE_MS`, then leaves, and the restored slot refuses a
  re-pick for the same gesture. A KEYBOARD user on either Undo (`:focus-visible` only — a tap never
  holds) holds the window, capped at a minute. After an Undo from the pill focus lands on the card's
  restored slot. The counter column carries `.staff-col-dock` so its last controls scroll clear.
- **The kitchen board's sound chip follows the engine.** `KdsChime.subscribe` sets the chip from the
  audio context's real state, so a tablet that slept shows "Sound off — tap to turn on" and re-arms
  off the next tap — never a volume slider over a silent board. The sold-out tap and its Undo buzz
  at the TAP (`commit`), opening the ⋯ buzzes `pick`. Lateness is one module (`lib/kds-urgency.ts`);
  nobody restates the 8/12-minute thresholds.
- **Plain words on the console (owner, 2026-09-24).** §5's rule reaches the staff: "Mark sold out"
  / "Sold out" (never 86), "Done" (never BUMP), "Cook now" (never fire), "Later" (never held), "Bring
  back" (never recall), "Remove" / "Make it free" / "On the house" (never void / comp), "Running
  bill" (never tab), "Take cash" / "Take payment" / "Paid today" (never settle). The dictionary KEYS
  keep their old names (`kds.86`, `kds.bump`, `settle.*`) — a key is an address, not copy.

## 18 · Aspect ratios — the page column and its tiers (R1)

Min's brief was one line — "dynamic aspect ratios: mobiles, tablets, desktop" — and the app was
measured before it was touched: 261 states across thirteen viewports, then eleven blind reviewers
over the screenshots, then every finding checked against the stylesheet before it became a rule.
What the sweep proved is that the QR app had exactly one layout, the 440px phone column, at every
width from 375 to 1920, and that one number lived in fourteen places. These are the rules as built.

- **One knob, three tiers, and the tiers are the whole system.** `--w-page` is the customer page
  column's width and is set in ONE place per tier: the phone (`< 48em`) keeps `--w-content` (440,
  the shipped design, untouched); the tablet (`≥ 48em`) takes 46rem (736); the desktop (`≥ 64em`)
  takes 52rem (832). `.page-col` reads it; no page carries a width of its own again, and
  `lib/responsive-contract.test.ts` parses every customer `<main>` to keep it that way. Boundaries
  are em, not px, for the reason the sheet's float threshold already gives: the column is rem, and a
  px boundary desyncs from it under Android large-font and browser min-font settings.
- **`.page-col-narrow` is the second and last knob.** A money or status column — cart, track,
  account — reads best near 65ch, so it caps at 34rem (544) instead of taking the tier. The phone
  is untouched (min(440, 544) = 440). The same 34rem is the sheet's dialog width: one measure for
  "a reading column", used twice.
- **Width is spent on ONE thing per surface, and nothing changes on a phone.** The front door lays
  its three doors across as stacked tiles; the menu lists two rows per line (342px each at the
  tablet width, wider than the phone's 335 — no row loses a pixel of name); the market shows three
  SKUs across, four at the desktop; the table picker fills 124px tiles five across at both wide tiers (ten
  tables were 3+3+3+1 at every wide width; 792 ÷ 134 is still five); the chip rails WRAP where a mouse cannot swipe them; the
  horizontal rails fade at both edges so the column's edge reads as "this scrolls", never as a cut
  through a card. The app header's brand and utilities align with the column's edges rather than
  the screen's corners.
- **The sheet is a bottom sheet on a phone and a centred dialog from the tablet tier.** Same
  component, same sticky head, ✕, CTA bar and scroll padding; the grab handle goes with the bottom
  edge it belonged to, and because the swipe is handle-initiated, hiding it is what disables the
  drag. The slide-up becomes a fade, under `no-preference`, so the reduced-motion rule keeps its
  `none`. The dialog centres on the part of the viewport the keyboard is not covering
  (`--kb-inset`).
- **The short tier is height-keyed, never width-keyed.** A landscape phone (844×390) is wider than
  a tablet's threshold and shorter than anything; the rules that fold the hero (`≤ 500px`) and
  return the menu toolbar to flow (`≤ 520px`, the same inversion `.mms-sheet-head` makes at 480)
  key on height alone, so a tall narrow phone keeps its pinned rail. When the toolbar is static the
  jump offset is re-measured against the app header alone — a static toolbar's `top` is `auto`, and
  a phantom offset would have parked every landed heading 120px low.
- **The ambient's pause coin takes the gutter where there is one.** From 872px wide (the tablet
  column plus 56px each side) it sits outside the column, off the content; below that — every phone,
  and a tablet between 768 and 872 — it keeps the corner it had, with its safe-area term on every
  tier (F11 stays open there).
- **What stays fixed, deliberately.** The cart bar and the grocery CTA band keep their 416px pill
  width at every viewport — a pinned money control should not stretch to a screen's width. The
  display type scale is the phone's at every width (a reviewers' nice-to-do, filed). The checkout
  stays one narrow column: the two-column checkout and the two-column /track and /account are the
  same decision as a true desktop shell, and Min made it on 2026-09-07 — option A, the centred
  column, so the money and status pages keep the 34rem cap and a two-column shell is not planned
  (F12 closed).
- **Reviewer claims that did not survive the source.** Five of the eleven reviewers measured
  controls under 44px from screenshots — the sheet's ✕ (32px disc), the rail's pause coin (26px),
  the ambient's pause coin, the promo Apply and the slot pills (~42px), the menu Add pills (~41px).
  Every one is a 44px box in the stylesheet or the inline style, with the smaller disc painted
  inside (`background-clip: content-box`, an inner `span`, or padding). A screenshot measures paint,
  not the hit box; the source is the number.

## 19 · The counter — the second door on the Bill (A1)

A family restaurant settles at the register more often than on a phone, and the Bill moment used to
offer the phone or nothing. The rules that came out of building the other door:

- **One filled CTA, still.** "Pay · $X" keeps the hero; "Pay at the counter" is the ghost beneath it
  (`.checkout-cta-ghost`, a hairline, the receipt glyph), and it carries the SAME freeze gate — a
  table mid-card-payment is not sent walking. The way back from the counter card is the quiet
  `.nav-link`, last (§ the escape is a quiet link).
- **The ask is a state, not a modal.** It replaces the CONTROLS that shape a card charge (tip, promo,
  reward, the card CTA) and keeps the receipt rows and the total: the register settles exactly that
  figure, so the amount the diner shows at the counter is the server's, never a preview. Under the
  ask the tip preview is zero — the app charges no tip; a cash tip is recorded in the register's
  hand — so no number on the screen promises one.
- **Every phone at the table agrees.** The stamp rides the cart channel; a tablemate's tap lands on
  every Bill through the same `refresh()` that carries locks and tabs. The diner's own tap is
  optimistic (instant flip, revert-to-confirmed on refusal, the reason in the pay-error slot).
- **The floor names it "Pay at counter", not "Paying".** Nobody is paying yet; a person is needed. It
  wears the attention tone the paying/settling chips wear and sorts FIRST, longest wait on top — the
  floor is the register's queue for those tables, and a queue by table number would let the newest
  ask at table 1 cut in front of the family that asked ten minutes ago at table 9.
- **The close is a receipt, never "isn't available on this device" — and it names the tender.** A
  settled cart's read is gone for good; the Bill asks one question (`counterPayOutcome`, member-
  authorized) and leaves for `/track` only on a positive answer with an order this seat may see.
  When it cannot, the close says HOW the bill settled: "settled at the counter" for cash/Terminal,
  "paid on a phone at your table" for a tablemate's card — the two are different sentences, and the
  blind audit caught the draft saying the first for the second. An unknown tender keeps the last
  good bill; so does a failed read that is not a settle — the honest floor. The payer's own phone
  never sees a close: on the pay step the Payment Element's return is the exit.
- **A counter order stays readable after the table is cleared.** `is_member` needs an open session,
  so the live tracker cannot read a cash order once the register clears the table; `/track` goes
  straight to the uid-scoped server read, whose new arm is durable `session_members` membership
  scoped to the counter tenders — who sat there is not who paid, so a card receipt never opens
  through it.
- **The ask counts what the floor counts.** "Something to settle" is `state !== 'voided' && !comped`
  on both sides, or a fully-voided table gets a counter card while the register never sees a chip.
- **Parking is a constant.** `lib/surfaces.ts` is where a door is switched off, read both where the
  door is drawn and where it is answered. A hidden button with a live action behind it is a door with
  the sign taken down, not a parked one.

## 20 · The primitives — one button, one toast, one field, one heading (Phase 0)

Every interaction primitive lives in `@mms/ui` and is styled once in `packages/ui/src/primitives.css`
(`.ui-*`). Review them together on `/kit` (the preview, both themes).

- **Button** — `primary` is the one action a section exists for (never two filled pills side by side;
  the alternative is `secondary`, a paper card). `quiet` navigates or dismisses; `danger` is tinted,
  never solid. 44px is a floor at every size; `xl` is the counter/kitchen tap (`--tap-bump`). Disabled
  is `aria-disabled` and busy is `aria-busy` + a spinner at full ink — the component refuses the click.
  A link that looks like a button takes `buttonClass()`.
- **Toast** — the view's one live region: visible for news, corrections and claims whose origin is
  gone; `quiet` (spoken, not drawn) for an in-place change (§23) — unless the view's own region
  already speaks the fact: then the Toast is `live={false}` (no role, no aria-live) and only draws;
  the staff lane's xl Undo pill is the case, and a silent Toast can never be `quiet` (the type
  refuses it). Bottom-centred above the CTA dock,
  inverted and opaque. Its action is
  the pill's own ink, underlined (the pill inverts per theme, so a fixed accent fails on one of them).
- **Field** — label above, one note line below that is the hint or the error, never both.
- **PageMasthead** — kicker → display title at `--fw-semibold` → Burmese line → lede.
- **EmptyState `page`** — icon medallion (accent ink on `--grad`) → one heading → one sentence that
  names where the button goes → one button.
- **Type/weight/tracking are tokens.** `check:style-literals` holds the remaining literals to a ratchet.
- **The ambient room moves only under a pointer.** The phone drift is retired (F11); a clock-driven
  motion on the page ground would owe a visible stop control again (WCAG 2.2.2).

## 21 · The menu's first screen (Phase 1a — M133 reversed by the owner)

Masthead → toolbar → picks → dishes, in that order, so the first category and the first Add land on
a 390×844 opening screen.

- **The masthead is three quiet lines**: the door eyebrow (at a table it is the table's CONTROL,
  opening the exits sheet), the title "Menu" at `--fs-h1`, and one bilingual greeting line. No card,
  no exit tiles before the food.
- **The toolbar comes first** and stays sticky. Nothing that is not search, diet or navigation sits
  above it.
- **Picks are ONE static row with lenses**, on the category rail's own pills (`.menu-tab-on` is the
  selection vocabulary — never a new one). A lens with nothing to show is not offered. No marquee:
  motion that moves on its own owes a stop control and clips the edge card.
- **Rows tell you what the dish is** (a two-line description) and end in one round **+**.
- **One noun for the open cart**: "order" at the restaurant, "basket" at the market
  (`lib/order-noun.ts`).
- **A count is a claim** (the honesty rule, applied to a badge): publish one only from a view that
  SAW the cart (never an initial empty list), and never for a SHARED cart — a dine-in table's count
  is a tablemate's tap away from wrong, so the slot names it without a number.
- **An action is not a toggle.** A pill that does something each press (Surprise / Shuffle) wears the
  lit cap while its result shows but carries no `aria-pressed`, and hands focus to what it produced.
- **Horizontal scrollers bleed into the gutter** (`margin-inline: -gutter; padding-inline: gutter;
scroll-padding-inline: gutter`): a lit pill's lift shadow is otherwise sliced square at the
  scroller's edge, and a mandatory-snap rail snaps its first card flush to the screen.

## 22 · Commit moments (Phase 1b — W16c's confirms retired by the owner)

- **Undo beats "are you sure?"** A reversible commit (Send to kitchen) is one tap with a visible,
  server-clocked Undo. A confirm asks every diner, every round, to guard against a mistake the undo
  already recovers.
- **Name the sum on the control that charges it**, and put anything the diner should know about the
  charge BEFORE the tap, beside the button (the unsent-dishes note) — never in a dialog after it.
- **Keep a confirm only where it guards something no undo reaches**: a card hold committed for the
  whole table (the split share).
- **A rule that gates a money action is ONE binding read by both halves** (`payBlockedByUnsent`):
  the server refuses on it, and the control reads it to say why before the tap. A disabled control
  names what unlocks it and who can do it.
- **Steps that live in state still get history entries** (a hash per step), so the platform Back
  button walks them — and Back runs the same handler as the in-page back control, never a shortcut
  around its side effects.

## 23 · The add moment (Phase 1c)

Three layers, and only the first is instant: **intent** on the tap (press, ripple, haptic, the
pill→stepper morph, the digit and capsule pops, the pill's MicroBurst, the spoken claim), **receipt**
when the server view lands (the CartBar's subtotal roll), **reversal** when it did not (a settle cue,
a named correction, one focus landing). Amounts are never intent — the CartBar amount reads "—" until
confirmed.

- **The claim names the dish and is spoken at the tap**, not when a queued write starts ("Mohinga
  added" · "ထည့်ပြီးပါပြီ"; the copy lives once in `lib/add-feedback.ts`). A claim is never a count: in
  dine-in the basket count is a tablemate's tap away from wrong (§21).
- **An in-place change is spoken, not drawn.** The pill and stepper claims are `quiet` — they ride the
  Toast's live region and draw nothing, because the row already shows the change under the finger. A
  claim whose origin is gone is drawn: the item sheet closes on the tap, so "2 Mohinga added" is
  visible.
- **Every non-landing retracts the claim visibly, by name** ("Mohinga didn’t go through — the order’s
  locked while someone checks out."). The named sentences sit beside the unnamed ones
  (`namedRefusedWriteNotice` · `namedUnconfirmedWriteNotice`), held to them by parity tests.
- **The settle cue draws only a DEFINITE non-landing** — refused, or applied with no own line in a
  current view; never `unconfirmed` (it may be on the bill), never when the seat or view is unknown.
  It plays on the "+" glyph ("set back down", no overshoot, so it never invites a re-tap), never on
  the button.
- **The burst is the pill's alone** (v7.2 `quickAdd`); a stepper step has none (v7.2 `bump()`).
- **Focus lands once, never later**, and only when it was orphaned or inside the row: landed → "+",
  reverted → the pill (kept focusable as `aria-disabled` with its reason while a freeze holds it).
  Every refocus flag is one-shot and orphan-guarded, so a freeze lifting later cannot pull focus back.
- **The CartBar's entrance is spent by a CONFIRMED appearance** — never by a pending one.

**The one slot has a precedence** (`lib/notice-slot.ts`): every notice is a CLAIM, a CORRECTION or
NEWS. Empty → show; a correction over an identical correction → extend (five refused taps under one
lock are one sentence); two dishes' corrections of ONE family → the family's unnamed sentence, which
covers both (a second name must never erase the first dish's retraction); a claim over a live
correction → defer; a quiet line over visible text → defer; anything else → show. News never defers.
The deferred slot is one deep; a correction drops a waiting claim and news drops a waiting VISIBLE
one, so a retracted or superseded claim is never the last word. A "−" whose line changed before its
queued write ran retracts the claim it spoke at the tap.

**Rejected:** fly-to-cart (launches for adds that later fail), a check-morph on "+" (shows ✓ before
anything is confirmed), a haptic after the round trip (§3), a burst gated on confirmation (~1.7s
later, random in timing, so it cannot be learned).

## 24 · Removal — a row leaves in place, and focus stays where the diner is (Phase 1c)

- **A removed row is the arrival reversed, and the list closes over it.** `.mms-remove` is `mmsRise`
  played backwards on `--dur-base`; the row stays drawn as a GHOST (same node, `inert` +
  `aria-hidden`) while every count, total and write has already dropped it. Amounts are never
  optimistic: the ghost shows the line as last painted. A leaving row never writes, even where
  `inert` is unsupported.
- **The close is a FLIP measured in one synchronous block** (`useLineMotion`, rules in
  `lib/line-motion.ts`): the tail is marked `data-flip` (scroll anchoring off), measured, the ghost
  taken out of flow, measured again, and each delta played to zero on `--spring` — transform only,
  `composite: "add"` so quick removals compose. A ghost exists only while its section survives;
  emptying a section or the cart swaps the view in one frame.
- **Whatever moved under a finger is held from taps for `SAME_GESTURE_MS`** (350ms — Android's
  double-tap timeout plus a frame, exported once from `@mms/ui`). The same constant arms the
  Stepper's Remove: when "−" at qty 2 becomes "Remove {name}", that Remove ignores the second half of
  the same double-tap (every Stepper consumer, the staff line editor included).
- **A refused removal reappears in place** and the rows below slide down — the same measurement run
  the other way. Never an arrival idiom; the one live region says why.
- **Focus lands on the neighbouring dish's name** (next, else previous; `data-line-name`,
  `preventScroll`), before the write while the old control is still live — never on a control that
  repeats the action. The heading takes focus only when the view swaps. A peer's removal moves focus
  only if focus was inside the removed row, keyed on the removed id SET, never a count.
- **Reduced motion keeps every safety, none of the motion:** no ghost fade, no FLIP; the hold, the
  remove-arm and the focus landing still apply.

## 25 · The card form — one wait, one reveal, a way out that works (Phase 1c)

Decided by `lib/pay-element.ts`, drawn by `PaymentSection`.

- **Our skeleton owns the wait; Stripe's loader is off** (`loader: "never"`). The stage draws v7.2's
  `.sk` grammar in the Element's own geometry and reserves this device's last measured height (else
  `PAY_ELEMENT_FALLBACK_PX`), so the Pay button never moves. A wallet shape is drawn only where this
  device measured one — a first visit never implies Apple Pay.
- **The live form loads underneath, invisible and `inert`, and is revealed once** — when the card is
  ready and the wallet has settled or a measured grace has passed. Stripe fires `ready` under
  `inert` + `opacity: 0` (measured in Chromium, 2026-09-24).
- **The Pay control keeps its sum and states its reason.** `aria-disabled` + `aria-describedby`
  (loading / slow / offline / the failure's title) until reveal + `settleMs` (300ms), so a tap aimed
  before the layout moved cannot land. `payable` is named once — the button's attribute and
  `confirm()` both read it. Wallets skip the settle window (their sheet IS the confirmation), and
  every refused wallet confirm calls `paymentFailed`, so the sheet never spins.
- **Nothing can latch.** An in-flight ref read at call time blocks a double confirm; a rejecting
  `confirmPayment` is caught and clears every latch ("Payment couldn't start — try again."), so Pay,
  Edit order, Back to review and the pagehide release always come back.
- **A failure is an inline card whose one button can work.** Retry only after a real error (Stripe.js
  rejected, a network loaderror) — escalating to "Back to review" after two; a timeout, a bad key or
  an ended intent go back to review (naming the counter at a table). A retry re-keys Elements on the
  SAME clientSecret: no new intent, no amount change, no lock write.
- **Copy says only what we know**: "Nothing is lost"; an ended intent sends the diner to see where the
  order stands, never "you were not charged". Offline, the `online` event really does retry.
- **The iframe is a token mirror** (`lib/stripe-appearance.ts`, pinned by `check:theme`): the Field
  (§20) in Hanken at the 16px floor, the lit cap's flat subset for the selected tab (`--gold` fill,
  `--ink` label, `--ac` edge), white wallet buttons in Night, `disableAnimations` under reduced
  motion. The font is the byte-identical latin subset next/font ships, served first-party.

## 26 · Keeping what you earned (Phase 1c)

- **A door, not a copy.** The /track save card has one action — a link to /account, where the one
  save flow lives. Mounting that flow a second time was rejected (it reads `resume`, owns a live
  region, and carries every merge rule).
- **One rewards door at a time, decided once** (`successRewardsDoor`). While attribution is undecided
  no rewards link renders anywhere, so a door can appear but never vanish under a finger.
- **An ask on a success screen is quiet**: inline, mounted only after what sits above it has settled
  (so it never pushes the receipt's buttons), never takes focus, adds no live region, `secondary`
  CTA. "Not now" is remembered per device; two declines and the ask stops.
- **Only claims the data holds.** Asked only when this order earned THIS guest a Star; the count is
  the server total after attribution, never "+1"; "the reward you just unlocked" reads the same
  `rewardJustUnlocked` binding PaySuccess reads.
- **A disclosure before a costly tap names every cost** — and is the control's accessible
  DESCRIPTION, because a screen reader tabbing onto a labelled button skips the paragraph above it. A
  Welcome-back chip strands this phone's guest Stars AND its guest orders; the note promises to carry
  only what a save carries (the Stars and the orders that EARNED them — never a split share this phone
  only paid, M237).
- **/account reads now → you → what you own → the record → reference → settings**: today's orders
  first (seeded by the server, refreshed on wake and focus), identity, Stars with today's coupons,
  history, favourites, tiers, sound.
- **A resume is not an arrival — including the browser's Back.** PaySuccess latches its celebration
  per payment in sessionStorage; a remount of the same payment skips the confetti, the haptic and the
  chime.
- **No hash landings behind a loading boundary** — Next consumes the hash on the skeleton's commit.

## 27 · The market's front door (Phase 1c)

- **The door says only what the catalog keeps.** Browse is the default (`GROCERY_DEFAULT_DOOR`),
  because the catalog's barcodes are synthetic; `/grocery?tab=scan` is the in-store entry. Scan-first
  waits on real shelf codes (G22).
- **Ink box for the camera, paper for recovery.** The live states share one constant-`--ink` stage
  (identical in both themes — a camera image is not a themed surface); blocked · busy · no camera ·
  unsupported · in-app · failed are EmptyState panels with one action each.
- **The camera prompt follows a tap or a prior grant** — a primer first, never a cold OS prompt. A
  denial answered in under 400ms opens the settings help itself.
- **The camera runs only while the page is visible and the Scan door is open.**
- **The hold lifts on a LOADED basket, never a minted one** (`scanBasketReady`, pinned by
  `check:scan-repeat`): the jar in frame is judged against the basket's lines the frame the hold
  lifts, and a rejoined basket's lines are [] until its first read lands.
- **The lock says "read", never "added"**: the reticle's gold corners on a sighting; the server's
  verdict (haptic, toast, row) is the add. No sound (§15), no new haptic (§12).
- **The result sits where the eye is, and a miss persists** — inside the viewfinder, never below the
  fold. It is re-keyed per outcome and hands focus across its own remount, so "Add another" keeps a
  keyboard or screen-reader shopper where they were. A sheet over the stage SWALLOWS sightings (`decodeHold`), so nothing is added behind a modal.
- **Shelves of six, aisles as history.** One shelf per aisle with "See all {n}"; an aisle is a
  `#aisle-*` entry — home → aisle pushes, aisle → aisle replaces, so Back returns to the market.
  Chips are links with `aria-current` (the lit cap).
- **Money labels say pre-tax** ("Subtotal · before tax"); the amounts are unchanged.
