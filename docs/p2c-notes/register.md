# Phase 2c · register — integration notes

Branch `p2c/register` off `1768979`. Scope: the register spec's SETTLE HALF (changes 1–10, 15–17, the
order-pad table-page change 11) plus the two stretch rows P2aa and P2w, then one round of fixes for an
independent critic's eleven findings (ten fixed, one escalated — see "Critic findings"). No migration,
no prod DDL.

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
  tip shows in the field and in Take's label before anything is recorded, and focus moves to Take
  (the action unmounted under the tap). With the tip field empty its `{m}` is the change (which IS
  the new tip); with a tip already typed it reads "Keep the change — make the tip {m}" and `{m}` is
  the tip the tap makes — never a figure that differs from what lands in the field.
- **One binding gates the money action** (`cashSettleBlocked`): Take's `aria-disabled`, its
  `aria-describedby` (the cap line, or the short row + its hint, else the readout) and its handler
  all read it. The handler refuses on its own; the attribute is the announcement.
- **The quote FREEZES when a confirm opens** (`SettleQuote`: `openQuote` / `reconcileQuote` /
  `quoteDrift`). Every figure in the cash sheet and the card-on-file confirm derives from the frozen
  quote, never from the live prop the page re-reads ~0.4s after any change. A total that moves while
  the confirm is open is SAID in its one alert with both figures ("The total changed from $42.10 to
  $46.10 …") and never swapped in silence; the next tap ADOPTS the new figure (records nothing, the
  sentence stays), and only the tap after that takes payment.
- **The figure recorded is the figure the cashier read, or a refusal naming both.** The confirm sends
  its quote as `quotedCents` (COMPARE-ONLY); the server compares it inside the held freeze and refuses
  a moved total with `code: "moved"` and its own figure, releasing the freeze. The confirm then quotes
  the server's figure until the page catches up (the quote's `basis`), and the re-tap is compared
  again. The card-on-file close's "Charge $x" confirm does the same (P2aa).
- **The actions ride a band pinned to the sheet's bottom** (`.reg-settle-actions`, the `.item-cta-bar`
  pattern): the one alert sits right above Take/Cancel, the band owns the home-bar inset, and the
  Sheet's keyboard lift puts it on top of the decimal pad.
- **A lost response is an unknown outcome.** A rejected settle may have landed: the sheet says so
  (`settle.cash.unknown`) and re-reads the page's detail, never "that change wasn't saved". On a
  COUNTER order the page holds its closed-bounce while the outcome is unknown (a landed counter settle
  closes the session behind it) and, on `closed`, says it "most likely went through" where the settle
  was, focused, with the way back to the counter.
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
  status and SAYS it through that region (`onStatus`); the paid card and the closed-after-unknown
  notice are focused and named, not live. Precedence, written at the region: writeError > settle line
  (the reader's status while its panel is live — sr-only there, the panel shows it; the settle gate's
  blocked warn takes this rank) > degraded > send warn > send ok. A line outranked in what is SAID stays
  SHOWN (aria-hidden): under the reader's status the region still shows degraded, else the send line.
- **A refusal while money is already moving names who holds it, in the device language.** The server
  answers a typed code (`code: "inflight"`, `holder: phone | register | unsure` — lib/inflight-refusal)
  and every settle control renders the holder's `settle.inflight.*` key; the table page's paying banner
  reads the same holder (`detail.paymentHolder`) and says the same sentence. A failed share read is
  `unsure`, never "their phone".
- **Settle actions are `@mms/ui` Buttons** (cash trigger/Cancel/Take, the reader trigger/Cancel/Back,
  the card-on-file trigger/Cancel/Charge). A refused control carries `aria-disabled` as a SPREAD plus
  its own handler guard — not the primitive's `disabled` prop, so the handler is what refuses (and
  K35's native-only measure stays honest); busy is the primitive's `aria-busy` + spinner at full ink.
