# Phase 2a · send — integration notes

Area: the staff console's **Send to kitchen + Undo on the table page** (OPEN-ITEMS P2k, commit A of
the send-kitchen spec). Branch `p2a/send`.

## 1. DESIGN-LANGUAGE draft (§17 bullets, as built)

- **The console sends too (P2k).** The table page carries ONE Send per table, in the order card
  between the pretax note and the card's one status region, so the page reads "send, then settle".
  It is `@mms/ui` Button primary · xl · block — the console's first `.ui-btn` — and it is
  **primary** when staff own the send: the table is hostless, staff added any of the unsent dishes
  (a "mixed" note says the Send also fires the table's own), or the table has asked to pay (a
  check-with-the-table note). When a diner host runs the table and every unsent dish is theirs it is
  **secondary** under "{host} sends from their phone — send here only if the table asks." One tap
  sends; there is no confirm.
- **Hints sit BELOW the control, never above.** A held or blocked Send (a dirty note on a sendable
  dish, a write still saving, a payment in flight) is `aria-disabled` — never natively disabled —
  with its reason as an `aria-describedby` hint under it; a hint collapsing can therefore never move
  the control under a thumb. Notes that describe the send vanish AT the tap. The control row holds
  64px (`--tap-bump`) through Send → Undo → the status rows (all sent · to-go at pay · counter at
  pay), which are rows, not pills: no fill, border, radius or cursor, focusable with tabIndex -1.
- **The console's Undo reads the diner's server clock and the one same-gesture hold.** The grace is
  `lib/send-grace.ts` (the server-measured duration from local receipt — the diner's
  SendToKitchenButton reads the same module). The Send turns into the Undo on the SAME node (focus
  stays), the verb is its whole accessible name and the countdown is a separate aria-hidden `· {n}s`
  span, and a tap within `SAME_GESTURE_MS` of ANY relabel under the finger (Send → Undo, Undo →
  Send, a count that moved) is ignored. The controller (`useStaffSend`) is owned by the host that
  owns the detail, so the refresh that zeroes the "not sent" count, or a view swap, cannot kill an
  open undo; an open undo also survives "← Floor" and a reload through a per-device
  `mms-staff-undo:{sessionId}` stash (display-only; the SQL re-checks). After a successful undo the
  control stays busy until the drafts are back (bounded at two detail commits), then focus returns to
  the Send; when the window closes with focus on the Undo, focus moves to the status row in place,
  without scrolling.
- **Drain before fire, on the console.** A note typed on a sendable dish but not saved holds the Send
  (naming the dish) and a tap takes the finger to that note field — found by `data-note-for` within
  the order card, not by its id; any line write still in flight holds it too.
- **Outcomes take the view's ONE region** as `StaffMsg` keys: writeError > send warn > degraded >
  send ok, and each setter clears the other, so a standing "Sent" never masks the frozen-board
  signal. A send that THREW says "couldn't confirm — check the order" and re-reads at once; it never
  says "couldn't send" and never offers an Undo it has no batch for.
