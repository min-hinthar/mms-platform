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
  side. Their hints are `sr-only` on the phone bar (the bar has no room for a sentence), so a
  REFUSED tap on either says its reason once through the one Toast, on every tier (`sendRefusalMsg`
  / `padSettleReason` — the same sentence the hint carries). In the phone bar and the short tier the
  xl taps keep their 64px height but trim to `--s3` gutters and `--fs-lead` (balanced wrap); the
  dock publishes its MEASURED height as `--cta-dock-h` (`useCtaDock`), which the Toast rides above —
  zeroed from 48em, where the dock is not at the bottom.
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
  A sold-out dish keeps its place. A chip toggles against what is SHOWN (`padPickCat`): during a
  search no chip is lit, so the chip chosen before it picks its category again, never "All".
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
  landed-but-unread, unconfirmed or lost — and while one of the ticket's OWN writes (a qty change, a
  removal, a note) is in flight or answered but not yet in a read that started after it
  (`padAmountsSettled(pending, lines)`, one predicate for both; `unreadAfterCommit`).
- **Outcomes (`pendingReduce`).** `ok` → landed; the ghost leaves only on a committed read that
  STARTED strictly after the landing. A definite refusal removes that attempt BY KEY (never by dish),
  plays `mms-settle` on the glyph, keeps focus on the tile, and names the dish in a correction. An
  answer that says the write may have committed, or an action that threw, is `lost`: the ghost stays
  with "Try again" under the SAME key — never "send", which on this console is the kitchen's verb
  (pinned in `plain-words.test.ts`). 15s with no answer is `unconfirmed` ("Checking…"), not a
  failure: the raw promise stays observed and a late answer resolves the ghost normally; because
  Next runs actions one at a time, an unconfirmed add holds the tiles, the Send and Take payment,
  and the ticket offers "Reload the order". What the Send and Take payment say about the add is by
  its state: `unconfirmed` "Waiting to hear back about {x}"; `lost` names the fix — "We couldn’t
  confirm {x} — tap Try again on it, or reload the order" — never a wait for an answer that already
  came (`sendHoldMsg`). A sheet add queued behind a hung one frees its sheet 15s
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
  pure function (`padSettle` → `PadSettleBlock`: `paying` > `note` > `waiting` > `empty`), its
  sentence from a `Record` over that union (`padSettleReason`), rendered as an `aria-describedby`
  hint on an `aria-disabled` button and said once when the refused button is tapped. The decision is
  re-taken AT THE TAP from refs (the adds, the line editors, removals in flight). **An unsaved
  kitchen note on ANY line holds it** (`unsavedNoteFrom` — wider than the Send's hold: a counter
  order's lines and a to-go draft cook at payment, and leaving the pad unmounts the editor with the
  draft): the tap flips to the order view and focuses that note's field; a note typed during the
  drain is read again before leaving. A line write in flight is `waiting`. A tap while an add FLIES
  is accepted; busy in the phase it is IN (`padSettleStartPhase` / `padSettleBusyKey`): "Waiting
  for the last dish…" only while one is on its way, "Saving the name…", "Opening payment…"; then
  `router.push("/staff/table/{id}?settle=1")`. A push that never lands frees the button after 10s
  (`SETTLE_OPEN_RESET_MS`, or on a `pageshow` restore).
- **ONE live region per view.** The pad's `Toast`, arbitrated by `lib/notice-slot` (`admitNotice` /
  `purgesDeferred`): a claim never erases a correction, and two dishes refused for one cause become
  the family sentence. Corrections are drawn 8s, news 3s, claims are quiet. A frozen feed is said
  once per freeze; the ticket's foot keeps the frozen-board line as plain text. From 48em the region
  is offset to centre over the tiles, never over the Send or Take payment.
