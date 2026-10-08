# Picked m5: the second round lands on a ticket that's still cooking. "One Send, One Sheet", refined

**Backbone:** GLANCEABLE (the owner: staff moments glanceable). Every Send becomes its own card. A
table's later Send carries one new shape, a perforated **stub** reading **အလှည့် 2**, and it reads
from across the pass. The card keeps its own clock, its own arrival flash and chime, and an All done
that serves only its own dishes. This is m5-glance-1/2, evolved: same grid, same strip, same stub
idea, same example tables.

**Softened per the judges.** Each item below is decided in DECISIONS:

- **The stub never outranks Late.** The cream slab (luminance 0.844, 8× the red strip) becomes a
  14% ink wash with a 2px outline. Its luminance is 0.042, against the red strip's 0.106. Late keeps
  the colour and the only motion.
- **A card never changes because another card arrived or left.** This covers its size and its face.
  Round 1 gets no tab, no pips and no twin flash.
- **The round is counted per SESSION**, so a table that paid and kept ordering still says
  အလှည့် 3.
- **The undo pill names the round**: "စားပွဲ 4 · အလှည့် 1".
- **The board says what is still out:** "စားပွဲ 4 ရဲ့ ကတ်တစ်ခု ဘုတ်ပေါ်မှာ ကျန်သေးတယ်။" ("Table 4 still
  has a card on the board.").

**Grafted from QUIET ("One Send, One Card"): restraint.**

- The stub is a label, never a control. The glance concept's "find" button retires. So does every
  mark that could change after a card lands (the pips and the twin flash).
- Round 1 is drawn exactly as today. An unknown round number draws nothing unless the board itself
  proves an older card of the same table is live.
- A single dish's Done joins the Bring back rail as a chip with no pill, so it never fights the one
  undo slot.
- Help gains one re-worded sentence, not a fifth card.
- Every visible word is a word Mom already reads on this console (စားပွဲ · ဆိုင်မှာ စား · အားလုံး ပြီးပြီ ·
  ပြန်ဖျက် · ပြန်ယူ). The exceptions are the round word and one sentence.

**Grafted from GUIDED ("The Brass Clip"): the spoken next step.** After Mom serves round 1, the
undo pill and the one live region add a single sentence, and only while it is true: Table 4 still
has a card on the board. It is computed from the snapshot already on the tablet, with no new read.
It answers Dad's "where's the tea?" before he crosses the pass to ask.

**World-class, held to this family's real constraints (no new hardware, no new screen, no
fabricated claim):**

- **A great KDS / the expo's ticket rail.** Every fire is its own ticket. Its clock starts when it
  fires, and the bump clears exactly what is printed on it. A second ticket for a table goes on the
  END of the rail, never stapled to the first.
  - Here: one Send, one card, its own clock, an All done scoped to its own lines.
  - Round 2 sorts to the live tail by its own fire time and is never forced beside round 1.
- **A Japanese ticket-and-token counter (食券).** The token carries one word and one figure, and it
  is matched at a glance. It never carries a diagram.
  - Here: the stub says အလှည့် 2 and nothing else. There are no pips, no arrows and no second figure.
- **A boarding pass's boarding-group box.** A bordered box with a word and a number, read across a
  gate area. It is never louder than FINAL CALL.
  - Here: the stub is bordered and quiet-filled, and it speaks at the clock's tier (24px). The late
    ticket (the kitchen's final call) keeps the colour and the motion.
- **The kitchen's own paper pad.** Every sheet torn from the same pad has a perforated edge.
  - Here: the stub's right edge is a DOTTED perforation. It is dotted, never dashed, because dashed
    already means a held card (globals.css:7894-7897) and a Bring back chip (globals.css:8458-8470).
  - This is the moment's one delight. It is a piece of craft Mom recognises, not a motion. On a hot
    line, delight is certainty: nothing on the board moves or lights up unless food actually landed.
- **A great maître d'.** He tells you once, quietly, what is still coming.
  - Here: the undo pill's second line. It is said once in the live region and never repeated or
    re-chimed.

**Example data.** These are m5-glance-1/2's own, kept like for like with one change: there are 5
tickets, not 6, so round 2 lands directly beneath the late ticket.

- The time is Friday 7:48 PM. Text size S (4 columns, 8 per page). Station All. Language mode Both
  (a Burmese-first device). Sound on. The rail is closed.
- The thresholds are dine-in amber at 8 min and red at 12 min (kds-urgency.ts:14-20).
- **Table 2:** Ohno Khao-Swe ×2, started. The clock reads 13:05, so it is RED, Late.
- **Table 4, round 1:** Mohinga ×2 (started) and Shan Noodles ×1 (fired). The clock reads 9:12, so it
  is AMBER.
- **Table 9:** Pickled Tea Salad ×1, at 6:40.
- **Table 11:** Chicken Curry ×1, at 3:15.
- **Table 4, round 2:** Burmese Milk Tea ×2 and Coconut Sago ×1. It cleared its 10 s send grace
  0:04 ago.
- The dish names are the catalog's (MENU_REFERENCE.md:27, :29, :31, :73, :139, :147, :156).

**Night tokens used below (the KDS is Night-forced, KdsBoard.tsx:1088 `kds-root dark`):**

| Token / composite    | Value                                                               |
| -------------------- | ------------------------------------------------------------------- |
| --pg                 | #100c19                                                             |
| --sf (calm strip)    | #211a30                                                             |
| --cd (card)          | #2b213c                                                             |
| --tx                 | #f3ecdf                                                             |
| --t2                 | #bcafc8                                                             |
| --ac (gold accent)   | #e7a53a, ink --oa #130d1e                                           |
| --gold               | #f4c879                                                             |
| --ok (bump)          | #5fb07e, ink #130d1e                                                |
| --warn               | #e0855f                                                             |
| --bd                 | rgba(243,236,223,0.13)                                              |
| --sheen              | rgba(255,255,255,0.11)                                              |
| amber strip          | #67534e = color-mix(srgb, --gold 30%, --cd) (globals.css:7906-7908) |
| red strip            | #7e4f4c = color-mix(srgb, --warn 46%, --cd) (globals.css:7909-7911) |
| **stub fill (calm)** | **#3e3748** = color-mix(srgb, --tx 14%, --sf), computed             |
| --sh-md (Night)      | 0 8px 22px rgba(0,0,0,0.5) (tokens.css:522)                         |

**THE ROUND STUB (one component, drawn the same on every card that carries it):**

- **Element:** a `<p class="kds-round">`, not a button. It is rendered through `<Chrome k="kds.round"
vars={{ n }} />` with no echo. The Latin digit is wrapped `lang="en"` by Chrome's rule 3
  (Chrome.tsx:35-38).
- **Place:** a second row of the strip, only on a card that carries a round. Row A (identity + clock
  - badge) is byte-identical to today's strip. Row B, 8px below it, holds the stub, left-aligned at
    the strip's 14px inset.
- **Box:**
  - min-height 44px at S;
  - padding 0 16px 0 14px;
  - radius 10px 0 0 10px;
  - 2px solid --t2 #bcafc8 on top, left and bottom;
  - **border-right 4px DOTTED --t2**: the perforation, in round dots;
  - fill `color-mix(in srgb, var(--tx) 14%, transparent)` over the strip, which is #3e3748 on a calm
    strip.
- **On an amber or red strip** the outline turns --tx #f3ecdf. This is the existing tinted-strip
  promotion (`.kds-strip-amber/red .kds-badge` and `.kds-id small` → --tx, globals.css:7938-7941,
  :7961-7964), so the outline keeps ≥3:1 at the red pulse's peak (computed below).
- **Text:**
  - "အလှည့် " in Padauk 700 at **--kfs-clock** (24px at S, 28 at M, 32 at L; globals.css:7711,
    :10694, :10705), lh 1.6, letter-spacing normal, font-synthesis none, --tx;
  - then "2" in Hanken Grotesk 800 at the same size, tabular-nums.
  - On an English device the stub reads "Round 2" in Hanken 800 24px, not uppercased (the identity
    "Table 4" is not).
- **Width at S:** about 112px (it hugs its text).
- **Nothing else sits in row B:** no echo, no pips, no arrow. The rest of the row is strip colour.
- **No animation of its own.** It rides the card's existing arrival flash (`.kds-flash`, 1.4s,
  aria-hidden). Under reduced motion it is the same static shape (the flash and pulse off-switch is
  globals.css:8531-8536).
