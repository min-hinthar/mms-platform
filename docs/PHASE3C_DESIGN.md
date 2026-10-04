# Phase 3c-i — the bill is a receipt you can read (2026-10-04)

**The brief.** Four blind proposals and two judges read the as-built dine-in `/cart` after 3b; both
judges chose the same proposal independently and named the same grafts. This PR ships the dine-in
CHECKOUT half of row 3c (`docs/PHASE3_JOURNEYS.md`; OPEN-ITEMS J22 · J23): one hero verb per state,
the 10 s undo lifted out of the leaf so the bill is READABLE during the grace, Pay keeping its name and
stating its one reason, a Total row that is the door, the per-line For here / To go behind a ⋯ sheet,
and the table grid as a SECTION of the DoorSheet — **no authority change, no amount computed on the
client, no migration.** Binding the table at SEND time (`seatedSessionFor`, the CAS bind, the register
refusal) is 3c-ii and out of scope; `useTableSession`, `TableCartProvider`'s `?table=` parse,
`menu/page.tsx`'s `code`/`joinOnly` derivation and `/api/session` are untouched.

**Provenance.** A nine-agent panel run in-session on 2026-10-04 under the owner's "continue good work": two
read-only mappers (the checkout; the doors), four independent proposers (the hero-verb machine · the bill
as a receipt · the grid as a section · the first-time diner's tap walk), two judges scoring rubric ·
contract · risk with a graft and a `mustNot` list each, and one synthesizer. Both judges ranked proposal 1 first (contract
5/5); the decisions below take its skeleton and graft what BOTH judges named, and every `mustNot` is
honoured as law.

**Form.** As `docs/PHASE3B_DESIGN.md`: evidence → decisions → the two slices → scoring. Every claim is
file:line read from this checkout (HEAD `cbfd1ca`, 3b merged + the deep pass + Codex round 1 on #313),
never from a proposal's prose; the lead re-verified findings 3, 4 and 5 and the `.checkout-viewbill`
count by grep before adopting the design (LEARNINGS: verify every finding against source).

## What the panel found (verified against source)

| #   | Finding                                                                                                                                                                                                                          | Evidence                                                                                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Two verbs, one stage, no state between them.** Send (filled) and "View bill & pay" render on the same Order stage; the door promotes itself by an ad-hoc ternary; the Pay label renames itself to its refusal.                 | `Checkout.tsx:3609-3626` (Send), `:3647-3700` (door, `kitchenDraftQty === 0 && !undoOpen`), `:3746-3752` (label swaps to "Send everything…"/"Waiting for…") |
| 2   | **The undo window lives in a leaf, so the bill is locked for ten seconds.** `undoUntil` is `SendToKitchenButton` state; a stage flip unmounts it; Checkout therefore refuses the door and the Forward entry during the grace.    | `SendToKitchenButton.tsx:87-126` (state, unmount reset); `Checkout.tsx:2209` (`canBill: !undoOpen`), `:3654-3660` ("Hold on — you can still undo…")         |
| 3   | **Two polite live regions on one view.** The send flow's own `role=status` and the review view's region both mount on the Order stage — QA §A:25 says exactly one.                                                               | `SendToKitchenButton.tsx:331`; `Checkout.tsx:3865`                                                                                                          |
| 4   | **The server cannot see the grace at pay time.** `mms_undo_fire` guards open · dinein · fired · in-grace, never `c.locked`, in every redefinition; only the action checks `locked`. A client drain closes the one-tab case only. | `20260622050000_undo_grace.sql:52-66`, re-stated unchanged in `20260622090000`, `20260622100000`, `20260624030000`; `lib/cart.ts:335`                       |
| 5   | **A `?table=N` claim mints a NEW session over whatever cart this phone holds** — by design, so a grid offered at a dine-in session promises a table change the code answers with a new order.                                    | `useTableSession.ts:147-150`; `TablePicker.tsx:38,49,74,123`, `HomeSessionCard.tsx:47`, `JoinTable.tsx:28` (four hand-built copies of one href)             |

**Cross-cutting, both judges:** `.checkout-viewbill` has more CSS references than the "three rules" a
proposal counted — two sit inside the reduced-motion block (`globals.css:2538-2556, 2970, 2984`; **six
matches in `globals.css` measured 2026-10-04**, plus one in `Checkout.tsx`) — retiring three leaves orphans;
`.vt-cart-total` (`Checkout.tsx:3590`) is the J1 morph target and must stay unique per view; the
`mustNot`s that bind this design are: no second live region (P2), no grid at a live dine-in session (P2),
no `<dl>` inside a `<button>` (P2), the grace never outranks unsent (P4), no filled Send beside a Pay (P4),
no `mode_selected` on a disclosure that entered no door (P3), no presentation change on `/dine-in`
(P3), and no "optimistic, reversible" excuse for a sheet whose write fires a line (P1).

## The decisions (D13–D20 — continuing `docs/PHASE3B_DESIGN.md`)

- **D13 — one hero verb per state, decided in `lib/checkout-verb.ts`.** `orderStageHero({ canSend,
kitchenDraftUnits, graceOpen })` → `"send"` (host, drafts, no grace) · `"undo"` (grace open — the
  outline Undo is the only control; **reversing is never the hero**) · `"bill"` (everything sent; or a
  GUEST with drafts, `hostSendsCopy` above it; or a hostless table — pay fires the drafts). The Order stage
  draws exactly one `.checkout-cta` or none; the three ad-hoc gates at `:3609`, `:3647-3660` and the class
  ternary collapse into one call. _Law:_ decision logic in `lib/`, falsified by a value; one mutant per
  arm. _It is NOT_ P4's Send-on-the-Bill: with unsent dishes the Bill keeps Pay dimmed with its reason
  and the existing "← Back to send them" — two verbs on one screen is the shape J23 names.
- **D14 — the receipt foot IS the door, named once.** `const orderTotalCents = totals.totalCents +
tipPreviewCents` is the ONE binding (W17); it replaces the inline sums at `:2354` and `:3681`. Under
  the dishes sits one 44px `<button class="checkout-total-door">` of PHRASING content only — `Total` /
  `Estimated total` (while a tip is previewed) + MY + the amount + an `aria-hidden` arrow, never a `<dl>`
  — whose `aria-label` is `billDoorLabel(payBlock) · $X`: **"View bill · $X" while Pay is held, "View bill
  & pay · $X" only when `payBlock === null`** (P4's graft: the door never promises a verb the next screen
  refuses). While `hero === "bill"` the SAME element wears `.checkout-cta` and reads that label visibly.
  `.vt-cart-total` moves onto it (one per view — the Bill's hero total keeps its own; the two never
  co-render). `.checkout-viewbill` is retired in every reference (measure with `grep -c`, never count by eye). _Law:_ amounts server-derived, a
  PREVIEW labelled as one, never a second computation. _It is NOT_ a second amount beside a link.
- **D15 — the grace lives in Checkout; the bill is readable; only Pay waits.** NEW hook
  `components/useUndoGrace.ts` (the 7th hook in the mutate set) owns `deadlineMs` · `batch` · the 250 ms
  tick · `pending` · `message` · `graceWrites` (a serialized chain that never rejects). `graceDeadlineMs`
  (lib/send-grace, unchanged) still measures the window from the server receipt. `SendToKitchenButton`
  becomes controlled and presentational, KEEPS `reasonCopy` verbatim, LOSES its private `role=status`
  (its outcomes route to the view's one region, closing finding 3). **ONE Undo control at a time**: the
  mounted stage renders it, so a flip mid-grace keeps the undo without a second home; focus lands on
  Undo when the window OPENS (today's `:107`), and the `<h1>` owns every stage flip. The frozen tap
  refuses at the door and keeps the window open (today's `:179-187`); `expired` closes it. _Law:_ one live
  region per view; focus moved on step change; every animation RM-escorted (nothing new animates).
- **D16 — Pay keeps its name and states its one reason; drain → decide → mint.** `payBlock({
frozenByPeer, unsentBlocks, graceOpen, undoInFlight })` → `"peer" | "unsent" | "grace" | null` in THAT
  precedence (a tablemate's lock is the widest fact; **unsent outranks grace** because the Send still
  owed reopens the window — P4's inversion is refused). `unsentBlocks` is `payBlockedByUnsent(...)`
  passed in, never restated (its 7 mutants stay the gate). The label is ALWAYS `Pay · $X` / `Pay the
whole order · $X`; `aria-disabled` + `aria-describedby` → a static `<p class="checkout-pay-reason">`
  carrying `payBlockCopy`; every blocked tap `sayRefusal`s the SAME sentence (one sentence per state —
  P2's two were refused). `PayAtCounterButton` reads the same `block`. `continueToPayment` runs `await
grace.graceWrites.current`, re-evaluates `payBlock`, and only then mints. One announcement, "Ready to
  pay.", on the grace's true→false edge **while the Bill is mounted** — the dimmed Pay lighting up is
  otherwise silent to a reader parked on it. _Law:_ drain `settled()` before any charge; honesty.
- **D17 — the line is a receipt row.** The For here / To go pills and "Send to kitchen now · usually ~N
  min" leave the card for ONE `LineOptionsSheet` behind a 44px ⋯ (`aria-label="More for {name}"`,
  `aria-haspopup="dialog"`), rendered under today's exact gate (`isDineIn && fulfillment !== "grocery" &&
lineState === "draft" && canEdit`); the Stepper and `LineStateChip` stay on the card. The sheet is
  **subject-keyed** (`useSheetSubject`/`holdSubject`, the KdsLineMenu idiom): a refresh mid-open reaches
  it, and when the line stops being draft (Send-now landed, a tablemate's send fired it) it closes and
  focus lands on the line's `data-line-name` (the Phase 1c landing). Pills close on choice; `busy` is
  passed during a `makeNow` write — a fire is one-way for the guest who tapped it, so the sheet is
  GUARDED, not excused. Pills are `aria-disabled` under a freeze, never native. _Law:_ ONE selection
  vocabulary (the lit-gold `.checkout-pill-on` on the pills only; the ⋯ never lights).
- **D18 — the grid is a section, offered only OFF the table.** NEW `lib/table-pick.ts`:
  `tableGridOffered(mode)` = `currentDoor(mode).mode !== "dinein"` (docblock cites finding 5);
  `tableChipAction(mine, occupied)` → `resume | join | claim` (mine beats seated — the W5a code-wall bug
  stated as a value); `dineInMenuHref({table?, join?, resume?})` retires the four hand-built hrefs
  byte-identically. `TableGrid` is extracted VERBATIM from TablePicker (`<ul role=list>` + chips +
  "Start anyway" + the honest empty line); `TablePicker` renders it and KEEPS its own join `Sheet`
  unchanged (`/dine-in` is not this PR's surface). The DoorSheet, on the TO-GO menu, renders
  `<section aria-labelledby>` "Pick your table / စားပွဲ ရွေး" (v7.2:495 verbatim, both tongues) between
  the doors and the exits, `stagger={false}`, with an INLINE join form under the grid for a seated chip
  (focus → the code input; a step change). Tables come from `menu/page.tsx`'s RSC (`getDineInTables()`,
  service client, RSC-only rule kept) only when `tableGridOffered(mode)`; the market passes none in 3c-i
  (a client page — a member-gated `/api/tables` is filed, not built). `mode_selected { mode: "dinein",
door: "dinein", source: "sheet" }` fires on the CHIP tap — the door actually entered. The Dine-in row
  stays the home's exact link (DoorSheet.test's invariant). _Law:_ no promise the code does not keep.
  _It is NOT_ P1's empty-cart gate (a numberless `table_session` still outlives the new mint) and NOT a
  disclosure row.
- **D19 — Forward into Bill is always honoured; the guard is replaced, not deleted.** `onHistoryPop`
  loses `canBill`; `restore` keeps only its Pay reasons. The stale mutant
  `checkout-history/forward-walks-past-the-undo-window` (`verify-slice.mjs:302`) becomes
  `checkout-history/forward-into-bill-refused` (`toBill` → `restore`) — a new rule deserves a guard that
  can go red. _Law:_ a STALE mutant is a failure, not a skip.
- **D20 — the SQL hole is FILED, not built; the courtesy stays device-local.** `mms_undo_fire` has no
  `locked` guard (finding 4): two devices can interleave undo-passes-the-action-check → create-intent
  locks and reads zero drafts → the RPC flips the batch back → a charge mints over drafts the gate would
  have refused. The fix is `and c.locked = false` in the RPC — a prod migration via `apply_migration`,
  blocked on M125 → **new M-row (high), the next number after the measured max (`M257` today)**. A
  guest's phone never knows the host's grace; `payBlock("grace")` is this device's courtesy, and a server
  "in grace blocks pay" predicate (which would also refuse a guest's legitimate pay for ten seconds) is
  3c-ii-sized and filed in the same row.

## The build — two disjoint worktree slices

Both land on the merged 3b head; the lead integrates. **Shared by neither slice (the lead's integration
commit):** `scripts/verify-slice.mjs` (every mutant below), CLAUDE.md's enumeration (lib 173 → 175,
components 73 → 76, total 253 → 258 — MEASURE with the prescribed grep, never read these numbers),
`docs/OPEN-ITEMS.md` (J23 closed by 3c-i; J22 "grid relocated, bind-at-send pending 3c-ii"; the M-row of
D20; the K15 ledger row below; a J-row for the market's grid), `CHANGELOG.md`, `ROADMAP.md`,
`docs/PHASE3_JOURNEYS.md` (row 3c-i status), `docs/DESIGN-LANGUAGE.md` **§32 — one hero verb per state;
the bill is readable, only money waits; a grid is offered only off the table.** Review lenses for the
blind pass: **money semantics · concurrency · a11y**.

### Slice A — `checkout` · the bill as a receipt (D13–D17, D19)

- **Files (owned):** `apps/qr/lib/checkout-verb.ts` (new) + `checkout-verb.test.ts`;
  `components/useUndoGrace.ts` (new) + `useUndoGrace.test.tsx`; `components/SendToKitchenButton.tsx` +
  its test; `components/LineOptionsSheet.tsx` (new) + test; `components/Checkout.tsx`,
  `Checkout.test.tsx`, `Checkout.grace.test.tsx` (new, REAL `SendToKitchenButton`);
  `lib/checkout-history.ts` and its test; `lib/i18n/cart.ts`; `app/globals.css` (⚠ mutate set — commit
  before any run, never during).
- **States (dine-in; settle · pay · settled · counter-ask views unchanged):** ORDER·drafts·host → hero
  Send (`Send to kitchen · N items`), Total door reads "View bill · $X"; ORDER·grace → Undo (outline,
  focus on it), Total door LIVE; ORDER·sent → the door is the filled hero "View bill & pay · $X →";
  ORDER·guest with drafts → filled door "View bill · $X" + `hostSendsCopy`; ORDER·frozen → Send/Undo
  refuse at the door (FROZEN_NOTE), the Total door stays live. BILL·payable → `Pay · $X →`; BILL·peer →
  Pay dimmed, reason `Waiting for {name} to finish`; BILL·unsent → reason "Send everything to the kitchen
  first — then the bill is ready to pay." (host) / "{Host} sends them — then the bill is ready to pay."
  (guest, `TABLE_STARTER` fallback) + MY note unchanged (`:3031-3060`); BILL·grace or undo in flight →
  reason "Pay opens when the undo window closes.", the Undo control above the receipt, "Ready to pay."
  said once when it closes. Reload/`initialStage` unchanged.
- **Copy:** every EN string above is shipped verbatim (`i18n/cart.ts:40-42,83-85`, `Checkout.tsx:3720,
3746`, `confirm-copy.ts`, `SendToKitchenButton.tsx:322-345`) or v7.2 ("Total", `:423`). NEW EN, honest:
  "Pay opens when the undo window closes." · "View bill" · "Ready to pay." (status, EN-only by
  convention) · aria "More for {name}" · group "Where {name} goes" (shipped, `:2865`). NEW MY — two K15
  drafts flagged `// K15 draft (3c-i)` in `lib/i18n/cart.ts`: `payOpensAfterUndo.my` =
  "ပြန်ပြင်လို့ရတဲ့ အချိန် ကုန်သွားတာနဲ့ ရှင်းလို့ ရပါမယ်" · `viewBill.my` = "ဘောက်ချာ ကြည့်မယ်".
- **Motion / a11y:** nothing new animates; the Undo control reuses `.checkout-outline-btn mms-settle`
  (RM block `:885`); `.checkout-pay-reason` and `.checkout-total-door` are static, tokens only; the
  sheet's motion is the primitive's. One `role=status` per view (`:3865` re-keyed on `statusSeq`; the
  send button's region deleted; the sheet carries its OWN single region — Radix hides outside content).
  `aria-disabled`, never native, on Pay, counter, Undo, pills; native `disabled` only for `pending` /
  `loadingPay`. 44px on ⋯, the Total door, Undo. `role=group` + `aria-pressed` on the pills.
- **Tests, red-first (watch each fail against a stub, then go green):** `checkout-verb.test.ts` — host +
  drafts → send; grace open → undo even with drafts; no drafts → bill; guest with drafts → bill, never
  send; hostless → bill; `payBlock` peer > unsent > grace; `undoInFlight` alone → grace; all false → null;
  `billDoorLabel(null)` = "View bill & pay", any block → "View bill"; `payBlockCopy` four sentences, host
  vs guest, the `TABLE_STARTER` fallback. `useUndoGrace.test.tsx` (renderHook) — opens only with a batch
  and a positive measured grace; a frozen tap leaves `deadlineMs` unchanged; ok closes; `expired` closes
  with "That's already with the kitchen…"; `locked`/`rate_limited` keep the window; `graceWrites.current`
  resolves after the undo and never rejects; the interval is cleared on unmount (fake timers).
  `Checkout.grace.test.tsx` — the Bill is readable during the grace (door enabled, rows render, Pay
  `aria-disabled` described by the grace sentence, `fetch` to create-intent NEVER called); the undo
  survives the flip (Undo on the Bill, `undoFire(CART, batch)` with the exact batch); Pay drains a
  deferred undo before minting and is then refused with the unsent sentence; exactly one `.checkout-cta`
  per Order state and exactly one `.vt-cart-total` per view (DOM queries, LEARNINGS #60). `Checkout.test.tsx`
  — rewrite `:1411,1569,2079` (label is `Pay ·`, the reason rides `aria-describedby`; re-said on every
  tap); Total door and Bill hero read ONE figure with a previewed tip; ⋯ present only on draft+editable
  dine-in food lines; "To go" → `setLineFulfillment`, sheet closes, focus on that line's ⋯; a fired line
  closes an open sheet and lands focus on `data-line-name`. `checkout-history.test.ts` — Forward into
  Bill from Order is always `toBill`. `SendToKitchenButton.test.tsx` — both cases re-driven through a
  hand-built grace object + "Undo is never the filled hero".
- **Mutants to hand the lead:** `checkout-verb/send-offered-during-grace` · `checkout-verb/guest-offered-send`
  · `checkout-verb/grace-does-not-wait-pay` · `checkout-verb/in-flight-undo-not-a-window` ·
  `checkout-verb/grace-outranks-unsent` · `checkout-verb/peer-lock-dropped-from-pay` ·
  `checkout-verb/door-promises-pay-while-held` (`billDoorLabel` ignores the block) ·
  `checkout-verb/guest-unsent-copy-orders-the-guest-to-send`; `undo-grace/frozen-tap-closes-the-window` ·
  `undo-grace/undo-write-not-chained` · `undo-grace/expired-keeps-the-window` ·
  `undo-grace/interval-survives-unmount`; `checkout/pay-mints-over-an-in-flight-undo` (the `await`
  dropped) · `checkout/pay-decides-before-the-drain` · `checkout/total-door-drops-the-previewed-tip` ·
  `checkout/two-heroes-on-the-order-stage` · `checkout/line-sheet-offered-on-a-fired-line`;
  `send-button/undo-is-rendered-as-the-hero`; `line-sheet/pills-live-under-a-freeze`;
  `checkout-history/forward-into-bill-refused` (REPLACES `:302`). Run `check:mutant-anchors` first —
  the 46 existing Checkout mutants' `find` strings around `:3609-3760` move.
- **Laws:** amounts never optimistic (`orderTotalCents` is a labelled PREVIEW; the charge is
  create-intent's `payTotals`, rows on the pay step from the LOCKED read `:2523-2555`); drain before any
  charge; `payBlockedByUnsent` read, never restated; `kitchenDraftQty` ≠ `unsentFoodQty` (never merged);
  tip chips gate on `payFrozen` only (`cart-freeze.ts:513-534`); `editOrder` releases the lock on every
  leave path; `onReadFailed`'s `cart_closed` arm and the T20 re-read stay; never push a same-path
  same-hash entry.

### Slice B — `doors` · the grid as a section (D18)

- **Files (owned):** `apps/qr/lib/table-pick.ts` (new) + `table-pick.test.ts`; `components/TableGrid.tsx`
  (new) + `TableGrid.test.tsx`; `components/TablePicker.tsx`; `components/DoorSheet.tsx` +
  `DoorSheet.test.tsx`; `components/HomeSessionCard.tsx`; `components/JoinTable.tsx`;
  `components/menu/MenuBrowser.tsx`; `app/(order)/menu/page.tsx`; `lib/i18n/common.ts`. **No
  `globals.css`** — reuse `.table-grid`/`.table-chip*` (`:7252-7349`), `.door-sheet-*`, `buttonClass` and
  the picker's inline idioms; any rule genuinely missing is a one-line note to the lead, not an edit.
- **States:** to-go menu → DoorSheet → doors (Dine-in row still the `/dine-in` link) → **section "Pick
  your table / စားပွဲ ရွေး"** + sub "Scan your table's sticker, or pick your number." (shipped,
  `TablePicker.tsx:57`, EN-only — the heading carries the pair) → chips: Open → `dineInMenuHref({table})`
  (a remount + a NEW mint, which the sub-line "Each way of ordering has its own order." already names);
  Your table (`useSessionPeek`) → `dineInMenuHref({table, resume: true})`; Seated → the inline form
  "Join Table N" · "Table code" · "Join" → `dineInMenuHref({join: code.trim().toUpperCase()})`; empty
  registry → "Couldn't load the tables. Scan your table's sticker, or start without a number."; "Not at a
  numbered table? Start anyway" → `dineInMenuHref({})`. The sheet stays OPEN through the navigation (the
  shipped concurrency rule). Dine-in sheet (numbered or numberless): NO section — the lit row + two
  exits exactly as today. Market: NO section in 3c-i (no `tables` prop). `/dine-in`: byte-identical
  behaviour and presentation; its join `Sheet` stays in `TablePicker.tsx`.
- **Copy:** v7.2:495 "Pick your table" + "စားပွဲ ရွေး" verbatim (`lib/i18n/common.ts` `pickYourTable`,
  no draft). Everything else is `TablePicker.tsx:71-176` verbatim, moved into `lib/table-pick.ts`
  (`tableChipLabel`, `tableChipWord`, `JOIN_COPY`) so the page and the section cannot drift. **Zero new
  K15 drafts.** v7.2's "Dine-in · invite friends to order together." is refused (no invite flow here).
- **Motion / a11y:** `TableGrid` takes `stagger` (false in the sheet — DoorSheet.test pins no stagger);
  `.table-chip` transitions are already RM-none (`:7349`); the inline form arrives with `mms-rise` (RM
  `:1084`). Section `aria-labelledby` its heading; `<ul role=list aria-label="Choose your table">`; every
  chip a `<button>` named by the full sentence, ≥44px; seated chips never `disabled`; focus moves to the
  code input on reveal and back to the chip on collapse; no live region added (DoorSheet.test asserts
  none); `.table-chip.is-mine` is availability, not selection — it never joins the `.checkout-pill-on`
  list (`:2742`).
- **Tests, red-first:** `table-pick.test.ts` — `tableGridOffered("dinein")` false, "pickup"/"scango"
  true; `tableChipAction(true,true)` = resume, `(false,true)` = join, `(false,false)` = claim;
  `tableChipLabel(7,"join")` equals the K2 sentence; `dineInMenuHref` reproduces the FOUR shipped strings
  byte-for-byte, pasted from `git grep -n "mode=dinein&door=dinein" HEAD`, never typed.
  `TableGrid.test.tsx` (jsdom) — three chip states; Seated reveals the form and `document.activeElement`
  is the input; Join pushes the upper-cased href; `stagger={false}` renders no `mms-stagger`;
  `tables=[]` renders the honest line. `DoorSheet.test.tsx` — to-go with `tables` renders ONE section
  headed "Pick your table" between the doors and the exits and `role=dialog` count stays 1; an open chip
  pushes `/menu?mode=dinein&door=dinein&table=N`; a seated chip opens the form, not a claim;
  `mode_selected {mode:"dinein", door:"dinein", source:"sheet"}` captured on the CHIP tap and not on
  open; a chip tap does NOT call `onOpenChange(false)`; `mode="dinein"` (with or without a number) renders
  NO section even with `tables`; the market renders none; the existing 16 cases stay green (links equal
  `DOORS`, lit cap unique, 44px, no stagger, no live region).
- **Mutants to hand the lead:** `table-pick/grid-offered-at-table` (`!== "dinein"` → `true`) ·
  `table-pick/mine-loses-to-seated` · `table-pick/seated-claims` (join → claim) ·
  `table-pick/href-drops-door` (`door=dinein` omitted). Suite `lib/table-pick.test.ts`.
- **Laws:** the mint is untouched (`useTableSession.ts`, `TableCartProvider.tsx`, `/api/session`,
  `menu/page.tsx:52-54` are OFF LIMITS — only the `getDineInTables()` read and a `tables` prop are added
  to the page); tokens never reach the client (`lib/tables.ts` strips `qr_code`); `DOORS` hrefs are the
  only door links; `mode_selected` records a door the diner entered.

### Bookkeeping (every push, lead)

`pnpm check:docs` (step ONE; refresh counts) · `check:style-literals` (the ratchet may fall — the
`.checkout-viewbill` rules go) · `check:mutant-anchors` · `check:scan-repeat` · `check:freeze-parity` ·
`check:pay-attempt` · `pnpm turbo lint typecheck build test` · `pnpm verify:slice` ONCE on the merge head,
watched to the end (`ps -eo pid,comm,args | awk '$2=="node" && /verify-slice\.mjs/'` first). Then the
ritual: `pnpm review:bundle` → blind pass (lenses above) → draft PR → `@codex review` → mark ready →
WAIT, event-driven, for "Codex has reviewed" the merge head → fix-or-justify (two rounds) → merge.

### Out of scope (this PR)

The table bound at SEND (`seatedSessionFor`, `bindTable`, the register refusal, the partial index) —
3c-ii. `/dine-in` retiring, its join form, the seated predicate — 3c-ii. A `/api/tables` read for the
market — filed. The `mms_undo_fire` `locked` guard and any server "in grace" predicate — the D20 M-row.
MY on the For here / To go pills (EN-only today, a pre-existing K15 gap, ledgered not drafted). The
secure tab (parked, `SURFACES.cardOnFileTabs`) and every amount, tip cap, promo pin and tax rule.

### Dependencies · risks

- **Owner, two words:** (1) Pay WAITS for the grace (≤10 s, the control says why) rather than charging
  in-grace lines — default taken; (2) the hero never renames itself (today's "Send everything…" /
  "Waiting for…" labels become the reason line) — Checkout.test pins the old labels, rewritten red-first.
- **K15 (Min):** two drafts (`payOpensAfterUndo`, `viewBill`), one ledger row.
- **Blast radius:** Checkout.tsx (4188 lines, 46 live mutants, 84 jsdom cases) — the logic lands in lib
  FIRST; `check:mutant-anchors` after every edit. The grace hook's three invariants (window never
  shortened by a freeze; undo targets only `batch`; `graceWrites` never rejects) each have a mutant.
- **Two amounts, one binding:** the Total door and the Bill hero can only disagree if a second sum is
  written — the mutant `total-door-drops-the-previewed-tip` is the proof.
- **The grid's honesty** rests on `tableGridOffered` — a chip at a live table would mint over this
  phone's drafts; the lib test and its mutant are the guard, not the docblock.
- **Two service-role reads** per to-go menu render (the same two `/dine-in` makes); measure TTFB on the
  preview before merge, file a member-gated fetch if it moves.
- **Three mutate-set files touched** (Checkout, SendToKitchenButton, globals.css) — commit before any
  `verify:slice` run, never during (LEARNINGS #74).

## Scoring (RUBRIC J-axes, self-scored, before → after 3c-i)

| Path    | J-B progress clarity | J-C effort | J-E dead-time | J-G recovery | Note                                                                                                                                              |
| ------- | -------------------- | ---------- | ------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dine-in | 4.5 → 4.7            | 4 → 4.2    | 4 → 4.5       | 4.7 → 4.8    | one filled verb at every moment; the ten-second stare becomes bill-reading time; Pay says why in place; the door never promises a verb it refuses |
| To-go   | 4.5 → 4.5            | 4.1 → 4.2  | —             | —            | a table is one tap from the to-go menu, with no detour through `/dine-in`                                                                         |

Honest about what does not move: the first-timer's 9 taps stay 9 — the tap cuts are 3c-ii's bind at
Send; J-C loses a tap on the rare For here / To go flip (behind ⋯) and gains the wrong-order path
(View bill → Back to send → Send → View bill → Pay) only in clarity, not length. J-A and J-D are unchanged;
no new choreography, no new peak.