- A settle that lands re-reads the PAGE's own detail (`onChanged`), never `router.refresh()` — the
  detail lives in `FloorDetailLive`'s state, not the RSC payload.

## 2 · CHANGELOG

- **Phase 2c · register — the cash moment.** Quick cash (Exact + three round-ups), an optional tender
  with a Change / Exact / Short readout on every cash settle, "Keep the change as tip" as a fill that
  names the tip it makes, a quote frozen when the sheet opens (a total that moves under it is said
  with both figures, never swapped), the compare-and-swap that refuses a moved total and shows both
  figures (cash and the card-on-file close), the sheet's actions pinned to its bottom, a focused paid
  card named by its facts (rows-only for tables when a tender was entered), one primary per settle
  section, `?settle=1` landing on the settle section, the page's ONE polite region (P2r), honest
  unknown-outcome copy on a lost cash settle (P2ab, and a counter order that closed behind it is said
  as "most likely went through" instead of a jump to the floor), and a mid-payment refusal — and the
  page's paying banner — that names who holds the money in the device language (P2w).

## 3 · OPEN-ITEMS rows

Closed / changed by this branch:

| Sev | Item                         | Why / where                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| —   | **P2r closed**               | The table page ends with exactly ONE polite region: `HandoffCard` is not `role="status"` (`HandoffCard.test` "never a status region"), `TerminalCollectPanel`'s line has no role and hands its status to the page (`TerminalSettle.test`, `FloorDetailLive.test` "exactly ONE polite region").                                                                                                                                                                     |
| —   | **P2ab closed**              | `CashSettleButton`'s catch says `settle.cash.unknown` and re-reads the detail (`CashSettleButton.test` P2ab case; mutant `p2c-register/cash-lost-response-reads-as-refusal`); a COUNTER order that closes while the outcome is unknown is held and said ("most likely went through", `FloorDetailLive.test` "LOST"; mutants `cash-unknown-never-handed-up` / `-never-cleared`).                                                                                    |
| —   | **P2ao closed**              | The docblock says the tip IS recorded; `settle.cash.hint` no longer says "handled separately"; `settleCash`'s docblock no longer says off-system.                                                                                                                                                                                                                                                                                                                  |
| —   | **P2aa closed**              | `closeSecureTab` compares `quotedCents` before any PaymentIntent and releases its freeze on `moved` (`lib/secure-close-cas.test.ts`; mutants `p2c-register/tab-close-*`); the confirm's quote freezes when it opens (`CloseSecureTabButton.test` "FROZEN").                                                                                                                                                                                                        |
| —   | **P2w closed (both halves)** | Server: settleCash / closeSecureTab / settleCard refuse with `{ code: "inflight", holder }` and each control renders the holder's bilingual key (`settle-cash-cas.test`, `secure-close-cas.test`, `terminal.test`, the three component suites in Burmese). Page: `getTableDetail` carries `paymentHolder` and the banner branches on it (`floor-settled-detail.test`, `FloorDetailLive.test` "paying banner"). A failed share read is `split_unreadable` → unsure. |
| —   | **K35 re-measured 15 → 11**  | Native-only command at `1768979`: 15 in 10 components (the row said 14 in 9 — KdsLineMenu's 1 landed in 2b). Now 11 in 8: ClearTable 2 · MergeTable 3 · FloorDetailLive 1 · KdsLineMenu 1 · ManagerPinStepUp 1 · OpenTab 1 · SettledToday 1 · StaffLineEditor 1. CloseSecureTab 2 → 0, TerminalSettle 2 → 0.                                                                                                                                                       |
| —   | **S12 update**               | The paid card S12 wires the durable-receipt QR into now exists (`HandoffCard`, a focused region with a counter-only column for #CODE); the QR tile is the next slice.                                                                                                                                                                                                                                                                                              |

New rows:

| Sev | Item                                                              | Why / where                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| low | Confirm FloorDetailLive's region precedence for the gate area     | Built `writeError > settle line > degraded > send warn > send ok`; the brief reads `writeError > send/settle-blocked warn > degraded > send ok`. Read here as "the settle gate's blocked warn ranks above degraded; a send FAILURE stays below it" (2a's `2b63b65`, pinned by two `FloorDetailLive.send.test` cases). Needs integration/owner sign-off, and the confirmed reading in the gate area's brief. |
| low | Measure the cash sheet and the paid card on a device              | No device/preview here. The actions now pin to the sheet's bottom (`.reg-settle-actions`), so Take stays reachable by construction; still owed: 390/768/1024 · en/my · Light/Night screenshots of the four `--fs-h3` tiles (≈81px each at 390, estimated), the Burmese "အတိအကျ" + amount in the Exact tile, the pinned band's height in Burmese, and the paid card's two columns from 40em.                 |
| low | The closed-after-unknown notice says "most likely"                | A counter session also closes when staff clear it from another tablet, so the page cannot say "it went through" as fact: `getTableDetail` answers `closed` without the paid order. A read of the session's latest paid order on `closed` would make the sentence certain (and could show the #CODE).                                                                                                        |
| low | `settle.card.unknown`'s "If it doesn't, try again"                | A retry inside the freeze's lifetime is refused (now truthfully, P2w, naming the wait). The sentence could name the wait too — a K15-HIGH copy change, so it waits on the owner's native check.                                                                                                                                                                                                             |
| low | The reader's decline sentences are still English                  | `TerminalCollectPanel`'s status is bilingual (six keys) except `failCopy`, the server's `declineCopy` sentence per decline reason; it needs a twin per reason (a dictionary question).                                                                                                                                                                                                                      |
| low | Migrate the drill-down's remaining controls onto `@mms/ui` Button | Clear table, Merge, promo Remove, OpenTabButton still hand-style `.staff-btn` actions (spec out_of_scope); K35's remaining 11 live there.                                                                                                                                                                                                                                                                   |
| low | FloorDetailLive's new wiring is pinned by suites, not mutants     | The paying banner's holder branch, the counter closed-bounce hold and the send line kept under the reader status are red-checked by hand (`FloorDetailLive.test`); the page is not in the mutate set (another two areas edit it this wave, so its anchors would churn). The decisions behind them ARE mutated (lib/inflight-refusal, lib/floor, CashSettleButton).                                          |

## 4 · Mutate-set / CLAUDE.md enumeration changes

Measured with the prescribed greps at this head:

- **Files added to the mutate set (3):** `apps/qr/components/staff/TerminalSettle.tsx` (component),
  `apps/qr/lib/inflight-refusal.ts` (lib), `apps/qr/lib/inflight-read.ts` (lib).
- **Buckets:** lib **134** · app/api **3** · components **16** · packages/db **1** = **154** files
  (was 132 + 3 + 15 + 1 = 151). CLAUDE.md's list becomes SIXTEEN components — add
  `staff/TerminalSettle.tsx (Phase 2c)`.
- **Mutants:** 885 → **940** (55 added, all in the one `// ── Phase 2c · register ──` block at the
  end of MUTANTS).
- **Mutants added (ids, 55):** the first build's 33 — `p2c-register/ladder-ceil-offers-exact-twice`,
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
  `…/inflight-lock-ignored`, `…/inflight-owner-read-as-seat`, `…/tab-close-refusal-blames-the-phone`;
  and the critic round's 22 — `…/quote-drift-never-said`, `…/quote-drift-on-refusal-basis`,
  `…/quote-reopen-drops-server-figure`, `…/quote-never-reconciled`, `…/cash-quote-live-bound`,
  `…/cash-drift-tap-settles`, `…/tab-close-quote-live-bound`, `…/tab-close-drift-tap-charges`,
  `…/cash-refusal-blames-the-phone`, `…/reader-refusal-blames-the-phone`,
  `…/inflight-unreadable-read-as-phone`, `…/inflight-key-collapsed`,
  `…/pay-guard-unreadable-reads-as-split`, `…/clear-unreadable-split-clears`,
  `…/detail-holder-owner-never-a-seat`, `…/detail-holder-dropped`, `…/cash-inflight-said-in-english`,
  `…/tab-close-inflight-said-in-english`, `…/reader-inflight-said-in-english`,
  `…/keep-change-names-the-change`, `…/cash-unknown-never-handed-up`, `…/cash-unknown-never-cleared`.
- **Mutants re-anchored (meaning kept):** `p2a-register/cash-tip-overlong-reads-as-zero` (the flag is
  `tipOverlong`, read by `cashSettleBlocked`), `p2a-register/secure-close-rejection-escapes` (the call
  carries `quotedCents: quoted`), `p2c-register/cash-moved-figure-never-adopted` (the refusal now
  replaces the frozen QUOTE — mutated to keep the stale one), `p2c-register/cash-quote-dropped` and
  `…/tab-close-quote-dropped` (`quote` → `quoted`), `p2c-register/tab-close-refusal-blames-the-phone`
  (the call site returns the typed refusal; the evasion is the fixed phone refusal),
  `pay-guard/read-error-fails-open` (the error arm returns `split_unreadable`),
  `floor/detail-reads-a-settled-cart` and `floor/detail-reads-the-wrong-status` (the cart read gained
  `settle_by`). `check:mutant-anchors` clean at 940.
- **verify:slice at this head** (`--no-gate`, one `--only` per id prefix that owns a mutant in a
  file this branch touched — 229 mutants in all, every one KILLED, no orphans, tree clean after):
  `p2c-register/` 55 · `p2a-register/` 9 · `p2a-padserver/` 12 · `floor/` 28 · `terminal/` 14 ·
  `settle/` 54 · `cash-tip/` 3 · `pay-guard/` 2 · `register-math/` 5 · `staff-cart/` 5 ·
  `staff-promo` 42. The full 940-mutant run (with the gate) is integration's.

## 5 · Owner-visible behaviour changes

- The cash sheet (tables AND counter): four big quick-cash tiles (Exact + three round-ups), an
  optional "Cash received" field, a Change / Exact / Short line, and "Keep the change as tip · $x" —
  or, when a tip is already typed, "Keep the change — make the tip $x" (the tip it will become). Take
  is dimmed (with the reason read out) when the cash received is short or the tip is over the cap.
  Take and Cancel stay pinned at the bottom of the sheet, above the number pad.
- The amounts in the sheet no longer change while it is open. If a guest adds something from their
  phone meanwhile, the sheet says "The total changed from $42.10 to $46.10 — check the order, then
  take payment again."; the next tap on Take switches the sheet to the new amount (nothing is
  recorded), and the tap after that takes payment. Same on the card-on-file "Charge" confirm.
- If the order changed between the last refresh and the tap, the server refuses the same way (both
  figures); nothing is recorded.
- A dropped connection during a cash settle says "we don't know if this payment was recorded" and
  re-checks the table, instead of "that change wasn't saved". On a counter order that then closes, the
  page stays and says "This order has closed — the payment most likely went through. Find it on the
  floor before taking payment again." with "Back to the counter", instead of jumping to the floor.
- After paying: a "✓ Paid" card with Total · Tip · Cash received · Change (big), plus #CODE and "Back
  to the counter" on counter orders. Tables see it only when a cash amount was entered; it goes away
  when the table starts a new round.
- The settle section has a small "Take payment" heading; exactly one filled button (card on file on a
  secure running bill, otherwise cash); the card reader sits below cash as an outlined button. The
  promo "Apply" is outlined too.
- The card-reader panel's status is in Burmese as well as English now.
- A payment refused because another payment is already going on says who holds it — a guest's phone,
  the register's own unfinished payment ("… if it hasn't finished in 10 minutes, try again"), or "on a
  guest's phone or at the register" when nobody can tell — in Burmese on a Burmese console. The table
  page's "paying" note says the same thing instead of always "a guest is paying on their phone".
- A "Couldn't send" / "Sent" line stays on screen while the card reader is collecting.

## 6 · K15 strings

Every MY value below is a Claude-authored K15 draft pending Min's native check unless marked
grounded.

| Key                                  | EN                                                                                                                                                                                                         | MY                                                                                                                                                                                        | HIGH |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `table.detail.settle.title`          | Take payment                                                                                                                                                                                               | ငွေရှင်း (grounded: the retired `table.detail.a11y.settle`)                                                                                                                               | —    |
| `settle.cash.exact`                  | Exact                                                                                                                                                                                                      | အတိအကျ                                                                                                                                                                                    | —    |
| `settle.a11y.cashQuick`              | Quick cash amounts                                                                                                                                                                                         | ငွေသား အမြန်ရွေး                                                                                                                                                                          | —    |
| `settle.cash.changeLabel`            | Change                                                                                                                                                                                                     | အကြွေ                                                                                                                                                                                     | HIGH |
| `settle.cash.shortLabel`             | Short                                                                                                                                                                                                      | လိုငွေ                                                                                                                                                                                    | HIGH |
| `settle.cash.shortHint`              | Collect the rest, or correct the amount.                                                                                                                                                                   | ကျန်ငွေ ထပ်ယူပါ၊ ဒါမှမဟုတ် ပမာဏ ပြင်ပါ။                                                                                                                                                   | —    |
| `settle.cash.exactNone`              | Exact — no change                                                                                                                                                                                          | အတိအကျ — အကြွေ မပြန်ရပါ                                                                                                                                                                   | HIGH |
| `settle.cash.keepChange`             | Keep the change as tip · {m}                                                                                                                                                                               | အကြွေကို အပိုကြေး ထား · {m}                                                                                                                                                               | HIGH |
| `settle.cash.keepChangeTip`          | Keep the change — make the tip {m}                                                                                                                                                                         | အကြွေကိုပါ ပေါင်းပြီး အပိုကြေး {m} ထားပါ                                                                                                                                                  | HIGH |
| `settle.cash.moved`                  | The total changed from {old} to {m} — check the order, then take payment again.                                                                                                                            | စုစုပေါင်း {old} ကနေ {m} ပြောင်းသွားပါတယ် — အော်ဒါ စစ်ပြီးမှ ပြန်ရှင်းပါ။                                                                                                                 | HIGH |
| `settle.cash.unknown`                | The connection dropped, so we don’t know if this payment was recorded. If the order shows paid in a moment, it went through — if it doesn’t, try again.                                                    | ချိတ်ဆက်မှု ပြတ်သွားလို့ ဒီငွေရှင်းတာ မှတ်ပြီးပြီလား မသိရပါ။ ခဏနေ အော်ဒါက ငွေရှင်းပြီး လို့ ပြရင် ရှင်းပြီးပါပြီ — မပြရင် ထပ်စမ်းပါ။                                                      | HIGH |
| `settle.cash.unknownClosed`          | This order has closed — the payment most likely went through. Find it on the floor before taking payment again.                                                                                            | ဒီအော်ဒါ ပိတ်သွားပါပြီ — ငွေရှင်းတာ ဖြစ်သွားပုံရပါတယ်။ ထပ်ငွေမယူခင် ခန်းမမှာ ရှာကြည့်ပါ။ ("the floor" grounded: `floor.back` ခန်းမ)                                                       | HIGH |
| `settle.inflight.phone`              | Someone’s already paying on their phone — wait for that to finish.                                                                                                                                         | ဧည့်သည်တစ်ယောက် ဖုန်းကနေ ငွေရှင်းနေပါတယ် — ပြီးတဲ့အထိ စောင့်ပါ။ (first clause grounded: `table.detail.payingPhone.*`)                                                                     | HIGH |
| `settle.inflight.register`           | A payment started at the register on this table hasn’t finished — don’t take cash or another card yet. If it went through, it finishes by itself shortly; if it hasn’t finished in {n} minutes, try again. | ဒီစားပွဲအတွက် ကောင်တာမှာ စထားတဲ့ ငွေရှင်းမှု မပြီးသေးပါ — ငွေသား ဒါမှမဟုတ် နောက်ကတ်တစ်ခု မယူပါနဲ့ဦး။ ငွေဖြတ်ပြီးသားဆိုရင် ခဏနေ အလိုလို ပြီးသွားပါမယ်၊ {n} မိနစ်အတွင်း မပြီးရင် ထပ်စမ်းပါ။ | HIGH |
| `settle.inflight.unsure`             | A payment on this table is already going through — on a guest’s phone or at the register. Don’t take another payment until it finishes.                                                                    | ဒီစားပွဲမှာ ငွေရှင်းမှု တစ်ခု လုပ်နေဆဲပါ — ဧည့်သည့်ဖုန်းမှာ ဒါမှမဟုတ် ကောင်တာမှာ။ မပြီးမချင်း နောက်ထပ် ငွေ မယူပါနဲ့။                                                                      | HIGH |
| `table.detail.handoff.title`         | Paid                                                                                                                                                                                                       | ငွေရှင်းပြီး (grounded: `settle.reader.paid`)                                                                                                                                             | —    |
| `table.detail.handoff.tendered`      | Cash received                                                                                                                                                                                              | လက်ခံရရှိငွေ (grounded: `settle.cash.tenderedLabel`)                                                                                                                                      | —    |
| `table.detail.handoff.collect`       | Still to collect                                                                                                                                                                                           | ထပ်ယူရန် ကျန်                                                                                                                                                                             | HIGH |
| `table.detail.handoff.done`          | Back to the counter                                                                                                                                                                                        | ကောင်တာကို ပြန်သွား                                                                                                                                                                       | —    |
| `settle.reader.status.waiting`       | Waiting for the guest to tap or insert their card…                                                                                                                                                         | ဧည့်သည် ကတ်ကို ကပ်တာ ဒါမှမဟုတ် ထည့်တာကို စောင့်နေပါတယ်…                                                                                                                                   | —    |
| `settle.reader.status.blind`         | Can’t reach the card processor right now — the reader may still be live. Hold on, or cancel.                                                                                                               | ကတ်ငွေပေးချေမှုစနစ်ကို အခု ချိတ်မရပါ — ကတ်စက်က အလုပ်လုပ်နေတုန်း ဖြစ်နိုင်ပါတယ်။ ခဏစောင့်ပါ၊ ဒါမှမဟုတ် ဖျက်ပါ။                                                                             | HIGH |
| `settle.reader.status.recording`     | Recording the order…                                                                                                                                                                                       | အော်ဒါ မှတ်နေပါတယ်…                                                                                                                                                                       | —    |
| `settle.reader.status.recordingLong` | The charge went through, but the order isn’t recorded yet. Don’t charge again — note the amount and check Orders in a minute.                                                                              | ငွေဖြတ်ပြီးပါပြီ၊ ဒါပေမဲ့ အော်ဒါ မမှတ်ရသေးပါ။ ထပ်မဖြတ်ပါနဲ့ — ပမာဏကို မှတ်ထားပြီး တစ်မိနစ်အတွင်း အော်ဒါများ ကို စစ်ပါ။                                                                    | HIGH |
| `settle.reader.status.failed`        | The payment didn’t go through.                                                                                                                                                                             | ငွေရှင်းလို့ မရပါ။ (grounded: `settle.reader.failedTitle`)                                                                                                                                | —    |
| `settle.reader.status.canceled`      | Nothing was charged.                                                                                                                                                                                       | ဘာငွေမှ မဖြတ်ခဲ့ပါ။                                                                                                                                                                       | HIGH |

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
   A line outranked there stays visible (aria-hidden). Flagged for sign-off (OPEN-ITEMS row above).
2. **Plain words over spec copy.** 2b's vocabulary is kept: "Take $x" / "Taking payment…" (spec:
   "Settle $x" / "Settling…"); the moved sentence ends "then take payment again". The plain-words
   guard now also bans `settle` and `tab` in visible English.
