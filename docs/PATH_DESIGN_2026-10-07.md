# Path design — the owner's picks (2026-10-07)

**The owner chose a direction for eight diner and staff moments, answered four questions, and asked for
the result to be "more enhanced, elevated, world-class".** This file records those decisions and how the
design was refined from them. The full per-moment specs live in
[`path-design-2026-10-07/`](path-design-2026-10-07/), one file per moment.

The screens are on the owner's design canvas, "MMS paths — design prototypes", in the owner's claude.ai
artifacts. It is private to the owner until they share it. Its first page, **"Your picks, elevated"**, holds the 20 refined screens of moments 1–8; the second, **"Live board, pay & guides"**, holds round 3's 8 screens (moments 9–12). The other two pages keep the 48 concept screens (three directions per moment) for reference.

## The owner's words and picks

The owner answered four multiple-choice questions after seeing all 48 concept screens, then wrote one
message. The message is quoted; the three answers below it are the options the owner picked, named by
their labels.

- **Direction, in the owner's own message:** "I prefer diner moments guided and staff moments
  glanceable. I actually love all 3 directions but could be more enhanced, elevated, world-class
  design-thinking." It replaced the owner's earlier pick, "Louder on staff tablets", which had left the
  diner moments quiet.
- **What a dine-in Bill shows while live card keys are held:** picked "Only Pay at the counter" (the
  recommended option).
- **What a guest's phone offers while their dish waits on the host's Send:** picked "Card + nudge the
  host" (the words, plus the "Show a server" card, plus a quiet "Let Aye know" nudge on the host's phone).
- **What staff may do when a dish still waits for a manager as the guest is ready to pay:** picked "Warn,
  then take payment" (the recommended option: a later approval becomes a refund).

## What is decided

Each decision is final for this wave, and reversible as the lens asks. **Where a stream card's design
for one of these moments differs, this file wins.** The rulings file still wins on its own rulings.

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Source                 | Builds it                                                              |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------- |
| 1   | **Diner moments (1–4) are GUIDED; staff moments (5–8) are GLANCEABLE.** The picked direction is the backbone. Each moment grafts in the best of the other two (quiet's restraint and the family's own console words; glanceable's arm's-length shapes and one moment of delight; guided's spoken next step) and drops every weakness the judges named for its backbone.                                                                                                                                                                                                | owner                  | every stream below                                                     |
| 2   | **Moment 2: until live card keys are switched on (C2), the dine-in Bill offers only "Pay at the counter".** A new `SURFACES.dineInPhonePay = false`, drawn in Checkout and refused in create-intent (`lib/surfaces.ts:19-23` requires both). After C2's keys are verified live, the flag flips in its own PR (D5's order) and phone pay returns served-gated (decision 10), not as today's Bill. The create-intent refusal is a money-path change: its merge line carries "recommend: wait for Codex" whenever the blind pass flags that path (ruling #1).             | owner                  | diner-cart (Checkout, `surfaces.ts`, D1) · money-rails (create-intent) |
| 3   | **Moment 1: a guest whose dish waits on the host's Send gets the words ("our staff can send it too"), a big "Show a server" card for Dad, and a quiet "Let Aye know" nudge to the host's phone.** Host-only Send stays enforced on the server.                                                                                                                                                                                                                                                                                                                         | owner                  | diner-cart · counter-floor                                             |
| 4   | **Moment 8: staff are never blocked from taking payment by a dish waiting for a manager.** The warning sits above Take cash, which stays the live hero at full ink. Tapping it with a flag up is the acknowledgement and records exactly the pending requests on screen. The dish stays charged; if a manager agrees after the table has paid, it is refunded from Today's payments & refunds. The request is closed as `superseded` ("Table paid first · closed by {name}"), never `denied`, and any refund is its own record beside it (D2).                         | owner                  | staff-authority · counter-floor                                        |
| 5   | **Moment 3:** "I'm here" can be tapped any time on the pickup day (the server enforces the same day rule), with a 6-second take-back before anything is written.                                                                                                                                                                                                                                                                                                                                                                                                       | default, not overruled | post-pay                                                               |
| 6   | **Moment 4:** a scan miss says "Or ask at the counter".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | default, not overruled | grocery                                                                |
| 7   | **Moment 5:** a second Send is its own kitchen card, labelled "အလှည့် 2 / Round 2", drawn glanceably but never louder than a Late ticket.                                                                                                                                                                                                                                                                                                                                                                                                                              | default, not overruled | kitchen-ops                                                            |
| 8   | **Moment 6:** the paid card's one hero is "Back to the counter" (Dad keeps hearing the bell). A Walk-up shortcut may sit beside it only as a secondary.                                                                                                                                                                                                                                                                                                                                                                                                                | default, not overruled | counter-floor                                                          |
| 9   | **Moment 7:** clearing an unpaid table whose food went to the kitchen takes one extra tap that first shows the dishes and the loss, then a 6-second Undo.                                                                                                                                                                                                                                                                                                                                                                                                              | default, not overruled | counter-floor · kitchen-ops                                            |
| 10  | **Round 3 · D5: guests pay by card / Apple Pay on their phone once nothing on the bill is waiting on the kitchen (D5's hold set).** The server enforces it in create-intent (after decision 2's parked refusal, failing closed on a read error); "served" is Mom's KDS bump. The counter and every staff settle door are never gated by served. Parked until C2: production serves Stripe TEST keys, so no real card money moves until the cutover; then the flag flips after D5's three conditions and is proved by one refunded Apple Pay payment (round-3 section). | owner (round 3)        | diner-cart · money-rails · post-pay                                    |
| 11  | **Round 3 · moment 9: the TV board shows each open table's dishes, per dish, moving Sent → Cooking → Served**, beside the pickup codes. A table number and dish names only: no names, prices, counts, clocks or ETAs.                                                                                                                                                                                                                                                                                                                                                  | owner (round 3)        | kitchen-ops                                                            |
| 12  | **Round 3 · moments 10–12: one live pass for the guest, and animated first-run step guides for guests, the counter and the kitchen.** The guides are skippable, never block service, and teach only what has shipped.                                                                                                                                                                                                                                                                                                                                                  | owner (round 3)        | diner-cart · post-pay · kitchen-ops · counter-floor                    |
| 13  | **Round 3 · D4: the asker-by-PIN seam is not built this wave.** The signed-in account stays the asker. It reopens only on the measured trigger in PD13.                                                                                                                                                                                                                                                                                                                                                                                                                | design call (D4)       | staff-authority (nothing this wave)                                    |

