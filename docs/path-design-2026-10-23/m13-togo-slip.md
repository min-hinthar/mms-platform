# picked-m13 — The Counter Slip, refined (round 4, 2026-10-24)

<!-- round4-citation-key -->

> **Reading this spec.** It is one moment of round 4; the record is [`../PATH_DESIGN_2026-10-23.md`](../PATH_DESIGN_2026-10-23.md), and where the two disagree the record's _Cross-spec reconciliations_ win, then this file's appendices, then its body. Code citations are against `origin/main` @ `09c1c2a`; a bare path is under `apps/qr/`. A few citations name the round's working files, which are not in the repo: **`common.md` D1–D8** are the record's defaults **R4·1–R4·8** (same numbers); **`vocab.md`** is the record's _Shared vocabulary (round 4)_; **`amend.md`** is this spec's appendix A (and the record's reconciliations); **`brief-mNN.md`** and **`mNN.json`** are the three concepts and the judges' notes, summarized in the record's section for this moment; **`picked-mNN.md`** is this file's own body (the critic's line numbers in appendix B point into it as it stood before the appendices); **`lens.md`** is the round's design lens, restated in the record's opening sections. Every Burmese string marked _K15 draft_ is a draft for the native sitting, never final copy.

Moment m13: the to-go checkout's Who-and-When slip — asked once, validated before Pay, bilingual, with Pay in reach.
Backbone: concept 2 (guided, "The Counter Slip"). Grafts a–l applied (m13.json `.judgement.grafts`); the
judges' named weaknesses fixed (keyboard-trap / 320×568 crowding / the "2 left" collision / one extra
`getPickupSlots` read). Owner defaults honoured: D4 (common.md:11), D10, D11 (PHASE3B_DESIGN.md:85-90),
ruling #17 and #10 (OWNER_RULINGS_2026-10-07.md:68, :61), M73 (DECISIONS_2026-10-18.md:140, :1246),
K16 (OWNER_RULINGS:92). Code cited against `origin/main` @ `09c1c2a`.

## What the three screens share (verified against the code)

- **Where it lives.** /cart for a pickup cart: h1 "Your order" + `<My>` "သင့်အော်ဒါ" inside the h1
  (Checkout.tsx:3922-3927; cart.ts:20), the two-key rail `["order","pay"]` (lib/checkout-steps.ts:35 — no
  third step; T47 keeps the rail out of money coverage), then THE SLIP, then the back link
  (Checkout.tsx:4247-4255, `<My k="addMore">` cart.ts:97), then today's review MINUS the When / name / phone
  blocks (Checkout.tsx:4832-4920 and PickupWhenChoice.tsx:226-299 move into the slip). Line cards → promo →
  reward → fee card → tip ask (cart.ts:84 `addATip`, :88 `tipGoesToTeam`, :93 `noTip`, :94 `customTip`) →
  Total (cart.ts:110) unchanged; nothing money-bearing moves or hides.
- **The slip is three lines, ONE open at a time, in this order: 1 When · 2 First name · 3 Phone.** When
  leads because it is already answered (a cart with no slot is ASAP — PickupWhenChoice.tsx:8-11 — and the
  pill is lit when `asapAvailable`, cart/page.tsx:141-142), so a first-timer's first line is a statement
  to glance at, not a box to fill; the two lines that need a thumb follow it. A line that is answered folds
  into a 44px read-back row (✓ ring · value · quiet "Change"); an unanswered line is a 44px row
  (numeral ring · label · ›) that opens on tap. Exactly one line is open.
- **The ONE predicate at both ends.** `pickupContactMissing(name, phone)` (lib/pickup-contact.ts:34-38;
  `validPickupPhone` :23-27, ≥7 digits, 7–20 chars) decides the row error, the kicker count, the held Pay
  AND create-intent's 400 (route.ts:353-365). New: `PICKUP_CONTACT_MESSAGES` in `lib/pickup-details.ts`
  (the filed 3e shape, PHASE3B_DESIGN.md:393-396) — `{ name: {en, my}, phone: {en, my} }` — imported by
  Checkout AND by create-intent, retiring route.ts:360's "we need someone to call" (no caller exists:
  M73, DESIGN-LANGUAGE §5 :127). `nextPickupStep(name, phone, slot, asapAvailable)` →
  `'name' | 'phone' | 'when' | null` calls `pickupContactMissing` first (never a second rule).
  `payBlock` (lib/checkout-verb.ts:72-95) gains the two arms AFTER the existing ladder — peer > unsent >
  served > grace > **contact > when** — and `payBlockCopy` (:235) the two sentences; both files sit in
  `MONEY_PATHS` (scripts/check-money-coverage.mjs:39 `/^apps\/qr\/lib\//`), so each new arm ships with a
  mutant and a red-first test.
- **Pay is DOCKED for pickup, in the shipped `PayDock` host (PayDock.tsx:37-77), as a `variant: "pickup"`.**
  Today `payDockShown = showPayControls && !phonePayOff && staged` (Checkout.tsx:3843) and the inline Pay is
  the `!staged` branch (:5531); the pickup cart gets the dock and loses the inline button. Geometry is the
  shipped `.counter-dock` (globals.css:2344-2366): `position: fixed; left: 12px; right: 12px; max-width:
416px; bottom: calc(var(--tabs-h) + 16px + env(safe-area-inset-bottom))` → on 390×844 the dock is
  x12–378, bottom edge y734 (60 + 16 + 34), background `--pg` (opaque in light AND Night — `.counter-dock`
  declares `var(--pg)`, no glass, no border), a 24px fade above it (`::before`, :2354-2366). Inside: the
  ONE line slot `.counter-dock-line` (16px/600 `--tx` centred, min-height ≈ 43px so held ↔ live never
  moves the column; `.counter-dock-line-my` 13px Padauk `--t2` beneath, :2368-2384), margin-bottom 8, then
  the door `.checkout-cta.counter-dock-door` 64px (`--tap-bump`, tokens.css:25), radius 12 (`--r-sm`),
  label "Pay · {ctaTotal}" 16px/800 `--oa` + `→` (`.checkout-cta-arrow`) and `<span lang="my">` "ရှင်းမယ်"
  13px/600 (cart.ts:52). **No quiet counter button** on the pickup variant (`counter` becomes optional in
  PayDock's props; "Pay at the counter" is the dine-in Bill's door, never to-go's). Dock height 115px →
  top y619; `--cta-dock-h` published by `useCtaDock` (lib/hooks/useCtaDock.ts) so the toast and the page
  clearance (Checkout.tsx:3902) ride above it. Held = `aria-disabled="true"` + `aria-describedby="pay-line"`
  - opacity .55 (`.counter-dock-door[aria-disabled]`, globals.css:2398-2401), never native `disabled`;
    busy = `aria-busy` + the shipped `disabled={busy}` second-tap guard (PayDock.tsx:103-104), flagged as is.
    **The pickup dock never renders `PAY_OPENS_SERVED`** (lib/checkout-verb.ts:98; `servedHold` is null for a
    pickup cart) — pinned by graft (l)'s jsdom test.
- **The dock's line (named once, `lib/pickup-details.ts`):**
  - held, contact → "Pay opens when the slip is filled in." · `<span lang="my">` "စာရွက် ဖြည့်ပြီးမှ ရှင်းလို့ ရပါမယ်"
    (brief-m13.md:151, K15 DRAFT; the pattern of cart.ts:50 `payOpensAfterUndo`). The count is NOT repeated
    here — the kicker is the one count.
  - held, when (ASAP unavailable and no slot) → "Pick a pickup time first." · "လာယူချိန် အရင် ရွေးပါ" (brief:93, K15 DRAFT).
  - live → "Ready to pay." (Checkout.tsx:3850, EN-only, `my: null`).
  - the register / peer / grace lines stay the shipped ones (lib/checkout-verb.ts:235-…, cart.ts:48-51).
- **The held tap** (`onRefusedPay`): `sayRefusal(line.en)` through the review's ONE live region (the
  `role="status"` at Checkout.tsx:3765; `sayRefusal` :1315-1320), then open the first UNANSWERED line
  (`nextPickupStep`), scroll it into view and focus its control — `scrollIntoView({block:"nearest",
behavior: reduced ? "auto" : "smooth"})`, the shipped idiom (PickupSlotSheet.tsx:95-100). **Build
  requirement:** the root's scroll reserve is the tab bar only today (`:root:has(.diner-tabs)
{ scroll-padding-bottom: calc(var(--tabs-h) + safe + var(--s2)) }`, globals.css:5498-5500) — add
  `var(--cta-dock-h, 0px)` to it while a dock is mounted (`:root:has(.pay-dock)`), pinned by
  `lib/scroll-padding-contract.test.ts`; otherwise the walked-to field lands under the dock (WCAG 2.4.11).
- **Validation is ON BLUR, never on keystroke**, through the `Field` primitive (packages/ui/src/field.tsx:27-75:
  the note line is the hint OR the error, `aria-invalid` + `aria-describedby`; `.ui-field-control