3. **Row keys reused, not added.** The paid card reuses `floor.settled.row.total` / `.tip` and
   `settle.cash.changeLabel`; "Tendered" is "Cash received" (2b's word for the same field) —
   `table.detail.handoff.tip` was not added.
4. **Keep the change's `{m}`** is the change with the tip field empty (then the change IS the new
   tip — the spec's example) and the resulting tip when a tip is already typed (a second key,
   `settle.cash.keepChangeTip`) — critic finding: one figure, never a label that differs from the
   field it fills.
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
15. **P2w is a holder decision (phone / register / unsure) carried as a TYPED CODE.** From the cart
    row plus the freeze owner against the session's seats (one read on the refusal path; the detail
    uses the party it already read). `paymentInFlightReason` gained a third reason, `split_unreadable`
    (a failed share read — still a refusal), so the refusal never claims a phone on a transport error;
    `clearTable` now refuses on ANY reason (it compared `=== "split_in_progress"` and the new member
    would have fallen through to a clear).
16. **A drift is adopted by the NEXT TAP, not a separate control.** The critic's fix ("show the moved
    line before the tap; on re-tap adopt the new figure explicitly") is built literally: while the
    figures disagree, Take/Charge adopt the new figure (nothing recorded; the sentence naming both
    stays), and Take is described by the alert. A dedicated "use the new total" button would be a
    second action in a band that must stay short on a phone. The tip CHIPS' percentages stay live
    (their base — subtotal − discount — never moves without the total moving, so the drift
    sentence is then already showing), and the recorded tip is the FIELD's value, which never
    moves on its own.