## How the design was refined

One agent per moment wrote a refined spec from the picked concept, the judges' grafts and the owner's
answers, and checked every product claim it depends on against the code at `f6e81ce`, citing file and
line. A design whose claim failed was changed, not the claim. One consistency pass then read all eight
together and set the shared vocabulary below. An adversarial critic reviewed each spec against the code,
the rules and the owner's answers, and the screens were drawn with its blocking fixes applied.

**Reading a spec:** each file is the spec, then an appendix holding (A) the consistency pass's amendments,
(B) the critic's blocking fixes, and (C) its suggestions. **Where the appendix contradicts the spec body,
the appendix wins**, and the drawn screens follow the appendix. **Where two specs' appendices disagree,
the _Cross-spec reconciliations_ section below wins over both, and the _Required corrections from
Codex's review_ win over every spec. The _Round 3_ section wins over everything before it.** The specs are the design each stream
starts from. Where the code disproves a claim, change the design and say why in the PR.

**Where a pick changes an earlier design rule, the PR that builds it amends that document in the same
change.** Moment 1 reverses PHASE3C_DESIGN's D13 for a guest with unsent dishes (the hero becomes "Show a
server", not the Bill door), so its PR amends PHASE3C_DESIGN and DESIGN-LANGUAGE §32 and adds the
`checkout-verb.ts` mutants for the new arm. A rule this file does not mention stays as it is.

**Burmese:** every new Burmese string in the specs is a draft for the native sitting, never final copy.
Where a spec says a draft is "logged in a `K15 · <stream>` row", that row does not exist yet: the stream
that builds the moment files it, in OPEN-ITEMS, with its first PR. Strings with no draft stay
English-only and are listed in each spec. Reused shipped strings are cited to their file and line.

## The shared vocabulary

**One voice, two registers.**

- **Diner (guided, English leading).** Each screen says NOW once, as its heading, in the family's own
  word with its mark. Then ONE actor-first next-step sentence with no "Next:" label, directly above the
  hero it explains (for example "Aye sends the table's order to the kitchen — your dishes go with it.").
  A docked hero's one line slot carries either that sentence or the hero's held reason, never both. A
  quiet human fallback ("our staff can send it too", "Or ask at the counter") comes last. The
  Order · Bill · Pay rail, plus /track's shipped status path, is the only step vocabulary. **A shared cart
  never shows a count**, in a badge, a note or a Send label. Inside any window the words are future or
  "-ing" ("Clearing Table 2"); past tense comes only after a confirmed write.
- **Staff (glanceable, Burmese first).** The next step lives inside the control's own words (the slab,
  the question, "Aye, your PIN"), never in a separate "Next:" line.

**Shared marks: the same shape and the same word on every surface.**

- **Hollow ring + "Not sent yet · မပို့ရသေး":** dishes the kitchen hasn't got. One key carries the word everywhere, `pad.group.unsent` (`apps/qr/lib/i18n/staff.ts:2909`); the console's `table.line.notSent` and `floor.key.notSent` print "Not sent" today and move to it with P2do. `--t2` on phones;
  `--warn` on Dad's console. On the console it replaces the floor's solid owed-Send dot wherever that dot
  shows today (any table owing a staff Send, not only one that asked to pay), and it leads the "not sent"
  row that ruling #15 adds to an asked table.
- **Accent-filled disc or lit cap:** now, or selected.
- **Solid ✓ disc:** done (a diner step done, or "paid" on staff screens). It never marks an approval.
- **Dashed edge:** provisional, never decoration (an open Undo window, a clearing table, a held ticket, a
  Bring-back chip, a queued offline item, a frozen count).
- **Dotted perforation with 12px coupon notches:** a pass or a stub. **One CounterPass primitive**: the
  identity figure read across the counter (a table number, or a code on the counter tablet) at ONE 88px
  token, `--fs-pass`, and a code on a phone pass at the 40px `.exit-pass-code` tier. It is constant paper
  in both themes, like a wallet pass, so Dad learns one look. A receipt tear means a slip torn off the
  roll.
- **One Undo form everywhere:** it sits in the slot of the act it reverses, on `--sf` with a 1.5px dashed
  accent edge, never filled and never the hero, with the seconds as an aria-hidden leaf, and arms only
  after the same-gesture guard (350 ms on phones, 400 ms on the console). The KDS cream pill is its one
  shipped exception. **The word (D3 — one act, one word):** English "Undo" on every timed window; the
  Burmese says what comes back. **ပြန်ယူ** when something you sent away comes back: the Send's undo on the
  console (`table.send.undo`, the owner's word, `apps/qr/lib/i18n/staff.ts:2698-2705`, pinned by
  `autonyms.test.ts`) and on the guest's phone (moments 1 and 2, the same control), and the kitchen rail's
  Bring back. **ပြန်ဖျက်** when a mark you just made is erased: the kitchen's All done / Sold out undo, the
  counter lane's undo, moment 7's Clearing, moment 3's I'm here and moment 4's Added. The TV carries
  neither. The native sitting confirms the rule (round 3, D3).

