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