17. **The pinned action band** (`.reg-settle-actions`) is the critic's conditional fix applied without
    the measurement that would have triggered it (no device here): the sheet's height in Burmese at
    390 is not knowable from this environment, and pinning costs nothing when it is not needed.

## 8 · Seams for the gate area

- **Server — `apps/qr/lib/staff-cart.ts` `settleCash`:** the one-line comment "(The settle gate's
  unsent-dishes check sits HERE — after the freeze, before the totals.)" is the spot, inside the `try`
  whose `finally` releases the freeze. Add the arm to `SettleCashRefusal` (same file, beside `moved`
  and `inflight`): `| { ok: false; error: string; code: "unsent"; units: number }`.
- **Server — `closeSecureTab`** (same file): after `acquireSettlementSuperseding` and before
  `getCartTotals`; this path has NO blanket `finally`, so the refusal must
  `await releaseSettlementFor(cart.id, attempt)` itself (the `moved` arm shows the shape).
  `lib/terminal.ts` `settleCard` has the same shape after its acquire; `SettleCardResult`'s refusal
  union takes the same arm.
- **Client — `CashSettleButton`:** add optional `blocked?: boolean` + `onBlockedTap?: () => void`;
  spread `{...(blocked ? { "aria-disabled": true } : {})}` on the trigger `Button` and refuse first
  in its `onClick` (`if (blocked) { onBlockedTap?.(); return; }`). A server `unsent` answer is one more
  arm beside `res.code === "moved"` / `"inflight"` in `confirm()` (and one more `SheetError` kind).
  Note `confirm()` first ADOPTS a drifted quote; a gate refusal belongs after that arm.