**Staff colours.**

- **Warn:** a person must act, or money is at risk. A warn ground fill is used ONLY for a Late ticket and
  the floor's one ask tile. Everywhere else warn is a glyph plus a word, or the one danger commit.
- **Green:** done and settled. Calm: never counted, never pulsing, filled only on the screen where it
  just landed (the seal's one bloom).
- **Gold tint:** the till (money taken, owed or waived). Never a status or an alarm.
- **Cream on the Night board:** the one open-Undo pill, and nothing else.
- **Flag:** a decision waits on a manager, drawn only on the request card and at Take payment.

**Loudness ladder.** (1) ALARM, may tint and move: KDS Late, and money in doubt said in the view's one
alert. (2) CALL, one still filled tile per room: the guest asking to pay. (3) MARK, glyph plus word, no
fill, no motion: the flag, the not-sent ring, the round stub, the loss diamond (only after Dad reaches for
Clear), dashed pending. (4) CALM: done and paid. Only Late escalates with time; asks, approvals and
not-sent show minutes as plain text. No fact is marked twice on one screen. **Kitchen-ops' "Table N left —
stop cooking" card is ALARM tier without motion**: struck dish rows plus the warn word, never dashed,
never cream, staying until "Got it". Late keeps the board's only motion.

## Cross-spec reconciliations (these win over every spec and appendix)

The specs were refined in parallel, and a few winning appendix items disagree with each other. These
settle them:

1. **The stop-cooking card's tier** is ALARM without motion, as above (m5's A1 and B1), not "MARK tier
   below Late" (m7's B4).
2. **`--till-fs-say` does not exist.** m6's B1 folds it into `--fs-pass`. Where m7's B3 names it for the
   loss slip's Take cash door, read `--fs-pass`.
3. **Live card keys are C2, not C1.** Where m1's B9 says "Phone pay is off until C1", read: phone pay is
   off once PD2's `SURFACES.dineInPhonePay = false` ships, until C2. There is no such flag today.
4. **The dine-in seal at pane width has no Walk-up, no stub and no #CODE** (m6's B4). Where m2's appendix
   mentions a Walk-up secondary there, it does not apply.
5. **"Take payment anyway" is retired** (m8's A1): tapping Take cash with a flag up is the acknowledgement.
   Where m6's appendix carries the acknowledged ids "whenever the door was 'Take payment anyway'", read
   "whenever Take cash was tapped with a flag up".
6. **A table code on a phone pass uses the 40px tier.** Where m1 draws a table with no number yet at
   InviteSheet's 44px code style, use the CounterPass's 40px phone tier instead. InviteSheet itself is
   unchanged.
7. **"No count on a shared cart" covers everything before the Send.** After it, `sentCopy` may still
   report the server's fired count (m1's A5).

## Required corrections from Codex's review (these win over every spec and appendix)

Codex reviewed the specs and found seven gaps. Each was checked against the code at `f6e81ce`, and each
is a required part of its moment, not a suggestion:

1. **Moment 2 — reward redemption stays reachable.** `RewardField` sits under `showPayControls` today
   (`components/Checkout.tsx:3446-3447`), beside the promo field. When `dineInPhonePay` parks the pay
   controls, keep `RewardField` drawn with the promo field: a reward is server-authoritative and changes
   the counter total.
2. **Moment 2 — the saved-card note follows the flag.** The secure-tab note "Your card is saved — pay here
   anytime, or just leave and we'll charge the bill to it" is gated by `showPayFurniture`
   (`Checkout.tsx:4152-4165`), not by the pay controls the design removes. While `dineInPhonePay` is
   false, hide it. If the stream verifies that staff can still close a secure tab with the flag off, it
   may keep only a true clause instead, as a new string with a K15 draft.
3. **Moment 5 — a stable key for a line with no batch and no fire time.** `kitchen.ts:341` fills a
   missing `fire_at` with the poll's `nowIso`, so `firedAt` changes on every poll. A line whose
   `fire_batch` and `fire_at` are both null keys to one deterministic bucket per cart, computed from the
   raw row, never from `firedAt`. Otherwise its card remounts, flashes and chimes on every poll.
4. **Moment 6 — the pad writes the handoff stash.** Today only `FloorDetailLive.tsx:253` and
   `ReaderCollectProvider.tsx:280` call `stashHandoff`. The walk-up landing on the pad must call it
   too, or the seal's Cash received and Change are lost on a same-tab reload.
5. **Moment 7 — "Seat next party" checks the mint hold first.** `useCounterMint`'s `run` returns
   silently while another mint is in flight (`components/staff/CounterMint.tsx:170`). Check the hold
   before skipping the Undo window and sending the clear. If it is held, refuse at the tap with the
   shipped waiting line and leave the table and its Undo as they were.
6. **Moment 7 — "Seat next party" keeps the counter bell.** Routing to `/staff/table/{id}/add`
   (`CounterMint.tsx:136`) leaves the counter home, the only page that mounts `CounterBellProvider`
   (`app/staff/page.tsx:327`). At tablet width, open the new party in the counter's pane instead, so the
   bell stays live. Below that width, the route keeps m6's honest bell note.
7. **Moment 8 — `ASKER_BY_PIN` ships OFF.** The asker-by-PIN seam changes who is recorded as asking,
   shows which staff have a PIN, and spends the caller's step-up budget. Round 3 (D4, decision 13) went
   further: it is not built this wave at all, not even as dead code behind the constant.

Codex's second round found eight more, each checked against the code and the specs:

8. **Moment 6 — the till layout only where its grid fits.** The tray's body grid is 460 + 32 + 300 + 32 +
   438 = 1262px plus 64px of padding, but the spec applies it from `(min-width: 64em)` (1024px). Apply
   `layout="till"` only from a breakpoint at or above the grid's real minimum width, or make its columns
   responsive. Below that width, today's single-column sheet is used, so cash entry and the Change
   readout are never clipped.
