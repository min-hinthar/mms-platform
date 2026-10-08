# Picked m11: the diner's first-visit guide. "Your Pass, Explained", designed

**Backbone: GUIDED** (the owner's register for diner moments). One full-screen guide, five pages, opened
once per phone on its first dine-in landing. Each page shows ONE picture of the real thing the guest is
about to meet (their table's pass, the shared order, the live track, the Pay door, the tab bar), names it
with the app's own shipped word as the heading, and says ONE sentence about what happens next. One small
movement per page demonstrates the one thing to learn. Skip sits top-right on every page. The last
page's primary is the real first action, "Browse the menu".

**Grafted from GLANCEABLE:** the pictures are the CounterPass (constant paper, dotted perforation, 12 px
notches, the table figure) and m9's three-segment track. A guest who learned them here reads the same
marks on the Order page and on the dining-room wall.

**Grafted from QUIET:** no money, no counts, no names and no timers anywhere in the guide. Nothing
auto-advances or loops. Every heading is a string the guest will meet again in the app, so the guide
adds almost no new vocabulary.

**The owner's message this answers (2026-10-07, verbatim):** "I really like the direction of premium iOS
designs, wallet boarding pass, One pass and progress updates, visual animated step guides for customers
and staff to get familiar with the new app."

---

## What changed from the brief, because a claim failed against the code

1. **Step 4 cannot say "card / Apple Pay" today.** Production serves Stripe TEST keys (OPEN-ITEMS C2,
   measured 2026-09-07), and D5 rules the parked Bill shows "No card words and no 'coming soon'".
   → Step 4 has two variants, chosen by the same constant that parks the Bill
   (`SURFACES.dineInPhonePay`, which PD2 adds; it does not exist yet, `lib/surfaces.ts`). Before C2,
   the page teaches the counter only. The artboard draws the variant that ships when C2 flips, because
   that is the one the owner asked to see. Both are specified.
2. **"Apple Pay" alone would be false on an Android phone.** The wallet row is drawn only when the
   browser has a wallet AND the domain is registered (`components/PaymentSection.tsx:704-707`), and "a
   first visit never implies Apple Pay" (`:607-608`). → The sentence names what the restaurant accepts
   ("card, Apple Pay or Google Pay"), the way a shop sign does, and the picture draws no wallet logo.
   "Google Pay" stays only if the flip checklist sees it on an Android phone (open risk 4).
3. **"Served" is Mom's bump, not a plate at the table.** `TableTimeline.tsx:9-12` and D5: "The app
   cannot see a plate reach the table." → The guide says each dish moves "as the kitchen taps it" and
   never "when it reaches you".
4. **The guest has already scanned when the guide opens.** The guide opens on /menu after the session
   join succeeds (`app/api/session/route.ts:58-60`). → Page 1 is not "how to scan". It greets them
   (the shipped "Mingalaba"), shows the pass they just got, and teaches how their TABLEMATES join, in
   the shipped InviteSheet's words (`components/InviteSheet.tsx:74-75`).
5. **"Until the host sends" uses a word the app retired from guest copy.** "Host" is the system's role
   name, and a staff-opened table's host is simply the first diner to scan
   (`lib/confirm-copy.ts:98-104`; `lib/register.ts:155-157`). → Page 2 uses the shipped role sentence
   (`hostSendsCopy(null)`, `confirm-copy.ts:114-124`), bilingual already. A table can also have no
   diner host at all (`checkout-stage.ts:63-66`), so the quiet fallback "our staff can send it too"
   (m1's draft, true per `lib/staff-send-view.ts:178-182`) comes last.
6. **The pass with per-dish tracks is not shipped yet.** The per-line words are shipped today on the
   Order page (`lib/line-state-copy.ts:12-18`, rendered at `components/Checkout.tsx:4291` and `:4511`),
   but the One Pass progress view is D5's progress receipt and the pass primitive is post-pay's new
   `packages/ui` primitive. → The guide ships AFTER both, and its pictures render those real
   components with fixed sample props inside an inert, `aria-hidden` frame, so a picture can never
   drift from the thing it teaches.
7. **A visible "Step 2 of 5" would be a second step vocabulary** beside the Order · Bill · Pay rail,
   which PATH_DESIGN makes "the only step vocabulary" (and m1's critic retired the three-stop path for
   exactly this). → The page position lives only in the dots and their accessible names.
8. **The kit's `mms-pop` is a numeral bounce.** `@keyframes mmsPop` scales to 1.18 over 120 ms
   (`app/globals.css:903-916`). On a 270 px pill that is a 49 px swing. → The Pay door's moment uses
   RULES2's pop (scale 0.96 → 1, 180 ms). D5's own "one mms-pop" on the full-width Pay should use the
   same wide-control pop (decision 13).
9. **"First visit only" in localStorage is not durable on iOS Safari.** Script-written storage can be
   cleared after days without a visit, so a monthly regular could see the guide again. → A second,
   server-backed suppressor reuses the menu's existing recognition read (`getWelcomeBack`,
   `lib/rewards.ts:304-334`, already handed to ArrivalBeat): a signed-in account, or any paid order this
   month, never sees the guide open by itself.
10. **MenuBrowser is frozen this wave** (D1(a)). → The guide mounts from `ArrivalBeat`, the arrival
    moment diner-cart already holds under D1(a). That widens D1(a)'s scoped unfreeze by one mount line,
    so it needs the orchestrator's yes. The fallback mount is `TableCartProvider`, which diner-cart owns
    outright.

---

## World-class references, and what each brings

- **Apple's iOS setup and "What's New" sheets:** one picture, one title, one sentence, one primary
  button, and Skip in the corner. Nothing advances on its own, so the guest reads at their own pace.
- **Apple Wallet boarding pass:** the guide's pictures are the pass the guest will actually hold, with
  one identity figure, a perforation and notches. Page 1 issues it the way Wallet adds a pass.
- **iOS Live Activities (food-delivery progress on the Lock Screen):** a segmented track that moves only
  when a stage lands. Page 3 fills one segment, which is the whole lesson.
- **The iOS page control:** a row of dots where the current one stretches into a capsule. Position is
  readable at a glance, and every dot is a direct jump.
- **Apple's HIG onboarding guidance and TipKit:** keep it short, let people skip, teach the real
  interface rather than a story about it, and keep the help findable later. Here that means Account.
- **Ichiran Ramen's booth card:** a restaurant teaches its own ritual with a few numbered pictures, at
  the table where it happens, in the guest's language. This guide is that card for a phone.
- **Nintendo's World 1-1 "show, don't tell":** each page's one movement demonstrates the thing to learn
  (a dish lands on the shared order, a segment fills, the Pay door lights) instead of describing it.
- **Transit-map keys and m9's wall key:** the guide teaches the app's real words and marks once. Page
  3's key uses the same three-segment track the wall's key uses.
- **Hong Kong MTR bilingual signage:** both tongues at once, English leading, Burmese directly beneath,
  never alternating.

---

## The marks the guide teaches (within the decided vocabulary)

| Mark                                                    | Means                                         | Vocabulary source                                                                     |
| ------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------- |
| Paper pass, dotted perforation, 12 px notches, a figure | your table's pass                             | PATH_DESIGN "One CounterPass primitive … constant paper in both themes"               |
| Hollow ring + "Not sent yet · မပို့ရသေး"                | a dish the kitchen hasn't got                 | PATH_DESIGN shared marks; m1's wait block heading                                     |
| Track 1 of 3, in --t2                                   | Sent to kitchen                               | m9's track at phone scale                                                             |
| Track 2 of 3, the second in --ac                        | Cooking (the kitchen's Start tap; "now")      | the shipped rail's current colour (`globals.css:2250-2257`); TableTimeline's live dot |
| Track 3 of 3, all --ok                                  | Served (Mom's Done / All done bump; "done")   | the shipped rail's done colour (`globals.css:2258-2264`)                              |
| Filled pill, dimmed → lit                               | the Pay door opening once everything's served | D5                                                                                    |
| Capsule dot vs round dot                                | the guide's current page                      | the lit cap's shape (accent), never a step state                                      |

**Why the phone's track is accent then green while the wall's is cream then gold:** the wall's gold is a
CALL to the runner ("carry it"). The phone's guest needs "now" and "done", which the shipped rail already
says with accent and green. The geometry is identical, so the two read as one family. The words differ
by one: the wall says "Ready to serve", the phone says "Served" (m9's open risk 5).

**Never in the guide:** a price, a total, an amount on Pay, a count of dishes or people, a guest's name,
a time or ETA, an Undo word (D3's words are for the controls that undo), a wallet logo, a TV claim, a
"coming soon".

---

## Example data

- **Thiri's phone, her first visit.** She scanned Table 7's sticker. Aye is already at the table, so
  Thiri joined as a guest (m1's example table). The guide opens over the dine-in menu.
- **The table figure is the only personalized value:** "7" comes from the session (`useCart().tableNumber`,
  `components/TableCartProvider.tsx:178`). With no number (a table not yet bound, or opened from Account),
  the pass reads "Your table" and draws no figure.
- **Sample dishes** in the pictures, the same two on every page: Mohinga / မုန့်ဟင်းခါး
  (`docs/data/MENU_REFERENCE.md:27`) and Coconut Rice / အုန်းထမင်း (`:55`). No prices.
- **Sample people** are two unnamed avatar discs in the shipped seat hues #1F6E63 and #6E4070
  (`lib/avatars.ts:4`), each holding a person glyph, never an initial.
- **Step 4 draws the after-C2 variant** (SURFACES.dineInPhonePay = true). Until C2 flips, the
  production guide shows the counter variant described under STATES.

---

## Tokens and contrast (light, drawn; Night under STATES)

| Token / value                                        | Use                                                 |
| ---------------------------------------------------- | --------------------------------------------------- |
| --pg #faf9f5                                         | the dialog's ground                                 |
| --sf #f2efe7 + dots rgba(166,95,16,0.12) 18 px       | the picture stage (a sunken tray: cards carry dots) |
| --cd paper #fffdf8, border rgba(27,23,20,0.14)       | the pass, the bill, the tab bar                     |
| --sh-paper (two-tier) + inset sheen                  | the pass's lift off the tray (`tokens.css:197`)     |
| --tx #1b1714 · --t2 #6e6358 · --t3 #726859           | ink                                                 |
| --ac #a65f10 · --ac-strong #8f5009 · --oa #fffdf8    | the lit dot, Cooking, Skip, the primary pill        |
| --ok #346e47                                         | Served                                              |
| unlit segment #e7e3dd (rgba(58,35,23,0.12) on paper) | decorative; the word carries the state              |

Computed (WCAG relative luminance; scratchpad `m11calc/c.py`):

| Pair                                             | Ratio       | Floor        |
| ------------------------------------------------ | ----------- | ------------ |
| #1b1714 on #faf9f5 (headings, sentences)         | 16.90       | 4.5          |
| #6e6358 on #faf9f5 (Burmese lines, quiet line)   | 5.55        | 4.5          |
| #726859 on #faf9f5 (quiet Burmese; unlit dots)   | 5.19        | 4.5 / 3      |
| #a65f10 on #faf9f5 (eyebrow 11/700; lit dot)     | 4.67        | 4.5 / 3      |
| #8f5009 on #faf9f5 (Skip 15/700)                 | 6.01        | 4.5          |
| #fffdf8 on #a65f10 (primary label, gradient top) | 4.84        | 4.5          |
| #1b1714 on paper #fffdf8                         | 17.52       | 4.5          |
| #6e6358 on paper (Sent word, Burmese)            | 5.76        | 4.5          |
| #8f5009 on paper (Cooking word, Dine-in kicker)  | 6.22        | 4.5          |
| #346e47 on paper (Served word; served segments)  | 5.96        | 4.5 / 3      |
| #a65f10 on paper (Cooking segment)               | 4.84        | 3 (non-text) |
| #fffdf8 on #1f6e63 / #6e4070 (avatar glyphs)     | 5.96 / 7.85 | 3 (non-text) |
| #6e6358 on #f2efe7 (anything on the bare tray)   | 5.09        | 4.5          |

---

## The pieces, defined once (the drawer reuses these recipes on every page)

- **P · the pass:** `background:#fffdf8; border:1px solid rgba(27,23,20,0.14); border-radius:18px;
box-shadow: inset 0 1px 0 rgba(255,255,255,0.55), 0 1px 3px -1px rgba(35,24,16,0.07), 0 14px 28px -18px
rgba(35,24,16,0.28); display:flex; flex-direction:column; color:#1b1714; position:relative`.
- **F · the perforation** (aria-hidden, 14 px tall): a row with `padding:0 14px`, holding one
  `flex:1` line `border-top:2px dotted rgba(27,23,20,0.18)` (dotted, never dashed: dashed means
  provisional). Two notches: 12 px circles filled with the TRAY colour #f2efe7, `position:absolute`,
  `left:-7px` / `right:-7px`, `top:1px`, each with a 1 px rgba(27,23,20,0.14) edge on its paper side, so
  the paper reads as punched.
- **H · the compact pass head** (≈58 px): `padding:12px 16px 10px`, a flex row, space-between, centred.
  - Left, a column: "Dine-in" (11 px 700, letter-spacing 0.13em, uppercase, lh 1.35, #8f5009), then
    "ဆိုင်မှာ စား" (Padauk 13/700, #6e6358).
  - Right, a baseline row with gap 6: "Table" (Hanken 13/700, #726859), then "7" (Fraunces 36/600, lh 1,
    tracking -0.02em, tabular, #1b1714).
- **R · a dish row** (min-height 52, padding 6 px 0, flex, centred, gap 12; every row after the first
  has a 1 px rgba(58,35,23,0.1) top rule):
  - a name block (`flex:1; min-width:0`, a column): English 15/600, lh 1.3, #1b1714; Burmese Padauk
    13/400, #6e6358.
  - an end slot, which differs per page.
- **T · the track** (aria-hidden): a flex row, gap 3, of three 26×6 segments, radius 999. Colours
  per the marks table. In the key (page 3) the segments are 14×5 with gap 2.
- **Inside the picture, plain `<div>`s only.** The stage is `role="img"` with an `aria-label`, so
  nothing inside it is a list or a control.

---

## SCREEN picked-m11-1.dc.html — The first-visit guide: five pages from your pass to Pay

- **Device:** phone (390×844; `$preview` {"width":390,"height":844}).
- **Theme:** light.
- **Interactive:** yes. Five pages, Back / Next / Skip, five dot buttons, and a `closed` state that shows
  where Skip and "Browse the menu" land. A transparent canvas-only button on the closed state replays
  the guide.
- **`<title>`:** "Table Guide — first visit".
- **Who and when:** Thiri's phone, seconds after her scan of Table 7's sticker joined Aye's table. This
  phone has never seen the guide. It opened by itself over the dine-in menu.

### WHEN THE GUIDE APPEARS, AND HOW IT GOES AWAY (product behaviour; the artboard shows the result)

- **Opens by itself exactly once per phone,** on a dine-in /menu, when ALL of these hold (one pure
  predicate, `dinerGuideAutoOpens`, in `lib/diner-guide.ts`, with a mutant per clause):
  1. the mode is `dinein` (never pickup, scan-and-go, the kiosk, staff screens or /board);
  2. the table session has joined (the provider has a cart id), so it never covers a join error or
     GuestList's recovery block;
  3. the cart is not `locked` by a tablemate paying and not `settling`;
  4. no reorder is landing (J5's reorder note would be hidden under it);
  5. this phone holds no seen mark (`localStorage["mms.guide.seen:dinein"]`, read in a microtask
     after mount, exactly like the staff Help sheet, `components/staff/HelpButton.tsx:242-253`);
  6. the menu's existing recognition read does not know this diner. `welcome.name` is null and
     `welcome.ordersThisMonth` is 0 (`lib/rewards.ts:304-334`, already passed to ArrivalBeat). A
     returning regular is never interrupted, even after Safari clears storage.
- **The mark is written at OPEN, never at close,** and before the dialog opens: a reload mid-guide never
  re-opens it, and a refused write (private mode) means no auto-open at all, never one on every load.
  This is the staff Help sheet's shipped rule (`HelpButton.tsx:110-118`), stated once for both.
- **The entrance:** the dialog fades in over 240 ms (`--dur-base`, `--ease-out`). Page 1's pass rises
  only after it lands, so one thing moves at a time. Under reduced motion it appears in place.
- **Ways out, all equal, all mark nothing new:**
  - Skip (top right, every page);
  - Esc (Radix Dialog);
  - "Browse the menu" on page 5.
    On any of them focus lands on the menu's heading "Menu" (`<h1 tabIndex={-1} className="menu-title">`,
    `components/menu/MenuBrowser.tsx:653`). The guide never pushes browser history: the system Back
    gesture leaves /menu as it does today with any sheet, and the guide is already marked seen.
- **Reopened from Account,** on the You panel (`app/account/page.tsx:198-200`), as the first row of
  "Help & contact" (`components/AccountHelp.tsx`):
  - a `<button>` with an info glyph, min-height 44, `aria-haspopup="dialog"`;
  - its label, "How it works at a table", in 15/700 #a65f10 (the card's link style);
  - it opens the same dialog at page 1. Without a table session the pass reads "Your table" and
    page 2 uses the role sentence. Page 4 follows the flag as everywhere. The last primary is
    "Got it · ရပြီ" instead of "Browse the menu", and focus returns to the row on close.
- **No revision bump at the C2 flip.** Page 4's words change for everyone at the flip. A returning guest
  learns the open door from the Bill itself (D5's dimmed "Pay · $X" with its one reason), not from a
  re-shown guide. A revision bump (`mms.guide.seen:dinein:2`) is reserved for a change of the guide's
  SHAPE, as `lib/help.ts:44-56` does for the counter's sheet.

### LAYOUT (the frame; every page shares it)

- **Root:** 390×844, `position:relative; overflow:hidden; background:#faf9f5; color:#1b1714`,
  Hanken 16/1.5 (RULES §1).
- **State `open`** (`<sc-if value="{{ open }}" hint-placeholder-val="{{ true }}">`): one
  `<div role="dialog" aria-modal="true" aria-labelledby="m11-title">`, absolutely filling the root,
  `background:#faf9f5; display:flex; flex-direction:column`. The dialog covers the AppHeader and the
  diner tab bar (it is the full-screen Radix dialog m1's "Show a server" card introduces; one
  primitive for both).
  - **y0–47:** an empty `aria-hidden` spacer (safe area).
  - **y47–103, the top row:** `height:56px; padding:0 8px 0 20px`, flex, space-between, centred.
    - **left:** `<h1 id="m11-title">`, styled as the eyebrow (11 px 700, letter-spacing 0.13em,
      uppercase, lh 1.35, #a65f10), inline-flex, gap 6. It holds `<span aria-hidden="true">✦</span>`
      then "How it works".
    - **right, x318–382:** `<button type="button" onClick="{{ dismiss }}">` "Skip" plus a sr-only
      " the guide". Min-height 44, min-width 64, padding 0 12, no border, transparent, radius 999,
      #8f5009, 15/700, lh 1.2.
  - **y103–702, the page** (one of five `<sc-if>` blocks, described per page below): a
    `<section aria-labelledby="m11-hN">`, `flex:1; min-height:0; padding:8px 20px 0; display:flex;
flex-direction:column; gap:20px`. - **y111–383, the stage** (350×272): `<div role="img" aria-label="…">`, `flex:none; height:272px;
position:relative; overflow:hidden; border-radius:26px; border:1px solid rgba(58,35,23,0.1);
background-color:#f2efe7; background-image:radial-gradient(rgba(166,95,16,0.12) 1px, transparent
1.6px); background-size:18px 18px; box-shadow:inset 0 1px 0 rgba(255,255,255,0.55); display:flex;
align-items:center; justify-content:center`. - **y403–702, the words:** `flex:1; min-height:0; display:flex; flex-direction:column; gap:10px`. - **The heading:** `<h2 id="m11-hN" tabindex="-1">`, a column with gap 2: - English in Fraunces 26/600, lh 1.15, tracking -0.02em, #1b1714; - Burmese in `<span lang="my">`, Padauk 17/700, lh 1.6, #6e6358. - **The sentence pair:** a column, gap 2. English is a `<p>` at 16/400, lh 1.45, #1b1714. Burmese
    is a `<p lang="my">` in Padauk 15/400, #6e6358. - **The quiet pair:** a column, gap 2. English is 14/400, lh 1.45, #6e6358. Burmese is Padauk
    13/400, #726859.
  - **y702–810, the foot:** `flex:none; padding:0 20px 34px; display:flex; flex-direction:column;
gap:8px`. - **y702–746, the dots:** `<div role="group" aria-label="Steps">`, height 44, flex, centred,
    220 px wide (x85–305). It is `<sc-for list="{{ dots }}" as="d" hint-placeholder-count="5">`
    over five `<button type="button" aria-label="{{ d.label }}" aria-current="{{ d.current }}"
onClick="{{ d.go }}">`: - each button is 44×44, transparent, no border, `display:grid; place-items:center`; - each holds one `aria-hidden` span: `display:block; height:8px; width:{{ d.w }};
border-radius:999px; background:{{ d.bg }}`; - the current dot is a 24×8 capsule in #a65f10; the others are 8×8 dots in #726859; - nothing animates between them. - **y754–810, the dock:** one of three `<sc-if>` blocks. - **`first` (page 1):** one primary, full width. - **`middle` (pages 2–4):** `display:grid; grid-template-columns:1fr 2fr; gap:12px`. Back is the
    secondary (x20–133); Next is the primary (x145–370). - **`last` (page 5):** the same grid, with Back and the primary "Browse the menu". - **The primary** (`.ui-btn-primary` at 56): min-height 56, padding 6 px 20 px, radius 999, no
    border, `linear-gradient(180deg, #a65f10, #8f5009)`, shadow `inset 0 1px 0
rgba(255,255,255,0.55), 0 2px 8px -1px rgba(166,95,16,0.42)`. It is a centred column: English
    15/800, tracking -0.01em, lh 1.2, #fffdf8; then `<span lang="my">` Padauk 13/700, #fffdf8. - **The secondary** (`.ui-btn-secondary`, paper, never a second filled pill): min-height 56,
    radius 999, #fffdf8, a 1 px rgba(58,35,23,0.1) border, shadow `inset 0 1px 0
rgba(255,255,255,0.55), 0 1px 2px rgba(35,24,16,0.06)`. It is a centred column: English
    15/700 #1b1714; then Padauk 13/700 #6e6358.
  - **The one live region:** `<p role="status" class="sr-only">`, a direct child of the dialog,
    persistent. Inside it, one `<sc-if>` per page holds that page's spoken line (see A11Y). There is no
    `aria-live` attribute: `role="status"` already is one.
- **State `closed`** (`<sc-if value="{{ closed }}" hint-placeholder-val="{{ false }}">`): the menu as
  it stands after the guide, described at the end.

### PAGE 1 — `s1` · "Mingalaba": your table's pass is issued

- **Stage `aria-label`:** "Your table’s pass: Table 7". With no number: "Your table’s pass".
- **The pass** (P, width 236; the page's one movement, see MOTION):
  - **Head:** `padding:14px 16px 8px`, a centred column, gap 4, text-align centre.
    - The kicker: an inline-flex row, gap 6: `<span aria-hidden="true">✦</span>` then "Mandalay
      Morning Star" (`BRAND_NAME`, `lib/brand.ts:14`), 11/700, 0.13em, uppercase, lh 1.35, #8f5009.
    - The figure: a baseline row, gap 8: "Table" (Hanken 17/700) then "7" (Fraunces 56/600, lh 1,
      tracking -0.02em, tabular). This is `--fs-pass` scaled to the picture; in product the picture
      renders the real primitive at a CSS scale, never a redrawn copy.
    - The Burmese: "စားပွဲ 7" in Padauk 20/700, lh 1.6, #1b1714, with the "7" in a
      `<span lang="en" class="tn">` Hanken span.
  - **F**, then **the stub:** `padding:10px 18px 14px`, a flex row, centred, gap 14.
    - A stylised QR mark, 44×44 (an `<svg>`, fill and stroke #1b1714): three finder squares (13×13
      outlines at stroke 3, radius 2.5, each with a 5×5 core) at the top-left, top-right and
      bottom-left corners, plus about fifteen 4×4 modules scattered in the rest. It is an icon of
      "scan", not a code.
    - A column: "Dine-in" (11/700, 0.13em, uppercase, #726859), then "ဆိုင်မှာ စား" (Padauk 13/700,
      #6e6358).
  - The pass is about 215 tall, centred in the 272 stage.
- **Words:**
  - **h2 `m11-h1`:** English "Mingalaba", followed by `<span aria-hidden="true">` "✦" at 20 px in
    #a65f10, gap 8. Burmese: "မင်္ဂလာပါ".
  - **The sentence:** "Everyone at the table adds to one shared order." English only.
  - **The quiet line:** "Tap Invite to add a phone — or just scan the table’s QR sticker." English only.
    With no table number, it ends at "Tap Invite to add a phone." A table with no number has no
    sticker of its own to scan yet.
- **Dock `first`:** the primary, `onClick="{{ next }}"`: "Next" over "ရှေ့ဆက်".

### PAGE 2 — `s2` · "Not sent yet": dishes from everyone wait together

- **Stage `aria-label`:** "Two dishes from two people on one order, both not sent yet".
- **The pass** (P, width 270): **H**, **F**, then a rows column (`padding:2px 16px 10px`) of two **R**
  rows. Each row's end slot is a hollow ring: an 18 px svg, a circle of r 7, stroke #6e6358 at 2 px,
  no fill.
  - Row 1, at rest: a 28 px avatar disc in #1F6E63 holding a 16 px person glyph (stroke #fffdf8,
    2 px; head circle plus shoulders), then "Coconut Rice" / "အုန်းထမင်း", then the ring.
  - Row 2, **the page's one movement**: a disc in #6E4070, then "Mohinga" / "မုန့်ဟင်းခါး", then the
    ring. A tablemate's dish lands on the same order.
  - About 188 tall.
- **Words:**
  - **h2 `m11-h2`:** an English row (flex, centred, gap 10) holding the hollow ring (a 20 px svg, r 8,
    stroke #6e6358 at 2.5 px, `aria-hidden`), then "Not sent yet". Burmese: "မပို့ရသေး". This is
    m1's wait-block heading, the family word.
  - **The sentence pair:**
    - English: "One person at your table sends the order to the kitchen from their phone — your
      dishes go with it."
    - Burmese: "စားပွဲက တစ်ယောက်က သူ့ဖုန်းကနေ စားပွဲရဲ့ အော်ဒါကို မီးဖိုချောင်ဆီ ပို့ပေးပါမယ် —
      သင့်ဟင်းတွေလည်း တစ်ခါတည်း ပါသွားပါမယ်။"
  - **The quiet pair:** "If they’re away, our staff can send it too." over "သူ မရှိရင်
    ဝန်ထမ်းကလည်း ပို့ပေးလို့ ရပါတယ်။"
  - Fit: about 242 of the 299 px.
- **Dock `middle`:** Back (`onClick="{{ back }}"`, "Back" over "နောက်သို့"), then Next.

### PAGE 3 — `s3` · "Your order's with the kitchen.": the pass moves

- **Stage `aria-label`:** "Your pass: Mohinga served, Coconut Rice cooking".
- **The pass** (P, width 290): **H**, **F**, then two **R** rows. Each row's end slot is a column,
  `flex:none; width:96px; align-items:flex-end; gap:5px`, holding a **T** track over a word
  (12/700, lh 1.2):
  - Row 1: "Mohinga" / "မုန့်ဟင်းခါး". The track is #346e47 ×3. The word is "Served" in #346e47.
  - Row 2: "Coconut Rice" / "အုန်းထမင်း". The track is #6e6358, then #a65f10, then #e7e3dd. The
    second segment is **the page's one movement**. The word is "Cooking" in #8f5009.
  - About 188 tall.
- **Words:**
  - **h2 `m11-h3`:** "Your order’s with the kitchen." (two lines at 26 px) over
    "သင့်အော်ဒါ မီးဖိုချောင်ထဲ ရောက်နေပါပြီနော်".
  - **The sentence:** "Each dish moves on your pass as the kitchen taps it — never on a timer."
    English only.
  - **The key:** `<ul role="list" aria-label="What each mark means">`, `list-style:none; margin:0;
padding:0; display:grid; grid-template-columns:repeat(3,1fr); gap:8px`. Each `<li>` is a column,
    gap 4, holding a 14×5 mini track (aria-hidden), the English word (13/700, lh 1.3) and the Burmese
    word (Padauk 13/700), both in the mark's ink: - "Sent to kitchen" / "ပို့ပြီး" in #6e6358, with only segment 1 lit; - "Cooking" / "ချက်နေဆဲ" in #8f5009, with segment 1 in #6e6358 and segment 2 in #a65f10; - "Served" / "ထုတ်ပြီး" in #346e47, with all three lit.
  - Fit: about 225 px.
- **Dock `middle`.**

### PAGE 4 — `s4` · "Your bill": Pay opens once everything's served (the after-C2 variant)

- **Stage `aria-label`:** "Your bill with every dish served, and Pay lit".
- **The stage holds a column** (width 270, `align-items:stretch`, gap 10), about 236 tall:
  - **The pass, slimmed** (P):
    - A head row with `padding:10px 16px 6px`, baseline, space-between. Left: "Table" (13/700,
      #726859) then "7" (Fraunces 24/600), gap 6. Right: "Dine-in" (11/700, 0.13em, uppercase,
      #8f5009).
    - **F.**
    - Two **R** rows at min-height 46: "Mohinga" / "မုန့်ဟင်းခါး" and "Coconut Rice" / "အုန်းထမင်း".
      Both have a #346e47 ×3 track over "Served" (#346e47), in a `padding:0 16px 6px` column.
  - **The Pay door, the page's one movement:** a pill in the primary recipe at min-height 44. It holds
    "Pay" (15/800, #fffdf8), then a `·` (aria-hidden, rgba(255,253,248,0.7)), then "ရှင်းမယ်"
    (Padauk 14/700, #fffdf8), centred, gap 8. **No amount.** The real control reads "Pay · $X", and the
    guide shows no money.
  - **The counter line:** min-height 24, centred, gap 6, #8f5009, 13/700. It reads "Pay at the
    counter", then a `·` (aria-hidden), then "ကောင်တာမှာ ရှင်းမယ်" (Padauk 13/700).
- **Words:**
  - **h2 `m11-h4`:** "Your bill" over "သင့်ဘောက်ချာ".
  - **The sentences** (a column, gap 2, both 16/400 #1b1714, English only):
    - "Pay opens once everything’s served." This is D5's own sentence, the one the dimmed Pay will
      carry, so the guest recognises it.
    - "Then pay right here on your phone — card, Apple Pay or Google Pay."
  - **The quiet line:** "Or pay at the counter." English only.
- **Dock `middle`.**

### PAGE 5 — `s5` · "You're all set": where things live

- **Stage `aria-label`:** "The tab bar, with your table’s pass tucked into Order".
- **The stage holds** a 300×144 `position:relative` box:
  - **The pass, the page's one movement:** P at radius 14, width 132, `position:absolute; left:84px;
top:0; z-index:1`. Inside: `padding:10px 12px 30px`, a centred column, gap 2. "Dine-in" (11/700,
    0.13em, uppercase, #8f5009), then a baseline row: "Table" (13/700, #726859) and "7" (Fraunces
    30/600). It is about 87 tall, so its lower 15 px sit behind the bar.
  - **The tab bar in miniature:** `position:absolute; left:0; right:0; top:72px; height:72px;
z-index:2`. Paper #fffdf8, a 1 px rgba(58,35,23,0.1) border, radius 20. Shadow
    `inset 0 1px 0 rgba(255,255,255,0.66)` plus --sh-paper. It is a 3-column grid with `padding:0 8px`. - Each cell is a centred column, gap 2. It holds a 28×24 icon box with a 22 px stroke icon
    (stroke 1.75–2, round caps), then the label (12/700, letter-spacing 0.02em, lh 1). - Menu: LayoutGrid, four rounded squares, #6e6358. - **Order:** ReceiptText, a zig-zag receipt with three lines, **#8f5009**. - Account: Star, #6e6358. - These are the shipped tab icons (`components/nav/DinerTabs.tsx:41-45`) and labels
    (`lib/diner-tabs.ts:12-31`). The labels are English by design (D2).
- **Words:**
  - **h2 `m11-h5`:** "You’re all set" over "အားလုံး အဆင်သင့်ပါပြီ".
  - **The sentence:** "Find your order under Order, and this guide under Account." English only.
- **Dock `last`:** Back, then the primary `onClick="{{ dismiss }}"`: "Browse the menu" over
  "မီနူး ကြည့်မယ်". From Account the primary reads "Got it" over "ရပြီ".

### STATE `closed` — where Skip and "Browse the menu" land (the dine-in menu, as shipped)

Draw it from `m1-quiet-1.dc.html`'s menu, trimmed:

- **The AppHeader** at y47–103 (RULES §3).
- **The masthead** (`position:absolute; top:103px`, `padding:20px 20px 0`, a column, gap 10):
  - the 44 px door eyebrow button "At table 7" plus a 12 px chevron (11/700, 0.13em, uppercase, #a65f10;
    `components/DoorSheet.tsx:101`);
  - the h1 "Menu" (Fraunces 26/600, lh 1.08);
  - the greeting, 14/700 #8f5009, a row with gap 6: "မင်္ဂလာပါ" (`lang="my"`), then "Mingalaba", then
    an aria-hidden ✦ (`components/menu/ArrivalBeat.tsx:97`);
  - the line "2 of you at the table — order together, pay together." at 13 px #6e6358
    (`ArrivalBeat.tsx:69`);
  - the guest row: two 32 px avatars, #1F6E63 "A" and #6E4070 "T", overlapping by 8, with sr-only
    "Aye" and "Thiri (you)". Then the 44 px "Invite" pill (#f2efe7, people glyph,
    `aria-label="Invite people to your table"`).
- **The toolbar:** the 44 px search field ("Search dishes, drinks…") with the "Dietary" pill. Then the
  category chips row: "All-Day Breakfast" lit, then "Rice / Noodles / Soups", "Sides" and "Curries
  (A la Carte)".
- **The first dish card,** Mohinga, as m1-quiet-1 draws it, with a 44 px "+" Add (`aria-label="Add
Mohinga"`) in place of the stepper.
- **The diner tab bar** (RULES §3), with Menu current: `aria-current="page"`, #8f5009, and no badge.
- **On top of everything:** one transparent `<button type="button" onClick="{{ replay }}"
aria-label="Show the guide again">` (`position:absolute; inset:0; z-index:30; background:transparent;
border:0`). It is the canvas's stepper and draws nothing.

### The artboard's logic (copy exactly)

```js
class Component extends DCLogic {
  constructor(props) {
    super(props);
    this.state = { step: 1, closed: false };
  }
  renderVals() {
    const n = 5;
    const step = this.state.step;
    const closed = this.state.closed;
    const to = (i) => () => this.setState({ step: i });
    return {
      open: !closed,
      closed: closed,
      s1: step === 1,
      s2: step === 2,
      s3: step === 3,
      s4: step === 4,
      s5: step === 5,
      first: step === 1,
      middle: step > 1 && step < n,
      last: step === n,
      dots: [1, 2, 3, 4, 5].map((i) => ({
        label: "Step " + i + " of " + n,
        current: i === step ? "step" : "false",
        w: i === step ? "24px" : "8px",
        bg: i === step ? "#a65f10" : "#726859",
        go: to(i),
      })),
      next: () => this.setState({ step: Math.min(n, step + 1) }),
      back: () => this.setState({ step: Math.max(1, step - 1) }),
      dismiss: () => this.setState({ closed: true }),
      replay: () => this.setState({ closed: false, step: 1 }),
    };
  }
}
```

`data-props` stays `{"$preview":{"width":390,"height":844}}`.

### STATES (not drawn; for the build)

- **Pre-C2 (`SURFACES.dineInPhonePay` false) — what production shows until the flip.** Page 4 becomes
  the counter page, with no card words and no "coming soon":
  - **The stage:** m2's counter pass in miniature. Its stub holds "Table 7" and "စားပွဲ 7", the
    perforation, then "Pay at the counter" over "ကောင်တာမှာ ရှင်းလိုက်ပါ" (`counterTitle`,
    `lib/i18n/cart.ts:100`). Its one movement is the pass rising (m11Rise).
  - **h2:** "Your bill" / "သင့်ဘောက်ချာ".
  - **The sentence pair** (shipped `counterKeepOrdering`, `cart.ts:105-108`): "You can keep ordering —
    you’ll pay for everything on the table at the counter." over "ဆက်မှာလို့ ရပါသေးတယ် — စားပွဲပေါ်က
    အားလုံးကို ကောင်တာမှာ ရှင်းပေးပါမယ်".
  - **The quiet pair:** the Bill's own counter line, read from the same binding the Bill uses
    (PD2's). While the register records cash only, that is m2's "The counter takes cash." over
    "ကောင်တာမှာ ငွေသားနဲ့ ရှင်းလို့ ရပါတယ်။". The guide never states a tender the Bill doesn't.
  - Page 5 is unchanged.
- **The viewer is the table's sender** (`useCart().role === "host"`). Page 2's sentence becomes "You
  send the table’s order to the kitchen — everyone’s dishes go with it." English only, listed, with no
  Burmese line. The quiet pair stays.
- **No table number** (unbound, or opened from Account):
  - page 1's pass draws "Your table" (Hanken 17/700) in place of the figure and the Burmese line;
  - pages 2–5 draw "Your table" in place of "Table 7" in the head;
  - page 1's quiet line drops its sticker clause.
- **Opened from Account:** as above, with the last primary "Got it" / "ရပြီ". Focus returns to the
  Account row.
- **Storage refused:** never auto-opens. The Account row still opens it.
- **A tablemate starts paying while the guide is open:** nothing changes in the guide. It is reading,
  not a door. The menu behind it says the lock as shipped.
- **Night** (the diner phone follows the OS):
  - **The dialog:** ground #100c19.
  - **The stage:** --sunken #171422 with dots rgba(231,165,58,0.10) and a rgba(243,236,223,0.13) border.
  - **The pass stays constant paper #fffdf8 with constant inks.** The pass element re-declares the
    light ink tokens as constants (--tx #1b1714, the 62% ink mix #726e6b at 4.97:1, --ac #a65f10,
    --ok #346e47). Night's --ok #5fb07e on paper is 2.58:1 and Night's --t2 is 2.04:1, so inherited
    tokens would fail. The notches take #171422.
  - **The heading:** #f3ecdf (16.42:1), with Burmese #bcafc8 (9.28:1).
  - **Skip:** #e7a53a (9.04:1).
  - **The dots:** lit #e7a53a, others #a69eb1 (7.48:1).
  - **The primary:** flat #e7a53a with #130d1e ink (8.91:1).
  - **The secondary:** #2b213c with #f3ecdf (12.90:1).
- **200 % text or a short screen:** the stage shrinks first, to `clamp(160px, 34vh, 272px)`. The words
  block then scrolls inside the page (`overflow-y:auto`). The dots and the dock stay pinned, so Next
  and Skip are never pushed off.
- **Reduced motion:** every page shows its final frame (below), and the dialog appears without a fade.

### COPY (English) — verbatim

- **Frame:** "How it works" · "Skip" (sr-only suffix " the guide")
- **Page 1:**
  - in the picture: "Mandalay Morning Star" · "Table" · "7" · "Dine-in";
  - "Mingalaba";
  - "Everyone at the table adds to one shared order.";
  - "Tap Invite to add a phone — or just scan the table’s QR sticker.";
  - "Next".
- **Page 2:**
  - in the picture: "Dine-in" · "Table" · "7" · "Coconut Rice" · "Mohinga";
  - "Not sent yet";
  - "One person at your table sends the order to the kitchen from their phone — your dishes go with
    it.";
  - "If they’re away, our staff can send it too.";
  - "Back" · "Next".
- **Page 3:**
  - in the picture: "Mohinga" · "Served" · "Coconut Rice" · "Cooking";
  - "Your order’s with the kitchen.";
  - "Each dish moves on your pass as the kitchen taps it — never on a timer.";
  - the key: "Sent to kitchen" · "Cooking" · "Served".
- **Page 4:**
  - in the picture: "Table" · "7" · "Dine-in" · "Mohinga" · "Coconut Rice" · "Served" ×2 · "Pay" ·
    "Pay at the counter";
  - "Your bill";
  - "Pay opens once everything’s served.";
  - "Then pay right here on your phone — card, Apple Pay or Google Pay.";
  - "Or pay at the counter.".
- **Page 5:**
  - in the picture: "Dine-in" · "Table" · "7" · "Menu" · "Order" · "Account";
  - "You’re all set";
  - "Find your order under Order, and this guide under Account.";
  - "Back" · "Browse the menu".
- **Closed:** "Morning Star" · "At table 7" · "Menu" · "Mingalaba" · "2 of you at the table — order
  together, pay together." · "Invite" · "Search dishes, drinks…" · "Dietary" · "All-Day Breakfast" ·
  "Rice / Noodles / Soups" · "Sides" · "Curries (A la Carte)" · the Mohinga card (as m1-quiet-1) · "Menu"
  · "Order" · "Account".
- **Accessible names (aria only, never drawn):**
  - the five stage descriptions above;
  - the key's "What each mark means";
  - the pager's "Steps" and each dot's "Step N of 5";
  - the canvas-only "Show the guide again".
- **Sources of the reused English:**
  - "Mingalaba" — `ArrivalBeat.tsx:96-99`;
  - "Everyone at the table adds to one shared order." — `InviteSheet.tsx:74`;
  - the quiet line is new, built from `InviteSheet.tsx:74-75` and GuestList's "Invite"
    (`GuestList.tsx:236-239`);
  - "Not sent yet" — `line-state-copy.ts:13`, `staff.ts:2909`;
  - the role sentence — `confirm-copy.ts:120-121`;
  - "If they’re away…" — m1's draft (picked-m1.md :142);
  - "Your order’s with the kitchen." — `cart.ts:57-60`;
  - "Sent to kitchen · Cooking · Served" — `line-state-copy.ts:14-16`;
  - "Your bill" — `cart.ts:21`;
  - "Pay opens once everything’s served." — D5;
  - "Pay" — `cart.ts:52`;
  - "Pay at the counter" — `cart.ts:99`;
  - "You’re all set" — an excerpt of `kiosk/strings.ts:76`;
  - "Browse the menu" — `common.ts:26`;
  - "Next" / "Back" / "Steps" — `staff.ts:2617`, `:2618`, `:2625`;
  - "Dine-in" — `staff.ts:439`;
  - "Table {id}" — `staff.ts:402`;
  - "Mandalay Morning Star" — `brand.ts:14`;
  - "How it works" — the EN heading at `RewardsHub.tsx:218`.

### COPY (Burmese) — with sources (nothing invented)

| String                                                                       | Source                                                                                          |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| မင်္ဂလာပါ                                                                    | shipped, `components/menu/ArrivalBeat.tsx:97`                                                   |
| စားပွဲ 7                                                                     | shipped `floor.table` "စားပွဲ {id}", `lib/i18n/staff.ts:402` (the figure stays Latin)           |
| ဆိုင်မှာ စား                                                                 | shipped `floor.mode.dinein`, `staff.ts:439` (grounded in the kiosk's `dineIn`)                  |
| မပို့ရသေး                                                                    | shipped `pad.group.unsent`, `staff.ts:2909` (K15-HIGH root `table.line.notSent`, :2802)         |
| စားပွဲက တစ်ယောက်က သူ့ဖုန်းကနေ … ပါသွားပါမယ်။                                 | shipped `hostSendsCopy(null).my`, `lib/confirm-copy.ts:122` (K15 draft)                         |
| သူ မရှိရင် ဝန်ထမ်းကလည်း ပို့ပေးလို့ ရပါတယ်။                                  | m1's DRAFT, role branch (picked-m1.md :157; brief-m1.md :126)                                   |
| သင့်အော်ဒါ မီးဖိုချောင်ထဲ ရောက်နေပါပြီနော်                                   | shipped `orderWithKitchen`, `lib/i18n/cart.ts:57-60`                                            |
| ပို့ပြီး                                                                     | shipped `table.line.state.fired`, `staff.ts:2803` (K15-HIGH; m1's "Sent to kitchen · ပို့ပြီး") |
| ချက်နေဆဲ                                                                     | shipped `kds.line.cooking`, `staff.ts:187` (= `table.line.state.inProgress`, :2804)             |
| ထုတ်ပြီး                                                                     | shipped `table.line.state.served`, `staff.ts:2805` (grounded in `kds.served.chip`)              |
| သင့်ဘောက်ချာ                                                                 | shipped `yourBill`, `cart.ts:21`                                                                |
| ရှင်းမယ်                                                                     | shipped `pay`, `cart.ts:52`                                                                     |
| ကောင်တာမှာ ရှင်းမယ်                                                          | shipped `payAtCounter`, `cart.ts:99`                                                            |
| အားလုံး အဆင်သင့်ပါပြီ                                                        | a verbatim contiguous excerpt of shipped `handoffCounter`, `lib/kiosk/strings.ts:77`            |
| မီနူး ကြည့်မယ်                                                               | shipped `browseMenu`, `lib/i18n/common.ts:26`                                                   |
| ရှေ့ဆက်                                                                      | shipped `help.next`, `staff.ts:2617`                                                            |
| နောက်သို့                                                                    | shipped `help.back`, `staff.ts:2618` (= kiosk `back`, `kiosk/strings.ts:50`)                    |
| ရပြီ (Account variant)                                                       | shipped `help.done`, `staff.ts:2619`                                                            |
| ကောင်တာမှာ ရှင်းလိုက်ပါ (pre-C2 picture)                                     | shipped `counterTitle`, `cart.ts:100`                                                           |
| ဆက်မှာလို့ ရပါသေးတယ် — … ရှင်းပေးပါမယ် (pre-C2)                              | shipped `counterKeepOrdering`, `cart.ts:105-108`                                                |
| ကောင်တာမှာ ငွေသားနဲ့ ရှင်းလို့ ရပါတယ်။ (pre-C2, only while the Bill says it) | m2's DRAFT (picked-m2.md :209)                                                                  |
| မုန့်ဟင်းခါး · အုန်းထမင်း                                                    | the catalog's `name_my` (MENU_REFERENCE.md :27, :55)                                            |

**English only (no Burmese exists; none invented; listed for K15 · diner-cart):**

- "How it works"
- "Skip"
- "Everyone at the table adds to one shared order."
- "Tap Invite to add a phone — or just scan the table’s QR sticker." (and its short form)
- "Each dish moves on your pass as the kitchen taps it — never on a timer."
- "Pay opens once everything’s served."
- "Then pay right here on your phone — card, Apple Pay or Google Pay."
- "Or pay at the counter."
- "Find your order under Order, and this guide under Account."
- the sender variant "You send the table’s order to the kitchen — everyone’s dishes go with it."
- "Your table"
- the Account row "How it works at a table"
- the aria-only names
- "Mandalay Morning Star" (the brand, Latin by nature)

**Staff Burmese on a guest surface:** "ရှေ့ဆက်", "နောက်သို့", "ပို့ပြီး", "ထုတ်ပြီး" and "ဆိုင်မှာ စား" were
written for the console's register. The native sitting checks they read naturally to a guest. Each copy
in the diner dictionary is pinned EQUAL to its staff source by a red-first test (D3's precedent for
`table.send.undo`), so a later re-word moves both together or neither.

### MOTION (keyframes live in `<helmet><style>`; every base style is the FINAL frame; each runs with `animation-fill-mode: backwards`)

```css
@keyframes m11Rise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@keyframes m11Fill {
  from {
    transform: scaleX(0);
  }
  to {
    transform: scaleX(1);
  }
}
@keyframes m11Open {
  from {
    opacity: 0.45;
    transform: scale(0.96);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@keyframes m11Tuck {
  from {
    transform: translateY(-28px);
  }
  to {
    transform: none;
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

| Page | The one movement                       | Animation                                                                                                                                                     | Reduced motion (the final frame)          |
| ---- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 1    | The pass is issued (Wallet's "added")  | the pass: `m11Rise 480ms cubic-bezier(0.2,0.8,0.2,1) 120ms backwards` (the kit's `.mms-rise`: 8 px, `--dur-slow`, `--ease-out`, `globals.css:1062-1081`)      | the pass in place                         |
| 2    | A tablemate's dish lands on the order  | row 2: `m11Rise 480ms cubic-bezier(0.2,0.8,0.2,1) 350ms backwards`                                                                                            | both rows in place                        |
| 3    | Coconut Rice goes from Sent to Cooking | its 2nd segment: `transform-origin: left center; m11Fill 700ms cubic-bezier(0.2,0.8,0.2,1) 450ms backwards` (RULES2's progress fill)                          | the segment filled; the word says Cooking |
| 4    | The Pay door opens                     | the Pay pill: `m11Open 180ms cubic-bezier(0.2,0.8,0.2,1) 900ms backwards`. It shows dimmed for 0.9 s, then pops lit (RULES2's pop, scaled for a wide control) | Pay lit; the sentence carries the rule    |
| 5    | The pass tucks into Order              | the mini pass: `m11Tuck 480ms cubic-bezier(0.2,0.8,0.2,1) 300ms backwards`; the bar's z-index hides its foot                                                  | the pass tucked                           |

- **When it plays:** each movement plays when its page mounts, and plays again if the page is revisited
  (Back or a dot), because the `<sc-if>` remounts the page. Nothing loops, breathes, auto-advances or
  plays sound. The dots, the dock and the text never move.
- **One thing at a time:** in product the dialog's 240 ms fade finishes before page 1's rise starts. No
  page has two movements.
- **Timing rationale:** the delays (120–900 ms) let the eye land on the page first. The longest page is
  under 1.1 s from mount to rest, well inside WCAG 2.2.2's 5 s.
- **In product, the kit's classes do the moving:** `.mms-rise` for pages 1, 2 and 5's entrance-type
  movements, already reduced-motion gated (`globals.css:1082-1087`). The fill, open and tuck keyframes
  go in a new `.diner-guide-*` block in globals.css, each with its own reduced-motion off-switch.
  m10/D5's track owns the segment fill if it already defines one; reuse it.

### A11Y

- **Dialog:** Radix Dialog (the Sheet's base, `packages/ui/src/sheet.tsx:2`), full-screen,
  `aria-modal="true"`, `aria-labelledby="m11-title"`. Focus is trapped, Esc closes, and the menu behind
  is inert.
- **Focus:**
  - **On open:** focus lands on page 1's `h2` ("Mingalaba", `tabindex="-1"`), so the reader hears the
    dialog's name and the greeting.
  - **On Next, Back or a dot:** focus STAYS on the pressed control. A keyboard or switch user can press
    Next five times without hunting for it. The one live region speaks the new page.
  - **Exceptions:**
    - Back pressed on page 2 unmounts with page 1's single-button dock, so focus moves to Next;
    - Next pressed on page 4 is replaced by "Browse the menu" in the same slot, so focus moves to that
      control.
    - Neither ever drops to `<body>`.
  - **On close:** focus goes to the menu's `h1` (`MenuBrowser.tsx:653`, `tabIndex={-1}`). From Account
    it goes to the row that opened the guide.
- **One live region:** the persistent `<p role="status" class="sr-only">`. It is silent on open (a
  status region speaks only changes). On each page change it speaks that page's heading and its first
  sentence:
  1. "Mingalaba, မင်္ဂလာပါ. Everyone at the table adds to one shared order."
  2. "Not sent yet, မပို့ရသေး. One person at your table sends the order to the kitchen from their phone
     — your dishes go with it."
  3. "Your order’s with the kitchen. Each dish moves on your pass as the kitchen taps it — never on a
     timer."
  4. "Your bill, သင့်ဘောက်ချာ. Pay opens once everything’s served."
  5. "You’re all set, အားလုံး အဆင်သင့်ပါပြီ. Find your order under Order, and this guide under
     Account."

  Every Burmese run inside it is a `<span lang="my">`. The guide has no other region, and the menu's
  provider region is behind the inert page.

- **Landmarks and headings:** the `h1` is the dialog's name ("How it works"). Each page is a `<section
aria-labelledby="m11-hN">` whose `h2` holds both tongues. The English and the `lang="my"` span sit
  inside one heading.
- **Pictures:** each stage is `role="img"` with a one-line `aria-label` that states what it shows. Its
  contents are presentational: plain divs, no lists, no controls. Never colour alone: the words "Sent
  to kitchen · Cooking · Served" carry the state in the key, and every picture's meaning is also in
  its page's sentence.
- **The pager:** `role="group"` named "Steps". It holds five real `<button>`s, each 44×44, named "Step N
  of 5", with `aria-current="step"` on the lit one. The capsule and the dot differ by shape AND colour,
  and both clear 3:1.
- **Targets:** Skip 64×44 · dots 44×44 · Back and Next 56 tall · the Account row 44.
- **Text:** Burmese is at least 13 px, Padauk 400/700 only, lh 1.6, `font-synthesis:none`. Every figure
  is Latin and tabular. Contrast is in the table above: every text pair clears 4.5:1, and every
  meaningful non-text mark clears 3:1.
- **Label in name:** "Skip" is named "Skip the guide" (visible text first). The primary's name is its
  visible English plus Burmese.
- **No timing, no gesture-only path:** nothing auto-advances (WCAG 2.2.1 and 2.2.2). There is no swipe
  in v1: buttons and dots are the single-pointer path (2.5.1), and a horizontal page swipe would fight
  iOS Safari's own edge-swipe Back.

---

## DATA

### What the guide reads (all exists today, or is built by the PR it waits on)

- **`useCart()`** from `TableCartProvider`: `role` (:174), `tableNumber` (:178), `locked`, `settling`,
  `cartId` (the session has joined), and the reorder state for clause 4.
- **`welcome`**, the menu's existing server read `getWelcomeBack()` (`lib/rewards.ts:304-334`), already
  handed to `ArrivalBeat` (`ArrivalBeat.tsx:33-41`). It is used only to NOT open, and adds no read.
- **`SURFACES.dineInPhonePay`**, PD2's new constant (it does not exist yet; `lib/surfaces.ts`). It
  selects page 4's variant, the same constant Checkout and create-intent read. The guide never shows a
  card word while it is false.
- **The Bill's counter line binding** (PD2), for page 4's pre-C2 quiet line.
- **`localStorage["mms.guide.seen:dinein"]`**, behind try/catch, read in a microtask, written at open.

### Writes

- **The seen mark** (localStorage). That is the only state the guide keeps.
- **Two analytics events** through the shipped `posthog.capture` (cookieless, memory persistence,
  `instrumentation-client.ts:30-50`): `guide_opened { source: "auto" | "account" }` and
  `guide_closed { page: 1–5, via: "skip" | "finish" | "esc" }`. They carry no personal data and no
  table number. They tell the owner whether guests read it or skip it (open risk 2).
- **No DB, no migration, no server route, no realtime.**

### What does not exist today, and who builds it

1. **`lib/diner-guide.ts`** (pure, in the `verify:slice` mutate set, its own suite) — **diner-cart**:
   - `dinerGuideAutoOpens(...)`, with one mutant per clause: mode, joined, locked, settling, reorder,
     seen, known diner;
   - `GUIDE_SEEN_KEY` / `guideSeenKey(rev)`;
   - `guidePayVariant(dineInPhonePay)`, with a mutant that inverts it. A red-first test renders the
     guide with the flag false and asserts that no "card", "Apple Pay" or "Google Pay" text exists
     anywhere in the dialog;
   - `guideSendLine(role)` (sender vs role sentence);
   - `guideTableLabel(tableNumber)` (a figure vs "Your table", and the sticker clause).
2. **`components/DinerGuide.tsx`**, with a jsdom suite (focus moves, one region, Skip/Esc/finish all
   close, the mark is written at open, storage refused means no auto-open) — **diner-cart**.
   - The pictures render the REAL pass primitive and the real progress track with fixed sample props,
     inside an `inert` / `aria-hidden` frame, at a CSS scale. They are never redrawn copies.
3. **The mount: one line in `ArrivalBeat`** — **diner-cart**, widening D1(a)'s scoped unfreeze by one
   mount, so it needs the orchestrator's yes. The fallback is to mount inside `TableCartProvider`
   (diner-cart's file). MenuBrowser stays untouched.
4. **The guide's dictionary keys**, a new `lib/i18n/guide.ts` joined into `DICT`
   (`lib/i18n/index.ts:18`) — **diner-cart**. The staff-sourced Burmese copies are pinned equal to
   their `STAFF` sources by a test.
5. **The `.diner-guide-*` block in `app/globals.css`** — **diner-cart**, as a stream-owned section in
   the way m9's `.orb-*` block is kitchen-ops'. It uses tokens only (`check:style-literals` ratchet).
6. **The Account door**, the "How it works at a table" row on You — **post-pay** (owns
   `app/account/**`). `components/AccountHelp.tsx` is on no stream's card, so the orchestrator assigns
   it to post-pay. It imports diner-cart's exported `DinerGuide` with `source="account"`.
7. **Dependencies that must land first:**
   - guards-style's early token PR (`--fs-pass`, D1(c));
   - post-pay's pass primitive (`packages/ui`, the CounterPass);
   - m1's full-screen Radix dialog variant (shared with "Show a server");
   - D5's progress view and track (PD9's served gate and progress receipt);
   - PD2's `SURFACES.dineInPhonePay` and the Bill's counter-line binding.
8. **Docs in the same PR:**
   - DESIGN-LANGUAGE gains a short "first-visit guide" section: one per surface, seen at open, one
     movement per page, pictures render real components;
   - OPEN-ITEMS gains its PD row and the `K15 · diner-cart` rows for the English-only strings above.

**Sequencing:** guards-style tokens → post-pay's pass primitive → PD2 → D5's progress receipt → m11
(diner-cart), then post-pay's Account row. m11 needs no device test to merge. Its page 4 copy flips
with C2 automatically, and C2's own commit changes nothing here.

---

## VERIFIED CLAIMS (checked against the repo at f1110aa)

| Claim the guide rests on                                                      | Verdict           | Evidence → design consequence                                                           |
| ----------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------- |
| A second phone joins by scanning the same sticker or entering the invite code | TRUE              | `app/api/session/route.ts:58-60` → page 1's quiet line                                  |
| "Everyone at the table adds to one shared order." is shipped                  | TRUE (EN only)    | `components/InviteSheet.tsx:74` → reused verbatim, listed without Burmese               |
| "Invite" is on every dine-in menu                                             | TRUE              | `MenuBrowser.tsx:662` renders `<GuestList />` for dine-in; `GuestList.tsx:236-239`      |
| Only one person's phone sends; the server enforces it                         | TRUE              | `lib/cart.ts:282` (`role !== "host"` → `not_host`) → page 2's role sentence             |
| Staff can send a diner table's round too                                      | TRUE              | `lib/staff-send-view.ts:178-182` → "our staff can send it too"                          |
| A table can have no diner host                                                | TRUE              | `checkout-stage.ts:63-66`; `register.ts:155-157` → the fallback comes last; open risk 5 |
| The Order page already shows Sent to kitchen / Cooking / Served per dish      | TRUE              | `line-state-copy.ts:12-18`; `Checkout.tsx:4291`, `:4511`                                |
| Each stage is a kitchen tap, never a guess or a timer                         | TRUE              | `TableTimeline.tsx:9-12` → "as the kitchen taps it — never on a timer"                  |
| The app knows a plate reached the table                                       | **FALSE**         | `TableTimeline.tsx:9-12`; D5 → no "when it reaches you"                                 |
| The phone pass with per-dish tracks exists today                              | **FALSE**         | D5's progress receipt and post-pay's pass primitive are unbuilt → m11 ships after both  |
| Card / Apple Pay can be offered today                                         | **FALSE**         | OPEN-ITEMS C2 (test keys); D5 "no card words" → page 4 by the flag                      |
| Apple Pay shows on every phone                                                | **FALSE**         | `PaymentSection.tsx:704-707`, `:607-608` → merchant wording, no logo                    |
| `SURFACES.dineInPhonePay` exists                                              | **FALSE (today)** | `grep` finds no `dineInPhonePay` in apps/qr → PD2 adds it first                         |
| A first-visit auto-open with a device mark is an existing pattern             | TRUE              | `lib/help.ts:17-20`; `HelpButton.tsx:110-118`, `:242-253` → the same rule               |
| The menu heading is a focus target                                            | TRUE              | `MenuBrowser.tsx:653` (`tabIndex={-1}`)                                                 |
| The diner tabs are Menu · Order · Account with grid, receipt and star         | TRUE              | `lib/diner-tabs.ts:12-31`; `DinerTabs.tsx:41-45`                                        |
| Account's You panel holds Help & contact                                      | TRUE              | `app/account/page.tsx:198-200`; `AccountHelp.tsx`                                       |
| ArrivalBeat already receives the recognition read                             | TRUE              | `ArrivalBeat.tsx:33-41`; `lib/rewards.ts:304-334`                                       |
| The kit's pop suits a wide pill                                               | **FALSE**         | `globals.css:903-916` (scale 1.18) → 0.96 → 1 for wide controls                         |
| The rail already uses accent for "current" and green for "done"               | TRUE              | `globals.css:2250-2264` → Cooking accent, Served green                                  |
| Analytics can record a guide event without cookies or replay                  | TRUE              | `instrumentation-client.ts:30-50`; `posthog.capture` used at `DoorSheet.tsx:106`        |
| There are no business hours anywhere to quote                                 | TRUE              | `AccountHelp.tsx:15-17` → the guide names no hours and no times                         |

---

## DECISIONS

1. **One guide, dine-in only, five pages.** It teaches the one table journey this app has (join, order
   together, watch it cook, pay), and nothing about pickup or the market, which have their own doors.
2. **It opens by itself once per phone,** on the first dine-in landing after the join succeeds. It is
   never shown over an error, a pay lock, settling or a reorder, and never to a diner the server
   already knows. The mark is written at open. Storage refused means no auto-open. It reopens from
   Account. This is the staff Help sheet's shipped rule, stated once for both.
3. **The guide teaches the app's own words.** Every heading is a shipped bilingual string the guest
   will meet again: Mingalaba · Not sent yet · Your order's with the kitchen. · Your bill · You're all
   set. That is recognition over recall, and it adds almost no new Burmese (one draft and one excerpt).
4. **The pictures render the real components** (the pass primitive, the progress track, the tab bar)
   with fixed sample props, inert and hidden from assistive tech. A guide that draws its own lookalikes
   drifts the first time the real thing changes.
5. **No money, no counts, no names, no times.** The pictures show no price, total or amount on Pay,
   and the avatars carry no initials. The table figure is the only personal value, and it is the
   guest's own (or "Your table").
6. **Page 4 follows `SURFACES.dineInPhonePay`.** Before C2 it teaches the counter in the Bill's own
   words, and no card word exists in the dialog (a red-first test). After C2 it says D5's sentence
   verbatim, then names card, Apple Pay and Google Pay as what the restaurant accepts, with no wallet
   logo. The counter line stays last as the human fallback. There is no re-show at the flip.
7. **One movement per page, demonstrating the lesson:** the pass is issued · a tablemate's dish lands
   · a segment fills · the Pay door lights · the pass tucks into Order. Each base style is the final
   frame, so reduced motion gets the same meaning with no motion. Nothing loops, auto-advances or
   chimes.
8. **No visible "Step N of 5".** The Order · Bill · Pay rail stays the only step vocabulary. Position is
   carried by the iOS-style capsule dots and their accessible names.
9. **Skip is on every page, top right, and is never the primary.** Esc and "Browse the menu" are equal
   exits. All three land on the menu's heading. The last page's primary is the real first action.
10. **Focus stays on the pressed control; one region speaks the page.** This is the efficient path for
    keyboard and switch users, with the two unmount exceptions handled explicitly.
11. **The phone's track borrows the wall's geometry and the rail's colours:** --t2 for Sent, accent for
    Cooking ("now") and green for Served ("done"). One family with m9, by shape.
12. **The pass is constant paper in Night,** with constant inks scoped on the pass, because Night's
    --ok and --t2 fail on paper (2.58:1 and 2.04:1).
13. **A pop on a wide control is 0.96 → 1 in 180 ms, never the kit's 1.18 numeral bounce.** The same
    applies to D5's "one mms-pop" on the full-width Pay door. Recorded for diner-cart's D5 PR.
14. **The sender is told it's them.** On the sender's own phone page 2 says "You send the table's
    order…" (English-only until K15). Guests read the shipped role sentence, and the staff fallback
    comes last.
15. **No swipe in v1.** Buttons and dots are the single-pointer path, and a horizontal swipe would
    fight iOS Safari's edge-swipe Back. A swipe pager is a later polish, never a requirement.
16. **Measured, not assumed:** two cookieless events (opened by source; closed by page and by exit).
    If most guests skip at page 1, the owner can retire the auto-open and keep the Account door, as a
    one-constant change.
17. **Nothing on the guide claims the dining-room TV** (it may not be installed). Page 3's key matches
    the wall's key by shape, so a guest who has seen one reads the other. D3 does not apply: the guide
    draws no Undo.

---

## OPEN RISKS

1. **It interrupts the first scan.** A hungry table meets five pages before the menu. Mitigations:
   - Skip is first in the top row;
   - it opens once;
   - known diners never see it;
   - pages hold under 1.1 s of motion.

   Watch the skip-at-page-1 rate in the first two weeks (decision 16).

2. **Onboarding is often skipped and quickly forgotten** (a well-known pattern). The guide is therefore
   a key, not the teacher. The real screens still say NOW once with their one sentence (PATH_DESIGN's
   guided register). If the events show it adds nothing, keep only the Account door.
3. **iOS Safari may clear the seen mark** after days without a visit. The known-diner clause covers
   signed-in accounts and phone payers this month. A guest who always pays cash at the counter on an
   anonymous phone may still see it again after a long gap. Accepted. It is once per gap, and Skip is
   one tap.
4. **"Google Pay" must be seen working at the flip.** D5's flip checklist proves one real Apple Pay
   payment. Add "Google Pay shows on an Android phone at a table" to that checklist, or drop "Google
   Pay" from the sentence in the flip's own commit.
5. **Hostless tables.** On a table a server started where every diner joined by code, nobody's phone
   sends, so page 2's role sentence is untrue there. The quiet line ("our staff can send it too") is
   true. A `useCart` "table has a sender" fact would let the page swap to the staff line. It is not
   specified, because the provider doesn't carry it today.
6. **The pictures depend on three unbuilt pieces:** the pass primitive, D5's progress receipt and m1's
   full-screen dialog. If any slips, m11 waits. It must never ship with redrawn lookalikes.
7. **Burmese:**
   - every heading's Burmese is a K15 draft, none owner-verified;
   - "အားလုံး အဆင်သင့်ပါပြီ" is a kiosk excerpt;
   - five staff words appear on a guest surface;
   - m1's fallback draft is reused.

   All go to the native sitting with the `K15 · diner-cart` rows. A refused string falls back to
   English only.

8. **"Served" before the plate.** The guest may see Served (Mom's bump) seconds before the bowl
   arrives, or long before it if a runner is slow. D5 and m9 carry the same truth. The guide's words
   ("as the kitchen taps it") never claim arrival.
9. **A station that is never bumped** (drinks made at the counter) keeps a dish at Sent or Cooking
   forever. On page 4's promise, that also keeps Pay shut on the phone. That is D5's device-sitting
   check ("drinks get bumped on Mom's board"), and the counter stays open regardless.
10. **The Account row's owner.** `AccountHelp.tsx` is on no stream's card. Until it is assigned, the
    guide cannot be reopened. Ship the auto-open only after the row lands, or the "under Account"
    sentence is false.
11. **Widening D1(a).** Mounting from ArrivalBeat adds one line to a file unfrozen only for PD1. If
    that is refused, mount inside TableCartProvider. That works, but it couples a dialog to a data
    provider.
12. **Mixed real and sample data.** The table figure is real; the dishes are samples. With no names,
    prices or counts, the risk that a guest reads the sample dishes as their own order is low, but
    watch for it at the device sitting.
13. **The 200 % zoom path** (the stage shrinks, the words scroll) and the Burmese line-wrap estimates
    are computed, not rendered. Measure the five pages headless at 390, 375 and 320 before merge.
14. **Night pass inks** need a scoped constant-token block on the pass primitive (post-pay's). If the
    primitive inherits theme tokens, the served green and the secondary ink fail on paper in Night.

---

## Appendix — what changed after this spec (applied in the drawn screens)

The spec above was written first. The round-3 consistency pass and an adversarial critic then changed it, and
the screens on the canvas were drawn with both applied. **Where an item below contradicts the spec above, the
item below wins**, and PATH_DESIGN_2026-10-07.md (its round-3 section) wins over both.

### A · System amendments (the round-3 consistency pass)

1. Key and track: Cooking is ink, not accent. Page 3's key is the shared KitchenTrackKey (the TV's key component) at phone size, as a role='list'.

- Delete 'the words differ by one': the wall now says 'Served · ထုတ်ပြီး' too.
- Rewrite decision 11.

2. Pictures render the real CounterPass at the 40px holder tier under one CSS scale per page.

- Retire the hand-set 56, 36, 24 and 30 px figures.
- Page 1's 'Table 7' plus 'စားပွဲ 7' becomes the label plus one figure.

3. The dismiss control is 'Close · ပိတ်' with ✕ (shell.close, shipped bilingual, and it promises nothing), replacing the English-only 'Skip'. Its sr name is 'Close the guide'. One guide grammar with m12, and one fewer K15 string.
4. Page 1 keeps the empty Back slot, so Next never moves. Every guide control arms 350 ms after the guide opens itself, because the opening tap may still be under the finger.
5. Motion:

- Page 3 FILL goes from 700 to 480 ms.
- Page 4's open is the product's door POP (0.96→1, 180 ms).
- Page 5's tuck uses RISE's curve and duration.
- Nothing loops.

6. Page 4 after C2 names only the wallets D5's flip checklist proved: Apple Pay, by condition 4. Google Pay is named only if it is added to the checklist. The list is set in the flag-flip commit, and no wallet is ever drawn.
7. One seen-key helper, guideSeenKey(surface, rev, staffId?) plus guideDue, shared with m12: marked at open, and storage refused means it never opens by itself. Whichever guide merges first lands it. The pre-C2 page 4 picture may show served rows, which matches m10's pre-C2 decision.

### B · The adversarial critic's blocking fixes (verdict: fix)

1. **Before C2, the guide still promises phone pay through its live region and page 4's accessible name, and the red-first test cannot catch it.**
   - Evidence: The brief's live region has one line for page 4: "Your bill, သင့်ဘောက်ချာ. Pay opens once everything's served." (picked-m11.md:718). The pre-C2 STATES block (:508-520) redefines the stage, h2 and sentences, but not that line and not the stage aria-label "Your bill with every dish served, and Pay lit" (:390). So a pre-C2 phone tells a screen-reader user that Pay will open on the phone, and the parked Bill has no such door. D5 says that before C2 the Bill is "PD2's counter-only Bill, exactly. No card words and no 'coming soon'." The guard at :775-777 only checks that the words "card", "Apple Pay" and "Google Pay" are absent. "Pay opens once everything's served" contains none of them, so the test passes while the promise ships. That is a substring check standing in for the behaviour (LEARNINGS #60).
   - Fix: Derive page 4's region line and stage aria-label from guidePayVariant, the same as the visible words. Before C2: "Your bill, သင့်ဘောက်ချာ. You can keep ordering — you'll pay for everything on the table at the counter." (counterKeepOrdering, cart.ts:105-107), with a counter-pass stage label. Rewrite the red-first test to assert, with the flag false, that the region's page-4 text and every stage aria-label EQUAL the expected pre-C2 strings. Add a mutant that swaps the variant on the region alone.
2. **"Google Pay" is named without the flip checklist ever proving it, and nothing removes it at the flip.**
   - Evidence: The copy ships "Then pay right here on your phone — card, Apple Pay or Google Pay." (:410, :576, :649; decision 6 at :860-861). Ruling D5's flip checklist proves exactly one real Apple Pay payment. The vocabulary says: "Wallets are named only in the after-C2 'what we accept' sentence, and only wallets the flip checklist proved." Open risk 4 (:908-910) pushes the decision to "the flip's own commit". But the sequencing says "Its page 4 copy flips with C2 automatically, and C2's own commit changes nothing here" (:807-808). So Google Pay goes live unproven.
   - Fix: Ship "card or Apple Pay". Read the wallet names from one constant that the flag-flip commit sets from the recorded checklist. "Google Pay" is added only by a commit that cites a recorded Android payment at a table. Add a test that ties the sentence to that constant.
3. **Page 3's sentence is false: the Sent stage moves on a timer, and it is not a kitchen tap.**
   - Evidence: :376 says "Each dish moves on your pass as the kitchen taps it — never on a timer." (repeated at :569, :716, :823). The vocabulary defines "Sent: past kdsLineGate's grace", and inside the grace the track draws a dashed "Sending…" segment. kdsLineGate (lib/counter-order.ts:220-225) keeps a dine-in line off the board until lineFireMs(fire_at) <= now, which is a pure time condition. TableTimeline.tsx:9-10 says "`fired` is the send", which is the diner's or staff's tap, not the kitchen's.
   - Fix: Use a sentence that is true for all three stamps, for example "Each dish moves on your pass when it's sent, then as the kitchen starts it and finishes it." Keep it English-only and listed for K15. Never say "never on a timer".
4. **Page 2 states as fact a sentence the brief admits is false on hostless tables, even though the code already knows the fact it needs.**
   - Evidence: Page 2 says "One person at your table sends the order to the kitchen from their phone" (:354-357). Open risk 5 (:911-914) concedes this is "untrue there" and says the provider does not carry a host fact. checkout-stage.ts:63-66 confirms such tables exist: a staff-started session mints host_seat null, and a joinOnly invite-link diner never claims it. The fact is already available: Checkout derives hostPresent from the server split context (Checkout.tsx:375), and the server has host_seat (floor.ts:1099).
   - Fix: Either have guideSendLine take hostPresent (a server read of the session's host_seat, passed in like welcome) and let a hostless table lead with the staff line, with a mutant on that arm; or use one sentence true in both states, such as "Your table's order goes to the kitchen in one send — from a phone at the table, or by our staff." (English-only, listed). Never ship a sentence the brief knows is false.
5. **The guide teaches controls that the sequencing ships after it.**
   - Evidence: Page 5 says "…and this guide under Account." (:434, :581). The sequencing ships "m11 (diner-cart), then post-pay's Account row" (:806-807), while open risk 10 (:931-933) says the auto-open must wait for the row "or the 'under Account' sentence is false". The brief contradicts itself. Page 2 also teaches the hollow ring and the "Not sent yet" wait block, which ship with PD1/m1: today's draft chip draws a flame glyph (Checkout.tsx:4290-4299) and no ring. PD1 is missing from the prerequisites (:795-800) and the sequencing (:806). The vocabulary says: "A guide ships after every control it teaches."
   - Fix: Add PD1 to the prerequisites. Land post-pay's Account row in the same merge window as m11, or ship m11 with its auto-open behind a constant that is off and flipped on in the Account-row PR. Sequencing becomes: tokens → pass primitive → PD1 → PD2 → D5 progress receipt → m11 together with the Account row.
6. **The kitchen track breaks the decided ONE KITCHEN TRACK: Cooking is drawn in accent, the colours are mixed per segment, the size is wrong, and the brief makes a stale claim about the wall.**
   - Evidence: The marks table (:105) and decision 11 (:872-873) put Cooking in --ac. Page 3 row 2 is "#6e6358, then #a65f10, then #e7e3dd" with the word in #8f5009 (:370-371), and the key repeats it (:383). The vocabulary says Sent is 1 lit in --t2, Cooking is 2 lit in --tx and Served is 3 lit in --ok ("colour is the stage"), and "Gold or accent is never a progress colour". Segments are 26×6 (:190); the vocabulary row is 28×6. :110-113 says the wall is "cream then gold" and says "Ready to serve". The vocabulary says the TV's Served is CALM, and "Ready to serve — Table N" survives only as Dad's console CALL, never as a mark. The citation at :105 (globals.css:2250-2257) is the Order·Bill·Pay step rail's current-step colour, not a kitchen progress colour.
   - Fix: Render lib/kitchen-track.ts's track: Sent is segment 1 in --t2, Cooking is segments 1–2 both in --tx, Served is all three in --ok, and each word uses its stage's ink (Cooking in --tx). Use the 28×6 row and the 14×5 glyph. Delete the "accent then green / cream then gold" paragraph and decision 11, and re-cite the key to the vocabulary.
7. **ONE PASS is violated: the pass is redrawn in four anatomies and four figure sizes, the figure is printed twice, the label is English-only, the inks are per-spec, and the Pay pill is redrawn.**
   - Evidence: Figure sizes: H at 36px (:183-184), page 1 at 56px ("--fs-pass scaled", :316-318), page 4 at 24px (:394), page 5 at 30px with no perforation or notches (:418-421). None is the 40px holder tier, and the vocabulary says "There is never a fourth size" and "rendered, never redrawn … inside both guides". The label/figure ratios differ (13/36, 17/56, 13/24, 13/30), so these cannot be one primitive scaled. Page 1 prints "7" twice (the Fraunces figure plus "စားပွဲ 7", :316-320), and the pre-C2 stub does the same (:510-511). The vocabulary requires ONE figure with the two-tongue label "စားပွဲ · Table", but the brief's label is English "Table". The Night section uses "the 62% ink mix #726e6b" and per-spec rgba seams (:177, :536-538), and open risk 14 (:942-943) assigns the Night inks to post-pay. The vocabulary's --pass-\* tokens (guards-style's D1(c) PR) "replace every per-spec ink mix". Page 4's "Pay · ရှင်းမယ်" with no amount (:399-402) is a state the real control never renders, which breaks decision 4's "render the real components".
   - Fix: Every picture renders the one CounterPass at the holder tier (40px), scaled only by a uniform CSS transform. Use one figure with the "စားပွဲ · Table" label, order flipping with lang. Drop page 1's separate Burmese line and the pre-C2 stub's doubled figure. Draw page 5's mini pass as the same primitive (with seam and notches). Take the inks from --pass-paper/-ink/-ink-2/-ink-3/-ac/-ok/-seam/-hole, and list guards-style's --pass-\* PR as a prerequisite. Page 4 either uses the real Pay control or draws no Pay control. Never a redrawn pill with no amount.
8. **The guide uses the wrong dismiss words: "Skip" (English-only) and "Got it · ရပြီ", where the decided word is "Close · ပိတ်".**
   - Evidence: Skip appears at :260-262, :552 and decision 9 (:868), and is listed as having "no Burmese" (:644). "Got it · ရပြီ" is the Account variant's dismiss (:240, :436, :528). The vocabulary says: "One dismiss word: 'Close · ပိတ်'." That pair is shipped in the diner dictionary (lib/i18n/common.ts:20 `close: { en: "Close", my: "ပိတ်" }`). The sibling staff guide m12 already uses it (picked-m12.md:72, :170).
   - Fix: Put "Close · ပိတ်" (common.close) top-right on every page, named "Close the guide" with the visible text first. The Account variant's last primary is also Close. Drop "Skip" and "Got it" from the copy and from the English-only list, and change the analytics `via` value "skip" to "close".
9. **Next moves under the finger, there is no same-gesture guard, and focus drops to <body> on two transitions the brief does not list.**
   - Evidence: Page 1's dock is one full-width Next (x20–370, :291). Pages 2–4 use a 1fr 2fr grid with Back at x20–133 (:292-293), so a quick second tap on the left of page 1's Next lands on Back. Page 4's Next slot becomes "Browse the menu", which dismisses (:435, :705-706), so a double tap closes the guide before page 5, the page that says where the guide lives. Searching the brief for 350, "guard" or "arm" finds nothing. The vocabulary says: "Next never moves under a finger, and controls arm after the same-gesture guard (350ms on phones)." The three docks are separate sc-if blocks, so Next on page 1→2 and Back on page 5→4 unmount the pressed control. Those cases are missing from the exceptions (:703-707), which still claims "Neither ever drops to <body>".
   - Fix: Use one dock with the same 1fr 2fr grid on all five pages. On page 1, Back's slot is visibility:hidden and inert, so Next sits at x145–370 everywhere and is never remounted (focus stays). Any control that appears or changes meaning in a slot after a page change, including "Browse the menu" taking Next's slot, arms only after 350ms; a pointer-down that began before arming is ignored. Put that guard in lib/diner-guide.ts with a mutant.
10. **Motion breaks the decided language: in product two things move at open, Tuck is not a product motion, the Fill runs 700ms against the 480ms token, and movements replay on revisit.**

- Evidence: The dialog fades over 240ms (:225-226) while page 1's rise starts at 120ms (:675). In product, the brief says .mms-rise does the moving (:688), and .mms-rise has no delay (globals.css:1076-1078). So pass and dialog move together, despite "one thing moves at a time" (:684). m11Tuck (:669, :679) is not among RISE, POP, FILL, TURN, STAMP/PRINT, FLASH or PULSE, and the vocabulary says "Motions are the product's own". :688 says .mms-rise does page 5, which contradicts the Tuck spec. m11Fill is 700ms (:677), but FILL is 480ms (--dur-slow, tokens.css:142, "all from kit tokens"). :681-682 says a movement "plays again if the page is revisited", but the vocabulary says "Never on … a revisit".
- Fix: On auto-open, page 1's RISE starts after the --dur-base fade (delay = --dur-base), or the fade is dropped and the RISE is the entrance. Replace page 5's Tuck with RISE, or give it no movement. FILL is --dur-slow with --ease-out. Each page's movement plays once per open, and a revisited page renders its final frame (a played-pages set in the component, with a jsdom test).

11. **The auto-open suppression claim is false: anonymous dine-in regulars will see the guide again by itself.**

- Evidence: Clause 6 (:219-221) says "A returning regular is never interrupted, even after Safari clears storage", based on welcome.ordersThisMonth from getWelcomeBack. That function counts paid orders with earned_by = uid (rewards.ts:314-318), and "Cash/staff-closed orders have no earner" (rewards.ts:339). Before C2, every dine-in bill is settled at the counter, so ordersThisMonth is 0 for every anonymous dine-in regular. `name` is set only for a real account with a display name (rewards.ts:320-327). The anonymous identity itself lives in browser-written cookies (AnonAuthGate.tsx:10; proxy.ts:100-104 refreshes only staff sessions), and Safari clears those along with localStorage. Open risk 3 (:903-907) narrows the gap to "always pays cash", which hides the fact that this is everyone. getWelcomeBack also returns null when there is no user or a read fails (:305-309, :330-333). Clause 6 does not say what null means.
- Fix: Correct the record: the server suppressor covers signed-in named accounts only. To make "once per phone" actually hold, also write the seen mark as a server-set first-party cookie from a small server action called at open. HTTP-set first-party cookies are not covered by Safari's 7-day cap on script-written storage. Read it in the /menu server render. Specify that welcome === null means "unknown, may open", with a mutant.

12. **The brief adds a second seen-key helper where the vocabulary decides there is one.**

- Evidence: The vocabulary says "One seen-key helper: marked at open, and storage refused means it never opens by itself." Today it lives at lib/help.ts:41-56 (HELP_SEEN_PREFIX, helpSeenKey with revisions) plus the at-open effect at HelpButton.tsx:240-256. The brief builds its own GUIDE_SEEN_KEY / guideSeenKey(rev) (:773) and re-implements the microtask read, the write at open and the refusal in DinerGuide (:780-781), while claiming the rule is "stated once for both" (:224).
- Fix: Extract one shared helper: the key builder with revision and the at-open read, mark and refusal effect, owned by the stream that owns lib/help.ts. Staff Help, m12 and m11 all consume it, and the mutants live on it once.

13. **Page 5's heading is not a control's key; it is a fragment of an unrelated kiosk sentence that cannot be pinned to its source.**

- Evidence: The vocabulary says "Titles are the controls' own keys." Page 5 teaches the tab bar (Order, Account), but its title is "You're all set" / "အားလုံး အဆင်သင့်ပါပြီ", which is "an excerpt of" kiosk handoffCounter ("You're all set — pay at the counter.", lib/kiosk/strings.ts:76-77; brief :433, :606, :631). The brief's own rule pins each reused string EQUAL to its source (:658-661), and an excerpt cannot be pinned equal.
- Fix: Title page 5 with the tab's own key ("Order", the orderNoun the bar renders; English by design), or reuse a shipped diner key whole. Never a substring of a kiosk sentence. Apply the same test to page 1, which teaches Invite under the greeting "Mingalaba".

### C · The critic's suggestions (not blocking; take them where the build agrees)

- The stage labels state sample facts as the reader's own: "Your pass: Mohinga served, Coconut Rice cooking" (:365). Page 4 also pairs the guest's REAL table figure with "every dish served, Pay lit". Prefix the aria-labels with "Example —", or print the real figure only on page 1 and use the primitive's "Your table" state in the state pictures.
- Page 2's stage label "Two dishes from two people on one order" (:340) reads out a count on a shared cart. Say "Dishes from everyone at the table, on one order, not sent yet".
- The quiet line "Tap Invite to add a phone" is false when the table is full: GuestList.tsx:230 swaps Invite for "Table's full". Branch it on the same full-table predicate.
- Add an auto-open clause: never while another modal is open (DoorSheet, InviteSheet, m1's "Show a server" dialog). Give it a mutant, so two Radix focus traps never stack.
- Focus on open to page 1's h2 needs an initial-focus opt-in. If the guide rides the @mms/ui Sheet, list D1(d)'s initialFocus PR (guards-style) as a prerequisite.
- Page 4 shows two filled gold pills (the picture's inert Pay and the dock's Next). Consider rendering the tray picture at reduced scale with pointer-events:none and no hover affordance, so the inert Pay is never tapped as a door.
- Measure the five pages headless at 390, 375 and 320 at 200% text before merge (open risk 13), including the Burmese heading wraps. The fit numbers are estimates.
- In the pre-C2 counter variant, read the quiet line and the Bill's tender line from the same PR2 binding, as specified, and include that binding in the equality test from the first blocking fix.