- **Busy (reconciles §17's busy sentence).** `.ui-btn` busy = `aria-busy` plus a full-ink spinner
  and a stated word ("Sending…", "Bringing it back…"), never dimmed; `.staff-btn` keeps its dim.

## 2. CHANGELOG

- **Phase 2a · send — the console sends to the kitchen (P2k).** A phone-less table ("Start a table")
  no longer waits for its settle to cook: the table page gains "Send to kitchen · N items" with a
  10s server-clocked Undo, dishes the kitchen has not got are tagged "Not sent", post-fire line
  states speak the device language, and the add page gains an interim "Review · N not sent →" bridge
  that lands focused on the Send (superseded by the 2c order pad, which removes it with
  `browse.review`). `staffFireCart` moved from `kitchen.ts` to `lib/staff-send.ts` with a typed
  refusal union (counter · paying · nothing · …), its batch and deadline, and `staffUndoFire`; staff
  writes (add, send, undo) now renew the session like a diner write. The diner's
  SendToKitchenButton reads its grace through the new `lib/send-grace.ts` (arithmetic only, no
  behaviour change).

## 3. OPEN-ITEMS rows

| Sev  | Item                                                                                | Why / where                                                                                                                                                                                                                                          |
| ---- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —    | CLOSE P2k (staff Send from the console)                                             | Shipped here: `lib/staff-send.ts` + `useStaffSend` / `StaffSendButton` on the table page.                                                                                                                                                            |
| —    | NARROW K25                                                                          | The table page's line-state words (Sent / Cooking / Served) now speak the dictionary; `STAFF_STATE_COPY` retired. Remaining K25 surfaces: expo heads, KDS strip utilities, floor heading.                                                            |
| high | Counter (phone / walk-up) orders sent before payment ("Unpaid — collect at pickup") | Owner decided YES (2026-09-24). 2a still refuses `reason: 'counter'` and shows "The kitchen starts this order when it’s paid." Needs a `reg-`-only fire RPC + an Unpaid KDS/board/lane channel — a migration (Phase 2f).                             |
| med  | The diner Undo has no same-gesture hold                                             | `SendToKitchenButton` got only the arithmetic swap; its Send→Undo relabel still accepts the second half of a double-tap. Adopt `undoTapHeld` (or `useStaffSend`).                                                                                    |
| med  | No age signal for DINER-owned unsent drafts on host tables                          | The Send is secondary there and the floor counts only staff-added lines (2d). A diner round left unsent for a long time is invisible; the oldest draft's `created_at` is the real-data signal.                                                       |
| low  | No sold-out warning on the Send itself                                              | A draft already shows "Sold out" on its line; `mms_fire_cart` ignores `is_sold_out` on both the diner and staff paths (pre-existing).                                                                                                                |
| low  | Undo across devices                                                                 | `fire_batch` has no actor column; the undo survives only on the device that sent (sessionStorage).                                                                                                                                                   |
| low  | `sendGate` restates `staffGate`'s three checks to answer a reason                   | `staffGate` returns sentences (the P2c contract); `lib/staff-send.ts` needs a code, so it re-reads `getStaffAuth` + `roleAtLeast`. If `staffGate` ever grows a check (e.g. the console lock), this copy must follow — or `staffGate` returns a code. |
| low  | 390px screenshots not taken                                                         | No preview/device here. Check the add-page StaffBar with the "Review · N not sent →" link beside back, title, language and Lock (may wrap, must not overflow), and the table page's Send / Undo / status row at 390 / 768 / 1280.                    |
| low  | The floor's "not sent" signal                                                       | Lands in 2d as the kitchen-row segment, counted by `staffOwedSendUnits(hostPresent, staffSendCounts(…))` (shipped pure here, mutated). Not rendered anywhere in 2a.                                                                                  |

## 4. Mutate-set / CLAUDE.md enumeration changes

- **Added to the mutate set (lib bucket):** `apps/qr/lib/staff-send.ts`, `apps/qr/lib/staff-send-view.ts`,
  `apps/qr/lib/send-grace.ts`. Already in the set and gaining mutants: `apps/qr/lib/staff-cart.ts`,
  `apps/qr/lib/floor.ts`. No component joins the set.
- Measured at this head with CLAUDE.md's grep: **125 lib + 3 api + 13 components + 1 packages/db = 142**
  files, **822** mutant ids (base 792). Re-measure after the siblings merge.
- **Mutants added (30), all KILLED** (`verify:slice --no-gate --only=staff-send` / `send-grace` /
  `staff-cart/` / `floor/`):
  `staff-send/fires-a-counter-order`, `staff-send/fires-mid-payment`, `staff-send/nothing-reads-as-sent`,
  `staff-send/no-batch-no-undo`, `staff-send/diner-phones-not-resynced`, `staff-send/no-renewal`,
  `staff-send/undo-targets-the-wrong-batch`, `staff-send/late-undo-reads-as-success`,
  `staff-send-view/sendable-counts-togo`, `staff-send-view/staff-added-counts-diner`,
  `staff-send-view/host-round-fired-as-primary`, `staff-send-view/staff-added-demoted`,
  `staff-send-view/counter-ask-keeps-host-note`, `staff-send-view/paying-not-blocked`,
  `staff-send-view/counter-order-offered-a-send`, `staff-send-view/counter-at-pay-on-slotted-cart`,
  `staff-send-view/unsent-chip-on-host-diner-round`, `staff-send-view/unsent-chip-hides-staff-lines`,
  `staff-send-view/note-hold-ignored`, `staff-send-view/tab-close-steers-to-send`,
  `staff-send-view/late-undo-says-try-again`, `send-grace/absolute-server-deadline`,
  `send-grace/undo-without-a-batch`, `send-grace/no-same-gesture-hold`, `send-grace/hold-never-resolves`,
  `staff-cart/add-no-renewal`, `floor/send-counts-lose-the-fulfillment`,
  `floor/line-sendable-tags-a-togo-draft`, `floor/settled-record-offers-a-send`,
  `floor/host-present-ignores-the-host`.
- **Re-anchored:** none (every existing `staff-cart/*` and `floor/*` mutant re-run and still KILLED).

## 5. Owner-visible behaviour changes

- **Staff (table page):** under the order, "Send to kitchen · N items" (MY over EN). One tap sends;
  for 10 seconds the same button reads "Undo · 9s…" and takes the round back. After that: "Everything’s
  been sent to the kitchen." (or "N to-go items — the kitchen starts them when the table pays.", or,
  on a register order, "The kitchen starts this order when it’s paid."). Unsent dishes read
  "· Not sent"; sent/cooking/served dishes now say so in Burmese on a Burmese console.
