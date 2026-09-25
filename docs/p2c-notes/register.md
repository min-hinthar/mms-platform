# Phase 2c · register — integration notes

Branch `p2c/register` off `1768979`. Scope: the register spec's SETTLE HALF (changes 1–10, 15–17, the
order-pad table-page change 11) plus the two stretch rows P2aa and P2w. No migration, no prod DDL.

## 1 · DESIGN-LANGUAGE draft

### §29 · The register's cash moment (Phase 2c)

- **Quick cash is Exact plus three round-ups** (`quickCashTenders`, lib/register-math): the next
  multiple of each house note ABOVE what is due — $13.47 → $14 · $15 · $20; a whole-dollar total never
  offers +$1; the row re-derives from what is DUE (total + tip), so a tip change can unlight a chip,
  and then the readout says Short. Chips are `.staff-chip .staff-chip-cash` (64px, a tile), lit by
  VALUE through the console's one lit-cap rule; `.staff-chip-cash` declares no fill of its own.
- **The tender is optional, never recorded, and blocks only when short.** Empty or 0 says nothing.
  The readout is a receipt row (dotted leader, height reserved): Change $x · Exact — no change ·
  Short $x (warn, bold, plus one line telling the cashier what to do — never a shake).
- **Keep the change is a FILL, not a commit.** One tap writes the change into the tip field; the new
  tip shows in the field and in Settle's label before anything is recorded, and focus moves to Settle
  (the action unmounted under the tap). Its `{m}` is the change being kept — the readout's figure.
- **One binding gates the money action** (`cashSettleBlocked`): Settle's `aria-disabled`, its
  `aria-describedby` (the cap line, or the short row + its hint, else the readout) and its handler
  all read it. The handler refuses on its own; the attribute is the announcement.
- **The figure recorded is the figure the cashier read, or a refusal naming both.** The sheet sends
  the quoted pre-tip total as `quotedCents` (COMPARE-ONLY); the server compares it inside the held
  freeze and refuses a moved total with `code: "moved"` and its own figure, releasing the freeze. The
  sheet then quotes the server's figure — not optimistic, it is what the server just derived — only
  while the prop still reads what it read at the refusal, and the re-tap is compared again. The
  card-on-file close's "Charge $x" confirm does the same (P2aa).
- **A lost response is an unknown outcome.** A rejected settle may have landed: the sheet says so
  (`settle.cash.unknown`) and re-reads the page's detail, never "that change wasn't saved".
- **One primary per settle section** (`settlePrimary`): the card on file on a secure running bill,
  cash otherwise; the reader after cash, secondary. The section's heading ("Take payment") is where the
  order pad's `?settle=1` lands focus.
- **The paid card's NAME carries its facts.** `HandoffCard` is a focused region, never
  `role="status"`: `aria-labelledby` = the title, the change row (or still-to-collect, or the total
  when no tender) and the #CODE, so focus speaks "Paid, Change $7.90, #A1B2C3" once. Change at
  `--fs-h1` display heavy; counter cards add #CODE, the call-out and "Back to the counter" (a primary
  xl link that promises only the navigation it does). A table gets the rows-only card when a tender
  was entered, and it leaves when the next round's cart opens (`handoffStillCurrent`).
- **"Change" is အကြွေ everywhere.** ပြန်အမ်း is the console's refund verb.

### §17 bullets

