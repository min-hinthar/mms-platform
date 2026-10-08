# Picked m9: the TV board shows live order progress per table and per dish. "The Departure Board", designed

**Backbone: GLANCEABLE.** The wall is read from across a dining room by two audiences at once: guests
waiting on their food, and Dad or a runner deciding what to carry. Each table with food in the kitchen is
one **table pass**, built like a boarding pass. Its paper stub shows the table number at the CounterPass
tier, and its Night body lists that table's sent dishes. Every dish has a three-segment track and one
word. The track fills only when Mom taps on her KDS. Gold on this wall means "it's out of the kitchen".
The pickup codes keep their column. A code moves into Ready as a paper pass, the same face the guest's
phone shows.

**Grafted from GUIDED (the diner register).** The heading row carries one bilingual **key**: the three
tracks and their three words. It teaches the marks once, so the board doubles as the guests' static
step guide. It is not a carousel and it does not move (see decision 22).

**Grafted from QUIET.** Nothing on the wall moves unless food actually changed state. No dot breathes,
no number ticks, no lateness is shown, and no clock is drawn. There is one celebration, and it plays
once per table visit.

**The owner's message this answers (2026-10-07, verbatim):** "staff board also needs moment designs
integration so TV board display shows live order progress in details (per item per table etc.,) for
customers and staff." This message **is the decision OPEN-ITEMS K32(b) was waiting for** ("The owner's
'table+order details' half is a SPEC REVERSAL … Needs Min's explicit decision before any code"). It
reverses the shipped boundary in `lib/board-pulse.ts:19-23`, `docs/context/SPEC-KDS.md:83-88` and the
pin at `app/api/board/route.test.ts:421`, and the PR that builds this amends all three in the same
change (decision 1).

---

## What changed from the brief, because a claim failed against the code