- At a table a diner hosts, the Send is the quieter secondary button with "{host} sends from their
  phone — send here only if the table asks." It turns primary when staff added dishes or the table
  asked to pay.
- The Send refuses (dimmed, with the reason under it) while a payment is under way, while a dish's
  note is typed but not saved (tapping it jumps to that note), and while a change is still saving.
- **Staff (add page):** at a table with unsent dishes, the bar's right side shows "Review · N not
  sent →", which opens the table page focused on the Send.
- A table worked only from the console no longer drops off the floor and the kitchen screen four
  hours after "Start a table" — adding, sending or undoing renews it.
- **Guests:** nothing visible. The diner's own Send reads the same grace arithmetic from a shared
  module (identical behaviour); a staff send makes the host's phone re-sync.

## 6. K15 strings (every MY value is a Claude-authored draft unless grounded)

| Key                            | EN                                                                                                   | MY                                                                                                        | HIGH? |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----- |
| table.send.cta.one             | Send to kitchen · {n} item                                                                           | မီးဖိုချောင် ပို့ · {n} ခု                                                                                | HIGH  |
| table.send.cta.many            | Send to kitchen · {n} items                                                                          | မီးဖိုချောင် ပို့ · {n} ခု                                                                                | HIGH  |
| table.send.sending             | Sending…                                                                                             | ပို့နေပါတယ်… (grounded: table.loss.sending)                                                               |       |
| table.send.undo                | Undo                                                                                                 | ပြန်ယူ (owner's verb, not kds.undo's ပြန်ဖျက်)                                                            | HIGH  |
| table.send.undoLeft            | · {n}s                                                                                               | · {n} စက္ကန့်                                                                                             |       |
| table.send.undoing             | Bringing it back…                                                                                    | ပြန်ယူနေပါတယ်…                                                                                            |       |
| table.send.sent.one / .many    | Sent {n} item(s) to the kitchen.                                                                     | မီးဖိုချောင်ကို {n} ခု ပို့ပြီးပြီ။                                                                       |       |
| table.send.undone              | Brought back — not sent. Change it, then send again.                                                 | ပြန်ယူပြီးပြီ — မပို့ရသေးပါ။ ပြင်ပြီး ထပ်ပို့ပါ။                                                          |       |
| table.send.allSent             | Everything’s been sent to the kitchen.                                                               | အားလုံး မီးဖိုချောင်ကို ပို့ပြီးပြီ။                                                                      |       |
| table.send.hostNote            | {x} sends from their phone — send here only if the table asks.                                       | {x} က ဖုန်းကနေ ပို့ပါတယ် — စားပွဲက ပြောမှ ဒီကနေ ပို့ပါ။                                                   |       |
| table.send.hostNote.anon       | The table’s host sends from their phone — send here only if the table asks.                          | စားပွဲ အိမ်ရှင်က ဖုန်းကနေ ပို့ပါတယ် — စားပွဲက ပြောမှ ဒီကနေ ပို့ပါ။                                        |       |
| table.send.mixedNote           | You added {n} here — Send also sends the table’s {total} not yet sent.                               | ဒီမှာ {n} ခု ထည့်ထားတယ် — ပို့ရင် စားပွဲက မပို့ရသေးတဲ့ {total} ခုပါ တစ်ခါတည်း ပါသွားမယ်။                  | HIGH  |
| table.send.counterAskNote      | They’ve asked to pay — check with the table: send these {n}, or remove any they don’t want.          | ငွေရှင်းမယ်လို့ ပြောထားပြီ — စားပွဲကို မေးပါ၊ ဒီ {n} ခု ပို့မလား၊ မလိုတာ ဖယ်မလား။                         | HIGH  |
| table.send.paying              | A payment is under way — these go to the kitchen when it goes through.                               | ငွေပေးချေနေဆဲပါ — ငွေဝင်တာနဲ့ မီးဖိုချောင်ကို ရောက်ပါမယ်။                                                 |       |
| table.send.hold.note           | Save the note on {x} first — it goes to the kitchen with the dish.                                   | {x} ရဲ့ မှတ်ချက်ကို အရင် သိမ်းပါ — ဟင်းနဲ့အတူ မီးဖိုချောင် ရောက်ရမှာပါ။                                   | HIGH  |
| table.send.hold.writing        | One moment — a change is still saving.                                                               | ခဏ — ပြင်ထားတာ သိမ်းနေတုန်းပါ။                                                                            |       |
| table.send.togoAtPay.one/.many | {n} to-go item(s) — the kitchen starts it/them when the table pays.                                  | ပါဆယ် {n} ခု — ငွေရှင်းတာနဲ့ မီးဖိုချောင်က စချက်ပါမယ်။                                                    |       |
| table.send.counterAtPay        | The kitchen starts this order when it’s paid.                                                        | ငွေရှင်းပြီးမှ မီးဖိုချောင်က ဒီအော်ဒါကို စချက်ပါမယ်။                                                      | HIGH  |
| table.send.err.nothing         | Nothing new to send.                                                                                 | ပို့စရာ အသစ် မရှိပါ။                                                                                      |       |
| table.send.err.closed          | This order is settled or closed — nothing to send.                                                   | ဒီအော်ဒါ ရှင်းပြီး ဒါမှမဟုတ် ပိတ်ပြီးပြီ — ပို့စရာ မရှိပါ။                                                |       |
| table.send.err.counter         | Counter orders go to the kitchen when they’re paid.                                                  | ကောင်တာ အော်ဒါတွေက ငွေရှင်းပြီးမှ မီးဖိုချောင် ရောက်ပါတယ်။                                                |       |
| table.send.err.expired         | Too late to bring it back — the kitchen has it. Use Void / Comp on the dish if it shouldn’t be made. | ပြန်ယူဖို့ နောက်ကျသွားပြီ — မီးဖိုချောင် ရောက်သွားပြီ။ မချက်စေချင်ရင် ဟင်းပေါ်က ဖျက် / အခမဲ့ ကို နှိပ်ပါ။ | HIGH  |
| table.send.err.failed          | Couldn’t send — try again.                                                                           | မပို့နိုင်ပါ — ထပ်စမ်းပါ။                                                                                 |       |
| table.send.err.unknown         | Couldn’t confirm the send — check the order above before you send again.                             | ပို့ပြီးမပြီး မသေချာပါ — ထပ်မပို့ခင် အပေါ်က အော်ဒါကို စစ်ပါ။                                              | HIGH  |
| table.send.err.undoFailed      | Couldn’t bring it back — try again before the time runs out.                                         | ပြန်မယူနိုင်ပါ — အချိန်မကုန်ခင် ထပ်စမ်းပါ။                                                                |       |
| table.line.notSent             | Not sent                                                                                             | မပို့ရသေး                                                                                                 | HIGH  |
| table.line.state.fired         | Sent                                                                                                 | ပို့ပြီး                                                                                                  | HIGH  |
| table.line.state.inProgress    | Cooking                                                                                              | ချက်နေဆဲ (grounded: kds.line.cooking)                                                                     |       |
| table.line.state.served        | Served                                                                                               | ထုတ်ပြီး (grounded: kds.served.chip)                                                                      |       |
| browse.reviewUnsent            | Review · {n} not sent →                                                                              | စစ်ရန် · {n} ခု မပို့ရသေး →                                                                               |       |

