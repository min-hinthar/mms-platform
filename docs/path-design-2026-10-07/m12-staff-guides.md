# Picked m12: staff step guides. "Point and Call", designed

**Backbone: GLANCEABLE, taught GUIDED.** Staff moments are glanceable (owner pick 1), so each guide
teaches the console's own marks by their own words. Each guide is five short steps, and each step
is one card: a picture of the real control, the control's own word as the title, one sentence, and
one small motion. The counter guide (Dad, light) walks up the loudness ladder:

- CALM: the floor;
- MARK: the hollow ring;
- CALL: the ask tile;
- the gold till;
- dashed pending: the Undo.

The kitchen guide (Mom, Night) does the same:

- a card;
- MARK: the round stub;
- the two take-back words;
- ALARM: Late;
- ALARM without motion: the stop card.

The guides teach the ladder by walking it.

**The owner's words this answers (2026-10-07, verbatim):** "visual animated step guides for customers
and staff to get familiar with the new app." The computed task adds: first sign-in per role,
re-openable from Help, and never blocking service.

**Grafted from QUIET.** The guide appears only where nothing else is happening. It never covers live
work, it never comes back on its own, and nothing in it loops.

**Grafted from GLANCEABLE.** Every picture is the real control at its real size. Every title is the
word printed on that control, so the reflex it trains is "see the mark, say its word". The
pictures' motions are the board's own where it has one (the arrival flash, the red pulse).

---

## What changed from the brief, because a claim failed against the code

1. **"First sign-in per role" has no role to key on.** The roles are `server`, `manager` and `owner`
   (`supabase/migrations/20260621100000_staff_identity.sql:12`). There is no kitchen role and no
   counter role. The shipped Help door remembers a DEVICE, not a person: "Seen is a DEVICE fact"
   (`lib/help.ts:17-20`; `helpSeenKey`, `lib/help.ts:52-55`).
   - **Change:** the station is the role. Each guide offers itself once per **person, per station,
     per tablet**: the first time a signed-in account opens that station's screen on that tablet.
   - The seen key gains the staff id. Both pages already hold it (`app/staff/kitchen/page.tsx:20-24`,
     `app/staff/page.tsx:91-99`).
   - It stays a localStorage fact, so it needs no DDL, no column and no server write.
2. **The shipped first-run is a modal over live work.** Today the cards auto-open in the Help
   `Sheet` (`HelpButton.tsx:241-262`, `:496-511`). From 48em that is a centred 34rem dialog with a
   scrim (`globals.css:11314-11330`). A dialog that opens itself over a board with tickets on it
   blocks service.
   - **Change:** the first run lives in the screen's quiet space and is never modal.
     - **Counter:** the idle split pane, which shows "Pick a table" today (`TablePane.tsx:372-380`).
       The floor stays live and tappable beside it.
     - **Kitchen:** the empty board, where `EmptyState` sits today (`KdsBoard.tsx:1309-1318`).
   - The Sheet is used only when a person opens Help themselves.
3. **The five steps cannot replace the shipped cards.** Those cards teach seven things the five steps
   do not:
   - Sold out and Cook now (`help.how.kitchen.3`, `help.how.kitchen.4`, both K15-HIGH);
   - Walk-up, the bag lane, the paper fallback (K15-HIGH), the Screens circle and Lock
     (`help.how.counter.1`, `.3`–`.6`; `staff.ts:2563-2614`).
   - **Change:** the shipped cards stay whole, behind a second Help row. Nothing is retired.
4. **"A late card keeps pulsing" is false under reduced motion.** The pulse is switched off by the
   reduced-motion rule (`globals.css:8531-8536`).
   - **Change:** the sentence says the card turns red and says Late. That is true in both modes,
     because the badge carries the word (`KdsBoard.tsx:1610-1618`).
5. **"Late after 12 minutes" is not a constant.** The thresholds come from `mms_kds_config`, and 8/12
   is only the fallback (`lib/kds-urgency.ts:13-20`).
   - **Change:** the Late step quotes no minutes.
6. **"Skip" has no shipped Burmese.** `shell.version.notNow` "Not now / နောက်မှ" exists
   (`staff.ts:4021`), but နောက်မှ ("later") promises a return the guide never makes.
   - **Change:** the skip control says the shipped ✕ word, "ပိတ် · Close" (`shell.close`,
     `staff.ts:69`).
7. **A free tile does not become "Ordering" when tapped.** A started table with nothing on it is
   `seated`, which maps to the `rest` tone: a people glyph and no bar (`lib/floor-tone.ts:47-48`;
   `TableStrip.tsx:69-72`).
   - **Change:** step 1's flip is free → seated.
8. **`help.how.kitchen.2.more` names the Undo bar with the rail's word ပြန်ယူ** (`staff.ts:2526-2529`).
   This is D3(c).
   - **Change:** the guide never shows that line. Kitchen step 3 teaches each word in its own place.
9. **Three of the controls taught are not shipped yet:**
   - the hollow ring (today the owed mark is a solid warn dot, `globals.css:14490-14502`,
     `TableStrip.tsx:336`);
   - the round stub (today a ticket IS a cart, `kitchen.ts:307`, `:347-371`, per m5);
   - the stop card (a cleared cart's lines drop off the kitchen read, `kitchen.ts:180-211`, per
     Codex correction 12).

   Two more are designs too: the till tray (m6) and the clear window (m7).
   - **Change:** a guide never teaches a control its screen does not have. This is the rule the
     shipped cards were written to (`staff.ts:2475-2477`). Each station's guide ships as ONE revision,
     after every control it teaches (see DATA, "Ships when").

---

## World-class references, and what each brings

- **Apple's setup "proximity card" (AirPods, Apple Watch, Apple TV setup).** One card, one moving
  picture, one sentence and one button. This is the guide card's whole anatomy.
- **Apple TipKit (iOS 17).** A tip is shown once under display rules and counts as shown when it
  appears. It never sits modally over work. That is this guide's "offers itself once, when quiet;
  marked at show".
- **IKEA assembly and LEGO building instructions.** Each step draws only what changed, and the part
  is shown at real scale. So each step here has one moving thing, and every picture is a real-size
  crop of the real control.
- **Super Mario Bros. World 1-1.** It teaches inside the real level, not in a manual. The guide lives
  in the real screen's own quiet space, beside the live console.
- **Japanese railway pointing-and-calling (指差喚呼, shisa kanko).** Staff point at each signal and
  say its name. Here each step's title is the word printed on the control it pictures.
- **The Apple Wallet boarding pass.** Counter step 3 shows Dad that the filled tile leads to the same
  pass the guest is holding on their phone: one pass, one look (m2).
- **The iOS page control** (the current dot lengthens into a capsule). It shows progress quietly, and
  here every dot is a real 44px button.
- **Apple's Reduce Motion.** Motion is replaced, never just removed. Every picture ends on a frame
  that teaches by itself, and reduced motion draws that frame still.

---

## WHEN A GUIDE APPEARS (the rule the build implements)

1. **Who and where.** The guide offers itself once for each signed-in staff account, at each station
   (the kitchen board `/staff/kitchen`, or the counter floor `/staff`), on each tablet. The first time
   Dad signs in at the counter, he gets the counter guide. If Dad later covers the kitchen, he gets
   the kitchen guide once there too.
2. **Only when the screen is quiet at that open.**
   - **Kitchen:** the board has no tickets at all (any station), it is updating (not degraded), and
     no error shows.
   - **Counter:**
     - the split pane is idle (no table selected), which needs the split, from 64em;
     - no table is asking to pay;
     - the floor is updating.
   - A busy first open is not a missed chance: the guide waits for the next quiet open. It never
     interrupts service to teach.
   - It is decided **at mount only**. A board that empties mid-shift (Mom bumps the last ticket and
     her finger is still there) never conjures it.
3. **Marked seen the moment it shows** (the shipped rule, `HelpButton.tsx:247-251`). So it never
   comes back on its own:
   - not after Close;
   - not after a reload;
   - not after the last step;
   - not after work pushed it away.
4. **Storage refused (a private or full store): it never auto-shows.** This is the shipped rule
   (`HelpButton.tsx:256-258`): an interruption on every load is worse than none.
5. **Work always wins.**
   - **Counter:** a tap on any table opens that table in the pane, in place of the guide.
   - **Kitchen:** the first ticket that lands replaces the guide, with its normal arrival flash and
     chime.
   - If focus was inside the guide, it moves to the ticket list (`ul.kds-grid` gets `tabIndex -1`),
     never onto an All done button.
6. **Re-openable from Help, at any time.** The gold circle's first row, "How this screen works", keeps
   its shipped title and sub-line. The sub-line is now true of the guide: "5 things, with pictures —
   it opens itself the first time" (`help.row.how.sub`, `staff.ts:2484-2487`).
   - From Help, the same guide renders inside the Help sheet. The person chose that dialog, and its
     ✕, Escape and scrim all close it.
   - The shipped cards move, unchanged, to a second row (see DECISIONS 6).
7. **Below 64em on the counter** (no pane), there is no in-place host. The first run opens in the
   Help sheet, under the same quiet rule.
8. **One revision per station.** If the guide's steps ever change, the revision key bumps and each
   person sees it once more. This is the shipped precedent: "a sheet that changed SHAPE is a new first
   morning" (`lib/help.ts:43-50`).

---

## THE GUIDE CARD (one component, two screens, two hosts)

The anatomy is the same on both screens. Only the theme and the scale differ.

1. **Head row (44 tall).**
   - **Left:** the eyebrow, "အဆင့် ၁ / ၅ · Step 1 of 5" (`help.step`; the counts are Burmese
     numerals under `my`, `fill.ts:37`).
   - **Right:** Close, which is the skip control. It is a text button with an ✕ glyph and "ပိတ်"
     over "Close" (`shell.close`).
2. **Stage: the picture well.**
   - The ground is `.help-pic`'s own, `color-mix(in oklab, var(--tx) 4%, var(--cd))`
     (`globals.css:11715-11726`): **#f5f2ee light**, **#322842 Night** (computed in
     scratchpad m12calc/c.py).
   - It has a 12px radius, is `aria-hidden` and inert (`pointer-events:none`), with `overflow:hidden`.
   - It holds real controls at their real size, cropped by the well (the HelpPicture rule,
     `HelpPicture.tsx:11-32`).
   - Kitchen pictures follow the board's text dial (`.help-pic[data-size]`, `globals.css:10683-10708`).
   - In the Help sheet (34rem), a wide picture crops from the edge away from its taught element.
3. **Title: the mark's own word.**
   - It is rendered through the control's own key, Burmese over its English echo.
   - The h2 takes focus on every step change.
4. **Line: one sentence.**
   - It is a shipped `help.how.*` line where one already says it.
   - Otherwise it is NEW English-only copy (listed at the end, for the native sitting).
5. **Foot (sticky inside its scroller, so Next never scrolls away).**
   - **Dots:** five 44×44 buttons. The current one is a 24×8 accent capsule; the others are 8×8
     --t3 dots.
   - **Pager:** Back (paper secondary), then Next (the one primary).
     - Step 1 has no Back. Its slot is kept so Next never moves under a finger.
     - The last step's primary is the station's own word: "ကောင်တာကို ပြန်သွား · Back to the
       counter" on the counter, "ရပြီ · Got it" in the kitchen.
   - **Footer:** "ရွှေရောင် အကူအညီ အဝိုင်းကနေ အချိန်မရွေး ပြန်ဖွင့်လို့ ရပါတယ်။ · Open this any time from the
     gold Help circle." (`help.footer`, `staff.ts:2620-2623`).
6. **Arming.**
   - For 400 ms after the guide mounts, every guide control is `aria-disabled`
     (`PICKED_UNDO_ARM_MS`, `lib/expo-rules.ts:142`). This is at least the 350 ms same-gesture guard
     (`packages/ui/src/gesture.ts:15`). A tap that loaded the screen never acts on the guide.
   - The shipped `haptic("pick")` fires on Next, Back and every dot.
7. **Motion.**
   - Each step's picture plays ONE motion when the step opens, once, then rests on the taught frame.
   - The step swap itself is instant. Nothing loops. There is no auto-advance, no swipe (wet hands)
     and no sound.
   - Reduced motion draws the end frame.

**Example data (like for like with the moments).**

- **Counter:** m7's floor (Table 3 ordering at $27.00; a seated table) and m2's asked Table 4
  ($46.41). The guest hands over a $50 note, so the change is **$3.59** (5000 − 4641 = 359¢). Step 5
  uses m7's paid Table 7 ($46.12).
- **Kitchen:** m5's tables.
  - Table 11 is Chicken Curry, just landed (0:04).
  - Table 4's round 1 is amber at 9:12; its round 2 is tea and sago at 0:04.
  - Table 2 is red, Late, at 13:05.
  - Table 9 is the bump.
  - The stop card is Table 3's Mohinga and Shan Noodles: m7's own Table 3, which the counter
    backdrop shows ordering.

