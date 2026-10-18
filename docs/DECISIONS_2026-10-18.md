# Decisions — the 2026-10-18 round

**The session decided every open design question the owner delegated, and wrote up as recommendations
every money or staff-authority call for the owner's sign-off, which the owner gave later the same day.** The round covers 60 IDs
across three domains: diner (17), staff (32) and money / authority (11). After the critic's
corrections, 40 are decided and 20 were recommendations, all signed on 2026-10-18 (The owner's words).

This record follows the shape of [`PATH_DESIGN_2026-10-07.md`](PATH_DESIGN_2026-10-07.md). The rulings
in [`OWNER_RULINGS_2026-10-07.md`](OWNER_RULINGS_2026-10-07.md) still win on anything they rule, and
PATH_DESIGN's shared vocabulary (round 3 included) still holds. This round extends that vocabulary and
does not replace it.

**Code read.** `origin/main` @ `37a5c35`, unless a branch is named:

- **st** = `claude/fix/lifecycle-session-truth` (#361) @ `d218e11`;
- **dso** = `claude/fix/lifecycle-diner-sold-out-edits` (#362) @ `aae0182`;
- **res** = `claude/fix/lifecycle-residuals` (#363) @ `b27f8af`;
- **kfs** = `claude/fix/lifecycle-kitchen-floor-sync` (#360) @ `56bf482`;
- **sc** = `claude/docs/session-close-2026-10-13` (#357, docs only).

A bare path is under `apps/qr/` on `main`.

## The owner's words

**2026-10-18:** "apply world-class design-thinking for all open decisions, merge all when ready, launch
app production ready"

- **"apply world-class design-thinking for all open decisions"** is the delegation this record uses. The
  session decided each design question and recorded who decided it. Each decision can be reversed on the
  owner's word.
- **The delegation does not cover money or staff-authority policy.** OWNER_RULINGS keeps those for the
  owner. They are written below as **recommendation, owner sign-off**, and the code keeps its behaviour
  today until the owner signs.
- **"merge all when ready"** is an instruction about merges. It does not change G3 or G4: an agent never
  merges a head whose `codex-review` is red, and the owner bypass-merges a quota-red head by hand. It
  also does not give the go for any prod migration. Ruling #5 and #21/#22 still apply, one file at a
  time, on the owner's go for that file.
- **"launch app production ready"** does not move C2 (live keys), ruling #8's prerequisites, or D5's
  three flip conditions.

**Later on 2026-10-18, the sign-off:** "go ahead with all recommended decisions and migrations, merge
when ready for production"

The session reads it this way, and the owner can correct the reading:

- It signs off every **recommendation** in this record, the money and staff-authority ones included,
  and it is the owner's go for the migrations those decisions and their open rows name. Where a
  section below says a call "waits for the owner's sign-off", read it as signed on this date.
- Ruling #5's mechanics still hold. Each migration file goes to prod one at a time through the
  Supabase MCP `apply_migration`, after confirming the project is `fasnpdhtvqtzjlvruqcu`, only once its
  PR is green and merged, in merge order, and each is verified object by object before the next.
- G3 still holds: no agent merges a red `codex-review` head, and with Codex out of quota the owner
  bypass-merges by hand. The one exception that day was #367: the owner approved the admin bypass for
  that session in their own words, and the record of it is in `docs/HANDOFF.md`.
- Not covered, because only the owner can do them: the live Stripe keys and C2's dashboard steps, the
  Vercel plan, the Supabase Auth dashboard (C1), branch protection, the device and Burmese sittings,
  and hardware.

This record describes the code it read (below). What has been built from it since is in
[`OPEN-ITEMS.md`](OPEN-ITEMS.md) and [`HANDOFF.md`](HANDOFF.md).

## How to read this record

1. **Required corrections** (the critic's blocking fixes, below) win over every other section.
2. **Reconciliations** win over the per-ID sections.
3. **The shared vocabulary** is binding on every new string.
4. **The per-ID sections** are condensed from the three domain inputs with the corrections already
   applied. Where a section still disagrees with a correction, the correction wins.

The three inputs (`diner.md`, `staff.md`, `money.md`) were working drafts, and this record supersedes
them.

## Decisions table

"Session" means **decided by the session under the owner's 2026-10-18 delegation**. "Sign-off" means
**a recommendation that waits for the owner's sign-off**. A migration is always one file on the
owner's go (ruling #5), whoever decided the design.

| ID         | Decision                                                                                                         | Decided by                     | Builder                                    | Migration?                                   | Size  |
| ---------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------ | -------------------------------------------- | ----- |
| J57        | Drop the undo-window hold on the counter door, on both docks; only a tablemate's lock holds it                   | Session                        | diner-cart, in #363                        | No                                           | S     |
| J59        | Inside the Send's grace a dish reads "Sending…" on every surface, and the refusal says "on its way"              | Session                        | diner-cart, first PR after #362            | No                                           | S     |
| J63 / J66  | A sent dish sold out since then gets a factual note on the Sent stage only (sold-out kind only)                  | Session                        | diner-cart, in #362                        | No                                           | S     |
| J65        | A delisted dish's /menu pill reads "Off the menu"; the card line reads "No longer on the menu"                   | Session                        | diner-cart, in #362                        | No                                           | S     |
| T43        | "Your usual" never ends on "Sent"; an unconfirmed add ends on a "Check your order" link                          | Session                        | diner-cart, PR after #362                  | No (a later idempotency key: yes)            | M     |
| J27        | Bare /menu keeps the door picker; an explicit `mode=scango` redirects to /grocery                                | Session                        | grocery                                    | No                                           | S     |
| J29        | Keep the undo, drain and sign-in lines as house voice; ledger them EN-only                                       | Session                        | decisions-record PR (docs)                 | No                                           | none  |
| J58        | The role follows the door: an invitee stays a guest across a reload, carried on the member row                   | Sign-off (authority)           | table-door, inside M168's PR               | Yes, inside M168's file                      | M     |
| J60        | No host hand-off (W20 and M169 stand); the leave warning adds how to come back                                   | Session                        | session truth, #361                        | No                                           | S     |
| J64 + T45  | A narrow visible-only sold-out read every 60 s on /menu, on the shared end-poll primitive; M300 is the end state | Session                        | diner-cart, #362 follow-up                 | Interim no; M300 yes                         | M     |
| M138       | Keep the dietary sheet; close the row                                                                            | Session                        | none                                       | No                                           | none  |
| M144       | Surprise deals at most one placeholder card while photographed dishes are eligible                               | Session                        | diner-cart                                 | No                                           | S     |
| M79        | One BackLink rule: pop when the previous in-app entry is the target, otherwise replace; never push               | Session                        | diner-cart; counter-floor for `floor.back` | No                                           | M     |
| K48        | Kitchen guide step 5's picture well is bottom-anchored on "Got it"; height unchanged                             | Session                        | kitchen-ops, PD12 follow-up                | No                                           | S     |
| F29        | Express wallets: `buttonType` plain for both, order Apple Pay then Google Pay                                    | Session                        | diner-cart, its own PR before the D5 flip  | No                                           | S     |
| M286       | A scan-and-go cart may hold food; /grocery lists every line it charges                                           | Session                        | grocery, with J27                          | No                                           | S     |
| J56        | GuestList's `?table=N` refusals stop saying "pick another" on all four arms; the bind sheet keeps it             | Session                        | table-door                                 | No                                           | S     |
| K50        | Keep the register's sold-out re-warning (PD8's rule); copy follows PD8's shipped clause                          | Session                        | counter-floor, on #360                     | No                                           | S     |
| K51        | Keep the no-wait clear window with its words (ruling #6)                                                         | Session                        | counter-floor (row close)                  | No                                           | none  |
| J62        | A full refund is a tag on every board, whatever the tender; the wall half waits for K49 ②                        | Session                        | kitchen-ops, on #360                       | No                                           | S     |
| K49 ①      | Refund the tip with a pickup none of which can be made                                                           | Sign-off (money)               | money-rails, after K49 ②                   | Yes                                          | M     |
| K49 ②      | A manager-gated "Can't make it — cancel and refund" on the takeaway lane; the bag gets `cancelled`               | Sign-off (money and authority) | kitchen-ops + money-rails                  | Yes (RPC, CHECK, stop record: one file each) | L     |
| K49 ③      | A full refund keeps an uncooked dish on the KDS, tagged                                                          | Session                        | none                                       | No                                           | none  |
| K20 (+K28) | A 12-hour fold on the DB clock (the row's default until the owner names N); folded tickets leave every alarm     | Session                        | kitchen-ops                                | K28 only                                     | M     |
| M316       | A kitchen note may be added once after Send, never edited; the KDS marks it and chimes once                      | Session                        | kitchen-ops + counter-floor                | Yes                                          | M     |
| M262       | Auto-close a dine-in session 20 min after it is fully paid, only when a free clear would record nothing          | Sign-off (owner policy)        | table-door                                 | Yes                                          | M     |
| M288       | "Hand over · on the house": a $0 order for a fully comped served counter order; the Clear refuses such a cart    | Sign-off (money record)        | money-rails + counter-floor                | Yes (two files, shipped together)            | M     |
| P2fq       | No remote approval for a no-show; one honest line says it can wait                                               | Session                        | counter-floor                              | No                                           | S     |
| P2gn       | No bulk removal; focus steps to the next not-collected order                                                     | Session                        | counter-floor                              | No                                           | S     |
| M270 ②     | Ratify PD7's shipped alternative (leaving the pane drops the clear and says so)                                  | Session                        | counter-floor (docs)                       | No                                           | S     |
| P2z        | Keep the unsent age on asked tables only (ruling #15's condition); widening goes to the owner                    | Sign-off (ruling scope)        | counter-floor, if signed                   | No                                           | S     |
| PD9        | The wall's "All clear" shows only when no code is in Preparing either                                            | Session                        | kitchen-ops                                | No                                           | S     |
| PD12       | Add the three teaching lines to `STAFF_K15_HIGH`                                                                 | Session                        | kitchen-ops + counter-floor                | No                                           | S     |
| P2aw       | Keep quiet singles; only a multiple is lit                                                                       | Session                        | none                                       | No                                           | none  |
| P2ax       | Keep "Mark sold out" on each line's ⋯                                                                            | Session                        | none                                       | No                                           | none  |
| P2ay       | No idle auto-close on the ⋯ sheet                                                                                | Session                        | none                                       | No                                           | none  |
| P2az       | Keep put-back off the ticket                                                                                     | Session                        | none                                       | No                                           | none  |
| P2ba       | No catalog allergens on tickets                                                                                  | Session                        | none                                       | No                                           | none  |
| P2dp       | Keep both floor warn marks ("N not sent" and the tile's hollow ring)                                             | Session                        | none (device sitting confirms)             | No                                           | none  |
| P2dq       | Keep the floor's refunded chip muted                                                                             | Session                        | none                                       | No                                           | none  |
| P2gf       | No Cancel on the lock screen; its reader line says "unlock to cancel it"                                         | Session                        | counter-floor                              | No                                           | S     |
| P2dn       | A refunded round's cooked lines still count as "Kitchen done"                                                    | Session                        | none                                       | No                                           | none  |
| P6b        | Never hide KDS food because a session expired; K20's fold absorbs it; close                                      | Session                        | kitchen-ops (with K20)                     | No                                           | none  |
| M140       | Ship only the top 24 POS ids to the client                                                                       | Sign-off (owner's sales data)  | diner-cart                                 | No                                           | S     |
| P7d · P7e  | A second manifest under /staff with bilingual shortcuts; guest installs lose staff entries                       | Session                        | staff-authority                            | No                                           | M     |
| P7i        | A failed PIN read draws Lock disabled with a reason                                                              | Session                        | staff-authority                            | No                                           | S     |
| C24 ③      | Keep every staff plain-word pick                                                                                 | Session                        | none (K15 sitting)                         | No                                           | none  |
| C24 ②      | Keep "approved, not charged yet" and add "your bank may show it as pending"                                      | Sign-off (money statement)     | post-pay                                   | No                                           | S     |
| M308       | Do not flip `status` on a full cash refund; readers key on the refund state                                      | Sign-off (money record)        | money-rails                                | No                                           | S     |
| M315       | Count the $20 PIN ceiling per table visit (unapproved solo voids of sent dishes), with the partial-qty void      | Sign-off (money and authority) | money-rails + staff-authority              | Yes                                          | M     |
| M322       | Card doors take the refund path: a dish sold out after the read and not acknowledged is left unfired and flagged | Sign-off (money)               | money-rails, with M318                     | Yes                                          | M     |
| M206       | The guest claims a counter settle's Stars on the receipt link: one claim per order                               | Sign-off (money)               | post-pay + money-rails, after M309         | Yes                                          | M     |
| M234       | Retire M234 once D5 flips; D5's served gate answers it                                                           | Sign-off (money)               | money-rails (docs, after the flip)         | No                                           | S     |
| P2hf       | Ratify PD7's paid-unserved hold as a named addition to ruling #6                                                 | Sign-off (ruling #6)           | counter-floor                              | No                                           | S     |
| M270 (6)   | A recorded Stripe decline unlocks the walkout on a secured tab; a manager write-off stays the second way out     | Sign-off (money and authority) | counter-floor + money-rails                | Yes                                          | M     |
| M72        | Re-scope PICKUP_MANUAL_CAPTURE gate ② to M72b landed, M72c measured and M73's list shipped                       | Sign-off (money)               | money-rails                                | M72b's later step only                       | S     |
| M111       | Engage the console lock when a staff sign-in lands on /kiosk or /board, in the C2 cutover PR                     | Sign-off (authority)           | staff-authority                            | No                                           | S     |
| S11        | Keep the reader tip-free until connected; then "Reader tips" as a breakdown credited to `settled_by`             | Sign-off (money)               | money-rails, after S12                     | Yes                                          | M     |
| RULING#24  | Build the ruled default's missing record now; recommend amending #24 so an in-app refund is built regardless     | Sign-off (amends ruling #24)   | staff-authority                            | Yes (two columns)                            | S + M |
| M73        | No SMS vendor yet; a manager list "cancelled — sold out, call them" ships with the manual-capture flip           | Sign-off (money and PII use)   | money-rails                                | No                                           | S     |

## The shared vocabulary

These words are binding on every string this round adds. Each one extends PATH_DESIGN's vocabulary.

- **The kitchen stage words are the ONE KITCHEN TRACK:** "Not sent yet" · "Sending…" · "Sent to
  kitchen" · "Cooking" · "Served".
  - They come from `DINER_STAGE_WORD`, keyed on `trackStage` (`lib/line-state-copy.ts:40`,
    `lib/kitchen-track.ts:69-86`).
  - Inside any window a word is "-ing"; the past tense comes only after the grace or a confirmed write.
  - A surface keyed on the raw `lineState` is the drift J59 fixes.
- **"Sold out" and "Off the menu" are two kinds behind one gate (`dishUnavailable`).**
  - **"Sold out"** is the `sold_out` kind (`kds.86.done`, staff and guest).
  - **"No longer on the menu"** is the `gone` kind. Its short form is **"Off the menu"**, the staff pad's
    shipped phrase (`pad.err.add.gone`, `lib/i18n/staff.ts:3224-3227`).
  - Both kinds take the same shipped Burmese, မီနူးမှာ မရှိတော့ပါ.
- **"Sticker" and "table code" name two things.**
  - The **sticker** is the QR on the table: "Scan your table’s sticker" (`DoorSheet.tsx:192`).
  - The **table code** is the typed code someone shares (`JoinTable.tsx`, `InviteSheet.tsx:82`).
  - New strings never say "the table’s code" for the sticker. The shipped "the party’s code"
    (`BIND_COPY.seated`) stays where it is shipped, and new strings say "table code".
- **"Check your order"** is the one phrase for an unconfirmed outcome, and it always points at /cart
  (`UNDO_UNCONFIRMED_FINAL`, T43).
- **One Undo form, with its duration named once.**
  - The Send's grace is 10 s (`mms_fire_cart`, `20260622050000_undo_grace.sql:23`).
  - The clear window is `CLEAR_UNDO_MS = PICKED_UNDO_MS`, 6 s (`lib/clear-window.ts:20`).
  - The KDS undo is `KDS_UNDO_MS`.
  - No string promises a duration it does not name ("for a moment" is allowed).
- **A refund is a tag, never a cancel.** One rule decides it, `foodRefundedInFull`
  (`lib/refunded-cart.ts`, kfs), and each surface names its own act:
  - the KDS reads "Refunded — check with the counter before cooking";
  - the lane and the table page read "Refunded — check with the counter before it goes out"
    (`table.detail.paidKitchen.refunded`);
  - the TV wall never says "refunded".
  - Cancelling is K49 ②'s explicit act, "Can't make it".
- **"On the house"** is a comped dish (`LineStateChip`, C24 ③), and M288's $0 handover.
- **Taking payment over a warning is a second tap of the door itself:** "tap again to take payment with
  it on the bill" (`settle.flag.pendingRefused`, `lib/i18n/staff.ts:726-728`). "Take payment anyway" is
  retired (PATH_DESIGN reconciliation 5).
- **"Not collected"** is staff's word for a counter order nobody picked up (`floor.counter.uncollected.*`).
  "Uncollected" is not a heading anyone sees, and "no-show" is never a visible word.
- **"Today's payments & refunds"** is the one refund door. **"Show a server"** is the guest's one human
  fallback (PD1).
- **Warn means "act now".** Muted means history (P2dq). A refund tag that asks for an act is warn (J62).
- **Every state names its carrier:** durable (a row), server-backed (re-derived on each read) or
  ephemeral (device or React state).
- **The decision wording:** "decided" for the session's calls; "recommendation, owner sign-off" for money,
  authority, ruling scope, or a fact a row names as the owner's.

## Reconciliations (these win over the per-ID sections)

1. **"Off menu" against the staff pad's "off the menu" (J65).** **Winning text:**
   - the pill reads **"Off the menu"**, and its accessible name is the same words;
   - the card line reads **"· No longer on the menu"** (`goneMark`);
   - `ItemSheet`'s CTA reads **"No longer on the menu"**.

   The build measures the pill at 320 px with L text. If it overflows, the PR records the measurement
   and uses "Off menu", and nothing else.

2. **The refund tag's two strings (J62 against K49's row and `refunded-cart.ts`).**
   - **The winner:** one verdict, each surface's own key (vocabulary above).
   - J62's parity test asserts the same verdict on the KDS and the lane, and the same code on the wall. It
     never asserts the same string.
3. **K50's "take payment anyway" against PATH_DESIGN reconciliation 5 and PD8's shipped clause.**
   **Winning text:**
   - `settle.soldOut.warn`: "{x} is sold out — remove it from the order, or take payment with it on the
     bill. It will still go to the kitchen — tell the cook."
   - `settle.soldOut.warned`: "{x} is sold out — remove it from the order, or tap again to take payment
     with it on the bill. It will still go to the kitchen — tell the cook."
   - The Burmese of the payment clause is reused verbatim from `settle.flag.pendingRefused`
     (စာရင်းထဲ ထားပြီး ငွေရှင်းဖို့ ထပ်နှိပ်ပါ). The rest stays the existing K15-HIGH draft.
4. **The sticker wording (J60 against J56 against `DoorSheet.tsx:192`). Winning texts:**
   - J60: "Coming back? Scan your table’s sticker again."
   - J56 `seatedAtDoor`: "That table was just seated — join with their table code, or ask a server to
     seat you."
   - J56 `unavailableAtDoor`: "That table isn’t available — scan your table’s sticker, or ask a server."
5. **J64's new loop against #361's `useEndPoll`.** #361 already ships a visible-only, once-a-minute
   primitive (`lib/end-poll`, used by `TableCartProvider`'s `counterPayOutcome` ask). **The winner:**
   J64's sold-out read runs on that primitive. A second hand-rolled interval is not built.
6. **M322 against K50.**
   - **The winner:** a sold-out dish the cashier saw and paid over (K50) still fires, as today.
   - M322's compare at fulfilment leaves unfired only a dish that sold out after the read, whose id is
     not among the acknowledged ids the tap passed.
7. **M206's boundary (three phrasings in the input).** **The winner:** "seated no later than the
   settle". The SQL is `session_members.created_at <= qr_orders.created_at`; the order row is written at
   the settle (`lib/receipt.ts:98-113`).
8. **J62 against K49 ②, and the wall.**
   - The lane widening (staff-only) ships now.
   - The wall stays narrowed to `status = 'paid'` until K49 ② gives a real cancellation its own act.
     Otherwise a card-cancelled order newly sits on the public wall as "Preparing", and later "Ready" for
     a guest who is not coming. The shipped narrowing is the status quo, so waiting makes nothing worse.
9. **K49 ① against K49 ②.** The tip refund rides K49 ②'s cancel RPC. It is built after ② and is
   signed off with it.
10. **P2fq's "Uncollected" against staff's "not collected".** **Winning text:** "It can wait — the order
    stays on the floor until a manager is here." (`table.noshow.canWait`, MY: K15 draft.)
11. **J63's "on your ticket".** Guests never read "ticket". **Winning text:** "Sold out since you sent it
    — the kitchen can see that on your order."
12. **J63 and J66 are one question in two rows** (J63 on dso, J66 on res, renumbered by res
    `cf6cb76`). This decision closes both. J66 stays the canonical ID once both branches merge.

## Required corrections (the critic's; these win over every section)

**B** marks a blocking correction: the build must not ship without it.

| #   | ID                   | B   | Correction                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | -------------------- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | P2z                  | B   | Ruling #15 is conditional: "Once a phone table asks to pay at the counter … Its table page shows 'not sent · N min'". The condition is part of the ruling. Widening the age to every table re-scopes it, and it also kills the shipped mutant `p2do/age-on-every-table` (`scripts/verify-slice.mjs:31156`), whose reason is the loudness ladder. So P2z becomes a recommendation. The build is unchanged until the owner signs; if they do, that PR retires the mutant and amends PATH_DESIGN's ladder note.         |
| C2  | PD9                  | B   | The new condition makes `board-wall/all-clear-over-a-busy-kitchen` and `board-wall/all-clear-over-a-frozen-snapshot` STALE: both anchor `!frozen && kitchenIdle === true ? (`. Re-anchor both in the same commit, and add a mutant that drops the Preparing test. The spec must name where `preparing` is derived (the `orders` with `status = 'preparing'` the board already holds).                                                                                                                                |
| C3  | J57                  | B   | The change retires FOUR mutants, not three: `pdrem/counter-door-grace-dropped`, `pdrem/checkout-parked-grace-not-held`, `pdrem/checkout-counter-grace-not-held` and `checkout-verb/counter-grace-says-pay-opens` (anchored on `case "grace": return COUNTER_AFTER_UNDO;`). It also re-anchors `pdrem/checkout-counter-held-over-unsent`, which anchors the `counterDoorBlock({ … graceOpen, undoInFlight … })` call. `payOpensAfterUndo` STAYS, because Pay's own hold still uses it (`Checkout.tsx:3557`, `:5224`). |
| C4  | J59                  | B   | Six `m230/*` mutants anchor text in `lib/cart-freeze.ts`'s `sent` arm (`verify-slice.mjs:927-1000`). Changing that arm's signature or text re-anchors each of them in the same commit. `check:mutant-anchors` must be green before the push.                                                                                                                                                                                                                                                                         |
| C5  | J62                  | B   | On kfs, widening the lane breaks `lck/expo/refunded-order-bagged`, which asserts a refunded order is NOT on the lane. Retire it, invert its `expo.test.ts` case red-first, and add the `.in` mutants. The wall half is deferred (reconciliation 8), so `boardOrderLive` and its mutant stay as they are.                                                                                                                                                                                                             |
| C6  | K20                  | B   | Strike the claim "a service day at a teahouse is shorter than 12 hours": there are NO business hours in either repo (CLAUDE.md), so that is an invented fact. N = 12 h is the row's own default ("owner-set; 12 h default"), and it holds until the owner names one. The frame is also wrong to say tickets are "days old": #275's 24 h window (`lib/queue-window.ts:33`) bounds them, so the fold covers tickets 12–24 h old.                                                                                       |
| C7  | M262                 | B   | The row calls this "an owner policy — the number, and whether a settled table with an open secure tab counts", so it is a recommendation. `table_sessions` has no `closed_reason` column (no migration defines one), so the migration ADDS it. The predicate also requires no `pending` `mms_approvals` on the session's carts, since the clear supersedes them (D2) and a sweep must not strand one. The sweeper's mode-authority mutants move to the new file.                                                     |
| C8  | M288                 | B   | A new tender value changes the money record, so this is a recommendation. `qr_orders_tender_chk` (`20260806100000_w6c_terminal.sql:23`) gains `house`, and every reader that branches on tender (`lib/register-math.ts`, the tip report, both reconciles) gets a case. (b), the Clear's refusal, ships only WITH (a): alone, it leaves "They didn't come", a false no-show, as the only exit. The harness mutants on `mms_clear_counter_cart` move to the new file.                                                  |
| C9  | M140                 | B   | The row says "Owner's call — it is their sales data", so this is a recommendation.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| C10 | J58                  | B   | Who may become the table's sender is staff and table authority, and sc's row J58 is "the owner's call". So this is a recommendation. Until M168, nothing changes.                                                                                                                                                                                                                                                                                                                                                    |
| C11 | RULING#24            | B   | Ruling #24 builds an in-app refund "**only if the owner says no one else can refund in Stripe**". money.md's "B whatever the answer" contradicts that condition. The record therefore splits it: A, the missing record of who marked it done, is the ruled default, and it is built. B is a recommendation to AMEND ruling #24.                                                                                                                                                                                      |
| C12 | J63                  | B   | The KDS marks only `is_sold_out` (`lib/kitchen.ts:253, 289, 389`), never a delisting. "The kitchen can see that" is therefore true only for the `sold_out` kind, so the note renders only when `unavailable === "sold_out"`. Wording: reconciliation 11.                                                                                                                                                                                                                                                             |
| C13 | J56                  | B   | `/api/session` also answers `BIND_COPY.kioskOrder(n)` and `BIND_COPY.held(n)` (`app/api/session/route.ts:80-81`), and both end "or pick another". All four `?table=N` arms get a door form. The test pins that GuestList never renders "pick another" from any arm.                                                                                                                                                                                                                                                  |
| C14 | F29                  | B   | PATH_DESIGN D1 gives `PaymentSection.tsx` to **diner-cart**, and D5's flip is "its own PR, one commit". So F29 ships in its own diner-cart PR before the flip, never inside it. The Express element is live on pickup today, so the change is seen there first.                                                                                                                                                                                                                                                      |
| C15 | M79                  | B   | `NavDirectionSync`'s `lastRoute` is a `useRef`, not `sessionStorage` (`components/nav/TransitionNav.tsx:120`), so the tab-scoped stack is NEW state. Its carrier is ephemeral (tab `sessionStorage`, written by the new code). The staff link "← Back to the floor" does not exist: the shipped labels are `floor.back` "← Counter" and `kds.back` "← Floor" (`lib/i18n/staff.ts:151, 397`).                                                                                                                         |
| C16 | M144                 | B   | `surpriseMe`'s rule is that production arguments sit ahead of the test-only `rng` (`lib/menu/taste.ts:66-67`). So `hasPhoto` goes before `rng`: `surpriseMe(items, excludeIds, count, popularIds, hasPhoto, rng)`. `taste.ts` has no mutants yet, so this PR registers its first.                                                                                                                                                                                                                                    |
| C17 | P7d · P7e            | B   | "ကောင်တာ" is `floor.counter.chip` (`lib/i18n/staff.ts:404`). It is not `floor.status.counter`, which is "ကောင်တာမှာ ရှင်းမယ်" (`:430`). Cite the exact key. The staff manifest's `name` is composed from `lib/brand.ts`, never retyped.                                                                                                                                                                                                                                                                              |
| C18 | K50                  | B   | Reconciliation 3 applies to kfs's `settle.soldOut.warn` and `.warned` before #360 merges.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| C19 | M322                 | B   | The summary must say "a dish sold out after the read and not acknowledged" (reconciliation 6). As money.md wrote it ("a sold-out dish is left unfired"), it would leave K50's acknowledged dish unfired too.                                                                                                                                                                                                                                                                                                         |
| C20 | all SQL restatements | B   | Each restated function (M262's sweeper, M288's two RPCs, M315's two, M322's, M270 (6)'s, M316's, K49's) moves its `verify-mode-authority` and `verify-slice` mutants to the new file, as M109 → p2f did. The restatement copies the revoke/grant, and its `supabase/tests/*.sql` is named in `ci.yml`.                                                                                                                                                                                                               |
| C21 | M73                  | —   | `qr_settlement_cancellations` is written by SQL (`20260819300000_w23d_dropped_visibility.sql:241`, `20260829000000_m70_…:179`, `20260905000000_m151_…:86`). `lib/manual-capture-run.ts:88` only reads it. `cart_id` is nullable (w23d:89-97), so the list has a "no phone on file" arm.                                                                                                                                                                                                                              |
| C22 | P2dp                 | —   | The owed tile's mark has been the hollow ring in `--warn` since PD1 (`components/staff/TableStrip.tsx:336-345`). It is not a dot. The decision stands, and the row's text is updated.                                                                                                                                                                                                                                                                                                                                |
| C23 | money items          | —   | Each money section now names its carrier. New staff strings are K15 drafts, never invented. New guest strings are EN-only and ledgered.                                                                                                                                                                                                                                                                                                                                                                              |
| C24 | M234                 | —   | Close M234 in the docs follow-up after the flip merges, not inside the flip's one commit.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| C25 | M316                 | —   | `mms_add_line_note` also answers `ok` and `draft` (a draft line uses `setLineNotes`). Refusing an in-grace line is not needed.                                                                                                                                                                                                                                                                                                                                                                                       |
| C26 | P2hf                 | —   | The later "Mark served" control on the clear's refusal is a bump from the counter pane. Once D5 flips, a bump opens phone pay. So it is the kitchen's own bump path, with `KDS_UNDO_MS`, and it is part of the sign-off as an authority change, not a free follow-up.                                                                                                                                                                                                                                                |
| C27 | C24 ②                | —   | The clause also goes on `safeClaim` (`lib/dropped-view.ts:278-281`), so the two claims never disagree.                                                                                                                                                                                                                                                                                                                                                                                                               |
| C28 | J65 · J64            | —   | J64's read also returns `gone` ids (`is_active` false), with their kind, so J65's words reach a card the poll flips.                                                                                                                                                                                                                                                                                                                                                                                                 |

### Spot-checked claims (26 of the 50 checked; the rest were confirmed and are not listed)

| Claim                                                       | Ref checked                                              | Result                                          |
| ----------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------- |
| `counterDoorBlock` holds on peer or grace                   | `lib/checkout-verb.ts:153-164`                           | Confirmed                                       |
| The Send's grace is 10 s                                    | `20260622050000_undo_grace.sql:23`                       | Confirmed                                       |
| The refusal says "it’s already gone to the kitchen"         | `lib/cart-freeze.ts:495-497`                             | Confirmed                                       |
| `trackStage` returns `sending` when `fire > now`            | `lib/kitchen-track.ts:69-86`                             | Confirmed                                       |
| `LineStateChip` reads the raw state                         | `components/Checkout.tsx:5475-5476`                      | Confirmed                                       |
| `goneMark` "No longer on the menu"                          | dso `lib/i18n/cart.ts:77`                                | Confirmed                                       |
| `AddButton`'s pill says "Sold out"                          | dso `components/AddButton.tsx:574`                       | Confirmed                                       |
| YourUsual ends on "Sent"                                    | `components/menu/YourUsual.tsx:218-221`                  | Confirmed (the path is under `menu/`)           |
| `bareMenuRedirect` returns null on any mode                 | `lib/menu-entry.ts:13-28`                                | Confirmed                                       |
| `NavDirectionSync` holds `lastRoute` in `sessionStorage`    | `components/nav/TransitionNav.tsx:113-120`               | **Wrong** (it is a `useRef`): C15               |
| "← Back to the floor" exists                                | `lib/i18n/staff.ts`                                      | **Wrong** (`floor.back` "← Counter"): C15       |
| The bind copy has two "pick another" strings                | `lib/bind-copy.ts:10-23`, `route.ts:79-81`               | **Incomplete** (four arms): C13                 |
| `surpriseMe` can take `hasPhoto` after `rng`                | `lib/menu/taste.ts:62-68`                                | **Wrong order**: C16                            |
| The well is 18.75rem, top-anchored                          | `app/globals.css:17659-17674`                            | Confirmed                                       |
| Express has no `buttonType`                                 | `components/PaymentSection.tsx:793-794`                  | Confirmed                                       |
| The ceiling counts per action, default 2000                 | `p2f_…sql:832-837`, `voids_comps.sql:29`                 | Confirmed                                       |
| `resolveRefundNeeded` writes only `resolved`                | `lib/approvals.ts:306-313`                               | Confirmed                                       |
| `qr_refunds_needed` has no actor column                     | `money_atomicity.sql:135-143`                            | Confirmed                                       |
| A secured tab with sent food is refused without an approver | `m182_table_clear.sql:343-346`, `lib/floor.ts:1355-1363` | Confirmed (no `p_approver` is sent)             |
| `mms_tab_events.event` allows only three values             | `s3_discretion.sql:18`                                   | Confirmed                                       |
| The counter clear ignores comped sent lines                 | `p2f_…sql:477-483`, `lib/kitchen.ts:232-234`             | Confirmed                                       |
| The lane and wall narrow to `status = 'paid'`               | kfs `lib/expo.ts:125`, kfs `app/api/board/route.ts:219`  | Confirmed                                       |
| The KDS tag reads "before it goes out"                      | kfs `lib/i18n/staff.ts:221, 3085`                        | **Partial** (the KDS says "before cooking"): R2 |
| `table_sessions.closed_reason` exists                       | `supabase/migrations`                                    | **Wrong** (no such column): C7                  |
| The unsent age shows on asked tables only                   | `FloorDetailLive.tsx:1287`, `verify-slice.mjs:31156`     | Confirmed, mutant-pinned: C1                    |
| `ကောင်တာ` is `floor.status.counter`                         | `lib/i18n/staff.ts:404, 430`                             | **Wrong key**: C17                              |

---

## Diner decisions (guided)

### J57 — the Send's undo window and the counter door

**Frame.** `counterDoorBlock` (`lib/checkout-verb.ts:153-164`) holds the counter door for two reasons: a
tablemate's lock, and this phone's 10 s grace (`20260622050000_undo_grace.sql:23`). The docblock gives
the grace's reason as "the undo may put lines back" (`:146-149`). Since PD2's lift, though, the ask
already carries unsent dishes (`counterRestLine`, `:172-180`), and it moves no money
(`lib/counter-pay.ts`). The door is therefore live, then held for 10 s, then live again. That happens on
the sending phone only, since a tablemate's ask has no such hold.

**Options.**

1. Keep the hold and restate its reason.
2. Drop the hold on both docks.
3. Hold the door on every phone, read from `fire_at`.

**Pick and graft.** **2**, with 1's honesty: the docblock now says why the window does not hold the
counter. The ask carries drafts and moves no money. During the window, the Order stage's only control is
still the outline Undo (`orderStageHero`, `:57`).

**Spec.**

- `counterDoorBlock` becomes `frozenByPeer ? "peer" : null`, and `CounterBlock` narrows to `"peer"`.
- Delete `COUNTER_AFTER_UNDO` and `counterHoldCopy`'s `grace` arm. `payOpensAfterUndo` stays (C3).
- **Mutants (C3):** retire four, and re-anchor `pdrem/checkout-counter-held-over-unsent`. Add one that
  re-adds the grace arm and goes RED against a new test, "the counter is live inside the undo window".
- Amend m2 STATES' "Send's 10-second undo window (D16)" counter line in PATH_DESIGN (newest wins).
- No copy changes, and no Burmese.

**Carrier.** The peer lock is durable (`locked_at`).

### J59 — what a dish inside the undo window is called

**Frame.** Inside the grace, the server's `not_draft` refusal reads "it’s already gone to the kitchen"
(`lib/cart-freeze.ts:495-497`). The /cart chip and the line sub-label say "Sent to kitchen"
(`Checkout.tsx:5475-5476, 5732`). The One Pass says "Sending…" (`trackStage`). So one dish gets two
words at the same moment.

**Options.**

1. Use the stage-true words everywhere.
2. Make past tense the rule.
3. Use a neutral clause.

**Pick and graft.** **1**. Where this phone's own Undo is drawn, the clause adds the way out.

**Spec.**

- **The clause in the window:** "it’s on its way to the kitchen".
- **With this phone's grace open:** "it’s on its way to the kitchen — Undo brings it back for a moment".
- **After the window:** "it’s already gone to the kitchen", unchanged.
- The chip and the sub-label read `DINER_STAGE_WORD[trackStage(...)]` for fired lines. The chip reuses the
  shipped `sending` Burmese (`lib/i18n/cart.ts:56`).
- The two clauses are EN-only and go in the K15 ledger.
- **Mutants:** a new one that swaps `sending` for `sent`. The six `m230/*` mutants are re-anchored (C4).
- Builder: diner-cart, in the first PR after #362, since all three lifecycle PRs touch `Checkout.tsx`.

**Carrier.** Server-backed: each line's `fireAt` against the view's server clock. This phone's grace is
ephemeral (`useUndoGrace`).

### J63 / J66 — a sent dish whose item has since sold out

**Frame.** After a dish is 86'd, its diner surfaces still read "Sent to kitchen" or "Cooking".
`getCartView` carries `soldOut` and its kind (dso `lib/cart.ts:1066-1067`), and the KDS shows "Sold out"
on the line (`KdsBoard.tsx:2508-2513`). Under J66's rule, every word on TableTimeline is a kitchen tap.

**Options.**

1. Say "The kitchen is checking on this one". This promises an act nothing records.
2. Say nothing until staff act.
3. Show a factual note outside the timeline.

**Pick and graft.** **3**, with 1's warmth and 2's restraint. The note shows only on the **Sent** stage
(after the grace, before Cooking), and only for the `sold_out` kind (C12).

**Spec.**

- Under the line on /cart and on the One Pass dish row, a quiet `--t3` line that is not a live region:
  **"Sold out since you sent it — the kitchen can see that on your order."**
- Not on TableTimeline. EN-only, and in the K15 ledger.
- Add a pure `lib/dish-sold-out.ts::sentButSoldOut(line, nowIso)`, with a mutant.
- Close both J63 and J66 (reconciliation 12).

**Carrier.** Server-backed: `soldOut` and its kind from `getCartView`, never optimistic. The stage comes
from the server's `fire_at` and `bumped_at`.

### J65 — the short word for a delisted dish

**Frame.** The /menu card and `AddButton` say "Sold out" for a delisted dish too (dso
`components/AddButton.tsx:574`, `components/menu/MenuBrowser.tsx:954, 1015`). /cart already tells the two
kinds apart.

**Options.**

1. A short form of the full truth.
2. "Unavailable".
3. "Gone".

**Pick and graft.** **1**, worded as the staff pad's shipped "off the menu" (reconciliation 1). The card
line carries the full sentence.

**Spec.**

- Carry the kind through `soldOutMarks` and `cartSoldOutReading`.
- The pill reads "Off the menu"; the card line reads "· No longer on the menu"; `ItemSheet`'s CTA reads
  "No longer on the menu".
- Keep one predicate, `dishUnavailable`.
- No new Burmese: the shipped `goneMark` and `pad.err.add.gone` share it.

**Carrier.** Server-backed (the catalog read, or a `gone` refusal). The mark is an ephemeral overlay.

### T43 — what "your usual" says when an add cannot be confirmed

**Frame.** The card ends on "Sent" when an add's answer was never seen
(`components/menu/YourUsual.tsx:218-221`). A host restoring a line's quantity also forges a `none`
landing, so the card re-sends (`lib/add-landing.ts` `dishDeltas`; `lib/write-outcome.ts:77`). The row's
quick fix turned 16 of 57 provider tests red.

**Options.**

1. Copy first, with the classification scoped to this card's loop.
2. Server evidence first (an applied delta, or an idempotency key).
3. Gate the card on a visible lock. This brings back T14's trap.

**Pick and graft.** **1 now, 2 as the durable end.** 3 is rejected.

**Spec.**

- **When any dish is unconfirmed, the final label is "Check your order":** a `TransitionLink` to /cart
  that can never re-add.
- **When all are confirmed:** "Added ✓".
- **The live line:** "We couldn’t confirm {dishes} — check your order before adding them again." Under a
  lock, the existing `refusedWriteClause` is inserted before "Check your order…".
- **The accessible name:** "Check your order — we couldn’t confirm {dishes}".
- `recoveredWrite` gains `{ via }`. Only YourUsual maps a recovery `refused` to unconfirmed, so
  `addShortfallNotice` is untouched.
- **Mutants:** two, one for "Sent" and one for resuming on a recovery `none`.
- EN-only. Option 2's key is a schema change, on the owner's go.

**Carrier.** The unconfirmed tally is ephemeral and per cart. The truth it points at is server-backed.

### J27 — a bare /menu and /grocery

**Frame.** F9 already answers a bare /menu: `bareMenuRedirect` sends it to `/`, or to dine-in when it
carries `t` or `j` (`lib/menu-entry.ts:13-28`). What is left is an explicit `/menu?mode=scango`, the only
remaining door to food on the market basket (M286).

**Options.**

1. Bare → /grocery.
2. Keep the picker, and redirect `scango` → /grocery.
3. Leave both.

**Pick.** **2**. This is `menuHref`'s own rule (`lib/menu-href.ts:28-32`), applied at the door.

**Spec.**

- When `mode === "scango"`, return `/grocery`, keeping `?tab=`.
- Add a test and a mutant.
- Close the row's `/menu` half as "F9 shipped the door-picker answer".

**Carrier.** None (a server redirect).

### J29 — the appended undo, drain and sign-in lines

**Frame.** v7.2 has no string for these:

- `UNDO_UNCONFIRMED_NOTE` and `_FINAL` (`components/useUndoGrace.ts:124-126`);
- `DRAIN_TIMED_OUT_NOTICE` (`lib/write-ledger.ts:67`);
- the sign-in refusal.

§9 already says there is nothing to copy verbatim.

**Options.**

1. Keep them.
2. Add them to the prototype. §9 forbids this.
3. Re-word them toward v7.2.

**Pick.** **1**. Each line's promise was checked against its code: the retry and the one more ask
(`useUndoGrace.ts:116-121`), and the drain's re-await (`write-ledger.ts:53`).

**Spec.** No code. Close J29, citing §9, and ledger the four lines as "EN-only, no draft".

### J58 — an invitee who reloads a hostless table (recommendation, owner sign-off)

**Frame.** A reload strips `joinOnly`, so the W6a claim (`app/api/session/route.ts:597-617`) makes an
invitee the host for good. The code says that was already "one URL away", because the invite code is the
sticker token (`:620-633`).

**Options.**

1. The role follows the door, carried on the member row once M168 makes codes per-visit.
2. Whoever joins first by any door becomes host.
3. The status quo.

**Recommendation.** **1, built inside M168's PR.** Until then, restate the W6a comment honestly. A guest
at a hostless table already reads "A server will send these to the kitchen — or pay at the counter."
(`lib/checkout-verb.ts:122`).

**Spec.**

- **Migration:** `session_members.joined_via text check (joined_via in ('sticker','invite','staff'))`,
  inside M168's file.
- The claim also requires `joined_via is distinct from 'invite'`. A row from before the migration is
  backfilled `NULL`, read as "unknown": it may claim, the same as today, so a member who used the
  sticker before the migration landed is never locked out by a reload (Codex on #357). Only rows minted
  after it carry `invite`.
- SQL tests: a reload keeps the invitee a guest, and an active pre-migration member (`joined_via` NULL)
  can still claim; plus a mutant.

**Carrier.** Durable (the member row). Today's carrier, the URL's `j`, is ephemeral, and that is the bug.

### J60 — host hand-off when the sender leaves

**Frame.** A leave is device-only, and `host_seat` moves once and never back (M169, W20). #361 already
warns the sender (st `components/DoorSheet.tsx:222-226`), and the leave is reversible by re-scanning.

**Options.**

1. Automatic hand-off.
2. An explicit "Pass sending to {name}".
3. No hand-off.

**Pick.** **3**, applying W20 and M169's recorded rules. The warning also names the way back.

**Spec.**

- After #361's shipped sentence, add: **"Coming back? Scan your table’s sticker again."**
  (reconciliation 4).
- EN-only, and in the K15 ledger.

**Carrier.** Durable (`session_members`, `host_seat`).

### J64 + T45 — keeping an open /menu fresh about sold-out dishes

**Frame.** A foreground /menu learns of an 86 only when the diner taps Add. It re-reads on wake, on a
pull and on Refresh (`components/PullToRefresh.tsx:221-241`). The withdrawn fix re-rendered the whole
route.

**Options.**

1. A 90 s full `router.refresh()`.
2. A narrow visible-only read of the sold-out ids.
3. Push (M300).

**Pick and graft.** **2 now, 3 as the end.** The read pauses while a sheet's write is in flight, and it
shows no toast.

**Spec.**

- `lib/dish-sold-out.ts::readSoldOutIds()` returns the sold-out and the inactive ids, each with its kind
  (C28).
- It runs on #361's `useEndPoll` (reconciliation 5), merging into `soldOutMarks` (freshest wins).
- T45: record the measured requests per open phone after the merge. Delete the poll when M300 lands.

**Carrier.** Server-backed reads. The marks are an ephemeral overlay.

### M138 — dietary pills

**Pick.** Keep the sheet (the owner's M137 words, `MenuBrowser.tsx:731-736`). The other options were a
bare rail, which costs a sticky row, and pills that collapse on scroll, which gives one control two
vocabularies. Close the row.

**Carrier.** Per-viewer convenience.

### M144 — should Surprise prefer photographed dishes

**Options.**

1. Prefer photographed dishes.
2. At most one placeholder per hand.
3. Leave the draw random.

**Pick.** **2**: the smallest bias, and the card's claim is unchanged.

**Spec.**

- `surpriseMe(items, excludeIds, count, popularIds, hasPhoto, rng)` (C16). `refillSurprise` gets the same
  cap.
- Add a test, and the first mutant in `taste.ts`.

**Carrier.** Ephemeral.

### M79 — the back-navigation policy

**Frame.** "Back to the start", /track's "Back to your order" (`app/track/page.tsx:249`) and staff's
`floor.back` "← Counter" all push. `TransitionLink` already replaces on the same pathname
(`components/nav/TransitionNav.tsx:57-69`).

**Options.**

1. `history.back()` always.
2. `replace` always.
3. Pop when the previous in-app entry is the target, otherwise replace.

**Pick.** **3**.

**Spec.**

- Add a `BackLink`.
- `NavDirectionSync` keeps a NEW short tab-scoped stack in `sessionStorage`, wrapped in try/catch. An
  empty stack falls back to replace (C15).
- The four links adopt it, with their labels unchanged.
- Add a test per branch, plus a push mutant.

**Carrier.** Ephemeral (tab `sessionStorage`).

### K48 — kitchen guide step 5's crop

**Frame.** The sheet's kitchen well is 18.75rem and top-anchored (`app/globals.css:17659-17674`). The stop
card is 369–535 px tall, so "Got it" is cut off.

**Options.**

1. A per-step anchor.
2. A taller well.
3. Scale the picture down.

**Pick.** **1**.

**Spec.**

- `anchor?: "start" or "end"`, with `.guide-well[data-anchor="end"] { justify-content: flex-end; }`.
- Step 5 uses `end`.
- Add a test and a mutant, and re-measure at S, M and L in both languages.

**Carrier.** Static.

### F29 — Express `buttonType` and order

**Options.**

1. `plain` for both.
2. `buy`.
3. `check-out`.

**Pick.** **1**: one hero verb per state. The order is `["apple_pay", "google_pay"]`.

**Spec.**

- `options={{ buttonHeight: 48, buttonTheme, buttonType: { applePay: "plain", googlePay: "plain" }, paymentMethodOrder: ["apple_pay", "google_pay"] }}`
  (`components/PaymentSection.tsx:793-794`).
- Add a test.
- **Builder (C14):** diner-cart, in its own PR before the flip.
- The "what we accept" sentence still names only the wallets the post-flip proof shows (PATH_DESIGN round 3).

**Carrier.** None.

### M286 — may a scan-and-go cart hold food

**Frame.** `addItem` admits food on scango, tagged `togo` (`lib/cart.ts:81-105`), and this is the S4
unified-basket design. But `readGroceryLines` lists only grocery lines, so /grocery's subtotal leaves out a
dish `computeTotals` charges.

**Options.**

1. Refuse food on scango.
2. Keep the model, and list every charged line.
3. Both.

**Pick.** **2**. The subtotal shown must be the subtotal charged (§8). J27 closes the only door.

**Spec.**

- `readBasketLines`, with a second group headed "From the kitchen" (EN-only, ledgered).
- The subtotal comes from the same `computeTotals` snapshot.
- Update `grocery-lines.test.ts`, and add a mutant.
- Open check for the build: confirm that such an order gets a bag code on /track before shipping the
  header.

**Carrier.** Server-backed.

### J56 — "pick another" with no picker

**Options.**

1. Link to a chooser. None exists.
2. Door-specific tails.
3. One rewritten sentence.

**Pick.** **2**. The tails cover all four `?table=N` arms (C13, reconciliation 4).

**Spec.**

- `seatedAtDoor`, `unavailableAtDoor`, `kioskOrderAtDoor(n)` ("Table {n} has a kiosk order in progress —
  ask a server.") and `heldAtDoor(n)` ("A server has Table {n} open — ask them to seat you there.").
- The bind sheet keeps its shipped strings.
- EN-only, ledgered. Add a GuestList test.

**Carrier.** Server-backed (the route's reason).

## Staff decisions (glanceable)

### K50 — a sold-out draft at the register

**Frame.** The kfs doctrine is `lib/settle-sold-out.ts:3-48`: name the dish above the doors with Remove
first, carry the displayed ids per tap, and refuse `sold_out_unseen` only for a dish the tap did not show.

**Options.**

1. Re-warn, as built.
2. Hard refusal. The owner has ruled against this (PD8, decisions 3 and 5a).
3. Auto-remove. This is silent.

**Pick.** **1**.

**Spec.** No logic change. The copy follows reconciliation 3 (C18). Close K50.

**Carrier.** The sold-out fact is durable. The acknowledged ids are ephemeral per tap, and the server
re-derives the verdict.

### K51 — ask before a clear drops unsent dishes

**Pick.** Keep the window and its words: "{n} more not sent — they're dropped, not counted as a loss" (kfs
`ClearTableButton.tsx:552-562`). A confirm would make the clear wait, against ruling #6. A loss record
for drafts would be false. Close.

**Carrier.** The window is ephemeral, and nothing is written until it closes (`lib/clear-window.ts:1-4`).

### J62 — a fully refunded takeaway

**Frame.** On kfs, the KDS reads `status in (paid, refunded)` and tags the card (`lib/kitchen.ts:261`).
The lane and the wall narrow to `paid` (`lib/expo.ts:125`, `app/api/board/route.ts:219`). So a card full
refund vanishes from both, while a cash one (still `paid`, M308) is tagged.

**Options.**

1. Treat it as a cancel.
2. Tag it, whatever the tender.
3. Tag it according to the refund's reason.

**Pick and graft.** **2**, with 1's point that a cancel is its own act (K49 ②).

**Spec.**

- `lib/expo.ts`: `.in("status", ["paid","refunded"])`. Retire and invert `lck/expo/refunded-order-bagged`
  (C5).
- The wall widening waits for K49 ② (reconciliation 8).
- Add a parity case asserting the same verdict (reconciliation 2).
- No new copy.

**Carrier.** The refund state is durable and server-derived on each poll. The tag is never stored.

### K49 — "Can't make it" for a paid dish; cancelling a bag

- **① Tip (recommendation, owner sign-off).** Refund the tip only when no dish on the order can be made:
  "Tip $X goes back too — nothing was made". It rides ②'s RPC (reconciliation 9).
- **② Cancel the bag (recommendation, owner sign-off).**
  - A manager-gated "Can't make it — cancel and refund" on the bag's ⋯ (MY: K15 draft).
  - The sheet names every dish and the amount, uses the "approve what you saw" set compare, and needs a
    manager PIN.
  - One RPC removes the lines, refunds through the approvals path (M313), writes M306's stop record, and
    sets `togo_status = 'cancelled'`. Today `mms_set_togo_status` knows only preparing → ready →
    picked_up (`20260624000000_s4_togo_fulfillment.sql:178`), and the CHECK allows only those three
    (`:11`).
  - Three migration files.
- **③ Decided:** keep the tag. A refund never removes food from the KDS.

**Carrier.** Durable, in one transaction. The sheet's snapshot is ephemeral and re-checked in SQL.

### K20 (+K28) — the age fold

**Frame.** The 24 h window (`lib/queue-window.ts:31-33`) is a bound on garbage. Between 12 and 24 h, a
stale ticket still counts in `kdsLateCount` (res `lib/kds-urgency.ts:53`), re-chimes, keeps
`kitchenIdle` false (`lib/board-tables.ts:359`), and skews K28's average.

**Options.**

1. A nightly close. This needs business hours, and none exist.
2. A client fold at N hours.
3. Auto-finish. This writes a false `bumped_at`.

**Pick.** **2**, with N = 12 h, the row's default until the owner names N (C6).

**Spec.**

- `STALE_TICKET_MS` and `staleTicket(dueIso, nowIso, held)`, measured on the due time, and `false`
  whenever the ticket is held: a held pickup can sit past its scheduled time (`kdsTicketLevel` already
  handles that case), and food the kitchen has never accepted is never folded out of the late count
  (Codex on #357). A regression case: an overdue held ticket 13 h past due stays unfolded.
- One `--t2` row, "Older than 12 hours · {n}" (`kds.fold.old`, MY: K15 draft grounded on `kds.age.hm`).
  Tap to expand.
- Folded tickets are excluded from the late count, the chime, Oldest and Avg, and `kitchenIdle`.
- Add a mutant per exclusion, plus the 12 h boundary.
- **K28:** `and fire_at >= now() - interval '12 hours'` in `mms_kds_stats`
  (`20260716000000_w3_kitchen.sql:573`), with a red-first SQL test. One file, on the owner's go.

**Carrier.** Derived from durable timestamps on the DB clock. The fold's open state is ephemeral.

### M316 — a kitchen note after Send

**Frame.** `setLineNotes` is guarded to drafts in the UPDATE (`lib/staff-cart.ts:312-319`).

**Options.**

1. Edit in place.
2. Append once, never edit.
3. Remove and resend.

**Pick.** **2**.

**Spec.**

- **Migration:** `notes_added text check (char_length <= 160)` (the `notes` bound,
  `20260716000000_w3_kitchen.sql:33`) and `notes_added_at`.
- `mms_add_line_note`: SECURITY DEFINER, revoked from public, granted to service role. It is guarded in
  the statement to `state in ('fired','in_progress') and notes_added is null`, and answers
  `ok`/`draft`/`served`/`already`/`not_found` (C25). It comes with a SQL test.
- A staff action `addLineNote` with `.select("id")`.
- The table page offers "Add for the kitchen".
- The KDS shows "Added after sending: {text}" in the note band, with one chime (MY: K15-HIGH draft).
- A device check at the sitting.

**Carrier.** The addition is durable. "New since you looked" and the chime are ephemeral.

### M262 — auto-close after the bill is paid (recommendation, owner sign-off)

**Frame.** A paid party's session holds its table number for up to 4 h. The sweeper is
`mms_sweep_expired_sessions`, last restated in `20261001000000_p2f_counter_cook_before_paid.sql:337`.

**Options.**

1. Always auto-close.
2. Auto-close only when a free clear would record nothing.
3. Never auto-close.

**Recommendation.** **2**, with N = 20 min after the later of the last payment and the last cart
activity. An open card-on-file bill blocks it, and so does any pending approval (C7).

**Spec.**

- One migration: the sweeper's dine-in arm, `SETTLED_IDLE` named once, and a NEW `closed_reason` column
  with `paid_idle`.
- **The close is atomic with cart creation** (Codex on #357). The sweeper's `FOR NO KEY UPDATE` does not
  block a new `qr_carts` insert (the FK takes only a key-share lock), so a point-in-time predicate can
  close a session while a diner starts a round. The cart insert path takes the session row
  `FOR UPDATE` and refuses a closed session, and the sweeper re-checks "no open cart" under its own
  `FOR UPDATE` on that row, so one of the two always wins cleanly.
- SQL tests: close at 20, not at 19, and not with a draft, an open card-on-file bill, a dish cooking, or a
  pending approval; plus a two-connection race (start a round while the sweeper closes) in the
  `verify-*-race` harness shape, red-first.
- The mode-authority mutants move to the new file (C20). No UI copy.

**Carrier.** Durable and server-only (cron).

### M288 — a fully comped, served counter order (recommendation, owner sign-off)

**Frame.**

- `settleCash` refuses a cart with nothing chargeable (`lib/staff-cart.ts:451-459`).
- `mms_clear_counter_cart` counts as sent only uncomped lines (`p2f_…sql:477-483`; TS twin
  `lib/counter-order.ts:87-89`). So it clears such a cart as `ok` and cancels it.
- The KDS reads `open` and `paid` carts only (`lib/kitchen.ts:232-234`), so cooking food drops off with no
  record.

This is a defect on main (`defects.md`).

**Options.**

1. Today's clear.
2. A no-show. This would be false.
3. "Hand over · on the house", a $0 order.

**Recommendation.** **3**.

**Spec.**

- **(a)** `mms_fulfill_cash_order` accepts a comp-only cart and snapshots its lines at $0 with tender
  `house`. The tender CHECK grows, and the readers get a case (C8).
- **(b)** The clear refuses `sent_free`: "Hand it over on the house instead of clearing it." (MY: K15
  draft.)
- (a) and (b) ship together.
- The till door reads "Hand over · on the house" (`settle.house.cta`, MY: K15-HIGH draft grounded on
  `table.line.comped` အခမဲ့).
- The receipt reads "On the house" at $0 and never "Paid in full".
- Mutants on each arm, and the harness mutants move (C20).

**Carrier.** Durable, in one transaction.

### P2fq — remote approval for a no-show

**Options.**

1. A remote request.
2. Any staff, recorded as unapproved. This contradicts ruling #6.
3. Wait, and say so honestly.

**Pick.** **3**.

**Spec.** On the no-show sheet only, under `pin.manager.noneNote`
(`components/staff/ManagerPinStepUp.tsx:372-375`), add reconciliation 10's line. Keep the row open as
"follow-up only if reported".

**Carrier.** The roster read is server-backed. The order is durable.

### P2gn — bulk removal

**Pick.** One at a time. After an `ok`, focus moves to the next not-collected order's door, or to the list
heading when none is left. Bulk would weaken "approve what you saw" (`lib/voids.ts:259-271`).

**Carrier.** Focus is ephemeral. Each write-off is durable.

### M270 ② — B9's in-slot Undo against PD7's alternative

**Pick.** Ratify PD7: leaving the pane drops the clear and says so (kfs `lib/i18n/staff.ts:4209`). B9
would commit a durable write off-screen from an ephemeral timer, and committing on leave would turn a
navigation into a write. Docs only.

**Carrier.** Ephemeral window. The floor is server-read.

### P2z — ruling #15's scope (recommendation, owner sign-off)

**Frame.** The age shows only on an asked table (`FloorDetailLive.tsx:1287`), and
`p2do/age-on-every-table` pins that. Ruling #15 is conditioned on the ask (C1).

**Options.**

1. Narrow, as built.
2. Every host table's page.
3. The floor card too.

**Recommendation.** **2**, if the owner re-scopes ruling #15. The PR would retire the mutant and amend the
ladder note. Until then: **1**.

**Carrier.** Durable `created_at` against the server clock.

### PD9 — the wall's "All clear"

**Options.**

1. Keep it.
2. Show it only when no code is Preparing either.
3. Re-word it.

**Pick.** **2**.

**Spec.** In `ReadyBoard.tsx:560`, add `preparing.length === 0`. The board's own orders are capped
(`BOARD_ORDER_CAP`), and M330 shows an older real bag can fall outside the cap, so a derived empty list
is not proof (Codex on #357). **M330 lands first** (baskets excluded in the query, so the cap holds
real bags), and `/api/board` also returns an uncapped `preparingExists` verdict (a `count` with
`head: true`) that the wall reads instead of its list. Re-anchor the two board-wall mutants, and add one
for the verdict (C2).

**Carrier.** Server-backed poll.

### PD12 — K15-HIGH candidates in the guides

**Pick.** Add `help.guide.counter.cash`, `.clear` and `help.guide.kitchen.stop`
(`lib/i18n/staff.ts:2800, 2807, 2835`) to `STAFF_K15_HIGH` (`:4559`), with a reason comment on each.
`check-staff-lang` stays green.

**Carrier.** Static.

### The kept-as-built staff calls

**P2aw · P2ax · P2ay · P2az · P2ba · P2dp · P2dq · P2dn · P6b · C24 ③.** Each is closed as built, and the
three options were weighed in `staff.md`.

- **P2aw:** quiet singles; only a multiple is lit (`KdsBoard.tsx:2489`).
- **P2ax:** "Mark sold out" stays on the line's ⋯.
- **P2ay:** no idle close (`KdsBoard.test.tsx:1003`).
- **P2az:** put-back stays at /staff/menu.
- **P2ba:** no catalog allergens; the note band and M316 carry the case that matters.
- **P2dp:** both marks stay ("N not sent" in bold `--warn`, and the tile's hollow ring, C22). The device
  sitting confirms.
- **P2dq:** the refund chip stays muted (history).
- **P2dn:** cooked refunded lines stay "Kitchen done" (`lib/floor.ts:320-324`).
- **P6b:** the KDS liveness stays `status = 'active'`, and K20's fold absorbs ghosts. Close into K20.
- **C24 ③:** keep every staff plain word, and the K15 sitting checks the Burmese.

The carriers are as built: static CSS, durable marks, and server reads.

### P2gf — Cancel on the lock screen

**Options.**

1. A Cancel on the lock screen.
2. No Cancel, with the line naming the real way.
3. Hide the chip.

**Pick.** **2**.

**Spec.** `settle.reader.chip.blind.locked`: "Can’t reach the card processor — the reader may still be
live. Hold on, or unlock to cancel it." (MY: K15-HIGH draft.) It comes from the shipped
`settle.reader.chip.blind` (`lib/i18n/staff.ts:1967-1969`) with its last clause rewritten. Add a component
case.

**Carrier.** The reader is server-polled. The lock is per device.

### M140 — the public sales ranking (recommendation, owner sign-off)

**Recommendation.** Send only the top 24 ids, `POS_PREFERENCE_MAX` = 2 × `POS_BADGE_MAX` (12,
`lib/menu/posPopular.ts:45`). Today `app/(order)/menu/page.tsx:141` sends the full order. Dishes past rank
24 become unranked for the draws. Add a test that the payload holds no id past 24.

**Carrier.** Server-rendered.

### P7d · P7e — the manifest's staff shortcuts

**Pick.** Option 3: a second manifest under /staff. Its shortcuts are:

- "မီးဖိုချောင် · Kitchen", from `kds.title`, owner-verified (`lib/i18n/staff.ts:150`);
- "ကောင်တာ · Counter", from `floor.counter.chip` (`:404`, C17).

The `name` comes from `lib/brand.ts`. The guest manifest (`app/manifest.ts:74-75`) drops both staff
entries, and a test pins that no `/staff` url remains. A runbook step re-installs each staff tablet at the
sitting.

**Carrier.** Static.

### P7i — a swallowed PIN read

**Pick.** `staffHasPin` (`lib/staff-pin.ts:115-126`) returns `"yes"`, `"no"` or `"unknown"`. On
`unknown`, the Lock circle renders `aria-disabled` with "Couldn't check your PIN — reload to lock"
(`shell.lock.unknown`, MY: K15 draft). Add one case per arm.

**Carrier.** A server read per render.

### C24 ② — "approved, not charged yet" (recommendation, owner sign-off)

**Recommendation.** "Your card is approved, not charged yet — your bank may show it as pending."
(`lib/dropped-view.ts:274`). Add the same clause to `safeClaim` (`:280`, C27). EN-only.

**Carrier.** Derived from the PaymentIntent's state.

### M308 — the cash full refund's status (recommendation, owner sign-off)

**Recommendation.** No flip. A fully refunded tipped cash order never reaches `total_cents`, because the
refund pool excludes the tip, so a flip would not fix it anyway. Every reader left on `status` moves to
`summarizeRefund` in the same PR. That includes the nightly pilot count: `bucketByChannel`
(`lib/pilot.ts`) takes only `{status, mode}` and counts every `paid` row, though its own contract excludes
fully refunded orders (Codex on #357). The PR audits every status-only consumer and gives each the
refund state. Today `mms_refund_cash_line` leaves the status `paid`
(`20260916000000_m218_cash_refund_line.sql`).

**Carrier.** Durable rows; the state is derived on read.

## Money and authority recommendations (signed off 2026-10-18)

The owner signed every recommendation below on 2026-10-18 ("go ahead with all recommended decisions
and migrations", The owner's words). Build them; each migration still goes to prod one file at a time
(ruling #5). Where a section names a "today" behaviour, that is the state the build replaces, not a hold.

### M315 — what the $20 PIN ceiling counts

**Frame.** The loss is price × qty, gated per action (`p2f_…sql:832-837`;
`20261008120000_m184_…sql:189-193`; default 2000, `20260622060000_voids_comps.sql:29`). Splitting a line
dodges the ceiling.

**Options.**

1. Per action.
2. A running total per line.
3. A running total per table visit.

**Recommendation.** **3**: "no more than $20 of unapproved loss per table". The table clear's own
`unapproved` records stay outside it.

**Spec.**

- `p_qty` splits the line inside the RPC.
- The running total of `gate_reason = 'solo'` approvals of sent dishes, under the cart lock, in
  `mms_void_line` and `mms_request_approval`.
- SQL tests: under the total, over it, and a split that cannot dodge it.
- A "1 of 3 off" signal on the KDS.
- One migration. The mutants move (C20).

**Carrier.** Durable (`mms_approvals` rows), summed in the statement.

### M322 — a dish sells out after a card door's read

**Options.**

1. The refund path.
2. Manual capture on the reader.
3. Refuse and refund the whole order.

**Recommendation.** **1**. The compare runs inside `mms_fulfill_cash_order` and `mms_fulfill_order`. A
dish that sold out after the read, and was NOT acknowledged (C19), is left unfired, and a "refund owed"
row goes on the manager's list for `refundLine` (`lib/refunds.ts:364`).

**Spec.** One migration together with M318, with revoke/grant and a SQL test in `ci.yml`. The doors' reads
are on kfs (`lib/staff-cart.ts:486, 816`; `lib/terminal.ts:195`), and the reader captures automatically
(`lib/terminal.ts:226` on main).

**Carrier.** Durable (the refund-owed row).

### M206 — Stars for a counter settle

**Options.**

1. No Stars, as today.
2. The cashier picks who earns.
3. The guest claims it on the receipt link.

**Recommendation.** **3**. One claim per order (`earned_by is null` under the row lock), only for a member
seated no later than the settle (reconciliation 7), through `mms_earn_on_fulfill`
(`20260714000000_k3b_stars_merge.sql:52`).

**Spec.** `mms_claim_counter_order`, service-role only, with mutants and a SQL test. The guest sees "Add
this meal to my Stars" (EN-only). M309's column revoke lands first.

**Carrier.** Durable (`earned_by`).

### M234 — does D5 retire authorize-then-capture

**Recommendation.** Retire it. The D5 served gate (`app/api/stripe/create-intent/route.ts:295-341`) answers
"never made it to the table" at the door, so there is no capture job and no lapsing hold. Close it in the
docs follow-up after the flip merges (C24). No migration.

**Carrier.** None.

### P2hf — ratify the paid-unserved hold

**Recommendation.** Ratify it as a named addition to ruling #6, which covers unpaid sent food. Paid food is
not a loss. `mms_clear_table` answers `paid_unserved` (`20261009120400_m182_table_clear.sql:246-258`). The
later "Mark served" on the refusal is the kitchen's own bump path, and it is part of this sign-off (C26).
No migration.

**Carrier.** A server refusal.

### M270 (6) — a secured tab declined after the party left

**Frame.**

- `mms_clear_table` refuses `secure_tab` without an approver (`m182_table_clear.sql:343-346`), and the app
  never sends one (`lib/floor.ts:1355-1363`).
- The decline goes only to `console.error` (`lib/staff-cart.ts:888-897`).
- `mms_tab_events` allows `opened`, `secured` and `closed` only (`20260623040000_s3_discretion.sql:18`).

**Recommendation.**

- A Stripe verdict (`declined`, `no_method`, `needs_action`, never `unknown`) is recorded. It then unlocks
  the walkout under ruling #6, recorded as `unapproved`, with the decline as its reason.
- A manager write-off stays the second way out.
- One migration: the CHECK gains `declined`. SQL tests: a decline then a clear passes; an unknown outcome
  refuses; a line added after the decline refuses.

**Carrier.** Durable (the `mms_tab_events` row).

### M72 / PICKUP_MANUAL_CAPTURE — re-scope gate ②

**Recommendation.** Rewrite gate ② (`docs/ENV.md:47`) as "M72b landed, M72c's timeout measured, and M73's
list shipped". M72 becomes a recorded leftover risk, since every window it leaves open ends no worse than
today's automatic capture. ① and ③ are unchanged, and C2 comes first. M72b's later migration restates
revoke/grant.

**Carrier.** Config (env flag).

### M111 — the kiosk and board staff session at cutover

**Recommendation.** In the C2 cutover PR, set the console lock when a staff sign-in is seen on a
`DEVICE_SURFACES` path (`components/AnonAuthGate.tsx:39`). The owner accepted the risk for test-card
testing, and that reason ends at live keys. Ruling #14 already defines the unlock. Add a test, a mutant and
an ENV.md step.

**Carrier.** The lock cookie, durable per device.

### S11 — reader tips

**Recommendation.** Keep the reader tip-free (`lib/terminal.ts:263`) until it is connected (ruling #26).
After that, add "Reader tips" as a breakdown inside the reader column, the way cash tips sit inside cash
(`lib/register-math.ts:35-39, 87`), credited to `settled_by`. Both reconciles accept base + tip ==
amount, with one migration for the fulfil sum check.

**Carrier.** Durable (`tip_cents`).

### RULING#24 — who refunds in Stripe

**Frame.** `resolveRefundNeeded` (`lib/approvals.ts:306-313`) writes only `resolved: true`, with no actor,
no timestamp and no row check. `qr_refunds_needed` has no such columns
(`20260622010000_money_atomicity.sql:135-143`).

**Recommendation (C11).**

- **A, the ruled default, is built now:** `resolved_by uuid`, `resolved_at timestamptz`, and
  `.select("id")` with a row check. One migration.
- **B is a recommendation to amend ruling #24:** an in-app "Refund this charge", modelled on
  `refundLine`, built whatever the answer to "who else can refund in Stripe?".

**Carrier.** Durable columns.

### M73 — an SMS vendor

**Recommendation.** No vendor yet. Build a manager-read list of today's `qr_settlement_cancellations`
with the cart's phone, read with the service role and never sent to analytics. The phone was collected
"for staff contact about a live order" (`lib/pickup-contact.ts:12-13`). The list has a "no phone on file"
arm for a null or swept cart (C21), and its strings are K15 drafts. It ships with the manual-capture flip.
No migration.

**Carrier.** A server read of durable rows.

## What still goes to the owner

**The sign-offs (20) — signed 2026-10-18.** The owner's sign-off covers all twenty (The owner's words).
They are listed here as the record of what was signed, not as open questions.

1. **M315:** the per-table running total and the partial-qty void.
2. **M322:** the refund path for card doors.
3. **M206:** guest-claimed Stars on the receipt link.
4. **M234:** retire it when D5 flips.
5. **P2hf:** ratify PD7's paid-unserved hold, and the later counter "Mark served" (C26).
6. **M270 (6):** a recorded decline unlocks the walkout.
7. **M72:** re-scope gate ②.
8. **M111:** the console lock at cutover.
9. **S11:** reader tips after S12.
10. **RULING#24 B:** amend ruling #24. A, the ruled default, is built regardless.
11. **M73:** a staff call list, with no vendor.
12. **K49 ①:** refund the tip when nothing can be made.
13. **K49 ②:** "Can't make it — cancel and refund" with a `cancelled` bag.
14. **C24 ②:** "your bank may show it as pending".
15. **M308:** no status flip.
16. **M288:** the $0 "on the house" order, with its new tender.
17. **M262:** auto-close, the number (20 min) and the secure-tab rule.
18. **M140:** ship only the top 24 POS ids.
19. **P2z:** re-scope ruling #15 to every host table.
20. **J58:** an invitee stays a guest across a reload.

**One question for the owner:** "Who besides you can refund in Stripe?" It is still UNKNOWN (ruling #24),
and it decides whether C applies on top of RULING#24's B.

**Each migration's go, one file at a time** (ruling #5; #21 covers M168).

- **Decided designs:**
  - K28, the `mms_kds_stats` predicate;
  - M316, the note columns and `mms_add_line_note`;
  - J64's end state, M300 (`menu_items` on the publication);
  - T43's later idempotency key on add.
- **Signed 2026-10-18 (the go covers them; still one file at a time):**
  - J58, inside M168's file;
  - M262, the sweeper arm and `closed_reason`;
  - M288 (a) and (b), applied together;
  - K49, three files (the RPC, the `togo_status` CHECK, the stop record);
  - M315;
  - M322, with M318;
  - M206, after M309;
  - M270 (6);
  - S11, after S12;
  - RULING#24 A's two columns;
  - M72b's later step.

**At the device sitting (#12):**

- M316's note band and chime;
- P2dp's two marks;
- K48's re-measure;
- re-installing the staff tablets from /staff once P7e ships.

**At the native Burmese sitting:** every K15 draft this record names, staff money words first. These
include `settle.house.cta`, `settle.reader.chip.blind.locked`, `kds.fold.old`, `table.noshow.canWait`,
`shell.lock.unknown`, M316's label, K49 ②'s sheet and M73's list. Also on the list: the EN-only lines
ledgered here (J29's four, J59's two, J60, J63, M286's header, J56's four, and the T43 lines).

**The merge-window line:** each PR that builds from this record merges as `#N @ SHA` on the owner's yes
(G3, G4). "merge all when ready" does not let an agent merge a quota-red head.