- **ONE polite region on the table page** (P2r closed): the order card's. The reader panel SHOWS its
  status and SAYS it through that region (`onStatus`); the paid card is focused and named, not live.
  Precedence, written at the region: writeError > settle line (the reader's status while its panel is
  live — sr-only there, the panel shows it; the settle gate's blocked warn takes this rank) > degraded
  > send warn > send ok. A frozen line outranked in what is SAID stays SHOWN (aria-hidden).
- **Settle actions are `@mms/ui` Buttons** (cash trigger/Cancel/Settle, the reader trigger/Cancel/Back,
  the card-on-file trigger/Cancel/Charge). A refused control carries `aria-disabled` as a SPREAD plus
  its own handler guard — not the primitive's `disabled` prop, so the handler is what refuses (and
  K35's native-only measure stays honest); busy is the primitive's `aria-busy` + spinner at full ink.
- A settle that lands re-reads the PAGE's own detail (`onChanged`), never `router.refresh()` — the
  detail lives in `FloorDetailLive`'s state, not the RSC payload.

## 2 · CHANGELOG

- **Phase 2c · register — the cash moment.** Quick cash (Exact + three round-ups), an optional tender
  with a Change / Exact / Short readout on every cash settle, "Keep the change as tip" as a fill, the
  compare-and-swap that refuses a moved total and shows both figures (cash and the card-on-file
  close), a focused paid card named by its facts (rows-only for tables when a tender was entered),
  one primary per settle section, `?settle=1` landing on the settle section, the page's ONE polite
  region (P2r), honest unknown-outcome copy on a lost cash settle (P2ab), and a mid-payment refusal
  that names who holds the money (P2w).

## 3 · OPEN-ITEMS rows

Closed / changed by this branch:

| Sev | Item                         | Why / where                                                                                                                                                                                                                                                                                                  |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| —   | **P2r closed**               | The table page ends with exactly ONE polite region: `HandoffCard` is not `role="status"` (`HandoffCard.test` "never a status region"), `TerminalCollectPanel`'s line has no role and hands its status to the page (`TerminalSettle.test`, `FloorDetailLive.test` "exactly ONE polite region").               |
| —   | **P2ab closed**              | `CashSettleButton`'s catch now says `settle.cash.unknown` and re-reads the detail (`CashSettleButton.test` P2ab case; mutant `p2c-register/cash-lost-response-reads-as-refusal`).                                                                                                                            |
| —   | **P2ao closed**              | The docblock says the tip IS recorded; `settle.cash.hint` no longer says "handled separately"; `settleCash`'s docblock no longer says off-system.                                                                                                                                                            |
| —   | **P2aa closed**              | `closeSecureTab` compares `quotedCents` before any PaymentIntent and releases its freeze on `moved` (`lib/secure-close-cas.test.ts`; mutants `p2c-register/tab-close-*`).                                                                                                                                    |
| —   | **P2w closed (server half)** | `lib/inflight-refusal` + `lib/inflight-read`: settleCash / closeSecureTab / settleCard name the register's own held freeze as the register's (`secure-close-cas.test` P2w case). The detail banner half is a new row below.                                                                                  |
| —   | **K35 re-measured 15 → 11**  | Native-only command at `1768979`: 15 in 10 components (the row said 14 in 9 — KdsLineMenu's 1 landed in 2b). Now 11 in 8: ClearTable 2 · MergeTable 3 · FloorDetailLive 1 · KdsLineMenu 1 · ManagerPinStepUp 1 · OpenTab 1 · SettledToday 1 · StaffLineEditor 1. CloseSecureTab 2 → 0, TerminalSettle 2 → 0. |
| —   | **S12 update**               | The paid card S12 wires the durable-receipt QR into now exists (`HandoffCard`, a focused region with a counter-only column for #CODE); the QR tile is the next slice.                                                                                                                                        |

New rows:

| Sev | Item                                                                               | Why / where                                                                                                                                                                                                                                                                                                                                                        |
| --- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| med | The detail's "paying on their phone" banner is false during a register-held freeze | `FloorDetailLive` renders `table.detail.payingPhone.*` from `detail.paymentInFlight` alone, so after an unknown-outcome card-on-file close (or a reader collect on another tablet) it tells staff a guest is paying on their phone. P2w's server half is fixed; `getTableDetail` should carry `inFlightHolder` (lib/inflight-refusal) and the banner branch on it. |
| low | Measure the cash sheet and the paid card on a device                               | No device/preview here. Four `--fs-h3` tiles in one row at 390 (≈81px each, estimated from the 440px sheet), the Burmese "အတိအကျ" + amount in the Exact tile, the paid card's two columns from 40em, Light and Night — before the PR.                                                                                                                              |
| low | `settle.card.unknown`'s "If it doesn't, try again"                                 | A retry inside the freeze's lifetime is refused (now truthfully, P2w, naming the wait). The sentence could name the wait too — a K15-HIGH copy change, so it waits on the owner's native check.                                                                                                                                                                    |
| low | The reader's decline sentences are still English                                   | `TerminalCollectPanel`'s status is bilingual now (six keys) except `failCopy`, the server's `declineCopy` sentence per decline reason; it needs a twin per reason (a dictionary question).                                                                                                                                                                         |
| low | Migrate the drill-down's remaining controls onto `@mms/ui` Button                  | Clear table, Merge, promo Remove, OpenTabButton still hand-style `.staff-btn` actions (spec out_of_scope); K35's remaining 11 live there.                                                                                                                                                                                                                          |

## 4 · Mutate-set / CLAUDE.md enumeration changes

Measured with the prescribed greps at this head:

- **Files added to the mutate set (3):** `apps/qr/components/staff/TerminalSettle.tsx` (component),
  `apps/qr/lib/inflight-refusal.ts` (lib), `apps/qr/lib/inflight-read.ts` (lib).
- **Buckets:** lib **134** · app/api **3** · components **16** · packages/db **1** = **154** files
  (was 132 + 3 + 15 + 1 = 151). CLAUDE.md's list becomes SIXTEEN components — add
  `staff/TerminalSettle.tsx (Phase 2c)`.
- **Mutants:** 885 → **918** (33 added, all in the one `// ── Phase 2c · register ──` block at the
  end of MUTANTS). Every one KILLED at the branch head: `verify:slice --no-gate --only=p2c-register`
  → 33 caught, no orphans (`--only=p2a-register` → 9, `--only=staff-promo-ui` → 6 — the touched
  files' earlier mutants, re-run).
- **Mutants added (ids):** `p2c-register/ladder-ceil-offers-exact-twice`,
  `…/ladder-no-dedupe`, `…/ladder-offers-whole-dollar-plus-one`, `…/ladder-unsorted`,
  `…/tender-arms-swapped`, `…/tender-zero-reads-short`, `…/settle-blocked-ignores-short`,
  `…/settle-blocked-ignores-the-tip-cap`, `…/keep-change-offered-when-exact`,
  `…/handoff-change-on-a-short-tender`, `…/cas-compare-deleted`, `…/cas-low-quote-passes`,
  `…/cas-compares-all-in-total`, `…/cas-refusal-outside-the-freeze`,
  `…/cash-settle-ignores-the-binding`, `…/cash-settle-handler-ignores-the-binding`,
  `…/cash-quote-dropped`, `…/cash-tip-chip-lit-by-string`, `…/cash-moved-figure-never-adopted`,
  `…/cash-lost-response-reads-as-refusal`, `…/table-tender-hands-no-card`,
  `…/secure-close-no-page-reread`, `…/reader-status-never-said`, `…/reader-never-goes-blind`,
  `…/reader-landed-no-page-reread`, `…/tab-close-cas-deleted`, `…/tab-close-moved-strands-freeze`,
  `…/tab-close-quote-dropped`, `…/inflight-register-read-as-unsure`, `…/inflight-seat-not-phone`,
  `…/inflight-lock-ignored`, `…/inflight-owner-read-as-seat`, `…/tab-close-refusal-blames-the-phone`.
- **Mutants re-anchored (meaning kept):** `p2a-register/cash-tip-overlong-reads-as-zero` (the flag
  is now `tipOverlong`, read by `cashSettleBlocked`), `p2a-register/secure-close-rejection-escapes`
  (the call now carries `quotedCents`). No other anchor moved (`check:mutant-anchors` clean, 918).

## 5 · Owner-visible behaviour changes

- The cash sheet (tables AND counter): four big quick-cash tiles (Exact + three round-ups), an
  optional "Cash received" field, a Change / Exact / Short line, and "Keep the change as tip · $x".
  Settle is dimmed (with the reason read out) when the cash received is short or the tip is over the
  cap.
- If the order changed since the cashier opened the sheet, the tap is refused: "The total changed from
  $42.10 to $42.65 — check the order, then take payment again." Nothing is recorded; the next tap uses
  the new figure. Same on the card-on-file "Charge" confirm.
- A dropped connection during a cash settle says "we don't know if this payment was recorded" and
  re-checks the table, instead of "that change wasn't saved".
- After paying: a "✓ Paid" card with Total · Tip · Cash received · Change (big), plus #CODE and "Back
  to the counter" on counter orders. Tables see it only when a cash amount was entered; it goes away
  when the table starts a new round.
- The settle section has a small "Take payment" heading; exactly one filled button (card on file on a
  secure running bill, otherwise cash); the card reader sits below cash as an outlined button. The
  promo "Apply" is outlined too.
- The card-reader panel's status is in Burmese as well as English now.
- A settle refused because a payment is already going on says who holds it: a guest's phone, or "A
  payment started at the register on this table hasn't finished … if it hasn't settled within 10
  minutes, try again."

## 6 · K15 strings

Every MY value below is a Claude-authored K15 draft pending Min's native check unless marked
grounded.

| Key                                  | EN                                                                                                                                                      | MY                                                                                                                                   | HIGH |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| `table.detail.settle.title`          | Take payment                                                                                                                                            | ငွေရှင်း (grounded: the retired `table.detail.a11y.settle`)                                                                          | —    |
| `settle.cash.exact`                  | Exact                                                                                                                                                   | အတိအကျ                                                                                                                               | —    |
| `settle.a11y.cashQuick`              | Quick cash amounts                                                                                                                                      | ငွေသား အမြန်ရွေး                                                                                                                     | —    |
| `settle.cash.changeLabel`            | Change                                                                                                                                                  | အကြွေ                                                                                                                                | HIGH |
| `settle.cash.shortLabel`             | Short                                                                                                                                                   | လိုငွေ                                                                                                                               | HIGH |
| `settle.cash.shortHint`              | Collect the rest, or correct the amount.                                                                                                                | ကျန်ငွေ ထပ်ယူပါ၊ ဒါမှမဟုတ် ပမာဏ ပြင်ပါ။                                                                                              | —    |
| `settle.cash.exactNone`              | Exact — no change                                                                                                                                       | အတိအကျ — အကြွေ မပြန်ရပါ                                                                                                              | HIGH |
| `settle.cash.keepChange`             | Keep the change as tip · {m}                                                                                                                            | အကြွေကို အပိုကြေး ထား · {m}                                                                                                          | HIGH |
| `settle.cash.moved`                  | The total changed from {old} to {m} — check the order, then take payment again.                                                                         | စုစုပေါင်း {old} ကနေ {m} ပြောင်းသွားပါတယ် — အော်ဒါ စစ်ပြီးမှ ပြန်ရှင်းပါ။                                                            | HIGH |
| `settle.cash.unknown`                | The connection dropped, so we don’t know if this payment was recorded. If the order shows paid in a moment, it went through — if it doesn’t, try again. | ချိတ်ဆက်မှု ပြတ်သွားလို့ ဒီငွေရှင်းတာ မှတ်ပြီးပြီလား မသိရပါ။ ခဏနေ အော်ဒါက ငွေရှင်းပြီး လို့ ပြရင် ရှင်းပြီးပါပြီ — မပြရင် ထပ်စမ်းပါ။ | HIGH |
| `table.detail.handoff.title`         | Paid                                                                                                                                                    | ငွေရှင်းပြီး (grounded: `settle.reader.paid`)                                                                                        | —    |
| `table.detail.handoff.tendered`      | Cash received                                                                                                                                           | လက်ခံရရှိငွေ (grounded: `settle.cash.tenderedLabel`)                                                                                 | —    |
| `table.detail.handoff.collect`       | Still to collect                                                                                                                                        | ထပ်ယူရန် ကျန်                                                                                                                        | HIGH |
| `table.detail.handoff.done`          | Back to the counter                                                                                                                                     | ကောင်တာကို ပြန်သွား                                                                                                                  | —    |
| `settle.reader.status.waiting`       | Waiting for the guest to tap or insert their card…                                                                                                      | ဧည့်သည် ကတ်ကို ကပ်တာ ဒါမှမဟုတ် ထည့်တာကို စောင့်နေပါတယ်…                                                                              | —    |
| `settle.reader.status.blind`         | Can’t reach the card processor right now — the reader may still be live. Hold on, or cancel.                                                            | ကတ်ငွေပေးချေမှုစနစ်ကို အခု ချိတ်မရပါ — ကတ်စက်က အလုပ်လုပ်နေတုန်း ဖြစ်နိုင်ပါတယ်။ ခဏစောင့်ပါ၊ ဒါမှမဟုတ် ဖျက်ပါ။                        | HIGH |
| `settle.reader.status.recording`     | Recording the order…                                                                                                                                    | အော်ဒါ မှတ်နေပါတယ်…                                                                                                                  | —    |
| `settle.reader.status.recordingLong` | The charge went through, but the order isn’t recorded yet. Don’t charge again — note the amount and check Orders in a minute.                           | ငွေဖြတ်ပြီးပါပြီ၊ ဒါပေမဲ့ အော်ဒါ မမှတ်ရသေးပါ။ ထပ်မဖြတ်ပါနဲ့ — ပမာဏကို မှတ်ထားပြီး တစ်မိနစ်အတွင်း အော်ဒါများ ကို စစ်ပါ။               | HIGH |
| `settle.reader.status.failed`        | The payment didn’t go through.                                                                                                                          | ငွေရှင်းလို့ မရပါ။ (grounded: `settle.reader.failedTitle`)                                                                           | —    |
| `settle.reader.status.canceled`      | Nothing was charged.                                                                                                                                    | ဘာငွေမှ မဖြတ်ခဲ့ပါ။                                                                                                                  | HIGH |

Changed: `settle.cash.hint` → "Includes sales tax. Add a cash tip in the next step." / "ရောင်းခွန်
ပါဝင်ပါတယ်။ ငွေသား အပိုကြေးကို နောက်တစ်ဆင့်မှာ ထည့်ပါ။" (K15 draft).

Retired with their last reader: `settle.cash.change` (also out of `STAFF_K15_HIGH`),
`settle.cash.notEnough`, `table.detail.handoff.paid`, `table.detail.handoff.change`,
`table.detail.a11y.paid`, `table.detail.a11y.settle`.

## 7 · Deviations from spec

1. **Region precedence.** Built `writeError > settle line > degraded > send warn > send ok`, not the
   plan's `writeError > send/settle-blocked warn > degraded > send ok` read literally. 2a's blind
   review deliberately ranked degraded above EVERY send line (`2b63b65`, pinned by two cases in
   `FloorDetailLive.send.test.tsx`: a "Couldn't send" standing through an outage hid the paper
   escalation, S9); the plan's order predates that fix. The settle rank (the reader's status now, the
   gate's blocked warn next) sits above degraded, which is the "settle-blocked warn > degraded" half.
   A degraded line outranked there stays visible (aria-hidden).
2. **Plain words over spec copy.** 2b's vocabulary is kept: "Take $x" / "Taking payment…" (spec:
   "Settle $x" / "Settling…"); the moved sentence ends "then take payment again". The plain-words
   guard now also bans `settle` and `tab` in visible English.
3. **Row keys reused, not added.** The paid card reuses `floor.settled.row.total` / `.tip` and
   `settle.cash.changeLabel`; "Tendered" is "Cash received" (2b's word for the same field) —
   `table.detail.handoff.tip` was not added.
4. **Keep the change's `{m}`** is the change being kept (the readout's figure), not the resulting
   tip; identical when the tip field was empty (the spec's example).
5. **`settle.cash.exactNone` is K15-HIGH** (the spec did not mark it): it tells the cashier to hand
   nothing back.
6. **The reader's status became six dictionary keys** (bilingual for the first time — the panel's own
   comment left that to the owner of this region change). Two English wordings changed with it:
   "Can't reach Stripe" → "Can't reach the card processor", "Don't re-charge" → "Don't charge again".
7. **The settle section gained a visible "Take payment" heading** (the `?settle=1` focus target, which
   the task names as "the settle section heading"); it replaces the section's aria-only name.
   Focus lands WITHOUT preventScroll: landing on it is the jump the link promised.
8. **`cashSettleBlocked(tipCents: number | null, …)`** — `null` is an unreadable tip that holds
   digits, so the overlong-tip rule lives inside the one binding (the component's `100000` literal
   is gone).
9. **Button refusals are an aria-disabled spread + handler guard**, not the primitive's `disabled`
   prop (K35's measure counts `disabled=` literally, and the primitive's guard hid the handler's).
10. **`Handoff` lives in `lib/register-ui.ts`**, not the component, so 2d's stash parser can import
    the shape without a component.
11. **CAS tests are new files** (`lib/settle-cash-cas.test.ts`, `lib/secure-close-cas.test.ts`)
    rather than `lib/staff-cart.test.ts`, whose totals mock is null.
12. **Tender tiles have `--r-sm` corners** (a 64px pill at a quarter of the sheet reads as an oval).
13. **The CSS block is appended at the end of `globals.css`** (the shared-file rule), not beside
    `.staff-chip`.
14. **`TerminalCollectPanel.onDone` hands up `{ orderId, totalCents } | null`**; the page maps it into
    the canonical card (tip and tender null, `isCounter` true).
15. **P2w** was built as a holder decision (phone / register / unsure) from the cart row plus one read
    of the freeze owner against the session's seats — `paymentInFlightReason` itself is unchanged.

## 8 · Seams for the gate area

- **Server — `apps/qr/lib/staff-cart.ts` `settleCash`:** the one-line comment "(The settle gate's
  unsent-dishes check sits HERE — after the freeze, before the totals.)" is the spot, inside the `try`
  whose `finally` releases the freeze. Add the arm to `SettleCashRefusal` (same file):
  `| { ok: false; error: string; code: "unsent"; units: number }`.
- **Server — `closeSecureTab`** (same file): after `acquireSettlementSuperseding` and before
  `getCartTotals`; this path has NO blanket `finally`, so the refusal must
  `await releaseSettlementFor(cart.id, attempt)` itself (the `moved` arm shows the shape).
  `lib/terminal.ts` `settleCard` has the same shape after its acquire.
- **Client — `CashSettleButton`:** add optional `blocked?: boolean` + `onBlockedTap?: () => void`;
  spread `{...(blocked ? { "aria-disabled": true } : {})}` on the trigger `Button` and refuse first
  in its `onClick` (`if (blocked) { onBlockedTap?.(); return; }`). A server `unsent` answer is one more
  arm beside `res.code === "moved"` in `confirm()`.
- **Client — `CloseSecureTabButton`:** the same two props on the trigger; `res.code === "unsent"`
  beside `moved` in `confirm()`. **`TerminalSettleButton`:** the same two props; refuse at the top
  of `start()` beside the `inFlight` ref guard.
- **Page — `FloorDetailLive`:** the region's settle arm is `readerStatus ? … : degraded` — add the
  gate's visible warn at that rank (e.g. `settleNote ?? readerStatus`, rendered visibly, not
  sr-only). `settleBlockedTarget` (lib/staff-send-view, 2a) says where the tap jumps.

## 9 · LEARNINGS candidates

- **React 19 entangles pending async transitions GLOBALLY.** A `useTransition` action left pending by
  one jsdom case (a bare `new Promise(() => {})`) keeps every later case's `pending` true, across
  roots — the moved-total case read "Taking payment…" only when it ran after one. Settle hanging
  actions in `afterEach` (`CashSettleButton.test`'s `hang()`).
- **K35's native-only grep counts a `Button`'s `disabled` PROP.** Prefer the aria-disabled spread +
  a handler guard: the measure stays honest and the handler's refusal becomes observable (and
  mutable) instead of hidden behind the primitive's guard.
- **A mutant find is a SUBSTRING.** `"    onChanged?.();\n"` matched an 8-space occurrence too
  (AMBIGUOUS); anchor with trailing context. And a docblock inserted INSIDE a multi-line find's span
  (`…}\n}\n\nexport type X`) turns it STALE — put the note elsewhere, or re-anchor.