**Keyframes** (in each artboard's `<helmet><style>`).

- Every base style is the FINAL frame. The keyframes run from the start look, with
  `animation-fill-mode: backwards` (the flash excepted, below), so reduced motion gets the final
  frame exactly.
- The curves:
  - `cubic-bezier(0.2, 0.8, 0.2, 1)` is the iOS-like settle with no overshoot;
  - fades use ease-out;
  - the pulse uses ease-in-out.

```css
@keyframes m12Out {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}
@keyframes m12Fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@keyframes m12Pop {
  from {
    opacity: 0;
    transform: scale(0.96);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@keyframes m12Rise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@keyframes m12Draw {
  from {
    stroke-dashoffset: 50.27;
  }
  to {
    stroke-dashoffset: 0;
  }
}
@keyframes m12Strike {
  from {
    transform: scaleX(0);
  }
  to {
    transform: scaleX(1);
  }
}
@keyframes m12Flash {
  0% {
    box-shadow:
      inset 0 0 0 3px #f4c879,
      0 0 0 0 rgba(244, 200, 121, 0.45);
  }
  70% {
    box-shadow:
      inset 0 0 0 3px transparent,
      0 0 0 9px transparent;
  }
  100% {
    box-shadow: none;
  }
}
@keyframes m12Pulse {
  0%,
  100% {
    filter: brightness(1);
  }
  50% {
    filter: brightness(1.22);
  }
}
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation: none !important;
    transition: none !important;
  }
}
```

`m12Flash` is the shipped `kdsFlash` (`globals.css:8293-8317`). `m12Pulse` is the shipped
`kdsRedPulse` (`globals.css:7912-7923`).

**The canvas logic (both artboards; `{{ }}` holes are lookups only).** The guide is RULES2 §B's
stepper plus one `done` state. In `done`, the guide is gone and the host's shipped empty state shows.
On the canvas, the bar's gold Help circle replays step 1 in place. In the product, Help opens the
same guide in the Help sheet instead (WHEN, rule 6).

```js
class Component extends DCLogic {
  constructor(props) {
    super(props);
    this.state = { step: 1, done: false };
  }
  renderVals() {
    const n = 5,
      step = this.state.step,
      done = this.state.done,
      on = !done;
    const go = (i) => () => this.setState({ step: i, done: false });
    return {
      on,
      done,
      s1: on && step === 1,
      s2: on && step === 2,
      s3: on && step === 3,
      s4: on && step === 4,
      s5: on && step === 5,
      hasBack: step > 1,
      noBack: step === 1,
      notLast: step < n,
      isLast: step === n,
      dots: [1, 2, 3, 4, 5].map((i) => ({
        label: "Step " + i + " of " + n,
        cur: i === step ? "step" : "false",
        w: i === step ? "24px" : "8px",
        bg: i === step ? DOT_ON : DOT_OFF,
        pick: go(i),
      })),
      next: () => this.setState({ step: Math.min(n, step + 1) }),
      back: () => this.setState({ step: Math.max(1, step - 1) }),
      skip: () => this.setState({ done: true }),
      finish: () => this.setState({ done: true }),
      reopen: () => this.setState({ step: 1, done: false }),
    };
  }
}
```

The dot colours are literals:

| Theme           | `DOT_ON`  | `DOT_OFF` |
| --------------- | --------- | --------- |
| Counter (light) | "#a65f10" | "#726859" |
| Kitchen (Night) | "#e7a53a" | "#a69eb1" |

---

## SCREEN picked-m12-1.dc.html — The counter guide: Dad's first sign-in, in the quiet pane

- **Device:** tablet 1366×1024, landscape (`$preview` {"width":1366,"height":1024}).
- **Theme:** light. The counter follows the OS.
- **Interactive:** yes. The states are steps 1–5 and `done`, driven by Back, Next, Close, the five
  dots, the last step's primary, and (in `done`) the gold Help circle.
- **`<title>`:** "Counter Guide — first sign-in".
- **Who and when:** Dad's first sign-in at the counter, early in a quiet evening. Table 3 is
  ordering, Table 7 has just sat down, nobody is asking to pay, and the pane is idle. So the guide is
  due, and it has taken the pane's empty state. The device language mode is "Both".

### LAYOUT

**Root:** 1366×1024, `position:relative; overflow:hidden`.

- **Ground:** #faf9f5 with the staff paper rules,
  `repeating-linear-gradient(180deg, transparent 0 27px, rgba(27,23,20,0.05) 27px 28px)`.
- **Type:** color #1b1714, Hanken Grotesk 16/1.5.

**y0–84, STAFF BAR.** Draw it exactly as picked-m7-1.dc.html's bar.

- --pg, with a 1px rgba(58,35,23,0.1) bottom; padding 10px 20px; a flex row, gap 12.
- **Leading:** the Screens circle, 44×44 at x20 (#fffdf8, 1px --bd, inset sheen, 20px grid glyph,
  `aria-label="Screens"`).
- **Title:** h1 "ကောင်တာနဲ့ စားပွဲများ" (Padauk 700 30, lh 1.6), with "Counter & tables" (13/600
  #6e6358) stacked beneath it.
- **Trailing (gap 20):**
  - **Help:** the gold circle, 44×44 at x1238. Its border is 1px rgba(230,165,59,0.62), its fill
    `linear-gradient(180deg, #faeacf, #fffdf8)`, with a 20px "?" glyph (stroke 2.25). It is a
    `<button type="button" aria-label="Help" onClick="{{ reopen }}">`.
  - **Lock:** a circle, 44×44 at x1302.

**y84–1024, THE SPLIT.** MAIN x20–858 (838), a 24px gap, then the PANE x882–1346 (464).

**MAIN (unchanged console, drawn as picked-m7-1 except where noted):**

- **y84–145, the zone strip.** 44px pills, radius 999, padding 0 14, Padauk 13/600, Burmese only:
  - "အော်ဒါ ဖွင့်";
  - **"စားပွဲများနဲ့ ကောင်တာ အော်ဒါများ"**, lit: --ac #a65f10 fill, #fffdf8 ink, inset sheen, glow
    `0 0 14px -6px rgba(232,168,60,0.34)`, `aria-current="location"`;
  - "ပါဆယ်ထုပ်များ";
  - "ဒီနေ့ ရငွေ".

  The unlit chips are #f2efe7 with a 1px --bd border and #1b1714 ink.

- **y161–182:** "စားပွဲများ — လွတ်နေတဲ့ စားပွဲကို နှိပ်ပြီး ဖွင့်ပါ" (Padauk 13/600, #6e6358, no echo).
- **y190–254, the strip:** 10 tiles of ~76.6 wide, gap 8, each 64 tall, radius 12, bg #fffdf8.
  - **Free tiles: 1, 2, 4, 5, 6, 8, 9, 10.**
    - Edge: 2px dashed #6e6358.
    - The number: Hanken 800 26, tabular, #1b1714.
    - Under it: "ဖွင့်" (Padauk 700 14, #8f5009).
  - **Tile 3, live.**
    - Edge: a 1px --bd border.
    - The number, then the cart glyph (18px, stroke 2.25, #a65f10).
    - A 4px #a65f10 bar (`box-shadow: inset 0 -4px 0 #a65f10`).
  - **Tile 7, rest.**
    - Edge: a 1px --bd border.
    - The number, then the people glyph (18px, #6e6358).
    - No bar.
- **y262–283, the key** (`aria-hidden`, 13px #6e6358, gap 4px 12px): [cart #a65f10] "မှာနေဆဲ" ·
  [people #6e6358] "ထိုင်ပြီ".
- **y299–326, the zone head row** (flex, baseline, space-between):
  - **left:** h2 "စားပွဲများနဲ့ ကောင်တာ အော်ဒါများ" (Padauk 700 17);
  - **right:** **THE ARTBOARD'S ONE LIVE REGION**, `<p role="status">` "အသုံးပြုနေတဲ့ စားပွဲ ၂ ခု"
    (13px #6e6358).
- **y342 on, the card grid:** 2 columns of 413 (x20–433 and x445–858), gap 12, `role="list"`. Each card
  is `.card.card-textured`:
  - background `radial-gradient(rgba(166,95,16,0.16) 1px, transparent 1.6px) 0 0 / 18px 18px, #fffdf8`;
  - 1px --bd border, radius 20;
  - shadow `inset 0 1px 0 rgba(255,255,255,0.55), 0 1px 3px -1px rgba(35,24,16,0.07), 0 14px 28px -18px rgba(35,24,16,0.28)`;
  - padding 16 20, rows gap 8.
  - **Table 3, x20–433, y342–509 (167), ORDERING:**
    - a 4px #a65f10 status edge down the left;
    - name row: "စားပွဲ 3" (Padauk 700 21; the "3" is Latin, `lang="en"`), with the chip "မှာနေဆဲ" at
      the right (12% --ac wash, #8f5009 ink, a 7px #a65f10 dot, 13/700, radius 999);
    - meta: "ဆိုင်မှာ စား · ၂ ယောက်" (13, #6e6358);
    - kitchen row: the flame glyph, "မီးဖိုချောင်မှာ ၂ ခု" (#1b1714 700), and the wait pill
      "၆ မိနစ်" (#eaf2ec fill, #346e47 ink, radius 999);
    - bottom: "$27.00" (16/700 tabular) "ယခုအထိ · ပစ္စည်း ၂ ခု" (13 #6e6358), and
      "ဖွင့်တာ ၁၈ မိနစ်က" (13 #726859) at the right.
  - **Table 7, x445–858, y342–473 (131), SEATED:**
    - no edge;
    - the chip "ထိုင်ပြီ" (#fffdf8, 1px --bd, #6e6358 ink, #6e6358 dot);
    - meta "ဆိုင်မှာ စား · ၂ ယောက်";
    - bottom: "ဘာမှ မရှိသေးပါ" (13 #726859), and "ဖွင့်တာ ၃ မိနစ်က" at the right.

**PANE, x882–1346:**

- `border-left: 1px solid rgba(58,35,23,0.1)` from y100 to y1008, on the --pg ground.
- Padding 0 8 96 24, so the content box is x906–1338 (432 wide). y912–1008 is the shipped reserve
  for the lane's thumb-zone pill; leave it empty.

**State GUIDE** (`<sc-if value="{{ on }}" hint-placeholder-val="{{ true }}">`): THE GUIDE CARD.

- **Element:** `<section aria-labelledby="table-pane-h" aria-describedby="guide-step">`, at
  x906–1338, y116–904 (432×788).
- **Fill and shape:**
  - the card-textured background above;
  - 1px --bd border, radius 20, the paper shadow above;
  - padding 20, a flex column. The inner column is x926–1318 (392).
- **① y136–180, HEAD ROW** (flex, `justify-content:space-between`, `align-items:center`):
  - **left:** `<p id="guide-step">`, which is per step (inside each step's `sc-if`):
    - `<span lang="my">` "အဆင့် ၁ / ၅" (Padauk 700 15, lh 1.6, #8f5009);
    - then " · Step 1 of 5" (Hanken 13/600, #6e6358), inline on one baseline.
  - **right: CLOSE.** `<button type="button" onClick="{{ skip }}">`:
    - min-height 44, min-width 44, padding 0 12 0 10, radius 999, transparent, no border;
    - a flex row, gap 6, `align-items:center`;
    - an ✕ svg (16px, stroke 2, round caps, #1b1714, `aria-hidden`);
    - then a stack: "ပိတ်" (Padauk 700 15, lh 1.6, #1b1714) over "Close" (Hanken 12/600, lh 1.2,
      #6e6358).
- **② y192–452, STAGE** (392×260): `<div aria-hidden="true">`.
  - Radius 12, background #f5f2ee, `box-shadow: inset 0 1px 2px rgba(27,23,20,0.06)`.
  - `position:relative; overflow:hidden`.
  - It holds the step's PICTURE (below). Every coordinate in a picture is relative to the stage's
    top-left corner.
- **③ y468–568, TITLE** `<h2 id="table-pane-h" tabindex="-1">`, a block:
  - the MY line: Padauk 700 22, lh 1.6, #1b1714, display block;
  - the EN echo: Hanken 15/600, lh 1.3, #6e6358, display block.
- **④ y576–716, LINE** `<p>`, one per step:
  - a bilingual line is the MY (Padauk 400 17, lh 1.6, #1b1714) over the EN (Hanken 14/500, lh 1.45,
    #6e6358);
  - an English-only line is Hanken 16/500, lh 1.5, #1b1714.
- **⑤ y728–772, DOTS** `<div role="group" aria-label="Steps">`:
  - centred; 5 buttons, each 44×44, no gap (220 wide);
  - each is `<button type="button" aria-label="{{ d.label }}" aria-current="{{ d.cur }}" onClick="{{ d.pick }}">`;
  - transparent, no border, centring one `<span>`: height 8, width `{{ d.w }}`, radius 999,
    background `{{ d.bg }}`.
- **⑥ y780–834, PAGER** (flex, gap 12):
  - **Back** (`<sc-if value="{{ hasBack }}">`):
    - `<button type="button" onClick="{{ back }}">`, flex 0 0 132, min-height 54, a pill;
    - #fffdf8, 1px --bd, inset sheen;
    - the stack: "နောက်သို့" (Padauk 700 16, lh 1.6) over "Back" (Hanken 13/600 #6e6358).
  - **On step 1** (`<sc-if value="{{ noBack }}">`): an empty `<div>` 132 wide in the same slot.
  - **Next** (`<sc-if value="{{ notLast }}">`):
    - `<button type="button" onClick="{{ next }}">`, flex 1, min-height 54, a pill;
    - `linear-gradient(180deg, #a65f10, #8f5009)`, ink #fffdf8;
    - shadow `inset 0 1px 0 rgba(255,255,255,0.55), 0 2px 8px -1px rgba(166,95,16,0.42)`;
    - the stack: "ရှေ့ဆက်" (Padauk 700 16, lh 1.6) over "Next" (Hanken 13/700).
  - **Last step** (`<sc-if value="{{ isLast }}">`): the same primary, `onClick="{{ finish }}"`. The
    stack is "ကောင်တာကို ပြန်သွား" over "Back to the counter".
- **⑦ y846–884, FOOTER** `<p>`, centred:
  - "ရွှေရောင် အကူအညီ အဝိုင်းကနေ အချိန်မရွေး ပြန်ဖွင့်လို့ ရပါတယ်။" (Padauk 400 13, lh 1.6, #726859);
  - over "Open this any time from the gold Help circle." (Hanken 12/500, #726859).

**State DONE** (`<sc-if value="{{ done }}" hint-placeholder-val="{{ false }}">`): the shipped idle
pane, drawn as picked-m7-1's pane.

- A centred column in y100–912.
- The receipt glyph (24px, #6e6358).
- h2 "စားပွဲတစ်ခု ရွေးပါ" (Padauk 700 21).
- Then the stacked sub: "အဲဒီစားပွဲရဲ့ အော်ဒါက စာရင်းဘေး ဒီနေရာမှာ ပေါ်လာပါမယ်။" (Padauk 400 15, #6e6358)
  over "Its order opens here, beside the list." (13, #6e6358).

#### THE FIVE STEPS (title · line · picture · its one motion)

**STEP 1 — the floor at a glance** (`s1`)

- **Eyebrow:** "အဆင့် ၁ / ၅" · "Step 1 of 5".
- **Title:** "စားပွဲများ — လွတ်နေတဲ့ စားပွဲကို နှိပ်ပြီး ဖွင့်ပါ" / "Tables — tap a free one to start it".
- **Line:** "စားပွဲတစ်ခုကို နှိပ်ရင် အော်ဒါကို မြင်ရပါမယ်။" / "Tap a table to see its order."
- **Picture:**
  - **The strip crop.** Five real tiles (68×64, gap 8, radius 12), x10–382, y64–128:
    - tile 1 free;
    - tile 2 free;
    - tile 3 live (cart, the --ac bar);
    - tile 4 free;
    - **tile 5, two stacked faces** (`position:absolute`, the same box):
      - **face A, free:** the dashed edge, "5", "ဖွင့်";
      - **face B, seated:** a solid 1px --bd edge, "5", the people glyph in #6e6358, no bar.
  - **The key** (centred, y150–172): [cart #a65f10] "မှာနေဆဲ" · [people #6e6358] "ထိုင်ပြီ" (Padauk
    400 13, #6e6358).
- **Motion: free → seated, once.**
  - Face A: `m12Out` 180ms ease-out, delay 800ms, backwards. Its base is `opacity:0`.
  - Face B: `m12Pop` 180ms `cubic-bezier(0.2,0.8,0.2,1)`, delay 800ms, backwards.
  - Under reduced motion: face B only.

**STEP 2 — the hollow ring, "not sent"** (`s2`)

- **Eyebrow:** "အဆင့် ၂ / ၅" · "Step 2 of 5".
- **Title:** "မပို့ရသေး" / "Not sent yet".
- **Line** (English-only, NEW): "A hollow ring: the kitchen hasn't got these dishes yet. A guest may
  show you the same ring on their phone."
- **Picture:**
  - **Table 3's floor card,** x16–376 (360), y16–148:
    - the textured card;
    - a 4px #a65f10 left edge;
    - padding 14 20;
    - name row: "စားပွဲ 3" (Padauk 700 21) with the chip "မှာနေဆဲ" at the right;
    - **kitchen row:**
      - **the HOLLOW RING:** an svg 20×20, circle r8, stroke 2.5px #a44b34, no fill,
        `stroke-dasharray: 50.27`;
      - gap 8, then "၂ ခု မပို့ရသေး" (Padauk 700 15, #a44b34);
    - bottom: "$27.00" (16/700) "ယခုအထိ" (13 #6e6358).
  - **The table's Send,** x16–376, y172–236:
    - primary xl, 64 tall, a pill, the CTA gradient, ink #fffdf8;
    - the stack: "မီးဖိုချောင် ပို့ · ၂ ခု" (Padauk 700 17) over "Send to kitchen · 2 items"
      (Hanken 13/600).
- **Motion: the ring draws itself, once.** `m12Draw` 600ms ease-out, delay 300ms, backwards, on the
  circle. Its base is `stroke-dashoffset:0`. Reduced motion: the ring is drawn.

**STEP 3 — the guest asking to pay: the one CALL tile** (`s3`)

- **Eyebrow:** "အဆင့် ၃ / ၅" · "Step 3 of 5".
- **Title:** "ကောင်တာမှာ ငွေရှင်းချင်ပါတယ်" / "They’d like to pay here at the counter".
- **Line** (English-only, NEW): "A filled tile is a table asking to pay — the only tile that ever
  fills. Tap it to see the same pass they’re holding."
- **Picture:**
  - **The strip crop,** three tiles, x86–306, y12–76:
    - tile 3 live;
    - **tile 4, two faces:**
      - **face A, live:** the cart glyph and the --ac bar;
      - **face B, ASK:** background #f6e9e4, the receipt glyph (18px, #a44b34), a 4px #a44b34
        bar, the number in #1b1714;
    - tile 5 free.
  - **The counter pass, as Dad's pane shows it** (m2), x16–376 (360), y100–240 (140):
    - **paper:** #fffdf8, 1px rgba(27,23,20,0.18), radius 16, inset sheen;
    - **stub** x16–144 (128): a centred column:
      - `<span lang="my">` "စားပွဲ" (Padauk 700 15, #1b1714) then "Table" (Hanken 13/700, #726859),
        on one baseline;
      - under it, "4" in Fraunces 600 **88px** (`--fs-pass`), lh 1, tabular, #1b1714;
    - **the perforation:** the stub's right edge, 2px dotted rgba(27,23,20,0.28);
    - **notches:** two 12px circles of #f5f2ee with a 1px rgba(27,23,20,0.18) ring, centred on the
      seam at the top and bottom edges;
    - **main** x144–376 (232), padding 14 16, a column, gap 4:
      - "တောင်းဆိုတာ ၄ မိနစ်က" (Padauk 700 13, #6e6358);
      - "စုစုပေါင်း · Total" (Padauk 700 13 + Hanken 13/700, #6e6358);
      - "$46.41" (Fraunces 800 44, lh 1.08, tabular, #1b1714).
- **Motion: the tile fills, once.**
  - Face A: `m12Out` 240ms, delay 500ms, backwards (base `opacity:0`).
  - Face B: `m12Pop` 240ms, delay 500ms, backwards.
  - The pass does not move.
  - Reduced motion: face B.

**STEP 4 — Take cash, and the till tray** (`s4`)

- **Eyebrow:** "အဆင့် ၄ / ၅" · "Step 4 of 5".
- **Title:** "ငွေသားနဲ့ ရှင်း" / "Take cash".
- **Line** (English-only, NEW): "Tap the note they gave you. The change to hand back shows in the
  corner — nothing is taken until you tap Take."
- **Picture: a crop of m6's tray,** x16–376 (360), y16–244 (228):
  - **The tray:** #fffdf8, 1px --bd, radius 20, the paper shadow, `overflow:hidden`.
  - **The crown:** its top 6px is painted #f6dbad (`box-shadow: inset 0 6px 0 #f6dbad`), with a 1px
    sheen line under it.
  - **The notes row,** y40–160 (inside the crop), starting at x32:
    - **"$50", LIT:** a 213×120 tile, radius 12, bg #a65f10, ink #fffdf8.
      - Its banknote hairline is inset 6px, 1px rgba(255,253,248,0.35), radius 6.
      - Shadow `inset 0 1px 0 rgba(255,255,255,0.55), 0 0 14px -6px rgba(232,168,60,0.34)`.
      - "$50" sits centred, in Fraunces 800 44, tabular.
    - **"$100":** the next 213×120 tile at x257. It is #f2efe7 with a 1px --bd border and the
      hairline rgba(58,35,23,0.1), "$100" in Fraunces 800 44, #1b1714. **It is cut by the tray's
      right edge.** The crop shows that a row of notes continues.
  - **THE READOUT,** y176–224, x32–360: one baseline row:
    - "အကြွေ" (Padauk 700 17, #1b1714);
    - " · Change" (Hanken 15/600, #6e6358);
    - a leader (flex 1, 2px dotted rgba(58,35,23,0.25));
    - "$3.59" (Fraunces 800 44, tabular, #1b1714).
- **Motion: the change appears, once.** `m12Rise` 240ms `cubic-bezier(0.2,0.8,0.2,1)`, delay 600ms,
  backwards, on the readout row. Reduced motion: shown.

**STEP 5 — clearing a table, and its Undo** (`s5`)

- **Eyebrow:** "အဆင့် ၅ / ၅" · "Step 5 of 5".
- **Title:** "စားပွဲ ရှင်း" / "Clear table".
- **Line** (English-only, NEW; the "6" comes from `PICKED_UNDO_MS`): "Clear a table once they’ve left.
  For 6 seconds, Undo waits right where you tapped — Seat next party skips the wait."
- **Picture: Table 7's paid card, as two stacked faces** (the same box, x16–376 (360), y8–252, radius
  20, `position:absolute`).
  - **Face GO, before the tap** (m7's slab state):
    - the textured card with a 4px #346e47 left edge;
    - name row: "စားပွဲ 7", with the chip "ငွေရှင်းပြီး" (#eaf2ec, #346e47 ink, 13/700) at the right;
    - meta "ဆိုင်မှာ စား · ၃ ယောက်";
    - "မီးဖိုချောင် ပြီးပြီ" (13 #6e6358);
    - "$46.12" (16/700) "ငွေရှင်းပြီး" (13 #346e47);
    - **the slab,** y188–252 (64), under a 1px --bd line:
      - #eaf2ec, radius 0 0 19 19, padding 0 16, flex, gap 12;
      - a 32px ring (2px #346e47, transparent) holding an 18px check in #346e47;
      - then a stack: "ထွက်သွားကြပြီ — စားပွဲ 7 ရှင်း" (Padauk 700 15) over "They’ve left — clear
        Table 7" (Hanken 12/600 #6e6358).
  - **Face CLEARING, the window** (m7 plus the decided Undo form):
    - the same card, its top area (y8–188) wearing m7's pending hatch,
      `repeating-linear-gradient(45deg, rgba(114,104,89,0.12) 0 2px, transparent 2px 10px)`, over
      the card ground, with every text at full ink;
    - the chip becomes the CLEARING chip: radius 999, padding 2 10, a **1.5px dashed #6e6358**
      border, #fffdf8, "စားပွဲ 7 ရှင်းနေပါတယ်" (Padauk 700 13, #6e6358);
    - **the slot,** y188–252 (64), two cells under a 1px --bd line:
      - **UNDO, x16–196:**
        - #f2efe7, with a **1.5px dashed #a65f10** border inset on the cell, radius 0 0 0 19;
        - centred: the undo glyph (18px, #1b1714), gap 8, then a stack:
          - line 1: "ပြန်ဖျက်" (Padauk 700 17, #1b1714) followed by
            `<span aria-hidden="true">` " · ၆ စက္ကန့်" (Padauk 400 13, #6e6358);
          - line 2: "Undo" plus `<span aria-hidden="true">` " · 6s" (Hanken 12/600, #6e6358).
      - **SEAT NEXT PARTY, x197–376:**
        - paper #fffdf8, a 1px --bd left divider, radius 0 0 19 0;
        - the stack: "နောက်ဧည့်သည် ဖွင့်" (Padauk 700 15, #8f5009) over "Seat next party"
          (Hanken 12/700, #8f5009);
        - a trailing "→" (14px, #8f5009, `aria-hidden`).
- **Motion: the card turns, once.**
  - Face GO: `m12Out` 240ms ease-out, delay 800ms, backwards (base `opacity:0`).
  - Face CLEARING: `m12Fade` 240ms ease-out, delay 800ms, backwards.
  - Reduced motion: the CLEARING face.

### COPY (English) — verbatim

- **Bar and floor (backdrop):** Counter & tables · (the zone strip and the strip label are
  Burmese-only, as built) · the tile figures 1–10 · the money $27.00 · Screens · Help · Lock (the
  last three are accessible names).
- **Guide chrome, every step:** Step 1 of 5 (… 2, 3, 4, 5 of 5) · Close · Back · Next · Back to the
  counter (the last step only) · Open this any time from the gold Help circle.
- **Step 1:** Tables — tap a free one to start it · Tap a table to see its order.
- **Step 2:**
  - Not sent yet;
  - A hollow ring: the kitchen hasn’t got these dishes yet. A guest may show you the same ring on
    their phone. (NEW);
  - picture: $27.00 · Send to kitchen · 2 items.
- **Step 3:**
  - They’d like to pay here at the counter;
  - A filled tile is a table asking to pay — the only tile that ever fills. Tap it to see the same
    pass they’re holding. (NEW);
  - picture: Table · 4 · Total · $46.41.
- **Step 4:**
  - Take cash;
  - Tap the note they gave you. The change to hand back shows in the corner — nothing is taken until
    you tap Take. (NEW);
  - picture: $50 · $100 · Change · $3.59.
- **Step 5:**
  - Clear table;
  - Clear a table once they’ve left. For 6 seconds, Undo waits right where you tapped — Seat next
    party skips the wait. (NEW);
  - picture: They’ve left — clear Table 7 · $46.12 · Undo · 6s · Seat next party.
- **Done state:** Its order opens here, beside the list.
- **Accessible names:** Steps (the dot group) · Step N of 5 (each dot) · Help · Screens · Lock.

### COPY (Burmese) — with sources

**The guide's own words** (all shipped):

| String                                                        | Key / source                                                         |
| ------------------------------------------------------------- | -------------------------------------------------------------------- |
| အဆင့် ၁ / ၅ (… ၂ … ၅)                                         | `help.step`, staff.ts:2616 (counts in Burmese numerals, fill.ts:37)  |
| ပိတ်                                                          | `shell.close`, staff.ts:69                                           |
| နောက်သို့ · ရှေ့ဆက်                                           | `help.back` / `help.next`, staff.ts:2617-2618                        |
| ကောင်တာကို ပြန်သွား                                           | `table.detail.handoff.done`, staff.ts:3097 (m6's seal hero)          |
| ရွှေရောင် အကူအညီ အဝိုင်းကနေ အချိန်မရွေး ပြန်ဖွင့်လို့ ရပါတယ်။ | `help.footer`, staff.ts:2620-2623                                    |
| စားပွဲများ — လွတ်နေတဲ့ စားပွဲကို နှိပ်ပြီး ဖွင့်ပါ            | `floor.strip.label`, staff.ts:3241-3244                              |
| စားပွဲတစ်ခုကို နှိပ်ရင် အော်ဒါကို မြင်ရပါမယ်။                 | `help.how.counter.2`, staff.ts:2575-2578                             |
| မပို့ရသေး                                                     | `pad.group.unsent`, staff.ts:2909 (K15-HIGH, = `table.line.notSent`) |
| ကောင်တာမှာ ငွေရှင်းချင်ပါတယ်                                  | `table.detail.counterAsk`, staff.ts:700-703                          |
| ငွေသားနဲ့ ရှင်း                                               | `settle.cash.title`, staff.ts:1713 (joins K15-HIGH with m6)          |
| စားပွဲ ရှင်း                                                  | `settle.clear.btn`, staff.ts:1836                                    |

**Inside the pictures and the backdrop** (shipped):

| String                                                                       | Key / source                                                                                   |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| ကောင်တာနဲ့ စားပွဲများ                                                        | `floor.door.counter`, staff.ts:977                                                             |
| အော်ဒါ ဖွင့် · စားပွဲများနဲ့ ကောင်တာ အော်ဒါများ · ပါဆယ်ထုပ်များ · ဒီနေ့ ရငွေ | staff.ts:370 · :1011 · :851 · :1652                                                            |
| ဖွင့်                                                                        | `floor.verb.start`, staff.ts:3256                                                              |
| မှာနေဆဲ · ထိုင်ပြီ · ငွေရှင်းပြီး                                            | `floor.status.ordering` :391 · `.seated` :390 · `.paid` :394                                   |
| အသုံးပြုနေတဲ့ စားပွဲ ၂ ခု                                                    | `floor.tables.count.many`, staff.ts:1016-1019                                                  |
| စားပွဲ 3 / 7 · စားပွဲ (stub)                                                 | `floor.table`, staff.ts:402 (the id is Latin, drawn large on the stub)                         |
| ဆိုင်မှာ စား · ၂ ယောက် / ၃ ယောက်                                             | `floor.mode.dinein` :439 · `floor.party` :413                                                  |
| မီးဖိုချောင်မှာ ၂ ခု · ၆ မိနစ်                                               | `floor.kitchen.inKitchen` :3261 · `floor.kitchen.wait` :3266                                   |
| ၂ ခု မပို့ရသေး                                                               | `floor.kitchen.notSent`, staff.ts:3260 (K15-HIGH)                                              |
| ယခုအထိ · ပစ္စည်း ၂ ခု                                                        | `floor.card.soFarLabel` :420 · `floor.card.item.many` :415                                     |
| ဘာမှ မရှိသေးပါ                                                               | `floor.card.empty`, staff.ts:429                                                               |
| ဖွင့်တာ ၁၈ မိနစ်က / ၃ မိနစ်က                                                 | `floor.card.opened` :3290 + `time.minAgo` :717                                                 |
| မီးဖိုချောင် ပို့ · ၂ ခု                                                     | `table.send.cta.many`, staff.ts:2701 (K15-HIGH)                                                |
| တောင်းဆိုတာ ၄ မိနစ်က                                                         | `table.detail.counterAsked` :704 + `time.minAgo` :717                                          |
| စုစုပေါင်း                                                                   | `floor.settled.row.total`, staff.ts:1112                                                       |
| အကြွေ                                                                        | `settle.cash.changeLabel`, staff.ts:3066 (K15-HIGH)                                            |
| မီးဖိုချောင် ပြီးပြီ                                                         | `expo.kitchenDone`, staff.ts:858                                                               |
| ပြန်ဖျက်                                                                     | `kds.undo`, staff.ts:255. D3: ပြန်ဖျက် erases a mark you just made, and m7's Clearing keeps it |
| · ၆ စက္ကန့်                                                                  | `table.send.undoLeft`, staff.ts:2706                                                           |
| စားပွဲတစ်ခု ရွေးပါ · အဲဒီစားပွဲရဲ့ အော်ဒါက စာရင်းဘေး ဒီနေရာမှာ ပေါ်လာပါမယ်။  | `floor.pane.empty.title` / `.sub`, staff.ts:3329-3333                                          |

**Drafts reused inside replicas only.** These are other streams' decided drafts, never this guide's
copy. Each renders through its owner's key, so the guide follows the native sitting automatically:

| String                         | Owner and source                                                             |
| ------------------------------ | ---------------------------------------------------------------------------- |
| ထွက်သွားကြပြီ — စားပွဲ 7 ရှင်း | m7's `settle.clear.left` DRAFT (picked-m7.md:378, K15-HIGH), counter-floor   |
| စားပွဲ 7 ရှင်းနေပါတယ်          | m7's `settle.clear.window` DRAFT (picked-m7.md:374, K15-HIGH), counter-floor |
| နောက်ဧည့်သည် ဖွင့်             | m7's `settle.clear.seatNext` DRAFT (picked-m7.md:377), counter-floor         |

**Never on this screen:** a guest name, a card word, a reader word, an approval or flag (m8 explains
itself), and any D5 phone-pay words.

### MOTION

| Step | What moves (one thing)           | Keyframes · timing                       | Reduced motion      |
| ---- | -------------------------------- | ---------------------------------------- | ------------------- |
| 1    | tile 5: free → seated            | `m12Out` / `m12Pop`, 180ms, delay 800ms  | seated tile, still  |
| 2    | the hollow ring draws itself     | `m12Draw`, 600ms ease-out, delay 300ms   | the ring, drawn     |
| 3    | tile 4 fills: live → ask         | `m12Out` / `m12Pop`, 240ms, delay 500ms  | the ask tile, still |
| 4    | the change readout appears       | `m12Rise`, 240ms, delay 600ms            | the readout, shown  |
| 5    | the card turns: slab → Undo slot | `m12Out` / `m12Fade`, 240ms, delay 800ms | the window, still   |

- Each motion plays once, when its step opens. Returning to a step replays it, because the `sc-if`
  remounts.
- Nothing in the backdrop moves. The step swap is instant. Nothing loops.
- Every frame carries the reduced-motion escort in `<helmet><style>`.

### A11Y

- **One live region:** the floor's `<p role="status">` (FloorBoard.tsx:389-392). The guide adds
  none.
  - In the product, a step change moves focus to the step's h2 (`tabIndex -1`), which announces it.
  - Close and the last primary move focus to the idle pane's h2 ("Pick a table").
- **Landmarks and names:**
  - The guide is `<section aria-labelledby="table-pane-h">`. The step title IS the pane's h2 while
    the guide shows, so the pane keeps one heading.
  - `aria-describedby="guide-step"` points at the eyebrow.
- **Dots:**
  - `role="group" aria-label="Steps"`. In the product, the group name is `help.a11y.pager`
    "အဆင့်များ" (staff.ts:2625).
  - Each dot is a real 44×44 `<button>` named "Step N of 5" (in the product, sr-only
    `<Chrome k="help.step">`, rule 3).
  - `aria-current="step"` is on the lit one. The current dot differs by SHAPE (a 24px capsule
    against an 8px dot) as well as colour.
- **Targets:** Close 44×44 or more · dots 44×44 · Back and Next 54 · the gold Help circle 44.
- **The picture is `aria-hidden` and inert.** The title and the line carry the meaning.
- **Never colour alone:**
  - the ring is a shape plus a word;
  - the ask tile is a fill, a glyph and a bar, plus the title's words;
  - the lit note is a fill plus `aria-pressed` in the product;
  - the Undo cell is the dashed edge plus "Undo".
- **Contrast** (computed in scratchpad m12calc/c.py):

  | Pair                                           | Ratio |
  | ---------------------------------------------- | ----- |
  | #1b1714 on the stage #f5f2ee                   | 15.96 |
  | #6e6358 on the stage                           | 5.24  |
  | #726859 (dots, footer) on #fffdf8              | 5.38  |
  | #8f5009 eyebrow on #fffdf8                     | 6.22  |
  | #fffdf8 on #a65f10 (primary, lit note)         | 4.84  |
  | #a44b34 ring and word on #fffdf8               | 5.68  |
  | #a44b34 on #f6e9e4 (ask tile)                  | 4.87  |
  | #a65f10 dashed Undo edge on #f2efe7 (non-text) | 4.28  |
  | #346e47 on #eaf2ec                             | 5.31  |

- **Burmese:** every run is `lang="my"`, Padauk 400 or 700 only, lh 1.6, at least 13px. A Latin
  id, money or digit inside a Burmese run is `lang="en"`. Counts use Burmese numerals; ids, money and
  clocks stay Latin (fill.ts owner rule).
- **Reduced motion:** the escort rule, so every picture's end frame is drawn still.

---

## SCREEN picked-m12-2.dc.html — The kitchen guide: Mom's first sign-in, on the empty board

- **Device:** tablet 1366×1024, landscape (`$preview` {"width":1366,"height":1024}).
- **Theme:** Night, forced (the KDS is Night-only, `KdsBoard.tsx:1088` `kds-root dark`).
- **Interactive:** yes. The states are steps 1–5 and `done`, as screen 1.
- **`<title>`:** "Kitchen Guide — first sign-in".
- **Who and when:** Mom's first sign-in at the kitchen, before the first table sends. The board is
  empty and updating, so the guide is due. It sits where "Nothing to cook" would. The device language
  mode is "Both", text size S, and sound is on.

### LAYOUT

**Root:** 1366×1024, background #100c19, color #f3ecdf, Hanken 16/1.5, a flex column, gap 12,
padding 0 14 14 (picked-m5-1's root).

**y0–68, STAFF BAR.** Copy picked-m5-1.dc.html's `<header>` exactly:

- Screens;
- h1 "မီးဖိုချောင်" over "Kitchen";
- the station control (All · Wok · Cold · Drinks, with All lit);
- TV · Sound (lit, pressed) · Aa · Help · Lock.

The one change: the gold-ringed Help circle carries `onClick="{{ reopen }}"`.

**y80–147, HEAD** (`section aria-label="Board status"`, a 1px --bd bottom rule, padding-bottom 8):

- **x14, the glance stats** (`role="group" aria-label="Service stats"`, gap 16):
  - "0" (Hanken 800 32, lh 1, #f3ecdf) over "ဖွင့်ထား" (Padauk 700 15, #bcafc8);
  - "0" (#f3ecdf: Late is zero, so it is not warn) over "နောက်ကျ".
- **Then THE ARTBOARD'S ONE LIVE REGION:** `<p role="status">` "ရှင်းပြီ" (15px #bcafc8).
- **At the right edge, x1352:** the "စုစုပေါင်း" chip (44px pill, #211a30, 1px --bd, 15/700).

**y159–1010, BODY.**

**State GUIDE** (`<sc-if value="{{ on }}" hint-placeholder-val="{{ true }}">`):

- **y175–202:** `<p lang="my">` "ချက်စရာ ဘာမှ မရှိပါ" (Padauk 700 17, lh 1.6, #bcafc8, centred). The
  board's own truth stays said. It is a `<p>`, because the guide's title is the h2.
- **THE GUIDE CARD:** `<section aria-labelledby="guide-h" aria-describedby="guide-step">`, at
  x303–1063, y214–990 (760×776).
  - **Fill and shape:**
    - background `radial-gradient(rgba(231,165,58,0.2) 1px, transparent 1.6px) 0 0 / 18px 18px, #2b213c`;
    - 1px rgba(243,236,223,0.13) border, radius 20;
    - shadow `inset 0 1px 0 rgba(255,255,255,0.11), 0 8px 22px rgba(0,0,0,0.5)`.
  - **Padding** 24 32. The inner column is x335–1031 (696).
  - **① y238–282, HEAD ROW** (space-between):
    - **left:** `<p id="guide-step">` (per step): "အဆင့် ၁ / ၅" (Padauk 700 17, lh 1.6, #f4c879), then
      " · Step 1 of 5" (Hanken 14/600, #bcafc8);
    - **right: CLOSE**, as screen 1 at Night scale:
      - `onClick="{{ skip }}"`, min-height 44, a pill, transparent;
      - the ✕ svg (18px, #f3ecdf);
      - "ပိတ်" (Padauk 700 17, #f3ecdf) over "Close" (Hanken 13/600, #bcafc8).
  - **② y294–654, STAGE** (696×360): `aria-hidden`, radius 12, background #322842,
    `box-shadow: inset 0 1px 2px rgba(0,0,0,0.35)`, `overflow:hidden`, `position:relative`.
    Coordinates are stage-relative. Replicas are at the KDS's S tier (the m5 sizes).
  - **③ y670–746, TITLE** `<h2 id="guide-h" tabindex="-1">`:
    - a bilingual title is the MY (Padauk 700 30, lh 1.6, #f3ecdf, block) over the EN (Hanken 18/700,
      lh 1.3, #bcafc8, block);
    - an English-only title is Fraunces 600 30, lh 1.2, tracking -0.02em, #f3ecdf.
  - **④ y754–858, LINE:**
    - a bilingual line is the MY (Padauk 400 19, lh 1.6, #f3ecdf) over the EN (Hanken 15/500, lh 1.4,
      #bcafc8);
    - an English-only line is Hanken 18/500, lh 1.5, #f3ecdf.
  - **⑤ y870–934, PAGER ROW** (a flex row, `align-items:center`, `justify-content:space-between`):
    - **Back** x335–495 (160×64) (`hasBack`):
      - #362848, 1px --bd, inset sheen, radius 999;
      - "နောက်သို့" (Padauk 700 19, lh 1.6) over "Back" (Hanken 14/600, #bcafc8).
    - **Step 1** (`noBack`): an empty 160 slot.
    - **DOTS** (centred at x683): `role="group" aria-label="Steps"`, 5×44 buttons, built as
      screen 1's with the Night dot colours.
    - **Next** x811–1031 (220×64) (`notLast`):
      - bg #e7a53a, ink #130d1e, radius 999;
      - shadow `inset 0 1px 0 rgba(255,255,255,0.11), 0 0 14px -6px rgba(244,200,121,0.3)`;
      - "ရှေ့ဆက်" (Padauk 700 19) over "Next" (Hanken 14/700).
    - **Last step** (`isLast`): the same primary, `onClick="{{ finish }}"`, reading "ရပြီ" over
      "Got it".
  - **⑥ y944–966, FOOTER** (centred, one line):
    - "ရွှေရောင် အကူအညီ အဝိုင်းကနေ အချိန်မရွေး ပြန်ဖွင့်လို့ ရပါတယ်။" (Padauk 400 14, #a69eb1);
    - then " · Open this any time from the gold Help circle." (Hanken 13, #a69eb1).

**State DONE** (`<sc-if value="{{ done }}" hint-placeholder-val="{{ false }}">`): the shipped
`EmptyState`, centred in the body.

- The title "ချက်စရာ ဘာမှ မရှိပါ" (Padauk 700 22, #f3ecdf).
- The subtitle, max-width 640 and centred, in Padauk 400 15, lh 1.6, #bcafc8, Burmese only as built
  (`KdsBoard.tsx:1315-1316`): "အော်ဒါ ပို့တာ ဒါမှမဟုတ် ငွေရှင်းတာနဲ့ ဒီမှာ ချက်ချင်း ပေါ်ပါတယ် — ဆိုင်မှာစားက
  ပို့တဲ့အခါ၊ လာယူနဲ့ ပါဆယ်က ငွေရှင်းတဲ့အခါ၊ ချိန်းထားတဲ့ အော်ဒါတွေက စချက်ချိန်ရောက်တဲ့အထိ ဆိုင်းထားကတ်အဖြစ်
  စောင့်နေပါမယ်။"

#### THE TICKET REPLICA (as picked-m5-1.dc.html draws it, 326 wide at S)

- **Card:** #2b213c, 1px --bd, radius 12, the Night card-textured dots, `position:relative`,
  `overflow:hidden`.
- **Strip,** 71 tall, padding 10 14:
  - **left:** "စားပွဲ N" (Padauk 700 32, lh 1.6; the N in Hanken 800, `lang="en"`);
  - **right:** a column, gap 2: the clock (Hanken 800 24, tabular, lh 1) over the badge (15/700).
  - **Fills:** calm #211a30 (badge #bcafc8), amber #67534e, red #7e4f4c (badge and id small in
    #f3ecdf on a tinted strip).
- **Dish row,** 95 tall, padding 10 14, gap 12:
  - **the qty token** (44×44, radius 10, Hanken 800 28):
    - a single is a quiet ring, `inset 0 0 0 2px rgba(243,236,223,0.13)`;
    - a multiple is solid #e7a53a with #130d1e ink;
  - **the name stack:** MY in Padauk 700 30, lh 1.6, over EN in Hanken 800 21;
  - **the ⋯ ghost,** 48×56, behind a 1px --bd hairline at the right.
  - **A started row** adds a 12% #e7a53a wash, a 4px inset #e7a53a left bar, and the tag "ချက်နေဆဲ"
    (13/700, #e7a53a).
- **Bump,** margin 10, 64 tall, radius 12, #5fb07e, ink #130d1e, centred:
  - "အားလုံး ပြီးပြီ" (Padauk 700 24) over "All done" (Hanken 800 16);
  - then a ✓ (22px, stroke 2.25).

#### THE FIVE STEPS

**STEP 1 — one Send, one card** (`s1`)

- **Eyebrow:** "အဆင့် ၁ / ၅" · "Step 1 of 5".
- **Title** (English-only, NEW): "One Send, one card".
- **Line** (English-only, NEW): "Every Send arrives as its own card, with its own clock — drinks too.
  Guests’ phones and the TV board follow your taps."
- **Picture:** Table 11's ticket at x185–511, y54–306 (252):
  - calm strip "စားပွဲ 11" | "0:04" over "ဆိုင်မှာ စား";
  - one row: "1" ring · "ကြက်သားဟင်း" / "Chicken Curry";
  - the bump.
  - **Its first child is the FLASH overlay:** `position:absolute; inset:0; border-radius:12px;
pointer-events:none`, with no base shadow.
- **Motion: the shipped arrival flash, once.** `m12Flash` 1400ms ease-out, delay 300ms,
  `animation-fill-mode: none`, so nothing shows during the delay. Reduced motion: no flash, the
  shipped rule (`globals.css:8531-8536`).

**STEP 2 — the round stub** (`s2`)

- **Eyebrow:** "အဆင့် ၂ / ၅" · "Step 2 of 5".
- **Title:** "အလှည့် 2" / "Round 2". The "2" is Hanken 800, `lang="en"`.
- **Line** (English-only, NEW): "The same table sent again. The new card wears this stub, and its All
  done serves only its own dishes."
- **Picture:** two Table 4 cards side by side, both starting at y20, **cut by the stage's bottom
  edge** at 360. The crop never reaches either bump.
  - **c1, ROUND 1,** x17–343:
    - amber strip "စားပွဲ 4" | "9:12" over "ဆိုင်မှာ စား";
    - a started row "2" solid · "မုန့်ဟင်းခါး" / "Mohinga" · "ချက်နေဆဲ";
    - a row "1" ring · "ရှမ်းခေါက်ဆွဲ" / "Shan Noodles".
    - **No stub.**
  - **c2, ROUND 2,** x353–679:
    - **a calm strip, 123 tall:**
      - row A: "စားပွဲ 4" | "0:04" over "ဆိုင်မှာ စား";
      - **row B, THE STUB** at the strip's 14px inset:
        - min-height 44, padding 0 16 0 14;
        - fill #3e3748;
        - a 2px solid #bcafc8 border on the top, left and bottom, with **border-right 4px dotted
          #bcafc8**;
        - radius 10 0 0 10;
        - the text: "အလှည့်" (Padauk 700 24, lh 1.6) and "2" (Hanken 800 24, tabular), in #f3ecdf.
    - then "2" solid · "လက်ဖက်ရည်" / "Burmese Milk Tea", and "1" ring · "အုန်းနို့သာကူ" / "Coconut
      Sago", cut by the crop.
    - Its first child is the flash overlay, as step 1.
- **Motion:** round 2's arrival flash only (`m12Flash`, as step 1). Round 1 never flashes (m5: the
  flash means new work landed on THAT card). Reduced motion: none.

**STEP 3 — All done, and the two ways back** (`s3`)

- **Eyebrow:** "အဆင့် ၃ / ၅" · "Step 3 of 5".
- **Title:** "အားလုံး ပြီးပြီ" / "All done".
- **Line** (two shipped bilingual sentences, stacked, gap 4):
  - "ဟင်းထွက်ပြီလား? အစိမ်းရောင် အားလုံး ပြီးပြီ ခလုတ်ကို နှိပ်ပါ။ တစ်ကတ် ပျောက်သွားပါမယ်။" / "Food
    ready? Tap the green All done button. The ticket clears."
  - "မှားနှိပ်မိရင် ၆ စက္ကန့်အတွင်း ပြန်ဖျက်လို့ ရပါတယ်။" / "Tapped by mistake? You have 6 seconds to
    undo." The 6 comes from the board's `UNDO_MS`, never typed.
  - If the MY of either runs two lines, set both MY runs at Padauk 400 18.
- **Picture:** a centred vertical stack, gap 32:
  - **A, y30–94:** the bump replica alone, 306×64, x195–501 (the shipped `help-pic-bump`).
  - **B, y126–190: THE UNDO PILL** (the shipped `.kds-undo`, static, centred, hugging its content,
    about 420 wide):
    - radius 999, padding 10 12 10 18, background **#f3ecdf** (cream: the board's one open-Undo pill),
      ink #100c19, a flex row, gap 12, shadow `0 8px 22px rgba(0,0,0,0.5)`;
    - "စားပွဲ 9 အားလုံး ပြီးသွားပြီ" (Padauk 700 15);
    - then the pill button: min-height 44, padding 0 16, radius 999, #e7a53a with #130d1e ink, weight
      800, "ပြန်ဖျက်" (Padauk 700 15).
  - **C, y222–270: THE RAIL** (centred, a flex row, gap 8, `align-items:center`):
    - the rail's label "ပြန်ယူ" (Padauk 700 15, #bcafc8);
    - one chip: min-height 48, padding 0 14, radius 12, **1px dashed rgba(243,236,223,0.13)**,
      #211a30, #f3ecdf 15/700, holding the undo glyph (16px) and "စားပွဲ 9".
- **Motion: the cream pill rises, once.** `m12Rise` 240ms `cubic-bezier(0.2,0.8,0.2,1)`, delay 500ms,
  backwards, on B. Reduced motion: shown.

**STEP 4 — Late is the loudest** (`s4`)

- **Eyebrow:** "အဆင့် ၄ / ၅" · "Step 4 of 5".
- **Title:** "နောက်ကျ" / "Late".
- **Line** (English-only, NEW): "A late card turns red and says Late — the loudest thing on the board.
  The Late count at the top counts only these."
- **Picture:**
  - **Three strips** (326×71 each, radius 12, x48–374):
    - y54–125 **calm:** "စားပွဲ 11" | "3:15" over "ဆိုင်မှာ စား" (#bcafc8);
    - y137–208 **amber:** "စားပွဲ 4" | "9:12" over "ဆိုင်မှာ စား" (#f3ecdf);
    - y220–291 **RED:** "စားပွဲ 2" | "13:05" over "နောက်ကျ · ဆိုင်မှာ စား" (#f3ecdf).
  - **At the right** (x470–650, y118–198), the head's glance stats as Mom will read them, gap 24:
    - "5" (Hanken 800 32, #f3ecdf) over "ဖွင့်ထား" (Padauk 700 15, #bcafc8);
    - "1" (Hanken 800 32, **#e0855f**) over "နောက်ကျ".
- **Motion: the red strip's shipped pulse, three times only.** `m12Pulse` 1600ms ease-in-out, 3
  iterations (4.8s, under WCAG 2.2.2's 5s), delay 300ms, then rest. Under reduced motion the strip is
  still, and the badge's word "နောက်ကျ" still tells red from amber.

**STEP 5 — the stop-cooking card** (`s5`)

- **Eyebrow:** "အဆင့် ၅ / ၅" · "Step 5 of 5".
- **Title** (English-only, NEW): "Stop cooking".
- **Line** (English-only, NEW): "When the counter clears a table that still has food on your board,
  its card turns into this. Stop those dishes, then tap Got it — it stays until you do."
- **Picture: THE STOP CARD**, at x185–511 (326), y6–354. It is kitchen-ops' card as PATH_DESIGN
  decides it: struck dish rows plus the warn word, ALARM tier with no motion, never dashed, never
  cream, no warn ground fill.
  - **Strip:** calm #211a30, 71 tall:
    - **left:** "စားပွဲ 3" (Padauk 700 32);
    - **right:** a row, gap 6: the alert glyph (20px, #e0855f), then "Left — stop cooking" (Hanken
      800 18, lh 1.2, #e0855f, right-aligned, at most two lines).
  - **Rows:**
    - "1" ring · "မုန့်ဟင်းခါး" / "Mohinga";
    - "1" ring · "ရှမ်းခေါက်ဆွဲ" / "Shan Noodles".
    - Each name stack has a **strike**: an absolute 2px #e0855f line across the stack's vertical
      middle, `transform-origin: left`. The names keep full ink.
  - **Button,** margin 10, 64 tall, radius 12, #e7a53a, ink #130d1e: "ရပြီ" (Padauk 700 24) over
    "Got it" (Hanken 800 16).
- **Motion: the two strikes draw, once.** `m12Strike` 600ms ease-out, delay 400ms, backwards (base
  `transform: scaleX(1)`). The card itself never moves. Reduced motion: struck.

### COPY (English) — verbatim

- **Bar and head (backdrop):** Kitchen · All · Wok · Cold · Drinks (Latin by owner decision) · the
  stat figures 0 and 0 · Screens · TV board · Sound · Text size · Help · Lock (the accessible names).
- **Guide chrome:** Step 1 of 5 (… 5 of 5) · Close · Back · Next · Got it (the last step) · Open this
  any time from the gold Help circle.
- **Step 1:**
  - One Send, one card (NEW);
  - Every Send arrives as its own card, with its own clock — drinks too. Guests’ phones and the TV
    board follow your taps. (NEW);
  - picture: 11 · 0:04 · Chicken Curry · All done.
- **Step 2:**
  - Round 2;
  - The same table sent again. The new card wears this stub, and its All done serves only its own
    dishes. (NEW);
  - picture: 4 · 9:12 · 0:04 · 2 · Mohinga · Shan Noodles · Burmese Milk Tea · Coconut Sago.
- **Step 3:**
  - All done;
  - Food ready? Tap the green All done button. The ticket clears.;
  - Tapped by mistake? You have 6 seconds to undo.;
  - picture: All done · 9.
- **Step 4:**
  - Late;
  - A late card turns red and says Late — the loudest thing on the board. The Late count at the top
    counts only these. (NEW);
  - picture: 11 · 3:15 · 4 · 9:12 · 2 · 13:05 · 5 · 1.
- **Step 5:**
  - Stop cooking (NEW);
  - When the counter clears a table that still has food on your board, its card turns into this.
    Stop those dishes, then tap Got it — it stays until you do. (NEW);
  - picture: 3 · Left — stop cooking (kitchen-ops' card words, English-only in the record) · Mohinga ·
    Shan Noodles · Got it.
- **Accessible names:** Steps · Step N of 5 · Board status · Service stats · Station filter.

### COPY (Burmese) — with sources

**The guide's own words** (all shipped):

| String                                                                                | Key / source                                                                           |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| အဆင့် ၁ / ၅ (… ၅ / ၅)                                                                 | `help.step`, staff.ts:2616 (fill.ts:37)                                                |
| ပိတ်                                                                                  | `shell.close`, staff.ts:69                                                             |
| နောက်သို့ · ရှေ့ဆက် · ရပြီ                                                            | `help.back` · `help.next` · `help.done`, staff.ts:2617-2619                            |
| ရွှေရောင် အကူအညီ အဝိုင်းကနေ အချိန်မရွေး ပြန်ဖွင့်လို့ ရပါတယ်။                         | `help.footer`, staff.ts:2620-2623                                                      |
| အားလုံး ပြီးပြီ                                                                       | `kds.bump`, staff.ts:179 (K15-HIGH)                                                    |
| ဟင်းထွက်ပြီလား? အစိမ်းရောင် အားလုံး ပြီးပြီ ခလုတ်ကို နှိပ်ပါ။ တစ်ကတ် ပျောက်သွားပါမယ်။ | `help.how.kitchen.1`, staff.ts:2510-2513 (K15-HIGH)                                    |
| မှားနှိပ်မိရင် ၆ စက္ကန့်အတွင်း ပြန်ဖျက်လို့ ရပါတယ်။                                   | `help.how.kitchen.2`, staff.ts:2519-2522 (`{n}` from `UNDO_MS`, KdsBoard.tsx:77, 1165) |
| နောက်ကျ                                                                               | `kds.stat.late`, staff.ts:196 (K15-HIGH)                                               |

**Inside the pictures and the backdrop** (shipped):

| String                                                                 | Key / source                                                                               |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| မီးဖိုချောင်                                                           | `kds.title`, staff.ts:151 (OWNER-VERIFIED)                                                 |
| ဖွင့်ထား · နောက်ကျ                                                     | `kds.stat.open` :195 · `kds.stat.late` :196                                                |
| ရှင်းပြီ                                                               | `kds.allclear`, staff.ts:198 (the head's region on an empty board, KdsBoard.tsx:1224-1225) |
| စုစုပေါင်း                                                             | `kds.allday.chip`, staff.ts:205                                                            |
| ချက်စရာ ဘာမှ မရှိပါ                                                    | `kds.empty`, staff.ts:234                                                                  |
| စားပွဲ 2 / 3 / 4 / 9 / 11                                              | `kds.table`, staff.ts:170                                                                  |
| ဆိုင်မှာ စား                                                           | `kds.channel.dinein`, staff.ts:164                                                         |
| နောက်ကျ · ဆိုင်မှာ စား                                                 | the badge: `kds.stat.late` + channel (kds-urgency badge keys; KdsBoard.tsx:1610-1612)      |
| ချက်နေဆဲ                                                               | `kds.line.cooking`, staff.ts:187                                                           |
| စားပွဲ 9 အားလုံး ပြီးသွားပြီ                                           | `kds.undo.bumped`, staff.ts:257 (`{x}` = the ticket's label)                               |
| ပြန်ဖျက်                                                               | `kds.undo`, staff.ts:255 (K15-HIGH; D3: erase the mark you just made)                      |
| ပြန်ယူ                                                                 | `kds.recall`, staff.ts:254 (K15-HIGH; D3: bring back what left)                            |
| ကြက်သားဟင်း · မုန့်ဟင်းခါး · ရှမ်းခေါက်ဆွဲ · လက်ဖက်ရည် · အုန်းနို့သာကူ | the catalog's `name_my` (MENU_REFERENCE.md, as m5 cites :73, :27, :31, :156, :147)         |
| the done state's subtitle                                              | `kds.empty.hint`, staff.ts:239-242                                                         |

**Drafts reused inside replicas only** (other streams', rendered through their keys):

| String                             | Owner and source                                                                                                                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| အလှည့် 2 (step 2's title and stub) | m5's `kds.round` "အလှည့် {n}" DRAFT (picked-m5.md:326; PATH_DESIGN decision 7, the decided vocabulary), kitchen-ops. The title renders through the same key, so it follows the sitting |

**Not drawn in Burmese, on purpose:** the stop card's warn word, "Left — stop cooking". PATH_DESIGN
records it in English only. kitchen-ops owns its Burmese, and the brief's draft is not in the
decided record. The guide shows whatever kitchen-ops ships.

**Recommended to kitchen-ops:** the stop card's button reuses `help.done` "ရပြီ · Got it" (shipped).
Then the guide's last primary and the card's button are the same words.

### MOTION

| Step | What moves (one thing)                     | Keyframes · timing                                 | Reduced motion                |
| ---- | ------------------------------------------ | -------------------------------------------------- | ----------------------------- |
| 1    | the card's arrival flash (the shipped one) | `m12Flash` 1400ms ease-out, delay 300ms, fill none | no flash                      |
| 2    | round 2's arrival flash; round 1 still     | `m12Flash` as step 1                               | no flash                      |
| 3    | the cream Undo pill rises                  | `m12Rise` 240ms, delay 500ms                       | the pill, shown               |
| 4    | the red strip pulses, three times          | `m12Pulse` 1600ms ease-in-out ×3, delay 300ms      | still, and the word says Late |
| 5    | the strikes draw across the two dishes     | `m12Strike` 600ms ease-out, delay 400ms            | struck                        |

The backdrop never moves. Nothing loops: the pulse stops after 4.8 s. There is no chime and no sound.

### A11Y

- **One live region:** the head's `<p role="status">` "ရှင်းပြီ" (KdsBoard.tsx:1194-1230). The guide
  adds none.
  - In the product, a step change moves focus to `h2#guide-h`.
  - Close and the last primary move focus to the empty state's title. Give that title `tabIndex -1`;
    kitchen-ops owns KdsBoard.
  - When the first ticket replaces the guide, focus goes to `ul.kds-grid`, never a bump.
- **Landmarks:**
  - The guide is `<section aria-labelledby="guide-h">`.
  - The KDS's h1 is the bar title, so the guide's title is an h2.
- **Dots:** as screen 1, named by `help.step`.
- **Targets:** Close 44 or more · dots 44×44 · Back and Next 64 (the board's `--tap-bump`) · the bar's
  circles 44.
- **The picture is `aria-hidden` and inert.** Its controls are replicas and can never fire
  (`.help-pic` sets `pointer-events: none`).
- **Never colour alone:**
  - Late is the word in its badge as well as red;
  - the stub is a shape plus a word;
  - the stop card is struck rows plus a warn word;
  - the two ways back are a cream pill with ပြန်ဖျက် against a dashed chip under ပြန်ယူ.
- **Contrast** (computed in scratchpad m12calc/c.py):

  | Pair                                              | Ratio                                                                          |
  | ------------------------------------------------- | ------------------------------------------------------------------------------ |
  | #f3ecdf on the stage #322842                      | 11.78                                                                          |
  | #bcafc8 on the stage                              | 6.66                                                                           |
  | #f4c879 eyebrow on #2b213c                        | 9.66                                                                           |
  | #130d1e on #e7a53a                                | 8.91                                                                           |
  | #130d1e on #5fb07e (bump)                         | 7.24                                                                           |
  | #100c19 on the cream pill #f3ecdf                 | 16.42                                                                          |
  | #f3ecdf on the red strip                          | 5.75, and 3:1 or more at the pulse peak for 24px+ bold text (m5 computed 3.34) |
  | #e0855f warn word and strike on #211a30 / #2b213c | 5.55 or more                                                                   |
  | #a69eb1 dots and footer on #2b213c                | 5.88                                                                           |

  The strike stays on the card ground, never over a tinted strip, where it would be 2.47:1.

- **Burmese:** as screen 1. A Latin id or clock inside a Burmese run is `lang="en"`.
- **Text dial:** in the product, the pictures carry the board's `data-size`. A Large board shows Large
  replicas, and the well crops them.

---

## DATA

### What each screen reads (all of it exists today)

**Counter:**

- the signed-in account (`requireStaffPage` → `caller.staffId`, `app/staff/page.tsx:91`);
- the floor snapshot the page already reads: rows, `counterRequestedAt` (floor.ts:515), and the
  frozen state;
- the split pane's selection (idle or not);
- `localStorage`;
- the constant `PICKED_UNDO_MS` (`lib/expo-rules.ts:125`) for step 5's "6".

**Kitchen:**

- `caller.staffId` (`app/staff/kitchen/page.tsx:20`);
- the board's snapshot (`tickets.length`, `degraded`, `err`; KdsBoard);
- `localStorage`;
- the constant `UNDO_MS` (`KdsBoard.tsx:77`) for step 3's "6". m9 already moves it to `lib/` as
  `KDS_UNDO_MS`, and the guide reads that.

**Both:** the shipped dictionary (`lib/i18n/staff.ts`) and `fill.ts`'s numeral rule.

### What does not exist today

**No new server reads, no writes, no migration, no RPC and no realtime.**

| New piece                              | What it is                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Stream                                                                                                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`lib/help.ts` — the guide model**    | `GUIDE_STEPS: Record<HelpDoorScreen, GuideStep[]>`, each `{ title: StaffKey; lines: StaffKey[]; vars?; picture: GuidePictureId }`. `guideSeenKey(screen, staffId)` = `mms.guide.seen:<screen>:<rev>:<staffId>`. `guideDue({ stored, quiet })` is true only when `stored === null` and `quiet`. **Mutants** (verify:slice): a seen key → not due; storage refused → not due; not quiet → not due; two staff ids → two keys; two screens → two keys; the revision is in the key. The help.test convention extends: every guide key exists in STAFF; exactly 5 steps per screen; **no guide step names `help.how.kitchen.2.more`** (a red-first pin for D3(c)). | kitchen-ops                                                                                                                                                   |
| **`components/staff/StepGuide.tsx`**   | One component, `host: "inplace" \| "sheet"`. It owns the step state, focus-to-title, the 400 ms arm and the haptic. In the sheet host, the guide's Close is not drawn (the sheet's ✕ is the close).                                                                                                                                                                                                                                                                                                                                                                                                                                                          | kitchen-ops                                                                                                                                                   |
| **`HelpPicture.tsx` — `GuidePicture`** | The ten pictures, each the real control in its own declaration, cropped. The `help-pic-*` paint refusal (HelpPicture.test.tsx) extends to `guide-pic-*`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | kitchen-ops (already claims HelpPicture.tsx)                                                                                                                  |
| **`globals.css`**                      | `.guide-*` placement and the step keyframes, each with its reduced-motion escort. globals.css is in the mutate set.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | kitchen-ops                                                                                                                                                   |
| **The kitchen host**                   | `KdsBoard` renders `<StepGuide host="inplace" screen="kitchen">` in place of `EmptyState` when `guideDue` at mount, the whole board is empty, it is not degraded and there is no error.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | kitchen-ops                                                                                                                                                   |
| **The counter host**                   | `TablePane` renders it in place of the idle `EmptyState` when `guideDue` at mount, the pane is idle, no row has `counterRequestedAt`, and the floor is not frozen. The page passes `staffId` and `quietAtMount`.                                                                                                                                                                                                                                                                                                                                                                                                                                             | counter-floor (one handoff)                                                                                                                                   |
| **The Help door**                      | Row 1, "How this screen works" (shipped), opens the guide in the sheet. Row 2 is NEW, "More on this screen" · "{n} cards, with pictures", and opens the shipped cards unchanged. The old auto-open (`helpSeenKey`) retires: the guide's key replaces it.                                                                                                                                                                                                                                                                                                                                                                                                     | **HelpButton.tsx is frozen this wave** (final-kitchen-ops.md:224). It needs the owner's scoped unfreeze for kitchen-ops, as D1(a) gave diner-cart CartBar.tsx |

### New strings (English-only, for the native sitting, K15 · kitchen-ops)

The fourteen strings are listed in the structured summary. Money-adjacent lines are K15-HIGH
candidates: counter step 4, counter step 5 and kitchen step 5.

### Ships when (each station is ONE revision, so each person has one first morning)

- **Kitchen guide:** after PD5 (m5's re-key and `kds.round`), the stop card and its durable stop
  record (M182 + kitchen-ops, Codex correction 12), and m9 (the TV board, for step 1's "and the TV
  board").
- **Counter guide:** after counter-floor's hollow ring (P2do), PD2's pane pass, PD6's till tray (with
  guards-style's `--fs-pass` token), and M182's clear window (m7).
- If the owner wants the guides sooner, each step is gated by its control's presence and the
  revision bumps once at the end. That costs one more first morning per person; it is not
  recommended.

### Docs in the same PR

- DESIGN-LANGUAGE: the guide pattern (one card, one motion, the real control, in the quiet space).
- `lib/help.ts`'s docblock: "a device fact" becomes "a device fact, per person, per station".
- OPEN-ITEMS: its PD row, and the K15 rows for the fourteen strings.
- HANDOFF.

---

## VERIFIED CLAIMS (checked against the repo at f1110aa)

| Claim                                                                           | Verdict                 | Evidence → design consequence                                                                                                           |
| ------------------------------------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| The Help door auto-opens once, per device, per screen                           | TRUE                    | lib/help.ts:17-20, :52-55; HelpButton.tsx:241-262 → re-keyed per person                                                                 |
| There is a kitchen or counter role                                              | **FALSE**               | staff_identity.sql:12 (server · manager · owner) → the station is the role                                                              |
| Both stations know who is signed in                                             | TRUE                    | kitchen/page.tsx:20-24; staff/page.tsx:91-99                                                                                            |
| Seen is marked at open; refused storage never auto-opens                        | TRUE                    | HelpButton.tsx:247-251, :256-258 → kept                                                                                                 |
| The shipped first-run doesn't block service                                     | **FALSE**               | a Sheet, a centred 34rem dialog with a scrim from 48em (HelpButton.tsx:496-511; globals.css:11314-11330) → the first run moves in place |
| The counter pane idles with an EmptyState                                       | TRUE                    | TablePane.tsx:372-380 → the counter host                                                                                                |
| The empty kitchen board renders an EmptyState, with a degraded variant          | TRUE                    | KdsBoard.tsx:1309-1318 → the kitchen host, never over a degraded board                                                                  |
| The five steps cover the shipped cards                                          | **FALSE**               | staff.ts:2510-2614 (7 lessons not covered, 3 K15-HIGH) → the cards are kept under row 2                                                 |
| Help pictures are the real controls                                             | TRUE                    | HelpPicture.tsx:11-32; the test parses CSS → real size, cropped                                                                         |
| The KDS undo is 6 s and recall is 2 min                                         | TRUE                    | KdsBoard.tsx:77-78, :1165 → quoted through `{n}`                                                                                        |
| Late is a fixed 12 minutes                                                      | **FALSE**               | kds-urgency.ts:13-20 (configurable) → no minutes quoted                                                                                 |
| Late always pulses                                                              | **FALSE** under RM      | globals.css:7912-7923, :8531-8536; KdsBoard.tsx:1613-1618 → "turns red and says Late"                                                   |
| The Late count counts exactly the red tickets                                   | TRUE                    | kds-urgency.ts `kdsLateCount` (:53-63); `.kds-stat-late` only when it is above 0 (KdsBoard.tsx:1185, globals.css:7764-7766)             |
| The bump is green                                                               | TRUE                    | globals.css:8248-8262 (`--ok`) → help.how.kitchen.1's "green" holds                                                                     |
| The undo pill is cream with a gold button, and the help replica shares its rule | TRUE                    | globals.css:8472-8503                                                                                                                   |
| Recall chips are dashed                                                         | TRUE                    | globals.css:8458-8470                                                                                                                   |
| ပြန်ဖျက် is the Undo and ပြန်ယူ is Bring back                                   | TRUE                    | staff.ts:254-255 (D3)                                                                                                                   |
| help.how.kitchen.2.more names the bar with ပြန်ယူ                               | TRUE                    | staff.ts:2526-2529 → never shown by the guide (D3(c))                                                                                   |
| Only the ask tile fills                                                         | TRUE                    | globals.css:14421-14426 (only `data-tone="ask"` sets a background)                                                                      |
| A started free table reads Ordering                                             | **FALSE**               | floor-tone.ts:47-48; TableStrip.tsx:69-72 (`seated` → `rest`, people, no bar) → step 1 is free → seated                                 |
| The owed mark is the hollow ring                                                | **NOT YET**             | today it is a solid warn dot (globals.css:14490-14502; TableStrip.tsx:336) → step 2 ships after the ring                                |
| "Not sent yet · မပို့ရသေး" is shipped                                           | TRUE                    | staff.ts:2909                                                                                                                           |
| Guests' phones show each dish's stage live                                      | TRUE                    | TableTimeline.tsx:143-147 (Being made · With the kitchen · Served); line-state-copy.ts:11-17                                            |
| The TV board shows per-dish progress                                            | **NOT YET**             | m9 is a design → step 1's TV clause ships after m9                                                                                      |
| The tray takes nothing until Take                                               | TRUE (as m6 designs it) | `settle.cash.settleAmount`, staff.ts:1720 is the commit; m6's cancel line                                                               |
| The clear window is 6 s, with a 400 ms arm                                      | TRUE (the constants)    | expo-rules.ts:125, :142 (m7 reuses them)                                                                                                |
| The same-gesture guard is 350 ms                                                | TRUE                    | packages/ui/src/gesture.ts:15                                                                                                           |
| "Skip" has a shipped Burmese                                                    | **FALSE**               | no key; `shell.version.notNow` promises "later" (staff.ts:4021) → Close (staff.ts:69)                                                   |
| HelpButton.tsx may be edited this wave                                          | **FALSE**               | final-kitchen-ops.md:224 and every card's rule 9 → the owner unfreezes                                                                  |
| kitchen-ops owns HelpPicture.tsx                                                | TRUE                    | final-kitchen-ops.md:82, :86                                                                                                            |
| The round stub and the stop card exist                                          | **NOT YET**             | kitchen.ts:307, :347-371, :180-211 (per m5 and Codex correction 12) → the gating above                                                  |

---

## DECISIONS

1. **Two guides, five steps each, as the owner asked.** Each walks the loudness ladder, so the guide
   teaches PATH_DESIGN's language by its order:
   - **counter:** CALM map → MARK ring → CALL ask → the gold till → dashed Undo;
   - **kitchen:** card → MARK stub → the two ways back → ALARM Late → ALARM-still stop card.
2. **The station is the role.** Each guide shows once per person, per station, per tablet. The key is
   localStorage with the staff id. There is no DDL and no server write.
3. **It offers itself only when the screen is quiet, decided at mount, and never as a modal.**
   - Counter: in the idle pane, beside a live floor.
   - Kitchen: on the empty board.
   - A busy first open waits for the next quiet open.
4. **It is marked seen the moment it shows, so it never auto-reopens.** Storage refused means it
   never auto-shows. Both are the shipped rules.
5. **Work always wins.** A table tap or a landing ticket replaces the guide at once, focus is
   rescued, and the guide never returns on its own.
6. **Help's first row, "How this screen works" (shipped title and sub, now true of the guide), opens
   the same guide in the Help sheet.** A NEW second row, "More on this screen", keeps every shipped
   card whole: Sold out, Cook now, Walk-up, the bags, paper, the doors and the lock. Nothing is
   retired, and D3(c)'s re-word stays with the sitting.
7. **Every picture is the real control at its real size, cropped** (the HelpPicture rule). Pictures
   follow the KDS text dial. Nothing is ever drawn as a scaled illustration.
8. **Each title is the control's own word, through the control's own key** (pointing-and-calling).
   Sentences reuse shipped help lines where one says it (counter 1; kitchen 3). Otherwise they are
   English-only and listed. There is no invented Burmese.
9. **One motion per step, played once.** It is the board's own motion where one exists (the arrival
   flash, the red pulse), otherwise a short entrance that ends on the taught frame. The pulse plays
   three times (4.8 s, under WCAG 2.2.2's 5 s). Reduced motion draws the end frame.
10. **Steps move only on Back, Next or a dot.** There is no auto-advance, no swipe (wet hands) and no
    sound; the shipped "pick" haptic plays. Step 1 keeps an empty Back slot, so Next never moves. A
    400 ms arm holds every control after mount.
11. **Close (ပိတ်) is the skip control.** "Skip" has no shipped Burmese, and "Not now / နောက်မှ"
    promises a return the guide never makes. Close sits top-right on every step.
12. **The last primary is the station's own word.**
    - Counter: "Back to the counter", the seal's hero (decision 8), the same act, since the pane goes
      back to idle.
    - Kitchen: "Got it", which the stop card it just taught should also say.
13. **The guide adds no live region.** The host's one region keeps speaking. Focus moves to each
    step's title.
14. **Kitchen step 3 teaches D3's two words in their own places:** ပြန်ဖျက် on the cream pill (6 s)
    and ပြန်ယူ on the dashed rail. It never shows `help.how.kitchen.2.more`. Whatever the native
    sitting rules, the guide follows through the same keys.
15. **Kitchen step 1 says drinks are on the board and that guests' phones and the TV board follow
    Mom's taps.** This is the operational fact behind D5's served gate and m9's wall, and the thing
    the device sitting must confirm.
16. **Counter step 3 teaches the One Pass.** The filled tile leads to the same pass the guest holds,
    at `--fs-pass` (m2).
17. **No card, approval or D5 words on either guide.**
    - The counter teaches cash, which is true before and after C2 (ruling #11; D5's phone pay is the
      guest's door).
    - m8's flag card explains itself, and `ASKER_BY_PIN` stays off (D4).
    - The TV board's own static key is the guests' guide (m9 decision 22).
18. **No training mode.** The guide never puts sample tickets or sample tables on a live board.
    Pictures live only in the inert well.
19. **Numbers in sentences come from constants:** the KDS undo is 6 s and the clear window is 6 s,
    both through `{n}`. Late quotes no minutes.
20. **Each station's guide ships as one revision, after every control it teaches** (DATA, "Ships
    when").
21. **Ownership: kitchen-ops builds the guide, its model and its pictures, and the kitchen host.**
    counter-floor adds the idle-pane host. HelpButton.tsx needs the owner's scoped unfreeze.
22. **The example data is like for like** with m2 ($46.41, Table 4), m5 (Tables 2, 4, 9 and 11), m6
    (the $50 note) and m7 (Tables 3 and 7).

---

## OPEN RISKS

1. **The Help door is frozen.** Without the owner's unfreeze of HelpButton.tsx, the guide can ship
   first-run only. Help's rows would stay as today, and "How this screen works" would still open the
   old cards. Recommend the unfreeze ride the guide's PR, scoped to the two rows and the guide host.
2. **The guides are a capstone.** The new marks (ring, stub, tray, window, stop card) reach Mom and
   Dad before their guide does. The device sitting (#12) is the in-person bridge. The shipped help
   cards still teach every shipped control meanwhile.
3. **Picture tickets on an empty Night board could be glanced as real ones.** The mitigations are the
   inset well, the card frame, the "Step N of 5" eyebrow and the head's "ရှင်းပြီ" with "0" open.
   Check at the device sitting. If Mom reaches for a picture bump even once, frame the stage with a
   1px dashed --bd edge (the "provisional" mark) as the fallback.
4. **A counter whose every first open is busy never sees the auto guide.** For example, a table is
   always asking to pay at load. Help still opens it. Measure on the pilot. If it happens, relax
   "no table asking" to "pane idle" only, because the pane host never blocks the floor anyway.
5. **A shared login defeats "per person".** If the family shares one account, the guide shows once
   for the account, not per human. That is honest, but worth saying at the sitting.
6. **Most step sentences are English-only until the native sitting,** and Mom reads Burmese first.
   The titles (shipped words) and the moving pictures carry each step, so the sitting should draft
   the fourteen strings first. Kitchen steps 1 and 5 have English-only TITLES too, so they matter most.
7. **The stop card is kitchen-ops' unbuilt card.** If it ships with motion, a chime, a different
   word or another button, step 5's sentence and picture follow it. The guide waits for it either
   way.
8. **"Guests' phones and the TV board follow your taps" depends on m9.** If m9 is held, ship the
   sentence without "and the TV board", which is one key edit.
9. **The 432px pane wraps long Burmese titles to two lines.** At large text zoom the card scrolls
   inside the pane's own scroller. The foot (dots, pager) is sticky, so Next never leaves view. This
   is measured headless at 1366, as the till tray was.
10. **Pulse performance on the kitchen tablet.** `filter: brightness` is the shipped Late pulse's own
    cost, already on the board, so nothing new; the guide plays it at most three times.

---

## Appendix — what changed after this spec (applied in the drawn screens)

The spec above was written first. The round-3 consistency pass and an adversarial critic then changed it, and
the screens on the canvas were drawn with both applied. **Where an item below contradicts the spec above, the
item below wins**, and PATH_DESIGN_2026-10-07.md (its round-3 section) wins over both.

### A · System amendments (the round-3 consistency pass)

1. Counter step 5 draws the slab m7's critic retired (B5/B6): a green --okb ground, a ring, and the claim at rest. Redraw it.

- At rest, the card shows only the quiet hint 'ထွက်သွားရင် ရှင်းပါ · Clear when they leave'.
- The GO face is Table 7's card as Dad has reached for it (the lit cap), with m7's paper-secondary verb on --cd.
- The card then turns into the Undo window.

2. Counter step 2: retire the ring's self-draw, because a MARK never moves in the product. Its one motion becomes the product's own change: after the Send, the ring row cross-fades into the in-kitchen row. That teaches cause and effect.
3. Kitchen step 5: retire the strike-draw, because the stop card is ALARM without motion. Instead, one cross-fade shows the ticket turning into the stop card, with the strikes drawn at rest.
4. Kitchen step 1's line teaches the shared words: 'Every Send arrives as its own card — drinks too. Start makes it ချက်နေဆဲ · Cooking, and Done or All done makes it ထုတ်ပြီး · Served, on guests’ phones and the TV board.' The English is new; the Burmese is shipped. Drop the TV clause if m9 is held.
5. Counter step 3 renders the real CounterPass in landscape at --fs-pass, with --pass-hole set to the stage ground. It is the same object as m2's pane and the guest's pass. The counter guide also ships after post-pay's primitive.
6. Guide grammar is shared with m11: Close · ပိတ်, the shared seen-key helper, dots, and the 400 ms console arm. Kitchen step 3 keeps D3's two words in their places. HelpButton.tsx still needs the owner's scoped unfreeze.

### B · The adversarial critic's blocking fixes (verdict: fix)

1. **Kitchen step 4 plays the Late PULSE inside a guide picture, three times. The vocabulary forbids this outright, and on the in-place host it is an ALARM breathing on a live board that has no late ticket.**
   - Evidence: picked-m12.md:929-931 (`m12Pulse` 1600ms, 3 iterations), :1044, :1047 ("the pulse stops after 4.8 s") and decision 9 (:1216-1218) all justify it as "under WCAG 2.2.2's 5s". The vocabulary says: "PULSE: ALARM only, meaning KDS Late. No pass, track, TV element or guide picture loops or breathes." PATH_DESIGN:126 says "Late keeps the board's only motion." The shipped `kdsRedPulse` is the live ticket's motion (globals.css:7912-7923). While the picture pulses, the real head's one live region reads ရှင်းပြီ (KdsBoard.tsx:1224-1225, brief :761).
   - Fix: Draw the red strip still, at its final frame. Step 4 gets no motion: the badge word နောက်ကျ already separates red from amber (KdsBoard.tsx:1610-1618). Delete `m12Pulse` from the keyframes, the MOTION row and decision 9's "three times" rationale.
2. **Most step motions are neither the product's own nor in the ONE MOTION LANGUAGE. They animate CALL and MARK elements the record keeps still, and the ALARM-without-motion card. The durations are off-language literals.**
   - Evidence: The vocabulary says "GUIDES … Motions are the product's own" and "ONE MOTION LANGUAGE, all from kit tokens" (RISE 480ms, POP 180ms). The violations:

- Counter s1 (:457-460) and s3 (:513-517) POP a tile changing tone. The tile CSS says "Tone changes are INSTANT" (globals.css:14413-14415), and CALL is "one STILL filled tile" (PATH_DESIGN:121). s3's POP also runs at 240ms, not 180.
- Counter s2 (:483-484) has the ring draw itself (`m12Draw`). That motion is not in the language, and the ring is MARK: "glyph plus word, no fill, NO MOTION" (PATH_DESIGN:121-122).
- Counter s4 (:542-543) plays RISE at 240ms. m6's own motion is `mms-pop` on the Change figure, on a tile tap only (m6-walk-up-cash.md:367). RISE is 480ms (`--dur-slow`, globals.css:1073) and means "issued".
- Counter s5 (:582-585) runs a 240ms crossfade that it calls "the card turns". m7's tap swaps the slab for the slot with nothing written and no motion (m7-clearing-a-table.md:274-279), and TURN is reserved for a pass's stage.
- Kitchen s3 (:912-913) RISEs the cream pill. `.kds-undo` declares no entrance animation (globals.css:8472-8490).
- Kitchen s5 (:953-954) draws the strikes over 600ms. The stop card is "ALARM tier without motion" (PATH_DESIGN:124-126; m5 appendix A1).
- The 180, 240, 600 and 1600ms values are literals, not `--dur-fast`, `--dur-base` or `--dur-slow` (tokens.css:94, :141-142).
  - Fix: Each step plays only its control's shipped motion, using kit tokens, or nothing (the final frame, still):
- s1, s3 and s5: an instant face swap, or the end frame only.
- s2: the ring drawn, still.
- s4: `mms-pop` on the $3.59 numeral only.
- Kitchen s1 and s2: keep the shipped FLASH.
- Kitchen s3 and s5: still.

Reword decision 9 and the brief's "one small motion per step" to "the product's own motion, or none", and update both MOTION tables. 3. **Several pictures redraw controls that the decided appendices retired. Each brief cites a canvas-brief BODY that its appendix overrides, so the guide would teach Mom and Dad shapes they will never see.**

- Evidence: PATH_DESIGN:55-58: "Where the appendix contradicts the spec body, the appendix wins." The retired controls:
- (a) Counter s5 face GO (:551-563) draws a standing slab on --okb #eaf2ec, with a 32px --ok ring and a check, on a card at rest. m7 appendix B5 says "Drop the ring… paper secondary (--cd, 1px --bd top line), verb in --tx, no green ground". m7 B6 and PATH_DESIGN:339-341 say there is no standing slab: at rest the card shows only "ထွက်သွားရင် ရှင်းပါ · Clear when they leave", and the verb appears only once the card is selected or in its pane.
- (b) Face CLEARING wears the 45° pending hatch (:565-567). m7 B8: "Delete the hatch" (clearing is the dashed chip plus a 2px dashed tile edge).
- (c) The Undo cell carries two aria-hidden seconds leaves, " · ၆ စက္ကန့်" and " · 6s" (:574-576). m7 B1 says to keep ONE seconds leaf, with the English echo reading just "Undo"; PATH_DESIGN:102-104 agrees.
- (d) The kitchen s2 stub is filled #3e3748, has no notches and a 4px dotted edge (:876-882). m5 B4: "Drop the wash… outline plus word only". m5 B5: "dotted edge plus 12px coupon notches". The vocabulary's perforation is 2px everywhere except the TV tier.
- (e) Counter s3's pass label is Padauk 15 "စားပွဲ" with "Table" in --t3 (:503-504). m2 appendix A3/B3 (the critic's fix): "'စားပွဲ 4' is full ink --tx at --fs-h2".
  - Fix: Redraw from the appendices:
- (a) s5 GO is the selected card (lit cap) or the pane, with the paper-secondary verb "They’ve left — clear Table 7": no ring, no green ground.
- (b) CLEARING is the dashed chip only, with no hatch.
- (c) The Undo cell is --sf with a 1.5px dashed --ac edge, "ပြန်ဖျက်" plus ONE aria-hidden " · ၆ စက္ကန့်", over "Undo".
- (d) The stub is an outline only, with a 2px dotted perforation and 12px notches, built from the CounterPass/stub primitive.
- (e) The pass label is full ink at --fs-h2.

Cite the decided docs/path-design-2026-10-07 files, not the canvas-brief bodies. 4. **The in-place kitchen host paints a false ALARM on the live board. Step 4's picture repeats the head's glance stats as "5 Open / 1 Late", with the 1 in --warn, directly under the real head reading 0 / 0. The guide stays at whatever step Mom left it, so a red Late ticket and a warn count can stand on an empty board, seen from the stove.**

- Evidence: Brief :926-928 is the stat replica ("1" in #e0855f = Night --warn). Brief :758-761 and KdsBoard.tsx:1180-1188 and :1224-1225 are the real head's "0 / 0" and its "ရှင်းပြီ" region. WHEN rule 5 (:143-148) dismisses the guide only on Close, finish or a landing ticket. PATH_DESIGN:124 says "No fact is marked twice on one screen", and on the ladder Late is the one ALARM. The brief's decision 18 (:1243-1244) says it "never puts sample tickets … on a live board". Risk 3 (:1264-1267) admits the glance confusion but defers the fix until "Mom reaches for a picture bump even once".
- Fix: Drop the head-stat replica. The line already points at the real one ("The Late count at the top counts only these"). Resolve risk 3 before ship, not after a mis-read: crop the ticket replicas so no complete ticket (strip, rows and bump) is drawn on the live board, and keep the red strip still (blocking 1). Do not use a dashed frame for this, because dashed means provisional.

5. **Two first-run paths are still modal over live work, contradicting the brief's own change 2 and decision 3. Below 64em the guide auto-opens in the Help Sheet over the live counter floor. Under OPEN RISK 1's fallback (no unfreeze of HelpButton.tsx), the shipped device-keyed auto-open is never retired, so a fresh tablet gets the modal Help Sheet AND the in-place guide on the same load.**
   - Evidence: WHEN rule 7 (:155-156) auto-opens in the Sheet. That Sheet is a Radix modal with a focus trap, aria-modal and scroll lock (packages/ui/src/sheet.tsx:2-12). The brief's change 2 (:48-56) says "A dialog that opens itself over a board… blocks service", and decision 3 (:1199) says "never as a modal". Risk 1 (:1258-1260) says "the guide can ship first-run only", yet the retirement of the old auto-open lives in the frozen HelpButton (DATA :1126). The shipped `helpSeenKey` auto-open is HelpButton.tsx:241-262, and HelpButton.tsx is frozen at final-kitchen-ops.md:224.
   - Fix: Below 64em, nothing auto-opens: the guide is reachable from Help's row only, or from a non-modal in-flow host. Retiring the `helpSeenKey` auto-open becomes a hard precondition for the in-place first run. If the owner does not unfreeze HelpButton.tsx, the guide does not auto-show anywhere. Rewrite risk 1 to say so.
6. **Accent and gold are used as progress colours. The "Step N of 5" eyebrow is accent ink on the counter and --gold on the kitchen, and the current page dot is an --ac capsule: a second selection mark beside the lit cap.**
   - Evidence: The eyebrow uses #8f5009 (--ac-strong) at :389 and #f4c879 (Night --gold) at :778. The dots use DOT_ON #a65f10 / #e7a53a (:188-189, :280-283). The vocabulary says: "Gold or accent is never a progress colour. It stays selection and act-now: the Pay door, the lit cap, Mom's started row, the wall's pickup call." PATH_DESIGN:116 says "Gold tint: the till… Never a status". CLAUDE.md design language: ONE selection vocabulary, the lit cap; never invent a parallel one.
   - Fix: Set the eyebrow in --t2 in both themes. Show the current dot by SHAPE (the 24×8 capsule) in --tx, with the others as 8×8 --t3 dots. Accent stays only on the guide's one primary. Re-run the contrast rows.
7. **Several step titles do not render through the control's own key, and the brief misstates the record to justify an English-only title.**
   - Evidence: The vocabulary says "Titles are the controls' own keys." The problems:

- Kitchen s1, "One Send, one card" (:847), and s5, "Stop cooking" (:936), are NEW English-only strings and name no control.
- The brief says the stop card's Burmese "is not in the decided record" (:1030-1032). But the decided m7 appendix B4 (docs/path-design-2026-10-07/m7-clearing-a-table.md) names the draft 'စားပွဲ {id} ထွက်သွားပြီ — ချက်တာ ရပ်ပါ' (brief-m7.md:356) for kitchen-ops' card. As a result, Burmese-first Mom gets two of her five titles in English only.
- Counter s2 renders through `pad.group.unsent`, cited as "(K15-HIGH, = table.line.notSent)" at :631. That key is absent from STAFF_K15_HIGH, its English is "Not sent yet" while `table.line.notSent` is "Not sent" (staff.ts:2802, :2909), and the vocabulary names `table.line.notSent` as the one key for this stamp.
  - Fix: - s5's title renders through kitchen-ops' stop-card key, which carries m7 B4's draft.
- s1's title renders through the pictured control's key (for example `kds.table` "စားပွဲ 11"), or s1 folds into s2.
- Counter s2 renders through `table.line.notSent`. Flag its "Not sent" against the record's "Not sent yet" upstream.
- Correct the K15-HIGH claim and the "not in the record" claim.

### C · The critic's suggestions (not blocking; take them where the build agrees)

- Re-arm the pager after every step change, not only at mount. On the last step the same slot changes meaning from Next to finish, so a double-tap on step 4's Next finishes the guide unseen; it is marked seen and never auto-returns. This is exactly the case PICKED_UNDO_ARM_MS's own docblock describes (expo-rules.ts:137-141). Also give the guide its own named constant rather than borrowing the lane Undo's tuning.
- Use one finish word on both stations: the shipped `help.done` "ရပြီ · Got it", which is the shipped help sheet's own finish. "Back to the counter" is the m2/m6 seal hero in the same pane, so one word would name two acts.
- Kitchen step 5 shows two identical filled "ရပြီ · Got it" buttons, the inert picture's and the live finish. Crop the stop card above its button, as step 2 already crops the bumps. Likewise crop counter step 2's CTA-gradient Send, so the guide's primary is the only filled primary in view.
- The --t3 footer and step text over the card's --tex-dot cores measure about 4.36:1 light and about 3.98:1 Night. That is the repo's open dot-core question (composite-contrast.test.ts:953-959). Set the guide's footer in --t2 or mask the dots behind the foot.
- Add 'no LostWrite line in the idle pane' to the counter quiet rule. TablePane.tsx:366-368 renders LostWrite when sel === null, so today the guide could sit beside a lost-write warning.
- The guide's `<section aria-labelledby="table-pane-h">` nests inside TablePane's own `<section aria-labelledby="table-pane-h">` (TablePane.tsx:357-361), giving two regions with one name. Render the guide as a div.
- Kitchen contrast table: drop the 3.34 pulse figure. m5's own critic says it does not reproduce (3.56 or 3.03 with the wash, about 4.98 without), and it is moot once blocking 1 removes the pulse.
- final-kitchen-ops.md:86 says 'no new K15-HIGH'. The brief's K15-HIGH candidates (counter steps 4 and 5, kitchen step 5) need staff-authority or the owner, so flag that conflict on the PD row.
- Measure the kitchen pictures inside the 34rem Help sheet headless as well. Risk 9 only covers the 432px pane, and the 696px stage crops harder there.
- Keep counts out of the teaching focus in counter step 2 ('၂ ခု မပို့ရသေး', 'Send to kitchen · 2 items'). They are shipped console copy, but the step teaches the ring and its word.
- The counter step 4 picture places the Change readout directly under the notes. In m6 it sits in the band, far below (m6-walk-up-cash.md:332). Say 'composed crop' honestly, or crop truthfully.