9. **Moment 7 — "Seat next party" reserves the mint across the clear.** Checking the hold at the tap
   (correction 5) still leaves a race: another Walk-up or table start can take the shared mint lock
   before the clear answers. Reserve the mint lock from the tap until the new party's session opens or
   the clear refuses, and release it on refusal. Any busy refusal after the clear is said out loud, with
   the table already cleared and a way to start the party by hand.
10. **Moment 1 — the session code reaches the pass.** A table with no number before its first Send shows
    its session code on the "Show a server" pass, but `getSplitContext` reads only `mode` and
    `table_number` (`lib/split.ts:79-80`), and the join code lives only in `/menu`'s provider. Carry the
    session's `qr_code` (the value InviteSheet shows) into Checkout beside the table number, read
    server-side.
11. **Moment 7 — an unknown kitchen read is never a no-loss clear.** m7's appendix B13 puts a
    "kitchen-unknown" table on the direct no-loss path. That contradicts its own rule that an unknown
    kitchen read is never "go". Before choosing the no-loss path, Clear takes a fresh, authoritative read
    of the table's sent lines. If it is still unknown, the pane refuses with its "couldn't check" line and
    clears nothing.
12. **Moments 5 and 7 — the stop-cooking card is durable.** The kitchen read selects only `fired` /
    `in_progress` lines on `open` / `paid` carts (`lib/kitchen.ts:180-211`), so a cleared, cancelled cart's
    lines vanish on the next poll, before Mom sees the warning. The table-clear migration (ruling #5's go,
    M182 · P2hf) also writes a durable stop record for the voided fired lines that the kitchen read
    selects whatever the cart's status. "Got it" writes its acknowledgement. Until both ship, the slip's
    "tells the kitchen to stop" stays unclaimed (as m7 already conditions it).
13. **Moment 8 — every payment door acknowledges its own snapshot.** With a reader or a secure tab,
    staff can tap `TerminalSettle` or `CloseSecureTabButton` directly, with no Take cash tap first. Each
    settle trigger sends the pending-request ids it displayed at its own tap, so no door meets
    `approval_pending` after the owner's "never blocked" decision.
14. **Moment 5 — Bring-back chips are always told apart.** When the round number is unknown (`n: null`),
    two chips from the same table could both read only "Table 4". Each chip captures a distinct label at
    bump time: the round number when known, otherwise the card's first fire time ("Table 4 · 7:42",
    Latin digits), so no new words are needed.
15. **Moment 4 — the post-add chip ignores the closing double-tap.** When the add lands between two taps,
    the second tap can hit the chip's "Add another" that mounts under the finger. The chip arms only 350
    ms after the sheet closes (the same-gesture guard), as part of the success transition.

## The eight moments

### 1 · A tablemate's dish waits for the Send — guided, elevated

[Spec](path-design-2026-10-07/m1-tablemate-send.md) · screens `picked-m1-1…3`

- The guest's Order page names the next step and who takes it, using the shipped `hostSendsCopy` pair
  verbatim. The host is named from `session_members` (`lib/split.ts:85-98`), and the default "Guest" is
  never read as a person.
- **"Show a server"** is the one primary: a full-screen CounterPass with "Table 7" over "စားပွဲ 7", the
  "Not sent yet" ring, and the waiting dishes in both languages with the kitchen's qty tokens. It flips to
  "Sent to kitchen · ပို့ပြီး" only once a server view shows the dishes past their 10-second grace, the
  moment Mom's KDS shows the ticket.
- **"Let Aye know"** is a quiet secondary, offered whenever the host is named (a face-down phone is the
  common case). The nudge is a durable stamp, not presence (Codex round 3: a guest who locks their phone would take a presence flag with them, which is the face-down case it exists for). A member-authorized server action writes the nudger's seat and time on the cart, with the status guard in the SQL (cart open, a host named, the nudger not the host; at most once a minute), and `mms_fire_cart` clears it in the same statement as the fire. Its one column pair is a migration riding PD1, applied on the owner's go. "Aye can
  see you're waiting" shows only while the host's surface draws the waiting line.
- No counts on the shared cart before the Send: the "N items not sent yet" note, the count in the Send
  label and the CartBar capsule on a dine-in cart all go (after the Send, `sentCopy` may still report the
  server's fired count). The host's Undo takes the shared Undo form and the 350 ms guard (P2y).
- **It reverses PHASE3C D13 for a guest with unsent dishes:** their hero is "Show a server", not the Bill
  door. The PR amends PHASE3C_DESIGN and DESIGN-LANGUAGE §32 and adds the `orderStageHero` "wait" arm's
  mutants in `checkout-verb.ts`.
- diner-cart builds the /menu half too (D1): CartBar's "Not sent yet" line, with no count capsule on a
  dine-in cart, in the same PR as the guest's "Aye can see you're waiting". ArrivalBeat is diner-cart's (D1(a)): PD1 leaves it unchanged, and PD11 adds the diner guide's one-line mount there. MenuBrowser.tsx stays frozen. Dad's pane and floor adopt the same hollow ring
  (counter-floor, with P2do). The guest's Send undo reads "Undo · ပြန်ယူ", the console's word for the
  same act (D3).

### 2 · Asking for the bill — guided, elevated

[Spec](path-design-2026-10-07/m2-bill-at-table.md) · screens `picked-m2-1…3`

- The Bill's guidance is the rail plus ONE line in the dock's slot, directly above the one door: "The
  counter takes cash." The old ①②③ list is gone, and no card button is drawn (decision 2).
- After the ask, every phone at the table becomes the counter pass (the CounterPass: table number at
  `--fs-pass`, the total), and Dad's pane shows its twin: the same paper, seam and total, with the
  table number in the pane's heading rather than printed twice. **Two reads, one derivation:** the guest's
  pass shows `totals.totalCents` from `getCartTotals(id)`; Dad's pane reads `getCartTotals(cart.id, 0)`
  (`lib/floor.ts:996`). One test over a promo'd cart pins them equal. On Dad's pane the pass total and
  Take cash read ONE value, so while a manager decision re-reads, both say "Updating the total…". A guest
  phone updates only when its own read lands.
- Dad's pane: the ask pass on top, then the order card (no "so far" subtotal), promo, settle (m8's flag
  card, then Take cash, then the hint and the cash-only line), Merge, and last the small "Clear table".
  The step lives in the hero "ငွေသားနဲ့ ရှင်း · $46.41", which opens m6's till tray. The ask's age is
  plain text.