[aria-invalid="true"] { border-color: var(--warn) }` primitives.css:286-288; `.ui-field-error` --warn 600
  - `uiRise` 240ms :295-308). Graft (f): `Field` also emits `aria-errormessage={noteId}` when `error` is set
    (a one-prop addition; `aria-describedby` stays for the agents that ignore errormessage). The error is static
    text, never a live region; the view's one region says it once and focus stays in the field. Forgiving: a
    line left EMPTY without typing shows no error (the row simply stays unanswered); the error appears after a
    first keystroke's blur, or on a held-Pay tap.
- **Device memory (D11):** `DEVICE_NAME_KEY = "mms.name"`, `DEVICE_PHONE_KEY = "mms.phone"`
  (lib/device-session.ts:30-32), hydrated after mount (Checkout.tsx:676-700), written on Pay (:3118-3120),
  cleared on a hand-over by `deviceSessionKeys` (:42-46). "Saved on this phone." is drawn ONLY when BOTH
  values hydrated from the device (literally true under D11 — PHASE3B_DESIGN.md:85-90).
- **The earliest clock (D4 + graft b, i).** Never on the pill. ONE read of `getPickupSlots(cartId)`
  (lib/pickup.ts:27-40, the sheet's own action) lifted from `PickupSlotSheet` into `PickupWhenChoice`
  state, performed on mount, on sheet open, and on `document.visibilitychange → visible`; the hint prints
  `formatSlotLong(groups[0].slots[0].slot)` (lib/pickupTime.ts:31-34) and the sheet renders the same result
  (no second fetch per open — the judges' cost). While the read is out, failed, or empty: the hint drops the
  clock and reads "Booked when you pay — it shows on the next screen." No number is ever typed in. The prep
  clause ("The kitchen needs about {prep} min.") prints ONLY from a real `pickup_config` row: `getPrepMinutes`
  (lib/pickup.ts:49-56) returns a typed `12` on a miss and cart/page.tsx:136 `.catch(() => 12)` again —
  both become `null` arms, and a null drops the clause (ruling #10: the values are unconfirmed; the brief's
  "never restate the defaults as the restaurant's promise"). lib/pickup.ts is in MONEY_PATHS → a mutant or an
  in-file `verify:slice-exempt — <reason>`.
- **The slip's region grammar.** `<section role="group" aria-label="Pickup slip">`; the kicker count is plain
  text (never live); numeral rings reuse `.checkout-steps-num` (globals.css:2245-2270 — `is-current` → `--ac`
  disc with `--oa` numeral, `is-done` → `--ok` ring with "✓" exactly as the rail renders it,
  Checkout.tsx:3938-3939); the lit-gold cap on the chosen pill is `.checkout-pill-on`
  (globals.css:3629-3639: `--ac` fill, `--oa` ink, `inset 0 1px 0 var(--sheen), var(--sh-lift), 0 0 14px -6px
var(--glow-gold)`) — ONE selection vocabulary, no new ring grammar (the glance concept's three rings NOT
  grafted).
- **One live region per view**: the review's `status` (Checkout.tsx:3765). The sheet keeps its own in-dialog
  `role="alert"` for the load failure (PickupSlotSheet.tsx:149) — a dialog is its own view.
- **Motion**: fold/unfold 240ms `--ease-out` height + `mms-rise` on the read-back row; the cap's shipped
  ignition on a pill flip; the Field error's `uiRise`; nothing else. Reduced motion: the shipped
  `matchMedia("(prefers-reduced-motion: reduce)")` gate → instant fold, no rise, `behavior: "auto"`; the
  dock declares no motion (`.pay-*`, responsive-contract.test.ts). Delight is not spent here (no toast, no
  confetti when the slip completes).
- **Analytics (graft h)**: `posthog.capture("pickup_next_step", { reason })` from the client (`posthog-js`,
  the shipped idiom TableGrid.tsx:117, DinerGuide.tsx:120), `reason ∈ name | phone | when | pay`, fired when
  `nextPickupStep` changes and on every held-Pay tap. No name, no phone, no cart id beyond what
  `pickup_when_confirmed` already sends (route.ts:442-446). The success metric: held taps → 0 over a week.
- **Night**: slip `--cd` #2b213c on `--pg` #100c19, wells `--sunken` #171422, lit cap `--ac` #e7a53a with
  `--oa` #130d1e ink, error `--warn` #e0855f, dock `--pg` opaque (as shipped). Light artboards only (diner
  phones follow the OS; RULES §3).

---

## SCREEN picked-m13-1.dc.html — First visit: When open, two lines folded, Pay held

Device: phone 390×844. Theme: light.

LAYOUT (top → bottom; x in the 20px gutter unless stated; the page column is 350 wide, x20–370):

- y0–47 safe area: empty ground `#faf9f5`.
- y47–103 AppHeader (56px, padding 0 14px, border-bottom 1px rgba(58,35,23,0.1)): the brand link (logo
  `/_blob/e7e27a9553079ddb61cfec7bd9f82c9f` 51×34 + "Morning Star" Fraunces 16px 800). Right: nothing.
- y103–119 top pad 16.
- y119–168 `<h1>` "Your order" Fraunces 26px/1.08 600 −0.02em `#1b1714`; inside it, block,
  `<span lang="my">` "သင့်အော်ဒါ" Padauk 13px `#6e6358` (Checkout.tsx:3922-3927). `WalletChip` 44px at the
  right of the same row (Checkout.tsx:3928) — draw its 44×44 slot empty-quiet (a 1px `--bd` disc) or omit;
  it is not this moment's.
- y168–196 the rail `.checkout-steps` (28px row, margin-bottom 16): ① 20px `--ac` disc, `--oa` "1",
  label "Order" 12px/700 .02em `--ac-strong` (`is-current`) — 14×1px `--bd` hairline — ② 20px `--bd` ring
  "2" `--t3`, "Pay" 12px/700 `--t3`. `<ol role="list" aria-label="Checkout steps">`, `aria-current="step"`
  on ①.
- **y212–512 THE SLIP** — `<section role="group" aria-label="Pickup slip" class="card card-textured pickup-slip">`
  350 wide at x20: `--cd` #fffdf8 + the dot field (radial-gradient rgba(58,35,23,0.06) 1px / 18px), 1px
  `--bd`, radius 20, shadow `inset 0 1px 0 rgba(255,255,255,0.55), 0 1px 2px rgba(35,24,16,0.06), 0 8px
24px -12px rgba(35,24,16,0.18)`, padding 16. Inner column x36–354 (318 wide).
  - y228–248 KICKER ROW (20px, flex, baseline, space-between): left `.eyebrow` "PICKUP SLIP" 11px/700
    uppercase .13em `--ac` #a65f10 · a " · " text node (11px `--t3`, margin 0 6px, `aria-hidden`) ·
    `<span lang="my">` "လာယူ" Padauk 13px `--t2` (staff.ts:168 `kds.channel.pickup`, :522 `floor.mode.pickup`,
    SHIPPED). Right: "2 lines left" 12px/700 `--t3` tabular (graft g — never "2 left" beside the sheet's
    "{n} left"). Plain text, no live region, `tabIndex=-1` (the focus target after the last fold).
  - y256–276 LINE 1 (OPEN) LABEL ROW (20px, flex, gap 10, padding 0 2px): ring "1" `is-current` (20px
    `--ac` disc, `--oa` 12px/700 numeral, `aria-hidden`) · `<p id="when-label">` "When" 14px/700 `--tx` ·
    `<span lang="my">` "လာယူချိန်" Padauk 13px `--t2`, margin-inline-start 8 (track.ts:64 `kickerPickup` =
    Dad's `expo.pickup` staff.ts:1076, SHIPPED).
  - y282–326 THE PILLS — `.checkout-pill-row` (globals.css:3690, gap 8) `role="group" aria-labelledby=
"when-label"`, 318 wide, two `.checkout-pill` each `flex: 1 1 0` → 155×44, column, gap 1, padding 6px
    10px (PickupWhenChoice.tsx:319-325): - LEFT, `aria-pressed="true"`, `.checkout-pill-on` LIT CAP: line 1 "As soon as possible" 13px/700
    `--oa` #fffdf8; line 2 `<small>` "Booked when you pay" 11px/700 (inherits `--oa`) — D4: no clock.
    `aria-label="As soon as possible — booked when you pay"` (replaces the shipped "ready in about {prep}
    minutes", :248); `aria-description` carries the K15 draft "ရှင်းလိုက်တာနဲ့ အစောဆုံး အချိန်ကို မှာထားပေးပါမယ်"
    (brief-m13.md:60) — the pill has no room for a third line. - RIGHT, `aria-pressed="false" aria-haspopup="dialog" aria-expanded="false"`, vellum ghost
    (`.checkout-pill`: `linear-gradient(180deg, #f8f6f0, #fffdf8)`, 1px `--bd`, `--t2` ink, inset sheen):
    line 1 — a 14px stroke calendar glyph `aria-hidden` (the shipped 🗓 at :282 is `aria-hidden` too;
    RULES §2 draws a stroke svg) + "Pick a time" 13px/700; line 2 `<small lang="my">` "အချိန် ရွေး"
    Padauk 13px 400 (docs/prototype/v7.2.html:506, VERBATIM). `aria-label="Schedule a pickup time"`
    (shipped :275).
  - y334–394 THE HINT `<p>` 13px/1.5 `--t3` #726859, margin 8px 2px 0, two lines EN then one MY line:
    "Right now the earliest is <span class="tn">12:40 PM</span>. The kitchen needs about
    <span class="tn">12</span> min." then `<span lang="my" style="display:block">` "အခု အစောဆုံးက
    <span class="tn">12:40 PM</span> ပါ" Padauk 13px (the second clause of brief-m13.md:194's draft, clipped at
    its own "—" and "။"; the prep clause stays English-only until K15 rules on "{prep} မိနစ်လောက်",
    brief:268). The clock is `formatSlotLong(earliest)`; the prep clause only from a real config row.
  - y394–406 open-line bottom pad 12; y406 hairline 1px `--bd` (`role="presentation"`).
  - y407–451 LINE 2 (FOLDED, unanswered) — one `<button type="button">` 318×44, transparent, padding 0 2px,
    flex gap 10: ring "2" (20px, 1px `--bd`, `--t3` numeral, `aria-hidden`) · "First name for pickup"
    14px/700 `--t2` (Checkout.tsx:4832, verbatim; NO "Required" — graft a) · `<span lang="my">`
    "အော်ဒါအတွက် နာမည်" Padauk 13px `--t3` ms 8 (staff.ts:792 `browse.name.label`, SHIPPED; K15 to confirm the
    register reads warm on a guest phone) · trailing "›" 16px `--t3` `aria-hidden`.
    `aria-label="First name for pickup — not answered yet, opens this line"`.
  - y451 hairline.
  - y452–496 LINE 3 (FOLDED, unanswered) — same row: ring "3" · "Phone number" (Checkout.tsx:4883) ·
    `<span lang="my">` "ဖုန်းနံပါတ်" (brief-m13.md:146, K15 DRAFT; ဖုန်း shipped cart.ts:128) · "›".
    `aria-label="Phone number — not answered yet, opens this line"`.
  - y496–512 card bottom pad 16.
- y520–580 THE NEXT-STEP SENTENCE `<p>` 13px/1.5 `--t3`, margin 8px 2px 0, width 346: "Your ticket comes
  after you pay — show it at the counter." (graft d; code-true: /track's pass + track.ts:71-75 `passSub`)
  then `<span lang="my" style="display:block">` "ရှင်းပြီးရင် ကောင်တာက ဝန်ထမ်းကို ပြဖို့ ကုဒ် ရပါမယ်" Padauk 13px
  (brief-m13.md:61, K15 DRAFT, grounded in the shipped passSub). One sentence, every visit; never a guide.
- y584–628 the back link `.nav-link` 44px: "← Browse the menu" 11px/700 `--t3` + `<span lang="my">`
  "ထပ်မှာမယ်" 13px (cart.ts:97) — its lower half rides under the dock's fade at scroll 0 (the page scrolls;
  `scroll-padding` keeps it reachable).
