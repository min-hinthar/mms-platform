# Path design — the owner's picks (2026-10-07)

**The owner chose a direction for eight diner and staff moments, answered four questions, and asked for
the result to be "more enhanced, elevated, world-class".** This file records those decisions and how the
design was refined from them. The full per-moment specs live in
[`path-design-2026-10-07/`](path-design-2026-10-07/), one file per moment.

The screens are on the owner's design canvas, "MMS paths — design prototypes", in the owner's claude.ai
artifacts. It is private to the owner until they share it. Its first page, **"Your picks, elevated"**,
holds the 20 refined screens. The other two pages keep the 48 concept screens (three directions per
moment) for reference.

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

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Source                 | Builds it                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- | --------------------------------------------------------------------------- |
| 1   | **Diner moments (1–4) are GUIDED; staff moments (5–8) are GLANCEABLE.** The picked direction is the backbone. Each moment grafts in the best of the other two (quiet's restraint and the family's own console words; glanceable's arm's-length shapes and one moment of delight; guided's spoken next step) and drops every weakness the judges named for its backbone.                                                                                      | owner                  | every stream below                                                          |
| 2   | **Moment 2: until live card keys are switched on (C2), the dine-in Bill offers only "Pay at the counter".** A new `SURFACES.dineInPhonePay = false`, drawn in Checkout and refused in create-intent (`lib/surfaces.ts:19-23` requires both). Today's Bill returns unchanged when C2 flips it. The create-intent refusal is a money-path change: its merge line carries "recommend: wait for Codex" whenever the blind pass flags that path (ruling #1).      | owner                  | diner-cart (Checkout) · money-rails (create-intent) · `surfaces.ts` unowned |
| 3   | **Moment 1: a guest whose dish waits on the host's Send gets the words ("our staff can send it too"), a big "Show a server" card for Dad, and a quiet "Let Aye know" nudge to the host's phone.** Host-only Send stays enforced on the server.                                                                                                                                                                                                               | owner                  | diner-cart · counter-floor                                                  |
| 4   | **Moment 8: staff are never blocked from taking payment by a dish waiting for a manager.** The warning sits above Take cash, which stays the live hero at full ink. Tapping it with a flag up is the acknowledgement and records exactly the pending requests on screen. The dish stays charged; if a manager agrees after the table has paid, it is refunded from Today's payments & refunds. How that close is recorded is an open owner question (below). | owner                  | staff-authority · counter-floor                                             |
| 5   | **Moment 3:** "I'm here" can be tapped any time on the pickup day (the server enforces the same day rule), with a 6-second take-back before anything is written.                                                                                                                                                                                                                                                                                             | default, not overruled | post-pay                                                                    |
| 6   | **Moment 4:** a scan miss says "Or ask at the counter".                                                                                                                                                                                                                                                                                                                                                                                                      | default, not overruled | grocery                                                                     |
| 7   | **Moment 5:** a second Send is its own kitchen card, labelled "အလှည့် 2 / Round 2", drawn glanceably but never louder than a Late ticket.                                                                                                                                                                                                                                                                                                                    | default, not overruled | kitchen-ops                                                                 |
| 8   | **Moment 6:** the paid card's one hero is "Back to the counter" (Dad keeps hearing the bell). A Walk-up shortcut may sit beside it only as a secondary.                                                                                                                                                                                                                                                                                                      | default, not overruled | counter-floor                                                               |
| 9   | **Moment 7:** clearing an unpaid table whose food went to the kitchen takes one extra tap that first shows the dishes and the loss, then a 6-second Undo.                                                                                                                                                                                                                                                                                                    | default, not overruled | counter-floor · kitchen-ops                                                 |

## How the design was refined

One agent per moment wrote a refined spec from the picked concept, the judges' grafts and the owner's
answers, and checked every product claim it depends on against the code at `f6e81ce`, citing file and
line. A design whose claim failed was changed, not the claim. One consistency pass then read all eight
together and set the shared vocabulary below. An adversarial critic reviewed each spec against the code,
the rules and the owner's answers, and the screens were drawn with its blocking fixes applied.

**Reading a spec:** each file is the spec, then an appendix holding (A) the consistency pass's amendments,
(B) the critic's blocking fixes, and (C) its suggestions. **Where the appendix contradicts the spec body,
the appendix wins**, and the drawn screens follow the appendix. **Where two specs' appendices disagree,
the _Cross-spec reconciliations_ section below wins over both.** The specs are the design each stream
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

- **Hollow ring + "Not sent yet · မပို့ရသေး":** dishes the kitchen hasn't got. `--t2` on phones;
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
  shipped exception. **The word:** "Undo · ပြန်ဖျက်" on the diner phones and the kitchen board (where
  ပြန်ယူ is "Bring back"). The console's Send undo keeps **ပြန်ယူ, which the owner chose for that control**
  (`apps/qr/lib/i18n/staff.ts:2698-2705`, pinned by `autonyms.test.ts`). Whether to make the word one
  across the family's screens is an owner question (below); nothing here changes it.

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
  common case). The flag rides the guest's own presence entry on the table's private channel. "Aye can
  see you're waiting" shows only while the host's surface draws the waiting line.
