# picked-m20 — The menu editor and the way back to a dish (refined)

<!-- round4-citation-key -->

> **Reading this spec.** It is one moment of round 4; the record is [`../PATH_DESIGN_2026-10-23.md`](../PATH_DESIGN_2026-10-23.md), and where the two disagree the record's _Cross-spec reconciliations_ win, then this file's appendices, then its body. Code citations are against `origin/main` @ `09c1c2a`; a bare path is under `apps/qr/`. A few citations name the round's working files, which are not in the repo: **`common.md` D1–D8** are the record's defaults **R4·1–R4·8** (same numbers); **`vocab.md`** is the record's _Shared vocabulary (round 4)_; **`amend.md`** is this spec's appendix A (and the record's reconciliations); **`brief-mNN.md`** and **`mNN.json`** are the three concepts and the judges' notes, summarized in the record's section for this moment; **`picked-mNN.md`** is this file's own body (the critic's line numbers in appendix B point into it as it stood before the appendices); **`lens.md`** is the round's design lens, restated in the record's opening sections. Every Burmese string marked _K15 draft_ is a draft for the native sitting, never final copy.

Backbone: **Empty Pans First (quiet)**, with all nine grafts from the judgement (`m20.json → .judgement.grafts`) and the owner's D8 default applied exactly. Code read at `origin/main @ 09c1c2a`; every product claim below carries its file:line. Where the code disagreed with a concept, the design moved (the list is in DECISIONS).

Shared geometry (all three screens): tablet 1366×1024. `.staff-col` content column **640px** centred (x363–1003; content x383–983 after the 20px `--s5` padding, `globals.css:12152-12155`; the page's `wrap` sets 640, `app/staff/menu/page.tsx:243`). The page ground carries the 28px LINES (`.staff-main`, `globals.css:12141-12150`); only the shelf card carries DOTS (`card-textured`). The bar is the ONLY sticky element (`docs/DESIGN-LANGUAGE.md:718-723`); the rail is NOT sticky.

Example data (the catalog's own rows, `docs/data/menu_catalog.json`; three sold-out dishes, oldest first): Pickled Tea Salad · လက်ဖက်သုပ် · $14.00 · sold out **Sep 15, 6:40 PM** (another service day) → Mohinga · မုန့်ဟင်းခါး · $14.00 · 6:40 PM → Shan Noodles · ရှမ်းခေါက်ဆွဲ · $13.00 · 7:12 PM. The concept boards' $9.50 examples are replaced by the catalog's prices (a real amount beats an invented one; the confirm example becomes "Change Mohinga from $14.00 to $14.50?").

Categories: `menu_categories.sort_order` from the seed (`supabase/seed.sql:9-16`, eight rows): All-Day Breakfast · Rice / Noodles / Soups · Sides · Curries (A la Carte) · Vegetables · Seafood Curries · Appetizers / Salads · Drinks — English, `lang="en"` (P2cc: no `name_my` column exists, `packages/db/src/database.types.ts:134-142`; the pad does the same, `OrderPad.tsx:1470-1480`). `MENU_REFERENCE` lists nine (a Desserts section, `docs/data/MENU_REFERENCE.md:143`); the rail renders whatever the DB holds.

---

## SCREEN picked-m20-1.dc.html — /staff/menu on a manager's kitchen-door tablet: the shelf first, then the kitchen's own order

**Device:** tablet 1366×1024. **Theme:** light (staff screens follow the OS; drawn light). Device language "Both" (Burmese with English echoes). Role: manager (`canEditPrice = role !== "server"`, `page.tsx:68`). Door cookie: `kitchen` (`lib/staff-door.ts:21`, `STAFF_DOOR_TARGET.kitchen`, :35-38).

### LAYOUT (top → bottom)

**y0–84 · StaffBar** (`.staff-bar`: min-height 68, padding 10px 20px, bg #faf9f5, 1px rgba(58,35,23,0.1) bottom; the stacked title — 30px Padauk at lh 1.6 = 48px + the 13px echo ≈ 16px — makes the bar 84px, the as-built height with a `echo="stack"` title, `StaffBar.tsx:109-111`).

- Leading x20: `.staff-back` pill (`globals.css:12356-12372`: 44h, padding 0 16, radius 999, bg #fffdf8, 1px --bd, inset sheen, 13px 700): **"← မီးဖိုချောင် · ← Kitchen"** — NEW arm: `door === "kitchen"` → `{ kind: "back", href: "/staff/kitchen", k: "kds.back" }` beside the shipped counter arm (`page.tsx:104-108`); the door value exists today (`staff-door.ts:21`). ≈200px wide → x20–220.
- Title x232: h1 "မီနူး ဈေးနှုန်း" Padauk 700 30px (`browse.price.title`, `staff.ts:1539`) over "Menu prices" 13px 600 #6e6358.
- Middle (`.staff-bar-mid`, `globals.css:12221-12226`): the shelf switch re-housed as ONE `.staff-seg` track (`globals.css:12375-12382`: padding 4, radius 999, 1px --bd, bg --sf at 85%) holding two 44px `.kds-chip` LINKS (`.staff-seg > .kds-chip`, :12383-12391; real links so they work with JavaScript off, as today's `ShelfSwitch`, `page.tsx:227-248`, which is REMOVED from the body): "မီးဖိုချောင် မီနူး · Kitchen menu" with `aria-current="page"` on the lit cap (#a65f10 fill, #fffdf8 ink, inset sheen rgba(255,255,255,0.55), `0 0 14px -6px` gold glow — the shared pressed rule, `globals.css:8977-8995`) · "စျေး · Market" (#6e6358 ink, transparent). 15px 700, padding 0 18. `nav aria-label` = `browse.shelf.a11y.switch` "မီနူး ဒါမှမဟုတ် စျေး · Menu or market" (`staff.ts:1670`). ≈370px → x600–970.
- Tail x1190–1346, gap 12, three 44px circles (`.staff-circ`, `globals.css:12319-12337`): print (sr-only "စာလုံး စစ်ဆေးစာရွက် · Word check", `browse.price.wordCheck` :1653) · Help, the ONE gold circle (`.staff-circ-gold`, :12348-12354) · Lock last (sr-only "ဒီတက်ဘလက်ကို လော့ခ်ချ · Lock this tablet", `shell.lock` :53).
- Under 720px the bar wraps to two rows and the seg takes row two (`globals.css:12257-12297`).

**y84–100 · margin 16 (--s4).** The column's first child is the sr-only `role="status"` live region (no pixels; `MenuPriceEditor.tsx:471-473`, unchanged).

**y100–164 · TOOLS ROW, 64px** — the pad's exact shape (`.pad-tools` / `.pad-rail`, `globals.css:15225-15300`), lifted to shared classes:

- x383–427: the 44px search circle (`.pad-search-btn` recipe: --sf #f2efe7, 1px --bd, radius 999, search glyph 20px stroke 1.75), `aria-expanded="false"`, `aria-controls` the field; sr-only name "မီနူး ရှာရန်… · Search the menu…" (`browse.a11y.search`, `staff.ts:822`).
- x435–983: the chip rail — `role="group"` named "အမျိုးအစား အလိုက် စစ်ထုတ် · Filter by category" (`browse.a11y.categories` :823); flex, gap 8, overflow-x auto, overscroll-x contain, the 28px right edge-fade mask when not focus-within, scroll-behavior smooth (auto under reduced motion). Chips are 44px `.staff-chip` buttons (`globals.css:12019-12032`: --sf, 1px --bd, 13px 600, padding 0 12, radius 999) with `aria-pressed`; **no echo on a chip** (owner 2026-09-05; `OrderPad.tsx:1466` "No echo on a 44px chip"; the shipped sold-out chip renders `<Chrome>` with no echo, `MenuPriceEditor.tsx:453-460`). In order: **"အားလုံး"** (`browse.cat.all` :810) — PRESSED at rest, wearing the lit cap · **"ကုန်သွားတာ (၃)"** (`browse.price.soldOutOnly` :1571, `{n}` through `localizeCount` → Burmese numerals, `fill.ts:43-47`; drawn only while n > 0, `MenuPriceEditor.tsx:446`) · then one chip per category in `sort_order`, each `<span lang="en">`: All-Day Breakfast · Rice / Noodles / Soups · Sides · Curries (A la Carte) · Vegetables · Seafood Curries · Appetizers / Salads · Drinks. Visible before the fade: through "Curries (A la Carte)"; the rest scroll.
- SEARCH OPEN (`data-search="open"`): the circle and the rail hide; a 48px field (--sf, radius 12, 16px, placeholder "Mohinga, ကြေးအိုး, Curries…" — the component constant, `MenuPriceEditor.tsx:73-78`; sr-only label `browse.price.find` "ဟင်း ရှာပါ · Find a dish" :1550) plus a 44px clear circle (sr-only "ရှာတာ ရှင်း · Clear search", `pad.search.clear` :3287) take the row. Search and the category press are exclusive (the pad's rule, DESIGN-LANGUAGE §28). **Under 720px the field stays OPEN at rest** above the rail (today's field, `MenuPriceEditor.tsx:434-443`) and no circle is drawn — the judges' keep: the search reachable in one tap either way.

**y180–223 · SHELF HEAD** — `<h2 id="sold-out" class="staff-zone-head" tabindex="-1">` (`globals.css:11950-11956`: 17px, 700; `scroll-margin-top: var(--staff-bar-h)` — the bar's own variable, `DESIGN-LANGUAGE.md:724-725` — 84px here, for the `#sold-out` deep link): "ကုန်သွားတာ (၃)" Padauk 700 17px lh 1.6 (27px) over "Sold out (3)" 13px 600 #6e6358 (16px). Same key as the chip (`browse.price.soldOutOnly`); the count is the rendered rows' own reduce (`MenuPriceEditor.tsx:257`). Margin-bottom 4.

**y227–267 · THE NO-TIMER SUB-LINE** (graft 2), 13px, #6e6358, margin-bottom 8: Padauk 13 lh 1.6 (21px) "တစ်ယောက်ယောက် ပြန်မတင်မချင်း ဘယ်သူမှ မမှာနိုင်ပါ။ အလိုအလျောက် ပြန်တင်ပေးမယ့် အချိန်တိုင်း မရှိပါ။" over the echo "Nobody can order it until someone puts it back, and there is no timer that does it for you." 13px 600 (16px). Both are the SHIPPED `browse.price.leadServer` sub-sentences (`staff.ts:1546-1548`), cut at the dash and the full stop; new key `browse.price.shelf.noTimer` holding exactly those words (one capital letter added to the English).

**y275–551 · THE SHELF CARD** — `.staff-inset` with a ONE-COLUMN modifier (`.staff-inset-col`: the default `repeat(auto-fill, minmax(min(100%, 300px), 1fr))` would split 600px into two 300px tracks, `globals.css:12425-12428`), `card-textured` (the page's only dotted card), radius 18, bg #fffdf8, 1px rgba(58,35,23,0.1), inset sheen + `--sh` (`0 1px 3px rgba(35,24,16,0.06), 0 1px 2px rgba(35,24,16,0.04)`); `role="list" aria-labelledby="sold-out"`; rows sorted `sold_out_at` ASC (the pan forgotten longest first — `soldOutShelf(rows)`, a new pure rule in `lib/menu-browse.ts` beside `browseRows`, :17-39), 1px --bd hairlines between. Three rows × **92px** (y275–367 · 367–459 · 459–551).
Row anatomy: `.staff-row` (`globals.css:12446-12454`) at padding 10px 14px 10px 16px, flex, align-items center, gap 14, `flex-wrap: wrap` (the echo line's `flexBasis: 100%`, `MenuPriceEditor.tsx:888-893`).

- LEFT (flex 1, min-width 0), device-language FIRST (graft 1; the KDS ticket's own order, DESIGN-LANGUAGE §6 P1, `globals.css:9322-9340`):
  - L1 `name_my` **17px Padauk 700** #1b1714 (lh 1.6 → 27px), `lang="my"` — "လက်ဖက်သုပ်" · "မုန့်ဟင်းခါး" · "ရှမ်းခေါက်ဆွဲ". A dish with no `name_my` (`menu_items.name_my: string | null`, `database.types.ts`) shows the English alone at 17px 700 marked `lang="en"`, never pre-substituted, never in Padauk.
  - L2 `name_en` 13px 600 #6e6358 `lang="en"` (16px): "Pickled Tea Salad" · "Mohinga" · "Shan Noodles".
  - L3 THE SINCE-CLOCK, the row's hero (graft 7), one line ≈27px: key `browse.price.shelf.since` — the shipped stamp's own words without the leading joiner (`browse.price.soldOutSince` is " · {t} ကတည်းက ကုန်သွားပြီ" / " · sold out since {t}", `staff.ts:1564-1567`; on its own line the middot has nothing to join). Burmese first: "**6:40 PM** ကတည်းက ကုန်သွားပြီ" — `{t}` is wrapped `lang="en"` by Chrome rule 3 (`Chrome.tsx:32-36`) and a row-scoped rule sizes that span **17px 800 tabular-nums** #1b1714; the Burmese words 13px 400 #726859 Padauk; then the inline echo " · sold out since 6:40 PM" 13px #726859 (its clock 13px tabular). `{t}` comes from `soldOutSinceParts` (`lib/sold-out-since.ts:14-18`): same service day → `staffClock` "6:40 PM" (`staff-clock.ts:43-45`); another day → `staffDateTime` "Sep 15, 6:40 PM" (:74-76).
  - DATED ROW (row 1): the whole L3 in **--warn #a44b34** (words 600, the clock 17px 800 warn — the shipped `soldOutTagOld` tint, `MenuPriceEditor.tsx:497, 781`) reading "**Sep 15, 6:40 PM** ကတည်းက ကုန်သွားပြီ · sold out since Sep 15, 6:40 PM", plus an sr-only "တခြားနေ့ကတည်းက · From another day" (K15 draft, the glance brief) — warn ink + the date in text + the sr-only sentence; NO dashed frame (the KDS held idiom's shape means something else).
- RIGHT: ONE pill, **"ပြန်တင် · Put back"** — 44h, radius 999, bg --okb #eaf2ec, 1px `color-mix(--ok 40%, --bd)`, ink --ok #346e47, 800 13px, padding 0 12 (the shipped `restoreBtn`, `MenuPriceEditor.tsx:793-802`), ≈150px → x819–969. The pill is the `@mms/ui` Button primitive at size sm wearing this tint, so busy follows `primitives.css:56-59` (opacity stays 1) with the `.ui-btn-spinner` (1em currentColor ring, :144-150; static under reduced motion, :450-455) before the label. No price, no Edit, no category on a shelf row. **The first Put back lands at y299–343** (B's sat at ~y372).
- Example rows: 1 · လက်ဖက်သုပ် / Pickled Tea Salad / Sep 15, 6:40 PM (warn) · 2 · မုန့်ဟင်းခါး / Mohinga / 6:40 PM · 3 · ရှမ်းခေါက်ဆွဲ / Shan Noodles / 7:12 PM.

**y575–596 · FIRST SECTION HEAD** — `<h2 id="cat-all-day-breakfast" class="staff-zone-head" lang="en" tabindex="-1">All-Day Breakfast</h2>`, Fraunces 17px 700 lh 1.22, margin 0 0 8. Sections follow `sort_order` (`groupByCategory(rows, order)`, new pure rule; the page already selects `menu_categories(name,sort_order)`, `page.tsx:78-82` — the `.order("name_en")` at :82 becomes category order then name); gap 24 between sections.

**y604–976 · SECTION CARD** — `.staff-inset.staff-inset-col` (plain, no dots), `role="list" aria-labelledby="cat-all-day-breakfast"`, six rows × **62px**: Kyay-O / Si-Chat ($20.00) · Mee-Shay ($14.00) · Mohinga ($14.00, sold out) · Nan-Gyi Mont Ti ($13.00) · Ohno Khao-Swe ($15.00) · Shan Noodles ($13.00, sold out).
Row: padding 8px 14px 8px 16px.

- LEFT: L1 `name_my` 17px Padauk 700 (27px) — ကြေးအိုး/ဆီချက် · မြှီးရှည် · မုန့်ဟင်းခါး · နန်းကြီးမုန့်တီ · အုန်းနို့ခေါက်ဆွဲ · ရှမ်းခေါက်ဆွဲ; L2 `name_en` 13px 600 #6e6358 `lang="en"`; a sold-out dish keeps the SHIPPED tag after its English name at 13px #726859: "Mohinga · 6:40 PM ကတည်းက ကုန်သွားပြီ" (`browse.price.soldOutSince`, the clock `lang="en"`; no echo — "a badge on a row", `MenuPriceEditor.tsx:498-507`); dated → warn 600 as today. No per-row category sub-label (the section head says it; `cat` at :511 retired).
- RIGHT, gap 8, right edge x969:
  - MANAGER ONLY · THE PRICE PILL = the edit door: 44h paper secondary pill (`.ui-btn-secondary` recipe: bg #fffdf8, 1px --bd, inset sheen, `--sh`, radius 999), padding 0 14, "$20.00" **15px 800 tabular** #1b1714 + a 16px pencil glyph `aria-hidden` (gap 6), ≈96px; accessible name "ပြင် · Edit Kyay-O / Si-Chat" — the as-built name through `al()` with `browse.price.verb.edit` (`MenuPriceEditor.tsx:568-576`); the separate "Edit" ghost (:560-578) is retired. The amount is `base_price_cents` through `dollars()` (:762), after a save `res.priceCents` (:381), never a draft.
  - THE AVAILABILITY PILL: "ကုန်ပြီ လို့ မှတ်မယ် · Mark sold out" 44h, bg --warnb #f6e9e4, 1px `color-mix(--warn 40%, --bd)`, ink --warn #a44b34, 800 13px (`eightySixBtn`, :782-792), ≈232px; or "ပြန်တင် · Put back" (okb/ok) on Mohinga and Shan Noodles. Names via `al()`: "Mark sold out Kyay-O / Si-Chat" · "Put back Mohinga" (:532-547).
  - Right block ≈336px → the name block keeps ≈220px (x399–619); a longer `name_my` wraps to two lines and the row grows (no truncation).

**y1000–1021** · the next head "Rice / Noodles / Soups" peeks; the frame clips at 1024.

Below the fold (not drawn, specified): the remaining sections in `sort_order` (Appetizers / Salads holds Pickled Tea Salad, sold out, its dated tag in warn); then the FOOT, 32px under the last card, 13px #726859, Padauk lh 1.6 + echo stack: manager — "ဟင်းတစ်မျိုးကို ဈေးတစ်ခုတည်း — ဆိုင်မှာစားရော ပါဆယ်ရော အတူတူ၊ ကောင်တာမှာလိုပဲ။ ဘယ်သူ ပြင်တယ်ဆိုတာ အကုန် မှတ်ထားပါတယ်။" / "One price per dish — dine-in and to-go ring the same amount, the way the register does. Every edit is recorded with your name." (`leadManager`'s first and last sentences, `staff.ts:1541-1543`; its middle sentence already lives in the price confirm as `confirmDetail`, :1601-1604); server — "ဘယ်သူ ပြောင်းတယ်ဆိုတာ အကုန် မှတ်ထားပါတယ်။" / "Every change is recorded with your name." (`leadServer`'s last sentence, :1548). Then the page's `--s8` bottom pad.

### STATES

- REST (drawn): All pressed; shelf + every section; the foot.
- CATEGORY PRESSED: the shelf stays (the standing truth is never hidden); only that section renders; focus moves to the section's `h2` (tabindex -1, graft 9) so the result is announced; the rail scrolls the pressed chip into view. A category with no active dish has no chip.
- "ကုန်သွားတာ (၃)" PRESSED: the shelf alone (the shipped `filterSoldOut`, `MenuPriceEditor.tsx:264-271`); focus to the shelf head; the chip unmounts and lets go of its press when the last dish is put back (:258-263 rule kept).
- SEARCH OPEN: rail hidden, field + clear; results keep their section heads; empty → "No dish matches “{x}”." / "No sold-out dish matches “{x}”." as built (`staff.ts:1551-1554, 1575-1578`; :745-752).
- BUSY (a pill tapped): the pill KEEPS its words, gains `aria-busy` + `aria-disabled`, full ink, the 1em ring before the label; re-entry refused on `flippingRef` (:197-198); the bare "…" at :553 is retired.
- LANDED PUT BACK: the pill flips in place to "Mark sold out" (warn recipe); the row stays on the shelf until the NEXT action (`keep`, `lib/menu-browse.ts:17-22`); echo line under the row in --ac-strong #8f5009 13px: "မုန့်ဟင်းခါး ကို …" — no: `{x}` is `nameEn` as built (:250-251) → "Mohinga ကို မီနူးမှာ ပြန်တင်ပြီးပြီ။ / Mohinga is back on the menu." (`browse.price.live.on` :1628-1631), rising with `mms-rise` (static under reduced motion). The shelf's count drops only when the refreshed list agrees (`router.refresh()`, :255).
- LANDED MARK SOLD OUT (from a section): the row wears the bare " · ကုန်သွားပြီ" (`browse.price.soldOut` :1559) until the refresh brings the server's stamp (never client-minted, :488); it joins the shelf's END on the refresh; echo "{x} ကုန်သွားပြီ — ပြန်မတင်မချင်း ဘယ်သူမှ မမှာနိုင်ပါ။ / {x} is sold out — nobody can order it until you put it back." (`live.off` :1624-1627, K15-HIGH).
- EDIT (manager taps the price pill): the row's right side becomes "$" + a 96px right-aligned decimal field (48h, `inputMode="decimal"`, `enterKeyHint="done"`, :683-695) + "မလုပ်တော့ · Cancel" ghost + "သိမ်း · Save" (--ac fill); the stated reason under it in --warn 11px (`browse.price.draft.*`, :1606-1617; bounds `PRICE_MIN_CENTS` 25 / `PRICE_MAX_CENTS` 500000, `packages/db/src/bounds.ts:9-10`); Save → the confirm group in place (1px --ac, radius 12, padding 12, max 340px, :860-884): "ဈေးအသစ် အတည်ပြု / Confirm the new price" 11px 800 --t2 · "Mohinga ကို $14.00 ကနေ $14.50 ပြောင်းမလား။ / Change Mohinga from $14.00 to $14.50?" 13px 700 · the detail sentence 11px --t2 · [$14.00 အတိုင်း ထား / Keep $14.00] ghost · [$14.50 သတ်မှတ် / Set $14.50] accent, "သိမ်းနေပါတယ်… / Saving…" while busy — verbatim, two-step kept (:1597-1605).
- SAVED: the price pill reads the SERVER's amount; echo "Mohinga က အခု $14.50 ဖြစ်ပါပြီ။ … / Mohinga is now $14.50. Lines already in a cart keep the price they were quoted." (`live.saved` :1632-1635); focus parks on that row's price pill (it still exists — replaces today's park on the search field, :383-387, which may now be closed).
- EMPTY SHELF (n = 0): the head reads "ကုန်သွားတာ (၀) · Sold out (0)"; the card is one 62px row, 15px --t2: "အခု ဘာမှ မကုန်သေးပါ။ / Nothing is sold out right now." (`browse.price.shelf.empty`, K15 draft from the quiet brief) — an honest empty state, never an absent shelf; the rail's sold-out chip is absent (n = 0).
- UNKNOWABLE READ: `StaffOutageShell what="what.menuPrices"` exactly as today (`page.tsx:65, 85`) — never an empty list.
- REFUSED / OUTAGE / UNLOGGED / GONE: screen 3.
- NIGHT (OS dark): tokens swap (card #2b213c, okb #1f2e26 / ok #5fb07e, warnb #33231d / warn #e0855f, bar glass); glass only on the bar, never on a pressed chip or a selected element.

### COPY (English)

- ← Kitchen
- Menu prices
- Kitchen menu
- Market
- Menu or market
- Word check
- Help
- Lock this tablet
- Search the menu…
- Filter by category
- All
- Sold out (3)
- Sold out (0)
- All-Day Breakfast · Rice / Noodles / Soups · Sides · Curries (A la Carte) · Vegetables · Seafood Curries · Appetizers / Salads · Drinks (`menu_categories.name`, `lang="en"`, `seed.sql:9-16`)
- Nobody can order it until someone puts it back, and there is no timer that does it for you.
- sold out since 6:40 PM
- sold out since Sep 15, 6:40 PM
- From another day (sr-only)
- Put back
- Mark sold out
- Edit {dish} (accessible name of the price pill)
- $20.00 · $14.00 · $13.00 · $15.00
- Find a dish
- Clear search
- Mohinga, ကြေးအိုး, Curries… (placeholder, `MenuPriceEditor.tsx:78`)
- No dish matches “{x}”.
- No sold-out dish matches “{x}”.
- Nothing is sold out right now.
- Mohinga is back on the menu.
- Mohinga is sold out — nobody can order it until you put it back.
- Confirm the new price · Change Mohinga from $14.00 to $14.50? · Every new order pays the new price. Lines already in a cart keep what they were quoted, and paid orders never change. · Keep $14.00 · Set $14.50 · Saving… · Cancel · Save
- Enter a price, like 14.50 · Lowest price is $0.25 · Highest price is $5000.00 · Numbers only, like 14.50 · That’s the current price
- Mohinga is now $14.50. Lines already in a cart keep the price they were quoted.
- One price per dish — dine-in and to-go ring the same amount, the way the register does. Every edit is recorded with your name. (manager foot)
- Every change is recorded with your name. (server foot)

### COPY (Burmese) — source beside each

- SHIPPED: ← ကောင်တာ (`floor.back`, `staff.ts:423`, the counter-device arm — not drawn here) · မီနူး ဈေးနှုန်း (:1539) · မီနူး ရနိုင်မှု (:1540) · မီးဖိုချောင် မီနူး · စျေး (:1671-1672) · မီနူး ဒါမှမဟုတ် စျေး (:1670) · စာလုံး စစ်ဆေးစာရွက် (:1653) · ဒီတက်ဘလက်ကို လော့ခ်ချ (:53) · မီနူး ရှာရန်… (:822) · အမျိုးအစား အလိုက် စစ်ထုတ် (:823) · အားလုံး (:810) · ကုန်သွားတာ ({n}) (:1571) · ဟင်း ရှာပါ (:1550) · ရှာတာ ရှင်း (:3287) · " · {t} ကတည်းက ကုန်သွားပြီ" (:1564-1567) · " · ကုန်သွားပြီ" (:1559) · ပြန်တင် · ကုန်ပြီ လို့ မှတ်မယ် · ပြင် (:1584-1586) · မလုပ်တော့ · သိမ်း (:1587-1588) · ဈေးအသစ် အတည်ပြု (:1591) · the confirm block (:1597-1605) · the draft reasons (:1606-1617) · the live lines (:1622-1635) · the two leads (:1541-1548) · “{x}” နဲ့ ကိုက်ညီတဲ့ ဟင်း မရှိပါ။ (:1551-1554) · “{x}” နဲ့ ကိုက်ညီတဲ့ ကုန်သွားတဲ့ ဟင်း မရှိပါ။ (:1575-1578).
- SHIPPED WORDS RE-CUT (new keys, the words unchanged; K15 ledger rows all the same): `browse.price.shelf.noTimer` — "တစ်ယောက်ယောက် ပြန်မတင်မချင်း ဘယ်သူမှ မမှာနိုင်ပါ။ အလိုအလျောက် ပြန်တင်ပေးမယ့် အချိန်တိုင်း မရှိပါ။" (two sentences of `browse.price.leadServer` MY, `staff.ts:1548`) · `browse.price.shelf.since` — "{t} ကတည်းက ကုန်သွားပြီ" (`browse.price.soldOutSince` MY minus its leading " · ", :1566).
- K15 DRAFT — `kds.back`: "← မီးဖိုချောင်" for "← Kitchen" (the quiet brief; the shape of `floor.back` :423 with the owner-verified kitchen word `kds.title` :154).
- K15 DRAFT — `browse.price.shelf.empty`: "အခု ဘာမှ မကုန်သေးပါ။" for "Nothing is sold out right now." (the quiet brief; grounded in ကုန် :1571, အခု :1613, ဘာမှ :1714).
- K15 DRAFT — "From another day" (sr-only): "တခြားနေ့ကတည်းက" (the glance brief's draft; the judgement's graft 7 names it).
- Category names: NO Burmese (P2cc, owner-gated) — English `lang="en"`.

### A11Y

- Landmarks and outline: `main.staff-main` → `h1` (the bar title) → `h2#sold-out` (the shelf) → one `h2` per category — a page outline it lacks today. Each `h2` has `tabindex="-1"` and is the focus target after its chip is pressed (graft 9); `#sold-out` is the deep-link target with `scroll-margin-top: var(--staff-bar-h)`.
- Each inset is `role="list"` named by its head (`aria-labelledby`); list items carry no role of their own.
- The rail is `role="group"` named by `browse.a11y.categories`; chips are `<button aria-pressed>` — the lit cap PLUS the pressed state, never colour alone; exactly one pressed at rest.
- The seg is a `nav` named by `browse.shelf.a11y.switch`; the current segment is `aria-current="page"`.
- ONE live region per view: the sr-only `role="status"` at the column's top (`MenuPriceEditor.tsx:471-473`, no `lang` on the region, no echo — a bilingual announcement says everything twice); the acted row echoes the same words `aria-hidden`. Nothing else is live.
- Names say the dish: "Put back Mohinga" / "ပြန်တင် Mohinga", "Mark sold out Kyay-O / Si-Chat", "Edit Kyay-O / Si-Chat" — `al()` with the verb key and the subject (`MenuPriceEditor.tsx:532-547, 568-576`); the name follows the device's echo mode exactly as the label renders (`Chrome.tsx:122-124`).
- Targets: every chip, circle, segment, pill and the price pill ≥44px; the search field 48px.
- Busy: `aria-busy` + `aria-disabled` + the ref guard; never native `disabled`; opacity 1 (`primitives.css:56-59`); the label never changes.
- Focus: stays on the pill through busy, landing and refusal (it flips verb in place); a chip press moves focus to the shown section's `h2`; Save → the confirm group (`:303`), Keep → back to Save (`:304`); a successful save → the row's price pill; the search circle → the field, clear → back to the circle.
- Burmese: every run in `lang="my"` (Padauk 700/400, lh 1.6, `font-synthesis: none`, no letter-spacing — `globals.css:76-86`); Latin values inside a Burmese run wrapped `lang="en"` (the clock, the amounts, the dish name); 13px floor everywhere (the smallest Burmese is the 13px echo/stamp words).
- Dated row: warn ink + the date in the text + the sr-only "From another day" — never the tint alone.
- Motion: the cap's ignite (420ms), the `staff-press` sheen, the echo's `mms-rise` (240ms), the rail's smooth scroll — each off under `prefers-reduced-motion` (the tokens zero `--dur-*`, `tokens.css:722-725`; the rail `scroll-behavior: auto`; the spinner a static ring).
- Contrast: the shipped pairs only — --ok on --okb, --warn on --warnb, --t2/--t3/--tx on --cd/--pg, --oa on --ac (pinned by `composite-contrast.test.ts`).

---

## SCREEN picked-m20-2.dc.html — The kitchen board's one door: Open · Late · Sold out →

**Device:** tablet 1366×1024. **Theme:** NIGHT, forced (`.kds-root.dark`, `KdsBoard.tsx:1683`; ground #100c19, ink #f3ecdf). Device language "Both". Station: All.

### LAYOUT (top → bottom)

Root: flex column, gap 12 (`--s3`), padding `clamp(8px, 1vw, 16px)` ≈ 14px at 1366 (`globals.css:8851-8860`).

**y0–84 · StaffBar inside the root** (`.kds-root > .staff-bar`, margin 0 -14px so it spans 0–1366; Night glass `--glass-chrome` = color-mix(--sf #211a30 90%) + blur 20 saturate 1.5, inset sheen rgba(255,255,255,0.11), 1px rgba(243,236,223,0.13) bottom — the ONE frosted pane, DESIGN-LANGUAGE:718-720; padding 10px 20px):

- x20–64 the Screens circle (bg #2b213c, 1px bd, `--sh` 0 1px 3px rgba(0,0,0,0.45); sr-only "စခရင်များ · Screens", `shell.screens` :48; `/staff?doors=1`).
- x76 the h1 "မီးဖိုချောင်" 30px Padauk 700 #f3ecdf over "Kitchen" 13px 600 #bcafc8 (`kds.title` :154; `titleTabIndex -1`, `KdsBoard.tsx:1702-1705`).
- Middle: the station `.staff-seg` (`role="group"` named "စတေရှင် စစ်ထုတ်" `kds.a11y.stationFilter` :391): four 44px `.kds-chip` buttons, Latin words by owner decision (`kds.station.*` :161-164, :4793-4796): **All** pressed (#e7a53a fill, #130d1e ink, inset sheen, `0 0 14px -6px` glow) · Wok · Cold · Drinks (#bcafc8), 15px 700, padding 0 18. ≈330px, x≈560–890.
- Tail (DESIGN-LANGUAGE §34 order, :2592-2594): TV circle (sr-only "တီဗီ ဘုတ် · TV board", `kds.nav.wall` :400) · Sound circle, ON = the lit cap · Aa circle (plain, never gold; sr-only "စာလုံး အရွယ်အစား · Text size", `kds.size.title` :76) · Help, the gold circle · Lock. Five 44px circles, gap 8 → x1094–1346.

**y96–162 · `.kds-head`** (`globals.css:8861-8868`: flex wrap, align center, gap 12px 16px, padding-bottom 8, 1px bd bottom):

- LEFT `.kds-stats` (`role="group"` named "ဝန်ဆောင်မှု စာရင်း" `kds.a11y.stats` :390; gap 16, tabular, :8875-8879), x14→:
  - stat 1: `<b>4</b>` 32px 800 lh 1 #f3ecdf (`--kfs-id`, :8887-8891) over "ဖွင့်ထား" 15px 700 #bcafc8 (`kds.stat.open` :246; `--kfs-meta`, uppercase + `--track-wide` by `.kds-stat span`, :8892-8898 — on the Burmese span the tracking MUST read `letter-spacing: normal`: see OPEN RISKS 2).
  - stat 2: `<b>1</b>` in --warn #e0855f (`.kds-stat-late b`, :8900-8902) over "နောက်ကျ" (`kds.stat.late` :247). Both count the STATION-FILTERED tickets (`count = live.length`, `KdsBoard.tsx:1679`; `kdsLateCount(live, …)`, :1095).
  - **stat 3 — THE DOOR (new):** `<a href="/staff/menu#sold-out" class="kds-stat kds-stat-link staff-press">`, laid out like its siblings (grid, justify-items center, gap 2; link reset: no underline, ink inherited; padding 0 4 so the hit box is ≥44×44 — the block is ≈190×54): `<b>3</b>` 32px 800 #f3ecdf (a FACT, never the warn ink — Late alone alarms); the label row 15px 700 #bcafc8: "ကုန်သွားပြီ" `lang="my"` then " · SOLD OUT" — `kds.86.done` rendered through `<Chrome echo="inline">` (:242; the key is in `STAFF_K15_HIGH`, :4870, so Chrome rule 4, `Chrome.tsx:46-58`, keeps the English on EVERY device — the one strip label with an echo, because this label is a door and the band says so); then "→" 15px in --ac #e7a53a `aria-hidden`, margin-left 6, nudging 3px on hover (the Button arrow idiom, `primitives.css:132-142`; off under reduced motion :441-446). The numeral and the label row are `aria-hidden`; the link's accessible name is the sr-only `<Chrome k="floor.kitchen.soldOut" vars={{ n }} echo="inline">` + `<Chrome k="floor.nav.menuAvailability" echo="inline">` → "၃ ခု ကုန်သွားပြီ · 3 marked sold out, မီနူး ရနိုင်မှု · Menu availability" (graft 8: `floor.kitchen.soldOut` "{n} marked sold out" / "{n} ခု ကုန်သွားပြီ", `staff.ts:3712`, a shipped K15 draft — it says "dishes, board-wide" where Open and Late are station-filtered; `floor.nav.menuAvailability` :1149). Label-in-name holds: "Sold out" and "ကုန်သွားပြီ" are substrings of the name. Focus ring 2.5px #e7a53a offset 2, radius 6; press = `staff-press` scale .985. It never wears the cap (a fact, not a pick) and never the warn ink.
- RIGHT of the stats, same row: the board's ONE live region `<p role="status">` 15px #bcafc8 (`KdsBoard.tsx:1793-1838`), device-language ONLY — never a pair (:1795-1799): "ဖွင့်ထားတဲ့ အော်ဒါ 4 ခု" (`kds.open.many` :251, `{n}` Latin).

**y174–1010 · the ticket grid, as built** (`repeat(auto-fill, minmax(320px, 1fr))` → four ≈325px columns at 1366, gap 12; page size 8): tickets bg #2b213c radius 12, 1px bd, `card-textured`; head strip in --sf #211a30 (amber mix past the amber threshold; the Late card's strip in the warn mix with its "Late · " badge word, DESIGN-LANGUAGE §34): identity "စားပွဲ 7" 32px 800 / "ဆိုင်မှာ စား · Dine-in" 15px #bcafc8 / the clock "14:12" 24px tabular right; food lines 56px: the 44px qty ring, `name_my` 30px Padauk 700 #f3ecdf over `name_en` 21px 600 #bcafc8 (`.kds-line-name[lang="my"]` / `.kds-line-en`, `globals.css:9335-9385`); the ⋯ 48px wide and the row's full height ONLY where `canEightySix(line)` (`KdsBoard.tsx:2835`; `lib/kds-line.ts:21-23`: `menuItemId !== null && !soldOut`) — P2ax kept, nothing added to a line; the 64px (`--tap-bump`) bump "အားလုံး ပြီးပြီ · All done". Four cards: Table 7 (14 min · Mohinga ×2 · Parata (2 pcs) · Burmese Milk Tea ×2) · Table 3 (9 min · Chicken Curry / Coconut · **Shan Noodles — no ⋯, the tag "● ကုန်သွားပြီ · Sold out"** 13px with the 0.55em warn dot, `.kds-line-off-dot` :9313-9320; `kds.86.done`, K15-HIGH so the echo stays) · Aye K4 pickup (4 min · Biriyani (Dan-Pauk) · Veggie Fritters) · Table 12 (1 min · Ohno Khao-Swe ×2 · Century Egg Salad · Faluda ×2). The card whose badge says Late is the one the "1" counts.

The `.kds-undo` pill (fixed bottom-centre, cream #f3ecdf on the inverted ground, `globals.css:9701-9735`) is NOT on screen at rest; after an 86 it reads "{x} ကုန်သွားပြီ · {x} sold out" + "ပြန်ဖျက် · Undo" for `KDS_UNDO_MS` = 6 000 ms (`lib/kds-undo.ts:16`), unchanged. The Help card stays as shipped — "Out of a dish? Tap ⋯ on its line and mark it sold out — guests can’t order it any more." / "Anyone can put it back from the Menu page." (`help.how.kitchen.3/.3.more` :2802-2811) — now true at arm's length; NO Help row is added (one door, not two).

### STATES

- COUNT READ OK, n > 0 (drawn): the number is the SERVER's count per poll — ONE advisory HEAD count (`menu_items` where `is_active` and `is_sold_out`, `{ count: "exact", head: true }`) read in parallel with the snapshot's other reads inside `getKitchenQueue` (`lib/kitchen.ts:123`), answered as `soldOutCount: number | null` on `KitchenQueue` beside `served` and `stops` (`lib/kitchen-types.ts` — the `null`-when-failed precedent); NEVER a change to the menu read that gates `outage` (`kitchen.ts:263-290`), never bumped locally after a board 86 — it moves on the next poll (≤5 s), like Open.
- **TRUE ZERO: "0 · ကုန်သွားပြီ · SOLD OUT →" IS DRAWN as a live link** (the read succeeded; the kitchen's one door to the menu never disappears) — graft 3.
- COUNT READ FAILED (`null`): the stat is ABSENT — zero and unknown never share pixels; the board is otherwise unaffected (advisory, like `served`/`stops`).
- FROZEN / DEGRADED board: the stat keeps the last good snapshot's number, like Open; the frozen-board sentence carries the degradation (`KdsBoard.tsx:1812-1819`).
- CHANGE: the numeral swaps with no motion; the strip never pulses.
- TEXT DIAL m/l: the `<b>` scales to 36/40 with its siblings (`--kfs-id`, `globals.css:12091-12104`); the "exactly one `.kds-stat b` size" test (`KdsBoard.test.tsx:1750-1755`) still holds — the link adds no size rule.
- UNDO WINDOW LIVE: the door stays live — leaving mid-window loses nothing; the dish is on the shelf with Put back.
- BURMESE-ONLY DEVICE: Open/Late read Burmese alone (no echo, K27); the door's label keeps " · SOLD OUT" (K15-HIGH).
- NAVIGATED: full navigation to `/staff/menu#sold-out`; the board unmounts and its poll stops; the menu page's leading reads "← မီးဖိုချောင် · ← Kitchen" because the door cookie is `kitchen` (`readStaffDoor`, `page.tsx:71`), so the board is one tap away and remounts polling. The back pill itself is drawn on screen 3.

### COPY (English)

- Kitchen · Screens · Station filter · All · Wok · Cold · Drinks · TV board · Text size · Help · Lock this tablet
- Service stats · Open · Late · SOLD OUT (the label; the numeral is the live count)
- 3 marked sold out (accessible name) · Menu availability (accessible name tail)
- 4 open tickets (the region, in the device language)
- Dine-in · Pickup · All done · Sold out (the line tag) · Mark sold out · Undo · {x} sold out
- Out of a dish? Tap ⋯ on its line and mark it sold out — guests can’t order it any more. · Anyone can put it back from the Menu page.

### COPY (Burmese) — all shipped

- မီးဖိုချောင် (`kds.title` :154) · စခရင်များ (:48) · စတေရှင် စစ်ထုတ် (:391) · တီဗီ ဘုတ် (:400) · စာလုံး အရွယ်အစား (:76) · ဒီတက်ဘလက်ကို လော့ခ်ချ (:53)
- ဝန်ဆောင်မှု စာရင်း (:390) · ဖွင့်ထား (:246) · နောက်ကျ (:247) · ကုန်သွားပြီ (`kds.86.done` :242, K15-HIGH)
- {n} ခု ကုန်သွားပြီ (`floor.kitchen.soldOut` :3712, a shipped K15 draft) · မီနူး ရနိုင်မှု (:1149)
- ဖွင့်ထားတဲ့ အော်ဒါ {n} ခု (:251) · စားပွဲ · ဆိုင်မှာ စား · လာယူ · အားလုံး ပြီးပြီ (the ticket's shipped chrome) · ကုန်ပြီ လို့ မှတ်မယ် (`kds.86` :240) · ပြန်ဖျက် (:306) · {x} ကုန်သွားပြီ (:318) · the two Help lines (:2802-2811)
- NO new Burmese on this screen.

### A11Y

- The stat link is a real `<a>` in the group's tab order after Late; Enter follows it; the 2.5px gold ring is visible on the Night ground; its name is the sr-only dictionary text (never `aria-label`; §17's circle rule), with the visible numeral and label `aria-hidden` so the name is exactly "{n} marked sold out, Menu availability" in the device's tongues; WCAG 2.5.3 holds by containment.
- ONE live region on the board (`role="status"`, :1794), device-language only; the stat is never announced on change (a number read from the wok, like Open).
- Hit box ≥44×44; `staff-press` for the committed tap; hover nudge is transform-only and off under reduced motion; no chime, no flash, no badge.
- The Burmese label span carries `letter-spacing: normal` (a `.kds-stat [lang="my"]` rule — see OPEN RISKS 2) and no uppercase effect (Myanmar has no case).
- Everything else on the board is unchanged: the ⋯ → sheet → "Mark sold out" path, the 6 s Undo pill with its `aria-disabled` + ref guard, the 8 s error dwell (`kds-errors.ts:84-91`).

---

## SCREEN picked-m20-3.dc.html — When a put-back misfires, on a Burmese-only kitchen tablet: outage · someone else already · not logged

**Device:** tablet 1366×1024. **Theme:** light (OS). Device language: **Burmese only** (`useEchoesShown()` false: echoes drop except the K15-HIGH band, Chrome rule 4). Role: server (no price pill; title `browse.price.titleAvail`). Door cookie: `kitchen`. **Stateful artboard:** one acted row at a time (the editor holds ONE `msg`, cleared on every tap — `MenuPriceEditor.tsx:200, 471-472`); tapping a shelf row's own pill shows THAT row's outcome; the initial state is row 1's.

### LAYOUT (top → bottom)

**y0–68 · StaffBar** (a single-line title: 48 + 20 = 68): leading x20 `.staff-back` "← မီးဖိုချောင်" alone (`kds.back` is not K15-HIGH, so its echo drops) ≈120px; title x144 "မီနူး ရနိုင်မှု" 30px Padauk 700 (:1540), no echo; middle the seg "မီးဖိုချောင် မီနူး" (lit) · "စျေး"; tail: print · Help gold · Lock (sr-only names in Burmese alone).

**y68–84 · margin 16.** The sr-only `role="status"` region at the column's top.

**y84–148 · TOOLS ROW**: the 44px search circle (sr-only "မီနူး ရှာရန်…") + the rail: "အားလုံး" (pressed) · "ကုန်သွားတာ (၃)" · the eight English category names `lang="en"` (data, P2cc — not echoes; they stay).

**y164–191 · SHELF HEAD** `h2#sold-out` "ကုန်သွားတာ (၃)" Padauk 700 17px (27px), margin-bottom 4.

**y195–216 · SUB-LINE** Burmese alone, 13px #6e6358 Padauk lh 1.6 (21px): "တစ်ယောက်ယောက် ပြန်မတင်မချင်း ဘယ်သူမှ မမှာနိုင်ပါ။ အလိုအလျောက် ပြန်တင်ပေးမယ့် အချိန်တိုင်း မရှိပါ။" Margin-bottom 8.

**y224– · THE SHELF CARD** (`.staff-inset.staff-inset-col.card-textured`, `role="list"`): three rows; a row at rest is 92px (L1 name_my 17 → 27px · L2 name_en 13 `lang="en"` → 16px · L3 the since-clock line → 27px; padding 10/10); the ACTED row grows by its echo line (flex-basis 100%, margin-top 4; 13px Padauk lh 1.6 = 21px per Burmese line, + 16px for the English line where the key is K15-HIGH).

The server's refusal is rendered BY RESULT CODE, the kitchen board's own pattern (`lib/kds-errors.ts:64-78`): `setItemSoldOut` already answers `{ error, code }` with `code ∈ sentence | invalid | gone | stale | unlogged` (`lib/menu-availability.ts:53-57`), so the editor's `msgNode` stops passing `r.error` through `<OutageText>` by string identity (inert today by its own admission, `MenuPriceEditor.tsx:394-401`) and picks a dictionary key by code with the dish in `{x}` (`nameEn`, as every `msg` carries today, :212-216, :250). `stale` gains one boolean, `now` (the state the server found, `menu-availability.ts:96-101, 146-150`, which the client cannot otherwise know); `unlogged` already carries `soldOut` (:176-186). `AVAILABILITY_OUTAGE` (:59-60) moves out of the `"use server"` module into `lib/staff-outage.ts` as a dictionary pair (`STAFF["browse.price.err.outage"].en/.my`, exactly how `MARKET_OUTAGE` got its twin, `staff-outage.ts:94-95`) and joins `OUTAGE_TWINS` (`Chrome.tsx:157-170`), so the gate's own copy (`staffGate("server", AVAILABILITY_OUTAGE)`, `menu-availability.ts:72`) has a twin wherever it surfaces. The row's echo renders the keyed sentence with `echo="stack"` (the sr-only region keeps NO echo — `Chrome`'s default is `echo = false`, `Chrome.tsx:102, 133`, so today's shared `msgNode` never shows English in the row; it becomes `msgNode(m, echo)`), which is what lets the K15-HIGH keys keep their English line on the row where Dad's cross-check reads it.

Row 1 — လက်ဖက်သုပ် / Pickled Tea Salad / "**Sep 15, 6:40 PM** ကတည်းက ကုန်သွားပြီ" in warn (dated; sr-only "တခြားနေ့ကတည်းက") — **UNLOGGED** (`code: "unlogged"`, `soldOut: false`: the put-back LANDED, only the ledger insert failed, `menu-availability.ts:176-186`; `landedSoldOut(res)` reads `false`, `lib/sold-out-landing.ts:20-23`, so the editor RECORDS it, `MenuPriceEditor.tsx:222-223`): the pill has flipped in place to **"ကုန်ပြီ လို့ မှတ်မယ် · Mark sold out"** (warnb/warn; the English kept because `browse.price.verb.eightySix` joins `STAFF_K15_HIGH`) — the way back is the flipped verb, one tap, no timer; the echo line in --warn #a44b34: "Pickled Tea Salad မီနူးမှာ ပြန်တင်ပြီးပြီ — ဒါပေမဲ့ ဒီပြောင်းလဲမှု မှတ်တမ်း မတင်ရသေးပါ။ သင် လုပ်တာဖြစ်ကြောင်း ပိုင်ရှင်ကို ပြောပါ။" over "Pickled Tea Salad is back on, but the change wasn’t logged — tell the owner it was you." (K15-HIGH → the English survives). The stamp line stays until the refresh lands (`router.refresh()`, :244); the row stays on the shelf until the NEXT action (`keep`). Row height 92 + 4 + 21 + 16 = 133 → y224–357. The initial state.

Row 2 — မုန့်ဟင်းခါး / Mohinga / "**6:40 PM** ကတည်းက ကုန်သွားပြီ" — **STALE** (`code: "stale"`, `now: false`: someone else — the KDS Undo pill or another tablet — put it back first; the compare-and-swap refused, `menu-availability.ts:96-101`): nothing changed by this tap; `router.refresh()` (:244) lands the truth, so the pill reads **"ကုန်ပြီ လို့ မှတ်မယ် · Mark sold out"** (it IS back on) and the row leaves the shelf on the next action; echo in --warn, Burmese alone (not HIGH): "Mohinga ကို တစ်ယောက်ယောက်က မီနူးမှာ ပြန်တင်ပြီးပြီ — ဘာမှ မပြောင်းပါ။" The way out is already on screen: nothing to do, or tap again to mark it sold out. Acted height 92 + 4 + 21 = 117.

Row 3 — ရှမ်းခေါက်ဆွဲ / Shan Noodles / "**7:12 PM** ကတည်းက ကုန်သွားပြီ" — **OUTAGE** (`code: "sentence"` carrying `AVAILABILITY_OUTAGE`, :72, :90, :128, :142): the pill is **"ပြန်တင် · Put back"** again, live (the retry is the way out; `browse.price.verb.putBack` joins K15-HIGH, so the English stays); echo in --warn: "မီနူးနဲ့ ခုလောလောဆယ် ဆက်သွယ်လို့ မရပါ — ဘာမှ မပြောင်းပါ။ ခဏနေ ထပ်စမ်းကြည့်ပါ။" over "Can’t reach the menu right now — nothing changed. Try again in a moment." (HIGH). The row is otherwise unchanged. Acted height 133.

The pill through all three: `.ui-btn.ui-btn-sm` wearing the restore or warn tint; BUSY (the frame between the tap and the answer, transient): the words stay, `aria-busy` + `aria-disabled`, full ink, the 1em currentColor ring before the label; a second tap is refused on `flippingRef` (:197). Nothing dims, nothing says "…".

**Sections** follow from ≈y620 (after the acted shelf): `h2` "All-Day Breakfast" `lang="en"` tabindex -1; `.staff-inset-col` rows 62px: L1 name_my 17 Padauk 700 · L2 name_en 13 `lang="en"`; RIGHT only the availability pill — **"ကုန်ပြီ လို့ မှတ်မယ် · Mark sold out"** (K15-HIGH keeps the English on a Burmese-only tablet — today it would NOT: `browse.price.verb.eightySix` and `.putBack` are not in the set, `staff.ts:4841-4990`) or "ပြန်တင် · Put back" on Mohinga/Shan Noodles — no price pill for a server (`canEditPrice` false). Visible rows before the frame clips: Kyay-O / Si-Chat · Mee-Shay · Mohinga (its tag " · 6:40 PM ကတည်းက ကုန်သွားပြီ" after the English) · Nan-Gyi Mont Ti · Ohno Khao-Swe.

Below the fold: the remaining sections; FOOT 13px #726859: "ဘယ်သူ ပြောင်းတယ်ဆိုတာ အကုန် မှတ်ထားပါတယ်။" alone.

### STATES (the code→key map, every arm)

- OUTAGE (`sentence` carrying the gate's or a read's `AVAILABILITY_OUTAGE`) → `browse.price.err.outage` (HIGH); verb live; nothing changed.
- STALE, the server now holds sold out (`now: true`) → `browse.price.err.stale.off` "Someone else already marked {x} sold out — nothing changed."; STALE, now available (`now: false`) → `.stale.on` "Someone else already marked {x} available — nothing changed." (`menu-availability.ts:99, 148`); the refresh shows the TRUE verb.
- UNLOGGED, sold out landed → `.unlogged.off` "{x} is sold out, but the change wasn’t logged — tell the owner it was you." (HIGH); back on landed → `.unlogged.on` (HIGH) (:182); the verb flips as on success AND the sentence is said — never swallowed into a clean success.
- GONE (`code: "gone"`, :92, :145) → the shipped `kds.err.86.gone` "{x} is no longer on the menu." / "{x} က မီနူးမှာ မရှိတော့ပါ။" (:381); the row leaves on the refresh.
- INVALID (:65) → the English sentence as today (a request the client built wrong is a bug, not a service moment).
- THROWN (dead radio) → `browse.price.err.flipUnknown` as today (:1636-1639; `MenuPriceEditor.tsx:233-238`).
- The board's own `eightySixOutcome` `unlogged` arm (`lib/kds-errors.ts:72-76`, English verbatim today) is keyed with the SAME `.unlogged.off/.on` pair (graft 4); the board's 6 s Undo pill is still offered there because the flag landed (`KdsBoard.tsx:1468-1471`, :1302-1317) — not drawn on this screen (it is the menu page).
- Every English value above is the server's sentence VERBATIM, so nothing a manager reads under `lang="en"` changes (Chrome rule 1).
- GUARDS (red-first, parsed): (1) a unit test over `SoldOutErrCode` asserting every code except `invalid` maps to a key the editor renders whose `en` is string-equal to the server's sentence with the same slots filled and whose `my` is non-empty; (2) every custom constant passed as `staffGate(role, X)` across `apps/qr/lib` is a key of `OUTAGE_TWINS` — made to fail by deleting the market twin, then restored (M332's ask).

### COPY (English)

- Menu availability · ← Kitchen · Kitchen menu · Market · All · Sold out (3)
- Nobody can order it until someone puts it back, and there is no timer that does it for you.
- sold out since 6:40 PM · sold out since Sep 15, 6:40 PM · From another day (sr-only)
- Put back · Mark sold out
- Can’t reach the menu right now — nothing changed. Try again in a moment. (`menu-availability.ts:59-60`)
- Someone else already marked Mohinga sold out — nothing changed. · Someone else already marked Mohinga available — nothing changed. (:99, :148)
- Pickled Tea Salad is sold out, but the change wasn’t logged — tell the owner it was you. · Pickled Tea Salad is back on, but the change wasn’t logged — tell the owner it was you. (:182)
- {x} is no longer on the menu. (`kds.err.86.gone` :381)
- Couldn’t reach the menu — {x} may or may not have changed. Check the row and try again. (:1637)
- Couldn’t read that request — nothing changed. (`code: "invalid"`, :65 — stays English by design)
- Every change is recorded with your name.

### COPY (Burmese) — source beside each; the five misfire twins are the quiet concept's drafts (`m20.json` → Empty Pans First → screen 3 `copy_my`)

- K15 DRAFT (HIGH) — `browse.price.err.outage`: "မီနူးနဲ့ ခုလောလောဆယ် ဆက်သွယ်လို့ မရပါ — ဘာမှ မပြောင်းပါ။ ခဏနေ ထပ်စမ်းကြည့်ပါ။" (the shipped `browse.market.err.outage` MY, `staff.ts:1714`, word for word with စျေးစာရင်း → မီနူး from `browse.price.title` :1539).
- K15 DRAFT — `browse.price.err.stale.off`: "{x} ကို တစ်ယောက်ယောက်က ကုန်သွားပြီ လို့ မှတ်ထားပြီးပြီ — ဘာမှ မပြောင်းပါ။" (grounded: တစ်ယောက်ယောက် :1548; ကုန်သွားပြီ လို့ မှတ်ပြီးပြီ `kds.live.86` :338; ဘာမှ မပြောင်းပါ :1714).
- K15 DRAFT — `browse.price.err.stale.on`: "{x} ကို တစ်ယောက်ယောက်က မီနူးမှာ ပြန်တင်ပြီးပြီ — ဘာမှ မပြောင်းပါ။" (grounded: မီနူးမှာ ပြန်တင်ပြီးပြီ `browse.price.live.on` :1630).
- K15 DRAFT (HIGH) — `browse.price.err.unlogged.off`: "{x} ကုန်သွားပြီ — ဒါပေမဲ့ ဒီပြောင်းလဲမှု မှတ်တမ်း မတင်ရသေးပါ။ သင် လုပ်တာဖြစ်ကြောင်း ပိုင်ရှင်ကို ပြောပါ။" (grounded: {x} ကုန်သွားပြီ :1626; မှတ်တမ်း မတင်ရသေးပါ :639; ပိုင်ရှင်ကို ပြောပါ :1388).
- K15 DRAFT (HIGH) — `browse.price.err.unlogged.on`: "{x} မီနူးမှာ ပြန်တင်ပြီးပြီ — ဒါပေမဲ့ ဒီပြောင်းလဲမှု မှတ်တမ်း မတင်ရသေးပါ။ သင် လုပ်တာဖြစ်ကြောင်း ပိုင်ရှင်ကို ပြောပါ။"
- SHIPPED: {x} က မီနူးမှာ မရှိတော့ပါ။ (`kds.err.86.gone` :381) · မီနူးနဲ့ ဆက်သွယ်လို့ မရပါ — {x} ပြောင်းသွားလား မသေချာပါ။ အတန်းကို ကြည့်ပြီး ထပ်စမ်းပါ။ (:1638) · {x} ကို မီနူးမှာ ပြန်တင်ပြီးပြီ။ (:1630) · {x} ကုန်သွားပြီ — ပြန်မတင်မချင်း ဘယ်သူမှ မမှာနိုင်ပါ။ (:1626) · ပြန်တင် · ကုန်ပြီ လို့ မှတ်မယ် (:1584-1585) · မီနူး ရနိုင်မှု (:1540) · the shelf words of screen 1.
- K15 DRAFT — ← မီးဖိုချောင် (`kds.back`) · တခြားနေ့ကတည်းက (sr-only).
- `{x}` is the English `nameEn` inside the Burmese run, wrapped `lang="en"` by Chrome rule 3 (the row shows `name_my` above it; no `varsMy` change in this slice).

### A11Y

- ONE live region (the sr-only `role="status"`), device-language, no echo: it says each outcome once; the acted row echoes the same words `aria-hidden` (with the row's own echo policy, so a HIGH sentence shows its English line visibly — the region never doubles it).
- A refusal never moves focus (§17): the pill the thumb pressed keeps focus through busy, refusal and landing, flipping its verb in place; its accessible name follows the verb (`al()`), so after an unlogged landing it reads "ကုန်ပြီ လို့ မှတ်မယ် · Mark sold out Pickled Tea Salad".
- Nothing natively disabled anywhere; busy = `aria-busy` + `aria-disabled` + the ref; opacity 1.
- The echo line is `aria-hidden` (the region said it); it rises with `mms-rise`, static under reduced motion.
- Every Burmese run `lang="my"`, Padauk 700/400, lh 1.6, ≥13px; the dish name and the clock `lang="en"` inside it; no letter-spacing on Padauk.
- The dated row's three cues (warn ink, the date in text, the sr-only sentence) survive Burmese-only unchanged.
- On the artboard the three outcome states are reached through the rows' REAL controls (the pills), one at a time — no step dots, no captions; the orchestrator marks the entry interactive.

---

## DECISIONS

1. Backbone = Empty Pans First; all nine grafts applied, D8 followed exactly (the judgement; `common.md` D8).
2. Device-language first on every row — `name_my` 17px Padauk 700 over the English 13px `lang="en"`, English alone where none exists (graft 1; DESIGN-LANGUAGE §6 P1 order; `globals.css:9322-9340`; `name_my: string | null`).
3. The no-timer truth sits under the shelf head as a 13px sub-line cut from the SHIPPED `leadServer` (graft 2; `staff.ts:1546-1548`); the foot keeps one line per role — the server's last sentence, the manager's first and last (its middle sentence is already `confirmDetail`, :1601-1604).
4. The since-clock is the shelf row's hero: a new key `browse.price.shelf.since` holding the shipped stamp's words without the joiner, the `{t}` span at 17px 800 tabular; a dated stamp = warn ink + the date in text + sr-only "From another day" (graft 7; `staff.ts:1564-1567`; `sold-out-since.ts:14-18`; no dashed frame — the held idiom means something else).
5. The KDS door draws "0" as a live link when the read succeeded and hides only on `null` (graft 3); the count is one advisory HEAD read beside the snapshot, `soldOutCount: number | null` on `KitchenQueue` next to `served`/`stops`, never a change to the gating menu read (graft 6; `kitchen.ts:263-290`; `kitchen-types.ts` `stops: null` precedent); never bumped locally.
6. The door's label is `kds.86.done` through `<Chrome echo="inline">` — the key is K15-HIGH, so "Sold out" survives Burmese-only on every device (`staff.ts:242, 4870`; `Chrome.tsx:46-58`); Open/Late keep `ts()` with no echo (K27).
7. The door's accessible name is the shipped draft `floor.kitchen.soldOut` + `floor.nav.menuAvailability` as sr-only text, the visible numeral and label `aria-hidden` — it says "dishes, board-wide" where Open/Late are station-filtered (graft 8; `staff.ts:3712, 1149`; `KdsBoard.tsx:1095, 1679`); label-in-name holds by containment.
8. `#sold-out` is the deep link with `scroll-margin-top: var(--staff-bar-h)` — the bar's own variable, not a literal 84 (graft 5; DESIGN-LANGUAGE:724-725); every `h2` is `tabindex="-1"` and a chip press moves focus to the shown section's head (graft 9); chips stay FILTERS (§28) and nothing sticks beside the bar (§17, DESIGN-LANGUAGE:718-723).
9. Chips carry no echo — "အားလုံး", not "အားလုံး · All" (owner 2026-09-05; `OrderPad.tsx:1466`; `MenuPriceEditor.tsx:453-460`) — a correction to the quiet artboard.
10. The KDS live-region line is device-language only — a correction to the quiet artboard's bilingual line (`KdsBoard.tsx:1795-1799`).
11. Busy keeps full ink: the row pill becomes the `@mms/ui` Button at size sm so `aria-busy` → opacity 1 with the 1em spinner (`primitives.css:56-59, 144-150`; static ring under reduced motion :450-455); the "…" swap at `MenuPriceEditor.tsx:553` is retired (D8).
12. `browse.price.verb.eightySix` and `.putBack` join `STAFF_K15_HIGH` — today a Burmese-only tablet loses the English under both pills (`staff.ts:4841-4990` lacks them); an owner call, recommended as the judges' keep.
13. Refusals are keyed by `code` (`menu-availability.ts:53-57`; the KDS's `eightySixOutcome` pattern, `kds-errors.ts:64-78`): five new keys, `stale` gains `now`, `AVAILABILITY_OUTAGE` moves to `staff-outage.ts` and joins `OUTAGE_TWINS` (`Chrome.tsx:157-170`), the board's own `unlogged` arm takes the same pair (graft 4; `kds-errors.ts:72-76`); two parsed red-first guards (D8, M332).
14. The row echo renders with `echo="stack"` while the region keeps none — `Chrome` defaults to `echo = false` (`Chrome.tsx:102, 133`), so today's shared `msgNode` can never show a HIGH sentence's English in the row; `msgNode(m, echo)` splits the policy, the words stay one rendering.
15. `{x}` stays `nameEn` in every sentence (`MenuPriceEditor.tsx:212-216, 250`); the row shows `name_my` above it, so no `varsMy` change in this slice.
16. The price pill is the manager's edit door (name via `al()` with `verb.edit`, `MenuPriceEditor.tsx:568-576`); the separate Edit ghost goes; a successful save parks focus on the row's price pill instead of the search field (:383-387).
17. Search: the pad's 44px circle + rail at ≥720px; under 720px today's field stays open at rest and no circle is drawn — reachable in one tap either way (the judges' keep; `MenuPriceEditor.tsx:434-443`).
18. The shelf head reuses `browse.price.soldOutOnly` (the chip's key) — no new title Burmese.
19. Leading on a kitchen-door device is `kds.back` "← Kitchen" beside the shipped counter arm (`page.tsx:104-108`; the `kitchen` door value exists, `staff-door.ts:21, 35-38`); screen 1 is drawn on that device (the KDS door's own landing), screen 3 too.
20. Prices and `name_my` spellings are the catalog's (`docs/data/menu_catalog.json`: Pickled Tea Salad is လက်ဖက်သုပ်, $14.00) — the concept boards' $9.50 and the quiet board's လက်ဖတ်သုပ် are corrected.
21. A server's rows carry no price (A's subtraction; one boolean, reversible).
22. The shelf is a one-column `.staff-inset` modifier — the default grid would split the 600px column into two 300px tracks (`globals.css:12425-12428`; the judges' measurement).
23. The empty shelf is a sentence, never an absent shelf: `browse.price.shelf.empty` with the quiet brief's draft.
24. Screen 3 is a stateful artboard (one acted row at a time through the rows' real pills) rather than a three-echo composite, because the editor holds ONE `msg` (`MenuPriceEditor.tsx:200, 471-472`).
25. P2az · P2ax · P2ay hold: nothing is added to a ticket line; the ⋯ renders only where `canEightySix` (`KdsBoard.tsx:2835`; `kds-line.ts:21-23`); the diner side is untouched (M300, J64+T45: `setItemSoldOut` revalidates the same three paths, `menu-availability.ts:172-174`); K50 untouched.

## OPEN RISKS

1. **K15:** seven Claude drafts (`err.outage` HIGH · `err.unlogged.off/.on` HIGH · `err.stale.off/.on` · `shelf.empty` · the sr-only "From another day") plus `kds.back` and two re-cuts of shipped words (`shelf.noTimer`, `shelf.since`) await the native sitting; the outage and unlogged pairs are HIGH and should be read first.
2. **A latent CSS defect the new label exposes:** `.kds-stat span` sets `letter-spacing: var(--track-wide)` and `text-transform: uppercase` at (0,1,1) (`globals.css:8892-8898`), which out-specifies the global `[lang="my"] { letter-spacing: normal }` (0,1,0) at :76 — so the Burmese Open/Late labels are TRACKED today, which `check:staff-lang` rule 5 forbids in markup but cannot see in CSS. The door's label needs a `.kds-stat [lang="my"] { letter-spacing: normal }` rule, and the two shipped labels should be measured and fixed in the same PR (a parsed test over the stylesheet, the `KdsBoard.test.tsx:1750` shape).
3. **One more read per poll:** the advisory HEAD count adds a PostgREST round-trip every ≤5 s per board; it must run in the parallel step and answer `null` on failure, never `outage` (`kitchen.ts:290`) — a test that a failed count still answers `ok: true`.
4. **Row heights with Burmese first:** 92px shelf rows and 62px section rows assume one-line `name_my` at 17px in ≈220px (manager rows) — measure the longest catalog names (e.g. ဒံပေါက် ကြက်သား) with the real Padauk before pinning; a wrap grows the row, never truncates.
5. **MONEY_PATHS:** `menu-availability.ts` holds mutants (`verify-slice.mjs`); the `now` boolean and the moved constant need `--only=` runs; `groupByCategory` / `soldOutShelf` in `lib/menu-browse.ts` need mutants or an in-file exemption (`check-money-coverage.mjs`).
6. **Catalog order replaces A→Z** (`page.tsx:82`): a manager used to the alphabet loses it; the search keeps the find; reversible in one `.order()`.
7. **The K15-HIGH additions** change what a Burmese-only tablet shows under both pills — the owner should confirm (ruling-grade: it widens "where a wrong word stops service").
8. **Prod's category count is unknown** (seed 8 vs `MENU_REFERENCE` 9 — a Desserts section); the rail renders the DB; a category with no active dish has no chip.
9. **Hiding the door's visible text from AT** (`aria-hidden` on the numeral and label, the sr-only name instead) is sound by WCAG 2.5.3 containment but is a pattern the console has not used on a link before — verify with VoiceOver at the device sitting (#12).
10. **The sub-line is the SERVER's sentence on a manager's page too** ("…until someone puts it back…"); the owner may prefer the manager's own words — one key swap.
11. **Two numeral systems one tap apart:** the chip's "(၃)" (prose count → Burmese numerals, `staff.ts:1569-1570`) against the strip's Latin "3" (digits stay Latin on the board) — today's shipped behaviour for Open/Late, noted so it is not read as a drift.
12. **`var(--staff-bar-h)`** is assumed to track the measured bar height (68 single-line vs 84 stacked); confirm the variable is set from the measured bar on this page before relying on it for the deep link.

---

## Appendix — what changed after this spec (applied in the drawn screens)

The spec above was written first. Two later passes changed it, and the screens on the canvas were drawn
with both applied. **Where an item below contradicts the spec above, the item below wins.**

### A · System amendments (the cross-moment consistency pass)

**The shared vocabulary (every moment takes it):** ONE VOICE, TWO REGISTERS; ONE SET OF MARKS (the 2026-10-07 vocabulary, PATH_DESIGN_2026-10-07.md:74-135, extended — never paralleled). DINER (m13–m16, guided, English leading; D5's "မင်္ဂလာပါ · Good evening" is the one Burmese-first line): each screen says NOW once as its heading; then ONE actor-first next-step sentence with no label — when the hero is DOCKED its one line slot carries that sentence (live) or the hero's held reason (held), never both and never a third line ("Ready to pay." is neither); the Order · Pay rail (+ /track's status path) is the only step vocabulary, so no dots, rings or "n of m" marks appear beside it; a shared cart never shows a count; inside any window the words are future/-ing, past tense only after a confirmed write; a link's Burmese rides inline after the English (margin, never a whitespace flex child), stacking inside the same ≥44px target only when it does not fit; back links are the shipped `.nav-link` (14px 700 `--ac`, arrow aria-hidden) with Burmese ≥13px. STAFF (m17–m20, glanceable, Burmese first, English echo stacked on headings/slots, inline on count lines, NEVER on a 44px chip): the next step lives in the control's own words; counts in prose render Burmese numerals under `my` (`fill.ts` `{n}`), standalone figures (clocks, money, codes, table numbers, the KDS stat row) stay Latin; every refusal is keyed by code and twinned in `OUTAGE_TWINS`. SHARED MARKS: lit-gold cap (`--ac` fill, `--oa` ink, sheen + gold halo; `.checkout-pill-on` on phones, the `.kds-chip[aria-pressed]`/`.staff-seg` rule on the console) = chosen or you-are-here, never a recommendation, never a status; solid ✓ disc in `--ok` = done (a diner line answered, PAID on a settled row); half disc (left `--warn`, right paper) = partly returned; full `--warn` disc = returned in full; HOLLOW RING = "Not sent yet · မပို့ရသေး" and nothing else (`--t2` on phones, `--warn` on the console) — no eyebrow dot, no refund state, no inert control may use it; DASHED `--ac` edge on `--sf` = provisional, which on every surface here means the open Undo window (the diner's `.arrival-undo`/`.checkout-undo`, the console's `.clear-undo`/`undoBtn`): the SAME node that committed relabels "Undo" + the D3 Burmese (ပြန်ဖျက် when a mark you made is erased, ပြန်ယူ when something sent comes back), arms after the same-gesture guard (350 ms phones / 400 ms console), writes at `PICKED_UNDO_MS` named once per consumer (`FEEDBACK_UNDO_MS`, `TEAM_UNDO_MS`, `ARRIVAL_UNDO_MS` = 6 000), the seconds an aria-hidden leaf in the register's shipped shape (diner " — 6s", staff "· 6s"), the KDS cream pill its one shipped exception, Esc never an Undo unless every window has it; HELD/INERT CONTROL = the real control at its real shape, `aria-disabled` (never native) with the reason in its name or `aria-describedby`, dimmed by the shipped rule (`.ui-btn` .55, `.checkout-pill` .65, `.staff-btn` .6) — never a dashed ghost, never a hollow ring; BUSY = `aria-busy` with the label KEPT (on a `.staff-btn` plus the .6 dim — D8; on an `@mms/ui .ui-btn` the full-ink spinner plus a stated word like "Refunding…"), never "…", never native disabled, and busy marks only the ONE control that is writing (the zone's fact is `aria-disabled`); WARN = a 6px `--warn` disc (the one warn mark; no squares, no second glyph) beside a word — light: the word in `--warn` (the console's shipped `.entry-msg-warn`/`Badge warn` pair); Night: the word in `--tx`, only the mark in `--warn` (P2bm) — a warn GROUND fill only on a Late ticket/bag, the floor's one ask tile and the money-in-doubt badge; GREEN = done and settled, calm (never counted, never pulsing, filled only where it just landed: the picked header, the ✓ disc); GOLD TINT = the till (money taken/owed/waived) and the brand mark, never an alarm; a REMOVING verb (Deactivate, Mark sold out) is a paper pill with `--warn` ink, a RESTORING verb (Reactivate, Put back) a paper pill with `--ok` ink — no tinted fills on routine verbs so nothing shouts during normal service; CHEVRON › = opens/collapsed, ⌄ = expanded, inside the row button; one dismiss word "Close · ပိတ်", one cancel word "Cancel · မလုပ်တော့(ပါ)", one search field recipe on the console (the pad's 48px `--sf` radius-12 field + the 44px `pad.search.clear` circle); ONE live region per view, the count/kicker/hint/next-step lines all static; the receipt code is ONE glyph string on both sides of the counter ("#A1B2C3" on the guest's slip and on Dad's desk); the ONE KITCHEN TRACK's stamps (ပို့ပြီး · ချက်နေဆဲ · ထုတ်ပြီး) are the words for the kitchen's state on every surface that shows it. LOUDNESS LADDER (console): ALARM may tint and move — KDS Late, a late bag, money in doubt (the stranded charge, the unpaid badge) said once in the view's one region; CALL — one filled tile per room (the guest asking to pay, the rung lane card's one-shot ring); MARK — glyph + word, no fill, no motion (refund shapes, the dated since-clock, the not-sent ring, dashed pending, the stale disc); CALM — done, paid, picked up, put back. No fact is marked twice on one screen; delight is one moment per pass, never on a first read or inside a window; glass is Night-only, the bar alone.

**This moment's amendments:**

1. BUSY per D8 exactly: the row pill keeps its label with `aria-busy` + the 0.6 dim (the `.staff-btn[aria-busy]` / `[aria-disabled]` rule the lane uses, globals.css:4249-4256), no spinner, never "…". Decision 11's move to the `@mms/ui` Button (opacity 1 + 1em spinner) is the primitive's other lawful busy (DESIGN-LANGUAGE.md:779-781 — which also wants a STATED word like "Putting back…"); it is not D8's. Keep the pill a `.staff-btn`-class control, or record the deviation as an owner question.
2. Put back and Mark sold out become PAPER pills with ink by direction — `--ok` ink + `color-mix(--ok 40%, --bd)` hairline for Put back, `--warn` ink + warn-mixed hairline for Mark sold out — dropping the shipped `--okb` / `--warnb` fills (`restoreBtn` / `eightySixBtn`): a warn GROUND fill is reserved for a Late ticket, the ask tile and the money-in-doubt badge (PATH_DESIGN:116-119), and forty warn-filled pills on /staff/menu nag during normal service; this is the same verb recipe as m18's Deactivate/Reactivate. One CSS change each; add both to `composite-contrast`'s pairs.
3. The dated since-clock gains the ONE warn mark: a 6px `--warn` disc before the clock on a row from another day (both themes), so in Night — where P2bm turns the words `--tx` — a warn cue survives; the date in text and the sr-only "From another day" stay. In light the words keep the shipped `soldOutTagOld` warn ink.
4. Section rows: the sold-out tag after the English name (" · 6:40 PM ကတည်းက ကုန်သွားပြီ") keeps the shipped 0.55em warn dot (`.kds-line-off-dot`) rather than none — the same 6px-class warn disc + word that the KDS line tag and m17's rows use; one warn mark on the console.
5. The KDS door and chip numerals: keep as specified (prose count "(၃)" Burmese, the stat figure Latin — `fill.ts`'s construction rule) and point OPEN RISK 11 at `fill.ts:27-34` so a reader sees it is the owner's 2026-09-05 rule, not drift.

### B · The adversarial critic's blocking fixes (verdict: fix)

1. **BUSY does not follow D8 or amendment 1. The spec moves the row pill to the @mms/ui Button and draws busy at opacity 1 with a 1em spinner. D8 and amendment 1 both require the label kept, aria-busy and the 0.6 dim on a .staff-btn-class control, with no spinner.**
   - Evidence: Spec Decision 11 and screen-1 layout line 47 ('opacity stays 1 … .ui-btn-spinner'), STATES BUSY line 71, screen 3 line 238 ('the 1em currentColor ring … Nothing dims'). common.md D8: 'the busy pill keeps its label (`aria-busy` + dim, never '…')'. amend.md m20 #1 (globals.css:4249-4256 .staff-btn[aria-disabled] rule). DESIGN-LANGUAGE.md:779-781: a .ui-btn busy also needs a stated word, and the spec gives none.
   - Fix: Keep the pill a `.staff-btn` (MenuPriceEditor.tsx:520-526 already sets aria-busy and aria-disabled). Busy = the label unchanged + aria-busy + the shipped 0.6 dim, with no spinner. Delete the spinner and the opacity-1 wording from Decision 11, screen 1, STATES and screen 3, or record the deviation as an owner question.
2. **Amendment 2 is not applied. Put back and Mark sold out keep the shipped --okb/--warnb FILLS. A warn ground is reserved for Late, the ask tile and money in doubt, so a 115-row page with dozens of warn-filled pills nags during normal service.**
   - Evidence: Spec lines 47 and 58 ('bg --okb #eaf2ec', 'bg --warnb #f6e9e4', the shipped restoreBtn/eightySixBtn, MenuPriceEditor.tsx:782-803). Line 142 lists '--ok on --okb, --warn on --warnb' as the contrast pairs. amend.md m20 #2. vocab.md: 'a REMOVING verb … is a paper pill with --warn ink, a RESTORING verb … a paper pill with --ok ink — no tinted fills on routine verbs'.
   - Fix: Redraw both verbs as paper pills (--cd ground): --ok ink with a color-mix(--ok 40%, --bd) hairline, and --warn ink with a warn-mixed hairline. Update the Night tokens too. Replace the contrast pairs with --ok on --cd and --warn on --cd (measured 5.96:1 and 5.68:1 light), and add both pairs to composite-contrast.test.ts.
3. **Amendment 3 is not applied. The dated since-clock has no 6px --warn disc, so in Night (P2bm: warn words turn --tx) a row from another day keeps no warn cue. The spec also still draws the Night words in --warn, against P2bm.**
   - Evidence: Spec line 46 ('warn ink + the date in text + the sr-only sentence; NO dashed frame' — no disc), line 79 (Night: warn tokens swap, words stay warn), Decision 4, A11Y line 140. amend.md m20 #3. vocab.md WARN: 'Night: the word in --tx, only the mark in --warn (P2bm)'.
   - Fix: Add the 6px --warn disc before the clock on a dated row, aria-hidden, in both themes. In Night set the words to --tx and keep only the disc in --warn. Keep the date in the text and the sr-only 'From another day'.
4. **Amendment 4 is not applied. The section-row sold-out tag is drawn with no warn dot, although the shipped .kds-line-off-dot (0.55em) is the console's one warn mark.**
   - Evidence: Spec line 55 ('a sold-out dish keeps the SHIPPED tag after its English name at 13px #726859 … no echo') — no dot. Screen 3 line 240 is the same. amend.md m20 #4. globals.css:9313-9320 `.kds-line-off-dot`.
   - Fix: Put the `.kds-line-off-dot` warn disc (aria-hidden) before ' · {t} ကတည်းက ကုန်သွားပြီ' on every sold-out section row, on screens 1 and 3.
5. **D8 is not applied. D8 says the sections sit under a JUMP rail; the spec makes the chips FILTERS (a press hides every other section) and claims 'D8 followed exactly'. A shipped jump-rail precedent exists: the counter's zone strip, with aria-current="location" chips that anchor to zone headings.**
   - Evidence: common.md D8: 'category-grouped sections under a jump rail in the lit-gold cap'. Spec Decision 1 ('D8 followed exactly'), Decision 8 ('chips stay FILTERS (§28)'), STATES 'CATEGORY PRESSED … only that section renders' (line 68). Precedent: globals.css:11979-12000 (.staff-zone-strip, one anchor per zone heading, on --staff-bar-h) and globals.css:8986 `.staff-zone-chip[aria-current="location"]` in the lit-cap rule.
   - Fix: Make the category chips jumps: tap → scroll to that section's h2 (smooth, auto under reduced motion), focus to the h2, and the chip lit by aria-current="location". Keep All and Sold out (n) as the shelf's filters if wanted. Otherwise record the deviation as an owner question and stop claiming D8 is applied exactly.
6. **D8 names the shelf 'Sold out now'; the spec heads it 'ကုန်သွားတာ (၃) · Sold out (3)' (the chip's key) and still claims D8 is applied exactly.**
   - Evidence: common.md D8: '/staff/menu opens on the "Sold out now" shelf'. Spec line 35 and Decision 18 ('The shelf head reuses browse.price.soldOutOnly'). A K15 draft for the title exists in brief-m20.md (glance concept COPY: 'Sold out now' → 'အခု ကုန်နေတာ').
   - Fix: Title the shelf 'Sold out now' with the brief's K15 draft (flagged). The count can stay in the chip. Or list the rename as an owner question.
7. **The code→key map promises 'every English value is the server's sentence VERBATIM', and its guard (1) asserts it, but two arms break that. GONE: the server says 'That dish is no longer on the menu.' while the mapped kds.err.86.gone says '{x} is no longer on the menu.'. SENTENCE: the code also carries the gate's STAFF_SIGNIN_REQUIRED, which a by-code map would render as 'Can't reach the menu right now … Try again in a moment.' That is false, because a retry can never succeed until the person signs in. As written, guard (1) cannot pass.**
   - Evidence: Spec lines 230, 246, 249, 253, 254 guard (1). menu-availability.ts:92 and :145 ('That dish is no longer on the menu.'), :71-72 (gate.error → code 'sentence'). lib/staff.ts:168-177 (staffGate returns STAFF_SIGNIN_REQUIRED or a role sentence). The KDS precedent passes `sentence` through verbatim: kds-errors.ts:66-67.
   - Fix: Map `sentence` to browse.price.err.outage ONLY when error === AVAILABILITY_OUTAGE. Any other sentence goes through <OutageText> verbatim (or a sign-in arm that leaves for /staff/login). For GONE, either keep the server sentence or change the server string to name the dish. Then restate guard (1) per arm: string-equal only where the server sentence is fixed, and name `sentence` and `gone` explicitly.
8. **Guard (2) ('every custom constant passed as staffGate(role, X) across apps/qr/lib is a key of OUTAGE_TWINS') ships RED: menu-price.ts passes PRICE_OUTAGE, which has no twin, and the spec drafts none.**
   - Evidence: git grep at 09c1c2a: apps/qr/lib/menu-price.ts:64 `staffGate("manager", PRICE_OUTAGE)` (defined at :51). Chrome.tsx:157-168 OUTAGE_TWINS holds no PRICE_OUTAGE. Spec line 254 guard (2), OPEN RISK 1 (lists no price twin).
   - Fix: Either draft a PRICE_OUTAGE twin as a K15 draft (grounded the way the outage twin is, on browse.market.err.outage MY staff.ts:1714), move it to staff-outage.ts and add it to OUTAGE_TWINS, or scope the guard to the availability and market constants and say so.
9. **An echo on a 44px chip. The bar's segment links draw 'မီးဖိုချောင် မီနူး · Kitchen menu' and 'စျေး · Market', against the owner's 2026-09-05 rule, the vocabulary and the spec's own Decision 9; today's ShelfSwitch renders them with no echo. The spec also claims the shared rule lights `.kds-chip[aria-current="page"]`, but that rule covers only `.staff-chip[aria-current="page"]`.**
   - Evidence: Spec line 23. page.tsx:236 and :244 `<Chrome k="browse.shelf.menu" />` (no echo). vocab.md: 'English echo … NEVER on a 44px chip'. OrderPad.tsx:1467. globals.css:8977-8987: the selector list has `.staff-seg > .kds-chip[aria-pressed="true"]` and `.staff-chip[aria-current="page"]` but no `.kds-chip[aria-current]`.
   - Fix: Segments carry one tongue, no echo, as shipped. Name the CSS change: add `.staff-seg > .kds-chip[aria-current="page"]` to the lit-cap rule, or keep `.staff-chip` links.
10. **The price pill's accessible name drops its visible label. The pill shows '$20.00' but is named 'Edit Kyay-O / Si-Chat'. That fails WCAG 2.5.3 (Level A): a voice user saying the price misses the control. A screen-reader manager also never hears the price, which today is a separate readable span.**

- Evidence: Spec line 57 and Decision 16 (aria-label via al() with browse.price.verb.edit). Today the price is its own span, MenuPriceEditor.tsx:519, and the Edit button's visible word 'Edit' is inside its name, :568-578.
- Fix: Put the price in the name and keep the visible text inside it: e.g. sr-only verb + visible amount, in the form 'Edit Kyay-O / Si-Chat, $20.00', with the visible '$20.00' contained. Or keep a visible 'Edit'/'ပြင်' word in the pill. Pin it with the al() rule-3c shape.

11. **The since-clock 'hero' cannot render on an English-language device. The 17px 800 clock relies on Chrome rule 3 wrapping {t} in a lang="en" span, but Chrome's English branch returns a bare text node with no span to size.**

- Evidence: Spec line 45 ('`{t}` is wrapped lang="en" by Chrome rule 3 … a row-scoped rule sizes that span'). Chrome.tsx:125-126 (`if (lang === "en") return <>{en}</>`). Only renderMyTemplate wraps slots, :69-95.
- Fix: Render the clock as its own element outside the template on every device (split the key into the clock node + the words, or add a slot-render helper), or state that English devices get no hero clock.

12. **Burmese below the spec's own 13px floor in a staff state. The EDIT reasons and the confirm lead/detail are specified at 11px (--fs-xs) and render Burmese with echo="stack", while A11Y claims '13px floor everywhere'.**

- Evidence: Spec line 74 ('the stated reason under it in --warn 11px'; 'Confirm the new price 11px 800'; 'the detail sentence 11px'). MenuPriceEditor.tsx:830-834 hintLine, :863-878 confirmLead/confirmDetail at var(--fs-xs). tokens.css:51 --fs-xs = 11px. Spec A11Y line 139.
- Fix: Set the hint line, the confirm lead and the confirm detail to --fs-sm (13px) wherever a Burmese run renders, or scope 11px to the English echo only. Re-measure the confirm group's height.

13. **OPEN RISK 2 claims a defect the code does not have. It says the Burmese Open/Late labels are tracked and uppercased today and asks for a new `.kds-stat [lang="my"]` rule plus a test. Every staff page sits inside `.stx-root`, and `.stx-root [lang="my"]` (0,2,0) already beats `.kds-stat span` (0,1,1) with letter-spacing normal and text-transform none; the stylesheet's own comment names exactly this case.**

- Evidence: globals.css:10365-10382 (comment: '`.chrome-my` alone … LOSES to … `.kds-stat span` (0,1,1) … Each arm here is (0,2,0), so it beats every one of them'). StaffLangProvider.tsx:63 `<div className="stx-root">`, app/staff/layout.tsx:58. Spec OPEN RISK 2 and screen-2 lines 164 and 207.
- Fix: Remove OPEN RISK 2 and the redundant rule. Cite globals.css:10375-10382 as the reason the door's Burmese label is untracked.

14. **Amendment 5 is not applied, and the KDS region line is drawn with Latin digits the code does not render. OPEN RISK 11 points at staff.ts:1569-1570 instead of fill.ts:27-34. Screen 2 draws 'ဖွင့်ထားတဲ့ အော်ဒါ 4 ခု' with a Latin '4', but kds.open.many goes through tf()/fill, and {n} is a COUNT slot.**

- Evidence: amend.md m20 #5. fill.ts:27-31 (the owner's numeral rule), :37 COUNT_SLOTS has 'n', :66-69 localizeCount. KdsBoard.tsx:1837 `tf(lang, plural(count, "kds.open.one", "kds.open.many"), { n: count })`. Spec screen-2 line 167 ('`{n}` Latin').
- Fix: Point OPEN RISK 11 at fill.ts:27-34. Draw the region line as 'ဖွင့်ထားတဲ့ အော်ဒါ ၄ ခု' (Burmese numeral); the stat figures stay Latin by construction.

15. **Wrong file:line citations in the spec body.**

- Evidence: page.tsx:243 for `wrap` — it is page.tsx:253. MenuPriceEditor.tsx:762 for dollars() — it is :759. :233-238 for the flipUnknown catch — it is :224-228. ':212-216, :250' for 'as every msg carries today' an x — :212-216 is the setItemSoldOut call, and the server msg at :240 carries no x. sold-out-landing.ts:20-23 — the function is :19-22. ':255' for router.refresh — it is :254.
- Fix: Correct each citation to the 09c1c2a line shown, and re-run the citation sweep across the spec.

### C · The critic's suggestions (not blocking; take them where the build agrees)

- ShelfSwitch is also rendered by the market page (page.tsx:215). Say whether the bar seg replaces it there too, and whether the market page gets the same `door === "kitchen"` back arm (page.tsx:199), so the two shelves don't diverge.
- A dish on the shelf also appears in its section, so a Put back echo renders twice (msg.id matches both rows, MenuPriceEditor.tsx:731). Render the echo in the row whose pill was pressed only, or state that the duplication is intended.
- OPEN RISK 12 can be closed: StaffBar always mounts StaffBarNet (StaffBar.tsx:173), the one publisher of --staff-bar-h (StaffBarNet.tsx:42). Also note that `:root:has(.staff-bar)` scroll-padding-top already offsets anchors (globals.css:15139), so scroll-margin-top may double the offset.
- eightySixOutcome's signature `{ error; code }` (kds-errors.ts:64) has no soldOut, so keying the board's unlogged arm by direction (graft 4) needs the full SetItemSoldOutResult. Say so in Decision 13.
- Under 720px, today's always-open field has no clear circle, while the console's one search recipe includes the pad.search.clear circle (vocab). Add the circle to the narrow layout too.
- The KDS door's sr-only name speaks Burmese numerals ('၃ ခု …') while the visible numeral is Latin '3'. Check this at the device sitting alongside OPEN RISK 9.
