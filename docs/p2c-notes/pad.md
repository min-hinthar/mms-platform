# Phase 2c · pad — integration notes

Branch `p2c/pad`, base `1768979`. The order pad (commit group 2 of the order-pad spec): dish tiles
beside ONE live ticket, the table page's Send reused, Take payment that navigates to the table's
payment section. No migration. The settle gate, the table page's `?settle=1` read and
`FloorDetailLive`'s `focusSettle` are NOT in this branch (register / gate areas).

## 1. DESIGN-LANGUAGE draft

### §28 The order pad (new)

- **An app shell, not a scrolling document.** `<main class="staff-main pad-main">` is a `100dvh`
  grid: the `StaffBar` on top, `.pad-shell` beneath it, and every pane (`.pad-tiles`, the ticket's
  body) scrolls inside itself with `overflow-y: auto; overscroll-behavior-y: contain` (axis-specific;
  the W22c overscroll contract bans the shorthand). The rail contains its own `-x`.
- **The first focusable element is a skip button** ("Skip to the order"). A button, not an anchor:
  on a phone the order is the other view, so the jump flips the view first, then focuses the
  ticket's `h2`.
- **ONE ticket, always mounted.** `StaffTicket` renders exactly once; CSS decides where it shows (a
  pane beside the tiles from 48em, the order view on a phone). Never a second copy in a sheet: no
  duplicated ids, focus or hooks.
- **ONE node each for the Send and Take payment, placed by CSS.** The dock (`.pad-dock`) holds the
  view button, `.pad-dock-primary` (the Send slot at a dine-in table, Take payment on a counter
  order) and `.pad-dock-settle` (Take payment at a dine-in table). On a phone the primary slot rides
  the bottom bar and a table's Take payment shows only in the order view; from 48em both sit under
  the ticket, the Send first; on a short screen (`min-width: 48em and max-height: 52em`) side by
  side. Their hints are `sr-only` on the phone bar (the bar has no room for a sentence).
- **Tiles.** A memo'd `PadTile` with primitive props, so a 5s poll re-renders no tile whose facts did
  not change. Two sibling buttons, never nested: the main tap (≥ 8.5rem tall) and, on an `add` dish
  only, a 44×44 options corner (`sliders` icon, sr-only "Options for {x}"). What a tap does is ONE
  pure decision (`tileAction`): sold out wins; a REQUIRED choice (`needsChoice`: any group with
  `minSelect ≥ 1`) opens the options sheet; otherwise the tap adds one, no modifiers. The `×N` badge
  counts the CONFIRMED ticket only (`ticketUnitsByItem`, voided lines excluded, §21); a dim `+N`
  counts this dish's pending adds.
- **Sections and search.** "All" lists every category in `sort_order` (ties keep catalog order), a
  pressed chip filters to its one section and scrolls the pane to the top, and a non-empty search
  IGNORES the chip, matches English, raw Burmese and category across the whole menu into one
  untitled section, and reports no lit chip — the chosen category comes back when the query clears.
  A sold-out dish keeps its place.
- **Names are Burmese-first on a Burmese console** (`padDishName`): the console's tongue leads, the
  other echoes. A Burmese name is a catalog fact or nothing (`catalogNameMy`); with none, the
  English leads marked `lang="en"` with no echo, never set in Padauk. Ticket lines carry `nameMy` and
  `modifiersMy` from the detail read (`loadLineNames` + `pairModifiersMy`). Categories stay English,
  marked, until `menu_categories.name_my` exists (owner-gated).
- **The add moment (§23).** At the tap: the press, a keyed `mms-pop` on the + disc, `haptic("add")`,
  a ghost row at the end of "Not sent yet", the tile's `+1`, and a QUIET claim through the one
  region. Each tap mints its own add key (`crypto.randomUUID()` → `p_scan_id`); writes run through
  ONE serialized chain (`usePadWrites`), so commit order is tap order. The COUNT is optimistic; no
  amount ever is: the subtotal reads "—" and Take payment drops its figure while any add is flying,
  landed-but-unread, unconfirmed or lost (`padAmountsSettled`, one predicate for both).