1. **Four stages became three.** The brief's per-dish mark reads "sent → cooking → ready → served". The
   schema holds three states a dish can be seen in:
   - `fired`: the send, which the KDS shows past the 10 s grace;
   - `in_progress`: Mom's **Start** tap (`kds.line.start`, staff.ts:183; TableTimeline.tsx:9-11);
   - `served` with `bumped_at`: Mom's **Done** or **All done** tap
     (`20261001000000_p2f_counter_cook_before_paid.sql:394`, `:421`).

   "Ready" and "served" are **one stamp**. Nothing records a plate reaching a table:
   `board-pulse.ts:77-83` says so ("There is no runner event anywhere"), and so does D5 ("The app
   cannot see a plate reach the table"). Drawing four steps would invent one. The three marks read
   **Sent · Cooking · Ready to serve**. The last word is the wall's shipped, owner-chosen plain word
   for that stamp (`board.pulse.up`, staff.ts:2045-2055, owner 2026-09-24). It is a staff verb, so a
   guest reads no instruction in it, and a runner reads "carry it".

2. **"Every open dine-in table" became every table with food in motion.** A table enters the wall when
   its first dish clears the send grace. It leaves 5 minutes after its last sent dish came out
   (`PULSE_PASS_LINGER_MS`, board-pulse.ts:168), or at once when it is cleared. A table with only
   unsent dishes has nothing true to draw, because unsent dishes are never on the board.

3. **The pickup column drops the guest's first name.** Today it publishes and draws `customer_name`
   (route.ts:131, :288; ReadyBoard.tsx:688). The brief's privacy line is "no guest names". The code is
   the identity instead: the same 6-character tail the guest's /track pass shows (route.ts:287), in
   the phone pass's own type face (`.exit-pass-code`, globals.css:6219-6226). Checkout promises only
   that Dad calls the name out ("We'll call your name when your order's up.", Checkout.tsx:3547-3551),
   never the board, so this breaks no promise.

4. **The kitchen-pulse band is retired from the wall.** That covers the ticket count, "Oldest (min)" and
   the all-day rail. The per-table passes supersede the rail's job. The oldest-age figure publicly
   times the kitchen to the dining room, while lateness belongs to the KDS alone (the loudness ladder's
   ALARM tier). This also closes OPEN-ITEMS P6a, the frame-delta channel through the rail.

5. **"Live" means the 5-second poll.** The TV cannot join the private realtime channels (route.ts:30-33)
   and polls `/api/board` every 5 s (ReadyBoard.tsx:214). A Start or Done tap reaches the wall within
   about 5 s. No word on the wall claims anything faster.

---

## World-class references, and what each brings

- **Apple Wallet boarding pass:** a paper stub with one identity figure, a perforation and coupon
  notches. Each table's number reads like a gate number, and it is the same CounterPass the guest's
  phone (m1) and Dad's pane (m2) show. One pass, one look.
- **iOS Live Activities (food-delivery Live Activities on the Lock Screen):** a discrete, segmented
  progress bar that updates in place and moves only when a stage lands. Here that is each dish's
  three-segment track.
- **Solari split-flap departure boards:** rows that change in place, sorted so they can be found rather
  than ranked, and a flap that draws the eye only to the cell that changed. Here, a table's one
  "Ready to serve" flap when its last dish is out.
- **Airport FIDS and transit-map keys:** one key teaches the marks once and is never repeated per row.
  Here, the bilingual key in the Kitchen heading.
- **Fresh KDS's Order Tracker, the shipped board's own origin (SPEC-KDS §6):** status that comes from
  the cook's taps and from nothing else. Every segment here is one of Mom's taps.
- **Domino's Tracker:** named stages in a bar. We keep the stages and drop its time-driven fill: if
  Mom has not tapped, nothing moves.
- **Japanese food-court number boards:** a ready number lights, stays lit and is matched against the
  slip in the guest's hand. Here, a pickup code is issued as a paper pass that matches the phone's
  claim ticket (m3).
- **Hong Kong MTR bilingual signage:** two scripts stacked at once, never alternating. Every heading
  and every dish carries both tongues at the same moment, so no one waits for their language to come
  round.

---

## The marks on this wall (within the decided vocabulary)

| Mark                                                           | Means on the wall                                     | Vocabulary source                                                                                                                            |
| -------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Paper stub with a dotted perforation and 12 px notches         | a pass: a table, or a ready pickup code               | PATH_DESIGN "One CounterPass primitive … constant paper in both themes"                                                                      |
| Track, 1 of 3 segments lit, in --t2                            | Sent: the kitchen has it                              | new to the wall; a MARK (glyph plus word)                                                                                                    |
| Track, 2 of 3 lit, the second in --tx                          | Cooking: Mom tapped Start                             | MARK                                                                                                                                         |
| Track, 3 of 3 lit in gold, word in --gold                      | Ready to serve: Mom tapped Done or All done           | the board's shipped gold for "out" (`.orb-table-up`, globals.css:7849-7856; `.orb-col-ready h2`)                                             |
| Gold pill "Ready to serve" plus a gold rim on the pass body    | the whole table is out                                | the shipped lit-gold cap, `.orb-table-up`, extended to one more element and never a parallel one (DESIGN-LANGUAGE §ONE selection vocabulary) |
| Outlined round stub "အလှည့် 2", with a dotted edge and notches | a later Send by the same table                        | m5's round stub, after B4 (no wash) and B5 (notches)                                                                                         |
| Dashed outline in place of paper, --t2 ink, no tracks          | frozen: the last update, shown while the feed is down | PATH_DESIGN "Dashed edge: provisional … a frozen count"                                                                                      |

**Loudness on the wall.** CALL: the gold "Ready to serve" (a dish, a table, a pickup pass), because
someone must carry it. MARK: Sent and Cooking. CALM: everything else. There is no ALARM tier on the
wall: lateness is the KDS's alone. No fact is marked twice. When a table is all out, its dish rows
drop their tracks and words, and the one pill says it for the whole table.

**Never on the wall:** a guest name, a price or any money, a quantity, a modifier, a note, a seat, any
id, a comp, a void, an approval, an Undo word (D3: "The TV board carries neither word"), a pay word
(D5 is the phone's news), a lateness colour, an age for a dish, or a dish not yet sent.

---

## Example data (Friday, 7:48 PM, mid-rush; the board's language is the default Burmese)

The dish names are the catalog's (docs/data/MENU_REFERENCE.md). The table numbers are inside the
registry's 1–10 (`20260713000000_k2_table_registry.sql:44`).

| Table | Round | Dish (MY / EN)                             | Stage               |
| ----- | ----- | ------------------------------------------ | ------------------- |
| 2     | 1     | အုန်းနို့ခေါက်ဆွဲ / Ohno Khao-Swe          | Cooking             |
| 3     | 1     | မြှီးရှည် / Mee-Shay                       | Cooking             |
| 3     | 1     | ပဲ ပလာတာ / Peas Parata · to-go, sent early | Sent                |
| 4     | 1     | မုန့်ဟင်းခါး / Mohinga                     | Cooking             |
| 4     | 1     | ရှမ်းခေါက်ဆွဲ / Shan Noodles               | Sent                |
| 4     | 2     | လက်ဖက်ရည် / Burmese Milk Tea               | Sent                |
| 4     | 2     | အုန်းနို့သာကူ / Coconut Sago               | Sent                |
| 5     | 1     | ကြေးအိုး/ဆီချက် / Kyay-O / Si-Chat         | out (table all out) |
| 5     | 1     | ဖါလူဒါ / Faluda                            | out (table all out) |
| 7     | 1     | မုန့်ဟင်းခါး / Mohinga                     | Ready to serve      |
| 7     | 1     | လက်ဖက်သုပ် / Pickled Tea Salad             | Ready to serve      |
| 7     | 1     | ပဲပြုတ်ထမင်းကြော် / Burmese Fried Rice     | Cooking             |
| 8     | 1     | နန်းကြီးမုန့်တီ / Nan-Gyi Mont Ti          | Sent                |
| 9     | 1     | လက်ဖက်ထမင်း / Rice with Pickled Tea Salad  | Cooking             |
| 9     | 1     | လက်ဖက်ရည် / Burmese Milk Tea               | Ready to serve      |

Table 4's round 2 (tea and sago) is m5's own example, kept like for like.

**Pickup codes** (uuid tails, uppercase, Latin):

- Ready, newest first: #1E94D0 (just now), #7F3A2C (2 min), #B07D21 (6 min).
- Preparing, next up first: #4C1A9E, #D2085B.

**Screen 2** is 7:49:10 PM:

- Table 7's fried rice was bumped more than 6 s earlier, so Table 7 is all out.
- #4C1A9E just turned Ready. The other waits read 1, 3 and 7 min.

---

## Night tokens and composites used (the wall is Night-forced: `orb-root dark`, ReadyBoard.tsx:312)

| Token / composite                     | Value                                                                        |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| --pg (page)                           | #100c19                                                                      |
| --cd (pass body)                      | #2b213c                                                                      |
| --surface-elevated (an unlit segment) | #413053                                                                      |
| --tx / --t2 / --t3                    | #f3ecdf / #bcafc8 / #a69eb1                                                  |
| --ac (gold fill) / ink on it --oa     | #e7a53a / #130d1e                                                            |
| --gold (gold text)                    | #f4c879                                                                      |
| --bd / --sheen                        | rgba(243,236,223,0.13) / rgba(255,255,255,0.11)                              |
| --glow-gold halo (the shipped cap's)  | 0 0 14px -6px rgba(244,200,121,0.3)                                          |
| **paper (constant)**                  | --on-ink #fffdf8, ink --ink #1b1714 (constant in both themes)                |
| **paper secondary ink (constant)**    | `color-mix(in srgb, var(--ink) 62%, var(--on-ink))` = **#726e6b** (computed) |
| **paper seam dots**                   | `color-mix(in srgb, var(--ink) 50%, var(--on-ink))` = **#8d8a86** (computed) |
| flash overlay (shipped)               | `color-mix(in srgb, var(--gold) 32%, transparent)`, rgba(244,200,121,0.32)   |

Why the paper needs constant inks: inside `.dark`, `var(--t2)` resolves to lavender #bcafc8. On paper
that is 1.6:1, so the stub's quiet word uses the constant mix instead.

**Contrast, computed (WCAG relative luminance; scratchpad m9calc/c.py, mix.py):**

| Pair                                                   | Ratio   | Floor                                  |
| ------------------------------------------------------ | ------- | -------------------------------------- |
| #1b1714 on paper #fffdf8 (number, code)                | 17.52:1 | 4.5                                    |
| #726e6b on paper (the stub's "Table", the pickup wait) | 4.97:1  | 4.5                                    |
| --tx #f3ecdf on --cd (dish MY, Cooking)                | 12.90:1 | 4.5                                    |
| --t2 #bcafc8 on --cd (dish EN, Sent)                   | 7.29:1  | 4.5                                    |
| --gold #f4c879 on --cd (Ready to serve word)           | 9.66:1  | 4.5                                    |
| --oa #130d1e on --ac #e7a53a (the pill)                | 8.91:1  | 4.5                                    |
| --ac #e7a53a segment or rim vs --cd                    | 7.10:1  | 3 (non-text)                           |
| --t2 segment vs --cd                                   | 7.29:1  | 3 (non-text)                           |
| unlit segment #413053 vs --cd                          | 1.28:1  | decorative: the word carries the state |
| --t3 #a69eb1 on --cd (frozen dish EN)                  | 5.88:1  | 4.5                                    |
| --t2 #bcafc8 on --pg (status line, Preparing codes)    | 9.28:1  | 4.5                                    |
| --gold on --pg (Ready heading, shipped)                | 12.29:1 | 4.5                                    |
| ink on the flash at its peak (#fbeccf)                 | 15.26:1 | 4.5                                    |

---

## THE TABLE PASS (one component, drawn the same everywhere it appears)

- **Element:** an `<li>` in the Kitchen list. `display:flex`, `align-items:stretch`, min-height 152 px
  at 1920 wide, `position:relative`, `break-inside:avoid`.
- **Stub (left, 136 px wide):**
  - **Fill and shape:** constant paper #fffdf8. Radius 20 0 0 20. Inset sheen
    `inset 0 1px 0 rgba(255,255,255,0.55)`. No drop shadow (it cannot read on Night).
  - **Layout:** padding 14 px 10 px. A flex column, centred both ways, gap 2.
  - **Row 1, one baseline:** "စားပွဲ" (Padauk 22/700, lh 1.6, #1b1714), then "Table" (Hanken 15/700,
    #726e6b), gap 6. Under `lang=en` the order flips ("Table", then "စားပွဲ"). Both always show,
    because the wall serves a mixed room.
  - **Row 2, the figure:** the table number in Fraunces 600 at **--fs-pass** (88 px at 1920; in
    product `clamp(56px, 4.6vw, var(--fs-pass))`), lh 1, tracking -0.02em, tabular-nums, #1b1714,
    Latin always (fill.ts:9).
  - **The perforation:** the stub's right edge is `border-right: 4px dotted #100c19` (page-ground holes
    punched in the paper), never dashed.
  - **The notches:** two 12 px circles of #100c19, centred on the stub/body seam at the pass's top and
    bottom edges, so they bite both halves.
  - The perforation and notches are aria-hidden.
- **Body (the rest of the width):**
  - **Fill and shape:** --cd #2b213c. 1px --bd border with no left border. Radius 0 20 20 0.
    Inset sheen.
  - **Layout:** padding 12 px 20 px 12 px 24 px. A flex column, gap 4, content centred vertically.
  - **Inside:** the dish rows. Before each round ≥ 2 sits its round stub, 8 px above and below.
- **When the whole table is out:**
  - **Rim:** a 2 px #e7a53a ring over the body. In product it is a `::after` ring with opacity
    (transform and opacity only, as the board's flash already does, globals.css:8689-8705).
  - **The pill:** "ဟင်းထွက်ပြီ" in the shipped lit cap `.orb-table-up` (#e7a53a fill, #130d1e ink,
    sheen, gold halo), Padauk 24/700, lh 1.6, min-height 44, padding 0 14 px, radius 999, at most
    128 px wide. It sits **in the first dish row's progress slot**, so the pass never changes height
    when it lands.
  - **The dish rows:** every row's track and word drop, and the names stay at full ink. One fact, one
    mark.
- **Order inside a pass:** rounds oldest first. Within a round, dishes in fire order, then by name.
- **Stable key:** the table number. A pass never remounts because another table changed.

### THE DISH ROW and its track

- **Element:** an `<li>` in the pass's `<ul role="list">`. Min-height 64. `display:flex`,
  `align-items:center`, gap 16.
- **The name block** (`flex:1 1 0`, `min-width:0`) is a column of two lines. Each line is one line
  (`white-space:nowrap`, ellipsis), which board-1's fit rule needs (globals.css:8661-8669):
  - **Line 1:** the catalog Burmese, Padauk 26/700, lh 1.6, --tx. If the dish was sent to go, a tag
    follows it (8 px gap): "ပါဆယ်" (`kds.channel.togo`), Padauk 16/700, lh 1.6, --t2, 1.5 px solid
    --t2 border, radius 999, padding 0 10.
  - **Line 2:** the English snapshot name, Hanken 20/700, lh 1.15, --t2.
  - Dish names do **not** flip with the board's language: Burmese sits on top at the larger size in
    both modes. They are the house's own names (MENU_REFERENCE.md:12-15 joins the POS on the Burmese
    name), and RULES2 holds Burmese at or above the English size.
  - A dish with no catalog Burmese draws its English alone on line 1, at 26 px, unmarked, exactly as
    `PulseDishName` already rules (ReadyBoard.tsx:610-632).
- **The progress slot** (`flex:none`, width 128) is a column, aligned to its right edge, gap 4:
  - **The track** (aria-hidden): three segments, each 36×8, radius 999, gap 4.
    - Sent: segment 1 #bcafc8; segments 2 and 3 #413053.
    - Cooking: segment 1 #bcafc8, segment 2 #f3ecdf, segment 3 #413053.
    - Ready to serve: all three #e7a53a.
  - **The word:** Padauk 20/700, lh 1.6, nowrap. It is in the board's lead language only, with no
    echo: Chrome's chip rule, "two scripts cannot legibly stack in a chip" (Chrome.tsx:40-43). The key
    carries both tongues.
    - Sent: "ပို့ပြီး" in --t2.
    - Cooking: "ချက်နေဆဲ" in --tx.
    - Ready to serve: "ဟင်းထွက်ပြီ" in --gold #f4c879.
- **Grouping:** dishes with the same snapshot name in the same round are **one row**, and the
  quantity is never published. The row's stage is the **least advanced** of its lines. It reads
  Cooking until every bowl of that dish is out, which is the honest reading, and no count appears on a
  shared cart.

### THE ROUND STUB (m5's, at the wall's scale)

- **Element:** a `<p>` (never a control), left-aligned in the body. Inline-flex, min-height 40,
  padding 0 16 0 14, `position:relative`.
- **Outline:** 2 px solid --t2 on top, left and bottom, with **border-right 4 px dotted --t2**.
  Radius 10 0 0 10. There is **no fill** (m5 B4 dropped the wash).
- **Notches:** two 12 px circles filled --cd #2b213c with a 2 px --t2 ring, centred on the dotted edge
  at the top and bottom (m5 B5), aria-hidden.
- **Text:** "အလှည့်" (Padauk 24/700, lh 1.6, --tx), a space, then "2" (Hanken 800 24 px, tabular, --tx,
  Latin). It reads "Round 2" under `lang=en`.
- **The number:** m5's `roundOrdinal`, counted per **session** (m5 decision 9). When the number is
  unknown (`n: null`) and an older round of the same table is on this pass, the stub reads m5's
  "နောက်တစ်လှည့်" (`kds.round.next`, a draft) with no number. Otherwise there is no stub. Round 1 never
  carries one.

### THE PICKUP PASS (a Ready code)

- **Element:** an `<li>` in the Ready list, 80 tall, `display:flex`, `position:relative`,
  `isolation:isolate` (the shipped flash sits behind the text, board-9).
- **Code part:** 316 wide, paper #fffdf8, radius 14 0 0 14, padding 0 20, flex, centred vertically.
  - The code is "#" plus the 6-character tail in Hanken 800 at 54 px (the board's shipped row tier,
    `.orb-card` clamp max, globals.css:8644-8662). lh 1.08, tracking 0.08em (`--track-wide`, the
    `.exit-pass-code` face), tabular-nums, #1b1714.
- **Seam:** the code part's right edge is a 2 px dotted #8d8a86 line. Two 12 px notches of #100c19
  centred on it at the top and bottom edges. Aria-hidden.
- **Stub part:** 112 wide, paper, radius 0 14 14 0, centred.
  - It holds the shipped shelf wait: "ခုလေးတင်" or "{mins} မိနစ်" (the minutes in Hanken 700 22 px and
    Latin; the Burmese in Padauk 20/700). The ink is #726e6b.
  - Blank when the server sends no wait (an older server, a collected bag, or the feed down;
    ReadyBoard.tsx:685-698).
- **Preparing codes are not passes yet.** They draw as plain rows: Hanken 800 40 px, tracking 0.08em,
  tabular, --t2, with a 1 px --bd bottom rule, 64 tall. A code is issued as a pass when it turns Ready.
  That is the moment's delight on this side.

### Order and fit (the wall cannot scroll: globals.css:8546-8553)

- **Tables:**
  - Sorted ascending by number. They flow down the left column, then down the right (CSS
    `columns: 2`, gap 32, `column-fill: balance`).
  - Nothing re-sorts by status. A guest finds their number where numbers are, the way a departure
    board is read.
- **Fit (extends `lib/board-fit.ts`, measured like board-1, never a constant).** When the passes
  overflow, the board steps down in this order:
  - (a) A table that is all out collapses to its stub plus its pill. It has already said its news.
  - (b) In a table that is partly out, its out dishes fold into one row. Their names are joined with
    " · " on each line, ellipsised, behind a gold track and "ဟင်းထွက်ပြီ".
  - (c) Last resort: the highest-numbered passes are cut and a final row reads "+N more"
    (`kds.more`; it counts tables, never dishes).
- **Pickup lists:**
  - Each list keeps the shipped measured cut with "+N more" (ReadyBoard.tsx:390-478).
  - Ready is newest first, and Preparing has the next up first (ReadyBoard.tsx:299-307).
  - The column is a grid: `auto minmax(0,3fr) auto minmax(0,2fr)`, so Ready gets the larger box.

### States (all of them; screens draw the rush, the moment and the stale wall)

- **Live:** as drawn on screen 1.
- **A dish changes stage** (not drawn):
  - Only the newly reached segment fills: `transform: scaleX(0→1)`, origin left, 600 ms ease-out.
    The word swaps without motion.
  - A recall (`mms_recall_ticket` returns the dish to `in_progress` and clears `bumped_at`,
    w3_kitchen.sql:214-221) un-fills it with no motion and no apology.
- **A table goes all out** (screen 2): the one celebration. It waits until the table's **last bump is
  older than the KDS Undo window**: 6 s (`UNDO_MS`, KdsBoard.tsx:77, moved to `lib/` so both screens
  read one value). The wall never celebrates something Mom can still take back with one tap.
- **A pickup code turns Ready** (screen 2): it remounts in Ready as a pass, with the shipped 2 s gold
  flash (globals.css:8689-8705) and the shipped chime when sound is on (ReadyBoard.tsx:197).
- **First poll after a reboot:** seeds the baseline. No celebration storm and no flash storm, the same
  rule as the shipped Ready flash (ReadyBoard.tsx:180-187), applied to the all-out set too.
- **No tables in motion:** the key stays. Under it is "ရှင်းပြီ" (`kds.allclear`, the band's shipped
  quiet state), in the lead language.
- **No pickup orders:** the shipped Ready empty line, "ယူလို့ရပြီးတဲ့ အော်ဒါတွေ ဒီမှာ ပေါ်ပါမယ်။"
  (`board.empty`).
- **Feed down: stale** (screen 2, second state). After two missed polls (`BOARD_FAIL_THRESHOLD`,
  board-poll.ts) the wall keeps the last snapshot and **drops everything that rots**:
  - every track, every stage word, every pill, every gold rim and every shelf wait goes;
  - the passes turn **frozen**: a dashed --t2 outline in place of paper, numbers and codes in --t2;
  - the status line grows to the shipped stale size and reads "ပြန်ဆက်နေပါတယ် — …";
  - the key is replaced by "မီးဖိုချောင် အခြေအနေကို အခု မဖတ်နိုင်သေးပါ။".

  This is the shipped asymmetry, applied once more. Identities do not rot; stages and announcements
  do (ReadyBoard.tsx:366-381).

- **The kitchen read failed but the poll succeeded** (`tables: null`): the same frozen look over the
  last good tables, with the same sentence. If there is no last snapshot, the sentence only. It is
  never an empty "all clear" over a full wok (board-pulse.ts's null contract).
- **Offline from boot, unlinked or not configured:** unchanged shipped screens (ReadyBoard.tsx:246-293).
- **English board (`?lang=en`):**
  - headings lead in English with the Burmese echo;
  - the stub reads "Table" first;
  - stage words read Sent, Cooking, Ready to serve;
  - the round stub reads "Round 2";
  - dish names keep Burmese on top.

---

## SCREEN picked-m9-1.dc.html — Friday rush: every table's food, dish by dish

- **Device:** tv (1920×1080 CSS px; `$preview` {"width":1920,"height":1080}).
- **Theme:** night (forced).
- **Interactive:** no. A static frame, and nothing on it animates.
- **`<title>`:** "Wall Board — rush".
- **Who and when:** the dining-room TV at 7:48 PM on a Friday. Seven tables have food in the kitchen.
  Three pickup bags are ready and two are cooking. Sound is on.

### LAYOUT

- **Root:** 1920×1080, `position:relative`, `overflow:hidden`, background #100c19, color #f3ecdf.
  Hanken 16/1.5. `display:flex; flex-direction:column; gap:28px; padding:48px` (the shipped
  `.orb-root` clamp maxima, globals.css:8540-8557).
- **y48–104, the header** (`<header>`, flex, `align-items:baseline`, `justify-content:space-between`,
  gap 24):
  - **left:** `<h1>`, Fraunces 40/600, lh 1.08, tracking -0.02em, #f3ecdf. It holds
    `<span aria-hidden="true">✦</span>`, a space, then "Mandalay Morning Star" (ReadyBoard.tsx:314-316).
  - **middle:** `<p role="status" lang="my">`, Padauk 20/700, lh 1.6, #bcafc8: "ယူလို့ရပြီ ၃ ခု ·
    ပြင်ဆင်နေဆဲ ၂ ခု". **These digits are Burmese**: they are prose counts in `{n}` slots, and the
    owner's 2026-09-05 rule localizes them (fill.ts:27-37). Every other digit on the wall stays Latin.
  - **right:** `<button type="button" aria-pressed="true" lang="my">` "အသံ ဖွင့်ထား". Min-height 44,
    padding 0 18, radius 999, background #e7a53a, color #130d1e, Padauk 22/700, box-shadow
    `inset 0 1px 0 rgba(255,255,255,0.11), 0 0 14px -6px rgba(244,200,121,0.3)` (the shipped chip,
    ReadyBoard.tsx:332-340).
- **y132–1032, the main area:** a grid, columns 1336 px and 444 px, gap 44.

**THE KITCHEN SECTION, x48–1384:** `<section aria-labelledby="m9-k">`, a flex column, gap 24.

- **y132–226, the heading row:** flex, `justify-content:space-between`, `align-items:flex-end`,
  `border-bottom:1px solid rgba(243,236,223,0.13)`, padding-bottom 10.
  - **left:** `<h2 id="m9-k">`, the shipped `BilingualHeading` shape (ReadyBoard.tsx:652-666):
    - `<span lang="my">` "မီးဖိုချောင်" in Padauk 36/700, lh 1.6, #f3ecdf, display block;
    - then `<small>` "Kitchen" in Hanken 22/600, lh 1.2, #bcafc8, display block.
  - **right: THE KEY** (`<div aria-hidden="true">`). Flex, gap 32, `align-items:center`,
    padding-bottom 6. It has three items, each flex with gap 8, `align-items:baseline`:
    - **Sent:** a mini track (three 16×6 segments, radius 999, gap 3: #bcafc8, #413053, #413053), then
      `<span lang="my">` "ပို့ပြီး" (Padauk 20/700, #bcafc8), then "Sent" (Hanken 16/600, #bcafc8).
    - **Cooking:** a mini track (#bcafc8, #f3ecdf, #413053), then "ချက်နေဆဲ" (Padauk 20/700,
      #f3ecdf), then "Cooking" (Hanken 16/600, #bcafc8).
    - **Ready to serve:** a mini track (#e7a53a ×3), then "ဟင်းထွက်ပြီ" (Padauk 20/700, #f4c879), then
      "Ready to serve" (Hanken 16/600, #f4c879).
- **y250–1032, the passes:** `<ul role="list" aria-label="စားပွဲ အခြေအနေ">` with
  `list-style:none; margin:0; padding:0`.
  - Draw it as two explicit flex columns, each `flex-direction:column; gap:20px`: column A x48–700
    and column B x732–1384, each 652 wide, with 32 between them. The product uses CSS columns. Every
    pass is a TABLE PASS as specified above (stub x+0 to x+136, body x+136 to x+652).
  - **Column A:**
    - **Table 2, y250–402 (152):**
      - one row, centred at y294–358: "အုန်းနို့ခေါက်ဆွဲ" / "Ohno Khao-Swe";
      - track Cooking, word "ချက်နေဆဲ".
    - **Table 3, y422–578 (156):**
      - row y434–498: "မြှီးရှည်" / "Mee-Shay", Cooking;
      - row y502–566: "ပဲ ပလာတာ" plus the tag "ပါဆယ်" / "Peas Parata", Sent ("ပို့ပြီး").
    - **Table 4, y598–942 (344):**
      - row y610–674: "မုန့်ဟင်းခါး" / "Mohinga", Cooking;
      - row y678–742: "ရှမ်းခေါက်ဆွဲ" / "Shan Noodles", Sent;
      - **round stub y750–790** at the body's left inset: "အလှည့် 2";
      - row y798–862: "လက်ဖက်ရည်" / "Burmese Milk Tea", Sent;
      - row y866–930: "အုန်းနို့သာကူ" / "Coconut Sago", Sent.
  - **Column B:**
    - **Table 5, y250–406 (156), ALL OUT:**
      - a 2 px #e7a53a rim on the body;
      - row y262–326: "ကြေးအိုး/ဆီချက်" / "Kyay-O / Si-Chat", with **the pill "ဟင်းထွက်ပြီ" in
        this row's progress slot**;
      - row y330–394: "ဖါလူဒါ" / "Faluda", with its slot blank;
      - the names are at full ink.
    - **Table 7, y426–650 (224):**
      - row y438–502: "မုန့်ဟင်းခါး" / "Mohinga", Ready to serve (gold track, word "ဟင်းထွက်ပြီ" in
        #f4c879);
      - row y506–570: "လက်ဖက်သုပ်" / "Pickled Tea Salad", Ready to serve;
      - row y574–638: "ပဲပြုတ်ထမင်းကြော်" / "Burmese Fried Rice", Cooking.
    - **Table 8, y670–822 (152):**
      - one row, centred at y714–778: "နန်းကြီးမုန့်တီ" / "Nan-Gyi Mont Ti", Sent.
    - **Table 9, y842–998 (156):**
      - row y854–918: "လက်ဖက်ထမင်း" / "Rice with Pickled Tea Salad", Cooking;
      - row y922–986: "လက်ဖက်ရည်" / "Burmese Milk Tea", Ready to serve.
  - Column A ends at y942 and column B at y998. Both are inside the 1032 floor. Nothing is cut, and
    no "+N more" row is drawn.

**THE PICKUP COLUMN, x1428–1872 (444 wide):** a flex column, gap 32.

- **The Ready section** (`<section aria-label="ယူသွားနိုင်ပါပြီ">`):
  - **y132–226, the heading row:** a hairline bottom rule and padding-bottom 10. `<h2>` is the
    `BilingualHeading`: `<span lang="my">` "ယူသွားနိုင်ပါပြီ" in Padauk 36/700, lh 1.6, **#f4c879**
    (`.orb-col-ready h2`), then `<small>` "Ready" in Hanken 22/600, #bcafc8, display block.
  - **y250–518, the list:** `<ul role="list">`, flex column, gap 14. Each row is a PICKUP PASS
    (code part x1428–1744, seam at x1744, stub x1744–1856):
    - y250–330: "#1E94D0" | "ခုလေးတင်";
    - y344–424: "#7F3A2C" | "2" (Hanken 700 22) and "မိနစ်" (Padauk 20/700), gap 6;
    - y438–518: "#B07D21" | "6 မိနစ်", built the same way.
- **The Preparing section** (`<section aria-label="ပြင်ဆင်နေသည်">`):
  - **y550–644, the heading row:** hairline. "ပြင်ဆင်နေသည်" in Padauk 36/700, lh 1.6, #f3ecdf, then
    `<small>` "Preparing" in Hanken 22/600, #bcafc8, display block.
  - **y668–796, the list:** `<ul role="list">`.
    - y668–732: "#4C1A9E";
    - y732–796: "#D2085B".
    - Each row is Hanken 800 40 px, tracking 0.08em, tabular, #bcafc8, with a 1 px --bd bottom
      rule and `align-items:center`.
- y796–1032 is page ground: the measured list box with nothing to cut.

### COPY (English) — verbatim

- Mandalay Morning Star
- Kitchen
- Sent · Cooking · Ready to serve (the key)
- Table (on each of the seven stubs, beside စားပွဲ)
- The table figures 2, 3, 4, 5, 7, 8, 9 and the round figure 2 (Latin)
- Ohno Khao-Swe · Mee-Shay · Peas Parata · Mohinga · Shan Noodles · Burmese Milk Tea · Coconut Sago ·
  Kyay-O / Si-Chat · Faluda · Pickled Tea Salad · Burmese Fried Rice · Nan-Gyi Mont Ti · Rice with
  Pickled Tea Salad
- Ready
- Preparing
- #1E94D0 · #7F3A2C · #B07D21 · #4C1A9E · #D2085B
- The waits' figures 2 and 6 (Latin)
- Accessible names: the Kitchen list "စားပွဲ အခြေအနေ" (`board.a11y.tables`, through `sx`); the
  sections take their headings' lead text (shipped `aria-label={ts(lang, k)}`).

### COPY (Burmese) — with sources (every string is shipped or a catalog name; nothing is new)

| String                             | Key / source                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| ယူလို့ရပြီ ၃ ခု · ပြင်ဆင်နေဆဲ ၂ ခု | `board.status`, staff.ts:1916-1919 (counts localized, fill.ts:27-37)                 |
| အသံ ဖွင့်ထား                       | `board.sound.on`, staff.ts:1928 (K15 draft)                                          |
| မီးဖိုချောင်                       | `kds.title`, staff.ts:151 (**OWNER-VERIFIED**, W21)                                  |
| ပို့ပြီး                           | `table.line.state.fired`, staff.ts:2803 (K15-HIGH draft)                             |
| ချက်နေဆဲ                           | `kds.line.cooking`, staff.ts:187 (= `table.line.state.inProgress`, :2804)            |
| ဟင်းထွက်ပြီ                        | `board.pulse.up`, staff.ts:2055 (K15 draft; English owner-chosen 2026-09-24)         |
| စားပွဲ                             | `kds.table` "စားပွဲ {id}", staff.ts:170 (the figure is the `{id}` slot, drawn large) |
| ပါဆယ်                              | `kds.channel.togo`, staff.ts:166                                                     |
| အလှည့် 2                           | m5's DRAFT `kds.round` "အလှည့် {n}" (K15 · kitchen-ops; picked-m5.md :299, :326)     |
| ယူသွားနိုင်ပါပြီ                   | `board.col.ready`, staff.ts:1902 (on the wall since W3e)                             |
| ပြင်ဆင်နေသည်                       | `board.col.preparing`, staff.ts:1901 (on the wall since W3e)                         |
| ခုလေးတင်                           | `board.card.justNow`, staff.ts:1907                                                  |
| {mins} မိနစ်                       | `board.card.wait`, staff.ts:1906 (`{mins}` stays Latin)                              |
| စားပွဲ အခြေအနေ (aria only)         | `board.a11y.tables`, staff.ts:2061                                                   |
| The dish names                     | the catalog's `menu_items.name_my` (MENU_REFERENCE.md :24-156)                       |

### MOTION

None. This frame is the board at rest, and the rest state animates nothing: no breathing dot, no
ticking number and no drift (the shipped posture, globals.css:8751-8755 and the P6 band's "ANIMATES
NOTHING"). The wall moves only on a stage change (see the states above and screen 2).

The artboard still carries the reduced-motion escort in its `<helmet><style>`:
`@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }`.

### A11Y

- **Landmarks and headings:** h1 (the brand), then three h2s: Kitchen, Ready and Preparing, each in
  the `BilingualHeading` sibling shape. `lang` is never on the h2, only on its spans
  (ReadyBoard.tsx:639-651).
- **One live region:** the header `<p role="status">`, single-voice (Burmese). Pass changes are
  ambient and never announced. That is the shipped choice: a TV is not a screen-reader surface, and
  one region keeps the page honest (ReadyBoard.tsx:317-319).
- **Lists:**
  - every `list-style:none` list has `role="list"`;
  - the Kitchen list is named "စားပွဲ အခြေအနေ";
  - each pass's dish list is a nested `<ul role="list">`;
  - each pass is an `<li>` whose first text is its stub ("စားပွဲ Table 4"), so it names itself with
    no `aria-label` that would hide its content.
- **Aria-hidden:** the key, every track, every perforation, every notch and the "✦". The stage
  **word** carries each dish's state, so nothing is told by colour alone.
- **Text marking:** every Burmese run is `<span lang="my">` in Padauk 400/700 only, lh 1.6, at least
  16 px. Latin values inside Burmese runs are marked `lang="en"` (Chrome rule 3).
- **The one control** (the sound chip) is a real `<button>`, 44 tall, `aria-pressed`, named by its
  visible text.
- **Contrast:** see the table above. Every text pair clears 4.5:1, and every meaningful non-text mark
  clears 3:1.

---

## SCREEN picked-m9-2.dc.html — Food's out, and when the feed stops

- **Device:** tv (1920×1080; `$preview` {"width":1920,"height":1080}).
- **Theme:** night (forced).
- **Interactive:** yes. There are two states, `moment` (the default, which animates on load) and
  `stale`.
  - A transparent full-frame `<button type="button" aria-label="Show the next board state">`
    (`position:absolute; inset:0; z-index:10; background:transparent; border:0; cursor:pointer`)
    toggles them with `onClick="{{ toggle }}"`. It is the canvas's stepper and draws nothing, so the
    frame looks exactly as the room sees it.
  - `renderVals()` returns `{ moment: step === 0, stale: step === 1, toggle }`, with
    `this.state = { step: 0 }`. Returning to `moment` remounts it, which replays the transition.
- **`<title>`:** "Wall Board — food out".
- **Who and when:** the same TV at 7:49:10 PM. Table 7's fried rice was bumped more than 6 s ago, so
  the table settles all out. Pickup #4C1A9E has just been bagged on the lane.

### LAYOUT — state `moment` (`<sc-if value="{{ moment }}" hint-placeholder-val="{{ true }}">`)

This state is identical to screen 1 except:

- **Header status:** "ယူလို့ရပြီ ၄ ခု · ပြင်ဆင်နေဆဲ ၁ ခု".
- **Table 7, y426–650, unchanged height:** now ALL OUT.
  - A 2 px #e7a53a rim sits over the body. In the artboard it is an absolutely positioned div,
    `inset:0`, radius 0 20 20 0, `box-shadow: inset 0 0 0 2px #e7a53a`, `pointer-events:none`.
  - **Row 1's slot** (y438–502) holds the pill "ဟင်းထွက်ပြီ" (`.orb-table-up`).
  - **Rows 1–3 also still carry their progress blocks** (gold tracks plus "ဟင်းထွက်ပြီ" ×3) as an
    overlay in the same slot. Their **base style is `opacity:0`**, and they fade from 1 to 0 on load
    (see MOTION). The final frame equals screen 1's Table 5 treatment.
  - Names: "မုန့်ဟင်းခါး" / "Mohinga", "လက်ဖက်သုပ်" / "Pickled Tea Salad",
    "ပဲပြုတ်ထမင်းကြော်" / "Burmese Fried Rice".
- **Ready list** (y250–612, four passes, gap 14):
  - y250–330: **"#4C1A9E" | "ခုလေးတင်"**, the newly issued pass. Its first child is the flash overlay:
    `position:absolute; inset:0; border-radius:14px; background:rgba(244,200,121,0.32); z-index:0;`
    with base `opacity:0`. The code and stub content sit at `position:relative; z-index:1`;
  - y344–424: "#1E94D0" | "1 မိနစ်";
  - y438–518: "#7F3A2C" | "3 မိနစ်";
  - y532–612: "#B07D21" | "7 မိနစ်".
- **The Preparing section** moves down. Its heading is y644–738, and its one row (y762–826) reads
  "#D2085B".

### LAYOUT — state `stale` (`<sc-if value="{{ stale }}" hint-placeholder-val="{{ false }}">`)

The same snapshot as `moment` (the last update), drawn frozen:

- **Header status:** promoted to the shipped stale tier (globals.css:8743-8749), Padauk 30/700,
  lh 1.6, **#f3ecdf**: "ပြန်ဆက်နေပါတယ် — နောက်ဆုံး အချက်အလက်ကို ပြထားပါတယ်". The h1 and the sound
  chip are unchanged.
- **Kitchen heading row:** the key is gone. In its place, right-aligned at the row's bottom:
  `<p lang="my">` "မီးဖိုချောင် အခြေအနေကို အခု မဖတ်နိုင်သေးပါ။", Padauk 24/700, #bcafc8.
- **Every table pass, at the same geometry:**
  - **Stub:** no paper. Transparent with `border: 2px dashed #bcafc8; border-right-width: 2px`,
    radius 20 0 0 20, with no perforation and no notches. "စားပွဲ" / "Table" and the figure are in
    #bcafc8.
  - **Body:** --cd with a 1 px --bd border and **no rim**.
  - **Dish rows:** the Burmese in #bcafc8 and the English in #a69eb1.
  - **No tracks, no stage words and no pill.** Table 7 and Table 5 look like every other table now.
  - **Round stub:** unchanged in shape (the round does not rot), with its text in #bcafc8.
- **Ready passes:** each is one dashed box (2 px dashed #bcafc8, radius 14, 428×80, transparent)
  holding the code in #bcafc8 at the same size. The stub area is empty: the shelf wait drops, as
  shipped. The Ready heading **keeps its gold** (a heading, not a claim). The Preparing codes are
  unchanged (already --t2).
- No flash, no rim and no motion.

### COPY (English) — verbatim

- **moment:** as screen 1, plus the pickup code #4C1A9E in Ready; the waits' figures 1, 3 and 7;
  Preparing now shows only #D2085B.
- **stale:** as screen 1's names, figures and codes, minus the key words (Sent · Cooking · Ready to
  serve). No English sentence is drawn: the board's lead language is Burmese and its sentences are
  single-voice.
- **The canvas stepper's accessible name** (canvas-only, not product copy): "Show the next board
  state".

### COPY (Burmese) — with sources

| String                                             | Key / source                                         |
| -------------------------------------------------- | ---------------------------------------------------- |
| ယူလို့ရပြီ ၄ ခု · ပြင်ဆင်နေဆဲ ၁ ခု                 | `board.status`, staff.ts:1916-1919                   |
| ဟင်းထွက်ပြီ (the pill)                             | `board.pulse.up`, staff.ts:2055                      |
| ခုလေးတင် · {mins} မိနစ်                            | `board.card.justNow` / `board.card.wait`, :1906-1907 |
| ပြန်ဆက်နေပါတယ် — နောက်ဆုံး အချက်အလက်ကို ပြထားပါတယ် | `board.reconnecting`, staff.ts:1912-1915             |
| မီးဖိုချောင် အခြေအနေကို အခု မဖတ်နိုင်သေးပါ။        | `board.pulse.unavailable`, staff.ts:2056-2059        |
| everything else                                    | as screen 1                                          |

### MOTION (state `moment`; the keyframes live in `<helmet><style>`)

The transition is one calm, composite celebration on ONE pass, then the pickup pass is issued. Only
one thing moves at a time. Every base style is the **final** frame, and the keyframes run _from_ the
initial look with `animation-fill-mode: backwards`, so reduced motion gets the final frame exactly.

1. **0.30 s: the dish words step aside.** Table 7's three progress blocks:
   `@keyframes m9Out { from { opacity: 1 } to { opacity: 0 } }`, 240 ms ease-out, delay 300 ms,
   backwards. The base is `opacity:0`.
2. **0.40 s: the flap.** The pill in row 1's slot:
   `@keyframes m9Flap { from { transform: perspective(600px) rotateX(-90deg); opacity: 0 } to { transform: perspective(600px) rotateX(0deg); opacity: 1 } }`,
   320 ms `cubic-bezier(0.2, 0.8, 0.2, 1)` (no overshoot), delay 400 ms, backwards,
   `transform-origin: 50% 0` (a flap falling from its hinge). This is the departure-board cell
   turning over.
3. **0.40 s: the rim warms** (in parallel, the same pass):
   `@keyframes m9Rim { from { opacity: 0 } to { opacity: 1 } }`, 600 ms ease-out, delay 400 ms,
   backwards.
4. **1.40 s: the pass is issued.** The #4C1A9E pickup pass:
   `@keyframes m9Pop { from { transform: scale(0.96); opacity: 0 } to { transform: none; opacity: 1 } }`,
   180 ms ease-out, delay 1400 ms, backwards (the kit's `mms-pop`).
5. **1.40 s: its flash.** The overlay:
   `@keyframes m9Flash { from { opacity: 1 } to { opacity: 0 } }`, 2000 ms ease-out, delay 1400 ms,
   backwards (the shipped `orbFlash`, globals.css:8696-8705). The base is `opacity:0`.

**Reduced motion:** the escort rule
`@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }`
shows the final frame: Table 7 with its rim and pill and no words, #4C1A9E present, and no overlay.
In product, reduced motion also hides the flash overlay (the shipped rule, globals.css:8754-8759) and
swaps the flap for an instant change.

**In product:** step 2's flap is new on the wall. Steps 1, 3, 4 and 5 are opacity and transform only.
The chime plays for the pickup only, when sound is on (ReadyBoard.tsx:197). **A table going all out
never chimes**, because a chime in a dining room for every table would be noise. Mom has her own
board's chime.

**State `stale`:** static. Nothing moves on a frozen board.

### A11Y

- As screen 1. In `stale`, the one live region carries the reconnecting sentence (one node, swapped
  text). The kitchen sentence is a plain `<p>`, not a second region.
- The pill's text is the table's state for assistive technology. The rim is aria-hidden.
- The frozen passes keep their text. Only the decoration changes.
- The canvas stepper is a real `<button>` with an `aria-label`. It is the frame's one extra control,
  and it is canvas-only.

---

## DATA

### What the wall reads today (`app/api/board/route.ts`)

- **`mms_now`**, the database clock (:127-128).
- **`qr_orders` for pickup and scan-and-go:** `id, session_id, togo_status, customer_name,
togo_ready_at, togo_picked_up_at, created_at` (:131), capped at 60. It publishes `code`, `name`,
  `status`, `readyAt` and `readyMinutes` (:286-304).
- **The pulse lines:** `qr_cart_items.cart_id, menu_item_id, name, qty, state, fire_at, bumped_at`,
  where `fire_at` is set, inside today's window, and the line is fired or in progress or was served
  within 5 minutes (:196-203). Capped at 500.
- **Their carts** (`qr_carts.id, session_id, status` in open or paid, :218-224) and **sessions**
  (`table_sessions.id, mode, status, table_number, expires_at`, :248-253).
- **The catalog's Burmese:** `loadLineNames` (:314-316).
- **The published pulse:** `tickets`, `oldestMinutes`, `allDay`, `allDayMore`, and `tables` as
  `{table, status: cooking|up}` (board-pulse.ts:92-119).

### What the wall needs that it does not read today (a server change; stream: **kitchen-ops**)

1. **A per-table, per-round, per-dish shape** from a new pure shaper (`lib/board-tables.ts`, which
   replaces `shapeBoardPulse`). It publishes ONLY this:

   ```ts
   type BoardDishStage = "sent" | "cooking" | "up";
   type BoardDish = { name: string; nameMy: string | null; stage: BoardDishStage; togo: boolean };
   type BoardRound = { n: number | null; next: boolean; dishes: BoardDish[] };
   type BoardTable = { table: number; out: boolean; rounds: BoardRound[] };
   // response: { orders: BoardOrder[]; tables: BoardTable[] | null; serverNow: string }
   ```

   **No field exists** for a quantity, a modifier, a note, a guest name, a seat, an id, a comp, a void
   or an amount. The shape is the boundary, as board-pulse.ts:12-17 already argues.

2. **The line read widens by three columns and one clause:**
   - `fire_batch` (rounds, `20260622100000_s2_polish.sql:9`);
   - `fulfillment` (the to-go tag);
   - `created_at`;
   - the KDS's `fire_at is null and created_at >= floor` arm (kitchen.ts:181-186), so a fired line
     with no fire time is on the wall exactly when it is on the KDS.

   Each line passes **`kdsLineGate`** (counter-order.ts:220-225, active session and past the grace)
   so the wall never shows a dish the KDS does not. The wall keeps its own **ghost rule** (an expired
   session is off the wall, board-pulse.ts:376-377) and its **no-number rule** (an unregistered
   sticker stays off, :378). The session read gains `qr_code`, which is server-only and is needed by
   `isCounterOrder` inside the gate. The cart read gains `pickup_slot`, also server-only.

3. **One new advisory read for round numbers:** `qr_cart_items.cart_id, fire_batch, fire_at` (any
   state, voided included) for the dine-in sessions on the wall, through their non-cancelled carts.
   It is bounded and capped, and it reuses **m5's pure `roundOrdinal` / `ticketKey`** (m5 decision 9),
   so the wall and Mom's KDS give one card one number.
   - A failure or saturation gives `n: null` and never blocks the wall.
   - A line with null `fire_batch` and null `fire_at` keys to m5's deterministic per-cart bucket from
     the raw row, never from a shaped `firedAt` (Codex correction 3). Otherwise its round would
     reorder on every poll.
4. **The settle window:** `out` is true only when every dish on the table is `up` AND the latest
   `bumped_at` is at least `KDS_UNDO_MS` (6 s) old on the DB clock. `UNDO_MS` moves from
   KdsBoard.tsx:77 to `lib/` so both screens read one value ("name it ONCE").
5. **The linger:** a round stays while any dish in it is not up, or for `PULSE_PASS_LINGER_MS` after
   its last bump. A table stays while any round stays.
6. **Saturation is refused, not drawn:** a full 500-row line read gives `tables: null` (the frozen
   look plus the sentence). A partial table list would show a table missing a round. The
   `queueEmptiness` shape comes from kitchen.ts:190-201.
7. **The pickup orders stop sending `name`.** `customer_name` leaves the select and the payload
   (never publish what is not drawn). It stays on the lane (expo) and on the guest's own pass, where
   Dad calls it.
8. **The pulse's `tickets`, `oldestMinutes`, `allDay` and `allDayMore` stop being published.**

**Writes:** none. **Migrations:** none. **Realtime:** none (the 5 s poll stays). **New strings:**
none. The round stub's key, `kds.round` / `kds.round.next`, is m5's.

**The client** (ReadyBoard.tsx):

- It keeps a `prevOut` set, seeded by the first poll, for the celebration, and a `lastTables`
  snapshot for the frozen look.
- It reuses `useColumnFit` and `boardColumnFit` with the step-down above.
- It retires `KitchenPulse`, `PulseTableChip` and `PulseDishName`. `PulseDishName`'s
  no-English-in-a-Burmese-run rule survives in the dish row.

**Pure modules and mutants** (`verify:slice` mutate set, the module's own suite):

- `board-tables.ts`:
  - a draft never appears;
  - a line inside the grace never appears;
  - voided never appears;
  - a pickup or scan-and-go line never appears;
  - an expired session is off;
  - a non-active session is off (cleared);
  - a null table number is off;
  - the stage is the least advanced of a same-name group;
  - `up` requires `bumped_at`;
  - a recalled line reads cooking;
  - `out` needs every dish up AND the settle window;
  - a round older than the linger drops;
  - a comped dish is still drawn;
  - `togo` is carried only for `fulfillment='togo'`;
  - `n: null` draws `next` only when an older round is on the same pass;
  - cooking wins when two sessions share a number (board-pulse.ts:382-387).
- `board-fit.ts`: the step-down order (a) → (b) → (c), and that "+N more" counts tables.
- **The route:** the whole-body "publishes NO identifier" test (route.test.ts:504) extends to
  `tables`, with an added assertion that no quantity, modifier or note key exists anywhere in the
  body. The pin "no dish attached to it" (route.test.ts:421) is **reversed knowingly** and re-written
  as "a dish name rides only inside its table, with no quantity".

**Files (kitchen-ops):**

- `apps/qr/app/api/board/route.ts` (+ `route.test.ts`);
- `apps/qr/lib/board-pulse.ts`, retired into `lib/board-tables.ts`;
- `apps/qr/lib/board-fit.ts`;
- `apps/qr/components/ReadyBoard.tsx` (+ its suite);
- the `.orb-*` block in `apps/qr/app/globals.css`;
- `KdsBoard.tsx`'s `UNDO_MS`, moved to `lib/`.

**Docs in the same PR:**

- `docs/context/SPEC-KDS.md` §6 (amended);
- DESIGN-LANGUAGE (the wall's marks);
- OPEN-ITEMS: K32(b) closed by this decision, P6a retired with the rail, and its own PD row.

**Not this stream's:**

- `--fs-pass` is guards-style's early token PR (D1(c));
- `kds.round` and `roundOrdinal` ship in kitchen-ops' m5 PR (PD5) first.

**Sequencing:** guards-style's token PR, then PD5 (m5), then m9. m9 needs no device test to merge,
but its first night is watched (open risks 2, 3 and 6).

---

## VERIFIED CLAIMS (checked against the repo at f1110aa)

| Claim the design rests on                                                      | Verdict                    | Evidence → design consequence                                                                                   |
| ------------------------------------------------------------------------------ | -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| The wall can show ready vs served as two stages                                | **FALSE**                  | board-pulse.ts:77-83; staff.ts:2045-2054 → three stages                                                         |
| Start = `in_progress`; Done and All done stamp `bumped_at`; a recall clears it | TRUE                       | staff.ts:183; p2f…sql:394, :421; w3_kitchen.sql:214-221                                                         |
| The wall gets realtime                                                         | **FALSE**                  | route.ts:30-33; ReadyBoard.tsx:214 (5 s poll) → "within about 5 s"                                              |
| The shipped wall forbids a per-table dish list                                 | TRUE (shipped)             | board-pulse.ts:19-23; SPEC-KDS.md:83-88; route.test.ts:421; OPEN-ITEMS K32(b) → reversed by the owner's message |
| The pickup column shows guest first names today                                | TRUE                       | route.ts:131, :288; ReadyBoard.tsx:688 → names dropped                                                          |
| Checkout promises the name on the board                                        | **FALSE**                  | Checkout.tsx:3547-3551 ("We'll call your name") → dropping it breaks no promise                                 |
| Unsent and in-grace dishes stay off                                            | TRUE if the gate is reused | counter-order.ts:220-225; board-pulse.ts:295-299 → `kdsLineGate` on the wall                                    |
| A cleared table leaves at once                                                 | TRUE                       | board-pulse.ts:316-317 (non-active session) → the m7 stop card never reaches the wall                           |
| Rounds are recoverable from the rows                                           | TRUE                       | s2_polish.sql:9, :24 (`fire_batch` per send)                                                                    |
| The kitchen's Undo window is 6 s                                               | TRUE                       | KdsBoard.tsx:77 → the wall waits it out                                                                         |
| Table numbers fit 88 px in a 136 px stub                                       | TRUE                       | registry 1–10 (k2_table_registry.sql:44), two digits                                                            |
| Prose counts render in Burmese digits on a Burmese wall                        | TRUE                       | fill.ts:27-37 → the status line is drawn with ၃ and ၂                                                           |
| The board is Night-forced and defaults to Burmese                              | TRUE                       | ReadyBoard.tsx:312; page.tsx:24-29; staff-lang.ts:50-56                                                         |
| Session replay could record the new dish lists                                 | **FALSE**                  | instrumentation-client.ts:40 (`disable_session_recording: true`) → no `ph-no-capture` needed                    |
| The wall may auto-play a guide carousel                                        | **NO**                     | globals.css:8751-8755 (drift withdrawn: no pointer, no pause control; WCAG 2.2.2) → a static key                |

---

## DECISIONS

1. **The owner's 2026-10-07 message is K32(b)'s decision.** Per-dish, per-table progress goes on the
   wall. The PR amends SPEC-KDS §6, `board-pulse.ts`'s boundary docblock and route.test.ts:421 in the
   same change, and closes K32(b) and P6a.
2. **Privacy holds at "a table number and dish names only".** The output type has no field for a
   quantity, modifier, note, name, seat, id, comp, void or amount. Same-name dishes in a round are one
   row. No count appears on a shared cart, and none is implied by repeating rows.
3. **Three stages, not four:** Sent · Cooking · Ready to serve. A fourth ("served") needs a runner
   tap that does not exist, and adding a tap to Dad's busiest minute is the wrong trade. It is parked,
   not designed.
4. **"Ready to serve" is the wall's word for the bump**, the shipped owner-chosen word. It is a staff
   verb, so guests read no instruction in it. The phone's receipt keeps D5's "Served" for the same
   stamp (open risk 5).
5. **Gold means "out of the kitchen" on this wall and nothing else:** a gold track, the table pill and
   rim, and a Ready pass's flash. Sent and Cooking never take gold. The sound chip's gold is the
   shipped pressed cap.
6. **No lateness, no age and no clock for a dish, ever.** Lateness is the KDS's ALARM tier alone. A
   wall that timed the kitchen in public would shame Mom in her own dining room and make no guest's
   food faster.
7. **The kitchen-pulse band (count, oldest age, all-day rail) is retired from the wall.** The passes
   supersede it, and the KDS keeps its own all-day rail. Reversible by revert.
8. **One pass across the moments:** the table stub is the CounterPass primitive (constant paper,
   `--fs-pass` figure, dotted perforation, 12 px notches) that m1's "Show a server" and m2's counter
   pass use. The pickup code wears the phone pass's `.exit-pass-code` face (m3).
9. **The table's figure uses `--fs-pass`** (D1(c), guards-style's token PR) as a clamp maximum. The
   pickup code stays at the board's shipped 54 px row tier. At 88 px a 6-character code would overflow
   the column (m6 measured ≈466 px), and no new size is invented.
10. **The paper stub is constant cream on the Night wall.** PATH_DESIGN's CounterPass rule ("constant
    paper in both themes") wins over m2/m6's earlier Night swap. The vocabulary's "cream = the one
    open Undo" is read as the **kitchen** board's rule (m5 decision 14). The wall has no Undo (D3), and
    Mom never acts on it (open risk 9).
11. **Tables are sorted by number and flow down two columns.** Nothing re-sorts on status: a guest
    finds a number where numbers are, and nothing on the wall moves because another table changed.
12. **A table appears when its first dish clears the grace and leaves 5 minutes after its last dish
    came out**, or at once when cleared. An empty pass would be noise.
13. **One celebration per table visit.** The pill flaps into row 1's progress slot and the rim warms.
    It waits out the KDS's 6 s Undo, so the wall never celebrates what Mom can still take back. A
    first poll after a reboot seeds the baseline and celebrates nothing.
14. **The flap is the wall's one new motion,** a departure-board cell turning over: 320 ms, no
    overshoot, transform and opacity only. Per-dish changes are a 600 ms segment fill. Nothing
    breathes, ticks or drifts. Reduced motion gets the end frames.
15. **No chime for a table**, only the shipped pickup chime. A dining room hearing a tone for every
    table is noise. Mom's board already chimes for her.
16. **No fact is marked twice.** When a table is all out, its rows drop their tracks and words, and
    the one pill speaks for the table.
17. **Round stubs on the wall are m5's, with the same derivation and the same key.** Round 1 never
    carries one. An unknown number draws "နောက်တစ်လှည့်" only when an older round of the same table
    is on the pass, and otherwise nothing.
18. **Dish names do not flip with the board's language.** Burmese sits on top at 26 px and English
    beneath at 20 px in both modes. These are the house's own dish names, and Burmese is never
    smaller.
19. **The pickup column drops first names** and the route stops sending them. The code is the one
    identity on the wall, matched against the phone's claim ticket. Dad still calls the name aloud
    (the shipped checkout promise).
20. **The stale wall drops what rots and keeps what does not.** Identities (numbers, codes, dish names
    and rounds) stay, drawn frozen with a dashed edge and --t2. Stages, pills, rims and waits go. A
    failed kitchen read draws the same frozen look over the last good tables, never "all clear".
21. **The wall says nothing about paying**, before or after C2. D5's door is the phone's news. The
    wall's "all out" also counts only sent dishes, while D5's gate counts drafts too, so the wall must
    never imply the phone's Pay is open.
22. **The key is the wall's step guide, static on purpose.** The TV has no pointer and no pause
    control, so an auto-playing guide would breach WCAG 2.2.2. The shipped drift was withdrawn for the
    same reason (globals.css:8751-8755). The animated step guides live on phones and tablets, where
    they can be skipped.
23. **Saturation and read failure refuse rather than draw a partial table.** An incomplete pass is a
    lie a guest would read as "they forgot my tea".
24. **Moment integration, end to end:**
    - m1: a dish appears on the wall at the same instant m1's pass flips to "Sent to kitchen", past
      the grace.
    - m5: rounds use the same stub, number and settle window.
    - m7: a cleared table leaves at once, and the stop card never reaches a guest's eyes.
    - m8: approvals never show. An approved void simply removes the dish.
    - D3: no Undo word appears.
    - D5: no pay word appears.
25. **No new copy and no new Burmese.** Every word is shipped, owner-verified or a catalog name, plus
    m5's draft round key.

---

## OPEN RISKS

1. **The privacy reversal is real.** Guests at other tables, and anyone passing, now read what each
   table ordered while it cooks. The mitigations are dish names only, no quantities or modifiers or
   notes, and 5 minutes of linger. A guest cannot opt out, and staff have no switch to hide one table.
   If the owner wants one, it is a new write. Recommend the merge-window line names this reversal in
   plain words for the owner's yes.
2. **Old TV builds after the deploy.** `/board` is outside Phase 2i's update reload (HANDOFF "D8:
   kiosk and /board are not in 2i (P2ig)"). A TV still running the old client gets no `pulse` and no
   `name`. It shows "Can't read the kitchen right now." in the old band and #CODE-only pickup cards
   until someone reloads it. The merge-window line should say: reload the TV once after the deploy.
3. **A station that is never bumped pins tables to the wall.** If drinks are made at the counter and
   nobody taps Done on Mom's board, Table 4's tea reads "Sent" all night, and the table never goes
   all out or leaves. This is the same check D5 sends to the device sitting ("drinks get bumped on
   Mom's board"), and it matters more here because the room can see it.
4. **The round number can run ahead of the guest's sense of rounds.** Make-it-now to-go lines and
   settlement food each get their own batch (m5's suggestion C7), so a table's second real order can
   read "အလှည့် 3" on a screen guests read. m5 has to decide which batches count, and the wall
   follows.
5. **One stamp, two words across surfaces:** "Ready to serve" (the wall, for the room and the runner)
   and "Served" (the guest's receipt, D5). The wall's word protects the runner, because "Served"
   would tell Dad not to carry it. Put to the native sitting whether the phone should also read
   "Ready to serve", since the app cannot see a plate arrive.
6. **OLED burn-in.** The cream stubs are static for minutes at a time on a screen lit 12 hours a day.
   Positions shift as tables arrive and leave, but a device check is owed (board-6 already made the
   heading rule a hairline for this reason).
7. **Flap performance on a smart-TV browser.** `rotateX` with perspective is compositor work, but TV
   browsers are weak. Measure at the device sitting, and fall back to the opacity-only swap if it
   stutters.
8. **The fit step-down is new logic.** At 10 tables with 3 or more dishes each, steps (a) and (b)
   carry the wall. Step (c) hides the highest table numbers, which strands those guests' view, so it
   must stay rare. It has mutants, but the real density is measured on the first Friday night.
9. **Cream on a Night board.** On the kitchen board, cream means the open Undo. The wall is a
   different screen with no Undo, and Mom does not work from it. Confirm at the device sitting that
   the paper stubs read as passes, not as something to tap.
10. **Burmese drafts on a guest-facing wall:**
    - ပို့ပြီး (K15-HIGH);
    - ဟင်းထွက်ပြီ (K15);
    - m5's အလှည့် {n} and နောက်တစ်လှည့် (drafts);
    - အသံ ဖွင့်ထား (K15).

    They go to the native sitting with m5's rows. The wall raises their priority, because guests read
    them.

11. **The round digit.** m5 draws "အလှည့် 2" with a Latin 2. If `kds.round` names its slot `{n}`,
    fill.ts:37 localizes it to "အလှည့် ၂". m5's key should use an identifier-class slot (like `{id}`),
    so the wall and the KDS both draw 2.
12. **Mixed numerals on one wall:** the status line's ၃ and ၂ beside Latin table numbers and codes.
    This is the owner's 2026-09-05 rule, shipped. Recorded so nobody "fixes" it on sight.
13. **Two live sessions on one number** (a re-seat inside the linger, or a merge, M99). Rounds from
    both land under one pass, and their per-session ordinals can collide (two "Round 2"s). Cooking
    wins for `out`. The ordinal collision is rare and accepted, and it is pinned by a test that
    asserts the merged order.
14. **Read cost.** The board route gains one advisory read and three columns, on a 5 s poll from every
    TV. Measure p95 on the pinned `pdx1` functions (C27) before and after.
15. **Dropping names from the pickup column reverses W3e in the safe direction.** If the owner wants
    names back, it is a payload and render change. The route keeps no dormant name field in the
    meantime.

---

## Appendix — what changed after this spec (applied in the drawn screens)

The spec above was written first. The round-3 consistency pass and an adversarial critic then changed it, and
the screens on the canvas were drawn with both applied. **Where an item below contradicts the spec above, the
item below wins**, and PATH_DESIGN_2026-10-07.md (its round-3 section) wins over both.

### A · System amendments (the round-3 consistency pass)

1. The third stage word is 'Served · ထုတ်ပြီး' from table.line.state.served, the one stamp key shared with the phone pass, Dad's pane and Mom's 'Served today'.

- board.pulse.up ('Ready to serve · ဟင်းထွက်ပြီ') leaves the wall with the pulse band. It survives only as Dad's console CALL (floor.kitchen.up and upNotice).
- Rewrite decision 4 and close open risk 5. If the native sitting re-words ထုတ်ပြီး, every surface moves together.
- 'Sent' and 'Cooking' are kept.

2. Track colour is the stage and length is progress.

- Sent: segment 1 in --t2.
- Cooking: segments 1 and 2 in --tx.
- Served: all three in --ok #5fb07e, with the word in --ok (5.77:1 on --cd).
- Rewrite decision 5: on the wall, gold is spent only on the pickup call (the Ready heading and a Ready pass's flash) and on the sound chip's pressed cap. Re-word the globals.css gold comment from the runner's act-now to the pickup call, because the runner's call lives on Dad's console.

3. An all-served table:

- Row 1's progress slot holds the roll-up: the 3/3 --ok track plus 'ထုတ်ပြီး' in --ok. No fill (CALM), no gold rim, never a ✓.
- Rows drop their tracks.
- Retire .orb-table-up's use on the wall.
- The ladder becomes: Sent and Cooking are MARK, Served is CALM, the pickup Ready pass is the wall's only CALL, and there is no ALARM.

4. Motion:

- The segment fill goes from 600 ms to the shared 480 ms FILL.
- The flap becomes the shared TURN on the X axis: the out-half is the words stepping aside over --dur-base ease-in, the in-half is the roll-up falling from its hinge over --dur-base --ease-out. There is an opacity fallback if the TV stutters, and it is instant under reduced motion.
- Delete m9Rim.
- The TURN waits KDS_UNDO_MS on the DB clock.
- A pickup pass is issued with POP plus the shipped flash.

5. The stub renders post-pay's CounterPass primitive in landscape, not a local recipe.

- --pass-ink-2 replaces the #726e6b mix.
- --pass-seam is 4px dotted at the TV tier.
- --pass-hole is --pg.
- Sequencing: guards-style tokens, then post-pay's primitive, then PD5, then m9.

6. Stages come from the shared pure lib/kitchen-track.ts (trackStage, least-advanced groupStage, rollUp), and board-tables.ts imports it. Keep these mutants in board-tables.ts.

- The heading key is the shared KitchenTrackKey component, the one m11's page 3 renders, aria-hidden here.
- 'Never on the wall' adds the ✓ and the not-sent ring.
- In the Burmese-draft list, ထုတ်ပြီး replaces ဟင်းထွက်ပြီ.

7. The round stub reads m5's identifier-class kds.round slot and its dine-in-only ordinal.

### B · The adversarial critic's blocking fixes (verdict: fix)

1. **The third stage uses the wrong word and key. The brief draws the bump stamp as "Ready to serve" / ဟင်းထွက်ပြီ (board.pulse.up) and makes it the runner's carry signal, where the ONE KITCHEN TRACK amendment requires "Sent · Cooking · Served" on the TV from the keys table.line.state.fired, inProgress and served. The amendment also keeps "Ready to serve" only as Dad's console CALL, never as a mark.**
   - Evidence: picked-m9.md:40-43, :101-102, :253-255, :349, :395-396, decision 4 (:816-819) and open risk 5 (:906-909), which asks the sitting to re-open the phone's word. The required key exists: staff.ts:2805 "table.line.state.served": { en: "Served", my: "ထုတ်ပြီး" }, grounded in kds.served.chip at staff.ts:209, which is the word Mom's own KDS already uses for this stamp. The brief takes Cooking from kds.line.cooking (staff.ts:187) instead of table.line.state.inProgress (:2804). Under ?lang=en, "Ready to serve" in Hanken 700 at 20px is about 150px, which overflows the 128px progress slot (:245) and the pill's 128px maximum (:223).
   - Fix: Use table.line.state.fired / inProgress / served (EN "Sent · Cooking · Served", MY ပို့ပြီး · ချက်နေဆဲ · ထုတ်ပြီး) in the rows, the key and the roll-up. Rename BoardDishStage "up" to "served". Withdraw decision 4 and open risk 5. Drop the runner-audience framing ("a runner reads 'carry it'", :41-43 and :3-4): the carry call is Dad's console. Retire board.pulse.up from the wall together with the band.
2. **Gold is used as a progress colour, and Served is drawn as a CALL. The amendment says gold or accent is never a progress colour, Served is 3 segments lit in --ok, Cooking is 2 segments lit in --tx (colour is the stage), and on the TV Served is CALM, with the pickup Ready pass as the only CALL. The key also invents a fourth track size.**
   - Evidence: :249 (Served = 3×#e7a53a), :255 (word in --gold), :102 and :219-224 (the .orb-table-up lit-cap pill plus a 2px #e7a53a rim and a gold halo), and :106-107 ("CALL: the gold Ready to serve (a dish, a table, a pickup pass)"). Decision 5 (:821-823) makes gold mean "out of the kitchen". Cooking is drawn two-tone, #bcafc8 then #f3ecdf (:248, :393), not 2× --tx. The key's mini-tracks are 16×6 with a 3px gap (:391), but the vocabulary sizes are 36×8 (TV row) and 14×5 (glyph).
   - Fix: Sent: 1 segment in --t2. Cooking: 2 segments in --tx. Served: 3 segments in --ok, with each word in its stage ink. Draw the key with 14×5 glyphs. Draw the table's all-served roll-up as CALM in --ok / --pass-ok, with no lit cap, no gold rim and no halo. Keep gold only on the pickup Ready pass and heading and on the sound chip's shipped pressed cap. Re-measure every pair (--ok on its ground ≥3:1 non-text and ≥4.5:1 for the word).
3. **The table pass is a hand-drawn hybrid, not the ONE PASS primitive. It pairs a paper stub with a Night --cd body set in Night inks, inside .orb-_ CSS. Each pass needs to be post-pay's @mms/ui CounterPass, rendered with the constant --pass-_ ink set at the light values. The pickup pass breaks the anatomy too.**
   - Evidence: Body on --cd with --tx/--t2/--gold inks (:213-216, :236-255). The brief uses its own colour mixes: color-mix(--ink 62%) = #726e6b and 50% = #8d8a86 (:167-168, used at :203, :284, :289). The amendment says these inks "replace every per-spec ink mix". The table perforation is coloured page-ground #100c19 (:208), not --pass-seam. The pickup seam is 2px (:284), but the TV tier is 4px. The pickup pass puts its stub on the RIGHT (:280-286), where landscape is "stub left". The pickup pass has no two-tongue label, and the table label omits the "·" of "စားပွဲ · Table" (:202-204). Decision 8 (:829-831) claims only the stub is the primitive. The Files list (:760-767) and the Sequencing (:777-780) have kitchen-ops redraw the pass, and omit the CounterPass PR and the --pass-\* tokens in guards-style's D1(c) PR.
   - Fix: Render the whole table pass as the @mms/ui CounterPass in landscape: stub left with the figure and the "စားပွဲ · Table" label, and the dish rows and tracks on the paper body in --pass-ink / -ink-2 / -ink-3 / -ok / -unlit. Draw the perforation as a 4px dotted --pass-seam, and the notches as --pass-hole. Do the same for the pickup pass (stub left, label, 4px seam). Remove every color-mix. Add the CounterPass PR and D1(c)'s --pass-\* tokens to Sequencing, and make kitchen-ops consume the pass, never draw it.
4. **The TV shows an age that ticks without any food changing state, and the room's only CALL fires for bags already collected. The amendment says "No ALARM, no clock, no age … It moves only when food changes state".**
   - Evidence: The pickup stub holds the shelf wait "ခုလေးတင်" / "{mins} မိနစ်" (:287-290, :443-445). Between the two screens it ticks 2→3 and 6→7 (:561-563) with no food change. That contradicts the brief's own "no number ticks" (:15-16) and decision 6. The shipped BoardCard comment calls this count "an age" (ReadyBoard.tsx:680-684). Collected bags linger under Ready for 10 minutes (route.ts:117, :135) and are published as status "ready" (route.ts:290). The brief draws them as the same Ready pass with only a blank stub (:289-290), so once the wait is gone a handed-over bag looks exactly like the CALL.
   - Fix: Stop publishing and drawing readyMinutes on the wall. The stub carries the pass label instead. Have the route publish collected rows distinctly (or drop them), and draw a collected code CALM or not at all, never as the gold Ready CALL pass. Update the route suite's readyMinutes pins (route.test.ts:586-629) in the same PR.
5. **The motion sits outside the decided language, and more than one thing moves at a time. The flap is a newly invented keyframe rather than TURN, the fade-out is not in the language, steps overlap on the same pass, POP and FLASH fire together, POP is attributed to the wrong source, and FILL runs at the wrong duration.**
   - Evidence: m9Flap (:620-624) is one 320ms rotateX(-90→0)+opacity half with cubic-bezier(0.2,0.8,0.2,1). Decision 14 calls it "the wall's one new motion". TURN is two --dur-base halves (tokens.css:94, 240ms): ease-in to 90°, then --ease-out. m9Out (:617-619) is a 240ms fade of three rows' progress blocks; the language has no fade, and an un-mark is instant. On one pass, step 1 runs 0.30–0.54s, step 2 runs 0.40–0.72s and step 3 runs 0.40–1.00s: three overlapping motions. Steps 4 and 5 (:628-633) run POP and FLASH on the same pickup pass at 1.40s. m9Pop is called "the kit's mms-pop", but the kit's mmsPop is the 1.18 numeral bounce (globals.css:903-916). Issuance ("the pass is issued", :628) is RISE, and the shipped arrival is FLASH alone (ReadyBoard.tsx:177-197). FILL is 600ms (:318, decision 14), but the vocabulary's FILL is 480ms.
   - Fix: Table all-served: drop the row tracks instantly, then one TURN (X axis on the status cell, two 240ms halves, no opacity ramp and no rim). Pickup Ready: FLASH only (or RISE only), never both. Run the steps strictly in sequence. Set FILL to 480ms with scaleX from inline-start. Rewrite decision 14 and the canvas keyframes to match. Keep the reduced-motion escort, ending on the final frame.
6. **The motion gating breaks the "never inside the Undo window" and "once per pass per visit" rules, and does not sequence a poll that carries several changes.**
   - Evidence: All done stamps every line at once (p2f…sql:419-423) and has a 6s Undo (KdsBoard.tsx:77, :784; staff.ts:179: "a 6s undo is the only way back"). The brief gates only `out` (:322-324, data 4 :711-713). The per-dish FILL and word swap (:317-319) reach the wall within the 5s poll, inside the window. The celebration rides a `prevOut` diff (:729), so a 2-minute Bring back (RECALL_MS, KdsBoard.tsx:78) followed by a re-bump celebrates the same visit twice. The first good poll after a frozen spell would also celebrate every table that went out during the outage. One rush poll routinely carries several FILLs, two tables going out, or a table out plus a pickup Ready. Only the canvas staggers them (:613-633); the product rule is missing.
   - Fix: Have the shaper report a line as served only once bumped_at is at least KDS_UNDO_MS old on the DB clock, the same rule as `out`. Replace prevOut with a celebrated set keyed by table number and pruned only when the table leaves the payload. Re-seed on the first poll after stale, as at boot. Specify a client queue that plays a poll's changes one at a time in a fixed order (table number, then the pickup), and lands any backlog as instant final frames when the next poll arrives.
7. **The stale wall carries every table's dish list frozen for the whole outage, and justifies it by misreading the cited source. A departed party's dishes stay up under a number a new party may now occupy.**
   - Evidence: At :333-341 the frozen passes keep their numbers, dish names and rounds "until recovery", called "the shipped asymmetry, applied once more (ReadyBoard.tsx:366-381)". That source says the opposite: the kitchen band is NULLED on stale because "Every value in this band does [rot]… forty minutes into an outage the wall showed … a lit-gold `Table 3 · Food up`"; only Ready-column names and codes are carried. A table leaves 5 minutes after its last dish (PULSE_PASS_LINGER_MS, board-pulse.ts:168) or at once when cleared (:317). So past that window, any frozen pass may be a party that has gone.
   - Fix: Bound the frozen kitchen half to PULSE_PASS_LINGER_MS from the last good poll's serverNow (or drop it at once). After that, show only board.pulse.unavailable. Correct the citation and decision 20 to say that table passes rot on the linger clock.
8. **Stage, group stage and roll-up are derived a second time in a new lib/board-tables.ts. The ONE KITCHEN TRACK amendment requires one pure lib/kitchen-track.ts to derive the stage, a group's least-advanced stage and the pass roll-up for every surface.**
   - Evidence: Data 1 (:678-686) and the mutant list (:737-753: "the stage is the least advanced…", "up requires bumped_at", "a recalled line reads cooking", "out needs every dish up AND the settle window") put that logic in board-tables.ts. The phone (PD1/PD2), Dad's pane and the guides read the same stamps, and CLAUDE.md's "name it ONCE" rule says two derivations will drift.
   - Fix: board-tables.ts only gates, filters and shapes: kdsLineGate, ghost, no-number, linger, saturation and the privacy shape. It calls kitchen-track.ts for stage, group stage and roll-up, and those mutants live with kitchen-track.ts. Add kitchen-track.ts's PR ahead of m9 in Sequencing.

### C · The critic's suggestions (not blocking; take them where the build agrees)

- Kiosk and walk-up pickup guests hold no code. The kiosk handoff says "Pay at the counter — we'll call your name." and shows no #CODE (KioskOrderFlow.tsx:250-251, :285-298; lib/kiosk/strings.ts:69-77). Dropping names is required, but the claim that the code is "matched against the slip in the guest's hand" (:85-87, decision 19) holds only for phone orders. Record the gap in VERIFIED CLAIMS and open risks, and file showing the code at the kiosk handoff as a separate row.
- The shipped FLASH (gold at 32%) over a paper pass peaks at #fbeccf, which is 1.15:1 against the #fffdf8 paper (computed), so the arrival would be nearly invisible. Choose and measure an arrival signal that reads on paper (for example on the pass's ground or edge) before the canvas claims the shipped flash.
- Line 7 ("The track fills only when Mom taps") and line 82 ("Every segment here is one of Mom's taps") are inaccurate: Sent comes from the guest's or Dad's Send past the grace. TableTimeline.tsx:9-11's "Ready" tap is now kds.line.done "Done" (staff.ts:185).
- kdsLineGate's dine-in branch returns before counterOrder or slotted are read (counter-order.ts:222-225), and the wall is dine-in only. So the planned `qr_code` (session) and `pickup_slot` (cart) read widenings (:700-702) buy nothing. Drop them and keep the public route's read minimal.
- The stub's "Table" label at Hanken 15px is below the board's own smallest TV tier (--kfs-meta clamp(15px,1.2vw,22px) resolves to 22px at 1920; globals.css:8545). Use the TV tier so the label reads across the room.
- clamp(56px, 4.6vw, var(--fs-pass)) produces in-between figure sizes on non-1920 TVs. State that the clamp is the TV tier's fluid form, or pin --fs-pass and let board-fit's step-down do the work, so there is never a fourth size.
- State explicitly that a pass or dish appearing for the first time renders at its final frame with no FILL (the "never on a first read" rule). Today only the reboot seed is covered (:327-328).
- KDS_UNDO_MS is needed by both m9 (kitchen-ops) and D5's phone door (money-rails / PD10). Name which PR moves it from KdsBoard.tsx:77 to lib/, so two streams do not each create it.
- Open risk 3 (drinks never bumped pin a table to the wall) is more visible on a guest wall than on the KDS. Add it to the device sitting's checklist next to D5's "drinks get bumped" check, and consider whether the linger needs a server-side ceiling for a line that is never bumped.
- Once the table pass becomes all paper, the static cream area on the OLED grows. Raise the burn-in check (open risk 6) from 'owed' to a named device-sitting item.
- The round stub's slot should be identifier-class, as open risk 11 says. Make that a stated dependency on m5's `kds.round` key, not a hope, because `{n}` would render ၂ on the wall (fill.ts:7-8, :34).

### D · Blind-review corrections (2026-10-08) — these win over everything above

1. **The table figure is `--fs-pass`, pinned, never a clamp maximum** (PATH_DESIGN's round-3
   vocabulary: three pass tiers only). Decision 9's clamp and section C's clamp line are withdrawn: on a
   TV that is not 1920 wide, density is board-fit's step-down (fewer passes per page), never a smaller
   figure. The pickup code keeps the 54px row tier.
2. **D5's phone door is PD10** (money-rails' served gate), not PD9; PD9 is this board.
