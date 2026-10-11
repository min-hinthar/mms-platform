# Picked m2 — Asking for the bill at the table: "The Counter Path", refined

**Backbone:** GUIDED (the owner: diner moments guided). The guidance lives in the existing rail
(Order · Bill · Pay) and in ONE spoken sentence per state. The ①②③ list is gone: it was a second
step vocabulary inside a Bill that already has a rail (judges, m2.json → scores[1].note).

**Grafted from QUIET:** one docked door. After the ask, the phone becomes the slip. No tip, no card,
no second total. Reuse the words the family already reads. The settled thank-you uses the shipped
`paidThankYou` pair.

**Grafted from GLANCEABLE:** the till placard. The table number is big enough to read across the
counter, and the same total appears on the guest's phone and on Dad's pane. The ask's age is on
Dad's floor chip. The one delight is the pass, torn from the app's own thermal-receipt paper.

**Dad's screen (a staff screen inside this diner moment):** drawn glanceable, as the owner prefers
for staff. It carries the guided "Next:" line.

**What great hospitality does here, kept to this family's real constraints:**

- **A maître d'** presents the check with one sentence ("Whenever you're ready — the counter takes
  cash"), so nobody is surprised at the till.
- **A ticket counter (shokken) or boarding pass** turns the phone into a token the clerk matches by
  number, without reading.
- **A great KDS** shows the ask as a ticket with its age, sorts it to the top, and gives one
  bump-sized action.

The design adds no hardware and no promise the code doesn't keep: no ETA and no card. The register
can record only cash today, and nobody waits for anyone.

**Example data:** the same as every existing m2 artboard (m2-guided-1/2, m2-quiet-1/2, m2-glance-1/2):

- Table 4.
- Lines: 2 × Mohinga / မုန့်ဟင်းခါး $28.00 and Pickled Tea Salad / လက်ဖက်သုပ် $14.00, both "Served".
- Subtotal $42.00, Sales tax $4.41, Total **$46.41**.
- Host shown on Dad's floor card: Thiri.

The dish names are verified in docs/data/menu_catalog.json (`name_en`/`name_my`).

**Light tokens used below (hex, for the drawer):**

| Token       | Value                  |
| ----------- | ---------------------- |
| --pg        | #faf9f5                |
| --sunken    | #efece2                |
| --cd        | #fffdf8                |
| --tx        | #1b1714                |
| --t2        | #6e6358                |
| --t3        | #726859                |
| --ac        | #a65f10                |
| --ac-strong | #8f5009                |
| --oa        | #fffdf8                |
| --ok        | #346e47                |
| --warn      | #a44b34                |
| --warnb     | #f6e9e4                |
| --bd        | rgba(58,35,23,0.1)     |
| --sheen     | rgba(255,255,255,0.55) |

