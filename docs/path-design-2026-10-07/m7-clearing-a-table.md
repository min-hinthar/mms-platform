# Picked m7: clearing a table. "Turn Signals", refined

**Backbone: GLANCEABLE** (owner answer 1: staff moments are glanceable). Each table shows whether it
can be cleared as a shape plus a word you can read from a step away:

- a **circle-check RING** means the table can go;
- a **DIAMOND** means clearing it records a loss.

The action sits where that verdict is drawn, and the Undo replaces it **in the same slot**. This is
m7-glance-1/2 evolved: the same counter split, strip, cards, slab idea and example tables.

**Softened per the judges** (m7.json → judgement, Turn Signals' four costs):

1. **No loss stub during service.** The stub appears only after Dad reaches for Clear. During
   service an unpaid pane shows a small Clear at its foot, and Take cash stays the pane's hero.
2. **The window says "Clearing", never "Cleared".** "Free" and "cleared" are said only after the
   server answers.
3. **No text is dimmed.** The 0.55 opacity is gone. The pending hatch is 12% ink, and every text
   token stays at or above 4.5:1 on it (computed below).
4. **The guided concept's "Did they pay?" fork comes BEFORE the loss commit**: Take cash · Merge with
   another table (owner answer: the m7 default).

**Grafted from QUIET ("The Last Line"): restraint.**

- **No mark that nags.** The "{k} ready to clear" count retires: a running count of paid families is
  pressure to clear people still drinking tea.
- **The slab is calm.** It is a 2px --ok RING on the pale --okb ground, never a filled dark disc. So
  it never out-shouts the floor's one filled tile, the table asking to pay (globals.css:14424-14426).
- **Words the family already reads.** Every visible word on the floor is one Dad already reads on
  this console, apart from four drafts.
- **The shipped torn-receipt edge.** The loss stub reuses `.receipt-tear` (globals.css:775-787)
  rather than inventing a zigzag.
- **The loss figure appears once**, as the receipt's total. The commit names the same sum.

**Grafted from GUIDED ("Have They Left?"): the spoken next step.**

- **The slab speaks the next step.** It reads "ထွက်သွားကြပြီ — စားပွဲ 7 ရှင်း / They’ve left —
  clear Table 7". The control asks Dad's eyes for the one fact the database cannot know: the party
  has stood up.
- **The stub asks the question its facts raise.** "စားပွဲ 4 ငွေရှင်းပြီးပြီလား? / Did Table 4 pay?"
  Its answers are the buttons.

**Glanceable's one moment of delight: THE TURN.** When the 6 s window closes, Table 2's card leaves
in place (`.mms-remove`, globals.css:13116). Tile 2 on the strip flips to the dashed free seat with
one accent ring (the card pulse's recipe, `floorCardPulse` 1 s, globals.css:3375-3392). The room
visibly turns, and it plays once. Under reduced motion it is instant, with no ring
(globals.css:3425-3427, :13131).

**World-class, held to this family's real constraints** (no new hardware, no new screen, no claim
the code cannot keep):

- **A great maître d'** never resets a table while the guests are still at it, and he walks the next
  party in as the cloth comes off.
  - Here: the verb is "They’ve left — clear". The slab never shows while a dish is still cooking or
    was served in the last five minutes (`up > 0`, PULSE_PASS_LINGER_MS 5 min,
    board-pulse.ts:168).
  - "Seat next party" sits in the same slot as the Undo, so turnover is two taps in one place.
- **A departures board, or a boarding pass's gate box.** The status word changes in place ("Clearing
  Table 2"), and nothing on the board reflows until the outcome is real. The countdown is small and
  lives only on the control that can stop it.
- **A Japanese register's void slip (取消伝票) with the manager's stamp (判子).**
  - Here: the loss stub is a torn slip: the dishes, the total, and one stamp line, "Manager here?
    Approve with PIN".
  - The stamp is optional, because ruling #6 says Clear never waits (OWNER_RULINGS_2026-10-07.md:48).
- **A great KDS.** A voided ticket stays on the rail, struck, until the cook acknowledges it. It
  never silently vanishes. This is kitchen-ops' half (judges' graft 6), cited here because the
  stub's sentence promises it.

**Example data.** It is m7-glance-1/2's own, kept like for like. The fixes are listed in DECISIONS 22.

- Friday evening, counter tablet, light theme, language mode Both (Burmese-first). The device does
  not draw the time.
- **Table 2:** paid **$28.40**, party of 2, opened 52 min ago, kitchen done.
- **Table 3:** ordering, 2 items, **$27.00** so far (Mohinga $14.00 + Shan Noodles $13.00), 2 in the
  kitchen, 6 min.
- **Table 4:** ordering, 3 items, **$41.00** so far, opened 25 min ago, 3 in the kitchen, 9 min:
  - Mohinga ×1 is cooking;
  - Mee-Shay ×1 and Shan Noodles ×1 are sent.

  The prices are the catalog's: MENU_REFERENCE.md:26, :27 and :31. This party has left without
  paying.

- **Table 7:** paid **$46.12**, party of 3, opened 1 h ago, kitchen done.
- **Table 10:** seated, party of 2, no items, opened 3 min ago.
- **The strip** draws 10 tiles. The real table count is UNKNOWN; 10 is a placeholder for the owner's
  registry.

**Tokens used (light; Night maps 1:1 to the `.dark` set):**

| Token / composite                                                                                             | Value                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| --pg (ground, pane, pane head)                                                                                | #faf9f5                                                                                                                                                  |
| --cd (cards, cells, stub)                                                                                     | #fffdf8                                                                                                                                                  |
| --sf (Sent tag, chips at rest)                                                                                | #f2efe7                                                                                                                                                  |
| --tx / --t2 / --t3                                                                                            | #1b1714 / #6e6358 / #726859                                                                                                                              |
| --ac / --ac-strong / --oa                                                                                     | #a65f10 / #8f5009 / #fffdf8                                                                                                                              |
| --ok on --okb                                                                                                 | #346e47 on #eaf2ec                                                                                                                                       |
| --warn on --warnb                                                                                             | #a44b34 on #f6e9e4                                                                                                                                       |
| --bd · --sheen                                                                                                | rgba(58,35,23,0.1) · rgba(255,255,255,0.55)                                                                                                              |
| --sh-paper                                                                                                    | 0 1px 3px -1px rgba(35,24,16,0.07), 0 14px 28px -18px rgba(35,24,16,0.28) (tokens.css:197)                                                               |
| selected card border / halo                                                                                   | color-mix(in oklab, --gold 55%, --bd) ≈ rgba(232,168,60,0.6) / 0 0 18px -8px rgba(232,168,60,0.34) (globals.css:14837-14844)                             |
| page lines                                                                                                    | repeating-linear-gradient(180deg, transparent 0 27px, rgba(27,23,20,0.05) 27px 28px)                                                                     |
| **pending hatch (NEW)**                                                                                       | repeating-linear-gradient(45deg, color-mix(in oklab, var(--t3) 12%, transparent) 0 2px, transparent 2px 10px); stripe #eeebe5                            |
| **contrast on the darkest hatch pixel** (computed, WCAG relative luminance, script in scratchpad m7calc/c.py) | --tx 14.97 · --t2 4.92 · --t3 4.60 · --ok 5.09 · --ac-strong 5.32. Night: --t3 4.79 · --ok 4.70. At 18% --t3 fell to 4.24, which is why the value is 12% |
| **slab**                                                                                                      | --okb ground: --tx 15.61 · --t2 5.13 · --ok ring 5.31 (non-text ≥3:1)                                                                                    |
| **danger commit** --warn on --warnb                                                                           | 4.87:1 (Night 5.50)                                                                                                                                      |
| **drain bar** (the Toast recipe: currentColor 0.55)                                                           | --tx at 0.55 on --cd = 3.96:1 (non-text ≥3:1)                                                                                                            |

---

## SCREEN picked-m7-1.dc.html — The floor at turnover: Table 7 can go, Table 2 is clearing, and the next party is one tap away

- **Device:** tablet 1366×1024, landscape.
- **Theme:** light. The counter follows the OS, and Night uses the same layout on the `.dark` tokens.
- **When:** 2 seconds after Dad tapped Table 2's slab. This is second 2 of the 6 s window, and
  nothing has been written yet. Table 7 is a paid table at rest, showing its slab. The pane is idle.

### LAYOUT (top to bottom)

Root: 1366×1024, flex column, ground --pg #faf9f5, Hanken Grotesk 16/1.5, --tx.