- y632 → the review as today, scrolling under the dock: line cards (`.card.card-textured.checkout-line`,
  padding 12, 50px photo placeholder `linear-gradient(135deg,#f1e7d6,#fbf4e8)`, ≈74px each, gap 8:
  "Mohinga ×2 $25.00", "Shan noodles ×1 $13.10") → promo field 48px + "Apply" → fee card (Subtotal $38.10 ·
  Sales tax (10.5%) $4.00) → "Add a little extra?" · "အပိုလေး ပေးမလား?" + "It all goes to the team who made
  your meal." + chips 15% · 20% · 30% · Custom · None (None last, `--sf` quiet) → "Total · စုစုပေါင်း $42.10".
  Page padding-bottom `calc(var(--cta-dock-h) + 24px + 24px)` (Checkout.tsx:3902).
- **y595–734 THE DOCK** (`.counter-dock.pay-dock`, x12–378): y595–619 the fade (`linear-gradient(to top,
#faf9f5 60%, transparent)`); y619–662 the line slot: "Pay opens when the slip is filled in." 16px/600
  `--tx` centred + `<span lang="my" class="counter-dock-line-my">` "စာရွက် ဖြည့်ပြီးမှ ရှင်းလို့ ရပါမယ်" 13px `--t2`
  block (`id="pay-line"`, static); y670–734 the door 366×64 radius 12, `linear-gradient(180deg,#a65f10,
#8f5009)`, `--oa` ink, `inset 0 1px 0 rgba(255,255,255,0.55), 0 2px 8px -1px rgba(166,95,16,0.42)`,
  **opacity .55, `aria-disabled="true" aria-describedby="pay-line"`**: "Pay · <span class="tn">$42.10</span>
  →" 16px/800 and `<span lang="my">` "ရှင်းမယ်" 13px/600 beneath. The amount stays visible while held
  (receipt voice, DESIGN-LANGUAGE §8); it is `ctaTotal`, the server-reconciled estimate (Checkout.tsx:5573).
- y750–844 DinerTabs (60px + 34 safe): Menu · **Order** (`aria-current="page"`, `#8f5009`) · Account; English
  labels (D2); no count capsule (a pickup cart may carry one — draw none here, the moment is the slip).

COPY (English):

- Your order
- Order · Pay
- PICKUP SLIP
- 2 lines left
- When
- As soon as possible
- Booked when you pay
- Pick a time
- Right now the earliest is 12:40 PM. The kitchen needs about 12 min.
- First name for pickup
- Phone number
- Your ticket comes after you pay — show it at the counter.
- ← Browse the menu
- Pay opens when the slip is filled in.
- Pay · $42.10 →
- Add a little extra? · It all goes to the team who made your meal. · 15% · 20% · 30% · Custom · None · Total · Subtotal · Sales tax (10.5%) · Apply · Promo code

COPY (Burmese) — only shipped strings or the briefs' drafts:

- သင့်အော်ဒါ — SHIPPED (lib/i18n/cart.ts:20 `yourOrder`)
- လာယူ — SHIPPED (lib/i18n/staff.ts:168 `kds.channel.pickup`; :522 `floor.mode.pickup`)
- လာယူချိန် — SHIPPED (lib/i18n/track.ts:64 `kickerPickup`; staff.ts:1076 `expo.pickup`)
- အချိန် ရွေး — v7.2 VERBATIM (docs/prototype/v7.2.html:506, the slot sheet's MY title)
- အခု အစောဆုံးက 12:40 PM ပါ — brief-m13.md:194 K15 DRAFT, clipped at its own dash (Latin clock per the digit rule)
- အော်ဒါအတွက် နာမည် — SHIPPED (lib/i18n/staff.ts:792 `browse.name.label`; cross-register, K15 to confirm)
- ဖုန်းနံပါတ် — brief-m13.md:146 K15 DRAFT (ဖုန်း shipped cart.ts:128)
- ရှင်းပြီးရင် ကောင်တာက ဝန်ထမ်းကို ပြဖို့ ကုဒ် ရပါမယ် — brief-m13.md:61 K15 DRAFT (grounded in track.ts:72-74 `passSub`)
- ထပ်မှာမယ် — SHIPPED (cart.ts:97 `addMore`)
- စာရွက် ဖြည့်ပြီးမှ ရှင်းလို့ ရပါမယ် — brief-m13.md:151 K15 DRAFT (pattern of cart.ts:50)
- ရှင်းမယ် — SHIPPED (cart.ts:52 `pay`)
- အပိုလေး ပေးမလား? · မထည့်ပါ · စိတ်ကြိုက် · စုစုပေါင်း — SHIPPED (cart.ts:84, 93, 94, 110)
- ရှင်းလိုက်တာနဲ့ အစောဆုံး အချိန်ကို မှာထားပေးပါမယ် — brief-m13.md:60 K15 DRAFT, the ASAP pill's `aria-description` only (not drawn)

A11Y:

- Names: `<section role="group" aria-label="Pickup slip">`; `<ol role="list" aria-label="Checkout steps">`;
  pills in `role="group" aria-labelledby="when-label"`, each with the explicit `aria-label` above and
  `aria-pressed`; the folded rows are `<button>`s whose name states the line, its state and the action;
  the dock door is a `<button>` named by its text ("Pay · $42.10"), `aria-describedby="pay-line"` while held.
- Live region: ONE — the review's `role="status" aria-atomic` (Checkout.tsx:3765). The kicker, the hint, the
  dock line and the next-step sentence are static text.
- Focus: nothing is auto-focused on mount (money and name alike). Tapping a folded row opens it and moves
  focus to its control (name → the field, raising the keyboard; `enterKeyHint="next"`). A held-Pay tap:
  the region says the dock line, the first unanswered line opens, scrolls into view (RM-aware, the dock
  reserve added to `scroll-padding-bottom`) and takes focus. Pill taps keep focus on the pill.
- Never colour alone: the lit pill has `aria-pressed` + the cap's fill AND lift; the unanswered ring is a
  numeral; the held door is dimmed AND described.
- Targets: rows 44, pills 44 (155 wide), door 64, back link 44, tabs 44+. Inputs are 16px (`--fs-field`,
  the iOS zoom floor). Burmese ≥13px Padauk 400/700, `font-synthesis: none`, line-height 1.6, separated
  by margins or a " · " text node — never a whitespace flex child.
- Reduced motion: no fold animation, no cap ignition (static cap), `behavior: "auto"`.

STATES (this screen's variants, for the build):

- ASAP UNAVAILABLE (`asapAvailable=false`): the left pill `aria-disabled` + `.checkout-pill[aria-disabled]`
  (opacity .65, never lit; globals.css:3616-3620), line 2 "Unavailable" (:258), `aria-label` the shipped
  "— unavailable right now, the kitchen is closed or fully booked" (:249); the hint reads the shipped
  "As soon as possible isn’t available right now — please pick a pickup time." (:297, "above" dropped:
  the pill is beside it); When counts as UNANSWERED → kicker "3 lines left"; Pay held with "Pick a pickup
  time first." (`payBlock: "when"`). A right-pill tap opens the sheet; a pick answers the line.
- EARLIEST READ OUT / FAILED / EMPTY: hint "Booked when you pay — it shows on the next screen." (no clock,
  no prep). MY: none (listed).
- FROZEN (`editsFrozen`): both pills dim via `[aria-disabled]`; a tap says "Pickup timing is locked while a
  checkout finishes." (PickupWhenChoice.tsx:33) through the one region; name/phone stay editable (they ride
  the next create-intent, not a cart write).
- RACED / FILLED / CLOSED / OFFLINE on a pill write: the shipped sentences (:39, :209-214, :220), pill
  snapped back to `confirmedSlot` + `onRevert()` re-read (the optimistic doctrine, unchanged).
- WHEN FOLDED (after the diner opens line 2): the When row becomes a read-back: ✓ ring (`--ok`), value
  "As soon as possible" 14px/600 `--tx` (or `formatSlotLong(slot)` when scheduled), quiet "Change"
  (`aria-label="Change the pickup time, as soon as possible"`), which re-opens the pills.
- LINE 2 OPEN (the first keyboard moment): label "First name for pickup" + MY, the `Field` well 318×48
  (`.ui-field-control.checkout-promo-input`: `--sunken` #efece2, 1px `--bd`, radius 12, inset bevel, 16px
  `--tx`, placeholder "e.g. Aye Aye" `--t3`, `autoComplete="given-name" enterKeyHint="next" maxLength=40
required aria-required`), note "It goes on the counter’s screen, so they know whose bag is whose." 13px
  `--t2` + MY draft "ကောင်တာ စခရင်မှာ ပေါ်ပါမယ် — ဘယ်သူ့အိတ်လဲ သိအောင်ပါ" (brief:149; true: the name headlines
  the expo bag card ExpoBoard.tsx:1376, :1690 — never "the kitchen's ticket" in guest copy, K16).
  ERROR on blur after typing: the note becomes `PICKUP_CONTACT_MESSAGES.name.en` "Add a first name for
  pickup — it goes on the counter’s screen." in `--warn` 600 + `<span lang="my">` "နာမည် ထည့်ပေးပါ"
  (brief:90, DRAFT), `aria-invalid="true" aria-errormessage`; the line never folds on a refusal.
- LINE 3 OPEN: label "Phone number" + "ဖုန်းနံပါတ်", the well `type="tel" inputMode="tel" autoComplete="tel"
enterKeyHint="done" maxLength=20`, placeholder "e.g. (626) 555-0142" (Checkout.tsx:4902), note "Only if we
  need to reach you about this order." (:4917, verbatim) + MY draft "ဒီအော်ဒါနဲ့ ပတ်သက်ပြီး ဆက်သွယ်ဖို့ လိုမှသာ"
  (brief:58). ERROR: `PICKUP_CONTACT_MESSAGES.phone.en` "Add a phone number with at least 7 digits — we’ll
  only use it about this order." + MY "ဖုန်းနံပါတ် ထည့်ပေးပါ — အနည်းဆုံး ဂဏန်း 7 လုံး" (brief:89, DRAFT).
- ANSWERED → FOLDED: on blur / Next with the predicate passing for that line, the line folds (240ms, RM
  instant) into a read-back row and the next unanswered line opens with focus; the kicker counts down
  ("1 line left"); the last fold moves focus to the kicker and the region says "Slip filled in — Pay is
  below." — focus never jumps to Pay. The kicker then reads "✓ All set" (✓ `aria-hidden`, sr "all three
  answered") and the dock line "Ready to pay."
- HAND-OVER ("Order for a friend" / "Forget this device"): both keys cleared (device-session.ts:42) → the
  slip opens as drawn.
- BUSY: door "Starting checkout…" `aria-busy`, opacity .7 (the shipped loading state, PayDock.tsx:111).
- 375×667 / 320×568 (graft k, headless, before claiming Pay is in reach): dock height 115 is constant; at
  375×667 the dock top is y442 and the slip's kicker, When label and pills (y185–299 with the header at
  y20–76) are above it; at 320×568 the dock top is y343 and the pills' bottom edge (y299) still clears it.
  Pay is in the viewport at every scroll position on all three frames by construction (fixed); the
  measurement asserts the pills clear the dock top at first paint on each.