**Card recipe:** radius 20, bg #fffdf8, 1px --bd. The shadow is `inset 0 1px 0 rgba(255,255,255,0.55),
0 1px 3px -1px rgba(35,24,16,0.07), 0 14px 28px -18px rgba(35,24,16,0.28)` (--sh-paper,
tokens.css:197). Card dots are `radial-gradient(rgba(166,95,16,0.16) 1px, transparent 1.6px) 0 0 / 18px 18px`,
faded toward the bottom, as in the existing m2 artboards.

---

## SCREEN picked-m2-1.dc.html — The Bill, one door

- **Device:** phone 390×844.
- **Theme:** light. Night swaps tokens only: card #2b213c; CTA flat #e7a53a with #130d1e ink.
- **Who:** any member of a dine-in table (host or guest), Bill stage, before anyone has asked. Drawn
  state: one phone at the table, everything sent, nothing held.

### LAYOUT (top to bottom; page column x 20–370 = 350 wide; `main.page-col-narrow` padding 24/20/40)

- **0–47:** empty ground (safe area). Draw nothing.
- **47–103: AppHeader**, unchanged. 56px, padding 0 14, #faf9f5, 1px --bd bottom. The logo
  `<img src="/_blob/e7e27a9553079ddb61cfec7bd9f82c9f">` 51×34 + "Morning Star" Fraunces 16/800. Nothing on
  the right.
- **127–143: eyebrow "TABLE 4"**. `.eyebrow`: 11px/700, tracking 0.13em, uppercase, --ac #a65f10.
  Shipped Phase 1b, Checkout.tsx:2713.
- **147–196: h1 "Your bill"**. Fraunces 26/600, lh 1.08, tracking -0.02em, --tx. The Burmese
  "သင့်ဘောက်ချာ" sits INSIDE the h1 as a block: Padauk 13px, weight 700 (the artboard's nearest to the
  shipped 600), lh 1.6, --t2 (Checkout.tsx:2717-2722, `My size="var(--fs-sm)"`). tabIndex -1: the
  focus target on every view flip.
- **204–224: step rail** `.checkout-steps` (globals.css:2217-2264), unchanged:
  - **Order (done):** 20px disc, 1px --ok ring, check glyph; label 12/700 --ok; sr " — done".
  - A 14×1 --bd join.
  - **Bill (current):** disc filled --ac with "2" in --oa; label --ac-strong; `aria-current="step"`.
  - A join.
  - **Pay (next):** --bd ring, "3" in --t3, label --t3; sr " — next".
- **240–284: "← Back to your order"**, shipped `.nav-link` (globals.css:3666-3677). 44px row, 14px/700
  --ac, ← arrow aria-hidden. The MY "သင့်အော်ဒါဆီ ပြန်သွားမယ်" sits inline at 13px --t3, after a 0.4em
  margin (Checkout.tsx:2890-2902).
- **292–335 (≈356 if the MY wraps): THE ONE SENTENCE** (new; a plain `<p>`, not a region):
  - EN line, --fs-lead 15px / 700, lh 22, --tx: "Ready for the bill? The counter takes cash."
  - MY line(s) beneath, Padauk 13px/400, lh 1.6, --t2.
  - This is the only guidance on the screen besides the rail.
- **349–639: THE RECEIPT SLIP**, today's `.card.card-textured.checkout-receipt` (margin 14 0, padding
  4 16 12; globals.css:2351-2354; Checkout.tsx:3357-3373):
  - **BillLines, unchanged.** Each row: padding 6 0; a 40×40 radius-9 photo placeholder
    (linear-gradient 135deg #f1e7d6→#fbf4e8); then a column of qty × name (16/600), the MY name
    (13 --t2) and the state line (11 --t3); the price is 16/600 tabular, right-aligned.
    - Row 1: "2 × Mohinga" / "မုန့်ဟင်းခါး" / "Served" / "$28.00".
    - Row 2: "Pickled Tea Salad" / "လက်ဖက်သုပ်" / "Served" / "$14.00".
  - **Rows block:** border-top 1px --bd, padding-top 6, margin-top 8. Two dotted-leader rows, 14px
    (dt --t2 with the MY inline at 13px; dd --tx tabular):
    - Subtotal · အကြိုစုစုပေါင်း ···· $42.00
    - Sales tax · ရောင်းခွန် ···· $4.41
  - **NEW, the slip's own foot** (only while dine-in phone pay is parked — the separate Total row
    outside the card exists only to preview a tip, Checkout.tsx:3836-3874):
    - margin-top 8, a 1px --bd rule, padding-top 12, flex space-between, baseline.
    - Left: "Total" 16/800 --tx, with "စုစုပေါင်း" 13px --t3 stacked beneath.
    - Right: "$46.41" in Fraunces 21px (--fs-h2), weight 800, tabular. It is a NumberFlow of the
      server's `totals.totalCents`.
    - Never "Estimated total": no tip exists on this screen.
- **651–699: the promo form**, today's (`showPayControls`, Checkout.tsx:3390-3445). Input placeholder
  "Promo code · ပရိုမို ကုဒ်" + "Apply" / "သုံးမယ်". It is kept as found, for pilot Table 2's PILOT15.
  In the first viewport it sits under the dock's paper fade, and it scrolls clear (page bottom
  padding = dock 64 + fade 24 + 24).
- **646–670: the dock's paper fade.** Fixed, the full dock width: `linear-gradient(to top, #faf9f5 60%,
rgba(250,249,245,0))`. Lines dissolve; they never clip.
- **670–734: THE ONE DOOR, docked** in the CartBar's own slot. That slot is position fixed, left 12,
  right 12, max-width 416, bottom = tab bar + 16 + the safe inset (CartBar.tsx:115-121); here x 12–378.
  - The control is a `<button class="checkout-cta">` (globals.css:2266-2330): gradient #a65f10→#8f5009,
    ink #fffdf8, shadow `inset 0 1px 0 rgba(255,255,255,0.55), 0 2px 8px -1px rgba(166,95,16,0.42)`.
    Radius 12 (the shipped inline radius, Checkout.tsx:4045), min-height 64 (--tap-bump, tokens.css:25).
  - Content, centred, column:
    - Line 1 is a flex row with a gap of 8: the receipt glyph 16px (aria-hidden), "Pay at the
      counter" 16/800, and the "→" arrow (`.checkout-cta-arrow`, nudges 4px on pointer hover).
    - Line 2: "ကောင်တာမှာ ရှင်းမယ်" Padauk 13/600 in the button's ink.
  - **No amount on the door:** it charges nothing, and the total sits on the slip directly above.
- **750–844: diner tab bar** (`.diner-tabs`). Menu · Order · Account. Order is current
  (`aria-current="page"`, #8f5009). The bottom 34 stays empty. No count capsule: this is a shared
  dine-in cart.

**NOT drawn while dine-in phone pay is parked (owner answer 2):**

- the card hero "Pay the whole order · $X";
- "Add a little extra?" and the tip chips;
- the separate Total / Estimated-total row;
- the ghost "Pay at the counter";
- "Changed your mind? Pay on your phone".

### STATES (not drawn; for the build)

- **Unsent dishes** (ships strictly after counter-floor's P2do; see DECISIONS):
  - The door stays LIVE for host, guest and hostless tables alike; the ask carries the dishes to
    the counter.
  - Today's unsent note (Checkout.tsx:3285-3333) keeps its place above the slip. Its head becomes a
    count-free dashed tag: "Not sent yet · မပို့ရသေး". It is 32px, 1.5px dashed --warn, radius 999,
    13/700 --warn.
  - Its line becomes "You can still ask — the counter will check them with your table."
  - The host also keeps today's quiet "← Back to send them" link.
  - No Send button is drawn on the Bill, so the Bill keeps one hero (§32).
- **Send's 10-second undo window (D16):**
  - Today's outline "Undo · 9" sits above the slip (Checkout.tsx:3342-3352). Undo is never the hero.
  - The door is `aria-disabled` at 0.55 opacity. Its one reason sits inside the dock, directly above
    the button, as `.checkout-pay-reason` (13 --t2): "Pay opens when the undo window closes." with
    its MY.
  - The reason is linked by `aria-describedby`, and every blocked tap re-says it through the region.
- **The register is mid-settle** (the settle freeze; `settling` in the cart view, cart.ts:653):
  - The door is `aria-disabled`.
  - Its reason: "The counter is taking your table’s payment right now — this screen updates when
    it’s done."
  - The phone does move on when the settle lands (Checkout.tsx:700-720).
- **Busy:** the label reads "One moment…" at full ink, with `aria-busy`.
- **Refused or offline:** revert to the confirmed state. "Couldn’t reach the counter just now —
  please try again." goes in the pay-error slot (Checkout.tsx:1992).
- **Empty:** today's empty state. A tap re-says "Nothing to pay yet — add something first."
- **Promo field focused:** the dock and its fade hide, so they never ride the keyboard, and return on
  blur.
- **Group table** (2+ phones, Checkout.tsx:369-370): today's SplitSection reference and its "The
  split above is just a guide…" line stay between the slip and the promo form, unchanged.
- **A reader is configured or an outside-app card is named** (`counterTakesCard()` true): the
  sentence is just "Ready for the bill?".
- **After C2's live-key cutover** (`SURFACES.dineInPhonePay` → true): today's Bill returns verbatim.

### COPY (English)

- Morning Star
- Table 4
- Your bill
- Order · Bill · Pay
- Back to your order
- Ready for the bill? The counter takes cash.
- [only when counterTakesCard()] Ready for the bill?
- 2 × Mohinga · Served · $28.00
- Pickled Tea Salad · Served · $14.00
- Subtotal · $42.00
- Sales tax · $4.41
- Total · $46.41
- Promo code
- Apply
- Pay at the counter
- [states] One moment…
- [states] Pay opens when the undo window closes.
- [states] The counter is taking your table’s payment right now — this screen updates when it’s done.
- [states] Couldn’t reach the counter just now — please try again.
- [states] Nothing to pay yet — add something first.
- [states] Not sent yet
- [states] You can still ask — the counter will check them with your table.
- [states, host only] Back to send them
- Menu · Order · Account

### COPY (Burmese) — shipped or briefed drafts only

- **သင့်ဘောက်ချာ.** SHIPPED, cart.ts:21 `yourBill`.
- **သင့်အော်ဒါဆီ ပြန်သွားမယ်.** SHIPPED, cart.ts:55 `backToYourOrder`.
- **ဘောက်ချာ ရှင်းဖို့ အသင့်ဖြစ်ပြီလား?** DRAFT, guided "Ready for the bill?" (brief-m2.md:274).
- **ကောင်တာမှာ ငွေသားနဲ့ ရှင်းလို့ ရပါတယ်။** DRAFT, glanceable "The counter takes cash." (m2.json →
  concepts[2].screens[0].copy_my[0]). It sits on the same MY line, after the question.
- **မုန့်ဟင်းခါး, လက်ဖက်သုပ်.** Menu data, docs/data/menu_catalog.json `name_my`.
- **အကြိုစုစုပေါင်း · ရောင်းခွန် · စုစုပေါင်း.** SHIPPED, cart.ts:87, 91, 93.
- **ပရိုမို ကုဒ် · သုံးမယ်.** SHIPPED, cart.ts:81, 82.
- **ကောင်တာမှာ ရှင်းမယ်.** SHIPPED, cart.ts:99 `payAtCounter`.
- **[state] ပြန်ပြင်လို့ရတဲ့ အချိန် ကုန်သွားတာနဲ့ ရှင်းလို့ ရပါမယ်.** SHIPPED, cart.ts:48-51
  `payOpensAfterUndo`.
- **[state] ကောင်တာက သင့်စားပွဲရဲ့ ငွေကို အခု လက်ခံနေပါတယ် — ပြီးတာနဲ့ ဒီစခရင် ပြောင်းသွားပါမယ်.**
  DRAFT, guided (brief-m2.md:280).
- **[state] မပို့ရသေး.** SHIPPED, staff.ts:2802 `table.line.notSent` (K15-HIGH).
- **[state] တောင်းလို့ ရပါသေးတယ် — ကောင်တာက စားပွဲနဲ့ စစ်ပေးပါမယ်.** DRAFT, guided (m2.json →
  concepts[1].screens[1].copy_my[2]).
- **[state] ပြန်သွားပြီး ပို့မယ်.** DRAFT, quiet "Back to send them" (brief-m2.md:126).
- **English only (no MY exists, none invented):**
  - "One moment…" (PayAtCounter.tsx:60);
  - "Couldn’t reach the counter just now — please try again." (Checkout.tsx:1992);
  - "Nothing to pay yet — add something first." (counter-pay-state.ts:57);
  - "Served" (line-state-copy.ts:16);
  - the rail labels (checkout-steps.ts:39).

### A11Y

- **Live region:** ONE, the review step's existing `<p role="status" aria-atomic>`
  (Checkout.tsx:4189). The sentence and the slip are static. No new aria-live.
- **Focus:** on the Order→Bill flip, focus goes to the h1 (existing). A withdraw from screen 2 also
  lands on the h1 "Your bill".
- **The door:**
  - A real `<button>`. Its name is the visible label: "Pay at the counter", then the MY in a
    `lang="my"` span. The glyph and arrow are aria-hidden.
  - Held states use `aria-disabled`, never native `disabled`, plus `aria-describedby` to its one
    reason; every blocked tap re-says that reason in the region.
  - Busy uses `aria-busy` and the word "One moment…" at full ink.
  - It is 64px tall and 366 wide.
- **Slip:** BillLines keeps `role="list"` and its name. The dotted leaders and the photo boxes are
  aria-hidden.
- **Rail:** `<ol role="list" aria-label="Checkout steps">`, with `aria-current="step"` on Bill and sr
  " — done" / " — next" (Checkout.tsx:2726-2745).
- **Targets:** back link 44, door 64, promo input 48, Apply 44+, tabs 44.
- **Motion:**
  - The door's sheen sweep and arrow nudge are hover-only, under the CTA's existing RM block.
  - The dock has no entrance animation.
  - NumberFlow snaps under reduced motion.
- **Bilingual:** every MY run is `lang="my"`, Padauk 400/700, lh 1.6, ≥13px. Money and table numbers
  are Latin digits.

### CODE CHECK (claims this screen depends on)

- **The eyebrow, h1 + MY, rail, back link, slip, promo, tip, total row, Pay hero, ghost counter
  door and region all exist where cited:**
  - eyebrow Checkout.tsx:2713;
  - h1 + MY Checkout.tsx:2717-2722;
  - rail Checkout.tsx:2726-2745;
  - back link Checkout.tsx:2890-2902;
  - slip Checkout.tsx:3357-3373;
  - promo Checkout.tsx:3390;
  - tip Checkout.tsx:3630;
  - total row Checkout.tsx:3836-3874;
  - Pay hero Checkout.tsx:4023-4087;
  - ghost counter door Checkout.tsx:4097-4118;
  - region Checkout.tsx:4189.
- **"Pay at the counter" is today's ghost** (`.checkout-cta-ghost`, PayAtCounter.tsx:39-68). It
  becomes the docked filled door.
- **`SURFACES` has no dine-in phone-pay switch yet** (surfaces.ts:54-59). The NEW
  `dineInPhonePay: false` follows the file's own rule: "Read these where the door is DRAWN and where
  it is ANSWERED" (surfaces.ts:19-23).
  - Drawn: Checkout's Pay hero, tip and total row.
  - Answered: create-intent refuses dine-in once the session mode is read
    (app/api/stripe/create-intent/route.ts:147-157, beside its unsent refusal at :214).
- **The tip preview is already 0 under an ask** (Checkout.tsx:2657). The condition widens to "or
  dine-in phone pay parked". The default `tipRate` is 0 (Checkout.tsx:391).
- **Tender truth:** `COUNTER_TENDERS` already lists `"terminal"` (counter-tender.ts:6), so it cannot
  drive a cash-only line. The NEW `counterTakesCard(readerConfigured)` reads the same env the staff
  page uses (`Boolean(process.env.STRIPE_TERMINAL_READER_ID)`, app/staff/page.tsx:259) OR a parked
  `SURFACES.counterCardOutsideApp` (false: ruling #11's cash default, OWNER_RULINGS_2026-10-07.md:58;
  #26, no reader).
- **The ask over drafts:** today it is refused by `counterPayRefusal`'s `unsent` arm
  (counter-pay-state.ts:48), fed by `payBlockedByUnsent` (counter-pay.ts:89-95). That read already
  fails OPEN, because the money doors refuse on their own (counter-pay.ts:69-75). Lifting the arm
  moves no money.
- **The settling sentence it replaces is false while split is parked:** counter-pay-state.ts:55
  ("The table’s splitting the bill right now…") against surfaces.ts:55 (`selfServeSplit: false`). Key
  the new one on `surfaceOpen('selfServeSplit')` (surfaces.ts:64).
- **The dock slot exists** (CartBar.tsx:115-121, the menu's fixed bar). `--tap-bump: 64px` exists
  (tokens.css:25).
- **No count on a shared cart** (DESIGN-LANGUAGE.md:1917-1919). Today's unsent note counts ("2 items
  haven’t gone…", Checkout.tsx:3290-3292), so the refined note drops the count.

---

## SCREEN picked-m2-2.dc.html — The counter pass (every phone at the table, after the ask)

- **Device:** phone 390×844.
- **Theme:** light. Night swaps tokens only:
  - pass #2b213c, numeral #f3ecdf, notches #100c19;
  - the torn foot follows --cd.
- **Who:** EVERY phone at the table on the Bill stage, the asker's and the tablemates' alike. The
  stamp carries no "who", so the screen names nobody. Drawn state: the ask is live, everything is
  sent, and the register hasn't started.

### LAYOUT

- **0–47:** empty ground.
- **47–103: AppHeader**, as screen 1.
- **(no eyebrow):** the page's "Table 4" eyebrow is not drawn while the pass shows. The stub IS the
  table, so it is named once on the surface.
- **127–176: h1 "Pay at the counter"**. Fraunces 26/600, lh 1.08, --tx. "ကောင်တာမှာ ရှင်းလိုက်ပါ" sits
  inside the h1 as a block: Padauk 13, weight 700 (the artboard's nearest to the shipped 600), lh
  1.6, --t2. This is the `counterTitle` pair, cart.ts:100. Focus target (tabIndex -1).
- **184–204: step rail**:
  - Order (done): --ok check;
  - Bill (done): --ok check;
  - Pay (current): filled --ac disc with "3" in --oa, label --ac-strong, `aria-current="step"`.
  - The ask IS the paying step, and paying happens at the counter.
- **(no back link):** the one way back is the quiet link at the end. The tab bar's Menu still adds
  dishes, and their prices join the total.
- **220–306: THE ONE SENTENCE**, the next step said once:
  - EN, 15/700, lh 22, --tx, two lines: "Show this to whoever’s at the register — they take cash."
  - MY, Padauk 13/400, lh 1.6, --t2, two lines.
- **320–635: THE PASS.** One `<section>`, 350 wide, built from the app's thermal-receipt paper
  (globals.css:740-788):
  - **Body:** `.card.card-textured.receipt-slip-body`, radius 20 on the top corners only, no bottom
    border, padding 20 20 0, card dots, --sh-paper.
  - **Entrance:** `.mms-rise` on its first mount on the asking phone only (--dur-slow; RM none,
    globals.css:1079-1087).
  - **Stub, 340–457, centred:**
    - **ONE text run "Table 4"** on a shared baseline:
      - "Table": Hanken 21px (--fs-h2) / 700, --t2;
      - a normal space;
      - "4": Fraunces 88px, weight 600, lh 1, tracking -0.02em, tabular, --tx.
      - 88px is the NEW token `--fs-pass: 5.5rem`, defined in packages/ui/src/tokens.css.
    - **"စားပွဲ 4"** beneath: Padauk 17px (--fs-h3) / 700, lh 1.6, --t2.
  - **Seam, 473–489 (16 tall):**
    - a 1.5px dashed --bd rule, inset 16 from each side, at y 481;
    - two 12px circles filled --pg #faf9f5, centred on the card's left and right edges at y 481
      (offset -7px; the `.reward-coupon` notch recipe, globals.css:4029-4042);
    - all aria-hidden.
  - **Total, 505–564, centred:**
    - label row 13/700 --t2: "Total", an aria-hidden "·", then "စုစုပေါင်း" (13px Padauk);
    - beneath it "$46.41" in Fraunces 36px (--fs-display at 390), weight 800, lh 1.08, tabular,
      --tx. It is a NumberFlow of the server's `totals.totalCents`, the same figure as screen 1's
      foot.
  - **Disclosure, 580–624:** a full-width `<button>` row, 44px, with a 1px --bd rule above, padding
    0 20, flex space-between:
    - left: "View bill" 14/700 --t2, with "ဘောက်ချာ ကြည့်မယ်" inline at 13px --t3 after a 0.4em
      margin;
    - right: a chevron-down 16px --t3, aria-hidden;
    - `aria-expanded="false"`. Closed by default; open, it shows today's BillLines + rows inside the
      body.
  - **Torn foot, 624–635:** the shipped `.receipt-tear` (globals.css:775-788). An 11px --cd strip
    whose top edge is punched with 6px half-circles every 20px. Borderless, as torn paper is.
- **651–695: "We’re not done yet"**, the quiet withdraw, LAST:
  - `.nav-link`, 44px, 14px/700 --ac;
  - "မပြီးသေးဘူးနော်" inline at 13px --t3.
- **750–844: diner tab bar**, Order current, no count.

**NOTHING ELSE is drawn:**

- no filled button and no card door;
- no tip, promo or reward;
- no second total;
- no "keep ordering" sentence (the live total tells that truth);
- no ①②③ list;
- no rotation or full-screen mode.

### STATES

- **Own ask:**
  - The stamp flips instantly, and only the stamp. Amounts are never optimistic: the total is the
    last server read.
  - Focus moves to the h1.
  - The region says today's sentence once: "We’ll pay at the counter — show them this screen
    whenever you’re ready."
- **A tablemate's ask lands** (on the cart channel, Checkout.tsx:619):
  - This phone's Bill flips to the pass as a view flip; it is not an insertion above the receipt,
    so nothing relies on iOS scroll anchoring.
  - The region says "Your table asked to pay at the counter." once, on the null→stamp edge.
  - Focus moves to the h1 only if it sat on a control that unmounted (the dock or the promo field).
  - A phone on the Order stage stays there. It hears the sentence, and its receipt-foot door
    already reads "View bill" (`billDoorLabel`, checkout-verb.ts:71-76).
- **A dish added after the ask:** the total rolls on the next server read, and only then.
- **Unsent dishes:**
  - A count-free dashed tag is added inside the pass under the total: 32px, 1.5px dashed --warn,
    radius 999, 13/700 --warn, reading "Not sent yet · မပို့ရသေး".
  - The pass grows 44px. Dad has read the same on his floor before walking over.
- **The register is mid-settle:** the one-sentence slot swaps to "The counter is taking your table’s
  payment right now — this screen updates when it’s done." It is static text, not announced. The
  withdraw link stays live, as today's withdraw never waits on a freeze (counter-pay.ts:129-137).
- **Withdraw:**
  - Optimistic: every phone flips back to screen 1.
  - Focus goes to the h1 "Your bill".
  - The region says "No rush — your bill’s here when you’re ready." This replaces today's "Back to
    paying here — pick a tip and tap Pay when you’re ready." (Checkout.tsx:2021), which names a tip
    and a Pay that are parked.
  - Busy shows "One moment…" at full ink. On failure the phone stays on the pass and the region
    says "Couldn’t reach the counter just now — please try again." (Checkout.tsx:2025).
- **Settled at the register:** the phone leaves through today's path (Checkout.tsx:700-720).
  - A seat that may see the order goes to /track?…&paid=1.
  - Otherwise `CounterSettledCard` shows, titled with the shipped `counterSettledTitle` pair: "All paid — thank you!" / "ရှင်းပြီးပါပြီ — ကျေးဇူးတင်ပါတယ်" (`PayAtCounter.tsx:148`; `cart.ts:113`).
  - The post-pay screen itself is post-pay's moment.
- **No table number:** the stub reads "Your table" (PayAtCounter.tsx:87) in Fraunces 26/600, with no
  numeral and no MY line.
- **A failed read:** keep the last good pass and make no claim.
- **`counterTakesCard()` true:** the sentence is the shipped `counterBody` verbatim (cart.ts:101-104).
- **Night:** as noted.
- **Reduced motion:** no rise; NumberFlow snaps.

### COPY (English)

- Morning Star
- Pay at the counter
- Order · Bill · Pay
- Show this to whoever’s at the register — they take cash.
- [only when counterTakesCard()] Show this to whoever’s at the register — cash or card, either works.
- Table 4
- [no table number] Your table
- Total
- $46.41
- View bill
- We’re not done yet
- [aria-label] We’re not done yet — cancel paying at the counter
- [state] Not sent yet
- [state] The counter is taking your table’s payment right now — this screen updates when it’s done.
- [region, own ask] We’ll pay at the counter — show them this screen whenever you’re ready.
- [region, a tablemate’s ask] Your table asked to pay at the counter.
- [region, withdraw] No rush — your bill’s here when you’re ready.
- [region, failure] Couldn’t reach the counter just now — please try again.
- [busy] One moment…
- Menu · Order · Account

### COPY (Burmese) — shipped or briefed drafts only

- **ကောင်တာမှာ ရှင်းလိုက်ပါ.** SHIPPED, cart.ts:100 `counterTitle`.
- **ကောင်တာက ဝန်ထမ်းကို ဒါလေး ပြလိုက်ပါ — ငွေသားနဲ့ ရှင်းလို့ ရပါတယ်.** DRAFT, glanceable
  (brief-m2.md:439). Its first clause is the shipped `counterBody` MY's first clause (cart.ts:103).
- **[card admitted] ကောင်တာက ဝန်ထမ်းကို ဒါလေး ပြလိုက်ပါ — ငွေသားပဲဖြစ်ဖြစ် ကတ်ပဲဖြစ်ဖြစ် ရပါတယ်.**
  SHIPPED, cart.ts:103.
- **စားပွဲ 4.** SHIPPED word, staff.ts:402 `floor.table` "စားပွဲ {id}" (table numbers stay Latin, fill.ts).
- **စုစုပေါင်း.** SHIPPED, cart.ts:93.
- **ဘောက်ချာ ကြည့်မယ်.** SHIPPED, cart.ts:44 `viewBill`.
- **မပြီးသေးဘူးနော်.** DRAFT, quiet (brief-m2.md:178).
- **[state] မပို့ရသေး.** SHIPPED, staff.ts:2802.
- **[state] ကောင်တာက သင့်စားပွဲရဲ့ ငွေကို အခု လက်ခံနေပါတယ် — ပြီးတာနဲ့ ဒီစခရင် ပြောင်းသွားပါမယ်.**
  DRAFT, guided (brief-m2.md:280).
- **[region] သင့်စားပွဲက ကောင်တာမှာ ရှင်းမယ်လို့ ပြောထားပါတယ်.** DRAFT (brief-m2.md:180 and :334).
- **[region] အေးဆေးပါ — အဆင်သင့်ဖြစ်ရင် ဘောက်ချာ ဒီမှာ ရှိပါတယ်.** DRAFT, quiet (brief-m2.md:181).
- **[settled, not drawn] ရှင်းပြီးပါပြီ။ ကျေးဇူးပါ.** SHIPPED, cart.ts:133 `paidThankYou`.
- **English only (no MY exists):**
  - "We’ll pay at the counter — show them this screen whenever you’re ready." (Checkout.tsx:1988);
  - "Your table" (PayAtCounter.tsx:87);
  - "One moment…";
  - the failure sentence;
  - the withdraw's accessible-name suffix.

### A11Y

- **Live region:** ONE, the same status `<p>` (Checkout.tsx:4189).
  - While the pass shows, its confirmations (own ask, remote ask) are visually hidden. The pass is
    the visible confirmation, so drawing the sentence would say one fact twice.
  - Refusals and errors render visibly in --warn, as today. No new aria-live; the pass is not a
    status.
- **Landmarks and names:**
  - The pass is `<section aria-labelledby="pass-table pass-total">`, so a screen reader hears
    "Table 4 … Total $46.41".
  - The stub's "Table 4" is ONE text run (the size split is CSS on spans, in reading order).
  - The seam, the notches, the torn foot and the chevron are aria-hidden.
- **Disclosure:** `aria-expanded` + `aria-controls="pass-bill"`. Focus stays on the toggle (WAI
  disclosure). BillLines inside keeps `role="list"`.
- **Withdraw:** a `<button class="nav-link">` named "We’re not done yet — cancel paying at the
  counter". The visible label comes first (WCAG 2.5.3). It is 44px.
- **Focus:**
  - Own ask → h1 "Pay at the counter".
  - Remote ask → h1 only if focus was lost with an unmounted control.
  - Withdraw → h1 "Your bill".
  - Settled → today's close or route behaviour.
- **Forced colours:** the notches hide, the seam stays a CanvasText dashed border, and the tear's
  mask drops to a 1px solid rule. The words carry the meaning.
- **Contrast:** "Table" --t2 on --cd (#6e6358 on #fffdf8) passes 4.5:1. The 88px numeral and the 36px
  total are --tx.
- **Motion:** one `.mms-rise` on the asking phone only; RM none.

### CODE CHECK

- **The ask is a state, every phone agrees:**
  - `counterAt` comes from every view read (Checkout.tsx:619);
  - `counterAsk = showPayFurniture && counterAt != null` (Checkout.tsx:2674);
  - the card replaces the pay controls (Checkout.tsx:2675 and 4119-4126).
- **The first stamp is kept**, so a re-ask never resets the age (counter-pay.ts:101-111). Withdraw
  nulls it (counter-pay.ts:137).
- **The pass total is `totals.totalCents`** (Checkout.tsx:4122), from `getCartTotals(id)` with
  tipRate 0 (cart.ts:774; totals.ts:33). Dad reads the same function at tipRate 0 (floor.ts:997-1004).
- **The settled handoff exists:** `counterPayOutcome` → /track or `setSettledClose`
  (Checkout.tsx:700-720).
- **Today's withdraw label is a parked door:** `payOnPhoneInstead` (PayAtCounter.tsx:123;
  cart.ts:109). It returns only when `dineInPhonePay` does.
- **`checkoutSteps` has no ask input today** (checkout-steps.ts:20-45). It gains `counterAsk` to make
  Pay current, outside money coverage per T47.
- **The torn foot exists:** `.receipt-tear` (globals.css:775-788). So do the coupon notches
  (globals.css:4029-4042), `.mms-rise` with its RM gate (globals.css:1079-1087) and `--fs-display`
  (tokens.css:38).
- **`--fs-pass` is the one new token.** Custom-property DEFINITIONS are not counted by the
  style-literal ratchet, and tokens.css is excluded (scripts/check-style-literals.mjs:15-17, 47),
  so `check:style-literals` does not rise.

---

## SCREEN picked-m2-3.dc.html — Dad's counter: the asked table, its age, the same total, one hero

- **Device:** tablet 1366×1024.
- **Theme:** light. The counter tablet follows the OS; it is not Night-forced.
- **Who:** Dad at the register. The counter screen `/staff?floor=1` is in its desktop split: the
  floor on the left, Table 4 open in the pane (floor-pane.ts:20-24; globals.css:14664-14720).
  Device language "Both": Burmese first, the English echo where today's `<Chrome>` call draws one.
  Drawn state: Table 4 asked 4 minutes ago, everything is sent, the total is $46.41, and Dad has
  tapped the card.

### LAYOUT

**0–84: StaffBar**, unchanged. #faf9f5, 1px --bd bottom, padding 10 20, flex.

- Left: the Screens circle, 44×44 (`aria-label` "Screens").
- Title stack: "ကောင်တာနဲ့ စားပွဲများ", Padauk 30/700 (globals.css:10809), with the echo "Counter &
  tables" 13/600 --t2 beneath.
- Right: today's Help circle (gold ring) and Lock circle, each 44×44.
- Draw it as in m7-glance-1.dc.html's header.

**84–1024: the split grid**, padding 0 20, columns 838 | 464 (`--w-staff-pane` = clamp(22rem, 34vw,
34rem) → 464), column gap 24.

**MAIN COLUMN, x 20–858** (the floor, unchanged except where marked NEW):

- **84–144:** today's sticky zone-chip strip (44px pills). Draw it as m7-glance-1.
- **160–198:** the strip label. "စားပွဲများ — လွတ်နေတဲ့ စားပွဲကို နှိပ်ပြီး ဖွင့်ပါ" Padauk 15/700, with
  the echo "Tables — tap a free one to start it" 13/600 --t2.
- **206–270: the table strip**, 10 tiles in a 10-column grid with a gap of 8, each 64 tall, radius 12:
  - **Tile 4 is the room's ONE filled tile.** Bg --warnb #f6e9e4, a 4px --warn bottom bar, the
    receipt glyph in --warn, and "4" at 26/800 tabular (globals.css:14424-14426, 14437-14443).
  - Tile 2 is live: cart glyph, --ac bar.
  - Tile 7 is done: check glyph, --ok bar.
  - The rest are free tiles: 2px dashed --t2 border, the number, and "ဖွင့်" (Start).
- **278–298:** today's strip key (aria-hidden), as drawn in m7-glance-1.
- **322–350:** h2 "စားပွဲများနဲ့ ကောင်တာ အော်ဒါများ" Padauk 17/700, with the echo "Tables & counter
  orders" 13/600 --t2 inline.
- **362–: the card grid**, 2 columns of 413, gap 12, `role="list"`. The asked table sorts FIRST,
  longest wait on top (floor.ts:539-540).
  - **Table 4: the asked card, selected (362–504).** A `.card.card-textured.floor-card`, padding
    16 20, with a 4px --warn status edge rail down its left (`.floor-edge[data-tone=ask]`,
    globals.css:14463-14468):
    - **Row 1:**
      - Left: "စားပွဲ 4" Padauk 21/700. It wears today's lit selection cap on the name: it is
        selected in the pane, `aria-current="true"`.
      - Right: the FloorStatusChip, a 32px pill with a warn border and warn ink, 13/700, reading
        "ကောင်တာမှာ ရှင်းမယ် · ၄ မိနစ်". NEW: the ask's age is appended from the row's own
        `counterRequestedAt`.
    - **Row 2,** meta 13 --t2: "ဆိုင်မှာ စား · ၂ ယောက် · Thiri".
    - **Row 3:** today's kitchen line. Nothing is owed, so there is no not-sent segment.
    - **Row 4:**
      - Left: NEW, nothing. The pre-tax "so far" money is HIDDEN on an asked card, because it
        would sit beside a guest holding up a different, tax-inclusive figure.
      - Right: "ဖွင့်တာ ၅၂ မိနစ်က" 13 --t3.
  - **Table 2 (context, as today):**
    - status "မှာနေဆဲ";
    - meta "ဆိုင်မှာ စား · ၃ ယောက် · Aye";
    - kitchen "မီးဖိုချောင်မှာ ၂ ခု";
    - "$31.50 ယခုအထိ · ပစ္စည်း ၃ ခု";
    - "ဖွင့်တာ ၂၅ မိနစ်က";
    - --ac edge.
  - **Table 7 (context, as today):** status "ငွေရှင်းပြီး" (ok tone), "$52.80 ငွေရှင်းပြီး", no edge
    rail.

**PANE, x 882–1346** (border-inline-start 1px --bd, padding-inline 24 | 8, sticky at top 100, its own
scroller; content x 907–1338 = 431 wide):

- **100–160: pane head** (`.staff-pane-head`, min-height 60, 1px --bd bottom, opaque --pg):
  - h2 "စားပွဲ 4": Padauk 26/700, lh 1.6, focus target on open (TablePane.tsx:396-425).
  - The ✕ close circle, 44×44, with sr "ပိတ်" (Close).
- **176–470: THE ASK PASS (NEW: today's ask card, moved to the top of the detail and given the guest
  pass's paper).** A `<section aria-labelledby="counter-ask-h">`, `.card.card-textured.receipt-slip-body`,
  431 wide, padding 20 20 0, with the `.receipt-tear` foot:
  - **196–248:**
    - the receipt glyph 20px --warn (aria-hidden);
    - `p#counter-ask-h`: "ကောင်တာမှာ ငွေရှင်းချင်ပါတယ်" Padauk 21/700 (--fs-h2), lh 1.6, --tx;
    - the echo "They’d like to pay here at the counter" stacked beneath, 13/600 --t2.
  - **254–278:** "တောင်းဆိုတာ ၄ မိနစ်က", 15/700 (--fs-lead) --t2. Today's
    `counterAsked` + `RelativeTime`. It has no echo, as today (FloorDetailLive.tsx:1475-1476).
  - **290–306: the seam,** the guest pass's twin: a 1.5px dashed --bd rule inset 16, and two 12px
    notch circles in --pg on the edges. Aria-hidden.
  - **318–386: total, centred:**
    - a label row 13/700 --t2: "စုစုပေါင်း · Total" (`floor.settled.row.total`, echo inline);
    - "$46.41": Fraunces 44px (--fs-display at 1366), weight 800, lh 1.08, tabular, --tx.
    - This is `detail.settleTotalCents`, the SAME `getCartTotals` figure on the guest's pass.
  - **398–443: NEXT line** (static text, not a control, not a region):
    - "နောက်တစ်ဆင့် — ငွေသား $46.41 လက်ခံပါ။" Padauk 17/700 (--fs-h3), lh 1.6, --tx;
    - the echo "Next: take $46.41 in cash." 13/600 --t2.
  - **459–470:** the torn foot, `.receipt-tear` (11px).