- **Computed contrast** (WCAG relative luminance, sRGB mixes; m5calc/c.py in the scratchpad):

  | Strip                 | --tx on stub | Outline vs strip |
  | --------------------- | ------------ | ---------------- |
  | calm --sf             | 9.69:1       | 8.05:1 (--t2)    |
  | amber                 | 4.47:1       | 6.11:1 (--tx)    |
  | red                   | 4.27:1       | 5.75:1 (--tx)    |
  | red at the 1.22 pulse | 3.34:1       | 4.25:1 (--tx)    |
  - The text is ≥24px bold (large text), so the floor is 3:1. The outline is non-text, so its floor
    is 3:1 too.
  - **Loudness:** the calm stub's luminance is 0.042 over about 112×44px. The red strip's is 0.106
    over 326×71px, and it pulses to 0.160. The retired cream slab was 0.844.

---

## SCREEN picked-m5-1.dc.html: Table 4's tea lands as its own card, four seconds later, and Late still reads loudest

- **Device:** tablet 1366×1024, landscape.
- **Theme:** Night, forced (the KDS is Night-only). Glass appears only on the StaffBar chrome, as
  built.
- **When:** 7:48 PM, 4 seconds after round 2 cleared its grace.
  - The 1.4s arrival flash has already played, on round 2 ONLY. The dine-in chime played once. Open
    went from 4 to 5.
  - The frame is drawn at rest (no flash), so the owner judges the steady state: the Late strip above
    against the stub below.

### LAYOUT (top to bottom)

Root `.kds-root.dark`: padding clamp(8px,1vw,16px) ≈ 14px, flex column, gap 12px, ground --pg
#100c19.

- **y0–68 · STAFF BAR, unchanged**, exactly as m5-glance-1:
  - flush full width; rgba(33,26,48,0.90) with blur(20px) saturate(1.5); a 1px --bd bottom; an
    inset --sheen top; padding 10px 20px.
  - **Leading:** the Screens circle at x20, 44×44.
  - **Title:** h1 "မီးဖိုချောင်" in Padauk 700 30px lh 1.6, with "Kitchen" at 13px 600 --t2 beneath.
  - **Centre:** the station segmented control "All · Wok · Cold · Drinks". It is a 4px-padded pill
    track with four 44px segments (padding 0 18px). "All" wears the lit cap: #e7a53a fill, #130d1e
    ink, inset --sheen and 0 0 14px -6px --glow-gold.
  - **Trailing:** 44px circles 8px apart: TV · Sound (lit cap, pressed) · Aa · ? (gold-ringed Help)
    · Lock. The last circle's right edge is at x1346.
- **y80–147 · HEAD (`.kds-head`)**, padding-bottom 8 plus a 1px --bd rule:
  - **x14, the glance stats (`.kds-stats`, role=group), gap 16:**
    - "5" (Hanken 800 32px, lh 1, --tx) over "ဖွင့်ထား" (Padauk 700 15px, --t2);
    - "1" (32px 800, **--warn #e0855f**) over "နောက်ကျ".
  - **Then the ONE `role="status"` line, 15px --t2:** "ဖွင့်ထားတဲ့ အော်ဒါ 5 ခု".
  - **Right edge x1352:** the "စုစုပေါင်း" chip, 44px pill, --sf with a 1px --bd border, 15px 700.
  - There is no "1 new →" pill, because the arrival is on the page being watched (KdsBoard.tsx:1249).
- **y159 on · TICKET GRID**, 4 columns of ≈325.5px with 12px gaps:
  - column lefts at x14 · 351.5 · 689 · 1026.5;
  - oldest-first by each card's OWN first fire time;
  - each card: --cd #2b213c, a 1px --bd border, radius 12, the `card-textured` dots as in
    m5-glance-1.
  - **Row heights from the tiers:**
    - strip 71px: 10 + 51.2 (32px × 1.6) + 10;
    - plain dish row 95px: 10 + 48 (30px × 1.6) + 25.6 (21px × 1.22) + 10 + 1px divider;
    - started row 117px (+2 + 20.8 for the 13px tag);
    - bump 84px: 64 + 2 × 10 margin;
    - plus the card's 2px border.

  **ROW 1 (y159–528):**

  - **c1 x14–339.5 · Table 2, LATE, 274px tall (y159–433):**
    - **Strip:** RED #7e4f4c. Its 1.6s brightness pulse is drawn at rest. Padding 10px 14px.
      - Left: "စားပွဲ 2" in Padauk 700 32px lh 1.6, with the "2" in Hanken 800 marked `lang="en"`.
      - Right column (gap 2): "13:05" in 24px 800 tabular, lh 1, over the badge
        "နောက်ကျ · ဆိုင်မှာ စား" at 15px 700, **--tx** (promoted on a tinted strip).
    - **One STARTED row:**
      - a 12% --ac wash and a 4px inset --ac left bar (globals.css:7979-7985);
      - qty "2" as a solid --ac chip, 44×44 radius 10, #130d1e ink, 28px 800 (a multiple lights,
        globals.css:8065-8069);
      - "အုန်းနို့ခေါက်ဆွဲ" (Padauk 700 30px lh 1.6) over "Ohno Khao-Swe" (Hanken 800 21px, --tx);
      - the tag "ချက်နေဆဲ" at 13px 700 --ac;
      - a 48×56 ⋯ ghost behind a 1px --bd hairline.
    - **Bump:** margin 10, 64px tall, radius 12, --ok #5fb07e, #130d1e ink. "အားလုံး ပြီးပြီ" (Padauk
      700 24px) is stacked over "All done" (Hanken 800 16px), with a 22px ✓ beside them.
  - **c2 x351.5–677 · Table 4, ROUND 1, 369px tall (y159–528), drawn EXACTLY as today:**
    - **Strip:** AMBER #67534e. "စားပွဲ 4", then "9:12" over "ဆိုင်မှာ စား" (--tx).
    - **No stub, no flash, no new row.** It never changes because round 2 arrived.
    - **Rows:**
      - "2" solid · "မုန့်ဟင်းခါး" / "Mohinga", STARTED (wash + bar + "ချက်နေဆဲ");
      - "1" in a quiet 2px --bd ring · "ရှမ်းခေါက်ဆွဲ" / "Shan Noodles", fired.
    - **Bump** as c1.
  - **c3 x689–1014.5 · Table 9, 252px tall (y159–411):**
    - calm --sf strip; "6:40" over "ဆိုင်မှာ စား" (--t2);
    - "1" ring · "လက်ဖက်သုပ်" / "Pickled Tea Salad";
    - bump.
  - **c4 x1026.5–1352 · Table 11, 252px tall:**
    - calm strip; "3:15";
    - "1" ring · "ကြက်သားဟင်း" / "Chicken Curry";
    - bump.

  **ROW 2 (y540–939):**

  - **c1 x14–339.5 · Table 4, ROUND 2, 399px tall (y540–939).** It sits DIRECTLY beneath the late
    Table 2, only because it is the fifth card oldest-first. Its placement is never forced.
    - **Strip, 123px (y541–664), calm --sf #211a30, padding 10px 14px.** It is a two-row header with a
      row gap of 8:
      - **Row A, 51px (y551–602):** "စားပွဲ 4" (Padauk 700 32px; "4" Hanken 800, `lang="en"`) on the
        left. On the right, "0:04" (24px 800 tabular) over "ဆိုင်မှာ စား" (15px 700 --t2).
      - **Row B, 44px (y610–654): THE ROUND STUB** at x28, about 112px wide, reading
        "အလှည့် 2".
        - Fill #3e3748, with a 2px #bcafc8 outline on the top, left and bottom.
        - The right edge is a 4px dotted #bcafc8 perforation.
        - Radius 10px 0 0 10px. The text is "အလှည့်" in Padauk 700 24px plus "2" in Hanken 800 24px,
          all --tx #f3ecdf.
        - The rest of row B is plain strip.
    - **Rows:**
      - "2" solid --ac chip · "လက်ဖက်ရည်" / "Burmese Milk Tea", fired;
      - "1" ring · "အုန်းနို့သာကူ" / "Coconut Sago", fired.
    - **Bump** (y855–919 inside its 10px margins): "အားလုံး ပြီးပြီ" / "All done" ✓. It carries ONLY
      these two line ids.

- **y939–1010:** empty ground. There is no recall footer (nothing to bring back) and no undo pill.

**The read Mom gets from 1–2 m:**

1. The red strip and the --warn "1" in the head say late, in colour and in motion.
2. The stub says "Table 4 is ordering again". It is in shape and word, never in colour.
3. Round 2's own green clock "0:04" says it is not late. Today, the same tea would sit inside Table
   4's amber 9:12 card with no flash and no chime.

### STATES (not drawn; for the build)

- **The arrival instant (0:00–0:01):**
  - `.kds-flash` plays on round 2 only: a 3px inset --gold #f4c879 ring fading to a 9px halo over
    1.4s, aria-hidden (globals.css:8293-8317).
  - The dine-in chime plays once for the wave (KdsBoard.tsx:519-523). Open goes from 4 to 5.
  - Round 1 does NOT flash. The flash means "new work landed" (KdsBoard.tsx:509), and nothing landed
    on round 1.