- **Outcomes (`pendingReduce`).** `ok` → landed; the ghost leaves only on a committed read that
  STARTED strictly after the landing. A definite refusal removes that attempt BY KEY (never by dish),
  plays `mms-settle` on the glyph, keeps focus on the tile, and names the dish in a correction. An
  answer that says the write may have committed, or an action that threw, is `lost`: the ghost stays
  with "Send again" under the SAME key. 15s with no answer is `unconfirmed` ("Checking…"), not a
  failure: the raw promise stays observed and a late answer resolves the ghost normally; because
  Next runs actions one at a time, an unconfirmed add holds the tiles, the Send and Take payment,
  and the ticket offers "Reload the order". A sheet add queued behind a hung one frees its sheet 15s
  after ITS tap, and a refusal that lands after its origin stopped waiting is said in the pad's
  region.
- **The Send is the table page's controller, reused.** `useStaffSend` is owned by `OrderPad` (a
  refresh or a view swap cannot kill an open undo) and `StaffSendButton` is its view. The pad hands
  it a `drain` (the add chain settles before any fire; a hung or lost add refuses the fire and says
  what it waits on) and a BARE label ("Send to kitchen", no count) while any add is flying or
  unread: a count is a claim only from a view that has seen the cart. The first dish in flight on an
  empty table still offers the (bare) Send. When there is nothing to send, the slot is "Done · Table
  N" (back to the table), never empty.
- **Take payment navigates; it never takes money here.** Secondary at an open dine-in table (the
  next step after Send is leaving, never two filled pills), primary on a counter order (no Send; the
  status row says the kitchen starts it when it is paid). Its refusal is ONE typed reason from ONE
  pure function (`padSettle` → `PadSettleBlock`: `paying` > `waiting` > `empty`), rendered as an
  `aria-describedby` hint on an `aria-disabled` button. A tap while an add FLIES is accepted: busy
  "Waiting for the last dish…", drain, save a typed-but-unsaved counter name (a failed save stops
  once and says so; the next tap goes on without it), then `router.push("/staff/table/{id}?settle=1")`.
- **ONE live region per view.** The pad's `Toast`, arbitrated by `lib/notice-slot` (`admitNotice` /
  `purgesDeferred`): a claim never erases a correction, and two dishes refused for one cause become
  the family sentence. Corrections are drawn 8s, news 3s, claims are quiet. A frozen feed is said
  once per freeze; the ticket's foot keeps the frozen-board line as plain text. From 48em the region
  is offset to centre over the tiles, never over the Send or Take payment.
- **Removal on the ticket** is `useLineMotion` (§24): focus moves to the neighbouring dish's name
  BEFORE the write, the row leaves as an `mms-remove` ghost while the list closes, a refused removal
  comes back in place, and a removal in flight holds the Send ("writing").
- **Loading** is the pad's own geometry (`PadSkeleton`): tools row, 8 / 12 / 16 tile ghosts at 2 / 3
  / 4 columns, a ticket ghost from 48em. `[id]/loading.tsx` is a client boundary that picks it when
  the pathname ends in `/add`, because a register mint lands on a NEW `[id]`.
- **Reduced motion:** no press scale, pop, rise or settle; removal hides by opacity with no FLIP.
  Focus rules, holds, the drain and the undo arm still apply; every haptic ships its visible half.

### §17 bullets

- Sticky sentence, rewritten: **On a scrolling page the bar is the only sticky element; an
  app-shell page scrolls its panes beneath it; nothing sticks above or beside it.**
- A control's disabled state is `aria-disabled` plus a stated reason (`aria-describedby`), never
  native `disabled`: the pad renders zero `button[disabled]` across idle, pending, paying and
  sold-out (pinned by `OrderPad.test.tsx`).
- The one live region is the view's Toast; no row, tile or ticket mounts its own `role="alert"` or
  `aria-live` (pinned: exactly one region outside portals).

## 2. CHANGELOG

