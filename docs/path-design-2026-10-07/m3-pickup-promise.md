# Picked m3 — The pickup promise, from the Pay tap to the bag in hand: "The Claim Ticket", refined

**Backbone:** GUIDED (the owner: diner moments guided). The screen talks like a relative standing
next to you. A **Now** sentence says what is true. A **where-am-I path** shows the stops. The
**claim ticket** carries the one promise. **One question** ("At the restaurant now?") holds the one
thing to do.

**Grafted from QUIET ("Time, Then Code"):**

- The ticket has ONE hero figure slot. It shows the booked time while the guest waits and the code
  at Ready.
- The ticket speaks Dad's lane strings verbatim: "Pickup {t}" / "လာယူချိန် {t}" (staff.ts:893), and
  the button wears Dad's badge word ရောက်နေပြီ (staff.ts:890).
- While cooking, the Now sentence is the SHIPPED `orderWithKitchen` pair (cart.ts:57-60). It
  replaces guided's new claim, "The kitchen is making your order."
- Fewer labels overall: no NEXT eyebrow, no pre-tap helper, no "✦ HERE" stamp, no early-pickup
  policy line.

**Grafted from GLANCEABLE ("The Claim Tag"):**

- **The one delight.** When Dad taps "Bagged & ready", the ticket turns over. The time and the code
  trade places.
- **Arm's-length shape language.** Every state is a glyph and a word, never colour alone. Done stops
  carry a check, Ready turns the whole silhouette green with a check, and a late ticket grows a phone
  door where the countdown was.
- **Matching halves.** The pass shows the same name and the same six-character code that head Dad's
  bag card (ExpoBoard.tsx:1458-1460).
- **Privacy.** `ph-no-capture` goes on every element that renders the code or the name.

**Guided's judged weakness, fixed:**

- No surface ever says "in the kitchen" for a held, unfired ticket. The path's "In the kitchen"
  stop, the chip and the Now sentence are all gated on one `fired` predicate over `qr_orders.fire_at`.
- Until `fire_at` rides the tracked shape (M65), every pre-ready pickup reads as booked, which is the
  safe direction.
- Dad's lane gains no string. If the reserved lane line is ever built (judges' graft 3), it must call
  a held bag by the KDS's own word, "ဆိုင်းထား / Later" (kds.held, staff.ts:171).

**What great hospitality does at this exact moment, kept to this family's real constraints:**

- **A boarding pass in a wallet** shows one big time while you wait. It updates itself in place,
  and at the gate it shows the one thing the agent needs. → The ticket shows the time while waiting
  and the code at Ready. Nothing else on the page moves.
- **A Japanese ticket-and-token counter** never makes the clerk read a sentence: the token carries
  one figure, matched by glance. → The pass face's 40px code is the exact code suffix on Dad's bag
  card, so matching guest to bag is matching two halves of one ticket.
- **A cloakroom tag** is turned over and handed across. → The turn-over at Ready, once.
- **A great maître d'**:
  - catches your eye the moment you walk in → "I'm here" rings Dad's lane bell
    (counter-attention.ts:64,102);
  - never promises a time he cannot keep → no ETA anywhere, and "any minute now" retires;
  - when the kitchen runs behind, says so plainly and gives you a way to reach him → the late
    state: "Your 6:20 PM order isn’t bagged yet." plus a 44px door to the restaurant's phone.

The design adds no hardware, no SMS, no sound, no ready haptic, no hours (none exist anywhere,
brand.ts), and no migration.

**Example data:** the m3 artboards' own, kept like-for-like with m3-guided-1/2:

- Guest **Aye Aye**, pickup **today at 6:20 PM** (the booked slot, ruling #17). This is an
  as-soon-as-possible order, so `fire_at` is null and the kitchen got it at payment
  (pickup_asap.sql:97; w3_kitchen.sql:126-127).
- Paid and placed at **5:58 PM**.
- Code **#A1B2C3**: the order id's last six characters, uppercased, the same derivation the lane, the
  KDS and the exit pass use (expo.ts:376; kitchen.ts:364; OrderTracker.tsx:790).
- Bagged and ready at **6:14 PM** (`togo_ready_at`, Dad's tap).
- The receipt slip below the fold reads **3 items · $24.18**.
- "Now" is **6:01 PM** on screen 1, after 6:14 PM on screen 2 and **6:37 PM** on screen 3.

**Light tokens used below (hex, for the drawer):**

| Token       | Value                  |
| ----------- | ---------------------- |
| --pg        | #faf9f5                |
| --sf        | #f2efe7                |
| --cd        | #fffdf8                |
| --tx        | #1b1714                |
| --t2        | #6e6358                |
| --t3        | #726859                |
| --ac        | #a65f10                |
| --ac-strong | #8f5009                |
| --oa        | #fffdf8                |
| --ok        | #346e47                |
| --okb       | #eaf2ec                |
| --bd        | rgba(58,35,23,0.1)     |
| --sheen     | rgba(255,255,255,0.55) |

**Card recipe:** radius 20, bg #fffdf8, 1px --bd. Shadow:
`inset 0 1px 0 rgba(255,255,255,0.55), 0 1px 3px -1px rgba(35,24,16,0.07), 0 14px 28px -18px rgba(35,24,16,0.28)`
(--sh-paper, tokens.css:197).

**The guide card** uses the plain `.card` shadow:
`0 1px 0 rgba(255,255,255,0.55) inset, 0 1px 2px rgba(35,24,16,0.06), 0 8px 24px -12px rgba(35,24,16,0.18)`.

**THE CLAIM TICKET (one component, two faces, the same 350×176 footprint on every screen):**

- **Box:** x20–370, radius 20, `overflow: hidden`.
- **Main area:** x20–270 (250 wide).
- **Stub:** x270–370 (100 wide), divided by a **2px DOTTED** perforation. It is dotted, never dashed,
  because dashed already means "a pending undo" (the lane's undo, components/staff/expo-stage.ts:26-31)
  and "held" (the KDS, globals.css:7892-7897).
- **Notches:** two **12px** half-circles bite the top and bottom edges at x270, filled with the page
  ground #faf9f5. The size and technique are the reward coupon's own (globals.css:4013-4041), so no
  new literal is introduced.
- **The figure:** 40px, weight 800, tracking 0.08em, tabular-nums, lh 1.2. It is the shipped
  `.exit-pass-code` literal (globals.css:6219-6226), moved into the pass primitive and used by both
  faces.

---

## SCREEN picked-m3-1.dc.html — /track while cooking: "I’m here" just tapped, six seconds to take it back

- **Device:** phone 390×844.
- **Theme:** light. Night swaps tokens only:
  - ticket #2b213c;
  - stub #211a30;
  - chip #1f2e26 / #5fb07e;
  - the Undo's dashed border becomes gold #e7a53a.
  - There is no glass on the ticket: glass never sits on a status surface the guest must read.
- **Who and when:** Aye Aye has arrived early at 6:01 PM for her 6:20 PM pickup, and has just tapped
  "I’m here". This is a revisit (she came back to /track from the Order tab), so PaySuccess is absent.
  Nothing has been written yet: the counter's bell cannot be un-rung, so the six seconds come BEFORE
  the write.

### LAYOUT (top to bottom; page column x20–370; `main.page-col-narrow` padding 24px 20px 40px; PaperAmbient behind)

- **0–47:** empty page ground (safe area). Draw nothing.
- **47–103 AppHeader**, unchanged:
  - 56px, padding 0 14px, #faf9f5, 1px --bd bottom;
  - the logo `<img src="/_blob/e7e27a9553079ddb61cfec7bd9f82c9f">` 51×34 + "Morning Star" Fraunces
    16/800;
  - nothing on the right.
- **127–153 status chip**, left-aligned and alone on its row:
  - `.vt-order-status` (the header pill's morph partner, OrderTracker.tsx:489-519), "Preparing";
  - 13px 800, line-height 16px, padding 5px 10px, radius 999, bg --okb #eaf2ec, ink --ok #346e47.
  - For pickup only, the "PICKUP" mode eyebrow above the h1 is dropped (OrderTracker.tsx:482-488,
    :567). The ticket already says Pickup in both languages, in Dad's words, 200px below. Every other
    mode keeps its eyebrow.
- **163–219 h1, the Now sentence:**
  - "Your order’s with the kitchen." in Fraunces 26/600, lh 1.08, tracking -0.02em, --tx.
  - It runs 2 lines: "Your order’s with the" / "kitchen."
- **221–247 its MY line:** Padauk 16px, lh 1.6, --t2, `lang="my"`.
- **263–331 the WHERE-AM-I PATH:** `<ol role="list" aria-label="Order status">`, 4 equal columns of
  87.5px, with dot centres at x63.75 · 151.25 · 238.75 · 326.25.
  - **263–281 dots, 18px** with a 2.5px border (the product's own v7.2 dot, OrderTracker.tsx:857-869):
    - **Order placed = done:** --ok fill and border, holding a 10px check glyph stroked --okb
      #eaf2ec at 2.5px. Glyph plus colour, never colour alone.
    - **In the kitchen = now:** --ac fill and border, plus a 4px halo `rgba(166,95,16,0.18)`. The
      existing `mms-track-now` pulse runs only in view with motion on (globals.css:357-372).
    - **Ready for pickup and Picked up = next:** --pg fill with a 2.5px --bd ring.
  - **The rail:** a 2.5px line through the dot centres at y272. The span from stop 1 to stop 2 is
    --ok, filled with the existing `.track-rail-fill` flow (globals.css:379-404). The rest is --bd.
  - **287–317 labels:** 12px 700, lh 1.22, centred, max-width 80px, 2 lines. The PICKUP_STEPS
    titles (OrderTracker.tsx:61-66): "Order placed" · "In the kitchen" · "Ready for pickup" ·
    "Picked up".
    - Ink: done --t2, now --tx, next --t3.
    - The old subs ("We have it · Cooking · Come on by · Thank you!") retire for pickup.
  - **319–331 real clocks:** 11px --t3, tabular, only under reached stops. "5:58 PM" sits under Order
    placed (`created_at`). In the kitchen stays bare, because no honest cooking-start time exists
    (W22r, DESIGN-LANGUAGE §5).
- **347–523 THE CLAIM TICKET, time face.** A `<section>`:
  - bg --cd #fffdf8;
  - 1px --bd;
  - shadow: inset sheen + --sh-paper;
  - no card dots (the ticket must read as a printed artifact, not a surface).
  - **Main area (x20–270, padding 18px 16px, a centred column; content 120px tall, centred
    vertically):**
    - **375–396 kicker:** "PICKUP" 11px 700, tracking 0.13em, uppercase, --ac #a65f10; then " · "
      in --t3; then "လာယူချိန်" Padauk 13px 700, --ac-strong #8f5009.
    - **400–448 figure:** "6:20 PM", 40px 800, tracking 0.08em, tabular, --tx. It measures about
      173px wide against a 218px inner width. The kicker and the figure are ONE `<h2>`, read as
      Dad's string "Pickup 6:20 PM".
    - **454–474 countdown:** "in ~19 min", 13px 700, --t3, tabular. This is the existing J3
      arithmetic on the booked slot (OrderTracker.tsx:304-313), dropped beyond 90 minutes.
    - **474–495 its MY line:** "19 မိနစ်လောက်နေရင်", Padauk 13px 400, --t3.
  - **Stub (x270–370):**
    - bg --sf #f2efe7, left edge a 2px dotted --bd perforation, padding 16px 12px;
    - a centred `<dl>`, 79px tall, at about y395–474.
    - "FOR": 11px 700, tracking 0.05em, uppercase, --t3. Under it, "Aye Aye": 15px 700, --tx, one
      line, ellipsis.
    - Then a 14px gap.
    - "CODE": the same label style. Under it, "#A1B2C3": 13px 800, tracking 0.05em, tabular, --tx.
      The visible code is `aria-hidden`; an sr-only twin reads "Order reference A 1 B 2 C 3".
    - The whole stub carries `class="ph-no-capture"`.
  - **Notches:** 12px circles centred on x270 at y347 and y523, filled #faf9f5 with a 1px --bd ring.
    They are `aria-hidden`.
- **539–689 THE GUIDE CARD, in its take-back posture.** A `<section>` with radius 20, padding 16, bg
  --cd, 1px --bd and the .card shadow, as a flex column with a 12px gap:
  - **555–576 h2:** "We’ll tell the counter you’re here." Hanken 17px 700, lh 1.25, --tx, 1 line.
    The text changed in place from the question "At the restaurant now?".
  - **576–597 its MY line:** Padauk 13px, --t2.
  - **609–673 the Undo button,** in the same 318×64 slot the "I’m here" button held, so nothing
    jumps. It is `Button` secondary · xl · block (64px, `--tap-bump`), wearing the lane's undo
    posture (expo-stage.ts:26-31):
    - bg --sf #f2efe7;
    - 1.5px DASHED --ac #a65f10;
    - radius 999;
    - inset sheen.
    - Two-line label, centred:
      - "Undo — 6s": 17px 800, --tx, tabular. This is the send's undo grammar
        (SendToKitchenButton.tsx:283). The count lives in the label and ticks down.
      - "ပြန်ဖျက်": Padauk 13px 700, --tx, `display: block`.
    - There is no drain bar. The count is the one undo vocabulary, shared with Send (§32 J34).
  - **Focus:** focus has moved here from "I’m here". Draw no focus ring, because the tap was a touch
    and :focus-visible does not show.
- **705→ the receipt slip** (existing, OrderTracker.tsx:1203-1250) starts here. Its top edge peeks
  above the tab bar:
  - receipt glyph tile;
  - "3 items · $24.18";
  - "Paid in full · Card · For Aye Aye";
  - the slip's own small code.
- **750–844 the diner tab bar,** unchanged: Menu · **Order** (`aria-current="page"`, #8f5009) ·
  Account. There is no count capsule, because the cart was emptied by payment.
- **Below the fold, unchanged except one line:**
  - ReceiptActions;
  - the foot line, now quiet's "This page catches up whenever you come back to it." with its MY;
  - the contact foot "Questions about this order? (626) 665-5317 — or ask us at the counter.", whose
    number is a 44px tel target (OrderTracker.tsx:1583-1610).

### STATES (not drawn; for the build)

ONE pure derivation decides every state: `pickupGuide({ order, fired, now })` in a NEW
`lib/pickup-promise.ts`. It returns the stage, the Now pair, whether the arrival is offered, the
ticket face and whether the ticket is late. It gets red-first tests plus verify:slice mutants, at
least these:

- the `fired` gate;
- the 15-minute late boundary;
- the pickup-day arrival gate;
- "never 'In the kitchen' / 'Preparing' / 'with the kitchen' while `fired` is false".

The states:

- **`fired`:** `fireAt === null || Date.parse(fireAt) <= now`. It is evaluated ONLY once `fire_at`
  rides `TRACK_ORDER_SELECT` (M65; today it does not, track-order.ts:22-23).
  - An absent field is not null. Until M65 lands, `fired = false` for every pickup, which
    understates (the safe direction).
  - This is the fix for guided's judged weakness.
- **Confirming (no order row yet):**
  - chip "Confirming order" (existing, :517);
  - h1 "We’re confirming your payment." + MY;
  - the path has no current stop;
  - the ticket shows the cart's held slot in --t3 if M161's first-paint cart read carries it,
    otherwise a 176px --sunken placeholder;
  - no button, because there is nothing to stamp yet.
- **Booked (held: `fired` false):**
  - chip "Scheduled" (NEW chip word, through `liveOrderStatusWord`, M65's own slice);
  - h1 "You’re booked for 6:20 PM." + MY;
  - beneath it, "The kitchen starts it closer to your time." + MY (15px --t2);
  - the path's current stop is **Order placed**, and In the kitchen stays "next". `fire_at` itself
    is never printed (M65).
- **With the kitchen (`fired`, togo `preparing`):** drawn here.
- **Late:** see screen 3.
- **Countdown:**
  - "in ~N min" while 1 ≤ N ≤ 90.
  - Between the slot and +15 min the line is EMPTY. "any minute now" (OrderTracker.tsx:312) retires
    for pickup: it is an implied ETA the code cannot keep.
- **"I’m here" is offered:**
  - on the pickup's own day, at every stage (booked, with the kitchen, late, ready). This is the
    owner's moment-3 default: `dayLabel(pickupSlot) === "Today"` in the restaurant's timezone
    (pickupTime.ts:17-28), with `now` injected.
  - Never on a later day.
  - Never before the order row exists.
  - The server enforces the same day predicate.
- **The take-back window:** a 6-second pre-write window, the same 6 s as the lane's `PICKED_UNDO_MS`
  (expo-rules.ts:125).
  - It holds while Undo has keyboard focus (`:focus-visible` only, WCAG 2.2.1). A touch never holds
    it.
  - If the page hides inside the window (`visibilitychange→hidden` / `pagehide`), the arrival
    commits at once, because the tap was deliberate.
  - If the tab is killed inside the window, the tap is lost: the safe direction, with no false
    "Here now".
- **Committing:** Undo goes `aria-disabled` + `aria-busy`, and its label reads "Letting them know…"
  (existing, OrderTracker.tsx:968).
- **Confirmed** (server `arrived_at`, or this device's ok):
  - the card collapses to the screen-2 confirmed row: check disc + "The counter knows you’re here —
    hang tight." + MY;
  - focus parks on the card (`tabIndex -1`, the readyCardRef rule, OrderTracker.tsx:378-382).
- **Undone:** the card returns to the question with the "I’m here" button. Focus returns to the
  button, and the region says "Okay — we didn’t tell the counter." + MY.
- **Refused:** the card returns to the question. Under the button sits the existing sentence "Couldn’t
  let the counter know — try again." + MY, at 13px --warn #a44b34, also spoken once.
- **Already stamped on another device:** the card loads confirmed. Server truth drives it.
- **Wake:** on `visibilitychange→visible` or `focus` (coalesced), the order is re-read once. It uses
  the live read while membership holds, else `getMyOrderFallback` (earned_by, orders.ts:197). It
  speaks only if the stage changed. There is no polling while hidden.
- **Refunded / failed:** the existing terminal arms win. There is no ticket and no button.
- **Fresh payment (justPaid):** PaySuccess keeps the page's h1, and the Now sentence renders as an h2
  under it. The ticket prints on with the existing `.receipt-print` clip (RM: whole at once).

### COPY (English)

- Morning Star
- Preparing
- Your order’s with the kitchen.
- Order placed · In the kitchen · Ready for pickup · Picked up
- 5:58 PM
- Pickup
- 6:20 PM
- in ~19 min
- For
- Aye Aye
- Code
- #A1B2C3
- We’ll tell the counter you’re here.
- Undo — 6s
- 3 items · $24.18
- Paid in full · Card · For Aye Aye
- Menu · Order · Account
- [the question, before the tap] At the restaurant now?
- [button, before the tap] I’m here
- [states] Scheduled
- [states] Confirming order
- [states] We’re confirming your payment.
- [states] You’re booked for 6:20 PM.
- [states] The kitchen starts it closer to your time.
- [states] Letting them know…
- [states] The counter knows you’re here — hang tight.
- [states] Okay — we didn’t tell the counter.
- [states] Couldn’t let the counter know — try again.
- [foot, below the fold] This page catches up whenever you come back to it.
- [contact foot, below the fold] Questions about this order? (626) 665-5317 — or ask us at the
  counter.
- [sr-only] Order reference A 1 B 2 C 3

### COPY (Burmese) — shipped or briefed drafts only

- **သင့်အော်ဒါ မီးဖိုချောင်ထဲ ရောက်နေပါပြီနော်.** SHIPPED, `orderWithKitchen` (cart.ts:57-60).
- **လာယူချိန်.** SHIPPED, `expo.pickup` "လာယူချိန် {t}" (staff.ts:893). The kicker and figure render
  Dad's exact template.
- **19 မိနစ်လောက်နေရင်.** DRAFT, quiet "{m} မိနစ်လောက်နေရင်" (brief-m3.md:77). Latin digits.
- **ကောင်တာကို သင်ရောက်နေပြီလို့ ပြောပေးပါမယ်.** DRAFT, guided (m3.json →
  concepts[1].screens[3].copy_my[0]).
- **ပြန်ဖျက်.** SHIPPED, `kds.undo` (staff.ts:255). It is also quiet's grounded draft
  (brief-m3.md:84).
- **[before the tap] ဆိုင်ကို ရောက်နေပြီလား?** DRAFT, guided (brief-m3.md:170).
- **[before the tap] ရောက်နေပြီ.** SHIPPED, `expo.tag.here`, Dad's "Here now" badge (staff.ts:890).
  Quiet's graft: one word on both sides (brief-m3.md:82).
- **[states] ငွေရှင်းတာကို အတည်ပြုနေပါတယ်.** DRAFT, guided (brief-m3.md:168).
- **[states] 6:20 PM အတွက် မှာထားပြီးပါပြီ.** DRAFT, guided (brief-m3.md:167).
- **[states] သင့်အချိန်နီးလာမှ မီးဖိုချောင်က စချက်ပါမယ်.** DRAFT, guided (brief-m3.md:173).
- **[states] ကောင်တာက သင်ရောက်နေတာ သိပါပြီ — ခဏလေး စောင့်ပေးပါနော်.** DRAFT, guided
  (brief-m3.md:202).
- **[states] ရပါပြီ — ကောင်တာကို မပြောရသေးပါဘူး.** DRAFT, guided (m3.json →
  concepts[1].screens[3].copy_my[6]).
- **[states] ကောင်တာကို မပြောနိုင်ခဲ့ပါ — ထပ်စမ်းပါ.** DRAFT, guided (m3.json →
  concepts[1].screens[3].copy_my[7]).
- **[foot] ဒီစာမျက်နှာကို ပြန်ဖွင့်တိုင်း နောက်ဆုံးအခြေအနေကို ပြပေးပါမယ်။** DRAFT, quiet
  (brief-m3.md:88).
- **English only (no MY exists, none invented):**
  - "Preparing", "Scheduled" and "Confirming order": chip words, an English-only family
    (live-order.ts:44-62);
  - the four path labels (OrderTracker.tsx:61-66). The brief's path drafts are reserved for the D12
    sitting (brief-m3.md:176);
  - the stub labels "For" and "Code";
  - "Letting them know…" (OrderTracker.tsx:968);
  - the slip lines and the contact foot.

### A11Y

- **One live region:** OrderTracker's existing `<p role="status">` (OrderTracker.tsx:588). On this
  screen it speaks once: "We’ll tell the counter you’re here." + the MY span.
  - The Undo's ticking count lives in the BUTTON label, never in a region, as with Send
    (SendToKitchenButton.tsx:176-178).
  - The h1, the path and the ticket are not live.
- **Headings:**
  - h1 = the Now sentence (revisit).
  - h2 = the ticket's "Pickup · လာယူချိန် 6:20 PM": the kicker and figure are one heading element.
  - h2 = the guide card's sentence, which labels the card's `<section aria-labelledby>`.
- **Path:** `<ol role="list" aria-label="Order status">` with `aria-current="step"` on In the kitchen.
  Each stop carries an sr-only word ("done" / "now" / "next") beside its visible clock. Dot glyphs
  and rails are `aria-hidden`.
- **Ticket:** `<section aria-labelledby>` its h2.
  - The stub is a `<dl>`.
  - The visible code is `aria-hidden`, with an sr-only spaced twin "Order reference A 1 B 2 C 3"
    (the exit-pass pattern, OrderTracker.tsx:789-794).
  - The countdown is plain text: it re-derives every 30 s and is never announced.
- **Undo:**
  - a real `<button>`, 318×64;
  - its name is the visible label ("Undo — 6s ပြန်ဖျက်", 2.5.3);
  - focus moved here from "I’m here" in the same slot (2.4.3);
  - it holds the window under `:focus-visible` only (2.2.1).
- **Motion:**
  - `mms-track-now` pulses only in view and is off under reduced motion;
  - the rail fill snaps under RM;
  - the button posture swap is instant, with no animation;
  - nothing else moves.
- **Targets:** Undo 64. Path stops are not interactive. Tabs 44. The contact tel link is padded to 44.
- **Bilingual:** every MY run is `lang="my"`, Padauk 400/700, lh 1.6, ≥13px, `font-synthesis: none`.
  Digits and "PM" stay Latin.
- **Contrast:**
  - --t3 #726859 on --sf #f2efe7 for the stub labels is the tokens' "--t3 clears 4.5:1 on every
    light surface" claim. Assert it in the contrast audit, don't assume it.
  - --ok on --okb is the exit pass's audited pair.
  - The 10px check on the done dot is decorative (the stop's sr word carries the state).

### CODE CHECK (claims this screen depends on)

- **The pickup lifecycle and its titles exist:**
  - PICKUP_STEPS (OrderTracker.tsx:61-66);
  - `activeStep` from `togo_status` (:323-331);
  - real step clocks `created_at` / `togo_ready_at` / `togo_picked_up_at`, with step 1 bare
    (:332-337).
- **The chip is `.vt-order-status` + `liveOrderStatusWord`** ("Preparing" for a pickup with togo
  `preparing`; live-order.ts:56-59; OrderTracker.tsx:489-519). "Scheduled" does not exist anywhere
  as a chip word today (only ArrivalBeat's "Scheduled for {t}", ArrivalBeat.tsx:73): it is NEW.
- **`fire_at` exists on `qr_orders`** (20260620000100_pickup_scheduling.sql:27-29) but is NOT in
  `TRACK_ORDER_SELECT` (track-order.ts:22-23). OPEN-ITEMS M65 records exactly this. ASAP sets
  `fire_at = null` and fires at settlement (20260722000000_pickup_asap.sql:97;
  20260716000000_w3_kitchen.sql:126-127). A scheduled order is HELD until `slot − prep`.
  - So "In the kitchen" today lights for a held order from payment. The `fired` gate is required,
    not cosmetic.
- **The shipped Now sentence:** `orderWithKitchen` EN/MY (cart.ts:57-60).
- **Dad's strings:**
  - `expo.pickup` "Pickup {t}" / "လာယူချိန် {t}" (staff.ts:893), rendered with
    `formatSlotLong(pickupSlot)` (ExpoBoard.tsx:1508-1512);
  - `expo.tag.here` "Here now" / "ရောက်နေပြီ" (staff.ts:890, the bordered badge at
    ExpoBoard.tsx:1466-1470);
  - `kds.undo` "ပြန်ဖျက်" (staff.ts:255).
- **`formatSlotLong` omits the day only when it is today** (pickupTime.ts:31-34), so the kicker gains
  "· TOMORROW" exactly when Dad's line does.
- **Today, "I’m here" renders only inside the Ready card** (`{ready && …}` at OrderTracker.tsx:910;
  the button at :942-976). The server has no stage gate (arrival.ts:20-57), and the counter bell rings
  `here:` at any stage (counter-attention.ts:64, :102). Moving the offer to every stage is diner-side
  UI plus the day predicate.
- **The arrival write today:**
  - authorized by `assertSessionMember` (arrival.ts:37);
  - idempotent by `.is("arrived_at", null)`;
  - but `.update()` WITHOUT `.select("id")` (arrival.ts:47-51), so a blocked write reports ok (the
    CLAUDE.md W17 rule).
  - Judges' graft 4 adds `.select("id")` + a row check, a `togo_status <> 'picked_up'` guard in the
    statement, and the `earned_by = uid` arm.
- **The session dies at 4 hours** (session-ttl.ts:12). `assertSessionMember` throws `session_expired`
  (authz.ts:251-262), and `useOrderStatus` has NO visibility or focus re-read (useOrderStatus.ts:1-158
  contains no listener). So a far-scheduled pickup needs the earned_by arm + the wake re-read IN THE
  SAME PR, or "I’m here" refuses every tap and the new foot is false. `getMyOrderFallback` already
  authorizes by `earned_by` (orders.ts:197).
- **The undo grammar:**
  - the lane's posture `undoBtn` = --sf fill, --ac border, dashed (components/staff/expo-stage.ts:26-31);
  - the send's label is `` `Undo — ${left}s` `` (SendToKitchenButton.tsx:283);
  - the lane's window is `PICKED_UNDO_MS = 6_000` (expo-rules.ts:125);
  - the Button primitive's xl is `min-height: var(--tap-bump)` = 64px, 17px, weight 800 from the base
    `.ui-btn` (primitives.css:19-35, :73-77;
    tokens.css:25).
- **The 40px figure is a shipped literal** (`.exit-pass-code`, globals.css:6219-6226), so the
  style-literal ratchet does not rise. The 12px notch is the reward coupon's (globals.css:4033-4041).
- **The existing busy, refusal and confirmed strings:** "Letting them know…" (OrderTracker.tsx:968),
  "Couldn’t let the counter know — try again." (arrival.ts:22, OrderTracker.tsx:392), and "The counter
  knows you’re here — hang tight." (OrderTracker.tsx:605, :947).
- **PostHog autocapture is on.** `posthog.init` sets no `autocapture: false`
  (instrumentation-client.ts:31-50), and no element in the app uses `ph-no-capture` yet. So the stub's
  name and code need it (judges' graft 4).
- **The `phone` icon does NOT exist** in the Icon registry (packages/ui/src/icon.tsx:73-134). Screen 3
  adds one line (lucide `Phone`).

---

## SCREEN picked-m3-2.dc.html — Ready: the ticket turns over to the big code

- **Device:** phone 390×844.
- **Theme:** light. Night: the pass is --okb #1f2e26 with --ok #5fb07e and --tx #f3ecdf for the code,
  the audited Night pair. There is no glass.
- **Who and when:** Dad has just tapped "Bagged & ready" at 6:14 PM. Aye Aye told the counter she was
  here earlier, so `arrived_at` is stamped.
- **Drawn:** the moment just AFTER the turn-over has landed. This is the resting pass face; motion is
  not drawn.

### LAYOUT (same column, same paddings)

- **0–103:** safe area + AppHeader, as screen 1.
- **127–153 chip:** "Ready for pickup" (`liveOrderStatusWord`, live-order.ts:56-57), --okb/--ok, same
  geometry as screen 1.
- **163–191 h1, the Now sentence:** "Your order is ready." Fraunces 26/600, 1 line.
- **193–219 MY:** Padauk 16px --t2.
- **235–303 PATH:**
  - Order placed: done ✓, "5:58 PM".
  - In the kitchen: done ✓, bare.
  - **Ready for pickup: now** (--ac + halo, pulse in view), "6:14 PM" (`togo_ready_at`).
  - Picked up: next.
  - Rails: stop 1→3 --ok, 3→4 --bd.
- **319–495 THE CLAIM TICKET, PASS FACE.** The same footprint, notches and perforation x as screen 1:
  the ticket has turned over in place, so nothing below it moves. It is the shared pass primitive
  (`.exit-pass` grammar, globals.css:6202-6232):
  - bg --okb #eaf2ec, 1px --ok #346e47, inset sheen, radius 20, no paper shadow;
  - notches filled #faf9f5 with a 1px --ok ring;
  - perforation 2px dotted `rgba(52,110,71,0.35)` (`color-mix(in oklab, var(--ok) 35%, transparent)`).
  - **Main area (x20–270, padding 16px 12px, centred column, 136px of content):**
    - **339–357 kicker (the h2):** a 16px check icon in --ok (`aria-hidden`), then "READY FOR PICKUP"
      13px 800, tracking 0.05em, uppercase, --ok (`.exit-pass-kicker`). About 163px wide.
    - **357–378:** "ယူလို့ရပြီ", Padauk 13px 700, --ok, inside the same h2.
    - **382–430 THE CODE:** "#A1B2C3", 40px 800, tracking 0.08em, tabular, --tx. About 191px wide
      in a 226px column; the widest possible hex tail, "#DDDDDD", measures about 220px and still
      fits.
      - `aria-hidden`, with the sr-only twin "Order reference A 1 B 2 C 3";
      - `ph-no-capture`.
    - **434–454 sub:** "Show this code at the counter." 13px --t2 (`.exit-pass-sub`).
    - **454–475:** its MY line, Padauk 13px --t2.
  - **Stub (x270–370, bg --okb, padding 16px 12px, centred `<dl>` of about 82px at y366–448):**
    - "FOR" (11px 700, tracking 0.05em, uppercase, --t3) / "Aye Aye" (15px 700 --tx);
    - 14px gap;
    - "PICKUP" (same label style) / "6:20 PM" (15px 700, tabular, --tx).
    - **The code and the time have traded places.** While waiting, the time was the hero and the
      code sat on the stub. Now the code is the hero and the booked time, the promise that was kept,
      sits on the stub.
    - The stub carries `ph-no-capture`.
- **511–632 THE GUIDE CARD, confirmed posture** (radius 20, padding 16, bg --cd, 1px --bd, .card
  shadow):
  - a row with a 12px gap: a **28px disc**, bg --okb with a 16px check in --ok (`aria-hidden`), at
    the top;
  - then a column (278px wide):
    - "The counter knows you’re here — hang tight." Hanken 15px 700, lh 1.5, --tx, 2 lines, 45px;
    - its MY line: Padauk 13px --t2, 2 lines, about 42px.
  - **No button:** the code is this state's hero, and there is no verb.
- **648→ the receipt slip** begins and runs under the tab bar.
- **750–844 tab bar**, Order current.

### STATES (not drawn; for the build)

- **THE EDGE** fires when `togo_status` becomes `ready`, which only Dad's "Bagged & ready" moves
  (expo-rules.ts:6-11; K30).
  - **Visible at the edge:** the ticket turns over.
    - **Motion:** a `rotateY` of 0→90° on the time face over `--dur-base` (240ms) ease-in. At 90° the
      faces swap. The pass face then turns −90°→0 over `--dur-base` `--ease-out` (tokens.css:93-94).
      Together that is 480ms built only from existing tokens.
    - **Mechanics:** `perspective: 900px` on the ticket's own wrapper, `backface-visibility: hidden`.
      Never a transform on `<main>` (the fixed-children rule).
    - **Reduced motion:** an instant swap. `--dur-base` already collapses to 0.01ms (tokens.css:684).
    - **The latch:** once per order per tab, through `lib/celebration-latch.ts` (sessionStorage; a
      throwing store renders the pass at rest; :16-46).
    - **A revisit** after the edge renders the pass at rest, with no turn. A resume is not an
      arrival (§15).
  - **Hidden at the edge:** `document.title` becomes "Ready for pickup · Morning Star" at once, so the
    tab and the app switcher show it. The turn waits for the next visible frame, so she sees it once.
    The title is restored on picked up, on refund and on unmount.
  - **The face out of view** gets `hidden`, so a screen reader never reads both faces.
  - **No sound** (§15: a third ceremony is an owner call, and iOS cannot resume audio after the
    processor redirect). **No ready haptic:** a fifth haptic name is a §12 design decision, and
    haptics.ts:45-50 holds four. Both are listed for the owner, not built. The visible turn, the h1
    and the title are the edge.
- **Ready, not yet arrived:**
  - the guide card shows the question "At the restaurant now?" + MY and the primary "I’m here /
    ရောက်နေပြီ" (Button primary · xl · block, 64px, 17px 800, --oa on the --ac→--ac-strong ramp);
  - the screen-1 take-back applies.
  - That button is the state's ONE verb; the pass is not a control.
- **Picked up** (Dad's "Picked up" after its 6 s window):
  - the chip reads "Picked up";
  - h1 "Picked up — enjoy!" + MY;
  - the path is all done: "5:58 PM" · bare · "6:14 PM" · "6:24 PM";
  - the pass settles to REST: bg --cd, 1px --bd. Its kicker becomes check + "PICKED UP · 6:24 PM" in
    --t2 with "ယူသွားပြီ", and the code drops to --t2 (no longer the thing to show);
  - the sub becomes "Thanks for coming by." + MY;
  - the guide card is gone;
  - GoodbyeBeat (fresh payment only) and FeedbackPrompt (any visit, the earner) rise beneath, as
    today (OrderTracker.tsx:1511-1519);
  - the foot reads "This receipt lives in your order history." + MY.
  - There is no tear animation. The turn-over is the moment's one delight.
- **Refunded / failed:** the existing terminal arms win, and the pass never shows.
- **The pass is read-only:** no copy-to-clipboard and no full-screen dialog. The code is shown or said
  at the counter.

### COPY (English)

- Ready for pickup
- Your order is ready.
- Order placed · In the kitchen · Ready for pickup · Picked up
- 5:58 PM · 6:14 PM
- READY FOR PICKUP
- #A1B2C3
- Show this code at the counter.
- For · Aye Aye
- Pickup · 6:20 PM
- The counter knows you’re here — hang tight.
- Menu · Order · Account
- [document.title, hidden or visible at the edge] Ready for pickup · Morning Star
- [states] At the restaurant now?
- [states] I’m here
- [states] Picked up
- [states] Picked up — enjoy!
- [states] PICKED UP · 6:24 PM
- [states] Thanks for coming by.
- [states] This receipt lives in your order history.
- [sr-only] Order reference A 1 B 2 C 3

### COPY (Burmese) — shipped or briefed drafts only

- **သင့်အော်ဒါ အဆင်သင့်ဖြစ်ပါပြီ.** DRAFT, guided (brief-m3.md:199).
- **ယူလို့ရပြီ.** Brief draft, grounded (quiet, brief-m3.md:114). It is the second clause of Dad's
  shipped `expo.verb.bagged` "ထုပ်ပြီး၊ ယူလို့ရပြီ" (staff.ts:885) and the wall's `board.status`
  (staff.ts:1916-1919).
- **ဒီကုဒ်ကို ကောင်တာမှာ ပြပါ.** DRAFT, guided (brief-m3.md:200).
- **ကောင်တာက သင်ရောက်နေတာ သိပါပြီ — ခဏလေး စောင့်ပေးပါနော်.** DRAFT, guided (brief-m3.md:202).
- **[states] ဆိုင်ကို ရောက်နေပြီလား? · ရောက်နေပြီ.** DRAFT (brief-m3.md:170) · SHIPPED
  (staff.ts:890).
- **[states] ယူသွားပြီ — ကောင်းကောင်း သုံးဆောင်ပါနော်.** DRAFT, guided (m3.json →
  concepts[1].screens[6].copy_my[0]).
- **[states] ယူသွားပြီ** (the picked-up kicker). SHIPPED, `expo.verb.pickedUp` (staff.ts:942).
- **[states] လာတဲ့အတွက် ကျေးဇူးတင်ပါတယ်.** DRAFT, guided (m3.json → concepts[1].screens[6].copy_my[1]).
- **[states] ဒီဘောက်ချာက သင့်အော်ဒါမှတ်တမ်းထဲမှာ ရှိနေပါမယ်.** DRAFT, guided (m3.json →
  concepts[1].screens[6].copy_my[2]).
- **English only (no MY exists, none invented):**
  - the chip;
  - the path labels;
  - the stub labels "For" and "Pickup" (the stub is 100px; its MY pair `လာယူချိန်` rides the time
    face's kicker);
  - `document.title` (tab titles stay English, as the tab labels do, §30 D2).

### A11Y

- **One live region**, the same `role="status"`. At the edge it speaks the Now pair ONCE: "Your order
  is ready." + `<span lang="my">` its MY.
  - **Not** today's "…— grab it before you go." (OrderTracker.tsx:606), which is in-store words for a
    guest who may be at home.
  - A revisit speaks only the page's normal status.
- **Focus is never moved at the edge.** The h1's text change is what heading navigation finds.
- **Headings:** h1 = Now sentence; h2 = the pass kicker "Ready for pickup ယူလို့ရပြီ", which labels
  the pass `<section>`; the guide card has no heading in this posture (it is one sentence) and is a
  `<section aria-label="Arrival">`.
- **The pass:** the code is `aria-hidden` + the sr-only spaced twin; the stub is a `<dl>`; the time
  face is `hidden` after the turn.
- **Ready is never colour alone:** the check glyph, the word "Ready for pickup", the time→code swap
  and the green fill all change together.
- **Motion:** the turn, the `mms-track-now` pulse and the rail flow are all RM-escorted (instant
  swap / off / snap). The turn plays once per order per tab.
- **Targets:** there is no control on the pass. The guide card has no control in this posture. Tabs 44.
- **Contrast:** --ok #346e47 on --okb #eaf2ec (kicker, MY) is the exit pass's audited pair; --tx on
  --okb (code); --t2 on --okb (sub); --t3 on --okb (stub labels). Add the last two to the contrast
  audit's matrix (§13: "a green audit proves the combos it defines").

### CODE CHECK

- **Ready comes only from the bagger's tap:** `togo_status` is moved by the expo and nothing else
  (expo-rules.ts:6-11). `ready` = `arrived && togo === "ready" && !pureGrocery && !refunded`
  (OrderTracker.tsx:364).
- **The pass primitive exists:** `.exit-pass` / `-kicker` / `-code` / `-sub` (globals.css:6202-6232),
  used today by the grocery exit pass with a check icon and the sr-only spaced twin
  (OrderTracker.tsx:773-796). Pickup reuses it rather than forking it.
- **The real ready stamp is `togoReadyAt`**, already on the tracked shape and on the rail
  (track-order.ts:77-80; OrderTracker.tsx:335-337).
- **The same code on both halves:** /track's `order.id.slice(-6).toUpperCase()` (OrderTracker.tsx:790)
  equals the lane's `shortCode` (expo.ts:376), shown as Dad's card suffix " #A1B2C3"
  (ExpoBoard.tsx:1458-1460).
- **"The counter knows you’re here — hang tight."** is today's ready-plus-announced copy
  (OrderTracker.tsx:604-605, :947).
- **The latch exists:** `hasCelebrated` / `markCelebrated` / `safeSessionStorage`
  (celebration-latch.ts:16-46), the PaySuccess "a resume is not an arrival" rule (§15).
- **Today's /track title** is set per redirect state ("Track your order", app/track/page.tsx:43-61).
  The edge title is a client-side `document.title` that restores the previous value.
- **Four haptic names, no fifth** (haptics.ts:45-50); diner sound is ceremony only (§15).
- **The picked-up goodbye and feedback exist** and are timed on food-in-hand (OrderTracker.tsx:1511-1519).
- **Motion tokens:** `--dur-base: 240ms` and `--ease-out` (tokens.css:93-94), collapsed under RM
  (tokens.css:684). There is no existing flip keyframe (no `rotateY` in globals.css), so the turn is
  one new keyframe pair in its own RM block.

---

## SCREEN picked-m3-3.dc.html — Past the booked time, not bagged yet: honest words and a door

- **Device:** phone 390×844.
- **Theme:** light. Night swaps tokens only: ticket #2b213c, stub #211a30, door pill #2b213c with
  --bd `rgba(243,236,223,0.13)`, phone glyph in gold #e7a53a.
- **Who and when:** it is 6:37 PM, 17 minutes past Aye Aye's 6:20 PM slot. The kitchen has the order
  (`fired`) and Dad has not tapped "Bagged & ready". She has NOT said she is here; she may be at home
  deciding when to leave. The late state starts at the code's existing 15-minute rule
  (OrderTracker.tsx:311), named once as `LATE_AFTER_MIN = 15` in `lib/pickup-promise.ts`.

### LAYOUT (same column, same paddings)

- **0–103:** safe area + AppHeader, as screen 1.
- **127–153 chip:** "Preparing". It is still true, and it is unchanged.
  - The chip never turns --warn for the guest. A late order is said in words, not alarm colour (a
    maître d', not a siren).
- **163–219 h1, the Now sentence:** "Your 6:20 PM order isn’t bagged yet." Fraunces 26/600, 2 lines:
  "Your 6:20 PM order isn’t" / "bagged yet."
  - "bagged" is Dad's own verb ("Bagged & ready").
  - There is no apology and no ETA (judges' graft 2).
- **221–247 MY:** Padauk 16px --t2.
- **253–276 sub:** "It shows here the moment it is." Hanken 15px, lh 1.5, --t2.
- **276–297 its MY line:** Padauk 13px --t2.
- **313–381 PATH:** Order placed done ✓ "5:58 PM" · **In the kitchen now** (--ac + halo) · Ready for
  pickup next · Picked up next. It is unchanged from screen 1. The path never shows lateness, because
  a path stop is a fact about the order, not about the clock.
- **397–573 THE CLAIM TICKET, time face, late posture.** Same box, stub, notches and perforation as
  screen 1.
  - **Main column (centred, 127px of content):** - **422–443 kicker:** "PICKUP · လာယူချိန်". - **447–495 figure:** "6:20 PM", 40px 800. The promise stays printed: it is the record, never
    struck through, never replaced by a guess. - **505–549 THE DOOR, in the countdown's slot** (judges' graft 2: "lift the BRAND_PHONE tel link
    (44px) into the ticket sub"): - an `<a href="tel:+16266655317">` drawn as the secondary Button, small (`.ui-btn-secondary
.ui-btn-sm`): pill radius 999, min-height 44, padding 0 16px, bg --cd #fffdf8, 1px --bd,
    inset sheen + `--sh`; - a 16px phone glyph stroked 2px in --ac #a65f10 (`aria-hidden`; NEW `phone` icon entry), an
    8px gap, then "(626) 665-5317" in 14px 800 (`--fs-label` at the Button's own weight),
    tabular, --tx; - about 170px wide. - The label is the number itself, so it is language-neutral: a Burmese reader and an English
    reader both read a phone glyph and Latin digits. The accessible name is "Call (626)
    665-5317".
  - **Stub:** "FOR / Aye Aye · CODE / #A1B2C3", as screen 1, `ph-no-capture`.
- **589–739 THE GUIDE CARD, offer posture** (radius 20, padding 16, bg --cd, 1px --bd, .card shadow;
  12px gap):
  - **605–626 h2:** "At the restaurant now?" 17px 700 --tx.
  - **626–647 its MY line:** 13px --t2.
  - **659–723 "I’m here":** `Button` primary · xl · block, 318×64.
    - Fill: `linear-gradient(180deg, #a65f10, #8f5009)`, ink --oa #fffdf8, shadow inset sheen +
      `--sh-lift`.
    - Two-line label: "I’m here" 17px 800, then "ရောက်နေပြီ" Padauk 13px 700, `display: block`.
  - This is the state's ONE hero verb. The phone door is secondary (paper), so the page carries one
    filled control.
  - The card ends at 739, 11px above the tab bar.
- **750–844 tab bar**, Order current. The receipt slip starts under it.

### STATES (not drawn; for the build)

- **Entering late** is time-derived. The existing 30 s tick (OrderTracker.tsx:298-303) re-derives
  `pickupGuide`. The h1, MY and sub change in place, and the region speaks the Now pair ONCE.
- **Between the slot and +15 min:** the screen-1 posture with an EMPTY countdown slot. "any minute
  now" is retired, and the door is not shown yet.
- **Late, already arrived:** the guide card is the screen-2 confirmed row ("The counter knows you’re
  here — hang tight." + MY). The door stays on the ticket. It is true in both postures, and the
  contact foot below already says "— or ask us at the counter."
- **Late, then Ready:** the screen-2 edge. The door leaves with the time face (it lives on that face).
- **Held orders cannot be late:** late means slot + 15 min has passed, and a held order fires at
  `slot − prep` (w3_kitchen.sql:126-127). The late arm still requires `fired`, so a missing
  `fire_at` can never print "isn’t bagged yet" over a ticket the kitchen has not got.
- **Refunded / failed:** the existing terminal arms win.

### COPY (English)

- Preparing
- Your 6:20 PM order isn’t bagged yet.
- It shows here the moment it is.
- Order placed · In the kitchen · Ready for pickup · Picked up
- 5:58 PM
- Pickup
- 6:20 PM
- (626) 665-5317
- For · Aye Aye · Code · #A1B2C3
- At the restaurant now?
- I’m here
- Menu · Order · Account
- [aria-label of the door] Call (626) 665-5317
- [states] The counter knows you’re here — hang tight.

### COPY (Burmese) — shipped or briefed drafts only

- **6:20 PM အော်ဒါကို မထုပ်ရသေးပါဘူး.** DRAFT, guided (brief-m3.md:169). Latin digits.
- **ထုပ်ပြီးတာနဲ့ ဒီမှာ ပေါ်လာပါမယ်။** DRAFT, guided. It is the FIRST sentence of
  "ထုပ်ပြီးတာနဲ့ ဒီမှာ ပေါ်လာပါမယ်။ လိုရင် (626) 665-5317 ကို ခေါ်ပါ" (brief-m3.md:174), split at its
  own "။" exactly where the EN splits ("It shows here the moment it is." | "Need us? Call …"). Nothing
  is composed. The second sentence's job is done by the language-neutral door.
- **လာယူချိန်.** SHIPPED (staff.ts:893).
- **ဆိုင်ကို ရောက်နေပြီလား?** DRAFT, guided (brief-m3.md:170).
- **ရောက်နေပြီ.** SHIPPED (staff.ts:890).
- **[states] ကောင်တာက သင်ရောက်နေတာ သိပါပြီ — ခဏလေး စောင့်ပေးပါနော်.** DRAFT (brief-m3.md:202).
- **English only (no MY exists, none invented):**
  - "Preparing";
  - the path labels;
  - "For" and "Code";
  - the door's accessible name "Call (626) 665-5317" (its visible label is the language-neutral
    number).

### A11Y

- **One live region:** the same `role="status"`. When the late arm begins it speaks "Your 6:20 PM
  order isn’t bagged yet." + the MY span, once. It is never repeated per tick.
- **Headings:** h1 = the Now sentence; h2 = the ticket's "Pickup · လာယူချိန် 6:20 PM"; h2 = the
  guide question.
- **The door:**
  - a real `<a href="tel:+16266655317">`;
  - its name "Call (626) 665-5317" contains its visible text "(626) 665-5317" (2.5.3);
  - 44px tall, about 170px wide;
  - the glyph is `aria-hidden`.
  - It is the stuck state's one way out (lens rule 2), and a remote guest's last door is the
    restaurant's phone, never hours (lens rule 3; brand.ts:20-21).
- **"I’m here":** a `<button>`, 318×64. Its name is its visible label "I’m here ရောက်နေပြီ".
- **Not colour alone:** the late state is a SENTENCE (h1) plus a SHAPE (the door pill with a phone
  glyph appears where the countdown was). It is never a red tint.
- **Motion:** none new. The path pulse and rail are RM-escorted as before.
- **Targets:** door 44, "I’m here" 64, tabs 44.
- **Contrast:** --t2 #6e6358 on --pg (sub) and --tx on --cd (door) are existing audited pairs. The
  --ac glyph is decorative.

### CODE CHECK

- **The 15-minute rule exists:** `if (mins < -15) return null;` drops the countdown long past the slot
  "with still no ready tap" (OrderTracker.tsx:304-313). The late arm reuses that threshold, named
  once.
- **"bagged" is Dad's word:** `expo.verb.bagged` "Bagged & ready" / "ထုပ်ပြီး၊ ယူလို့ရပြီ"
  (staff.ts:885).
- **The phone is the brand singleton:** `BRAND_PHONE_DISPLAY` "(626) 665-5317" / `BRAND_PHONE_TEL`
  "+16266655317" (brand.ts:20-21). It is already rendered as a 44px-padded tel link in the contact foot
  (OrderTracker.tsx:1583-1610).
- **There are no hours anywhere** (DESIGN-LANGUAGE §5, "Identity is copied, never composed"; ruling
  #10). So the door is the phone, never "we open at…".
- **The Button primitive's secondary** is a paper card (`.ui-btn-secondary`: --cd, --bd, inset sheen +
  --sh) and its sm size is 44px at `--fs-label` 14px (packages/ui/src/primitives.css:61-65, :94-101;
  tokens.css:48).
- **The Icon registry has no phone glyph** (icon.tsx:73-134). The `phone` entry (lucide `Phone`) is
  new.
- **The same moment's checkout fixes ride with this spec** but are not drawn here:
  - create-intent's "The kitchen’s closed right now — please order during open hours."
    (app/api/stripe/create-intent/route.ts:310) becomes "The kitchen isn’t taking pickup orders right
    now — pick a later time, or call (626) 665-5317." (guided, judges' graft 1). It is a string-only
    change on a money route, so it needs a test and the Codex wait.
  - The false pickup pay note `unsentPayNote` (confirm-copy.ts:85, PaymentSection.tsx:366) and the
    ASAP "ready in about {N} min" (PickupWhenChoice.tsx:248, :296) retire for pickup (ruling #17).

---

## DECISIONS

1. **Guided is the backbone** (owner answer 1): a Now sentence, a where-am-I path, the claim ticket
   and one question, as in m3-guided-1/2, evolved rather than replaced.
2. **Quiet graft: Dad's words on the guest's ticket.**
   - The kicker and figure are Dad's `expo.pickup` "Pickup {t}" / "လာယူချိန် {t}" (staff.ts:893).
   - The button's MY is his badge word ရောက်နေပြီ (staff.ts:890), replacing guided's draft ရောက်ပြီ.
   - The result is one word on both sides of the counter.
3. **Quiet graft: the cooking Now sentence is the SHIPPED `orderWithKitchen` pair** (cart.ts:57-60). It
   replaces guided's new "The kitchen is making your order.", which claims active cooking for a ticket
   that may be queued.
4. **Quiet graft "Time, Then Code": one hero figure slot at the shipped 40px `.exit-pass-code` size,
   both faces.** It replaces guided's Fraunces 36px time. No new type literal reaches the style
   ratchet (judges flagged glanceable's 60/64/120px).
5. **Glanceable graft, the one delight: the ticket turns over at Ready and the time and code trade
   places.**
   - Built from two `--dur-base` halves.
   - Once per order per tab via celebration-latch.
   - Instant under RM.
   - The tear-off and the full-screen code dialog are NOT carried (one delight; the judges' cost
     notes).
6. **Glanceable graft: never colour alone.** Done stops carry a check glyph, Ready changes glyph +
   word + fill, and late adds a shaped door. The path keeps the product's own 18px dots.
7. **Glanceable graft: `ph-no-capture` on every element rendering the code or the name** (judges'
   graft 4). Autocapture is on (instrumentation-client.ts:31-50).
8. **Guided's judged weakness fixed: "In the kitchen" / "Preparing" / "with the kitchen" are gated on
   `fired`** (`fire_at` null or past). This requires M65's `fire_at` on `TRACK_ORDER_SELECT`; until
   then every pickup reads booked (the safe direction). A held order reads "Scheduled" · "You’re booked
   for 6:20 PM." with Order placed current.
9. **Dad's lane is unchanged (zero new staff strings).** The reserved lane line (judges' graft 3)
   waits for pilot step 4. If it is built, it names a held bag with the KDS's own `kds.held`
   "ဆိုင်းထား / Later" (staff.ts:171), never "in the kitchen".
10. **Owner default, moment 3: "I’m here" any time on the pickup day, with a 6-second take-back.**
    - The window comes before the write, because the bell cannot be un-rung.
    - The window is the lane's 6 s (expo-rules.ts:125).
    - The same day predicate is enforced in the server statement.
11. **One undo vocabulary:** the lane's dashed --ac posture (expo-stage.ts:26-31) + the send's
    "Undo — Ns" count label (SendToKitchenButton.tsx:283). Guided's and quiet's drain bar is dropped:
    a second undo idiom, and motion that needed its own RM escort.
12. **Undo is never the hero (§32):** during the window it is a secondary in the "I’m here" slot,
    and no filled control exists on the screen.
13. **Late state (judges' graft 2):** at the existing 15-minute rule. It is honest words ("isn’t
    bagged yet"), with no apology and no ETA. The door is a 44px tel pill on the ticket, in the
    countdown's slot, labelled by the language-neutral number.
14. **"any minute now" retires for pickup** (OrderTracker.tsx:312). It is an implied ETA the code
    cannot keep. Between the slot and +15 min the countdown slot is simply empty.
15. **Restraint (quiet):** dropped from guided:
    - the "NEXT" eyebrow;
    - the pre-tap "You can undo for a few seconds." helper (the countdown teaches it at the moment it
      matters);
    - the "✦ HERE 6:02 PM" stamp;
    - the "Ask at the counter if you’d like it sooner" line, because starting a held order early is
      UNKNOWN business policy;
    - the pass footer that repeated the path's 6:14 PM.
16. **For pickup only, the page's "PICKUP" mode eyebrow is dropped.** The ticket says Pickup in both
    languages. The status chip stays as the header pill's morph partner and the app-wide status word.
17. **The perforation is DOTTED, not dashed.** Dashed already means a pending undo (the lane) and a
    held ticket (the KDS, globals.css:7892-7897).
18. **The stub labels the code "CODE", not guided's "ORDER"**, so the pass's "Show this code at the
    counter." names the same thing (DESIGN-LANGUAGE §5: one word per concept).
19. **The region speaks the Now pair (EN + MY span) on every stage change.** It replaces today's
    in-store "…grab it before you go." (OrderTracker.tsx:606) and needs no new English-only region
    sentence.
20. **No sound, no ready haptic** (§15; haptics.ts:45-50). Both are owner calls, listed, not built.
    The turn, the h1 and the tab title carry the edge.
21. **The foot is quiet's "This page catches up whenever you come back to it."** It ships only with
    the wake re-read that makes it true. Guided's "updates on its own — close it and come back
    anytime" promised more than a one-shot fallback keeps.
22. **The arrival server (judges' graft 4 + guided risk 1), one PR:**
    - `.select("id")` + a row-count check;
    - a `togo_status <> 'picked_up'` guard in the statement;
    - the `earned_by = uid` authorization arm (orders.ts:197's authority);
    - the pickup-day predicate;
    - a mutant for each;
    - plus the /track wake re-read.
23. **Cross-moment:** the counter-side defaults of moments 6–8 are untouched here. This moment adds
    no staff surface.

## OPEN RISKS

1. **Couch taps.** An early "I’m here" pins the bag first and starts Dad's lane clock from
   `arrived_at` (expo-rules.ts:81-82, :104-108). That is 10 minutes to warn and 20 to late on a bag
   that may be held. The pickup-day gate limits it, and the question wording and 6 s take-back help.
   Measure the share of arrivals before `togo_ready_at` in pilot step 4 before widening or narrowing
   (judges' graft 5).
2. **Held plus early arrival.** Dad sees "Here now" with no "Kitchen done". The lane cannot tell held
   from cooking, because `kitchenStateOf` reads a held line as `cooking` (state `fired`,
   expo-rules.ts:19-40). He must check the KDS's "Later" card. The lane line stays reserved.
3. **Session TTL.** A pickup booked more than 4 hours ahead loses its live read and its arrival
   authority (session-ttl.ts:12; authz.ts:251-262). If the earned_by arm and the wake re-read do not
   ship in the same PR:
   - "I’m here" refuses every tap ("Couldn’t let the counter know") with no way out;
   - the Ready edge never lands live;
   - the foot is false.
4. **The `fired` gate depends on M65** (`fire_at` on the shared select, and a "Scheduled" chip word
   that changes the shared `liveOrderStatusWord` vocabulary). Until it merges, every pre-ready pickup
   reads "booked", which understates an ASAP order that is already cooking. That is honest but
   less informative.
5. **Commit-on-hide** may send an arrival the guest would have undone (they pocketed the phone
   mid-window). A tab killed inside the window loses the tap. Both are recorded, owner-reversible
   defaults.
6. **iOS suspends a hidden tab's socket.** The edge usually lands on return (the wake re-read), not
   while away. The copy never promises a notification, and the tab title is the only away-signal.
7. **The 15-minute late threshold is the code's existing judgement** (OrderTracker.tsx:311), not an
   owner number. The owner may want it shorter.
8. **Fit is measured, not rendered.**
   - The 40px code in a 226px column: the widest hex tail, "#DDDDDD", is about 220px.
   - The countdown's MY line and the late door both sit within the 218px time-face column.
   - A long `customer_name` ellipsizes on the 100px stub.
   - Check all of these on device in the D12/PILOT15 sitting.
9. **Two pass primitives are converging.** m2's refined counter pass introduced `--fs-pass` (88px) for
   a table numeral. m3 keeps the shipped 40px `.exit-pass-code`. The build should land one pass
   primitive with two figure sizes, not two forks.
10. **Pickup prepay is a phone card payment.** Real money on this path waits on the live-key cutover.
    That is OPEN-ITEMS **C2** (OPEN-ITEMS.md:27; owner ruling #8), not C1, which is auth hardening
    (OPEN-ITEMS.md:20). Until then pilot step 4 runs on test keys.
11. **Every new Burmese string is an unverified K15 draft**, logged under "K15 · post-pay":
    - the Now sentences for ready, booked, late and confirming;
    - the question;
    - the take-back, undone and refused lines;
    - the countdown;
    - the pass sub;
    - the picked-up lines;
    - the foot.

    The late sub is half of one guided draft, split at its own "။". It needs Min's native read.

12. **English-only surfaces remain for a Burmese reader:** the chip words, the four path labels, the
    stub labels, the door's accessible name and the tab title. The D12 sitting decides whether the
    path wants a MY line per stop (the brief's reserved drafts, brief-m3.md:176).
13. **"ယူလို့ရပြီ" (the pass kicker) and "အဆင်သင့်ဖြစ်ပါပြီ" (the h1) are two MY words for "ready"
    on one screen.** Both are family words (Dad's verb and the wall; Dad's "Ready" tag is အဆင်သင့်,
    staff.ts:891). K15 should confirm the pairing reads as one concept.

---

## Appendix — what changed after this spec (applied in the drawn screens)

The spec above was written first. Two later passes changed it, and the screens on the canvas were drawn
with both applied. **Where an item below contradicts the spec above, the item below wins.**

### A · System amendments (the cross-moment consistency pass)

1. Undo's accessible name is 'Undo' alone, with ' — 6s' as an aria-hidden leaf, the same pattern as m1 and m7 (J34, P2as). The A11Y line 'name is Undo — 6s ပြန်ဖျက်' changes accordingly. Keep ပြန်ဖျက် and the dashed --ac posture.
2. Add the same-gesture arm. 'I'm here' → Undo and Undo → 'I'm here' swap in one 318×64 slot, so taps on the new control are ignored for 350 ms (undoTapHeld / SAME_GESTURE_MS). Without it, a double-tap un-rings the arrival, or undoes and re-offers in one gesture.
3. Pass sub MY: reuse the shipped counterBody clause 'ကောင်တာက ဝန်ထမ်းကို ဒါလေး ပြလိုက်ပါ' instead of the new draft 'ဒီကုဒ်ကို ကောင်တာမှာ ပြပါ'. That gives one Burmese 'show this' phrase across m1, m2 and m3, with one fewer draft.
4. The claim ticket is built on the shared CounterPass primitive (dotted perforation, 12px notches, the kicker grammar) at its 40px phone tier. This closes risk 9: one primitive with two figure tiers, not two forks.

### B · The adversarial critic's blocking fixes (verdict: fix)

1. **Amendment 1 not applied: Undo's accessible name still includes the ticking count.**
   - Evidence: picked-m3.md:380 says 'its name is the visible label ("Undo — 6s ပြန်ဖျက်", 2.5.3)'. Lines 200-201 put the count inside the label with no aria-hidden leaf. The amendment requires the name to be 'Undo' alone, with ' — 6s' as an aria-hidden leaf, the same pattern as m1 and m7 (J34). The shipped leaf is SendToKitchenButton.tsx:281-284 (UndoCountdown).
   - Fix: Make the label `Undo<span aria-hidden> — {n}s</span>` + `<span lang="my">ပြန်ဖျက်</span>`, so the name is 'Undo ပြန်ဖျက်'. Rewrite A11Y line 380 to match. Keep the dashed --ac posture and the 318×64 slot.
2. **Amendment 2 not applied: there is no same-gesture guard on the 'I’m here' ⇄ Undo swap.**
   - Evidence: The spec never mentions SAME_GESTURE_MS or undoTapHeld (grep of picked-m3.md finds nothing). Lines 192-193 and 279 swap 'I’m here' and Undo in the same 318×64 slot and move focus onto the new control. The guard already exists: packages/ui/src/gesture.ts:15 `SAME_GESTURE_MS = 350` and apps/qr/lib/send-grace.ts:51 `undoTapHeld`. Without it, a double-tap un-rings the arrival or re-arms it in one gesture.
   - Fix: Add to STATES and A11Y: when either control mounts, record armedAt, and drop any tap within SAME_GESTURE_MS (350 ms) via undoTapHeld. Do this in both directions (I’m here→Undo and Undo→I’m here). Give it a red-first test and a mutant in lib/pickup-promise.ts or its hook.
3. **Amendment 3 not applied: the pass sub's Burmese is still the new draft, not the shipped counterBody clause.**
   - Evidence: picked-m3.md:590 uses DRAFT 'ဒီကုဒ်ကို ကောင်တာမှာ ပြပါ' (brief-m3.md:200). Risk 11 (line 926) still lists 'the pass sub' as a new K15 draft. The shipped clause exists at apps/qr/lib/i18n/cart.ts:101-103 (`counterBody.my` begins 'ကောင်တာက ဝန်ထမ်းကို ဒါလေး ပြလိုက်ပါ'), rendered at PayAtCounter.tsx:96-98.
   - Fix: Replace line 590 with the clause 'ကောင်တာက ဝန်ထမ်းကို ဒါလေး ပြလိုက်ပါ' (SHIPPED, counterBody first clause, i18n/cart.ts:103). Remove 'the pass sub' from Risk 11's draft list.
4. **Amendment 4 not applied: the claim ticket is not built on the CounterPass primitive, which is constant paper in both themes. Risk 9 is still open.**
   - Evidence: Lines 481-486 build the Ready face on the green `.exit-pass` grammar (bg --okb, 1px --ok; globals.css:6202-6209). Lines 23-25 say 'Ready turns the whole silhouette green'. Night swaps the ticket to theme tokens (lines 114-117 '#2b213c / #211a30', 461-462 '--okb #1f2e26', 659). Lines 915-917 (Risk 9) still call the two passes 'converging'. The shared vocabulary says there is one CounterPass, with the 40px .exit-pass-code phone tier, 'constant paper in both themes, like a Wallet pass, so Dad learns one look'.
   - Fix: Re-base both faces on CounterPass at its 40px phone tier: constant paper ground in light and Night, dotted perforation, 12px notches, kicker grammar. Ready reads through the ✓ kicker word, the time→code swap and the turn, not a green fill. Remove the Night ticket and pass recolours. Close Risk 9 as 'one primitive, two figure tiers (--fs-pass 88px / 40px)'.
5. **The keyboard hold on the take-back window has no cap, so a keyboard user's arrival is never sent while the screen says it will be.**
   - Evidence: Line 267: 'It holds while Undo has keyboard focus (:focus-visible only)'. Lines 204 and 381 move focus onto Undo programmatically after the tap, so every keyboard activation of 'I’m here' lands on a :focus-visible Undo and holds the window indefinitely. Meanwhile the h2 and the live region say 'We’ll tell the counter you’re here.' (lines 189, 362). The shipped precedent caps this hold: apps/qr/lib/undo-hold.ts:34 `PICKED_HOLD_CAP_MS = 60_000`, with a warn-before-cap line and an announced commit (ExpoBoard.tsx:779-795).
   - Fix: Reuse lib/undo-hold.ts for the arrival window: cap the hold, speak the 'about to go through' line in the one region before the cap, release at the cap, and announce the commit. Add a mutant on the cap.
6. **The pre-M65 'everything reads booked' arm prints false sentences, and requiring `fired` for the late arm strands an overdue guest.**
   - Evidence: Lines 234-237 set fired=false for every pickup until fire_at rides TRACK_ORDER_SELECT. Lines 246-251 then print 'You’re booked for 6:20 PM.' + 'The kitchen starts it closer to your time.' That is false for an ASAP order, which the KDS got at payment (fire_at = null, 20260722000000_pickup_asap.sql:97; w3_kitchen.sql:126-127). Lines 717-719 require `fired` for the late arm, so at 6:37 PM the guest reads 'starts it closer to your time' after her slot has passed, and the late door never appears. The spec's own line 717 shows `fired` is redundant for late, because fire_at ≤ slot. The 'Scheduled' chip needs liveOrderStatusWord, whose other callers (useActiveOrderStatus.ts:111, orders.ts:140) feed the header pill. Gating /track alone recreates the morph contradiction W22b removed (OrderTracker.tsx:501-506).
   - Fix: Make M65 a hard prerequisite in the same PR: add fire_at to TRACK_ORDER_SELECT and give liveOrderStatusWord a `fired` input for all three callers. Delete the pre-M65 arm. Key the late arm on slot + LATE_AFTER_MIN && !ready alone. Add a mutant for 'never "starts it closer" when fire_at is null'.
7. **The late sub 'It shows here the moment it is.' is false once the 4-hour session lapses, and that is M65's own canonical case.**
   - Evidence: Lines 677 and 726. Live updates ride Realtime under the RLS policy qr_order_read → is_member(), which requires `s.expires_at > now()` (20260618000000_qr_platform_init.sql:194-202, :242). SESSION_TTL_MS is 4 hours (session-ttl.ts:12). The spec's only fallback re-read fires on visibilitychange/focus (lines 284-286), never while the page stays visible. A noon-paid 6 PM pickup (OPEN-ITEMS.md:554, M65) is in exactly this lapsed state at slot + 15, so a guest staring at the open page never sees Ready land.
   - Fix: Either add a visible-only re-read on the existing 30 s tick (OrderTracker.tsx:298-303) whenever the live read is no longer authorized (getMyOrderFallback by earned_by), or replace the sub with the foot's true sentence 'This page catches up whenever you come back to it.'
8. **Staff nag: an early 'I’m here', now allowed any time on the pickup day, paints Dad's bag card warn and then late during normal service.**
   - Evidence: expoAge counts from arrivedAt (apps/qr/lib/expo-rules.ts:108) with warn at 10 min and late at 20 (:100). ExpoBoard.tsx:1451 maps the tone to data-tone, which fills the header --warnb plus a warn underline (globals.css:11752-11758). compareExpoTickets also pins an arrived bag to the top (expo-rules.ts:82). On the spec's own example (arrival 6:01 PM for a 6:20 PM slot, lines 120-121), Dad's card goes warn at 6:11 and late at 6:21 on a bag that is on time. A couch tap at 11 AM keeps it pinned and warn-filled for hours. That is a warn ground fill outside 'a Late ticket and the floor's one ask tile'. The spec acknowledges this and defers it (Risk 1, lines 885-889; Decision 23 'adds no staff surface').
   - Fix: In expo-rules.ts, count a pickup's age from max(arrivedAt, pickupSlot) when a slot exists. The 'Here now' badge and the bell stay, but the tone escalates only past the booked time. Optionally, pin an arrived bag only once arrivedAt ≥ fire_at. Add a pure test and a mutant. This is a rule change, not a new staff surface.
9. **NOW is said three or four times per screen, and the same Ready fact carries opposite marks, against 'each screen says NOW once, as its heading, in the family's own word with its mark' and 'same shape, same word on every surface'.**
   - Evidence: Screen 2 states it four times: the chip 'Ready for pickup' (line 471), the h1 'Your order is ready.' (473), the path's Ready stop drawn as NOW with accent and pulse (478), and the pass kicker '✓ READY FOR PICKUP · ယူလို့ရပြီ' (488-490). The ✓ is the DONE mark, while the path marks the same fact as now. Screens 1 and 3 repeat it three times: chip 'Preparing' + h1 + path 'In the kitchen' now. Risk 13 (lines 935-937) concedes two Burmese words for ready on one screen. The h1 uses the draft အဆင်သင့်ဖြစ်ပါပြီ, not the family's ယူလို့ရပြီ (staff.ts:885, :1916-1919).
   - Fix: For pickup, move .vt-order-status onto the ticket kicker (quiet's own move) and drop the separate chip row. Let the h1 be the one NOW and carry the family word and mark (ယူလို့ရပြီ at Ready). Remove the ✓ from the pass kicker, or render the Ready stop's mark consistently. The path stays the only step vocabulary.
10. **Screen 3 puts the human fallback (the phone door) above the NEXT sentence and the hero, against 'a quiet human fallback comes last'.**

- Evidence: Lines 685-692 place a 44px bordered pill with an --ac phone glyph inside the ticket, in the countdown slot. The NEXT sentence 'At the restaurant now?' and the hero 'I’m here' (lines 694-703) come after it. The shared vocabulary says the fallback ('Or ask at the counter'…) comes last, with the NEXT sentence directly above its hero.
- Fix: Move the tel door below 'I’m here' as the guide card's last line: still a 44px secondary with the language-neutral number and the aria-label 'Call (626) 665-5317'. In the late posture, leave the ticket's countdown slot empty, which also keeps the CounterPass free of controls.

### C · The critic's suggestions (not blocking; take them where the build agrees)

- Cite full paths: 'cart.ts:57-60' resolves to apps/qr/lib/i18n/cart.ts. apps/qr/lib/cart.ts:57-60 is the money module's viewAfterWrite. The same applies to 'staff.ts', which should be apps/qr/lib/i18n/staff.ts, not apps/qr/lib/staff.ts. Every other file:line I checked is accurate: OrderTracker, globals.css, expo-rules, expo-stage, arrival.ts, track-order, live-order, pickupTime, authz, session-ttl, orders.ts:197, tokens, primitives, migrations, OPEN-ITEMS C1/C2/M65, the brief-m3.md lines and the m3.json copy_my indices.
- Screen 2's confirmed row uses a 28px --okb-tinted disc with an --ok check (line 508). The shared vocabulary's done mark is a SOLID ✓ disc. Use the path's solid --ok disc with the --okb check, so 'done' has one shape.
- During 'Committing' (line 273), the control keeps the dashed Undo edge while reading 'Letting them know…'. Dashed means an open window, so drop the dashed edge once the window has closed.
- Key the ready-turn latch distinctly (e.g. `ready:${orderId}`). PaySuccess latches `paymentIntent ?? orderId` (OrderTracker.tsx:547), so a shared key could pre-latch the turn and lose the one delight.
- Commit-on-hide (line 269) goes through a Server Action fetch with no keepalive, so iOS may freeze the page before the response. State that the wake re-read reconciles to server truth, and that 'Refused' shows on return if the stamp didn't land.
- State explicitly that no pickup number appears before booking at the When/Pay steps. This addresses the judges' guided weakness ('Ready at 6:20 PM — earliest' preview; graft 6's slot_time <= v_close bound) and quiet's 'You’ll see your pickup time before you pay' gap. The spec is silent on the checkout screens beyond the three string fixes.
- Notches 'filled #faf9f5 with a 1px --bd ring' over PaperAmbient's lined ground will read as stickers, not bites. Consider matching the reward coupon, whose notch is the surrounding fill with no ring.
- 'The counter knows you’re here — hang tight.' after an early tap on a held order can mean waiting hours ('hang tight' implies a short wait). Consider the booked-time variant for a pre-slot arrival, reusing existing words only.
- The path's 'next' stops are a hollow --bd ring. The shared vocabulary reserves the hollow ring + 'Not sent yet' for dishes the kitchen hasn't got. Check with m1 that /track's shipped path ring doesn't read as 'not sent' on pickup.

### D · Round 3 (2026-10-07, under the owner's delegation) — these win over everything above

The owner delegated every open decision ("I trust you to apply world-class design-thinking best standards on
all open decisions") and added a live TV board, card / Apple Pay after the food is served, and animated step
guides. PATH_DESIGN_2026-10-07.md's round-3 section records the decisions (D1–D5) and the shared vocabulary.
The round-3 consistency pass gave this moment these changes:

1. D3: 'I'm here' keeps 'Undo · ပြန်ဖျက်' (erasing a mark you just made). No change.
2. The claim ticket is the CounterPass primitive at the 40px holder tier: times and codes in the .exit-pass-code face, --pass-\* inks, --pass-hole. The TV's Ready pickup pass (m9) is the same face at the board's shipped 54px row, so no new size is invented.
3. Name the time→code turn-over as the shared TURN on the Y axis. Its timing stays: two --dur-base halves, ease-in then --ease-out, latched once per order per tab, instant under reduced motion. m9 and m10 use the same recipe on the X axis for a status cell.
4. Loops: cap /track's mms-track-now halo at 3 cycles per step change (under WCAG 2.2.2's 5 s), and keep it off under reduced motion. Only ALARM loops.
5. /track never claims the TV, which may be absent or stale. The wall now shows the code and not the first name (m9). The lane and Checkout's 'We’ll call your name' stay true and unchanged.

### E · Codex round 5 (2026-10-08) — these win over everything above

1. **"I'm here" survives the page closing.** A tap inside its 6-second Undo window must still reach
   Dad if the guest closes the tab or navigates away: on `pagehide` the pending arrival is posted with
   `navigator.sendBeacon` to a thin route (the same pattern Checkout already uses, `Checkout.tsx:1603`,
   because a Server Action started on `pagehide` dies with the page), and the pending tap is also kept
   in `sessionStorage` and reconciled on return, so a beacon the browser drops is still sent. The route
   is idempotent on the order, so a beacon and a reconcile never record two arrivals.

### F · Codex round 6 (2026-10-08) — these win over everything above

1. **The pending "I'm here" is kept in `localStorage`, keyed by order — not `sessionStorage`.** E1 kept
   the pending tap in `sessionStorage`, which belongs to one tab and is gone when that tab closes — the
   very case E1 exists for, so a beacon the browser dropped on close was lost with the record meant to
   repair it. Keep the pending arrival in `localStorage` under a key that carries the order (one entry
   per order; it holds the order id and the tap time), behind try/catch like every other storage read in
   the app.
   - **Reconciled on the next visit.** When that order's /track mounts again on the same phone (any tab,
     any later visit), a pending entry is sent to the same idempotent route.
   - **Cleared only once the route confirms** — a success answer, or an answer that the order no longer
     takes an arrival (collected, cancelled, past its pickup day). Never on send and never on
     `pagehide`, so a dropped beacon or a failed reconcile is retried on the following visit.
   - **Taking the tap back** inside its 6 seconds deletes the entry before anything is sent.
   - The route stays idempotent on the order, so a beacon, a reconcile and a second tab never record two
     arrivals.