- **In grace (the first 10 s after the Send):** round 2 is not on the board (kdsLineGate,
  counter-order.ts:221-225). The diner can still Undo, and an undone Send clears its `fire_batch`
  (m261_undo_fire_cart_lock.sql:51), so it is never counted.
- **The round number cannot be read (the advisory read failed or saturated):**
  - If an OLDER card of the same `sessionId` is on the board right now, the stub reads
    **"နောက်တစ်လှည့်"** with no number. The main read proves this (kitchen.ts:359).
  - Otherwise there is NO stub. An unknown number is never drawn as a number, and never as a "1".
- **The stub is decided ONCE, when the card first lands, and never added or removed afterwards.**
  - Its words may sharpen ("နောက်တစ်လှည့်" → "အလှည့် 2") but never blur.
  - A number once drawn on a card is frozen for that card's life on this board, so a later merge or
    void can never renumber a card Mom has already read.
  - The card never changes size because of another card.
- **A single-round card** (most tickets) is byte-identical to today.
- **Station filter:** each card filters by line as built. The stub renders on any visible round ≥2
  card, whatever the filter.
- **A held (dashed) card** never wears a stub. The dashed vocabulary stays alone.
- **Text dial:** at M/L the stub follows --kfs-clock (28/32px) and the strip grows (about
  10 + 57.6 + 8 + 50 + 10 at M). The 3-column cards (438px) give the stub room. Text never shrinks.
- **English device:** "Table 4" over "Round 2". The badge reads "Dine-in".
- **A counter (`reg-`) order that sends twice:** "Walk-up" plus the stub "အလှည့် 2", with the
  unchanged Unpaid line beneath the strip.