- **Client — `CloseSecureTabButton`:** the same two props on the trigger; `res.code === "unsent"`
  beside `moved` / `inflight` in `confirm()`. **`TerminalSettleButton`:** the same two props; refuse
  at the top of `start()` beside the `inFlight` ref guard; `res.code === "unsent"` beside `inflight`.
- **Page — `FloorDetailLive`:** the region's settle arm is `readerStatus ? … : degraded` — add the
  gate's visible warn at that rank (e.g. `settleNote ?? readerStatus`, rendered visibly, not
  sr-only). `settleBlockedTarget` (lib/staff-send-view, 2a) says where the tap jumps. The precedence
  reading the gate depends on is the open sign-off row in §3.

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
- **A compare-and-swap is only as good as the quote it compares.** The server CAS was correct and
  still passed a moved total, because the client's quote was read from a live prop at TAP time — the
  page's re-read had already moved it under the open sheet. Freeze what the person READ at the moment
  they started reading, and treat a later move as a drift to be said, never a value to adopt.
- **A frozen value that adopts a server's figure needs a reconcile.** Holding "the server said 4265
  while the page still reads 4210" as `{cents, basis}` works until the page catches up and then moves
  BACK to 4210 — which looks like the stale basis again. Collapse the basis the moment the live value
  reaches the quote (a guarded render-time set).