- The group Bill never says "Pay as one bill here" while phone pay is parked. The settling sentence
  shows only while the register holds the freeze. The ask-over-unsent-dishes lift ships strictly after
  counter-floor's P2do.

### 3 · The pickup promise — guided, elevated

[Spec](path-design-2026-10-07/m3-pickup-promise.md) · screens `picked-m3-1…3`

- /track says NOW once (the shipped `orderWithKitchen` pair while cooking), then the claim ticket on the
  CounterPass at its 40px tier: the booked time while waiting, turning over to the code at Ready (one
  turn per order, instant under reduced motion). Dad's lane strings are the guest's words
  ("လာယူချိန် {t}", "ရောက်နေပြီ").
- "I'm here" (decision 5) swaps with its Undo in one slot behind the same-gesture guard, with a capped
  keyboard hold (`lib/undo-hold.ts`).
- **M65 is a hard prerequisite in the same PR:** add `fire_at` to `TRACK_ORDER_SELECT`, so a held,
  unfired order never reads "in the kitchen".
- The late state (15 minutes past the slot, not bagged) says "isn't bagged yet" with no apology and no
  ETA. The phone door comes last.
- Dad's lane counts a bag's age from the later of the arrival and the slot, so an early "I'm here" never
  paints a bag late during normal service. That rule lives in `lib/expo-rules.ts`, outside post-pay: it
  goes as a handoff to the stream whose card owns the lane. `ph-no-capture` goes on every element that
  shows the code or the name.

### 4 · The jar that won't scan — guided, elevated

[Spec](path-design-2026-10-07/m4-grocery-miss.md) · screens `picked-m4-1…2`

- The miss is a paper tag inside the live lens: "This code isn't in the app yet.", one primary ("Search
  by name") and the quiet "Or ask at the counter" (decision 6). The camera never scrolls away: the Scan
  door loses its search field, and the Name sheet is its only search.
- The Name sheet's empty and no-match states say "It's not you — most shelf codes aren't in the app
  yet." The counter tag shows only in a sheet a miss opened.
- Never a charge from a guess: a paired code only ever yields a repeat verdict. The add-Undo waits for
  the confirmed write ("Removing…", then "Removed"). Offline, a code missing from the cache is "unknown",
  never "not in the app".
- No step rail and no two equal buttons. Busy rows keep full ink. The @mms/ui Sheet gains an opt-in
  `initialFocus` from guards-style, right after M77, and grocery opts in from its own file (D1). It never
  goes on a money sheet.

### 5 · Round two lands on a ticket that's still cooking — glanceable, elevated

[Spec](path-design-2026-10-07/m5-kitchen-round-two.md) · screens `picked-m5-1…2`

- One Send makes one card, keyed by `cart_id` + `fire_batch`, with its own clock, chime and an All done
  scoped to its own lines. The bump and recall RPCs already take line ids, so no RPC changes. The re-key
  must be total, in one change.
- The round stub "အလှည့် 2" is an outline plus a dotted perforation with notches, at the clock's tier,
  never filled and never louder than Late. The round is counted per session. The twin flash is retired.
- After a bump, the undo pill names the round and says "{t} still has a card on the board." while true.
- Reserved for m7: kitchen-ops' "Table N left — stop cooking" card is its own shape (struck rows plus
  the warn word, ALARM tier without motion), staying until "Got it" (reconciliation 1).