- **Make-it-now to-go lines and settlement food are their own numbered round cards.**
  - Every make-it-now to-go line gets its own `fire_batch` (s4_fire_routing.sql:52;
    m100_mode_authority.sql:205).
  - Food fired at settlement gets one batch (s4_fire_routing.sql:74).
  - Both are true, and both are new to Mom (judges' graft 4).
- **Degraded / outage:** a frozen board, as built. Stubs freeze with the snapshot.

### COPY (English): as an English device renders it

- Kitchen
- All · Wok · Cold · Drinks
- 5 · Open
- 1 · Late
- 5 open tickets
- Dish totals
- Table 2 · 13:05 · Late · Dine-in
- Table 4 · 9:12 · Dine-in
- Table 9 · 6:40 · Dine-in
- Table 11 · 3:15 · Dine-in
- Table 4 · 0:04 · Dine-in
- **Round 2** (NEW key `kds.round`: "Round {n}")
- Cooking
- All done
- 2 · Ohno Khao-Swe
- 2 · Mohinga
- 1 · Shan Noodles
- 1 · Pickled Tea Salad
- 1 · Chicken Curry
- 2 · Burmese Milk Tea
- 1 · Coconut Sago
- Unknown-number fallback: **Next round** (NEW `kds.round.next`)

### COPY (Burmese): shipped strings or the brief's drafts only

| Visible text                                                                                            | Source                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| မီးဖိုချောင်                                                                                            | `kds.title`, staff.ts:151 (owner-verified)                                                                                                                      |
| ဖွင့်ထား                                                                                                | `kds.stat.open`, staff.ts:195                                                                                                                                   |
| နောက်ကျ                                                                                                 | `kds.stat.late`, staff.ts:196 (K15-HIGH)                                                                                                                        |
| ဖွင့်ထားတဲ့ အော်ဒါ 5 ခု                                                                                 | `kds.open.many`, staff.ts:200                                                                                                                                   |
| စုစုပေါင်း                                                                                              | `kds.allday.chip`, staff.ts:205                                                                                                                                 |
| စားပွဲ 2 / 4 / 9 / 11                                                                                   | `kds.table`, staff.ts:170                                                                                                                                       |
| ဆိုင်မှာ စား                                                                                            | `kds.channel.dinein`, staff.ts:164                                                                                                                              |
| နောက်ကျ · ဆိုင်မှာ စား                                                                                  | the badge = `kds.stat.late` + " · " + channel (kds-urgency.ts:74-77; KdsBoard.tsx:1709-1711)                                                                    |
| ချက်နေဆဲ                                                                                                | `kds.line.cooking`, staff.ts:187                                                                                                                                |
| အားလုံး ပြီးပြီ                                                                                         | `kds.bump`, staff.ts:179 (K15-HIGH)                                                                                                                             |
| အုန်းနို့ခေါက်ဆွဲ · မုန့်ဟင်းခါး · ရှမ်းခေါက်ဆွဲ · လက်ဖက်သုပ် · ကြက်သားဟင်း · လက်ဖက်ရည် · အုန်းနို့သာကူ | the catalog's `name_my` (MENU_REFERENCE.md:29, :27, :31, :139, :73, :156, :147)                                                                                 |
| **အလှည့် 2**                                                                                            | DRAFT `kds.round` "အလှည့် {n}". The brief's m5 glance and quiet drafts (K15 · kitchen-ops), grounded in the diner strip's နောက်တစ်လှည့် (TableTimeline.tsx:137) |
| **နောက်တစ်လှည့်** (fallback only)                                                                       | DRAFT `kds.round.next`. The brief's m5 guided draft; the word is shipped inside TableTimeline.tsx:137                                                           |

### A11Y

- **One live region:** the head's `<p role="status">` (KdsBoard.tsx:1194-1230). On arrival it says
  only the new count, "ဖွင့်ထားတဲ့ အော်ဒါ 5 ခု", as built. Nothing else is announced, and no
  aria-live is added anywhere.
- **The grid** is `<ul role="list">` named "ဖွင့်ထားတဲ့ မီးဖိုချောင် အော်ဒါများ" / "Open kitchen tickets"
  (`kds.a11y.tickets`, staff.ts:333).
- **Card names** (`<li aria-label>`, composed as KdsBoard.tsx:1685 does, in the device language):
  - Table 2: "စားပွဲ 2 — ဆိုင်မှာ စား, နောက်ကျ" / "Table 2 — Dine-in, Late".
  - Table 4, round 1: "စားပွဲ 4 · အလှည့် 1 — ဆိုင်မှာ စား" / "Table 4 · Round 1 — Dine-in".
    - Its NAME gains the round while a sibling is live, so two Table 4 cards are never announced
      identically. Its FACE does not change.
  - Table 4, round 2: "စားပွဲ 4 · အလှည့် 2 — ဆိုင်မှာ စား" / "Table 4 · Round 2 — Dine-in".
- **Line lists** are named "စားပွဲ 4 · အလှည့် 2 အတွက် ပစ္စည်းများ" / "Items for Table 4 · Round 2"
  (`kds.a11y.lines`, staff.ts:334).
- **The bump's name** is composed by `al(kind:"bump")` (staff-labels.ts:260-263): "All done — Table
  4 · Round 2, all 2 items done" / the MY of `kds.bump.what` (staff.ts:182).
- **The stub** is a `<p>`, never focusable, never a control. Its words are read in order inside the
  card, and the card's name already carries the round.
  - Colour never carries the round alone: the round is a word plus a shape.
  - Late keeps its word (the badge and the name) as well as its colour (WCAG 1.4.1, §34).
- **Targets are unchanged:** dish rows ≥56px, ⋯ 48×56, bump 64px. This screen adds no interactive
  element.
- **Burmese** is `lang="my"`, Padauk 700 (never 800), lh 1.6, letter-spacing normal, font-synthesis
  none, ≥13px. Latin digits are wrapped `lang="en"` (Chrome.tsx:35-38).
- **Reduced motion:** the flash and the red pulse are already off (globals.css:8531-8536). The stub
  adds no motion. Under reduced motion, red is still told apart from amber by its "နောက်ကျ" word.
- **Focus:** nothing moves focus on arrival.

### CODE CHECK (claims this screen depends on)

- **Today the ticket IS the cart.**
  - `ticketByCart` keys by `cart_id` (kitchen.ts:307, :347-371), and its age is the first line's
    fire (:369).
  - Dine-in has one open cart per session (cart_concurrency.sql:31-32 `qr_carts_one_open_per_session`).
  - So a second Send appends to round 1's card today. The design depends on re-keying, which is a
    build item, not a shipped fact.
- **`fire_batch` exists** (s2_polish.sql:9). Every send stamps one (cart.ts:297; mms_fire_cart). It is
  NOT in the live-line select yet (kitchen.ts:178 lists no `fire_batch`), so it must be added.
- **`sessionId` is already on every ticket** (kitchen.ts:359; kitchen-types.ts:62). The fallback
  word and the "still has a card" line need no new read.
- **The arrival diff, flash and chime are keyed by `cartId`** (KdsBoard.tsx:511-525, :1323, :1327).
  They must move to the ticket key for round 2 to flash and chime at all.
- **Late:**
  - one predicate, `kdsTicketLevel`, with thresholds 8/12 (kds-urgency.ts:14-20, :44-50);
  - the badge lead (kds-urgency.ts:74-77);
  - the Late count (kds-urgency.ts:53-63; KdsBoard.tsx:651);
  - the red pulse 1.6s (globals.css:7912-7923);
  - Late stat colour --warn (globals.css:7764-7766).
- **The tinted-strip ink promotion the stub outline reuses:** globals.css:7938-7941 and :7961-7964.
- **The quantity chip lights only a multiple** (globals.css:8050-8069; KdsBoard.tsx:1892).
- **The started wash and bar:** globals.css:7979-7985.
- **The text tiers and the dial:** globals.css:7701-7713, :10687-10708.
- **Grace hides dine-in lines:** counter-order.ts:221-225. Un-fire clears the batch:
  m261_undo_fire_cart_lock.sql:51. A void keeps it: undo-miss.ts:23, :35.
- **The round NUMBER read does not exist.** It is new and advisory (see DECISIONS 9), and its
  failure falls back as above, never to `outage`.

---

## SCREEN picked-m5-2.dc.html: Mom served round 1; round 2 keeps its card, its clock and its stub; the pill names the round and says what is still out

- **Device:** tablet 1366×1024, landscape.
- **Theme:** Night, forced.
- **When:** 7:48:46 PM, 46 s after screen 1.
  - Mom tapped "အားလုံး ပြီးပြီ" on Table 4's round 1 two seconds ago. This is second 2 of the 6 s
    undo window.
  - The bump sent ONLY round 1's two line ids (Mohinga, Shan Noodles). The tea and the sago are
    untouched and NOT served.

### LAYOUT (top to bottom)

- **y0–68 · STAFF BAR:** unchanged (as screen 1).
- **y80–147 · HEAD:**
  - **Stats:** "4" over "ဖွင့်ထား", and "1" (--warn) over "နောက်ကျ".
  - **The ONE `role="status"` line, 15px --t2**, for its 4 s dwell (KdsBoard.tsx:605): "စားပွဲ 4 ·
    အလှည့် 1 အားလုံး ပြီးသွားပြီ — ပြန်ဖျက်လို့ ရသေးတယ်။ စားပွဲ 4 ရဲ့ ကတ်တစ်ခု ဘုတ်ပေါ်မှာ ကျန်သေးတယ်။"
    It then yields back to the count, "ဖွင့်ထားတဲ့ အော်ဒါ 4 ခု".
  - The "စုစုပေါင်း" chip at the right.
- **y159 on · GRID**, reflowed oldest-first as every bump does today:
  - **c1 x14 · Table 2, still LATE:** red #7e4f4c, "13:51", "နောက်ကျ · ဆိုင်မှာ စား". The same
    Ohno Khao-Swe row, started. 274px.
  - **c2 x351.5 · Table 9:** calm, "7:26" (still under amber's 8:00), Pickled Tea Salad. 252px.
  - **c3 x689 · Table 11:** calm, "4:01", Chicken Curry. 252px.
  - **c4 x1026.5–1352 · Table 4, ROUND 2, 399px (y159–558):**
    - **Byte-identical to screen 1 except its clock ("0:50") and its position.** It is the same
      123px strip with the same stub "အလှည့် 2" and the same two fired rows (Milk Tea ×2, Sago ×1).
    - Nothing on the card says round 1 left: no pip, no tick, no reflow inside the card. A card never
      changes because another card left.
    - Its own bump still serves only its own two ids.
  - Row 2 is empty ground.
- **y958–1010 · RECALL FOOTER (`.kds-recall`, role=group)**, in flow at the root's foot, a flex row
  with gap 8:
  - **Label:** "ပြန်ယူ" at 15px, Padauk 700, --t2.
  - **ONE chip** (`.kds-recall-btn`, globals.css:8458-8470), at x≈72 and about 200px wide:
    - 48px tall, radius 12, a 1px DASHED --bd border, --sf #211a30 fill, --tx 15px 700;
    - a 16px undo glyph, then "စားပွဲ 4 · အလှည့် 1".
  - The chip names the round because Table 4 had another card live at the moment of the bump.
- **y940–1008 · UNDO PILL (`.kds-undo`, globals.css:8472-8502)**, fixed, centred at x683, bottom
  16px + safe area. It is clear of the chip, which ends at about x272.
  - **Pill:** radius 999, padding 10px 12px 10px 18px, gap 12, background --tx #f3ecdf, ink --pg
    #100c19, --sh-md.
  - **Text column (two lines, 68px pill):**
    - line 1, Padauk 700 15px lh 1.6: "စားပွဲ 4 · အလှည့် 1 အားလုံး ပြီးသွားပြီ";
    - line 2 (NEW), Padauk **400** 15px lh 1.6, same --pg ink: "စားပွဲ 4 ရဲ့ ကတ်တစ်ခု ဘုတ်ပေါ်မှာ
      ကျန်သေးတယ်။".
  - **Button, at right, vertically centred:** "ပြန်ဖျက်", 44px pill, padding 0 16px, --ac #e7a53a,
    #130d1e ink, 15px (Padauk 700).
  - **There is no drain bar and no 64px xl button.** Those are F21's, and F21 is not shipped (see
    A11Y).
  - The pill is today's shape and today's colour, and it is now the ONLY cream object on the board.
    The stub is no longer a cream slab, so the same look never means two things.

### STATES (not drawn; for the build)

- **Undo within 6 s:**
  - It calls `mms_recall_ticket(cart, [round 1's two ids])` (w3_kitchen.sql:215-229).
  - Round 1 returns as its own card at its own age. Its lines come back as "ချက်နေဆဲ", because
    recall restores `in_progress` (:219-221). The card is still plain, with no stub.
  - Round 2 is untouched.
  - The pill and THIS chip clear by ticket key, never by cart.
  - The region says "စားပွဲ 4 · အလှည့် 1 ဘုတ်ပေါ် ပြန်တင်ပြီးပြီ။".
- **From 6 s to 2 min:** the pill leaves (KdsBoard.tsx:400) and the chip stays. A tap does the same
  recall.
- **After 2 min:** the chip expires on the client mirror. A late tap gets the server's "စားပွဲ 4 ·
  အလှည့် 1 ကို ပြန်ယူဖို့ နောက်ကျသွားပြီ။" (w3_kitchen.sql:229).
- **Line 2 is shown only while it is true.** It is recomputed from each snapshot: some other card on
  the board shares round 1's `sessionId`, held cards included.
  - If round 2 is bumped on another tablet inside the 6 s, line 2 drops on the next snapshot and the
    pill shrinks back to one line.
  - The live sentence is one-shot, so it is never re-said.
- **Round 2 bumped next, inside 6 s:**
  - The pill shows "စားပွဲ 4 · အလှည့် 2 အားလုံး ပြီးသွားပြီ" with no line 2, because no Table 4
    card is left.
  - The rail holds both chips, told apart ("… · အလှည့် 1" and "… · အလှည့် 2"). Today both chips would
    read "စားပွဲ 4".
- **An 86 inside the bump's 6 s:** the K22 one-slot rule is unchanged (KdsBoard.tsx:777-785).
- **A single dish's Done (not drawn):**
  - It adds a dish chip to this rail and says one line in the region. It never takes the pill.
  - A dish chip never evicts a ticket chip.
  - See DECISIONS 15.
- **Waiting / couldn't confirm:** kitchenWrite's existing bounded lines go in the one region
  (KdsBoard.tsx:160-178).
- **Reload:** the pill and the rail are lost, as owner-accepted (P2ib / D7). Our own reload is held
  while either exists (KdsBoard.tsx:368-369).
- **No Day-0 surface changes code.** Dad's floor (floor-kitchen.ts:114-118 reads `served` +
  `bumped_at`) and the guest's strip (TableTimeline.tsx:109-112, `isNextRound`) both read the rows.
  Serving only round 1's ids makes them say "Next round’s with the kitchen" /
  "နောက်တစ်လှည့် မီးဖိုချောင်ထဲ ရောက်နေပါပြီ" (:120, :137) instead of the false "All served —
  enjoy!".

### COPY (English): as an English device renders it

- 4 · Open
- 1 · Late
- Live region: "Table 4 · Round 1 all done — undo available. Table 4 still has a card on the board."
  - `kds.live.bumped`, then NEW `kds.undo.stillOn`.
  - It then reads "4 open tickets".