---

## SCREEN picked-m13-2.dc.html — A regular: read-back rows, "Saved on this phone.", When open, Pay live

Device: phone 390×844. Theme: light.

LAYOUT:

- y0–212 identical to screen 1 (safe area, header, h1, rail).
- **y212–535 THE SLIP** (same card recipe). Inner column x36–354:
  - y228–248 KICKER ROW: "PICKUP SLIP" · "လာယူ"; right: "✓ All set" 12px/700 `--ok` #346e47 (✓ `aria-hidden`
    - `<span class="sr-only">` " — all three answered").
  - y256–276 LINE 1 (OPEN) label row: ring "1" `is-current`, "When" · "လာယူချိန်" — as screen 1.
  - y282–326 THE PILLS — exactly screen 1 (left lit "As soon as possible" / "Booked when you pay"; right
    ghost "Pick a time" / "အချိန် ရွေး").
  - y334–394 THE HINT — exactly screen 1 ("Right now the earliest is 12:40 PM. The kitchen needs about 12
    min." + "အခု အစောဆုံးက 12:40 PM ပါ").
  - y406 hairline.
  - y407–451 LINE 2 READ-BACK (44px, flex, gap 10, padding 0 2px): ✓ ring `is-done` (20px, 1px `--ok`
    #346e47 border, `--ok` 12px ✓ — a 12px stroke check svg, `aria-hidden`) · `<span class="sr-only">`
    "First name, answered:" · "Aye Aye" 14px/600 `--tx` (hydrated `mms.name`, Checkout.tsx:679-681) ·
    trailing quiet `<button>` "Change" min-width 44 × 44 tall, padding 0 8px, no fill, 13px/700
    `--ac-strong` #8f5009, `aria-label="Change the first name, Aye Aye"`.
  - y451 hairline.
  - y452–496 LINE 3 READ-BACK: ✓ ring · sr "Phone number, answered:" · "(626) 555-0142" 14px/600 `--tx`
    `class="tn"`, shown in full (never masked — a shared family phone must see whose number this is) ·
    "Change" (`aria-label="Change the phone number, (626) 555-0142"`).
  - y498–519 THE ONE FOOTER LINE (graft c, D11-true): `<p>` 13px `--t3`, margin 2px 0 0 30px (indented under
    the rings), flex-wrap, baseline: "Saved on this phone." then `<span lang="my" style="margin-inline-start:
8px">` "ဒီဖုန်းမှာ သိမ်းထားပါတယ်" Padauk 13px — one line when it fits (≈286px of 288), wrapping to a second
    21px line otherwise. Shown ONLY when both values came from the device; never for an account-seeded name.
  - y519–535 card bottom pad 16.
- y543–603 THE NEXT-STEP SENTENCE — "Your ticket comes after you pay — show it at the counter." + the MY
  draft, exactly as screen 1 (one quiet sentence, every visit; it is true for a regular too and costs 60px).
- y607–651 "← Browse the menu · ထပ်မှာမယ်" (under the dock's fade at scroll 0).
- y655 → the review as screen 1.
- **y595–734 THE DOCK**: y619–662 the line slot "Ready to pay." 16px/600 `--tx` centred (EN-only,
  Checkout.tsx:3850; the slot keeps its min-height so the column does not move); y670–734 the door at FULL
  opacity, no `aria-disabled`, no `aria-describedby`: "Pay · <span class="tn">$42.10</span> →" + "ရှင်းမယ်".
  Hover only: the one-sweep `::after` shine and the 3px arrow nudge (globals.css:2313, 2334).
- y750–844 DinerTabs as screen 1.

COPY (English):

- PICKUP SLIP · ✓ All set
- When · As soon as possible · Booked when you pay · Pick a time
- Right now the earliest is 12:40 PM. The kitchen needs about 12 min.
- Aye Aye · (626) 555-0142 · Change
- Saved on this phone.
- Your ticket comes after you pay — show it at the counter.
- Ready to pay.
- Pay · $42.10 →
- (variants) Cancel · Scheduled · Tomorrow 6:45 PM · Pick a pickup time first. · Starting checkout…

COPY (Burmese):

- the screen-1 set, plus:
- ဒီဖုန်းမှာ သိမ်းထားပါတယ် — brief-m13.md:91 K15 DRAFT (grounded: ဒီဖုန်း cart.ts:233; သိမ်း staff `browse.name.save`)
- ပြောင်းမယ် — brief-m13.md:192 K15 DRAFT for "Change" — the `aria-label`'s MY twin only; the visible 44px
  button stays "Change" (EN) until K15 (never အကြွေ, the money handed back, staff.ts:3492)
- မလုပ်တော့ပါ — SHIPPED "Cancel" (lib/i18n/common.ts:19) — the quiet Cancel beside a re-opened field
- {t} မှာ လာယူမယ် — SHIPPED (staff.ts:1281 `floor.settled.slot`) — the scheduled read-back's MY sub ("Pickup at {t}")
- လာယူချိန် အရင် ရွေးပါ — brief-m13.md:93 K15 DRAFT — the dock's "when" line

A11Y:

- The read-back rows are static text (`<span>` value + sr prefix); only "Change" is in the tab order
  (44×44+, named with its value). The kicker "✓ All set" has its sr suffix.
- Change on a read-back re-opens that line with the value kept in the field and **`select()` on its text**
  (graft j: one-gesture overtype when ordering for someone else); a quiet "Cancel" (`common.ts:19`,
  "Cancel · မလုပ်တော့ပါ") 44px beside the field restores the fold untouched — name and phone are device
  state until Pay, so the undo is free and instant (no server write, no Undo window: the house's one Undo
  form is for deferred writes, not for this).
- Focus on Change → the field (text selected); on Cancel → back to that row's Change; on a passing blur →
  the row folds and focus moves to the next unanswered line, or to the kicker when none remains (the
  region: "Slip filled in — Pay is below.").
- Live region: the review's one `status`. The footer line and "Ready to pay." are static.
- The live door is a plain `<button>`; no `aria-describedby` (the shipped pattern: described only while
  held, Checkout.tsx:5536).
- Targets ≥44 throughout; Burmese ≥13px Padauk; margins between tongues.

STATES:

- PREFILLED-VALID (drawn): both read-backs, one footer line, Pay live; the only required act is Pay.
- CHANGE → EDITING: the line re-opens (240ms; RM instant) with the field focused and selected, "Cancel"
  beside it; no error until a blur after typing; the dock stays LIVE until the predicate fails (the held
  state follows `pickupContactMissing`, the same instant the row error does — one source).
- BAD PHONE ON BLUR ("626"): `aria-invalid` + `--warn` border, note → "Add a phone number with at least 7
  digits — we’ll only use it about this order." + "ဖုန်းနံပါတ် ထည့်ပေးပါ — အနည်းဆုံး ဂဏန်း 7 လုံး" (`--warn` 600,
  `uiRise`), kicker "1 line left", dock line "Pay opens when the slip is filled in." + MY, door dimmed and
  described. The footer line is not drawn while a row is invalid (the error is the row's one line).
- SCHEDULED: right pill lit "Scheduled" / `formatSlotLong(slot)` ("Tomorrow 6:45 PM" — the day now visible
  to the sighted reader, not only in the `aria-label`, PickupWhenChoice.tsx:271-285), left pill ghost with
  its sub "Booked when you pay"; the hint drops to the shipped "Ready for pickup Tomorrow 6:45 PM." (:298) with
  `<span lang="my">` "Tomorrow 6:45 PM မှာ လာယူမယ်" (staff.ts:1281, `{t}` Latin). The When read-back row (once
  folded) reads the same `formatSlotLong(slot)`.
- NOT REMEMBERED BUT KNOWN (an account name seeded, no phone): line 2 folded with the name, line 3 open
  after When; no "Saved on this phone." (the sentence is only true for a device read).
- FROZEN / RACED / CLOSED: as screen 1.
- NIGHT: slip `--cd` #2b213c, ✓ ring `--ok` #5fb07e, Change `--ac` #e7a53a (Night aliases ac-strong), dock
  `--pg` #100c19 opaque, door gold ramp with `--oa` #130d1e ink.

---

## SCREEN picked-m13-3.dc.html — The slot sheet: bilingual, the full address, the earliest chip, "{n} left"

Device: phone 390×844. Theme: light. The sheet opens over screen 2 (a regular, ASAP lit, no slot chosen)
after a tap on "Pick a time"; the page beneath is drawn as screen 2 at scroll 0 and scrimmed.

LAYOUT:

- y0–844 the page (screen 2) beneath, `aria-hidden` / inert while the dialog is open; the dock and tabs
  included.
- SCRIM `.mms-scrim` (globals.css:134): full-frame `rgba(15,10,5,0.3)` (`--scrim-glass`), the shipped
  defocus (draw as the round-3 picked artboards do: `backdrop-filter: blur(28px) saturate(0.85)`),
  z above the dock and tabs. A tap on it closes (Radix `onDismiss`; `mayDismiss`, sheet-dismiss.ts).
- **THE SHEET** `<div role="dialog" aria-modal="true" aria-labelledby="slot-title">` `.mms-sheet`: fixed,
  x0–390 (max-width 440 → full width here), bottom 0, max-height `calc(100dvh − safe-top − 1rem)` = 781
  (tokens.css:86), background `--cd` #fffdf8, radius 26px 26px 0 0 (`--r-sheet`, tokens.css:81), shadow
  `0 24px 60px rgba(35,24,16,0.16)` (`--sh-xl`), padding `0 20px calc(24px + 34px)`. Content height here
  ≈ 480 → sheet top **y364**; it grows toward y63 on a long day and scrolls inside.
  - y364–472 THE HEAD `.mms-sheet-head` (sticky, background `--cd-raised` #ffffff, `inset 0 1px 0
var(--sheen)`, margin-inline −20, padding 8px 20px 8px; globals.css:235-281): y372–416 the grab handle
    row 44px (`aria-hidden`; a 38×5 bar rgba(58,35,23,0.1), radius 3, centred — the swipe-to-close zone);
    y416–443 `<h2 id="slot-title" class="mms-sheet-title">` "Pick a pickup time" Fraunces 22px/1.2 600
    −0.02em `--tx` (PickupSlotSheet.tsx:117, verbatim); y443–464 `<span lang="my">` "အချိန် ရွေး" Padauk 13px
    `--t2` block (v7.2.html:506, VERBATIM). The ✕ `.mms-sheet-close` at top 6 right 10, 44×44 with a 32px
    `--sf` #f2efe7 disc and an 18px stroke ✕; its name is the ONE dismiss word — `closeLabel={{ idle:
<>Close <span lang="my">ပိတ်</span></> }}` (common.ts:20 `close`, SHIPPED; the sheet's default `aria-label`
    is "Close", sheet.tsx:349).
  - y480–500 THE ADDRESS LINE `<p>` 13px `--t2` #6e6358, margin 0 0 14px, flex, gap 3: `Icon name="pin"` 14px
    (packages/ui/src/icon.tsx:95, `aria-hidden`) + **"750 Terrado Plaza, Suite 33, Covina, CA 91723"**
    (`BRAND_ADDRESS`, apps/qr/lib/brand.ts:17, VERBATIM — replaces PickupSlotSheet.tsx:124's literal "750
    Terrado Plaza, Covina"; the Suite is on the one screen where a first-timer decides to drive).
  - y514–594 THE DAY RAIL `.slot-days` (`Rail role="group" aria-label="Pickup day"`, gap 8, padding 4px 0
    16px, horizontal scroll, snap; shown only when `groups.length > 1`, :183): day cards `.slot-day` 70+
    wide × 60 tall, radius 14, 1px `--bd`, `--sf` #f2efe7, column, gap 3, padding 9px 12px:
    "Today" `.slot-day-kicker` 12px/800 `--tx` + "9 times" `.slot-day-count` 11px/600 `--t3`;
    the ON card `.slot-day-on` (`aria-pressed="true"`): `--cd` #fffdf8, border `--ac`, `--sh-lift`, its count
    in `--ac`. Second card "Tomorrow" · "24 times" (`aria-pressed="false"`). (globals.css:1442-1492.)
    Day labels are `dayLabel()` (pickupTime.ts:17-28): Today / Tomorrow / "Sat Jun 21" — English-only, listed.
  - y594 → THE DAYPART SECTIONS `.slot-parts` (gap 16): each `<section role="group" aria-label="Afternoon
pickup times — Today">` (:205-210): - y594–614 section head `.slot-part-head` (flex, gap 8): a 15px stroke sun glyph `aria-hidden` (the
    shipped ☀️ emoji at pickupTime.ts:50 is `aria-hidden` too; RULES §2 draws a stroke svg) · "Afternoon"
    13px/800 `--tx` · right-aligned "6 times" 11px/700 `--t3` (`.slot-part-count`). - y622–736 THE GRID `.slot-grid` (`repeat(auto-fill, minmax(102px, 1fr))` → 3 columns of ≈111px at 350,
    gap 8): row 1 y622–678 (56px, the soonest chip sets the row), row 2 y686–736 (50px). - CHIP (rest) `.slot-time` 50px min, radius 12, 1.5px `--bd`, `--cd` bg, column centred, gap 1:
    `.slot-time-h` 15px/700 `--tx` tabular ("12:55 PM"). - **THE EARLIEST CHIP** (x20–131, y622–678) `.slot-time.slot-time-soonest` (globals.css:1571-1578):
    min-height 56, border `--ac` #a65f10, bg `color-mix(in srgb, var(--ac) 12%, var(--cd))` ≈ #f4eadc,
    `inset 0 1px 0 var(--sheen), 0 0 14px -8px var(--glow-gold)` (draw the glow as `0 0 14px -8px
#e8a83c`): tag `.slot-soonest-tag` "EARLIEST TIME" 11px/800 uppercase .13em `--ac-strong` #8f5009
    (globals.css:1579-1586), line-height 1, then "12:40 PM" 15px/700. sr prefix
    "Earliest time, " (:243). No ⚡ glyph (the words carry it; one vocabulary). `aria-pressed="false"`
    (nothing chosen yet: `currentSlot == null`, so the soonest wears the glow — :234). - A LOW CHIP (x139–251, y686–736): "1:10 PM" + `.slot-time-low` "2 left" **11px** (`--fs-xs`; the
    shipped 10.5px at globals.css:1527-1531 sits under the W9e 11px floor — raise it) 600 `--warn`
    #a44b34 — graft (e): the 🔥 dropped, the server's `remaining` kept (lib/pickup.ts:12, :38). It is
    visible text, so its name reads "1:10 PM, 2 left". - the rest: "12:55 PM" · "1:25 PM" · "1:40 PM" · "1:55 PM". - y752–772 head "Evening" + "3 times" (a 15px stroke moon glyph `aria-hidden`); y780–830 grid: "5:00 PM"
    · "5:15 PM" with "1 left" · "5:30 PM".
  - y830–844 + the 34px safe inset: the sheet's bottom padding (the home-bar reserve; nothing drawn).
- Nothing else: no ASAP chip inside the sheet (the pills on /cart are the one owner of the choice, D10; a
  pick here reports up and closes instantly, PickupSlotSheet.tsx:77-80, and the parent writes it through the
  serialized `writesRef` chain with revert + re-read on refusal).

COPY (English):

- Pick a pickup time
- Close
- 750 Terrado Plaza, Suite 33, Covina, CA 91723
- Today · 9 times · Tomorrow · 24 times
- Afternoon · 6 times · Evening · 3 times
- EARLIEST TIME
- 12:40 PM · 12:55 PM · 1:10 PM · 1:25 PM · 1:40 PM · 1:55 PM · 5:00 PM · 5:15 PM · 5:30 PM
- 2 left · 1 left
- (states) Loading pickup times… · Couldn’t load pickup times. · Try again · Looking for pickup times… ·
  Retrying… · No pickup times available right now — please check back soon. · ✓ Yours · Your current time,

COPY (Burmese):

- အချိန် ရွေး — v7.2 VERBATIM (docs/prototype/v7.2.html:506) — the title's second tongue
- ပိတ် — SHIPPED (lib/i18n/common.ts:20 `close`) — inside the ✕'s name "Close · ပိတ်"
- ထပ်ကြိုးစား — SHIPPED (lib/i18n/common.ts:21 `tryAgain`) — the failure state's retry reads "Try again ·
  ထပ်ကြိုးစား" (the MY in a `<span lang="my">` after the EN, margin 6)
- Day labels, daypart labels, "{n} times", "Earliest time", "{n} left", the loading / failure / empty
  sentences: ENGLISH-ONLY (no shipped Burmese, none invented) — listed below.

A11Y:

- `role="dialog" aria-modal="true"` named by the title (Radix: focus trap, Esc, scroll lock; focus restore
  to the opener — the right pill — is the primitive's own, sheet.tsx:94-98). Four dismissals: ✕, scrim tap,
  Esc, handle drag (R5b) — none is blocked (no `busy`: the sheet performs no irreversible write).
- Initial focus: the container (J21 — the dialog and its title are announced first, never "Close"); when
  the diner already holds a slot, focus moves ONCE per open to their chip (`selectedRef`, :87-101) and it
  scrolls into view RM-aware.
- The day rail `role="group" aria-label="Pickup day"`, cards `aria-pressed`; each daypart a `role="group"`
  named "{Part} pickup times — {Day}"; chips `aria-pressed` with the sr prefixes "Earliest time, " / "Your
  current time, "; the glyphs (pin, sun, moon, ✕) `aria-hidden`.
- Live region: the sheet's own `<p role="alert">` for the load failure ONLY (:149) — the loading skeleton is
  `aria-hidden` with an sr-only "Loading pickup times…" (:131), the empty line is plain text. The page's
  region stays silent while the dialog is open.
- Retry is `aria-disabled` while retrying, never native (it stays in the focus order, :155).
- Targets: chips ≥50 (the soonest 56), day cards 60, ✕ 44, retry 44. Latin digits with `class="tn"`.
- Reduced motion: `.slot-day, .slot-time { transition: none }` and no `:active` scale (globals.css:1588-1597);
  the sheet's CSS entrance/exit are RM-escorted in the primitive; the chip scroll is `behavior: "auto"`.

STATES:

- LOADED (drawn): two days, Today on; Afternoon + Evening; the earliest chip glowing; two low chips.
- ONE DAY ONLY: the day rail is hidden (:183) — the sections start under the address.
- SLOT CHOSEN (re-open): the diner's chip `.slot-time-on` (border `--ac`, bg color-mix 10%, `--sh-lift`)
  `aria-pressed="true"` with "✓ Yours" (`aria-hidden`; sr "Your current time, "); the soonest chip keeps its
  tag but loses the glow unless it IS the choice (:234); the sheet opens on the chosen slot's DAY (:59-62).
- LOADING: the skeleton mirror (three 70×60 day blocks, six 50px chips), `aria-hidden`.
- FAILED (honest — never the sold-out words): `<p role="alert">` 13px `--warn` "Couldn’t load pickup times."
  - the 44px underline button "Try again · ထပ်ကြိုးစား"; while retrying: "Looking for pickup times…" /
    "Retrying…" (`aria-disabled`), the card never unmounts (:38-41).
- EMPTY (the read succeeded, nothing bookable): "No pickup times available right now — please check back
  soon." 13px `--t2` (:176-178) — no hours, no day named (ruling #10).
- A PICK: `choose(slot)` → `onChosen` + close (:77-80); the parent flips the right pill to "Scheduled /
  {formatSlotLong}" optimistically and writes `setPickupSlot`; on `unavailable` → "That time just filled —
  pick another." through the page's one region and the pill snaps back (PickupWhenChoice.tsx:207-215).
- NIGHT: sheet `--cd` #2b213c, head `--cd-raised` #362848, chips `--cd` with `--bd` rgba(243,236,223,0.13),
  the soonest border/glow `--ac` #e7a53a, low "{n} left" `--warn` #e0855f, day cards `--sf` #211a30.

---

## DECISIONS

1. Backbone = the Counter Slip (guided): one line open at a time, read-back rows with Change, a count of
   what is left, Pay docked and held with its own reason — the register the owner bound for diner moments
   (lens, 2026-10-07) and the shape the record already filed (PHASE3B_DESIGN.md:393-396, J24).
2. Line order When → Name → Phone (the task's screens): When is answered by default (ASAP,
   PickupWhenChoice.tsx:8-11), so the first open line is a statement, and the thumb work follows it.
3. The ASAP pill reads "Booked when you pay", no clock (D4; graft b); the live earliest sits only in the
   13px hint as `formatSlotLong` from the sheet's own read (graft i: on mount, on open, on visibilitychange).
4. Prep is a secondary clause printed only from a real `pickup_config` row (D4; ruling #10) —
   `getPrepMinutes` and cart/page.tsx:136 lose their typed-12 fallbacks for a null arm.
5. The visible "Required" badges (Checkout.tsx:4842, :4891) and the pills' hint paragraph
   (PickupWhenChoice.tsx:291-298) are retired; `required` / `aria-required` stay (graft a).
6. "We’ll call your name when your order’s up." (Checkout.tsx:4870) is gone: no caller exists (M73; DL §5
   :127); the name note says where the name goes — the counter's screen (ExpoBoard.tsx:1376, :1690), never
   "the kitchen's ticket" (K16, OWNER_RULINGS:92).
7. ONE `PICKUP_CONTACT_MESSAGES` at both ends; create-intent's "we need someone to call" (route.ts:360)
   is replaced by the same constant (D4; the W17 "name it once" rule in sentence form).
8. The kicker counts "{n} lines left" / "✓ All set" (graft g) — never "{n} left", which is the sheet's seats.
9. The dock is the shipped `PayDock` host in a pickup variant with `.counter-dock`'s geometry (inset 12px,
   opaque `--pg`, 64px door, no counter button) — one dock, one geometry, never a parallel band; it never
   renders `PAY_OPENS_SERVED` (graft l's jsdom test).
10. The held dock line does not repeat the count ("Pay opens when the slip is filled in."): the kicker is
    the one count; the when-arm reads "Pick a pickup time first.".
11. A held-Pay tap walks to the first unanswered line (region → open → scroll → focus); the root's
    `scroll-padding-bottom` gains `--cta-dock-h` so the field never lands under the dock (globals.css:5499).
12. Validation on blur through the `Field` primitive, which gains `aria-errormessage` (graft f); an untouched
    empty line is never scolded; Pay never refuses for a missing contact (D4) — the W21 branch at
    Checkout.tsx:3043-3052 stays only as the unreachable backstop.
13. A regular's two helpers collapse into ONE footer line "Saved on this phone." (graft c; D11-true,
    PHASE3B:85-90), drawn only when both values hydrated from the device.
14. The next-step sentence is "Your ticket comes after you pay — show it at the counter." (graft d;
    track.ts:71-75 `passSub`) and it shows on every visit (the task's screen 2 names it for the regular):
    one quiet line, true every time — reversible to first-visit-only on the owner's word.
15. Change re-opens with `select()` on the value (graft j); Cancel restores for free (device state, no write,
    no Undo window — the house's Undo form is for deferred writes).
16. The sheet prints `BRAND_ADDRESS` verbatim (brand.ts:17; D4), keeps "{n} left" without the 🔥 (graft e),
    drops the ⚡ as well (the tag's words carry "earliest"; RULES §2 no emoji; one vocabulary), raises
    `.slot-time-low` to the 11px floor, and names its ✕ with the one dismiss word "Close · ပိတ်" (common.ts:20).
17. Bilingual: EN leads; every MY is a shipped string or a brief draft, cited; nothing invented — the EN-only
    residue is listed for a new OPEN-ITEMS `K15 · diner-togo` row.
18. The PII-free `pickup_next_step` event (graft h) makes the success metric measurable (Checkout.tsx has no
    capture today; route.ts:442 fires only after the gate).
19. Three-ring vocabulary, the 21px clock, the non-Pay hero verb, the promo/reward fold and bare "Clear"
    are NOT grafted (the judgement's exclusion list).
20. No ASAP chip inside the sheet (PHASE3B:395's older wording): the pills own the choice (D10), the sheet
    picks a scheduled slot — the record step should reconcile that line.

## OPEN RISKS

- **Keyboard trap / focus choreography** in the accordion (the judges' admitted risk): fold-on-blur plus
  auto-open of the next line must never move focus while the diner is mid-gesture on another control
  (e.g. tapping the right pill while the phone field blurs). Rule: a blur caused by a tap on a slip control
  folds but does NOT steal focus from the tapped control; only Next/Enter/done advance focus. Needs a jsdom
  test per transition.
- **320×568 crowding**: with When open, lines 2–3 sit under the dock at first paint on the smallest frame
  (dock top y343); the walk-to and `scroll-padding` fix keep them reachable, but graft (k)'s headless
  measurement must run before the PR claims "Pay in reach" — and if the hint wraps to three EN lines on a
  larger system font, the pills may touch the dock top at 320.
- **The lifted `getPickupSlots` read** runs for every pickup cart mount even when the diner never opens the
  sheet (one RPC per mount + one per visibilitychange); acceptable, but it is a new server-action call on
  /cart — watch its cost, and fail SILENT (the hint simply drops the clock).
- **`getPrepMinutes` → null** touches lib/pickup.ts (MONEY_PATHS): either a mutant that separates "null
  drops the clause" from "12 prints it" or an in-file `verify:slice-exempt` with the reason.
- **`PayDock` prop change** (`counter` optional / `variant: "pickup"`) touches the dine-in Bill's dock —
  the PD10 jsdom suites must stay green, and the pickup variant's "never `PAY_OPENS_SERVED`" test must be
  watched to fail first.
- **Burmese drafts** (all K15, Claude-authored or brief-grounded): "ဖုန်းနံပါတ်", the name note, the phone
  note, the two error lines, "ဒီဖုန်းမှာ သိမ်းထားပါတယ်", the next-step sentence, the two dock lines, the clipped
  hint clause, "ပြောင်းမယ်" (aria only). HIGH: "အော်ဒါအတွက် နာမည်" is a staff-register word on a guest phone.
- **ASAP availability vs. the hint's clock**: `asapAvailable` comes from `mms_pickup_asap_ok` while the
  hint reads `mms_pickup_slots`' first row; if capacity flips between the two reads the lit pill and the
  hint can disagree for one view — the charge boundary (`mms_pickup_asap`, pickup_asap.sql:78-84) remains
  the authority; the hint is display-only and says "right now".
- **`aria-errormessage`** support is uneven across screen readers; `aria-describedby` is kept beside it.
- **The next-step sentence on every visit** is a product choice the owner may reverse (first-visit only);
  the gate is one boolean (`!remembered`).
- **The shipped `disabled={payBusy}`** on the busy door (PayDock.tsx:104) drops it from the tab order for a
  second — unchanged here, flagged as before.

---

## Appendix — what changed after this spec (applied in the drawn screens)

The spec above was written first. Two later passes changed it, and the screens on the canvas were drawn
with both applied. **Where an item below contradicts the spec above, the item below wins.**

### A · System amendments (the cross-moment consistency pass)

**The shared vocabulary (every moment takes it):** ONE VOICE, TWO REGISTERS; ONE SET OF MARKS (the 2026-10-07 vocabulary, PATH_DESIGN_2026-10-07.md:74-135, extended — never paralleled). DINER (m13–m16, guided, English leading; D5's "မင်္ဂလာပါ · Good evening" is the one Burmese-first line): each screen says NOW once as its heading; then ONE actor-first next-step sentence with no label — when the hero is DOCKED its one line slot carries that sentence (live) or the hero's held reason (held), never both and never a third line ("Ready to pay." is neither); the Order · Pay rail (+ /track's status path) is the only step vocabulary, so no dots, rings or "n of m" marks appear beside it; a shared cart never shows a count; inside any window the words are future/-ing, past tense only after a confirmed write; a link's Burmese rides inline after the English (margin, never a whitespace flex child), stacking inside the same ≥44px target only when it does not fit; back links are the shipped `.nav-link` (14px 700 `--ac`, arrow aria-hidden) with Burmese ≥13px. STAFF (m17–m20, glanceable, Burmese first, English echo stacked on headings/slots, inline on count lines, NEVER on a 44px chip): the next step lives in the control's own words; counts in prose render Burmese numerals under `my` (`fill.ts` `{n}`), standalone figures (clocks, money, codes, table numbers, the KDS stat row) stay Latin; every refusal is keyed by code and twinned in `OUTAGE_TWINS`. SHARED MARKS: lit-gold cap (`--ac` fill, `--oa` ink, sheen + gold halo; `.checkout-pill-on` on phones, the `.kds-chip[aria-pressed]`/`.staff-seg` rule on the console) = chosen or you-are-here, never a recommendation, never a status; solid ✓ disc in `--ok` = done (a diner line answered, PAID on a settled row); half disc (left `--warn`, right paper) = partly returned; full `--warn` disc = returned in full; HOLLOW RING = "Not sent yet · မပို့ရသေး" and nothing else (`--t2` on phones, `--warn` on the console) — no eyebrow dot, no refund state, no inert control may use it; DASHED `--ac` edge on `--sf` = provisional, which on every surface here means the open Undo window (the diner's `.arrival-undo`/`.checkout-undo`, the console's `.clear-undo`/`undoBtn`): the SAME node that committed relabels "Undo" + the D3 Burmese (ပြန်ဖျက် when a mark you made is erased, ပြန်ယူ when something sent comes back), arms after the same-gesture guard (350 ms phones / 400 ms console), writes at `PICKED_UNDO_MS` named once per consumer (`FEEDBACK_UNDO_MS`, `TEAM_UNDO_MS`, `ARRIVAL_UNDO_MS` = 6 000), the seconds an aria-hidden leaf in the register's shipped shape (diner " — 6s", staff "· 6s"), the KDS cream pill its one shipped exception, Esc never an Undo unless every window has it; HELD/INERT CONTROL = the real control at its real shape, `aria-disabled` (never native) with the reason in its name or `aria-describedby`, dimmed by the shipped rule (`.ui-btn` .55, `.checkout-pill` .65, `.staff-btn` .6) — never a dashed ghost, never a hollow ring; BUSY = `aria-busy` with the label KEPT (on a `.staff-btn` plus the .6 dim — D8; on an `@mms/ui .ui-btn` the full-ink spinner plus a stated word like "Refunding…"), never "…", never native disabled, and busy marks only the ONE control that is writing (the zone's fact is `aria-disabled`); WARN = a 6px `--warn` disc (the one warn mark; no squares, no second glyph) beside a word — light: the word in `--warn` (the console's shipped `.entry-msg-warn`/`Badge warn` pair); Night: the word in `--tx`, only the mark in `--warn` (P2bm) — a warn GROUND fill only on a Late ticket/bag, the floor's one ask tile and the money-in-doubt badge; GREEN = done and settled, calm (never counted, never pulsing, filled only where it just landed: the picked header, the ✓ disc); GOLD TINT = the till (money taken/owed/waived) and the brand mark, never an alarm; a REMOVING verb (Deactivate, Mark sold out) is a paper pill with `--warn` ink, a RESTORING verb (Reactivate, Put back) a paper pill with `--ok` ink — no tinted fills on routine verbs so nothing shouts during normal service; CHEVRON › = opens/collapsed, ⌄ = expanded, inside the row button; one dismiss word "Close · ပိတ်", one cancel word "Cancel · မလုပ်တော့(ပါ)", one search field recipe on the console (the pad's 48px `--sf` radius-12 field + the 44px `pad.search.clear` circle); ONE live region per view, the count/kicker/hint/next-step lines all static; the receipt code is ONE glyph string on both sides of the counter ("#A1B2C3" on the guest's slip and on Dad's desk); the ONE KITCHEN TRACK's stamps (ပို့ပြီး · ချက်နေဆဲ · ထုတ်ပြီး) are the words for the kitchen's state on every surface that shows it. LOUDNESS LADDER (console): ALARM may tint and move — KDS Late, a late bag, money in doubt (the stranded charge, the unpaid badge) said once in the view's one region; CALL — one filled tile per room (the guest asking to pay, the rung lane card's one-shot ring); MARK — glyph + word, no fill, no motion (refund shapes, the dated since-clock, the not-sent ring, dashed pending, the stale disc); CALM — done, paid, picked up, put back. No fact is marked twice on one screen; delight is one moment per pass, never on a first read or inside a window; glass is Night-only, the bar alone.

**This moment's amendments:**

1. The next-step sentence moves INTO the docked hero's one line slot: held → the held reason ("Pay opens when the slip is filled in." / "Pick a pickup time first."), live → "Your ticket comes after you pay — show it at the counter." + its K15 draft, replacing the EN-only "Ready to pay." (PATH_DESIGN_2026-10-07.md:78-80: a docked hero's slot carries that sentence or the held reason, never both; a third line is neither). The standalone <p> under the slip (y520–580 / y543–603) is removed — one owner per sentence, 60px back on 320×568. Raise `.counter-dock-line`'s min-height once so the two-line EN + MY sentence fits in BOTH states and the column never moves (dock ≈137px; re-run graft (k)'s three frames). D4's "first-visit line" is thereby subsumed by the register's rule and shown whenever Pay is live; record the reversible gate (`!remembered` → the sentence, else a one-line slot) for the owner.
2. The back link is the SHIPPED `.nav-link` recipe (globals.css:4510-4521: 14px `--fs-label` 700 `--ac`, arrow aria-hidden), not "11px/700 `--t3`" — Checkout.tsx:4247-4255 renders `.nav-link` with `<My size="var(--fs-xs)">`; lift that Burmese from 11px to `--fs-sm` 13px (the Burmese floor; the same one-token lift m14 OPEN RISK 6 asks for `bodyMy`).
3. State the digit rule for the slot sheet's counts the way the staff specs do: "{n} left" / "{n} times" are EN-only here so Latin is right; but the kicker's "2 lines left" and "✓ All set" stay plain static text (not a live region) — already so; add the sentence "the ✓ ring on an answered row is the rail's own `is-done` ring (globals.css:2263-2269), the diner's one done mark; the solid ✓ disc is the console's" so the reader does not read two done marks.
4. Note the one gold mark that is NOT a selection: the slot sheet's EARLIEST chip wears the shipped gold border + glow with no fill (`.slot-time-soonest`) — say explicitly that it is a suggestion, never the lit cap (no `--ac` fill, no `--oa` ink), so the one-selection-vocabulary rule holds.

### B · The adversarial critic's blocking fixes (verdict: fix)

1. **Amendment 1 is not applied. The next-step sentence still has two owners, and the docked hero's live line is still the EN-only "Ready to pay.", which the vocabulary says is neither of the two things that slot may carry.**
   - Evidence: The standalone sentence is still drawn on both screens: picked-m13.md:178-181 (y520–580) and :334-335 (y543–603). The live dock line is "Ready to pay." with `my: null` at :60, :292, :338 and :352. Neither line follows the binding rules: amend.md m13 #1 requires the live slot to read "Your ticket comes after you pay — show it at the counter." plus its K15 draft, and the standalone <p> to be removed; vocab.md says the docked slot carries the next-step sentence or the held reason, never both, '("Ready to pay." is neither)'. The spec also keeps `.counter-dock-line` at min-height ≈43px (:43-44, matching globals.css:2370) and the dock at 115px (:48-49, :296). The amendment asks for a raised min-height so the two-line EN + MY sentence fits in both states (dock ≈137px), with graft (k)'s three frames re-run. Left as is, the slot grows when Pay goes live, so the column moves, and the 375×667 / 320×568 claims (:296-300) are measured against the wrong dock.
   - Fix: Delete the y520–580 / y543–603 <p>. Make the live line `{ en: "Your ticket comes after you pay — show it at the counter.", my: "ရှင်းပြီးရင် ကောင်တာက ဝန်ထမ်းကို ပြဖို့ ကုဒ် ရပါမယ်" }` (brief-m13.md:61, K15 draft), named once in lib/pickup-details.ts. Raise `.counter-dock-line` min-height once to hold two EN lines plus the MY line in both held and live states. Restate the dock at ≈137px, recompute every y (dock top, fade, back link) and the 375×667 / 320×568 frames, and record the reversible `!remembered` gate for the owner.
2. **Amendment 2 is not applied: the back link is drawn in the wrong recipe.**
   - Evidence: picked-m13.md:182 specifies "← Browse the menu" at 11px/700 `--t3`. The shipped link is `.nav-link` (Checkout.tsx:4249), which globals.css:4510-4521 sets to 14px (`--fs-label`), `--fw-bold`, `--ac`. Its Burmese ships at `<My k="addMore" size="var(--fs-xs)" color="var(--t3)" />` (Checkout.tsx:4254), which is 11px. The spec writes that Burmese as 13px without saying the code has to lift it. amend.md m13 #2 binds the `.nav-link` recipe and the one-token lift of the Burmese to `--fs-sm`; vocab.md says back links are the shipped `.nav-link` (14px 700 `--ac`, arrow aria-hidden) with Burmese ≥13px.
   - Fix: Respecify the link as the shipped `.nav-link`: 14px/700 `--ac`, arrow `aria-hidden`, 44px. Specify the Burmese as a build change: `<My k="addMore" size="var(--fs-sm)">`, lifted from `--fs-xs` (11px) to 13px.
3. **Amendments 3 and 4 are not stated, and the spec draws two different done marks.**
   - Evidence: amend.md m13 #3 asks for the sentence "the ✓ ring on an answered row is the rail's own `is-done` ring (globals.css:2263-2269), the diner's one done mark; the solid ✓ disc is the console's", and for the digit rule for the sheet's counts. Neither appears. The spec also contradicts itself: :95 says "exactly as the rail renders it", but :320-321 draws the read-back ring with "a 12px stroke check svg". The rail renders the text glyph "✓" (Checkout.tsx:3939), so the slip's done mark would differ from the rail's. Amendment #4's statement is also missing: the EARLIEST chip (:448-454, `.slot-time-soonest`, globals.css:1571-1578) is a suggestion and never the lit cap (no `--ac` fill, no `--oa` ink).
   - Fix: Add the amendment-3 sentence and make the answered ring literally `.checkout-steps-num` in the `is-done` state with the "✓" text glyph (drop the svg). Add the digit line: "{n} left" and "{n} times" are EN-only, so Latin digits; the kicker stays plain static text. Add the amendment-4 sentence: the earliest chip's gold border and glow mark a suggestion, never the lit cap.
4. **The slip draws a second numbered step sequence (rings 1 · 2 · 3, the current one an `--ac` disc) directly under the Order · Pay rail, so one screen shows two lit "1" discs with different meanings.**
   - Evidence: The open When line wears ring "1" in `is-current` (20px `--ac` disc, `--oa` numeral) at picked-m13.md:144-146, and the folded rows wear rings "2" and "3" (:168, :174), all reusing `.checkout-steps-num` (:93-96). The rail directly above draws ① Order in that same `is-current` disc (:131-134; globals.css:2258-2262). vocab.md is explicit that the Order · Pay rail is the only step vocabulary, "so no dots, rings or 'n of m' marks appear beside it". The unanswered rows' 1px `--bd` ring with a `--t3` numeral also comes close to the HOLLOW RING, which vocab.md reserves for "Not sent yet".
   - Fix: Remove the numerals and the `is-current` disc from the slip. An unanswered row is label + MY + trailing "›". The open line is marked by its open well or pills and its label, not a lit disc. An answered row keeps only the rail's `is-done` ✓ ring (amendment 3). The kicker's "{n} lines left" stays the slip's one count.
5. **The pickup dock rides the on-screen keyboard over the very fields this moment adds.**
   - Evidence: `PayDock`'s `hidden` is wired only to `promoFocused` (Checkout.tsx:5654), which exists so "the dock and its fade hide so they never ride the keyboard" (Checkout.tsx:610-612). The spec puts two keyboard fields (name, phone) into the slip and walks focus into them on a held tap (:62-69, :245-248), but never extends `hidden` to them. The dock is fixed at bottom = tabs + 16 + safe area, 115px (≈137px after amendment 1) plus a 24px fade (globals.css:2344-2363). On a 320×568 phone with the keyboard up, the room left above the keyboard is smaller than the header plus the dock, so the focused well and its blur error line end up under the dock. The `scroll-padding-bottom` fix (:66-69) cannot help when there is no room left. This breaks WCAG 2.4.11, which the spec itself cites at :69.
   - Fix: Generalise the shipped rule: a stable, unmount-safe focus flag (the `promoInputRef` callback-ref pattern, Checkout.tsx:619-623) covering the promo field and both slip fields, passed to `PayDock hidden`. Then specify that the dock leaves while any slip field has focus and returns on blur, and add a jsdom test that focusing the name or phone field hides the dock.
6. **Burmese is placed in ARIA attributes, which cannot carry lang="my", and the ASAP pill's Burmese is never shown to a sighted Burmese-first guest.**
   - Evidence: The ASAP pill's Burmese "ရှင်းလိုက်တာနဲ့ အစောဆုံး အချိန်ကို မှာထားပေးပါမယ်" lives only in `aria-description` (picked-m13.md:153-154, :235), and "ပြောင်းမယ်" is "the `aria-label`'s MY twin only" (:360-361). Attribute text is voiced in the page's language (EN), so a screen reader reads Burmese with an English voice, which breaks the house rule of `lang="my"` on every Burmese run (vocab.md; CLAUDE.md design language). `aria-description` is also ARIA 1.3 draft with uneven support. Meanwhile the right pill draws its Burmese visibly ("အချိန် ရွေး", :157), so the left pill of the same pair is EN-only on screen while the spec claims a Burmese twin.
   - Fix: Remove Burmese from every attribute: keep the `aria-label`s EN-only, starting with the visible EN text. Either draw the ASAP clause's MY visibly (for example as the hint's MY line, in a `<span lang="my">`) or list "Booked when you pay" and "Change" as EN-only in the K15 · diner-togo ledger.
7. **The focus rule for a blur error contradicts itself, and one reading of it is a keyboard trap.**
   - Evidence: picked-m13.md:75 says that on a blur error "the view's one region says it once and focus stays in the field". :282 adds "the line never folds on a refusal". A blur means focus has already moved to whatever the guest tapped or tabbed to, so "stays in the field" can only be built as re-focusing on blur, which pulls the guest back to the field (WCAG 2.1.2 / 3.2.1). OPEN RISKS :576-580 states the opposite rule: a blur "does NOT steal focus from the tapped control". The judges named this accordion trap as the backbone's main risk.
   - Fix: State one rule: on a blur error, focus stays wherever the guest moved it. The error is static text on the field (`aria-invalid` + `aria-errormessage` / `aria-describedby`), the one region says it once, and the line stays open. Focus moves into a field only on Enter / Next / done or on a held-Pay tap. Add the jsdom test per transition.
8. **Wrong citation for the busy state: the dock's busy state has no visual dim in code.**
   - Evidence: picked-m13.md:295 says "BUSY: door 'Starting checkout…' `aria-busy`, opacity .7 (the shipped loading state, PayDock.tsx:111)". PayDock.tsx:111 is a closing brace, and PayDock sets no opacity anywhere (:98-122). `.counter-dock-door[aria-busy="true"]` only sets `cursor: default` (globals.css:2402-2404). The .7 belongs to the inline Pay (Checkout.tsx:5558), which the pickup cart loses under this spec.
   - Fix: Either drop the .7 claim (the label change "Starting checkout…" is the busy signal, PayDock.tsx:114) or specify it as a new rule, `.counter-dock-door[aria-busy="true"] { opacity: .7 }`, cited as a build change rather than as shipped.
9. **The sheet's chosen chip says "✓ Yours" in `--warn` ink, and the spec draws that state, enlarges the class and leaves the colour.**
   - Evidence: PickupSlotSheet.tsx:246-249 renders "✓ Yours" with `className="slot-time-low"`, which globals.css:1527-1531 colours `var(--warn)`. The spec raises that class to 11px (:454-455) and draws SLOT CHOSEN with "✓ Yours" (:509-511) without changing the colour. vocab.md reserves `--warn` for warnings and makes the ✓ the one done mark, so the guest's own pick reads as a warning and wears a ✓ that means "yours", not "done".
   - Fix: Give "Yours" its own class in `--ac-strong` (light) / `--ac` (Night) with no ✓, or keep only the sr "Your current time, " plus `.slot-time-on`. Keep `.slot-time-low` (`--warn`) only for "{n} left".

### C · The critic's suggestions (not blocking; take them where the build agrees)

- "Saved on this phone." should drop as soon as Change edits either value. The new value is not saved until Pay (Checkout.tsx:3118-3120), so state that the footer means 'both values still equal what the device hydrated'.
- Hydration flash: name and phone hydrate in a post-mount microtask (Checkout.tsx:678-698). A regular's first painted frame therefore shows '2 lines left' and a held dock, which then flip to read-backs. Specify no fold animation on hydrate, and either hold the slip's state until the read settles or render the folded rows without motion.
- `getPickupSlots` returns a flat `slots[]` (lib/pickup.ts:20, :37-40), and `groups` exist only inside the sheet (`groupByDay`, PickupSlotSheet.tsx:106). The lifted read should take `slots[0]` (time-sorted) or lift `groupByDay` with it. `groups[0].slots[0]` does not exist at the lifted site.
- The phone error 'with at least 7 digits' misdiagnoses a regex failure. `validPickupPhone` also refuses '#', '\*', ',', ';' and letters that a tel keyboard or autofill can produce (pickup-contact.ts:17, :25), even with 10 digits present: the M116 'name the reason you have' rule. Either split shape from digits or word it 'Check the phone number…'.
- `formatSlotLong` yields 'Tomorrow 10:30 AM', which puts the English word 'Tomorrow' inside the Burmese hint line and the scheduled read-back ('Tomorrow 6:45 PM မှာ လာယူမယ်'). Only clocks are Latin-always. Either pass the time alone into the MY run or list the day word for K15.
- graft (k)'s frames assume 44px pills. The right pill's Padauk 13px second line (13 × 1.6) makes it ≈50px, and at 320 wide 'As soon as possible' wraps inside a ≈100px content box. Re-measure with real fonts. Also, 375×667 and 320×568 have no bottom safe area, so the stated dock tops (y442 / y343) assume 34px that is not there.
- The 3px arrow nudge is 4px in code (globals.css:2335).
- `Sheet`'s `closeLabel` type requires both `idle` and `busy` (packages/ui/src/sheet.tsx:128). Pass `busy` as well, the same node is fine.
- `pickup_next_step` 'fired when `nextPickupStep` changes' recomputes on every keystroke: the phone flips 'phone' → null at the 7th digit and back on a backspace. Fire on blur or validity change and on held taps only, so the 'held taps → 0' metric is not drowned in noise.
- On the last fold, focus moves to the kicker AND the region says 'Slip filled in — Pay is below.'. Many screen readers announce the focus change and cut off the live region. Pick one voice: announce through the region and do not move focus, or move focus and let the kicker's name speak.
- The prep clause prints 'The kitchen needs about 12 min.' whenever a `pickup_config` row exists. Prod's row carries the unconfirmed schema default (ruling #10), so the null arm is practically unreachable. D4 keeps the clause, but flag for the owner that the number shown is the default nobody confirmed.
