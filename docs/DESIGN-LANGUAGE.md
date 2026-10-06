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
  "captured"; "the person sending your table’s orders", never "the host"; "the code on the
  package", never "barcode"; "on the house", never "comped"; "another window", never "another tab";
  "table code", never "party code"; "as soon as possible", never "ASAP". The Order / Basket nouns of
  §21 still bind — plain words never fork a settled vocabulary.
  - **Plain must also be TRUE (blind review, 2026-09-24).** Name a ROLE by what it does, never by an
    event that may not have happened: a staff-opened table's host is simply the first diner who
    scans, so "the person who started your table" was false for every one of them. And a list is
    named for everything in it ("Today’s payments & refunds", not "Paid today" over a list that
    holds refunds).
  - **ONE word per concept, on one screen and across screens.** Two buttons on one ticket never
    share a word ("All done" for the ticket, "Done" for a line); one phrase for one choice ("as soon
    as possible" — the ⚡ belongs to the scheduler's "Earliest time" alone); one name for one state
    ("Card approved" on the board and on the payer's own screen); a help card names the button as
    it is drawn (the ⋯ glyph, "Cook now"). `lib/i18n/plain-words.test.ts` parses every dictionary
    and fails on the trade and payments words.
  - **Exception — historical records render VERBATIM.** A receipt records what the guest was told:
    the retired service charge's disclosure on a pre-2026-08-15 receipt repeats the checkout's
    text word for word, "(CA SB-1524)" included (`SERVICE_CHARGE_DISCLOSURE`, pinned). A record is
    never re-voiced, however plain the new words would be.

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

**On the staff console the language is a per-device setting (Phase 2e · lang, §17):** a device may
drop the chrome's English echoes (Burmese only) except on the K15-HIGH band — the words where a wrong
word would stop service — and on the language surfaces themselves; the pair stays, and the dish names
ON the kitchen ticket never change with the device (a dish named anywhere else — the order pad, the
mod sheet, the KDS's own messages — follows it; Phase 2e review, P1).

## 7 · a11y — the floor, not the ceiling

≥44px touch targets; **one live region per view** (new features route through it, never mount a
second); focus moves on remove/route/step change — and lands on **the user's own selection**, not
the app's default (the slot sheet focuses _your_ chip, not Soonest); toggles are `aria-pressed`;
decorative seals/emoji are `aria-hidden` with an sr-only twin saying it in words; controls stay
rendered-and-disabled with a reason, never vanish. **On a removal, focus lands on the neighbouring
item's NAME — never on a control that could repeat the action** (at qty 1 the neighbour's "−" IS
"Remove {next dish}"); the heading takes focus only when the view swaps, and a tablemate's change
moves focus only if it was inside what they removed (§24).

**The counter screen is one view with per-ZONE regions, and says why** (Phase 2d · split):
`FloorBoard`, `ExpoBoard` and `RegisterStart` each keep their always-mounted region because each
speaks a different fact (the room's state is `FloorBoard`'s — the tablet pane's freeze line is said
only while the floor's region is not already saying it); the tablet pane adds at most ONE at a time
— the mounted table detail's region, else the pane's own sr-only status. A zone never mounts a
second region for a fact another zone already speaks (§17).

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

**The staff pad's ticket speaks receipt too (Phase 3d · counter, K46).** It is the one
`buildReceiptRows` reader that renders a LIVE breakdown rather than a fulfillment-time snapshot — still
verbatim from the server (`TableDetail.settleBreakdown`, off the same `getCartTotals` call as
`settleTotalCents`), never recomputed, its Total the very binding Take payment names. It says "Tax"
without the rate beside it (the console's receipt words, one per row; the Bill's rate rule is the
diner's) — the K40 sweep owns "Tax" vs "Sales tax".

## 9 · Voice — a warm host, never a nag

Declining is never met with a reaction ("None" sits last and quiet; no guilt line). Generosity is
met warmly and proportionally (`tipReaction` climbs the ladder). Encouragement is a gradient
(`--tip-heat`), not a modal. Exits are named and honest ("Back to the start keeps your table ·
Leave this table lets this phone go — the table stays open for everyone else"). Every mode has a
door out; leaving is a navigation, never a server mutation.

**Where v7.2 has no string for a surface, there is nothing to copy verbatim (J29, 2026-10-06).** The
verbatim rule binds the surfaces the prototype draws; a per-door line under the greeting, a sign-in
refusal and the console's arrow pills are the house's own words — held to this section's voice and to
the honesty rule (each one's promise checked against the code that keeps it), never written into the
prototype after the fact.

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
- **A guest's phone is not a working device.** The kitchen chime plays at a fixed 0.8 (Phase 3d retired its slider — the
  device's own buttons are the dial, §34) because a cook must hear a ticket land across a hot line. The diner level is 0.22: loud enough for the person holding
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
  still answering. Six callers qualify (the refund, void/comp, no-show and modifier sheets, the
  report sheet, the cash confirm — the M82 guard's GUARDED list, discovered against every caller on
  disk); the others write nothing irreversible, or
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
  WCAG 2.1.2 if the flag ever strands. Drive it from component state set at the tap and cleared in
  the `finally` around a BOUNDED await (`boundWrite`, which answers by `STAFF_HANG_MS` at the latest)
  — never a bare boolean a branch can miss, and never a transition's `pending`, which is held for as
  long as the Server Action it dispatched is unanswered (LEARNINGS #200): on a hung network that lock
  holds for as long as the network hangs. The primitive cannot enforce this and should say so rather
  than imply it has; apps/qr's M82 guard (`lib/sheet-busy-callers.test.ts`) parses every guarded
  caller for the shape.
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
  control that does nothing is forbidden by §16. Amended (Phase 2e · lang): the language switch
  has LEFT every in-service bar, so trailing is the page's utilities, then Help, then Lock; only
  the four front doors keep the pill, passed through their bar's `trailing` slot (below).
- **The bar spans the viewport; the page's column sits beneath it.** `.staff-main` is the
  full-bleed ground (the LINES) with NO horizontal padding; the bar is its first child; the page's
  own max-width and inset live on a `.staff-col` wrapper under the bar. A bar inside a centred
  640px column is a strip, not a bar — the blind pass on PR 1b asked, and the mock had answered.
  Inside the KDS root the bar cancels the root's `--kds-pad` exactly, so it is flush without
  overhanging the root (an overhang past a bare `<main>` is a horizontal scroll on the board).
- **The bar is chrome you look through in Night** — `--glass-chrome`, the ONE frosted pane whose
  floor `composite-contrast.test.ts` pins over white; never a second alpha nobody measured. Paper
  with a hairline in light. Sticky, and it clears `env(safe-area-inset-top)`. On a scrolling page
  the bar is the only sticky element; an app-shell page scrolls its panes beneath it; nothing
  sticks above or beside it (a page-level sticky wrapper around the bar paid the notch inset twice).
  One amendment (Phase 2d · split): a DETAIL COLUMN — the counter's tablet pane — may stick UNDER
  the bar (`top: var(--staff-bar-h)`), and it never takes the notch inset; the bar already paid it.
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
  own comment called it the cap. The eighth is `.floor-card[aria-current="true"] .floor-card-label`
  (Phase 2d · split): the selected table card's NAME — a pick from a live list, so `aria-current`,
  and the cap on the name only, never the card's ground (below). The Phase 2d counter bell's chip is
  a `.staff-chip`, so it wears the sixth. The ninth is `.staff-lang-row[aria-pressed="true"]`
  (Phase 2e · lang): the language rows' pressed mode, which declares no fill of its own.
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
  On the language controls (Phase 2e review) busy is `aria-busy` plus a static stripe under the
  full-ink label — never dimmed (§17).
  Either way, never a label swap TO AN ELLIPSIS: `{pending ? "…" : label}` on a button with no `aria-label` makes its accessible name
  literally "…" for the round trip, and a 64px zone that collapses to an ellipsis moves under the
  thumb. A swap to a stated word is not that rule's subject — the register's Go says "Going…"
  (`reg.going`, both states echoing so the height holds), and only on the form that went.
- **Inset grouped rows** (`.staff-inset` · `.staff-row`) are the Settings idiom, Burmese first, a
  tinted glyph square, a disclosure chevron, hairlines drawn once per edge. Still one `role="list"`
  of real links, named by its visible heading.
- **Sheets, not chip rows, for settings** — the KDS text size opens from the bar's Aa circle straight onto
  the Help sheet's Text size view (Phase 3d — two taps, §34; §16 owns the Sheet's four exits); `Sheet.title` is a `ReactNode` so a dictionary title arrives
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
  — after the page's own utilities, before Lock (the language switch that once sat between them left
  the in-service bars in Phase 2e) — on the screens that have something
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
  send ok (Phase 2c inserts the settle line between writeError and degraded — below), and each
  setter clears the other, so no send line — of either tone — masks the
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
  text. The Send's refusal union (`lib/staff-send.ts`) is coded the same way. **Two raises from the
  write are DEFINITE, and are typed at the throw** (Phase 2d · P2dd · P2cy, the line RPCs'
  `'cart is being paid'` and `'line already sent'`, both SQLSTATE P0001 — `lib/line-rpc-refusal.ts`
  matches code AND message, never either alone): a settle freeze that landed between the add's read
  and its write is `CartPayingError` → `paying` (nothing was written), and a merge target that was
  sent mid-add falls through to a fresh draft insert under the same scan id — an add after a Send is
  a new line in the order model. `staffSetQty` and the diner's `setQty` name both refusals in their
  own sentences, never the outage copy.
- **One add, one key.** A staff add may carry a client-minted `addKey` (uuid) riding the existing
  `p_scan_id` ledger (`mms_scan_events`, claimed in the insert's transaction), so a resend of the same
  key is an idempotent no-op. An `unconfirmed` add is resent under the SAME key, never re-tapped
  under a new one; the key dedupes per EVENT, so mint one per add.
- **Every exit to the floor asks for it BY NAME.** The bar's back control, a closed-table bounce and
  a cleared table go to `STAFF_DOOR_TARGET.counter`, never a bare `/staff` — that resolves by the
  door cookie and can land on the doors screen. Since Phase 2d the in-table exits are bound ONCE in
  `TableNav` (`toFloor` · `toTable`): on the page they replace to the floor or the namesake table; in
  the counter's tablet pane the same controls close or switch the pane — and an exit that answers
  after the pane moved on never touches the table shown now.
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
- **The kitchen board's sound circle follows the engine.** `KdsChime.subscribe` sets the circle from
  the audio context's real state, so a tablet that slept shows the paused posture (warn ring + dot)
  and re-arms off the next tap — the volume slider is retired (§34). The sold-out tap and its Undo buzz
  at the TAP (`commit`), opening the ⋯ buzzes `pick`. Lateness is one module (`lib/kds-urgency.ts`);
  nobody restates the 8/12-minute thresholds.
- **Plain words on the console (owner, 2026-09-24).** §5's rule reaches the staff: "Mark sold out"
  / "Sold out" (never 86), "Done" (never BUMP), "Cook now" (never fire), "Later" (never held), "Bring
  back" (never recall), "Remove" / "Make it free" / "On the house" (never void / comp), "Running
  bill" (never tab), "Take cash" / "Take payment" / "Paid today" (never settle). The dictionary KEYS
  keep their old names (`kds.86`, `kds.bump`, `settle.*`) — a key is an address, not copy.
- **ONE polite region on the table page — the order card's (Phase 2c, P2r).** The reader panel SHOWS
  its status and SAYS it through that region (`onStatus`); the paid card and the
  closed-after-unknown notice are focused and named, never live. The precedence, written at the
  region: **writeError > settle line > degraded > send warn > send ok** — the settle rank is the
  settle gate's blocked warn, rendered VISIBLY, else the reader's status while its panel is live
  (sr-only there: the panel shows it). A line outranked in what is SAID stays SHOWN (aria-hidden):
  under the reader's status the region still shows degraded, else the send line. A settle FAILURE
  is an assertive `role="alert"` inside its own control, mounted only while it holds a sentence —
  never a second polite region. **Every line is a setter** and clears the ones above it that
  describe an older moment — the reader's status too: each change of it (`onReaderStatus`; the panel
  reports only a change of value) clears a standing writeError, so a refusal from before the collect
  never masks a money sentence, and one raised during a collect speaks until the reader's next
  status.
- **A refusal while money is already moving names who holds it, in the device language.** The
  server answers a typed code (`code: "inflight"`, `holder: phone | register | unsure` —
  `lib/inflight-refusal.ts`) and every settle control renders the holder's `settle.inflight.*` key;
  the page's paying banner reads the same holder (`detail.paymentHolder`) and says the same
  sentence. A failed share read is `unsure`, never "their phone" (`split_unreadable` still refuses —
  a new member of a shared reason union is audited at every `===` consumer, LEARNINGS #148). **The
  register's sentence never invites a blind retry:** it ends "If it still hasn’t finished in {n}
  minutes, ask the owner to check the card payments before you take payment again." The running-bill
  close's key is per ATTEMPT, so a retry after the freeze lapses mints a second off-session charge,
  and a landed charge whose webhook is late reads exactly like one that never landed — "try again"
  and "check the order" both send staff to that retry.
- **Settle actions are `@mms/ui` Buttons** (cash trigger · Cancel · Take; the reader trigger ·
  Cancel · Back; the card-on-file trigger · Cancel · Charge). A refused control carries
  `aria-disabled` as a SPREAD plus its own handler guard — never the primitive's `disabled` prop, so
  the handler is what refuses (and K35's native-only measure stays honest); busy is the primitive's
  `aria-busy` + spinner at full ink. A settle that lands re-reads the PAGE's own detail
  (`onChanged`), never `router.refresh()` — the detail lives in `FloorDetailLive`'s state, not the
  RSC payload.
- **A refused tap is never silent.** Where a dimmed control's reason is not drawn (the pad's phone
  bar, §28), the tap says it once through the view's one region; where it is drawn, the tap says it
  too, so one path serves every tier. **It re-says its reason on EVERY tap:** a same-value
  `setState` is a React no-op and says nothing, so the region's text is keyed on a per-refusal number
  (the diner's Bill: `sayRefusal` renumbers `statusSeq`) — a repeated sentence is a new node, a new
  announcement — and the refusal clears a standing pay error in the same region. **The region's written rule
  (J34):** it says the newest answer to what the next tap meets — a tap's own sentence and a freeze
  retire a standing pay error; an `unknown` hedge does not; "Ready to pay." does, honestly, because
  with the undo window open Pay and the counter are refused and a Send's outcome clears the error, so
  one stands there only when a write that started before the Send answered inside the window.
- **A programmatic focus target shows the keyboard ring.** A heading or control the page lands
  focus on (the settle section's `settle-h`, the order's `order-h`, the pad's ticket heading) never
  carries an inline `outline: none`, and a stylesheet drops its outline only under
  `:focus:not(:focus-visible)` — the global `:focus-visible` ring is how a keyboard user sees the
  landing (`lib/pad-shell-contract.test.ts` refuses a bare outline-off on any `.pad-*` rule).
- **An empty Save is refused, never a no-op.** Nothing typed and nothing saved is `aria-disabled`
  with a stated reason (`aria-describedby`, sr-only) and a tap says it once through the view's
  region; an emptied field over a saved value clears it (the pad's walk-up name, `padNameSave`:
  `save` · `saved` · `empty`).
- **The settle gate — the counter half of "Everything sent" (§22's binding; owner, 2026-09-24).**
  Every payment door — the cash sheet, the reader, the running-bill close, the order pad's Take
  payment and the diner's "Pay at the counter" — refuses while dine-in dishes are unsent. Staff
  doors read `staffSettleBlockedByUnsent(mode, units)`, which DELEGATES to
  `payBlockedByUnsent(mode, units, true)`: the console can always send, so the register has no
  hostless exemption; the diner's counter ask keeps the Bill's own binding with its host flag. `units` is one count everywhere
  (`kitchenDraftUnitsFromRows`; `detail.send.sendable` on the page). Counter orders and to-go drafts
  are never gated — they cook when they are paid.
- **The server refuses UNDER the freeze, BEFORE the totals, as a typed code** —
  `{ code: "unsent", units }`, a member of each door's refusal union. Inside a settle: freeze →
  unsent → totals → the quote compare (§29) → the charge. A refusal releases the freeze its own
  attempt took (cash through its `finally`; the running-bill close and the reader explicitly, before
  any PaymentIntent exists). **At the three staff doors the unsent read fails CLOSED** (Phase 2d ·
  P2dc, owner decision 5a, 2026-09-29 — it failed open through Phase 2c): `readKitchenDraftUnits`
  answers `null` on a read error, never a guessed 0, and `staffSettleUnsentVerdict(mode, units)`
  turns `null` into `unreadable` → the house outage sentence (`STAFF_WRITE_OUTAGE`, bilingual through
  `<OutageText>`), the attempt's freeze released, before any totals read or PaymentIntent. The
  promise "no payment over unsent dishes" is only true if an unverified gate refuses: a blip costs
  the cashier one tap, a false pass charges a guest for food cooked after they leave. Closed ONLY
  where the gate could ever refuse — the verdict delegates "would any unsent dish block this mode?"
  to `staffSettleBlockedByUnsent(mode, 1)`, so a pickup order's unreadable count changes nothing.
  The diner doors keep the fail-open `kitchenDraftUnits` (a guest refused at Pay on a blip has
  nobody to ask; the webhook fires the dishes at payment): the counter ask fails open on both its
  reads (host, drafts) and that is safe — the ask moves no money, and every charge behind it still
  refuses on its own (`counter-pay/unsent-host-read-fails-closed` pins it). **And the freeze now
  binds the adds in the DATABASE** (P2cy): the three line RPCs take the cart row `FOR SHARE`, which
  conflicts with every settlement claim's `UPDATE … settle_at`, and refuse under a fresh freeze — so
  an add either committed before the claim returned (and the gate's read sees it) or waits and
  refuses. Before, a dish added a millisecond after the gate's read rode the reader's
  PaymentIntent and fired after pay.
- **A gated trigger stays rendered, with its amount** — dimmed by an `aria-disabled` spread plus its
  handler's guard, its `aria-describedby` reading the page's note first. The note
  (`#settle-unsent-note`) is the settle section's LAST child, so its unmount after a Send moves no
  trigger: warn ink beside an aria-hidden glyph, the words carrying the meaning, body leading
  (`--lh-normal`; a Burmese run keeps its own `--lh-my`), never a live region.
- **A refused tap names the fix and goes there.** The region says the sentence at the settle rank,
  visibly, and focus lands on the fix: the Send for cash or the reader (scrolled to centre — the
  region line sits right under it), the order heading for a running-bill close (scrolled to the TOP
  — the lines to remove are below it); `auto` under reduced motion, then focused with
  `preventScroll`. **One sentence per bill, whichever door was tapped:** the note, the region line and
  every trigger's raced line read ONE binding, `runningClose = settlePrimary(tab) === "secureTab"` —
  a card-on-file running bill says "send them, or remove them if the guest has left" everywhere,
  every other bill "send them first, then take payment". The line retires on a send outcome, on any
  other setter, or on a LATER read showing nothing unsent — never on a read already in the air when
  it was raised (`settleGateAfterCommit`); it names the live count once the page has read the
  drafts, the server's own before that (`settleGateUnits`).
- **A raced server refusal** (a dish landed after the page's last read) renders the dictionary
  sentence with the SERVER's count, never the server's English: inside the cash sheet's one alert
  (the modal hides the page's region; the jump waits for the sheet's close), beside the reader and
  running-bill triggers as plain shown text (the page's region says it — no second alert). That
  line is DROPPED, not hidden, the moment the page catches up — it reads the table blocked, or its
  own gate line retires (`gateLive`). Hidden, it came back under a live trigger after the dishes were
  sent.
- **The diner's counter button keeps the Pay button's rule** (§22): dimmed while the table has
  dishes to send, the unsent note on the same Bill stage, and a tap on the dimmed button repeats the
  reason in the Bill's status line — to the host as the fix, to a guest as WHO sends
  (`counterUnsentTapCopy`, the note's own split). The server's refusal goes to whoever asked, so it
  orders nobody: "Everything has to go to the kitchen first — then pay at the counter."

**Phase 2d — the floor, the counter bell and the tablet split (2026-09-29, owner decision 5c: "as
recommended").** The counter's room map and its one-tap start, a bell on the counter home, and a
master-detail split on a tablet. The rules as built:

_The floor — the counter's room map and its one-tap start._

- **The strip is the map AND the start.** One tile per ACTIVE registered table (`qr_tables`),
  ascending, from the SAME snapshot the cards render (`tableStrip`), so a tile and its card never
  disagree. A FREE tile is a `<button>` — the number over "Start" on a 2px DASHED `--t2` edge (the
  empty-seat shape); an OCCUPIED tile is a `<Link>` to the table — the number over one glyph, its
  tone carried by a 4px inset bottom bar AND the glyph (never colour alone); the ask (a table waiting
  to pay at the counter) is the one FILLED tile (`--warnb`). 5 across on a 390 phone, one row on a
  tablet, tiles `minmax(--s15, 3 × --s8)` (60–96px). An empty registry draws no strip (never a dead
  control). The strip list is named once — the visible label names the `<ul role="list">`
  (`aria-labelledby`), with no wrapping group of the same name (heard twice).
- **The strip carries its KEY.** Under the tiles, one line decodes every glyph on screen in the
  tile's own word (`stripKey`: one entry per status word present, the ask first, then the owed-Send
  dot) — a map with its legend, so a person who has never used a POS can read a taken table without
  opening it. `aria-hidden`: every tile's name already says its word. An all-free strip has no key.
  A key, not a word on each tile: a word on a 60–96px tile wraps unpredictably in Burmese.
- **A table owing a Send is marked on the map.** A `--warn` dot in the tile's corner (a shape, not a
  tint — the tile's tone is untouched) whenever `owedSendUnits(table) > 0` (the fold's ONE count),
  and the tile's name gains the card's own "· 2 not sent". The dot carries no number: the count is
  said once, on the card.
- **One mint lock per screen.** `CounterMintProvider` wraps zones 1–2; Walk-up, Phone order and every
  free tile start through `useCounterMint().run`, the ONE place a start is admitted (tap-time ref;
  `minting` names which control went; every start control `aria-disabled`, the minting one
  `aria-busy`; never native `disabled`; a landed start holds until the route swap; a refusal or a
  rejection re-arms). The hook throws outside the provider. A caller's "new tap" work rides `onStart`
  (only for a start that goes, before the server is asked), never a pre-check of its own — a
  pre-check in every caller made the lock's own ref check unreachable (its mutant survived).
- **The lock is its own start, never a transition's `pending`.** `held`/`isBusy` read
  `inFlight`/`minting` alone: React entangles every pending async transition, so a `pending`-read
  lock stayed held while the expo lane's or the approvals queue's action ran on the same page.
- **A start that lands after the screen is gone never navigates** (a mounted ref, re-armed at
  setup): the router is global, and the push would yank the person off the table they opened from a
  card. The start still landed; the next poll shows it. Nor over a pane that MOVED since the tap
  (Codex round 1 on #306): the pane publishes a `selectionGen` — new on every pick of another table
  and every close, kept by a re-tap — compared beside the table id, so a move that comes back
  (A → B → A, the floor → A → ✕) is still a move; the start stands down and the lock re-arms.
- **The ONE tile starting says so:** full ink (`.floor-tile[aria-busy]` out-orders the held dim) and
  the kit's `.ui-btn-spinner` beside its KEPT verb — the primitive Button's busy shape, so the name
  still contains what the tile shows ("Starting…" does not fit a 60px tile).
- **A start whose answer never came is UNKNOWN, never "not saved".** A rejected server action is
  caught (the error boundary never replaces the counter screen) and said as `floor.mint.unknown` — the
  next poll shows the table taken if it landed. `created:false` (a diner scanned first) opens the
  seated table, never its add screen (`mintLanding`).
- **A stale-free tap never mints.** A tile that flipped occupied → free within `FLIP_GUARD_MS`
  (600 ms) ignores the tap (`createFlipGuard` in `lib/floor-rows.ts` — the memory and its injected
  clock live in lib; the strip only asks). Focus survives a tile's button ↔ link flip, and only when
  the element was REPLACED under it: a blur with nowhere to go is re-read after the event
  (connected and no longer active = a click on something that takes no focus → forgotten;
  disconnected = replaced → restored; still active = the page lost focus → kept).
- **The Start zone is two controls.** Walk-up is the zone's ONE primary (the primitive Button, `xl`,
  block); Phone order the `.staff-arm` beside it; while the Phone form is open its Go is the primary
  and Walk-up steps down to secondary. Stacked on a phone, `2fr 1fr` from 48em (`.reg-start`). The
  typed "Start a table" arm is gone — the strip is the table start. One Burmese verb for starting on
  the counter screen, ဖွင့် (the strip's Start, the Phone form's Go, the help line), pinned across
  namespaces by `strings.test.ts`; the occupied tile's verb is ကြည့် ("View").
- **The kitchen row says what the kitchen has, in the wall's words.** `2 not sent · 3 in kitchen ·
1 ready to serve`, or "Kitchen done" alone — never over an unsent dish. "Not sent" is 2a's one
  count (`staffOwedSendUnits` — what staff can act on, owner decision 5c) and the one fact a server
  must ACT on, so it is `--warn` bold (bound to the segment's own `data-seg`); "in kitchen" is
  `--tx` bold, `PULSE_COOKING_STATES` past the send grace; "ready to serve" is `--ok` bold, the
  wall's `PULSE_PASS_LINGER_MS` window and the wall's own words. Never "ready" as a claim anyone ran
  the food. The row's glyph is the flame — the Kitchen door's own glyph (`StaffDoors`, the nav),
  naming the row, not claiming anything is cooking: showing it only while something cooks would make
  one glyph mean a place and a state.
- **The wait is the kitchen's own rule in whole minutes.** `floorWait` → `kdsUrgency('dinein', …)` with
  the configured thresholds; from one whole minute; ok quiet, amber the gold-tint pair with a gold
  edge (its shape cue), red the warn pair with an edge and the alert glyph. A LEAF with its own 15 s
  clock (skew-corrected once per `serverNow`); the board and the card re-render only on the poll.
- **No loop on the counter.** The pill replays the kit's one-shot `.mms-pop` only when its level RISES
  between ticks; "ready to serve" rings the card's existing one-shot `.floor-card-pulse` once.
- **"Ready to serve" is keyed to the EVENT, never the count** (Codex round 1 on #306). Each served
  line inside the wall's window carries its bump's key (`<line id>@<bumped_at>`, `FloorKitchen.upKeys`
  — pushed in the same branch that counts it, so the key keeps the window's own rule), and a card
  rings once for a key its table has not heard: never on first sight, a recall or an expiry (a key
  leaving is not news). What each table heard is KEPT while it stays on the floor (`heardUp`), so a
  dish that drops out of one poll and comes back never rings twice. A count compared between polls
  missed a dish that came out as another left the window or was recalled — the two netted to zero.
- **One status word per state across tile, chip, key and name — and never a success word over
  returned money** (`floorStatusKey`: a refunded paid table reads Refunded / Partly refunded).
- **One ink per tone across tile, edge, key and chip.** The chip's inline pair (`CHIP_TONE`) is
  pinned to each tone's `--floor-ink` by a parsing test. `returned` is the MUTED pair everywhere
  (`--t2` ink, `--t3` bar, the chip on `--sf`) — never `--ok`, and never the act-now `--warn`, which
  means "a person or money is moving now" (the ask, a payment in flight); a refund done is neither.
  The drill-down header chip reads the same.
- **The card wears a status edge** (a 4px inset rail on a full-card overlay so it follows the card's
  corner; `rest` has none) and its clock reads **"Opened {ago}"** (the session's start), not last
  activity.
- **The board's ONE region, with a written precedence:** a strip refusal (`ERR_DWELL_MS`, the
  kitchen's "a refusal outlives the poll that follows it", cleared by the next start) > the freeze >
  "Ready to serve — Table 7" (`UP_NOTICE_DWELL_MS`, its own fact, set equal to the refusal dwell and
  documented against it) > the counts, which gain "{n} waiting to pay at counter" whenever a table
  asks. The strip, the tiles, the key and the pill mount no live region.
- **Cards never re-sort by status.** The grid keeps the floor's stable order (`mergeFloorRows`); the
  strip carries the map. The card grid's minimum is `min(100%, 18rem)`.
- **Tone changes are instant** (`.floor-tile` overrides `.staff-press`'s box-shadow transition); only
  transform and opacity move.
- **The floor stops behind a locked console** (K14's floor half): `getFloorView` answers
  `{ ok: false, reason: "locked" }` and the board goes to `/staff/lock`.

_The counter bell (owner decision 5c)._

- **The counter HOME rings, and nothing else does.** A `CounterBellProvider` sits inside the counter
  branch's `LiveConnectionProvider` (`CounterLive` in `app/staff/page.tsx`), and a board outside it
  rings nothing. Two phrases, each opening on a pitch no other phrase in the app opens on — **guest**
  (E6 twice: a table asking to pay at the counter, a pickup guest's "I'm here", a scan-and-go basket
  waiting at the exit check) and **food** (D6 → A5: a to-go bag the kitchen finished, not yet
  bagged, whose guest is not already standing there). A fixed 0.6 — a working device in a dining
  room, louder than a guest's phone (0.22), quieter than a hot line (0.8); the device's own buttons
  are the dial. It rings while the tab is hidden for as long as the browser keeps the page and its
  audio running — a hidden tab's polls are throttled, so a ring there can lag, and nothing promises
  instant. No nag: a guest still waiting after the ring gets no second bell. Sound is never the only
  feedback — every event already has its visible half (the floor card's status ring and chip; the
  lane card's ring and its "Here now" / "Kitchen done" badge).
- **A bell rings once per EVENT, never per poll — and never twice per DOCUMENT.** A ring is a fact
  KEY this document has never heard (`lib/counter-attention.ts`): an ask is `ask:{session}:{stamp}`,
  an arrival `here:{order}`, a basket `verify:{order}`, a finished bag `food:{order}`. What the
  counter home has heard is ONE document-scoped set (`counterHeard` / `rememberCounterHeard`,
  `lib/counter-sound.ts` — merge-only, never pruned, never per mount): each board mount's first GOOD
  facts are merged into it silently (the mount, a StrictMode replay, a reload, a lane that mounted
  into an outage — it seeds on its first good poll), and every good poll grows it. So a flap (the
  advisory kitchen read's done → unknown → done, a KDS bump-undo, an ask's counter → paying → counter
  with the same stamp) rings nothing twice, and neither does a REMOUNT whose `initial` is older than
  its last good poll (Back restores the counter home from the App Router's client cache with its
  first load's props; an error boundary's reset; a re-parent). Only a good poll reports; a frozen
  board says nothing, and on recovery only keys never heard ring. One ring per poll (a guest outranks
  food), and the provider refuses the same kind again within `RING_GAP_MS` across both boards (two
  boards on one tick are one bell) — except a guest after food: a person waiting is never swallowed
  by a bag.
- **The bell rings on the counter home and nowhere else — including a poll that lands late.** The
  provider's `ring` returns early once it has unmounted (a mounted ref, re-armed at setup), each board
  keeps an `alive` ref around its ear and its card ring, and the chip keeps a late arm's answer (the
  tap asked for sound) but plays no volume check once it has left: the engine is a document singleton
  that stays armed across the trip to a table, so "the view is gone" must be checked, never assumed.
  Nothing on the ring path reads whether the tab is visible — it rings while hidden.
- **The bell's control is the counter's own chip, not a bar circle** (a fifth circle overflows a 390
  manager bar — the kitchen, with no role badge and no approvals circle, carries its sound as a bar
  circle since Phase 3d, §34): a `.staff-chip` at the right of the greeting (`.staff-greet-row`,
  counter branch only — the doors' greeting is unchanged), wearing the ONE lit cap through the shared
  pressed list when on. Three postures from two stores (§15 — "wanted" and "armed" are two facts, each
  read through `useSyncExternalStore`, both OFF on the server): **"Turn on sound"** · **"Sound on"**
  (lit) · **"Sound off — tap to turn on"** (warn hairline + ink, `data-muted`: wanted, but the context
  is not running). iOS arms audio only inside a gesture, so the chip's tap IS the arm — started
  synchronously in the handler, raced against `ARM_TIMEOUT_MS` so a resume the browser leaves pending
  never holds the chip busy; on success it plays the guest phrase once (the tap is the volume check)
  and leaves a plain, non-live hint for 8s ("Didn't hear it? Turn up the volume and check this device
  isn't on silent." — device-neutral: most Android phones have no silent switch); a refusal is an
  alert that never blames the volume or silent mode, and it is DROPPED (a guarded set-during-render)
  the moment the context runs — a resume the browser let through after `ARM_TIMEOUT_MS` must never
  leave "tap to try again" beside a lit chip whose tap mutes. Both lines FLOAT under the chip
  (`.staff-sound-line`: absolute from the relative `.staff-greet-row`, the chip's `--sf` ground with
  `--sh-md`, under the sticky bar, `pointer-events: none`, `.mms-rise` in) — in the flow they pushed
  the whole counter column down a line and pulled it back 8s later, under a finger. Only the chip's
  own tap takes its lock (aria-busy + aria-disabled, label kept). While PAUSED, the next click or key
  anywhere else — or the tab coming back into view — re-arms SILENTLY and lock-free. The arm asks for
  WebKit's `playback` audio session where it exists, so an iPad's silent switch does not mute the bell
  (the chip is the counter's mute). The engine is a module singleton, so the arm survives the soft trip
  to a table page and back; a reload loses it and the chip says so.
- **One word per action on every sound chip.** `soundWord` (`lib/counter-chime.ts`) is the ONE
  posture → word map, read by the counter's chip and the kitchen's circle. The KDS, the TV and the
  counter share the OFF word —
  "Turn on sound" (`kds.sound.enable`, `board.sound`), the same "turn on" the paused posture says —
  and plain-words bans "enable" (settings-speak).
- **One "just changed" ring on the counter screen.** A lane card the bell rang for wears the floor
  card's own `.floor-card-pulse` (keyed per event, cleared on its own timer, RM → none) — never a
  third ring class. It shows whether or not the bell is on.

_The tablet split — K24's counter/table half._

- **The counter splits on a tablet.** `/staff?floor=1` is a master-detail: the counter's zones in
  `.staff-split-main`, the selected table in `.staff-split-pane` beside them. ONE mounted tree
  (`CounterSplit` wraps the zones; the bell provider and the boards are never remounted across a
  breakpoint) — CSS decides the shape: below 48em today's column (a selection takes the column, the
  floor stays mounted and polling, just not displayed); 48–64em side by side only while a table is
  open (`data-pane="open"`); ≥64em the pane column is always there with its empty state ("Pick a
  table"), so the grid keeps one shape all shift. Breakpoints are named once in `lib/floor-pane.ts`
  (`PANE_QUERY` / `PANE_IDLE_QUERY`) and parity-tested against the two `display: grid` rules.
- **The selection is the URL hash** (`#table-<uuid>`): a reload keeps it, Back fires `hashchange`, a
  link can name it. **One entry deep:** open pushes, a switch replaces, close walks back only over an
  entry THIS mount pushed (hash AND `history.length`), otherwise it replaces to `#floor-h` — never an
  empty hash, never a same-hash neighbour. Writes carry no `__NA`; a native fragment entry (the
  approvals circle) is synced into Next's canonical URL on `hashchange`. A zone jump keeps the table
  beside it at split width and clears it below 48em.
- **A card tap opens in the pane only for a plain primary click at split width, read at CLICK time**
  (SSR never guesses a width); cmd/ctrl/shift/alt, a middle click and every phone tap keep the real
  link to `/staff/table/[id]`. Occupied strip tiles, a start that converged on a seated table
  (`created:false`), the order pad's "← Table 7", its Done and its Take payment land in the pane the
  same way (`SplitAwareLink` / `tableDestination`); `?settle=1` rides in as a one-shot param.
- **The pick cap.** A selected card carries `aria-current="true"`, the console's ONE lit cap on its
  NAME only (`.floor-card-label` joins the shared rule — a pick from a live list, not "you are here";
  never the door's 18%-gold ground, where Night --t3/--warn/--ok fall below AA), a gold edge and a
  `--glow-gold` halo restated on `:hover`/`:active` so the press never erases it. The label carries
  the cap's padding at rest, so selecting paints and moves nothing.
- **The pane is a column, not a card and not a page:** sticky UNDER the bar (the amendment above: a
  detail column may stick under the bar and never takes the notch inset), its own scroller
  (`overscroll-behavior-y: contain`), an opaque `--pg` head with the table's name (h2, one line,
  ellipsis) and a 44px ✕; no `<main>`, no second bar, sections h3 (Tables › Table 7 › Order). The
  scroller reserves the dock's bottom space (`--tap-bump + --s8 + safe area`), so its last controls
  never sit under the lane's Undo pill.
- **Focus.** On select the pane heading takes focus ONCE (preventScroll at split width); it renders
  from the tapped card's hint, so focus never moves when the detail lands. Close: a cleared table →
  the floor heading (its card lingers until the next poll); a control close → the card/tile that
  opened it, else the heading; a Back close moves focus only from inside the pane or `<body>`. The
  pane's catch-all owns only focus INSIDE the pane. Escape closes — never over a sheet that handled
  it, mid-IME-composition, or from inside a field.
- **The freeze is one fact, spoken once:** the pane's frozen line always SHOWS; it is SAID only while
  the floor's own region is not already saying it (`paneFreezeSpoken`, the lane's rule).
- **The paid card follows its table:** stashed in this tab's sessionStorage (`mms-handoff:{id}`,
  register's canonical shape, display-only, try/catch) inside the settle's own callback, so a settle
  that lands after a switch still leaves its #CODE; restored on reselect without stealing focus;
  removed on ✕, Escape, Back and Clear. Restored in the PANE only — the full page (a phone) keeps its
  card in memory, as before. **A card a newer round superseded is dropped, never merely hidden**
  (Codex round 1 on #306) — from the screen and from the stash, on the page and in the pane
  (`handoffSuperseded`): superseded by a different live cart, or, with no cart open, by a latest paid
  order (`TableDetail.paidOrderId`) that is not its own — an unknown latest keeps it. A card only
  hidden read as current again once the next round paid with no tender, showing last round's total
  and change as this one's.
- **A write lost behind a switch is said, with its way back.** A refusal that lands after the pane
  moved on or closed ("A change on Table 7 didn't save — view it to check.") is shown with a one-tap
  "View Table 7" (`Button`) and said through the view's one region; with no table open it sets
  `data-pane="lost"`, which below 64em shows just that line above the floor (the floor keeps its
  place). It is never filtered by the selection: only an unmounted detail reports it, so even the
  same table shown again never issued that write. **A lost outcome outlives every pane move that
  does not answer it** (Codex round 2 on #306): a payment refused or unanswered on a table the person
  left may have to be collected again, and a dish that never saved may still be on the bill, so ✕,
  Escape or Back on another table leaves the line standing (`close` never clears it). Only going back
  to ITS table clears it (its View, its card or its tile — `select`), or a newer loss that outranks
  it (`nextLost`: a dish's never replaces a payment's; one slot, so a second payment's does — P2eq).
- **A live card payment holds the pane** (Codex round 1 on #306). While the reader is taking a card
  on the table shown — or the charge went through and the order is being recorded — every change of
  table is REFUSED (`paneSelectionHeld`, checked first in `CounterSplit`'s one `select` and one
  `close`): a card or strip tap, a lost write's View, a Start that converged on a seated table, ✕,
  Escape, Back and Forward. The reader panel's poll is what keeps the payment's hold alive and
  records a counter order's #CODE; unmounting it mid-collect stopped both. A refusal moves nothing:
  the pane and focus stay, a refused tap buzzes no pick and records no opener, and a refused
  Back/Forward puts the paying table's entry back, so the URL never disagrees with the pane. It is
  SAID in the detail's ONE region, beside `writeError` at the top of its precedence and in `--warn`
  ("Finish the card payment first." — `floor.pane.payingHeld`). It never strands: the hold ends
  with the collection (declined, cancelled or recorded; Cancel is on the panel, and a recording past
  20 s offers "Back to payment"), the line goes with it, a re-tap of the table shown is not a change,
  and a table CLEARED (a server fact — the server refuses a Clear mid-payment) is never held. **A
  start is held too** (Codex round 2 on #306): a start moves no selection, but its landing leaves the
  pane all the same — a new order's add screen replaces the counter screen, and the reader panel
  with it. So while the table shown is collecting (`paneStartHeld` — a stale report about another
  table holds nothing), Walk-up, Phone order and a free tile are refused at the tap, before the
  lock, the haptic or the server (`CounterMint`'s `run` asks `startHeld()`): no order is made,
  nothing navigates, and the same line is said in the same region. A start already out when the
  collection began stands down as it lands, silent and re-armed like a move (P2es); a converged
  table at split width still goes to the pane first and meets its refusal. Opening the Phone form is
  a pick, not a start, and is never held. Not held yet: a reader START in flight (P2en) and the
  phone's table page (P2em).
- **A read belongs to a PICK, not an id** (`gen`): a table picked again (A → ✕ → A, A → B → A)
  starts in loading and reads afresh; a re-tap of the table shown keeps its live detail. The first
  read runs once per pick — never per render (`selectedNow` is one stable callback): a re-run would
  land a `closed` past the detail's terminal hold.
- **The in-table exits are bound to their table** (`TableNav`): a Clear or Merge that answers after
  the pane moved on (or closed) never closes or switches the table shown now; the control's own work
  (the server write, its stash drop) still happens.
- **A closed table keeps its name:** `getTableDetail`'s `closed` verdict carries the session's label
  and number, so a pane opened straight onto it (a reload, a deep link) names it and offers the live
  namesake; a settled read with no name shows a neutral "Table" head, never the loading skeleton. The
  closed notice takes focus when focus was in the pane BEFORE the swap (sampled in `onClosed`).
- **Motion:** the cap, head and 48–64em reflow are instant (layout never animates); the pane body
  rises once per selection (`mms-rise` at `--dur-base`, keyed), RM-escorted. **Staff routes opt out
  of the J1 root drift** (`html:has(.staff-main) { view-transition-name: none }`): every staff Back
  is instant.

**Phase 2e — the staff language, three ways, per device (2026-09-29; owner decision 2,
2026-09-24).** Burmese only · Both · English is one setting per device, and the language pill leaves
every in-service bar. The rules as built:

- **The language is a device setting, three ways.** Burmese only · Both · English, stored in the
  existing `mms_staff_lang` cookie as a MODE (`"my-only" | "both" | "en"`), while every component
  still receives a SCRIPT (`"en" | "my"`) plus one boolean, `echoes`. The two literal sets never
  overlap (`"my"` is never a mode), so passing one for the other is a compile error. **Both is the
  default and renders exactly what `"my"` rendered before P2e**; an absent or legacy `"my"` cookie
  is Both; a rollback reads both Burmese modes as `"my"` — it can never turn a device English. "This
  device" is really this browser's cookie jar (an iPad Home-Screen app and Safari keep separate
  jars; clearing site data resets to Both) — both directions fall back to the default, which drops
  nothing.
- **Where it lives.** It left EVERY in-service bar (a mis-tap target 10px from Help and Lock, ~152px
  of tablet bar). The four FRONT DOORS — the sign-in form, `/staff/lock`, the outage shell, the error
  screen — keep the two-script pill exactly where it was, passed through their bar's `trailing` slot
  (`StaffBar` mounts none). Mid-service it is two taps away: a **Language** row in the Help sheet on
  the kitchen and the counter, BEFORE "Something's wrong" (the report stays LAST). Every other screen
  reaches it through the doors' More, whose LAST tile is **Language** → `/staff/login?show=lang` (a
  query param, never a `#hash` — §26), the Profile's language card, the pressed mode focused on
  arrival. The Help row, its title, the More tile, the Profile card's heading and scope line and
  every failure line are **both scripts on every device and in every mode**
  (`<Chrome lang="my" … keepEcho>`): the way back must be readable by whoever the current mode is
  wrong for.
- **The rows.** Three rows, Burmese only · Both · English: the autonym sample (component constants,
  never keys — `မြန်မာ`, `မြန်မာ English` with a literal space, `English`) is the accessible name; the
  mode's plain description rides `aria-describedby` in the device's own mode; a tick on the pressed
  row so the state is never colour alone. The pressed row wears the ONE lit cap (the shared selector
  list) and declares no fill of its own; its description takes the cap's ink. 64px rows,
  `.staff-press`.
- **Burmese only drops the ECHO, never the PAIR, and never on the K15-HIGH band.** An echoed
  `<Chrome>` keeps its `.chrome-pair` wrapper with ONE child (every Burmese size rule is
  `.x > .chrome-pair > [lang="my"]`); no middot, no `.chrome-en`. A key in `STAFF_K15_HIGH` — "the
  strings a wrong word takes SERVICE down over", wider than food and money (the logins and lock-outs,
  the outage and connection lines, the report's outcome, the late and held tickets, the money words)
  — keeps its English line whatever the device (the shared kitchen tablet's cross-check, Dad's
  line), so adding a `// K15-HIGH` marker is a display change too. The Burmese-only row says exactly
  that, in the band's own words ("English stays where a wrong word would stop service"), and never
  "only". `keepEcho` is confined by `check-staff-lang` rule 6 to three files, a literal `lang="my"`, a
  literal echo and a LANGUAGE KEY (a literal `shell.lang.*`, or the More tile's `k={t.k}` in
  StaffDoors) — and to the `<Chrome keepEcho>` ATTRIBUTE: `keepEcho` as data (a `createElement` /
  `jsx()` props object, a spread object, a property access) is refused in every shipped `.ts` /
  `.tsx` file (review). The dish text ON the kitchen ticket (`TicketText`, and `TicketDishTitle` in
  the ⋯ sheet and the Text size preview — Burmese over English in every mode) and the P2m/K25
  English never change with the mode, and the note under the rows says that and nothing wider: "Dish
  names on kitchen tickets never change with this. Some screens aren’t fully in Burmese yet." A dish
  named anywhere else follows the device — the pad's tiles (`padDishName`), the mod sheet, the KDS's
  own messages (`dishVisible`). The first draft's "Dish names and kitchen tickets never change" was
  false (review P1); the claim is pinned word for word in `KdsBoard.test` beside a render of the
  ticket's dish text under all three modes. No provider (the wall TV) keeps every echo.
  **Accessible names follow the same decision (review A5).** `echoDrawn(key, shown)`
  (`lib/staff-labels.ts`) is the ONE echo decision — `<Chrome>` calls it with
  `useEchoesShown() || keepEcho`, `chromeVisible(lang, key, echo, shown)` with the device's
  `shown` — so a Burmese-only name holds exactly the Burmese the control shows, and a composite
  name (`CounterOrderCard`'s `subjectOf`) keeps the card's text as ONE contiguous run (WCAG 2.5.3).
  `al()`'s echoed arms require `shown` beside `echo`; every call site reads `useEchoesShown()`.
- **One write chain, host-owned (`useLangModeWrite`).** The in-flight guard is a REF read at tap
  time; a tap while a write is out only replaces the intent, and the writes serialize so the LAST
  pick wins (§4.2) with ONE refresh at the end; the cap moves at the tap and snaps back to the
  CONFIRMED mode on every failure (§4.4); every write is `raceTimeout(…, 15 000)` inside try/catch,
  so a refusal, a rejected Server Action and a hang all end as the failure line — never the error
  boundary. A write the timeout gave up on is not cancelled — Next (16.2.9, read from its source)
  sends Server Actions one at a time through the router's single queue, and a cookie write's own
  response re-renders the page — so the chain KEEPS it (review C1): when it lands and is still the
  newest write on the tab, a landing that carried the person's latest pick clears the failure line
  (and the Profile's region), and one they moved away from is corrected by writing their pick
  again, judged against the mode it landed. The last pick is what the cookie ends on, or the line
  says it is not — short of a navigation during a hang, which can reorder two writes (P2fe). The
  pick and `confirmed` adopt the provider only BETWEEN chains: a refresh from an earlier write can
  land while a newer one is out, and must neither move the cap back nor become
  what the chain thinks the server holds; a chain that wrote nothing adopts the provider's latest
  word. Nothing is ever `disabled` or `aria-disabled` (the control never refuses a tap); the group
  says `aria-busy`, and the pending cap wears a static stripe of page ink over its fill — never a
  dim (review A2). Busy is not disabled, so the label keeps its full ink; the first cut's
  `opacity: 0.7` put light's label at 2.8353:1. The stripe (`color-mix` of `--tx` at 20%) moves
  the fill AWAY from the on-accent ink in both themes, so it can only raise the label's contrast —
  `composite-contrast.test.ts` measures label on fill / on stripe at 4.8426 / 6.3422 light and
  8.9138 / 10.0483 Night. The Lock circle REFUSES re-entry — a lock is not a choice you correct
  mid-flight; the language controls never do.
- **A language write never makes a Sheet `busy`** (M82 is for irreversible writes): ✕, Escape, the
  scrim and the drag stay live, and the Help host owns the write so closing never cancels it. A tap
  on the confirmed mode closes the sheet (like the size rows); a tap on another stays open until the
  PROVIDER shows the written mode — only while the person is still on the rows: leaving them (Back,
  then How, Text size or Something's wrong) drops the wait, so the board catching up never closes
  the sheet under a card or a report being sent (review C3). The board behind is already in the new
  tongue as the sheet slides away; a second tap on the pending mode does nothing, and every writing
  tap cancels the wait for the last write (its late refresh must not close the sheet). A failure
  lands in the sheet while it is open (both tongues, the menu and Language views) and as the bar
  tail's `.staff-bar-msg` line beside the ? circle otherwise — ONE line ever: the in-sheet lines are
  `open &&` (the content stays mounted through the exit slide, M76) and the tail's `!open &&`. ONE
  failure, ONE announcement (review A4): the first line drawn for it is the `role="alert"`; once the
  view that drew it (the menu or the Language view) is left, later lines for the same failure — the
  menu ↔ Language flip, the bar tail after a close — are plain text, never a second alert over the
  focus a view change moves; the next write's failure is news again. The next open answers it; a
  close answers only a line the person SAW, so a failure that landed on How, Text size or Report is
  said in the bar tail after the close, never cleared unsaid. The Profile's failure speaks through
  the view's ONE region (`ViewStatusProvider`) with its visible line `aria-hidden` — and the region
  says it in BOTH tongues, Burmese marked then English (`StaffMsg`'s `{ k: shell.lang.*, both: true }`
  shape): it stands in for a line that is both (review A3).
- **The front-door pill writes a MODE**, resolved against the chain's BASE — the mode confirmed when
  the chain began (between chains, the confirmed mode now), so a repeated မြန်မာ while a chain runs
  never turns Burmese-only into Both (review C2): the script the device already reads keeps its mode
  (a Burmese-only device stays Burmese-only, and a brushed "English" corrected mid-write returns to
  it); from a confirmed English device, မြန်မာ restores the default, Both. Its focus ring is drawn
  INSIDE each segment (`outline-offset: -3px`, pill-shaped) — the pill's `overflow: hidden` clipped
  the global +2px ring (xcut-2's language third). On the PRESSED segment that inset ring sits on the
  lit cap's fill, which is the ring's own `--ac` (1:1, invisible — review A1), so there it takes the
  cap's on-accent ink
  (`.staff-lang-btn[aria-pressed="true"]:focus-visible { outline-color: var(--oa) }`): 4.8426
  light / 8.9138 Night on the fill, and the plain ring holds 4.8426 / 7.1028 on the track
  (`composite-contrast.test.ts`).

_As built — where the spec moved, in the places a reader relies on._

- **The failure line sits directly UNDER the rows, then the note** — on the Profile card and in the
  Help sheet alike, the line next to the tap (the spec listed note-then-failure for one and
  rows-then-failure for the other). In the Help sheet it also shows in the MENU view, under the
  Language row, when the write fails after the person stepped Back from the rows.
- **The Text size preview renders through `TicketDishTitle`, never `<Chrome>`** — it is a dish name
  as the kitchen ticket draws it, and the ticket's dish text never changes with the mode. So it
  reads Burmese over English on an English device too, like the ticket; the chrome render had
  shown English alone there since P7·3.
- **`check-staff-lang` holds where the controls mount and what `keepEcho` may name** (the header
  counts THIRTEEN rules). Rule **4e**: each control export is mounted only by its own hosts — the
  pill by the four front doors (from the export that renders each), the rows by `HelpButton`, the
  card by the sign-in page — by module + export identity. Rule **6** checks the KEY as well as the
  file. Neither is in the spec; both close holes a blind critic reproduced on disk (4c alone let a
  page with no Help door put the pill on its own bar). 4d also refuses a spread on the bar and a
  spread inside `leading`, and (review) RESOLVES every way up — the Screens circle's target read out
  of `StaffBar`, each Back pill's `href` and split-width `paneHref` evaluated (literals, templates
  whose runtime value is a whole `[param]` segment, consts and imported const objects,
  conditionals, one-return functions) — to the staff page it opens, which must reach a control by
  4c's walk or lead up the same way to one, with no circle. 4c also holds two controls inside ONE
  host to provably exclusive branches (two returns of one function, the arms of one conditional,
  then/else of one if).
- **`globals.css` carries Phase 2e in FIVE places, not one labelled block** — each forced by the
  cascade or a shared list, so edit it there, never in a new block: (1) the pill/rows block where the
  old `.staff-lang-btn[aria-disabled]` and `.staff-lang-err` rules were (DELETED — their readers are
  gone), which since the review also holds the pressed segment's ring
  (`.staff-lang-btn[aria-pressed="true"]:focus-visible`) and the two busy STRIPE rules that replaced
  the `opacity: 0.7` pair — the first stylesheet in `verify:slice`'s mutate set, so a dirty
  `globals.css` aborts a run; (2) `.staff-lang-row[aria-pressed="true"]` in the ONE lit-cap list
  beside `.kds-chip`; (3) `.staff-bar-msg .chrome-en` beside `.staff-bar-msg`; (4) `.help-lang`
  joined to the sheet views' padding rule; (5) `.help-lang-back` joined to `.help-size-back`, which
  must follow `.staff-back` to win at equal specificity.

**Phase 2f — counter orders cook before they're paid (2026-09-30; owner decisions 1 and 7,
OPEN-ITEMS P2v).** Pay-first gains exactly ONE exception, and it is staff-only. The rules as built:

- **Who may send an unpaid order, and when.** Only STAFF, only a COUNTER order — a `reg-` session
  in pickup mode (`isCounterOrder`, `lib/counter-order.ts`; its SQL twin
  `s.mode = 'pickup' and s.qr_code like 'reg-%'` is restated inside each function's own statement)
  — and only through `mms_fire_counter_cart`, which is `service_role`-only behind the staff gate.
  Its UPDATE is the whole guard: an OPEN cart, an ACTIVE and UNEXPIRED session, a non-blank name,
  draft TO-GO lines (grocery never fires). A kiosk order, a diner's own pickup and scan-and-go stay
  pay-first; the diner's `mms_fire_cart` is untouched. A diner can no longer JOIN an active reserved
  code — `reg-` (Codex r3 on #308) or `kiosk-` (self-review): `reservedCodeRefusal` answers 403
  "That order can’t be joined from a phone — please ask staff." — one sentence true for both kinds
  (the staff own a counter order; a kiosk order is the kiosk's own). And `assertCartMember` refuses
  any member of an active `reg-` session, so a membership that predates the join refusal cannot add
  a draft the counter Send would fire unpaid (defence in depth; prod held none, measured).
  `SURFACES.payAtPickup` parks NEW sends and never hides food already sent — nor an open Undo: one
  restored after a reload inside the grace always draws, on the pad as on the table page, so a valid
  take-back is never stranded behind the switch (Codex r4 on #308). A future writer minting
  `reg-` codes anywhere but `openRegisterOrder` inherits fire-before-pay — the migration header says
  so. There is no freeze guard on the fire or its undo, deliberately: moving a line draft ↔ fired
  changes no amount; the no-show, which does write money state, refuses a fresh freeze and pay lock.
- **One definition of "sent unpaid food".** SENT = fired / in progress / served, not grocery, not
  comped (a comp is already an audited loss). Every staff read and the no-show refine it with "PAST
  the grace" — a line inside its 10 s undo never reached the KDS — and a NULL `fire_at` counts as
  fired at or before now. `counterSentLine` is the TS twin; the table page's flag, the KDS flag, the
  floor card and the no-show's count read it, on the DATABASE clock where it gates a
  write-off; Clear's refusal is the SQL predicate itself, decided under the locks (below). The sweeper exempts ANY KITCHEN line — sent with
  comps INCLUDED (`counterKitchenLine`), in-grace included — so a comped-only order is not swept
  with its cart left open (self-review), and every exempt session keeps an exit (a settle, a no-show
  that is never `nothing_sent` once the grace has run, or a Clear for a comped-only order). Never write a second test for "sent" at a call site, and never `label.startsWith("reg-")`.
  **The bag is what the kitchen HAS, not what is owed** (Codex r3 on #308): the unpaid bag, its
  kitchen state and its `sentAt` read `counterKitchenLine` — SENT with comps INCLUDED — so a comped
  dish is listed and cooks before "Kitchen done", and a comped-only bag still appears; loss, the
  Unpaid flag and the refusals keep `counterSentLine` (comps excluded). Bag ↔ KDS parity is a test.
- **"Unpaid — collect at pickup" (`settle.unpaid`) shows exactly while an OPEN counter cart holds
  SENT food** — never during the grace, gone at settlement — on the table page's header, the pad's
  ticket, the counter's floor card, the lane's unpaid bag and the kitchen ticket. On the counter
  surfaces it is a **warn** `Badge` with the receipt glyph (warn also marks money not yet taken at a
  hand-over); on the KDS it is a **neutral** `--tx` line (a cook acts on food, not money). A chip is a
  44px object and never echoes; the KDS line echoes (`echo="stack"`), so it is the one place a
  Burmese-only kitchen tablet keeps the K15-HIGH English. **The KDS flag is the CART's, never a
  visible line's** (Codex r4 on #308): `kdsLineGate` takes a required `cartOwes`, decided by
  `counterOwes` over EVERY line of the open counter cart (one capped read; a failed or saturated read
  is `outage`, never a guessed paid) — so a ticket whose chargeable dish was served while a comp still
  cooks keeps Unpaid while the order owes, and a comp-only order never shows it. Every accessible name carrying the flag
  composes it with the device's `shown` (`unpaidWords` / `unpaidBadgeWords`). The KDS ticket never
  prints the raw `reg-` token — the guest's name, the `#CODE` once paid, else "Walk-up".
- **The name lock.** A name is REQUIRED to send (the fire's own conjunct — the name is the only
  pre-payment identity; `named = false` → "Add a name first", with an **Add a name →** link, and the
  pad saves a typed name before it sends; a PRISTINE pad name field follows the live server name
  when that value changes — never over typing — and a server `noName` moves focus to the field with
  the same "Add a name first" copy). Once any line is fired / in progress / served — by STATE,
  in-grace included — clearing it is refused (`mms_clear_cart_name` → `keep_name`, under the cart
  row lock the fire takes, proven two-session); a non-empty rename is still allowed, and the schema
  trims first, so whitespace is empty.
- **The no-show.** "They didn't come — remove the order" REPLACES Clear on a counter order with sent
  food (Clear refuses it and names the way out). It writes off only the SENT set past its grace, as
  approved `void` rows with `reason_code = 'no_show'` through `mms_void_line`'s own loss gate — a
  manager's PIN when any sent dish was started or served (`cooked`), or the sent value exceeds
  `mms_loss_config.max_loss_cents` (`ceiling`); drafts and grocery drop with NO row and never count
  toward the ceiling; in-grace lines go back to draft; pending approvals on the cart are superseded;
  the cart is cancelled and the session closed. It records a loss and nothing else: no order, no
  charge, no refund — the copy says exactly "nothing is charged and nothing is refunded", and says
  **Remove**, never "void". It carries the sent line ids the sheet SHOWED (`expectedLineIds`) and
  refuses `changed` — writing nothing — when the set it derives under its locks differs, so an
  approval never lands on a write-off other than the one approved. It refuses while a payment is in
  flight. The sheet names what it drops from the SERVER's set, never a client re-derivation
  (`counterNoShowDropped` → `droppedLineIds`, on the DB clock: every draft and every in-grace send,
  comped and grocery included — exactly what the SQL removes; Codex r2 on #308). **The sheet submits
  what the manager read** (self-review): it SNAPSHOTS its sent, dropped and comped sets — and their
  lines — when it opens, renders and submits from the snapshot, and when the live sets — or the
  unit count on any line they name (`noShowQtyMoved`, Codex r4 on #308) — move under it it says "The order changed" in its one region, refuses the write, and offers an explicit **Show the
  order as it is now** (`table.noshow.rearm`, focus to the new count) — never a silent swap of what
  a PIN approves. A comped dish the kitchen already has is named too — "{n} no-charge items also come
  off the kitchen screen" (`compedKitchenLineIds`, DB clock) — never counted as a loss. A manager roster
  that fails to load is an OUTAGE, never an empty shift: "Couldn’t load managers", a 44px **Try
  again**, and the step stays blocked (`useApproverRoster`, shared with the loss sheet); a retry that recovers
  restores "a manager needs to approve" while the step-up is pending, in both sheets.
- **The lane never blanks over the unpaid read.** Unpaid bags are drawn beside the paid ones, with
  ONE action, **Take payment** (the table page's payment). An unreadable unpaid read is an outage,
  said; a SATURATED one keeps every paid bag and says "more unpaid than shown" — in the count line
  and the announcement, and never "No bags waiting". The register queue reads newest first, so stale
  unpaid orders never push a new one out; both counter reads fetch CAP + 1 and call a read truncated
  only on that extra row, and the floor's count line says so truthfully — "the oldest are not
  listed" (`floor.counter.truncated`, self-review; older orders have no view yet, OPEN-ITEMS).
  **A bag that owes nothing is not unpaid** (self-review): `counterOwes` — the settle section's own
  chargeable rule — decides, and a bag whose every chargeable line was made free shows a neutral
  **No charge** (`expo.bag.noCharge`, K15-HIGH) with a View link to its order, never Unpaid or Take
  payment, and is not counted in the unpaid line. **Never "done" over unsent drafts:** an unpaid bag
  with a draft still unsent never reads Kitchen done and never rings — the kitchen has not finished
  an order it has not been given.
- **The bell rings once per finished batch.** A counter order's finished food is keyed by its CART
  and its finish (`food:<cartId>:<doneAt>`, the latest bump) — paid or unpaid, so an unpaid bag and
  its paid bag do not ring twice, and a second batch done later rings again. Every other paid bag
  keeps `food:<orderId>`.
- **One filled button per arm, on the table page and the pad (§20).** Before any food is in: a
  **phone** order leads with "Send now, pay at pickup" and Take payment is secondary; a **walk-up**
  leads with Take payment and the Send sits beside it. Once food is in and more drafts remain, the
  Send leads again on both arms ("send the rest to cook with it"). When everything is in, the table
  page's Cash is the primary (the job at pickup IS taking payment) and the pad's primary is
  **Done · Counter** with Take payment secondary. While THIS device's Send is mid-life (tap →
  sending → undo), nothing on the table page is filled, and on the pad the Send keeps the dock slot it
  was tapped in until its undo closes — a control never remounts under the finger. The reader stays
  secondary on a counter order. One derivation each: `counterSettleVariant` (the table page) and
  `padCounterDock` (the pad).
- **Merge and Clear.** Nothing merges INTO a counter order; a counter order with food sent does not
  merge out; one that sent nothing merges as before. Both refusals are decided INSIDE
  `mms_merge_table_orders`, under its cart lock, with the source's pending approvals and then its
  lines locked (-2 a counter target, -1 a SENT source; `floor.ts` keeps its read as the fast path and
  maps both to one message — Codex r3 on #308). **Decision: an IN-GRACE line moves with a merge — as a DRAFT.**
  It is not sent — the sender can still Undo it and the KDS has not drawn it — so the merge first
  returns it to draft (`fire_at` and batch cleared, the undo's own edge; self-review) and it then
  fires on the TARGET cart's own schedule — a pay-first target fires drafts only once paid, in its
  slot. It never arrives still fired on the counter's clock. Only SENT food refuses. Clear keeps clearing a
  drafts-only counter order. Its SENT check and its cancel are ONE locked decision
  (`mms_clear_counter_cart`: the cart row, then its lines, `FOR UPDATE`; one transaction clock), and
  an error or an unknown verdict refuses — a Send or a grace crossing mid-clear can no longer cancel
  due kitchen food (Codex r2 on #308).
- **The paid card.** After a pickup whose food went in first, the HandoffCard adds one line — "Their
  food went to the kitchen before they paid — hand it over from Takeaway bags." — and never claims
  the bag is ready (no auto-advance at settlement, owner decision 7d).

**Phase 2g — the counter screen keeps its promises (2026-10-01; owner decision 8, OPEN-ITEMS
P2em · P2en · P2er · P2es · M250 · P2fz · P2fk).** The rules as built:

- **A collect outlives the screen it started on.** The card reader's collect is owned ABOVE every
  staff route (`ReaderCollectProvider` in `app/staff/layout.tsx`, which still renders no chrome): one
  record per tab, one poll in the action queue at a time, a reload restores it. A view (the table
  page's panel) only shows it. So nothing holds the cashier on the paying table any more — a lone
  cashier takes the next walk-up while a guest fumbles a card. The ONE refusal left is a second
  reader start for another table while a collect is live (one reader): held, with a note naming whose
  payment it is, and refused at the tap without a server call.
- **The bar carries what the screen does not show.** `ReaderCollectChip` is the bar's second
  in-flow row (the offline row's idiom: full width, `order: 10`, before `StaffBarNet`, which measures
  it) — "On the reader · $X · {table}", "Paid · #CODE", "Payment didn't go through" — wherever the
  paying table is NOT on screen, with a View link (the split's own opener on the counter screen; never
  a link on the lock screen). The visible row is never live: a decline, a slow recording, a given-up
  charge and a landing are said ONCE by a separate sr-only `role="alert"` — one script, the table
  named, never marked said while an open sheet has the page `aria-hidden`, and never re-said for an
  outcome the table's own region already announced. Off-screen landings queue (five, persisted), so a
  second never overwrites the first; the ✕ ("Dismiss — Table 7") hands focus to the bar title.
- **A wait is bounded and says which wait it is.** A charge that never records is given up after the
  settle freeze's lifetime (`unrecorded`: "The card was charged, but no order was recorded. Don't take
  payment again — tell a manager." with a Close) — never a refusal that lasts for the life of the tab.
  The reader refusal names its wait: "finish that one first" only while the reader is really taking a
  card, "still being recorded — wait a moment" while the order records. A button names its act:
  "Hide this — we'll keep checking", never "Back to payment" over a payment that has gone through.
- **The paid card comes from the order row too.** A counter order's "Paid · #CODE" is built from
  `qr_orders` (`serverCounterHandoff` — refund-gated through `summarizeRefund`, figures verbatim, never
  a tender or a "went out unpaid" the row does not store) on the closed verdict and a settled counter
  detail; the tab's own card (with its change) wins where it exists — unless the server names that
  same order refunded (`handoffRefunded`): then "Paid" is vetoed everywhere and the closed state says
  "This order was refunded.", or for a partial refund names the order and sends it to a manager before
  hand-over. The phone's table page stays on a
  paid counter order's card instead of bouncing to a counter that no longer lists it, and the closed
  pane no longer hedges ("it may have been paid…") under a card that says Paid.
- **Same-screen navigation goes through the screen's own opener.** A router push of the pane URL
  from the counter screen changes the address and opens nothing (the split follows `hashchange`,
  which a router push never fires): the lane's Take payment, the reader chip's View and the oldest-
  orders sheet's rows all call the split's opener (`openSession(id, hint, { settle })`).
- **A free dish is on the bag.** A paid bag lists its cart's comped dishes beside the paid ones, each
  tagged "No charge" (an unpaid bag that owes nothing keeps its one bag-level badge) — a bag a guest
  takes home is the whole bag.
- **Old is said, never re-sorted.** A counter order whose earliest dish went to the kitchen 4 hours
  ago reads "Not collected in over 4 hours" on its card and its bag (inside each accessible name — a
  subject, never a bare "Waiting" beside guests waiting to pay), counts in the floor's one status line
  (of the orders listed), and notes itself above No-show / Clear unless a payment is in flight. The floor and the lane keep
  their order. "See the oldest orders" (under the floor's head row, outside its status line) opens a
  sheet of every open counter order, oldest first, 20 a page.

**Phase 2h — a stuck tablet never traps staff (2026-10-02; owner decision 9, OPEN-ITEMS P2cz ·
P2fc).** The tablet sends one Server Action at a time, and a transition's `pending` — with every
router commit on the tab — is held while its action hangs (LEARNINGS #200). The rules as built:

- **A wait has a bound, and the bound frees the person, not the write.** Every staff write is called
  OUTSIDE any async transition and awaited through `boundWrite` (`lib/bounded-write.ts`): it answers,
  throws, or at `STAFF_HANG_MS` (15 s) reports `waiting` while keeping the late answer. Busy is
  component state set at the tap and freed at the bound — Cancel, Back and the rest of the screen
  work again. The late answer is APPLIED when it comes: a late ok lands (the sheet unmounts, the card
  shows), a late refusal is said where its surface still stands.
- **Three outcomes, three sentences.** A refusal says what the server said. `waiting` says "No answer
  yet — it may still be recorded. Don't … again: reload the page to see" and offers a Reload button
  BESIDE the one region (never inside it, never a second live role) — a document reload is the only
  escape Next's queue always honours. A lost answer at a site where the server may have acted says
  "couldn't confirm" — never "nothing was recorded".
- **A new money write is refused while the tab is stuck — at the tap, never dispatched.** While any
  tracked action has gone the bound unanswered, a new cash settle, reader start or cancel, close of a
  bill, refund, loss, no-show or approval would only queue behind it and land minutes later, after the
  cashier took the money another way. It says "This tablet is still waiting for an earlier answer, so
  this did nothing. Reload the page to carry on." — except on the sheet whose OWN write waits, which
  re-says its own "don't … again" line (decision 9i), replacing the region's content so it is heard
  again. The pad's add chain, the kitchen and the lane are never refused.
- **A slow subject is held, not the screen.** A bump, a dish marked out, a bag handed over, a
  door's start: if its answer is late, that ticket / dish / bag / door reads `aria-disabled` and a
  second tap re-says its waiting line and sends nothing. Every other subject stays live.
- **Polls never stack.** `lib/poll-gate.ts`: one read in the air, one owed; a tick skipped while the
  read has been out past the bound counts as a miss, so "Reconnecting…" still arms after two — and a
  frozen board's escalation speaks past a standing waiting line.
- **A line about a table you left is answered, not dropped.** The counter pane says a settle or a
  line edit that was still out when its detail unmounted ("No answer yet on a change to {x} — it may
  still be saved"); when the late answer lands it says so ("The payment on {x} went through.",
  "The change on {x} saved.") in the same region, quietly — never a silent disappearance.
- **A locked or shared tablet is never stranded.** Unlock, lock, approvals and help catch their
  failures; sign-out hard-navigates and never awaits a queued action; the lock's release happens on
  the sign-in page's fresh document.

**Phase 2i — staff screens take new builds without losing work (2026-10-02; owner decision 10,
OPEN-ITEMS P2bi · P2hq).** Skew Protection is OFF, so a deploy leaves every open staff screen on the
old code, and Next reloads it unasked on its first revalidating write. The rules as built:

- **The word is "version", never "update".** The row says "A new version of this screen is ready."
  and its button stays the Phase 2h "Reload the page" (`out.reload`) — one action, one name, wherever
  a reload is offered. Plain words (F29): "device", not "tablet"; "Turn on", not "enable"; no "sent"
  for a pad add.
- **One row, in the bar, in flow.** `StaffBarUpdate` sits inside the sticky staff bar between the
  reader chip and the offline row (the offline row stays last), full width, IN FLOW — never
  positioned out of the bar, so `--staff-bar-h` measures it and nothing slides under it. It renders
  nothing while current or while the device is offline (the offline row speaks then). The standing
  line is not a live region.
- **A refused tap says why, in the row's place, once.** A tap is refused only for what a reload would
  silently lose — offline, unsent work (an open pick window, the KDS Undo bar) and a write saving now
  — or for what the pre-flight found (the order system down, the version unreachable). The refusal
  REPLACES the line as one `role="alert"`, names the cause and what to do ("…try again in a few
  seconds."), and clears itself the moment it stops being true — never a sentence telling a cook to
  wait for nothing.
- **Nobody asked → a quiet moment, a visible countdown, and Not now.** The automatic reload waits for
  15 s with no input, nothing unsent, saving, stalled, unread, open or being typed, and 30 s since any
  write answered; then "Reloading for the new version in 5…" with Not now (10 min; 2 min when
  retired). The seconds are `aria-hidden` behind ONE sr-only alert that says it in words; any touch,
  key, scroll or hiding the screen cancels it. **A sound-live board never reloads itself** unless its
  taps can no longer save (retired, or a bumped `STAFF_CONTRACT`) — and the row says the sound will
  be off after.
- **Holds name what a reload would cost, not the screen.** A surface that owns work no promise
  represents registers a hold (`useReloadHold(kind, reason, subject, on)`): `unsent` (a pick, the KDS
  Undo), `unread` (the recall rail, a pane's lost money line, a reader outcome, an unsaved hand-back),
  `sound` (the KDS sound, the counter bell), `standing` (a Reload offer on screen). Manual reads only
  `unsent` and the one unread reason a reload erases outright — a hand-back only memory holds
  (`refusesManual`); automatic reads them all. A hold whose work is stashed for the next load says so
  (`survives`), and only a retired tab may reload over it.
- **What a reload must not lose is kept in the tab — bound to the next LOAD, not a clock.** Lane picks
  resume only on the immediately next load of the same page, written by a writer that unloaded;
  anything else becomes a "mark these again" list. A cash hand-back stays — through reloads and
  navigation — until its own **Handed back** (one per line, each naming its dish and receipt). **An
  order is given once:** only the document that received the answer says "now hand back $X", with
  focus; a reload, Next's reload or a duplicated tab (storage is CLONED into it) shows the same record
  as a question with no focus — "was it already handed back? Check before you hand it back again." A
  money instruction re-said as an order after the money may have moved is a second payout.
- **Reloading looks like it.** The executor freezes the page in the reload's own task: `body` inert,
  `<html data-reloading>` → a progress cursor and a click-through `--scrim-glass` dim laid just under
  the sticky bar (whose button reads "Reloading…" only once frozen — "Checking…" through the
  pre-flight). Fades on the kit's `fade`; reduced motion gets it at once.
- **Bump `STAFF_CONTRACT`** in the same PR as an incompatible change to a staff action's or poll's
  return shape: it makes every older screen reload at its next quiet moment, sound-live boards
  included.

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

- **The masthead is three quiet lines**: the door eyebrow (on EVERY door it is the door's CONTROL
  since Phase 3b — it opens the "Change order type" sheet, §31; at a table that sheet also carries
  the exits), the title "Menu" at `--fs-h1`, and one bilingual greeting line. No card, no exit tiles
  before the food.
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

## 28 · The order pad (Phase 2c)

"+ Add items" and every register mint open a POS pad: dish tiles beside ONE live ticket. Decided in
`lib/order-pad.ts` · `lib/pad-pending.ts` · `lib/pad-errors.ts` · `lib/menu/modifiers.ts`, drawn by
`OrderPad`.

- **An app shell, not a scrolling document.** `.pad-main` is a `100dvh` grid — the `StaffBar`, then
  `.pad-shell` — and every pane (the tiles, the ticket's body) scrolls inside itself with
  `overscroll-behavior-y: contain` (axis-specific: the W22c overscroll contract refuses the
  shorthand; the chip rail contains its own `-x`). The first focusable is a skip BUTTON ("Skip to
  the order"): on a phone the order is the other view, so the jump flips the view first, then
  focuses the ticket's `h2`. **The reflow tier** (`max-height: 20em` — 320×256, a laptop at 400%
  zoom): the shell becomes a document — `.pad-main` takes its content's height, the panes stop
  scrolling on their own (`.pad-ticket` takes the `overflow` shorthand: beside its hidden x-axis a
  `visible` y-axis computes to `auto`), the dock follows the ticket, and the bar stays the only
  sticky element (WCAG 1.4.10; unmeasured in a browser — OPEN-ITEMS P2cv).
- **One ticket, one Send, one Take payment — placed by CSS.** `StaffTicket` renders exactly once (a
  pane beside the tiles from 48em, the order view on a phone), never a second copy in a sheet: no
  duplicated ids, focus or hooks. The dock (`.pad-dock`) holds the view button, `.pad-dock-primary`
  (the Send at a dine-in table, Take payment on a counter order) and `.pad-dock-settle` (a table's
  Take payment). On a phone the primary rides the bottom bar and a table's Take payment shows only
  in the order view; from 48em both sit under the ticket, the Send first; on a short screen
  (`max-height: 52em`) side by side. In the phone bar and the short tier the xl taps keep 64px but
  trim to `--s3` gutters and `--fs-lead`. The dock publishes its MEASURED height as `--cta-dock-h`
  (`useCtaDock`) and the Toast rides above it — zero from 48em, where the dock is not at the bottom.
- **The phone's view button says what the adds ARE** (`padViewStatus`), the most urgent first: a
  lost add "Check the order" (nothing is coming — it names the fix), an unconfirmed one "Checking…",
  a flying or unread one "Adding…". Never "Adding…" over an answer that came back.
- **Tiles.** A memo'd `PadTile` on primitive props, so a 5s poll re-renders no tile whose facts did
  not change. Two sibling buttons, never nested: the main tap (≥ 8.5rem tall) and, on an `add` dish
  only, a 44×44 options corner (sr-only "Options for {x}"). What a tap does is ONE pure decision
  (`tileAction`): sold out wins; a REQUIRED choice (`needsChoice` — any group with `minSelect ≥ 1`)
  opens the options sheet; otherwise the tap adds one, no modifiers. The `×N` badge counts the
  CONFIRMED ticket only (voided lines excluded, §21); a dim `+N` counts this dish's pending adds.
  **A tile is named by its own runs** (`aria-labelledby`, in reading order): the verb (an sr-only
  "Add" on an add tile, whose only visible mark is the aria-hidden +; the visible Choose / Sold out
  otherwise), the lead and the echo (each its own `lang`), the price, the `×N`, and the `+N` with its
  word (`pad.ghost.adding`, sr-only) — never a flattened `aria-label`, so each run keeps its
  language's voice and the name contains every count that is drawn (WCAG 2.5.3).
- **Sections and search.** "All" lists every category in `sort_order`; a pressed chip filters to its
  one section and scrolls the pane to the top; a non-empty search IGNORES the chip — English, raw
  Burmese and category across the whole menu into one untitled section, no lit chip — and the chosen
  chip comes back when the query clears (`padPickCat` toggles against what is SHOWN). A sold-out
  dish keeps its place.
- **Burmese-first on a Burmese console** (`padDishName`): the console's tongue leads, the other
  echoes. A Burmese name is a catalog fact or nothing (`catalogNameMy`); with none, the English
  leads marked `lang="en"` with no echo, never set in Padauk. Ticket lines carry `nameMy` /
  `modifiersMy` from the detail read, so the table page's lines lead in Burmese too. Categories stay
  English, marked, until `menu_categories.name_my` exists (owner-gated).
- **The add moment is §23's, on the console.** At the tap: the press, a keyed `mms-pop` on the +
  disc, `haptic("add")`, a ghost row at the end of "Not sent yet", the tile's `+1`, and a QUIET
  claim. Each tap mints its own add key (`p_scan_id`); writes run through ONE serialized chain
  (`usePadWrites`), so commit order is tap order. The COUNT is optimistic; no amount ever is: the
  ticket's receipt stack reads "—" on every row and Take payment drops its figure while any add — or any of the ticket's own
  writes (a quantity, a removal, a note) — is in flight, or answered but not yet in a read that
  started after it (`padAmountsSettled`, one predicate for both). **Every decision a tap makes is
  taken AT the tap, from refs** — the adds (`holdFor`, `counts`) and Take payment's phase
  (`phaseRef`, moved with its state by one setter) — never from the last render.
- **The ticket speaks receipt (Phase 3d · counter, K46).** One read, one stack: `settleBreakdown` +
  `settleTotalCents` from ONE `getCartTotals` call, rendered by `padReceiptRows` → `buildReceiptRows`
  (Subtotal · Discount · Tax · Total); the Total row IS the figure Take payment names — no second total,
  never re-added from parts. Nothing priced, nothing claimed (no stack until a read prices the order).
  `runningSubtotalCents` is the LINES read's sum — the floor's "so far" and the ceiling's base — never a
  receipt row. The stack's Total excludes any tip (the read runs at tipRate 0), as the dock's does; the
  two reads may briefly disagree (line prices vs Subtotal) while a write lands between them. Still open:
  the table page's two bases (K44) and the cash-sheet re-host (K39).
- **Outcomes are settled BY KEY** (`pendingReduce`). `ok` lands the ghost, which leaves only on a
  committed read that STARTED after the landing. A definite refusal removes that attempt (never the
  dish), plays `mms-settle` on the glyph, keeps focus on the tile and names the dish. A write that
  may have committed, or an action that threw, is `lost`: the ghost stays with "Try again" under the
  SAME key — never "send", the kitchen's verb on this console (pinned in `plain-words.test.ts`). The
  ghost's "Try again" keeps its node through the retry — busy ("Adding…" / "Checking…", `aria-busy`)
  while it is on its way, live again if it comes back lost — so focus stays on it. 15s with no answer
  is `unconfirmed` ("Checking…"), not a failure: a late answer still resolves it; because Next runs
  actions one at a time, an unconfirmed add holds the tiles, the Send and Take payment, and the
  ticket offers "Reload the order". The holds say the state — unconfirmed "Waiting to hear back
  about {x}", lost the fix ("tap Try again on it, or reload the order") — never a wait for an answer
  that already came (`sendHoldMsg`). A sheet add queued behind a hung one frees its sheet 15s after
  ITS tap; whatever lands after its origin stopped waiting — a refusal or an `ok` — is said in the
  pad's region.
- **Doubt said is resolution said.** 15s unanswered is said ONCE in the pad's region ("No answer
  yet about {x} — still checking. If it stays, reload the order.", `pad.err.add.checking`) — the
  ghost's "Checking…" and the Reload are aria-hidden or unannounced — unless the add's origin, the
  sheet, is still waiting and says it with its own line: never both voices for one fact. An add
  whose doubt was SAID (that line, "we couldn't confirm", the sheet giving up) is said to LAND
  (`browse.added`, as news, never deferred behind the correction it answers); every retry follows
  one of those, so a retry that lands is said too.
- **A dish whose add is unknown refuses a NEW add** (`padDishHold`): a lost or unconfirmed add on
  THIS dish holds its tile (`aria-disabled`, `padTileBlock` → `"held"`), its options corner, the
  sheet's open, and a new choice in an already-open sheet — a new tap is a new add key, the ledger
  dedupes only the same key, and if the first one landed the dish goes on twice. The refusal is the
  Send's own sentence (`sendHoldMsg`: Try again on it, or reload). The held attempt's own key always
  passes (the ghost's Try again, the sheet's same choice again). A FLYING add is not a hold (its
  answer is coming — a second tap is a second dish), and no other dish is held.
- **A retry's refusal is no verdict on the first attempt** (`padRetryVerdict`). Every definite
  refusal an add can give is decided before the add-key ledger (the gate, the cart read, the payment
  mutex, pricing) or by the insert's "not open" guard, so a refused resend never consulted the
  ledger: the add stays `lost` under its key, and the sentence says why the retry could not run and
  that the dish MAY already be on (`pad.err.retry.outage` · `.paying` · `.failed`) — never "didn't go
  on". It is read before the ghost AND before the origin's outcome, so the sheet keeps its held key.
  A retry's outcome is said by its ORIGIN: the ghost's in the pad's region, the sheet's in the sheet.
- **The Send is the table page's controller, reused.** `useStaffSend` is owned by `OrderPad` (a
  refresh or a view swap cannot kill an open undo) and handed a `drain` — the add chain settles
  before any fire, and a hung or lost add refuses the fire and says what it waits on — and a BARE
  label while any add is flying or unread: a count is a claim only from a view that has seen the
  cart. **With a drain, the Send re-reads its note hold AFTER the drain:** a note typed while it
  waited returns it to idle, focuses that field and says the hold — the table page passes no drain,
  so nothing awaits between its one read and its fire. With nothing to send the slot is "Done ·
  Table N", never empty. A counter order has no Send (until 2f); its status row says the kitchen
  starts it when it is paid.
- **Take payment navigates; it never takes money here.** Secondary at an open dine-in table (the
  step after Send is leaving — never two filled pills), primary on a counter order. Its refusal is
  ONE typed reason from ONE pure function — `padSettle` → `PadSettleBlock`, ranked **paying > note >
  waiting > unsent > empty** — its sentence a `Record` over that union (`padSettleReason`: a new
  member is a compile error until it can be said), drawn as an `aria-describedby` hint and
  re-decided AT THE TAP from refs. **An unsaved kitchen note on ANY line holds it** (`unsavedNoteFrom`
  — wider than the Send's hold: leaving unmounts the editor with its draft, and a counter order has
  no Send to guard it): the tap flips to the order view and focuses that field. `waiting` outranks
  `unsent` because while a write lands the count is stale and the write is the fix; `unsent` (§17's
  settle gate) renders the table page's own sentence and its tap puts focus on the pad's Send. A tap
  while an add flies is accepted and busy in the phase it is IN ("Waiting for the last dish…" ·
  "Saving the name…" · "Opening payment…"), then `router.push("/staff/table/{id}?settle=1")`, which
  the table page lands on its "Take payment" heading (§29). A push that never lands frees the button
  after 10s (`SETTLE_OPEN_RESET_MS`, or on a `pageshow` restore). **Nothing goes on while Take
  payment is leaving:** every tile answers `"settling"` (`padTileBlock`) and the sheet's Add refuses
  on the same phase — an add tapped then would land after the drain, be announced to a screen that
  is leaving, and never be retracted; a tap says what Take payment is doing (`padSettleBusyKey`, its
  busy label's own words). After a name save the chain drains AGAIN and re-reads
  its blocker before the push. The walk-up name's Save is §17's empty-Save rule (`padNameSave`).
- **Disabled is `aria-disabled` plus a stated reason, never native `disabled`** — the pad renders
  zero `button[disabled]` across idle, pending, paying and sold-out (`OrderPad.test.tsx`, both
  states mounted). The phone bar's hints are `sr-only` (no room for a sentence), so a refused Send or
  Take payment says its reason once through the one Toast on every tier (`sendRefusalMsg` /
  `padSettleReason` — the sentence the hint carries).
- **ONE live region per view** — the pad's Toast, arbitrated by `lib/notice-slot.ts` (§23): a claim
  never erases a correction, and two dishes refused for one cause become the family sentence.
  Corrections are drawn 8s, news 3s, claims are quiet. A frozen feed is said once per freeze; the
  ticket's foot keeps the frozen line as plain text. No row, tile or ticket mounts its own
  `role="alert"` or `aria-live`. From 48em the region centres over the tiles, never over the Send
  or Take payment.
- **Removal on the ticket is §24's** (`useLineMotion` over `StaffLineEditor`): focus moves to the
  neighbouring dish's name BEFORE the write, the row leaves as an `mms-remove` ghost while the list
  closes, a refused removal comes back in place, and a removal in flight holds the Send and Take
  payment ("writing" — a ref alone left a live-looking Send that ignored taps). The write is raced
  (15s): a throw or a timeout is UNKNOWN — the row comes back, the region says "We couldn’t confirm
  {x} was removed — the order shows what’s on it", the hold releases, and while the request still
  holds Next's action queue the ticket offers "Reload the order".
- **One raw read in flight.** A detail read that timed out (`raceTimeout` frees the CALLER at 15s)
  is still in Next's action queue, and a fresh read would queue behind it: `usePadDetailLive`
  watches the RAW call, starts no read while it is unanswered, and owes every ask it refused ONE
  read the moment it answers (`owed` → `kick`).
- **Focus never falls to `<body>`.** The pad carries FloorDetailLive's catch-all: on any detail
  commit or pending change, focus that fell to `<body>` after real focus on the pad goes to the
  ticket's heading (the search circle while the phone shows the menu) — declared after the dock's
  own restore, which wins. The ghost's Try again keeps its node (above); a saved note closes its
  editor with `flushSync` and hands focus to its note button. The heading shows the keyboard ring
  (§17: its outline goes only under `:focus:not(:focus-visible)`).
- **A retry that changed nothing is never silent.** The menu outage's "Try again" is busy while the
  page re-reads (`useTransition`) and says the outage line again when the menu is still down.
- **Loading is the pad's own geometry** (`PadSkeleton`: the tools row, 8 / 12 / 16 tile ghosts at 2
  / 3 / 4 columns, a ticket ghost from 48em). `[id]/loading.tsx` is a client boundary that picks it
  when the pathname ends in `/add`, because a register mint lands on a NEW `[id]`.
- **Reduced motion:** no press scale, pop, rise or settle; removal hides by opacity with no FLIP.
  Focus rules, holds, the drain and the undo arm still apply; every haptic ships its visible half.

## 29 · The register's cash moment (Phase 2c)

Decided in `lib/register-math.ts` · `lib/register-ui.ts` · `lib/inflight-refusal.ts`, drawn by
`CashSettleButton`, `CloseSecureTabButton`, `TerminalSettle` and `HandoffCard`.

- **Quick cash is Exact plus three round-ups** (`quickCashTenders`): the next multiple of each house
  note ABOVE what is due — $13.47 → $14 · $15 · $20; a whole-dollar total never offers +$1. The row
  re-derives from what is DUE (total + tip), so a tip change can unlight a chip, and the readout then
  says Short. The chips are `.staff-chip .staff-chip-cash` (64px tiles, `--r-sm` corners — a 64px
  pill at a quarter of the sheet reads as an oval), lit by VALUE through the console's one lit-cap
  rule; `.staff-chip-cash` declares no fill of its own.
- **The tender is optional, never recorded, and blocks only when short.** Empty or 0 says nothing.
  The readout is a receipt row (dotted leader, height reserved): Change $x · Exact — no change ·
  Short $x (warn, bold, plus one line telling the cashier what to do — never a shake).
- **Keep the change is a FILL, not a commit.** One tap writes the change into the tip field; the new
  tip shows in the field and in Take's label before anything is recorded, and focus moves to Take
  (the action unmounted under the tap). With the tip field empty its `{m}` is the change (which IS
  the new tip); with a tip already typed it reads "Keep the change — make the tip {m}" and `{m}` is
  the tip the tap makes — never a figure that differs from what lands in the field.
- **One binding gates the money action** (`cashSettleBlocked`): Take's `aria-disabled`, its
  `aria-describedby` (the cap line, or the short row + its hint, else the readout) and its handler
  all read it. The handler refuses on its own; the attribute is the announcement. An unreadable
  over-long tip is `null` inside that binding, never a component literal.
- **The quote FREEZES when a confirm opens** (`SettleQuote`: `openQuote` / `reconcileQuote` /
  `quoteDrift`). Every figure in the cash sheet and the card-on-file confirm derives from the frozen
  quote, never from the live prop the page re-reads ~0.4s after any change. A total that moves while
  the confirm is open is SAID in its one alert with both figures ("The total changed from $42.10 to
  $46.10 …"), never swapped in silence; the next tap ADOPTS the new figure (records nothing; the
  sentence stays), and only the tap after that takes payment.
- **The figure recorded is the figure the cashier read, or a refusal naming both.** The confirm sends
  its quote as `quotedCents` (COMPARE-ONLY, never read into an amount); the server compares it inside
  the held freeze and refuses a moved total with `code: "moved"` and its own figure, releasing the
  freeze. The confirm then quotes the server's figure until the page catches up — its live figure
  reaching the server's (the quote's `basis`, collapsed the moment it does), OR any committed read
  that STARTED after the refusal: the quote carries the page's read clock (`raisedAt`, the last read
  started when the refusal landed — `FloorDetailLive.readsStarted`), and `reconcileQuote(q, live,
readTicket)` settles it on a read with a LATER ticket; a read already in the air at the refusal
  settles nothing. A live figure that then differs from the quote is a drift, said with both figures
  (the guest took the dish off again: "The total changed from $42.65 to $42.10"). The re-tap is
  compared again. The card-on-file close's "Charge $x" does the same (P2aa); the reader charges the
  live total.
- **The actions ride a band pinned to the sheet's bottom** (`.reg-settle-actions`, the
  `.item-cta-bar` pattern): the one alert sits right above Take / Cancel, the band owns the
  home-bar inset, and the Sheet's keyboard lift puts it on top of the decimal pad.
- **A lost response is an unknown outcome.** A rejected settle may have landed: the sheet says so
  (`settle.cash.unknown`) and re-reads the page's detail — never "that change wasn't saved". On a
  COUNTER order the page holds its closed-bounce while the outcome is unknown (a landed counter
  settle closes the session behind it) and, on `closed`, says it "most likely went through" where
  the settle was, focused, with the way back to the counter. **That hold ENDS** — the mark is a
  timestamp (when the page learned the outcome was unknown, so it errs long), cleared
  (`settleUnknownAfterRead`) by a committed read that STARTED after the settle could last land and
  still shows the order open, or by a reader collect that STARTS (the reader took the freeze on an
  open cart, which a landed cash settle would have paid); a paid read never clears it. The bound is
  `SETTLE_MAY_LAND_MS = SETTLE_TTL_MS`, ONE binding: nothing bounds the settle function itself, and
  the freeze's lifetime is the one the system gives a settle attempt — too short bounces a late
  landing to the floor (the money risk), too long only keeps a hedged sentence armed. The mark is
  armed only on a counter order, which can never hold a card-on-file running bill.
- **One primary per settle section** (`settlePrimary`): the card on file on a secure running bill,
  cash otherwise; the reader after cash, secondary. The section's visible heading ("Take payment")
  is where the order pad's `?settle=1` lands focus — without `preventScroll`: landing on it is the
  jump the link promised — and it shows the keyboard ring there (§17: no inline `outline: none`).
- **The paid card's NAME carries its facts.** `HandoffCard` is a focused region, never
  `role="status"`: `aria-labelledby` = the title, the change row (or still-to-collect, or the total
  when no tender was entered) and the #CODE, so focus speaks "Paid, Change $7.90, #A1B2C3" once.
  Change sits at `--fs-h1` display heavy; counter cards add the #CODE, the call-out and "Back to the
  counter" (a primary xl link that promises only the navigation it does). A table gets the
  rows-only card when a tender was entered, and it leaves when the next round's cart opens
  (`handoffStillCurrent`). The `Handoff` shape lives in `lib/register-ui.ts`, not the component.
- **"Change" is အကြွေ everywhere.** ပြန်အမ်း is the console's refund verb.

## 30 · The diner spine, the account hub, the counter map (Phase 3a)

Decided in `lib/diner-tabs.ts` · `lib/checkout-steps.ts` · `lib/account-hub.ts` ·
`lib/counter-zones.ts`; drawn by `DinerTabs`, the checkout's step rail, `AccountHub`,
`CounterZoneStrip`. Contract: `docs/PHASE3_JOURNEYS.md`.

- **The spine is two halves, and each carries only what the other cannot.** The header: the brand
  and the live order's status at a glance. The tab bar: the places — Menu · Order · Account since
  Phase 3b (§31; 3a drew four, with Track) — always the same, on every diner route. A tab never
  appears or disappears; only its target and its claim change. Nothing else in the chrome names a
  destination.
- **What a tab may claim is the surface's own rule, re-read.** Order's count is `slotCount` (never a
  shared dine-in cart's, never a zero, never without a cart id); its dot is the wayfinding store's
  live order (§31 — the Order tab follows the order); Account's count is the rewards badge the header
  carried. No new fetch, no new realtime channel.
- **Chrome never re-animates.** The tab bar carries `view-transition-name: diner-tabs` beside the
  header's; the page moves under both. It is the header's pane (`--glass-chrome`, frosted under Night
  in the same selector list, opaque where filters are off), one plane with the header (`--z-toolbar`),
  so sheets, scrims and toasts paint above it.
- **Every bottom dock stacks on `--tabs-h`.** 0 wherever the bar is not drawn (`:root:has(.diner-tabs)`
  sets it), the bar's content height where it is. The cart bar, the market's CTA band, the toast and
  the xl pill's scroll reserve each ADD it to their own offset; the body reserves it so a page's last
  control scrolls clear. A dock that hard-codes its bottom will sit under the bar — that is the
  `@mms/ui` toast guard's job to notice, and it did.
- **Labels are English (D2).** 3a's four 12px labels at a 44px target could not carry a stacked
  Burmese pair; at three places (§31, _amended by D7_) the pair is feasible and is a K15 row, not
  drafted here; every surface under a tab stays bilingual.
- **The checkout names its step.** The rail reads the state Phase 1b keeps; it is a claim, so exactly
  one step is current, the pay step wins over the stage, and the split board (its own surface) draws
  none. The first step is the mode's noun: Order at a table and to-go, Basket in the market — the same
  noun the heading now uses (`yourBasket`, D6).
- **The hub's panels are the design, as the page's order was.** Orders · Rewards · You, in that
  order, rendered whole by the server and flipped on the client (`hidden`, never unmounted), so the
  document order a test reads is the order a screen reader walks. Addressed by `?tab=`, never a hash.
  The one door five surfaces send a guest through to SAVE is on You, so Orders carries a one-line
  door to it; the save card's intent switch re-words the card and sends a typed email straight down
  the sign-in path — the mechanics are untouched.
- **The counter map is anchors, not routes.** One chip per zone HEADING, in the heading's own
  dictionary key (one name per thing); a native fragment, never a `<Link>` to a same-page hash (no
  `hashchange`, no focus — Codex round 1 on #283). The current zone is the last heading at or above
  the strip's edge, lit by the shared lit-gold cap through `[aria-current="location"]` on the same
  rule as every pressed staff chip. The zones stay one screen: the bell hears both boards.

## 31 · A tab is a place, the door is a moment, one owner per fact (Phase 3b)

Decided in `lib/diner-tabs.ts` (`orderTab` · `activeDinerTab` · `isThreshold`) · `lib/doors.ts` ·
`lib/device-session.ts`; drawn by `DinerTabs`, `DoorSheet`, `ArrivalBeat`, `PaySuccess`. Contract:
`docs/PHASE3B_DESIGN.md` (D7–D12).

- **A tab is a PLACE a diner can always go — never a state that is sometimes empty.** 3a's Order and
  Track were one object in two states: before paying, Track opened an empty slip; after paying, Order
  opened "This order is complete" — at every moment one of them was a dead end, reproducible in two
  taps. So the spine is three places, Menu · Order · Account, and the Order tab FOLLOWS the order: an
  open cart (its href, `slotCount`'s badge) → else the live order (its resume href, the dot) → else the
  bare `/cart`, whose own slip is honest. It wears the receipt and the mode's noun in every state — a
  tab never changes shape under the thumb, only its claim. The cart wins over a paid order's dot: the
  thing the diner can still change comes first; the header's chip still carries the order.
- **The threshold is before the map.** `/` and `/dine-in` light NO tab, and there the Menu tab leads
  UP to the doors — never to a menu the route has not entered: on `/dine-in` the lit tab's href was the
  code-free `/menu?mode=dinein`, J15's phantom-table link, offered as the current place. The bar is
  still drawn there (a returning diner on the front door needs Account in one tap; "a tab never
  appears or disappears" stands).
- **The door is a moment, and the eyebrow has ONE host.** Every menu's masthead eyebrow — and the
  market's — opens the `DoorSheet` ("Change order type", v7.2's words): the current door wears the
  existing lit-gold cap on ONE element (label and fill together, `aria-current="true"`, not a link),
  the other two are the home's exact links read from `lib/doors.ts`' `DOORS`, so the home and the
  sheet cannot disagree. Dine-in's two exits ride under a hairline. Its sub-line is honest — "Each way
  of ordering has its own order." — because v7.2's "Your cart stays with you." is false here: each
  door mints its own cart. The table grid (3c) lands as a SECTION of this sheet, never a second one.
- **One owner per fact.** The pickup WHEN is written by the checkout's `PickupWhenChoice` alone — the
  menu's chip and the provider's own sheet mount retired, because the menu pick was set into React
  state and overwritten by the next view: a choice shown as kept and silently dropped, the §5 failure
  in its purest form. The menu greeting is a statement of the cart's slot, never a control. Device
  memory is named ONCE at the handover boundary (`DEVICE_NAME_KEY`, `DEVICE_PHONE_KEY`): the pickup
  phone was a bare literal outside it and survived "Order for a friend".
- **The voice rule stays §6 until a native ear rules.** English leads, Burmese is the accent: the paid
  headline reads the dictionary's `paidThankYou` pair, EN first, `lang="my"` beneath. A proposed
  "peaks rule" (Burmese leading at hello and thank-you) is a register bet, parked as a K15 question.
  Every PR's Burmese drafts go into ONE K15 ledger row, reviewed one native round per phase.

## 32 · One hero verb per state; the bill is readable, only money waits; a grid is offered only off the table (Phase 3c-i)

Decided in `lib/checkout-verb.ts` (`orderStageHero` · `payBlock` · `billDoorLabel` · `payBlockCopy`),
`components/useUndoGrace.ts` (the grace as a value Checkout owns) and `lib/table-pick.ts`
(`tableGridOffered` · `tableChipAction` · `dineInMenuHref`); drawn by `Checkout`, a controlled
`SendToKitchenButton`, `LineOptionsSheet`, `TableGrid` inside `DoorSheet`. Contract:
`docs/PHASE3C_DESIGN.md` (D13–D20).

- **One hero verb per state — and reversing is never the hero.** The Order stage draws exactly one
  filled `.checkout-cta` or none: Send while the host still has drafts; the outline Undo alone during
  the grace; the receipt's Total door once everything is with the kitchen. Two verbs side by side with
  no state between them (J23's "Send to kitchen" beside "View bill & pay") is the shape this rule
  forbids, and so is a filled Send on the Bill beside a dimmed Pay.
- **The bill is readable; only money waits.** The undo grace used to live in the Send button's own
  state, so a stage flip destroyed it and Checkout locked the Bill door for ten seconds to protect it.
  The grace is Checkout's now; the Total door is always open (reading is not a write); Pay is the one
  control that waits, `aria-disabled` with its reason beside it, and `continueToPayment` drains the
  grace's writes, re-decides on the view that won, and only then mints. Forward into the Bill is always
  honoured.
- **Pay keeps its name and states its one reason.** The label is always `Pay · $X`; the reason rides a
  static `aria-describedby` sentence and is re-said on every blocked tap. Precedence is peer > unsent >
  grace: a tablemate's lock is the widest fact, and the Send still owed outranks the grace it would
  reopen — a reason that names the wrong next action is a promise the code does not keep.
- **The receipt foot IS the door, named once.** `orderTotalCents` is one binding (W17) read by the Total
  door and the Bill hero; the door's name says what the next screen will allow — "View bill" while Pay
  is held, "View bill & pay" only when nothing holds it. Phrasing content inside a `<button>`, never a
  `<dl>`. A line is a receipt row: the per-line choices live behind one ⋯ sheet, subject-keyed, closing
  itself when the line stops being draft; a fire is one-way for the guest who tapped it, so the sheet
  is GUARDED (busy while the write runs), never excused as reversible; the lit-gold cap stays on the
  pills alone.
- **A grid is offered only OFF the table.** A `?table=N` claim deliberately does not reuse the
  persisted code and MINTS a new session (`useTableSession`), so a table grid at a live dine-in session
  would promise a table change and deliver a new order over this phone's drafts. `tableGridOffered` is
  the rule, its mutant the guard; the DoorSheet on the to-go menu hosts the grid as a SECTION ("Pick
  your table / စားပွဲ ရွေး", v7.2's words) with the join form inline — never a second sheet — and
  `mode_selected` fires on the taps that enter the door, never on a section revealed or a seated chip's
  code ask. The section is spaced by `.door-sheet-tables`; inside it the `--s3` gap is the one rhythm
  (J32 — no child carries its own top margin).
- **A rejected write is UNCERTAIN, not failed — ask an idempotent server, never the clock (J37).** A
  Server Action's answer can be lost AFTER it committed. Hold the state that gates money (the undo
  window and `pending`), retry the read until one reaches the screen, then ask the server ONCE more —
  the write is idempotent on what already landed (`undoFire`'s `gone`, `lib/undo-miss.ts`, one
  diagnosis for both undos) — and let that answer decide the sentence and the close. Never loop a write
  on a throw that a working read survives.
- **The count is the label's (J34).** The window's state is the hook's and renders its host only at the
  window's edges; the seconds are `useGraceCountdown`'s, read by the Undo label's own leaf on a
  `useSyncExternalStore` ticker — a ten-second window costs Checkout no renders, the label ten.

## 33 · The table is bound at SEND; the number is an identity beside the token; one predicate for a seat (Phase 3c-ii)

Decided in `lib/seated.ts` (`seatedSessionFor` · `liveDineInAt` · `sweepExpiredOnTable` ·
`bindSessionTable` · `bindOutcome` · `holderVerdict` · `rereadVerdict` · `awaitsFirstDiner` ·
`claimDisposition` · `bindVerdict` · `occupancyFor`), the RPCs `mms_bind_session_table` ·
`mms_shell_untouched` · `mms_untouched_shells` · `mms_claim_untouched_shell` (M263, #315), `lib/bind-table.ts` (the
host's bind, under the lock model), `lib/table-pick.ts` (`sendNeedsTable` · `tablePlainLabel` ·
`bindRefusalCopy`) and `lib/bind-copy.ts` (the bind's sentences, named once); drawn by
`TableBindSheet` hosting `TableSection` (the DoorSheet's own section, verbatim), a `TableGrid` that binds
instead of navigating when its host asks, and `SendToKitchenButton`'s gate. Contract:
`docs/PHASE3C_II_DESIGN.md` (D21–D30).

- **Browse first; the table is asked ONCE, where the kitchen needs it.** The Dine-in door enters the
  menu on the bare host-start (a generated join code, no number); `/dine-in` redirects. The first Send on
  an unbound session opens the table sheet as a GATE inside `send()` — after the frozen refusal, before
  the server — and a chip BINDS the live session, then runs the SAME send: one gesture, bind and fire.
  "Pick your table" is the Send's question, never a verb: the hero stays `orderStageHero`'s one
  `.checkout-cta`. A sticker scan, a `?table` claim, a staff-started table and a kiosk claim stamp the
  number at mint and never see the sheet; an empty or failed registry never asks a question with no
  answers (the send proceeds unbound; "Send anyway" is the escape, never removed — a numberless ticket
  reads its code on the pass).
- **The NUMBER is an identity beside the sticker token, and the bind writes ONE column.** `bindTable`
  sets `table_number` under a row-count CAS on `NULL` (`{ count: "exact" }` — an `.update()` with no count
  reports a blocked write as success); `qr_code` is never rewritten, because every phone persists the
  join code it was accepted with and the invite link embeds it — re-keying would mint a phantom host
  session on the next bare `/menu?mode=dinein` (the W9a shape). One active dine-in session per number is
  a partial unique index, and every writer that stamps a number (the mint's claim and sticker arms, the
  register, the kiosk, the bind) sweeps the expired row off it first and reads a 23505 BY NUMBER through
  the one predicate, never by a constraint name.
- **One predicate for a seat; a read error is an outage, never "free".** `seatedSessionFor(n)` is the one
  server reading of "the live dine-in session at table N" — the mint's claim refusal, the sticker scan's
  convergence onto a late-bound table, the home card's resume, the register's Start a table (a
  convergence, not a second ledger), the kiosk's occupancy and the picker's grid all read it. It throws
  on a read error; the picker's occupancy fails HONEST (`[]`, the existing degrade), never Open.
- **A freeze that lands while the sheet is up is refused before the write, in the client's own words.**
  The sheet takes Checkout's `editsFrozen` (threaded, never re-derived) and a chip tap under it says
  `FROZEN_NOTE` through the host — not the raced sentence the server would answer. No live region inside a
  modal: every sentence that lands while the sheet is open is STASHED and said through the view's one
  region after the sheet unmounts; the number lands on screen only from the confirmed answer (the CAS
  count, the re-read, or a view), never optimistically. The host owns the mutation call (`onClaim`), the
  sheet owns the bounded await and `busy` — the `LineOptionsSheet`/`onMakeNow` shape, and the one the
  child-freeze guard can read.
- **The bind is decided where the lock is (M263).** One RPC, `mms_bind_session_table`, for both binders:
  the binder's open cart under `FOR SHARE` (it conflicts with a pay lock, a split claim and the flip to
  paid, never with a line add), freshness on the DB clock — a NULL stamp is not fresh — then the sticker
  rule, the adopt and the CAS in one transaction. A read two statements before a write is not a guard.
- **A table a server started yields to its first diner — only while nobody has touched it (J40).** ONE
  predicate (`mms_shell_untouched`) says untouched; an untouched shell reads Open, is hosted by a
  predicate-guarded claim from the grid and adopted at Send; a touched one reads Seated and answers
  `held` — "A server has Table N open — ask them to seat you there, or pick another." (it claims no order
  on the table and none to add: a touched shell may hold only a joiner) — and is never hosted from the
  grid; its chip in the Send sheet is named "Table N, someone is sitting here" and is no disclosure. An order no code joins
  (a kiosk's) is Seated with no join form. A sticker session binds only to its own table (J41).
- **The Menu tab off the threshold is `menuHref(mode)` (J39).** A tab names no session and claims no
  door: the menu resolves the persisted code itself (J15), and the analytics `door` of a tab tap is
  unclaimed, never invented.

## 34 · The pass at two distances (Phase 3d · kitchen)

Decided in `lib/kds-urgency.ts` (`kdsTicketLevel` · `kdsLateCount` · `kdsBadgeKeys`), `lib/kds-sound.ts`
(`KdsChime`'s mute predicate · `armWithin`) and `lib/counter-chime.ts` (`soundPosture` · `soundTapIntent`
· `soundWord`); drawn by `KdsBoard` and `HelpButton`. Owner decisions taken under delegation
(2026-10-06): the volume slider retires; text size is an Aa circle into the ONE Help sheet; §17's "not a
bar circle" narrows to the counter's width reason.

- **Two distances: the glance and the read.** The head is two numbers at the identity tier — **Open ·
  Late** at `--kfs-id` (32/36/40 with the dial) — readable from across the kitchen; Oldest retires
  (tickets already sort oldest-first). Avg today lives in the Served view and is drawn only when something
  was served: a null or zero count draws nothing, never "0:00".
- **"Late" is a word and one predicate.** `kdsTicketLevel` (a held ticket is never late — not even on a
  frozen snapshot past its slot) drives the strip colour, the badge word and the Late count, so the strip
  says exactly the cards whose badge says Late. `kdsBadgeKeys` gives "Later · " on a held card (byte-
  identical to before) and "Late · " on a red one: under reduced motion the pulse stops and red would
  otherwise differ from amber by hue alone (WCAG 1.4.1). The card's spoken name carries the same word.
  Amber says nothing — its clock does.
- **The tail is TV · sound · Aa · ? · Lock.** Aa appears only where there is a dial; it is plain, never
  gold (gold is Help's), and opens the ONE Help sheet straight onto Text size — two taps, never a cycling
  circle (each re-flow resets the pager). A pick closes the sheet and returns focus to Aa.
- **Sound is the counter's three postures, as a circle.** `soundWord` is the one word map. Off: plain.
  On: the ONE lit cap through the shared pressed list. Paused: a warn ring plus a warn DOT — a shape,
  never hue alone. Icon-only, named by sr-only dictionary text. The dot rides `::before` INSIDE the round:
  on a `.staff-press` control `::after` is the press sheen and the control clips to its circle.
- **The level is fixed; the mute is a predicate the engine is HANDED.** The slider retires (0.8; the
  device's own buttons are the dial). A mute silences `KdsChime.play()` through a predicate passed in and
  read at every play — never read inside the class, because the TV wall shares the engine and defaults
  OPEN. A muted board keeps its context running and its re-chime timers advancing, so unmuting never
  plays a backlog.
- **The circle's own tap is its arm.** The first-tap re-arm skips `[data-kds-sound]`; the arm is bounded
  (`armWithin`, `ARM_TIMEOUT_MS`) and shows busy as `aria-busy` + `aria-disabled` with a ref guard (§17);
  the volume check plays after the flag is written. A refusal is said in the board's ONE region, never
  over a waiting line, and dropped once the context runs. The per-device answer survives a store that
  refuses it (an in-memory fallback for THIS document).
- **Only a SOUNDING board holds the reload.** The hold keys on the `on` posture, never on "armed" — a
  muted-but-armed tablet used to hold the automatic reload forever.
- **Measured, not assumed (2026-10-06, headless Chromium, the production CSS and the real fonts):** at
  1366×1024 and 1366×768, EN and MY, every text size, the bar is ONE row, nothing scrolls sideways and no
  badge wraps — a Burmese "နောက်ကျ · ဆိုင်မှာ စား" beside a two-digit table four across included; at 390
  the tail is one unwrapped row. A real tablet (Night in-room light, iOS audio — P2bw) is the remaining
  look.