- Pill line 1: "Table 4 · Round 1 all done" (`kds.undo.bumped`, x = the composed label).
- Pill line 2: "**Table 4 still has a card on the board.**" (NEW `kds.undo.stillOn`: "{t} still has a
  card on the board.").
- Undo
- Bring back
- Chip: "Table 4 · Round 1"
- Table 2 · 13:51 · Late · Dine-in
- Table 9 · 7:26
- Table 11 · 4:01
- Table 4 · 0:50 · Dine-in · Round 2
- State lines:
  - "Table 4 · Round 1 restored to the board."
  - "Too late to bring back Table 4 · Round 1."
  - "Couldn’t bring back Table 4 · Round 1 — try again."

### COPY (Burmese): shipped strings or the brief's drafts only

| Visible text                                                                                                                                 | Source                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| {x} အားလုံး ပြီးသွားပြီ → "စားပွဲ 4 · အလှည့် 1 အားလုံး ပြီးသွားပြီ"                                                                          | `kds.undo.bumped`, staff.ts:257. x = `kds.table` (:170) + " · " + DRAFT `kds.round` |
| {x} အားလုံး ပြီးသွားပြီ — ပြန်ဖျက်လို့ ရသေးတယ်။                                                                                              | `kds.live.bumped`, staff.ts:271-274                                                 |
| **{t} ရဲ့ ကတ်တစ်ခု ဘုတ်ပေါ်မှာ ကျန်သေးတယ်။** → "စားပွဲ 4 ရဲ့ ကတ်တစ်ခု ဘုတ်ပေါ်မှာ ကျန်သေးတယ်။"                                               | DRAFT `kds.undo.stillOn`, the brief's m5 guided screen 2 (K15 · kitchen-ops)        |
| ပြန်ဖျက်                                                                                                                                     | `kds.undo`, staff.ts:255 (K15-HIGH)                                                 |
| ပြန်ယူ                                                                                                                                       | `kds.recall`, staff.ts:254 (K15-HIGH)                                               |
| ဖွင့်ထား · နောက်ကျ · ဖွင့်ထားတဲ့ အော်ဒါ 4 ခု · စုစုပေါင်း · စားပွဲ {id} · ဆိုင်မှာ စား · နောက်ကျ · ဆိုင်မှာ စား · ချက်နေဆဲ · အားလုံး ပြီးပြီ | as screen 1                                                                         |
| အလှည့် 2 / အလှည့် 1                                                                                                                          | DRAFT `kds.round` (as screen 1)                                                     |
| {x} ဘုတ်ပေါ် ပြန်တင်ပြီးပြီ။                                                                                                                 | `kds.live.restored`, staff.ts:275                                                   |
| {x} ကို ပြန်ယူဖို့ နောက်ကျသွားပြီ။                                                                                                           | `kds.err.recall.window`, staff.ts:314-317                                           |
| {x} ကို ပြန်မယူနိုင်ပါ — ထပ်စမ်းပါ။                                                                                                          | `kds.err.recall`, staff.ts:303-306                                                  |
| ပြီးသွားတဲ့ အော်ဒါ ပြန်ယူ (the rail group's name)                                                                                            | `kds.a11y.recall`, staff.ts:346, unchanged on this screen                           |

### A11Y

- **ONE live region:** the head's `role="status"`. It says the bump sentence and the still-on
  sentence in the device language only, never as a pair (class D; KdsBoard.tsx:1196-1199), for 4 s.
  The pill is NOT a region: `.kds-undo` carries no role (KdsBoard.tsx:1545).
- **Focus:** the tapped bump unmounted with its card. The edge-triggered catch-all returns focus to
  the board heading (KdsBoard.tsx:608-616, :915). Nothing is focus-planted on the pill.
- **The Undo button's name** is `al(kind:"undo")` (staff-labels.ts:273-275): "ပြန်ဖျက် — စားပွဲ 4 ·
  အလှည့် 1" / "Undo — Table 4 · Round 1". It is 44px tall.
  - Busy is `aria-disabled` plus the 0.6 dim, never `disabled` (globals.css:8276-8283).
- **The rail group** is role=group, named `kds.a11y.recall` (KdsBoard.tsx:1480).
- **The chip's name** is `al(kind:"recall")` (staff-labels.ts:270-271): "ပြန်ယူ — စားပွဲ 4 · အလှည့်
  1" / "Bring back — Table 4 · Round 1". It is 48px tall and in tab order.
- **Contrast:** --pg on --tx in the pill measures 16.42:1 (computed). The Undo button is #130d1e on
  #e7a53a, as built.
- **The 6 s window.** Today it expires on the local clock whatever the focus (KdsBoard.tsx:400).
  - Lens rule 5's "holds while focused" is F21, which is OPEN (OPEN-ITEMS.md:624).
  - So nothing on this screen promises a hold: no drain bar, no copy about time.
  - This change either lands F21's hold or ships today's 6 s honestly. See OPEN RISKS.
- **Reduced motion:** the pill has no entrance animation added, and the reflow is as built.

### CODE CHECK (claims this screen depends on)

- **The bump sends exactly the card's displayed ids** (KdsBoard.tsx:1633-1636).
  `mms_bump_ticket(p_cart, p_lines)` serves only `id = any(p_lines)` on that cart, fired or
  in_progress, and past grace (w3_kitchen.sql:190-206). So once tickets are keyed per Send, round 1's
  All done cannot touch round 2. No RPC change is needed.
- **Recall restores only the given ids**, inside 2 minutes, to `in_progress` (w3_kitchen.sql:215-229).
- **The undo pill and the rail exist** with these exact words and names:
  - the pill (KdsBoard.tsx:1544-1565);
  - the rail (KdsBoard.tsx:1477-1509);
  - the last 5 entries (KdsBoard.tsx:776);
  - 6 s / 2 min (KdsBoard.tsx:77-78).
- **They are keyed by CART today:**
  - the recall success filter (KdsBoard.tsx:1070);
  - the undo clear (:1072);
  - the chip React key (:1495);
  - the held subject (:198, :1499, :1622).
  - With two Table 4 cards, recalling round 1 would wipe round 2's chip, and a waiting bump on round 1
    would refuse round 2's. All of these must move to the ticket key (OPEN RISKS 1).
- **The bump's label is `id.main`**, captured at tap time (KdsBoard.tsx:1634). It becomes "စားပွဲ 4 ·
  အလှည့် 1" only when the composed label carries the round. That makes `ticketId()` (KdsBoard.tsx:112-130)
  the one place the round enters a name.
- **"Still has a card" needs no new read.** The snapshot's tickets carry `sessionId`
  (kitchen.ts:359).
- **The notice dwell is 4 s** (KdsBoard.tsx:603-607).
- **The downstream truth:** floor-kitchen.ts:114-118; TableTimeline.tsx:109-112, :120, :137.

---

## DECISIONS

1. **Glanceable is the backbone** (owner answer 1: staff moments glanceable). One Send makes one
   card, keyed by `cart_id + fire_batch` (falling back to `fire_at` when the batch is null). Each card
   has its own clock, flash, chime and All done. This is m5-glance-1/2, evolved.
2. **The round reads "အလှည့် 2 / Round 2"** (owner default, moment 5). It is drawn as a perforated
   stub on its own strip row, the glance concept's shape language kept.
3. **The stub is never louder than Late** (owner default; judges on the Sheet; the concept's own
   fallback dial, risk 2).
   - The cream --tx slab retires for a 14% --tx wash, a 2px --t2 outline and a dotted perforation.
   - Its luminance is 0.042 against the red strip's 0.106, and the red strip is about 5× its area and
     pulses.
   - Late keeps the colour, the motion, the badge word and the --warn count.
4. **The stub speaks at --kfs-clock** (24/28/32), the tier of every card's own time. That is below
   the 32px table number and the 30px dish. It sits on its own row with the word before the digit.
   This answers the judges' digit-misread note (Sheet risk 3: "a '2' near 'စားပွဲ 4'").
5. **A card never changes because another card arrived or left, in size or in face** (judges' graft
   3, widened from "size" to "face").
   - Round 1 never grows a tab.
   - The stub is decided once, at first render. Its words may sharpen, never blur, and a drawn number
     is frozen.
   - Only the NAME of round 1 gains "· အလှည့် 1" while a sibling is live, for screen readers.
6. **The twin flash is retired** (judges on the Sheet). `.kds-flash` means "new work landed"
   (KdsBoard.tsx:509). Re-flashing an unchanged round 1 would tell Mom to look for food that is not
   there. Round 2 flashes and chimes alone.
7. **The pips are retired** (quiet's restraint; judges). "✓ = served" needs a heavier cross-cart read
   whose answer can shift. "○ = still on the board" is a mark that changes when another card leaves,
   which breaks decision 5. The one cross-card fact moves to the moment it matters: after a bump
   (decision 12).
8. **The find button is retired; the stub is a `<p>`** (quiet's restraint: no new control on a card).
   Round 1 is OLDER, so oldest-first sorting (kitchen.ts:374-381) puts it on or before the page Mom
   works. A jump that pages the board away under a wet finger is a mis-tap generator. This also
   drops the glance drafts `kds.round.show` and the dead-control rule.
9. **The round is counted per SESSION** (judges' graft 1).
   - **The ordinal** is the rank, by first `fire_at`, of this card's `fire_batch` among the session's
     batches on non-cancelled carts that have at least one line past grace (`fire_at <= now()`). The
     line's state does not matter.
   - **Voided lines still count.** A void keeps `fire_batch` (undo-miss.ts:23), so a number Mom has
     seen never shifts down.
   - **Undone Sends never count.** Un-fire clears the batch (m261:51), and they were never on the
     board.
   - **The read** is one advisory query, bounded to the sessions on the board and capped. It is
     folded into the existing Promise.all (kitchen.ts:221). A failure or saturation gives `n: null`,
     never `outage`.
   - **The logic** is a pure module (`ticketKey`, `roundOrdinal`, `stubFor`), added to verify:slice's
     mutate set. Its mutants:
     - key by cart only;
     - age from the cart's oldest line;
     - ordinal off by one;
     - unknown drawn as "1";
     - stub added after first render.
10. **Unknown number:** if an older card of the same session is live, the stub reads
    "နောက်တစ်လှည့်" with no number (judges' graft 6; the guest's own word, TableTimeline.tsx:137).
    Otherwise there is no stub (quiet: an unknown draws nothing).
11. **The undo pill and the rail chip name round 1** when a sibling is live at bump time ("စားပွဲ 4 ·
    အလှည့် 1"), so two Table 4 chips are told apart (judges' graft 2). The label is composed once, in
    `ticketId()`, and reused by the pill, the chip, the region, the bump's name and the refusals.
12. **Guided's spoken next step:** pill line 2 and one live sentence, "{t} still has a card on the
    board." It is shown only while true and computed from the snapshot's `sessionId` with no new read
    (judges' graft 5). It answers Dad's "where's the dish" before he asks.
13. **The stub has no English echo.** The KDS identity "စားပွဲ 4" has none (`Chrome` default
    `echo=false`, KdsBoard.tsx:119-120; the echo policy, Chrome.tsx:40-43). The round is part of
    identity, and both parents are Burmese-first. An English device reads "Round 2", and every name
    carries the round in the device language.
14. **The pill keeps today's cream `.kds-undo` and becomes the only cream object on the board**
    (judges: the Sheet's slab "repeats the .kds-undo bar's look, so the same shape means two
    things"). Line 2 is Padauk 400 (Padauk ships 400/700 only).
15. **A single dish's Done goes to the rail only, as a chip with no pill** (quiet's restraint;
    judges' note on the Clip and the Sheet: the most frequent tap at the pass must not take the one
    undo slot, KdsBoard.tsx:777-785).
    - The recall works with no SQL change: `mms_line_transition` stamps `bumped_at` on served
      (p2f_counter_cook_before_paid.sql:394), and recall takes ids.
    - A dish chip never evicts a ticket chip.
    - Words are the brief's quiet drafts:
      - `kds.live.lineDone`: "{x} done — it waits under Bring back for {m} minutes." / "{x} ပြီးပြီ —
        ပြန်ယူ အောက်မှာ {m} မိနစ် စောင့်နေပါမယ်။", with {m} taken from RECALL_MS;
      - the `kds.a11y.recall` re-word "Bring back a finished ticket or dish" / "ပြီးသွားတဲ့ အော်ဒါ
        ဒါမှမဟုတ် ဟင်း ပြန်ယူ".
16. **Help changes ONE sentence and gains no fifth card** (judges, lens rule 8: the smallest safe
    thing).
    - `help.how.kitchen.1.more` becomes "Every line on the ticket goes at once. A table’s next round
      comes as its own ticket." / "တစ်ကတ်ပေါ်က ဟင်းအားလုံး တစ်ပြိုင်နက် ထွက်သွားပါမယ်။ စားပွဲရဲ့ နောက်တစ်လှည့်က
      သူ့ကတ်နဲ့သူ သီးသန့် ရောက်လာပါမယ်။". This is the brief's quiet draft, and its first sentence is verbatim
      staff.ts:2514-2517.
    - `HELP_SHEET_REVISION.kitchen` stays 1 (help.ts:51), so the sheet never reopens itself mid-service.
17. **The undo hold is not drawn or promised.** F21 (the hold, the 64px xl button and the drain bar)
    is OPEN (OPEN-ITEMS.md:624). Today the pill expires on the local clock (KdsBoard.tsx:400). The
    design changes; the claim does not.
18. **Screen 1 is drawn at 0:04, after the 1.4s arrival flash.** The owner judges the steady state,
    where the Late strip and the stub sit one above the other in the same column. The arrival flash
    is existing behaviour and decides nothing here.
19. **Make-it-now to-go lines and settlement food become their own numbered round cards** (judges'
    graft 4; s4_fire_routing.sql:52, :74; m100_mode_authority.sql:205). This is true, but new to Mom,
    so it goes in HANDOFF and the Day-0 watch list.
20. **Day-0 checks** (judges' grafts 7 and 8):
    - After one bump, Dad's floor card and the guest's strip must both read true.
    - The measuring SELECT on prod after deploy must return 0 rows: any `cart_id`, `bumped_at` pair
      where `state='served'`, `bumped_at >= deploy`, and more than one distinct `fire_batch` was
      served in one bump.
    - This passes PILOT_PLAN.md:143's watch item "the second round lands as a second ticket, not an
      edit".

## OPEN RISKS

1. **The re-key must be total.** Every `cartId`-keyed structure moves to the ticket key in ONE
   change, or the bug returns in a new shape:
   - the React key (KdsBoard.tsx:1323);
   - prevLive and added (:511-512);
   - pulses (:516, :1327);
   - re-chime timers (:583, :592, :597–599);
   - `say` subjects (`cartKey`, :198, :1622): a waiting bump on round 1 would refuse round 2's bump;
   - the recall success filter (:1070): recalling round 1 would wipe round 2's chip;
   - the undo clear (:1072);
   - rail chip keys (:1495) and held checks (:1499);
   - the slot id (:1726).

   Coordinate the re-chime change with K42 (kitchen-ops package 1).

2. **Open now counts Sends, not tables.** Paging ("+N more") comes sooner at 8 per page on S. That is
   the honest load. Count the pages at a three-table rush on Day 0.
3. **The words are unverified drafts.** "အလှည့် {n}", the fallback "နောက်တစ်လှည့်" (as a standalone
   label), "{t} ရဲ့ ကတ်တစ်ခု ဘုတ်ပေါ်မှာ ကျန်သေးတယ်။", the line-Done line, the recall re-word and the Help
   re-word are all K15 · kitchen-ops drafts awaiting Min's native pass. The brief's alternatives for
   the round word were "ထပ်မှာ {n}" and "ဒုတိယ အကြိမ်".
4. **A merge carries its batches.** The merge moves the source's lines onto the target cart
   (m109_merge_matches_mode.sql:262-263), so a merged table counts both tables' Sends. A merged
   party's next Send can read "အလှည့် 4". Numbers already drawn are frozen (decision 5), so nothing on
   screen renumbers, but the next stub can surprise. Watch it in the merge rehearsal.
5. **One more advisory read per poll** (carts by session, then their batched lines). It is bounded,
   capped and never `outage`. Measure the poll's added latency on the real tablet, because the board
   polls every 5 s (KdsBoard.tsx:563).
6. **A new contrast bound** belongs in composite-contrast.test.ts: --tx on the stub's wash over the
   red strip at its 1.22 pulse peak is 3.34:1, against a 3:1 large-text floor. The --tx outline there
   is 4.25:1. A future wash above 14% or a pulse above 1.22 drops it under 3:1. Red-first it.
7. **The two-line pill is 68px tall and fixed at the bottom centre.**
   - At L (19px meta) with 5 rail chips, the rail can run under the pill. That risk exists today with
     a one-line pill, and grows here.
   - Measure at 1366×1024 and 1366×768, every size. If they collide, the rail gets a
     right-side inset equal to the pill's width while the pill shows.
8. **F21 is not shipped,** so lens rule 5 ("a 6 s Undo holds while focused") is unmet on this board
   today. Decide whether this change lands F21's hold or waits for it. Either way the copy promises no
   hold.
9. **"Still has a card" counts the whole snapshot, held cards included, not the station-filtered
   view.** With "Drinks" selected, the line can name a Table 4 card Mom's filter hides. It is true of
   the board, and it is the kitchen's truth, but say so in Help if Day 0 shows confusion. It also
   compares `sessionId`, so a NEW party seated at Table 4 never counts as "still" there: the
   conservative direction.
10. **No OPEN-ITEMS row exists for this moment.** K46 is taken (DONE, #315). File the next free K id
    (measure it, never assume K47) as **high**, plus a K15 · kitchen-ops ledger row for the drafts.
11. **The stub's dotted perforation must stay round dots on the real iPad Safari / Chrome builds.**
    A square-dot rendering at 4px reads closer to dashed (the held vocabulary). Confirm at the pass
    during P2bw's real-room look. The fallback is a column of 4px round `radial-gradient` holes, the
    same shape with no border style involved.

---

## Appendix — what changed after this spec (applied in the drawn screens)

The spec above was written first. Two later passes changed it, and the screens on the canvas were drawn
with both applied. **Where an item below contradicts the spec above, the item below wins.**

### A · System amendments (the cross-moment consistency pass)

1. Reserve a distinct shape for kitchen-ops' 'Table N left — stop cooking' card (from m7): struck dish rows plus the warn word, ALARM tier, with no pulse (Late keeps the only motion). It is never a stub, never dashed and never cream, and it stays until 'Got it'. The board's four marks (Late strip, held dashed, round stub, stop card) then never overlap.
2. K15 sheet: the console's Send undo (table.send.undo) uses ပြန်ယူ, which this board uses for 'Bring back' (kds.recall). Re-word it to ပြန်ဖျက် at the native sitting, so Undo and Bring back are never one word on the family's screens.
3. The owner default reads 'အလှည့် 2 / Round 2'. Both mode draws the stub Burmese-only under the KDS identity rule. Confirm that reading at the ruling-#12 sitting rather than adding an echo that would widen the stub.

### B · The adversarial critic's blocking fixes (verdict: fix)

1. **Amendment not taken: the m7 'Table N left — stop cooking' card has no place in this board's mark grammar. The spec's 'decided once' rule even forbids the precedence the amendment needs.**
   - Evidence: picked-m5.md never mentions a stop card. Grepping it for 'stop cooking', 'left —' and 'Got it' returns nothing. Its only precedence rule is ':273 A held (dashed) card never wears a stub'. :265-269 say 'The stub is decided ONCE … and never added or removed afterwards'. picked-m7.md:643-644 and :899 put the struck 'Left — stop cooking' ticket IN ITS SLOT until 'Got it'. When Table 4 is cleared with round 1 and round 2 live, each per-Send card becomes a stop card. Under :265 round 2 would keep its stub, so the stop card and the round stub overlap, which the amendment forbids. The spec also does not say whether the stop card is excluded from 'still has a card' (:455-456 counts every card sharing the sessionId), from Open or from Late.
   - Fix: Add a STATES bullet and a DECISION. When a per-Send card becomes the stop card, it is drawn ONLY as that card: struck dish rows plus the warn word, ALARM tier, no red pulse even if it was Late, never a stub, never dashed, never cream, and it stays until 'Got it'. Its round stub is dropped. This is the one stated exception to 'never removed', and it is the one place the four marks (Late strip, held dashed, round stub, stop card) give way, so they never overlap. Also exclude stop cards from pill line 2 / kds.undo.stillOn. A table that left has nothing 'still' to cook. State what Open and Late count for them.
2. **Amendment not taken: the K15 re-word of the console's Send undo (ပြန်ယူ → ပြန်ဖျက်) is missing. The spec teaches ပြန်ယူ = Bring back while Dad's console still reads ပြန်ယူ = Undo, and it claims the family already reads these words one way.**
   - Evidence: picked-m5.md:31-32 says 'Every visible word is a word Mom already reads on this console (… ပြန်ဖျက် · ပြန်ယူ)'. :510 and :529-530 make ပြန်ယူ the rail label and the chip name 'ပြန်ယူ — စားပွဲ 4 · အလှည့် 1'. But apps/qr/lib/i18n/staff.ts:2705 has "table.send.undo": { en: "Undo", my: "ပြန်ယူ" }. Its siblings use the same root: :2707 table.send.undoing 'ပြန်ယူနေပါတယ်…' and :2718 table.send.undone 'ပြန်ယူပြီးပြီ — …'. OPEN RISKS 3 (:688-691) lists the K15 drafts and omits this re-word.
   - Fix: Add a K15 · kitchen-ops ledger row for the native sitting. Re-word table.send.undo to ပြန်ဖျက် and carry its siblings (table.send.undoing, table.send.undone) so the act keeps one word. Note for the sitting that staff.ts:2698-2699 records the owner chose ပြန်ယူ there because ဖျက် shares a root with the Void beside it; that is the question to put to Mom and Dad. Correct the :31-32 claim until the re-word lands.
3. **Amendment not taken: the Burmese-only stub in Both mode is ruled in DECISION 13, but it is not routed to the ruling-#12 device sitting for confirmation.**
   - Evidence: picked-m5.md:628-631 (decision 13) draws 'အလှည့် 2' with no echo. OPEN RISKS 3 (:688-691) sends the words only to 'Min's native pass'. Nothing names the #12 sitting. docs/OWNER_RULINGS_2026-10-07.md:59 (#12) is the ~20-minute device sitting with Mom and Dad, where this reading must be confirmed instead of adding an echo that widens the stub.
   - Fix: Add to OPEN RISKS and to the #12 sitting checklist that Mom and Dad read the Burmese-only 'အလှည့် 2' stub at the pass in Both mode (owner default 'အလှည့် 2 / Round 2'). Confirm the reading there. No echo is added unless that sitting overrules it.
4. **The stub breaks the MARK tier (a fill), and the owner default 'never louder than a Late ticket' is shown only for the calm strip. On an amber strip the stub is brighter than the Late strip, by the spec's own metric.**
   - Evidence: The amendment's ladder: '3 MARK (glyph + word, no fill, no motion): … round stub'. Spec :112-113 fills the stub with color-mix(in srgb, var(--tx) 14%, transparent). The loudness case (:138-139, decision 3 :577-580) compares only the CALM stub (L 0.042) with the red strip (0.106). Recomputed with globals.css:7906-7911 mixes (scratchpad m5crit.py): the stub on an amber strip is L 0.151 and on a red strip L 0.160. Both are brighter than the Late strip at rest (0.106), and the amber case sits beside a Late card exactly as on screen 1. The wash also lowers text contrast: --tx on the stub is 4.45:1 (amber) and 4.26:1 (red), against 6.10:1 and 5.74:1 for --tx directly on those strips with no wash.
   - Fix: Drop the wash. Draw the stub as outline plus word only: 2px --t2 on calm, --tx on amber/red via the existing promotion, then the perforated edge. Re-run the luminance and contrast table for calm, amber, red and the red pulse peak (filter applied to text and ground). Put the 'not louder than the Late strip' and ≥3:1 bounds in composite-contrast.test.ts, red-first.
5. **The stub's shape is not the shared stub mark: it has no 12px coupon notches.**
   - Evidence: Amendment: 'A DOTTED perforation with 12px coupon notches is a pass or stub' (same shape on every surface). Spec :106-113 and :229-233 give radius 10px 0 0 10px, a 2px outline on three sides and 'border-right 4px DOTTED', with no notches. Risk 11 (:717-720) even proposes a radial-gradient fallback without them.
   - Fix: Draw the stub with the shared perforation: the dotted edge plus 12px coupon notches at its ends, the same geometry as the CounterPass/stub primitive, so Mom learns one stub shape across the console. Keep it dotted (never dashed) as the spec already argues (:55-56).
6. **Promise the code cannot keep: the single-dish Done sentence promises the dish 'waits under Bring back for {m} minutes', but the rail is capped and no dish capacity is defined. A dish chip can be refused or evicted, leaving that Done unrecoverable from the board (brief binding rule SPEC-KDS §4 / O-E).**
   - Evidence: Spec :466-469: 'It adds a dish chip to this rail … A dish chip never evicts a ticket chip.' Decision 15 (:641-643): kds.live.lineDone '{x} done — it waits under Bring back for {m} minutes.' / '… ပြန်ယူ အောက်မှာ {m} မိနစ် စောင့်နေပါမယ်။'. Spec :549 keeps 'the last 5 entries (KdsBoard.tsx:776)', and KdsBoard.tsx:776 does setRecall(prev => [entry, ...prev].slice(0, 5)). With 5 ticket chips on the rail, a dish chip cannot enter without evicting a ticket chip, so the sentence is false. Under any count cap, the next dish Done evicts an earlier dish chip before its 2 minutes. The quiet concept's 5-ticket + 5-dish capacity (m5.json 'CAPACITY') was dropped, and even that breaks the promise on the 6th dish.
   - Fix: Define capacity so the sentence is true. Recommended: dish chips are never count-evicted inside their 2-minute life; each leaves at its own RECALL_MS mark, and the rail scrolls sideways as built (.kds-recall overflow-x / overscroll-behavior-x: contain, globals.css:~8455). Re-measure risk 7 (the rail running under the pill). Otherwise drop '{m} minutes' from kds.live.lineDone and state the eviction order.
7. **Wrong citations: three cited function bodies are superseded by later migrations.**
   - Evidence: Spec :190-206 / :542-544 cite w3_kitchen.sql:190-206 for mms_bump_ticket. The live definition is 20261001000000_p2f_counter_cook_before_paid.sql:413-431, which adds a row lock (:417) and admits NULL fire_at: '(ci.fire_at is null or ci.fire_at <= now())' (:428). The spec's 'past grace' therefore misstates it. Spec :282 and :659 cite s4_fire_routing.sql:74 for settlement food; mms_fire_pending_food is redefined at 20260716000000_w3_kitchen.sql:120-139 (batch stamped :128, mode gate removed). s4_fire_routing.sql:52 is superseded by m100_mode_authority.sql:186-218, which the spec also cites.
   - Fix: Re-point the citations to p2f_counter_cook_before_paid.sql:413-431, w3_kitchen.sql:120-139 and m100_mode_authority.sql:205. Restate the bump claim as 'fired or in_progress, past grace or with no fire_at'. Re-check the ticket-key fallback in DECISION 1 against NULL fire_at (see suggestions).

### C · The critic's suggestions (not blocking; take them where the build agrees)

- Lens rule 5 (brief binding: 'a 6 s Undo holds while focused', F21) is left as an either/or (A11Y :533-536, decision 17, risk 8). Pick one. Landing the focus/pointer hold at KdsBoard.tsx:400 is the safer choice now that the pill carries two lines of Burmese to read inside a window that does not hold.
- Pill line 2 is Padauk 400 (:433, decision 14), but the spec's own A11Y says 'Padauk 700 (never 800)' (:352), and every other KDS chrome word at --kfs-meta is 700. Set it in 700 and de-emphasise it some other way, or justify 400 at the pass.
- 'No fact is marked twice on one screen': for 4 s the head's visible status line and pill line 2 show the identical still-on sentence (:404-405, :432-434). Consider keeping the sentence in the live region and the pill only, with the head line stopping at the bump sentence, or the reverse.
- Line 2 can drop mid-window (:457-458). The pill is centred (globals.css:8476-8477 left:50%/translateX(-50%)), so a width change slides the Undo button under Mom's finger, the same mis-tap class decision 8 rejects. Freeze line 2 for the pill's 6 s life (it is one-shot in the region anyway), or reserve its width.
- Ticket-key fallback (decision 1: 'falling back to fire_at when the batch is null'): build it on the RAW DB fire_at with a deterministic null bucket. Never use the shaped firedAt: kitchen.ts:341 sets firedAt = l.fire_at ?? nowIso, so a key on it would change every 5 s poll and re-flash and re-chime the card.
- The composed label under n:null is unspecified for the pill, chip and names (decision 11 only covers a known number). Say what round 1 and the 'နောက်တစ်လှည့်' card are called in the rail, so two Table 4 chips can still be told apart.
- Make-it-now to-go lines (one batch per line, m100:205) and settlement food all bump the session ordinal. A table's second real order can read 'အလှည့် 4' while the guest's strip says 'Next round'. Decide whether those batches count toward the number, or measure it on Day 0 alongside risk 4.
- Spec :31-32 says the only new visible words are 'the round word and one sentence'. The new visible strings also include kds.round.next, kds.live.lineDone (shown in the head status line) and the Help re-word. Fix the claim so the K15 load is honest.
- kds.live.lineDone fires on the most frequent tap at the pass and replaces the open count in the head for 4 s each time with the same teaching sentence. Consider a shorter line after the first time in a session.
- Re-chime: a per-Send card whose lines are all still 'fired' re-chimes every rechimeSec (75 s, KdsBoard.tsx:580-593). Tea-only round cards that today were absorbed into a started card will now re-chime. Coordinate with K42 and count the extra chimes on Day 0.
- The new STAFF COLOURS text (gold = till only; green filled only where it just landed; accent fill = now/selected) contradicts shipped KDS marks this screen reuses: the --gold arrival flash (globals.css:8293-8317), the gold-mix amber strip (:7906-7908), the --ac qty chip and started wash (:8065-8069, :7979-7985) and the green bump fill. Record them as named shipped KDS exceptions so the vocabulary is not silently contradicted.
- The red-pulse contrast figure (3.34:1, :135) does not reproduce. With brightness(1.22) applied to both the text and the ground (filter is on the strip subtree), it measures 3.56:1; with the text unbrightened it is 3.03:1. Recompute when the wash is dropped. Without the wash, --tx on the red strip at the pulse peak is about 4.98:1.

### D · Round 3 (2026-10-07, under the owner's delegation) — these win over everything above

The owner delegated every open decision ("I trust you to apply world-class design-thinking best standards on
all open decisions") and added a live TV board, card / Apple Pay after the food is served, and animated step
guides. PATH_DESIGN_2026-10-07.md's round-3 section records the decisions (D1–D5) and the shared vocabulary.
The round-3 consistency pass gave this moment these changes:

1. D3: withdraw amendment 2 and fix B2 (re-wording the console Send undo to ပြန်ဖျက်).

- kds.undo stays ပြန်ဖျက်: it erases All done or Sold out.
- kds.recall stays ပြန်ယူ: it brings back what left.
- help.how.kitchen.2.more's re-word goes to the native sitting (D3(c)).
- The no-ဖျက် pin stays green.

2. Kitchen Track on the KDS:

- The board draws no track, because Mom's rows and taps are its source.
- Its words are the one stage keys: ချက်နေဆဲ on a started row, ထုတ်ပြီး on Served today.
- Its green All done is the --ok that turns every track green.
- Record that the started row's gold is Mom's selection idiom (the dish she has in hand), so no other surface paints Cooking gold.

3. UNDO_MS moves to lib/ as KDS_UNDO_MS. It is the ONE settle constant read by the undo pill, the TV's table TURN, the phone's door moment and m12's '6 seconds'.
4. Rounds:

- kds.round uses an identifier-class slot, so the KDS and the TV both draw 'အလှည့် 2' with a Latin digit (m9 risk 11).
- roundOrdinal counts only Sends that carry a dine-in line. Make-it-now to-go and settlement batches get their own card with their channel tag and no ordinal, so the room never reads 'Round 3' for a table's second order (m9 risk 4).
- roundOrdinal and ticketKey are pure and shared with board-tables.ts.

5. The stop card's button reuses help.done 'ရပြီ · Got it'. The card stays ALARM without motion and never reaches the wall.
6. Device sitting #12: drinks are bumped on Mom's board. A station that is never bumped pins a table on the wall and keeps the phone's door shut (D5 flip condition).

### E · Codex round 6 (2026-10-08) — these win over everything above

1. **The Bring-back fallback label is precise to the second, and a tie takes a stable discriminator.**
   When a card's round number is unknown (`n: null`), its chip, its undo pill and their accessible names
   fall back to the card's FIRST fire time to the second — "Table 4 · 7:42:05" / "စားပွဲ 4 · 7:42:05",
   Latin digits in the identifier face — not to the minute, because two Sends inside one minute
   would give two chips that both read "Table 4 · 7:42". If two cards on the board would still carry the
   same label (the same table, the same second), each also takes a stable card discriminator taken from
   its own card key (`ticketKey`): the first four hex characters of its `fire_batch`
   ("Table 4 · 7:42:05 · 3f2a"), or a fixed mark for the one per-cart no-batch bucket of PATH_DESIGN
   correction 3. Never its position on the rail or the board, and never a count: the same card reads
   the same label on every poll, on its chip and on its pill, and recalling one chip can never retitle
   the other. The label is still captured once at bump time (PATH_DESIGN correction 14), so it adds no
   new words and no new strings beyond the composed identifier.

### F · The blind pass on #320 (2026-10-08) — these win over everything above

1. **The fallback label covers all three card-key kinds, not two.** A card is keyed in one of three ways
   (Decision 1 and appendix C): by `cart_id + fire_batch`; by the raw `fire_at` when the batch is null;
   or as the cart's one bucket for lines with neither (PATH_DESIGN correction 3). E covered only the
   first and third. Read every kind from the RAW row, never from the shaped `firedAt`, which is the poll
   clock for a line with no `fire_at` (`kitchen.ts:341`).
   - **The time** in "Table 4 · 7:42:05" is the card's earliest raw `fire_at`. The no-batch,
     no-fire-time bucket has no `fire_at`, so it uses its lines' earliest raw `created_at` (the board's
     read already filters on it, `kitchen.ts:186`; add it to the select if the select lacks it).
   - **The discriminator,** when two labels would tie:
     - the first four hex characters of `fire_batch` for a batch-keyed card;
     - otherwise the first four hex characters of a stable hash of the card's own key (its raw
       `fire_at`, or its cart's bucket key);
     - extended one character at a time while two cards on the board still tie.

   It is never the rail position and never a count, as E says.