- No counts on the shared cart before the Send: the "N items not sent yet" note, the count in the Send
  label and the CartBar capsule on a dine-in cart all go (after the Send, `sentCopy` may still report the
  server's fired count). The host's Undo takes the shared Undo form and the 350 ms guard (P2y).
- **It reverses PHASE3C D13 for a guest with unsent dishes:** their hero is "Show a server", not the Bill
  door. The PR amends PHASE3C_DESIGN and DESIGN-LANGUAGE §32 and adds the `orderStageHero` "wait" arm's
  mutants in `checkout-verb.ts`.
- The /menu half (the order bar's "Not sent yet" line) needs `CartBar.tsx` and `ArrivalBeat`, which no
  stream owns this wave. Dad's pane and floor adopt the same hollow ring (counter-floor, with P2do).

### 2 · Asking for the bill — guided, elevated

[Spec](path-design-2026-10-07/m2-bill-at-table.md) · screens `picked-m2-1…3`

- The Bill's guidance is the rail plus ONE line in the dock's slot, directly above the one door: "The
  counter takes cash." The old ①②③ list is gone, and no card button is drawn (decision 2).
- After the ask, every phone at the table becomes the counter pass (the CounterPass: table number at
  `--fs-pass`, the total), and Dad's pane shows the same pass. **Two reads, one derivation:** the guest's
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
- No step rail and no two equal buttons. Busy rows keep full ink. The @mms/ui Sheet needs an opt-in
  `initialFocus`, which is owned outside the grocery stream.

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
  The Undo word on the console stays the owner's ပြန်ယူ unless the owner decides otherwise (below).

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
- Cash received and Change are what Dad typed, kept in this tab only. The pad host keeps one live region.

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
  close-only card: it says what happened and links to Today's payments & refunds. Today that close runs
  the existing deny path, so the request reads `denied` (an owner question, below).

## What still goes to the owner

- **Owners for files no stream card owns this wave.** Recommendation in brackets:
  - moment 1's /menu half, `CartBar.tsx` and `ArrivalBeat` (diner-cart, beside its /cart half);
  - `lib/surfaces.ts`, for moment 2's new parked surface (diner-cart, with money-rails' create-intent
    refusal as a handoff on its row);
  - `packages/ui/src/tokens.css`, for `--fs-pass` (moments 1, 2 and 6) and `--till-fs-hand` (moment 6)
    (counter-floor, which needs both first);
  - the @mms/ui Sheet's opt-in `initialFocus` (moment 4) (grocery, as a handoff to whoever owns
    `packages/ui`).
- **How a request closed after the table paid is recorded (moment 8).** Today the close runs the deny
  path, so a dish later refunded still reads "denied" on the owner's loss review. Telling them apart
  needs M184's migration to gain a `superseded` close arm, which widens a file ruling #5 named by purpose.
- **One Undo word on the family's screens?** The owner chose ပြန်ယူ for the console's Send undo. The
  phones and the kitchen board say ပြန်ဖျက်, where ပြန်ယူ means "Bring back". Keep the console's word
  (the default), or move it to ပြန်ဖျက် at the native sitting.
- **Moment 8's asker-by-PIN seam:** should the person asking for a void name themselves with their own
  PIN? It is designed to ship on behind `ASKER_BY_PIN`, drawn only on a manager-signed tablet, but it is
  an open question.
- **At the device sitting (#12):** the Burmese-only round stub at the pass; the grocery tag's size in
  Padauk at 375px; the till tray above the tablet's on-screen keyboard; whether the Walk-up secondary
  leaves bags waiting (dropping it is one constant).
- **At the native Burmese sitting:** every `K15 · <stream>` draft the specs list, money words first.
