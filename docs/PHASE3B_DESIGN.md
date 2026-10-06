# Phase 3b — the map catches up with the order (2026-10-03)

**The brief.** Eight blind proposals and three judges read the as-built journeys after 3a; this PR
ships the one set two of the three judges chose independently and the third's grafts agree with: the
diner spine becomes **three places** whose Order tab follows the order, the threshold stops lighting a
tab, the door becomes a one-tap moment on every menu, the menu's thrown-away pickup pick retires, and
the remembered pickup phone dies with a handover — **no money logic, no authority write, no migration.**
It is bounded to one engineer in two days and lands on the merged 3a head; everything the judges ranked
behind it is filed below as 3c–3f with the row it gets.

**Provenance.** A twelve-agent panel run in-session on 2026-10-03 (owner: "more creative world-class
design thinking overhauls — I believe in you", delegating the decisions): eight independent proposers
(dine-in · to-go · grocery · counter · kitchen · account · cross-cutting craft · an
information-architecture wild card), each blind to the others, three judges (the diner/staff advocate,
the craft director, the engineer-reviewer) scoring every proposal on impact · fidelity · feasibility ·
risk, one synthesis. The proposals and scores are the record behind every verdict below; the
decisions D7–D12 take the plan's defaults under that delegation, with D7's dead-tab demonstration
owed in the PR body.

**Form.** Evidence → decisions → the slice → scoring, as `docs/PHASE3_JOURNEYS.md`. Every claim is
file:line read from this checkout (HEAD `8d04419`, 3a round 4), never from a proposal's prose; where a
proposal's citation was stale the judges' corrected line is used.

## The panel's consensus diagnosis (structural only — craft findings go to OPEN-ITEMS)

| #   | Problem                                                                                                                                                                                                                                                                                                                                                                                                                 | Evidence                                                                                                                                                                                                                                                                                                              | Who agreed                                                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1   | **The map has a dead tab at every moment, and the threshold lights a tab for a place it is not.** Order and Track are one object in two states: pre-pay Track opens an empty slip, post-pay Order opens "This order is complete". On `/dine-in` the LIT Menu tab's href is a code-free `/menu?mode=dinein` — J15's phantom-table shape offered as the current tab. The store already says "the cart became this order". | `lib/diner-tabs.ts:49-53` (`/`, `/dine-in` → `"menu"`), `:92-110` (two hrefs, one dead each way); `:70-74` + `lib/menu-href.ts:31-33`; `ActiveOrderProvider.tsx:170-184`; `lib/cart-empty-copy.ts` (`complete`); `app/track/page.tsx` (the empty slip)                                                                | [ia]; all three judges reproduced it in two reads (craft dissents on FIDELITY — v7.2:189-193 has a Track tab) |
| 2   | **Questions asked before the moment they are used — and one whose answer is thrown away.** The pickup time is asked three times and the MENU pick is set into React state, never the cart (no `@/lib/pickup` import in the provider; `applyView` overwrites it). The table is asked before a dish is visible. Name + phone sit 10th/11th and fail only on Pay.                                                          | `TableCartProvider.tsx:250` (`useState` setter), `:401` (overwritten), `:1678-1683` (`onChosen={(slot) => setPickupSlot(slot)}`); `PickupWhenChoice.tsx:3` is the ONLY `setPickupSlot`/`setPickupAsap` importer; `app/(order)/dine-in/page.tsx` (`<TablePicker>` whole-screen); `Checkout.tsx:3246,3295` ("Required") | [togo], [dinein], [ia]; all three judges verified the dropped pick — the one LIVE honesty-doctrine failure    |
| 3   | **Two faces for one fact (the W17 drift class, applied to display).** Dine-in: Send and View bill share a stage and the undo window LOCKS the bill because the state lives in a leaf. Counter: the ticket prints pre-tax, the dock prints tax-inclusive, a thumb apart. Account: a 40-Star guest reads the first-timer lede.                                                                                            | `Checkout.tsx:519-524, 2207` (`canBill: !undoOpen`), `:3648`; `SendToKitchenButton.tsx:85-110`; `StaffTicket.tsx:260-271` vs `floor-types.ts:216` (`settleTotalCents`, no `taxCents`); `account/page.tsx:203,216`                                                                                                     | [dinein], [counter], [account]; judges verified every line                                                    |
| 4   | **Device memory outlives the handover.** `mms.phone` is written and read by Checkout as a bare literal and is NOT in `deviceSessionKeys`, so "Order for a friend" / "Switch account" leave the owner's phone pre-filled in the friend's pickup order.                                                                                                                                                                   | `lib/device-session.ts:25-34` (`DEVICE_NAME_KEY` + `mms.qr.*` only); `Checkout.tsx:455, 1897`                                                                                                                                                                                                                         | Found independently by [togo] and [account]; all three judges: ship ONCE                                      |

**Cross-cutting, agreed by all three judges:** (a) ~48 Burmese K15 drafts queued across the eight with
no batching plan — [kitchen]'s zero-new-strings discipline is the model; (b) eight proposals each
titled their DESIGN-LANGUAGE addition "§31" — the doc ends at §30 (`:2295`); (c) nothing was measured
on a device; (d) 3a is on an OPEN PR — every proposal that touches the tab bar, Checkout or the hub must
branch from the MERGED head and budget the rebase; (e) `lib/diner-tabs.ts` and `lib/device-session.ts`
are NOT in the 166-file lib bucket, so new mutants there change CLAUDE.md's enumeration — unsaid by
[ia] and [togo].

## Ranked proposals

Totals are the judges' own (impact · fidelity · feasibility · risk, /20 each); the sum ranks.

| Key     | Title                                                              | Size | Advocate | Craft | Engineer | Sum  | Consensus verdict                                                                                                                                                                           |
| ------- | ------------------------------------------------------------------ | ---- | -------- | ----- | -------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| kitchen | The pass at two distances — Aa + bell circles, glance strip, Late  | M    | 18       | 17    | 17       | 52   | **Build next (3d, parallel session).** Top score, zero new strings, no money — but staff-side, and it needs two owner decisions first (retire the slider; §17's "not a bar circle").        |
| ia      | Three places, one order — Menu · Order · Account, door as a moment | M    | 18       | 16.5  | 17       | 51.5 | **Build now.** Two judges' chosen slice; the only one that fixes a first-timer's first two taps with no money, no backend. Craft's fidelity dissent is answered in D7 (owner's call).       |
| togo    | To-go, asked once — slip, one When sheet, counter pass             | L    | 16       | 16    | 15       | 47   | **Build now (honesty core) · next (3e, the slip).** All three: retire the thrown-away menu pick and land the phone key NOW; the Who/When slip and the counter pass are the next to-go PR.   |
| craft   | One paper, one hello, one goodbye                                  | L    | 14       | 14    | 14       | 42   | **Park until 3c–3e settle (3f).** A coherence pass over shapes still moving; its empties module and `said-once` guard are the keepers. Its "peaks rule" is an invented voice rule (D12).    |
| counter | The pad is the register                                            | L    | 14       | 13.5  | 14       | 41.5 | **Build next (3d), split.** The receipt stack (`taxCents` from `getCartTotals`) is a standalone S that fixes two bases on one screen; the cash-sheet re-host follows with a tablet in hand. |
| account | Known at the door                                                  | L    | 12       | 14    | 15       | 41   | **Build next (3e), decomposed.** Reward terms from config + LA expiry + history foot + receipt link are an S/M on their own; the chip question sits on the Stars-carry path — its own PR.   |
| dinein  | The table is declared when the food leaves it                      | L    | 13       | 13.5  | 13       | 39.5 | **Build next (3c), in two PRs.** Highest diner impact, lowest feasibility: the Checkout half (verb · lifted undo · bill live) first; the table-at-send authority half after the index.      |
| grocery | One basket, one thumb, one pass                                    | L    | 13       | 13.5  | 12       | 38.5 | **Park (G-rows).** The right shape for a market that cannot be used until G1's real UPCs land; `queryKind`, the Undo toast and the two 40px literals are the XS keepers.                    |

## The decisions (D7–D12 — continuing `docs/PHASE3_JOURNEYS.md`)

- **D7 — the spine is three places, and the Order tab follows the order.** Menu · Order · Account.
  A tab is a PLACE a diner can always go, never a state that is sometimes empty. The Order tab is a
  pure state machine in `lib/diner-tabs.ts`: an open cart → `/cart?cart=` with `slotCount`'s badge;
  else a live order → `liveOrderTrackHref(order)` with the dot; else bare `/cart` (its own `none` slip).
  _Rejected:_ keeping Track — at every moment exactly one of Order/Track is a dead end, reproducible in
  two taps on any device. _Rejected:_ merging `/cart` and `/track` into one route — 5.8k lines of money
  UI with their own suites; the map changes, the pages do not. **⚠ OWNER's call** — this reverses D1
  one day after it shipped, and v7.2 (`:189-193`) ships a Track tab. Default: ship it, with the dead-tab
  demonstration (two screenshots: pre-pay Track, post-pay Order) in the PR body. If vetoed, D1's four
  stand and this PR ships D8–D12 unchanged (the threshold rule and the DoorSheet do not depend on D7).
- **D8 — the threshold is before the map.** `/` and `/dine-in` light NO tab; on both the Menu tab leads
  "up" to `/` (the doors), never to `menuHref(tabsMode)`. _Rejected:_ lighting Menu there — on
  `/dine-in` the lit tab's href is the J15 phantom-table link. _Rejected:_ hiding the bar on the
  threshold as v7.2 does (`if(!S.mode)… display:none`) — a returning diner landing on the front door for
  yesterday's receipt needs Account in one tap, and "a tab never appears or disappears" (§30) stands.
- **D9 — the door is a moment, and the eyebrow has ONE host.** The menu masthead's eyebrow opens a
  `DoorSheet` titled v7.2's "Change order type" on EVERY door (dine-in, to-go, the market), absorbing
  `TableOptions`; the current door wears the existing lit-gold cap, the other two are the home's exact
  links. **3c-i's table grid lands as a SECTION of this sheet, never a second sheet** — [dinein] and
  [ia] both claimed the eyebrow; sequencing, not merging, resolves it. The sub-line is honest: v7.2's
  "Your cart stays with you." is FALSE here (each door mints its own cart) and is refused.
  _Rejected:_ a dead `<p class="eyebrow">` plus brand-link → `/` → re-pick (three taps, two routes).
- **D10 — one owner per fact: the When write lives in the checkout.** The menu's `PickupSlotChip` and
  the provider's own `PickupSlotSheet` mount retire; `PickupWhenChoice`'s token-gated, serialized,
  drain-before-charge chain is the ONLY writer (unchanged). The greeting becomes a statement.
  _Rejected:_ wiring the chip to `lib/pickup` — a second writer of one fact on a surface with no drain
  before create-intent (the W21 `writesRef` lives in `PickupWhenChoice`), i.e. the W17 drift class.
- **D11 — device memory is named once and dies with the handover.** `DEVICE_PHONE_KEY = "mms.phone"`
  joins `deviceSessionKeys`; Checkout reads the constant; `docs/SHARED_DEVICE.md` lists it. Landed
  ONCE (both [togo] and [account] proposed it). **OWNER policy, default taken:** the pickup phone is
  remembered per device until `mms_profiles.phone` exists (a prod migration behind M125). _Rejected:_
  the profile column now — the divergent history forbids it; the copy that later says "Saved on this
  phone" (3e) is literally true under this rule.
- **D12 — the voice rule stays DL §6 until a native ear rules: English leads, Burmese is the accent.**
  [craft]'s "peaks rule" (Burmese LEADS at hello and thank-you) is a register bet, not a rule the doc
  grants; it is parked as a K15 question. The one bilingual graft this PR ships — PaySuccess reading the
  dictionary's `paidThankYou` pair, which has zero consumers today — renders EN first with the MY beneath
  (`lang="my"`). Two housekeeping rules ride with it: **DESIGN-LANGUAGE §31 belongs to THIS PR** (the
  next slice writes §32); and **every PR's Burmese drafts go into one K15 ledger row in OPEN-ITEMS**,
  reviewed one native round per phase, not per PR. **OWNER (Min) call** on the peaks; default: parked.

## Slice 3b — THIS PR

Built on the designated branch `claude/ui-ux-design-improvements-l2b0c0` on top of 3a's final head
(`8d04419`). The owner's merge click for #312 did not come within the session, so 3b was pushed onto
that same branch and **#312 carries 3a and 3b together** — one squash, two CHANGELOG entries; the PR
title and body say so. (The ritual's own API merge had been refused as a CI bypass with Codex out of
review credits.) One engineer, two days: M ([ia]) + S (the pickup chip and its sheet) + S (the phone
key) + two XS grafts (door copy; the paid pair). As built, the DoorSheet arc and the pickup-chip
retirement were built in parallel by two isolated engineers on disjoint files and integrated by the
lead; the tab bar, the phone key and the paid pair by the lead.

Review lenses for the blind pass: **product truth · a11y · concurrency**. Money semantics is NOT a lens
because no amount is computed, gated or displayed differently anywhere in this diff — the one Checkout
edit is a storage-key literal; `check:money-coverage` still demands mutants for the two lib modules.

### Screen 1 — every diner route · the tab bar

- **Route:** every route where `dinerTabsHidden` is false.
- **What changes:** three equal columns (`grid-template-columns: repeat(3, minmax(0,1fr))` at
  `globals.css:4579`; `--tabs-h` stays 60px; same `--glass-chrome` pane and `view-transition-name`).
  `lib/diner-tabs.ts` gains `orderTab(s)`: (1) `s.cartId` → `/cart?cart=<id>`, badge `slotCount` (never
  a shared dine-in count, never zero, never without a cart id — unchanged); (2) else `s.order` →
  `liveOrderTrackHref(s.order)`, badge `"dot"`; (3) else `/cart`, no badge. Label `orderNoun(mode)`
  (Order / Basket); icon `receipt` in all three states — a tab never changes shape under the thumb, only
  its claim. `DinerTabKey` drops `"track"`. `activeDinerTab`: `/menu`,`/grocery` → menu; `/cart`,`/track`
  → order; `/account`,`/rewards` → account; `/`,`/dine-in` → **null**. Menu tab href on `/` and
  `/dine-in` is `/`; elsewhere `menuHref(tabsMode)` as today. Account unchanged. The `/account`-only
  `useActiveOrderStatus` subscription (`DinerTabs.tsx:57-59`) is KEPT — it is what retires a finished
  order's dot on the one route with no other owner. **The drain block (`DinerTabs.tsx:134-138`) stays
  byte-identical** — the mutant `diner-tabs/order-tab-skips-the-drain` anchors on it.
- **Copy:** verbatim 3a/v7.2: "Menu", "Market", "Order", "Basket", "Account". Accessible names reuse
  3a's shapes: "Order — 3 items" · "Order — an order in progress" (NEW, for state 2; "Basket — an order
  in progress" in the market) · "Account — 12 Stars". Labels stay English (D2). No new MY.
- **Motion:** none new; the bar never re-animates; `.diner-tab:active` and its RM block unchanged.
- **a11y:** `aria-current="page"` on at most one tab, none on `/` or `/dine-in`; the dot/count stay
  `aria-hidden` under a link whose name carries the claim; every link ≥44px (three columns widen each to
  ~146px at 440px); no live region in the bar.
- **Files:** `lib/diner-tabs.ts`, `lib/diner-tabs.test.ts`, `components/nav/DinerTabs.tsx`,
  `components/nav/DinerTabs.test.tsx`, `app/globals.css`.
- **Pure module:** `lib/diner-tabs.ts` — `orderTab`, `activeDinerTab`, `dinerTabs`.
- **Guards (red-first, each watched red by flipping the rule):** no cart + live order → href is
  `liveOrderTrackHref`, badge `"dot"`; cart AND live order → the cart wins; nothing → bare `/cart`, no
  badge, label still the mode's noun; `activeDinerTab('/cart')` and `('/track')` → `"order"`; `('/')` and
  `('/dine-in')` → `null`; on `/dine-in` the Menu href is `/` and NEVER matches `/^\/menu\?mode=dinein/`;
  exactly three tabs with keys menu/order/account; at most one current and none on the threshold.
  `DinerTabs.test.tsx`: "four links" re-pinned to three; a live order with no cart yields a link named
  "Order — an order in progress" pointing at the track href; a DONE order on `/account` yields plain
  "Order" → `/cart`; the drain test (`:110`) stays green. **Mutants** (`scripts/verify-slice.mjs`):
  `diner-tabs/order-tab-ignores-the-live-order` (the `s.order ? liveOrderTrackHref(s.order) : "/cart"` arm
  collapsed to `"/cart"`); `diner-tabs/cart-loses-to-the-live-order` (precedence flipped);
  `diner-tabs/threshold-lights-the-menu` (`case "/": case "/dine-in":` returning `"menu"` again) — then
  `pnpm check:mutant-anchors` (the existing drain anchor still matches) and
  `pnpm verify:slice --only=diner-tabs`.

### Screen 2 — `/` · the threshold

- **What changes:** the page is unchanged (HomeHero → resume cards → three ModeCards → JoinTable). The
  bar is drawn, nothing lit; the Menu tab is a self-link to `/` (`TransitionLink` already replaces a
  same-pathname push); the Order tab shows the live dot when an order is in flight (HomeResumeCard says
  the same in words — one source, two honest renderings). The three doors read from a NEW
  `lib/doors.ts` `DOORS` constant (mode · href · door · emoji · name · my · description) so the home
  and the DoorSheet cannot disagree. **Graft (door copy):** the Dine-in description returns to v7.2's
  verbatim line — the shipped "Pick your table, invite friends, order together" promises a pre-menu
  picker 3c retires anyway.
- **Copy:** "Grab a table, invite friends, order together" (v7.2:293 verbatim). Everything else shipped
  and unchanged (ဆိုင်တွင်စားရန် · ပါဆယ်ယူရန် · ကုန်စုံဝယ်ရန်; "Order ahead for pickup — now or
  scheduled"; "Browse the aisles or scan the code on each package as you shop").
- **Motion / a11y:** unchanged; no `aria-current` in the bar on this route.
- **Files:** `app/page.tsx`, `lib/doors.ts` (new; carries `// verify:slice-exempt — static door
table, no branch; its hrefs are pinned against the DoorSheet by DoorSheet.test`), `components/ModeCard.tsx`
  (export `DoorFace`; optional `source` on the posthog capture).
- **Guards:** `DoorSheet.test.tsx` asserts the sheet's two link hrefs equal `DOORS`' (never transcribed);
  `page.tsx` renders `DOORS.map(...)` so a door added in one place appears in both.

### Screen 3 — `/dine-in` · the table picker (threshold)

- **What changes:** page unchanged (route → sheet is 3c-i). Bar: nothing lit; the Menu tab's href is `/`.
  The Order tab follows the store (a phone already at a table shows its cart).
- **Copy / motion / a11y:** unchanged; TablePicker's labels untouched.
- **Guards:** `lib/diner-tabs.test.ts` (above) — the phantom-table href assertion is the one that
  matters here.

### Screen 4 — `/menu?mode=dinein` and `?mode=pickup` · the eyebrow becomes the DoorSheet

- **What changes:** `MenuBrowser.tsx:631-637`'s ternary becomes one mount on every mode:
  `<DoorSheet mode={mode} onOpenChange={setDoorSheetOpen} />`, and `PullToRefresh`'s `disabled` reads
  `!!sheetItem || doorSheetOpen` (the Codex-r4 suspension survives the rename, on every door now).
  Trigger: the existing `.eyebrow.menu-context-btn` — "At table 7 ⌄" (from `useCart().tableNumber`, as
  `TableOptions.tsx:40-41` does) / "At the table ⌄" / "To go ⌄" (`doorFor(mode).label`),
  `aria-haspopup="dialog"`, `aria-expanded`, sr-only suffix. Sheet (`@mms/ui Sheet`): title "Change
  order type"; the sub-line; the three doors in the home's order as `DoorFace` rows — the CURRENT door a
  non-link `<div aria-current="true" class="door-sheet-current">` wearing the lit-gold cap (a selector
  ADDED to the `.checkout-pill-on` family at `globals.css:2731`, ink follows the fill, never a second
  block), its name "Dine-in · Table 7" when a number is known (v7.2's `modeChip` form, `:303`); the other
  two `TransitionLink`s to `DOORS` hrefs firing `posthog.capture("mode_selected", { mode, door,
source: "sheet" })`. Dine-in only, under a hairline: the two exits verbatim from `TableOptions`
  (secondary "Back to the start · keeps your table" → `menuHref(null)`; danger "Leave this table · this
  phone only — the table stays open for everyone else" running `forgetDineinOnThisDevice()` +
  `forgetCart()` in the click). `.table-options*` rules become `.door-sheet-exits*`. `TableOptions.tsx`
  is deleted. GuestList, YourUsual, MenuTimeline untouched.
- **Copy:** VERBATIM v7.2: "Change order type" (`:346`). VERBATIM shipped: the three doors' names,
  Burmese lines and descriptions (from `DOORS`); the two exits. NEW EN: sub-line "Each way of ordering
  has its own order." (replaces v7.2's false "Your cart stays with you."); sr-only trigger suffix
  " — change how you're ordering" (EN only; an `aria`/sr suffix carries one tongue, the shipped
  convention). **NEW MY — K15 drafts, both flagged `// K15 draft` in `lib/i18n/common.ts`:**
  `changeOrderType: { en: "Change order type", my: "မှာယူပုံ ပြောင်းရန်" }` ·
  `eachDoorOwnOrder: { en: "Each way of ordering has its own order.", my: "မှာယူပုံတစ်ခုစီမှာ
ကိုယ်ပိုင်အော်ဒါ ရှိပါတယ်။" }` (the glossary noun အော်ဒါ, never မှာယူမှု).
- **Motion:** the Sheet primitive's spring (RM-escorted in the primitive). No `.mms-stagger` inside —
  opening a sheet is not a premiere. The lit cap is static.
- **a11y:** the Sheet restores focus to the trigger (J21); the current door is `aria-current="true"`,
  not focusable, label + fill on ONE element (§: active state self-contained); each door row ≥44px
  (`DoorFace` tiles are 52px); the exits keep their two-line labels; the sheet adds no live region (the
  provider's one announcer stays).
- **Files:** `components/DoorSheet.tsx` (new), `components/DoorSheet.test.tsx` (new, `/** @vitest-environment jsdom */`),
  `components/menu/TableOptions.tsx` (delete), `components/menu/MenuBrowser.tsx`, `lib/i18n/common.ts`,
  `app/globals.css`.
- **Pure module:** `lib/doors.ts` (data, exempt) + `doorFor` (`ArrivalBeat.tsx:39`, unchanged).
- **Guards (jsdom, red-first against a stub):** the current door renders `aria-current="true"` and is
  not a link; the other two are links whose hrefs equal `DOORS` (`/dine-in`, `/menu?mode=pickup&door=togo`,
  `/grocery`); dine-in renders exactly the two exits, pickup and scango render none; opening calls
  `onOpenChange(true)`, closing `onOpenChange(false)` (the pull-to-refresh seam); the sub-line is present
  and the string "Your cart stays with you" appears nowhere (the honesty assertion); the danger exit calls
  `forgetDineinOnThisDevice` then `forgetCart` (spies, in order). Stylesheet parse (the LEARNINGS #101
  idiom): `.door-sheet-current` appears in the ONE lit-cap rule list and nowhere else.
  `lib/i18n/plain-words.test.ts` + `strings.test.ts` on the two new keys.

### Screen 5 — `/grocery` · the market's eyebrow

- **What changes:** `grocery/page.tsx:921-925`'s static eyebrow becomes the same `DoorSheet` trigger
  reading "Scan & go ⌄" (`doorFor("scango")`), current door = Grocery lit, the two food doors as links,
  no exits section. The decorative "· စျေး" flourish rides inside the trigger as today (`aria-hidden`).
  **`ScanStage`'s `sheetOpen` must include `doorSheetOpen`** — `decodeHold` treats any sheet over the
  stage as a camera hold, and this is a new one. Browse/Scan, the basket sheet, the CTA band and the
  write ledger are untouched.
- **Copy / motion / a11y:** as Screen 4; no live region added (G15's seams untouched).
- **Files:** `app/grocery/page.tsx` (the eyebrow slot + one `||` in the `sheetOpen` expression only).
- **Guards:** `pnpm check:scan-repeat` (page.tsx is touched — both propositions must still parse);
  a hand-read that `sheetOpen` names the new state; manual: open the sheet over a live stage on a phone
  and confirm the reticle stops reading while it is up.

### Screen 6 — `/menu?mode=pickup` · the thrown-away pick retires (D10)

- **What changes:** `PickupSlotChip.tsx` is DELETED; `MenuBrowser.tsx:7` (import) and `:654` go. In
  `TableCartProvider.tsx` the `PickupSlotSheet` import (`:54`), `openSlotSheet` (`:154, :1421, :1574,
:1602`), `slotSheetOpen` (`:259`) and the mount (`:1678-1683`) are removed; **`pickupSlot` read from
  the view (`:250, :401`) STAYS** — the greeting reads it. `ArrivalBeat.tsx:57-58` becomes two statements
  from `useCart().pickupSlot`: no slot → "Order when you're ready — we'll pack it to go."; a slot (a
  diner back from checkout) → "Scheduled for {formatSlotLong(slot)} — change it at checkout." No control.
  `PickupSlotSheet.tsx` itself stays (PickupWhenChoice mounts it on `/cart`).
- **Copy:** NEW EN (the greeting line is English-only beside the bilingual Mingalaba today — a
  pre-existing K15 gap, not new debt): the two statements above. RETIRED: "Pick a time — we'll have it
  ready." · "Pickup · as soon as possible" · "Schedule ›" · "Change" · the chip's two aria-labels.
- **Motion:** none added; the greeting rides the existing `mms-stagger` arrival beat.
- **a11y:** one `button` fewer before the first dish — a control whose answer the app could not keep.
- **Files:** `components/PickupSlotChip.tsx` (delete), `components/menu/MenuBrowser.tsx`,
  `components/TableCartProvider.tsx` (⚠ mutate set — commit before any `verify:slice` run, never during;
  its existing mutants must stay RED), `components/TableCartProvider.test.tsx` (drop the
  `./PickupSlotSheet` mock at `:79`; the ctx fixture at `:156` loses nothing — `pickupSlot` stays),
  `components/menu/ArrivalBeat.tsx`, `components/menu/ArrivalBeat.test.tsx` (new, jsdom — the engineer
  noted no suite exists).
- **Pure module:** none new — the decision is a deletion; `formatSlotLong` (`lib/pickupTime.ts`) is the
  one formatter.
- **Guards:** `ArrivalBeat.test.tsx` (jsdom, `useCart` mocked): pickup with `pickupSlot: null` renders
  "Order when you're ready" and never the word "Pick"; with a slot renders "Scheduled for …" and never a
  `button`; dine-in and scango lines unchanged. `pnpm knip` reports `PickupSlotChip` gone and no
  `openSlotSheet` export; `grep -rn openSlotSheet apps/qr` → 0 before the PR opens. A type-level pin in
  `TableCartProvider.test.tsx`: `// @ts-expect-error` on `ctx.openSlotSheet`.
  `pnpm verify:slice --only=t33` (the provider's mutants) green; the full run once on the merge head.

### Screen 7 — `/cart` (pickup) and the account handover · the phone key (D11)

- **What changes:** nothing visible. `lib/device-session.ts` exports `DEVICE_PHONE_KEY = "mms.phone"`
  and `deviceSessionKeys` matches it; `Checkout.tsx:455` and `:1897` import the constant (the two literals
  go). "Order for a friend", "Switch account" and "Forget this device" (all through `clearDeviceSession`)
  now clear the phone. `docs/SHARED_DEVICE.md` lists the key beside `mms.name`.
- **Copy / motion / a11y:** none.
- **Files:** `lib/device-session.ts`, `lib/device-session.test.ts`, `components/Checkout.tsx` (⚠ mutate
  set — literal only; existing mutants cover), `docs/SHARED_DEVICE.md`.
- **Pure module:** `lib/device-session.ts` — `deviceSessionKeys`.
- **Guards:** `device-session.test.ts` — RED FIRST (the key survives today):
  `deviceSessionKeys(["mms.phone","mms.name","mms.qr.x","mms.identities"])` includes `mms.phone` and
  excludes `mms.identities`; `clearDeviceSession` removes it; the "exports the literal keys the rest of
  the app writes" case (`:41`) gains the phone. **Mutant** `device-session/phone-survives-the-handover`
  (the `k === DEVICE_PHONE_KEY` arm dropped). `grep -c '"mms.phone"' apps/qr/components/Checkout.tsx` → 0,
  asserted via `readFileSync` in the device-session suite (the one-source guard, [togo]'s idiom).

### Screen 8 — `/track` after payment · the paid headline speaks both tongues (D12 graft)

- **What changes:** `PaySuccess.tsx:160`'s hardcoded h1 reads the dictionary's `paidThankYou` pair
  (`lib/i18n/cart.ts:121`, zero consumers today): EN first, then `<span lang="my">` beneath, in the same
  `.pay-success-title` slot; the `awaitingCapture` arm keeps its shipped "Order sent — thank you!"
  (EN only — its MY is a 3f draft, not this PR's). Check draw-on, Stars pill, confetti, haptic, chime
  untouched.
- **Copy:** the dictionary's `en` changes from "Paid. Thank you!" to v7.2:468's verbatim
  "Paid — thank you!"; MY stays the shipped K15-era "ရှင်းပြီးပါပြီ။ ကျေးဇူးပါ" (v7.2:468 has
  "ရှင်းပြီး။ ကျေးဇူးပါ" — the difference is flagged in the K15 ledger row, not resolved here).
- **Motion:** unchanged.
- **a11y:** the h1's accessible name reads both; `lang="my"` on the Burmese span; no live-region change.
- **Files:** `components/PaySuccess.tsx`, `lib/i18n/cart.ts`, `components/PaySuccess.render.test.tsx`
  (new, jsdom — the existing `PaySuccess.test.tsx` is a node suite for the latch and stays).
- **Guards:** the h1 contains a `lang="my"` span equal to `CART.paidThankYou.my` and text equal to `.en`;
  the English precedes the Burmese in DOM order (D12); existing latch cases green.

### The slice's bookkeeping (every push)

- `scripts/verify-slice.mjs`: +3 `diner-tabs/*`, +1 `device-session/*` mutants, each watched RED then
  restored. `lib/diner-tabs.ts` and `lib/device-session.ts` JOIN the lib bucket: **166 → 168** — re-measure
  with CLAUDE.md's prescribed grep and update the enumeration there, never by eye.
- `pnpm check:docs` (step ONE of the lane; refresh OPEN-ITEMS/HANDOFF counts) · `check:style-literals`
  (the ratchet may fall, never rise — the chip's inline block goes; no new px) · `check:theme` ·
  `check:scan-repeat` · `check:mutant-anchors` · `pnpm turbo lint typecheck build test` ·
  `pnpm verify:slice` once on the merge head.
- Docs: `docs/PHASE3_JOURNEYS.md` (D1 amended by D7; the slice table re-lettered per below);
  `docs/DESIGN-LANGUAGE.md` (§30's "always the same four" → three; **§31 — a tab is a place, the door is
  a moment, one owner per fact**); `docs/OPEN-ITEMS.md` (J25 reshaped — the false Track promise is gone,
  the kitchen rail stays filed; J24 partially closed — the menu asks no more, the slip is 3e; J15 note —
  `/dine-in`'s tab no longer offers the code-free menu; a K15 ledger row for the two drafts + the
  paidThankYou MY question + the now-feasible Burmese tab labels); `CHANGELOG.md` (Phase 3b entry);
  `ROADMAP.md`; `docs/HANDOFF.md`.
- The ritual: `pnpm review:bundle` → blind adversarial pass (lenses above, ≤3, ≤10 agents, ~15 min) →
  draft PR → `@codex review` → mark ready → **WAIT, event-driven**, for "Codex has reviewed" the merge
  head → fix-or-justify (two rounds) → merge. The PR body carries the dead-tab demonstration (D7).

### Out of scope (this PR)

- Merging `/cart` and `/track` into one route; any change to Checkout's stages, Pay gating, the undo,
  or any amount — 3c.
- The table at Send, `/dine-in` as a sheet, the seated predicate — 3c-ii.
- The Who/When slip, inline contact errors, Pay stating its reason, the ASAP chip, the counter pass — 3e.
- `accountName` seeding, reward terms from config, the chip question — 3e.
- Burmese tab labels (three columns make the stacked pair feasible — a K15 row, not drafted here); any
  `<Bi>` primitive or voice-rule change — 3f after D12 is ruled.
- Rewards as a fourth tab (a hub panel since D4); auto-resuming `/` into a remembered mode (the
  `menuHref` never-guess rule stands).
- Every market change beyond the eyebrow (G-rows, behind G1).

### Dependencies

- **3a merged** — branch from its merged head; budget the rebase if Codex round 5 moves `DinerTabs.tsx`.
- **Owner, three words:** (1) three tabs (D7, with the demo); (2) the menu's pickup chip goes (D10);
  (3) the device-scoped phone policy (D11). D12's peaks question is a K15 read, not a blocker.
- **K15 (Min):** two Burmese drafts (`changeOrderType`, `eachDoorOwnOrder`) and the `paidThankYou` MY
  variant question, ledgered in one OPEN-ITEMS row.
- No prod migration, no RPC, no photo shoot, no SKU import, no hardware.

### Risks

- **Owner optics:** four tabs yesterday, three today. The prototype's four included Rewards (now a
  panel), so four was never load-bearing; the dead tab reproduces in two taps on any device — the PR
  body shows it, the argument does not carry alone.
- **Cart-wins precedence** hides a PAID order's dot while a new cart is open; the header chip (status
  word + panel) still carries it, as before 3a. Pinned in the lib test and said in the docblock.
- **The drain anchor:** reshaping the Order tab's click handler silently breaks
  `diner-tabs/order-tab-skips-the-drain`; `check:mutant-anchors` catches it in ~1 s — run it first and
  after every edit to `DinerTabs.tsx`.
- **`/account`'s dot** depends on the one-route `useActiveOrderStatus` subscription staying when the
  `track` key is deleted — the suite's `:106` case guards it; do not simplify it away.
- **DoorSheet over the scan stage:** a new sheet the camera's `decodeHold` must know about; a missed `||`
  means the reticle keeps reading under the scrim. Hand-read + device check.
- **Pull-to-refresh suspension** moves from dine-in-only to every door (`disabled={!!sheetItem ||
doorSheetOpen}`) — DoorSheet.test pins `onOpenChange` on both edges.
- **Two mutate-set components touched** (TableCartProvider, Checkout) — commit before any `verify:slice`
  run, never during one (LEARNINGS #74); check for a live run with the `ps … awk` CLAUDE.md prescribes,
  not `pgrep -f`.
- **The DoorSheet "switch"** navigates to a door whose menu mints a SEPARATE cart (per-mode session keys);
  the sub-line says so, and HomeSessionCard shows both — the honest state, named.
- **`check:docs` is step one and `bash -e`** — a stale count stops the fourteen guards behind it.

## Slices 3c–3f — filed (the runners-up, re-lettered; `docs/PHASE3_JOURNEYS.md`'s table is amended)

- **3c — Dine-in, two PRs.** _3c-i (Checkout only, no authority change):_ `orderStageHero` in
  `lib/checkout-verb.ts` (one hero verb per state), the undo lifted into a Checkout hook so the bill
  door is live during the grace, Pay `aria-disabled` + `aria-describedby` with "Pay opens when the undo
  window closes.", the receipt-style Total row under the dishes (the View-bill button's own binding,
  named once), the line ⋯ sheet, and the table grid as a SECTION of the DoorSheet (D9). _3c-ii
  (authority):_ `seatedSessionFor`, the sticker scan joining a late-bound session, the CAS `bindTable`
  with row-count + re-read, the register refusal — ideally after a partial unique index on
  `table_sessions(table_number) WHERE status='active' AND mode='dinein'` lands one-file via
  `apply_migration`. **Rows:** J22 · J23 re-pointed to 3c-i/ii; a new M-row for the index (blocked on M125).
- **3d — Staff, two independent PRs.** _[kitchen] whole_ (M, zero new strings): Aa + bell as bar circles,
  the glance strip (Open · Late at `--kfs-id`), the word "Late" in the ticket badge via `kdsBadgeKeys`
  (ship this XS first if nothing else — WCAG 1.4.1 under reduced motion), mute silences `play()`; owner
  decisions on the slider and §17 first; measured at 1366 before merge. **BUILT #315 (2026-10-06), the owner
  decisions taken under delegation:** (a) the slider retires — a bar circle, a fixed 0.8, the mute a predicate
  handed to the chime and defaulting open; (b) Aa opens Help straight onto Text size; (c) §17's "not a bar
  circle" narrows to the counter's width reason (DESIGN-LANGUAGE §34). Measured at 1366 and 390 in headless
  Chromium with the production CSS (K38's close). _[counter] split:_ the receipt
  stack (BUILT #315 as Subtotal · Discount · Tax · Total — D1 "Tax" the console's receipt word, D2 one combined
  Discount row — `taxCents` read verbatim from `getCartTotals` on the detail read)
  as a standalone S closing the two-bases bug; the cash-sheet re-host (`beforeOpen` gate, `HandoffCard`
  `next` slot, poll pause after a landed settle) as its own money PR with a tablet in hand.
  **Rows:** K38 (closes with kitchen); K39 narrowed (the lane's Picked-up undo EXISTS —
  `ExpoBoard.tsx:873`); a new K-row for the receipt stack; §28's exception recorded.
- **3e — To-go + account, decomposed.** _To-go:_ the Who/When slip driven by `lib/pickup-details.ts`
  (`payBlock: 'contact' | 'when' | null`), `PICKUP_CONTACT_MESSAGES` named once and imported by
  create-intent (string source only; the grep-is-0 parse guard), the ASAP chip inside the one sheet,
  the counter pass at ready — built ONCE as a shared pass primitive with the market's exit pass (same
  kicker · amount · code · status grammar). _Account:_ `rewardTerms` from `mms_rewards_config` (null on
  failure, never typed defaults), `couponExpiryLabel` in America/Los_Angeles (XS — `RewardsHub.tsx:89`
  prints a day late), the honest history foot + the 50-row link, the receipt link on a row; the chip
  question and the recognition masthead as a separate PR on the Stars-carry path. **Rows:** J24 (the
  slip half); 3e's rows; a new row for `mms_profiles.phone` (prod migration, M125).
- **3f — the craft coherence pass, LAST.** `lib/empty-copy.ts` bilingual empties through the one
  `EmptyState` primitive (the highest craft ROI), the `said-once` AST guard, one paper on `/` and
  `/dine-in` (`PaperAmbient`, the `isolation: isolate` host retired), the post-pay stack ordered by
  `successStack` with the goodbye last, TierUp inline — each over surfaces whose shape 3c–3e have
  settled; the `<Bi>` primitive only after D12 is ruled; the cart-bar count removal argued to the owner
  together with 3b's Order-tab count (the same §21 argument, made once). **Rows:** J25's prompts half;
  a K15 batch row for its drafts; a new J-row for the brand `view-transition-name`.
- **Parked — the market (not lettered until G1).** Scan as a sheet, the basket dock, the miss ladder,
  Undo via a fresh `scanAdd`, the live pass reading the expo's Verified. Keepers that need no G1:
  `queryKind` so a typed 8–14 digit code is not told "No matches" (XS), the Toast `action` Undo on remove
  (S), the two 40px literals → `--fs-display`/`--fs-h1` (XS, the ratchet falls). **Rows:** G24 (partial),
  G20, G7's remainder, G22 unchanged.

## Risks the blind pass should hunt (lenses: product truth · a11y · concurrency)

- **Product truth:** does every Order-tab claim ("3 items", "an order in progress", the dot) hold at the
  moment it is drawn — a DONE order on `/account`, a paid order with a new cart open, a dine-in shared
  cart (no count)? Does the sub-line "Each way of ordering has its own order." stay true when a diner
  switches doors with items in hand (two open orders, both on the home)? Does the pickup greeting ever
  say "Scheduled" for a slot the server rejected?
- **a11y:** exactly one `aria-current` per route and none on the threshold; the current door's lit cap
  carries its label on the SAME element; the sheet's focus return on all four exits; the trigger's name
  with the sr suffix; no second live region on the menu or the market; the paid h1 reading both tongues
  with `lang` right.
- **Concurrency:** the drain block byte-identical and still awaited before `journey.push` (the mutant
  anchor is the proof, not a reading); `clearDeviceSession` racing a Checkout write of the phone
  (Checkout writes only on a completed payment — the clear runs on a user gesture; name the order);
  the DoorSheet's open state reaching both `PullToRefresh` and `decodeHold` in the same render.

## Scoring (RUBRIC J-axes, self-scored, before → after 3b)

| Path    | J-B progress clarity | J-C effort       | J-G recovery | Note                                                                                                                      |
| ------- | -------------------- | ---------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Dine-in | 4.3 → 4.5            | 4 → 4 (3c lifts) | 4.5 → 4.7    | no tab ever opens a dead page; the threshold stops lying; the door is one tap from the menu; the phantom link is gone     |
| To-go   | 4.3 → 4.5            | 4 → 4.1          | 4.5 → 4.7    | the time is asked twice not three times and never thrown away; the dead tab is gone; the handover no longer leaks a phone |
| Grocery | 4.3 → 4.4            | 4 → 4            | 4 → 4        | the door is a moment on the market; nothing else moves until G1                                                           |
| Account | 4.3 → 4.3            | 4.3 → 4.3        | — → —        | untouched by design; 3e owns it                                                                                           |

Honest about what does not move: **J-A** (continuity) and **J-E** (dead-time) are unchanged — this PR
adds no choreography and narrates no wait; **J-F** (recognition) is unchanged — the phone key is hygiene,
not a welcome; **J-D** gains at most a tenth on the paid pair (the thank-you is now spoken in both
tongues) and is not claimed. The tap-count wins the owner is actually asking for live in 3c and 3e; 3b
fixes "where am I" and "what is this tab for", and removes the one shipped case of a choice shown as
kept and silently dropped.