- **Staff order pad (Phase 2c).** Adding dishes at a table or the counter is now a POS pad: dish tiles
  beside one live order, Burmese-first names, instant adds that can never go on twice (each tap's own
  key; "Send again" reuses it), Send to kitchen always in thumb reach, and Take payment that waits for
  the last dish and opens the table's payment section; the old browse list, its add buttons and the
  "Review · N not sent →" bridge are gone.

## 3. OPEN-ITEMS rows

Existing rows this branch changes:

- **P2ai — CLOSED.** The add page's "Review · N not sent →" bridge is gone with `browse.review` and
  `browse.reviewUnsent` (both keys retired in `lib/i18n/staff.ts`); the pad carries the Send itself.
- **K25 — NARROWED.** The table page's item NAMES now lead in Burmese on a Burmese console:
  `getTableDetail` carries `nameMy` / `modifiersMy` (`lib/floor.ts`, validated by `catalogNameMy`,
  pinned by `lib/floor-pad-lines.test.ts` and the `floor/pad-*` mutants) and `StaffLineEditor`
  renders them (lead + echo, `ModsMy`). The stepper's names speak the dictionary
  (`table.line.a11y.*`). Remaining: the expo card heads/meta, the KDS strip's utilities, the floor's
  heading numerals.
- **F35 — NARROWED (the `StaffLineEditor` half, on the pad).** The pad's ticket runs `useLineMotion`
  over `StaffLineEditor` rows (ghost removal, FLIP close, focus landing, refused row back in place).
  The table page's list (`FloorDetailLive`, not this area's file) still has no line motion.

New rows:

