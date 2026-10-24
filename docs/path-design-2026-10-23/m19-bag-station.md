# picked-m19 — Takeaway bags as a glanceable station (refined spec, round 4)

<!-- round4-citation-key -->

> **Reading this spec.** It is one moment of round 4; the record is [`../PATH_DESIGN_2026-10-23.md`](../PATH_DESIGN_2026-10-23.md), and where the two disagree the record's _Cross-spec reconciliations_ win, then this file's appendices, then its body. Code citations are against `origin/main` @ `09c1c2a`; a bare path is under `apps/qr/`. A few citations name the round's working files, which are not in the repo: **`common.md` D1–D8** are the record's defaults **R4·1–R4·8** (same numbers); **`vocab.md`** is the record's _Shared vocabulary (round 4)_; **`amend.md`** is this spec's appendix A (and the record's reconciliations); **`brief-mNN.md`** and **`mNN.json`** are the three concepts and the judges' notes, summarized in the record's section for this moment; **`picked-mNN.md`** is this file's own body (the critic's line numbers in appendix B point into it as it stood before the appendices); **`lens.md`** is the round's design lens, restated in the record's opening sections. Every Burmese string marked _K15 draft_ is a draft for the native sitting, never final copy.

Backbone: **The Bag Shelf (GLANCEABLE)** — the lane opened full-height as a STAGE of the counter home
(D2), wearing **A's card** (one stage line, destination hoisted once, zero `--fs-xs`), with B's two rules
(a pinned pick; "Follow this tablet" as the first theme segment, the sheet portaled `dark`). Every product
claim below is cited against `origin/main @ 09c1c2a`; where the code refused a claim the design changed
(see DECISIONS 9, 12, 14).

What the three screens share (the station's contract):

- **Route and tree.** `/staff?floor=1&stage=bags`. Today the lane is zone 3 of the counter scroll
  (`app/staff/page.tsx:313` `<ExpoBoard initial={lane} initialOutage={!expo.ok} />`) inside
  `CounterLive` = `LiveConnectionProvider` + `CounterBellProvider` (`page.tsx:351-357`), and
  `/staff/expo` redirects to `/staff?floor=1` (`app/staff/expo/page.tsx:11`). The stage is the SAME
  document: `CounterSplit`'s main column stays mounted; the other zones (`start-h`, `#floor-zone`, the
  rails, `DayCash`, `SettledToday`, `MoreGrid` — `page.tsx:295-338`) and the server bar get
  `hidden` + `inert`; the lane's `<section aria-labelledby="expo-h">` (`ExpoBoard.tsx:1093-1098`) is
  wrapped in `<div class="station-root" data-size={s|m|l}>` (+ `dark` when the tablet chose Night)
  and renders its own `StaffBar` (plain JSX, usable from a client tree — `StaffBar.tsx:38-40`). The
  bell keeps ringing because the provider never unmounts (owner decision 5c, `CounterBell.tsx:46-58`).
  `/staff/expo` now redirects to `/staff?floor=1&stage=bags` (a bookmark lands on the stage).
- **Tiers from ONE component.** `.station-root` joins the `--kfs-*` selector lists — the base block
  (`globals.css:8835-8850`: id 32 · item 28 · item-my 30 · mod 21 · clock 24 · meta 15 · label 13) and
  the two stops (`:12089-12110`: m 36/32/34/24/28/17/15 · l 40/36/38/27/32/19/16), keeping
  `.kds-root` LAST so `kds-size.test.ts` still parses each stop. `ExpoBoard`'s style constants read
  `var(--kfs-X, <zone fallback>)`: call-out `var(--kfs-id, var(--fs-h2))` · Burmese dish
  `var(--kfs-item-my, var(--fs-body))` · stage line, English dish, modifiers, hoisted destination,
  refunded sentence, pickup line, grocery note, "more not sent" and the count line
  `var(--kfs-mod, var(--fs-body))` (the count line's zone fallback stays `--fs-sm`, `.expo-status`) ·
  clock `var(--kfs-clock, var(--fs-h3))` (`.expo-age` is `--fs-h3` today, `globals.css:13162`) · the
  slot label `var(--kfs-clock, var(--fs-sm))` (expo-stage.ts:16 is `--fs-sm`; `HelpPicture` keeps the
  fallback) · code suffix, line tags, phone, echoes `var(--kfs-meta, var(--fs-sm))`. The zone keeps
  its `--fs-*` sizes; the station gets the KDS tiers; one card, one anatomy.
- **The dial.** `KDS_SIZE_KEY = "mms.kds.size"` (`kds-size.ts:16`), parsed exactly (`:22-24`), read in
  a microtask after mount the way the board reads it (`KdsBoard.tsx:722-727`) and on `storage`; a
  pick writes `m`/`l` and REMOVES the key for `s` (`KdsBoard.tsx:1118-1126`). While the stage is open the
  counter's `HelpButton` receives `size={{ value, onPick }}` (`HelpButton.tsx:62-65`), which is what
  mounts the plain Aa circle before the gold one and opens the ONE sheet straight onto Text size
  (`HelpButton.tsx:482-500`; DESIGN-LANGUAGE §34 "Aa appears only where there is a dial"). The size view
  is the shipped one — three rows on `help.size.sample` "Mohinga · မုန့်ဟင်းခါး" (`staff.ts:2766`),
  the lede `help.size.lede` (`:2759`), `kds.size.s/m/l` (`:409-411`); the station passes the px-only
  branch (`HelpButton.tsx:800-802`) because its column rule is not the KDS's (DECISIONS 6).
- **Night without the OS.** The app has no theme picker (`ThemeSync.tsx:6-9`; `.dark` on `<html>`
  follows `prefers-color-scheme`, `layout.tsx:122`). The station adds ONE: `mms.station.theme` ∈
  {`light`, `dark`}, anything else = follow (the key is removed for follow). `dark` puts the class on
  `.station-root` ONLY (the KDS's `className="kds-root dark"`, `KdsBoard.tsx:1685`), never on `<html>`,
  so the counter home behind the stage keeps the OS theme. The Help `Sheet` portals to `<body>`
  (`sheet.tsx:147`), so the counter's `HelpButton` gets `sheetClassName="dark"` while the station is
  Night (`HelpButton.tsx:66`; the `KdsLineMenu` pattern, `KdsLineMenu.tsx:84`). The Undo pill is
  rendered in place (`toast.tsx:119`, no portal; `ExpoBoard.tsx:1265`), so the root's class reaches it.
  The theme row lives in the ONE Help sheet, only while the stage is open (where it applies): a row
  "Screen" with a `.staff-seg` of three 44px segments — **Follow this tablet · Light · Night** — the
  chosen one under the shared pressed cap (`globals.css` `.kds-chip[aria-pressed]` rule, §17). English
  only: no shipped Burmese exists for any of the four words (grep of `staff.ts` for night/theme/follow:
  none) — K15 drafts are listed, flagged, not rendered.
- **Glass.** Night-only, the bar alone (`.dark .staff-bar` = `--glass-chrome` + `--fx-glass-mid`,
  `globals.css:12181-12186`; `--glass-chrome` Night = `color-mix(--sf 90%)`, `tokens.css:629`). Nothing
  below the bar is glass; nothing nests; a selected element never wears it. Inside the root the bar
  cancels `--kds-pad` (`globals.css:12190-12192`; `--kds-pad: clamp(8px,1vw,16px)` `:8858` = 13.66px at
  1366 → drawn 14).
- **Order.** `laneRows` → `compareExpoTickets` (`expo-rules.ts:94-103`, `:294-301`): a real
  `arrivedAt` (the guest's "I'm here", `track.ts:85` → `qr_orders.arrived_at`) → not cooking → due
  (slot else paid/sent) → id. **Pinned (B's rule, new):** `pinLaneRows(sorted, prevIds, held)` in
  `lib/expo-rules.ts` — a row whose pick is inside its window or committing (`picked` map,
  `ExpoBoard.tsx:1241-1242`) keeps its previous index: remove it from the fresh sort and splice it back
  at `min(prevIndex, length)`. Red-first test: a Here-now bag landing above a held pick must not change
  the held row's index; a non-held row is never moved. Mutants join `verify:slice`.
- **Uprights.** The comparator's tiers drawn as sticky dividers (`position: sticky; top: 68px` under the
  bar, the zone strip's own idiom, `globals.css:11994-11997`): above tier 1 (any `arrivedAt`) and above
  tier 3 (`kitchen === "cooking"`), none above the middle tier (`unknown` sits with `done`,
  `expo-rules.ts:92`, and earns no label). An empty tier draws no upright. A pinned card stays where it
  was even under a tier head it no longer matches (6 s + the write); the upright's count is a count
  of FACTS (bags with the stamp / bags cooking), never of cards under it.
- **Stage line.** `laneStageFacts(ticket, picked)` in `lib/expo-rules.ts` returns the ordered keys:
  `picked` → `expo.picked.pending` (replaces the Ready word exactly as built, `ExpoBoard.tsx:1497-1508`);
  `arrivedAt` → `expo.tag.here` (`:1479-1483`); `status === "ready"` and not picked →
  `expo.tag.ready` / `expo.tag.verified` for a basket (`:1503-1507`); food bag at the first stage with
  `kitchen === "done"` → `expo.kitchenDone` (`:1488-1493`; advisory, `kitchenStateOf`
  `expo-rules.ts:40-51`; `unknown` draws nothing). Each fact = aria-hidden glyph + the shipped word at
  `--kfs-mod` 800 `--tx`, facts joined by " · ". The line is drawn only when a fact is true. It replaces
  the accent chip, the ok chip and the uppercase `--fs-xs` `readyTag` (`ExpoBoard.tsx:1476-1516`,
  `:1941-1947`). The card's accessible name already carries the stage (`expo.a11y.card*`,
  `staff.ts:1059-1061`), so the line is plain text.
- **Destination.** `bagDestination(lines)` → `"togo" | "grocery" | "mixed"` (pure, in
  `lib/expo-rules.ts`, beside `isScanGoBasket` `:231-233`): the header shows the glyph + word ONCE
  (`expo.dest.togo` / `expo.dest.grocery`, `staff.ts:1083-1084`); on a mixed bag the header shows none
  and each line carries its own at `--kfs-meta`. `destTag` (`ExpoBoard.tsx:1965-1973`, `--fs-xs`) retires;
  the per-line `expo.bag.refunded` / `expo.bag.noCharge` tags (`:1880-1895`) move to `--kfs-meta` 700,
  mark + words (`lineRefunded`, `expo-rules.ts:241-243`; M250 rule `:1762-1769`).
- **Card shell.** `.card.card-textured` as built (`ExpoBoard.tsx:1452`), radius 20, padding 16, gap 12
  (`cardStyle` `:1920`), the header strip bleeding to the edges with the due-ness tone
  (`.expo-head`, `globals.css:13145-13160`: ok = card face · warn `--warnb` at 10 min · late `--warnb` +
  `inset 0 -2px 0 --warn` at 20 min, `EXPO_TONE_MIN` `expo-rules.ts:116`; picked `--okb` + ok underline
  `:13169-13172`). Text keeps its ink at every tone. **P2db:** the dots stay (parity with every staff card)
  and are MASKED OUT behind the stage line, the lines block and the refunded line; the Night `--warn` mark
  and `--tx` word on the dotted face join `composite-contrast.test.ts` (OPEN-ITEMS P2db).
- **The slot.** ONE node, `bumpBtn` 64px (`--tap-bump`, `tokens.css:25`) radius 12; `readyBtn` accent
  (`--ac` fill, `--oa` ink) for the first stage, `pickedBtn` paper for the second, `undoBtn` (`--sf`,
  1px DASHED `--ac`) for the window (`expo-stage.ts:11-31`); label at `--kfs-clock` with the echo stacked
  (`echo="stack"`, `ExpoBoard.tsx:1649-1660`); busy = `aria-busy` + the 0.6 dim, label kept
  (`globals.css:4249-4256`). The Undo arms at 400 ms (`PICKED_UNDO_ARM_MS`, `expo-rules.ts:169`), the
  write goes at 6 s (`PICKED_UNDO_MS` `:152`), no reverse edge (`:143-150`). The thumb pill is the
  `Toast size="xl"` with `drainMs: PICKED_UNDO_MS` (`ExpoBoard.tsx:1265-1301`; `primitives.css:489-504`),
  naming ONE pick (`toastPick`, `expo-rules.ts:216-223`).
- **The bell's visible half in the stage.** `CounterSoundChip` (`CounterBell.tsx:296-309`,
  `data-counter-sound`) moves from the greeting row (`page.tsx:180-188`, hidden with the zones) to the
  right end of the lane's head row while the stage is open — so a paused bell is never silent-and-unseen.
  Three postures, shipped words: `kds.sound.enable` "Turn on sound" · `board.sound.on` "Sound on" (the one
  lit cap) · `kds.sound.off` "Sound off — tap to turn on" (`staff.ts:300, 303, 2185`). Its tap is its own
  arm (`CounterBell.tsx:81`).
- **One live region.** The lane's `role="status"` (`ExpoBoard.tsx:1116`) is the stage's only region;
  the floor's is under `hidden`/`inert`, so the dedupe that falls silent when the floor is
  `not_updating` (`:1060-1063`, `useLiveBoardState("floor")`) is BYPASSED in the stage (`stage` prop →
  `announced` always speaks the frozen sentence) — red-first test. The pill is `live={false}`.
- **Focus.** Open → `h2#expo-h` (`headingRef`, `ExpoBoard.tsx:1105`), kept in the DOM sr-only (the bar
  names the stage once); close → the opener Link; a landed pick → the heading (as built); an Aa or
  theme pick → the circle; `scroll-padding-top: 68px`. `inert` on the folded zones (Safari ≥ 15.5; the
  fallback is `aria-hidden` + the zones' `display: none`).
- **Back.** The opener does `history.pushState("?floor=1&stage=bags")`; "← Counter" (`floor.back`,
  `staff.ts:423`) does `history.back()` when the entry is ours, else `router.replace("?floor=1")` (a
  bookmark arrival); the page re-expands in place, no remount. The iPad edge-swipe is the same Back.
- **Motion.** The stage root enters with `.mms-rise` (`globals.css:1082`, `--dur-slow` 480 ms); cards
  premiere as built (`StaggerList`); a rung card's ring `.floor-card-pulse` 1 s (`:4219-4236`); the
  pill's drain. Reduced motion: all `animation: none` (`:4262-4275` extended to `.station-root`), the
  drain a static half line + the region's sentence; the Undo window is a timer, not an animation, and
  holds on keyboard focus (`onHold`, `ExpoBoard.tsx:1584-1588`).

---

## SCREEN picked-m19-1.dc.html — The bag stage, Night, text size Small

Device: tablet 1366×1024. Theme: Night (the tablet chose it: `.station-root.dark`, `data-size="s"`).
Opened from the counter home (screen 3); the OS is light, the counter home behind stays light.

LAYOUT (y, top to bottom; x from the left edge):

- **y 0–68 · THE ONE BAR** (`.staff-bar`, min-height 68, padding 10 20, gap 12; Night glass
  `rgba(33,26,48,0.90)` + `backdrop-filter: blur(20px) saturate(1.5)`, `inset 0 1px 0
rgba(255,255,255,0.11)`, bottom hairline `rgba(243,236,223,0.13)`; sticky, z `--z-toolbar`).
  - x 20: `.staff-back` pill (44px, radius 999, bg `#2b213c`, 1px `--bd`, inset sheen, padding 0 16):
    "← ကောင်တာ" 15px Padauk 700 `#f3ecdf` then the echo "← Counter" 13px 600 `#bcafc8`, gap 8.
  - x ≈ 196, flex 1: the h1 `.staff-bar-title` stacked: "ပါဆယ်ထုပ်များ" 30px Padauk 700 `#f3ecdf` over
    "Takeaway bags" 13px 600 `#bcafc8` (`expo.title`, `echo="stack"`) — the only English in the bar.
    Beside it (`.staff-bar-head`, `StaffBar.tsx:154-157`) the `LiveDot` slot: an 8px `--ok` dot + "အသစ်တက်နေ"
    13px 700 `#bcafc8` (`shell.live.live`, `staff.ts:3233`).
  - Middle: empty (the station has no filter).
  - Trailing, right edge x 1346, 44px circles, gap 12 (`.staff-bar-tail`, gap 10 as built → drawn 12):
    x 1134 the approvals circle (owner/manager only, `page.tsx:144-146`; icon-only, no count badge when
    none pending; sr "ခွင့်ပြုချက်များ / Approvals", `floor.nav.approvals` `staff.ts:1143`) · x 1190 **Aa**
    (plain `.staff-circ`: bg `#2b213c`, 1px `--bd`, inset sheen; glyph "Aa" 16px 800 `#f3ecdf`; sr
    "စာလုံး အရွယ်အစား / Text size", `kds.size.title` `staff.ts:76`) · x 1246 **?** (`.staff-circ-gold`:
    border `color-mix(gold 60%, --bd)`, bg `linear-gradient(180deg, color-mix(#f4c879 22%, #2b213c),
#2b213c)`, glow `0 0 16px -6px --glow-gold`; glyph `#e7a53a`; sr "အကူအညီ / Help") · x 1302 **Lock**
    (`.staff-circ`, lock glyph 22px, sr "Lock"). No sound circle (the chip is in the head row), no TV
    circle (the wall is the kitchen's, `KdsBoard.tsx:1706-1712`).
- **y 68–82 · 14px** root padding (`--kds-pad`).
- **y 82–126 · THE HEAD ROW** (44px; `headRow` flex space-between, `ExpoBoard.tsx:1902-1909`):
  - Left, x 14: `<h2 id="expo-h">` sr-only (focus target), the sr-only `role="status"`, then the keyed
    COUNT LINE `<p>` at `--kfs-mod` 21px 700 `#f3ecdf`: "စောင့်နေတဲ့ ပါဆယ်ထုပ် ၃ ခု" with the inline
    echo "3 bags waiting" 15px 600 `#bcafc8` (the segments as built, `ExpoBoard.tsx:1159-1196`; only the
    nonzero ones; Burmese numerals in prose counts, `staff.ts:19-27`; the station passes `echo="inline"`
    on this line — a heading-class fact, DESIGN-LANGUAGE echo policy).
  - Right, x 1352 right-aligned: the **sound chip** (`.staff-chip`, 44px, radius 999, `aria-pressed`
    → the lit cap in Night: bg `#e7a53a`, ink `#130d1e`, `inset 0 1px 0 rgba(255,255,255,0.11)`,
    `0 0 14px -6px --glow-gold`): volume glyph 18px + "အသံ ဖွင့်ထား" 13px 700 (`board.sound.on`; a chip
    carries no echo).
- **y 126–138 · 12px.**
- **y 138–182 · UPRIGHT 1** (`<h3>`, 44px, full-bleed x 0–1366 via margin 0 −14, bg `#211a30`, bottom
  hairline `--bd`, sticky top 68, padding 0 20, gap 12): people glyph 24px `#bcafc8` (aria-hidden) ·
  "ရောက်နေပြီ" 21px Padauk 700 `#f3ecdf` · "·" `#a69eb1` · "Here now" 15px 700 `#bcafc8` · right end
  x 1346: "2" 21px 800 tabular `#f3ecdf`.
- **y 182–194 · 12px.**
- **y 194–… · THE SHELF, tier 1** (`ul role="list"` named "စောင့်နေတဲ့ ပါဆယ်ထုပ်များ / Bags waiting",
  `expo.a11y.bags` `staff.ts:1027`; grid `repeat(3, 1fr)`, gap 12, `align-items: start` → columns
  x 14–452 · 464–902 · 914–1352, 438 wide). Two cards; the third column is empty (the tier is the row).

  **CARD A — x 14–452, y 194–622 — "Table 7", warn, Here now · Kitchen done.** `<article
class="card card-textured" aria-label="စားပွဲ 7 အတွက် ပါဆယ်ထုပ်">` (`expo.a11y.cardBag`), bg `#2b213c`,
  1px `--bd`, radius 20, dots `rgba(231,165,58,0.2)` masked out under the text blocks, shadow
  `inset 0 1px 0 rgba(255,255,255,0.11), 0 8px 24px -12px rgba(8,4,18,0.8)`, padding 0 16 16, gap 12.
  - y 0–76 **header strip** (`.expo-head` `data-tone="warn"`: bg `#33231d`, padding 12 16, flex
    space-between, align center): left the call-out "စားပွဲ 7" 32px Padauk 700 `#f3ecdf` (the digit
    Latin, Hanken 800, `lang="en"`; `floor.table` `staff.ts:477`). Then flex-auto space holding the
    **reserved 48×44 slot** (K49 ②): drawn as a 1px dashed `rgba(243,236,223,0.3)` outline, radius 8,
    aria-hidden, NO label; the build renders nothing there. Right cluster, gap 12, one row: bag glyph
    22px `#bcafc8` + "ပါဆယ်" 21px Padauk 700 `#f3ecdf` + "To-go" 15px 600 `#bcafc8` (hoisted,
    `bagDestination` = togo) · the clock "12:40" 24px 800 tabular `#f3ecdf` (`fmtElapsed`,
    `kds-time.ts:42-51`; sr `spokenElapsed` "12 minutes 40 seconds elapsed", `kds.age.mmss`
    `staff.ts:324`).
  - y 76–122 **stage line** (padding 6 16; 21px 800 `#f3ecdf`, facts gap 8): ◉ glyph 20px ·
    "ရောက်နေပြီ" Padauk 700 · "Here now" 15px 600 `#bcafc8` · "·" · ✓ glyph 20px · "မီးဖိုချောင် ပြီးပြီ" ·
    "Kitchen done" 15px 600 `#bcafc8`.
  - y 122–336 **lines** (`ul role="list"` "ဒီအော်ဒါထဲက ပစ္စည်းများ / Items in this order",
    `expo.a11y.lines`; rows padding 10 14, gap 12, hairline `--bd` between, min 56): row 1 (94px):
    `.kds-qty` 44×44 ring filled `#e7a53a` with `#130d1e` "2×" 15px 800 (a multiple fills; `kds-qty`
    `globals.css:9261-9275`) · "မုန့်ဟင်းခါး" 30px Padauk 700 `#f3ecdf` over "Mohinga" 21px 800 `#f3ecdf`
    (`.kds-line-en`, `:9382-9390`). Row 2 (120px): ring 2px `--bd` "1×" · "လက်ဖက်သုပ်" 30px / "Tea leaf
    salad" 21px 800 / modifier "no peanuts" 21px 600 `#f3ecdf` (allergy-critical: full ink, never `--t2`).
    No per-line destination (the bag is all to-go).
  - y 348–412 **the slot**: `readyBtn` 64px, radius 12, bg `#e7a53a`, ink `#130d1e`, inset sheen:
    "ထုပ်ပြီး၊ ယူလို့ရပြီ" 24px Padauk 700 over "Bagged & ready" 15px 600 (`expo.verb.bagged`,
    `staff.ts:1068`). 16px card padding below → card bottom y 622.

  **CARD B — x 464–902, y 194–592 — "Aye #K7M2", Here now · Ready, pickup.**
  - y 0–64 header (ok tone = card face, bottom hairline `--bd`): "Aye" 32px 800 `#f3ecdf` + " #K7M2"
    15px 700 `#bcafc8` (`codeSuffix`, `ExpoBoard.tsx:1468-1470`); reserved slot; right: bag glyph +
    "ပါဆယ်" + "To-go" · "4:05".
  - y 64–110 stage line: ◉ "ရောက်နေပြီ" · "Here now" · "·" · ✓ "အဆင်သင့်" · "Ready" (`expo.tag.ready`).
  - y 110–144 pickup line 21px 600 `#bcafc8`: "လာယူချိန် 6:30 PM" · "Pickup 6:30 PM" (`expo.pickup`,
    `formatSlotLong`; the clock `lang="en"` Hanken tabular).
  - y 156–200 phone row: `tel:` link 44px, phone glyph 20px + "(626) 555-0147" 15px 700 `#f3ecdf`
    (`ExpoBoard.tsx:1538-1553`; a real contact from the order, never invented in the build).
  - y 212–306 lines: ring "1×" · "ကြက်သားဟင်း" 30px / "Chicken curry" 21px 800.
  - y 318–382 slot: `pickedBtn` paper (bg `#2b213c`, 1px `--bd`, ink `#f3ecdf`): "ယူသွားပြီ" 24px
    Padauk 700 over "Picked up" 15px 600 `#bcafc8` (`expo.verb.pickedUp`, `staff.ts:1125`).

- **y 634–942 · THE SHELF, tier 2** (no upright: the middle tier earns no label): a new grid row.

  **CARD C — x 14–452, y 634–942 — "Table 4", Kitchen done.** Header (card face, hairline): "စားပွဲ 4"
  32px; reserved slot; bag + "ပါဆယ်" + "To-go" · "5:12". Stage line: ✓ "မီးဖိုချောင် ပြီးပြီ" · "Kitchen
  done". Lines: ring filled "3×" · "ရှမ်းခေါက်ဆွဲ" 30px / "Shan noodles" 21px. Slot: accent "ထုပ်ပြီး၊
  ယူလို့ရပြီ / Bagged & ready".

- Below y 942: page ground `#100c19` to the frame's edge (the shelf scrolls under the bar; bottom
  padding 96px so the last slot clears the pill when one shows). No pill on this screen.

COPY (English):

- ← Counter
- Takeaway bags
- Live
- Approvals · Text size · Help · Lock (sr names)
- 3 bags waiting
- Sound on
- Here now
- Bags waiting (list name) · Items in this order (list name)
- Table 7 · Table 4
- Aye #K7M2
- To-go
- 12:40 · 4:05 · 5:12
- Kitchen done
- Ready
- Mohinga · Tea leaf salad · no peanuts · Chicken curry · Shan noodles
- Pickup 6:30 PM
- (626) 555-0147
- Bagged & ready
- Picked up
- Bag for Table 7 · Bag for Aye #K7M2 · Bag for Table 4 (card names)

COPY (Burmese) — every string shipped, rendered at a new size:

- ← ကောင်တာ — `floor.back`, `apps/qr/lib/i18n/staff.ts:423`
- ပါဆယ်ထုပ်များ — `expo.title`, `:1034`
- အသစ်တက်နေ — `shell.live.live`, `:3233`
- ခွင့်ပြုချက်များ — `floor.nav.approvals`, `:1143` · စာလုံး အရွယ်အစား — `kds.size.title`, `:76` ·
  အကူအညီ — `help.title`, `:2743`
- စောင့်နေတဲ့ ပါဆယ်ထုပ် ၃ ခု — `expo.count.many`, `:1037` (the `{n}` slot in Burmese numerals, `:19-27`)
- အသံ ဖွင့်ထား — `board.sound.on`, `:2185`
- ရောက်နေပြီ — `expo.tag.here`, `:1073` (the same word the guest tapped: `track.ts:85` imHere)
- စောင့်နေတဲ့ ပါဆယ်ထုပ်များ — `expo.a11y.bags`, `:1027` · ဒီအော်ဒါထဲက ပစ္စည်းများ — `expo.a11y.lines`, `:1055`
- စားပွဲ 7 · စားပွဲ 4 — `floor.table`, `:477` (Latin digit by the numerals rule)
- ပါဆယ် — `expo.dest.togo`, `:1083`
- မီးဖိုချောင် ပြီးပြီ — `expo.kitchenDone`, `:1041`
- အဆင်သင့် — `expo.tag.ready`, `:1074`
- မုန့်ဟင်းခါး — `help.size.sample`, `:2766` (a catalog `name_my` in the real row); လက်ဖက်သုပ် ·
  ကြက်သားဟင်း · ရှမ်းခေါက်ဆွဲ — catalog `name_my` values (`ExpoLine.nameMy`, `expo-types.ts:18`), the
  shipped artboards' example rows (m19-glance-1 / m19-quiet-1), never dictionary strings
- လာယူချိန် 6:30 PM — `expo.pickup`, `:1076`
- ထုပ်ပြီး၊ ယူလို့ရပြီ — `expo.verb.bagged`, `:1068`
- ယူသွားပြီ — `expo.verb.pickedUp`, `:1125`
- စားပွဲ 7 အတွက် ပါဆယ်ထုပ် — `expo.a11y.cardBag`, `:1061`
- NO new Burmese on this screen. "no peanuts" is a modifier snapshot (`ExpoLine.modifiers`), shown as
  stored; a per-slot `modifiersMy` (`expo-types.ts:23`) draws beside it when the catalog has one.

A11Y:

- Landmarks: the bar's h1 names the page (`expo.title`); the lane `<section aria-labelledby="expo-h">`
  keeps its sr-only h2 as the focus target after a dropped card; the two uprights are `<h3>`s inside
  it; the folded counter zones and the server bar are `hidden` + `inert`.
- ONE live region: the lane's `role="status"` (sr-only; speaks the counts as they change and every
  refusal/notice/remark, `ExpoBoard.tsx:1116-1135`); the stage bypasses the floor dedupe. The pill is
  `live={false}`.
- Names: grid `role="list"` + `expo.a11y.bags`; each card `aria-label` from `expo.a11y.card*` (+
  the refunded words, `refundedBagWords` `:1838-1840`); lines `role="list"` + `expo.a11y.lines`; every
  circle and the back pill named by sr-only `<Chrome>` text, never `aria-label` on a control with children
  (DESIGN-LANGUAGE §17; `check-staff-lang` rule 3); the slot's name is `al()`'s verb + subject
  (`:1605-1639`); the sound chip's name is its visible word, `aria-pressed` for the lit posture.
- Targets: back pill 44 · circles 44 · chip 44 · phone row 44 · the slot 64 (`--tap-bump`); the
  reserved slot is not a control (renders nothing).
- Never colour alone: tone = header surface, late adds the 2px underline; every stage fact = glyph +
  word; the lit chip = cap + `aria-pressed`; destination = shape + word.
- Contrast (Night ladder, `tokens.css:483-547`): `#f3ecdf` and `#bcafc8` on `#2b213c`/`#211a30`/`#33231d`
  clear AA; the English echo under a Burmese dish is 800 at full `--tx` (the `.kds-line-en` rule); the
  dotted face's cores are masked out under text (P2db).
- Reduced motion: no rise, no stagger, no pulse, no press sheen; static frames.
- Focus: lands on `h2#expo-h` on open; `:focus-visible` ring 2.5px `--ac` offset 2 (drawn on nothing
  here).

---

## SCREEN picked-m19-2.dc.html — The same stage at Large, two columns

Device: tablet 1366×1024. Theme: Night, `data-size="l"` (`--kfs-id` 40 · item-my 38 · mod 27 · clock 32 ·
meta 19; `globals.css:12102-12110`). The dial was picked on the Help sheet (Aa → Text size → "ကြီး ·
Large"), remembered under `mms.kds.size`. Two columns at m/l (DECISIONS 6): x 14–677 · 689–1352 (663
wide). No bag is Here now and none is still cooking, so no upright draws (an empty tier draws none).

LAYOUT:

- **y 0–68 · bar** as screen 1.
- **y 82–126 · head row:** count line at 27px 700 `#f3ecdf`: "စောင့်နေတဲ့ ပါဆယ်ထုပ် ၃ ခု · ငွေ မရှင်းရသေး ၁ ခု
  · စစ်ဆေးရန် ၁ ခု" with the echo "3 bags waiting · 1 unpaid · 1 to verify" 19px 600 `#bcafc8`
  (`bagCount` = paid food bags + unpaid bags = 3, `unpaidCount` = bags that owe = 1, `verifyCount` =
  baskets at the first stage = 1; `ExpoBoard.tsx:1036-1047`). Right: the sound chip (lit).
- **y 138–486 · ROW 1.**

  **CARD A — x 14–677 — "Table 7", LATE (22:40), Kitchen done.** Header 88px, `data-tone="late"`: bg
  `#33231d` + `inset 0 -2px 0 #e0855f` (the line, not only the hue); "စားပွဲ 7" 40px Padauk 700 `#f3ecdf`;
  reserved 48×44 dashed slot; right: bag glyph 26px + "ပါဆယ်" 27px 700 + "To-go" 19px 600 `#bcafc8` ·
  "22:40" 32px 800 tabular. Stage line 55px: ✓ "မီးဖိုချောင် ပြီးပြီ" 27px 800 · "Kitchen done" 19px
  `#bcafc8`. Lines (115px): ring filled `#e7a53a` "2×" 19px 800 · "မုန့်ဟင်းခါး" 38px Padauk 700 /
  "Mohinga" 27px 800. Slot 64px accent: "ထုပ်ပြီး၊ ယူလို့ရပြီ" 32px Padauk 700 / "Bagged & ready" 19px 600.
  Card bottom y 486. The four biggest things are who (40), how late (32), what (38), the verb (32).

  **CARD D — x 689–1352 — "Table 11", PICKED, inside the window (pinned).** Header 88px
  `data-picked="true"`: bg `#1f2e26` + `inset 0 -2px 0 #5fb07e`; "စားပွဲ 11" 40px; reserved slot; bag +
  "ပါဆယ်" + "To-go" · "6:48" (a picked bag was due before the tap, so its clock still shows —
  `expoAge` counts from the due moment, `expo-rules.ts:131-141`). Stage line: ↶ undo glyph 24px ·
  "ယူသွားပြီ — ပြန်ဖျက်မလား" 27px 800 `#f3ecdf` · "Picked up — undo?" 19px `#bcafc8`
  (`expo.picked.pending`). Lines: ring "1×" · "လက်ဖက်သုပ်" 38px / "Tea leaf salad" 27px. Slot = `undoBtn`:
  bg `#211a30`, 1px DASHED `#e7a53a`, ink `#f3ecdf`: "ပြန်ဖျက်" 32px Padauk 700 / "Undo" 19px 600
  `#bcafc8` (`kds.undo`, `staff.ts:306`), `aria-label` "Undo — Table 11" (`al(lang,{kind:"undo"})`,
  `ExpoBoard.tsx:1589`), inert for the first 400 ms. Pinned: when the next poll lands a Here-now bag
  above it, this card does not move (`pinLaneRows`).

- **y 498–907 · ROW 2.**

  **CARD C — x 14–677 — UNPAID walk-up, Kitchen done, "Take payment".** `<article data-unpaid
aria-label="လမ်းလျှောက်လာ အတွက် ငွေ မရှင်းရသေးတဲ့ ပါဆယ်ထုပ်, ငွေ မရှင်းရသေး — လာယူချိန် ငွေ လက်ခံ">`
  (`expo.a11y.cardUnpaid` + `unpaidBadgeWords`, `ExpoBoard.tsx:1696-1699`). Header 88px (card face,
  hairline): "လမ်းလျှောက်လာ" 40px Padauk 700 with "Walk-up" 19px 600 `#bcafc8` echo beneath
  (`reg.row.walkup` `staff.ts:1890`, `echo="stack"` on a heading-class call-out); reserved slot; bag +
  "ပါဆယ်" + "To-go" (the sent lines are all to-go) · "4:40" (from `sentAt`, `expo-rules.ts:277-285`).
  Stage line 55px: ✓ "မီးဖိုချောင် ပြီးပြီ" · "Kitchen done" (`bag.kitchen === "done"`, `:1711-1715`).
  Money row 61px: a bordered warn badge (1px `#e0855f` hairline, bg `#33231d`, radius 999, min-height
  44, padding 0 14): receipt glyph 22px `#e0855f` + "ငွေ မရှင်းရသေး — လာယူချိန် ငွေ လက်ခံ" 27px 700 in
  `#f3ecdf` (P2bm: the warn WORD in `--tx`, only the mark in `--warn`; `settle.unpaid`
  `staff.ts:3897-3900`). Lines (115px, the SENT lines only): ring "1×" · "ကြက်သားဟင်း" 38px / "Chicken
  curry" 27px. "နောက်ထပ် ၂ ခု မပို့ရသေး" 27px 600 `#bcafc8` · "2 more not sent yet" 19px
  (`expo.unpaid.more.many`, `:3955`; `bag.moreUnits`). Slot: the xl primary **Link** in the accent
  recipe: "ငွေ လက်ခံ" 32px Padauk 700 / "Take payment" 19px 600 (`expo.verb.takePayment` `:3948`) →
  `/staff/table/{sessionId}?settle=1` (`ExpoBoard.tsx:1701`; off the counter column `useTablePane()` is
  null, so it navigates to the table page, `:1811-1813`). No Bagged / Picked up on an unpaid bag. No
  amount is drawn anywhere on the lane.

  **CARD B — x 689–1352 — "Ko Zaw #2F8Q", Scan & Go basket, REFUNDED IN FULL, Verified.**
  `aria-label="စစ်ဆေးရန် · Ko Zaw · #2F8Q, ပြန်အမ်းပြီး — မပို့ခင် ကောင်တာကို မေးပါ"` (`expo.a11y.cardVerify`
  - `refundedBagWords`). Header 68px (Latin call-out): "Ko Zaw" 40px 800 + " #2F8Q" 19px 700 `#bcafc8`;
    reserved slot; right: basket glyph 26px + "ကုန်စုံ" 27px 700 + "Grocery" 19px (`expo.dest.grocery`,
    hoisted: every line is grocery) · "3:05". No stage line: a basket is never "Kitchen done"
    (`!grocery && …`, `ExpoBoard.tsx:1488`), it is at its first stage, and nobody is here. Refunded line
    79px: receipt glyph 24px `#e0855f` + "ပြန်အမ်းပြီး — မပို့ခင် ကောင်တာကို မေးပါ" 27px 700 `#f3ecdf` over
    "Refunded — check with the counter before it goes out" 19px 600 `#bcafc8`
    (`table.detail.paidKitchen.refunded` `staff.ts:3170-3173`, `echo="stack"` as built `:1524-1529`;
    words in `--tx` in Night, `--warn` in light as built `refundedLine`). Grocery note 55px, 27px 600
    `#bcafc8`: "Scan & Go — ငွေရှင်းပြီး စခရင်ကို စစ်ပါ၊ ထုပ်စရာ မရှိပါ။" · "Scan & Go — check their paid
    screen; nothing to bag." (`expo.grocery.note` `:1079-1082`, the product name `lang="en"`). Lines:
    ring "1×" · "လက်ဖက်ခြောက်" 38px / "Tea leaves" 27px (a grocery `name_my`). Slot: the accent first-stage
    verb STAYS — "စစ်ဆေးပြီး" 32px / "Verified" 19px (`expo.verb.verified` `:1067`): J62, a tag never a
    cancel (DECISIONS_2026-10-18.md:773-791; `refunded-cart.ts` docblock). Per-line "ပြန်အမ်းပြီး —
    မထုပ်ပါနဲ့" tags draw only where the line ledger says so (`line.refunded`, `expo-types.ts:32`); not on
    this bag.

- **y 944–1008 · THE THUMB PILL** (fixed, bottom-centred, 16px + safe area; `Toast size="xl"`, 64px,
  radius 999, inverted `#f3ecdf` pill with `#100c19` ink, `--sh-md`; width ≈ 520 → x ≈ 423–943):
  "စားပွဲ 11 ယူသွားပြီ" 16px 700 + "Table 11 picked up" 13px (`expo.toast.pickedTable` `staff.ts:3245`)
  and the action pill 44px, 2px `currentColor` border: "ပြန်ဖျက်" · "Undo" (`kds.undo`); a 2px drain
  line in `#e7a53a` along the pill's bottom edge, 6 s left → right (`drainMs: PICKED_UNDO_MS`). The
  whole pill names ONE pick (`toastPick`). It floats over the shelf's bottom padding, clear of both
  slots on this frame (C's slot ends y 873+64 = 937; B's 871+64 = 935).

COPY (English):

- 3 bags waiting · 1 unpaid · 1 to verify
- Table 7 · 22:40 · To-go · Kitchen done · Mohinga · Bagged & ready
- Table 11 · 6:48 · Picked up — undo? · Tea leaf salad · Undo · Undo — Table 11 (name)
- Walk-up · 4:40 · Unpaid — collect at pickup · Chicken curry · 2 more not sent yet · Take payment ·
  Unpaid bag for Walk-up (name)
- Ko Zaw #2F8Q · 3:05 · Grocery · Refunded — check with the counter before it goes out · Scan & Go —
  check their paid screen; nothing to bag. · Tea leaves · Verified · Verify · Ko Zaw · #2F8Q (name)
- Table 11 picked up · Undo (the pill)
- Table 11 picked up — undo available. (the region, `expo.live.pickedTable`)

COPY (Burmese) — all shipped:

- စောင့်နေတဲ့ ပါဆယ်ထုပ် ၃ ခု — `expo.count.many` `:1037` · ငွေ မရှင်းရသေး ၁ ခု — `expo.count.unpaid` `:3956` ·
  စစ်ဆေးရန် ၁ ခု — `expo.count.verify` `:1038`
- စားပွဲ 7 · စားပွဲ 11 — `floor.table` `:477`
- ပါဆယ် `:1083` · ကုန်စုံ `:1084`
- မီးဖိုချောင် ပြီးပြီ `:1041`
- ယူသွားပြီ — ပြန်ဖျက်မလား — `expo.picked.pending` `:1086`
- ပြန်ဖျက် — `kds.undo` `:306` (K15-HIGH, shipped)
- လမ်းလျှောက်လာ — `reg.row.walkup` `:1890`
- ငွေ မရှင်းရသေး — လာယူချိန် ငွေ လက်ခံ — `settle.unpaid` `:3897-3900` (K15-HIGH, shipped)
- နောက်ထပ် ၂ ခု မပို့ရသေး — `expo.unpaid.more.many` `:3955` (prose count in Burmese numerals)
- ငွေ လက်ခံ — `expo.verb.takePayment` `:3948`
- လမ်းလျှောက်လာ အတွက် ငွေ မရှင်းရသေးတဲ့ ပါဆယ်ထုပ် — `expo.a11y.cardUnpaid` `:3949-3952`
- ပြန်အမ်းပြီး — မပို့ခင် ကောင်တာကို မေးပါ — `table.detail.paidKitchen.refunded` `:3170-3173` (shipped K15 draft)
- Scan & Go — ငွေရှင်းပြီး စခရင်ကို စစ်ပါ၊ ထုပ်စရာ မရှိပါ။ — `expo.grocery.note` `:1079-1082`
- စစ်ဆေးပြီး — `expo.verb.verified` `:1067` · စစ်ဆေးရန် · {x} — `expo.a11y.cardVerify` `:1059`
- စားပွဲ 11 ယူသွားပြီ — `expo.toast.pickedTable` `:3245`
- စားပွဲ 11 ယူသွားပြီ — ပြန်ဖျက်နိုင်သေးသည်။ — `expo.live.pickedTable` `:1091-1094`
- မုန့်ဟင်းခါး `:2766` · လက်ဖက်သုပ် · ကြက်သားဟင်း · လက်ဖက်ခြောက် — catalog `name_my` example rows
- No new Burmese on this screen.

A11Y:

- As screen 1, plus: the picked card's slot is a `<button aria-label="Undo — Table 11">` holding the
  window on keyboard focus (`onFocus` → `onHold`, `ExpoBoard.tsx:1584-1588`; the cap warning
  `expo.live.capSoonTable` five seconds before the minute, `staff.ts:3257-3262`); the pill's Undo is
  `aria-disabled` until armed and while leaving (`toast.tsx:152-158`); the Take payment control is a
  real `<a>` (a long-press, a modified click and a new tab get the full table page).
- Late ≠ warn by the 2px underline, never hue alone (WCAG 1.4.1); under reduced motion nothing pulses.
- The money badge: the mark in `--warn`, the words in `--tx` on `--warnb` with the warn hairline — shape
  - surface + word.
- The refunded sentence is in the card's name (WCAG 2.5.3) through the same key.

---

## SCREEN picked-m19-3.dc.html — The counter home, Light: the stage's door, the bell ringing

Device: tablet 1366×1024. Theme: Light (the OS; `.staff-main` ground `#faf9f5` with the 28px ruled
lines at 5% `--tx`, `globals.css:12141-12148`). No table pane is open, so the column is
`.staff-split`'s plain `max-width: 67.5rem` (1080px, `globals.css:16852-16860`) centred: x 143–1223,
`.staff-col` padding 20 → content x 163–1203. The page is scrolled so that the reader is IN zone 3
(the lane): the zone strip's lane chip is lit (`aria-current="location"`, `CounterZoneStrip.tsx:115`),
and a Kitchen done has just landed for Table 7 — the counter bell rang (the provider is mounted,
`page.tsx:351-357`) and the lane card wears the one-shot ring (`.floor-card-pulse`, `ExpoBoard.tsx:1459`).

LAYOUT:

- **y 0–68 · THE BAR** (paper `#faf9f5`, bottom hairline `rgba(58,35,23,0.1)`, padding 10 20): x 20 the
  Screens circle (`.staff-circ`, grid glyph 20px; sr "စခရင်များ / Screens", `shell.screens`); the h1
  "ကောင်တာနဲ့ စားပွဲများ" 30px Padauk 700 `#1b1714` over "Counter & tables" 13px 600 `#6e6358`
  (`floor.door.counter` `staff.ts:1160`) with the RoleBadge "Owner" (gold tone chip, 13px 700
  `--gold-strong` on a 16% gold tint, `badge.tsx:21`; English by design, `RoleBadge.tsx:11`) and the
  LiveDot "အသစ်တက်နေ" (`shell.live.live`); trailing at the right edge: the approvals circle (icon-only;
  sr "ခွင့်ပြုချက်များ / Approvals") · Help (`.staff-circ-gold`) · Lock. No Aa here: the counter home
  has no dial (the dial is the stage's; DESIGN-LANGUAGE §34).
- **y 68–129 · THE ZONE STRIP** (sticky `top: var(--staff-bar-h)`, `globals.css:11994-12008`; padding
  8 20, bg `#faf9f5`, bottom hairline; `<nav aria-label="ဒီစခရင်ရဲ့ အပိုင်းများ / Sections of this
screen">`, `floor.a11y.zones` `staff.ts:1179`). Chips (`.staff-chip`, 44px, radius 999, bg `#f2efe7`,
  1px `--bd`, 13px 700 `#1b1714`, Burmese only — a chip carries no echo), gap 8, from x 163:
  "အော်ဒါ ဖွင့်" (`floor.zone.start` `:429`) · "စားပွဲများနဲ့ ကောင်တာ အော်ဒါများ" (`floor.tables.title`
  `:1194`) · **"ပါဆယ်ထုပ်များ"** LIT (`expo.title`; the shared cap: bg `#a65f10`, ink `#fffdf8`, inset
  sheen, `0 0 14px -6px --glow-gold`, `globals.css:8986-8994`) · "ဖွင့်ထားတဲ့ တောင်းဆိုချက်များ"
  (`table.appr.open` `:551`) · "ဒီနေ့ ရငွေ" (`reg.day.title` `:1906`) · "ဒီနေ့ ငွေရှင်းတာနဲ့ ပြန်အမ်းတာများ"
  (`floor.settled.head` `:1235-1238`). The chips are the zones this render drew (`page.tsx:254-265`).
- **y 129–381 · the tail of zone 2** (scrolled: the floor list's last row, three `.card.card-textured`
  table cards 338px wide at x 163 / 513 / 863, their tops under the strip — draw their lower ~250px:
  "စားပွဲ 3" with "ချက်နေဆဲ" and "$27.00 · ယခုအထိ · ပစ္စည်း ၂ ခု", "စားပွဲ 4" "ငွေရှင်းပြီး", "စားပွဲ 7"
  "မီးဖိုချောင် ပြီးပြီ" — the as-built floor card idiom from picked-m7-1, no new strings).
- **y 405–449 · ZONE 3 HEAD ROW** (`.staff-zone` margin-top 24; `headRow` flex space-between, baseline,
  wrap): left the h2 `#expo-h` "ပါဆယ်ထုပ်များ" Fraunces 17px 700 `#1b1714` (`.staff-zone-head`,
  `globals.css:11950-11956`; `tabIndex={-1}`); the sr-only `role="status"`; the count line
  `.expo-status` 13px `#6e6358`: "စောင့်နေတဲ့ ပါဆယ်ထုပ် ၃ ခု · ငွေ မရှင်းရသေး ၁ ခု"; right end x 1203: **THE
  DOOR** — a 44px paper pill (`.staff-back` recipe: bg `#fffdf8`, 1px `--bd`, radius 999, inset sheen,
  13px 700 `#1b1714`, padding 0 16; a `<Link>` to `?floor=1&stage=bags`): an expand glyph 18px (four
  corner arrows, aria-hidden) + "Fill the screen →". English only (no shipped Burmese; DECISIONS 11).
- **y 461–~800 · THE LANE at zone sizes** (`grid: repeat(auto-fill, minmax(min(100%,320px),1fr))`,
  `ExpoBoard.tsx:1912-1919` → three 338px columns at 1040; the SAME card anatomy at the zone fallbacks):
  - x 163–501 **Table 7** — wearing the ring: a 4px halo `rgba(166,95,16,0.3)` outside the card
    (`floorCardPulse` mid-flight, `globals.css:4227-4236`). Header (`data-tone="warn"` `#f6e9e4`):
    "စားပွဲ 7" 21px Padauk 700 (`--fs-h2`); reserved slot (invisible in the zone — drawn as nothing);
    right: bag glyph 16px + "ပါဆယ်" 13px 700 `#1b1714` · "12:40" 17px 800 tabular. Stage line 16px 800
    `#1b1714`: ✓ "မီးဖိုချောင် ပြီးပြီ". Lines: "2×" `#8f5009` 800 · "မုန့်ဟင်းခါး" 16px Padauk 700 /
    "Mohinga" 16px 800; "1×" · "လက်ဖက်သုပ်" / "Tea leaf salad" / "no peanuts" 16px 600 `#1b1714`. Slot
    64px accent (`#a65f10`, ink `#fffdf8`): "ထုပ်ပြီး၊ ယူလို့ရပြီ" 13px Padauk 700 / "Bagged & ready"
    13px 600 (the zone keeps `--fs-sm` on the slot).
  - x 513–851 **Aye #K7M2** — header (card face): "Aye" 21px 800 + "#K7M2" 13px 700 `#6e6358`; bag +
    "ပါဆယ်" · "4:05"; stage line: ◉ "ရောက်နေပြီ" · ✓ "အဆင်သင့်"; "လာယူချိန် 6:30 PM" 16px `#6e6358`;
    phone row 44px "(626) 555-0147"; line "1×" "ကြက်သားဟင်း / Chicken curry"; slot paper "ယူသွားပြီ /
    Picked up".
  - x 863–1203 **Walk-up (unpaid)** — "လမ်းလျှောက်လာ" 21px Padauk 700; bag + "ပါဆယ်" · "6:48"; stage
    line ✓ "မီးဖိုချောင် ပြီးပြီ"; the warn badge (`Badge tone="warn" bordered`: `#a44b34` on `#f6e9e4`,
    receipt glyph 14px) "ငွေ မရှင်းရသေး — လာယူချိန် ငွေ လက်ခံ" 13px 700; line "1×" "ကြက်သားဟင်း / Chicken
    curry"; "နောက်ထပ် ၂ ခု မပို့ရသေး" 16px `#6e6358`; the xl primary Link "ငွေ လက်ခံ / Take payment"
    (the `.ui-btn-primary` pill, 52px, gradient `#a65f10 → #8f5009`, `buttonClass({size:"xl"})`).
- **y ~824–848 · ZONE 4 HEAD** peeking: "ဖွင့်ထားတဲ့ တောင်းဆိုချက်များ" 17px Fraunces 700 (`table.appr.open`);
  the frame ends on the ruled ground beneath it (the rails' content is not this moment's).

The two taps the screen explains: INTO the stage = the head-row door (one tap from the lane, where Dad
is when a bag rings; from the top of the page the strip chip jumps to the lane first); BACK = the stage
bar's "← ကောင်တာ / ← Counter" (screen 1), one tap, the page re-expanding in place, the bell never
remounted. The sound chip lives in the greeting row at the top of this page (`page.tsx:180-188`), scrolled
above the strip here; the ring on Table 7 is the bell's visible half (`CounterBell.tsx:66-68`).

COPY (English):

- Screens · Counter & tables · Owner · Live · Approvals · Help · Lock
- Sections of this screen (nav name)
- Start an order · Tables & counter orders · Takeaway bags · Open requests · Today’s takings ·
  Today’s payments & refunds (the chips' English, spoken under `en`; Burmese-only under `my`)
- 3 bags waiting · 1 unpaid
- Fill the screen → (NEW — the door)
- Table 7 · 12:40 · To-go · Kitchen done · Mohinga · Tea leaf salad · no peanuts · Bagged & ready
- Aye #K7M2 · 4:05 · Here now · Ready · Pickup 6:30 PM · (626) 555-0147 · Chicken curry · Picked up
- Walk-up · 6:48 · Unpaid — collect at pickup · 2 more not sent yet · Take payment
- Table 3 · Cooking · Table 4 · Paid (the floor cards' tails)

COPY (Burmese) — shipped unless flagged:

- စခရင်များ — `shell.screens` `:48` · ကောင်တာနဲ့ စားပွဲများ — `floor.door.counter` `:1160` · အသစ်တက်နေ `:3233`
- ဒီစခရင်ရဲ့ အပိုင်းများ — `floor.a11y.zones` `:1179`
- အော်ဒါ ဖွင့် `:429` · စားပွဲများနဲ့ ကောင်တာ အော်ဒါများ `:1194` · ပါဆယ်ထုပ်များ `:1034` · ဖွင့်ထားတဲ့
  တောင်းဆိုချက်များ `:551` · ဒီနေ့ ရငွေ `:1906` · ဒီနေ့ ငွေရှင်းတာနဲ့ ပြန်အမ်းတာများ `:1235-1238`
- စောင့်နေတဲ့ ပါဆယ်ထုပ် ၃ ခု `:1037` · ငွေ မရှင်းရသေး ၁ ခု `:3956`
- "Fill the screen →" — **NO Burmese rendered.** K15 DRAFT for the record only, flagged, not on the
  artboard: "စခရင် အပြည့် ဖွင့်" (grounded: စခရင် `shell.screens`, ဖွင့် `floor.zone.start`; အပြည့် is
  fresh — a native check decides).
- The lane cards: as screens 1–2 (`floor.table`, `expo.dest.togo`, `expo.kitchenDone`, `expo.tag.here`,
  `expo.tag.ready`, `expo.pickup`, `expo.verb.bagged`, `expo.verb.pickedUp`, `reg.row.walkup`,
  `settle.unpaid`, `expo.unpaid.more.many`, `expo.verb.takePayment`).
- The floor cards' tails: ချက်နေဆဲ — `kds.line.cooking` `:238` · ငွေရှင်းပြီး — `floor.status.paid` `:469` ·
  မီးဖိုချောင် ပြီးပြီ `:1041`; the "ယခုအထိ · ပစ္စည်း ၂ ခု" running-total line as drawn in picked-m7-1
  (shipped floor copy, not this moment's).

A11Y:

- The bar's h1 names the page; the strip is a `<nav>` of native anchors (`CounterZoneStrip.tsx:109-120`)
  with `aria-current="location"` on the lane's chip; the lane section is `aria-labelledby="expo-h"` and
  its heading takes focus on a hash arrival (`useZoneFocus`, `ZoneFocus.tsx:18-28`).
- The door is a `<Link>` with a visible name ("Fill the screen →"), 44px, the arrow inside the label like
  every staff back/forward label; after it opens the stage, focus lands on `h2#expo-h`; "← Counter"
  returns focus to this door.
- ONE live region in the zone: the lane's `role="status"`, deduped against the floor's as built
  (`announced`, `ExpoBoard.tsx:1060-1077`) — the stage bypass applies only inside the stage.
- The pulse ring is decorative (`aria-hidden`), `animation: none` under reduced motion
  (`globals.css:4262-4266`); the bell's sound is never the only feedback (the stage line's new fact and
  the region's count sentence are the other halves).
- Contrast (light ladder): `#1b1714` / `#6e6358` on `#fffdf8` / `#f2efe7` / `#f6e9e4` clear AA; the lit
  chip `#fffdf8` on `#a65f10` 5.9:1; the warn badge `#a44b34` on `#f6e9e4` ≈ 5.5:1.

---

## DECISIONS

1. **Stage of the counter home, not a route** — the bell keeps ringing because `CounterBellProvider`
   never unmounts (`page.tsx:351-357`; 5c, `CounterBell.tsx:46-58`); D2 and the judges' pick.
2. **A's card on C's shelf** — one stage line from `laneStageFacts`, the destination hoisted once via
   `bagDestination`, `--fs-xs` gone from every decision-bearing element; the judges' graft, applied to the
   zone too since it is one component (the zone at `--fs-*` fallbacks).
3. **The keyed count line replaces the 96px glance strip** — the uprights already carry the Here now and
   Cooking counts (graft); the shelf gets its row back.
4. **The sound chip moves into the stage's head row** — C's reason (a paused bell never invisible) kept
   without C's strip; the greeting row that holds it today (`page.tsx:184`) is folded with the zones.
5. **Pinned pick** — `pinLaneRows`, pure, red-first (B's rule, the one thing B reasoned better); position
   is kept, counts stay facts.
6. **Station columns: 3 at s, 2 at m/l — not the KDS's 4/3** (`globals.css:12111-12116`,
   `KDS_WIDE_MIN_PX` `kds-size.ts:48`): a bag card carries a 64px verb, a two-tongue dish line and a
   bilingual call-out; at 4-across (325px) "လမ်းလျှောက်လာ" at 32px and a modifier line wrap; the brief's
   screen 2 is two columns. The shared Help sheet therefore quotes the px alone for the station (the
   px-only branch, `HelpButton.tsx:800-802`), never "{n} across" — no promise the station does not keep.
7. **Night is a station dial, scoped to `.station-root`** — `mms.station.theme` (light · dark · follow by
   removal), the KDS root pattern (`KdsBoard.tsx:1685`); the sheet gets `sheetClassName="dark"`
   (`HelpButton.tsx:66`; `KdsLineMenu.tsx:84`); the Toast needs nothing (rendered in place,
   `toast.tsx:119`). "Follow this tablet" is the first segment and the default (B names it best; C's
   default) — a tablet that never visits the sheet changes nothing.
8. **The theme row is English-only** — no shipped Burmese for Screen / Follow this tablet / Light / Night
   (grep: none); drafts flagged, not rendered (A's refusal, the K15 rule).
9. **A fully refunded card keeps its stage line when the kitchen is done** — P2dn
   (DECISIONS_2026-10-18.md:1026): a refund does not void cart lines (`refunded-cart.ts` docblock), so
   `kitchenStateOf` still says `done` (`expo-rules.ts:40-51`); A's "no stage line on a refunded card" was
   true only for a fully voided cart (`:47-49`). Screen 2's refunded example is a basket (never Kitchen
   done) so no stage line draws there for a true reason.
10. **The refunded sentence is the lane's own key** — `table.detail.paidKitchen.refunded` on the lane and
    the table page, `kds.ticket.refunded` on the KDS, never the same string
    (DECISIONS_2026-10-18.md:169-175, 200-203); J62: a tag, the controls kept (`:773-791`).
11. **ONE door into the stage: the lane's head-row Link** (C's zone-head Link, kept per the graft);
    "Fill the screen →" is English-only (no shipped Burmese; draft flagged). The strip chip stays a native
    anchor (one name per thing, K40). `/staff/expo` redirects to the stage (a second tablet's bookmark).
12. **No claim that Lock returns to the stage** — `LockButton` goes to `/staff/lock` (`LockButton.tsx`
    `router.replace("/staff/lock")`) and the lock page sends an unlocked tablet to `/staff`
    (`app/staff/lock/page.tsx:27`), i.e. the counter home; the stage is one tap away again. The brief's
    "returns to this exact screen (B14)" is dropped — B14 in the record is a Help-door row (OPEN-ITEMS
    M270 (4)), not a lock rule.
13. **The K49 ② slot is reserved in the header and renders nothing** — a dashed, unlabeled 48×44 outline
    on the artboards only; no ⋯, no row (a control that leads nowhere is §16's dead control; the RPC,
    CHECK and stop record wait on sign-off, DECISIONS_2026-10-18.md:102).
14. **The stage speaks its own frozen sentence** — the floor's region is `inert`/hidden in the stage, so
    the dedupe that silences the lane when the floor is `not_updating` (`ExpoBoard.tsx:1060-1063`) is
    bypassed there, red-first (the judges' re-proof).
15. **Dots stay, masked** — `.card-textured` for parity with every staff card (`KdsBoard.tsx:2504`); the
    cores are cut out behind the stage line, the lines and the refunded line and the Night `--warn`
    mark / `--tx` word are pinned in `composite-contrast.test.ts` (P2db).
16. **Night `--warn` words are `--tx`, the mark `--warn`** (P2bm, OPEN-ITEMS:205): the money badge, the
    refunded line, the per-line refunded tag; light keeps the as-built `--warn` ink.
17. **K40 stays the owner's native round** — "Takeaway bags" / ပါဆယ်ထုပ်များ unchanged on every surface; the
    proposal "To-go bags" (the Burmese is already one word, ပါဆယ်) is recorded, not drawn.
18. **The count line in the station echoes inline** (`echo="inline"`), the chips never do, the slot
    stacks — the echo policy's three classes, as built.
19. **Delight is the one rung card's ring and the lit cap on a pick** — nothing on a first read, nothing
    inside the Undo window (the pill only drains).

## OPEN RISKS

- **Effort is L (judges):** `app/staff/page.tsx` + `CounterSplit` surgery (a client stage toggling
  `hidden`/`inert` on server-rendered zones, a second `StaffBar` instance while the first is hidden), the
  mint lock and the pane under the stage (a pane open at split width when the stage opens: close it
  first, or refuse the door while a pane is open — undecided; the spec prefers closing it with
  `paneHistoryOp`).
- **`inert` support:** Safari ≥ 15.5; the fallback (`display: none` + `aria-hidden`) must be measured
  on the real tablet (the device sitting, #12).
- **Two h1s in the DOM** while the stage is open (the server bar hidden, the stage bar live) — `hidden`
  removes the first from the a11y tree; the headless check must assert exactly one visible h1.
- **The dedupe bypass** (DECISIONS 14) is asserted only by a new test; the floor's `useLiveBoardState`
  still reports under `inert`, so a floor freeze and a lane freeze inside the stage must produce ONE
  sentence — measured, not assumed.
- **P2db mask unmeasured** — the mask cut behind text blocks is a design call pending
  `composite-contrast.test.ts`'s assertion; if the model disagrees, thin `--tex-dot` on the station
  instead.
- **Pill over the last row:** the shelf's bottom padding (96px) keeps the last slot clear only when
  scrolled to the end; mid-scroll the pill floats over cards as the zone does today.
- **Three English-only controls on a Burmese-first staff screen** ("Fill the screen →", the theme row's
  four words) until K15; the drafts are flagged, never machine-invented.
- **From the top of the counter home the stage is two taps** (strip chip, then the door); a trailing door
  on the sticky strip would make it one but duplicates the door — offered to the owner, not drawn.
- **A pinned card under a tier head it no longer matches** (≤ 6 s + the write): the upright's count is
  a fact count, so the number and the cards beneath can differ by one for that window.
- **Unlock lands on the counter home, not the stage** (DECISIONS 12) — acceptable, but the owner may want
  the stage remembered per device like the door (`readStaffDoor`), a small follow-up.
- **The Help sheet's size view quotes px only for the station** — if the owner wants "{n} across" on the
  station too, the station needs its own across rule and key.
- **Owner-gated, unchanged:** K49 ② (sign-off + migrations), K40 (the word), K15 (every draft), P2du (a
  console-wide bell — the stage neither needs nor pre-empts it).

---

## Appendix — what changed after this spec (applied in the drawn screens)

The spec above was written first. Two later passes changed it, and the screens on the canvas were drawn
with both applied. **Where an item below contradicts the spec above, the item below wins.**

### A · System amendments (the cross-moment consistency pass)

**The shared vocabulary (every moment takes it):** ONE VOICE, TWO REGISTERS; ONE SET OF MARKS (the 2026-10-07 vocabulary, PATH_DESIGN_2026-10-07.md:74-135, extended — never paralleled). DINER (m13–m16, guided, English leading; D5's "မင်္ဂလာပါ · Good evening" is the one Burmese-first line): each screen says NOW once as its heading; then ONE actor-first next-step sentence with no label — when the hero is DOCKED its one line slot carries that sentence (live) or the hero's held reason (held), never both and never a third line ("Ready to pay." is neither); the Order · Pay rail (+ /track's status path) is the only step vocabulary, so no dots, rings or "n of m" marks appear beside it; a shared cart never shows a count; inside any window the words are future/-ing, past tense only after a confirmed write; a link's Burmese rides inline after the English (margin, never a whitespace flex child), stacking inside the same ≥44px target only when it does not fit; back links are the shipped `.nav-link` (14px 700 `--ac`, arrow aria-hidden) with Burmese ≥13px. STAFF (m17–m20, glanceable, Burmese first, English echo stacked on headings/slots, inline on count lines, NEVER on a 44px chip): the next step lives in the control's own words; counts in prose render Burmese numerals under `my` (`fill.ts` `{n}`), standalone figures (clocks, money, codes, table numbers, the KDS stat row) stay Latin; every refusal is keyed by code and twinned in `OUTAGE_TWINS`. SHARED MARKS: lit-gold cap (`--ac` fill, `--oa` ink, sheen + gold halo; `.checkout-pill-on` on phones, the `.kds-chip[aria-pressed]`/`.staff-seg` rule on the console) = chosen or you-are-here, never a recommendation, never a status; solid ✓ disc in `--ok` = done (a diner line answered, PAID on a settled row); half disc (left `--warn`, right paper) = partly returned; full `--warn` disc = returned in full; HOLLOW RING = "Not sent yet · မပို့ရသေး" and nothing else (`--t2` on phones, `--warn` on the console) — no eyebrow dot, no refund state, no inert control may use it; DASHED `--ac` edge on `--sf` = provisional, which on every surface here means the open Undo window (the diner's `.arrival-undo`/`.checkout-undo`, the console's `.clear-undo`/`undoBtn`): the SAME node that committed relabels "Undo" + the D3 Burmese (ပြန်ဖျက် when a mark you made is erased, ပြန်ယူ when something sent comes back), arms after the same-gesture guard (350 ms phones / 400 ms console), writes at `PICKED_UNDO_MS` named once per consumer (`FEEDBACK_UNDO_MS`, `TEAM_UNDO_MS`, `ARRIVAL_UNDO_MS` = 6 000), the seconds an aria-hidden leaf in the register's shipped shape (diner " — 6s", staff "· 6s"), the KDS cream pill its one shipped exception, Esc never an Undo unless every window has it; HELD/INERT CONTROL = the real control at its real shape, `aria-disabled` (never native) with the reason in its name or `aria-describedby`, dimmed by the shipped rule (`.ui-btn` .55, `.checkout-pill` .65, `.staff-btn` .6) — never a dashed ghost, never a hollow ring; BUSY = `aria-busy` with the label KEPT (on a `.staff-btn` plus the .6 dim — D8; on an `@mms/ui .ui-btn` the full-ink spinner plus a stated word like "Refunding…"), never "…", never native disabled, and busy marks only the ONE control that is writing (the zone's fact is `aria-disabled`); WARN = a 6px `--warn` disc (the one warn mark; no squares, no second glyph) beside a word — light: the word in `--warn` (the console's shipped `.entry-msg-warn`/`Badge warn` pair); Night: the word in `--tx`, only the mark in `--warn` (P2bm) — a warn GROUND fill only on a Late ticket/bag, the floor's one ask tile and the money-in-doubt badge; GREEN = done and settled, calm (never counted, never pulsing, filled only where it just landed: the picked header, the ✓ disc); GOLD TINT = the till (money taken/owed/waived) and the brand mark, never an alarm; a REMOVING verb (Deactivate, Mark sold out) is a paper pill with `--warn` ink, a RESTORING verb (Reactivate, Put back) a paper pill with `--ok` ink — no tinted fills on routine verbs so nothing shouts during normal service; CHEVRON › = opens/collapsed, ⌄ = expanded, inside the row button; one dismiss word "Close · ပိတ်", one cancel word "Cancel · မလုပ်တော့(ပါ)", one search field recipe on the console (the pad's 48px `--sf` radius-12 field + the 44px `pad.search.clear` circle); ONE live region per view, the count/kicker/hint/next-step lines all static; the receipt code is ONE glyph string on both sides of the counter ("#A1B2C3" on the guest's slip and on Dad's desk); the ONE KITCHEN TRACK's stamps (ပို့ပြီး · ချက်နေဆဲ · ထုတ်ပြီး) are the words for the kitchen's state on every surface that shows it. LOUDNESS LADDER (console): ALARM may tint and move — KDS Late, a late bag, money in doubt (the stranded charge, the unpaid badge) said once in the view's one region; CALL — one filled tile per room (the guest asking to pay, the rung lane card's one-shot ring); MARK — glyph + word, no fill, no motion (refund shapes, the dated since-clock, the not-sent ring, dashed pending, the stale disc); CALM — done, paid, picked up, put back. No fact is marked twice on one screen; delight is one moment per pass, never on a first read or inside a window; glass is Night-only, the bar alone.

**This moment's amendments:**

1. The stage fact for `kitchen === "done"` must speak the ONE KITCHEN TRACK's third stamp that the guest's phone and the settled card show ("Served · ထုတ်ပြီး", `DINER_STAGE_WORD.served` / `lib/kitchen-track.ts`, PATH_DESIGN:500-509 "one key per stamp … identical everywhere") — either the lane adopts the track's word + ✓ glyph for that fact, or DECISIONS records why the lane keeps `expo.kitchenDone` ("Kitchen done · မီးဖိုချောင် ပြီးပြီ") for the same fact Dad and the guest compare across the counter. Verify against `kitchenStateOf` before choosing; do not keep two words for one state silently.
2. Inside the pick window the lane's words are past tense ("ယူသွားပြီ — ပြန်ဖျက်မလား / Picked up — undo?", "Table 11 picked up") against the register's rule (future/-ing inside a window, PATH_DESIGN:80-81); both are shipped keys (`expo.picked.pending`, `expo.toast.pickedTable`), so no re-word here — add them to OPEN RISKS and the K15 · native-sitting ledger under D3 (c) ("any re-word of shipped copy that names these acts goes to the native sitting").
3. Name the ONE Undo in the stage: the pinned card's dashed `undoBtn` slot IS the Undo form; the xl thumb pill is the lane's shipped second control for the same act ("No fact is marked twice on one screen", PATH_DESIGN:128). State which is primary in the stage and why the pill stays (thumb reach across 2–3 columns) or drop its action to a drain + sentence (`live={false}` already) — a decision, not an omission.
4. Say the slot's dashed edge is the shipped `undoBtn` declaration (`expo-stage.ts:11-31`, 1px) and that no `.station-*` rule re-declares a dash width or weight (the `check:style-literals` ratchet; the form's 1.5px is `.arrival-undo`/`.clear-undo`'s own).
5. Warn words: light keeps the shipped `--warn` ink (badge, refunded line), Night the P2bm split — already so; add that the Night `--warn` mark/`--tx` word pair on the dotted face is the SAME pair m17 and m20 use, pinned once in `composite-contrast.test.ts` (P2db) rather than per moment.

### B · The adversarial critic's blocking fixes (verdict: fix)

1. **The stage's geometry contradicts CounterSplit at tablet width. The spec keeps the stage inside CounterSplit's main column and draws it full-bleed (x 14–1352). Screen 3 claims the plain 1080px centred column. At 1366px both are false.**
   - Evidence: Spec lines 15-18 ('CounterSplit's main column stays mounted', lane wrapped in .station-root inside it) and 174-175 (three 438px columns, x 14–1352). Screen 3, spec 434-436: 'No table pane is open, so the column is .staff-split's plain max-width: 67.5rem (1080px)… x 143–1223', with three 338px lane columns. Code: globals.css:16895-16903 makes `.staff-split` ALWAYS a grid at ≥64em: `minmax(0,1fr) var(--w-staff-pane)` with the pane shown. lib/floor-pane.ts:24-25 says 'The pane column is ALWAYS there from here (the empty state)'. `--w-staff-pane: clamp(22rem,34vw,34rem)` (globals.css:16849) is about 464px at 1366. So `.staff-split-main` is about 838px wide, the lane fits 2 columns rather than 3, and the pane's 'Pick a table' empty state is on screen in screen 3. Inside that column the station cannot be 1338px wide.
   - Fix: Specify how the stage leaves the split. For example, `.staff-split[data-stage="bags"]` drops the pane column and lifts max-width, or `.station-root` is laid out at viewport width. Name the CSS and state what happens to the idle pane. Redraw screen 3 with the always-present pane column and the lane at the real 1fr width (2 columns).
2. **'Take payment' inside the stage opens the counter's pane, not the table page. The spec asserts the opposite, and its OPEN RISKS leaves the stage-versus-pane interaction undecided. That leaves the one money action on the lane with undefined behaviour.**
   - Evidence: Spec 351-353: 'off the counter column `useTablePane()` is null, so it navigates to the table page, :1811-1813'. The stage keeps the lane inside CounterSplit, which provides the context (CounterSplit.tsx:345 `<TablePaneContext.Provider value={api}>`). ExpoBoard.tsx:1689 reads `const pane = useTablePane()`. At 1366, `PANE_QUERY` '(min-width: 48em)' matches (floor-pane.ts:23), so the click calls `pane?.openSession(bag.sessionId,…,{settle: owes})` (ExpoBoard.tsx:1799-1817), opening the pane beside or behind a full-height stage. OPEN RISKS, spec 609-611: 'close it first, or refuse the door while a pane is open — undecided'.
   - Fix: Decide and draw it. Either (a) Take payment in the stage closes the stage and opens the pane on settle, with focus moved there, or (b) the stage passes a paneless flag so the Link navigates to `/staff/table/{id}?settle=1`. Also decide what the door does while a pane is already open. Correct the false 'useTablePane() is null' claim.
3. **Inside the stage the bell can ring for an event that has no visible half on screen. A table asking to pay at the counter rings the guest phrase from the hidden floor board, and nothing in the stage shows it. Sound becomes the only feedback.**
   - Evidence: Spec 19-20 and DECISIONS 1 present 'the bell keeps ringing' as the feature, yet fold `#floor-zone` under `hidden`/`inert` (spec 15-17). FloorBoard.tsx:142 `useCounterAttention(() => floorFacts(initial.tables))`. counter-attention.ts:53-59: a table with `status === "counter"` is a guest ring. CounterBell.tsx:65-68: 'Sound is never the only feedback (§15)… So the bell is silent while that half is off screen'. CounterBell.tsx:119-133: the existing cover probe silences rings when the pane covers the column. The spec adds no cover and no visible half for floor rings.
   - Fix: Choose one. (a) Put the floor's ask into the stage as the room's one CALL tile, using shipped keys (e.g. a 'Table N' ask row linking back), so the ring has its visible half. (b) Silence floor-kind rings while the stage is open. Note that `cover()` is all-or-nothing today (CounterBell.tsx:133), so (b) needs a per-kind cover, and that must be stated as new work with a red-first test.
4. **A second StaffBar breaks the single `--staff-bar-h` publisher, and the spec hardcodes 68px where the house reads the measured variable.**
   - Evidence: StaffBarNet.tsx:26-29: 'THE ONE PUBLISHER of `--staff-bar-h`… Everything else that needs the bar's height READS it'. StaffBarNet.tsx:36-50: every StaffBar mounts it. A ResizeObserver on the now-`hidden` server bar publishes 0px, and the stage bar's unmount calls `removeProperty("--staff-bar-h")` while the counter bar is still live. Spec 68-69 says uprights are 'sticky; top: 68px… the zone strip's own idiom (globals.css:11994-11997)', and spec 117 says `scroll-padding-top: 68px`. The strip actually reads `top: var(--staff-bar-h, 76px)` (globals.css:11996), and the bar grows when StaffBarUpdate or ReaderCollectChip rows mount (StaffBar.tsx:163-169), which would put the uprights and focused controls under the bar (WCAG 2.4.11; lib/scroll-padding-contract.test.ts).
   - Fix: Specify one publisher while the stage is open: the stage bar publishes, and the hidden bar's StaffBarNet is suspended or does not observe while hidden, with the property restored on close. The uprights' sticky top and scroll-padding must read `var(--staff-bar-h)`, never 68px.
5. **The stage has more than one live region, while the spec claims 'The lane's role=status… is the stage's only region'.**
   - Evidence: Spec 111 and 280. The sound chip the spec moves into the head row (spec 105-110) mounts `<p role="alert">` with floor.sound.refused (CounterBell.tsx:310-313). The stage renders its own StaffBar, which mounts StaffBarUpdate's `role="alert"` lines (StaffBarUpdate.tsx:220, 247) and ReaderCollectChip's sr-only `role="alert"` (ReaderCollectChip.tsx:226). The spec also calls the lane region 'sr-only', but it renders `err`/`notice` visibly (ExpoBoard.tsx:1116-1134).
   - Fix: List the regions honestly. Route the sound refusal through the lane's one region, or cite the house's transient-refusal exception with file:line and say why it is not a second region. State that the hidden bar's copies leave the a11y tree. Fix the 'sr-only' description.
6. **'Kitchen done' and 'Ready' share one ✓ glyph, which restores the exact visual collision a blind pass removed. The ✓ is also drawn in `--tx`, not as the vocabulary's ✓ disc in `--ok`.**
   - Evidence: Spec 190-192 and 208: ✓ before 'မီးဖိုချောင် ပြီးပြီ' AND ✓ before 'အဆင်သင့် / Ready'. Spec 79-80 also draws each fact at '--kfs-mod 800 --tx'. ExpoBoard.tsx:1494-1496: 'two facts a bagger acts on differently (the wok is done → bag it · the bag is done → hand it over) do not share one visual token (blind pass)'. vocab.md: 'solid ✓ disc in `--ok` = done'.
   - Fix: Give the two facts distinct marks: the kitchen track's own served stamp for the kitchen fact (see the amendment 1 finding) and a different glyph and word for the bag's Ready stage. Draw the done mark as the shared ✓ disc.
7. **System amendment 1 is not applied. The lane keeps `expo.kitchenDone` ('Kitchen done · မီးဖိုချောင် ပြီးပြီ') for the state the guest's phone and the settled card call 'Served · ထုတ်ပြီး', and no DECISION records why.**
   - Evidence: amend.md m19 §1 requires the lane either to adopt `DINER_STAGE_WORD.served` / the track's third stamp or to record in DECISIONS why it keeps `expo.kitchenDone`. Spec 77-79, 263 and DECISIONS 1-19 use `expo.kitchenDone` silently. staff.ts:3152 `table.line.state.served` = 'Served' / 'ထုတ်ပြီး'. line-state-copy.test.ts:31 pins `DINER_STAGE_WORD.served.my` to it. kitchen-track.ts:90-91 has the same settle rule that `kitchenStateOf` uses (expo-rules.ts:40-51).
   - Fix: Add a DECISION. Either the stage line speaks 'ထုတ်ပြီး · Served' with the track glyph, or record why the lane keeps 'Kitchen done', verified against `kitchenStateOf`'s settle rule. Never leave two words for one state unstated.
8. **System amendment 3 is not applied. During a pick window, one fact is shown four times (stage line 'Picked up — undo?', the picked header tone, the dashed Undo slot, the xl pill 'Table 11 picked up · Undo'), and two controls do the same Undo, with no decision on which is primary.**
   - Evidence: Spec 325-334 (Card D) and 374-380 (pill). amend.md m19 §3: 'State which is primary in the stage and why the pill stays… or drop its action… a decision, not an omission'. PATH_DESIGN_2026-10-07.md:128 'No fact is marked twice on one screen'. DECISIONS 19 mentions only that 'the pill only drains'.
   - Fix: Add a DECISION naming the in-slot dashed `undoBtn` as THE Undo form. Keep the pill on the thumb-reach reason across 2–3 columns, or reduce it to drain plus sentence. Drop the duplicate stage-line wording or the header tone so the fact is marked once.
9. **System amendments 2, 4 and 5 are not applied.**
   - Evidence: amend.md m19 §2: the past-tense window words `expo.picked.pending` (staff.ts:1086) and `expo.toast.pickedTable` (:3245) must go into OPEN RISKS and the K15 native-sitting ledger under D3 (c); spec OPEN RISKS (605-635) has no such entry. §4: say the slot's dash is the shipped `undoBtn` declaration (expo-stage.ts:26-31; 1px from `bumpBtn` :14) and that no `.station-*` rule re-declares a dash width or weight (check:style-literals); the spec is silent. §5: say the Night `--warn` mark and `--tx` word pair on the dotted face is the SAME pair m17 and m20 use, pinned ONCE in composite-contrast.test.ts. DECISIONS 15-16 pin it per moment only.
   - Fix: Add the OPEN RISKS and ledger entry for the two past-tense keys, the dash-provenance sentence and its ratchet note, and the 'pinned once, shared with m17/m20' statement.
10. **Claim the code cannot keep: 'the station passes the px-only branch (HelpButton.tsx:800-802)'. No such prop exists. The branch is picked by viewport width, so at 1366 the shared size view would say '{n} across' using the KDS's page sizes while the station draws 3 and 2 columns.**

- Evidence: HelpButton.tsx:199 `const wide = useMediaQuery(`(min-width: ${KDS_WIDE_MIN_PX}px)`)`. HelpButton.tsx:793-801: `wide ? help.size.across {n: kdsPageSize(sz)/2} : pxLabel`. `KDS_WIDE_MIN_PX = 1200` (kds-size.ts:48). The tablet is 1366px. Spec 42 and DECISIONS 6 (spec 559-563) promise 'never "{n} across"'.
- Fix: Name the new prop (e.g. `size.across?: false`, or a station flag) as new work with a test proving the station's size rows show px only at ≥1200px.

11. **The allergy channel is left at phone size on an arm's-length station. The kitchen note (`line.notes`, the ⚠ band) is not in the `--kfs-*` mapping, so at Large it renders at 16px beside 38px dishes. The spec also mislabels a modifier as the allergy-critical line.**

- Evidence: Spec 22-33 lists every style constant moved to `--kfs-*`; `.expo-note` is absent. globals.css:9451-9461 `.expo-note { font-size: var(--fs-body) … border-left: 3px solid var(--warn) }`. ExpoBoard.tsx:1871-1879 renders TicketNote on every bag line that has notes. TicketText.tsx:134-135: 'a line's KITCHEN NOTE, the allergy channel'. Spec 198 calls the modifier 'no peanuts' 'allergy-critical', and no card draws a note.
- Fix: Map `.station-root .expo-note` to `var(--kfs-mod)` (full ink, warn rule kept) and draw one card with a kitchen note at s and l.

12. **Quantities are drawn at 15px and 19px while citing `.kds-qty`, whose shipped size is `--kfs-item` (28px at s, 36px at l). A 15px '2×' at arm's length is how one bowl goes out instead of two.**

- Evidence: Spec 195 ('.kds-qty 44×44 ring filled… "2×" 15px 800') and 320 ('"2×" 19px 800'). globals.css:9261-9275: `.kds-qty { … font-size: var(--kfs-item); border-radius: 10px; box-shadow: inset 0 0 0 2px var(--bd) }`. It is a rounded square, not a ring.
- Fix: Draw quantities at `--kfs-item` (28/32/36) in the shipped rounded-square shape, and correct the 'ring' wording.

13. **The shelf's list semantics are unspecified and break with the uprights. The lane is ONE `role=list` StaggerList, and an `<h3>` cannot be its child. Splitting it into one list per tier leaves the unlabelled middle tier as a list with no heading or name.**

- Evidence: ExpoBoard.tsx:1234-1240: a single `StaggerList` with `ariaLabel={sx(lang,"expo.a11y.bags")}`. Spec 168-175 has 'UPRIGHT 1 (<h3>…)' then 'THE SHELF, tier 1 (ul role=list named… Bags waiting…)'. Spec 217: 'tier 2 (no upright: the middle tier earns no label): a new grid row'. Spec 278: 'the two uprights are <h3>s inside it'.
- Fix: State the structure. Either one list per tier, each `aria-labelledby` its upright with the middle tier given a name, or one list with uprights as non-list headings outside list items (e.g. tier groups as `<li>` with nested lists). Draw how the empty column beside a short tier reads.

14. **`pinLaneRows` keeps an INDEX, but the tiered layout moves a pinned card on screen anyway, so the promise that it 'does not move' fails.**

- Evidence: Spec 63-67 and 333-334: 'when the next poll lands a Here-now bag above it, this card does not move'. In screen 2 no upright is drawn because tier 1 is empty (spec 305-306). A Here-now bag landing creates the 'Here now' upright (44px + 12px, spec 168-172) and a new tier-1 grid row above Card D, so D shifts down and its 64px Undo slot leaves the thumb, even with its index held. Spec 72 also lets a pinned card sit under a tier head it no longer matches.
- Fix: Pin the layout, not only the index. While any pick is held, freeze tier-head insertion and row breaks (or reserve the upright's space), and extend the red-first test to assert the slot's on-screen position.

15. **Warn mark: the money badge and the refunded line use a receipt glyph in `--warn` as the warn mark, against the shared vocabulary's single warn mark.**

- Evidence: Spec 345-346 ('receipt glyph 22px #e0855f'), 362 ('receipt glyph 24px #e0855f') and 485-486 (light badge, 'receipt glyph 14px'). vocab.md: 'WARN = a 6px `--warn` disc (the one warn mark; no squares, no second glyph) beside a word'.
- Fix: Use the 6px `--warn` disc as the mark, keeping the receipt glyph in `--tx`/`--t2` as plain iconography if needed. Or record a DECISION citing where the vocabulary allows it.

16. **Wrong citations and wrong code claims, each a finding under the round's rule.**

- Evidence: app/staff/lock/page.tsx:27 is a comment; the redirect is :36. Toast is at ExpoBoard.tsx:1267, not :1265. headRow is at :1905-1911, not :1902-1909. cardStyle is at :1923, not :1920. destTag is at :1970-1977, not :1965-1973. onHold is at :1589-1591, not :1584-1588. The undo aria-label is at :1594, not :1589. `track.ts:85` is lib/i18n/track.ts:85, a string, not the arrived_at write. 'The card's accessible name already carries the stage' is false for food bags: `expo.a11y.cardBag` = 'Bag for {x}' (staff.ts:1061, ExpoBoard.tsx:1394-1398). Contrast numbers were transcribed, not measured: #fffdf8 on #a65f10 measures 4.84, not 5.9; #a44b34 on #f6e9e4 measures 4.87, not ≈5.5. The xl Link is 64px (`.ui-btn-xl` min-height `--tap-bump`, primitives.css:73-77), not 52px. The Undo slot renders `kds.undo` with NO echo (ExpoBoard.tsx:1597), while the spec draws a stacked 'Undo' echo citing :1649-1660. Adding the echo changes `al()`'s visible-label composition, which `check-staff-lang` rule 3c and Chrome.test.tsx pin (ExpoBoard.tsx:1568-1577).
- Fix: Re-cite each against 09c1c2a, recompute the two contrast ratios in the shell, correct the xl height, and either drop the Undo echo or spec the `al({kind:"undo"})` echo change together with its guard.

### C · The critic's suggestions (not blocking; take them where the build agrees)

- OPEN-ITEMS.md:709 (PD20) says 'the refunded sentence identical to the KDS's (R2)', which contradicts this spec's DECISIONS 10 and DECISIONS_2026-10-18.md:169-175/200-203 ('never the same string'). Fix the row when the record lands.
- The K15 draft for the door, 'စခရင် အပြည့် ဖွင့်', calls အပြည့် 'fresh', but it is shipped at staff.ts:1299/1304 ('in full'). Cite it, and note that the sense differs from 'full screen'.
- 'Fill the screen →' and the four theme-row words are English on a lang=my page; say they carry lang="en" so they are spoken in the right voice.
- The K49 ② reserved slot is drawn as a dashed outline on every card header. Dashed means the open Undo window in this vocabulary, so annotate it outside the card (a callout) rather than with a dashed mark the build will never show.
- The ◉ 'Here now' glyph reads close to the HOLLOW RING reserved for 'Not sent yet'. Pick a person or bell mark, matching the upright's people glyph.
- Draw the station in Light (Follow this tablet on a light-OS counter is the default case) and the stage's frozen/outage posture ('Nothing to bag as of the last update', the brief's binding rule). Neither is on an artboard.
- The stage bar's LiveDot (`live="counter"`) folds the hidden floor's feed, so a frozen floor reads 'not updating' over a healthy lane in the stage. Decide whether the stage bar reports the lane alone.
- The 10-minute 'warn' header fill (`--warnb`, globals.css:13154-13156) is a time escalation below Late, while the ladder says 'Only Late escalates with time' and vocab.md allows a warn ground only on a Late bag. Consider making warn a mark (disc + clock word) with the fill only at Late, so a tardy pickup guest does not tint the shelf during normal service.
- Upright counts are counts of FACTS and can differ from the cards beneath (an arrived-but-cooking bag counts under Cooking while it sits under Here now, and a pinned card keeps its place under a tier it no longer matches). At arm's length a number that disagrees with the cards beneath it erodes trust; consider counting the cards in the tier.
- The unpaid card's `uncollected` warn badge (ExpoBoard.tsx:1742-1757) is not addressed in the station anatomy or tiers.
- The vocabulary's Undo form carries an aria-hidden '· 6s' leaf on staff. The lane's slot has none, so decide and record whether the lane is an exception, like the KDS cream pill.