- **486–640: today's order card**, unchanged except as marked:
  - h3 "ယခုအထိ အော်ဒါ" and the "+ ပစ္စည်း ထည့် · + Add items" link;
  - two line rows: "2 × Mohinga" $28.00 and "Pickled Tea Salad" $14.00, each tagged "ထုတ်ပြီး" Served;
  - NEW: the "subtotal so far" row and the pre-tax note (FloorDetailLive.tsx:1249, 1299) are not
    drawn on an asked table. The pass carries the one figure at the till.
- **656–712:** today's staff promo control, unchanged. It stays BEFORE the settle: a discount is the
  last thing that changes.
- **728–946: today's settle section** (`section.staff-settle`, FloorDetailLive.tsx:1496-1610), in
  place:
  - **728–758:** heading "ငွေရှင်း" (`table.detail.settle.title`, no echo; focus target for
    `?settle=1`).
  - **770–834: THE ONE HERO.** CashSettleButton: the @mms/ui Button primary, xl (64 = --tap-bump),
    block 431, pill. Gradient #a65f10→#8f5009, ink #fffdf8. Label stack:
    - "ငွေသားနဲ့ ရှင်း · $46.41", Padauk 17/700 (the xl button's --fs-h3);
    - the echo "Take cash · $46.41", 13/600 in the button's ink.
  - **842–878:** today's hint (`#settle-hint`, 13 --t2, stacked): "ရောင်းခွန် ပါဝင်ပါတယ်။ ငွေသား
    အပိုကြေးကို နောက်တစ်ဆင့်မှာ ထည့်ပါ။" / "Includes sales tax. Add a cash tip in the next step."
  - **886–946: NEW cash-only line**, 13 --t2, stacked: the MY "ဧည့်သည် ဖုန်းကနေ ကတ်နဲ့ ရှင်းတာ
    မဖွင့်ရသေးပါ၊ ကတ်စက်လည်း မရှိသေးပါ — ငွေသား ယူပါ။", then the echo "Card on the guest’s phone
    isn’t switched on yet, and there’s no card reader — take cash."
- **Pane bottom:** today's reserve for the lane's thumb-zone pill (globals.css:14709-14711).

### STATES

- **Unsent dishes:**
  - The floor card's kitchen row adds "၂ ခု မပို့ရသေး" in --warn bold (ruling #15 · P2do).
  - The pane's Next line becomes "Next: check the {n} not sent with the table."
  - The lines carry P2z's "Not sent · {n} min" with today's StaffSendButton and today's
    `counterAskNote`.
  - Take cash is `aria-disabled` at 0.55, with today's unsent note as its one reason. Every blocked
    tap re-says it in the page's one region.
- **Taking cash:**
  - Today's K29 sheet opens: "Take cash", "Take $46.41 in cash?", the optional cash tip, cash
    received.
  - The trigger then reads "Taking payment…" (busy, full ink).
  - Every guest phone shows the settling sentence.
- **Settled:**
  - Today's HandoffCard is focused. Its hero is "ကောင်တာကို ပြန်သွား / Back to the counter"
    (staff.ts:3097; the moment-6 default).
  - The pass unmounts, and the floor card turns Paid.
- **The guest withdraws:** the pass and the Next line unmount on the next read. The settle controls
  stay, as on any table (FloorDetailLive.tsx:1464-1467). Nothing auto-reverses.
- **A dish awaits a manager's approval:** moment 8's warning sits above the hero. Take cash stays
  LIVE (owner answer 4); a later approval becomes a refund. Moment 8 draws it, not this screen.
- **A reader is configured, or the owner names an outside-app card** (`counterTakesCard()`):
  - The Next line and the cash-only line are not drawn.
  - The reader's secondary trigger returns (FloorDetailLive.tsx:1557-1587).
- **English-only device:** the echoes lead. **Burmese-only device:** the echoes drop, except the
  K15-HIGH words.
- **Stale view, or a read outage:** today's shapes (the "changed since you opened it" line; the
  outage shell).