| Sev | Item                                                                | Why / where                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| med | The pad's live detail hook duplicates the table page's              | `components/staff/usePadDetailLive.ts` re-implements `FloorDetailLive`'s raced refresh / poll / realtime / degrade loop (seq-ordered for the pad). Dedupe into one hook once `FloorDetailLive` is free to change.                                                                                                                                                                                                                                                                                                      |
| med | `?settle=1` is pushed but not yet read                              | `OrderPad.onSettle` navigates to `/staff/table/{id}?settle=1`; the table page's read and `FloorDetailLive`'s `focusSettle` belong to the register area. Until both land, Take payment opens the table page without focusing its payment section.                                                                                                                                                                                                                                                                       |
| med | Browser measurements not taken                                      | No browser in the agent environment. Unmeasured: the tap count at 390×844 (spec: 11 taps + 1 swipe to send a three-dish table), the ~five 64px lines visible on the 1024×768 short-screen tier, the rail's edge fade, the phone dock height (built as its 64px control plus padding and the safe area, with the Toast offset `--cta-dock-h` at 5rem / 9.5rem in the order view, where the spec drafted 4rem), and the `[id]/loading.tsx` pathname switch on a real register mint (fallback: a `(detail)` route group). |
| med | Counter pad has no Send (owner decision 1 changes this)             | The counter pad shows "counter at pay" and no Send (conflict override for 2c). Owner decision 1 (counter orders may send before payment, flagged "Unpaid — collect at pickup") is Phase 2f; the pad's `padSendView` / dock gain a Send there.                                                                                                                                                                                                                                                                          |
| low | Diner surfaces do not adopt `needsChoice`                           | The rule now lives in `lib/menu/modifiers.ts`; `MenuBrowser.tsx`, `menu/page.tsx`, `KioskReview.tsx` and `your-usual.ts` still inline their own required-choice test.                                                                                                                                                                                                                                                                                                                                                  |
| low | Burmese category names (owner-gated)                                | Rail chips and section headings render the English `menu_categories.name`, marked `lang="en"`, until a `name_my` column exists.                                                                                                                                                                                                                                                                                                                                                                                        |
| low | A late `ok` on a sheet add after the sheet gave up is not announced | `usePadWrites`: once the sheet stops waiting (15s), a later `ok` lands the ghost and the line appears, but no claim is spoken (refusals ARE handed back to the pad's region).                                                                                                                                                                                                                                                                                                                                          |
| low | Take payment stays busy if the navigation never completes           | `OrderPad.onSettle` keeps the button busy "until the route changes"; a push that is silently dropped leaves it busy until the page is reloaded. No timeout.                                                                                                                                                                                                                                                                                                                                                            |
| low | Two English-only sentences on the pad's removal path                | `OrderPad.onRemove`'s thrown-write sentence and the server's `staffSetQty` refusal text pass through `padSentenceNotice` untranslated (the same shape `StaffLineEditor` already uses for notes and qty).                                                                                                                                                                                                                                                                                                               |
| low | Starting constants, unmeasured                                      | `ADD_UNCONFIRMED_MS` 15s (copied from `raceTimeout`); notice windows 8s / 3s / 3s; the 5s detail poll and degrade-after-2-unknown; tile min-height 8.5rem; ticket pane 20rem / 24rem; short-screen tier `max-height: 52em`. Tune against a real shift.                                                                                                                                                                                                                                                                 |

## 4. Mutate-set / CLAUDE.md enumeration changes

Measured with `grep -oE '^\s+file: "[^"]+"' scripts/verify-slice.mjs | sort -u` against base
`1768979`: **151 → 155 modules** (lib 132 → 136; api 3, components 15, db 1 unchanged); **885 → 922
mutants** (+37). No component joined the set.

Files added (bucket `lib`): `apps/qr/lib/menu/modifiers.ts`, `apps/qr/lib/order-pad.ts`,
`apps/qr/lib/pad-errors.ts`, `apps/qr/lib/pad-pending.ts`. (`apps/qr/lib/floor.ts` was already in
the set.)

Mutants added (block `// ── Phase 2c · pad ──`, all KILLED by `verify:slice --no-gate --only=pad`):
`pad/needs-choice-counts-optional-groups`, `pad/needs-choice-off-by-one`,
`pad/sold-out-below-the-choice`, `pad/fallback-english-marked-burmese`, `pad/raw-name-my-trusted`,
`pad/rail-sorted-by-name`, `pad/search-keeps-the-chip-lit`, `pad/search-applies-the-chip`,
`pad/badge-counts-voided-lines`, `pad/togo-draft-reads-unsent`, `pad/a-lone-group-heading`,
`pad/take-payment-primary-at-a-table`, `pad/take-payment-secondary-at-the-counter`,
`pad/unknown-add-does-not-hold-payment`, `pad/flying-add-refuses-take-payment`, `pad/paying-not-first`,
`pad/amount-over-an-unseen-add`, `pad/count-on-a-landed-add`, `pad/no-send-for-the-first-dish`,
`pad/lost-add-blocks-the-tiles`, `pad/hung-add-leaves-tiles-live`, `pad/commit-drops-every-landed-ghost`,
`pad/commit-drops-at-the-landing-read`, `pad/refusal-removes-the-dish`, `pad/retry-mints-a-new-attempt`,
`pad/timeout-moves-a-landed-add`, `pad/unseen-counted-as-flying`, `pad/a-lost-add-is-no-blocker`,
`pad/unconfirmed-read-as-a-refusal`, `pad/threw-read-as-a-refusal`, `pad/sold-out-collapsed-into-failed`,
`pad/a-correction-without-its-family`, `pad/a-send-refusal-read-as-news`, `floor/pad-line-loses-its-dish`,
`floor/pad-togo-read-as-dinein`, `floor/pad-name-my-unvalidated`, `floor/pad-options-lose-their-ids`.

Mutants re-anchored (meaning kept): `floor/send-counts-lose-the-fulfillment` (the widened select in
`getTableDetail`); KILLED.

CLAUDE.md's `verify:slice` comment needs: 885 → 922 mutations, 151 → 155 modules, 132 → 136 under
`apps/qr/lib` (the component list is unchanged).

## 5. Owner-visible behaviour changes

- "+ Add items" (and every register mint) opens the **order pad**: dish tiles on the left, the order
  on the right (tablet) or one tap away (phone), instead of a long list with per-row Add buttons.
- One tap adds one dish instantly — the tile pops, the dish appears on the order as "Adding…", the
  price total shows "—" until the server confirms. Dishes that need a choice open the options sheet;
  others have a small corner button for spice, add-ons, quantity and a kitchen note.
- If the connection hangs, the dish says "Checking…" and the pad offers "Reload the order"; if the
  answer is lost, the dish offers "Send again", which can never add it twice.
- **Send to kitchen** is on the pad (bottom bar on a phone). After sending, the slot becomes
  "Done · Table N". Undo works as on the table page.
- **Take payment** (table: outline button; counter: the main button) waits for the last dish, saves a
  typed walk-up name, then opens the table's payment section. It shows the total only when nothing is
  pending, and says why when it can't be tapped.
- Burmese console: dish names lead in Burmese with the English beneath, on the tiles, the order, and
  the table page's lines; the options sheet does the same. Categories stay English for now.
- Removing a dish on the order slides it out; if the server refuses, it comes back in place.
- Search has a clear button; categories are a chip rail; a search that finds nothing says so.
- Removed: the old "Review order & take payment →" / "Review · N not sent →" links and the add page's
  subtitle paragraph.

## 6. K15 strings

Every MY value below is a Claude-authored draft pending Min's native check. HIGH = K15-HIGH (in
`STAFF_K15_HIGH`).

