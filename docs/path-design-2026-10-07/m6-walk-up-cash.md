# Picked m6 — The walk-up cash sale at the counter: "Shape of the Sale", refined

Moment m6. Dad is on the front counter tablet (1366×1024 landscape, light, device language "Both":
Burmese leads and English echoes beneath). A walk-up guest stands in the queue with cash in hand. The
sale never leaves the order pad. Today it crosses four surfaces in 5 + N taps; with this design it
changes **shape** three times on one surface in 3 + N taps.

**Backbone: GLANCEABLE ("Shape of the Sale").** This is owner answer 1: staff moments are glanceable.
Each state of the sale has its own silhouette, readable from a step away without reading a word:

- **The grid.** Many paper tiles beside one tall ticket.
- **The tray.** A wide cream tray wearing a **gold crown**, with four **banknote** tiles.
- **The seal.** A **green ticket** with a check disc and a **perforated paper stub** that holds the #CODE.

Colour is never the only signal. Each silhouette also carries a glyph (receipt, cash, check) and a word.

**Grafted from QUIET ("The Slip Stays"):**

- **One money verb from end to end.** The dock reads **"ငွေသားနဲ့ ရှင်း · $19.89 / Take cash · $19.89"**. The
  tray is titled **"ငွေသားနဲ့ ရှင်း / Take cash"**, and its commit is **"$19.89 ရှင်း / Take $19.89"**. All three
  are words the family already reads on the table page's cash sheet. Glanceable's dock verb
  "Take payment" is dropped (the judges: do not graft C's dock verb).
- **The K15-HIGH trap quiet caught.** `settle.cash.trigger` and `settle.cash.title` sit outside
  `STAFF_K15_HIGH`, so both join it in this change. Without that, a Burmese-only tablet would lose the
  English under the money door, which `pad.settle` kept.
- **The tray carries the slip.** The order's lines ride inside the tray, read-only. Dad can confirm the
  order while counting without cancelling. This fixes the judged "hides the order".
- **The fewest new claims.** Every string on both screens is shipped except one: the bell note, a brief
  draft (see below). On the pad host the idle hint under the door is dropped, because the receipt
  directly above it already says Tax.

**Grafted from GUIDED ("Three Stops, One Screen"):**

- **The spoken next step, in glyph form.** The tray's three columns read as one sentence, left to right:
  OWE → TIP → GAVE. The two arrows are aria-hidden. This also keeps the W17c-2 order (the tip is asked
  before the tender).
- **The clean-cancel reassurance.** "Nothing was taken — the order is still here." is said once, through
  the pad's Toast, and only when nothing is in doubt.
- **The honest bell note.** Walk-up is offered (as a secondary), so the seal says the bell rings on the
  counter page, not here.

**The judges' fixes for this backbone** (m6.json → judgement.scores[2].note and grafts 1–4):

- **Money-corner double-tap guard, by geometry.** The door's spot under the tray lands on the inert Change
  readout and the empty foot of the GAVE column. Take's spot on the seal lands on inert receipt rows.
- **Refusal on an unpriced order.** A new `"unpriced"` member of `PadSettleBlock`, ranked last. The tray
  never opens on a null total.
- **A bigger Total on the ticket, as a type token** (`--fs-h1`), never a new px literal.
- **Change survives a reload or unlock on the same tab.** This uses the existing handoff stash, plus one
  routing fix.
- **Figures as tokens.** Two named till tokens are defined once, alongside the `--kfs-*` / `--xfs-*` tier
  precedent. Custom-property definitions are not counted by `check:style-literals`.
- **No grab bar on the tablet.** At ≥48em the grab zone is hidden, so glanceable's drawn handle was wrong.
- **The stub is dotted, never dashed.** On this console, dashed already means "undo pending" and "held".

**What the best in the world do at this exact moment, brought down to one counter and two parents:**

- **The Japanese cash tray (カルトン) and "¥10,000 お預かりします."** The guest's money is named aloud and
  stays visible on the tray until the change is counted back. Here the **lit banknote tile** and the
  tender field stay in view. The change is read from the corner, and the seal keeps **Cash received
  $50.00** right under the Total. If a guest says "I gave you a hundred", the screen answers.
- **The ticket-and-token counter (食券機).** One token, one figure, matched by a glance. The stub's #CODE
  is the same code as Mom's kitchen ticket and the ready board (`handoffCode`). The stub is plain
  paper, like the kitchen ticket.
- **A boarding pass in a wallet.** One look. The number you act on is the biggest thing on it, and the
  stub is perforated. The seal is a two-part ticket, with the same dotted perforation and notches as
  the m3 claim ticket. The two figures Dad acts on (Change, #CODE) sit on **one shared baseline** and
  are read in one sweep.
- **A great KDS.** State by silhouette at three metres: grid, crowned tray, green ticket.
- **A good maître d'.** Never hurries and says the one honest thing. There are no timers, no
  auto-return and no auto-advance. Cancel says nothing was taken, and the seal says where the bell is.

All of it stays inside the family's real constraints:

- no new hardware;
- cash only (ruling #11);
- no reader or card door anywhere;
- Burmese-first;
- no invented hours, ETAs or counts.

---

## EXAMPLE DATA (measured, not transcribed)

Every figure below is computed by the shipped modules (`node --experimental-strip-types` importing
`lib/register-math.ts`, `lib/money-input.ts`, `lib/tip.ts`). Example data is the same as the m6 artboards.

- **Order:** Mohinga / မုန့်ဟင်းခါး $14.00, hot_prepared (MENU_REFERENCE.md:27), plus Burmese Milk Tea /
  လက်ဖက်ရည် $4.00, beverage_hot (MENU_REFERENCE.md:156).
- **Subtotal $18.00.** Tax is `round(1400×0.105) + round(400×0.105)` = 147 + 42 = **$1.89** (lib/tax.ts:7, :39-41;
  both categories are always taxable, :14-17). **Total $19.89.**
- **Quick cash** `quickCashTenders(1989)` = [2000, 5000, 10000], so the tiles read **Exact $19.89 · $20 · $50 ·
  $100** (`noteLabel` drops whole-dollar cents).
- **Tip chips:** `tipPresets(1800)` with the cap filter gives **15% $2.70 · 20% $3.60 · 30% $5.40**, plus None.
  The chip base is the pre-tax $18.00 (CashSettleButton.tsx:126-130).
- **Tender $50.** `tenderState(1989, 5000)` = change **$30.11**. `changeAsTipCents(1989, 5000, 0)` = 3011, so
  the shipped "Keep the change as tip · $30.11" chip shows (CashSettleButton.tsx:893).
- **The seal.** `handoffRows(1989, 0, 5000)` = Total $19.89 · Cash received $50.00 · Change $30.11, with no Tip
  row because the tip is 0. The tender field holds `centsToField(5000)` = "50.00".
- **#CODE `#3F9A2C`.** This is `handoffCode` = "#" + the order id's last six characters, uppercased
  (reader-collect.ts:421-423). Sample value, the same as m6-glance-2.

**Light tokens used (hex, tokens.css):**

- **Ground and surfaces:** --pg #faf9f5 · --sf #f2efe7 · --cd #fffdf8 · --cd-raised #ffffff
- **Ink:** --tx #1b1714 · --t2 #6e6358 · --t3 #726859
- **Accent and gold:** --ac #a65f10 · --ac-strong #8f5009 · --oa #fffdf8 · --gold #e8a83c · --gold-strong #8a5a00
- **Status:** --ok #346e47 · --okb #eaf2ec · --warn #a44b34
- **Lines:** --bd rgba(58,35,23,0.1) · --sheen rgba(255,255,255,0.55)
- **Scrim and glow:** --scrim-glass rgba(15,10,5,0.3) · --glow-gold = gold 34% ≈ rgba(232,168,60,0.34)
- **Dots:** --tex-dot = ac 16% ≈ rgba(166,95,16,0.16)

**Mixes (hex approximated for the artboard):**

- **The crown:** `color-mix(in oklab, var(--gold) 40%, var(--cd))` ≈ **#f6dbad**.
- **The cash-glyph square:** `color-mix(in oklab, var(--gold) 18%, var(--cd))` ≈ **#fbeed6**.

**Contrast (computed, WCAG):**

| Pair                     | Ratio |
| ------------------------ | ----- |
| --oa on --ok             | 5.96  |
| --t2 on --okb            | 5.13  |
| --tx on --okb            | 15.61 |
| --t2 on --cd             | 5.76  |
| --t3 on --cd             | 5.38  |
| --gold-strong on #fbeed6 | 5.17  |
| --oa on --ac             | 4.84  |
| --oa on --ac-strong      | 6.22  |
| --t2 on --sf             | 5.09  |
| --warn on --cd           | 5.68  |

All clear 4.5:1.

**The two NEW type tokens (the only new ones). Defined once at `:root` in globals.css, because the
Sheet portals to `<body>` and a scoped var would not inherit:**

- `--till-fs-say: 5.5rem;` (88px) is "the figure you SAY". It sets the tray's due and the seal's #CODE.
- `--till-fs-hand: 8rem;` (128px) is "the figure you HAND back". It sets the seal's Change.

Everything else uses existing tokens:

- `--fs-display` (clamp 36–44px, so **44px** at 1366 wide; tokens.css:38): the readout's change, the
  banknote figures and the seal title.
- `--fs-h1` 26 · `--fs-h2` 21 · `--fs-h3` 17 · `--fs-lead` 15 · `--fs-label` 14 · `--fs-sm` 13.

The overflow rule is one pure helper, `tillHeroTier(text)` in lib/register-ui.ts: a formatted figure
longer than 7 characters ("$999.99") steps down to `--fs-display`. That way money never wraps mid-value.

---

## CLAIMS VERIFIED AGAINST THE CODE (HEAD f6e81ce)

Where a claim failed, the design changed, never the claim.

| Claim the design depends on                                                      | Verdict         | Evidence → design consequence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The pad never takes money and navigates today                                    | TRUE            | OrderPad.tsx:133 ("the pad never takes money itself"), :884 `router.push(tableDestination(…, settle: true))`; DESIGN-LANGUAGE.md:2198 "Take payment navigates". → K39 writes §28's exception on a counter order (OPEN-ITEMS.md:670 names the `beforeOpen` gate, the HandoffCard `next` slot and the poll pause).                                                                                                                                                                                                                                                          |
| The cash sheet is the shared `Sheet` and takes a className                       | TRUE            | CashSettleButton.tsx:647-677; sheet.tsx:50, :63, :277 (`mms-sheet ${className}`). → The tray is a CSS variant `till-sheet`, not a new primitive.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| At ≥48em the sheet is a centred 34rem card with no grab handle                   | TRUE            | globals.css:11314-11325 (`max-width: 34rem`, `.mms-grab-zone { display: none }`). → **No grab bar is drawn** (glanceable's handle was wrong). The till variant overrides position and width at ≥64em and ≥44em tall.                                                                                                                                                                                                                                                                                                                                                      |
| The sheet's scrim, Esc and ✕ are one channel; there is no `onPointerDownOutside` | TRUE            | sheet.tsx:113-120; sheet-dismiss.ts (`channelOf` → "radix"). → A "press-window" scrim guard would need a new outside handler on the primitive. **The double-tap guard is geometric**: the door's spot sits inside the tray, on inert content.                                                                                                                                                                                                                                                                                                                             |
| The scrim blurs in light too, under the data-fx dial                             | TRUE            | globals.css:9689-9693 (`--scrim-glass` + `--fx-glass-far`); tokens.css:229, :254 (28px), :256 (0.85), :272, :636-645 (lite/off → none).                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| The sheet focuses its container on open and restores focus to the opener         | TRUE            | sheet.tsx:236-272 (`onOpen` → `contentRef.focus()`); CashSettleButton.tsx:663-675 (restore to `triggerRef`; unsent → `onBlockedTap`).                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| A landed settle UNMOUNTS the sheet and hands up persisted figures                | TRUE            | CashSettleButton.tsx:398-417 (`setLanded`, `onSettled({ orderId, totalCents, tipCents, tenderedCents })`), :647.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| The tip is asked BEFORE the tender (W17c-2)                                      | TRUE            | CashSettleButton.tsx:698-700. → Columns read OWE → TIP → GAVE. There is no reorder, and B's tender-first is not grafted.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Quick cash is Exact + three round-ups, lit by VALUE                              | TRUE            | CashSettleButton.tsx:811-840; register-math.ts:140-158; DESIGN-LANGUAGE.md:2258-2263.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `.staff-chip-cash` declares no fill; the lit cap is shared                       | TRUE            | globals.css:14151-14161 (no fill), :7845-7856 (the one lit cap). → **The banknote frame is an `::after` hairline**, never a fill or box-shadow override.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| The readout is a description, never live; the sheet has ONE `role=alert`         | TRUE            | CashSettleButton.tsx:853-882 (`#cash-readout`), :920-932 (`#cash-alert`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| The readout's word renders with no English today                                 | TRUE            | CashSettleButton.tsx:859 `changeLabel echo={false}`; Chrome.tsx:124 (`echo === false` → Burmese only). → In the till, `echo="inline"` ("အကြွေ · Change"). It is a K15-HIGH key (staff.ts:4295), so its English survives a Burmese-only device.                                                                                                                                                                                                                                                                                                                            |
| `settle.cash.trigger` / `settle.cash.title` are outside K15-HIGH                 | TRUE            | staff.ts:1708, :1713. Absent from `STAFF_K15_HIGH` (staff.ts:4202-4420). Present there: `pad.settle` :4285, `settle.cash.settleAmount` :4247, `settle.cash.take` :4248, `changeLabel` :4295. → Both keys join the set.                                                                                                                                                                                                                                                                                                                                                    |
| Actions ride a sticky band that lifts with the keyboard                          | TRUE            | globals.css:14292-14305 (`.reg-settle-actions`), :149 (`bottom: var(--kb-inset)`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| No money input autofocuses                                                       | TRUE            | CashSettleButton.tsx:803-806.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `PadSettleBlock` has no "unpriced" member; a null total just drops the figure    | TRUE            | order-pad.ts:235, :303. → A NEW member, ranked last, in the `Record` at :323-334.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| One amount predicate for the receipt and the door                                | TRUE            | order-pad.ts:195-198 (`padAmountsSettled`), :209-214 (`padReceiptRows`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| The pad's ONE live region is its Toast                                           | TRUE            | OrderPad.tsx:1345-1353.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| The counter bell rings ONLY on the counter home                                  | TRUE            | app/staff/page.tsx:327 (`CounterBellProvider`); DESIGN-LANGUAGE.md:1212. → The bell note is true. "Back to the counter" is the hero.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| "Back to the counter" goes to the counter home                                   | TRUE            | HandoffCard.tsx:137-163 → `STAFF_DOOR_TARGET.counter` = "/staff?floor=1" (staff-door.ts:34).                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| The paid card is a focused region named by title + key row + #CODE               | TRUE            | HandoffCard.tsx:73-87; DESIGN-LANGUAGE.md:2316-2321.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `handoffRows` gives Total / Tip / Cash received / Change or Still to collect     | TRUE            | register-math.ts:230-244.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Walk-up lands a NEW session on `/add`                                            | TRUE            | CounterMint.tsx:135-137 (`mintLanding`); the provider tolerates a missing pane (TablePaneContext.tsx:35-37 → null).                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| The handoff stash keeps the tender                                               | TRUE            | floor-pane.ts:373, :403-433, :451-457.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **A reload of `/add` after a paid counter order shows the seal**                 | **FALSE today** | add/page.tsx:50 → `res.kind === "closed"` redirects to the counter home. The table page's server card (page.tsx:49-60) shows Total + #CODE with no Change, and the page variant "never restores" a stash (HandoffCard.tsx:173-177). → **Design changes:** the `/add` page sends a CLOSED counter session to `/staff/table/{id}` (the server card, in seal geometry). That card adopts this tab's stash ONLY when the stash's `orderId` equals the row's, which brings back Cash received + Change. Anywhere else it shows Total (+Tip) only and never an invented Change. |
| `usePadDetailLive` can pause                                                     | FALSE today     | usePadDetailLive.ts:26. It has no flag. → NEW `paused` flag, true while the seal stands.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **A dashed stub border is free to use**                                          | **FALSE**       | Dashed = the lane's Undo posture (expo-stage.ts:26-31) and a KDS held ticket (globals.css:7890-7894). → The stub's perforation is **2px DOTTED**, as m3's claim ticket. The 12px notches use the reward coupon's technique (globals.css:4027-4043).                                                                                                                                                                                                                                                                                                                       |
| Read-only line format exists                                                     | TRUE            | StaffTicket.tsx:334 (`<span className="staff-qty">{qty}×</span>`), order-pad.ts:71-77 (`padDishName` lead + echo).                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| A type token is not counted by the style ratchet                                 | TRUE            | check-style-literals.mjs:17-18 (definitions are the token layer), :84-91 (only `font-size`/`font-weight`/`letter-spacing` props are counted).                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `Receipt totals` has a shipped Burmese name                                      | TRUE            | staff.ts:1094 `floor.settled.a11y.rows`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

---

## SCREEN picked-m6-1.dc.html — The tray: cash in hand, the change in the money corner

**Device:** tablet 1366×1024 landscape. **Theme:** light. **Language mode:** Both. **Route:**
`/staff/table/<id>/add` (a counter order), with the cash tray risen over the pad.

**The state drawn.** Dad has rung up Mohinga and Milk Tea and tapped the door. The guest handed over a
$50 note; Dad tapped **$50**, and the corner reads **Change $30.11**. No tip was given, and no alert is
showing. Take is armed.

### LAYOUT (frame coordinates, top to bottom)

**① Ground.** --pg #faf9f5 with the staff paper rules: a 1px rgba(27,23,20,0.05) line every 28px, no verticals.

**② THE PAD, under the scrim.** It is inert, `aria-hidden` by the modal, and drawn blurred. Its geometry is
m6-glance-1's, refined. Draw it at full fidelity, then let the scrim blur it.

- **StaffBar, y0–68.** --pg, with a 1px --bd bottom.
  - The back pill at x20 (44 tall, paper): "← ကောင်တာ".
  - h1: "ကောင်တာ အော်ဒါ" in Padauk 700 30, over "Counter order" 13/600 --t2.
  - On the right: the language circle 44×44, then Lock 44×44 at x1302.
- **Tools, x20–946, y68–132.** A search field 280×44, then the category chips; "အားလုံး" is lit.
- **Tiles, x20–946, y140–1008.** Four columns of ≈222, gap 12. Each tile is ≥136 tall and shows the Burmese
  lead, the English echo and the price. Mohinga and Milk Tea wear "×1".
- **Ticket, x962–1346, y76–856.** `.card.card-textured`.
  - Head: a 40×40 gold-tint square (#fbeed6) holding the `receipt` icon in #8a5a00, beside
    "အော်ဒါ / Order".
  - The name strip.
  - Two lines:
    - 1× မုန့်ဟင်းခါး / Mohinga, $14.00;
    - 1× လက်ဖက်ရည် / Burmese Milk Tea, $4.00.
  - Foot:
    - Subtotal $18.00 and Tax $1.89;
    - a 1px rule;
    - **Total $19.89**, its figure in Fraunces 800 at `--fs-h1` (26px). This is graft 3, a type token.
- **Dock = the money corner, x962–1346, y868–1008.**
  - **Primary xl 64, y868–932:** a leading `cash` icon 22, then "ငွေသားနဲ့ ရှင်း · $19.89" over "Take cash · $19.89".
    This is CashSettleButton's trigger, re-hosted.
  - **Secondary xl 64, y944–1008:** "အခု ပို့၊ လာယူချိန် ရှင်း · ၂ ခု" over
    "Send now, pay at pickup · 2 items".
  - There is no idle hint under the door.

**③ SCRIM.** It covers the full viewport, the bar included: rgba(15,10,5,0.3) +
`backdrop-filter: blur(28px) saturate(0.85)` (the `data-fx` dial can turn the blur off).

**④ THE TRAY.** Position fixed, **x20–1346, y84–1008** (1326×924): the bar's 68px bottom + `--s4`, down to
`--s4` above the frame's foot. When the on-screen keyboard rises, the bottom lifts by `--kb-inset`.

- Radius 26 (`--r-sheet`), bg --cd #fffdf8.
- Shadow `--sh-xl` (0 24px 60px rgba(35,24,16,0.16)), overflow clip.
- Applied as `.mms-sheet.till-sheet` at `(min-width: 64em) and (min-height: 44em)`. Below either bound, today's
  single-column §29 sheet is used, unchanged.

**④a HEAD (sticky), y84–156.**

- bg --cd-raised #ffffff, with the shipped inset sheen.
- **The CROWN:** the head's top 6px (y84–90) is painted #f6dbad, `color-mix(in oklab, var(--gold) 40%, var(--cd))`,
  as an inset box-shadow band. A 1px sheen line sits under it. It is clipped by the tray's 26px corners and
  carries no text.
- **x52–92, y100–140:** a 40×40 square, radius 12, bg #fbeed6, holding the `cash` (banknote) icon 22px, stroke
  1.75, #8a5a00. It is aria-hidden: the cash state's glyph.
- **x108, the title** (`Dialog.Title`, `<Chrome k="settle.cash.title" echo="stack">`):
  - "ငွေသားနဲ့ ရှင်း" in Padauk 700 26 (`--fs-h1`), lh 1.3, #1b1714, y96–130;
  - "Take cash" in Hanken 14/600 (`--fs-label`), #6e6358, y130–148.
- **✕ at x1292–1336, y90–134:** the shipped `.mms-sheet-close` (top 6, right 10). A 44×44 target around a 32px
  disc of #f2efe7, with an X icon 18 in #1b1714.
- **No grab bar** (hidden at ≥48em).

**④b BODY, y156–896.** It scrolls under the keyboard. Padding 20 32 0. A grid of **460 | 32 | 300 | 32 | 438**:
OWE x52–512 · TIP x544–844 · GAVE x876–1314.

- **Arrows.** Two "→" glyphs, Hanken 28 #726859, aria-hidden, centred at x528 and x860 at y≈200.

**OWE, x52–512 (what is owed, and for what):**

- **y176–271, the hero.** "$19.89" in Fraunces 800 at `--till-fs-say` (88px), lh 1.08, tracking -0.02em, tabular,
  #1b1714. It is aria-hidden: the question below carries the figure.
- **y287–321.** "ငွေသား $19.89 လက်ခံမလား?" in Padauk 700 21 (`--fs-h2`), lh 1.6, #1b1714. The "$19.89" is Latin,
  Hanken, tabular.
- **y323–344.** "Take $19.89 in cash?" in Hanken 15/600 (`--fs-lead`), #6e6358.
- **y352–376.** "ဒါနဲ့ အော်ဒါ ပိတ်ပါမယ်။" in Padauk 400 15, lh 1.6, #6e6358.
- **y378–396.** "This closes the order." in Hanken 13, #6e6358.
- **y420.** A 1px rule rgba(58,35,23,0.1), x52–512.
- **y436–456, THE SLIP's head** (`id="till-slip-h"`): "အော်ဒါ" in Padauk 700 13, then " · Order" in Hanken 13/600,
  both #6e6358.
- **y464–544, THE SLIP's lines.** A `<ul role="list">` with two rows of 40px each. A row is:
  - "1×" in Hanken 15/700 tabular #6e6358;
  - a 6px gap;
  - "မုန့်ဟင်းခါး" in Padauk 700 15 #1b1714;
  - an 8px gap;
  - "Mohinga" in Hanken 13 #6e6358.

  The second row is "1× လက်ဖက်ရည် Burmese Milk Tea".

  **No amounts.** The one figure is the frozen quote above, so there is never a second total beside it. A
  longer order scrolls with the body.

**TIP, x544–844 (optional, quiet, narrow):**

- **y176–218, the label** (`<label for="cash-tip">`): "ငွေသား အပိုကြေး (ထည့်ချင်မှ)" in Padauk 700 15, lh 1.6,
  over "Cash tip (optional)" in Hanken 13/600 #6e6358.
- **y230–326, the chip group** (`role="group"`). Two rows of `.staff-chip` pills at the console's own **44px**,
  radius 999, bg #f2efe7, 1px --bd, padding 0 12, gap 8:
  - row 1: [15% $2.70] x544–641 · [20% $3.60] x649–746;
  - row 2 (y282–326): [30% $5.40] x544–641 · [မထည့်ပါ] x649–730.

  The percentage is in Hanken 13/600 #1b1714 and the amount in 13/500 #6e6358, tabular. None is pressed.

- **y342–390, the tip field.** The shipped `.ui-field-control` at 48px, x544–844: bg #fffdf8, 1px --bd, radius 12,
  inset 0 1px 2px rgba(27,23,20,0.06). It is empty, with the placeholder "ဥပမာ 5" in #726859.
- The rest of the column is empty.

**GAVE, x876–1314 (the money corner's column):**

- **y176–218, the label** (`<label for="cash-tendered">`): "လက်ခံရရှိငွေ (ထည့်ချင်မှ)" in Padauk 700 15 over
  "Cash received (optional)" in Hanken 13/600 #6e6358.
- **y230–482, the BANKNOTE tiles** (`role="group"`). A 2×2 grid of 213×120 tiles with gap 12. Each is a
  `.staff-chip .staff-chip-cash` set as a tile: radius 12, bg #f2efe7, 1px --bd.
  - **The banknote frame** is an `::after` hairline: inset 6px, 1px solid rgba(58,35,23,0.1), radius 6,
    pointer-events none.
  - **(x876–1089, y230–350) Exact:** "အတိအကျ" in Padauk 700 15 #1b1714, over "$19.89" in Fraunces 800 26
    (`--fs-h1`) tabular.
  - **(x1101–1314, y230–350):** "$20" in Fraunces 800 at `--fs-display` (44px), tabular, #1b1714.
  - **(x876–1089, y362–482): "$50", LIT.** It wears the console's ONE lit cap: bg #a65f10, ink #fffdf8,
    border transparent, shadow `inset 0 1px 0 rgba(255,255,255,0.55), 0 0 14px -6px rgba(232,168,60,0.34)`.
    The frame hairline turns rgba(255,253,248,0.35). `aria-pressed="true"`.
  - **(x1101–1314, y362–482):** "$100".
- **y494–542, the tender field.** `.ui-field-control` at 48px, x876–1314, holding the value "50.00" in Hanken 16,
  tabular, #1b1714.
- **y554–598, the Keep-the-change chip.** A `.staff-chip` at 44px, full width (x876–1314), reading
  "အကြွေကို အပိုကြေး ထား · $30.11". The Burmese is Padauk 700 13; the figure is Hanken 13/600, tabular.
- **y598–896, empty on purpose.** This is where the keyboard lands. Under the tray, the pad door's spot
  (x962–1346 × y868–932) falls here and on the band's readout: never Take, never the scrim.

**④c BAND (sticky bottom), y896–1008.**

- A 1px top rule rgba(58,35,23,0.1), bg #fffdf8, padding 16 32 32. The buttons row is at **y912–976**.
- **Cancel, x52–232, y917–971.** The shipped secondary lg (54px) paper pill: bg #fffdf8, 1px --bd, sheen,
  reading "မလုပ်တော့ပါ" in Padauk 700 16.
- **Take, x244–844, y912–976 (THE ONE PRIMARY).** The shipped primary xl (64px): gradient #a65f10 → #8f5009,
  ink #fffdf8, shadow `inset 0 1px 0 rgba(255,255,255,0.55), 0 2px 8px -1px rgba(166,95,16,0.42)`. Its label
  is "$19.89 ရှင်း" in Padauk 700 17 (Latin figure) over "Take $19.89" in Hanken 13/600.
- **THE READOUT, x876–1314, centred in y912–976.** Inert text (`#cash-readout`, Take's description). It is
  a `dl` row on the baseline:
  - the dt "အကြွေ" in Padauk 700 17 #1b1714, then " · Change" in Hanken 15/600 #6e6358;
  - a leader (flex 1, 2px dotted rgba(58,35,23,0.25));
  - the dd "**$30.11**" in Fraunces 800 at `--fs-display` (44px), tabular, #1b1714.

  Its height is reserved, so nothing jumps as it fills.

### STATES (described, not drawn)

**Opening:**

- The door tap runs `beforeOpen`: `padSettle`'s holds re-decided AT THE TAP from refs (paying > note >
  waiting > unsent > empty > **unpriced**), then drain the adds, save a typed name, drain again, re-read the
  note, and wait for a committed read that STARTED after the last write.
- There is no `router.push` and no "Opening payment…" phase on a counter order. A dine-in pad keeps §28's
  navigation.

**Unpriced (NEW, graft 2):**

- Lines are on the order and amounts are settled, but `settleTotalCents` is null.
- The tray NEVER opens. The door reads bare "ငွေသားနဲ့ ရှင်း / Take cash" and is `aria-disabled`.
- Its hint, and a tap, say "The total couldn’t be read — reload the order, then take payment again."
- "Reload the order" shows in the ticket.

**No tender:** the readout cell is blank but reserved. Take is armed.

**Tip chosen:**

- The hero, the question ("($19.89 + $3.60 tip)" inline), the tiles and Take all re-derive from DUE = total +
  tip ("Take $23.49").
- A lit tile can unlight. The tiles re-derive from the due as well (`quickCashTenders`).

**Readout after a tile or a typed tender:**

- **Change:** as drawn. The figure plays `mms-pop` on a tile tap only; typing never pops.
- **Exact:** "အတိအကျ — အကြွေ မပြန်ရပါ / Exact — no change", in Padauk 700 21 / Hanken 15.
- **Short:** the `alert` icon 28 + "လိုငွေ · Short ……… $x" in #a44b34 bold. Under the tender field, the hint
  "ကျန်ငွေ ထပ်ယူပါ၊ ဒါမှမဟုတ် ပမာဏ ပြင်ပါ။ / Collect the rest, or correct the amount." Take is
  `aria-disabled` through `cashSettleBlocked`. It is icon + word + hint, never colour alone, and never a shake.

**Keep the change:**

- It FILLS the tip field and never commits. Take's label becomes the new due, and focus moves to Take.
- With a tip already typed, the chip reads "Keep the change — make the tip {m}".

**Over the cap:** "That’s over the $1,000.00 limit — check the amount." appears under the tip field in warn, and
Take is blocked.

**Busy:**

- Take shows a spinner at full ink + "ရှင်းနေပါတယ်… / Taking payment…".
- ✕ and Cancel are `aria-disabled`. Esc, a scrim tap and ✕ are all refused (M82).

**Moved:**

- The ONE alert sits above the band's buttons, spanning x52–844, and the band grows upward. It names both
  figures: "The total changed from $19.89 to $x — check the order, then take payment again."
- The hero and Take keep the quote. The next tap ADOPTS the new figure and records nothing; only the tap
  after that takes.

**Unknown / Waiting / Stalled / Closed-while-unknown:**

- These are the shipped sentences (`settle.cash.unknown`, `.waiting`, `out.stalled`, `.unknownClosed`), said in
  the one alert.
- "Waiting" and "Stalled" add "Reload the page" beside the alert, never inside it.

**Cancel, clean (NEW, graft 5):**

- Cancel, ✕, Esc or a scrim tap closes the tray. Nothing is recorded, and focus returns to the door.
- **After** the sheet is gone (the page is un-hidden), the pad's Toast says, once and quietly,
  "Nothing was taken — the order is still here."
- This happens only when `padCancelSays()` holds: no attempt from this opening was sent, or its answer was a
  definite refusal, or the tap was stalled.
- It is never said after "waiting" or "unknown".

**Landed:** the sheet UNMOUNTS (no exit animation, M76), and screen 2 takes focus.

**Keyboard up:**

- The tray's bottom rides `--kb-inset`. The band (Take + readout) stays pinned above the keypad, and the body
  scrolls.
- Nothing is autofocused, so the keypad rises only when Dad taps a field.

**Night (OS dark):**

- Surfaces and text: --cd #2b213c, head --cd-raised #362848, ink #f3ecdf / #bcafc8.
- Crown: gold #f4c879 at 40% into --cd.
- Lit tile: --ac #e7a53a with ink #130d1e.
- There is no glass on the tray: it is opaque paper. The only blur is the scrim's.

### COPY (English) — verbatim, as `<Chrome>` renders it in Both mode

**On the tray (drawn):**

- Take cash (title echo)
- Take $19.89 in cash?
- This closes the order.
- Order (the slip's echo)
- 1× · Mohinga · Burmese Milk Tea (catalog names, `padDishName` echoes)
- Cash tip (optional)
- 15% · $2.70 · 20% · $3.60 · 30% · $5.40
- Cash received (optional)
- $19.89 (Exact tile) · $20 · $50 · $100
- 50.00 (the tender field's value)
- Take $19.89
- · Change
- $30.11
- $19.89 (the hero)

**Under the scrim (blurred):**

- ← Counter is not drawn: the pill shows Burmese only.
- Counter order
- Take cash · $19.89
- Send now, pay at pickup · 2 items
- Subtotal · Tax · Total
- $18.00 · $1.89 · $19.89

**Accessible-only:**

- Close (`sheetCloseLabel`)
- Quick tip amounts / Quick cash amounts (group names, shown in the device language)

**States (not drawn):**

- ({m} + {tip} tip)
- Exact — no change
- Short
- Collect the rest, or correct the amount.
- Keep the change — make the tip {m}
- That’s over the {m} limit — check the amount.
- Taking payment…
- The total changed from {old} to {m} — check the order, then take payment again.
- The connection dropped, so we don’t know if this payment was recorded. If the order shows paid in a moment,
  it went through — if it doesn’t, try again.
- No answer yet — this payment may still be recorded. Don’t take it again: reload the page to see whether it
  went through.
- This order has closed — the payment most likely went through. Find it on the floor before taking payment
  again.
- This tablet is still waiting for an earlier answer, so this did nothing. Reload the page to carry on.
- Reload the page
- NEW (graft 5, the Toast): Nothing was taken — the order is still here.
- NEW (graft 2, `pad.reason.unpriced`): The total couldn’t be read — reload the order, then take payment again.
- Reload the order
- Waiting for the last dish…
- Saving the name…
- Add a dish first
- CHANGED VALUE (`pad.nameNotSaved`): The name didn’t save — tap Take cash again to go on without it.

### COPY (Burmese) — shipped strings or the briefs' drafts only

**Drawn:**

- ငွေသားနဲ့ ရှင်း — `settle.cash.title`, staff.ts:1713. It joins K15-HIGH.
- ငွေသား $19.89 လက်ခံမလား? — `settle.cash.take`, staff.ts:1715
- ဒါနဲ့ အော်ဒါ ပိတ်ပါမယ်။ — `settle.cash.closesOrder`, staff.ts:1718
- အော်ဒါ — `pad.ticket.title`, staff.ts:2904
- မုန့်ဟင်းခါး · လက်ဖက်ရည် — catalog `name_my`, MENU_REFERENCE.md:27, :156
- ငွေသား အပိုကြေး (ထည့်ချင်မှ) — `settle.cash.tipLabel`, staff.ts:1727
- မထည့်ပါ — `settle.cash.tipNone`, staff.ts:1728
- ဥပမာ 5 — `settle.cash.example`, staff.ts:1731
- လက်ခံရရှိငွေ (ထည့်ချင်မှ) — `settle.cash.tenderedLabel`, staff.ts:1746
- အတိအကျ — `settle.cash.exact`, staff.ts:3063
- အကြွေကို အပိုကြေး ထား · $30.11 — `settle.cash.keepChange`, staff.ts:3075
- မလုပ်တော့ပါ — `settle.cancel`, staff.ts:1703
- $19.89 ရှင်း — `settle.cash.settleAmount`, staff.ts:1720
- အကြွေ — `settle.cash.changeLabel`, staff.ts:3066

**Under the scrim:**

- ← ကောင်တာ — `floor.back`, staff.ts:364
- ကောင်တာ အော်ဒါ — `browse.title.counter`, staff.ts:600
- ငွေသားနဲ့ ရှင်း · $19.89 — `settle.cash.trigger`, staff.ts:1708. It joins K15-HIGH.
- အခု ပို့၊ လာယူချိန် ရှင်း · ၂ ခု — `table.send.cta.counter.many`, staff.ts:3457
- အခွန်မပါ စုစုပေါင်း · အခွန် · စုစုပေါင်း — staff.ts:1107, :1110, :1112

**Accessible-only:**

- အပိုကြေး အမြန်ရွေး — `settle.a11y.tipQuick`, staff.ts:1880
- ငွေသား အမြန်ရွေး — `settle.a11y.cashQuick`, staff.ts:3064

**States:**

- ({m} + အပိုကြေး {tip}) — staff.ts:1716
- အတိအကျ — အကြွေ မပြန်ရပါ — staff.ts:3072
- လိုငွေ — staff.ts:3067
- ကျန်ငွေ ထပ်ယူပါ၊ ဒါမှမဟုတ် ပမာဏ ပြင်ပါ။ — staff.ts:3068
- အကြွေကိုပါ ပေါင်းပြီး အပိုကြေး {m} ထားပါ — staff.ts:3158
- {m} ကန့်သတ်ချက် ကျော်နေပါတယ် — ပမာဏ ပြန်စစ်ပါ။ — staff.ts:1740
- ရှင်းနေပါတယ်… — staff.ts:1719
- စုစုပေါင်း {old} ကနေ {m} ပြောင်းသွားပါတယ် — အော်ဒါ စစ်ပြီးမှ ပြန်ရှင်းပါ။ — staff.ts:3081
- `settle.cash.unknown` — staff.ts:3088
- `settle.cash.waiting` — staff.ts:3712
- `settle.cash.unknownClosed` — staff.ts:3166
- `out.stalled` — staff.ts:3690
- စာမျက်နှာ ပြန်ဖွင့် — `out.reload`, staff.ts:3694
- အော်ဒါ ပြန်ဖွင့် — `pad.reload`, staff.ts:2922
- နောက်ဆုံး ဟင်း ရောက်အောင် စောင့်နေပါတယ်… — staff.ts:2933
- နာမည် သိမ်းနေပါတယ်… — staff.ts:2937
- ဟင်း အရင် ထည့်ပါ — staff.ts:2939

**Drafts (from the briefs, not shipped):**

- ဘာငွေမှ မယူရသေးပါ — အော်ဒါ ဒီမှာပဲ ရှိပါသေးတယ်။ — the clean-cancel line. DRAFT, K15-HIGH, from m6.json
  guided screen 2 `copy_my`.
- စုစုပေါင်းကို မဖတ်နိုင်ပါ — အော်ဒါ ပြန်ဖွင့်ပြီးမှ ငွေ ပြန်ရှင်းပါ။ — `pad.reason.unpriced`. DRAFT,
  brief-m6.md:567.
- နာမည် မသိမ်းရသေးပါ — နာမည်မပါဘဲ ဆက်သွားဖို့ ငွေသားနဲ့ ရှင်း ကို ထပ်နှိပ်ပါ။ — the re-worded
  `pad.nameNotSaved`. DRAFT, brief-m6.md:331.

### A11Y

**Role and name:**

- The tray is a Radix modal dialog named by its title: in Both mode "ငွေသားနဲ့ ရှင်း Take cash".
- The pad and the bar are `aria-hidden` behind it. The bar's Lock is under the scrim, so a half-finished
  tray cannot be locked over.

**Initial focus:** the sheet container (`tabIndex -1`, sheet.tsx:266-272), which announces the dialog. Nothing
money-related is autofocused.

**Tab order** (DOM = visual):

1. ✕
2. 15%
3. 20%
4. 30%
5. မထည့်ပါ
6. the tip field
7. Exact
8. $20
9. $50
10. $100
11. the tender field
12. Keep the change
13. Cancel
14. Take

The readout, the slip, the hero and the arrows are not focusable.

**ONE live region:** `#cash-alert` (`role="alert"`), mounted only with an alert, above the buttons.

- The readout is Take's DESCRIPTION, never live.
- The pad's Toast is hidden behind the modal and speaks the clean-cancel line only after the tray is gone.

**Names and labels:**

- **The tip chips:** `role="group"` named "အပိုကြေး အမြန်ရွေး". Their pressed state is by VALUE.
- **The tiles:** `role="group"` named "ငွေသား အမြန်ရွေး", with `aria-pressed` by VALUE. "$50" is true.
- **The fields:** real `<label for>`.
- **The slip:** `<ul role="list" aria-labelledby="till-slip-h">`.
- **Take:**
  - its name contains its visible text, "Take $19.89" (WCAG 2.5.3);
  - `aria-describedby` = `cash-readout`, or the short row + its hint, or the cap line;
  - while the figures drift, the alert comes first.
- **Decorative:** the crown, the cash square, the arrows and the 88px hero are aria-hidden (the question
  carries the figure).

**Disabled:**

- Always `aria-disabled` plus a stated reason, never native `disabled`.
- Busy Take keeps full ink with `aria-busy`.

**Focus moves:**

- **Keep the change:** to Take, because its own control unmounts.
- **Cancel, ✕, Esc or scrim:** to the door, via `triggerRef`.
- **A server `unsent` refusal:** on close, to the Send, via `onBlockedTap`.
- **Landed:** to the seal on an un-hidden page.

**Targets:**

| Control | Size    |
| ------- | ------- |
| Tiles   | 213×120 |
| Chips   | 44 tall |
| Fields  | 48      |
| Cancel  | 54      |
| Take    | 64      |
| ✕       | 44×44   |

**Never colour alone:**

- **The cash state:** the crown, the cash glyph and the title word.
- **The lit tile:** fill + `aria-pressed` + the field's value + the readout's figure.
- **Short:** icon + bold word + hint.
- **Exact:** a sentence.

**Reduced motion:**

- No tray fade: the existing RM block, with `--dur-sheet` set to 0.01ms (tokens.css:685).
- The head's rake becomes the still band (globals.css:9826-9830).
- No readout pop and no press scale.
- Every haptic keeps its visible half.

**Language:** every Burmese run is `lang="my"` (Padauk 400/700, lh 1.6, ≥13px, synthesis none). Digits and money
stay Latin and tabular.

---

## SCREEN picked-m6-2.dc.html — The seal: a paid ticket, the change to hand back, the code to call

**Device:** tablet 1366×1024 landscape. **Theme:** light. **Language mode:** Both. **Route:** the same pad
URL. The pad shell is UNMOUNTED and the seal stands in its place.

**The state drawn.** The settle landed: Total $19.89, Cash received $50.00, Change $30.11, no tip. The food
did not go early. Focus is on the seal (programmatic, so no visible ring).

### LAYOUT (frame coordinates, top to bottom)

**① Ground.** --pg #faf9f5 with the staff paper rules.

**② StaffBar, y0–68, unchanged.**

- "← ကောင်တာ" pill at x20.
- h1: "ကောင်တာ အော်ဒါ" over "Counter order".
- Language circle, then Lock at x1302.

The place's name never changes during the sale.

**③ THE SEAL, x20–1346, y84–1008** (1326×924).

- One `<section>` (`HandoffCard` `variant="seal"`), `tabIndex -1`, `outline: none` under `:focus:not(:focus-visible)`.
- Radius 20, 1px border rgba(52,110,71,0.3), shadow `--sh-paper`
  (0 1px 3px -1px rgba(35,24,16,0.07), 0 14px 28px -18px rgba(35,24,16,0.28)), overflow hidden.
- It is a **two-part ticket**: MAIN on the left, STUB on the right.
- The tools, tiles, ticket, dock and the "Skip to the order" button are all **unmounted**, not hidden. The pad's
  detail poll is **paused** while the seal stands.

**③a MAIN, x20–780 (760 wide). The paid body.**

- bg --okb #eaf2ec with the card dots: rgba(166,95,16,0.16), 1px on an 18px grid, masked by
  `radial-gradient(130% 110% at 50% 0%, #000 40%, transparent 82%)`.
- Padding 32, so content runs x52–748.
- **Head, y116–208:**
  - **The check disc**, 88×88 at x52–140, y118–206: bg #346e47, the `check` icon 44px at stroke 2.25 in
    #fffdf8, shadow `inset 0 1px 0 rgba(255,255,255,0.3)`. It is aria-hidden.
  - **The title block** at x164: the h2 "ငွေရှင်းပြီး" (`id="handoff-title"`) in Padauk 700 at `--fs-display`
    (44px), lh 1.4, #1b1714, y120–182. Beneath it, "Paid" in Hanken 17/600 (`--fs-h3`) #6e6358,
    **aria-hidden**, y184–206.
- **The hero ("hand back"), y414–598.** One `dl` group `id="handoff-row-change"`:
  - **The dt, y414–456:** "အကြွေ" in Padauk 700 26 (`--fs-h1`) #1b1714, then a 12px gap, then "Change" in
    Hanken 15/600 #6e6358, **aria-hidden**, on the same baseline.
  - **The dd, y460–598:** "**$30.11**" in Fraunces 800 at `--till-fs-hand` (128px), lh 1.08, tracking -0.02em,
    tabular, #1b1714.
  - Its baseline is shared with the stub's #CODE (a grid row with `align-items: last baseline`), at y≈572.
- **y598–896:** empty dotted paper.
- **Foot rows, y896–976 (the count-back pair).** A `dl`, two rows of 40px each, at 17px (`--fs-h3`):
  - Row 1: "စုစုပေါင်း" in Padauk 400 17 #1b1714, then " · Total" in Hanken 15/600 #6e6358, a leader (flex 1,
    2px dotted rgba(58,35,23,0.25)), then "$19.89" in Hanken 17/700 tabular #1b1714.
  - Row 2: "လက်ခံရရှိငွေ · Cash received ……… $50.00", set the same way.
  - These rows are inert on purpose: a moment ago Take sat at x244–844 × y912–976, and this is where a late
    tap from it lands.

**③b STUB, x780–1346 (566 wide). The call-out stub.**

- bg --cd #fffdf8: plain paper, like Mom's kitchen ticket.
- **The perforation:** a 2px DOTTED left edge at x780, rgba(52,110,71,0.35), which is
  `color-mix(in oklab, var(--ok) 35%, transparent)` (m3's pass-face perforation).
- **The notches:** two 12px circles of #faf9f5 (--pg), centred on (780, 84) and (780, 1008). The card's overflow
  clips each to a half-bite, using the reward coupon's technique.
- Padding 32, so content runs x812–1314.
- **Callout, y362–466**, centred, max-width 440 (x843–1283):
  - "လာယူဖို့ ခေါ်မယ့် နံပါတ် — မီးဖိုချောင် အော်ဒါစာရွက်နဲ့ အော်ဒါ ဘုတ်မှာ ပါပါတယ်။" in Padauk 400 17,
    lh 1.6, #1b1714, on 2 lines;
  - then "The number we call when it’s ready — it’s on the kitchen ticket and the ready board." in Hanken 15,
    lh 1.4, #6e6358, on 2 lines.

  The callout sits ABOVE the code: a label, then the figure, exactly as the main half's "အကြွေ" sits above
  its figure.

- **#CODE, y490–585**, centred on x1063 (`id="handoff-code"`): "**#3F9A2C**" in Fraunces 800 at `--till-fs-say`
  (88px), lh 1.08, tracking 0.05em (`--track-caps`), tabular, #1b1714. Its baseline is shared with the Change.
- **y585–818:** empty paper.
- **The bell note, y818–900**, x876–1314, left-aligned (`id="seal-bell-note"`):
  - "သူတို့ ဟင်း အဆင်သင့်ဖြစ်ရင် ကောင်တာ စာမျက်နှာမှာ ပေါ်ပါမယ် — အသံက အဲဒီမှာ မြည်တာပါ၊ ဒီမှာ မမြည်ပါ။"
    in Padauk 400 13, lh 1.6, #6e6358;
  - then "Their food shows up on the counter page when it’s ready — the bell rings there, not here." in
    Hanken 13, lh 1.4, #6e6358.
- **Actions, y912–976**, a right-aligned row, gap 12. Every control starts at x ≥ 894, clear of Take's old
  span (x ≤ 844).
  - **Walk-up, the quiet secondary (x894–1052, y917–971).** The shipped secondary **lg** (54px) paper pill:
    bg #fffdf8, 1px --bd, sheen, `--sh`. It reads "လမ်းလျှောက်လာ" in Padauk 700 16 over "Walk-up" in
    Hanken 13/600 #6e6358. No "+" glyph.
  - **Back to the counter, THE ONE HERO, in the corner (x1064–1314, y912–976).** The shipped primary **xl**
    (64px) link: gradient #a65f10 → #8f5009, ink #fffdf8, shadow `inset 0 1px 0 rgba(255,255,255,0.55),
0 2px 8px -1px rgba(166,95,16,0.42)`. It reads "ကောင်တာကို ပြန်သွား" in Padauk 700 17 over
    "Back to the counter" in Hanken 13/600. A "→" at 22px, aria-hidden, nudges 3px on hover (still under
    reduced motion).

### STATES (described, not drawn)

**No tender entered:**

- The hero becomes "စုစုပေါင်း / Total $19.89" at the same size (the name speaks the total).
- There is no Cash received row. The foot holds the Tip row only when a tip was recorded, and is otherwise
  empty.

**Tip:** an "အပိုကြေး · Tip ……… $x" row joins the foot, in `handoffRows` order. All figures are persisted.

**Exact tender:** "အကြွေ / Change $0.00". Dad reads it before he closes the drawer.

**Still to collect (belt):** the hero reads "ထပ်ယူရန် ကျန် / Still to collect", with its figure in #a44b34 and
the `alert` icon 40, set beside the word.

**Sent early** (the food went to the kitchen before it was paid):

- The bell note's place shows "ငွေမရှင်းခင် ဟင်းတွေ မီးဖိုချောင် ရောက်ပြီးသားပါ — ပါဆယ်ထုပ်များ ကနေ
  ပေးလိုက်ပါ။ / Their food went to the kitchen before they paid — hand it over from Takeaway bags." It
  joins the seal's name.
- The ONE secondary becomes "ပါဆယ်ထုပ်များ / Takeaway bags", a native `<a>` to the lane (`laneHref`), in
  Walk-up's place. **One quiet secondary only**: Takeaway bags outranks Walk-up here.

**Walk-up, starting:**

- `aria-busy`, with a spinner + "ဖွင့်နေပါတယ်… / Starting…".
- The screen is held by its ONE mint lock: a `CounterMintProvider` mounted on the pad, the only start
  control on this screen.
- On landing it routes to the new `/staff/table/<new>/add` (`mintLanding`).

**Walk-up, refused or unknown:**

- The server's sentence, or "No answer from the ordering system — it may have started. Check Tables & counter
  orders before you try again.", is said once in the pad's Toast.
- Walk-up re-arms.

**Walk-up, waiting past the bound:**

- Walk-up is `aria-disabled`, and the NEW line replaces the bell note as its description: "No answer yet — the
  next order may still start. Don’t start it again: go back to the counter to see whether it’s under Tables &
  counter orders." It is said once through the Toast.
- "Back to the counter" becomes a full-document native `<a>`, so the way out also clears the stuck action
  queue.

**Reload or K23 unlock** (the fix above):

- A CLOSED counter session on `/add` routes to `/staff/table/<id>`, whose server card renders in this seal
  geometry.
- **This tab's stash, with a matching `orderId`:** the same figures as drawn, Change included.
- **No stash** (another device, or cleared storage): Total (+Tip) and #CODE only, the Total as hero. There is
  no Change row, because the tender was never stored.

**Nothing on the seal times out or auto-advances.** The poll stays paused, like a printed receipt.

**Night:**

- The main wash is --okb #1f2e26 with dots at ac 20%.
- The disc is --ok #5fb07e with ink #130d1e.
- The stub is --cd #2b213c with ink #f3ecdf, and the notches are --pg #100c19.

### COPY (English) — verbatim

**Drawn:**

- Counter order (bar echo)
- Paid (visual echo, aria-hidden)
- Change (visual echo, aria-hidden)
- $30.11
- · Total · $19.89
- · Cash received · $50.00
- The number we call when it’s ready — it’s on the kitchen ticket and the ready board.
- #3F9A2C
- Their food shows up on the counter page when it’s ready — the bell rings there, not here.
- Walk-up
- Back to the counter

**Accessible-only:** none new. The seal's name is assembled from the title, the change row and the #CODE.

**States (not drawn):**

- Total
- Tip
- Still to collect
- Their food went to the kitchen before they paid — hand it over from Takeaway bags.
- Takeaway bags
- Starting…
- No answer from the ordering system — it may have started. Check Tables & counter orders before you try again.
- NEW (`pad.next.waiting`): No answer yet — the next order may still start. Don’t start it again: go back to
  the counter to see whether it’s under Tables & counter orders.

### COPY (Burmese) — shipped strings or the briefs' drafts only

**Drawn:**

- ← ကောင်တာ — `floor.back`, staff.ts:364
- ကောင်တာ အော်ဒါ — `browse.title.counter`, staff.ts:600
- ငွေရှင်းပြီး — `table.detail.handoff.title`, staff.ts:3094
- အကြွေ — `settle.cash.changeLabel`, staff.ts:3066
- စုစုပေါင်း — `floor.settled.row.total`, staff.ts:1112
- လက်ခံရရှိငွေ — `table.detail.handoff.tendered`, staff.ts:3095
- လာယူဖို့ ခေါ်မယ့် နံပါတ် — မီးဖိုချောင် အော်ဒါစာရွက်နဲ့ အော်ဒါ ဘုတ်မှာ ပါပါတယ်။ —
  `table.detail.handoff.callout`, staff.ts:818
- သူတို့ ဟင်း အဆင်သင့်ဖြစ်ရင် ကောင်တာ စာမျက်နှာမှာ ပေါ်ပါမယ် — အသံက အဲဒီမှာ မြည်တာပါ၊ ဒီမှာ မမြည်ပါ။ —
  **DRAFT**, brief-m6.md:403 (guided's note; Min's native pass)
- လမ်းလျှောက်လာ — `reg.start.walkup`, staff.ts:1623
- ကောင်တာကို ပြန်သွား — `table.detail.handoff.done`, staff.ts:3097

**States:**

- အပိုကြေး — staff.ts:1111
- ထပ်ယူရန် ကျန် — staff.ts:3096
- ငွေမရှင်းခင် ဟင်းတွေ မီးဖိုချောင် ရောက်ပြီးသားပါ — ပါဆယ်ထုပ်များ ကနေ ပေးလိုက်ပါ။ — staff.ts:3599
- ပါဆယ်ထုပ်များ — `expo.title`, staff.ts:851
- ဖွင့်နေပါတယ်… — `reg.going`, staff.ts:1633
- အော်ဒါစနစ်က အဖြေ မရပါ — စပြီးသား ဖြစ်နိုင်ပါတယ်။ ထပ်မနှိပ်ခင် စားပွဲများနဲ့ ကောင်တာ အော်ဒါများကို စစ်ပါ။ —
  `floor.mint.unknown`, staff.ts:3293
- အဖြေ မရသေးပါ — နောက်အော်ဒါ စပြီးသား ဖြစ်နိုင်ပါတယ်။ ထပ်မစပါနဲ့ — စားပွဲများနဲ့ ကောင်တာ အော်ဒါများ မှာ
  ရှိမရှိ သိဖို့ ကောင်တာကို ပြန်သွားပါ။ — `pad.next.waiting`, **DRAFT**, brief-m6.md:645

### A11Y

**Role and name:**

- A `<section>`, **not a live region**, focused the moment the settle lands (the sheet has unmounted, so the
  page is un-hidden).
- `aria-labelledby` = `handoff-title handoff-row-change handoff-code`. On this Burmese-lead device it speaks
  "ငွေရှင်းပြီး, အကြွေ $30.11, #3F9A2C" once; on an English device, "Paid, Change $30.11, #3F9A2C".
- **The visual English echoes ("Paid", "Change") are aria-hidden inside the labelled nodes**, so the name keeps
  one script per run. Accname skips hidden descendants of a labelledby target.
- They are drawn through Chrome's own echo decision (`echoDrawn`). "Change" is K15-HIGH, so it survives
  Burmese-only. "Paid" is not, so it drops on a Burmese-only device.

**ONE live region:** the pad's Toast, which stays mounted with the seal for Walk-up refusals. Nothing else here
is live.

**Focus order** (DOM = visual):

1. the seal (programmatic)
2. Walk-up (or Takeaway bags)
3. Back to the counter

The bar's controls come before the seal. Nothing in the unmounted pad shell can take focus.

**Names:**

- **Walk-up:** "လမ်းလျှောက်လာ Walk-up", with `aria-describedby="seal-bell-note"`.
- **Back to the counter:** a link named by its stacked label. The arrow is aria-hidden.
- **The foot rows:** a `dl`. Each dt carries its inline echo, and these rows are not in the name.

**Targets:** Walk-up 158×54 · Back to the counter 250×64 (both ≥44). Every action starts at x ≥ 894, so a
late tap from Take (x244–844) lands on inert text.

**Never colour alone:**

- **Paid:** green + the check-disc shape + the word.
- **Still to collect:** icon + bold word.
- **The stub:** a dotted perforation and notches, which is a shape.

**Contrast:**

| Pair                 | Ratio     |
| -------------------- | --------- |
| Check on disc        | 5.96      |
| --t2 on --okb        | 5.13      |
| --tx on --okb        | 15.61     |
| --t2 on the stub     | 5.76      |
| --oa on the hero CTA | 4.84–6.22 |

**Motion:**

- `mms-rise` 240ms on mount.
- **The one delight:** ONE `--bloom-ok-lit` → `--bloom-ok-off` breath on the check disc (tokens.css:361-365).
- Under reduced motion, neither plays and the seal is simply there.

**Language:** `lang="my"` on every Burmese run, Padauk 400/700 only, ≥13px. Digits and the #CODE stay Latin and
tabular.

---

## DECISIONS

1. **Backbone is GLANCEABLE, "Shape of the Sale".** The sale is grid → crowned tray → green ticket.
   Owner answer 1: staff moments are glanceable.
2. **One verb, end to end.** The dock is `settle.cash.trigger`, the tray title is `settle.cash.title`, and the
   commit is `settle.cash.settleAmount`. "Take payment" leaves the counter-order dock. This fixes the judged
   "two verbs for one act" and follows the do-not-graft list.
3. **`settle.cash.trigger` and `settle.cash.title` join `STAFF_K15_HIGH`.** This is quiet's catch (staff.ts:1708,
   :1713 are outside :4202-4420). The money door keeps its English on a Burmese-only device, exactly as
   `pad.settle` did.
4. **Figures are tokens, never literals.** Two new tokens, `--till-fs-say` (88) and `--till-fs-hand` (128),
   are defined once at `:root`. Everything else uses `--fs-display`, `--fs-h1`, `--fs-h2` and `--fs-h3`. This
   fixes the judged style-ratchet rise (check-style-literals.mjs:17-18, :84-91).
5. **Glanceable's 104px code and 36px tiles are cut.** The #CODE shares the 88px "say" tier with the due, and the
   banknotes use `--fs-display`. That leaves two big tiers instead of five sizes: the restraint graft.
6. **The double-tap guard is by geometry, not a timer.** The door's spot under the tray is the inert readout and
   the empty foot of GAVE, because the Sheet funnels scrim, Esc and ✕ into one channel (sheet.tsx:113-120).
   This is graft 1. It is measured headless at 1366×1024: `elementFromPoint` at the door's centre after open
   must return non-interactive tray content.
7. **The seal's actions start at x ≥ 894.** A late tap from Take (x244–844) lands on the inert count-back rows.
   This is glanceable's rule, fixed. Its own seal put Walk-up under Take's span.
8. **Tip comes before tender, left to right** (W17c-2, CashSettleButton.tsx:698-700). Guided's tender-first order
   is not grafted.
9. **The tray carries the slip** (qty × dish, no amounts). This fixes "hides the order while Dad counts" with no
   second figure beside the frozen quote.
10. **The tip column stays quiet** (300 wide, the console's 44px chips, the 48px field). It is optional and rare
    at a walk-up. Its weight goes to OWE and GAVE.
11. **Banknote tiles get an `::after` hairline frame.** `.staff-chip-cash` still declares no fill, and the lit cap
    stays the console's one selection (globals.css:7845-7856, :14151-14161).
12. **The readout's word becomes "အကြွေ · Change"** (`echo="inline"`). It is a K15-HIGH money word, and the till
    has room for its English.
13. **No grab bar.** At ≥48em the grab zone is hidden (globals.css:11322-11324).
14. **The seal is a boarding-pass ticket**: a green paid body and a paper stub, with a 2px DOTTED perforation and
    12px notches. Dashed already means undo or held (expo-stage.ts:26-31, globals.css:7890-7894). This matches
    m3's claim ticket.
15. **The count-back pair** (Total and Cash received) sits at the main half's foot under the Change. This is the
    cash-tray ritual, and every figure is persisted (`handoffRows`).
16. **The Change and the #CODE share a baseline.** The two figures Dad acts on are read in one sweep, each under
    its own word.
17. **"Back to the counter" is the ONE hero, in the bottom-right corner.** The owner default for moment 6 keeps
    Dad within earshot of the bell (§17: app/staff/page.tsx:327). The corner always holds the next step:
    the door on the grid, the hero on the seal.
18. **Walk-up is a quiet secondary (lg 54px, paper) beside the hero.** This is the owner default. It has no "+"
    glyph, so restraint lets it fit at x ≥ 894.
19. **The honest bell note becomes Walk-up's description** (graft 6), because Walk-up is offered. It is true
    because the bell mounts only on `/staff`.
20. **One quiet secondary only.** When the food went early, "Takeaway bags" takes Walk-up's place.
21. **Clean-cancel reassurance** (graft 5) comes behind the pure `padCancelSays()`. It is said by the pad's Toast
    after the tray unmounts, and never after waiting or unknown.
22. **"Unpriced" is ranked last in `PadSettleBlock`** (graft 2). The tray never opens on a null total, and the
    tap is refused at once with its way out ("Reload the order").
23. **The ticket's Total is set at `--fs-h1`** (graft 3). That is an existing token, the size Dad reads aloud.
24. **Change survives a reload or unlock on the same tab** (graft 4). The fix is that `/add` routes a closed
    counter session to the table page's server card. The card adopts this tab's stash only when the
    `orderId` matches, and otherwise shows Total only, never an invented Change.
25. **The poll is paused under the seal**, as a printed receipt. A colleague's later refund shows on the counter
    page, not here.
26. **The idle hint under the door is dropped on the pad host** (quiet). The receipt directly above already shows
    Tax. The waiting and late lines in that slot remain.
27. **Cash only** (ruling #11). No reader, no card wording, and no card door is drawn anywhere on this path.
28. **No step rail, no change-by-notes breakdown, no new English-only string, no timers.** Each would add
    reading or a claim the code does not need to keep.

## OPEN RISKS

- **This is a money-path PR on the most-guarded component.** It needs:
  - a `layout="till"` JSX branch in CashSettleButton (the readout moves into the band, a `summary` slot, a
    `beforeOpen` gate);
  - HandoffCard `variant="seal"` with its `next` slot;
  - a `paused` flag in usePadDetailLive;
  - a CounterMintProvider on the pad;
  - the `"unpriced"` member;
  - `padCancelSays`;
  - the `/add` closed-route change.

  Each new rule needs a verify:slice mutant. The PR merges only after the blind pass, the Codex wait
  (ruling #1; with Codex out of quota, OWNER_RULINGS §G, G3 · WORKFLOW §Review step 5 (g)) and the ruling #12 device sitting.

- **Landscape keyboard fit is unmeasured.** With a ~40% keypad, the band and readout must stay visible above it
  on the real tablet. Measure it in the sitting.
- **Silent bell while chaining walk-ups.** The note says so, and "Back to the counter" is the hero. If the
  sitting shows bags waiting, the secondary can be dropped. That is one constant.
- **Fraunces has no optical-size axis at 88 and 128px.** Check tabular figures and weight at those sizes. If they
  read coarse, set them in Hanken 800 tabular. The token is unchanged.
- **Figure widths are estimated, not measured.** "$9,999.99" at 88px is ≈462px in the 460px OWE column, and the
  widest hex #CODE at 88px is ≈466px in the 502px stub. The `tillHeroTier` step-down covers the due and the
  Change. Measure the #CODE headless.
- **Restoring the stash on the table page reverses a deliberate rule** (HandoffCard.tsx:173-177: "never restores
  one"). Limiting it to closed counter orders with a matching `orderId` needs its own review line.
- **The aria-hidden visual echo is a new Chrome option.** It must follow `echoDrawn`, and `check:staff-lang`
  (rule 5) must accept it.
- **Five Burmese drafts await Min's native pass**, logged in a "K15 · counter-floor" row: the clean-cancel line,
  `pad.reason.unpriced`, the bell note, `pad.next.waiting`, and the re-worded `pad.nameNotSaved`.
- **A late-landing seal can appear under Dad's finger.** If a waited settle lands after Dad closed the tray, a tap
  aimed at the dock could hit the seal's actions. The door is held (`aria-disabled`) during this cart's own
  wait, so the risk is low. Note it for the sitting.
- **A double-tap on "Back to the counter" lands on the counter home's bottom-right.** What sits there is
  unmeasured.
- **"Keep the change as tip · $30.11" shows for a large over-tender.** This is shipped behaviour, and it is a fill,
  never a commit. The sitting should confirm that Dad reads it as optional.

---

## Appendix — what changed after this spec (applied in the drawn screens)

The spec above was written first. Two later passes changed it, and the screens on the canvas were drawn
with both applied. **Where an item below contradicts the spec above, the item below wins.**

### A · System amendments (the cross-moment consistency pass)

1. Fold --till-fs-say into the shared --fs-pass (both are 88px: the figure said or read across the counter). --till-fs-hand (128px Change) stays the only other new size.
2. The crowned till tray is the ONE cash sheet on the counter tablet, whichever door opens it: the pad dock, a table pane's Take cash (m2), the loss slip's Take cash door (m7), or Take cash with a flag up (m8). Key layout='till' on the viewport bounds, not on the pad host.
3. Offer the seal's grammar at pane width for a dine-in settle (m2): green body, ✓ disc, Change hero, count-back rows, and no #CODE stub. The solid ✓ disc then means 'paid' everywhere on the counter.

### B · The adversarial critic's blocking fixes (verdict: fix)

1. **Amendment 1 is not applied. The spec still defines and uses its own 88px token, --till-fs-say, where it should fold into the shared --fs-pass. That leaves two 88px tokens in two files for the same 'said or read across the counter' figure.**
   - Evidence: picked-m6.md:135-139 defines `--till-fs-say: 5.5rem` 'at :root in globals.css' and calls the pair 'the only new ones'. :265 sets the tray due with it, :704 the #CODE, and :912-913 / :915 repeat it in DECISIONS. Meanwhile picked-m2.md:339 / :510 define `--fs-pass: 5.5rem` in packages/ui/src/tokens.css as 'the one new token'. The amendment: 'Fold --till-fs-say into the shared --fs-pass … --till-fs-hand (128px Change) stays the only other new size.'
   - Fix: Delete --till-fs-say everywhere. Set the OWE due and the stub's #CODE at var(--fs-pass) from packages/ui/src/tokens.css. Keep --till-fs-hand (128px) as the only m6-specific size, defined in the same token layer. Rewrite :135-139 and decisions 4-5 to say one shared pass token plus one hand token.
2. **The #CODE stub breaks the CounterPass rule. The shared vocabulary says the CounterPass is ONE primitive in constant paper in both themes, like a Wallet pass, but the stub's ground and ink flip in Night. The spec also never names the stub as the CounterPass, so Dad gets two looks for 'the figure read across the counter'.**
   - Evidence: picked-m6.md:781: 'The stub is --cd #2b213c with ink #f3ecdf, and the notches are --pg #100c19' (Night). :689 frames the stub as '--cd … plain paper, like Mom's kitchen ticket', which is a theme token, not constant paper. Shared vocabulary: 'one CounterPass primitive … It is constant paper in both themes, like a Wallet pass, so Dad learns one look.'
   - Fix: Build the stub (callout, #CODE at --fs-pass, dotted perforation, 12px notches) as the shared CounterPass. Use constant paper and constant ink in both themes; only the notch cut-outs follow --pg. Change the Night block at :777-781 to match and cite the primitive.
3. **Amendment 2 is not applied. The crowned till tray is specified for the pad host only, and the JSX layout is never keyed to the viewport. The spec also never says how the table pane (m2), the loss slip (m7) and the flag door (m8) open the same tray: where the slip lines come from, or what Take must carry for each door.**
   - Evidence: picked-m6.md:26-29 ('The tray carries the slip', 'On the pad host…'). :235-241 apply the CSS at viewport bounds, but :967-969 list a `layout="till"` JSX branch with a pad-fed `summary` slot and a pad-only `beforeOpen`, with no keying rule. Decision 6 (:916-920) measures the geometric double-tap guard with elementFromPoint only at the pad door's centre. The other doors are at picked-m2.md:613-617 (pane Take cash, x907-1338 y770-834), picked-m7.md:566-570 (loss slip, y547-601) and picked-m8.md:819-823. picked-m8.md:985 requires 'every settle door carries' the acknowledged approval ids, and the tray's Take (:329-331) carries none.
   - Fix: State that layout='till' comes from one viewport predicate, (min-width:64em) and (min-height:44em), read in CashSettleButton, not from the host. Name the slip source for every host (the pad's lines, the table detail's lines, the loss slip's lines). Make Take carry the m8 acknowledged-ids payload whenever the door was 'Take payment anyway'. Extend the headless elementFromPoint check to all four doors' centres; each must land on inert tray content.
4. **Amendment 3 is not applied. There is no pane-width seal for a dine-in settle. The dine-in paid card keeps today's rows-only card with a text '✓' glyph, so the solid ✓ disc does not mean 'paid' everywhere on the counter.**
   - Evidence: The spec covers only the counter-order seal (:633-899). DESIGN-LANGUAGE.md:2317-2318: 'A table gets the rows-only card when a tender was entered.' HandoffCard.tsx:91-95 draws `<span className="staff-handoff-check">✓</span>` as text. The amendment: 'Offer the seal's grammar at pane width for a dine-in settle (m2): green body, ✓ disc, Change hero, count-back rows, and no #CODE stub.'
   - Fix: Add a pane-width seal variant (431px content in the m2 pane) for a dine-in table: the --okb body, the solid ✓ disc, the Change hero (tillHeroTier at pane width), and the Total / Cash received count-back rows. It has no stub, no #CODE and no Walk-up, and its hero is 'Back to the counter' per the m2 default. Give its geometry, states and a11y name in the same detail as screen 2.
5. **The bell note promises a ring the code will not give. 'The bell rings there' is false in exactly the case the note exists for: Dad chains walk-ups or stays on the seal while the kitchen finishes this bag. When the counter home remounts, its first good poll is merged in silently, so that bag never rings. The 'waiting past the bound' exit is a full-document navigation, which also seeds silently.**
   - Evidence: picked-m6.md:707-711 and :795 ('…the bell rings there, not here'), with :176 and decision 19 claiming it is 'true'. lib/counter-sound.ts:127-141: 'Each mount's seed now merges INTO this set … a new document's first mount seeds'. DESIGN-LANGUAGE.md:1224-1230: 'each board mount's first GOOD facts are merged into it silently (the mount, … a reload …)'. The spec's own :764 makes Back a full-document <a>.
   - Fix: Cut the note to what the code keeps. EN: 'Their food shows up on the counter page when it's ready.' MY: the existing draft's first clause, 'သူတို့ ဟင်း အဆင်သင့်ဖြစ်ရင် ကောင်တာ စာမျက်နှာမှာ ပေါ်ပါမယ်။' (a subset of brief-m6.md:403, nothing new invented). Any sentence about when the bell does or does not ring needs new Burmese, so leave it English-only and list it.
6. **The green seal and its bloom are not limited to the landing. The closed-order server card renders 'in this seal geometry' on any device: deep links, reloads, and the reader chip's 'View'. Since mms-rise and the ok-bloom play 'on mount', every later look at a closed walk-up would fill green and breathe. The shared vocabulary allows a green fill only 'on the screen where it just landed (the seal's one bloom)'.**
   - Evidence: picked-m6.md:182 and :769-773 (the server card in seal geometry, with or without a stash). :893-895 (bloom on mount, no condition). HandoffCard.tsx:166-178: ClosedHandoffCard serves 'a deep link, a reload, the chip's "View"'.
   - Fix: Give the --okb wash and the single bloom only to (a) the in-place landing and (b) a same-tab reload whose stash orderId matches. Every other server-card render uses the calm variant: the same geometry on paper, the solid ✓ disc kept, no wash, no bloom, no rise.
7. **There are two live regions on the pad host. Re-hosting CashSettleButton brings its own sr-only role=alert under the trigger, which mounts when the door is tapped while held on this cart's own wait. It sits beside the pad's Toast, but the spec says the Toast is the pad's ONE region.**
   - Evidence: CashSettleButton.tsx:1002-1008: `{waitNote && heldTap !== null && (<p role="alert" className="sr-only">…`. picked-m6.md:175 and :855 claim one region. :995-997 confirms the door is held (aria-disabled) during this cart's own wait, so that path is reachable on the pad. OrderPad.tsx:1345 ('The view's ONE live region').
   - Fix: On the pad host, send the held-tap sentence (settle.cash.waiting) through the pad's arbitrated Toast via the same onBlockedTap-style callback, and do not render CX3's alert there. State this in the screen-1 A11Y section and in the OPEN RISKS change list.
8. **A wrong claim with a citation: the spec says 'every figure is persisted (handoffRows)'. Cash received and Change come from the tender Dad typed, and the tender is never recorded. The rationale also says the screen 'answers' a guest's 'I gave you a hundred', but it can only show what Dad tapped.**
   - Evidence: picked-m6.md decision 15 (:937-938) and :731 ('All figures are persisted'). :60-61 ('If a guest says "I gave you a hundred", the screen answers'). DESIGN-LANGUAGE.md:2264: 'The tender is optional, never recorded'. register-ui.ts:61-62: 'tenderedCents: What the cashier said was handed over'. CashSettleButton.tsx:413: `tenderedCents: at.tenderAtTap`, a client value.
   - Fix: Reword: Total and Tip are the persisted figures the settle returned. Cash received and Change are the tender Dad entered, kept in this tab only. Drop the dispute claim, or say 'the screen shows what was entered'.

### C · The critic's suggestions (not blocking; take them where the build agrees)

- The OWE/TIP/GAVE grid is in fixed px (460|32|300|32|438 = 1262 content), but the (min-width:64em) bound also admits a 1024px portrait tablet. Specify fr/minmax columns, or raise the bound, and measure the hero plus tillHeroTier at 1024 wide.
- The pad must write stashHandoff(orderId, …) when the settle lands, or the 'Change survives reload' fix has nothing to adopt. Add it to the OPEN RISKS change list. On adoption, use the order row's persisted total and only the stash's tender, never the stash's total.
- 'Nothing was taken — the order is still here.' now toasts after every plain open-and-cancel. Consider saying it only when an attempt from this opening was refused or stalled, which is when doubt could exist, so a routine cancel stays silent.
- The tray's slip stays live while the hero holds the frozen quote. A colleague's add can show a new line beside the old due until the moved alert fires. Consider freezing the slip with the quote, or marking a changed slip.
- If the till is the one cash sheet everywhere, the tab-close door's keys (settle.cash.triggerTab / settle.cash.titleTab) are also outside STAFF_K15_HIGH and would lose English on a Burmese-only device. Add them with trigger/title.
- The Exact tile draws 'အတိအကျ' with no English echo in Both mode (shipped echo={false}), while every other till money word now has one. Consider echo='inline' in the till layout.
- Add the band-growth case (an alert plus 'Reload the page' beside it) to the elementFromPoint double-tap measurement. A grown band can bring the Reload button up into the door's spot.
- A double-tap on 'Back to the counter' lands where the counter column reserves room for the lane's thumb-zone Undo pill (globals.css:13413). Measure it in the ruling #12 sitting.
- Define --till-fs-hand in packages/ui/src/tokens.css, next to --fs-pass, so the two counter-figure tiers live in one token layer.
- The seal's 88px #CODE and the 88px tray due share --fs-pass, but only the #CODE is an identity figure. Say why the due shares the pass tier (the figure said aloud) so the CounterPass primitive is not stretched to cover non-pass figures.

### D · Round 3 (2026-10-07, under the owner's delegation) — these win over everything above

The owner delegated every open decision ("I trust you to apply world-class design-thinking best standards on
all open decisions") and added a live TV board, card / Apple Pay after the food is served, and animated step
guides. PATH_DESIGN_2026-10-07.md's round-3 section records the decisions (D1–D5) and the shared vocabulary.
The round-3 consistency pass gave this moment these changes:

1. D1(c): --fs-pass (5.5rem) and --till-fs-hand (8rem) land in guards-style's early token-only PR, not counter-floor's. The same PR carries the --pass-\* constant inks, so the seal's #CODE stub, m2's pass and the TV stub read one paper.
2. The seal's #CODE stub is the CounterPass primitive: landscape, the code face at --fs-pass. The dine-in seal at pane width still has no stub (reconciliation 4).
3. The green bloom is the staff twin of the phone's STAMP. It plays once, on the in-place landing or a matching same-tab stash reload, and never on a revisit. On the counter the ✓ disc means paid only.
4. D5 and D4: the till tray is never gated by served and never dimmed by a pending approval. After C2 only the pane's cash-only line changes (m2), and the tray does not.
5. Expose the tray's readout as a component that m12 can render inert, for counter step 4.

### E · Codex round 3 (2026-10-08) — these win over everything above

1. **The slip freezes with the quote.** The tray's item slip renders the same frozen snapshot as the DUE figure, never the live cart. When the live cart diverges (a colleague's add, a void, a manager decision), the slip gains one line, "The order changed — tap to update" (English; MY to K15), and Take is disabled until Dad re-quotes. Cash is never collected against a screen whose items and total disagree; the server's moved refusal stays the backstop, not the first notice. This supersedes section C's "consider freezing the slip".

### F · Codex round 4 (2026-10-08) — these win over everything above

1. **A settle with no tender has its own honest seal.** When Dad leaves GAVE empty and taps Take,
   `tenderedCents` is null, so the seal shows the paid total and "Paid · ရှင်းပြီး" with no Change and
   no Cash received (the server card already omits both when tender is null). Change becomes the hero
   only when a tender was entered. A component case pins both seals.

### H · Build notes (2026-10-09, claude/feat/pd6-till-tray)

Built by the counter-floor stream in one PR, with PD2's pane half and PD1's ring half (K39, K44 and
P2do ride along). Sections D–F above won wherever they disagreed with the spec; where the code
disproved a claim, the design changed and the reason is below.

**What was built, by section.**

- **Screen 1 — the tray.** `CashSettleButton` stays the ONE cash sheet with one host contract; every
  door (the counter pad's dock, the table page and its pane) opens it. The till layout (OWE → TIP →
  GAVE in `.till-body`, the band row `.till-band-row` with its alert / reload / actions and the inert
  readout under them) comes from the viewport alone (`useMediaQuery(TILL_MEDIA)`), never the host
  (B3). The due is set at `--fs-pass`; the Change at `--till-fs-hand` stepping down by
  `tillHeroTier` (≤ 7 glyphs at the hand tier). The slip is `tillSlipFrom(lines, lang)` (voided lines
  dropped) and freezes with the quote; a diverged cart (`tillSlipDiverged`) marks it "The order
  changed — tap to update" and holds Take until the tap re-quotes (E1). The tab-close keys and the
  Exact tile's echo follow C. The pad host's door (`TillDoor`) carries the pad's gate as
  `beforeOpen`, its held and busy states, and routes the held tap and the clean-cancel line through
  the pad's ONE region, so CX3's own alert never mounts there (B7).
- **Screen 2 — the seal.** `HandoffCard` speaks the paid card's grammar: the solid ✓ disc, Change (or
  the Total, with no tender — F1) as the hero (`sealHeroTier`), the count-back rows, and on a counter
  order the #CODE on the CounterPass (landscape with the callout in its stub at the till width;
  portrait, the callout in its body, below it). "Back to the counter" is the one hero action; on the
  pad Walk-up (`SealWalkUp`) is the quiet secondary with B5's note (`table.detail.handoff.walkupNote`,
  the constant `SEAL_OFFERS_WALKUP` the switch to drop it). The wash and the one bloom play only on
  the landing or a matching same-tab stash (B6, D3); every other render is the calm seal. A dine-in
  seal at pane width has no stub, no #CODE and no Walk-up (B4, D2).
- **The pad never leaves (K39).** A landed sale writes `stashHandoff` FIRST (correction 4), pauses
  the poll, and replaces the pad with the seal (the pad shell unmounts; the pad's Toast survives as
  the ONE region). A read already in the air when the seal goes up is dropped. A settle whose answer
  is unknown and whose session then closes shows the closed-unknown section, never a silent bounce.
  `/add` on a closed counter session lands on its table page, whose card adopts the stash for the
  SAME order only — the server's total, the stash's tender (C2 · `sealAdopt`).

**Appendix C — taken / not.**

| Suggestion                                     | Taken? | How / why                                                                                                                                        |
| ---------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| fixed px grid vs the 64em bound                | taken  | the bound is computed from the grid instead (below); a 1024px tablet keeps the narrow sheet                                                      |
| the pad writes the stash; adopt the tender     | taken  | `stashHandoff` before the seal; `sealAdopt` keeps the server's total and takes only the stash's tender (and `sentEarly`)                         |
| "Nothing was taken" only after doubt           | taken  | `tillCancelSays(attempt)` is true only for a refused or stalled attempt from this opening                                                        |
| freeze the slip                                | taken  | superseded by E1, built as E1 says                                                                                                               |
| tab-close keys into `STAFF_K15_HIGH`           | taken  | `settle.cash.triggerTab` / `.titleTab` with trigger / title                                                                                      |
| the Exact tile's echo                          | taken  | `echo="inline"` in the till layout only                                                                                                          |
| the band-growth case in the double-tap measure | taken  | `tillBandsAt` / `tillDoorLandsInert` include the alert + Reload band; the CSS tracks are parsed and pinned to it (no headless browser: see risk) |
| Back vs the lane's Undo pill                   | not    | a device measure — left to the sitting (ruling #12)                                                                                              |
| `--till-fs-hand` beside `--fs-pass`            | n/a    | landed in tokens.css by guards-style's token PR (D1); read, never edited here                                                                    |
| why the due shares the pass tier               | taken  | the due is the figure SAID across the counter, so it reads the same token; it is not a CounterPass and is not rendered by one                    |

**The breakpoint, computed (correction 8).** `lib/till.ts` derives it from the grid it guards: the
columns 460 | 32 | 300 | 32 | 438 = 1262px, + 2 × 32 tray padding = 1326px, + 2 × 20 page gutters =
1366px → `TILL_MEDIA` = `(min-width: 85.375em) and (min-height: 44em)`. `till.test.ts` parses
`globals.css` and pins the till block's media query and track list to those constants, so a widened
column without a raised bound reddens. B3's "64em" is superseded: at 1024px the grid does not fit.

**Decided under the owner's delegation (decided by: the counter-floor stream).**

1. The pad's door says "Opening payment…" only while it waits for a read that started after its
   last write (an add that landed unread, a line write, the name just saved); with nothing to wait
   for, the tray simply opens.
2. A read that has not priced the order (`settleTotalCents` null with nothing pending) refuses the
   door with `pad.reason.unpriced`, ranked after every other hold — the tray never opens on a null.
3. The narrow seal's hero is set at `--fs-pass` and steps down to `--fs-display` past 6 glyphs
   (`SEAL_NARROW_MAX_CHARS`); the wide seal starts at `--till-fs-hand` and steps down past 7, like
   the tray.
4. A dine-in seal offers "Back to the counter" only in the counter's pane; a server's phone page
   keeps the quiet card (no promise of a counter it is not beside).
5. The slip is drawn only in the till layout (the narrow sheet has no room for it); the hold it
   drives works in both.
6. The seal's actions sit outside the pass, on the till's track 5 at the wide width, so the pass
   hosts no control and the money corner stays inert under a double-tap.
7. The Change and the #CODE do not share a baseline (round 3's geometry wins over the spec's
   shared-baseline line): the stub sits beside the green body.
8. PD2's ask pass is the figureless arm (the ask's own words as its identity, `floor.table.label` its
   required label), the ask's age plain text in its head; the table's number stays the pane's
   heading, printed once.
9. When PD8 merges, its `totalPending` ("Updating the total…") must join the pass's total and the
   trigger — one binding (`tillDue`) already feeds both.
10. The Team tile (K39's remainder) is not in this PR.

**Money / authority modules touched, and their mutants.** `lib/till.ts` (new) · `lib/order-pad.ts` ·
`lib/staff-send-view.ts` · `lib/floor-kitchen.ts` · `lib/floor.ts` · `components/staff/CashSettleButton.tsx` ·
`HandoffCard.tsx` · `OrderPad.tsx` · `usePadDetailLive.ts` · `SealWalkUp.tsx` · `FloorDetailLive.tsx` ·
`ReceiptStack.tsx` (new) · `StaffTicket.tsx` · `app/staff/table/[id]/add/page.tsx`. New mutants (45):
`till/*` (10), `till-ui/*` (7), `seal/*` (5), `pad-seal/*` (6), `pad-door/*` (2), `pad-route/*` (1),
`pad/unpriced-*` (2), `send-view/asked-table-counts-only-staff`, `p2do/*` (2), `pd1/*` (4), `pd2/*` (2),
`k44/*` (2); re-anchored: nine cash-sheet mutants, `p2f-ui/handoff/sent-early-unsaid`,
`p2g-code/closed-page-landed-loses-to-server`, two `pad-ui/unsent-tap-*`, two
`staff-send-view/unsent-chip-*`, `p2d-floor/kitchen-host-table-owes-the-diners-round`,
`p2d-floor/strip-owed-send-unmarked` and three `p3d-receipt/ticket-*` (now in `ReceiptStack.tsx`).
Every one was run with `--no-gate --only=` and CAUGHT; the verdicts are in the PR.

**The blind pass on #334 (REJECT) — what the fix round changed.**

1. **The till's doubt is STICKY** (critical 1). `tillLedgerAfter` (`lib/till.ts`, pure) keeps the last
   attempt AND every doubt: an attempt whose answer was lost, or is still out past the bound, may have
   recorded the payment, so a later refusal ("That table is closed." after a lost answer is that
   settle LANDING), a stalled tap or a new opening never erases it. Only the out attempt's own late
   answer resolves `out`; only a host READ resolves both (the pad counts each read that clears its
   `unknownSince`, `settleUnknownAfterRead`, and hands the count in as `readsResolved`); a landed
   attempt resolves everything. A refusal hands `onOutcomeUnknown(false)` up only when it is the late
   answer and no doubt is left, so the page's closed-bounce hold survives a newer attempt's refusal —
   on the table page too (FloorDetailLive's "a refused retry releases the hold" was that defect, and
   its test now asserts the opposite). The clean-cancel line also needs the host's own view clear
   (`outcomeOpen`), which covers a ledger a remount lost.
2. **No tray on $0.00** (critical 2). The pad's till gate re-decides the hold AFTER its awaits with
   the same `padSettle` decision on the inputs as of the last commit: a dish refused while it flew
   leaves an empty or unpriced order, and the hold's own words say why. `CashSettleButton.totalCents`
   is now `number | null`: the tray's quote is a number by type, and the freeze refuses an unpriced
   read (the `?? 0` is gone).
3. **The seal lands once per reload, never per revisit.** The landing is a one-shot note beside the
   stash (`markSealLanding` / `takeSealLanding`: this order, inside `SEAL_LANDING_TTL_MS`, read and
   cleared); every later same-tab visit is the calm seal, the entered tender still shown.
4. **The geometry is a design-time check**, said so (below); its tray side is now bound to the parsed
   `.mms-sheet.till-sheet` gutters and padding and to `tokens.css`'s spacing.
5. **a11y:** the slip's mark moves focus to Take when it unmounts under its own tap; the slip list's
   name is one script (the echo is `aria-hidden`).
6. **Open, for the device sitting:** turning a tablet across `TILL_MEDIA` with the tray open remounts
   the tip and tendered inputs (the two layouts are different trees), so focus and the decimal pad are
   lost mid-entry; the values survive (they are state). A CSS-only re-layout would need one tree for
   both layouts — not cheap; listed rather than fixed.

**Risks left open.** The double-tap geometry is a DESIGN-TIME check: the tray's tracks, gutters and
padding are bound to the parsed stylesheet, but the door spans are the design's (picked-m6-1 ② Dock,
picked-m2-3 ③), not measured from the dock's CSS, and nothing calls it at runtime (the blind pass on
#334) — it is not
`elementFromPoint` in a browser — the agent environment has none (K43 is unmeasured for the same
reason); the device sitting (ruling #12) is the measure. The loss slip's (m7) and the flag door's
(m8) Take cash doors do not exist yet; when they land they open this same tray and their door
centres join `tillDoorLandsInert`'s cases. Take carrying m8's acknowledged ids is PD8's change to
this component.
