# Picked m10 — The guest's live One Pass: per-item progress, then card / Apple Pay once everything is served

**Backbone:** GUIDED (diner moments are guided). The screen says NOW once, as the pass's status in the
family's own words; ONE line says what Pay is waiting for, in the dock's one slot; the counter is always
the live, quiet way out. **Decision D5 is applied exactly:** phone pay (card, Apple Pay, Google Pay, all
on the card method under ruling #7) opens only when nothing on the table's bill is still with the
kitchen, the server refuses otherwise, and the whole door stays dormant behind
`SURFACES.dineInPhonePay = false` until C2's live keys.

**C2, said plainly.** Production serves Stripe TEST keys today (OPEN-ITEMS C2, measured 2026-09-07:
`pk_test`, `livemode false`). Until C2 flips, no real card money can move: a real card is declined and a
Stripe test card would "pay" with no money moving. So screens 1 and 2 are drawn in the **live-keys
state** (after the flag flips in its own PR). Each screen states its **held-keys variant**: the
dine-in Bill is PD2's counter-only Bill exactly (`picked-m2-1`), with no card words and no "coming soon".
Screen 3's pass is reached today too, through Dad's cash settle (`/track?cart=…&paid=1`).

**Example data.** It continues moment 1's table, so the One Pass reads as one story across moments.

- **Table 7**, a party of two. **Aye** is the host; **Thiri** is a guest. The drawn phone is Thiri's,
  so the table is a group (`isGroup`, Checkout.tsx:369-370) and Pay reads "Pay the whole order".
- Lines (prices docs/data/MENU_REFERENCE.md:27, :55, :156; tax 10.5%, lib/tax.ts:7, every category
  here taxable):
  - Thiri's **2 × Mohinga** / မုန့်ဟင်းခါး, $28.00 (tax 294¢).
  - Aye's **Coconut Rice** / အုန်းထမင်း, $3.50 (tax 37¢).
  - Aye's **Burmese Milk Tea** / လက်ဖက်ရည်, $4.00 (tax 42¢). It is a drink, drawn on purpose: D5 holds
    the door until Mom bumps it too.
- Subtotal **$35.50**, Sales tax **$3.73**, Total **$39.23**.
- Screen 2 adds Thiri's 20% tip on the pre-tax base: round(3550 × 0.20) = **$7.10**. The new total is
  **$46.33**. The ladder is 15 / 20 / 30 + None (lib/tip.ts:42).
- Sent at **6:14 PM**. The order reference is **#7C2E9A**, the uuid tail and hex like every code.
- Every figure is illustrative and server-derived (`getCartTotals` / `payTotals`). No amount is
  optimistic.

**Light tokens used (hex, for the drawer):** --pg #faf9f5 · --sunken #efece2 · --sf #f2efe7 · --cd
#fffdf8 · --tx #1b1714 · --t2 #6e6358 · --t3 #726859 · --ac #a65f10 · --ac-strong #8f5009 · --oa #fffdf8 ·
--ok #346e47 · --okb #eaf2ec · --bd rgba(58,35,23,0.1) · ticket edge rgba(27,23,20,0.18) · --sheen
rgba(255,255,255,0.55).

---

## WORLD-CLASS REFERENCES (what each brings, brought down to this family's room)

- **Apple Wallet boarding pass.** One object with a fixed anatomy (a status, one hero figure, a stub of
  small fields, a tear line) that updates in place, so the guest learns one look and trusts it at every
  stop.
- **iOS Live Activities (a food order on the Lock Screen).** Progress as short segmented bars that fill
  in place, one per dish here, with real stage names and no countdown.
- **Domino's Tracker.** It made stage-by-stage kitchen progress something guests expect. Here every
  stage is a real tap on Mom's board, never a timer.
- **sunday (pay-at-the-table).** The bill, the tip and a single wallet button on one screen, with card
  one tap behind. Paying at the table takes seconds and never waits for a server.
- **Apple's Human Interface Guidelines for Apple Pay.** The wallet button is the first and most
  prominent way to pay. The official black button in light mode and white in dark, never restyled.
- **A thermal receipt printer and a gate agent's stamp.** At the end the stub is stamped, once, and the
  receipt prints beneath it. These are the moment's two physical delights, played in sequence, never
  together.
- **A great maître d'.** He never hurries a table to pay: no tip ask before the food, no sound, no
  buzz when the door opens. The counter is always one quiet tap away.

---

## THE ONE PASS — one primitive for every moment (read before drawing)

The CounterPass vocabulary of PATH_DESIGN (dotted perforation with 12px notches, constant paper,
figure tiers) becomes one anatomy that moments 1, 2, 3 and 10 share:

- **HEAD (the ticket).** 350 wide, x20–370.
  - **Main area:** 250 wide, centred. It holds the STATUS ROW (glyph + word, EN caps + MY) and one
    FIGURE row.
  - **Stub:** 100 wide, on --sf, behind a **2px dotted** vertical perforation, with two small fields.
  - This is moment 3's claim ticket geometry (main 250 | stub 100, ticket edge rgba(27,23,20,0.18)).
- **SEAM.** It joins the head to a BODY: moment 2's horizontal 2px dotted perforation with 12px side
  notches (picked-m2-2).
- **BODY.** The itinerary: the dishes, the money rows, the total.
- **TORN FOOT.** The shipped `.receipt-tear` (globals.css:778-788).
- **Figure tiers, never a third.**
  - 40px / 800 Hanken (the `.exit-pass-code` tier) when the pass is read by its holder (m3, m10).
  - 88px `--fs-pass` when it is held up across the counter (m1's Show-a-server, m2's counter ask).
  - The tier tells who the pass is for.
- **Status words are the family's console words, one word on every surface:**
  - Sent ပို့ပြီး, Cooking ချက်နေဆဲ, Served ထုတ်ပြီး (staff.ts:2803-2805, the same keys Dad's table
    page shows and Mom's board grounds);
  - Paid ငွေရှင်းပြီး (staff.ts:394, Dad's floor word for this table);
  - Not sent yet မပို့ရသေး (`pad.group.unsent`, staff.ts:2909).
  - The TV board's per-item rows should use the same three words, so a guest reading the wall and
    their phone sees one vocabulary.
- **Material.**
  - Plain printed paper #fffdf8, with no card dots (m3: a printed artifact, not a surface).
  - Inset sheen + `--sh-paper`.
  - **Constant paper in both themes.** In Night the pass stays light, like a wallet pass. Its notches
    take the Night ground #100c19.
- **m10's head is 96 tall on all three screens,** so the status flips in place and nothing below it
  jumps.
  - The vertical stub perforation runs only through the head.
  - It has ONE notch, on the top edge at x270. Its foot meets the seam (a T, like a ticket with a
    receipt tail).
- **Geometry recipe (identical on all three screens; y is given per screen):**
  - `<section aria-labelledby="pass-h">`, a flex column.
  - **Paper div:**
    - bg #fffdf8; 1px solid rgba(27,23,20,0.18) with no bottom border;
    - radius 20 20 0 0;
    - shadow `inset 0 1px 0 rgba(255,255,255,0.55), 0 1px 3px -1px rgba(35,24,16,0.07), 0 14px 28px -18px rgba(35,24,16,0.28)`;
    - position relative.
  - **Head:** a 96px flex row.
    - Main: `flex: 0 0 250px`, padding 12px, a centred column, gap 2, text-align centre.
    - Stub: `flex: 1`, bg #f2efe7, border-left 2px dotted rgba(27,23,20,0.18), border-top-right-radius
      19, padding 12px 8px, a centred column.
  - **Top notch:** absolute, left 244, top -7, 12×12, radius 999, bg #faf9f5, border-bottom 1px solid
    rgba(27,23,20,0.18). aria-hidden.
  - **Seam:** 16 tall (the picked-m2-2 recipe).
    - A rule: absolute left 16, right 16, top 7, border-top 2px dotted rgba(58,35,23,0.28).
    - Left notch: absolute left -1, top 2, 7×12, 1px rgba(27,23,20,0.18) border with no left edge,
      radius 0 6 6 0, bg #faf9f5.
    - Right notch: mirrored.
    - All aria-hidden.
  - **Body:** the per-screen padding.
  - **Tear:** after the paper div, an 11px #fffdf8 strip with the picked-m2-2 mask, aria-hidden.

---

## SCREEN picked-m10-1.dc.html — The Bill while the kitchen cooks: the live One Pass

- **Device:** phone 390×844. **Theme:** light. **Interactive:** no.
- **Who and when:** Thiri on the Bill stage, 6:31 PM. Everything is sent. Thiri's Mohinga is being
  cooked, Aye's rice waits in the kitchen, and Aye's tea has been bumped. Live keys are on, so Pay
  exists and is held by the kitchen (D5).

### LAYOUT (top to bottom; page column x20–370; `main.page-col-narrow` padding 24/20/40)

- **0–47:** empty page ground (safe area). Draw nothing.
- **47–103: AppHeader,** unchanged.
  - 56px, padding 0 14, #faf9f5, 1px --bd bottom.
  - The logo `<img src="/_blob/e7e27a9553079ddb61cfec7bd9f82c9f" alt="">` 51×34, then "Morning Star"
    in Fraunces 16/800.
  - Nothing on the right.
- **At the top of main:** the review step's ONE region, `<p role="status" aria-atomic="true">`, sr-only
  and empty (Checkout.tsx:4188-4209).
- **127–176: h1 "Your bill",** tabindex -1.
  - Fraunces 26/600, lh 1.08, tracking -0.02em, --tx.
  - "သင့်ဘောက်ချာ" is a block inside it: Padauk 13/700, --t2.
  - **No "Table 7" eyebrow:** the pass names the table, once (picked-m2-2's rule).
- **182–202: step rail,** `<ol role="list" aria-label="Checkout steps">`, gap 8, 12/700:
  - **Order (done):** a SOLID 20px --ok disc with an --oa check; label --ok; sr " — done".
  - A 14×1 --bd join.
  - **Bill (current):** a --ac disc with "2" in --oa; label --ac-strong; `aria-current="step"`.
  - A join.
  - **Pay (next):** a 1px --bd ring with "3" in --t3; label --t3; sr " — next".
- **206–250: back link,** a `<button>` nav-link, 44 tall, padding 0 2, gap 6.
  - A 16px ← arrow, aria-hidden.
  - "Back to your order" 14/700 --ac.
  - "သင့်အော်ဒါဆီ ပြန်သွားမယ်" Padauk 13/400 --t3, inline.
- **258–682: THE ONE PASS** (geometry above).
  - **HEAD 258–354.**
    - **Main**, the `<h2 id="pass-h">` holding two lines:
      - **STATUS ROW** (21 tall), centred, gap 6:
        - an 8px --ac dot, aria-hidden (it breathes; see MOTION);
        - "Cooking": 11/700, tracking 0.13em, uppercase, --ac;
        - " · " in --t3;
        - "ချက်နေဆဲ": Padauk 13/700, --ac-strong.
      - **FIGURE ROW** (48 tall), centred, baseline-aligned, gap 10:
        - "Table" Hanken 17/700 --t2, a normal space, then "7" Hanken 40/800, lh 1.2, tabular, --tx;
        - then "စားပွဲ 7": Padauk 17/700, --tx, with the 7 Latin and `class="tn"`.
      - The row measures about 150px against a 226px inner width.
    - **Stub:** a centred `<dl>`, gap 8, `class="ph-no-capture"`:
      - dt "Host" 11/700, tracking 0.05em, uppercase, --t3; dd "Aye" 15/700 --tx, one line, ellipsis;
      - dt "Sent" in the same style; dd "6:14 PM" 15/700, tabular, --tx.
  - **SEAM 354–370.**
  - **BODY 370–671:** padding 4 16 12.
    - **THE DISHES (374–542):** `<ul role="list" aria-label="Your bill">`, three rows of 56 (padding
      6 0). Rows 2 and 3 have a border-top of 1px rgba(58,35,23,0.06). **No photo thumbs:** the pass is
      a printed artifact. Each row is two lines:
      - **Line 1 (22):** flex, space-between, baseline.
        - Left: qty × name in 16/600 --tx (the qty is `tn`), a gap of 6, then the MY name in Padauk
          13/400 --t2.
        - Right: the price, 16/600 tabular.
      - **Line 2 (21, margin-top 1):** flex, centred, gap 8.
        - **THE TRACK,** aria-hidden: 96×4, three segments (flex 1, gap 3, radius 999). Empty =
          rgba(58,35,23,0.12), now = #a65f10, done = #346e47.
        - **THE STATE:** EN 13/700, " · ", MY Padauk 13/700 in the state's ink, then " · {owner}" in
          13/400 --t3 (the owner span is `ph-no-capture`).
      - Row 1 (374–430): "2 × Mohinga" · "မုန့်ဟင်းခါး" · "$28.00".
        - Track: [done][now][empty].
        - "Cooking · ချက်နေဆဲ" in --ac-strong, then " · You".
      - Row 2 (430–486): "Coconut Rice" · "အုန်းထမင်း" · "$3.50".
        - Track: [now][empty][empty].
        - "Sent to kitchen · ပို့ပြီး" in --ac-strong, then " · Aye".
      - Row 3 (486–542): "Burmese Milk Tea" · "လက်ဖက်ရည်" · "$4.00".
        - Track: [done][done][done].
        - "Served · ထုတ်ပြီး" in --ok, then " · Aye".
      - Rows keep CART order and never re-sort when a state changes (no row jumps under a thumb).
    - **MONEY ROWS (548–599, under the fade):** `<dl>`, border-top 1px --bd, padding-top 6, 14px, rows
      of 22 with dotted leaders (picked-m2-1 recipe):
      - "Subtotal · အကြိုစုစုပေါင်း ···· $35.50";
      - "Sales tax · ရောင်းခွန် ···· $3.73".
    - **THE FOOT (607–659):** border-top 1px --bd, padding-top 10.
      - Left: "Total" 16/800 --tx, with "စုစုပေါင်း" Padauk 13 --t3 stacked beneath.
      - Right: "$39.23" Fraunces 21/800, tabular.
      - It binds `orderTotalCents` (Checkout.tsx:2662), with no tip while held.
  - **TEAR 671–682.**
- **Below the fold (not visible):**
  - the promo form and RewardField (both drawn, PATH_DESIGN correction 1);
  - the group's parked split section in its held wording (see STATES).
- **546–750: the dock's paper fade,** absolute, full width, z 2, pointer-events none,
  `linear-gradient(to top, #faf9f5 180px, rgba(250,249,245,0) 204px)`. The pass's rows end at 542,
  so all three rows stay fully visible.
- **570–734: THE DOCK,** absolute, left 12, right 12, z 3. It is a flex column.
  - **570–614: THE ONE LINE SLOT,** `<p id="pay-line">`, height 44, centred.
    - "Pay opens once everything’s served." 15/700, lh 20, --tx, one line.
    - The slot keeps its 44px whatever it says, so held ↔ open never changes the dock's height.
  - **622–686: THE PAY BUTTON (held),** a `<button>`.
    - Full width, min-height 64 (`--tap-bump`), radius 12.
    - Gradient `linear-gradient(180deg, #a65f10, #8f5009)`, ink #fffdf8, the CTA shadow.
    - **opacity 0.55,** `aria-disabled="true"`, `aria-describedby="pay-line"`, cursor default.
    - Two centred lines on the label layer:
      - "Pay the whole order · $39.23" 16/800, then a 16px → arrow, aria-hidden;
      - "တစ်စားပွဲလုံး ရှင်းမယ်" Padauk 13/700 in #fffdf8.
  - **690–734: PAY AT THE COUNTER,** a quiet ghost `<button>`.
    - Full width, 44 tall, transparent, no border.
    - Two centred lines: "Pay at the counter" 15/700 --t2, then "ကောင်တာမှာ ရှင်းမယ်" Padauk 13/400
      --t3.
    - LIVE: the kitchen never holds the counter (D5).
- **750–844: diner tab bar,** unchanged:
  - Menu (grid icon) · **Order** (receipt icon, `aria-current="page"`, #8f5009) · Account (star icon).
    These are the shipped icons, DinerTabs.tsx:41-45. Draw them as picked-m3-2 does, not picked-m2-2.
  - No count capsule (a shared cart).
  - The bottom 34 stays empty.

### STATES (not drawn; for the build)

- **Held keys (today until C2):**
  - PD2's counter-only Bill exactly (`picked-m2-1`): "The counter takes cash." in the slot and the
    filled "Pay at the counter" door.
  - No Pay, no served line, no card words, no "coming soon".
  - BillLines keeps its shipped state words, which already update live.
  - (Owner option, OPEN RISK 15: ship the pass rows here early.)
- **A row advances (realtime on `qr_cart_items`, or the re-read when the app returns to the
  foreground):**
  - The next segment fills from the left: scaleX 0→1, 480ms, --ease-out, the `.track-rail-fill`
    idiom turned horizontal (globals.css:379-405).
  - The word swaps in place.
  - Nothing is announced: kitchen progress is ambient (TableTimeline.tsx:18-21's rule). The view keeps
    its one region.
- **The head's status is the table's roll-up,** in this priority:
  1. any dine-in draft → hollow ring --t2 + "Not sent yet · မပို့ရသေး";
  2. any `in_progress` → breathing --ac dot + "Cooking · ချက်နေဆဲ";
  3. any `fired` past its grace → --ac dot (still) + "Sent to kitchen · ပို့ပြီး";
  4. only `fired` inside the grace → "Sending… · ပို့နေပါတယ်…";
  5. everything served → a solid 16px --ok ✓ disc + "Served · ထုတ်ပြီး".
  - Priorities 2–3 are TableTimeline's cooking-before-sent order (TableTimeline.tsx:112-123).
- **Inside the Send's undo window** (`fireAt` still in the future, packages/db/src/index.ts:48-50):
  - The row's first segment is a 1.5px DASHED --ac outline, not filled. Dashed means provisional.
  - Its word is "Sending… · ပို့နေပါတယ်…".
  - The shared Undo sits in its slot above the pass, reading "Undo · ပြန်ယူ" (D3: the phone's Send
    undo reuses `table.send.undo`).
  - The dock slot shows the kitchen reason, because kitchen outranks grace (D5).
- **THE DOOR OPENS** (the last held line is bumped, and nothing else blocks):
  - The head flips to "Served · ထုတ်ပြီး" with the ✓ disc, in place.
  - The slot reads "Ready to pay." (the shipped sentence, Checkout.tsx:2542).
  - Pay goes to full ink. Its LABEL LAYER plays one `mms-pop` (globals.css:903-916, 120ms).
    - It is the label, not the 366px box: the shipped pop scales to 1.18, which would push the box
      ~33px past the 390 viewport.
  - The region says "Ready to pay." once, on the edge.
  - The shipped tip ask mounts under the pass: "Add a little extra?", "It all goes to the team who made
    your meal.", chips 15% · 20% · 30% · None and Custom, none pre-selected.
  - The pass foot then binds the same `orderTotalCents`. It reads "Estimated total · ခန့်မှန်း
    စုစုပေါင်း" with "includes $7.10 tip" once a chip is lit (the shipped row, Checkout.tsx:3836-3874,
    moved into the foot). That is one binding for the foot and the Pay label.
  - Focus is never moved. There is no sound and no haptic.
  - Under reduced motion there is no pop.
- **A recall or a new round still cooking closes it again:**
  - A KDS recall is served → in_progress within 2 minutes (w3_kitchen.sql:215-231).
  - The slot returns to the reason and the tip ask unmounts. The chosen rate stays in state and shows
    lit if the door reopens.
  - Nothing is announced. Every tap on the held Pay re-says the reason through the region.
- **Unsent dishes:**
  - The "Not sent yet · မပို့ရသေး" capsule sits above the pass (--sf, hollow ring --t2; m1/m2's
    capsule).
  - Draft rows show three empty segments and that word.
  - The host gets the quiet "← Back to send them".
  - The slot shows the unsent reason. Unsent outranks kitchen.
    - For the host: "Send everything to the kitchen first — Pay opens once everything’s served."
    - For a guest: "Aye sends them — Pay opens once everything’s served."
    - The shipped guest clause "— then the bill is ready to pay" becomes false under D5, so it changes.
- **A tablemate is paying** (a peer's lock):
  - The slot reads the shipped "Waiting for Aye to finish" (checkout-verb.ts:96).
  - Pay is held, and the counter door is refused by the same freeze.
- **The table asked for the counter:**
  - The pass becomes m2's counter pass, its figure at the 88px tier.
  - The withdraw reads "Changed your mind? Pay on your phone" ONLY while the door is open, otherwise
    "We’re not done yet" (D5).
- **The register is settling:** the slot reads m2's settling sentence.
- **Row kinds:**
  - A comped row keeps its track and word (it still cooks, and it holds the door, D5). Its price is
    struck in --t3, followed by " · On the house".
  - A voided row is struck, reads "Removed", has no track and never holds.
  - A to-go draft reads the shipped "Not sent yet — goes to the kitchen when you pay", has no track and
    never holds.
  - A grocery row reads "In your basket" and never holds.
  - Two destinations bring back BillLines' group headings.
- **A solo table:** the button reads "Pay · $39.23", the rows show no owner, and the stub's Host reads
  "You".
- **A hostless table:** the stub shows only Sent.
- **Group split** (selfServeSplit parked): while held, the section reads "Ask at the counter, and our
  staff can split it for you." The shipped "Pay as one bill here — or…" returns only while the door is
  open (D5; SplitSection.tsx:297).
- **A secure tab:**
  - The note is hidden while parked or held.
  - Open, it reads "Your card is saved — pay here, or just leave and we’ll charge the bill to it." (D5).
- **A read failure:** keep the last good pass, claim nothing new. The foreground re-read heals it.
- **Night:** the page goes Night. The pass stays light paper with Night notches, the dock CTA is flat
  #e7a53a with #130d1e ink, and the ghost is --t2 Night.

### COPY (English)

- Morning Star
- Your bill
- Order · Bill · Pay
- Back to your order
- Cooking
- Table 7
- Host · Aye
- Sent · 6:14 PM
- 2 × Mohinga · $28.00 · Cooking · You
- Coconut Rice · $3.50 · Sent to kitchen · Aye
- Burmese Milk Tea · $4.00 · Served · Aye
- Subtotal · $35.50
- Sales tax · $3.73
- Total · $39.23
- Pay opens once everything’s served.
- Pay the whole order · $39.23
- Pay at the counter
- Menu · Order · Account
- [states]
  - Ready to pay.
  - Sending…
  - Served
  - Not sent yet
  - Undo
  - Send everything to the kitchen first — Pay opens once everything’s served.
  - Aye sends them — Pay opens once everything’s served.
  - Waiting for Aye to finish
  - Back to send them
  - Estimated total
  - includes $7.10 tip
  - Add a little extra?
  - It all goes to the team who made your meal.
  - None
  - Custom
  - On the house
  - Removed
  - Ask at the counter, and our staff can split it for you.
  - Your card is saved — pay here, or just leave and we’ll charge the bill to it.
  - Changed your mind? Pay on your phone
  - We’re not done yet

### COPY (Burmese) — shipped or briefed drafts only

- **သင့်ဘောက်ချာ.** cart.ts:21 `yourBill`.
- **သင့်အော်ဒါဆီ ပြန်သွားမယ်.** cart.ts:55 `backToYourOrder`.
- **ချက်နေဆဲ.** staff.ts:2804 `table.line.state.inProgress`, grounded on staff.ts:187 `kds.line.cooking`.
- **ပို့ပြီး.** staff.ts:2803 `table.line.state.fired` (K15-HIGH).
- **ထုတ်ပြီး.** staff.ts:2805 `table.line.state.served`, grounded on staff.ts:209 `kds.served.chip`.
- **စားပွဲ 7.** staff.ts:402 `floor.table` "စားပွဲ {id}", with Latin digits.
- **မုန့်ဟင်းခါး · အုန်းထမင်း · လက်ဖက်ရည်.** Menu data, MENU_REFERENCE.md:27, :55, :156.
- **အကြိုစုစုပေါင်း · ရောင်းခွန် · စုစုပေါင်း.** cart.ts:87, :91, :93.
- **တစ်စားပွဲလုံး ရှင်းမယ်.** cart.ts:95 `payWholeOrder`.
- **ကောင်တာမှာ ရှင်းမယ်.** cart.ts:99 `payAtCounter`.
- **[states]**
  - **မပို့ရသေး.** staff.ts:2802.
  - **ပို့နေပါတယ်….** cart.ts:56 `sending`.
  - **ပြန်ယူ.** staff.ts:2705 `table.send.undo` (D3).
  - **ခန့်မှန်း စုစုပေါင်း.** cart.ts:94.
  - **အပိုလေး ပေးမလား?** cart.ts:67.
  - **The team line.** cart.ts:72.
  - **မထည့်ပါ · စိတ်ကြိုက်.** cart.ts:76-77.
  - **စိတ်ပြောင်းသွားရင် ဖုန်းကနေ ရှင်းမယ်.** cart.ts:111.
  - **မပြီးသေးဘူးနော်.** m2 draft (m2-bill-at-table.md:450).
- **English only (no shipped MY; listed for K15):**
  - "Pay opens once everything’s served.";
  - both unsent reasons above;
  - "Ready to pay.";
  - "Host", "Sent" (stub labels);
  - "Waiting for Aye to finish";
  - "Back to send them" (m2's draft exists: ပြန်သွားပြီး ပို့မယ်, m2-bill-at-table.md:222);
  - "includes $7.10 tip";
  - "On the house";
  - "Removed";
  - the held split sentence;
  - the open secure-tab sentence.

### MOTION

- **The live update, played once on load to show the moment:**
  - Row 1's MIDDLE segment fills from the left: transform scaleX(0)→scaleX(1), transform-origin left,
    480ms cubic-bezier(0.2,0.8,0.2,1), delay 400ms, fill both.
  - Define it as `@keyframes passFill` in the helmet.
- **Honest liveness:** the head's 8px dot breathes, `@keyframes passBreathe`: opacity 1 → 0.55 → 1 and
  scale 1 → 0.82 → 1, 2.2s ease-out infinite. It is the shipped `timelinePulse`
  (globals.css:5944-5957).
  - It starts at 1000ms, after the fill, so only one thing moves at a time.
  - It breathes only while a dish is genuinely `in_progress`.
- **Nothing else moves.** The dock has no entrance. The arrow nudge is hover-only (shipped CTA rule).
- **Reduced motion** (the helmet's `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }`):
  - the segment is drawn already filled;
  - the dot is solid and still;
  - in the product, no pop either.

### A11Y

- **ONE live region:** the review step's status `<p>`.
  - Row progress is ambient and never announced.
  - The door's opening is said once ("Ready to pay.").
  - Every tap on the held Pay re-says its reason (the `statusSeq` remount, Checkout.tsx:887-898).
- **h1 "Your bill"** is the focus home on every stage flip (shipped).
- **The pass:**
  - `<section aria-labelledby="pass-h">`. The h2 reads "Cooking ချက်နေဆဲ Table 7 စားပွဲ 7".
  - The stub is a `<dl>`.
  - The notch, the seam, the tear and every track are aria-hidden: the word carries the state, never
    colour alone.
  - The rows are `<ul role="list" aria-label="Your bill">`. Each `<li>` reads name, MY, price, state,
    owner in DOM order.
- **Pay:**
  - A real `<button>` with `aria-disabled`, never native `disabled` (it stays reachable and reads its
    reason).
  - `aria-describedby="pay-line"`.
  - Name: "Pay the whole order · $39.23" + MY.
  - 64 tall.
- **The counter:** a `<button>`, 44 tall, named by its visible words.
- **Targets:** back 44, Pay 64, counter 44, tabs 44.
- **Contrast:**
  - "Cooking" --ac #a65f10 on #fffdf8 is about 4.8:1.
  - "Served" --ok on #fffdf8 is about 6.0:1.
  - --t3 owner text passes.
  - The held Pay is aria-disabled, which is exempt.
- **Every MY run:** `lang="my"`, Padauk 400/700, ≥13px, lh 1.6. Digits are Latin with `tn`.
- **Forced colours:** the notches hide, the perforations stay dotted CanvasText, and the segments flatten
  to CanvasText outlines (the words carry it).

---

## SCREEN picked-m10-2.dc.html — Everything served: the pass boards, Apple Pay leads

- **Device:** phone 390×844. **Theme:** light. **Interactive:** no.
- **Who and when:** Thiri, 6:48 PM. Mom bumped the last dish, so the door opened ("Ready to pay." was
  said once). Thiri lit 20%, tapped "Pay the whole order · $46.33", and create-intent answered.
- **Drawn state:** the pay step, revealed, with a wallet present on this iPhone. The card form is folded
  behind one tap.
- **Held-keys variant:** this screen never exists. The table sees picked-m2-1 with every row Served,
  "The counter takes cash." and the counter door only.

### LAYOUT (same column and paddings)

- **0–47:** empty.
- **47–103:** AppHeader, as screen 1.
- **At the top of main:** nothing. The pay step's ONE region lives inside PaymentSection, below.
- **127–176: h1 "Your bill" + "သင့်ဘောက်ချာ",** as screen 1 (Checkout.tsx:1269-1271 keeps it on
  the pay step).
- **182–202: step rail.** Order ✓ done, Bill ✓ done (both solid --ok discs, sr " — done"), then **Pay
  (current):** a --ac disc with "3" in --oa, label --ac-strong, `aria-current="step"`.
- **206–250: back link,** a `<button>` nav-link: ← "Back to review" 14/700 --ac, then "ဘောက်ချာဆီ
  ပြန်သွားမယ်" Padauk 13/400 --t3 inline.
- **258–581: THE ONE PASS, boarded.**
  - **HEAD 258–354:**
    - Status row: a solid 16px --ok disc with a 10px --oa check (aria-hidden), then "Served" 11/700,
      tracking 0.13em, uppercase, --ok, then " · " --t3, then "ထုတ်ပြီး" Padauk 13/700 --ok.
    - Figure row: "Table 7" + "စားပွဲ 7", exactly as screen 1.
    - Stub: Host / Aye, Sent / 6:14 PM, unchanged from screen 1. The status flipped in place; nothing
      else moved.
  - **SEAM 354–370.**
  - **BODY 370–570:** padding 6 16 8. These are the LOCKED lines `payTotals` was minted from
    (Checkout.tsx:2811-2847).
    - **376–448: compact rows,** `<ul role="list" aria-label="Your bill">`, three rows of 24 with
      hairlines between them. There is no track and no state word: the head already says every dish is
      served, and no fact is marked twice. There are no owners either: the payer pays the whole order.
      - "2 × Mohinga" 15/600 + "မုန့်ဟင်းခါး" Padauk 13 --t2 ……… "$28.00" 15/600 tabular;
      - "Coconut Rice" + "အုန်းထမင်း" ……… "$3.50";
      - "Burmese Milk Tea" + "လက်ဖက်ရည်" ……… "$4.00".
    - **454–519: money rows:** border-top 1px --bd, padding-top 4, 14px, rows of 20 with dotted
      leaders:
      - "Subtotal · အကြိုစုစုပေါင်း ···· $35.50";
      - "Sales tax · ရောင်းခွန် (10.5%) ···· $3.73" (the note is TAX_NOTE, Checkout.tsx:123, in
        --t3);
      - "Tip · တစ်ပ် ···· $7.10".
    - **525–562: the foot,** border-top 1px --bd, padding-top 8, baseline row.
      - Left: "Total" 16/800 and "စုစုပေါင်း" Padauk 13 --t3 INLINE (one line, to keep the pay block in
        view).
      - Right: "$46.33" Fraunces 21/800, tabular. This is the charged figure, `payTotals.totalCents`.
  - **TEAR 570–581.**
- **591–739: THE PAY BLOCK** (PaymentSection, revealed). A flex column.
  - **591–639: APPLE PAY, the hero** (the Express Checkout element, PaymentSection.tsx:713-724,
    `buttonHeight: 48`).
    - Draw a `<button aria-label="Apple Pay">`: full width, 48 tall, radius 999, bg #000000 (Apple's own
      black, `expressButtonTheme` light → black, stripe-appearance.ts:194-200), no border.
    - Centred content, gap 8, both in #ffffff:
      - a generic WALLET glyph, an 18px stroke svg (a rounded rectangle with a flap and a clasp dot),
        aria-hidden;
      - the wordmark placeholder "Pay", Hanken 18/600, tracking -0.01em.
    - **NEVER Apple's logo artwork.**
  - **647–691: PAY WITH CARD,** a paper secondary disclosure, `<button aria-expanded="false"
aria-controls="card-form">`. - Full width, 44 tall, radius 999, bg #fffdf8, 1px --bd, inset sheen, 15/700 --tx, centred, gap 8. - A card glyph (a 18px stroke rectangle with a stripe, aria-hidden), "Pay with card", then a 16px
    chevron-down in --t3, aria-hidden. - Beneath it sits `<div id="card-form" hidden>`. The Payment Element is mounted there, folded.
  - **695–739: PAY AT THE COUNTER,** a quiet ghost `<button>`, 44 tall, transparent.
    - Two centred lines: "Pay at the counter" 15/700 --t2, then "ကောင်တာမှာ ရှင်းမယ်" Padauk 13/400
      --t3.
- **Below (under the tab bar, not visible):**
  - PaymentSection's note row, empty while folded;
  - the region;
  - "← Edit order".
- **750–844:** the diner tab bar, as screen 1 (Order current).

### STATES (not drawn; for the build)

- **The Bill a moment earlier** (the open door, the step before this one): see screen 1's "THE DOOR
  OPENS". Thiri lit 20%, so the foot read "Estimated total · $46.33 · includes $7.10 tip", and Pay
  read "Pay the whole order · $46.33".
- **Pay with card tapped:**
  - The disclosure flips (`aria-expanded="true"`, chevron up). The Payment Element unfolds beneath
    it: height over `--dur-base` (240ms), instant under reduced motion.
  - Then come the secure note (a lock + "Your card number goes straight to Stripe, our secure payment
    service — we never see it." + its MY), the region, the card's own submit "Pay $46.33" (filled; the
    card path's hero, `payProceedLabel`), "Pay at the counter" and "← Edit order".
  - Apple Pay stays above. Focus stays on the toggle (the WAI disclosure pattern).
- **No wallet at reveal** (no Apple Pay or Google Pay on this device, or the domain not yet registered
  — C10/C15): today's layout, unchanged.
  - The card form is open, with no disclosure and no divider.
  - "Pay $46.33" is the one hero, followed by "Pay at the counter" and "← Edit order".
- **A late wallet** (it arrives after the reveal): today's behaviour. The wallet rises above the open
  form and nothing folds. **The fold is decided ONCE, at the reveal, from the settled wallet state**
  (`payElementView`, lib/pay-element.ts:216-240). It is never re-decided, so no control moves under a
  thumb.
- **Pay at the counter tapped:**
  - Busy shows "One moment…" at full ink with `aria-busy`.
  - It runs the shipped `leavePay` (Checkout.tsx:2416), which releases the pay-window lock, then the
    shipped `askCounter` (Checkout.tsx:1967) once the Bill is back. The phone lands on m2's counter
    pass.
  - On either refusal it lands on the Bill with the shipped "Couldn’t reach the counter just now —
    please try again." and the Bill's own counter door.
- **The wallet sheet is cancelled:** the step stays as drawn. Stripe's sheet says nothing more.
- **A decline or a confirm error:** PaymentSection's shipped region and copy (PaymentSection.tsx:473-504).
- **The card form fails:** the shipped failure card, naming the counter (`counterDoor`,
  Checkout.tsx:2857; cart.ts:175-210).
- **A recall lands while this step is open:** nothing changes here. The door was checked at
  create-intent, and D5 puts no gate at fulfillment, so a charged card is never stranded.
- **Night:** the Apple Pay button is white with black ink (`expressButtonTheme` dark), and the pass stays
  light paper.
- **Payment succeeds:** Stripe redirects to `/track?cart=…` (PaymentSection.tsx:339). That is
  screen 3.

### COPY (English)

- Morning Star
- Your bill
- Order · Bill · Pay
- Back to review
- Served
- Table 7
- Host · Aye
- Sent · 6:14 PM
- 2 × Mohinga · $28.00
- Coconut Rice · $3.50
- Burmese Milk Tea · $4.00
- Subtotal · $35.50
- Sales tax (10.5%) · $3.73
- Tip · $7.10
- Total · $46.33
- [Apple Pay button, visible placeholder] Pay
- [its accessible name] Apple Pay
- Pay with card
- Pay at the counter
- Menu · Order · Account
- [states]
  - Pay $46.33
  - Edit order
  - Your card number goes straight to Stripe, our secure payment service — we never see it.
  - One moment…
  - Couldn’t reach the counter just now — please try again.

### COPY (Burmese) — shipped or briefed drafts only

- **သင့်ဘောက်ချာ.** cart.ts:21.
- **ဘောက်ချာဆီ ပြန်သွားမယ်.** cart.ts:217 `payBackToReview`. Its EN is this control's own words,
  verbatim.
- **ထုတ်ပြီး.** staff.ts:2805.
- **စားပွဲ 7.** staff.ts:402.
- **Dish names.** MENU_REFERENCE.md:27, :55, :156.
- **အကြိုစုစုပေါင်း · ရောင်းခွန် · တစ်ပ် · စုစုပေါင်း.** cart.ts:87, :91, :92, :93.
- **ကောင်တာမှာ ရှင်းမယ်.** cart.ts:99.
- **[state] ကတ်အချက်အလက်တွေက Stripe ဆီ တိုက်ရိုက် သွားပါတယ် — ကျွန်တော်တို့ဆီ မရောက်ပါဘူး။**
  cart.ts:158 `payFormSecure`.
- **English only (listed for K15):**
  - "Pay with card";
  - "Host", "Sent";
  - "Pay $46.33" and "Edit order" (shipped EN-only);
  - "One moment…";
  - the counter failure sentence.
- **Stripe renders the wallet button's own words.**

### MOTION

- **The reveal, once:** the pay block (Apple Pay, Pay with card, Pay at the counter) rises.
  - translateY(8px)→0 and opacity 0→1, 480ms cubic-bezier(0.2,0.8,0.2,1), fill both.
  - It is the shipped `.pay-live mms-rise` on reveal (PaymentSection.tsx:700; globals.css:1062-1088).
  - Define it as `@keyframes payRise`.
- The pass is still: it was already on screen on the Bill.
- **Reduced motion:** the block is simply there.

### A11Y

- **ONE live region:** PaymentSection's `role="status"` (sr-only here). The Bill's region is unmounted
  on this step.
- **Focus:** on reveal, focus goes to the pay stage group "Card details" with `preventScroll`
  (PaymentSection.tsx:306), as shipped.
- **Apple Pay:** Stripe's button carries its own accessible name. In the artboard,
  `aria-label="Apple Pay"`. 48 tall.
- **Pay with card:** a disclosure, `aria-expanded` + `aria-controls`, 44 tall.
- **Pay at the counter:** a `<button>`, 44 tall, named by its visible words.
- **The pass:** h2 "Served ထုတ်ပြီး Table 7 စားပွဲ 7". The rows list keeps its name. The ✓ disc,
  notch, seam and tear are aria-hidden.
- **Targets:** back 44, Apple Pay 48, card 44, counter 44.
- **Contrast:**
  - "Served" --ok on #fffdf8 is about 6.0:1.
  - "Pay with card" --tx on paper passes.
  - "Pay at the counter" --t2 on #faf9f5 is about 5.6:1.

---

## SCREEN picked-m10-3.dc.html — Paid: the stub is stamped, the receipt prints, thank you

- **Device:** phone 390×844. **Theme:** light. **Interactive:** no.
- **Who and when:** Thiri on `/track` after Apple Pay, 6:52 PM. It is a fresh arrival (`justPaid`), and
  the order has landed (`arrived`), so this is the dine-in settled arm (OrderTracker.tsx:362-363).
- **Held-keys variant:** the same screen, reached through Dad's cash settle (`/track?cart=…&paid=1`,
  app/track/page.tsx:138-156). The receipt line then reads "Paid in full · Cash".

### LAYOUT (same column; padding 24/20/40)

- **0–47:** empty.
- **47–103:** AppHeader, as before.
- **127–224: the thank-you** (PaySuccess, centred, text-align centre). **Its 72px ✓ ring is not drawn
  here:** on a dine-in table it moves onto the pass as the stamp, so "paid" is marked once.
  - **127–155: h1 "Paid — thank you!"** Fraunces 26/600, lh 1.08, tracking -0.02em, --tx.
  - **157–184:** "ရှင်းပြီးပါပြီ။ ကျေးဇူးပါ" Padauk 17/700, lh 1.6, --tx, a block inside the h1
    (globals.css:2065-2075).
  - **194–224: the Stars pill,** centred.
    - Padding 7 16, radius 999, bg #f4eadc (the --ac 12% mix over paper), ink --ac-strong 14/800.
    - "✦" (aria-hidden) then "+1 Star earned".
- **236–280: the one sentence.** Centred, 15/400, lh 22, --t2, two lines: "Your table is settled — your
  server will take it from here."
  - This is the shipped no-number wording, OrderTracker.tsx:818. The pass already names Table 7, so
    the sentence does not repeat it.
- **292–661: THE ONE PASS, stamped.**
  - **HEAD 292–388:**
    - **Main,** the h2:
      - status row: "Paid" 11/700, tracking 0.13em, uppercase, --ok, then " · " --t3, then
        "ငွေရှင်းပြီး" Padauk 13/700 --ok. The row carries no glyph: the stamp in the stub is its
        glyph.
      - figure row: "Table 7" + "စားပွဲ 7", exactly as before.
    - **Stub (the stamped stub):**
      - bg --okb #eaf2ec. The stub is green only where the payment just landed.
      - A centred column, gap 6, `class="ph-no-capture"`.
      - **THE STAMP:** a 44px svg, aria-hidden. A circle r 20 filled #fffdf8, stroke #346e47 2.5. A
        check path `M14 23 l6 6 L31 16` (scaled from PaySuccess's `M15 27 l7.5 7.5 L37.5 19`), stroke
        #346e47 4, round caps and joins.
      - **THE CODE:** "#7C2E9A" 13/800, tracking 0.05em, tabular, --tx, aria-hidden. Its sr-only twin
        reads "Order reference 7 C 2 E 9 A".
  - **SEAM 388–404.**
  - **BODY 404–650:** padding 8 16 10.
    - **412–432:** "Paid in full · Card" 13/400 --t2 (`receiptStatusLabel`, refund-view.ts:83-87;
      `tenderLabel`, receipt-view.ts:89-94). The shipped "· Table 7" clause is dropped: the head names
      the table.
    - **436–526: the items,** `<ul role="list" aria-label="Items">`, three rows of 30 (padding 6 0),
      the picked-m3-2 history-line look:
      - the qty token "2" + aria-hidden "×" 12/800 --ac-strong;
      - the name 14/400 --tx;
      - the price 14 --t2, tabular.
      - "2× Mohinga $28.00" · "1× Coconut Rice $3.50" · "1× Burmese Milk Tea $4.00".
      - English only: the order's snapshot names (`qr_order_items`, track-order.ts:22-23, has no
        Burmese column).
    - **532–597: money rows:** border-top 1px --bd, padding-top 4, 14px, rows of 20 with dotted
      leaders, the receipt's own labels (receipt-view.ts:42-51):
      - "Subtotal ···· $35.50";
      - "Tax ···· $3.73";
      - "Tip ···· $7.10".
    - **603–640: the foot:** border-top 1px --bd, padding-top 8. "Total" 16/800 left; "$46.33"
      Fraunces 21/800, tabular, right.
  - **TEAR 650–661.**
- **673–717: the receipt door** (ReceiptActions, OrderTracker.tsx:1485), a left-aligned nav-link, 44
  tall: "View & print your full receipt" 14/700 --ac, then a → arrow, aria-hidden.
- **Below (from 721; under the tab bar, not drawn):**
  - "Email me this receipt";
  - the goodbye beat: the Stars ring, then "ကျေးဇူးတင်ပါတယ် Kyay-zu tin ba de — see you next time"
    (GoodbyeBeat.tsx:70-75);
  - the feedback ask;
  - the contact foot.
- **750–844:** the diner tab bar, Order current, no capsule.

### STATES (not drawn; for the build)

- **Before the order lands** (the webhook's seconds):
  - PaySuccess's title and pill show at once.
  - The region says the shipped "Payment confirmed — finishing your order."
  - The pass mounts on the arrival edge, already stamped (see MOTION). Past tense on the pass waits
    for the confirmed order row.
- **A revisit** (`resume=1`, a Back to the return URL): no stamp motion and no print. The latch is
  shipped in PaySuccess.tsx:86-91.
- **Partly refunded:**
  - The status row reads "Partly refunded" (EN, refund-view.ts:85), in --t2, with no stamp.
  - The stub falls back to --sf with only the code.
  - The receipt adds the shipped "Refunded" and "You paid" rows (refund-view.ts:98-104).
- **Fully refunded:** the shipped refund arm. **Never** a stamp, never "Paid".
- **A table that also bought a to-go box:** the to-go rail. This arm does not apply (OrderTracker.tsx:363).
- **Reduced motion:** the stamp is fully drawn and the receipt rests; nothing moves.

### COPY (English)

- Morning Star
- Paid — thank you!
- +1 Star earned
- Your table is settled — your server will take it from here.
- Paid
- Table 7
- #7C2E9A
- [sr-only] Order reference 7 C 2 E 9 A
- Paid in full · Card
- 2× Mohinga · $28.00
- 1× Coconut Rice · $3.50
- 1× Burmese Milk Tea · $4.00
- Subtotal · $35.50
- Tax · $3.73
- Tip · $7.10
- Total · $46.33
- View & print your full receipt
- Menu · Order · Account
- [region, sr-only] Paid in full — your table’s bill is paid.
- [states]
  - Payment confirmed — finishing your order.
  - Partly refunded
  - Refunded
  - You paid
  - Paid in full · Cash
  - Email me this receipt

### COPY (Burmese) — shipped or briefed drafts only

- **ရှင်းပြီးပါပြီ။ ကျေးဇူးပါ.** cart.ts:133 `paidThankYou`.
- **ငွေရှင်းပြီး.** staff.ts:394 `floor.status.paid`. It is Dad's floor word for this same table.
- **စားပွဲ 7.** staff.ts:402.
- **[below the fold] ကျေးဇူးတင်ပါတယ်.** GoodbyeBeat.tsx:72, shipped.
- **English only (listed):**
  - "+1 Star earned";
  - the settle sentence;
  - "Paid in full · Card";
  - the receipt's row labels and dish names (a snapshot record);
  - "View & print your full receipt";
  - the region sentence.

### MOTION (a stamp, then a print; never together)

1. **The stamp lands,** on the arrival edge of a fresh payment. These are the PaySuccess keyframes,
   moved onto the stub (globals.css:2018-2063).
   - The circle scales 0→1 over 480ms, cubic-bezier(0.34,1.56,0.64,1) (the `--spring` stand-in),
     transform-origin centre. Define it as `@keyframes stampRing`.
   - The check draws: stroke-dasharray 40, stroke-dashoffset 40→0, 480ms, cubic-bezier(0.2,0.8,0.2,1),
     delay 150ms, forwards. Define it as `@keyframes stampDraw`.
2. **The receipt prints, starting at 640ms.** The body plus the tear reveal top→bottom:
   - clip-path inset(0 0 100% 0) → inset(-24px -32px -44px -32px), with translateY(8px)→0;
   - 1.05s, cubic-bezier(0.22,1,0.36,1), fill both;
   - the shipped `mmsPrintReveal` (globals.css:753-768). Define it as `@keyframes passPrint`.
   - The head does not move: it is the same pass the guest saw on the Bill.
3. **The shipped confetti, haptic and paid chime stay,** gated by PaySuccess's own rules. They are not
   drawn on the artboard: one thing moves at a time.

- **Reduced motion:** the stamp is static and fully drawn, the receipt is at rest, and there is no print
  head.

### A11Y

- **ONE live region:** /track's sr-only `role="status"` (OrderTracker.tsx:588-638) says "Paid in full —
  your table’s bill is paid." (:600).
- **h1:** PaySuccess's title, with the MY inside it.
- **The pass:**
  - `<section aria-labelledby="pass-h">`. The h2 reads "Paid ငွေရှင်းပြီး Table 7 စားပွဲ 7".
  - The stamp svg is aria-hidden.
  - The code is aria-hidden visible text, with a spaced sr-only twin. Both carry `ph-no-capture`.
- **The receipt:** `<ul role="list" aria-label="Items">`.
- **Targets:** the receipt link 44, tabs 44.
- **Contrast:**
  - "Paid" --ok on #fffdf8 is about 6.0:1.
  - The code --tx on --okb passes.
  - The pill's --ac-strong on #f4eadc passes 4.5:1.

---

## DATA (what each screen reads; what does not exist yet, and who builds it)

### Screen 1

- **Reads that exist:**
  - `getCartView` → `viewItems`: `lineState`, `fulfillment`, `qty`, `name`, `nameMy`, `fireAt`,
    `comped`, `bySeat`, `unitPriceCents` (packages/db/src/index.ts:32-71).
  - `getCartTotals` → `totals`.
  - `splitContext`: members and the host (lib/split.ts:79-98).
  - Realtime on `qr_cart_items` + `qr_carts` (lib/realtime.ts:172-180), coalesced
    (Checkout.tsx:884-885).
  - The foreground re-read (Checkout.tsx:1750-1757).
  - "Served" is the KDS bump: `mms_line_transition` → served or `mms_bump_ticket`, both of which stamp
    `bumped_at` (p2f_counter_cook_before_paid.sql:382-427).
  - Mom's per-line Start/Done (KdsBoard.tsx:1817).
  - A recall is in_progress within 2 minutes (w3_kitchen.sql:215-231).
- **Derived, no new read:**
  - "Sent 6:14 PM" is the earliest past `fireAt` of the non-draft, non-voided lines.
  - The head's status is the roll-up above.
  - **There is no "served at" time:** `CartItem` carries no `bumpedAt`, so the pass never shows one.
- **New, diner-cart:**
  - `SURFACES.dineInPhonePay` (PD2; D1(b) gives `surfaces.ts` to diner-cart).
  - D5's pure verdict in `lib/checkout-stage.ts`. It is fed from `viewItems` on the client and from raw
    rows on the server, with the mutants D5 names.
  - `payBlock` gains `kitchen` in `checkout-verb.ts`, with precedence peer > unsent > kitchen > grace.
    - `payBlockCopy("kitchen")` = "Pay opens once everything’s served."
    - The guest unsent arm becomes "{host} sends them — Pay opens once everything’s served." while the
      flag is on.
    - The counter door's block passes kitchen=false.
    - `billDoorLabel` reads the new block.
  - The tip preview is zeroed while held (Checkout.tsx:2657 widens).
  - A new pure module (e.g. `lib/one-pass.ts`) with `passStatus(items)` and `passSentAt(items, now)`,
    with mutants.
  - The pass component, replacing BillLines on the Bill stage only while `dineInPhonePay` is on.
  - The kitchen-edge effect: "Ready to pay." once, plus the label pop (a sibling of
    Checkout.tsx:2525-2547's grace edge).
- **New, money-rails:**
  - create-intent's two refusals, in D5's order: the parked refusal, then D5's verdict.
    - The verdict comes from ONE error-aware read of `qr_cart_items` (`state`, `fulfillment`), the
      `readKitchenDraftUnits` pattern (lib/unsent-read.ts:24-34). It fails CLOSED with the shipped 503
      sentence (route.ts:72).
    - Both release the lock.
    - Placed beside the unsent refusal (route.ts:214-223): after the session read (:151-163) and
      before the pickup block (:229), the promo pin and `paymentIntents.create`.
  - A parse-based check script for the call.
  - It reads `dineInPhonePay`; it never edits `surfaces.ts` (D1(b)).
- **New, counter-floor (not drawn):** Dad's pane cash-only line after the flip: "No card reader — take
  cash, or they can pay by card on their phone once everything’s served." It needs a K15 Burmese draft.

### Screen 2

- **Reads that exist:**
  - create-intent → `clientSecret` + `payTotals` (Checkout.tsx:2811-2858).
  - The reveal machine, including `wallet: "available"` (lib/pay-element.ts:216-240).
  - The Express and Payment Elements (PaymentSection.tsx:697-751).
  - `counterDoor={isDineIn}` is already passed (Checkout.tsx:2857).
- **New:**
  - **The fold:** a pure `cardFoldedAtReveal(state)` in `lib/pay-element.ts`, with a mutant. It is
    true only when the wallet is available at the reveal.
  - **PaymentSection draws** "Pay with card", the folded card form and "Pay at the counter" (via a new
    `onCounter` callback).
  - **No stream owns `PaymentSection.tsx` or `lib/pay-element.ts` this wave** (diner-cart's card,
    "FILES YOU OWN", omits both). The recommendation is a scoped unfreeze to diner-cart, the D1(a)
    shape. Both files are in `verify:slice`'s mutate set.
  - **Checkout's counter composite** (`leavePay` → `askCounter`), diner-cart.
  - **The compact BillLines variant** for the pay step, diner-cart.
- **Not built:** naming the wallet on the receipt. The order records tender `card`. Saying "Apple Pay"
  would need a read of the charge's `payment_method_details.card.wallet` (money-rails), so the receipt
  honestly says "Card".

### Screen 3

- **Reads that exist:**
  - The tracked order: `table_number`, `tender`, totals, lines, `id`, `created_at`
    (lib/track-order.ts:22-23).
  - The refund summary (refund-view.ts).
  - The rewards progress.
  - `justPaid` / `arrived` / `dineInSettled` (OrderTracker.tsx:526-559, :362-363).
- **New, post-pay:**
  - The pass replaces the dine-in settled card (OrderTracker.tsx:797-827) and absorbs the receipt
    slip's header row (its code goes to the stub, the table to the head).
  - PaySuccess gains a prop that omits its ring when the dine-in pass carries the stamp.
  - **Prerequisite for ONE mark:** /track must know it is a dine-in table at first paint. That is
    post-pay's planned first-paint mode read (cards/final-post-pay.md:128). Without it PaySuccess draws
    its ring before the order lands, and the pass's stamp lands static: two ✓ marks until the read
    ships.

---

## DECISIONS

1. **ONE pass, one anatomy.**
   - It is m3's ticket head (main 250 | stub 100, dotted perforation, notch) joined by m2's seam to a
     receipt body with m2's torn foot.
   - It is constant paper in both themes.
   - Its figure tiers are 40px for the holder and 88px across the counter, never a third.
   - m10 is the moment that joins m1, m2 and m3 into a single object.
2. **The pass speaks the family's own console words.**
   - Sent ပို့ပြီး, Cooking ချက်နေဆဲ and Served ထုတ်ပြီး (staff.ts:2803-2805), and Paid ငွေရှင်းပြီး
     (staff.ts:394).
   - What Thiri reads is what Mom's board and Dad's table page say about the same dish.
   - The guest's English stays DINER_STATE_COPY (line-state-copy.ts:12-18).
3. **The receipt IS the progress view (D5).**
   - Each dish has a three-segment Live-Activity track and its word.
   - No tallies ("2 of 3"), no ETA, no thumbs, and rows never re-sort.
   - Liveness breathes only while a dish is truly cooking (TableTimeline's honest rule).
4. **The held door is D5, exactly.**
   - Pay keeps its name and amount, dimmed and `aria-disabled`.
   - Its one reason is in the dock's one fixed slot.
   - The counter is the live, quiet secondary.
   - No tip is asked before the food.
5. **The line says "Pay", not "card and Apple Pay".** The wallet button renders only when the phone
   has a wallet AND the domain is registered (PaymentSection.tsx:704-707; C10, C15). Naming Apple Pay
   would promise what an Android phone or an unregistered domain will not show. The honest line is
   D5's own: "Pay opens once everything’s served."
6. **Apple Pay leads the pay step; the card waits one tap behind it.**
   - Only when a wallet is present at the reveal; that decision is made once and never re-made.
   - Otherwise today's open card form stays.
   - This keeps one hero per state and fits the boarded pass, the wallet, the card and the counter in
     one first view.
   - D5's "Apple Pay above the card form" holds: the form is beneath, folded.
7. **The counter stays reachable from the pay step.** It is one quiet tap, composed from two shipped
   writes (`leavePay`, then `askCounter`), with no new server write.
8. **The stamp moves onto the pass.**
   - On a dine-in table PaySuccess keeps its title, Stars and confetti; its ✓ ring becomes the stub's
     stamp (one mark).
   - The receipt prints beneath it afterwards, in sequence.
9. **The slot's at-rest words after the door opens are "Ready to pay."** That is the visual twin of
   the one-time announcement, and it keeps the slot's height constant.
10. **The opening pop rides the label layer.** The shipped `mmsPop` peaks at 1.18
    (globals.css:903-913); on the 366px box it would overflow the viewport.
11. **No sound, no haptic, no auto-scroll when the door opens.** Nobody is hurried to pay.
12. **D3 is applied:** the phone's Send undo reads "Undo · ပြန်ယူ" (staff.ts:2705). Inside the undo
    window the row's words are "-ing" ("Sending…") on a dashed segment. Past tense comes only after
    the grace.
13. **Before C2, PD2's Bill keeps its pay furniture exactly** (D5). Its line rows become the pass body with kitchen tracks (open risk 15, decided YES in round 3; PD10).
14. **The example continues m1's Table 7** (Aye host, Thiri guest), plus a drink. It shows that tea
    must be bumped too, which is D5's own device-sitting condition.
15. **Stub fields are the person and the time.**
    - On /cart: Host and Sent. Host matches the name on Dad's floor card.
    - On /track: the stamp and the code. /track has no host read, and none is added.

## OPEN RISKS

1. **C2 holds everything real.** The keys are test today, so the door stays dormant behind the flag.
   The flag flips in its own PR only after D5's three conditions: live keys verified; PD2 and PD10 merged; drinks confirmed bumped at the device sitting. Right after it deploys, one real Apple Pay payment for the cheapest dish at a table, refunded from Today's payments & refunds, proves it; a failed proof reverts the flip. Until then screens 1 and 2 are a design, not a
   path.
2. **Drinks and sides must be bumped on Mom's board, or the door never opens.** The app cannot see a
   plate reach the table; "Served" means the KDS bump. Device sitting #12.
3. **A recall can close the door after "Ready to pay."** It runs within 2 minutes
   (w3_kitchen.sql:215-231).
   - The reason returns silently in the slot.
   - A guest already past create-intent pays anyway, because D5 puts no gate at fulfillment.
   - That is honest but slightly awkward. Watch it at the sitting.
4. **"Before any Stripe call" cannot hold literally, and must not.** `supersedeCartIntent` (route.ts:125) cancels a predecessor intent at Stripe before the session read (:151) that the refusals need. That order is deliberate (M151) and is a rule, not an option: both new refusals free the lock, and freeing it while a predecessor can still be confirmed is #257's CRITICAL. So both sit after the supersede and its captured / unknown exits, and before the slot, the promo pin and `paymentIntents.create`; the parse-based check fails if either refusal runs before the supersede statement finishes (PATH_DESIGN D5).
5. **The fold touches two unowned, mutated files** (PaymentSection.tsx, lib/pay-element.ts).
   - Its owner is decided: diner-cart, under D1's scoped unfreeze.
   - It needs a second remembered reserve (or a fixed folded height) beside `mms.payElementH.v1`.
   - It needs a component case per wallet state.
   - **Fallback:** today's open form, with "Pay at the counter" at the foot.
6. **The pay step's first view is tight:** about 11px above the tab bar. A promo or reward row (+20px
   each), or a two-destination bill, pushes "Pay at the counter" under the tab bar. It stays reachable
   by scroll; check it on a device at 375 and 390.
7. **The counter composite chains across `history.back` / popstate** (`leavePay` may go through the
   hash). It needs a Checkout component test for both refusal paths, and one for a peer lock appearing
   between the two writes.
8. **One ✓ mark on /track depends on post-pay's first-paint mode read.** Until it ships, the dine-in
   paid screen shows PaySuccess's ring plus a static stamp.
9. **The receipt says "Tax" while the Bill and the pay step say "Sales tax".** That is the same pass
   with two labels (receipt-view.ts:48 against cart.ts:91). post-pay may align the live label; the
   historical disclosure rule does not apply to a row label.
10. **The phone must be open to see progress.** A web app cannot run an iOS Live Activity or a push.
    The pass updates only while /cart is open, and catches up on return (the foreground re-read). No
    copy claims otherwise.
11. **ပို့ပြီး is K15-HIGH, and staff words now reach guests.** The native sitting checks that ပို့ပြီး,
    ချက်နေဆဲ, ထုတ်ပြီး and ငွေရှင်းပြီး read naturally to a guest, not only to the family.
12. **The new English-only strings** (listed in each COPY section) need K15 drafts. Money words come
    first: "Pay opens once everything’s served.", the two unsent reasons, and Dad's after-flip
    cash-only line.
13. **A tip chosen, hidden by a recall, reappears lit when the door reopens.** It is the guest's own
    choice, but it was never "none pre-selected" the second time. Confirm at the sitting, or reset the
    rate on the close edge.
14. **The "Served" head over a comped dish still cooking** cannot happen (a cooking dish holds both the
    door and the status). The "On the house" row must keep its track, unlike today's BillLines, which
    replaces the state word.
15. **Owner option, not taken by default:** the pass's progress rows carry no money semantics and could
    ship on PD2's counter-only Bill before C2, so guests see their food move today. Decided YES in round 3 (appendix A5): the rows ship before C2; only the pay furniture waits.
16. **Screen 2 draws ONE wallet button because ruling #7's card-only constant (M155) is a C2
    prerequisite (ruling #8).** Today create-intent asks for `automatic_payment_methods`
    (route.ts:540), which could put a Link or other button beside Apple Pay in the Express row. If C2
    ever flipped before M155, the hero row would not look like this screen.

---

## Appendix — what changed after this spec (applied in the drawn screens)

The spec above was written first. The round-3 consistency pass and an adversarial critic then changed it, and
the screens on the canvas were drawn with both applied. **Where an item below contradicts the spec above, the
item below wins**, and PATH_DESIGN_2026-10-07.md (its round-3 section) wins over both.

### A · System amendments (the round-3 consistency pass)

1. Track: colour is the stage.

- Sent: 1/3 in --pass-ink-2. Cooking: 2/3 in --pass-ink. Served: 3/3 in --pass-ok. Each word takes its segment's ink.
- Retire the per-segment [done][now] scheme and accent on the track or its word. On the Bill, accent is spent only on the Pay door and the rail.
- The grace segment is a dashed --pass-ink-2 outline with 'Sending… · ပို့နေပါတယ်…'.

2. The head status is the roll-up mark plus its word: ring, dashed, 1/3, 2/3, or 3/3 green.

- Delete the 8px dots and passBreathe: nothing loops on a pass.
- Delete the ✓ disc on the Served head. On a dine-in pass a ✓ is only screen 3's Paid stamp.

3. One figure: the label 'Table · စားပွဲ' beside a single Fraunces 600 figure at the 40px holder tier.

- Retire the doubled 'Table 7' plus 'စားပွဲ 7', and the Hanken 800 numeral (Hanken 800 is the code face).
- --pass-\* inks and --pass-hole come from the primitive.

4. The door moment:

- POP (0.96→1, 180 ms) on the whole Pay button, not mmsPop on the label layer.
- The moment (aria-disabled lifts, the head TURNs to Served, the region says 'Ready to pay.' once, the POP) waits KDS_UNDO_MS after the phone OBSERVES the last line served. A bump Mom undoes inside her 6 s therefore never opens the door.
- A door already open on mount or on a foreground re-read is drawn open, with no TURN, POP or announcement.
- Rows FILL on arrival. D5's server gate is unchanged.

5. Pre-C2: open risk 15 is decided YES. PD10's progress rows ship on PD2's counter-only Bill before C2, and the flag gates only the pay furniture.
6. TimelineStrip:

- Never drawn in the same view as the One Pass.
- Elsewhere it uses the stage keys and the track glyph. 'Served · ရောက်ပါပြီ' (a claim that the plate arrived) retires to ထုတ်ပြီး, 'Being made' and 'With the kitchen' retire to Cooking and Sent to kitchen, and its breathing dot becomes the static glyph.
- TableTimeline.tsx and lib/line-state-copy.ts are on no card. Scope them to diner-cart.

7. Ownership:

- PaymentSection.tsx and lib/pay-element.ts get a scoped unfreeze to diner-cart in the D1(a) shape; D1 decides it, with no further yes.
- lib/kitchen-track.ts comes from kitchen-ops.
- The pass and track primitives come from post-pay.
- Wallet names never appear in the slot, a reason or a hero (decision 5). That matches m11's rule.

### B · The adversarial critic's blocking fixes (verdict: fix)

1. **The pass head's dot breathes. The binding motion language allows PULSE for ALARM only (KDS Late), and no pass, track or TV element may loop or breathe.**
   - Evidence: picked-m10.md:156 ('it breathes; see MOTION'), :245 ('breathing --ac dot'), :397-401 (`passBreathe` 2.2s infinite, copied from timelinePulse at globals.css:5944-5957), Decision 3 at :902 ('Liveness breathes only while a dish is truly cooking'). This breaks the vocabulary rule 'PULSE: ALARM only … No pass, track, TV element or guide picture loops or breathes', and PATH_DESIGN_2026-10-07.md:118-123 ('Late keeps the board's only motion'). RULES2.md allowed a 'live' pulse, but the vocabulary added this round supersedes it.
   - Fix: Delete `passBreathe` and the 'breathes' clause in Decision 3. The head carries the stage word (and at most a still glyph). Liveness is shown only by a segment FILL when a stamp actually lands.
2. **The per-dish track does not follow the ONE KITCHEN TRACK. It uses accent as a progress colour, mixes colours per segment, uses the wrong size, draws an accent dashed grace segment, and draws a track for drafts.**
   - Evidence: picked-m10.md:177-179 (96×4; done=#346e47, now=#a65f10), :182-189 (Cooking = [green][amber][empty]; Sent = [amber][empty][empty]), :251 (grace = '1.5px DASHED --ac outline'), :278 ('Draft rows show three empty segments'), :156-159/:246 (head dot and status word in --ac / --ac-strong for Cooking and Sent). The vocabulary says: 'Sent is 1 lit in --t2, Cooking is 2 lit in --tx, Served is 3 lit in --ok'; 'Inside the grace: one dashed --t2 segment'; 'Unsent: the hollow ring, never a track'; 'Gold or accent is never a progress colour'; 'a 28×6 row … 14×5 glyph'; and 'her tap turns the dish green everywhere'. As specced, a Cooking Mohinga shows green on Thiri's phone while the TV and Dad's pane draw the same dish in --tx.
   - Fix: Redraw rows and head from the vocabulary: 28×6 three-pill track, all lit segments in the stage colour (--t2 / --tx / --ok), a dashed --t2 single segment with 'Sending…' in the grace, and the hollow ring (no track) for drafts. Status words go in --t2 / --tx / --ok, never --ac. Remove the accent dot from the head.
3. **The spec invents its own roll-up module and pass component. That breaks 'name it ONCE' and the rule that every pass is post-pay's single CounterPass rendered from @mms/ui, never redrawn.**
   - Evidence: picked-m10.md:828 (new `lib/one-pass.ts` with `passStatus(items)` and `passSentAt`) and :243-249 (its own priority ladder: in_progress outranks fired). The vocabulary requires 'One pure lib/kitchen-track.ts derives the stage, a group's least-advanced stage and the pass roll-up for every surface.' The drawn screen 1 heads the table 'Cooking' while Coconut Rice is only Sent, so the roll-up is not the least-advanced stage the TV and Dad's pane will read. :830 has diner-cart build 'The pass component, replacing BillLines', and :876 has post-pay build another on /track. :97-117 hand-writes the geometry with hex and rgba literals. The vocabulary says these 'replace every per-spec ink mix', and the tokens are not hardcoded (CLAUDE.md conventions).
   - Fix: Derive stage, roll-up and 'Sent' time from lib/kitchen-track.ts (add `passSentAt` there if needed, with its mutants). Render post-pay's CounterPass in both places, so diner-cart only feeds it props. Replace the geometry recipe with the --pass-\* tokens (paper / ink / ink-2 / ink-3 / ac / ok / okb / seam / unlit / hole).
4. **The identity figure is printed twice, in the wrong face, with the stub on the wrong side and a two-tier scale. The vocabulary requires one figure, Fraunces 600 tabular, with the 'စားပွဲ · Table' label, stub on the left in landscape, and three tiers including the TV's 54px.**
   - Evidence: picked-m10.md:160-163 ('Table' + '7' Hanken 40/800 + 'စားပွဲ 7' Padauk), :466, :660 (repeated on all screens), :416/:620/:785 (the h2 reads the table twice). The stub sits on the right (:67-70, :105-107: main 250 | stub 100 with border-left perforation). :76-79 and Decision 1 at :892 say 'never a third' tier. The vocabulary says: 'ONE identity figure, printed once, with a two-tongue label "စားပွဲ · Table" (order flips with lang). A table number is Fraunces 600 tabular'; 'Landscape (stub left)'; 'the TV's shipped 54px row … never a fourth size'. The .exit-pass-code face (globals.css:6219-6226, heavy weight) is for codes and times, not table numbers.
   - Fix: Print '7' once in Fraunces 600 tabular at the 40px holder tier, under the label 'စားပွဲ · Table' (the order flips with lang; the Burmese is staff.ts:402's root). Put the stub on the left. State three tiers (40 · --fs-pass · TV 54) and drop 'never a third'.
5. **Text contrast fails in Night. The paper stays light, but every ink on the pass is a theme token that flips to its Night value.**
   - Evidence: picked-m10.md:89-91, :310-311 and :547-548 keep the pass light paper #fffdf8 in Night, but specify its ink as theme tokens: --tx, --t2, --t3, --ac, --ac-strong, --ok (:158-189, :465, :657-667), plus --sf for the stub (:106) and --okb for the stamped stub (:662). tokens.css:450 sets Night --tx to #f3ecdf (about 1.1:1 on #fffdf8). :451-454 set light Night --t2 #bcafc8, --t3 #a69eb1 and --ac #e7a53a. :507 sets Night --okb #1f2e26, a dark stub on a light pass. Every contrast claim in the spec (:430-434, :623-626, :790-793) is measured in light only.
   - Fix: Bind every pass ink and fill to the constant --pass-\* set (light values, never redefined in Night), and measure Night contrast on the pass explicitly.
6. **The pass shows ✓ at Served, which is not its terminal state. A dine-in pass may show ✓ only at Paid.**
   - Evidence: picked-m10.md:248 ('everything served → a solid 16px --ok ✓ disc + "Served"'), :257 ('flips to "Served" with the ✓ disc'), :464 (screen 2 head: '16px --ok disc with a 10px --oa check'). The vocabulary says 'A pass shows ✓ only at its terminal state: Paid on a dine-in pass … on the counter ✓ means paid.' A Served ✓ on Thiri's phone reads as 'paid' to Dad if she holds the phone up.
   - Fix: At Served the head shows the word plus the 3-lit --ok track glyph, with no ✓. The ✓ appears only as screen 3's Paid stamp.
7. **The door-opening moment fires inside Mom's 6-second bump Undo and moves several things at once.**
   - Evidence: picked-m10.md:256-269: on the last bump, the head flips, the slot changes, the label pops and the region says 'Ready to pay.', all at the edge. :238 also plays the 480ms segment FILL at that same edge. KdsBoard.tsx:77 sets `UNDO_MS = 6_000`, and :784 opens a 6s Undo after every bump; that undo is `mms_recall_ticket` (w3_kitchen.sql:215-231, served→in_progress). So a mis-tap undone within 6s says 'Ready to pay.', then silently re-holds (:274 'Nothing is announced'). The vocabulary says 'Never inside the Undo window of the act that caused it. KDS_UNDO_MS, moved to lib/, gates … the phone's door moment' and 'One thing moves at a time'. An All done (`mms_bump_ticket`) also fills several rows at once. CartItem has no bumpedAt (packages/db/src/index.ts:32-71), and the spec says so at :816.
   - Fix: At the bump edge only the FILL plays, sequenced row by row if several land together. Measure the door moment from the observed served edge on the client: the slot, 'Ready to pay.' and the POP fire only once KDS_UNDO_MS (imported from lib/) has elapsed with the door still open, and they are cancelled if a recall lands first. Spec this as a pure helper with a mutant.
8. **The door's pop uses the kit's 1.18 numeral mmsPop on a control. The vocabulary's POP for 'a control comes alive' is 0.96→1 over 180ms.**
   - Evidence: picked-m10.md:259-261 ('LABEL LAYER plays one mms-pop (globals.css:903-916, 120ms)… the shipped pop scales to 1.18') and Decision 10 at :926. globals.css:903-916 is `mmsPop` at scale 1.18 over --dur-fast (120ms). The vocabulary says: 'POP (0.96→1, 180ms): a control or pass comes alive. The kit's 1.18 mmsPop is for numerals only.'
   - Fix: Play POP 0.96→1 over 180ms on the Pay button itself. The 33px overflow argument and the label-layer workaround then go away. Under reduced motion the button is simply there.
9. **Screen 3 keeps the shipped confetti, which runs at the same time as the stamp and the print, so more than one thing moves in the Paid step.**
   - Evidence: picked-m10.md:773-774 ('The shipped confetti … stay … They are not drawn on the artboard: one thing moves at a time'). PaySuccess.tsx:156 mounts `<Confetti />` when /track mounts and keeps it up to CONFETTI_MS = 3200 (:12). The stamp lands on the order's arrival edge (:702-706, :762) and the print starts 640ms later (:768-771), all inside the confetti window. Leaving the confetti off the artboard hides the overlap; it does not remove it. The vocabulary lists 'STAMP, then PRINT: Paid only', and confetti is not part of the motion language.
   - Fix: On the dine-in pass arm, PaySuccess renders no confetti (the same prop that drops its ring). The haptic and the paid chime may stay because they are not motion. Draw and state the sequence as stamp, then print, and nothing else.
10. **The spec claims the revisit latch is already shipped, but it does not cover the stamp or the print, so a Back to the Stripe return URL replays both.**

- Evidence: picked-m10.md:707-708 ('A revisit (resume=1, a Back to the return URL): no stamp motion and no print. The latch is shipped in PaySuccess.tsx:86-91'). That latch gates only the confetti, haptic and chime. PaySuccess.tsx:35-37 says: 'The 1.05s thermal print still replays — its class is SSR'd'. The print class is applied on `justPaid` alone (OrderTracker.tsx:1203, print head :1477), and the ring keyframes the stamp reuses (globals.css:2018-2063) are pure CSS, with no latch. The vocabulary says 'Never on … a revisit'.
- Fix: State this as new post-pay work, not shipped. Render the stamp and receipt at rest on the server, and add the stamp and print classes after mount only when `!hasCelebrated(celebrationKey)` (the hydration-safe direction). Add a component case for a Back to the return URL.

11. **Screen 2's focus claim cites the wrong code: PaymentSection.tsx:306 is not a reveal focus.**

- Evidence: picked-m10.md:614-615 ('on reveal, focus goes to the pay stage group "Card details" … (PaymentSection.tsx:306), as shipped'). PaymentSection.tsx:300-307 is the focus handoff when the failure card unmounts (a useLayoutEffect on `showCard`). On any view change, the shipped code focuses the h1 (Checkout.tsx:1665-1672, keyed on `viewKey`). The stage group is also named 'Card details' (PaymentSection.tsx:381), which misnames a group that leads with Apple Pay and keeps the card folded.
- Fix: Say focus lands on h1 'Your bill' (shipped). If the fold ships, give the stage group a name that is true while the card is folded (e.g. 'Payment'), and add that to the K15 list.

### C · The critic's suggestions (not blocking; take them where the build agrees)

- A hostless table with diner drafts is unspecified. payBlockedByUnsent exempts a hostless table (checkout-stage.ts:63-77), so the kitchen arm says 'Pay opens once everything’s served.' over draft rows that nobody on a phone can send. Only Dad's console fires them, and only pay used to. Name that state, and the door that serves it (the counter), explicitly.
- The review region is described as 'at the top of main … sr-only and empty' (:136-137), but the shipped region at Checkout.tsx:4188-4209 is visible (minHeight 16, --t2) and sits below the split section. Either move it and make it sr-only in the spec, or accept that 'Ready to pay.' renders twice: in the slot and in the visible region.
- Draw the Apple Pay placeholder with Stripe's real radius. The Express element takes `borderRadius: r-sm` from the appearance (stripe-appearance.ts:141), not a 999 pill, and 'never restyled' cuts both ways.
- The card disclosure's 240ms height unfold (:520-521) is not in the motion language (RISE, POP, FILL, TURN, STAMP/PRINT, FLASH, PULSE), and it animates layout around a Stripe iframe. Make it instant, or a RISE of the revealed form.
- Screen 3's held-keys variant overstates. After a cash settle, a seat only reaches /track when counterPayOutcome returns an order that seat may see (Checkout.tsx:700-720). Otherwise it gets the settled close card. '+1 Star earned' also needs earned_by to be this viewer (rewards.ts:206). Say 'may reach'.
- Add to DATA the vocabulary's red-first test pinning the diner copies of table.line.state.\* and table.line.notSent Burmese equal to the STAFF source.
- Open Risk 13: reset the tip rate on the door's close edge. A recall then reopening with the chip still lit breaks D5's 'none pre-selected'.
- At the door edge the tip ask mounts at y≥682, under the dock and the fade, so the guest can pay without seeing it. Confirm on device that this is the intended quiet (no auto-scroll), not an accident.
- Screen 1's 'played once on load' FILL is an artboard demo that contradicts 'never on a first read'. Label it demo-only so the builder does not animate on first paint.
- The bare 'Partly refunded' string is refund-view.ts:119. :85 is the 'Partly refunded · {tender}' form.
- Roll-up step 4 ('only fired inside the grace') is ambiguous when round 1 is served and round 2 is inside the grace. kitchen-track.ts should own and test that case.

### E · Codex round 3 (2026-10-08) — these win over everything above

1. **A to-go draft holds the door** (PATH_DESIGN D5's hold set, revised). It otherwise fires only when
   the bill is paid (`mms_fire_pending_food`), so a phone could pay before that dish was cooked and the
   head could read Served beside an unsent row. After the flip its held reason is "Send your to-go dish
   to the kitchen first (More ⋯) — Pay opens once everything’s served.", pointing at the shipped "Send
   to kitchen now". Its row keeps the shipped "Not sent yet — goes to the kitchen when you pay", which
   stays true at the counter. The head reads Served only when nothing holds the door.

### F · Codex round 4 (2026-10-08) — these win over everything above

1. **The door waits out Mom's undo window on the server too** (Codex round 4). A Bill that mounts or
   returns to the foreground inside the 6 seconds after Mom's last bump would otherwise draw the door
   open, and create-intent would accept the `served` rows while Mom can still undo. So D5's verdict
   counts a line as served only once its `bumped_at` is at least `KDS_UNDO_MS` old on the DB clock (the
   TV board's rule, m9), the pass read carries that verdict rather than raw `served`, and "A door already
   open on mount is drawn open" applies only to a door the server already opened.

### G · Codex round 5 (2026-10-08) — these win over everything above

1. **The tip resets when the door closes.** If a recall closes the served gate after a guest picked a
   tip, the close edge clears both the preset and any custom tip, so a reopened door starts with no tip
   selected, exactly as the design promises. A component case pins it: a tip chosen, the gate closes and
   reopens, and nothing is pre-selected.