| Key                            | EN                                                                                 | MY                                                                                    | HIGH? |
| ------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----- |
| pad.a11y.skipToOrder           | Skip to the order                                                                  | အော်ဒါဆီ တန်းသွား                                                                     |       |
| pad.a11y.options               | Options for {x}                                                                    | {x} အတွက် ရွေးချယ်စရာ                                                                 |       |
| pad.search.clear               | Clear search                                                                       | ရှာတာ ရှင်း                                                                           |       |
| pad.search.none                | No dish matches “{x}”.                                                             | “{x}” နဲ့ ကိုက်တဲ့ ဟင်း မရှိပါ။                                                       |       |
| pad.menu.outage                | The menu didn’t load — the order still works.                                      | မီနူး မတက်လာပါ — အော်ဒါကတော့ ဆက်သုံးလို့ရပါတယ်။                                       |       |
| pad.menu.retry                 | Try again                                                                          | ထပ်စမ်း                                                                               |       |
| pad.ticket.title               | Order                                                                              | အော်ဒါ                                                                                |       |
| pad.ticket.empty               | Nothing on this order yet — tap a dish to add it.                                  | ဒီအော်ဒါထဲ ဘာမှ မရှိသေးပါ — ဟင်းတစ်ခုကို နှိပ်ပြီး ထည့်ပါ။                            |       |
| pad.group.unsent               | Not sent yet                                                                       | မပို့ရသေး                                                                             |       |
| pad.group.togo                 | To-go · goes to the kitchen when paid                                              | ပါဆယ် · ငွေရှင်းမှ မီးဖိုချောင် ရောက်မယ်                                              |       |
| pad.group.kitchen              | In the kitchen                                                                     | မီးဖိုချောင်မှာ                                                                       |       |
| pad.group.served               | Served                                                                             | ထုတ်ပြီး                                                                              |       |
| pad.ghost.adding               | Adding…                                                                            | ထည့်နေပါတယ်…                                                                          |       |
| pad.ghost.checking             | Checking…                                                                          | စစ်နေပါတယ်…                                                                           |       |
| pad.ghost.verb.resend          | Send again                                                                         | ထပ်ပို့                                                                               |       |
| pad.reload                     | Reload the order                                                                   | အော်ဒါ ပြန်ဖွင့်                                                                      |       |
| pad.bar.order.one              | Order · {n} item                                                                   | အော်ဒါ · {n} ခု                                                                       |       |
| pad.bar.order.many             | Order · {n} items                                                                  | အော်ဒါ · {n} ခု                                                                       |       |
| pad.bar.menu                   | Menu                                                                               | မီနူး                                                                                 |       |
| pad.settle                     | Take payment · {m}                                                                 | ငွေရှင်း · {m}                                                                        | HIGH  |
| pad.settle.tab                 | Close bill · {m}                                                                   | စာရင်းပိတ် · {m}                                                                      | HIGH  |
| pad.settle.bare                | Take payment                                                                       | ငွေရှင်း                                                                              |       |
| pad.settle.busy                | Waiting for the last dish…                                                         | နောက်ဆုံး ဟင်း ရောက်အောင် စောင့်နေပါတယ်…                                              |       |
| pad.reason.empty               | Add a dish first                                                                   | ဟင်း အရင် ထည့်ပါ                                                                      |       |
| pad.nameNotSaved               | The name didn’t save — tap Take payment again to go on without it.                 | နာမည် မသိမ်းရသေးပါ — နာမည်မပါဘဲ ဆက်သွားဖို့ ငွေရှင်း ကို ထပ်နှိပ်ပါ။                  |       |
| pad.done                       | Done · Table {id}                                                                  | ပြီးပြီ · စားပွဲ {id}                                                                 |       |
| pad.settled.note               | This order is paid — nothing more can go on it.                                    | ဒီအော်ဒါ ငွေရှင်းပြီးပါပြီ — ထပ်ထည့်လို့ မရတော့ပါ။                                    |       |
| pad.paused                     | A guest is paying for this table — adding is paused.                               | ဧည့်သည်တစ်ယောက် ဒီစားပွဲအတွက် ငွေရှင်းနေပါတယ် — ထည့်တာ ခဏရပ်ထားပါတယ်။                 |       |
| pad.soldOut                    | {x} is sold out — it can’t be added.                                               | {x} ကုန်သွားပြီ — ထည့်လို့ မရပါ။                                                      |       |
| pad.err.add.paying             | {x} didn’t go on — a guest is paying for this table right now.                     | {x} မထည့်ရသေးပါ — ဧည့်သည်တစ်ယောက် ဒီစားပွဲအတွက် ငွေရှင်းနေပါတယ်။                      |       |
| pad.err.add.paying.family      | Some dishes didn’t go on — a guest is paying for this table right now.             | ဟင်းတချို့ မထည့်ရသေးပါ — ဧည့်သည်တစ်ယောက် ဒီစားပွဲအတွက် ငွေရှင်းနေပါတယ်။               |       |
| pad.err.add.soldOut            | {x} just sold out — it isn’t on the order.                                         | {x} ကုန်သွားပြီ — အော်ဒါထဲ မထည့်ရပါ။                                                  |       |
| pad.err.add.soldOut.family     | Some dishes just sold out — they aren’t on the order.                              | ဟင်းတချို့ ကုန်သွားပြီ — အော်ဒါထဲ မထည့်ရပါ။                                           |       |
| pad.err.add.gone               | {x} is off the menu — it isn’t on the order.                                       | {x} မီနူးမှာ မရှိတော့ပါ — အော်ဒါထဲ မထည့်ရပါ။                                          |       |
| pad.err.add.gone.family        | Some dishes are off the menu — they aren’t on the order.                           | ဟင်းတချို့ မီနူးမှာ မရှိတော့ပါ — အော်ဒါထဲ မထည့်ရပါ။                                   |       |
| pad.err.add.closed             | {x} didn’t go on — this order is closed or already paid.                           | {x} မထည့်ရသေးပါ — ဒီအော်ဒါ ပိတ်ပြီး (သို့) ငွေရှင်းပြီးသားပါ။                         |       |
| pad.err.add.closed.family      | Some dishes didn’t go on — this order is closed or already paid.                   | ဟင်းတချို့ မထည့်ရသေးပါ — ဒီအော်ဒါ ပိတ်ပြီး (သို့) ငွေရှင်းပြီးသားပါ။                  |       |
| pad.err.add.outage             | {x} didn’t go on — we can’t reach the system. Try again.                           | {x} မထည့်ရသေးပါ — စနစ်နဲ့ ဆက်သွယ်မရပါ။ ထပ်စမ်းပါ။                                     |       |
| pad.err.add.outage.family      | Some dishes didn’t go on — we can’t reach the system.                              | ဟင်းတချို့ မထည့်ရသေးပါ — စနစ်နဲ့ ဆက်သွယ်မရပါ။                                         |       |
| pad.err.add.failed             | {x} didn’t go on — try again.                                                      | {x} မထည့်ရသေးပါ — ထပ်စမ်းပါ။                                                          |       |
| pad.err.add.failed.family      | Some dishes didn’t go on — try again.                                              | ဟင်းတချို့ မထည့်ရသေးပါ — ထပ်စမ်းပါ။                                                   |       |
| pad.err.add.unconfirmed        | We couldn’t confirm {x} — check the order, or send it again. It won’t go on twice. | {x} ထည့်ပြီးမပြီး မသေချာပါ — အော်ဒါကို စစ်ပါ၊ ဒါမှမဟုတ် ထပ်ပို့ပါ။ နှစ်ခါ မထည့်ပါဘူး။ | HIGH  |
| pad.err.add.unconfirmed.family | We couldn’t confirm some dishes — check the order.                                 | ဟင်းတချို့ ထည့်ပြီးမပြီး မသေချာပါ — အော်ဒါကို စစ်ကြည့်ပါ။                             | HIGH  |
| pad.err.add.offline            | You’re offline — {x} didn’t go on.                                                 | အင်တာနက် မရှိပါ — {x} မထည့်ရသေးပါ။                                                    |       |
| pad.err.add.offline.family     | You’re offline — some dishes didn’t go on.                                         | အင်တာနက် မရှိပါ — ဟင်းတချို့ မထည့်ရသေးပါ။                                             |       |
| table.send.cta.bare            | Send to kitchen                                                                    | မီးဖိုချောင် ပို့                                                                     | HIGH  |
| table.send.hold.add            | Waiting to hear back about {x}                                                     | {x} အတွက် အဖြေ စောင့်နေပါတယ်                                                          |       |
| table.line.a11y.less           | Decrease {x} quantity                                                              | {x} တစ်ခု လျှော့                                                                      |       |
| table.line.a11y.more           | Increase {x} quantity                                                              | {x} တစ်ခု ထပ်ထည့်                                                                     |       |
| table.line.a11y.remove         | Remove {x}                                                                         | “{x}” ဖျက်                                                                            | HIGH  |
| table.line.a11y.soldOut        | {x} is sold out — can’t add more                                                   | {x} ကုန်သွားပြီ — ထပ်မထည့်နိုင်ပါ                                                     |       |
| table.line.a11y.max            | Maximum {n} {x}                                                                    | {x} အများဆုံး {n} ခု                                                                  |       |