- **y0–84 · STAFF BAR, unchanged** (StaffBar.tsx; drawn as m7-glance-1):
  - opaque --pg with a 1px --bd bottom; padding 10px 20px; flex row, gap 12;
  - **leading:** the Screens circle, 44×44 at x20 y20 (--cd, 1px --bd, inset sheen, 20px grid glyph,
    `aria-label`);
  - **title** at x76: h1 "ကောင်တာနဲ့ စားပွဲများ" (Padauk 700 30px, lh 1.6), with the stacked echo
    "Counter & tables" beneath it (13px 600 --t2; StaffBar renders the title `echo="stack"`,
    StaffBar.tsx:110);
  - **trailing:** Help (the gold circle, 44, at x1238: 1px rgba(230,165,59,0.62) border,
    linear-gradient(180deg, #faeacf, #fffdf8), 20px help glyph) and Lock (44, at x1302), gap 20.
- **y84–1024 · THE SPLIT:**
  - MAIN x20–858 (838px), a 24px gap, then the PANE x882–1346 (464px = --w-staff-pane
    clamp(22rem, 34vw, 34rem), globals.css:14676);
  - the page's 28px horizontal rules run under both.

**MAIN column:**

- **y84–145 · ZONE STRIP (sticky, unchanged):** padding 8px 0, a 1px --bd bottom, chips gap 8.
  - Each chip is 44px tall, radius 999, padding 0 14px, Padauk 13px 600, Burmese only (as built,
    CounterZoneStrip.tsx:117 renders no echo).
  - The chips: "အော်ဒါ ဖွင့်" · **"စားပွဲများနဲ့ ကောင်တာ အော်ဒါများ"** · "ပါဆယ်ထုပ်များ" · "ဒီနေ့ ရငွေ".
  - The second chip is `aria-current="location"` and wears the lit cap: --ac fill, --oa ink, inset
    sheen, 0 0 14px -6px gold glow (globals.css:7847-7856).
  - The others are --sf with a 1px --bd border and --tx ink.
- **y161–182 · strip label:** "စားပွဲများ — လွတ်နေတဲ့ စားပွဲကို နှိပ်ပြီး ဖွင့်ပါ" (Padauk 13px 600 --t2,
  no echo as built, TableStrip.tsx:213-215).
- **y190–254 · THE STRIP:** 10 tiles, each about 76.6px wide (auto-fit minmax(60px, 96px) over
  838px), 64px tall (--tap-bump), gap 8, radius 12, --cd, 1px --bd.
  - The number is 26px 800 tabular --tx. The tone bar is a 4px inset at the bottom; the glyph is
    18px, stroke 2.25 (globals.css:14394-14453).
  - **1, 5, 6, 8, 9 · free.** A 2px dashed --t2 edge; the number over "ဖွင့်" (14px 700 --ac-strong).
    Each is a `<button>`.
  - **2 · CLEARING (NEW state).** It stays an occupied link (View), in the done tone: a 4px --ok bar
    and the check glyph in --ok.
    - Over its --cd it carries the PENDING HATCH at 12%. The number and the glyph keep FULL ink.
    - It is not dimmed and not `aria-disabled`. It is still a link that opens Table 2, and Start
      does not exist on an occupied tile.
  - **3, 4 · live.** A 4px --ac bar and the cart glyph in --ac (TableStrip.tsx:67-74; as built, not
    the target glyph the earlier artboard drew).
  - **7 · done.** A 4px --ok bar and the check glyph in --ok.
  - **10 · rest.** No bar; the people glyph in --t2.
- **y262–283 · the key (aria-hidden, unchanged, floor-rows.ts stripKey):** 13px --t2, gap 4px 12px.
  - The entries: [cart --ac] "မှာနေဆဲ" · [people --t2] "ထိုင်ပြီ" · [check --ok] "ငွေရှင်းပြီး".
  - There is no "Start" entry: free tiles already say ဖွင့်.
- **y299–326 · zone head row** (flex, baseline, space-between, FloorBoard.tsx:629-635):
  - **left:** h2#floor-h "စားပွဲများနဲ့ ကောင်တာ အော်ဒါများ" (Padauk 700 17px, `.staff-zone-head`);
  - **right:** THE BOARD'S ONE REGION (`<p role="status">`, FloorBoard.tsx:387-392), 13px --t2. During
    the window it reads **"စားပွဲ 2 ရှင်းနေပါတယ်"**, the turnover news at its precedence slot (see
    STATES). At rest it reads "အသုံးပြုနေတဲ့ စားပွဲ ၅ ခု".
- **y342 on · CARD GRID**, 2 columns of 413px with a 12px gap (column 1 at x20–433, column 2 at
  x445–858). The order is by table number (floor.ts:538-548).
  - Each card hugs its content (the StaggerList `<li>` stretches, the card does not).
  - **Card anatomy, as built** (TableCard.tsx):
    - `.card.card-textured`: radius 20, --cd with the dot texture, 1px --bd, --sh-paper, inset
      sheen; padding 16px 20px; rows gap 8;
    - name row 34px: "စားပွဲ N" (Padauk 700 21px; the "N" Latin, `lang="en"`), with the status chip at
      the right (13px 700, Burmese only, FloorStatusChip.tsx:28);
    - meta row 21px, 13px --t2: "ဆိုင်မှာ စား · {n} ယောက်";
    - kitchen row 28px (FloorKitchenLine);
    - bottom row 24px + 4: the money at left (16px 700 tabular, plus a 13px word) and
      "ဖွင့်တာ {age}" (13px --t3) at right;
    - a 4px status edge in the table's tone down the left (`.floor-edge`, globals.css:14525-14532).

  **ROW 1 (y342–574):**

  - **Table 2 · CLEARING, x20–433, 232px tall (y342–574).**
    - **Card shell:** unchanged. The --ok status edge stays, because it is still paid.
    - **The link area (y342–509, 167px)** wears the PENDING HATCH over the card ground, static, at
      FULL text ink.
      - Name row: "စားပွဲ 2". The status chip is replaced by the **CLEARING chip**: radius 999,
        padding 2px 10px, a **1.5px dashed --t2** border, --cd fill, --t2 ink 13px 700, reading
        "စားပွဲ 2 ရှင်းနေပါတယ်".
      - Meta: "ဆိုင်မှာ စား · ၂ ယောက်".
      - Kitchen row: "မီးဖိုချောင် ပြီးပြီ" (--t2).
      - Bottom: "$28.40" (16px 700) "ငွေရှင်းပြီး" (13px --ok), then "ဖွင့်တာ ၅၂ မိနစ်က" (--t3).
    - **THE SLOT (y510–574, 64px), under a 1px --bd top line**, holds two cells of 205px with a 1px
      --bd divider. The slot keeps the slab's exact 64px, so the card never changes height and the
      grid never reflows.
      - **LEFT · UNDO**, x21–226, @mms/ui Button secondary xl:
        - paper --cd, radius 0 0 0 19px, the inset sheen;
        - content centred, as a row: the undo glyph (18px, --tx), gap 8, then a stack:
          - line 1: "ပြန်ဖျက်" (Padauk 700 19px, lh 1.6, --tx), then " · ၄ စက္ကန့်" (Padauk 400 15px,
            --t2, `aria-hidden`);
          - line 2: "Undo · 4s" (13px 600 --t2, lh 1.25; the "· 4s" `aria-hidden`).
        - **THE DRAIN:** a 3px bar pinned to the cell's inner bottom edge, inset 12px each side. It is
          currentColor (--tx) at 0.55 opacity, `transform: scaleX()` from 1 to 0 over 6000ms linear
          (the Toast primitive's recipe, primitives.css:541-561). Drawn at second 2 it is 67% of
          181px = 121px, from x33.
      - **RIGHT · SEAT NEXT PARTY**, x227–432, @mms/ui Button secondary xl with `arrow="fwd"`:
        - paper --cd, radius 0 0 19px 0;
        - content centred: a stack of "နောက်ဧည့်သည် ဖွင့်" (Padauk 700 19px, --ac-strong) over "Seat
          next party" (13px 700, --ac-strong), then the primitive's forward arrow (16px, --ac-strong)
          trailing at gap 8.
        - It is NOT a filled pill: during the window nothing on this card is filled (§32: "reversing
          is never the hero", DESIGN-LANGUAGE.md:2411-2415).
  - **Table 3 · ORDERING, x445–858, 167px (y342–509), unchanged:**
    - chip "မှာနေဆဲ" (12% --ac wash, --ac-strong ink, a 7px --ac dot); --ac edge;
    - meta "ဆိုင်မှာ စား · ၂ ယောက်";
    - kitchen row: the flame glyph, "မီးဖိုချောင်မှာ ၂ ခု" (--tx 700), and the wait pill "၆ မိနစ်" at
      the right (ok level: --okb fill, --ok ink, radius 999);
    - bottom: "$27.00" then "ယခုအထိ · ပစ္စည်း ၂ ခု" (13px --t2), and "ဖွင့်တာ ၁၈ မိနစ်က".

  **ROW 2 (y586–818):**

  - **Table 4 · ORDERING, x20–433, 167px (y586–753), unchanged:**
    - chip "မှာနေဆဲ"; meta "ဆိုင်မှာ စား · ၃ ယောက်";
    - kitchen row "မီးဖိုချောင်မှာ ၃ ခု", with the wait pill "၉ မိနစ်" at the AMBER level (the existing
      pill; thresholds 8/12, kds-urgency);
    - bottom: "$41.00" then "ယခုအထိ · ပစ္စည်း ၃ ခု", and "ဖွင့်တာ ၂၅ မိနစ်က".
    - There is **no slab and no loss mark.** An unpaid table during service shows nothing about
      clearing (DECISIONS 11).
  - **Table 7 · GO, x445–858, 232px (y586–818):**
    - **link area (167px):** chip "ငွေရှင်းပြီး" (--okb fill, --ok ink); --ok edge; meta "ဆိုင်မှာ စား ·
      ၃ ယောက်"; kitchen row "မီးဖိုချောင် ပြီးပြီ"; bottom "$46.12" "ငွေရှင်းပြီး" (--ok) and "ဖွင့်တာ ၁
      နာရီက".
    - **THE SLAB (y754–818, 64px):** a separate `<button>`, a SIBLING of the link and never nested in
      it. It is an @mms/ui Button secondary xl block with an app className.
      - Ground --okb #eaf2ec, a 1px --bd top line, the inset sheen, radius 0 0 19px 19px; padding 0
        20px; a flex row, gap 12, left-aligned.
      - **the RING:** 36×36, radius 999, a **2px --ok border, transparent fill**, holding the check
        glyph (20px, stroke 2.25, --ok);
      - **the label stack:** "ထွက်သွားကြပြီ — စားပွဲ 7 ရှင်း" (Padauk 700 19px, lh 1.6, --tx) over
        "They’ve left — clear Table 7" (13px 600 --t2, lh 1.25).
      - Nothing on the right.

  **ROW 3 (y830–961):**

  - **Table 10 · SEATED, x20–433, 131px, unchanged:** chip "ထိုင်ပြီ" (--cd, --t2 ink, --t2 dot); no
    edge; meta "ဆိုင်မှာ စား · ၂ ယောက်"; no kitchen row; bottom "ဘာမှ မရှိသေးပါ" (13px --t3) and
    "ဖွင့်တာ ၃ မိနစ်က". No slab: a party that just sat down never wears a green Clear.

**PANE (x882–1346), idle, unchanged** (TablePane.tsx:372-380):

- sticky at y100 (bar 84 + 16), height 908 (to y1008); a 1px --bd inline-start border; padding 0 8px
  96px 24px (globals.css:14708-14719);
- the EmptyState centred: the receipt glyph (24px); h2 "စားပွဲတစ်ခု ရွေးပါ" (no echo); the subtitle
  stacked, "အဲဒီစားပွဲရဲ့ အော်ဒါက စာရင်းဘေး ဒီနေရာမှာ ပေါ်လာပါမယ်။" over "Its order opens here,
  beside the list."

### STATES (not drawn; for the build)

- **GO (when the slab shows).** All of these must hold, decided ONCE in a new pure
  `lib/clear-verdict.ts` from fields the floor already carries:
  - `status === "paid"` (floor-status.ts deriveFloorStatus: a settled order rests on the table);
  - the tone is `done`, never `returned`: a refunded table clears from the pane, and a refunded
    table never wears the success tone (K33, floor-tone.ts);
  - `tab === "none"` and `itemCount === 0`;
  - the kitchen segments are empty or only "Kitchen done": `notSent`, `inKitchen` and `up` are all 0
    (floor-kitchen.ts:135-144). So a dish served in the last 5 minutes holds the slab back;
  - `snapshot.kitchenUnknown === false`: an unknown kitchen read is never "go".

  Every other card has no slab.

- **TAP THE SLAB.** Nothing is written.
  - The slab becomes the two-cell slot, and the link area takes the hatch and the CLEARING chip.
  - Strip tile 2 takes the hatch.
  - The board region says "စားပွဲ 2 ရှင်းနေပါတယ်" once.
  - Focus moves to Undo.
  - The window lives in `CounterSplit`, above the pane, so closing or switching the pane never drops
    it. This also closes P2am's unmount hole.
- **ARMED after 400 ms.** Both cells are `aria-disabled` for the first `PICKED_UNDO_ARM_MS` (400 ms,
  expo-rules.ts:142; at least `SAME_GESTURE_MS` 350, gesture.ts:15). The second half of a double tap
  can neither undo nor seat.
- **HELD.** A `:focus-visible` Undo or Seat next holds the window (undo-hold's `slot` source),
  capped at 60 s (undo-hold.ts:34). 5 s before the cap the region says "ခဏနေရင် စားပွဲ 2 ကို ရှင်းပါမယ်
  — ရပ်ချင်ရင် အခု ပြန်ဖျက်ပါ။". A touch NEVER holds (undo-hold.ts:10-14).
- **UNDO.** The slot returns to the slab, the hatch and chip leave, and focus returns to the slab.
  The region says "စားပွဲ 2 ခန်းမပေါ် ပြန်ရှိပြီ။".
- **COMMITTING (the window closed).** The write goes through `boundWrite` (15 s bound). Both cells
  are `aria-disabled` and `aria-busy`, and the chip still reads "စားပွဲ 2 ရှင်းနေပါတယ်".
- **CLEARED (the RPC answered ok).** This is THE TURN:
  - the card leaves in place (`.mms-remove`, instant under RM);
  - tile 2 flips to the dashed free seat with one `floorCardPulse` ring (none under RM);
  - the region says "စားပွဲ 2 လွတ်ပြီ။";
  - if focus was on the slot, it goes to h2#floor-h (tabIndex -1, FloorBoard.tsx:377), never to
    <body>.
- **SEAT NEXT PARTY.** The rest of the window is skipped, and the clear is sent now.
  - **Only on its ok:** a table start through the screen's ONE mint lock (`useCounterMint` →
    `openRegisterOrder({ kind: "table", tableNumber: 2 })`, CounterMint.tsx:216; register.ts:39-49).
    The new pad opens at `/staff/table/{id}/add` (CounterMint.tsx:136).
  - The ordering matters: a start sent before the close would find the OLD session (`startTable`
    find-or-creates the ACTIVE session).
  - If the clear lands but the start fails, the region says "စားပွဲ 2 ရှင်းပြီးပါပြီ — ထိုင်ခိုင်းဖို့
    အပေါ်က 2 ကို နှိပ်ပါ။".
  - An unregistered sticker has no number, so Undo spans the full slot.
- **STALE DURING THE WINDOW.** A poll shows a new member, a new line or a payment on Table 2. The
  pending clear is dropped on the spot (nothing was sent) and the card restores.
  - The region says "စားပွဲ 2 မှာ တစ်ယောက် အခုလေးတင် ဝင်လာလို့ မရှင်းဘဲ ဖွင့်ထားပါတယ် — မရှင်းခင် ဘယ်သူ
    ထိုင်နေလဲ စစ်ပါ။" for a join. Any other change uses the shipped "အော်ဒါ ပြောင်းသွားပြီ — ပြန်စစ်ပြီး
    ထပ်စမ်းပါ။".
  - The server refuses the same case on its own (`p_seen_at`), so a next party who scanned the sticker
    is never closed out.
- **REFUSED at commit.** The card restores in place, the region carries the keyed refusal
  (precedence: refusal > freeze > "Ready to serve" > turnover news > counts), and the table stays on
  the floor.
- **UNANSWERED.** At 15 s, or with the answer lost, the shipped `settle.clear.waiting` / `unknown`
  lines appear with Reload (staff.ts:3808-3815). `out.stalled` is refused before sending.
- **The tab is closed inside the window.** Nothing is written and the table stays: the safe
  direction, ExpoBoard's rule.
- **The pane opens Table 2 during the window.** It shows the same CLEARING chip line. There is still
  ONE Undo per clear, in the floor slot where it was tapped. Undo-hold's two sources exist for
  exactly this case if the sitting asks for a second.
- **Night.** --okb #1f2e26 with an --ok #5fb07e ring; cells --cd #2b213c; the hatch over --cd keeps
  --t3 at 4.79:1. Glass is not used.

### COPY (English): as an English device renders it

- Counter & tables
- Start an order · Tables & counter orders · Takeaway bags · Today’s takings
- Tables — tap a free one to start it
- Start
- Ordering · Seated · Paid
- Tables & counter orders
- **Clearing Table 2** (the region during the window, and the chip; NEW key `settle.clear.window`
  "Clearing Table {id}")
- Table 2 · Dine-in · party of 2 · Kitchen done · $28.40 Paid · Opened 52m ago
- **Undo · 4s**
- **Seat next party** (NEW `settle.clear.seatNext`)
- Table 3 · Ordering · Dine-in · party of 2 · 2 in kitchen · 6 min · $27.00 so far · 2 items ·
  Opened 18m ago
- Table 4 · Ordering · Dine-in · party of 3 · 3 in kitchen · 9 min · $41.00 so far · 3 items ·
  Opened 25m ago
- Table 7 · Paid · Dine-in · party of 3 · Kitchen done · $46.12 Paid · Opened 1h ago
- **They’ve left — clear Table 7** (NEW `settle.clear.left` "They’ve left — clear Table {id}")
- Table 10 · Seated · Dine-in · party of 2 · No items yet · Opened 3m ago
- Pick a table · Its order opens here, beside the list.
- **States:**
  - Table 2 is back on the floor.
  - Table 2 will be cleared in a few seconds — Undo now to stop it.
  - Table 2 is free.
  - Table 2 is clear — tap 2 on the strip to seat them.
  - Someone just joined Table 2, so it stayed open — check who’s sitting there before you clear it.
  - The order changed — check it and try again.
  - No answer yet — the table may still be cleared. Don’t clear it again: reload the page to see.
  - We couldn’t confirm the table was cleared — check the floor before you clear it again.

### COPY (Burmese): shipped strings or the brief's drafts only

| Visible text                                                                                                | Source                                                                                           |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| ကောင်တာနဲ့ စားပွဲများ                                                                                       | `floor.door.counter`, staff.ts:977                                                               |
| အော်ဒါ ဖွင့် · စားပွဲများနဲ့ ကောင်တာ အော်ဒါများ · ပါဆယ်ထုပ်များ · ဒီနေ့ ရငွေ                                | `floor.zone.start` :370 · `floor.tables.title` :1011 · `expo.title` :851 · `reg.day.title` :1652 |
| စားပွဲများ — လွတ်နေတဲ့ စားပွဲကို နှိပ်ပြီး ဖွင့်ပါ                                                          | `floor.strip.label` :3241-3244                                                                   |
| ဖွင့်                                                                                                       | `floor.verb.start` :3256                                                                         |
| မှာနေဆဲ · ထိုင်ပြီ · ငွေရှင်းပြီး                                                                           | `floor.status.ordering` :391 · `.seated` :390 · `.paid` :394                                     |
| အသုံးပြုနေတဲ့ စားပွဲ ၅ ခု                                                                                   | `floor.tables.count.many` :1016-1019 (a count, so Burmese numerals, fill.ts)                     |
| စားပွဲ 2 / 3 / 4 / 7 / 10                                                                                   | `floor.table` :402 (the id is Latin)                                                             |
| ဆိုင်မှာ စား · ၂ ယောက် / ၃ ယောက်                                                                            | `floor.mode.dinein` :439 · `floor.party` :413                                                    |
| မီးဖိုချောင် ပြီးပြီ                                                                                        | `expo.kitchenDone` :858 (the card's done-only segment, floor-kitchen.ts:141-142)                 |
| မီးဖိုချောင်မှာ ၂ ခု / ၃ ခု · ၆ မိနစ် / ၉ မိနစ်                                                             | `floor.kitchen.inKitchen` :3261 · `floor.kitchen.wait` :3266                                     |
| ယခုအထိ · ပစ္စည်း ၂ ခု / ၃ ခု                                                                                | `floor.card.soFarLabel` :420 · `floor.card.item.many` :415                                       |
| ဘာမှ မရှိသေးပါ                                                                                              | `floor.card.empty` :429                                                                          |
| ဖွင့်တာ ၅၂ မိနစ်က / ၁ နာရီက / ၁၈ … / ၂၅ … / ၃ မိနစ်က                                                        | `floor.card.opened` :3290 + `time.minAgo` :717 / `time.hrAgo` :718                               |
| **စားပွဲ 2 ရှင်းနေပါတယ်**                                                                                   | DRAFT: the judges' graft 2, brief-m7.md:447 (and guided S2, m7.json). K15-HIGH                   |
| ပြန်ဖျက်                                                                                                    | `kds.undo` :255 (K15-HIGH)                                                                       |
| · ၄ စက္ကန့်                                                                                                 | `table.send.undoLeft` :2706                                                                      |
| **နောက်ဧည့်သည် ဖွင့်**                                                                                      | DRAFT: glance screen 1, brief-m7.md:404 (the counter's one start verb ဖွင့်)                     |
| **ထွက်သွားကြပြီ — စားပွဲ 7 ရှင်း**                                                                          | DRAFT: guided S1, brief-m7.md:280 (K15-HIGH)                                                     |
| စားပွဲတစ်ခု ရွေးပါ · အဲဒီစားပွဲရဲ့ အော်ဒါက စာရင်းဘေး ဒီနေရာမှာ ပေါ်လာပါမယ်။                                 | `floor.pane.empty.title` :3329 · `.sub` :3330-3333                                               |
| (state) စားပွဲ 2 ခန်းမပေါ် ပြန်ရှိပြီ။                                                                      | DRAFT: guided S2, m7.json concepts[1]                                                            |
| (state) ခဏနေရင် စားပွဲ 2 ကို ရှင်းပါမယ် — ရပ်ချင်ရင် အခု ပြန်ဖျက်ပါ။                                        | DRAFT: guided S2, m7.json                                                                        |
| (state) စားပွဲ 2 လွတ်ပြီ။                                                                                   | DRAFT: guided S2, m7.json                                                                        |
| (state) စားပွဲ 2 ရှင်းပြီးပါပြီ — ထိုင်ခိုင်းဖို့ အပေါ်က 2 ကို နှိပ်ပါ။                                     | DRAFT: glance screen 2, m7.json concepts[2]                                                      |
| (state) စားပွဲ 2 မှာ တစ်ယောက် အခုလေးတင် ဝင်လာလို့ မရှင်းဘဲ ဖွင့်ထားပါတယ် — မရှင်းခင် ဘယ်သူ ထိုင်နေလဲ စစ်ပါ။ | DRAFT: guided S5, m7.json                                                                        |
| (state) အော်ဒါ ပြောင်းသွားပြီ — ပြန်စစ်ပြီး ထပ်စမ်းပါ။                                                      | `table.noshow.err.changed` :3587-3590                                                            |
| (state) the waiting and unknown lines                                                                       | `settle.clear.waiting` / `settle.clear.unknown` :3808-3815                                       |

### A11Y

- **One live region:** the board's existing `<p role="status">` (FloorBoard.tsx:387-392).
  - It says each turnover sentence ONCE: Clearing at the tap · back on the floor at Undo · the
    hold-cap warning · free at the commit.
  - Precedence: strip refusal > freeze > "Ready to serve" > turnover news > counts. "Ready to serve"
    is NEW information; the clearing line is Dad's own act, under his finger.
  - No `aria-live` is added anywhere. The slab and the slot are not live.
- **No nested controls.** TableCard's outer element becomes a `.card` `<div>` (today it is
  `Card as={Link}`, TableCard.tsx:110-121). The link keeps the card's `al()` name, `aria-current`
  and the lit cap. The slab and the slot cells are `<button>` siblings of the link.
- **Names:**
  - **slab:** its visible text, "ထွက်သွားကြပြီ — စားပွဲ 7 ရှင်း They’ve left — clear Table 7". It
    carries `aria-describedby` → the card's money row id ("$46.12 ငွေရှင်းပြီး").
  - **Undo** and **Seat next:** their visible text. `aria-describedby` → the card's name span
    ("စားပွဲ 2"), so a reader hears which table without a new composed string.
  - **The countdown digits are `aria-hidden`**, so the name does not change every second (the
    `table.send.undoLeft` precedent).
  - **The clearing tile:** its `al()` name gains "စားပွဲ 2 ရှင်းနေပါတယ်".
- **Focus:**
  - slab → Undo (same slot);
  - Undo → the restored slab;
  - Seat next → the new pad's heading;
  - commit while on the slot → h2#floor-h;
  - never <body> as a node unmounts.
- **Disabled and busy** are `aria-disabled` / `aria-busy`, never native (Button, button.tsx; §17).
  The 400 ms arm and the commit use them.
- **Targets:** slab and cells 64px (--tap-bump); tiles 64; zone chips 44; circles 44.
- **Never colour alone:**
  - the slab: the ring + check + words;
  - clearing: the hatch + the dashed chip + words;
  - the tiles: a glyph + a bar + the key;
  - the paid money: the word ငွေရှင်းပြီး beside the --ok tint.
- **Reduced motion:**
  - the drain is not drawn (primitives.css:461-463), and the "· ၄ စက္ကန့်" / "· 4s" text remains;
  - `.mms-remove` and the tile ring go instant or off;
  - the hatch is static in every mode.
- **Burmese:** `lang="my"`, Padauk 400/700 only, lh 1.6, letter-spacing normal, font-synthesis none,
  ≥13px. A Latin id or money inside a Burmese run is `lang="en"` (Chrome rule 3, Chrome.tsx:35-38).
  Counts use Burmese numerals; ids, money and the qty column stay Latin (fill.ts owner rule,
  2026-09-05).

### CODE CHECK (claims this screen depends on)

- **A paid table stays on the floor until it is cleared or expires.** The floor reads
  `.gt("expires_at", now)` (floor.ts:188), and status `paid` means "a settled order rests on the
  table" (floor-status.ts deriveFloorStatus).
- **Every GO input already exists on `FloorTable`:**
  - `status`, `refund`, `tab`, `itemCount`, `kitchen{notSent,inKitchen,up,done}` (floor-types.ts);
  - `snapshot.kitchenUnknown`;
  - `up` = served within PULSE_PASS_LINGER_MS, 5 min (board-pulse.ts:168).

  The predicate itself (`lib/clear-verdict.ts`) is NEW, with mutants added to verify:slice.

- **"Kitchen done" is a shipped card segment** (floor-kitchen.ts:141-142; staff.ts:858).
- **The tone map:** `done` vs `returned` (floor-tone.ts); the floor's one filled tile is the ask
  (globals.css:14424-14426).
- **The card is ONE link today** (TableCard.tsx:110-121). The sibling slab is a restructure (NEW),
  as the judges named.
- **Card order is by table number** (floor.ts:538-548). The grid is 2 × 413px at 1366
  (FloorBoard.tsx:637-644, minmax 18rem).
- **The deferred window's constants are shipped:**
  - PICKED_UNDO_MS 6000 (expo-rules.ts:125) and PICKED_UNDO_ARM_MS 400 (:142);
  - SAME_GESTURE_MS 350 (gesture.ts:15);
  - undo-hold: `slot` source, focus-visible only, 60 s cap, 5 s warning (undo-hold.ts:10-39);
  - ExpoBoard opens a slot hold only on a keyboard pick (ExpoBoard.tsx:856-857).
- **The drain recipe:** a 3px bar, currentColor 0.55, scaleX, RM off (primitives.css:541-561,
  :461-463).
- **The one mint lock and the pad route:** CounterMint.tsx:136, :216. `openRegisterOrder` table kind
  → `startTable` find-or-create (register.ts:22-49).
- **Today's clear is a confirm with no undo** (ClearTableButton.tsx:176-219). It cancels a dine-in
  cart with no loss row (floor.ts:1201-1208). The deferred window, the joined/changed refusal and
  the turnover news are all NEW and gated on the clear RPC migration (ruling #5,
  OWNER_RULINGS_2026-10-07.md:47).
- **Chips and card text are Burmese-only in Both mode.** Chrome's echo defaults to false
  (Chrome.tsx:99); FloorStatusChip renders no echo (FloorStatusChip.tsx:28, :58). Only the StaffBar
  title stacks its echo.

---

## SCREEN picked-m7-2.dc.html — Table 4 left without paying: Dad reached for Clear, and the slip shows the dishes, the loss, and "Did they pay?" before the commit

- **Device:** tablet 1366×1024, landscape.
- **Theme:** light.
- **When:** about a minute after screen 1.
  - Table 2 turned: its card is gone and tile 2 is a free seat.
  - Dad opened Table 4 in the pane, scrolled to its foot, and tapped the small "စားပွဲ ရှင်း". The loss
    slip unfolded in its place, and the pane scrolled it up under the head.
  - The slip snapshotted the server's sent set and loss when it opened.
  - Nothing has been written. The kitchen is still cooking.

### LAYOUT (top to bottom)

**y0–84 StaffBar and y84–145 zone strip:** identical to screen 1.

**MAIN column (as screen 1, with these differences):**

- **Strip (y190–254):**
  - **tile 2 is FREE:** dashed 2px --t2, "2" over "ဖွင့်", a button;
  - **tile 4 is live:** --ac bar, cart glyph;
  - tiles 3 (live), 7 (done) and 10 (rest) are as screen 1; 1, 5, 6, 8 and 9 are free.
  - No hatch anywhere.
- **Region (y299–326, right of the h2):** the counts, "အသုံးပြုနေတဲ့ စားပွဲ ၄ ခု". Arming the slip says
  nothing on the board.
- **Card grid from y342:**
  - **ROW 1 (y342–509):**
    - **Table 3** (x20–433), unchanged from screen 1.
    - **Table 4 · SELECTED** (x445–858, 167px).
      - Card ground: the selected recipe: a border of color-mix(in oklab, --gold 55%, --bd) ≈
        rgba(232,168,60,0.6), plus the inset sheen, `--sh-paper` and a 0 0 18px -8px gold halo
        (globals.css:14837-14844).
      - **The lit cap on its NAME only:** "စားပွဲ 4" in an --ac pill (padding 0 8px, margin-start −8px),
        --oa ink, inset sheen, 0 0 14px -6px gold glow (globals.css:7848-7856, :14831-14836).
      - Body as screen 1: "မှာနေဆဲ", "ဆိုင်မှာ စား · ၃ ယောက်", "မီးဖိုချောင်မှာ ၃ ခု" with the amber
        "၉ မိနစ်" pill, "$41.00 ယခုအထိ · ပစ္စည်း ၃ ခု", "ဖွင့်တာ ၂၅ မိနစ်က".
      - **NOTHING about clearing is on the card**: the slip is local to the pane until a write.
  - **ROW 2 (y521–753):**
    - **Table 7 · GO** (x20–433, 232px): exactly screen 1's slab card.
    - **Table 10 · SEATED** (x445–858, 131px).

**PANE (x882–1346; content x906–1338, 432px wide):**

- **y100–160 · PANE HEAD, sticky (unchanged, TablePane.tsx:396-425; globals.css:14758-14773):**
  - opaque --pg, a 1px --bd bottom, min-height 60, margin-bottom 16;
  - h2#table-pane-h "စားပွဲ 4" (Padauk 700 26px --fs-h1, lh 1.6, one line with ellipsis, no echo);
  - the close circle `.staff-circ`, 44×44 at x1294 y108: the close glyph 20px, sr-only "ပိတ်".
- **y176–1006 · THE LOSS SLIP** (a NEW component in the rewritten ClearTableButton).
  - **Box:** 432px wide; `role="group"`, `aria-label` "စားပွဲ 4 ရှင်းတာ အတည်ပြု".
  - **Torn top (y176–187):** the shipped `.receipt-tear` (globals.css:778-787). An 11px --cd strip
    with 6px half-circle perforations punched every 20px along its top edge; borderless, as torn
    paper has no rule.
  - **Body (y187–1006):** --cd #fffdf8, 1px --bd on the sides and bottom, radius 0 0 20px 20px,
    `--sh-paper` plus the inset sheen. Padding 12px 20px 20px, so the content runs x926–1318 (392px).
  - Above the slip, the order card, the settle section ("ငွေရှင်း" with "ငွေသားနဲ့ ရှင်း · $45.31") and
    Merge have scrolled out of view under the head. The bill and the slip's doors are never on screen
    together (DECISIONS 12).

  **Inside the slip, top to bottom:**

  - **ROW A · the verdict (y199–259, 60px):** a flex row, align center, gap 16.
    - **THE DIAMOND (aria-hidden):** a 42×42 box at x926 holding a 30×30 square rotated 45° (radius
      4, 2px --warn #a44b34 border, --warnb #f6e9e4 fill). The alert glyph (18px, stroke 2.25,
      --warn) stays upright in its centre.
    - **h3 (tabIndex −1, the arm's focus target):** "ငွေ မရှင်းရသေး" (Padauk 700 26px, lh 1.6, --tx)
      over "Not paid" (13px 600 --t2, lh 1.3). The h3 follows the head's 26px, so the slip never
      out-shouts the table's name.
    - **Right (margin-start auto): CANCEL**, an @mms/ui Button quiet sm (44px tall, about 92px wide,
      x1226–1318). A stack of "မလုပ်တော့ပါ" (Padauk 700 14px, --t2) over "Cancel" (12px 600 --t2,
      lh 1.2).
  - **8px gap.**
  - **CAPTION (y267–288):** "မီးဖိုချောင် ပို့ပြီး · Sent to the kitchen". Padauk 700 13px --t2, then
    the inline echo at 13px 600 --t2. Its id names the list.
  - **4px gap.**
  - **DISH ROWS (y292–424), a `<ul role="list">`**, 3 rows of 44px with no hairlines (receipt leaders
    only). Each row is a flex row, align center, gap 8:
    - qty "1×" (15px 800 tabular --tx, in a 32px column);
    - the name stack: MY (Padauk 700 17px, lh 1.6) over EN (13px --t2, lh 1.25), from the line's own
      snapshot (`name`, `nameMy`) and never invented;
    - the state tag: a 24px pill, radius 999, padding 0 8px, Padauk 700 13px;
    - a 1px dotted rgba(58,35,23,0.28) leader (flex 1);
    - the line figure (15px 700 tabular, right edge x1318).
    - Row 1: "မုန့်ဟင်းခါး" / "Mohinga" · tag "ချက်နေဆဲ" (12% --ac wash, --ac-strong ink) · $14.00.
    - Row 2: "မြှီးရှည်" / "Mee-Shay" · tag "ပို့ပြီး" (--sf fill, --t2 ink) · $14.00.
    - Row 3: "ရှမ်းခေါက်ဆွဲ" / "Shan Noodles" · tag "ပို့ပြီး" · $13.00.
    - With 5 or more sent dishes, row 4 is followed by an @mms/ui Button quiet sm "နောက်ထပ် {n} ခု /
      +{n} more" (44px), which expands the list in place.
  - **TOTAL (y424–476).** An 8px margin, then a **1px DASHED tear rule** in color-mix(in oklab,
    var(--tx) 22%, transparent) across x926–1318 at y432. Then a 44px row:
    - left, a stack: "မီနူး ဈေးနှုန်း" (Padauk 700 15px, --tx) over "Their menu price" (13px --t2);
    - right: **"$41.00"** (Fraunces 700 26px, tabular-nums, letter-spacing −0.02em, --tx).
    - This is the server preview's loss, the ONE figure. The commit names the same binding.
  - **(Conditional, not in this example)** the drafts line under the total, 13px --t2: "နောက်ထပ် {n}
    ခု မပို့ရသေး — အရှုံးထဲ မထည့်ဘဲ ဖယ်ပါမယ်။ / {n} more not sent — they’re dropped, not counted as a
    loss."; and the comped-in-kitchen line.
  - **12px gap.**
  - **THE QUESTION (y488–539), h4:** "စားပွဲ 4 ငွေရှင်းပြီးပြီလား?" (Padauk 700 21px, lh 1.6, --tx) over
    "Did Table 4 pay?" (13px 600 --t2).
  - **8px gap.**
  - **DOOR 1 · TAKE CASH (y547–601, 54px):** @mms/ui Button secondary lg block. Paper --cd, 1px --bd,
    inset sheen, `--sh`. The content is LEFT-aligned with padding-inline 20, a row with gap 12:
    - the cash glyph (20px, --tx);
    - a stack: "ငွေသားနဲ့ ရှင်း" (Padauk 700 17px, --tx) over "Take cash" (13px 600 --t2).
    - **No figure:** the sheet it opens names the sum.
  - **8px gap.**
  - **DOOR 2 · MERGE (y609–663, 54px):** the same recipe, with the table (armchair) glyph:
    "တခြား စားပွဲနဲ့ ပေါင်း" over "Merge with another table". It is drawn only when the existing merge
    gate holds (FloorDetailLive.tsx:1691).
  - **16px gap.**
  - **THE "NO" ANSWER (y679–725, 46px), a lead-in label:**
    - a 14px diamond outline (2px --warn, rotated square, aria-hidden), gap 8;
    - a stack: "မရှင်းဘဲ ထွက်သွားကြတယ်" (Padauk 700 17px --tx) over "No — they left without paying"
      (13px 600 --t2).
  - **6px gap.**
  - **CONSEQUENCE (y731–857), a `<p>`** (the commit's description):
    - MY, Padauk 400 15px, lh 1.6, --tx: "ရှင်းလိုက်ရင် မီးဖိုချောင်ကို ရပ်ခိုင်းပြီး ဒီဟင်း ၃ ခုကို
      ပိုင်ရှင်ရဲ့ အရှုံးစာရင်းထဲ ခွင့်ပြုချက်မရဘဲ ထည့်ပါမယ်။ ငွေ မယူ၊ ပြန်လည်း မအမ်းပါ။";
    - EN, 13px --t2, lh 1.4: "Clearing tells the kitchen to stop and puts these 3 dishes on the
      owner’s loss list as not approved. Nothing is charged and nothing is refunded."
  - **12px gap.**
  - **THE COMMIT (y869–933, 64px):** @mms/ui Button **danger** xl block. Fill --warnb, border
    color-mix(in oklab, --warn 32%, transparent), ink --warn, radius 999. The content is centred, a
    row with gap 10:
    - a 16px diamond outline (2px currentColor, rotated square, aria-hidden);
    - a stack: **"ရှင်း · အရှုံး $41.00"** (Padauk 700 19px; "$41.00" is `lang="en"`, tabular) over
      **"Clear · $41.00 loss"** (13px 700).
  - **8px gap.**
  - **MANAGER STAMP (y941–985, 44px):** @mms/ui Button quiet sm, centred, `aria-expanded="false"`. A
    stack of "မန်နေဂျာ ရှိလား? ပင်နံပါတ်နဲ့ ခွင့်ပြု" (Padauk 700 14px, --t2) over "Manager here?
    Approve with PIN" (12px 600 --t2).
  - **Padding-bottom 20 → the slip ends at y1006.** The pane's 96px end reserve sits below the fold.

- **Hero check:** no filled primary anywhere in view. The danger commit is the one deliberate act and
  the doors are paper (§32: "exactly one filled … or none").

### STATES (not drawn; for the build)

- **AT REST during service (the default unpaid pane).** The settle section stays the hero (Take cash ·
  $45.31, primary xl, FloorDetailLive.tsx:1496-1553), with Merge under it.
  - At the foot (FloorDetailLive.tsx:1704-1743) there is ONLY a small @mms/ui Button **danger md**
    (48px, auto width, left-aligned) reading "စားပွဲ ရှင်း / Clear table".
  - No stub, no diamond, no figure. This is the judges' "loss stub only once Clear is reached for".
- **ARMING (the tap).**
  - The slip unfolds in place (`mms-rise`, instant under RM).
  - The pane scrolls so the slip's top sits 16px under the sticky head (`scroll-margin-top` = head +
    16; `behavior: auto` under RM).
  - Focus goes to the h3. The commit is `aria-disabled` for 400 ms (PICKED_UNDO_ARM_MS), so a double
    tap cannot fire a loss.
  - The slip SNAPSHOTS the server's sent line ids, units and `lossCents` (the CounterNoShow pattern,
    CounterNoShowButton.tsx:30-60).
- **TAKE CASH.** The slip closes and the existing CashSettleButton Sheet opens (one owner, §31). It is
  titled "ငွေသားနဲ့ ရှင်း / Take cash" and names the sum.
  - Once it settles, the table reads Paid, and screen 1's slab applies when they have left.
  - If the table owes a Send, the door is `aria-disabled` and states why with the settle gate's own
    sentence (`settleBlockedMsg`). It never opens a sheet that will refuse.
- **MERGE.** The slip closes and MergeTableButton's picker opens.
- **CANCEL / Esc.** The slip folds back to the at-rest danger md. Focus returns to it.
- **MANAGER STAMP.** It expands the existing `ManagerPinFields` inline, under the legend "မန်နေဂျာ
  ခွင့်ပြုချက် / Manager approval" (staff.ts:1312), with the shared lockout copy.
  - On a verified PIN the row reads "Aye ခွင့်ပြုပြီး / Approved by Aye" with an --ok check.
  - The consequence switches to its approved variant (English only, listed under new copy without
    Burmese). The commit is unchanged.
  - The stamp never blocks the commit: Clear never waits (ruling #6). If the owner flips the one SQL
    seam to require a PIN, the stamp becomes the required step.
- **THE COMMIT TAP.** Nothing is written for 6 s.
  - The diamond becomes a 2px DASHED --warn outline.
  - The h3 becomes "စားပွဲ 4 ရှင်းနေပါတယ် / Clearing Table 4".
  - The figure and the dishes stay put.
  - The commit's 64px slot becomes screen 1's two cells: Undo with the drain · Seat next party.
  - The pane's ONE polite region (FloorDetailLive.tsx:1351) says "စားပွဲ 4 ရှင်းနေပါတယ်" once.
  - The kitchen is told NOTHING inside the window.
- **CLEARED.** The RPC writes one `mms_approvals` row per sent dish: `void` / `table_cleared`,
  `gate_reason` `unapproved` unless stamped, `amount_cents` = unit × qty.
  - It voids the fired and cooking lines (M198), cancels the cart and closes the session.
  - The region says "စားပွဲ 4 ရှင်းပြီးပါပြီ — ဟင်း ၃ ခု အရှုံးစာရင်းထဲ ရောက်ပါပြီ။", with the RPC's OWN
    count.
  - The pane returns to "Pick a table". Focus goes to h2#floor-h. Mom's KDS shows the struck "Left —
    stop cooking" ticket in its slot until "Got it" (kitchen-ops).
- **CHANGED** (the live poll moved off the snapshot, or the server's recomputed loss or line set
  differs: `p_expect` + `p_loss_cents` + `p_seen_at`).
  - The commit refuses. A `role="alert"` line under it, keyed by `said`, says the shipped "အော်ဒါ
    ပြောင်းသွားပြီ — ပြန်စစ်ပြီး ထပ်စမ်းပါ။".
  - The shipped "အော်ဒါကို အခု အတိုင်း ပြပါ / Show the order as it is now" adopts the fresh set, and a
    moved figure re-renders.
- **A PAYMENT STARTS on the table while the slip is open.** The slip folds and the refusal shows the
  shipped "ဒီစားပွဲ ငွေရှင်းနေဆဲမို့ မရှင်းနိုင်ပါ။". The slip never shows a loss under live money.
- **M163, a card may have landed** (a stale lock, or a `live_payment_intent_id` on the cart).
  - The slip NEVER arms. The foot shows the CHECK refusal: "A card payment started here and didn’t
    finish — Check payment" (judges' graft 8: never "went through" before the server-side retrieve,
    live-intent.ts:108).
  - Until M160's staff half ships, the way out is Help (app/staff/page.tsx:160).
- **UNANSWERED or STALLED:** the shipped waiting / unknown lines plus Reload, and `out.stalled`, as
  today.
- **Night.** The slip --cd #2b213c; --warn #e0855f on --warnb #33231d (5.50:1); the tear and the
  shadows follow the `.dark` tokens.

### COPY (English): as an English device renders it

- Table 4 · Close
- **Not paid** (NEW `settle.clear.loss.head`)
- Cancel
- **Sent to the kitchen** (NEW `settle.clear.loss.sent`)
- 1× Mohinga · Cooking · $14.00
- 1× Mee-Shay · Sent · $14.00
- 1× Shan Noodles · Sent · $13.00
- **Their menu price · $41.00** (NEW `settle.clear.loss.total`)
- **Did Table 4 pay?** (NEW `settle.clear.ask` "Did Table {id} pay?")
- Take cash
- Merge with another table
- **No — they left without paying** (NEW `settle.clear.walkout`)
- **Clearing tells the kitchen to stop and puts these 3 dishes on the owner’s loss list as not
  approved.** (NEW `settle.clear.loss.body`) Nothing is charged and nothing is refunded. (NEW
  `settle.clear.loss.tail`, the noshow body's own tail)
- **Clear · $41.00 loss** (NEW `settle.clear.loss.commit` "Clear · {m} loss")
- **Manager here? Approve with PIN** (NEW `settle.clear.loss.stamp`)
- Floor: 4 active tables · the cards as screen 1, without Table 2
- **States:**
  - Clear table
  - +{n} more
  - {n} more not sent — they’re dropped, not counted as a loss.
  - Manager approval
  - Approved by {x}
  - Clearing tells the kitchen to stop and puts these {n} dishes on the owner’s loss list, approved
    by {x}.
  - Clearing Table 4
  - Undo · Seat next party
  - Table 4 cleared — 3 dishes on the loss list.
  - The order changed — check it and try again.
  - Show the order as it is now
  - Can’t clear while this table is mid-payment.
  - A card payment started here and didn’t finish — Check payment

### COPY (Burmese): shipped strings or the brief's drafts only

| Visible text                                                                                                           | Source                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| စားပွဲ 4 · ပိတ် (sr-only)                                                                                              | `floor.table` :402 · `shell.close` :69                                                          |
| စားပွဲ 4 ရှင်းတာ အတည်ပြု (the group's name)                                                                            | `settle.a11y.confirmClear` :1886-1889                                                           |
| **ငွေ မရှင်းရသေး**                                                                                                     | DRAFT: glance screen 3, brief-m7.md:427 (K15-HIGH; grounded on `settle.unpaid` :3449)           |
| မလုပ်တော့ပါ                                                                                                            | `settle.cancel` :1703                                                                           |
| **မီးဖိုချောင် ပို့ပြီး**                                                                                              | DRAFT: guided S4, brief-m7.md:342                                                               |
| မုန့်ဟင်းခါး · မြှီးရှည် · ရှမ်းခေါက်ဆွဲ                                                                               | the catalog's `name_my` (MENU_REFERENCE.md:27, :26, :31), rendered from the line's `nameMy`     |
| ချက်နေဆဲ · ပို့ပြီး                                                                                                    | `table.line.state.inProgress` :2804 · `table.line.state.fired` :2803                            |
| **မီနူး ဈေးနှုန်း**                                                                                                    | DRAFT: guided S4, brief-m7.md:344 (K15-HIGH)                                                    |
| **စားပွဲ 4 ငွေရှင်းပြီးပြီလား?**                                                                                       | DRAFT: guided S3, m7.json concepts[1] (K15-HIGH)                                                |
| ငွေသားနဲ့ ရှင်း                                                                                                        | `settle.cash.title` :1713                                                                       |
| တခြား စားပွဲနဲ့ ပေါင်း                                                                                                 | `settle.merge.btn` :1849                                                                        |
| **မရှင်းဘဲ ထွက်သွားကြတယ်**                                                                                             | DRAFT: guided S3 row 3 and S4 title, m7.json; brief-m7.md:340 (K15-HIGH)                        |
| **ရှင်းလိုက်ရင် မီးဖိုချောင်ကို ရပ်ခိုင်းပြီး ဒီဟင်း ၃ ခုကို ပိုင်ရှင်ရဲ့ အရှုံးစာရင်းထဲ ခွင့်ပြုချက်မရဘဲ ထည့်ပါမယ်။** | DRAFT: glance screen 3, brief-m7.md:431 (K15-HIGH; the new word အရှုံးစာရင်း)                   |
| ငွေ မယူ၊ ပြန်လည်း မအမ်းပါ။                                                                                             | the shipped tail of `table.noshow.body.one/.many` :3533-3540 (judges' graft 3; brief-m7.md:347) |
| **ရှင်း · အရှုံး $41.00**                                                                                              | DRAFT: glance screen 3, brief-m7.md:432 (K15-HIGH)                                              |
| **မန်နေဂျာ ရှိလား? ပင်နံပါတ်နဲ့ ခွင့်ပြု**                                                                             | DRAFT: glance screen 3, brief-m7.md:433                                                         |
| အသုံးပြုနေတဲ့ စားပွဲ ၄ ခု                                                                                              | `floor.tables.count.many` :1016-1019                                                            |
| (state) စားပွဲ ရှင်း                                                                                                   | `settle.clear.btn` :1836                                                                        |
| (state) နောက်ထပ် {n} ခု                                                                                                | DRAFT: glance, brief-m7.md:430                                                                  |
| (state) နောက်ထပ် {n} ခု မပို့ရသေး — အရှုံးထဲ မထည့်ဘဲ ဖယ်ပါမယ်။                                                         | `table.noshow.body.drafts.*` :3542-3549                                                         |
| (state) မန်နေဂျာ ခွင့်ပြုချက်                                                                                          | `table.loss.managerLegend` :1312                                                                |
| (state) {x} ခွင့်ပြုပြီး                                                                                               | DRAFT: glance, brief-m7.md:434                                                                  |
| (state) စားပွဲ 4 ရှင်းနေပါတယ်                                                                                          | DRAFT: judges' graft 2, brief-m7.md:447                                                         |
| (state) ပြန်ဖျက် · နောက်ဧည့်သည် ဖွင့်                                                                                  | `kds.undo` :255 · DRAFT brief-m7.md:404                                                         |
| (state) စားပွဲ 4 ရှင်းပြီးပါပြီ — ဟင်း ၃ ခု အရှုံးစာရင်းထဲ ရောက်ပါပြီ။                                                 | DRAFT: glance, brief-m7.md:435 (K15-HIGH)                                                       |
| (state) အော်ဒါ ပြောင်းသွားပြီ — ပြန်စစ်ပြီး ထပ်စမ်းပါ။ · အော်ဒါကို အခု အတိုင်း ပြပါ                                    | `table.noshow.err.changed` :3587 · `table.noshow.rearm` :3564                                   |
| (state) ဒီစားပွဲ ငွေရှင်းနေဆဲမို့ မရှင်းနိုင်ပါ။                                                                       | `settle.clear.midPayment` :1843-1846                                                            |
| (state) the approved-variant consequence; the CHECK sentence                                                           | NO Burmese in any source. English only, listed below                                            |

### A11Y

- **One live region per view.** The pane keeps its existing polite `<p role="status">`
  (FloorDetailLive.tsx:1351) for the window lines and the outcome. The board's region is untouched by
  arming.
  - Refusals (changed, paying, outage) are `role="alert"`, keyed by `said` so a re-said sentence is
    announced again (the ClearTableButton precedent, ClearTableButton.tsx:241-260).
  - The slip itself is not live.
- **Structure:**
  - the slip is `role="group"` with `aria-label` "စားပွဲ 4 ရှင်းတာ အတည်ပြု" (`settle.a11y.confirmClear`);
  - h3 "ငွေ မရှင်းရသေး", then h4 for the question;
  - the dish list is `role="list"`, `aria-labelledby` the caption;
  - the total is phrasing content in a row, not a `<dl>`.
- **Names:**
  - **the doors:** their visible text;
  - **the commit:** its visible text "ရှင်း · အရှုံး $41.00 Clear · $41.00 loss", with
    `aria-describedby` → the consequence `<p>`, so the loss and the "not approved" are heard before
    activation;
  - **the stamp:** `aria-expanded` plus `aria-controls` → the PIN fields.
  - The diamonds are `aria-hidden`; the words carry the meaning.
- **Focus:**
  - arm → the h3 (facts first; never the commit);
  - Cancel or Esc → the at-rest Clear;
  - Take cash → the cash Sheet's title, and the Sheet's close returns focus to the settle section's
    cash trigger;
  - Merge → the picker;
  - commit → the Undo cell;
  - cleared → h2#floor-h;
  - never <body>.
- **The arm:** the commit is `aria-disabled` for 400 ms after the slip opens (PICKED_UNDO_ARM_MS).
  Every disabled state is `aria-disabled`, never native.
- **Targets:**
  - commit 64 (xl);
  - doors 54 (lg), 392px wide;
  - Cancel, stamp and "+{n} more" 44 (sm);
  - the pane's close circle 44.
- **Never colour alone:**
  - the diamond + "Not paid";
  - the danger tint + "loss" in the label;
  - the state tags are words ("ချက်နေဆဲ", "ပို့ပြီး").
- **Reduced motion:** the slip's unfold and the pane scroll are instant (`behavior: auto`). The window
  drain follows screen 1.
- **Burmese:** as screen 1. "$41.00" and "4" inside a Burmese run are `lang="en"`; "၃ ခု" uses Burmese
  numerals.

### CODE CHECK (claims this screen depends on)

- **Today's clear cancels a dine-in cart** — sent and cooking lines included — **with no loss row and
  no undo** (floor.ts:1201-1208). Its only money guard lapses with the 5-minute lock TTL
  (floor.ts:1161-1167; pay-guard.ts:38-44; lock-ttl.ts:32).
- **The loss rule is the owner's.** Clear never waits; every sent dish is recorded as `void` /
  `table_cleared` / `unapproved` unless a manager approved; one SQL seam can switch the PIN on; no
  new approvals kind (OWNER_RULINGS_2026-10-07.md:48).
- **The migration needs the owner's go at a quiet time** (OWNER_RULINGS_2026-10-07.md:47, #5).
- **Ruling #11: cash is the only outside payment.** "Take cash" is therefore the only "yes, they
  paid" door (OWNER_RULINGS_2026-10-07.md:58).
- **The ledger already exists.**
  - `mms_approvals` carries `amount_cents` = unit_price × qty, "the loss / value at risk"
    (20260622060000_voids_comps.sql:43-58, :51).
  - `gate_reason` was added in 20260622100000_s2_polish.sql:10.
  - The no-show RPC is the precedent: it writes `ci.unit_price_cents * ci.qty` per sent line
    (20261001000000_p2f_counter_cook_before_paid.sql:303).
  - So "Their menu price" is the figure the ledger records, not the tax-inclusive bill.
- **NEW (the build):**
  - `mms_clear_preview` + `mms_clear_table(p_session, p_seen_at, p_expect, p_loss_cents,
p_initiator, p_approver)` in one migration (revoke from public, grant to service_role), plus a
    SQL test registered in ci.yml;
  - `TableDetail.clearPreview { lossCents, sentLineIds, units, cookingUnits, draftUnits,
seenAt }`;
  - the slip in the rewritten ClearTableButton (@mms/ui Button; packages/ui unedited, P2cm);
  - none of these exist today. `grep mms_clear_table` matches only docs/OPEN-ITEMS.md and
    docs/OWNER_RULINGS_2026-10-07.md.
- **The snapshot and "changed" pattern is shipped** for the counter no-show: snapshot,
  `expectedLineIds`, `changed`, and "Show the order as it is now" (CounterNoShowButton.tsx:30-60;
  staff.ts:3564, :3587).
- **The doors' owners exist:**
  - CashSettleButton is a Sheet titled `settle.cash.title`, with the trigger
    `settle.cash.trigger` "Take cash · {m}" (CashSettleButton.tsx:639-658; staff.ts:1708, :1713);
  - MergeTableButton has the gate `canWrite && itemCount > 0 && tab !== "secure" && mergeable`
    (FloorDetailLive.tsx:1691-1702).
- **The M151 link EXISTS** (20260905000000_m151_live_payment_intent.sql), and
  `classifyLiveIntentForSettlement` treats an authorization as captured (live-intent.ts:108). The
  CHECK face is built on a real column, correcting Turn Signals' false premise.
- **The torn edge is shipped:** `.receipt-tear` (globals.css:778-787); the lit cap and the selected
  card (globals.css:7848-7856, :14837-14844); the pane geometry (globals.css:14708-14719,
  :14758-14773).
- **The pane head is h2, Burmese-only** (TablePane.tsx:396-425). The sample bill total is $45.31 =
  $41.00 + 10.5% per-line tax (tax.ts:7). It is not drawn, because it scrolled away.

---

## DECISIONS

1. **Glanceable is the backbone** (owner answer 1: staff moments are glanceable): the shaped
   verdict, the act where the verdict is drawn, and the Undo in the same slot. Turn Signals evolved,
   with the same split, strip, cards and example tables.
2. **A paid, finished table clears in one tap on its own card, with a 6 s Undo** (the concept's
   core, §22: undo beats "are you sure?"). GO is one pure predicate on fields the floor already
   carries:
   - paid · tone `done` · no tab · nothing open;
   - kitchen done, with nothing served in the last 5 min;
   - the kitchen read known.

   A seated, ordering, refunded or unknown table never gets a slab.

3. **The slab speaks guided's next step: "They’ve left — clear Table 7"** (the graft from guided).
   It answers the judges' first risk for Turn Signals, a paid family still at tea being cleared. A
   maître d' clears when the party stands up, not when the card clears.
4. **The slab is calm: an --ok RING, never a filled disc, on the pale --okb ground.** The
   "{k} ready to clear" count is retired (quiet's restraint; the owner's "nagging marks" note). The
   floor's loudest object stays the table asking to pay, its one filled tile.
5. **The window says "Clearing Table N" / "စားပွဲ N ရှင်းနေပါတယ်", never "cleared"** (judges' graft
   2). "Free" and "cleared" are said only after the RPC answers, and a loss clear prints the RPC's
   own count.
6. **No text is dimmed.** The 0.55 opacity is replaced by a 12% ink hatch, computed to keep every
   text token at or above 4.5:1 in light and Night. The concept's 18% would have dropped --t3 to
   4.24:1 (Turn Signals' defect 3).
7. **Seat next party is a paper secondary beside the outline Undo, never a filled hero.**
   - §32: "reversing is never the hero … exactly one filled or none" (DESIGN-LANGUAGE.md:2411-2415).
   - The judges flagged the filled Start beside Undo in Have They Left?.
   - The owner's m6 default says a shortcut sits beside the main button only as a secondary.
   - It commits now, then starts through the screen's one mint lock.
8. **Both slot cells arm after 400 ms** (PICKED_UNDO_ARM_MS). A double tap on the slab's right half
   would otherwise seat a party Dad never meant to start.
9. **One Undo per clear, in the slot where it was tapped. There is no second fixed xl Toast**
   (judges' graft 4). The lane's pill already owns the bottom-centre of this page
   (ExpoBoard.tsx:1254-1257, app/staff/page.tsx:287).
10. **Touch never holds the window; only `:focus-visible` holds, with a 60 s cap and a 5 s warning**
    (undo-hold.ts). This fixes guided's "resting finger holds" defect.
11. **The loss slip appears only after Dad reaches for Clear.** That is the owner's m7 default: one
    extra tap that first shows the dishes and the loss, then a 6 s Undo. It also answers Turn
    Signals' defect 1. During service an unpaid pane shows only a small danger md "စားပွဲ ရှင်း", and
    Take cash stays the pane's hero (§32).
12. **The slip takes the pane.** It scrolls under the sticky head, so the bill and its own "Take
    cash" doors are never on screen together: one owner per fact (§31), and no two money figures side
    by side (the judges' "second big money figure" note).
13. **"Did they pay?" comes before the commit, with two shipped doors: Take cash · Merge with another
    table** (owner answer, the m7 default; judges' graft 1; ruling #11 cash only).
    - Each door opens the existing owner (CashSettleButton's Sheet, MergeTableButton's picker) and
      carries no figure.
    - The commit is the third answer, "No — they left without paying". A forgotten cash payment or a
      party that moved tables never becomes a false loss row.
14. **Receipt language** (DESIGN-LANGUAGE.md §8):
    - the slip reuses the shipped `.receipt-tear` instead of a new zigzag;
    - the dishes carry leaders and their own kitchen words;
    - the total, "Their menu price $41.00", is the ONE figure, and the commit names the same sum
      (§22: name the sum on the control).
    - Turn Signals' 40px headline figure is retired.
15. **The loss is server-derived and guarded** (judges' graft 5). It is Σ unit × qty over the sent
    set, the same product the ledger records per row (voids_comps.sql:51; the no-show RPC, p2f:303).
    The clear takes `p_expect`, `p_loss_cents` and `p_seen_at`, and refuses `changed`, so the loss
    Dad saw is the loss written, or nothing is.
16. **Shipped strings are reused wherever they exist** (judges' graft 3):
    - the noshow money tail;
    - `changed` and `rearm`;
    - the drafts line;
    - `settle.cash.title`, `settle.merge.btn`, `settle.cancel`, `settle.clear.btn`;
    - `kds.undo`, `table.send.undoLeft`;
    - `settle.a11y.confirmClear`, `table.loss.managerLegend`;
    - "Kitchen done".
17. **Glance's fact line "3 sent · 1 cooking now" is dropped.** The rows' own tags carry it (quiet's
    restraint). Its second count `{k}` would also have rendered Latin in a Burmese run: fill.ts
    localizes only `{n}` and `{total}`.
18. **The manager stamp is optional and never blocks** (ruling #6: Clear never waits). It is drawn
    quiet, under the commit, as the void slip's stamp line.
19. **After the loss commit, the same 6 s slot (Undo · Seat next party) as a paid clear.** There is
    one turnover vocabulary, and nothing reaches the kitchen during the window.
20. **The KDS "Table N left — stop cooking" ticket keeps its slot until "Got it", with no timer**
    (judges' graft 6; kitchen-ops' half). The slip's "tells the kitchen to stop" ships only with it.
21. **M163 / CHECK: a card-linked table never reaches the slab or the slip.** The pre-tap words say
    "started … didn’t finish", never "went through" (judges' graft 8). It is built on the M151 column
    that exists, which corrects Turn Signals' false premise.
22. **Fidelity fixes against m7-glance-1/2:**
    - card text, chips and the region are Burmese-only in Both mode, as built (Chrome echo false;
      FloorStatusChip no echo);
    - counts use Burmese numerals (the fill.ts owner rule, 2026-09-05), while ids, money and qty stay
      Latin;
    - Table 4's "so far" is the pre-tax lines sum, $41.00, matching its slip (the earlier artboard
      printed $46.12 beside $41.00 of dishes);
    - Table 3 is $27.00;
    - the strip glyphs are as built (live = cart), and the key has no Start entry;
    - the region is 13px, as built.
23. **The moment of delight is THE TURN** (glanceable's graft). The card leaves in place and tile 2
    becomes the dashed free seat with one ring, once. Under RM it is instant, with no ring.
24. **Light is drawn; Night is the same layout on tokens**, with every composite computed. Glass is
    not used (it is Night-only and never touches a selected element).

## OPEN RISKS

1. **The migration gates the whole design.** The slab, the deferred Undo, the slip, the loss rows,
   the joined/changed refusals and Seat next all need `mms_clear_table` (ruling #5: the owner's go, at
   a quiet time). Until then today's two-step confirm stays. None of this ships half. P2am's unmount
   guard and the @mms/ui migration (P2cm) can land first.
2. **Every new Burmese string is an unverified K15 draft:**
   - ထွက်သွားကြပြီ — စားပွဲ {id} ရှင်း · စားပွဲ {id} ရှင်းနေပါတယ် · နောက်ဧည့်သည် ဖွင့်;
   - ငွေ မရှင်းရသေး · မီးဖိုချောင် ပို့ပြီး · မီနူး ဈေးနှုန်း;
   - စားပွဲ {id} ငွေရှင်းပြီးပြီလား? · မရှင်းဘဲ ထွက်သွားကြတယ်;
   - the consequence sentence, with the new word အရှုံးစာရင်း · ရှင်း · အရှုံး {m};
   - the stamp line, "{x} ခွင့်ပြုပြီး", and the five outcome sentences.

   Log them in a "K15 · counter-floor" row and read them on the ruling-#12 word-check sheet.

3. **The K15-HIGH money words lose their English in Burmese-only mode.** Chrome hides echoes there,
   and `keepEcho` is confined to language surfaces by check:staff-lang rule 6 (Chrome.tsx:46-60). The
   brief's "English echo kept in my-only mode" promise is NOT kept by today's code. The owner decides
   whether to widen that rule for the slip's commit and total.
4. **"Tells the kitchen to stop" is true only with the KDS stop ticket.** Today a cleared cart's
   ticket silently vanishes (kitchen.ts:310). Ship the slip's sentence with kitchen-ops' slot, or drop
   that clause until then.
5. **Premature clears.** The slab still invites a tap on a lingering family. The wording, the 5-min
   `up` guard, the 6 s Undo and the server's `joined` refusal limit the harm. Watch Dad at the
   ruling-#12 sitting, and say so in Help.
6. **The TableCard restructure** (Card-as-Link → a `.card` div with link + slab) touches:
   - `.floor-card[aria-current]` (keyed on the card today);
   - the press and hover lift;
   - HelpPicture's replica (`tableCardStyle`);
   - TableCard's tests.

   The card's `al()` name must stay on the link.

7. **Two figures, two meanings.** The ledger records menu price, pre-tax ($41.00), while the bill
   charges $45.31. The doors carry no figure to avoid showing both, but the owner should know the loss
   list counts menu price (`amount_cents` semantics). Say it in the owner's loss review.
8. **The slip is about 830px tall and fills the pane at 1366×1024.** On a 1366×768 tablet or at a
   larger text dial, the commit sits below the fold. Arming must scroll the HEAD into view, never the
   commit. Measure both on the real tablet.
9. **The Take cash door depends on the settle gate.** A table owing a Send cannot take cash
   (`settleBlocked`), so the door must say why rather than open a refusing sheet. Test it with a
   drafts-only line.
10. **A second Undo host.** If the pane opens a clearing table mid-window, decide ONE place for its
    Undo: the floor slot, as drawn. Undo-hold supports two sources if the sitting asks for both.
11. **The `{k}` slot.** Any later key with two counts needs a second count-class slot name; fill.ts
    localizes only `n` and `total`. This spec avoided it by dropping the fact line.
12. **The CHECK face waits on M160's staff half** ("Check payment"). Until then the way out is Help.
    Abandoned pay sheets are now told apart by the M151 link, so far fewer tables strand than Turn
    Signals feared.
13. **No OPEN-ITEMS row exists for this refined turnover design.** File it under counter-floor package
    4: M182, M198 (the clear half), P2de, P2df, P2am, P2cm, P2hf. Add the K15 · counter-floor ledger
    row, and close nothing until the RPC is live.

---

## Appendix — what changed after this spec (applied in the drawn screens)

The spec above was written first. Two later passes changed it, and the screens on the canvas were drawn
with both applied. **Where an item below contradicts the spec above, the item below wins.**

### A · System amendments (the cross-moment consistency pass)

1. The Undo cell takes the counter's one in-slot Undo posture (the lane's: --sf fill with a 1.5px dashed --ac edge) instead of a plain paper cell, because the lane's Undo shares this counter page. Drop the in-slot drain bar: the seconds leaf '· ၄ စက္ကန့်' is the one in-slot countdown, and drains belong only to the Toast pill.
2. Loss slip: the '1px DASHED tear rule' above the total becomes a solid 1px --bd total rule, as m2's slip foot has. Dashed means provisional on this console (the committing diamond and the clearing chip keep their dashed edges correctly).
3. The slip's 'Take cash' door opens m6's till tray, the one cash sheet.
4. Coordinate the 'stop cooking' KDS card with m5's reserved shape, and ship the slip's 'tells the kitchen to stop' clause only with it, as risk 4 already says.
5. Follow the shared pane order with m2 and m8. 'Clear table' (small danger md) stays the last element, after settle and Merge.

### B · The adversarial critic's blocking fixes (verdict: fix)

1. **Amendment 1 not applied: the Undo cell is still a plain paper cell, it keeps the in-slot drain bar, and it shows two ticking countdowns.**
   - Evidence: picked-m7.md:199-208 says the LEFT UNDO cell is 'paper --cd' with 'THE DRAIN: a 3px bar … scaleX() from 1 to 0 over 6000ms'. The drain recurs at :107 (token row), :422 (RM rule), :635 ('Undo with the drain') and :772-773 ('The window drain follows screen 1'). Line 1 carries ' · ၄ စက္ကန့်' and line 2 carries 'Undo · 4s', so the cell has two second-leaves. The amendment requires the counter's one in-slot Undo posture (--sf fill, 1.5px dashed --ac edge), the seconds leaf as the ONE in-slot countdown, and drains only on the Toast pill (primitives.css:541-561 is the pill's recipe, not a slot's). The shared vocabulary also defines Undo as one word with one aria-hidden seconds leaf.
   - Fix: Undo cell: --sf ground and a 1.5px dashed --ac edge, never filled and never the hero. Delete the drain everywhere (:107, :205-208, :422, :635, :772-773). Keep ONE aria-hidden seconds leaf ('ပြန်ဖျက် · ၄ စက္ကန့်'), with the English echo reading just 'Undo'. Contrast stays legal: --tx on --sf 15.5, --t2 on --sf 5.09, the --ac edge on --sf 4.28 (non-text).
2. **Amendment 2 not applied: the loss slip still draws a DASHED tear rule above the total.**
   - Evidence: picked-m7.md:554-555: 'An 8px margin, then a **1px DASHED tear rule** in color-mix(in oklab, var(--tx) 22%, transparent)'. On this console dashed means provisional (shared marks). A loss figure that is the server's settled preview must not wear the provisional edge. The amendment asks for m2's solid 1px --bd total rule.
   - Fix: Replace it with a solid 1px --bd total rule, as m2's slip foot has. Keep the dashed edge only on the committing diamond (:632) and the clearing chip (:191).
3. **Amendment 3 not applied: the slip's 'Take cash' door opens 'the existing CashSettleButton Sheet', not m6's till tray, the one cash sheet.**
   - Evidence: picked-m7.md:617-618 ('the existing CashSettleButton Sheet opens … titled ငွေသားနဲ့ ရှင်း / Take cash and names the sum'). It recurs at :755-756 and :808-809. m6's tray is a separate layout branch: picked-m6.md:240 (`.mms-sheet.till-sheet` at ≥64em/≥44em) and :968 (`a layout="till" JSX branch in CashSettleButton`). A door that mounts or opens the sheet without that branch gives the counter two different cash sheets.
   - Fix: State that the door is a second trigger of the pane's ONE CashSettleButton instance, opened in layout="till" (the crowned tray: the gold crown band, the cash glyph square, the --till-fs-say due). Its close returns focus to the settle section's trigger. Do not mount a second CashSettleButton.
4. **Amendment 4 not applied: the KDS 'stop cooking' card is not coordinated with m5's reserved shape, and risk 4 still offers to ship the slip without it.**
   - Evidence: picked-m7.md:643-644 and DECISIONS 20 (:899-900) give only 'the struck Left — stop cooking ticket in its slot until Got it'. No shape, no Night tokens, no loudness tier and no reference to m5 (grep of picked-m5.md for stop/struck/cleared finds nothing). Risk 4 (:938-940) says 'Ship the slip's sentence with kitchen-ops' slot, OR DROP THAT CLAUSE until then'. The amendment says the clause ships ONLY with the card. Dropping the clause would also need a clause-less Burmese consequence, and no source holds one (the only draft is brief-m7.md:431, which contains the clause). Today kitchen.ts:309 silently drops a cancelled cart's ticket.
   - Fix: Name m5's reserved card shape for 'စားပွဲ {id} ထွက်သွားပြီ — ချက်တာ ရပ်ပါ' (brief-m7.md:356): Night-forced, MARK tier below Late, never cream-filled. Make the slip's consequence sentence conditional on that card shipping in the same release, and delete risk 4's 'or drop that clause'.
5. **The slab's marks break the shared vocabulary. It uses a HOLLOW RING to mean 'can go / paid' and a green ground fill on a standing control.**
   - Evidence: picked-m7.md:26-28 and :240-241: 'a 2px --ok RING on the pale --okb ground … transparent fill, holding the check glyph'. The slab ground is --okb (:238). Shared marks: 'a HOLLOW RING with Not sent yet · မပို့ရသေး means dishes the kitchen hasn't got', and 'GREEN … filled only on the screen where it just landed'. Loudness ladder: done/paid is tier 4 CALM. Every paid, finished card would wear a 64px green-filled call with a hollow-ring mark.
   - Fix: Drop the ring. The slab is a paper secondary (--cd, 1px --bd top line) with the verb in --tx and no green ground. The card's shipped 'ငွေရှင်းပြီး' chip and the tile's check already carry 'paid', and no fact is marked twice.
6. **The slab tells Dad something the code cannot know, and it nags during normal service. Every paid table shows 'They’ve left — clear Table 7' five minutes after its last dish is served, whether or not the party is still seated.**
   - Evidence: picked-m7.md:37-39 and :242-243 put the claim 'ထွက်သွားကြပြီ — စားပွဲ 7 ရှင်း / They’ve left — clear Table 7' on the card. Guided's question 'Have they left?' was dropped (brief-m7.md:249), and the judges praised guided precisely because it was 'asked, not claimed' (m7.json scores[1].note). The slab appears when PULSE_PASS_LINGER_MS lapses (board-pulse.ts:168), which is time-driven escalation; the ladder says only Late escalates with time. The spec retired the '{k} ready to clear' count as 'pressure to clear people still drinking tea' (:25-26), but the per-card slab is the same pressure on each table. Judges' graft 7 (brief-m7.md:454) said 'a hint inside the card's link, NOT a second control'. The spec's own risk 5 (:941-943) admits it invites a tap on a lingering family.
   - Fix: At rest, a paid finished card shows only a quiet hint inside its link: the check plus 'ထွက်သွားရင် ရှင်းပါ · Clear when they leave' (DRAFT brief-m7.md:282). The one-tap 'They’ve left — clear Table N' verb appears only once Dad has selected that card (the lit cap) or in its pane, where it answers a question he has started.
7. **The loss diamond is drawn filled and three times on one screen, and an approval is marked with a green check.**
   - Evidence: Row A's diamond has '2px --warn border, --warnb #f6e9e4 fill' (picked-m7.md:528-530). The ladder puts 'the loss diamond' at tier 3 MARK, 'glyph + word, no fill'. Warn ground fill is reserved for 'a Late ticket and the floor's one ask tile'. The diamond is drawn again at :577 (the 'No' lead-in) and :590 (the commit), against 'No fact is marked twice on one screen'. :626 adds 'Approved by Aye with an --ok check', but a ✓ 'never marks an approval' and green means done and settled, not a stamped pending clear.
   - Fix: Draw ONE diamond: Row A, outline only (2px --warn, no fill), with the upright alert glyph. Remove the lead-in diamond and the commit's diamond; the danger commit is already the one warn act. Mark the stamped approval with the word 'Aye ခွင့်ပြုပြီး' only, with no ✓ and no green.
8. **The spec invents a second 'provisional' mark (a 45° hatch), the strip's clearing tile lacks the shared dashed edge, and 'Clearing Table 2' is shown four times on screen 1.**
   - Evidence: picked-m7.md:103 adds a NEW 'pending hatch'. :153-157 draws tile 2 CLEARING with the hatch and a solid 1px --bd border. :187-192 puts the hatch on the card's link area plus the dashed chip reading 'စားပွဲ 2 ရှင်းနေပါတယ်'. :167-169 puts the same sentence visibly in the board region at the same moment. Shared marks: 'A DASHED edge means provisional … a clearing table', and 'No fact is marked twice on one screen'. The shipped stripe already means a write in flight (`aria-busy`, globals.css:7570-7577, 135° --tx 20%), so a 45° --t3 stripe for 'nothing written yet' is a parallel vocabulary. Over the card's --tex-dot grid, the hatch's darkest pixel takes --t3 to 3.78 in light and 3.27 in Night.
   - Fix: Delete the hatch. Clearing = the dashed chip on the card, plus a 2px dashed edge on tile 2 that stays an occupied link with its done glyph. Put the region's turnover line in an sr-only span while the visible region keeps the counts (FloorDetailLive.tsx:1345 is the precedent: 'rendered sr-only — the panel shows the same words').
9. **The loss clear's only Undo can disappear while its window still commits a $41.00 loss. The owner's m7 default ('then a 6-second Undo') is not kept on that path.**
   - Evidence: The window 'lives in CounterSplit … so closing or switching the pane never drops it' (picked-m7.md:279-280). But the loss slip's Undo exists only in the pane (:635). The floor card shows 'NOTHING about clearing' (:503), and THE COMMIT TAP (:631-637) changes no floor card. If Dad taps another card or closes the pane inside 6 s, the Undo unmounts and the loss writes anyway. On the full-page route (<64em, /staff/table/[id], where FloorDetailLive also mounts ClearTableButton, FloorDetailLive.tsx:1738-1742) there is no CounterSplit, and the spec does not say where the window lives.
   - Fix: At the commit tap, Table 4's floor card takes the same CLEARING chip and in-slot Undo · Seat next party as screen 1 (one Undo per clear, in the floor slot that outlives the pane). Alternatively, unmounting the pane or the page inside the window drops the pending clear, which is the safe direction since nothing was written. Specify the full-page route as well.
10. **The loss clear's outcome, including the RPC's own count, is spoken into a region that unmounts in the same render, so it is never heard or seen.**

- Evidence: picked-m7.md:641-643: 'The region says စားပွဲ 4 ရှင်းပြီးပါပြီ — ဟင်း ၃ ခု …', then 'The pane returns to Pick a table'. A11Y :734-735 assigns 'the window lines and the outcome' to the pane's region (FloorDetailLive.tsx:1350-1351). TablePane renders EmptyState when sel === null (TablePane.tsx:365-380), which unmounts FloorDetailLive and its region.
- Fix: Say the loss outcome in the board's region (FloorBoard.tsx:389-392) at the turnover-news slot, as screen 1 already does for 'free'. The pane's region carries only the window lines.

11. **The region's precedence lets 'Ready to serve' mask the only WCAG 2.2.1 warning before a held window releases.**

- Evidence: picked-m7.md:285-286 puts the hold-cap warning ('ခဏနေရင် စားပွဲ 2 ကို ရှင်းပါမယ် …') in the board region. :314 and :393-394 rank 'refusal > freeze > Ready to serve > turnover news > counts'. upNotice is set on every poll that brings new up-keys and dwells UP_NOTICE_DWELL_MS = ERR_DWELL_MS = 8 000 ms (FloorBoard.tsx:226-232; floor-kitchen.ts:207; kds-errors.ts:82), longer than the 5 s warning (undo-hold.ts PICKED_HOLD_WARN_MS). On a busy night a bump just before the warning hides it, and the clear commits under a keyboard user with no word, which is exactly what undo-hold.ts:36-39 exists to prevent.
- Fix: Rank the hold-cap warning above 'Ready to serve' (refusal > freeze > hold warning > Ready to serve > other turnover news > counts), or give the held Undo its own aria-describedby warning line.

12. **Two heroes in one state. While the slip is armed, the settle section's filled primary 'Take cash · $45.31' stays mounted above it, and only scroll position hides it.**

- Evidence: picked-m7.md:521-523 ('scrolled out of view under the head'), DECISIONS 12 (:865-867, 'never on screen together') and the hero check (:599-600, 'no filled primary anywhere IN VIEW'). Only the viewport separates the two. On a pane taller than the slip plus its end reserve (830 + 96px; for example a 1200px-tall tablet, pane ≈1084px), the pane cannot scroll the settle section away, so the filled primary and the danger xl commit show together. The slip also adds its own second 'Take cash' door to the same pane. Rule: one hero verb per state.
- Fix: While the slip is armed, demote the settle trigger to secondary (or fold the settle section into the slip's 'Take cash' door, so there is one trigger and one sheet). Then 'one filled or none' holds by state, not by scroll.

13. **The pane's Clear is unspecified for every table that has no sent, unpaid food.**

- Evidence: The slip is defined only for 'unpaid with dishes sent' (picked-m7.md:468-660). But the spec also says 'a refunded table clears from the pane' (:265-266), a paid table can be opened in the pane, kitchen-unknown tables get no slab (:270), and a mis-tapped seated table has no items (P2de, OPEN-ITEMS:329). On those tables the slip's 'ငွေ မရှင်းရသေး / Not paid', 'Did Table N pay?' and 'Clear · $0.00 loss' would be false or empty. The spec never says what Clear does there, on a destructive control.
- Fix: Add the pane's no-loss path. For a paid, refunded, seated-empty or kitchen-unknown table, a danger md 'စားပွဲ ရှင်း' commits straight into the 6 s Undo · Seat next slot (§22 undo over confirm), with no diamond, no 'Not paid' and no loss figure. The slip arms only when the server preview's sent set is non-empty.

14. **The CHECK refusal names a 'Check payment' way out that does not exist.**

- Evidence: picked-m7.md:653-657: 'A card payment started here and didn’t finish — Check payment', then 'Until M160's staff half ships, the way out is Help'. No 'Check payment' string or control exists (grep of lib/i18n/staff.ts and components returns nothing). Help rides only the counter bar (app/staff/page.tsx:160, `home.view === "floor"`), so the full table page has neither. Lens rule 1 (brief-m7.md:24) says a blocking refusal must name the real way out.
- Fix: Until M160's control ships, the sentence names the real exit, for example '… — ask for help from Help' (English-only, listed), plus a Help door on the full table page. Switch the copy to 'Check payment' in the same PR that ships that control.

15. **Wrong citations, including one false premise that is put to the owner as a decision.**

- Evidence: (a) Risk 3 (picked-m7.md:934-937) says K15-HIGH money words lose their English in Burmese-only mode. That is false: echoDrawn returns `shown || STAFF_K15_HIGH.has(key)` (staff-labels.ts:84-86; Chrome.tsx:46-53, rule 4: 'a key in STAFF_K15_HIGH keeps its English line whatever the device says'). (b) :802-803 says `grep mms_clear_table` matches OPEN-ITEMS.md and OWNER_RULINGS; `git grep` matches nothing in the repo. (c) FloorBoard.tsx:377 → the h2#floor-h is at :378. (d) voids_comps.sql:51 (:790, DECISIONS 15) → `amount_cents` is at :52. (e) kitchen.ts:310 → the cancelled-cart skip is at :309.
- Fix: Rewrite risk 3 as a build step: add every new money key (settle.clear.loss.head/.total/.body/.commit, settle.clear.walkout, settle.clear.ask) to STAFF_K15_HIGH so its English survives. No owner ruling is needed. Correct (b) to 'matches nothing' and fix the line numbers in (c) to (e).

### C · The critic's suggestions (not blocking; take them where the build agrees)

- The slab's appearance on a poll (card height 167 → 232px) and the card's .mms-remove after commit both reflow the grid under Dad's finger. That contradicts the spec's 'nothing on the board reflows until the outcome is real' (picked-m7.md:58-59). Hold the shifted cards (and a newly appeared slab) from taps for SAME_GESTURE_MS with the shipped [data-settling] rule (globals.css:13121-13124).
- Hide or hold the floor's clear verb while the board is degraded or frozen (FloorBoard's `degraded`). Lens rule 2 says staff doors fail closed; a 6 s window opened on a last-known snapshot can only end in the outage line.
- 'Seat next party' navigates to /staff/table/{id}/add, which is off the counter home, the only place the bell rings (m6 cites app/staff/page.tsx:327). Carry m6's honest bell note, or open the new table in the pane at ≥64em, so Dad keeps hearing the bell.
- Say what Seat next does when the screen's one mint lock is already held (useCounterMint `startHeld`, TableStrip.tsx:93): refuse out loud in the board region rather than silently queueing.
- Fold the 'No — they left without paying' lead-in into the commit's own words or its aria-describedby. The staff register puts the next step inside the control, not in a separate line above it.
- The slip's English echoes on Cancel and the manager stamp are 12px --t2 (picked-m7.md:535-536, :595-596). Raise them to the 13px floor for arm's-length reading.
- Give the conditional drafts line the shared hollow-ring 'Not sent yet · မပို့ရသေး' mark, so not-sent reads the same on the slip as on the floor.
- Give the slip's Take cash door the till's gold-tint cash glyph square (m6's tray head), so the door and the tray it opens share one look.
- Reconcile the staff-bar geometry across the family: m7 draws the bar 84px tall with the pane sticky at y100, while m2 and m8 draw 76 and y92. Pick the measured --staff-bar-h once.
- With the hatch kept or dropped, note in the spec that card texture dots under stripes are the repo's open dot-core question (composite-contrast.test.ts:953-959), not a solved 4.5:1.

### D · Round 3 (2026-10-07, under the owner's delegation) — these win over everything above

The owner delegated every open decision ("I trust you to apply world-class design-thinking best standards on
all open decisions") and added a live TV board, card / Apple Pay after the food is served, and animated step
guides. PATH_DESIGN_2026-10-07.md's round-3 section records the decisions (D1–D5) and the shared vocabulary.
The round-3 consistency pass gave this moment these changes:

1. D2(7): M182's table-clear RPC marks the cart's pending approval requests 'superseded' inside its own transaction, as merge, no-show and counter-clear already do. Those requests later read 'Table was cleared first' on m8's review (English-only, K15).
2. D3: Clearing's Undo keeps ပြန်ဖျက်. No change.
3. TV: a cleared table leaves the wall at once (a non-active session), so the stop card never reaches guests' eyes. The slip says nothing about the TV.
4. The stop card's button is help.done 'ရပြီ · Got it'. 'Tells the kitchen to stop' stays conditional on the durable stop record (correction 12).
5. Dad's region keeps 'Ready to serve — Table N' as the console's CALL, ranked below the hold-cap warning as already fixed.
