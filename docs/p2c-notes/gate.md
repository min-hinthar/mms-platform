# Phase 2c · gate — integration notes

Branch `p2c/gate`, base `07e34d7` (the integrated wave-1 head: the order pad AND the register's cash
moment merged). Scope: send-kitchen commit B — the staff settle gate (owner decision 3, 2026-09-24:
"every settle door refuses while dine-in dishes are unsent; the refusal names the fix and jumps to
Send; on a running-bill close it first offers remove them if the guest has left") on all five doors:
staff cash (`settleCash`), the reader (`settleCard`), the running-bill close (`closeSecureTab`), the
diner's "Pay at the counter" (`requestCounterPay` + `Checkout`'s `PayAtCounterButton`) and the order
pad's Take payment. No migration, no SQL, no prod DDL.

## 1 · DESIGN-LANGUAGE draft

### §17 bullets

- **The settle gate is the counter half of "Everything sent" (§22's binding).** Every settle door —
  the cash sheet, the reader, the running-bill close, the order pad's Take payment and the diner's
  "Pay at the counter" — refuses while dine-in dishes are unsent, and each reads ONE binding: staff
  doors `staffSettleBlockedByUnsent(mode, units)`, which DELEGATES to `payBlockedByUnsent(mode, units,
true)` (the console can always send, so there is no hostless exemption at the register); the
  diner's counter ask keeps the Bill's own `payBlockedByUnsent` with its host flag. `units` is one
  count everywhere (`kitchenDraftUnitsFromRows` — `detail.send.sendable` on the page).
- **The server refuses UNDER the freeze, BEFORE the totals, as a typed code.** `{ code: "unsent",
units }` — a member of each door's refusal union, decided by where it happened. Order inside a
  settle: freeze → unsent → totals → the quote compare → the charge. A refusal releases the freeze
  its own attempt took (cash through its `finally`; the running-bill close and the reader
  explicitly, before any PaymentIntent exists). The unsent read fails OPEN: a blip falls back to the
  old settle-fires behaviour, never a stranded table.
- **A gated trigger stays rendered, with its amount.** It is dimmed by `aria-disabled` (a spread,
  so the primitive's own busy state is never erased) plus its handler's own guard — never native
  `disabled` — and its `aria-describedby` reads the page's note first. The note
  (`#settle-unsent-note`) is the settle section's LAST child, so its unmount after a Send moves no
  trigger; warn ink beside an aria-hidden alert glyph, the words carrying the meaning; never a live
  region.
- **A refused tap names the fix and goes there.** The page's ONE polite region says the sentence at
  the SETTLE rank, VISIBLY (writeError > settle line > degraded > send warn > send ok; within the
  settle rank the gate's line, else the reader's status), and focus lands on the fix: the Send for
  cash or the reader (scrolled to centre, `auto` under reduced motion, then focused with
  `preventScroll`), the order heading for a running-bill close — the guest may have left, so the
  sentence offers "remove them" beside "send them". The line retires on a send outcome, on any other
  setter, or on a LATER read that shows nothing unsent — never on a read already in the air when it
  was raised (`settleGateAfterCommit`, `sendNote`'s `raisedAt` rule); it names the live count once
  the page has read the drafts, the server's own count before that (`settleGateUnits`).
- **A raced server refusal** (a dish landed after the page's last read) renders the dictionary
  sentence with the SERVER's count, never the server's English: inside the cash sheet's one alert
  (the page's region is hidden behind the modal), the jump waiting for the sheet's close; beside the
  reader and running-bill triggers as plain shown text (the page's region says it — no second
  alert), giving way to the page's note once the page has read the drafts.
- **The pad's Take payment ranks the gate after the write holds:** `paying > note > waiting > unsent
  > empty` — while a write is still landing the count is stale and the write is the fix. A refused
  > tap says the reason once through the pad's one Toast, flips a phone to the order view (where the
  > unsent dishes are listed, right above the bar's Send) and focuses the pad's Send.
- **The diner's counter button keeps the Pay button's rule:** `disabled={payFrozen || sendBlocksPay}`
  on the Bill; the unsent note renders on the same Bill stage the button does, and a tap on the
  dimmed button repeats the reason in the Bill's status line.

## 2 · CHANGELOG

- **Phase 2c · gate — every settle door waits for the kitchen.** A dine-in table can no longer be
  paid while dishes are unsent: the cash sheet, the card reader, the running-bill close on the card
  on file, the order pad's Take payment and the diner's "Pay at the counter" all refuse, say how many
  dishes have not gone to the kitchen, and take staff to the fix — the Send, or the order's lines on
  a running bill ("remove them if the guest has left"). The server refuses under the settle freeze
  (a typed `unsent` code with the count, the freeze released, no PaymentIntent minted), so a dish
  nobody sent is never charged and then cooked for an empty table. Counter (pickup) orders and to-go
  drafts are unaffected.

## 3 · OPEN-ITEMS rows

Existing rows this branch changes:

- **The register notes' "Confirm FloorDetailLive's region precedence for the gate area" (low) —
  CLOSED.** The gate brief confirmed the reading (writeError > settle line > degraded > send warn >
  send ok; the gate's warn at the settle rank, rendered visibly), and it is built and pinned:
  `FloorDetailLive.test.tsx` "a blocked Cash tap … the ONE region says why — visibly", the two
  2a `FloorDetailLive.send.test.tsx` degraded-over-send cases unchanged and green, and the mutants
  `floor-detail/unsent-line-never-shown` / `…-line-outlives-the-send` / `…-line-never-retires`.
- **P2k-c is NOT filed** — commit B shipped (the spec files P2k-c only if the owner said no).
- **K35 unchanged at 11** — no native `disabled` added (every gated control is an `aria-disabled`
  spread plus a handler guard); `CashSettleButton` / `TerminalSettle` / `CloseSecureTabButton` stay
  at 0.

New rows:

| Sev | Item                                                                     | Why / where                                                                                                                                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| med | Kiosk dine-in handoffs will need a Send before cash once un-parked       | The kiosk (PARKED, A1) mints dine-in handoffs that carry a `host_seat`; under the settle gate the register's cash refuses them while their drafts are unsent. When the kiosk is un-parked, either the kiosk fires its round or the register's first step is the Send (spec risk, carried).                                                      |
| low | The pad's Take payment after a drained add lands on a gated table        | A tap while an add FLIES is accepted (the pad drains it); at a dine-in table the landed dish is a new unsent draft, but the pad decided before the drain and navigates to `?settle=1`, where the table page's note and dimmed triggers say it. Correct, one screen late; re-deciding after the drain needs a fresh detail read before the push. |
| low | A host table's diner drafts hold the register until staff send or remove | `staffSettleBlockedByUnsent` has no hostless/host exemption (the console can always send), so a diner's own unsent round at a host table blocks every staff settle; the fix is the Send (which fires the diner's round too — the mixed note says so) or removing the lines. Measure how often a cashier meets it on a real shift.               |
| low | A raced cash refusal is said twice                                       | A server `unsent` on the cash sheet is said by the sheet's alert (the page is behind the modal), then again by the page's region when the close jumps to the Send. The second is a new moment (after the cashier's own close), but a screen-reader cashier hears the sentence twice.                                                            |
| low | Measure the gate's note and dimmed triggers on a device                  | No browser here. Owed: 390/768/1024 · en/my · Light/Night screenshots of the settle section with the note (the Burmese running-bill sentence is the longest, ~2 lines at 390), the centred scroll to the Send from a cash tap on a phone, and the pad's refused Take payment flipping to the order view.                                        |
| low | The diner's counter refusal is English-only                              | `COUNTER_PAY_REFUSAL_COPY.unsent` follows its siblings (the diner's counter copy is English; the Bill's unsent note above it is bilingual). A Burmese twin belongs with the rest of that map in the diner dictionary.                                                                                                                           |

## 4 · Mutate-set / CLAUDE.md enumeration changes

Measured with the prescribed greps at this head (base `07e34d7`: lib 138 · api 3 · components 16 ·
packages/db 1 = 158 files, 988 mutants):

- **Files added to the mutate set (2, bucket `components`):** `apps/qr/components/staff/FloorDetailLive.tsx`
  and `apps/qr/components/staff/OrderPad.tsx`. **Buckets now:** lib **138** · app/api **3** ·
  components **18** · packages/db **1** = **160** files. CLAUDE.md's component list gains
  `staff/FloorDetailLive.tsx` and `staff/OrderPad.tsx (Phase 2c · gate)` (and the register's
  `staff/TerminalSettle.tsx`, if integration has not added it yet) — EIGHTEEN components.
- **Mutants: 988 → 1028 (+40)**, all in the one `// ── Phase 2c · gate ──` block at the end of
  MUTANTS; every id contains `unsent`, so `pnpm verify:slice --no-gate --only=unsent` runs the block
  (and six older `unsent` mutants beside it). Ids:
  `checkout-stage/staff-gate-exempts-a-hostless-unsent-table`, `settle/cash-over-unsent`,
  `settle/tab-close-over-unsent`, `settle/unsent-refusal-strands-freeze`, `terminal/card-over-unsent`,
  `terminal/card-unsent-strands-freeze`, `counter-pay-state/unsent-ask-allowed`,
  `counter-pay/unsent-not-read`, `counter-pay/unsent-gates-a-hostless-table`,
  `staff-send-view/unsent-tab-close-never-offers-remove`,
  `staff-send-view/unsent-line-retired-by-an-older-read`,
  `staff-send-view/unsent-line-counts-a-stale-reading`, `pad/unsent-take-payment-live`,
  `pad/unsent-outranks-waiting`, `pad/unsent-reason-uncounted`,
  `cashsettle/unsent-trigger-opens-the-sheet`, `cashsettle/unsent-trigger-looks-live`,
  `cashsettle/unsent-trigger-always-dimmed`, `cashsettle/unsent-said-in-english`,
  `cashsettle/unsent-refusal-never-jumps`, `terminal-ui/unsent-tap-starts-the-reader`,
  `terminal-ui/unsent-trigger-looks-live`, `terminal-ui/unsent-said-in-english`,
  `terminal-ui/unsent-refusal-never-jumps`, `secure-close/unsent-tap-opens-the-confirm`,
  `secure-close/unsent-trigger-looks-live`, `secure-close/unsent-said-in-english`,
  `secure-close/unsent-refusal-never-jumps`, `secure-close/unsent-close-steals-focus-back`,
  `floor-detail/unsent-gate-not-passed`, `floor-detail/unsent-tab-close-jumps-to-send`,
  `floor-detail/unsent-line-never-shown`, `floor-detail/unsent-note-dropped`,
  `floor-detail/unsent-jump-leaves-focus`, `floor-detail/unsent-line-outlives-the-send`,
  `floor-detail/unsent-line-never-retires`, `pad-ui/unsent-tap-leaves-focus`,
  `pad-ui/unsent-tap-stays-on-the-menu`, `checkout/unsent-counter-door-open`,
  `checkout/unsent-counter-tap-silent`.
- **Re-anchored (meaning kept):** `p2c-register/cas-refusal-outside-the-freeze` — it found the
  register's seam comment ("The settle gate's unsent-dishes check sits HERE"), which is now the
  gate's own check; it anchors on the check's first comment line inside the same `try`, and still
  hoists the moved compare above the `try` (the refusal then skips the freeze's `finally`).
- **verify:slice at this head** — see the self-audit (`--only=unsent`: 46 caught, no orphans; the
  register and pad prefixes re-run on the touched files).

## 5 · Owner-visible behaviour changes

- **Table page, dishes not sent yet:** "Take cash", "Card on the reader" and the card-on-file close
  stay on screen with their amounts but are dimmed, and under them a warn line says e.g. "2 dishes
  haven’t gone to the kitchen — send them first, then take payment." (on a running bill with a card
  on file: "— send them, or remove them if the guest has left."). Tapping a dimmed button opens
  nothing: the order card's status line says the same sentence and the Send is focused (scrolled
  into the middle of the screen) — or, for the card-on-file close, the order's heading, where the
  dishes can be removed.
- **If a guest adds a dish while the cash sheet is open,** "Take $x" is refused with that sentence
  inside the sheet; closing the sheet goes straight to the Send.
- **The card reader and the card-on-file close** refuse the same way (nothing is charged, nothing is
  frozen afterwards).
- **Order pad:** at a table with unsent dishes, Take payment is dimmed with the same sentence;
  tapping it says so and puts the finger on Send to kitchen (on a phone it shows the order first).
- **Diner Bill:** "Pay at the counter" is dimmed while the table still has dishes to send (the note
  above already says "Send them to the kitchen, then pay the bill."); tapping it says "Send
  everything to the kitchen first — then pay at the counter." The server refuses the ask the same
  way. Tables with no host (nobody at the table can send) are never held.
- Counter (walk-up / phone) orders and to-go dishes are unaffected — they cook when they are paid.

## 6 · K15 strings

Every MY value is a Claude-authored draft pending Min's native check; the words are grounded as
noted. All four are K15-HIGH (in `STAFF_K15_HIGH`) and form two plural pairs in
`STAFF_PLURAL_PAIRS` (each pair shares its MY value).

| Key                                 | EN                                                                                        | MY                                                                                                      | HIGH |
| ----------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---- |
| `table.send.settleBlocked.one`      | {n} dish hasn’t gone to the kitchen — send it first, then take payment.                   | မီးဖိုချောင်ကို မပို့ရသေးတဲ့ ဟင်း {n} ခု ရှိပါတယ် — အရင်ပို့ပြီးမှ ငွေရှင်းပါ။                          | HIGH |
| `table.send.settleBlocked.many`     | {n} dishes haven’t gone to the kitchen — send them first, then take payment.              | (same as `.one`)                                                                                        | HIGH |
| `table.send.settleBlocked.tab.one`  | {n} dish hasn’t gone to the kitchen — send it, or remove it if the guest has left.        | မီးဖိုချောင်ကို မပို့ရသေးတဲ့ ဟင်း {n} ခု ရှိပါတယ် — ပို့ပါ၊ ဒါမှမဟုတ် ဧည့်သည် ပြန်သွားပြီဆိုရင် ဖျက်ပါ။ | HIGH |
| `table.send.settleBlocked.tab.many` | {n} dishes haven’t gone to the kitchen — send them, or remove them if the guest has left. | (same as `.tab.one`)                                                                                    | HIGH |

Grounded: မပို့ရသေး (`table.line.notSent`), ငွေရှင်း (`table.detail.settle.title` — "Take payment"),
ဖျက် (`table.line.a11y.remove` — "Remove", itself grounded on `table.loss.title.void`), ဟင်း · ခု (the
pad's dish and count words). No key retired. No pad-only key: the pad's `unsent` reason renders the
table page's own sentence (one fact, one sentence).

## 7 · Deviations from spec

1. **Plain words over the spec's copy.** "Take payment", "Running bill", "send"; the spec's
   "…before you settle" / "…close the tab" sentences are rewritten to the scope's own ("— send them
   first, then take payment." / "— send them, or remove them if the guest has left."), and
   `UNSENT_SETTLE_REFUSAL` (server English, older bundles only) says "Some dishes haven’t gone to the
   kitchen — send them first (or remove them if the guest has left), then take payment."
2. **The refusal carries `units`** (the register notes' §8 shape), and every client renders the
   dictionary sentence with THAT count; the spec's refusal had no count.
3. **Register's conversions stand** (the spec's "NO K35 conversions" line is void): the three
   triggers are `@mms/ui` Buttons, blocked = an `aria-disabled` spread plus the handler guard.
4. **The region line's lifetime is pure** (`settleGateAfterCommit`, `settleGateUnits`,
   `settleBlockedMsg` in lib/staff-send-view) so its rules are mutated as values; the spec only said
   "onBlockedTap sets sendNote(warn)". The gate's line is its own state at the settle rank (the
   register's built precedence), not a `sendNote` — a send line ranks BELOW degraded, the gate's
   above it.
5. **A raced refusal on the reader / running-bill close is plain shown text, not an alert** — the
   page's region says it (one announcement), and the line gives way to the page's note once the page
   has read the drafts. The cash sheet keeps its one alert (the modal hides the page's region), and
   its jump runs on the sheet's close (`onCloseAutoFocus`), as the spec says.
6. **The pad reuses the table page's sentence** (`table.send.settleBlocked.*` via `settleBlockedMsg`)
   — no `pad.reason.unsent` key; always the table variant (the pad's fix is its Send).
7. **`PayAtCounterButton` gained `onRefusedTap`** (beyond the spec's `disabled` change): a tap on the
   dimmed counter button repeats `COUNTER_PAY_REFUSAL_COPY.unsent` in the Bill's status line, as the
   Pay button's own blocked tap does — a refused tap is never silent.
8. **`requestCounterPay` keeps its count query as its own statement** (a promise passed into the
   `Promise.all` with the host read and the unsent read), so the `counter/ask-counts-voided-lines`
   anchor stays byte-identical.
9. **One ordering mutant was not built:** "the unsent read hoisted above the freeze" needs two
   regions changed (delete inside, insert above), and a verify-slice mutant is one find/replace. The
   order is pinned by `lib/settle-unsent.test.ts` asserting the call SEQUENCE
   (`acquire → unsent-read → release`), and `p2c-register/cas-refusal-outside-the-freeze` was
   re-anchored onto the gate's new first line inside the try (meaning kept).
10. **Fixtures moved because the gate changed what "ready to pay" means.** `FloorDetailLive.test`'s
    `SETTLEABLE` (the register's) held two unsent dine-in drafts; it is now fully sent, and the one
    case that needs a Send on screen builds its table from `DETAIL`'s drafts. Four `OrderPad.test`
    cases about Take payment's own life (drain, busy words, the late note) now run on a table whose
    only dish is a to-go draft (`payable()`), since `ONE()`'s dine-in draft is gated.
11. **FloorDetailLive and OrderPad joined the mutate set** (the register left FloorDetailLive out
    while two areas edited it in wave 1; in wave 2 only the gate does).

## 9 · LEARNINGS candidates

- **A manual red-check is `commit → mutate → git checkout -- <file>`, never `edit → mutate →
checkout`.** The checkout restores the COMMITTED file, so an uncommitted addition to the same file
  goes with the mutation (it happened here to the new `staffSettleBlockedByUnsent`; it was rewritten
  from the transcript).
- **Never `import()` a script to syntax-check it.** `verify-slice.mjs` has no main guard — importing
  it RUNS it (the full gate and every mutant). `node --check <file>` parses without running.
- **A new gate turns "ready" fixtures into "blocked" ones.** The register's `SETTLEABLE` table held
  unsent drafts because nothing before the gate cared; five suites went red for a fixture reason, not
  a code one. When a gate lands, grep the fixtures NAMED for the state it gates.
- **A child's focus-restore effect runs AFTER the parent's synchronous jump.** `CloseSecureTabButton`
  restores focus to its trigger in a `[confirming]` effect; the page's jump (called in the same async
  continuation as `setConfirming(false)`) moved focus first and the effect pulled it back a frame
  later. A ref set BEFORE the close (`jumpOwnsFocus`) hands the restore over; the mutant
  `secure-close/unsent-close-steals-focus-back` pins it.