- At the device sitting (ruling #12), Mom and Dad confirm they read the Burmese-only stub at the pass.
  The console's Send undo keeps ပြန်ယူ (D3); nothing on the board is re-worded.

### 6 · The walk-up cash sale — glanceable, elevated

[Spec](path-design-2026-10-07/m6-walk-up-cash.md) · screens `picked-m6-1…2`

- One money verb end to end: "Take cash · $19.89" opens the crowned till tray. **The tray is the one
  cash sheet on the counter tablet, whichever door opens it** (the pad, m2's pane, m7's loss slip, m8's
  settle). `settle.cash.trigger` and `settle.cash.title` join `STAFF_K15_HIGH`.
- The tray reads OWE → TIP → GAVE left to right. The Change sits in the money corner, so a double-tap on
  the door lands on inert text. Figures use `--fs-pass` (88px) and one more token, `--till-fs-hand`
  (128px Change); everything else is an existing type token.
- The seal: the Change to hand back, the #CODE on a CounterPass stub, and "Back to the counter" as the
  one hero (decision 8). Walk-up is a quiet secondary with the true note "Their food shows up on the
  counter page when it's ready." The green bloom plays only on the landing. A dine-in settle gets the
  same seal at pane width, with no #CODE.
- Cash received and Change are what Dad typed, kept in this tab only. The pad's landing writes the
  handoff stash, so they survive a same-tab reload (Codex correction 4). The pad host keeps one live
  region.

### 7 · Clearing a table — glanceable, elevated

[Spec](path-design-2026-10-07/m7-clearing-a-table.md) · screens `picked-m7-1…2`

- A paid, finished table shows only a quiet hint in its card ("ထွက်သွားရင် ရှင်းပါ · Clear when they
  leave"). There is no standing slab and no "ready to clear" count. The one-tap verb appears once Dad
  reaches for it.
- The window says "Clearing Table N", never "cleared", with the shared Undo in the same slot and "Seat
  next party" as a paper secondary. Both arm after 400 ms.
- An unpaid table whose food went out: during service only a small Clear shows, and Take cash stays the
  hero. **After Dad reaches for Clear** (decision 9), the slip shows the sent dishes, the loss at menu
  price, one outline diamond, and the "Did Table N pay?" fork (Take cash, which opens the till tray, or
  Merge) before the danger commit. Its Undo then lives on the table's floor card, which outlives the
  pane.
- Gated on the table-clear RPC migration (ruling #5's go). "Tells the kitchen to stop" ships only with
  m5's stop card. The new money keys join `STAFF_K15_HIGH`.

### 8 · A dish needs a manager — glanceable, elevated

[Spec](path-design-2026-10-07/m8-manager-approval.md) · screens `picked-m8-1…3`

- The flag lives only where a decision is made: the request card and the Take payment card. There is no
  band and no pennants on bars, tiles or lines. The bar's approvals circle shows a live count from one
  poll. A frozen queue gets a dashed circle, and `countPendingApprovals` stops answering a false 0.
- The asker's sheet: one chip picks what AND why, each with its kind mark. The picker lists only people
  who can sign (a pure `eligibleApprovers` in `lib/`, with mutants). Exactly one eligible signer arrives
  pre-picked. One shared slip reads "Thiri → Aye", then "Aye, your PIN".
- **Decision 4:** Take cash is never dimmed. "Decide it here" is a paper secondary that opens the centred
  sheet, so the deciding state has one primary (Approve). An approved Remove shows the Remove kind mark,
  never the ✓ disc, because ✓ means paid on this counter.
- It ships after M184. A request whose table has already paid (derived from the cart's status) gets a
  close-only card: it says what happened and links to Today's payments & refunds. Its "Close it" runs a
  new `close` arm of `mms_resolve_approval`, carried in M184's migration and admitted only once the cart
  has left `open`: the row reads `superseded` ("Table paid first · closed by {name}"), never `denied`, and
  the line stays charged (D2). Once M182 ships, a table clear supersedes its own pending requests (D2), so a cleared table's request already reads `superseded`, "Table was cleared first", with no Close key. Only a cart cancelled outside M182's RPC (or before it ships) can still hold a pending request; it gets the close-only card, with the sentence "This table was cleared while this was waiting."
- The asker is the signed-in account. The asker-by-PIN seam is not built this wave (D4, PD13).

### 9 · The TV board — live progress per table, per dish

[Spec](path-design-2026-10-07/m9-tv-board.md) · screens `picked-m9-1…2` (Night-forced, 1920×1080)

- Every open dine-in table is a landscape CounterPass on the wall: the table figure once at `--fs-pass`,
  then its dishes, each with the kitchen track (Sent · Cooking · Served). The pickup codes keep their
  column, in the phone's code face at the board's 54px row.
- A table number and dish names only. Same-name dishes in a round are one row, so no count appears. No
  names, prices, clocks, ages, ETAs, approvals or Undo words. Dishes not yet sent are not on the wall.
- Sent and Cooking are marks, Served is calm (green), and the pickup Ready pass is the wall's only call:
  the wall never nags. Tables are sorted by number and never re-sort on status.
- One celebration per table visit: when its last dish is served, its status cell TURNs, waiting out
  Mom's 6-second undo first. A frozen feed dims the wall and says so.
- This reverses the shipped "no dish per table on the board" boundary (OPEN-ITEMS K32(b), P6a), as the
  owner asked. The PR amends `board-pulse.ts`, SPEC-KDS and their test, and its merge line names the
  privacy change: the room now reads what each table ordered while it cooks.

### 10 · The guest's live pass, and pay after served

[Spec](path-design-2026-10-07/m10-live-pass-pay.md) · screens `picked-m10-1…3`

- The Bill's receipt becomes the One Pass body: each dish row carries the kitchen track, live
  (realtime plus a foreground re-read). This ships before C2, on the counter-only Bill (the wall shows
  the room the same tracks, so the guest's phone must match).
- After C2 only (decision 10): "Pay · $X" keeps its name, held with "Pay opens once everything's
  served." in the dock's one line slot, with no tip ask before the food. When the phone observes the last
  dish served (and Mom's 6-second undo has passed), the door opens once: "Ready to pay.", one POP, the
  tip ask, then Apple Pay leads the pay step with the card form folded beneath. The counter stays a quiet
  secondary throughout.
- Paid: the stub is stamped (the dine-in pass's only ✓), then the receipt prints beneath it.

### 11 · The diner's first-visit guide

[Spec](path-design-2026-10-07/m11-diner-guide.md) · screen `picked-m11-1` (interactive)

- Five pages, dine-in only, once per phone after the join succeeds, never over an error, a pay lock or
  settling, and never for a diner the server already knows. Re-openable from Account.
- Every page heading is a shipped bilingual string the guest will meet again; the pictures render the
  real pass and track, inert. One small motion per page, the product's own, escorted for reduced motion.
- "Close · ပိတ်" on every page; the last page's primary is the real first action. Page 4 follows the
  flag: before C2 it shows the counter only, and after C2 it names only the wallets the flip proved.

### 12 · The staff step guides — counter and kitchen

[Spec](path-design-2026-10-07/m12-staff-guides.md) · screens `picked-m12-1…2` (interactive)

- Five steps per station, offered once per person, per station, per tablet, in the screen's quiet space
  (the counter's idle pane; the kitchen's empty board), never as a modal over live work. Work always
  wins: a table tap or a landing ticket replaces the guide.
- Each step's title is the control's own word; each picture is the real control, inert; each step has the product's own motion, or none (m12's B2: a picture never pulses). The kitchen guide teaches D3's two words in their places.
- Each station's guide ships as one revision, only after every control it teaches has shipped.

## What still goes to the owner

Every open design question was decided in round 3 under the owner's delegation (below). What is left is
the owner's hands, two sittings, and one merge-window line:

- **C2, the live-key cutover** (ruling #8's prerequisites, unchanged). Card and Apple Pay at the table then open by a separate flag flip: it flips in its own PR after D5's three conditions and is then proved by one refunded Apple Pay payment at a table (round 3).
- **Each new migration's go,** one file at a time: PD1's nudge stamp (Codex round 3) and M184's below.
- **M184's widened merge line (D2):** M184's migration also carries the `close` arm. The line names
  the widening; holding it moves the arm to its own file with its own go.
- **At the device sitting (#12):** the Burmese-only round stub at the pass; the grocery tag's size in
  Padauk at 375px; the till tray above the tablet's on-screen keyboard; whether the Walk-up secondary
  leaves bags waiting (dropping it is one constant); **whether drinks get bumped on Mom's board** (an
  unbumped drink holds a table on the TV and keeps its card pay shut); whether iPhone Safari raises the
  keyboard when the grocery Name sheet opens with `initialFocus`; and, with the counter split open, a
  bag's Undo (ပြန်ဖျက်) beside a table pane's Remove (ဖျက်).
- **At the native Burmese sitting:** every `K15 · <stream>` draft the specs list, money words first; D3's
  confirmations (the two-verb rule, ပြန်ယူ on a guest's phone, and the kitchen help line that names the
  Undo bar with ပြန်ယူ); and whether ထုတ်ပြီး / Served is the one stamp word everywhere.

## Round 3 — the owner's delegation and four new moments (2026-10-07, latest)

**The owner's words: "I trust you to apply world-class design-thinking best standards on all open
decisions. staff board also needs moment designs integration so TV board display shows live order
progress in details (per item per table etc.,) for customers and staff. after food items served,
customers should be allowed to pay by card/apple pay. I really like the direction of premium iOS
designs, wallet boarding pass, One pass and progress updates, visual animated step guides for customers
and staff to get familiar with the new app."**

This section wins over everything above it. Each of moments 1–8's specs carries a section D with the
round-3 changes for that moment.

### The open decisions, decided

- **D1 · Owners.** **(a)** `CartBar.tsx` and `ArrivalBeat` (the /menu half) go to diner-cart under a scoped unfreeze; MenuBrowser stays frozen. **(b)** `lib/surfaces.ts` goes to diner-cart (money-rails reads the flag in create-intent and never edits the file; diner-cart draws first, money-rails answers second, never the reverse). **(c)** `tokens.css` (`--fs-pass`, `--till-fs-hand`, and the `--pass-*` constant inks) stays with guards-style, which already owns `packages/ui`: the earlier pick of counter-floor for `tokens.css` is withdrawn, because every card forbids other streams to add tokens. **(d)** The Sheet's opt-in `initialFocus` stays with guards-style. The CounterPass primitive is post-pay's. Round 3 also decides these scoped unfreezes:
  `PaymentSection.tsx`, `lib/pay-element.ts`, `TableTimeline.tsx` and `lib/line-state-copy.ts` to
  diner-cart; `AccountHelp.tsx` to post-pay; `TablePane.tsx`'s idle host to counter-floor; and `HelpButton.tsx` to kitchen-ops, scoped to the staff guide. They are decided here: no spec's "needs the owner's (or the orchestrator's) yes" clause survives (m10, m11, m12), and PD11's one-line guide mount in `ArrivalBeat` sits inside (a).
- **D2 · A request closed after the table paid** is recorded as `superseded` ("Table paid first · closed
  by {name}"), never `denied`. `mms_resolve_approval` gains `p_decision = 'close'`, admitted only once the
  cart has left `open`, carried in M184's migration (same function, signature and grants; no CHECK
  change). Deny is unchanged. A refund is its own record beside it, never summed into losses. No backfill.
  M182's table-clear RPC supersedes the cart's pending requests in its own transaction.
- **D3 · One act, one word** (the shared vocabulary's Undo paragraph above). No shipped string changes; **(c)** any re-word of shipped help copy that names these acts, such as `help.how.kitchen.2.more`, goes to the native sitting.
- **D4 · The asker-by-PIN seam** is not built this wave (decision 13). Measured 2026-10-07: five active staff accounts, all manager or owner; and `mms_approvals` holds no rows at all (`select count(*) from mms_approvals` returned 0, re-measured 2026-10-08). PD13 holds the reopen trigger
  and the build conditions.
- **D5 · Card / Apple Pay after served** (decision 10). **The hold set:** the door is held by any food line, dine-in or to-go, in draft, fired or in_progress (comped dishes and drinks included). Served, voided and grocery lines never hold it. A to-go draft holds too (Codex round 3): it otherwise fires only when the bill is paid, so phone pay would charge before that dish was cooked, and the pass would read Served beside an unsent row. It can go early from its ⋯ ("Send to kitchen now", shipped, `Checkout.tsx:1853`), and its held reason says so: "Send your to-go dish to the kitchen first (More ⋯) — Pay opens once everything’s served." At the counter a to-go draft still fires at settle, so its shipped row copy ("goes to the kitchen when you pay") stays true there. The pass head reads Served only when nothing holds the door. A new round or a KDS recall closes it again. **"Served" waits out Mom's undo window on the server:** a line counts as served only once its `bumped_at` is at least `KDS_UNDO_MS` old on the DB clock, the same rule the TV board uses (m9's data section), so a Bill that mounts or returns to the foreground inside those 6 seconds still reads held, and create-intent refuses it (Codex round 4).
  - **A table with no host** (`host_seat` null) is held the same way, unlike the shipped unsent rule: its drafts fire only when staff send them from the console (it always can, P2cq) or a phone adopts the table at Send (J40), so paying first would be paying before the food. Its held reason names those doors: "A server will send these to the kitchen — or pay at the counter." (English; the Burmese is a K15 draft). A test with a hostless draft pins the hold, so `payBlockedByUnsent`'s host exemption can never leak into the verdict.
  - **create-intent's order.** Both new refusals sit AFTER `supersedeCartIntent` and its captured / unknown exits (`route.ts:125-136`), never above them: each frees the lock, and freeing it while a predecessor intent can still be confirmed is #257's CRITICAL (M151). First decision 2's parked refusal; then the D5 verdict, from one error-aware read that fails CLOSED (503). The verdict takes the shipped unsent refusal's slot for dine-in and replaces it there: every unsent dine-in line holds D5, so the unsent copy ("then the bill is ready to pay") would be false under the flag. A host with drafts reads "Send everything to the kitchen first — Pay opens once everything’s served."; the rest read "Pay opens once everything’s served." The rule is one pure function in `lib/checkout-stage.ts` with mutants; a script that parses the route checks the call and that each refusal runs only after the supersede statement finishes.
  - No gate at fulfillment: a charged card is never stranded. **Never gated by served:** the counter ask, Take cash, the reader and the secure-tab close. The split door (`openSettlement`, `create-share-intent`) is parked (`SURFACES.selfServeSplit = false`); wiring this verdict into it joins selfServeSplit's reopen list (PD10).
  - **Before the flip:** PD2's counter-only Bill, exactly: no card words and no "coming soon"; only its line rows become the One Pass body with kitchen tracks.
  - **The flip:** `SURFACES.dineInPhonePay` flips in its own PR (one commit), never in the key swap, once three conditions hold: live keys verified; PD2 and PD10 merged; the device sitting confirms drinks are bumped. Right after it deploys, one real Apple Pay payment for the cheapest dish at a table, refunded from Today's payments & refunds, proves the door; if that payment or its refund fails, the flip PR is reverted. The proof cannot come first: while the flag is off, create-intent refuses every dine-in phone payment.

### Vocabulary additions (they extend the shared vocabulary above)

- **ONE PASS.** Every pass is post-pay's single CounterPass primitive, rendered (never redrawn) on the
  TV, the guest's phone, Dad's pane and seal, and inside the guides. Constant paper with constant inks
  (`--pass-paper`, `-ink`, `-ink-2`, `-ink-3`, `-ac`, `-ok`, `-okb`, `-seam`, `-unlit`), never redefined in
  Night; a dotted seam (2px; 4px on the TV) and 12px notches whose holes are the host's ground. ONE
  identity figure, printed once, under the two-tongue label "စားပွဲ · Table". Three tiers only: 40px for the holder, `--fs-pass` across the counter or the room, and the TV's 54px row for a code. The TV's table figure is `--fs-pass` pinned, never a clamp: density is board-fit's step-down, never a smaller figure. **A pass shows
  ✓ only at its terminal state**: Paid on a dine-in pass, Ready on a pickup ticket. The TV never shows ✓.
- **ONE KITCHEN TRACK, three stamps.** Sent (past the grace), Cooking (Mom's Start), Served (Mom's Done
  or All done). Ready and served are one stamp; nothing records a plate arriving, so there is no fourth
  segment. One key per stamp, with the Burmese ပို့ပြီး · ချက်နေဆဲ · ထုတ်ပြီး identical everywhere. Three
  pill segments: length is progress, colour is the stage (Sent `--t2`, Cooking `--tx`, Served `--ok`).
  Inside the grace, one dashed segment with "Sending…". Track sizes: the 14×5 glyph beside a stage word; the 28×6 row on phones and in guide pictures; the TV's 36×8 row (16×6 inside a pickup stub). Unsent is the hollow ring, never a track. **Gold
  and accent are never a progress colour.** One pure `lib/kitchen-track.ts` derives the stage for every
  surface; Mom's KDS draws no track because her rows are its source. "Ready to serve — Table N" survives
  only as Dad's console call.
- **ONE MOTION LANGUAGE**, from kit tokens; every base style is the final frame, and reduced motion gets
  it. RISE (something is issued), POP (0.96 → 1, 180 ms: a control or pass comes alive), FILL (a segment
  lands; an un-fill is instant), TURN (a pass's stage completes), STAMP then PRINT (Paid only), FLASH
  (arrivals on the boards only), PULSE (KDS Late only). One thing moves at a time; a celebration plays
  once per pass per visit, never on a first read, a revisit or a frozen surface, and never inside the
  Undo window of the act that caused it (`KDS_UNDO_MS`, moved to `lib/`).
- **The TV never nags:** Sent and Cooking are marks, Served is calm, the pickup Ready pass is its only
  call; no alarm, clock, age, pay word or Undo word.
- **Guides teach only what ships:** the real primitives as inert pictures, the controls' own keys as
  titles, the product's own motions; one dismiss word ("Close · ပိတ်"); Next never moves under a finger;
  one seen-key helper, marked at open (storage refused means it never opens by itself).
- **Wallet names:** named only in the after-flip "what we accept" sentence, and only the wallets the post-flip proof payment showed working (Apple Pay; Google Pay only after a recorded Android payment at a table); no wallet is drawn as a logo.

### Sequencing

guards-style's token PR (`--fs-pass`, `--till-fs-hand`, `--pass-*`) → post-pay's pass and track
primitives → PD5's re-key and `lib/kitchen-track.ts` → the TV board (PD9) and the live pass (PD10) → the
guides last (PD11, PD12), each after every control it teaches.