- **Removal on the ticket** is `useLineMotion` (§24): focus moves to the neighbouring dish's name
  BEFORE the write, the row leaves as an `mms-remove` ghost while the list closes, a refused removal
  comes back in place, and a removal in flight holds the Send and Take payment ("writing" — the
  Send's hint renders it; a ref alone left a live-looking Send that ignored taps). The write is raced
  (15s): a throw or a timeout is UNKNOWN — the row comes back, the region says "We couldn’t confirm
  {x} was removed — the order shows what’s on it", the hold is released, and while the request is
  still hung (holding Next's action queue) the ticket offers "Reload the order".
- **The menu outage's "Try again"** is busy while the page re-reads (`useTransition`) and, when the
  menu is still down after it, says the outage line again through the one region — a retry that
  changed nothing is never silent.
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
  sold-out (pinned by `OrderPad.test.tsx`, both states mounted).
- A refused tap is never silent: where the stated reason is not drawn (a phone bar has no room),
  the tap says it once through the view's one region.
- The one live region is the view's Toast; no row, tile or ticket mounts its own `role="alert"` or
  `aria-live` (pinned: exactly one region outside portals).

## 2. CHANGELOG

- **Staff order pad (Phase 2c).** Adding dishes at a table or the counter is now a POS pad: dish tiles
  beside one live order, Burmese-first names, instant adds that can never go on twice (each tap's own
  key; "Try again" reuses it), Send to kitchen always in thumb reach, and Take payment that waits for
  the last dish, never leaves an unsaved kitchen note behind, and opens the table's payment section;
  the old browse list, its add buttons and the "Review · N not sent →" bridge are gone.

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

| Sev | Item                                                                   | Why / where                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| med | The pad's live detail hook duplicates the table page's                 | `components/staff/usePadDetailLive.ts` re-implements `FloorDetailLive`'s raced refresh / poll / realtime / degrade loop (seq-ordered for the pad). Dedupe into one hook once `FloorDetailLive` is free to change.                                                                                                                                                                                                                                                                                                                                                                                       |
| med | `?settle=1` is pushed but not yet read                                 | `OrderPad.onSettle` navigates to `/staff/table/{id}?settle=1`; the table page's read and `FloorDetailLive`'s `focusSettle` belong to the register area. Until both land, Take payment opens the table page without focusing its payment section.                                                                                                                                                                                                                                                                                                                                                        |
| med | Browser measurements not taken                                         | No browser in the agent environment. Unmeasured: screenshots at 390×844 and 1024×768 in both languages (the dock's trimmed xl taps — `--s3` gutters, `--fs-lead`, balanced wrap — are sized by arithmetic: ~12.75rem primary slot at 390px), the tap count at 390×844 (spec: 11 taps + 1 swipe to send a three-dish table), the ~five 64px lines visible on the 1024×768 short-screen tier, the rail's edge fade, and the `[id]/loading.tsx` pathname switch on a real register mint (fallback: a `(detail)` route group). The Toast offset is now MEASURED (`useCtaDock` on the dock), not a constant. |
| med | Counter pad has no Send (owner decision 1 changes this)                | The counter pad shows "counter at pay" and no Send (conflict override for 2c). Owner decision 1 (counter orders may send before payment, flagged "Unpaid — collect at pickup") is Phase 2f; the pad's `padSendView` / dock gain a Send there.                                                                                                                                                                                                                                                                                                                                                           |
| low | Diner surfaces do not adopt `needsChoice`                              | The rule now lives in `lib/menu/modifiers.ts`; `MenuBrowser.tsx`, `menu/page.tsx`, `KioskReview.tsx` and `your-usual.ts` still inline their own required-choice test.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| low | Burmese category names (owner-gated)                                   | Rail chips and section headings render the English `menu_categories.name`, marked `lang="en"`, until a `name_my` column exists.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| low | A late `ok` on a sheet add after the sheet gave up is not announced    | `usePadWrites`: once the sheet stops waiting (15s), a later `ok` lands the ghost and the line appears, but no claim is spoken (refusals ARE handed back to the pad's region).                                                                                                                                                                                                                                                                                                                                                                                                                           |
| low | English-only sentences left on the ticket's write path                 | The server's `staffSetQty` refusal text still passes through `padSentenceNotice` as sent (it is a server sentence; `<OutageText>` supplies the outage twin only), and `StaffLineEditor`'s own thrown-write literals ("Couldn’t update that…", "Couldn’t save that note…") are shared with the table page. The pad's own removal throw now speaks the dictionary (`pad.err.remove.unknown`).                                                                                                                                                                                                             |
| low | The Toast counts the safe area twice above the phone dock              | `useCtaDock` measures the dock including its `env(safe-area-inset-bottom)` padding, and `.ui-toast-region` adds the inset again — the house pattern (`CartBar`), so on a notched phone the Toast sits ~34px higher than needed. Harmless; fix in the primitive if it matters.                                                                                                                                                                                                                                                                                                                           |
| low | A hung removal holds later writes until it answers or the page reloads | `OrderPad.onRemove` releases the Send and Take payment after 15s (unknown outcome, row back, Reload offered), but Next's one-at-a-time action queue still holds any later write behind the hung request; the adds' own 15s "Checking…" and the Reload are the recovery. Measure how often a removal hangs before adding more.                                                                                                                                                                                                                                                                           |
| low | Starting constants, unmeasured                                         | `ADD_UNCONFIRMED_MS` 15s (copied from `raceTimeout`); the removal race (`raceTimeout`'s 15s); `SETTLE_OPEN_RESET_MS` 10s (a Take payment whose push never lands frees itself); notice windows 8s / 3s / 3s; the 5s detail poll and degrade-after-2-unknown; tile min-height 8.5rem; ticket pane 20rem / 24rem; short-screen tier `max-height: 52em`. Tune against a real shift.                                                                                                                                                                                                                         |

## 4. Mutate-set / CLAUDE.md enumeration changes

Measured with `grep -oE '^\s+file: "[^"]+"' scripts/verify-slice.mjs | sort -u` against base
`1768979`: **151 → 155 modules** (lib 132 → 136; api 3, components 15, db 1 unchanged); **885 → 933
mutants** (+48). No component joined the set.

Files added (bucket `lib`): `apps/qr/lib/menu/modifiers.ts`, `apps/qr/lib/order-pad.ts`,
`apps/qr/lib/pad-errors.ts`, `apps/qr/lib/pad-pending.ts`. (`apps/qr/lib/floor.ts` and
`apps/qr/lib/staff-send-view.ts` were already in the set; this branch adds pad mutants on both.)

Mutants added (block `// ── Phase 2c · pad ──`, all KILLED by `verify:slice --no-gate --only=pad`,
60 caught including the 12 `p2a-padserver/*` the substring also selects):
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
`floor/pad-togo-read-as-dinein`, `floor/pad-name-my-unvalidated`, `floor/pad-options-lose-their-ids`,
and from the critic round: `pad/take-payment-blind-to-the-note`, `pad/note-hold-reads-sendable-only`,
`pad/line-write-leaves-payment-live`, `pad/amount-over-a-line-write`, `pad/amount-over-an-unread-line`,
`pad/busy-always-waits-for-a-dish`, `pad/chip-never-toggles-off`, `pad/unread-cleared-at-the-landing-read`,
`pad/lost-add-worded-as-a-wait`, `pad/a-hold-outranks-a-paying-guest`,
`pad/sheet-unconfirmed-releases-the-key`.

Mutants re-anchored (meaning kept, all KILLED): `floor/send-counts-lose-the-fulfillment` (the widened
select in `getTableDetail`); `pad/amount-over-an-unseen-add` (the predicate now also reads line
writes), `pad/unconfirmed-read-as-a-refusal` and `pad/threw-read-as-a-refusal` (`padAddVerdict` now
reads 2a's `addAttemptOutcome` — each mutant reads its one case as a refusal again). The 2a suites
on touched modules re-run clean: `staff-send-view/*` 16 caught, `staff-add-key/*` 3 caught.

CLAUDE.md's `verify:slice` comment needs: 885 → 933 mutations, 151 → 155 modules, 132 → 136 under
`apps/qr/lib` (the component list is unchanged).

## 5. Owner-visible behaviour changes

- "+ Add items" (and every register mint) opens the **order pad**: dish tiles on the left, the order
  on the right (tablet) or one tap away (phone), instead of a long list with per-row Add buttons.
- One tap adds one dish instantly — the tile pops, the dish appears on the order as "Adding…", the
  price total shows "—" until the server confirms. Dishes that need a choice open the options sheet;
  others have a small corner button for spice, add-ons, quantity and a kitchen note.
- If the connection hangs, the dish says "Checking…" and the pad offers "Reload the order"; if the
  answer is lost, the dish offers "Try again", which can never add it twice, and the Send and Take
  payment say exactly that ("We couldn’t confirm Mohinga — tap Try again on it, or reload the
  order") instead of "Waiting to hear back".
- **Send to kitchen** is on the pad (bottom bar on a phone). After sending, the slot becomes
  "Done · Table N". Undo works as on the table page.
- **Take payment** (table: outline button; counter: the main button) waits for the last dish, saves a
  typed walk-up name, then opens the table's payment section. It will NOT leave while a kitchen note
  is typed but not saved (the allergy line) — it says so and puts the cursor in that note. It shows
  the total only when nothing is pending (including a quantity just changed), says what it is doing
  while busy ("Waiting for the last dish…" / "Saving the name…" / "Opening payment…"), and when it
  can't be tapped says why — tapping it on a phone shows the reason as a toast. Tapping a dimmed
  Send says why the same way.
- Burmese console: dish names lead in Burmese with the English beneath, on the tiles, the order, and
  the table page's lines; the options sheet does the same. Categories stay English for now.
- Removing a dish on the order slides it out; if the server refuses, it comes back in place. If the
  answer is lost, it comes back and the pad says it couldn't confirm the removal (in Burmese on a
  Burmese console).
- The menu outage's "Try again" spins while it re-reads and repeats the outage line if the menu is
  still down.
- Search has a clear button; categories are a chip rail; a search that finds nothing says so.
- Removed: the old "Review order & take payment →" / "Review · N not sent →" links and the add page's
  subtitle paragraph.

## 6. K15 strings

Every MY value below is a Claude-authored draft pending Min's native check. HIGH = K15-HIGH (in
`STAFF_K15_HIGH`).

| Key                            | EN                                                                                 | MY                                                                                              | HIGH? |
| ------------------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----- |
| pad.a11y.skipToOrder           | Skip to the order                                                                  | အော်ဒါဆီ တန်းသွား                                                                               |       |
| pad.a11y.options               | Options for {x}                                                                    | {x} အတွက် ရွေးချယ်စရာ                                                                           |       |
| pad.search.clear               | Clear search                                                                       | ရှာတာ ရှင်း                                                                                     |       |
| pad.search.none                | No dish matches “{x}”.                                                             | “{x}” နဲ့ ကိုက်တဲ့ ဟင်း မရှိပါ။                                                                 |       |
| pad.menu.outage                | The menu didn’t load — the order still works.                                      | မီနူး မတက်လာပါ — အော်ဒါကတော့ ဆက်သုံးလို့ရပါတယ်။                                                 |       |
| pad.menu.retry                 | Try again                                                                          | ထပ်စမ်း                                                                                         |       |
| pad.ticket.title               | Order                                                                              | အော်ဒါ                                                                                          |       |
| pad.ticket.empty               | Nothing on this order yet — tap a dish to add it.                                  | ဒီအော်ဒါထဲ ဘာမှ မရှိသေးပါ — ဟင်းတစ်ခုကို နှိပ်ပြီး ထည့်ပါ။                                      |       |
| pad.group.unsent               | Not sent yet                                                                       | မပို့ရသေး                                                                                       |       |
| pad.group.togo                 | To-go · goes to the kitchen when paid                                              | ပါဆယ် · ငွေရှင်းမှ မီးဖိုချောင် ရောက်မယ်                                                        |       |
| pad.group.kitchen              | In the kitchen                                                                     | မီးဖိုချောင်မှာ                                                                                 |       |
| pad.group.served               | Served                                                                             | ထုတ်ပြီး                                                                                        |       |
| pad.ghost.adding               | Adding…                                                                            | ထည့်နေပါတယ်…                                                                                    |       |
| pad.ghost.checking             | Checking…                                                                          | စစ်နေပါတယ်…                                                                                     |       |
| pad.ghost.verb.retry           | Try again                                                                          | ထပ်စမ်း (grounded: pad.menu.retry)                                                              |       |
| pad.reload                     | Reload the order                                                                   | အော်ဒါ ပြန်ဖွင့်                                                                                |       |
| pad.bar.order.one              | Order · {n} item                                                                   | အော်ဒါ · {n} ခု                                                                                 |       |
| pad.bar.order.many             | Order · {n} items                                                                  | အော်ဒါ · {n} ခု                                                                                 |       |
| pad.bar.menu                   | Menu                                                                               | မီနူး                                                                                           |       |
| pad.settle                     | Take payment · {m}                                                                 | ငွေရှင်း · {m}                                                                                  | HIGH  |
| pad.settle.tab                 | Close bill · {m}                                                                   | စာရင်းပိတ် · {m}                                                                                | HIGH  |
| pad.settle.bare                | Take payment                                                                       | ငွေရှင်း                                                                                        | HIGH  |
| pad.settle.busy                | Waiting for the last dish…                                                         | နောက်ဆုံး ဟင်း ရောက်အောင် စောင့်နေပါတယ်…                                                        |       |
| pad.settle.savingName          | Saving the name…                                                                   | နာမည် သိမ်းနေပါတယ်… (grounded: browse.name.saving)                                              |       |
| pad.settle.opening             | Opening payment…                                                                   | ငွေရှင်းဖို့ ဖွင့်နေပါတယ်…                                                                      |       |
| pad.reason.empty               | Add a dish first                                                                   | ဟင်း အရင် ထည့်ပါ                                                                                |       |
| pad.nameNotSaved               | The name didn’t save — tap Take payment again to go on without it.                 | နာမည် မသိမ်းရသေးပါ — နာမည်မပါဘဲ ဆက်သွားဖို့ ငွေရှင်း ကို ထပ်နှိပ်ပါ။                            |       |
| pad.done                       | Done · Table {id}                                                                  | ပြီးပြီ · စားပွဲ {id}                                                                           |       |
| pad.settled.note               | This order is paid — nothing more can go on it.                                    | ဒီအော်ဒါ ငွေရှင်းပြီးပါပြီ — ထပ်ထည့်လို့ မရတော့ပါ။                                              |       |
| pad.paused                     | A guest is paying for this table — adding is paused.                               | ဧည့်သည်တစ်ယောက် ဒီစားပွဲအတွက် ငွေရှင်းနေပါတယ် — ထည့်တာ ခဏရပ်ထားပါတယ်။                           |       |
| pad.soldOut                    | {x} is sold out — it can’t be added.                                               | {x} ကုန်သွားပြီ — ထည့်လို့ မရပါ။                                                                |       |
| pad.err.add.paying             | {x} didn’t go on — a guest is paying for this table right now.                     | {x} မထည့်ရသေးပါ — ဧည့်သည်တစ်ယောက် ဒီစားပွဲအတွက် ငွေရှင်းနေပါတယ်။                                |       |
| pad.err.add.paying.family      | Some dishes didn’t go on — a guest is paying for this table right now.             | ဟင်းတချို့ မထည့်ရသေးပါ — ဧည့်သည်တစ်ယောက် ဒီစားပွဲအတွက် ငွေရှင်းနေပါတယ်။                         |       |
| pad.err.add.soldOut            | {x} just sold out — it isn’t on the order.                                         | {x} ကုန်သွားပြီ — အော်ဒါထဲ မထည့်ရပါ။                                                            |       |
| pad.err.add.soldOut.family     | Some dishes just sold out — they aren’t on the order.                              | ဟင်းတချို့ ကုန်သွားပြီ — အော်ဒါထဲ မထည့်ရပါ။                                                     |       |
| pad.err.add.gone               | {x} is off the menu — it isn’t on the order.                                       | {x} မီနူးမှာ မရှိတော့ပါ — အော်ဒါထဲ မထည့်ရပါ။                                                    |       |
| pad.err.add.gone.family        | Some dishes are off the menu — they aren’t on the order.                           | ဟင်းတချို့ မီနူးမှာ မရှိတော့ပါ — အော်ဒါထဲ မထည့်ရပါ။                                             |       |
| pad.err.add.closed             | {x} didn’t go on — this order is closed or already paid.                           | {x} မထည့်ရသေးပါ — ဒီအော်ဒါ ပိတ်ပြီး (သို့) ငွေရှင်းပြီးသားပါ။                                   |       |
| pad.err.add.closed.family      | Some dishes didn’t go on — this order is closed or already paid.                   | ဟင်းတချို့ မထည့်ရသေးပါ — ဒီအော်ဒါ ပိတ်ပြီး (သို့) ငွေရှင်းပြီးသားပါ။                            |       |
| pad.err.add.outage             | {x} didn’t go on — we can’t reach the system. Try again.                           | {x} မထည့်ရသေးပါ — စနစ်နဲ့ ဆက်သွယ်မရပါ။ ထပ်စမ်းပါ။                                               |       |
| pad.err.add.outage.family      | Some dishes didn’t go on — we can’t reach the system.                              | ဟင်းတချို့ မထည့်ရသေးပါ — စနစ်နဲ့ ဆက်သွယ်မရပါ။                                                   |       |
| pad.err.add.failed             | {x} didn’t go on — try again.                                                      | {x} မထည့်ရသေးပါ — ထပ်စမ်းပါ။                                                                    |       |
| pad.err.add.failed.family      | Some dishes didn’t go on — try again.                                              | ဟင်းတချို့ မထည့်ရသေးပါ — ထပ်စမ်းပါ။                                                             |       |
| pad.err.add.unconfirmed        | We couldn’t confirm {x} — check the order, or tap Try again. It won’t go on twice. | {x} ထည့်ပြီးမပြီး မသေချာပါ — အော်ဒါကို စစ်ပါ၊ ဒါမှမဟုတ် ထပ်စမ်း ကို နှိပ်ပါ။ နှစ်ခါ မထည့်ပါဘူး။ | HIGH  |
| pad.err.add.unconfirmed.family | We couldn’t confirm some dishes — check the order.                                 | ဟင်းတချို့ ထည့်ပြီးမပြီး မသေချာပါ — အော်ဒါကို စစ်ကြည့်ပါ။                                       | HIGH  |
| pad.err.add.offline            | You’re offline — {x} didn’t go on.                                                 | အင်တာနက် မရှိပါ — {x} မထည့်ရသေးပါ။                                                              |       |
| pad.err.add.offline.family     | You’re offline — some dishes didn’t go on.                                         | အင်တာနက် မရှိပါ — ဟင်းတချို့ မထည့်ရသေးပါ။                                                       |       |
| table.send.cta.bare            | Send to kitchen                                                                    | မီးဖိုချောင် ပို့                                                                               | HIGH  |
| table.send.hold.add            | Waiting to hear back about {x}                                                     | {x} အတွက် အဖြေ စောင့်နေပါတယ်                                                                    |       |
| table.send.hold.lost           | We couldn’t confirm {x} — tap Try again on it, or reload the order.                | {x} ထည့်ပြီးမပြီး မသေချာပါ — အဲဒီဟင်းမှာ ထပ်စမ်း ကို နှိပ်ပါ၊ ဒါမှမဟုတ် အော်ဒါ ပြန်ဖွင့်ပါ။     | HIGH  |
| pad.err.remove.unknown         | We couldn’t confirm {x} was removed — the order shows what’s on it.                | {x} ဖျက်ပြီးမပြီး မသေချာပါ — အော်ဒါထဲ ရှိနေတာကို ပြထားပါတယ်။                                    | HIGH  |
| table.line.a11y.less           | Decrease {x} quantity                                                              | {x} တစ်ခု လျှော့                                                                                |       |
| table.line.a11y.more           | Increase {x} quantity                                                              | {x} တစ်ခု ထပ်ထည့်                                                                               |       |
| table.line.a11y.remove         | Remove {x}                                                                         | “{x}” ဖျက်                                                                                      | HIGH  |
| table.line.a11y.soldOut        | {x} is sold out — can’t add more                                                   | {x} ကုန်သွားပြီ — ထပ်မထည့်နိုင်ပါ                                                               |       |
| table.line.a11y.max            | Maximum {n} {x}                                                                    | {x} အများဆုံး {n} ခု                                                                            |       |

Retired keys: `browse.sub.counter`, `browse.sub.table`, `browse.review`, `browse.reviewUnsent`,
`browse.empty`, `browse.soldOut`, `browse.add.verb.added` (their only readers,
`StaffMenuBrowser.tsx` / `StaffAddButton.tsx` and the old add page, are deleted).
`pad.ghost.verb.resend` ("Send again") was added and retired on this branch (never shipped): the
retry verb is `pad.ghost.verb.retry` ("Try again") — "send" is the kitchen's verb on the console.

Changed on this branch after the critic round: `pad.err.add.unconfirmed` ("…or tap Try again", was
"…or send it again"); `pad.settle.bare` is now K15-HIGH (the same money door as `pad.settle`, shown
whenever an add is pending) and in `STAFF_K15_HIGH`.

## 7. Deviations from spec

- **"Take payment" / "Close bill", never "Settle" / "Close tab"** in visible copy (conflict
  override: plain words). The plain-words guard now bans `settl*` and `tab(s)` in English staff
  copy. Keys keep the `pad.settle*` names.
- **No `pad.send.*` strings and no `padActions`.** The pad reuses 2a's `useStaffSend` +
  `StaffSendButton` and the `table.send.*` keys (conflict override). Additive only: `useStaffSend`
  takes an optional `drain`, `StaffSendButton` an optional `bare`, and `StaffSendHold` gains
  `{ kind: "add"; state: "unconfirmed" | "lost" }`; `FloorDetailLive` passes none of them and is
  unchanged. `StaffSendButton`'s hint now reads `sendRefusalMsg` (lib/staff-send-view.ts) — the same
  keys for the table page's `paying` / `note` / `writing`, so its rendered output is identical — so
  the pad's refused-tap toast and the hint can never word one hold two ways. The pad's own decisions
  are `padSettle` / `padSendView` / `padTileBlock` rather than one `padActions`.
- **Counter pad: no Send; the status row says `table.send.counterAtPay`** (conflict override). Take
  payment is the counter's one primary.
- **The settle gate is not built.** No `pad.unsentAtSettle.*`, no "they go to the kitchen when paid"
  caption on Take payment; `PadSettleBlock` is the seam (section 8).
- **`?settle=1` is pushed but not read** (register area owns `[id]/page.tsx` and `FloorDetailLive`).
- **`pad.reason.waiting` / `pad.reason.paying` / `pad.reason.note` not added:** the waiting reason
  reuses the Send's hold words (`table.send.hold.add` / `.lost` / `.writing` via `sendHoldMsg`), the
  note reason `table.send.hold.note` (true for every line: a counter or to-go dish cooks at payment,
  "with the dish"), and the paying reason `table.detail.payingPhone.cash|tab` (the table page's
  words). `table.send.hold.lost` is a new key in the Send's namespace because the Send says it too.
- **Take payment waits on an unsaved note on ANY line** — wider than the spec's drain (the add chain
  only) and wider than the Send's hold (sendable lines): leaving the pad unmounts the editor, and a
  counter order's lines are never "sendable". A new `note` block in `PadSettleBlock`, ranked
  `paying` > `note` > `waiting` > `empty`.
- **A refused tap says its reason through the Toast on EVERY tier**, not only the phone: one path,
  and a tablet tap on a dimmed control is feedback too (the hint there is drawn as well).
- **`pad.settle.savingName` is its own key** rather than `browse.name.saving` ("Saving…"): on the
  Take payment button a bare "Saving…" would not say WHAT is saving.
- **`pad.live.*` not added:** the quiet claim reuses `browse.added` and the name-save news reuses
  `browse.name.set` / `browse.name.cleared`.
- **`pad.a11y.clearSearch` is `pad.search.clear`** — the same words serve the ✕ and the no-match
  panel's button.
- **The phone's `.pad-bar` is the `.pad-dock`**, one grid whose areas CSS rearranges per tier (the
  view button, the primary slot, the settle slot), so there is exactly one Send node and one Take
  payment node at every width. Its height is MEASURED (`useCtaDock` publishes `--cta-dock-h`, the
  Toast rides above it; the spec drafted a 4rem constant). In the phone bar and the short tier the
  xl taps are trimmed by CSS (`--s3` gutters, `--fs-lead`, balanced wrap) rather than switched to
  `size="lg"`: the Send's button is 2a's `StaffSendButton`, which keeps its one size on the table
  page, and the trim keeps the 64px thumb height. Unmeasured on a device.
- **Closed session →** `router.replace(STAFF_DOOR_TARGET.counter)` (`/staff?floor=1`, the floor
  door) rather than a bare `/staff`.
- **`check:style-literals` was not re-recorded:** deleting `StaffMenuBrowser` / `StaffAddButton`
  removed no counted literal (current counts equal the baseline), so there was nothing to lock in.
- **Table page's line motion not added:** `FloorDetailLive` is not this area's file; F35 narrowed on
  the pad only.

## 8. Seams for the gate area

The ONE function: **`padSettle`** in `apps/qr/lib/order-pad.ts` (its reason sentence:
**`padSettleReason`**).

- `apps/qr/lib/order-pad.ts` — `type PadSettleBlock = "paying" | "note" | "waiting" | "empty"`
  (line 212), `PadSettleInput` (line 218) and `padSettle` (line 246). The gate adds `"unsent"` to
  the union, a field to `PadSettleInput` (the server's unsent dine-in units — `detail.send.sendable`
  is already on the detail the pad holds), and ONE clause in the `block` ternary. Precedence to
  decide: `paying` first is pinned by `pad/paying-not-first`; `note` before `waiting` by the
  order-pad suite. Then `SETTLE_REASON` (line 284) — a `Record` over the union, so the new member
  is a COMPILE ERROR until its sentence exists (verified: adding `"unsent"` alone fails `tsc` at that
  line).
- `apps/qr/components/staff/OrderPad.tsx` — `settleInput` (line 587) is where the new input is
  passed (render-time); `onSettle` (line 620) re-takes the decision AT THE TAP from refs with
  `padSettle({ ...settleInput, … })`, says the reason once (`say(padSettleReason(…))`), and today
  special-cases `note` to focus its field — the gate adds its jump to the Send beside that line.
  The hint (`settleWhy`, line 708) renders whatever `padSettleReason` returns; no arm to add there.
- `apps/qr/components/staff/OrderPad.tsx` `onSettle` → `router.push("/staff/table/{id}?settle=1")`
  (line 672) — the table page's `?settle=1` read and focus are the register area's.

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
- **Navigating away is a drain point too.** The Send drained unsaved notes because the FIRE loses
  them; Take payment's `router.push` loses them just as surely (the editor unmounts with its draft),
  and a counter order had no Send to guard it at all. Any control that leaves the screen must read
  the same local drafts a write would.
- **A hint hidden on one tier needs a spoken twin at the tap.** `sr-only` hints on the phone bar
  made every refused tap silent for a sighted user; saying the same sentence through the one region
  when the dimmed control is tapped fixes every tier with one path.
- **`vi.clearAllMocks()` does not drain `mockReturnValueOnce` queues.** A test that fails before
  consuming its queued answer hands it to the next test, so one red cascades into unrelated reds
  (seen while red-running this suite against the old code). Read the first failure only.

## 10. Critic findings — rejected

None. All seventeen findings of the critic's audit were verified against the code and are real;
each is fixed on this branch (the self-audit report lists the commit per finding). Two need a note
on HOW they were read:

- **"The dock buttons will probably wrap … the Toast offset is a guess" (medium, design)** — real as
  a risk, fixed as far as the environment allows: the offset is now measured (`useCtaDock`), the
  narrow slots are trimmed; the screenshots it asks for need a browser (OPEN-ITEMS row "Browser
  measurements not taken").
- **"Two computations of one rule" (low, `keyForAttempt` / `addAttemptOutcome`)** — real. The
  behaviour was already identical (the new sheet-retry test passes on the old code too, by
  design); the fix removes the second statement of the rule, and the re-anchored
  `pad/unconfirmed-read-as-a-refusal` / `pad/threw-read-as-a-refusal` mutants plus the three
  `staff-add-key/*` mutants pin it.
