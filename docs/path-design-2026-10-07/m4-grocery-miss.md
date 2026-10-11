# picked-m4 — "Let's Find It Together", elevated: the tag on the lens, the tag for the counter

Moment m4: a shelf jar's code won't scan (the market's miss). The shopper is on their own phone in the
market and reads Burmese, English or both. Dad is at the one counter, which is also the kitchen pass.

**Backbone: GUIDED** (owner answer 1: diner moments are guided). Every state says its one next step in
plain words, in both languages. The tag on the lens says **Search by name**. The sheet's dead end says
**Try one word from the name, or ask at the counter**, then **Back to the camera**. Nothing is a
dashboard, and nothing asks two questions at once.

**Grafted from QUIET ("The Lens Stays Put"):**

- The camera never scrolls away. The Scan door loses the search field that sat above the stage and pushed
  it down. Search on the Scan door is a sheet laid over the still-running lens.
- The miss lives inside the lens and has ONE primary. The counter is a quiet line, not a second button.
- No ✕ on the miss, no drawn toast for it, and no re-rise when the same jar is re-read.
- The fewest new claims. The sheet's states reuse the product's shipped words where they exist
  (`Search by name`, `Searching…`, `Search unavailable — please try again.`, the kiosk's counter sentence).

**Grafted from GLANCEABLE ("Paper Tag, Live Lens"):**

- One shape language, readable at arm's length. **A tag means "not added — this one goes to the counter".**
  **A round disc means "in your basket".** Words always ride with the shape, and colour is never the only cue.
- The tag is §27's own "paper for recovery" (DESIGN-LANGUAGE.md:2069-2071), cut as a shop tag. It is
  not a new vocabulary.
- The one moment of delight: **the tag's punched hole shows the live camera through it.** The lens is
  literally still there, under the paper. No new animation is added for it.

**Fixed from guided's judged weaknesses** (m4.json → judgement.scores[1].note):

- No step rail ("Code read › Find it › Keep scanning") for a one-step task.
- No two equal buttons. Search is the primary and the counter is a quiet line.
- The search field no longer sits above the stage.
- No counter-card digits staff cannot act on.
- No proxy-input focus trick.

**What the best in the world do at this exact moment, brought down to this family's room:**

- **A Japanese konbini self-checkout.** When an item won't read, the machine never blames you and never says
  "error". It names the next step and that a person will help. Here that becomes "It's not you", search
  by name, or the counter.
- **A price tag or luggage tag.** A tag is the universal sign for "priced, not yet rung up". A miss becomes
  a tag pinned under the jar, and the item, once in the basket, becomes a coin-like disc. In the
  cross-moment vocabulary, a tag is the paper you carry to the counter (m3's claim tag) and a disc is done
  (m1's sent disc).
- **A good grocer handing off.** When self-service fails, the handoff carries its own context, so a shopper
  never has to explain in a second language. The tag in the sheet says, in Burmese at 22px, the one thing
  Dad needs to know.
- **A wallet boarding pass.** One look on every phone. Both tags are constant cream with ink in both themes,
  so Dad learns that look once.

The design stays inside the family's constraints. It adds no hardware, no new staff screen and no
promise of a sale. Ruling #11 is unanswered, and M189 keeps market items off the pad.

**Example data (every number measured, not transcribed):**

- **Basket (2 lines).** Both rows come from supabase/data/grocery_catalog.json, both are EBT-eligible, and
  the arithmetic was computed in the shell. This is the same $14.95 / $8.03 example as every m4 artboard.
  - Instant Noodle Sauce (Monhinga)400g / စိန်ဟင်္သာမုန့်ဟင်းခါး(ဗူး)400g, $7.80, compare at $11.99.
  - Coconut Milk (400g) / အုန်းနို့-400g, $7.15, compare at $10.99.
  - Totals: Subtotal · before tax **$14.95**, saving **$8.03**, EBT-eligible **$14.95**.
- **The missed jar.** A real shelf label. Every catalog code is a store-internal 299-prefix EAN-13
  (grocery_catalog.json `barcode_note`).
- **The query on screen 2 is "durian".** Measured against the 405 seed items, it has zero substring hits in
  `name`, `name_my` or `synonyms`. Its best trigram similarity is 0.13 ("Marian Plum - Shanma"), under
  `mms_grocery_search`'s 0.25 bar (20260718000000_w4e_compare_at.sql:31-36). The RPC returns 0 rows.
- **The after-add example (states only).** Tea Leaves -400g / ဇယန်းလက်ဖက်ချိုနှပ်-400g, $6.44. Its
  synonyms are `laphet · lahpet · letphet · pickled tea`, which is why "laphet" or "tea leaf" finds it.

**Light tokens used (hex):**

- Ground and surfaces: --pg #faf9f5 · --cd #fffdf8 · --cd-raised #ffffff · --sf #f2efe7
- Text: --tx #1b1714 · --t2 #6e6358 · --t3 #726859
- Accent: --ac #a65f10 · --ac-strong #8f5009 · --oa #fffdf8 · --ok #346e47
- Lines and glass: --bd rgba(58,35,23,0.1) · --sheen rgba(255,255,255,0.55) · --scrim-glass rgba(15,10,5,0.3)
- Constant in both themes: --ink #1b1714 · --on-ink #fffdf8 · --scan-scrim = ink 72% (rgba(27,23,20,0.72))
  · --scan-dim = ink 40% (rgba(27,23,20,0.4)) (tokens.css:112, 401-405)

---

## CLAIMS VERIFIED AGAINST THE CODE (HEAD f6e81ce)

Where a claim failed, the design changed, never the claim.

| Claim the design depends on                                                                                                                       | Verdict             | Evidence → design consequence                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Today's miss is a not-live bar inside the stage with a bilingual sentence, a visible "Search" (named "Search by name" by aria-label only) and a ✕ | TRUE                | `components/grocery/ScanResult.tsx:92-124` (aria-label at :108, visible "Search" at :112, ✕ "Dismiss" at :115-122); `.scan-result` sits inset 8 at the stage foot on `--scan-scrim` (`app/globals.css:12812-12826`). → The tag replaces the notice in that same slot. Its button's name IS its visible bilingual text, and the ✕ goes. |
| The stage is 262px tall at 390px, and the reticle is 62% wide at 2.4:1, centred at 38%                                                            | TRUE                | `globals.css:12551-12560`: min((390−40)×0.75, 36svh) = min(262.5, 303.8). `:12586-12596`: the window spans stage y 54.6–144.9, so page y 332–422 with the stage at 277. → The tag has ≤109px below the reticle. It is 107px. The reticle never moves.                                                                                  |
| The search field sits ABOVE the stage, outside both tab panels, and "Search" scrolls it to the centre                                             | TRUE                | `app/grocery/page.tsx:1088-1100` (the field), `:1105-1190` (results, above the Scan panel), `:788-796` (`focusSearch`, `scrollIntoView` centre). → On the Scan door the field is gone (Browse keeps it), and the stage moves up 58px to y 277. Every Scan-door "Search by name" opens the Name sheet.                                  |
| Three focus fallbacks park on that field                                                                                                          | TRUE — must change  | `page.tsx:425` (row removed), `:1015` (fresh-basket retry), `:1533` (basket sheet close with no lines). → On the Scan door they must park on `#scan-stage` instead (see OPEN RISKS).                                                                                                                                                   |
| A sheet over the stage SWALLOWS sightings, and closing it never announces the jar in frame                                                        | TRUE                | `lib/camera-state.ts:151-156` (`decodeHold` → `swallow` first), `:158-165` (`gateOnHoldChange` keeps the throttle on swallow→none); `ScanStage.tsx:257`; `page.tsx:1234` (`sheetOpen` = basket ∨ door sheet). → The Name sheet joins `sheetOpen`. The lens keeps streaming but adds nothing, and nothing charges on close.             |
| The stage hint hides while a result shows; the result renders only while streaming                                                                | TRUE                | `ScanStage.tsx:370` (`cam === "live" && !result`), `:386`.                                                                                                                                                                                                                                                                             |
| The live stage's accessible name                                                                                                                  | TRUE                | `ScanStage.tsx:87`: "Scanner on — point your camera at the code on the package".                                                                                                                                                                                                                                                       |
| The same jar re-announces after any 1.5s gap, and every outcome re-keys the bar (a re-rise)                                                       | TRUE — fixed in lib | `lib/scan-gate.ts:47` (`SCAN_QUIET_MS = 1500`), `:65`; `lib/scan-notice.ts:56-75` (`slotAfter` always takes the new key). → `slotAfter` keeps the current key when a notice repeats the same barcode, so there is no second rise and no second announcement.                                                                           |
| A search add never plants a notice; an ok add turns the slot into the chip, named from the basket                                                 | TRUE                | `scan-notice.ts:44` (`fromCamera`), `:61` (ok → chip); `page.tsx:613` (`setLastScanned` on ok), `:1246-1258` (chip named from the basket line; meta "In your basket ×{qty}" or "Waiting for a connection"). → After a rescue add the tag becomes the disc chip with no new branch.                                                     |
| The haptic is post-verdict and on ok only; there is no sound                                                                                      | TRUE                | `page.tsx:603-607`; DESIGN-LANGUAGE.md:2078-2079 (§27 "The lock says read, never added", no sound §15). → A miss never buzzes.                                                                                                                                                                                                         |
| A repeat has a shipped sentence (M186)                                                                                                            | TRUE                | `page.tsx:536`: "{name} is already in your basket (×{qty}) — tap “Add another” for a second." → Graft 3's pairing reuses it. `check:scan-repeat` exists (`scripts/check-scan-repeat.mjs`).                                                                                                                                             |
| Today's miss toast is drawn, English only, 1.8s                                                                                                   | TRUE — replaced     | `page.tsx:644` "We couldn’t find that item — search by name."; `:274` (1800 ms). → Spoken through the Toast's `quiet` mode, not drawn.                                                                                                                                                                                                 |
| The page has ONE live region that still speaks while a Radix sheet is open; it has `quiet` and `action`                                           | TRUE                | `packages/ui/src/toast.tsx:11-16` (role=status + aria-live, exempt from Radix's aria-hidden sweep), `:44-48` (`quiet`), `:24-35` (`action`, hold on keyboard focus); `page.tsx:1467`. → No second region inside the sheet.                                                                                                             |
| `grocery_scan_miss` fires once per barcode; `grocery_item_scanned` carries `via`                                                                  | TRUE                | `page.tsx:645-649`, `:626-634`. → Graft 2 adds `miss_barcode` and `since_miss_ms` to the existing event, and only on adds from a miss-opened sheet.                                                                                                                                                                                    |
| Name search matches English, Burmese and synonyms, with fuzzy English; it excludes weighed and unavailable items; max 20                          | TRUE                | `supabase/migrations/20260718000000_w4e_compare_at.sql:19-45`. → Weighed and unavailable tags carry NO search button, because search could never return that item.                                                                                                                                                                     |
| A failed search is told apart from zero results                                                                                                   | TRUE                | `lib/grocery.ts:276-282` (throws); `page.tsx:851-857` (`searchFailed`). → Separate "unavailable" and "no match" states.                                                                                                                                                                                                                |
| Shipped search strings                                                                                                                            | TRUE                | `page.tsx:1096` ("Search grocery items by name"), `:1097` (placeholder), `:1109` ("Searching…"), `:1111` ("Search unavailable — please try again."), `:1113` ("No matches — try fewer letters."), result rows `:1116-1180` (a button that adds; "Compare at" strike).                                                                  |
| Most shelf codes aren't in the app yet, and "yet" is backed                                                                                       | TRUE                | grocery_catalog.json `barcode_note`: "store-internal EAN-13 (prefix 299) … replace per item when the real shelf UPC is scanned in"; `docs/OPEN-ITEMS.md:31` (C6: real shelf UPCs still needed from Min).                                                                                                                               |
| "Not in the app yet" (quiet's headline) is true of the JAR                                                                                        | FALSE               | The jar's ITEM is usually in the app under its synthetic code; only the real code is missing. Tea Leaves -400g is in the catalog, but its shelf code is not. → Headline changed to **"This code isn’t in the app yet."** The words now motivate the search instead of contradicting it.                                                |
| The Sheet: Radix dialog with sticky head (grab ≥44, title, 44/32 ✕), focus restore to the opener, `onCloseAutoFocus` override                     | TRUE                | `packages/ui/src/sheet.tsx:248-255`, `:266`, `:300-330`; `globals.css:234-310`.                                                                                                                                                                                                                                                        |
| The Sheet can open with the FIELD focused, so the keyboard rises in the same tap                                                                  | FALSE today         | `sheet.tsx:241-246, 267-272`: initial focus is pinned to the container. → The sheet is designed to read fully with the keyboard DOWN. The field is one more tap until Sheet gains a one-prop `initialFocus` (OPEN RISKS).                                                                                                              |
| The defocus scrim (blur 28, saturate .85) is the shipped scrim in both themes, with fallbacks                                                     | TRUE                | `globals.css:9689-9711`; `tokens.css:229` (`--fx-glass-far` on :root), `:272` / `:601` (`--scrim-glass`).                                                                                                                                                                                                                              |
| A bilingual sheet title has a precedent                                                                                                           | TRUE                | `components/DoorSheet.tsx:127-133` (title = EN + `<span lang="my">`).                                                                                                                                                                                                                                                                  |
| Paper recovery panels use the bilingual button pattern, and "Search by name" is already their action                                              | TRUE                | `ScanStage.tsx:288-302` (`<Bi k="searchByName" />`).                                                                                                                                                                                                                                                                                   |
| A count is allowed on the market basket (it is not a shared cart)                                                                                 | TRUE                | `lib/order-noun.ts:36-38` (`slotCount` is null only for dine-in); tabs read Market · Basket · Account (`lib/diner-tabs.ts:131, 152, 160`).                                                                                                                                                                                             |
| Undo can ride the existing quantity path                                                                                                          | TRUE                | `page.tsx:406` (`stepQty`), `:426` ("Removed {name}"); `lib/undo-hold.ts` exists; "ထည့်ပြီးပါပြီ" is the shipped add claim (`lib/add-feedback.ts:41`); "ပြန်ဖျက်" is shipped (`lib/i18n/staff.ts:255`).                                                                                                                                |
| The counter can ring a market item into the app                                                                                                   | FALSE               | `docs/OWNER_RULINGS_2026-10-07.md:58` (#11, no answer: default holds), `:79` (M189: market items only on scan-and-go carts). → The counter line promises a PERSON, never a sale. The card for Dad shows no digits, because no staff screen can act on them.                                                                            |
| Every market Burmese string is Claude-authored and awaits Min's read                                                                              | TRUE                | `lib/i18n/market.ts:6-8`. The kiosk lines are K15 drafts too (`lib/kiosk/strings.ts:107`). → Every Burmese line below is listed with its source; none is invented.                                                                                                                                                                     |

---

## SCREEN picked-m4-1.dc.html — The miss, answered inside the lens: a paper tag with one way forward

**Device:** phone 390×844. **Theme:** light. Night is described under STATES.
**Who and when:** A shopper on the Scan door points at a jar of Burmese tea-leaf pickle. Its real shelf
code reads (the reticle corners flashed gold for 900 ms: "read", never "added"). The server answers
`unknown_barcode`. The basket already holds two lines.

### LAYOUT (page coordinates, top to bottom; page column x 20–370)

- **0–47.** Empty ground #faf9f5 (safe area). Draw nothing.
- **47–103 AppHeader**, as built.
  - 56px tall, padding 0 14px, #faf9f5, 1px rgba(58,35,23,0.1) bottom line.
  - Brand link (min-height 44, gap 6): the logo `<img src="/_blob/e7e27a9553079ddb61cfec7bd9f82c9f" alt="">` at 51×34, then "Morning Star" in Fraunces 16/800, -0.01em.
  - Nothing on the right.
- **`main`**: padding 123px 20px 0, a flex column with gap 12.
- **123–167, the door eyebrow** (unchanged; the DoorSheet trigger).
  - A `<button aria-haspopup="dialog">`, min-height 44, margin-left −8, padding 0 8, transparent.
  - Label: "SCAN & GO" 11/700, 0.13em, uppercase, #a65f10. Then "·", then 'စျေး' Padauk 13/700 (no uppercase), then a 14px chevron. Gap 6.
  - sr-only tail: " — change how you’re ordering".
- **171–199, h1 "Shop the market"**: Fraunces 26/600, lh 1.08, -0.02em, #1b1714.
- **211–265, the Browse | Scan tablist** (unchanged).
  - A pill track: 4px padding, 1px rgba(58,35,23,0.1), #f2efe7, two 44px tabs.
  - Scan is current: #a65f10 fill, #fffdf8 text 16/700, inset 0 1px 0 rgba(255,255,255,0.55). It holds an 18px scan glyph and "Scan".
  - Browse is at rest (#6e6358, basket glyph).
  - **There is NO search field below the tabs on the Scan door.** It lives on Browse only, so the stage rises from y 335 to y 277.
- **277–539, THE STAGE** (unchanged geometry). `section#scan-stage`, x 20–370, 350×262, radius 20, #1b1714, overflow hidden, isolation isolate.
  - **The camera scene.** The same 350×262 aria-hidden SVG as m4-quiet-1 and m4-guided-1: the shelf, and a jar whose paper label carries a barcode inside the window. The refined screen reads as the same lens.
  - **The window and the reticle**: x 86–303, y 332–422 (stage-relative left 66, top 55, 217×90).
    - The static dim outside it: `box-shadow: 0 0 0 400px rgba(27,23,20,0.4)`.
    - Four L-corners, each arm 22×3 with radius 999, #fffdf8 with a 1px rgba(27,23,20,0.72) halo.
    - The corners are white: the 900 ms gold lock has ended.
  - **The top hint pill is hidden** (a result is showing: one message at a time).
  - **THE TAG: x 28–362, y 424–531 (334×107)**, anchored inset 8px at the stage's foot. Its top edge clears the reticle's bottom (422) by 2px. Tag-local coordinates:
    - **Silhouette.** One aria-hidden SVG, 334×107: a shop tag.
      - The right corners have radius 20. The left corners are chamfered 16px: the top edge starts at x 16, the left edge runs y 16–91, and the bottom edge starts at x 16.
      - Fill #fffdf8 (--on-ink, constant in both themes). Rim 1px rgba(27,23,20,0.18).
      - Shadow: `drop-shadow(0 1px 1.5px rgba(35,24,16,0.07)) drop-shadow(0 10px 14px rgba(0,0,0,0.3))`.
      - Build it as one path, e.g. `M16.5 .5 H313.5 A20 20 0 0 1 333.5 20.5 V86.5 A20 20 0 0 1 313.5 106.5 H16.5 L.5 90.5 V16.5 Z`, with the hole subtracted (evenodd).
    - **The punched hole**: a 10px circle at (17, 53.5), cut THROUGH the paper. The live camera shows through it, which is the moment's one delight. A grommet ring around it: a circle r 8.5, 1.5px stroke rgba(27,23,20,0.3), no fill.
    - **Content box**: padding 8px 12px 8px 34px, so x 34–322 (288 wide) and y 8–99.
    - **Headline `<p>` (y 8–47)**:
      - "This code isn’t in the app yet." in Fraunces 16/600, lh 1.1, -0.01em, #1b1714. One line, about 250px.
      - Beneath it, display block: 'ဒီကုဒ် အက်ပ်ထဲမှာ မရှိသေးပါ။' in Padauk 13/400, lh 1.6, #1b1714.
    - **Action row (y 47–99, 52 tall)**: flex, align-items centre, gap 12.
      - **THE ONE PRIMARY, an ink pill.** A `<button aria-haspopup="dialog">`, flex none, min-height 52, padding 6px 14px, radius 999, background #1b1714, colour #fffdf8, no border, no icon (the words say it).
        - Label: a centred column. "Search by name" 14/800, -0.01em, lh 1.22, nowrap. Then 'နာမည်နဲ့ ရှာမယ်' Padauk 13/700, lh 1.6.
        - About 140px wide.
        - It is constant ink-on-cream for the same reason `.scan-on-ink` is constant cream-on-ink (globals.css:12772-12779): a constant surface takes the constant pair.
      - **THE QUIET LINE.** A `<p>`, flex 1, min-width 0. It is NOT interactive.
        - "Or ask at the counter" 13/500, lh 1.22, #1b1714. Beneath it, display block, 'ကောင်တာမှာ မေးကြည့်ပါနော်' Padauk 13/400, lh 1.6, #1b1714.
        - The column is about 136px.
        - Hierarchy comes from size and weight, never dimming.
        - If the Burmese wraps (large text, phones ≤375px), the row grows and the TAG GROWS UPWARD. Text never shrinks or clips.
    - **No ✕.** The tag is not modal, and the next outcome replaces it.
    - In page coordinates: headline 432–471, action row 471–523, tag foot 531.
- **555–623, the Subtotal box** (unchanged; aria-hidden).
  - Radius 20, 1px rgba(132,76,18,0.26), `linear-gradient(180deg,#fbf5ec,#fffdf8)`, inset sheen, padding 12px 16px, baseline row.
  - "SUBTOTAL · BEFORE TAX" 12/800, 0.05em, uppercase, #6e6358. Then "$14.95" 40/800, lh 1.05, tabular, #1b1714.
- **629–649**: "You’re saving $8.03 vs. typical market prices", 13/700, #8f5009, tabular figures.
- **655–694, the EBT line**.
  - An "EBT" tag: 11/800, #346e47, 1px rgba(52,110,71,0.5), radius 6, padding 1px 6px, aria-hidden.
  - Then "$14.95 of your basket is EBT-eligible — SNAP checkout coming; pay by card today.", 13px, #6e6358, wrapping to 2 lines.
- **710 →, the basket rows** (scroll under the dock; drawn as m4-quiet-1 drew them).
  - Card row: 56px photo placeholder `linear-gradient(135deg,#f1e7d6,#fbf4e8)`.
  - Text: "Instant Noodle Sauce (Monhinga)400g" 15/700. Beneath it, 'စိန်ဟင်္သာမုန့်ဟင်းခါး(ဗူး)400g' Padauk 13 #726859 (G20, ruling #19). Then "1 × $7.80" 13px #726859.
  - "$7.80" 700 on the right.
- **678–734, the checkout dock** (fixed, x 12–378, gap 8; unchanged).
  - Paper basket button: 56px, cart glyph and "2", `aria-label="Review basket — 2 items"`.
  - Clay "Check out · 2 items · $14.95": #a65f10, #fffdf8 16/800, `aria-label="Check out — 2 items, subtotal $14.95 before tax"`.
- **750–844, the tab bar** (unchanged).
  - **Market** is current: `aria-current="page"`, #8f5009, bag glyph.
  - **Basket**: receipt glyph with a "2" capsule (18px, radius 999, #a65f10, #fffdf8 12/800). Allowed, because this cart is not shared.
  - **Account**: star glyph.
  - The bottom 34px is empty.
- **The toast draws nothing.** The page's one region (role=status, aria-live=polite, sr-only here) holds the spoken sentence: "This code isn’t in the app yet — search by name, or ask at the counter."

### STATES (described, not drawn)

- **Arrival.** The tag rises once (`.mms-rise`, globals.css:1079, reduced-motion gated at :1084). The Toast speaks once, quietly.
- **The same jar re-read while its tag shows.** Nothing changes: same key, no rise, no second announcement (the `slotAfter` change). The server call still runs. `grocery_scan_miss` still fires once per barcode (page.tsx:645-649).
- **A different jar.** Its outcome replaces the tag, re-keyed.
- **"Search by name"** opens screen 2's Name sheet in its just-opened state. The tag stays mounted under the sheet, and focus returns to its button on close.
- **After an add from the sheet (the server's ok only).** The sheet closes itself, and **the tag becomes the CHIP: the disc**.
  - Ink-glass bar: --scan-scrim, radius 20, padding 10px 12px, about 76px tall.
  - Left: a **32px round cream disc** (#fffdf8) with a 2.5px #346e47 ring and a 16px ink check (aria-hidden).
  - Then "Tea Leaves -400g" 14/700 (ellipsis), 'ဇယန်းလက်ဖက်ချိုနှပ်-400g' Padauk 13 (G20), and "In your basket ×1" 13px.
  - Then "Add another", the shipped `.scan-on-ink` pill, 44px.
  - Tag → disc is the story "not added → in your basket", told by shape and words.
  - The Toast DRAWS (it carries an action): "Added Tea Leaves -400g · ထည့်ပြီးပါပြီ" with [Undo / ပြန်ဖျက်].
    - It lasts 6 s and is held while it has keyboard focus (toast.tsx:24-35; lib/undo-hold.ts).
    - Undo = `stepQty(line, qty − 1)` (page.tsx:406), which says "Removed Tea Leaves -400g" (:426) and forgets the pairing.
    - Undo is offered only when the add's response carried the server's lines.
  - The dock's dollar figure moves only when the server's view lands (amounts never optimistic).
- **Pairing (graft 3).** For this page's life, the missed shelf code maps to the barcode of the first item added from the sheet that miss opened.
  - Re-reading the jar resolves to that barcode BEFORE `classifyScan` (scan-gate.ts:105). It gets M186's repeat verdict and its shipped sentence (page.tsx:536): the disc chip, never a second miss, never a second charge.
  - The pairing lives in a page ref and is never stored or sent.
- **Weighed tag.** The same silhouette, with the kiosk's "That one needs the scale — please bring it to the counter." and its Burmese.
  - No button: search excludes weighed items (migration :31).
  - No quiet line: the sentence is the way out.
- **Unavailable tag.** "That item isn’t available today." and its Burmese. No button (search excludes it) and no quiet line.
- **Offline, and the code is absent from a complete cached catalog fetched under 24 h ago** (graft 1; `fetchedAt`, grocery-catalog-cache.ts:19).
  - The tag shows the headline and the quiet line but NO button: search needs a connection.
  - The code is not queued.
  - The button appears when the phone is back online, with no focus move.
- **Offline, with no cache or a stale one.** The code is queued, and its chip carries a DASHED 2px disc ring with "Waiting for a connection" (shipped meta, page.tsx:1255).
  - There is no "Add another" for an unknown code.
  - The toast "Saved — we’ll check this code when you’re back online." replaces "Saved — adds when you’re back online." (page.tsx:501).
- **Basket not ready, or transport failure.** Unchanged: the slot stays as it was (scan-notice.ts:62).
- **Ring-up seam (OFF).** The owner's question is unanswered, so default (a) holds. On a yes, one constant swaps the quiet line to "Or bring it to the counter — we’ll ring it up." / 'ဒါမှမဟုတ် ကောင်တာဆီ ယူလာခဲ့ပါ — အဲဒီမှာ ရှင်းပေးပါမယ်'. A verify:slice mutant pins that the default can never render it.
- **Night.**
  - Identical: the stage (constant ink), the tag (constant cream, ink text), its ink pill, and the disc.
  - Around it: --pg #100c19, text #f3ecdf, tabs #211a30. Scan is lit #e7a53a with #130d1e. The dock and tab bar are on Night tokens.
- **Phones ≤375px or 200% text.** The tag grows upward over the window's lower edge. The detector reads the whole frame, so the next scan still works. The reticle never moves.

### COPY (English)

- This code isn’t in the app yet. — new. It replaces `noticeUnknown`'s English for the unknown tag (`lib/i18n/market.ts:89`).
- Search by name — shipped `searchByName` (`market.ts:44`), now the button's VISIBLE label (today it shows "Search", `ScanResult.tsx:112`).
- Or ask at the counter — the owner's default. The words come from the kiosk's shipped `scanUnknown`, "please ask at the counter" (`lib/kiosk/strings.ts:105-106`).
- Spoken only (Toast `quiet`): This code isn’t in the app yet — search by name, or ask at the counter.
- Page chrome, unchanged:
  - Scan & go
  - Shop the market
  - Browse
  - Scan
  - Subtotal · before tax
  - $14.95
  - You’re saving $8.03 vs. typical market prices
  - $14.95 of your basket is EBT-eligible — SNAP checkout coming; pay by card today.
  - Check out · 2 items
  - Market
  - Basket
  - Account
- States:
  - That one needs the scale — please bring it to the counter.
  - That item isn’t available today.
  - In your basket ×1
  - Add another
  - Added Tea Leaves -400g
  - Undo
  - Removed Tea Leaves -400g
  - Waiting for a connection
  - Saved — we’ll check this code when you’re back online.

### COPY (Burmese) — shipped strings or the briefs' drafts only

- ဒီကုဒ် အက်ပ်ထဲမှာ မရှိသေးပါ။ — brief draft (m4.json → concepts[guided] screen "5 · Nothing by that name…", copy_my "DRAFT: ဒီကုဒ် အက်ပ်ထဲမှာ မရှိသေးပါ။"). It literally says "this code isn't in the app yet".
- နာမည်နဲ့ ရှာမယ် — shipped (`market.ts:44`).
- ကောင်တာမှာ မေးကြည့်ပါနော် — shipped words, the tail of the kiosk's `scanUnknown` (`kiosk/strings.ts:107`), exactly as the quiet brief's floor draws it (brief-m4.md:87). If Min prefers it, the full K15 draft with "or" is ဒါမှမဟုတ် ကောင်တာမှာ မေးကြည့်ပါနော် (brief-m4.md:102, :313).
- စျေး — shipped (the masthead eyebrow word, `market.ts:11`).
- States:
  - ဒီပစ္စည်းက ချိန်ဖို့လိုပါတယ် — ကောင်တာဆီ ယူသွားပေးပါနော်။ (shipped kiosk `scanWeighed`, `kiosk/strings.ts:115`)
  - ဒီပစ္စည်း ဒီနေ့ မရသေးပါ။ (shipped kiosk `scanUnavailable`, `:111`)
  - ထည့်ပြီးပါပြီ (shipped add claim, `lib/add-feedback.ts:41`)
  - ပြန်ဖျက် (shipped `kds.undo`, `lib/i18n/staff.ts:255`)
  - သိမ်းထားပါတယ် — အင်တာနက် ပြန်ရရင် ဒီကုဒ်ကို စစ်ပေးပါမယ်။ (m4.json guided screen 6 draft)
  - the item's Burmese name from `name_my` (G20)
  - the ring-up seam ဒါမှမဟုတ် ကောင်တာဆီ ယူလာခဲ့ပါ — အဲဒီမှာ ရှင်းပေးပါမယ် (brief-m4.md:103, OFF)
- "In your basket ×1" and "Add another" stay English, as shipped. Their drafts exist (စျေးခြင်းထဲမှာ ×1 / နောက်တစ်ခု ထပ်ထည့်မယ်, brief-m4.md:315-316), but G23 owns making the chip bilingual.

### A11Y

- **Region.** `section#scan-stage`, tabIndex −1, named by its sr-only h2 "Scanner on — point your camera at the code on the package" (`ScanStage.tsx:87, 362`).
- **The tag.**
  - A plain `div`, deliberately NOT a live region (the shipped rule, `ScanResult.tsx:8-13`).
  - Reading order: headline `<p>` (English, then the `lang="my"` block), then the button, then the quiet `<p>`.
  - The silhouette SVG, the hole and the grommet are aria-hidden.
- **The button's accessible name is its visible text**, "Search by name နာမည်နဲ့ ရှာမယ်" (the Burmese span `lang="my"`), so WCAG 2.5.3 holds. Today's aria-label/visible mismatch ("Search by name" over "Search") is gone. It is `aria-haspopup="dialog"`, 52px tall.
- **Focus.**
  - `focusHandoffRef` carries focus across the tag's own remount (`ScanResult.tsx:54-68`).
  - With no ✕, the button is the tag's only stop.
  - After a rescue add, focus lands on the chip's "Add another" (an `onCloseAutoFocus` override, because the opener unmounted with the tag).
- **One live region.** The page Toast (`page.tsx:1467`) speaks the miss once, quietly. A re-read of the same jar is never re-spoken. The chip's "Added …" is spoken by the same region when its Undo pill draws.
- **Never colour alone.** A tag means not added, and a disc with a check means in your basket. Every state also says it in words. The --ok ring is a third cue only.
- **Contrast.**
  - #1b1714 on #fffdf8: 17.5:1 (headline, quiet line, and the pill's inverse).
  - Cream tag against the dimmed ink stage: about 15:1 boundary.
  - Tab "Market" #8f5009 on #faf9f5: as shipped.
- **Targets.** Button 52 × about 140, dock 56, tabs 44.
- **Motion.** `.mms-rise` is reduced-motion gated (globals.css:1084). The lock corners are static under reduced motion (:12940-12944). Dropping the re-rise means less motion overall. No sound (§15), and no haptic on a miss.
- **Burmese.** Padauk 400/700 only, ≥13px, lh 1.6. Separated by block or gap, never a whitespace node (§6). Digits Latin.

---

## SCREEN picked-m4-2.dc.html — The Name sheet over the live lens: nothing by that name, "It's not you", and the tag for the counter

**Device:** phone 390×844. **Theme:** light. Night is described under STATES.
**Who and when:** The shopper tapped the tag's "Search by name". The Name sheet rose over the
still-streaming lens. They typed "durian", and the debounced search came back with zero rows. They
lowered the keyboard (the field is unfocused, so no keyboard is drawn) to read the sheet, and perhaps to
carry the phone to Dad.

### LAYOUT (page coordinates)

- **Underneath, 0–844.** Screen 1's page exactly (header, masthead, tabs, the live stage with its tag, the summary, the dock, the tab bar), DEFOCUSED.
  - **Scrim**: fixed, inset 0, rgba(15,10,5,0.3) with `backdrop-filter: blur(28px) saturate(0.85)` (the shipped `.mms-scrim`).
  - The stage keeps streaming under it (`decodeHold` swallow). Nothing is added behind the sheet or when it closes.
  - The sheet covers y 232 down. The blurred header, masthead and the lit Scan tab remain recognisable above it.
- **THE SHEET: x 0–390, y 232–844.**
  - #fffdf8 (--cd), radius 26 26 0 0, `box-shadow: 0 24px 60px rgba(35,24,16,0.16)` (--sh-xl).
  - Padding 0 20px 58px (24 + the 34 home inset). Height follows content.
- **232–346, the sticky head.**
  - #ffffff (--cd-raised), inset 0 1px 0 rgba(255,255,255,0.55), padding 8px 20px 8px, spanning the full width.
  - **240–284 grab zone** (44), with a 38×5 bar, radius 3, rgba(58,35,23,0.1), centred at y 262. Margin-bottom 2.
  - **290–338, the title h2**:
    - "Search by name" in Fraunces 22/600, lh 1.2, -0.02em, #1b1714.
    - Beneath it, display block inside the same h2: 'နာမည်နဲ့ ရှာမယ်' Padauk 13/400, lh 1.6, #6e6358.
    - The sheet's title is the button's words: the door you tapped is the room you are in.
  - **✕**: 44×44 at x 336–380, y 238–282 (top 6, right 10). A 32px #f2efe7 disc (background-clip content-box) and an 18px close glyph, #1b1714.
- **358–406, the field.** x 20–370, a 48px pill.
  - #fffdf8, 1px rgba(58,35,23,0.1), inset 0 1px 0 rgba(255,255,255,0.55), padding 0 14px, gap 10.
  - An 18px search glyph, #726859.
  - The input, 16px (the iOS no-zoom floor), value **"durian"** in #1b1714.
  - Unfocused: no ring, keyboard down.
  - sr-only `<label>`: "Search grocery items by name".
- **422–594, the state block** (`div#name-state`, start-aligned, x 20–370; NOT a live region). It is the "It's not you" empty state:
  - **422–462**: "It’s not you — most shelf codes aren’t in the app yet." Hanken 15/600, lh 1.33, #1b1714, 2 lines.
  - **464–506**: 'သင့်အမှား မဟုတ်ပါဘူး — ဆိုင်က ကုဒ်အများစု အက်ပ်ထဲ မရောက်သေးလို့ပါ။' Padauk 13/400, lh 1.6, #6e6358, display block, margin-top 2.
  - Gap 8.
  - **514–552**: "Try one word from the name — or ask at the counter." 14/500, lh 1.35, #6e6358, 2 lines. This is the spoken next step.
  - **552–594**: 'နာမည်ထဲက စကားလုံး တစ်လုံးနဲ့ ထပ်ရှာကြည့်ပါ — ဒါမှမဟုတ် ကောင်တာမှာ မေးပါ။' Padauk 13/400, lh 1.6, #6e6358.
- **608–718, THE TAG FOR THE COUNTER** (x 20–370, 350×110). The same object as the tag on the lens, now lying on the sheet's paper, so the shopper can hold it up to Dad.
  - **Silhouette**: an aria-hidden SVG 350×110.
    - Right radius 20, left chamfers 16.
    - Fill #fffdf8 (constant cream), rim 1px rgba(27,23,20,0.18).
    - Shadow --sh-paper, as `drop-shadow(0 1px 1.5px rgba(35,24,16,0.07)) drop-shadow(0 14px 14px rgba(35,24,16,0.14))` (the paper tier: `0 1px 3px -1px rgba(35,24,16,0.07), 0 14px 28px -18px rgba(35,24,16,0.28)`, tokens.css:197).
    - The punched hole: a 10px circle at (17, 55), cut through to the sheet. Grommet ring r 8.5, 1.5px rgba(27,23,20,0.3).
  - **Content**: padding 14px 16px 14px 36px, so x 56–354 (298 wide).
  - **622–643, the kicker row** (flex, gap 8, baseline):
    - "FOR THE COUNTER" 11/800, 0.13em, uppercase, #1b1714.
    - "·" #1b1714, aria-hidden.
    - 'ကောင်တာအတွက်' Padauk 13/700, #1b1714.
  - **647–668**: "This code isn’t in the app yet." 16/700, lh 1.3, #1b1714. These are the tag-on-the-lens's own words: one vocabulary.
  - **668–704**: 'ဒီကုဒ် အက်ပ်ထဲမှာ မရှိသေးပါ။' Padauk **22/700**, lh 1.6, #1b1714. This is the line Dad reads from across the counter.
    - English still leads (D12), but Burmese is the bigger line, because the reader is Dad.
  - Nothing else: no code digits, no query, no price, no promise of a sale.
- **734–786, the ONE primary** (`.ui-btn-primary`): x 20–370, min-height 52, radius 999.
  - Fill `linear-gradient(180deg,#a65f10,#8f5009)`, text #fffdf8.
  - Shadow `inset 0 1px 0 rgba(255,255,255,0.55), 0 2px 8px -1px rgba(166,95,16,0.42)`.
  - Label: a centred row with gap 8 (the shipped Bi pattern). "Back to the camera" 15/800, -0.01em, then 'ကင်မရာဆီ ပြန်သွားမယ်' Padauk 13/700. No icon (width).
- **786–844**: sheet padding and home inset, empty.

### STATES (described, not drawn)

- **Just opened** (from the tag's button).
  - The field is empty, with the shipped placeholder "Search in English or မြန်မာ…".
  - The state block holds:
    - "It’s not you — most shelf codes aren’t in the app yet." and its Burmese. This repeats the coverage truth where the miss happens, because the primer is only seen before the first camera grant (graft 4).
    - Then "One word from the name is enough — like “tea leaf” or “လက်ဖက်”." and its Burmese.
  - No counter tag and no CTA. The sheet hugs its content, and the ✕ is the way back.
  - Initial focus goes to the sheet container (sheet.tsx:241-246), so the keyboard rises on the field tap. With the proposed `initialFocus`, it rises in the opening tap.
- **Typing** (≥2 characters; 220 ms debounce, page.tsx:832-859).
  - "Searching…" / 'ရှာနေပါတယ်…' sits in the state slot.
  - Then up to 20 rows: the ONE shared `.grocery-result` row, extracted from page.tsx:1116-1180 so Browse and the sheet cannot drift.
    - Radius 20, ≥56px.
    - Name 16/600. Then 'name_my' · brand · size at 13px #726859.
    - Price 16/800 tabular, with the shipped "Compare at" strike.
  - Tapping a row runs `add(barcode, "search")`, the one server-priced `scanAdd` path.
    - The busy row is aria-busy at 0.55 opacity. Other rows are aria-disabled, never natively disabled.
    - The sheet closes ONLY on the server's ok, to screen 1's disc chip and the Undo toast.
- **8–14 digits typed.** Package 2's line, "That looks like a barcode — search by the item’s name (English or Burmese)." It never fires `grocery_scan_miss`.
- **No match.** As drawn. The field keeps "durian", so retyping stays one tap away.
- **Offline.**
  - The state line reads "Search needs a connection — or ask at the counter." with its Burmese.
  - The counter tag shows (it needs no network), and the primary is "Back to the camera".
- **Search failed.**
  - "Search unavailable — please try again." with its Burmese.
  - The ONE primary becomes "Try again / ထပ်ကြိုးစား".
  - The counter tag shows. "Back to the camera" is withheld; the ✕ is the way back.
- **Add refused** (locked or settling). The shipped sentence replaces the state line, because a bottom toast would sit behind the keyboard. The sheet stays open.
- **Basket finished.** The sheet closes, and the page's "Start a fresh basket" banner owns the story.
- **Ring-up seam (OFF).** On the owner's yes, the counter tag gains "Bring it to the counter — we’ll ring it up there." / 'ကောင်တာဆီ ယူလာခဲ့ပါ — အဲဒီမှာ ငွေရှင်းပေးပါမယ်။' (m4.json guided screen 5 SEAM draft).
- **Analytics (graft 2).** An add from a sheet that a miss opened carries `miss_barcode` and `since_miss_ms` on the existing `grocery_item_scanned` (page.tsx:626-634). These are properties, not a new event, and lens rule 6 allows barcodes. They give Min the real-code → item pairs C6 asks for. The pairs are never auto-applied.
- **Night.**
  - Sheet --cd #2b213c, head --cd-raised #362848, text #f3ecdf / #bcafc8.
  - Field #2b213c with a rgba(243,236,223,0.13) rim. Primary gold #e7a53a with #130d1e.
  - The scrim is rgba(0,0,0,0.44) with the same blur.
  - **The counter tag stays constant cream with ink text**: the same paper on every phone, so Dad learns one look.
- **Reduced motion.** The sheet's entrance and exit are instant (globals.css:347-352). No animation is added. Under `data-fx="lite"|"off"` or reduced transparency, the scrim falls back to the plain veil (globals.css:9703-9711).

### COPY (English)

- Search by name — sheet title, shipped `searchByName` (`market.ts:44`)
- Search grocery items by name — the field's name, shipped (`page.tsx:1096`)
- durian — the shopper's query (example; verified zero rows)
- It’s not you — most shelf codes aren’t in the app yet. — the guided brief's draft (graft 4)
- Try one word from the name — or ask at the counter. — the guided brief's draft
- For the counter — the guided brief's draft
- This code isn’t in the app yet. — the same words as screen 1's tag
- Back to the camera — the guided brief's draft
- Close — the ✕'s name (Sheet default, `sheet.tsx:322`)
- Spoken only (Toast `quiet`): No matches for “durian” — try one word from the name, or ask at the counter.
- States:
  - Search in English or မြန်မာ… (shipped placeholder, `page.tsx:1097`)
  - One word from the name is enough — like “tea leaf” or “လက်ဖက်”.
  - Searching… (shipped, `:1109`)
  - Compare at (shipped)
  - That looks like a barcode — search by the item’s name (English or Burmese).
  - Search needs a connection — or ask at the counter.
  - Search unavailable — please try again. (shipped, `:1111`)
  - Try again (shipped `COMMON.tryAgain`)
  - Hang on — this basket’s being checked out.
  - Hang on — this basket’s being paid for.

### COPY (Burmese) — shipped strings or the briefs' drafts only

- နာမည်နဲ့ ရှာမယ် — shipped (`market.ts:44`).
- သင့်အမှား မဟုတ်ပါဘူး — ဆိုင်က ကုဒ်အများစု အက်ပ်ထဲ မရောက်သေးလို့ပါ။ — brief draft (m4.json concepts[guided] screen 3 copy_my).
- နာမည်ထဲက စကားလုံး တစ်လုံးနဲ့ ထပ်ရှာကြည့်ပါ — ဒါမှမဟုတ် ကောင်တာမှာ မေးပါ။ — brief draft (m4.json guided screen 5 copy_my).
- ကောင်တာအတွက် — brief draft (m4.json guided screen 5).
- ဒီကုဒ် အက်ပ်ထဲမှာ မရှိသေးပါ။ — brief draft (m4.json guided screen 5).
- ကင်မရာဆီ ပြန်သွားမယ် — brief draft (m4.json guided screens 3 and 5).
- States:
  - ရှာနေပါတယ်… (K15 draft, brief-m4.md:141, :348)
  - နာမည်ထဲက စကားလုံး တစ်လုံးဆို ရပါပြီ — “tea leaf” ဒါမှမဟုတ် “လက်ဖက်” လိုမျိုးပေါ့။ (m4.json guided screen 3; လက်ဖက် is the shipped aisle word)
  - ရှာဖို့ အင်တာနက် လိုပါတယ် — ဒါမှမဟုတ် ကောင်တာမှာ မေးကြည့်ပါနော် (brief-m4.md:143)
  - ရှာလို့ မရသေးပါ — ထပ်ကြိုးစားပါ။ (m4.json guided screen 3)
  - ထပ်ကြိုးစား (shipped `COMMON.tryAgain`, `lib/i18n/common.ts:21`)
  - the rows' `name_my` (catalog)
  - the seam ကောင်တာဆီ ယူလာခဲ့ပါ — အဲဒီမှာ ငွေရှင်းပေးပါမယ်။ (m4.json guided screen 5, OFF)
- No Burmese for: the spoken no-match sentence, the barcode-typed line, the two "Hang on" refusals, and "Close". These stay English, as listed.

### A11Y

- **The dialog.**
  - The @mms/ui Sheet (Radix Dialog): `role="dialog"`, `aria-modal="true"`, named by the h2 "Search by name နာမည်နဲ့ ရှာမယ်" (the Burmese span `lang="my"`, the DoorSheet precedent).
  - Focus is trapped.
  - All four exits work (§16): ✕, Esc, a scrim tap, and a drag from the handle. "Back to the camera" is a fifth, named exit.
- **The field.** `<input type="search">`, named "Search grocery items by name" (shipped), `aria-describedby="name-state"`. A screen-reader user returning to the field hears the coaching or the no-match line after its name.
- **One live region.**
  - The page Toast stays the view's only announcer. It still speaks under the modal: Radix's sweep exempts `[aria-live]`, toast.tsx:11-16.
  - It says each dead end ONCE, quietly. There is no `role="status"` inside the sheet.
- **The counter tag.**
  - `role="note"`, `aria-labelledby` its kicker ("For the counter ကောင်တာအတွက်").
  - Its silhouette SVG, hole and grommet are aria-hidden.
  - It has no tab stop: it is read, not operated.
- **Tab order**: ✕ → field → "Back to the camera" (results rows sit between the field and the primary when present).
- **Close.**
  - Focus returns to the tag's "Search by name": the opener is still mounted (sheet.tsx:248-255).
  - The camera resumes. The jar still in frame stays silent, because swallow→none keeps the throttle (camera-state.ts:158-165).
  - After an add, `onCloseAutoFocus` sends focus to the chip's "Add another".
- **Targets.** ✕ 44×44 (32 visible disc), field 48, primary 52, result rows ≥56.
- **Contrast.**
  - #1b1714 on #fffdf8: 17.5:1.
  - #6e6358 on #fffdf8: 5.8:1.
  - #fffdf8 on #a65f10: 4.84:1 (15/800).
  - The kicker 11/800 in ink on cream: 17.5:1.
  - Night: text #f3ecdf on #2b213c, as asserted in contrast-audit.test.ts.
- **Burmese.** `lang="my"` on every run, Padauk 400/700 only, ≥13px (22px on the counter line), lh 1.6, separated by block or gap, never whitespace (§6).
- **Motion.** None added.

---

## DECISIONS

1. GUIDED is the backbone: every state speaks its one next step in plain words, in both languages (owner answer 1).
2. No step rail. A one-step task needs no map, and the button's label IS the step. This fixes guided's judged "second step vocabulary" (task brief; m4.json scores[1].note).
3. One primary on the tag (Search by name). The counter is a quiet, NON-interactive line. This fixes guided's "counter button as prominent as search" (task brief; owner default "Or ask at the counter").
4. The Scan door loses its search field (Browse keeps it), and the Name sheet is the Scan door's only search. The stage rises 58px and never scrolls away (quiet graft; task: "the search field does not push the stage down").
5. Every "Search by name" on the Scan door opens the same Name sheet, including the paper recovery panels' (ScanStage.tsx:294-301). The panels lose `focusSearch`'s scroll-to-field (one search surface; judges on guided: "paper panels still scroll the field into view").
6. The miss is a paper TAG and the basket a round DISC: shape plus words, never colour alone. The tag is §27's "paper for recovery" cut as a shop tag, not a new vocabulary (glanceable graft; DESIGN-LANGUAGE.md:2069).
7. The cross-moment vocabulary: a tag is the paper you carry to the counter (m3's claim tag, m4's miss), and a disc is done (m1's sent disc, m4's in-basket). One meaning per shape across moments.
8. The one moment of delight is the hole: the live camera shows through the tag's punched hole, with no new motion (glanceable graft: "its one moment of delight").
9. The headline is "This code isn’t in the app yet.", not quiet's "Not in the app yet" or the shipped "We couldn’t find that item". The ITEM is usually in the app under its synthetic code, so precise words make "Search by name" make sense (honesty; grocery_catalog.json barcode_note).
10. No ✕ on the tag: it is not modal, the next outcome replaces it, and a keyboard user meets one stop (quiet graft).
11. The same jar re-read keeps its tag: no re-rise and no re-announce, fixed in `slotAfter` (quiet graft; scan-gate.ts:47, scan-notice.ts:56-75).
12. The miss toast is spoken (Toast `quiet`), never drawn, because the tag already says it where the eye is (quiet graft; toast.tsx:44-48).
13. The tag's button is a constant ink pill, not the clay primary. A constant surface takes the constant pair (as `.scan-on-ink` does), and Night's gold on cream would leave the button's edge too faint (§27; contrast).
14. "It’s not you — most shelf codes aren’t in the app yet." appears in both the just-opened and the no-match states of the sheet, because the primer is seen only before the first camera grant (graft 4).
15. The arm's-length counter card IS the tag, held up for Dad. It carries the lens tag's own sentence, with the Burmese at 22px/700 beneath 16px English. It has no digits, no query and no sale (owner pick "the arm's-length Burmese counter card"; judges: digits unactionable; ruling #11 default).
16. The counter tag is constant cream with ink in both themes, so Dad reads one look on every phone (owner: staff moments glanceable; boarding-pass consistency).
17. The counter tag appears only at the sheet's dead ends (no match, offline, failed), never as a door competing with search. The guided funnel is: try the cheap path, then hand off with context (owner default; judges on counter load).
18. "Back to the camera" is the dead end's one primary. In the failed state "Try again" takes that role (one hero verb per state).
19. The sheet title is "Search by name", not guided's "What does the label say?". The room you enter carries the words of the door you tapped, and the guided coaching lives in the state lines (continuity; quiet and glance).
20. The sheet closes only on the server's ok, and an add gets guided's 6-second Undo on the one Toast. Undo is offered only when the server's lines came back (owner pick "back where you were with a forgiving Undo"; amounts never optimistic).
21. Pairing resolves before `classifyScan`, so a re-read of the rescued jar gets M186's shipped repeat sentence. There is no second branch beside check:scan-repeat (graft 3).
22. Analytics: `miss_barcode` and `since_miss_ms` are properties on the existing `grocery_item_scanned`, not a new event (graft 2).
23. Offline honesty: a code absent from a complete cache under 24 h old is not queued and never promised. A stale or missing cache says "we’ll check this code", never "adds" (graft 1; page.tsx:501 retired).
24. Weighed and unavailable tags carry no search button, because `mms_grocery_search` excludes both (migration :31). Unlike guided, no search is offered where it cannot succeed.
25. The ring-up seam stays OFF behind one constant, because the owner's question is unanswered and default (a) holds (m4.json owner_question; ruling #11).
26. The quiet line's Burmese uses the kiosk's shipped words (ကောင်တာမှာ မေးကြည့်ပါနော်), as the quiet brief drew it, over the longer "or" draft. Fewest new claims, and it fits the tag.
27. No Scan-door search trigger is drawn. Graft 5's 48px trigger waits for evidence: Scan→Browse switches right after landing.
28. The aisle grid stays parked for G1 (graft 6).

## OPEN RISKS

1. **iOS keyboard.**
   - The Sheet pins initial focus to its container (sheet.tsx:241-246, 267-272), so the field needs one extra tap. Search becomes 3 taps (tag → field → row), not 2.
   - The fix is a one-prop opt-in `initialFocus` on `@mms/ui` Sheet. That is a shared primitive owned outside the grocery stream, and it must never be forked.
   - The design reads correctly with the keyboard down either way.
2. **Focus fallbacks aim at the hidden field.** `page.tsx:425, 1015, 1533` park focus on `#grocery-search`. On the Scan door the field is gone, so each must fall back to `#scan-stage`, or a keyboard or screen-reader shopper lands on `<body>` (WCAG 2.4.3).
3. **Tag height is at the limit.**
   - At 390px the tag clears the reticle by 2px.
   - On phones ≤375px, at large text, or when the Burmese counter line wraps, it grows upward over the window's lower edge. The detector reads the whole frame, but this is unverified on hardware: ruling #20 parks the device pass.
   - Padauk widths were not measured: no Padauk font exists on the agent machine.
4. **"yet" leans on C6** (Min capturing real shelf UPCs). If C6 is abandoned, drop "yet" in both languages: ဒီကုဒ် အက်ပ်ထဲမှာ မရှိသေးပါ။ and the "It's not you" line both carry it.
5. **No search on the Scan door before a miss.** Removing the field means a shopper who wants search first must switch to Browse. Watch Scan→Browse switches. Graft 5's trigger is the ready fix.
6. **Wrong pairing.** A shopper who misses jar A and adds unrelated item B sees "B is already in your basket" when A is re-read. This is bounded:
   - it pairs only the first ok add from that miss's sheet;
   - it lasts the page's life only;
   - it never charges;
   - the chip names B, so the mismatch is visible;
   - Undo clears it.
7. **check:scan-repeat parses page.tsx.** The pairing and offline branches must sit before `classifyScan` and before the one `scanAdd`. Their decisions belong in `lib/` (scan-notice / a pairing helper) with verify:slice mutants. Each new lib module grows CLAUDE.md's measured mutate-set enumeration.
8. **All Burmese here is K15.** Even the "shipped" market lines are Claude-authored and await Min's read (market.ts:6-8). The quiet line uses a fragment of a shipped sentence. The 22px counter line will be read by Dad, the one person who will notice a wrong word first.
9. **The counter card asks Dad to act with no in-app tool.** M189 keeps market items off the pad, and ruling #11 is unanswered. Dad can help find the item by name on the shopper's phone (search matches Burmese and synonyms), or handle it off-app. A volume of these interrupts a counter that is also the kitchen pass, and that volume is UNKNOWN (grocery is outside the pilot).
10. **The first diner Toast with an action.** The staff lane is the only `action` caller today (toast.tsx:33-35). Grocery's Undo is the first diner one, and it adopts `lib/undo-hold.ts`. The menu's quiet-claim conventions must not regress.
11. **Constant cream in Night.** On the dark sheet, the counter tag is a bright paper slab. That is intended (one look for Dad), but its comfort in a dim room is untested. The composite-contrast suite needs rows for the cream tag over the live video (the scan-stage bounds, packages/ui composite-contrast.test.ts).
12. **The example query is verified against the seed, not live prod.** "durian" was checked against supabase/data/grocery_catalog.json (405 items). The live `grocery_items` table is seeded from it, but the live import is gated on price confirmation (OPEN-ITEMS G1).
13. **Spoken lines are English-only until G23** (every /grocery toast is EN-only today). A Burmese-only screen-reader user gets the visible tag in both languages, but the spoken summary in English.
14. **Cross-moment tag meaning.** If m3's picked spec keeps the Claim Tag, both tags must stay "the paper you carry to the counter". A tag must never come to mean "done" on one screen and "not added" on another.
15. **Grocery package ordering.** This lands after package 2 (the barcode-typed line) and with or after package 3 (the primer's "Most shelf codes…" line, G23 bilingual toasts). It is the same stream and the same files: `app/grocery/**`, `components/grocery/**`, `lib/scan-notice.ts`, `lib/i18n/market.ts`.

---

## Appendix — what changed after this spec (applied in the drawn screens)

The spec above was written first. Two later passes changed it, and the screens on the canvas were drawn
with both applied. **Where an item below contradicts the spec above, the item below wins.**

### A · System amendments (the cross-moment consistency pass)

1. The counter tag's kicker ('FOR THE COUNTER · ကောင်တာအတွက်') leads with the 14px receipt glyph, the same 'for the counter' cue m1's card and m2's door wear. Every object a guest holds up for Dad then opens with one cue.
2. The tag's constant-cream rule becomes the house rule for every Dad-facing pass (m1 and m2 adopt it). Add the composite-contrast rows once, for the shared CounterPass and the tag together.

### B · The adversarial critic's blocking fixes (verdict: fix)

1. **The pairing can charge on sight, which contradicts the spec's 'never a second charge' and 'it never charges'.**
   - Evidence: picked-m4.md:211-213 says the missed code resolves to the paired barcode BEFORE classifyScan and gets 'the disc chip, never a second miss, never a second charge'. OPEN RISK 6 (:515-520) bounds a wrong pairing with 'it never charges' and 'Undo clears it'. But classifyScan (apps/qr/lib/scan-gate.ts:105-112) returns {kind:'add'} when the barcode is not in lines, queued or billed. stepQty drops billedRef on any removal (app/grocery/page.tsx:413). So if the paired item B leaves the basket by any path other than the toast Undo (the basket sheet's stepper or remove, a Browse row), re-reading jar A maps to B and scanAdd charges B from a camera sighting of a jar whose code is NOT in the app. With the wrong pairing the spec itself admits (A missed, unrelated B added), that charges an item the shopper never pointed at.
   - Fix: A pairing may only ever produce a REPEAT verdict. If classifyScan(paired) is 'add', drop the pairing and fall through to the unknown tag. Clear the pairing whenever the paired barcode leaves lines, queued and billed, by any path. Put the rule in a lib helper with a verify:slice mutant that makes the pairing→'add' path go red, and correct :212 and :518.
2. **Undo rides an optimistic path: the dollar figure moves and 'Removed …' is spoken before the server confirms.**
   - Evidence: picked-m4.md:208 says 'Undo = stepQty(line, qty − 1) (page.tsx:406), which says "Removed Tea Leaves -400g" (:426)'. :210 claims 'The dock's dollar figure moves only when the server's view lands (amounts never optimistic)'. In the code, stepQty flips `lines` before the write (page.tsx:416-420) and flashes 'Removed {name}' at :426, before `await ledger.track(setQty(...))` at :429. totalCents is `lines.reduce(unitPriceCents*qty)` (page.tsx:901). It feeds the Subtotal (:1356) and the dock CTA (:1491-1502), so both drop before the server confirms. This breaks 'amounts never optimistic' and the tense rule ('Past tense comes only after a confirmed write').
   - Fix: Give the add-Undo a non-optimistic path. Hold the line and both figures until setQty's confirmed read lands. Say 'Removing…' while it is in flight and 'Removed {name}' only after the write confirms. State this in the spec instead of citing stepQty.
3. **Undo is drawn as a filled toast action. That breaks the shared rule 'UNDO is one thing everywhere', and the same-gesture guard is missing.**
   - Evidence: picked-m4.md:206-209, DECISION 20 (:492) and OPEN RISK 10 (:524) put '[Undo / ပြန်ဖျက်]' inside the page Toast pill, docked at the bottom. The shared vocabulary says Undo is 'Undo · ပြန်ဖျက်' with the seconds as an aria-hidden leaf. It 'sits in the slot of the act it reverses, on --sf with a 1.5px dashed accent edge, never filled', and 'arms only after the same-gesture guard (350 ms on phones)'. The KDS cream pill is the ONE shipped exception, so a diner toast Undo would be a second one. The spec gives no seconds leaf, no dashed edge, no slot and no 350 ms arm. The pill appears the instant a result-row tap succeeds, so the second half of a double-tap can land on it and undo the add.
   - Fix: Put the 6-s Undo in the slot of the act: the lens chip's action slot while the window is open, as the dashed --sf pill with the aria-hidden seconds leaf. Arm it after 350 ms (Toast `shield` already supports this). The Toast only speaks 'Added … · ထည့်ပြီးပါပြီ'.
4. **Offline, the spec leaves shipped 'it will add' promises standing that its own offline rule now makes false.**
   - Evidence: The spec rewrites only the uncached toast at page.tsx:501 (:223-224). It no longer saves a code that is absent from a fresh cache (:218-221), and it promises only 'we'll check this code' for a stale or missing cache. Four things still say otherwise. (1) The live lens hint scanHintOfflineSaved, 'Offline — scans are saved and add when you’re back' (market.ts:34-37, mapped at ScanStage.tsx:80, shown at :370), still says 'saved' and 'add'. (2) The pending strip still says 'They’ll add when you’re back online' and names uncached codes by raw barcode (page.tsx:1305-1312, :1309). (3) drainSummary reports an unknown_barcode reject as '(2990…) — no longer available' (grocery-queue.ts:56, :163-171), which is a false reason with raw digits, on exactly the 'check' the new toast promises. (4) The chip's name falls back to the raw barcode (`lastScannedName ?? lastScanned`, page.tsx:1253) under the dashed in-basket disc. brief-m4.md Today #7 names these defects. The judges marked glanceable down for this exact contradiction, and guided screen 6 in m4.json already drafted every replacement, with Burmese.
   - Fix: Adopt guided screen 6's rewrites: the hint ('…saved and checked when you’re back' and its draft), the strip wording, and drainSummary's '1 saved scan wasn’t in our list, so it wasn’t added.' with no digits, keeping drainSummary's unit test and mutants. Give an uncached queued code the chip label 'A saved scan' (draft: သိမ်းထားတဲ့ စကင်), never digits.
5. **The spec calls the offline cache a 'complete cached catalog', but it excludes weighed and unavailable items. Offline, a real item is then told 'This code isn’t in the app yet.'**
   - Evidence: picked-m4.md:218-221: 'Offline, and the code is absent from a complete cached catalog… The tag shows the headline… The code is not queued.' The cache is written only by Browse's fetch (GroceryBrowse.tsx:229). That fetch is getGroceryCatalog, which filters `.eq("available", true).eq("weighed", false)` (lib/grocery.ts:333-334). So every weighed item and every item unavailable today is absent from a fresh cache, even though it is in the app. The spec would say it isn't and refuse to save it. This is the failure graft 1 exists to prevent ('must never say "not in the app" about a real item').
   - Fix: Either cache every code with its weighed and available flags (still display-only), so absence really means unknown. Or treat cache-absence as unknown and route it to the queued 'we’ll check this code' path, never to the 'isn’t in the app' headline. Fix the claim's wording too.
6. **A Name sheet opened from a camera-failure panel shows Dad a false counter tag, and its after-add focus target never mounts.**
   - Evidence: DECISION 5 (:477) sends the paper recovery panels' 'Search by name' (ScanStage.tsx:296, :301) into the same Name sheet. No code was scanned there, yet the no-match, offline and failed states (:339-353, :380-386) still draw 'This code isn’t in the app yet. / ဒီကုဒ် အက်ပ်ထဲမှာ မရှိသေးပါ။' at 22px for Dad. That is a claim about a code that does not exist. After an add, :289 and :458 send focus to the chip's 'Add another'. But a paper state returns the panel early (ScanStage.tsx:262-264), and `result` renders only at :386 (`{streaming && result}`), so the chip never mounts and focus falls to <body> (WCAG 2.4.3). The same happens when `r.lines` is null, because the chip needs lastScannedLine or a queued scan (page.tsx:1246, :776-784).
   - Fix: Draw the counter tag only in a sheet a miss opened. A panel-opened sheet ends with the quiet 'Or ask at the counter' line. Give onCloseAutoFocus a fallback to the chip, then #scan-stage, then the panel's own button, and state it in A11Y.
7. **Neither system amendment is applied: the receipt-glyph cue and the shared constant-cream / composite-contrast rule.**
   - Evidence: The kicker row (picked-m4.md:346-349) is 'FOR THE COUNTER' · 'ကောင်တာအတွက်' with no glyph. The amendment says it leads with the 14px receipt glyph that m1's card (picked-m1.md:189) and m2's door wear. DECISION 16 (:488) keeps constant cream as an m4-local choice, and OPEN RISK 11 (:525) scopes the contrast rows to 'the cream tag over the live video'. The amendment makes constant cream the house rule for every Dad-facing pass, with rows added ONCE for the shared CounterPass and the tag together.
   - Fix: Lead the kicker with a 14px aria-hidden receipt glyph in ink. Restate DECISION 16 as the house rule shared with m1/m2's CounterPass. Change OPEN RISK 11 to one composite-contrast row set (packages/ui composite-contrast.test.ts) covering CounterPass + tag, both themes.
8. **The unavailable tag is a dead end. That breaks the owner default 'the miss says "Or ask at the counter"' and the spec's own 'every state says its one next step'.**
   - Evidence: picked-m4.md:217: 'Unavailable tag. "That item isn’t available today."… No button… and no quiet line.' lib/scan-notice.ts:14 names unavailable as one of 'the three catalog misses a shopper can act on'. The spec's backbone line (:6-7) says 'Every state says its one next step'. Weighed says 'bring it to the counter'. Unavailable gives no way forward and no human fallback.
   - Fix: Add the quiet line 'Or ask at the counter · ကောင်တာမှာ မေးကြည့်ပါနော်' (the same shipped fragment) to the unavailable tag.
9. **The DINER register (NOW heading, then an actor-first NEXT sentence directly above the hero, then the human fallback last) is not applied.**
   - Evidence: Screen 2's dead ends (picked-m4.md:333-357) run in this order: the state lines, then 'Try one word from the name — or ask at the counter.', then the counter tag (the human fallback), then the hero 'Back to the camera'. The fallback is not last. The thing directly above the hero is the tag, not a sentence that explains it. The NEXT sentence explains the field, not the hero, and folds the fallback inside itself. The sheet's heading stays the door name 'Search by name' (:322-325) and never says NOW. On screen 1 the tag has no NEXT sentence at all: the step lives only in the button label (:6-8, :161-165), which is the STAFF register ('the next step lives inside the control's own words').
   - Fix: Screen 2: say NOW as the heading or state title, put one actor-first NEXT sentence directly above the one hero it explains, and put the counter tag (the fallback) last. Screen 1: within the 109px budget, give the tag a NOW line plus an actor-first NEXT sentence above the ink pill, or state why the spoken quiet line stands in for it. Keep 'Or ask at the counter' last.
10. **The busy result row is specified at 0.55 opacity, which drops its text below 4.5:1 and breaks the house rule 'busy keeps full ink'.**

- Evidence: picked-m4.md:376: 'The busy row is aria-busy at 0.55 opacity.' This is inherited from page.tsx:1122 (`opacity: 0.55`). Measured: #1b1714 at 55% over #fffdf8 gives 3.96:1, and the --t3 secondary line gives 2.24:1. globals.css:7561-7563 and DESIGN-LANGUAGE.md:1451 say busy is not disabled and the control keeps its full ink (a dim was rejected at 2.84:1). The extraction into ONE shared `.grocery-result` (:371) is the moment to stop carrying the dim forward.
- Fix: Keep full ink on the busy row. Signal busy with the visible word ('Adding…', the guided draft ထည့်နေပါတယ်…) or the shipped stripe treatment, never opacity.

11. **Some cited file:line references are wrong or incomplete.**

- Evidence: (a) :222 cites page.tsx:1255 for 'Waiting for a connection'. It is at :1256; :1255 is the 'In your basket ×' arm. (b) The claims row at :90 says 'Three focus fallbacks… page.tsx:425, :1015, :1533 — TRUE'. There is a fourth, page.tsx:897: addHit re-focuses searchRef after EVERY hit add, and that is the path the Name sheet's rows reuse. It will fight the spec's onCloseAutoFocus → 'Add another', and OPEN RISK 2 (:508) omits it. (c) :94 cites scan-notice.ts:56-75 for slotAfter. slotAfter ends at :66, and :68-79 is scanHint. (d) 'complete cached catalog' (:218) is false (see the cache finding).
- Fix: Correct (a) and (c). Add page.tsx:897 to the claims row and OPEN RISK 2, with its Scan-door fallback. Reword (d).

### C · The critic's suggestions (not blocking; take them where the build agrees)

- Copy: 'One word from the name is enough — like “tea leaf” or “လက်ဖက်”.' calls a two-word query, which is not even in the name ('Tea Leaves'), 'one word'. Use 'laphet' (a real synonym) or လက်ဖက် alone. The Burmese draft carries the same 'tea leaf', so you only need to swap the example word.
- A same-gesture risk on the chip: on a fast server ok the sheet closes under the finger, and the second half of a double-tap can land on the chip's 'Add another' (the stage y 455–531 sits under the first result rows). That would be a deliberate second charge. Give 'Add another' the same 350 ms arm after a sheet close.
- The page Toast has one slot (page.tsx:270-275). Re-sighting the paired jar inside the 6-s window flashes M186's repeat sentence and clobbers the Undo. Once Undo moves into the chip slot this goes away; otherwise specify the priority.
- The weighed and unavailable misses still flash a DRAWN toast (page.tsx:651) while the tag already shows the same words. Make them `quiet` like the unknown miss so the fact is said once.
- 'Close' has shipped Burmese ပိတ် (lib/i18n/common.ts:20). It does not need to be listed as English-only.
- The Basket tab already wears the receipt glyph (components/nav/DinerTabs.tsx:43). Now that the receipt is the system's 'for the counter' cue, check that the two meanings don't collide on /grocery.
- Measure Padauk before claiming the 2px reticle clearance. At 390px the 136px quiet column very likely wraps ကောင်တာမှာ မေးကြည့်ပါနော်, so the tag is about 128px and covers about 19px of the window on the DEFAULT phone, not only at ≤375px.
- The counter tag claims the grocer's 'handoff carries its own context' (:46-48), but it gives Dad only 'this code isn't in the app'. Consider carrying the shopper's query, or the aisle they were in, so Dad can help without a second-language exchange. Do not show a code or a price.
- The no-match state says the coverage fact twice on one sheet ('most shelf codes aren't in the app yet' and the tag's 'This code isn't in the app yet'). Trim one.

### D · Round 3 (2026-10-07, under the owner's delegation) — these win over everything above

The owner delegated every open decision ("I trust you to apply world-class design-thinking best standards on
all open decisions") and added a live TV board, card / Apple Pay after the food is served, and animated step
guides. PATH_DESIGN_2026-10-07.md's round-3 section records the decisions (D1–D5) and the shared vocabulary.
The round-3 consistency pass gave this moment these changes:

1. D1(d): the @mms/ui Sheet's opt-in initialFocus is guards-style's.

- It lands in its own PR right after M77, with the focus-target decision in a pure helper that has a mutant.
- grocery opts in with one prop from its own file.
- Replace 'owned outside the grocery stream'.

2. D3: the 'Added' Undo keeps ပြန်ဖျက် (erasing a mark), and 'Removing…' becomes 'Removed' only after the confirmed write. No change.
3. Motion vocabulary:

- The miss tag enters with RISE, and the post-add chip with POP, armed after the 350 ms guard (correction 15).
- The tag never takes the dotted perforation, because a perforation means a pass.

### H · Build notes (2026-10-08, `claude/feat/pd4-grocery-miss`)

Built by the grocery stream. The record's precedence held throughout: round 3 > Codex correction 15 >
the cross-spec reconciliations > this appendix > the body. Where the code disproved a claim, the design
moved and the reason is here.

**What shipped, by section.**

- Screen 1 (the tag on the lens): `components/grocery/ScanResult.tsx` draws the paper tag (one
  silhouette, `.paper-tag`, shared with the counter tag) with the headline, the ink pill "Search by
  name" (its accessible name IS its visible bilingual text) and the quiet, non-interactive "Or ask at
  the counter"; no ✕; RISE on arrival. Weighed and unavailable read the kiosk's shipped pair; weighed
  has no button and no quiet line; unavailable has the quiet line (B8). After a rescue add the slot
  becomes the DISC chip (POP): the cream disc with the `--ok` ring and the check, the name and its
  Burmese (G20), "In your basket ×N", and the action slot — the Undo while its window is open, then
  "Add another". A queued code wears the dashed ring; an unknown queued code offers no "Add another".
- The miss is spoken, never drawn (decision 12): `flash(…, { quiet: true })`; the same jar re-read while
  its tag shows keeps its key AND is not re-spoken (`slotAfter`, mutant `scan-notice/a-re-read-jar-re-rises`;
  the page reads a `slotRef` before flashing). Weighed and unavailable misses are quiet too (appendix C).
- Screen 2 (the Name sheet): `components/grocery/GroceryNameSheet.tsx`, `initialFocus={fieldRef}`.
  The Scan door's field is gone (Browse keeps it, `tab === "browse"`); the stage's `onSearch` and the
  tag's button both open this sheet, with `miss` set only by the tag. States as the record and B6/B9/B10
  require (the table in the component's docblock). The ONE result row is
  `components/grocery/GroceryResultRow.tsx`, used by Browse and the sheet.
- Pairing (graft 3, B1): `lib/scan-pairing.ts` — `judgedBarcode` chooses what the basket is ASKED
  about; `pairingAfterVerdict` spends the pairing when the judged item classifies `add`; `pairingWithout`
  drops it on the Undo and on any stepper removal. Four mutants. `check:scan-repeat` proposition 4
  parses that `scanAdd`'s barcode argument is `add()`'s own parameter (red-first: swapped to `judged`,
  copied into a `const`).
- The Undo (B2, B3, D3): `lib/scan-undo.ts` — `ADD_UNDO_MS`, `undoOpen`, `undoSecondsLeft`,
  `chipArmed` (reads `@mms/ui`'s `removeHeld`, i.e. `SAME_GESTURE_MS`), `undoTargetQty`. Four mutants.
  The page's `undoAdd` holds the line and both figures until `setQty` resolves and the confirmed read
  lands; "Removing…" in flight, "Removed {name}" after; a keyboard hold (`lib/undo-hold.ts`, the `slot`
  source) pauses the window; the clock lives in state (`undoLeft`, `chipLive`) because the React
  purity rule forbids `performance.now()` and ref reads in render.
- Offline (graft 1, B4, B5): `offlineClaim` / `queuedChipName` / `offlineSavedToast` in
  `lib/scan-notice.ts` (three mutants), `drainSummary` rewritten without digits (one mutant), the lens
  hint "saved and checked", the pending strip "we'll check them", "A saved scan" for an unknown queued
  code. The counter tag and the "not in the app" headline are NEVER produced from the cache.
- Analytics (graft 2): `grocery_item_scanned` gains `miss_barcode` and `since_miss_ms` only on an add
  from a miss-opened sheet. `grocery_scan_miss` is unchanged (once per barcode per page life).
- The Sheet prop (D1(d)): `packages/ui/src/sheet-focus.ts` + the `initialFocus` prop on `Sheet`, its
  own commit (`feat(ui): …`), documented beside the J21 note, pinned by
  `packages/ui/src/__tests__/sheet-initial-focus.test.ts` (the pure decision by value; the wiring in
  `sheet.tsx`'s `onOpen` parsed, not grepped). `apps/qr/lib/sheet-initial-focus-callers.test.ts` is the
  parsed caller allowlist (fixtures: a fake cash caller found, a dead parked copy ignored, an aliased
  import still the Sheet, a comment not a caller).
- Focus (OPEN RISK 2, B11(b)): the four parking sites (`stepQty`'s removal, the fresh-basket button,
  the basket sheet's close with no lines, `addHit`) go through one `parkFocus` — the Browse field, else
  `#scan-stage`, else `#scan-panel-title`. The Name sheet's close-restore: the chip's action after an
  add, else the still-mounted opener, else the stage, else the panel title.
- G20 (ruling #19): `GroceryLine.nameMy`, selected from the catalog in `readGroceryLines`; rendered on the
  Scan door's rows, the basket sheet's rows and the chip.

**Appendix C items taken:** "laphet" as the one-word example; the 350 ms arm on the chip (correction 15
already bound it); weighed/unavailable misses made quiet; the counter tag carries the shopper's query
("Looked for “durian”"), never a code or price. **Not taken, and why:** the Toast priority clash
(moot — the Undo moved into the chip slot, so M186's repeat sentence no longer clobbers it);
"Close" listed English-only (left as the diner Sheet's English default; ပိတ် is shipped in COMMON and
noted in the K15 row); "trim one coverage fact on the no-match sheet" (the record's moment-4 summary
mandates both the sheet's "It's not you" line and the counter tag's headline, and the record wins over
this appendix); measuring Padauk (no Padauk on the agent machine — the device sitting's check, recorded
in PD4); the Basket tab's receipt glyph vs the counter tag's (noted: on /grocery the tab's receipt means
"your basket" (DinerTabs, D2) and the tag's means "for the counter" (A1); A1 is cross-moment and wins;
G23 may revisit the tab glyph).

**Decided under the owner's delegation (decided by: the grocery stream).**

1. The NEXT sentence above screen 2's hero (B9) is "Keep scanning — this one can wait for the
   counter." — actor-first, and it explains the hero it sits above ("Back to the camera"). Screen 1 keeps
   its label-as-step: within the 109px budget the spoken quiet line stands in for a NEXT sentence, which
   B9 allows when stated.
2. The counter tag's Burmese line is `--fs-h2` (21px), not 22px: the style-literal ratchet forbids a new
   px literal and 21 is the nearest token. One pixel; Dad's line is still the biggest on the sheet.
3. `drainSummary`'s rejection wording is "{n} saved scan(s) couldn’t be added — not in the app yet, or
   not available today." rather than B4's "wasn’t in our list": the drain cannot tell an unknown code
   from a weighed or unavailable item (the reason is lost at `classifyReplay`), and "not in our list"
   would be false for the latter two. No digits either way.
4. The Undo and "Add another" share the chip's one action slot: the Undo for its 6 s, then "Add
   another". Correction 15's arm applies to whatever sits in the slot. A shopper who wants a second
   copy inside the window waits six seconds or re-scans (a repeat verdict shows "Add another" at once).
5. The Name sheet shares the page's debounced search state with the Browse field (one effect, one
   `query`); the query is cleared when the sheet opens, so a new miss starts clean, and kept after a
   refused add. "Try again" re-issues the same query through a nonce.
6. Offline, with the tag already on screen, "Search by name" still works: the sheet answers "Search
   needs a connection — or ask at the counter." The record's offline-tag-without-button branch was
   superseded by B5 (an offline sighting never produces the tag at all; it queues).
7. The `.scan-result` chip no longer takes native `disabled` on "Add another" (the K35 rule — the
   `Button` primitive's `disabled` is `aria-disabled`); the ui `Button` already did this, so no visible
   change, but the arm is readable as a refused, fully-inked control.

**Claims the code disproved.** None beyond those the appendix already recorded (B1, B2, B5, B6, B11).
`focusHandoffRef` needed one addition the spec did not name: a tag with no button (weighed) must take
the hand-off itself (`tabIndex={-1}` on the tag), or the focus that was on "Add another" fell to
`<body>` when a weighed jar followed an add.

**Left out, on purpose.** The composite-contrast rows for the cream tag over the live video (OPEN RISK
11 / A2): the amendment says to add them ONCE for the shared CounterPass and the tag together, and the
CounterPass primitive is post-pay's (D1(d)), so the row set was left to post-pay's PR. **Measured at the
merge of `main` (`1f35ba3`):** #327 landed `CounterPass` with no composite-contrast rows for either surface
(no `packages/ui` suite on `main` names the tag), so the row set for the cream tag and the CounterPass over
a live image is still OPEN — recorded in PD4's OPEN-ITEMS row, for whichever stream next touches
`composite-contrast.test.ts`. The scanner device half (ruling #20). Graft 5's Scan-door search trigger (decision 27: wait for the Scan→Browse evidence).

#### H.2 · The blind pass on #329 (`f26cc8f..9e88755`, REJECT) and Codex round 1 (review 5460967415) — fixed in one commit

Every finding was verified against source before it was acted on; the mechanism named here is the one
the code had, not the one the finding guessed.

- **The Undo's words follow the CONFIRMED READ** (blind C1; Codex 4222536407). `undoAdd` said "Removed
  {name}" on every path once `setQty` resolved — a decrement of a line the basket already held at ×2,
  and the `syncNow()` arms where no reconciled view had landed. Now: "Removed {name}" only when the
  confirmed read shows the line gone, "{name} × {qty}" (stepQty's words) when it stepped down, and
  "Undo saved — checking your basket…" when the read did not land (the next ticketed read owns the
  view; nothing past-tense is said). **Any manual step on that line retires its Undo** (Codex
  4222536380): a "−" inside the window had already reversed the add, and a live Undo then wrote one
  fewer again — a unit the basket held BEFORE the add.
- **Off-camera refusals are DRAWN; inside the sheet they are SAID in its own line** (blind C2, C3; Codex
  4222536467). The miss toasts were `quiet` for every `via`, so a stale Browse card or sheet row failed
  invisibly for a sighted shopper, and every refusal but locked/settling went to the bottom toast — which
  sits behind the raised keyboard (`--kb-inset` lifts the sheet, not the toast region). `add()` now
  captures the sheet it came from BEFORE any await (a ✕ mid-write no longer loses the pairing or the
  Undo the ok owes) and routes every refusal through one `say`: into `setSheetRefusal` inside that
  sheet, to the toast outside it, `quiet` only for a camera miss (the tag already says it). The same
  router covers the transport throw, no cart, `unreadable`, `queueOffline`'s three lines, and
  `addHit`'s two local refusals; `markCartGone` closes the Name sheet (Codex 4222536430).
- **A sheet row tapped twice offline queued twice** (blind C3): each tap mints a fresh `scanId`, so both
  landed at replay. The second tap is refused while one waits ("Already saved — we’ll check it when
  you’re back online."); a camera re-read was already refused by `classifyScan`'s queued verdict.
- **The queued-repeat line promised "Add another"** for an uncached queued code that draws no such
  control (blind C4): the clause rides only when the cache knows the code.
- **A weighed replay was blamed on the catalog** (blind C5): `drainSummary` now takes the refusal
  REASONS (`DrainOutcome.reason`, carried from `send`'s answer) and gives weighed its own honest
  sentence ("{n} saved scan(s) need(s) the scale — please bring it/them to the counter"), still with
  no digits; the mutant `grocery-queue/a-weighed-replay-blamed-on-the-catalog` folds weighed back
  into the generic bucket and reddens.
- **The sheet's state line is the MODAL's own live region** (blind C6) — `role="status"` on
  `#name-state`. Decided under the owner's delegation (decided by: the grocery stream), overriding
  the spec's A11Y "no role=status inside the sheet": the page Toast cannot announce for a sheet whose
  keyboard covers it, and the locked/settling line had become a non-live `<p>` nobody heard. Every
  dead end, "Searching…" and every routed refusal is announced once, inside the modal; the page Toast
  stays the PAGE's one region. QA §A's "one live region per view" holds per view: the modal is its own.
- **"Try again" swapped to "Back to the camera" under the finger** for the debounce's 220 ms (blind
  C7): `searching` turns on in the SAME render as the retry; and the ONE `changeQuery` clears the
  previous query's rows at once and shows "Searching…" synchronously (Codex 4222536418 — a row from
  "tea" was tappable under "durian" while the debounce waited).
- **`.paper-tag:focus { outline: none }`** hid a keyboard user's place on a focus-parked weighed tag
  (blind C8): `:focus-visible` with the stage's ring; a tap's focus draws nothing.
- **Proposition 4 is bound to the parameter's DECLARATION** (blind C9): `barcode = judged;` at the top
  of `add`, or a block-scoped `const barcode = judged` above the charge, shipped the judged code under
  the same spelling with the guard green. The guard now refuses any assignment to that name, any
  `++`/`--`, and any shadowing declaration (a const, a binding element, a nested parameter) in the
  charging function — red-first on both evasions, restored clean.
- **The allowlist's `MONEY_SHEETS` named `Checkout.tsx`, which renders no `<Sheet>`** (blind C10): the
  "passes nothing" case was vacuous. The list is now the M82 GUARDED set (the cash sheet, the refund,
  the void/comp, the no-show, the line sent to the kitchen, the table bound at Send), each asserted to
  render a live `<Sheet>`; `<Sheet {...props}>` is refused as ambiguity (no such caller on disk) and a
  namespace import (`<UI.Sheet>`) is still the Sheet — both on fixtures.
- **`sameTag` compared the barcode only** (blind C11): the same code answering weighed after unknown is a
  new tag (`slotAfter` re-keys it) and is spoken again — the verdict joins the key.
- **A sheet NO code opened withholds "It’s not you"** (blind C12): B6's own logic — a camera-denied
  shopper searching "durian" scanned nothing, so the coverage claim, "Keep scanning" and "Back to the
  camera" are the miss-opened sheet's alone; a panel-opened sheet coaches the field and the ✕ is the way
  back ("Try again" after a failure stays). Decided under the owner's delegation (decided by: the
  grocery stream). The PANEL test now pins the copy.
- **The Undo's focus handoff ran before React committed `setUndo(null)`** (Codex 4222536451): it found
  the Undo button itself and focus fell to `<body>` as it unmounted. The handoff is a post-commit
  effect on `undo`, armed by `undoAdd` and by the window's expiry when the pill held focus.

**Open questions, decided under the owner's delegation (decided by: the grocery stream).**

1. **iOS leaves `activeElement` on `<body>` after a touch tap**, so the opener captured for the sheet's
   close-restore was the body and the chain never reached the stage. `openNameSheet` refuses a body
   opener (`ae !== document.body`); the chain then falls through to the chip's action, then the stage,
   then a panel's title. A keyboard/VoiceOver user's opener (a real focused button) is still restored.
2. **The pairing is single-slot** (the spec drew one: "the missed shelf code maps to the first item
   added from the sheet that miss opened"). Two rescues in one visit → the first jar re-reads as a MISS
   (its tag returns; never a charge; one tap re-opens the sheet). Kept single-slot this wave: bounded,
   page-life, visible. Reopen trigger: a `grocery_item_scanned` with `miss_barcode` twice in one
   `cart_id` — then a Map of pairings, each spent on its own item's `add` verdict.
3. **A Name-sheet dismissal mid-write** used to drop the pairing and the Undo (`nameSheetRef` read after
   the round trip). The sheet context is captured at invocation and carried through, so a ✕ while the
   add is in flight still pairs the code and offers the Undo when the ok lands; the chip and the Toast
   show it either way. Only the sheet that asked is CLOSED by its ok, and only while it is still the
   open one (compared by identity): a sheet a NEW miss opened in the meantime stays open, its state
   line never receives the first add's refusal (that goes to the Toast), and its close-restore is not
   re-aimed (the follow-up commit after `75ec322`, Codex 4222536467's second case).

#### H.3 · Codex round 2 on #329 (`27081ce`) — fixed in one commit

Each mechanism was verified against source first.

- **The camera's hold lifted as a sheet's exit STARTED** (4226434718). `sheetOpen` read `nameSheet !==
null` (and `basketOpen`), which turns false at the start of the exit while Radix keeps the sheet and its
  scrim on screen for `--dur-sheet`; `BarcodeScanner` then announced the next fresh sighting (a barcode
  different from the last one) and `add()` charged it behind the scrim. `lib/hooks/useStageCover.ts`
  keeps a cover up from the render a sheet opens until its EXIT END — the Sheet's `onCloseAutoFocus`,
  which the primitive fires at unmount, after the exit (M76) — with a fail-safe (`SHEET_EXIT_FAILSAFE_MS`,
  above the token's exit, at most 2 s) so a missed signal can never leave the scanner deaf. Both
  page-owned sheets are covered; the hook has a jsdom suite and five mutants. `check:scan-repeat`
  **proposition 5** parses the wiring (one cover per page-owned sheet, told to the stage, lifted only
  inside that sheet's `onCloseAutoFocus`, the component forwarding it) — red-first on six evasions.
  **The DoorSheet keeps the hole**: it owns its Sheet, reports only `onOpenChange` at the close's start,
  and is shared with /menu, so the grocery stream filed it (`PD4 · door`) and the guard names it as the
  one exemption rather than leaving it unseen. Decided under the owner's delegation (decided by: the
  grocery stream): scope over completeness, with the hole made visible.
- **A refused removal spent the pairing** (4226434713). `stepQty` cleared the pairing before `setQty`
  resolved; a refused write rolled the line back but not the pairing. `pairingAfterRemoval` (in
  `lib/scan-pairing.ts`, one mutant) spends it only when the removal landed, and the page calls it after
  the write.
- **A terminal answer inside the Name sheet dropped focus on `<body>`** (4226434706). The sheet lives in
  a portal, the stage, its tag and its chip unmount with a finished basket, and the close-restore chain
  had nothing left. Both chains — the Name sheet's close-restore and the page's one parking fallback —
  are now `lib/grocery-focus.ts` (four mutants), each with the fresh-basket button ahead of the stage.
  The parking chain's case was a PD4 regression: the Scan door lost its search field, so the basket
  sheet closing on a finished basket parked on an unmounted stage.

#### H.4 · The second capped blind pass on #329 (`1f35ba3..f23b77c`, REJECT) — fix-or-justify, item by item

The last agent round on this PR (WORKFLOW §Review step 5(g), Codex out of quota). Every mechanism was
verified against source first. These notes win over H.1–H.3 where they differ.

- **The Undo writes from the add's OWN confirmed qty** (critical 1). `undoAdd` took "one fewer" of the
  client view (`linesRef`), which a read issued after the add can leave a unit short — so it could write
  0 over a line the basket held at ×1 BEFORE the add. `setQty` is absolute: `undoFromAdd` now builds the
  record from the add's own response (`scanAdd`'s `lines`) and keeps that qty (`confirmedQty`), and
  `undoTargetQty` writes exactly one fewer. No confirmed view, no Undo (its target would be a guess). **And any
  other write of the same item retires the Undo** (`undoAfterWrite`; proposition 6 e — every `scanAdd`
  and `setQty` outside the Undo is preceded, in its own function, by that retirement): the author's
  hand-read of this fix found the interleaving it opened — a Browse add inside the window makes the line
  ×2 while the record says ×1, and the Undo would have written 0, taking the Browse unit too. A write
  from another device stays outside the page's knowledge, as it is for the stepper's absolute writes.
- **The Undo's words come from the follow-up read's lines** (critical 2): `undoOutcome` — "Removed X"
  only when X is absent there, "X × n" only when it shows exactly n, "Undo saved — checking your
  basket…" otherwise (an interleaved write, a failed or refused read). The silent `!line` branch is
  gone with the client view, and a window whose write is in flight never expires under its pill.
  `check:scan-repeat` **proposition 6** pins the page's wiring (one live `setQty(…, undoTargetQty(<the
record>))`, no client-view reference, no hand-written past tense, `undoOutcome` live, every
  `setUndo` built by `undoFromAdd` over the add's own response).
- **"Add another" is named only where it is drawn** (critical 3): `lib/scan-chip.ts`'s `chipAction` is
  the ONE predicate for the chip's action slot (the Undo while its window is open, else "Add another",
  else nothing), over `chipFactsFor` — the chip reads it from state, the repeat toast from that state's
  ref mirrors — and `repeatSentence` speaks the clause only when the predicate draws the control. This
  also retires the "your list is out of date" toast's clause (no chip is drawn for a code the view does
  not show). **H decision 4's last sentence is superseded:** a re-scan inside the Undo window shows the
  Undo (the slot's one control) and says no "Add another"; a second copy waits for the window to close,
  or comes from the basket's stepper or a Browse row.
- **The Name sheet re-announces an identical refusal** (critical 4): `lib/sheet-refusal.ts` keys every
  refusal on a sequence and the sheet keys the sentence's node on it, so a second identical refusal
  arrives as a new node in the live region; the page's `say()` now carries the Burmese half (`my`),
  which it used to drop.
- **Critical 5 — the pairing. Decided under the owner's delegation (decided by: the grocery stream).**
  Any item added from a miss-opened sheet pairs, related to the jar or not; the shopper may have
  searched for something else entirely. So the pairing is recorded as a note of the shopper's OWN act,
  never as the jar's identity: a re-read through it is announced "You added {name} for this code —
  it’s in your basket (×{qty})." and its chip offers NO "Add another" (a one-tap charge of an item the
  camera never sighted). `addAnother` is gated on the same `chipNow` the chip's `action` reads, so the
  claim in `lib/scan-pairing.ts` now holds without a caveat: no charge ever takes a judged code. The
  alternatives were weighed and refused: dropping the pairing (the rescued jar re-reads as a second miss
  for an item already in the basket — the whole graft-3 problem back), or asking "Is this {name}?" on
  every re-read (a modal question at the shelf, for a confirmation the shopper already gave by adding it).
- **Guards.** Proposition 4 gained provenance: every call of `add` is accounted for with a literal door —
  one `"scan"` door in the function `<ScanStage>` is handed, passing its own untouched parameter; one
  `"rescan"` door in `addAnother`, charging `lastScanned.code` behind a top-level early return on the
  chip's predicate; `add` never escapes as a value; a `for (… of/in …)` head and a destructuring target
  count as assignments; no hand-written "Add another" clause. Proposition 5 now covers EVERY sheet (no
  exemption), refuses an exit end on a reported sheet, requires the exit-end call to be ONE reachable
  top-level statement of its handler and referenced nowhere else (an alias or a call at the close's
  start is refused), and refuses a handler name declared twice instead of picking by position. All
  three propositions' evasions are **committed fixtures** in `apps/qr/lib/check-scan-repeat.test.ts`,
  which runs the gate (`SCAN_REPEAT_ROOT`) against a mutated copy of the tree in CI, plus a clean
  baseline.
- **The DoorSheet's exit is covered** (guard 8): the page passes its reported state to a third
  `useStageCover(doorSheetOpen)`; with no exit end, the hook's fail-safe (above `--dur-sheet`) lifts it.
  DoorSheet (shared with /menu) is unchanged; OPEN-ITEMS `PD4 · door` is closed. The fail-safe errs long
  (≤ ~1 s of a held camera after the door sheet closes); an `onExitEnd` on DoorSheet would trim it to the
  exit — a nice-to-do, not a hole. H.3's exemption is superseded.
- **The `initialFocus` allowlist** (guard 9) sweeps every `.ts`/`.tsx` under the app's `components/`,
  `app/` and `lib/` and under `packages/ui/src`, resolves deep and relative imports of the primitive, and
  refuses a spread, `createElement(Sheet, …)`, a local alias, a prop or a re-export outside the barrel;
  `sheet.tsx`'s comment says so. Both allowlist suites parse each file once; their sweep timeouts fell
  from 60 s to 15 s (one full parse measured 1.4 s at load 8.5) (guard 12).
- **`useStageCover`'s stale-exit test** now asserts after the re-opened sheet's own close and before its
  exit end (guard 11); a new mutant (the cover raised only on the open edge) survives the old assertion
  and dies to the new one.

**The open questions.**

1. _The arm is a one-shot timer against a coarsened clock_ — **fixed.** The timer at `SAME_GESTURE_MS`
   arms the chip unconditionally (`setTimeout` never fires early); re-asking a coarsened
   `performance.now()` could answer "not yet" and never arm.
2. _A touch user's Undo held by a carried `:focus-visible`_ — **fixed, on both routes.** After an add the
   close-restore lands on the chip itself, never on its action (the Undo is one Tab on); and the result
   bar's re-key hands focus off like for like (bar → bar, control → first action), so a re-key cannot
   move a programmatic focus onto the Undo either.
3. _A sheet dismissed mid-write while a new miss's sheet is open confirms the add behind the keyboard_ —
   **justified.** The add's "Added X" is the PAGE's announcement (the Toast is the page's live region and
   speaks under the modal); routing it into the new sheet's state line would label that sheet's search
   with another sheet's add. The basket figures and, once the sheet closes, the chip show it too.
4. _The Undo's silent `!line` branch_ — **gone** (the record carries its own line and qty).
5. _The Burmese half of a refusal dropped in the sheet_ — **fixed** (critical 4's commit).
6. _The Undo window expiring mid-write_ — **fixed** (`undoOpen`'s `removing`, one mutant).
7. _A malformed selector throwing after `preventDefault()`_ — **fixed**: `sheetInitialFocusTarget`
   treats a selector the browser cannot parse as one that matches nothing (the container), red-first in
   the ui suite.
8. _On reconnect the sheet's "Search unavailable" and the drain's Toast announce together_ —
   **justified.** They are two regions saying two true things: the sheet's own line (its last search
   failed; "Try again" runs it now) and the page's Toast (what the queued scans came to). Polite
   announcements queue; neither interrupts the other. Re-running the failed search on `online` is a
   nice-to-do (filed under PD4's row), not a correctness fix.

#### H.5 · Codex on #329's merge head `ff29547` — three P2s, fixed in one commit

- **An in-flight replay could still leave an Undo that removes both units.** Retiring at a write's
  start (and again when a replay lands) misses this order: a replay of the item starts → the sheet add
  starts → the sheet's write lands (×1) → the replay's lands (×2) → the replay answers (no Undo yet) →
  the sheet answers with a read taken before the replay landed and mints an Undo of confirmed qty 1 →
  the Undo writes 0. Now every write of an item is tallied in a per-barcode ledger (`writeStarted` /
  `writeLanded`: events and in-flight count; `lib/scan-undo.ts`), the sheet add takes its mark right
  after its own start, and it mints only when its own landing is the one event since and nothing is in
  flight (`undoMayMint`). Otherwise no Undo is offered (the stepper is). A replay's landing also
  retires a matching Undo. `check:scan-repeat` proposition 6 f pins that every `scanAdd` / `setQty`
  outside the Undo is on the ledger (a top-level start, a landing in a `finally`) and that the mint is
  gated with a mark taken after the add's own start; the exact order above is a test.
- **Offline, the Name sheet waited for a failed lookup.** A keystroke resets the hits, so the offline
  state (which required a completed empty result) never showed and the request still went out.
  `lib/name-search.ts` decides both halves: no request with the radio down (the query is sent when it
  returns), and the sheet's offline state at once. Browse keeps its shipped "Search unavailable —
  please try again.", now immediately. (Making `online` a dependency of the debounced search was
  wrong — §H.6 replaces it.)
- **"Start a fresh basket" dropped focus on `<body>` on the Scan door.** `parkFocus` picked the pressed
  button (its `fresh` candidate) because the field and the stage were absent; the button then left
  with the banner. `freshBasketLanding` never names that button, and `usePendingFocus` waits for the
  new stage to mount, giving up if the shopper moved focus elsewhere.

#### H.6 · The last capped blind pass on `f0d013f` — REJECT, fixed or justified

- **Reconnect announced a failure that never happened** — **fixed.** The offline step marked a query
  nobody sent as `searchFailed`, and `online` re-ran the search: the reconnect render read "Search
  unavailable — please try again." with the "Try again" hero, which stayed up through the real fetch.
  The search now lives in `lib/hooks/useNameSearch.ts`: a query typed offline is HELD (no request,
  nothing failed), reads as on its way the moment the radio returns (`nameSearchPending`), and is sent
  once. A search that was SENT and failed still says so on reconnect, with "Try again" (item 8 above
  stands for that case).
- **A radio drop wiped rows still on screen** — **fixed.** The radio is no longer a dependency of the
  search; it is read where the step is decided. Rows stay tappable offline (the queue's "Already saved
  — we'll check it when you're back online" path), and a focused Browse row keeps its focus. A NEW
  query typed offline still drops the old query's rows.
- **Proposition 6 f accepted a start hoisted above the early returns** — **fixed.** The write's own
  top-level statement must be the `try` that lands it, with only declarations between the start and
  it (no return, throw or await); two committed fixtures, red on the old guard.
- **`usePendingFocus` gave up while the pressed button still held focus** — **fixed** (not live
  today: the banner leaves in the click's own commit). The control focused at the request no longer
  reads as "moved on".
- **After "Start a fresh basket", a failed mint left focus on `<body>`** — **fixed.** The session
  banner's Retry is the last landing candidate. `#scan-stage` itself mounts in the page's own commit
  (ScanStage is a synchronous child; its panel branch carries `#scan-panel-title`, also a candidate).
- **The Undo's own absolute write is not on the ledger** — **justified, filed.** Pre-existing: the
  Undo's `setQty` is issued at the tap, before any replay a reconnect starts, and the replay's start
  and landing both retire an untapped Undo. A tapped Undo racing a replay of the same item at the
  server is a nice-to-do under PD4's row.