Plural pairs registered: `table.send.cta.*`, `table.send.sent.*`, `table.send.togoAtPay.*`.

## 7. Deviations from spec

- **The Send is a `@mms/ui` Button**, not the spec's `staff-btn staff-press` pill — plan conflict
  "button vocabulary" (register's rule) overrides the spec's rejection. No bespoke fill in globals.css.
- **Controller / view split** (plan conflict #1): `useStaffSend` (owned by `FloorDetailLive`) +
  a pure `StaffSendButton`, instead of the spec's single stateful `StaffSendButton`. The view takes
  the controller's refs as their own props (`controlRef`, `statusRef`): react-hooks/refs rejects any
  property read off an object that carries a ref used as `ref=`.
- **The Undo's countdown is its own key** `table.send.undoLeft` in an aria-hidden span, and
  `table.send.undo` is the verb alone (plan conflict #2), instead of the spec's "Undo · {n}s".
- **`floor.card.unsent` not added**, nor the TableCard badge / `al()` clause (plan conflict: the
  floor signal moves to 2d as a kitchen-row segment). `staffOwedSendUnits` ships (pure, mutated) for 2d.
- **`staffFireCart` / `staffUndoFire` gate through a local `sendGate`** that re-reads
  `getStaffAuth` + `roleAtLeast` rather than calling `staffGate()`: `staffGate` answers sentences, and
  the refusal union must be decided by where it happened, never by matching text (filed low).
- **The Send renders during a payment in flight** — aria-disabled, described by the paying hint
  (spec state D) — rather than being mounted only under `canWrite`; the view's `blocked` flag is
  exactly `!canWrite` on an open cart.
- **Drain before fire is a REFUSAL (the hold), not an awaited drain**: the hook takes `getHold`
  (read at tap time) and the order card's `rootRef` (for the note lookup) instead of order-pad's
  optional `drain?` callback.
- **`detailSeq` is counted by detail identity** (React's guarded set-during-render) inside the
  Phase 2a block, not bumped inside `refresh` — keeps the tablet agent's edits to `refresh` clean.
- **Every setter clears the other** through a small `onWriteError` wrapper now passed to
  `StaffLineEditor` and `StaffPromoControl` (`onError`), so a sticky write error cannot hide a later
  send outcome; `degraded` is not cleared (it is the poll's live state — precedence handles it).
- **`maybeRenewSession` gained a try/catch** (was error-checked only): staff callers run it AFTER
  their write committed, so a throw would have reported a landed dish or send as a failure.
- **`staff-cart.ts`** gained its `maybeRenewSession` import beside the one renewal line (the line
  needs it); nothing else in the file changed.
- **`STAFF_STATE_COPY` deleted** from `lib/line-state-copy.ts` (StaffLineEditor was its only consumer).
- The region's one-line reserve reuses the region's existing 16px min-height.
- Status-row glyphs: check (all sent), bag (to-go at pay), receipt (counter at pay) — the spec
  named only the check.
- A THROWN undo keeps the window open with the undo-failed line (the spec specified only a returned
  failure).

## 8. LEARNINGS candidates

- `@mms/ui` Button spreads `...rest` AFTER its own `aria-disabled`: passing `aria-disabled={x || undefined}`
  through erases the primitive's busy `aria-disabled` whenever `x` is false. Spread the attribute
  only when it is true.
- A hook that returns refs alongside state: a child that reads `ctl.controlRef` as `ref=` makes
  react-hooks/refs flag EVERY other `ctl.*` read in render. Hand the refs over as separate props.
- Counting a parent's data commits without touching its fetcher: track the state object's identity
  with a guarded set-during-render (`if (seen !== detail) { setSeen(detail); setSeq(n => n + 1) }`).