- **A new member of a shared reason union is audited at every EQUALITY consumer.** Adding
  `split_unreadable` to `PaymentInFlight` was type-safe everywhere and fail-OPEN in one place:
  `clearTable` compared `=== "split_in_progress"`, so the new reason would have fallen through to a
  clear. Truthiness consumers were fine; the one `===` was the hole. Grep for `=== "<member>"` before
  widening.
- **A server string rendered through `<OutageText>` is English forever unless it has a twin.** A
  refusal that tells staff what to do with money is a KEY the component renders from a typed code;
  keep `error` only for the older bundle. `plain-words.test` only reads dictionaries, so it cannot see
  a server literal.

## Critic findings — resolution

| #   | Finding                                                                      | Verdict                                       | Commit    |
| --- | ---------------------------------------------------------------------------- | --------------------------------------------- | --------- |
| 1   | The quote live-binds; a total moving under an open sheet is swapped silently | fixed                                         | `2a9dff0` |
| 2   | P2w sentences are server English literals                                    | fixed                                         | `05232f1` |
| 3   | The paying banner still says "their phone" over a register freeze            | fixed                                         | `05232f1` |
| 4   | settleCash / settleCard in-flight arms untested                              | fixed                                         | `05232f1` |
| 5   | A failed share read maps to "phone"                                          | fixed                                         | `05232f1` |
| 6   | A lost counter settle that landed bounces to the floor                       | fixed                                         | `4648bea` |
| 7   | The send line vanishes from the screen under the reader status               | fixed                                         | `018a4af` |
| 8   | Region precedence differs from the brief's literal order                     | rejected as a code change — escalated (below) | —         |
| 9   | quotedCents docblock says settleCard compares it                             | fixed                                         | `2d12161` |
| 10  | Keep the change names the change, not the tip it makes                       | fixed                                         | `31b78e3` |
| 11  | Nobody checked the tall cash sheet on a device                               | fixed (pinned band); measurement still owed   | `f92c8ea` |

## Critic findings — rejected

- **#8 · "The region's precedence differs from the brief's literal order."** Not a code defect, so
  no code change: the order was built deliberately and is pinned. Evidence: 2a's blind review
  (`2b63b65`) ranked the frozen-board line above EVERY send line — `FloorDetailLive.send.test.tsx`
  "the degraded line outranks a WARN send line — a frozen view must never look live (S9)" and "a warn
  send line standing when the read degrades gives the region to the frozen signal" both fail if the
  send warn is moved above degraded. The brief's "send/settle-blocked warn" is read as the settle
  GATE's blocked warn (a refusal that the settle cannot proceed until dishes are sent), which this
  build ranks above degraded exactly as written — `readerStatus` holds that rank today and the Seams
  name the spot. The critic's actual ask — integration/owner sign-off and the confirmed reading in
  the gate area's brief — is outside this worktree (the gate brief and OPEN-ITEMS are integration's
  files), so it is filed as the first new OPEN-ITEMS row above for integration to carry.