Retired keys: `browse.sub.counter`, `browse.sub.table`, `browse.review`, `browse.reviewUnsent`,
`browse.empty`, `browse.soldOut`, `browse.add.verb.added` (their only readers,
`StaffMenuBrowser.tsx` / `StaffAddButton.tsx` and the old add page, are deleted).

## 7. Deviations from spec

- **"Take payment" / "Close bill", never "Settle" / "Close tab"** in visible copy (conflict
  override: plain words). The plain-words guard now bans `settl*` and `tab(s)` in English staff
  copy. Keys keep the `pad.settle*` names.
- **No `pad.send.*` strings and no `padActions`.** The pad reuses 2a's `useStaffSend` +
  `StaffSendButton` and the `table.send.*` keys (conflict override). Additive only: `useStaffSend`
  takes an optional `drain`, `StaffSendButton` an optional `bare`, and `StaffSendHold` gains
  `{ kind: "add" }`; `FloorDetailLive` passes none of them and is unchanged. The pad's own
  decisions are `padSettle` / `padSendView` / `padTileBlock` rather than one `padActions`.
- **Counter pad: no Send; the status row says `table.send.counterAtPay`** (conflict override). Take
  payment is the counter's one primary.
- **The settle gate is not built.** No `pad.unsentAtSettle.*`, no "they go to the kitchen when paid"
  caption on Take payment; `PadSettleBlock` is the seam (section 8).