- **Status change:** today's one-shot `.floor-card-pulse` ring, with an RM off-switch.

### COPY (English) — the echoes as today's `<Chrome>` calls draw them

- Counter & tables
- Tables — tap a free one to start it
- Tables & counter orders
- [floor card, English device] Table 4 · Pay at counter · 4 min · Dine-in · party of 2 · Thiri ·
  Opened 52m ago
- [pane head, English device] Table 4
- They’d like to pay here at the counter
- [English device] asked 4m ago
- Total
- $46.41
- Next: take $46.41 in cash.
- [unsent] Next: check the {n} not sent with the table.
- [English device] Order so far · + Add items
- 2 × Mohinga · Served · $28.00
- Pickled Tea Salad · Served · $14.00
- [English device] Take payment
- Take cash · $46.41
- Includes sales tax. Add a cash tip in the next step.
- Card on the guest’s phone isn’t switched on yet, and there’s no card reader — take cash.
- [sr] Close
- [sheet, today's] Take cash · Take $46.41 in cash?
- [after settle, today's] Back to the counter

### COPY (Burmese) — shipped or briefed drafts only

**Bar and floor:**

- ကောင်တာနဲ့ စားပွဲများ: SHIPPED, staff.ts:977 `floor.door.counter`.
- စားပွဲများ — လွတ်နေတဲ့ စားပွဲကို နှိပ်ပြီး ဖွင့်ပါ: SHIPPED, staff.ts:3241-3244.
- ဖွင့်: SHIPPED, staff.ts:3256 `floor.verb.start`.
- စားပွဲများနဲ့ ကောင်တာ အော်ဒါများ: SHIPPED, staff.ts:1011.
- စားပွဲ 4: SHIPPED, staff.ts:402.
- ကောင်တာမှာ ရှင်းမယ်: SHIPPED, staff.ts:397 `floor.status.counter`.
- ၄ မိနစ်: SHIPPED, staff.ts:3266 `floor.kitchen.wait`. Counts take Burmese numerals under `my`
  (fill.ts:5-8).
- ဆိုင်မှာ စား: SHIPPED, staff.ts:439.
- ၂ ယောက်: SHIPPED, staff.ts:413.
- ဖွင့်တာ ၅၂ မိနစ်က: SHIPPED, staff.ts:3290 + 717 (RelativeTime.tsx:15).
- မှာနေဆဲ: SHIPPED, staff.ts:391.
- ငွေရှင်းပြီး: SHIPPED, staff.ts:394.
- ယခုအထိ · ပစ္စည်း ၃ ခု: SHIPPED, staff.ts:420 + 415.
- မီးဖိုချောင်မှာ ၂ ခု: SHIPPED, staff.ts:3261.
- ၂ ခု မပို့ရသေး: SHIPPED, staff.ts:3260.

**Pane:**

- ကောင်တာမှာ ငွေရှင်းချင်ပါတယ်: SHIPPED, staff.ts:700-703.
- တောင်းဆိုတာ: SHIPPED, staff.ts:704.
- စုစုပေါင်း: SHIPPED, staff.ts:1112.
- နောက်တစ်ဆင့် — ငွေသား {m} လက်ခံပါ။: DRAFT, guided K15-HIGH (m2.json → concepts[1].screens[5].copy_my[2]).
- [unsent] နောက်တစ်ဆင့် — မပို့ရသေးတဲ့ {n} ခုကို စားပွဲနဲ့ စစ်ပါ။: DRAFT, guided (same source,
  copy_my[1]).
- ယခုအထိ အော်ဒါ: SHIPPED, staff.ts:761.
- - ပစ္စည်း ထည့်: SHIPPED, staff.ts:779.
- ထုတ်ပြီး: SHIPPED, staff.ts:2805.
- ငွေရှင်း: SHIPPED, staff.ts:3061.
- ငွေသားနဲ့ ရှင်း · {m}: SHIPPED, staff.ts:1708.
- ရောင်းခွန် ပါဝင်ပါတယ်။ ငွေသား အပိုကြေးကို နောက်တစ်ဆင့်မှာ ထည့်ပါ။: SHIPPED, staff.ts:1721-1724.
- ဧည့်သည် ဖုန်းကနေ ကတ်နဲ့ ရှင်းတာ မဖွင့်ရသေးပါ၊ ကတ်စက်လည်း မရှိသေးပါ — ငွေသား ယူပါ။: DRAFT, guided
  K15-HIGH (m2.json → concepts[1].screens[5].copy_my[6]).
- ပိတ်: SHIPPED, staff.ts:69.
- ကောင်တာကို ပြန်သွား: SHIPPED, staff.ts:3097.

**English only:** "Thiri" and "Aye" (guest names, verbatim).

### A11Y

- **Live region:** ONE per view, today's. The floor board owns one region; the detail owns its order
  card's polite region (FloorDetailLive.tsx:1333-1351, the P2r rule).
  - The pass, the Next line and the cash-only line are static text.
  - The hint is a description, not a status (CashSettleButton.tsx:979-994).
- **The floor card:**
  - It is ONE link, a ≥44px target.
  - Its composed name (`al()`, lib/staff-labels.ts:239) gains the ask's age beside the status, read
    from the same keys the chip renders (the P2g one-key rule), so a screen reader hears what the
    eye sees.
  - `aria-current="true"` while it is open in the pane.
- **Pane:**
  - A `<section aria-labelledby="table-pane-h">`; on open, focus goes to its h2 (existing).
  - The pass is `aria-labelledby="counter-ask-h"` (existing id).
  - The seam, the notches, the torn foot and every glyph are aria-hidden.
- **Hero:** @mms/ui Button xl, a real `<button>`. Its name is the stacked label. Held states use
  `aria-disabled` + `aria-describedby` (the unsent note, then `settle-hint`), never native
  `disabled`. Busy uses `aria-busy` with "Taking payment…".
- **Targets:** every control ≥44 (circles 44×44, strip tiles 64, hero 64, close 44).
- **Colour is never alone:**
  - asked = receipt glyph + edge rail + the words;
  - not sent = the dashed mark (diner) or the words in --warn (staff).
- **Motion:**
  - The pane body's `.mms-rise` and the card's pulse are RM-gated.
  - Nothing loops, and no age escalates its colour: there is no "late" rule for an ask (in the
    spirit of ruling #15).
- **Bilingual:**
  - Burmese first, Padauk 400/700 only, lh 1.6, ≥13px.
  - Money ({m}) and table numbers ({id}) are Latin.
  - Prose counts ({n}) take Burmese numerals under `my` (fill.ts:5-8).

### CODE CHECK

- **The ask card is drawn below the order and promo today** (FloorDetailLive.tsx:1464-1479, after
  the order card and promo). Its render condition is `detail.counterRequestedAt &&
detail.itemCount > 0`. The refined pane moves only this card to the top.
- **The settle section and its hero exist:**
  - CashSettleButton, xl and block (CashSettleButton.tsx:589-643);
  - its label `settle.cash.trigger` (staff.ts:1708);
  - its hint (CashSettleButton.tsx:986-994).
- **`settleTotalCents` is on the DETAIL only, never the floor hot path** (floor-types.ts:219,
  224-232). Hence the floor card hides its pre-tax "so far" (TableCard.tsx:200-214) rather than
  showing a total it doesn't have.
- **The detail's total is `getCartTotals(cart.id, 0)`** (floor.ts:997-1004). The diner's is
  `getCartTotals(id)` with default tip 0 (cart.ts:774; totals.ts:33). One test over a promo'd cart
  pins that both are equal.
- **The floor row carries `counterRequestedAt`** (floor.ts:515; floor-types.ts:68) and sorts asks
  first, oldest first (floor.ts:539-540). The chip's age therefore composes existing keys:
  `floor.status.counter` + `floor.kitchen.wait`.
- **Today's trust lines render ONLY on a trust tab** (`detail.tab === "trust"`,
  FloorDetailLive.tsx:1588-1597). A plain asked table gets no tender guidance today, so the
  cash-only line is a new render condition: dine-in AND `!counterTakesCard()`. It is not a swap.
- **The ask tone and its marks exist:**
  - `floorTone` maps `counter` → `ask` (floor-tone.ts:40-41);
  - the ask tile is --warnb (globals.css:14424-14426);
  - the ask edge is --warn (globals.css:14463-14468);
  - the strip's ask glyph is `receipt` (TableStrip.tsx:68-75).
- **`RelativeTime` prints Burmese numerals** ("၅ မိနစ်က", RelativeTime.tsx:15).
- **The split geometry:** the pane is clamp(22rem, 34vw, 34rem) → 464 at 1366, and always present
  from 64em (globals.css:14675-14720).

---

## DECISIONS

1. **The rail plus one sentence is the whole guidance.** The ①②③ list is gone. This fixes guided's
   judged weakness: a second step vocabulary under the Order · Bill · Pay rail.
2. **Owner answer 2: the dine-in Bill shows only "Pay at the counter".** A new
   `SURFACES.dineInPhonePay = false` is DRAWN in Checkout and ANSWERED in create-intent
   (surfaces.ts:19-23). It flips in the live-key cutover commit.
3. **The live-key item is C2, not C1.** The task cites C1, which is auth hardening (OPEN-ITEMS.md:20).
   Live keys are C2 (OPEN-ITEMS.md:27; OWNER_RULINGS #8).
4. **Quiet graft: one docked door in the CartBar's slot.** It carries no amount, because it charges
   nothing and the slip right above carries the total.
5. **Quiet graft: the total becomes the receipt slip's own foot while phone pay is parked.** The
   separate Total row only existed to preview a tip.
6. **No tip on a dine-in phone while parked.** The cash tip lives in Dad's sheet
   (`settle.cash.tipLabel`, staff.ts:1727). Today's tip preview is already 0 under an ask
   (Checkout.tsx:2657).
7. **Guided's tender truth is derived, never a literal.** `counterTakesCard()` = reader env OR a
   parked outside-app flag. Ruling #11 sets the cash default and #26 says no reader.
   `COUNTER_TENDERS` cannot drive it, because it already lists terminal (counter-tender.ts:6).
8. **Quiet graft: after the ask, the phone becomes the slip.**
   - The h1 becomes `counterTitle`.
   - The eyebrow and the back link step aside, and the receipt folds into a "View bill" disclosure.
   - One quiet withdraw is the last element.
9. **Glanceable graft: the table numeral is readable across the counter.** It is 88px via ONE new
   token (`--fs-pass`, a definition, so the style-literal ratchet does not rise), and the total is
   at `--fs-display`. This replaces the placard's 104/56px literals that the judges flagged.
10. **Glanceable's one delight:** the pass is torn from the app's own thermal-receipt paper
    (`.receipt-slip-body` + `.receipt-tear`), with the coupon notch seam. These are reused idioms,
    with one rise, static under RM. Rotation and full-screen are dropped: they made a modal of a
    state (§19).
11. **No counts on any diner screen** (DESIGN-LANGUAGE.md:1917-1919). Unsent dishes show as the
    "Not sent yet · မပို့ရသေး" tag, never "{n} dishes". This fixes the judged "counts on a shared
    cart".
12. **Guided: the ask carries drafts and nobody waits on a quiet host.** It ships strictly after
    P2do (graft 3). The money doors still refuse over unsent dishes. No Send is drawn on the Bill,
    which fixes guided's §32 strain.
13. **A remote ask is a view flip, not an insertion above the receipt.** The region speaks once, and
    focus moves only if it was lost. This fixes guided's reliance on iOS overflow-anchor.
14. **"We’re not done yet" replaces the parked `payOnPhoneInstead`.** Its status sentence replaces
    "Back to paying here — pick a tip and tap Pay…", which names parked controls (Checkout.tsx:2021).
15. **Graft 2: the settling sentence is keyed on `surfaceOpen('selfServeSplit')`.** It replaces the
    false "splitting" sentence (counter-pay-state.ts:55) on both the door and the pass.
16. **Glanceable graft: "Dad's card showing the same figure" is the PANE's ask card.** It becomes the
    guest pass's twin, moved to the top of the detail, showing `settleTotalCents` big. The floor row
    has no settle total, so the floor card shows the age instead.
17. **Graft 5, extended to the pane:** the floor card's pre-tax "so far" and the pane's "subtotal so
    far" + pre-tax note are hidden on an asked table, leaving one figure at the till. One promo'd-cart
    test pins the diner and staff totals as equal.
18. **Graft 6:** the ask's age is on the floor chip ("ကောင်တာမှာ ရှင်းမယ် · ၄ မိနစ်"), composed from
    existing keys. There is no "late" colour rule, which avoids glanceable's judged nagging marks.
19. **Guided: Dad's "Next:" line sits in the pass's foot.** It is the step said once, Burmese-first.
    The hero stays in today's settle section, so promo-before-settle is preserved, and it is still in
    view at 1024.
20. **Graft 4:** the cash-only line renders on every asked dine-in table while
    `!counterTakesCard()`. Today's tender lines exist only on trust tabs.
21. **Quiet fix: the settled thank-you reuses the shipped `paidThankYou` pair** (cart.ts:133), not a
    new hybrid. v7.2:468's shorter "ရှင်းပြီး။ ကျေးဇူးပါ" stays a K15 question, as the key's own
    comment says.
22. **Cross-moment defaults are honoured:**
    - moment 8: a pending approval warns but never blocks Take cash (owner answer 4);
    - moment 6: "Back to the counter" leads the paid card.

## OPEN RISKS

1. **Reversing §19's door order is a money-path change.** create-intent gains a refusal, so the PR's
   merge-window line reads "recommend: wait for Codex" (ruling #1, as advice; with Codex out of quota, OWNER_RULINGS §G, G3 · WORKFLOW §Review step 5 (g)). Until C2, the dine-in card path
   is proven only by tests and mutants.
2. **A card-only guest has no way to pay at a table until C2 or a reader.** The design only makes that
   honest before the walk. It cannot fix a business fact.
3. **The dock adds fixed chrome to the 4,546-line, mutated Checkout.tsx:**
   - it must hide while the promo field is focused;
   - the Toast must sit above it;
   - on a short phone the promo field starts under the fade, which needs a device check for
     PILOT15.
4. **The ask-over-drafts lift must not land before counter-floor's P2do.** Otherwise Dad sees "Pay at
   counter" with no "not sent" over dishes that block Take payment.
5. **"နောက်တစ်ဆင့်" now means two different steps on Dad's pane:** the Next line, and the shipped
   hint's "add a tip in the next step" (staff.ts:1722-1723). This goes to the K15 sitting.
6. **$46.41 appears three times on Dad's pane** (the pass, the Next line and the hero), from one
   binding. The device sitting (ruling #12) should confirm it reads as reassurance, not clutter.
7. **Every new Burmese string is an unverified draft** (K15):
   - the Bill sentence;
   - the pass sentence;
   - "We’re not done yet";
   - the remote-ask, withdraw and settling sentences;
   - "You can still ask…";
   - "Back to send them";
   - the two Next lines;
   - the cash-only line.
8. **Group tables keep today's SplitSection** ("Splitting evenly — everyone pays their share", with
   Evenly / By person) on a counter-only Bill. It is presentation, but its promise was not
   re-checked against how the register settles one cash total.
9. **"View bill" now names two controls:** a disclosure on the pass and the Order stage's
   navigation door (cart.ts:44). It needs a word check.
10. **A remote view flip scrolls a tablemate who is mid-scroll to the top of the pass.** That is
    deliberate (every phone agrees), but the screen-reader pass (J42) should re-check it.
11. **The withdraw stays live during the register's freeze,** as today. A tablemate can clear Dad's
    ask card mid-settle. The settle is unaffected, but the pane's pass unmounts under Dad.
12. **`--fs-pass` is a packages/ui token change.** The registry's largest table number should be
    checked against 88px at 350 wide (two digits fit easily; a three-digit fallback to
    `--fs-display` is unspecified).
13. **The floor card's composed accessible name changes** (`al()`). Its strings and the chip must
    stay one key per state (P2g).
14. **Ownership spans streams:**
    - diner-cart: Checkout, PayAtCounter, cart.ts, counter-pay-state;
    - money-rails: create-intent;
    - counter-floor: TableCard, FloorDetailLive, staff.ts, floor;
    - unowned: surfaces.ts and tokens.css.
      Each half goes as a handoff on its row, never a cross-stream edit.

---

## Appendix — what changed after this spec (applied in the drawn screens)

The spec above was written first. Two later passes changed it, and the screens on the canvas were drawn
with both applied. **Where an item below contradicts the spec above, the item below wins.**

### A · System amendments (the cross-moment consistency pass)

1. Diner Bill: move 'Ready for the bill? The counter takes cash.' from above the slip into the dock's ONE line slot, directly above the door. This is the same slot the held reasons use (undo window, settling), so the dock never changes height between rest and held. If it wraps past one line per language at 390, keep only its second clause and that clause's MY.
2. Unsent states (the Bill note's head and the tag inside the pass): replace the 1.5px dashed --warn pill with m1's capsule: --sf ground, a hollow ring in --t2, and 'Not sent yet · မပို့ရသေး'. Dashed means provisional, and warn would alarm a guest.
3. The pass is the shared CounterPass (with m1). Its seam becomes a 2px DOTTED perforation with the 12px notches, not a 1.5px dashed rule. 'စားပွဲ 4' is full ink --tx at --fs-h2 (not --t2 17px), because Dad reads it. It is constant paper in both themes, so the Night #2b213c pass retires; the notches keep the page ground.
4. --fs-pass is the ONE 88px 'read across the counter' token, used by m1's card and m6's due and #CODE. m6's --till-fs-say folds into it.
5. Dad's pane: drop 'Next: take $46.41 in cash.' and its unsent twin. On staff screens the step lives in the hero ('ငွေသားနဲ့ ရှင်း · $46.41'), and the unsent case is the hero's shipped held reason. This removes the နောက်တစ်ဆင့် collision with the tip hint, the third $46.41 (risk 6) and two K15-HIGH drafts. The cash-only line stays as the hero's description.
6. Dad's floor under ruling #15: the kitchen row's '၂ ခု မပို့ရသေး' leads with the hollow ring in --warn, and the strip tile's corner mark is the same ring. The ask chip's age stays plain text (CALL tier, no escalation).
7. Take cash opens m6's crowned till tray, the one cash sheet on the tablet. The settled state uses HandoffCard's seal grammar at pane width: green body, ✓ disc, Change as hero, the count-back rows, no #CODE stub for dine-in, and 'Back to the counter' as hero.
8. With a manager flag up (m8), Take cash stays LIVE, as this spec already says; m8 is amended to match. While a decision re-reads, the pass total shows the same 'Updating the total…' as the trigger (one binding), never the pre-decision figure.
9. One pane order, shared with m7 and m8: the ask pass at the top, then the order card (no 'so far' subtotal), promo, settle (m8's flag card → Take cash → hint → cash-only line), Merge, and last the small 'Clear table'.

### B · The adversarial critic's blocking fixes (verdict: fix)

1. **Amendment 1 is not applied. The Bill's guidance sentence still sits above the slip, and the held reasons sit in a separate dock slot, so a held state shows two sentences and the dock changes height between rest and held.**
   - Evidence: picked-m2.md:93-96 places 'Ready for the bill? The counter takes cash.' as a <p> at 292-335, above the slip. The held reasons are a separate `.checkout-pay-reason` inside the dock (:156-158, :162-163). During the undo window the sentence and 'Pay opens when the undo window closes.' are both on screen. The vocabulary says a docked hero's single line slot carries one sentence, never both. The MY pair (brief-m2.md:274 + m2.json concepts[2].screens[0].copy_my[0]) cannot fit one line of 13px Padauk at the 366px dock width. The settling reason ('The counter is taking your table’s payment right now — this screen updates when it’s done.' plus its MY, :162-163/:217-218) wraps to about 2+2 lines, so the slot cannot hold a constant height. :173-174/:185 make the counterTakesCard() variant 'Ready for the bill?', which is the clause the amendment drops.
   - Fix: Delete the 292-335 block and move the slip up. Put ONE line slot inside the dock, directly above the door. At rest it says 'The counter takes cash.' / 'ကောင်တာမှာ ငွေသားနဲ့ ရှင်းလို့ ရပါတယ်။' (the second clause, because the full pair wraps at 390). When held, it is replaced by the hero's reason. Give the slot a fixed height and use held reasons that fit it: shorten the settling reason to one line per language from existing drafts, or leave it English-only and list it; never invent MY. Re-specify the counterTakesCard() variant for this slot and update the COPY, CODE CHECK and A11Y (aria-describedby target) sections.
2. **Amendment 2 is not applied. Unsent states still use the 1.5px dashed --warn pill, which reads as alarm and as provisional.**
   - Evidence: picked-m2.md:148-150 makes the Bill note's head a '32px, 1.5px dashed --warn, radius 999, 13/700 --warn' tag. :390-392 puts the same dashed --warn tag inside the pass. :747 (A11Y) says 'not sent = the dashed mark (diner)'. The vocabulary says a HOLLOW RING with 'Not sent yet · မပို့ရသေး' is --t2 on phones, and a dashed edge means provisional.
   - Fix: In both places use m1's capsule: --sf ground, a hollow ring in --t2 (aria-hidden), and 'Not sent yet · မပို့ရသေး' (EN from line-state-copy.ts:13, MY from staff.ts:2802). No warn ink and no dashed edge. Update :747 to say 'hollow ring + words'.
3. **Amendment 3 is not applied. The pass is not the shared CounterPass: its seam is a dashed decorative rule, 'စားပွဲ 4' is small --t2, and it has a separate Night colourway.**
   - Evidence: picked-m2.md:341-345 draws the seam as 'a 1.5px dashed --bd rule'. :595-596 gives Dad's pane pass the same dashed seam. :485 keeps 'a CanvasText dashed border' under forced colours. :340 sets 'စားပွဲ 4' in 'Padauk 17px (--fs-h3) / 700 … --t2'. :302-304 specifies a Night pass '#2b213c, numeral #f3ecdf, notches #100c19'. The vocabulary says a DOTTED perforation with 12px notches is a pass or stub, a dashed edge is never decoration, and the CounterPass is constant paper in both themes.
   - Fix: Make the seam a 2px DOTTED perforation with the 12px notches, on both the guest pass and the pane's twin, and keep it dotted under forced colours. Set 'စားပွဲ 4' to full ink --tx at --fs-h2 (Padauk 700). Delete the Night pass values: the pass stays constant paper in both themes and the notches take the page ground. Reference the shared CounterPass primitive (with m1) rather than a local recipe.
4. **Amendment 5 is not applied. Dad's pane still carries the separate 'Next:' line, its unsent twin and two K15-HIGH drafts. This collides with the tip hint's နောက်တစ်ဆင့် and repeats $46.41 a third time.**
   - Evidence: picked-m2.md:15-16 ('It carries the guided "Next:" line'), :601-603 (the 398-443 NEXT line), :631 (unsent Next), :650, :670-671, :709-711 (drafts from m2.json concepts[1].screens[5].copy_my[1],[2]), :729, DECISION 19 (:839-841), risks 5 and 6 (:865-868) and risk 7's 'the two Next lines'. The vocabulary says that on staff screens the next step lives inside the control's own words and never in a separate 'Next:' line.
   - Fix: Remove the Next line, its unsent twin, both drafts, DECISION 19 and risks 5 and 6, and shrink the pass by about 60px. The step is the hero 'ငွေသားနဲ့ ရှင်း · $46.41' (staff.ts:1708). In the unsent case, the hero's shipped held reason (the staff-settle-unsent note, FloorDetailLive.tsx ~1600) speaks. The cash-only line stays as the hero's description.
5. **Amendment 6 / ruling #15 is not applied. On Dad's floor the not-sent mark is warn words with no ring, and the strip tile has no corner mark.**
   - Evidence: picked-m2.md:630 has only 'The floor card's kitchen row adds "၂ ခု မပို့ရသေး" in --warn bold'. The strip layout (:544-549) and the states give tile 4 no not-sent corner mark. :747 says 'the words in --warn (staff)'. The amendment says the kitchen row leads with the hollow ring in --warn, the strip tile's corner mark is the same ring, and the ring replaces the floor's solid warn dot.
   - Fix: Unsent state: the kitchen row reads '[hollow ring, --warn] ၂ ခု မပို့ရသေး' (staff.ts:3260). Tile 4 carries the same --warn hollow ring in its corner, aria-hidden, with the words in the card's composed name. Retire the solid dot for this case and add the ring to the strip key.
6. **Amendment 7 is not applied. Take cash opens today's K29 sheet instead of m6's crowned till tray, and the settled state is today's HandoffCard rather than the seal grammar at pane width.**
   - Evidence: picked-m2.md:637-638 says 'Today's K29 sheet opens: "Take cash", "Take $46.41 in cash?"…'. :680 repeats it. :641-644 says 'Today's HandoffCard is focused. Its hero is "Back to the counter"'. That has no green body, no ✓ disc, no Change as hero, no count-back rows, and no statement that dine-in has no #CODE stub. Today a table only gets the rows card 'when a tender was entered' (FloorDetailLive.tsx:1530-1531 comment), so the spec must also say what shows on an exact-cash settle.
   - Fix: Taking cash: m6's crowned till tray is the one cash sheet on the tablet, showing the due figure at --fs-pass. Settled: HandoffCard seal grammar at the 431px pane width (green body, ✓ disc, Change as hero, count-back rows, no #CODE stub for dine-in) with 'ကောင်တာကို ပြန်သွား / Back to the counter' (staff.ts:3097) as hero and the Walk-up shortcut secondary only. Specify the no-tender-entered case.
7. **Amendment 8 is not applied. While a manager decision re-reads, the pass total would keep showing the pre-decision figure beside a trigger that says 'Updating the total…'.**
   - Evidence: picked-m2.md:647-648 says only 'moment 8's warning sits above the hero. Take cash stays LIVE'. The pass total (:597-600) reads detail.settleTotalCents. picked-m8.md:845 has the trigger say 'Updating the total…' until the server re-read. With no shared binding, the pass shows $46.41 after an Approve, while the trigger is updating, before the server answers. That is a stale amount on the till.
   - Fix: Bind the pass total and the trigger to ONE value. While a decision re-reads, both show 'Updating the total…' (the m8 string and its MY as m8 lists it), never the pre-decision figure. State this in STATES and CODE CHECK.
8. **Amendment 9 is not applied. The pane order is incomplete: Merge and Clear table are missing, and the m8 flag card's place is not fixed in the settle stack.**
   - Evidence: picked-m2.md:586-625 ends the pane at the settle section and 'today's reserve'. Today's pane renders MergeTableButton (FloorDetailLive.tsx:1696) and ClearTableButton (:1737) after the HandoffCard (:1654), and the spec draws neither. The amendment requires: ask pass → order card (no 'so far') → promo → settle (m8 flag card → Take cash → hint → cash-only line) → Merge → the small 'Clear table' last.
   - Fix: Write the full pane order exactly as amended. Draw or name Merge and the small, secondary 'Clear table' below the settle stack, with m7's extra-tap loss rule referenced for an unpaid table whose food went out.
9. **Two primaries in one state. In the unsent state Dad's pane draws a filled Send AND a filled (dimmed) Take cash.**
   - Evidence: picked-m2.md:632-634 keeps 'today's StaffSendButton' on the lines and 'Take cash is aria-disabled at 0.55'. In code, a counter-asked table's Send is emphasis 'primary' (lib/staff-send-view.ts:175: `if (i.counterAsk) return { ...base, emphasis: "primary" …}`, rendered as variant primary at StaffSendButton.tsx:178). A table's CashSettleButton is variant 'primary' with no demotion when blocked (FloorDetailLive.tsx:1527). A dimmed gradient pill is still a filled primary. The standing rule is one primary per state, and the judges credited the slip for 'one hero at a time, Send or Take cash'.
   - Fix: Name the one hero for the unsent state and demote the other to secondary in the spec and in its derivation. Either Send leads with Take cash secondary while settleBlocked, or Take cash holds its shipped reason and Send is secondary, as the amendment's 'the unsent case is the hero's shipped held reason' implies.
10. **A promise the code can't keep, plus a wrong description of today's code. On a group table the spec keeps SplitSection 'unchanged', but its parked branch tells guests to 'Pay as one bill here', which is a phone-pay door owner answer 2 removes.**

- Evidence: picked-m2.md:171-172 keeps 'today's SplitSection reference … unchanged'. Risk 8 (:878-880) describes it as 'Splitting evenly — everyone pays their share, with Evenly / By person'. That is wrong: SURFACES.selfServeSplit is false (surfaces.ts:55), so SplitSection returns its parked branch (SplitSection.tsx:290-308), which reads 'Pay as one bill here — or ask at the counter, and our staff can split it for you.' (:297). Line 126's string is the live-split status and is unreachable. The 'just a guide' line renders at Checkout.tsx:4180, after the counter door, not 'between the slip and the promo form'.
- Fix: While dineInPhonePay is parked, the group Bill must not say 'Pay as one bill here'. Gate that clause behind surfaceOpen('dineInPhonePay') and keep only the counter clause, or drop the section's first sentence; never invent MY. Correct risk 8 and the line-4180 placement.

11. **The Undo on the Bill is not the shared Undo, and the spec misquotes today's label.**

- Evidence: picked-m2.md:155 says 'Today's outline "Undo · 9" sits above the slip (Checkout.tsx:3342-3352)'. Today it is SendToKitchenButton's `checkout-outline-btn` (SendToKitchenButton.tsx:195) labelled `Undo — ${left}s` (:283), with the seconds inside the accessible name and no MY. The vocabulary says Undo is 'Undo · ပြန်ဖျက်' (MY shipped at staff.ts:255 `kds.undo`), with the seconds as an aria-hidden leaf, on --sf with a 1.5px dashed accent edge, never filled, never the hero, and armed only after the 350ms same-gesture guard.
- Fix: Fix the citation. Specify the Bill's undo-window control in the shared form: 'Undo · ပြန်ဖျက်', seconds aria-hidden, --sf ground, 1.5px dashed --ac edge, 350ms arm guard, sitting in its own slot above the slip. The dock's line slot carries 'Pay opens when the undo window closes.' (cart.ts:48-51).

12. **A runtime claim the code cannot keep: 'Taking cash … Every guest phone shows the settling sentence.'**

- Evidence: picked-m2.md:640. The settle freeze is taken only inside settleCash after Dad confirms the sheet (lib/staff-cart.ts:374 `acquireSettlementSuperseding`, released in its finally). It is not held while the sheet is open and Dad counts cash. Guest phones read `settling` (lib/cart.ts:653) only if a view read lands in that sub-second window, so during the counting the guest phones show the pass, not the settling sentence.
- Fix: Rewrite the state to say what is true: guest phones keep the pass while Dad counts, and the settling sentence appears only while the register holds the freeze (cash write or reader collect). Otherwise specify a new freeze-on-open, which is a money-path change and would need its own risk line.

13. **The rail's 'done' mark contradicts the shared marks. A done diner step must be a SOLID ✓ disc, and a hollow ring is reserved for 'Not sent yet'.**

- Evidence: picked-m2.md:85 and :319-321 keep the rail 'unchanged': 'Order (done): 20px disc, 1px --ok ring, check glyph'. In code, `.checkout-steps-item.is-done .checkout-steps-num` sets only border and colour, with no fill (globals.css:2262-2265), so it is a hollow ring. On screen 2's unsent state, two hollow --ok/--t2 rings with different meanings (done vs not sent) would sit on one screen. The vocabulary: 'A SOLID ✓ DISC means done: a diner step done'.
- Fix: Draw done rail steps as a solid 20px --ok disc with an --oa check (m1's sealed-disc recipe, picked-m1.md:218), keeping the ' — done' sr text. Note the globals.css change in CODE CHECK.

### C · The critic's suggestions (not blocking; take them where the build agrees)

- On the split screen the ask's age appears twice: on the selected floor card's chip ('· ၄ မိနစ်') and on the pane pass ('တောင်းဆိုတာ ၄ မိနစ်က'). The ask itself is marked three times (filled tile, warn rail and chip, warn receipt glyph on the pane). 'No fact is marked twice on one screen' argues for dropping the pane's age line, or rendering the pane glyph in --t2.
- Withdraw is optimistic (Checkout.tsx:2001-2003 sets counterAt null before the await), so the withdraw control unmounts at once. 'Busy shows One moment…' on it is unreachable, and 'on failure the phone stays on the pass' should read 'returns to the pass'. Only the tapper's phone flips optimistically; tablemates flip on the next read.
- Screen 1 neither draws nor parks RewardField (Checkout.tsx:3447-3452, rendered under showPayControls). Say whether a reward stays redeemable on a counter-only Bill (it rides getCartTotals, so the settle total would include it).
- The 'Your card is saved — pay here anytime…' note (showPayFurniture && tabType === 'secure', Checkout.tsx ~4150) promises phone pay that dineInPhonePay=false removes. Gate it with the same constant, even if no secure tab exists on prod today.
- The new cash-only line is Dad's only tender instruction, at 13px --t2 on a tablet read at the counter. Consider --fs-label or --fs-body for arm's length, as the hero's description.
- Specify the three-digit fallback for --fs-pass (risk 12) now, e.g. step down to --fs-display with no wrap, so the CounterPass primitive is complete for m1, m2 and m6.
- ONE VOICE: on the Bill, a guest whose dishes wait on the host reads 'the counter will check them with your table', while m1 says 'our staff can send it too'. Consider reusing m1's fallback words, and offering m1's 'Show a server' card here too, for one voice across moments.
- The one-shot .floor-card-pulse on the ask's status change is motion on a CALL-tier item ('one still, filled tile'). Either state that the console's universal change ring is exempt, or suppress it for the ask tone.
- 'View bill' would name both the pass's disclosure and the Order stage's navigation door (risk 9, cart.ts:44). Consider a distinct disclosure label from an existing key before K15.
- The strip key (aria-hidden, drawn from m7-glance-1) should gain the hollow-ring entry once amendment 6 lands, so the key matches the tiles.

### D · Round 3 (2026-10-07, under the owner's delegation) — these win over everything above

The owner delegated every open decision ("I trust you to apply world-class design-thinking best standards on
all open decisions") and added a live TV board, card / Apple Pay after the food is served, and animated step
guides. PATH_DESIGN_2026-10-07.md's round-3 section records the decisions (D1–D5) and the shared vocabulary.
The round-3 consistency pass gave this moment these changes:

1. D1(b): lib/surfaces.ts is diner-cart's, and diner-cart adds SURFACES.dineInPhonePay. money-rails reads the flag in create-intent and never edits the file. Rewrite decision 2's 'surfaces.ts unowned'.
2. D5 server order in create-intent: after `supersedeCartIntent` and its captured / unknown exits (route.ts:125-136), and before the slot, the promo pin and paymentIntents.create; each refusal releases the lock:
   - a. The parked refusal while the flag is false.
   - b. D5's verdict, from ONE error-aware read of qr_cart_items, in the shipped unsent refusal's dine-in slot, which it replaces. It fails CLOSED with the shipped 503 sentence.
   - A host with drafts gets 'Send everything to the kitchen first — Pay opens once everything’s served.'; a hostless table with drafts gets 'A server will send these to the kitchen — or pay at the counter.'; a to-go draft gets 'Send your to-go dish to the kitchen first (More ⋯) — Pay opens once everything’s served.'; everyone else gets 'Pay opens once everything’s served.' (409).
   - A parse-based check script verifies the call and that both refusals run after the supersede statement finishes.
   - The Take cash, reader and secure-tab doors are never gated by served.

3. Decide m10's open risk 15 as YES: before C2, PD2's counter-only Bill keeps its pay furniture exactly (no card words, no 'coming soon'), but its line rows become the One Pass body with Kitchen Track rows. m9's wall shows those same tracks to the room before C2, so the guest's own phone must match. The flag gates only the pay door.
4. Gate these by D5's open door, never by the flag alone:

- The counter pass's withdraw reads 'Changed your mind? Pay on your phone' only while D5's door is open (after C2), and 'We’re not done yet' otherwise.
- The group Bill's 'Pay as one bill here' shows only while the door is open.
- The secure-tab note is hidden while parked or held. When open it reads 'Your card is saved — pay here, or just leave and we’ll charge the bill to it.' (English-only).

5. One figure on both passes (the guest's and the pane's twin).

- Replace 'Table 4' at --fs-pass plus 'စားပွဲ 4' beneath with the label 'စားပွဲ · Table' over one Fraunces 600 '4'. The Burmese label stays at full ink, --fs-h2, so the appendix's Dad-reads rule holds.
- Render the post-pay primitive, with --pass-hole as the page ground.

6. Dad's pane and floor (counter-floor):

- Each line tag is the track glyph plus its table.line.state word. 'Sent' draws only once kdsLineGate passes.
- The card's '{n} ready to serve' count carries the 3/3 --ok glyph, so the call and the stamp it announces read as one. '{n} not sent' carries the ring (P2do). 'Ready to serve — Table N' stays the console's CALL, unchanged.
- After the flip, the cash-only line reads 'No card reader — take cash, or they can pay by card on their phone once everything’s served.' (K15 draft).

7. D3: the Bill's undo-window control is 'Undo · ပြန်ယူ'. Withdraw fix 11's ပြန်ဖျက်. It is m1's SendToKitchenButton.
8. Motion: suppress the one-shot .floor-card-pulse on the ask tone. A CALL is still and filled, and its fill is the signal. The guest pass's first-mount .mms-rise is the shared RISE.

### H · Build notes (2026-10-08, claude/feat/pd2-pd1-diner-cart)

What the diner-cart stream built from this spec, what it took from appendix C, what it did not, and
the questions the build decided under the owner's delegation (decided by: the diner-cart stream).
Precedence as read: D > the Codex corrections > the cross-spec reconciliations > B > A > the body.

**Built, by section.**

- Decision 2 · D1: `SURFACES.dineInPhonePay = false` (lib/surfaces.ts, its docblock naming where
  it is drawn and answered and D5's flip conditions); the pure `phonePayParked(mode, open)` in
  lib/checkout-stage.ts; `surfaces.test.ts` flips the constant; `surfaces/dine-in-phone-pay-reopened`
  and `surfaces/create-intent-route-answers-open` mutants.
- Screen 1 (A1 · B1): the rail plus ONE line in the dock's slot, directly above the one door
  (`PayAtCounterDock`, in the CartBar's fixed geometry, `--tap-bump`, the paper fade as its
  `::before`); the slip's own foot carries `totals.totalCents` (decision 5); no tip ask (decision 6),
  no separate total row, no card hero, no card words, no "coming soon"; the Total door never "& pay"
  (`billDoorLabel` takes `phonePayOpen`; m1 B9); the promo form and `RewardField` stay (Codex
  correction 1); the dock hides while the promo field has focus; the page pads its bottom by the
  dock's published height (`useCtaDock`).
- Screen 1 held states (B1 · B11 · D7): the slot carries the hero's one reason — unsent
  (`counterUnsentTapCopy`, host or guest), the undo window (`payOpensAfterUndo`), the register
  mid-settle (`registerSettling`), a peer's lock — `aria-disabled` + `aria-describedby`, every
  blocked tap re-said through the view's one region. The Undo above the slip is the shared form
  (`.checkout-undo`: `--sf`, 1.5px dashed `--ac`), named "Undo" with the seconds as an aria-hidden
  leaf and ပြန်ယူ (`table.send.undo`, D3), busy `table.send.undoing`, armed only after the 350 ms
  `undoTapHeld` on both relabels (P2y).
- Screen 1 unsent (A2 · B2, decision 11): the note is the shared mark — the hollow ring (`.mark-ring`,
  `currentColor`) and `pad.group.unsent` on `--sf`, count-free, never warn or dashed — with the host's
  "Back to send them" (`backToSendThem`, a K15 draft for its MY).
- Screen 2 (decision 8 · 13 · 14 · 15, D4): after the ask every phone becomes the pass —
  `counterTitle` as the h1, the rail's Pay current (`checkoutSteps.counterAsk`), no eyebrow, no back
  link, the one sentence (`counterShowCash`; with a reader the shipped `counterBody`), the
  "View bill" disclosure (`aria-expanded` / `aria-controls`, BillLines inside), the count-free unsent
  mark under the total, "We're not done yet" last (named "… — cancel paying at the counter"),
  answered with `noRushBill`; the settling sentence swaps in as static text. A tablemate's ask is a
  view flip said once (`tableAskedCounter`), focus to the h1 only if lost; the own ask lands focus
  on the h1 and plays the one RISE.
- Decision 15: `counterPayRefusalCopy(refusal, selfServeSplitOpen)` — the register's sentence while
  the split is parked, on the ask's refusal, the dock and the pass; mutant
  `counter/settling-sentence-names-a-parked-split`.
- Decision 7: `counterTakesCard(readerConfigured)` with the parked `COUNTER_CARD_OUTSIDE_APP`
  constant (ruling #11); the RSC passes `readerConfigured` from the reader env the staff page reads.
- D2 (create-intent): the parked refusal AFTER `supersedeCartIntent` and its exits, before the unsent
  refusal, freeing the lock; `scripts/check-phone-pay-door.mjs` (parse-based) in CI's fast lane and
  `verify:slice`'s pre-checks, red-first against seven evasions; the route's first suite.
- PATH_DESIGN moment 2 ("two reads, one derivation"): `lib/totals.test.ts` pins `getCartTotals(id)`
  equal to `getCartTotals(id, 0)` over a promo'd cart; mutant `totals/default-tip-not-zero`.
- Codex correction 10 (needed by m1 too): `SplitContext.qrCode`.

**Waits on another stream.**

- D5 · A3: the pass PAPER is post-pay's `CounterPass` primitive (`claude/feat/pd-pass-primitives`,
  merged into this branch once it reached the remote): `PayAtCounterPass` renders it at the
  `counter` tier (one figure at `--fs-pass` under "Table · စားပွဲ", the dotted seam and notches with
  `--pass-hole` set to the page ground, the torn foot) with the unsent mark as `KitchenTrack
stage="unsent"` in its head; the total, the "View bill" disclosure and the receipt are the host's
  body. ~~A numberless table prints its session code at the holder's 40px tier, spelt for a screen
  reader (reconciliation 6).~~ **Reversed 2026-10-09 (owner-delegated; the blind pass on #335,
  fixed in #335):** no pass prints the session's join code — it is the table's bearer join secret
  and its realtime/RLS key, and this pass is held up at the register. A numberless table prints
  "Aye’s table" (the host's first name) or "Your table" in the figure's place
  (`lib/pass-identity.ts`), and Dad finds the table on the console by its open cart. The primitive's
  prop surface: m10's `### H`.
- Screen 3 (Dad's pane, A5–A9, B4–B9, D6) is counter-floor's (PD6 · P2do); the ask's age as plain
  text on the floor chip too.
- Decision 12: the ask over unsent dishes stays refused (the Bill's door is held with its reason)
  until counter-floor's P2do lands; the lifted state's line ("You can still ask — the counter will
  check them with your table.") is not drawn yet.

**Appendix C, taken / not.**

- Taken: `RewardField` stays redeemable on the counter-only Bill (it rides `getCartTotals`, so the
  settle total includes it); the saved-card note is gated by the flag (and by "held", D4); the
  withdraw's "busy" is kept as a guard, not a drawn state (optimistic, so unreachable — C's note is
  right and the code says so).
- Not taken: a distinct label for the pass's disclosure (risk 9) — it keeps `viewBill`, the SAME act
  (reading the bill) the Order door names, and one key is one K15 line; the `--fs-pass` three-digit
  fallback belongs to the primitive; the floor-card pulse and the strip key are counter-floor's.

**Decided under the owner's delegation (decided by: the diner-cart stream).**

1. B1's "fixed height" slot is a `min-height` (one EN line + one MY line). Two shipped held reasons
   (the unsent sentence; the register's settling line) wrap to a second line at 390px, so the dock
   grows by one line in those two states rather than truncating a sentence the code must keep
   verbatim or inventing a shorter Burmese draft. At rest and in the undo window it is one line each.
2. The reader variant of the slot's line is "Ready for the bill?" (`readyForBill`, the body's own
   draft): B1 asked for it to be re-specified for the slot, and the question fits one line per
   language.
3. The note above the slip names the STATE (the mark) and the dock names the NEXT STEP (the held
   reason), so one fact is never marked twice; the host's way back stays with the mark.
4. A tablemate's ask does not join `viewKey` (which would replay the step slide and always steal
   focus): the pass renders in place, the edge effect says the sentence once and moves focus only if
   it was lost — the spec's focus rule, kept exactly.
5. The group table's `SplitSection` parked clause drops its first sentence (B10's second option): the
   counter clause alone is true, English-only as shipped.
6. The create-intent refusal's sentence is English-only and listed in `K15 · diner-cart`; a raw POST
   never reaches a drawn surface.

**Residuals filed.** A stale promo pin can reach the register's cash settle (`mms_promo_discount`
honours any pin; only create-intent releases a predecessor's) — OPEN-ITEMS **M268**. The group table
that flipped to the split board under the register's freeze (shipped before PD2) is FIXED by the blind
passes on #331: the board shows only while the self-serve split door is open (`splitBoardShown`,
lib/counter-pay-state — the same door the register's refusal sentence reads).