- **`?settle=1` is pushed but not read** (register area owns `[id]/page.tsx` and `FloorDetailLive`).
- **`pad.reason.waiting` / `pad.reason.paying` not added:** the waiting reason reuses
  `table.send.hold.add` / `table.send.hold.writing` (the same words the Send says) and the paying
  reason reuses `table.detail.payingPhone.cash|tab` (the table page's words).
- **`pad.live.*` not added:** the quiet claim reuses `browse.added` and the name-save news reuses
  `browse.name.set` / `browse.name.cleared`.
- **`pad.a11y.clearSearch` is `pad.search.clear`** — the same words serve the ✕ and the no-match
  panel's button.
- **The phone's `.pad-bar` is the `.pad-dock`**, one grid whose areas CSS rearranges per tier (the
  view button, the primary slot, the settle slot), so there is exactly one Send node and one Take
  payment node at every width. Its phone height is its 64px control plus padding and the safe area
  (the Toast rides above it at `--cta-dock-h: 5rem`, 9.5rem in the order view, not the spec's 4rem);
  unmeasured on a device.
- **Closed session →** `router.replace(STAFF_DOOR_TARGET.counter)` (`/staff?floor=1`, the floor
  door) rather than a bare `/staff`.
- **`check:style-literals` was not re-recorded:** deleting `StaffMenuBrowser` / `StaffAddButton`
  removed no counted literal (current counts equal the baseline), so there was nothing to lock in.
- **Table page's line motion not added:** `FloorDetailLive` is not this area's file; F35 narrowed on
  the pad only.

## 8. Seams for the gate area

- `apps/qr/lib/order-pad.ts` — `type PadSettleBlock = "empty" | "waiting" | "paying"` (line 171) and
  `padSettle(i: PadSettleInput)` (line 197). The gate adds `"unsent"` to the union, a field to
  `PadSettleInput` (the server's unsent dine-in units — `detail.send.sendable` is already on the
  detail the pad holds), and ONE clause in the `block` ternary (line 203). Precedence to decide:
  `paying` first is pinned by the `pad/paying-not-first` mutant.
- `apps/qr/components/staff/OrderPad.tsx` — `settle = padSettle({...})` (line 457) is where the new
  input is passed; `settleReason` (line 508) renders one hint per `settle.block` value (add the
  `unsent` arm, including the jump to Send); `onSettle` (line 467) re-checks `settle.enabled` at the
  tap, so no second guard is needed there.
- `apps/qr/components/staff/OrderPad.tsx` `onSettle` → `router.push("/staff/table/{id}?settle=1")`
  (line 492) — the table page's `?settle=1` read and focus are the register area's.

## 9. LEARNINGS candidates

- **A per-attempt timeout that starts at DISPATCH strands anything queued behind a hang.** Next runs
  server actions one at a time, so an add queued behind a hung one never dispatches and its "15s"
  never starts; its origin (a sheet holding itself busy) waited forever. Time the ORIGIN's wait from
  the tap, and the ghost's "Checking…" from its own dispatch — two clocks, two meanings.
- **When an origin stops waiting, it must hand the outcome back.** A "quiet" attempt whose origin
  already gave up would otherwise be refused in silence; the hand-back is one line
  (`quiet.delete(key)` on the unconfirmed resolution).
- **`overscroll-behavior: contain` (shorthand) fails the W22c overscroll contract**; panes use the
  axis-specific `-y` (and the rail `-x`).
- **Prettier reflows re-stale mutants.** A multi-line ternary written on one line was reformatted and
  `floor/pad-togo-read-as-dinein` went STALE; anchor mutants on the FORMATTED source and run
  `check:mutant-anchors` after every `pnpm format`.
- **A strings-fork rule collides with "one word per concept".** `table.line.a11y.remove` first forked
  from `table.loss.title.void`; aligning the Burmese with the loss sheet's own title satisfied both.
