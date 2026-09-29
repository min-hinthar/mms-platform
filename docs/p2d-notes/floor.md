# Phase 2d · floor — build notes

Area: **floor** (the counter's room map and its one-tap start). Branch `p2d/floor`, base `2437a78`.
Scope: `floor.json` final.changes [3]–[25] (items [0]–[2] shipped in 2b and are only imported) plus
`register.json` final.changes [11]–[15] rebuilt on the strip (plan conflict "floor × register").

## 1. DESIGN-LANGUAGE draft — §17 bullets, "The floor" (as built)

- **The strip is the map AND the start.** One tile per ACTIVE registered table (`qr_tables`),
  ascending, from the SAME snapshot the cards render (`tableStrip`), so a tile and its card never
  disagree. A FREE tile is a `<button>` — the number over "Start" on a 2px DASHED `--t2` edge (the
  empty-seat shape); an OCCUPIED tile is a `<Link>` to the table — the number over one glyph, its
  tone carried by a 4px inset bottom bar AND the glyph (never colour alone); the ask (a table waiting
  to pay at the counter) is the one FILLED tile (`--warnb`). 5 across on a 390 phone, one row on a
  tablet, tiles `minmax(--s15, 3 × --s8)` (60–96px). An empty registry draws no strip (never a dead
  control).
- **The strip carries its KEY.** Under the tiles, one line decodes every glyph on screen in the
  tile's own word (`stripKey`: one entry per status word present, the ask first, then the owed-Send
  dot) — a map with its legend, so a person who has never used a POS can read a taken table without
  opening it. `aria-hidden`: every tile's name already says its word. An all-free strip has no key.
- **A table owing a Send is marked on the map.** A `--warn` dot in the tile's corner (a shape, not a
  tint — the tile's tone is untouched) whenever `owedSendUnits(table) > 0` (the fold's ONE count),
  and the tile's name gains the card's own "· 2 not sent".
- **One mint lock per screen.** `CounterMintProvider` wraps zones 1–2; Walk-up, Phone order and every
  free tile start through `useCounterMint().run`, the ONE place a start is admitted (tap-time ref;
  `minting` names which control went; every start control `aria-disabled`, the minting one
  `aria-busy`; never native `disabled`; a landed start holds until the route swap; a refusal or a
  rejection re-arms). The hook throws outside the provider. A caller's "new tap" work rides `onStart`
  (only for a start that goes, before the server is asked), never a pre-check of its own.
- **The lock is its own start, never a transition's `pending`.** `held`/`isBusy` read
  `inFlight`/`minting` alone: React entangles every pending async transition, so a `pending`-read
  lock stayed held while the expo lane's or the approvals queue's action ran on the same page.
- **A start that lands after the screen is gone never navigates** (a mounted ref, re-armed at
  setup): the router is global, and the push would yank the person off the table they opened from a
  card. The start still landed; the next poll shows it.
- **The ONE tile starting says so:** full ink (`.floor-tile[aria-busy]` out-orders the held dim) and
  the kit's `.ui-btn-spinner` beside its KEPT verb — the primitive Button's busy shape, so the name
  still contains what the tile shows.
- **A start whose answer never came is UNKNOWN, never "not saved".** A rejected server action is
  caught (the error boundary never replaces the counter screen) and said as `floor.mint.unknown` — the
  next poll shows the table taken if it landed.
- **`created:false` opens the seated table, never its add screen** (`mintLanding`).
- **A stale-free tap never mints.** A tile that flipped occupied → free within `FLIP_GUARD_MS`
  (600 ms) ignores the tap (`createFlipGuard` — the memory and its clock live in lib; the strip only
  asks). Focus survives a tile's button ↔ link flip, and only when the element was REPLACED under it:
  a blur with nowhere to go is re-read after the event (connected and no longer active = a click on
  something that takes no focus → forgotten; disconnected = replaced → restored; still active = the
  page lost focus → kept).
- **The Start zone is two controls.** Walk-up is the zone's ONE primary (the primitive Button, `xl`,
  block); Phone order the `.staff-arm` beside it; while the Phone form is open its Go is the primary
  and Walk-up steps down to secondary. Stacked on a phone, `2fr 1fr` from 48em (`.reg-start`).
- **The kitchen row says what the kitchen has, in the wall's words.** `2 not sent · 3 in kitchen ·
1 ready to serve`, or "Kitchen done" alone — never over an unsent dish. "Not sent" is 2a's one
  count (`staffOwedSendUnits`) and the one fact a server must ACT on, so it is `--warn` bold (bound
  to the segment's own `data-seg`); "in kitchen" is `--tx` bold, `PULSE_COOKING_STATES` past the send
  grace; "ready to serve" is `--ok` bold, the wall's `PULSE_PASS_LINGER_MS` window and the wall's own
  words. Never "ready" as a claim anyone ran the food. The row's glyph is the flame — the Kitchen
  door's own glyph (`StaffDoors`, the nav), naming the row, not claiming anything is cooking.
- **The wait is the kitchen's own rule in whole minutes.** `floorWait` → `kdsUrgency('dinein', …)` with
  the configured thresholds; from one whole minute; ok quiet, amber the gold-tint pair with a gold
  edge (its shape cue), red the warn pair with an edge and the alert glyph. A LEAF with its own 15 s
  clock (skew-corrected once per `serverNow`); the board and the card re-render only on the poll.
- **No loop on the counter.** The pill replays the kit's one-shot `.mms-pop` only when its level RISES
  between ticks; "ready to serve" rings the card's existing one-shot `.floor-card-pulse` once.
- **One status word per state across tile, chip, key and name — and never a success word over
  returned money** (`floorStatusKey`: a refunded paid table reads Refunded / Partly refunded).
- **One ink per tone across tile, edge, key and chip.** The chip's inline pair (`CHIP_TONE`) is
  pinned to each tone's `--floor-ink` by a parsing test. `returned` is the MUTED pair everywhere
  (`--t2` ink, `--t3` bar, the chip on `--sf`) — never `--ok`, and never the act-now `--warn`, which
  means "a person or money is moving now" (the ask, a payment in flight); a refund done is neither.
  The drill-down header chip reads the same.
- **The card wears a status edge** (a 4px inset rail on a full-card overlay so it follows the card's
  corner; `rest` has none) and its clock reads **"Opened {ago}"** (the session's start), not last
  activity.
- **The board's ONE region, with a written precedence:** a strip refusal (`ERR_DWELL_MS`, the
  kitchen's "a refusal outlives the poll that follows it", cleared by the next start) > the freeze >
  "Ready to serve — Table 7" (`UP_NOTICE_DWELL_MS`, its own fact, set equal to the refusal dwell and
  documented against it) > the counts, which gain "{n} waiting to pay at counter" whenever a table
  asks. The strip, the tiles, the key and the pill mount no live region.
- **Cards never re-sort by status.** The grid keeps the floor's stable order (`mergeFloorRows`); the
  strip carries the map. The card grid's minimum is `min(100%, 18rem)`.
- **Tone changes are instant** (`.floor-tile` overrides `.staff-press`'s box-shadow transition); only
  transform and opacity move.

## 2. CHANGELOG

- **Phase 2d · floor — the counter's room map and its one-tap start.** A strip of the room's tables
  above the cards: tap a free table to start it (a 600 ms guard keeps a just-cleared tile from
  starting a table someone meant to open), tap a taken one to open it; a key under the strip says
  what each picture means, and a red dot marks a table with dishes not sent. Walk-up is the Start zone's one
  big button, Phone order beside it, all three sharing one lock per screen. Each table card now shows
  what the kitchen has of it ("2 not sent · 3 in kitchen · 1 ready to serve"), how long its oldest
  dish has waited by the kitchen's own clock, when it was opened, and a status edge; the floor says
  "Ready to serve — Table 7" and rings the card when food comes out, and says when a table is waiting
  to pay. A refunded table's chip reads Refunded, never Paid. The floor stops drawing behind a locked
  console (K14) and refuses a partial room when a line read saturates.

## 3. OPEN-ITEMS rows

Existing rows this work closes or changes:

- **P2ah — CLOSE.** The floor's "not sent" signal ships as the kitchen-row segment, counted by
  `staffOwedSendUnits(hostPresent, staffSendCounts(…))` inside `foldFloorKitchen`
  (`apps/qr/lib/floor-kitchen.ts`), with the open-cart line read now selecting `fulfillment` and
  `by_seat`. Mutants: `p2d-floor/kitchen-host-table-owes-the-diners-round`,
  `…/kitchen-paid-cart-owes-a-send`, `…/read-drops-the-fulfillment`, `…/read-drops-who-added-it`,
  `…/read-host-ignored`.
- **K14 — the floor half CLOSED; the drill-down half stays open.** `getFloorView` answers
  `{ok:false, reason:"locked"}` behind `isConsoleLocked()`; `FloorBoard` goes to `/staff/lock` and the
  counter page redirects there (mutant `p2d-floor/read-ignores-the-lock`). The table page's poll
  (`getTableDetail`) still has no locked arm — see the new row below.
- **K33 — the chip's half CLOSED.** `FloorStatusChip` (card + drill-down header) reads the refund
  through `floorStatusKey`/`floorTone` (mutants `p2d-floor/status-word-ignores-the-refund`,
  `p2d-floor/tone-returned-money-reads-done`, `p2d-floor/card-chip-ignores-the-refund`).
- **P2z — unchanged, now visible beside it:** the floor counts only staff-added drafts on host tables
  (owner decision 5c), so a diner round left unsent still has no age signal.

New rows (no ids — allocated at merge):

| Sev | Item                                                                           | Why / where                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| med | Undo a table start (§22)                                                       | A mis-tapped free tile leaves an empty session; Clear table recovers it. A race-free "close while still empty" needs one RPC (no member, no line) — a prod migration, gated by M125. `apps/qr/lib/register.ts` `startTable`.                                                                                                                                                                                                                                                                                                                                                                  |
| med | "Clear & seat next party" in the drill-down's Clear confirm (owner decision 7) | Turnover: clearTable → openRegisterOrder for the same number → /add in one row. Waits for K35's conversion of that confirm row (native `disabled`).                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| low | `startTable` converges by sticker `qr_code` only                               | The kiosk's occupancy predicate is `table_number`; a kiosk-coded dine-in session would allow a second start once SURFACES.kiosk un-parks. The strip opens an occupied number by session id and never re-mints it. `apps/qr/lib/register.ts:startTable`.                                                                                                                                                                                                                                                                                                                                       |
| low | `startTable`'s registry read has no `.eq('active', true)`                      | The strip offers only active tables, so only a hand-built POST reaches an inactive number. `apps/qr/lib/register.ts:startTable`.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| low | The drill-down poll has no `locked` arm (K14's other half)                     | `getTableDetail` / `FloorDetailLive` keep polling behind a lock taken on another tab.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| low | `.staff-zone-head` scroll-margin under the sticky bar                          | The approvals circle's fragment jump lands a heading under the bar; belongs to the chrome/bar area (measure from the tallest bar: Burmese title + echo).                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| low | Measure the floor on a device                                                  | No browser here. Owed: 390 / 768 / 1024 · en / my · Light / Night screenshots of the strip (5×2 on a phone, the 14px Burmese "Start"), the busy tile's spinner beside "Start" in a 60px tile, the owed dot in a tile's corner, the key's wrap on a phone in Burmese, the three pill levels, the status edge on a textured card, the Start zone's 2fr 1fr row, the help card's tile in its track, the loading skeleton against the hydrated page.                                                                                                                                              |
| low | `FLIP_GUARD_MS` (600 ms) is a starting value                                   | Unmeasured under a real finger on a real poll; `apps/qr/lib/floor-rows.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| low | The card's spoken wait is as of the poll                                       | The visible pill ticks on its own 15 s clock; the card's accessible name computes the minutes at `serverNow` (≤ one poll behind). `apps/qr/components/staff/TableCard.tsx`.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| low | A paid round's kitchen lines come from refunded orders too                     | The floor's order read admits `paid` and `refunded` (K33's policy), so a fully refunded round's served lines count as "Kitchen done". Honest (the food was cooked) but worth a look if a refunded table should read differently. `apps/qr/lib/floor.ts` `paidCartSession`.                                                                                                                                                                                                                                                                                                                    |
| low | K15 — the Phase 2d floor strings                                               | Every new Burmese value below is a Claude draft; `floor.kitchen.notSent` and `floor.key.notSent` are K15-HIGH; `reg.go`'s MY was re-drafted to ဖွင့်.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| med | Owner question — "not sent" on a table that asked to pay at the counter        | Once a host table asks (`counterAsk`), the drill-down's Send treats EVERY unsent dish as the counter's (`staffSendView` → `note: "counterAsk"`) and Take payment is refused over them (decision 3), but the floor counts only staff-added (`staffOwedSendUnits(hostPresent, …)`, decision 5c) — so the card can read "Pay at counter" with no "not sent" over dishes that block the payment. If agreed: a `counterAsk` input on `staffOwedSendUnits` in `lib/staff-send-view.ts`, with a mutant; `foldFloorKitchen` passes `status === "counter"`. Not changed here (owner-mandated binding). |
| low | Owner check — the floor's new warn uses                                        | "N not sent" moved from the row's `--t2` (plan text) to `--warn` bold, and a warn dot marks the owed tile (the plan said render the fact once, as the segment — the dot reads the same one count and carries no number). Both are the critic's two-second-bar fix; confirm on a device.                                                                                                                                                                                                                                                                                                       |
| low | Owner check — a refunded chip is muted now                                     | The spec drafted the chip's refund as warn on warnb; it is the muted `--t2` on `--sf`, the tile's ink (one tone map, pinned). Revisit if the owner wants refunds to read as "look".                                                                                                                                                                                                                                                                                                                                                                                                           |

## 4. Mutate-set / CLAUDE.md enumeration changes

Measured with the documented greps at this head: **169 target files** (140 `apps/qr/lib` + 3 API
routes + 25 components/hooks + 1 `packages/db`), **1177 mutants** (base: 163 files, 1119 mutants;
the floor block is 58).

Files added to the mutate set:

- `apps/qr/lib/floor-kitchen.ts` — lib
- `apps/qr/lib/floor-tone.ts` — lib
- `apps/qr/components/staff/CounterMint.tsx` — component
- `apps/qr/components/staff/TableStrip.tsx` — component
- `apps/qr/components/staff/FloorBoard.tsx` — component
- `apps/qr/components/staff/FloorWait.tsx` — component

(CLAUDE.md's component list grows from TWENTY-ONE to TWENTY-FIVE: add `staff/CounterMint.tsx`,
`staff/TableStrip.tsx`, `staff/FloorBoard.tsx`, `staff/FloorWait.tsx` (Phase 2d); the sum line
becomes 140+3+25+1=169.)

Mutants added (49, one block `// ── Phase 2d · floor ──` at the end of the array):
`p2d-floor/kitchen-grace-line-counted`, `kitchen-paid-cart-owes-a-send`,
`kitchen-host-table-owes-the-diners-round`, `kitchen-ready-never-lapses`,
`kitchen-oldest-is-the-newest`, `kitchen-counts-rows-not-dishes`, `kitchen-zero-record-not-null`,
`kitchen-done-over-an-unsent-dish`, `wait-on-an-empty-kitchen`, `wait-shows-zero-minutes`,
`wait-reads-the-pickup-thresholds`, `up-cues-on-a-decay`, `up-cues-on-first-sight`,
`strip-tile-ignores-its-number`, `strip-takes-the-first-session`, `flip-guard-always-allows`,
`flip-never-stamped`, `tone-returned-money-reads-done`, `status-word-ignores-the-refund`,
`name-drops-late`, `name-drops-the-kitchen-row`, `read-ignores-the-lock`,
`read-registry-error-ignored`, `read-registry-admits-retired-stickers`, `read-thresholds-hardwired`,
`read-config-error-freezes-the-floor`, `read-empty-room-has-no-strip`, `read-app-clock`,
`read-open-lines-truncate-silently`, `read-paid-lines-truncate-silently`,
`read-opened-is-last-activity`, `read-paid-carts-dropped`, `read-drops-the-fulfillment`,
`read-drops-who-added-it`, `read-host-ignored`, `read-kitchen-on-the-app-clock`,
`mint-lock-without-the-ref`, `mint-rejection-escapes`, `mint-converged-lands-on-add`,
`mint-landed-releases`, `strip-flip-guard-unwired`, `strip-tile-natively-disabled`,
`strip-refocus-dropped`, `strip-link-races-a-held-start`, `region-freeze-over-a-refusal`,
`ready-rise-ignored`, `wait-pops-every-tick`, `card-chip-ignores-the-refund`,
`card-clock-reads-last-activity`, and from the critic round `mint-pushes-after-unmount`,
`strip-owed-send-unmarked`, `strip-name-drops-the-owed-send`, `strip-busy-tile-unmarked`,
`strip-refocus-after-a-click-away`, `key-owed-never-set`, `key-in-tile-order`,
`board-locked-goes-to-login`, `board-clock-rerenders-every-card` (all prefixed `p2d-floor/`) — 58.

Mutants re-anchored in the critic round: `p2d-floor/mint-lock-without-the-ref` — the lock no longer
reads `pending`, so the find is `if (inFlight.current !== null) return;` and the replace reads the
render's `minting` (the same meaning: a render-time value instead of the tap-time ref; two taps in
one frame both see it null).

Mutants re-anchored: `staff-labels/table-name-uses-the-raw-status-key` — the find is now
`parts.push(ts(lang, floorStatusKey(control.status, control.refundState)));`, the replace still
`parts.push(control.status);`, its `settling` fixture unchanged (meaning kept: the raw DB status
reaches the name).

## 5. Owner-visible behaviour changes

- The counter screen's Start zone has **two** buttons: a big **Walk-up** and **Phone order** beside
  it. "Start a table" (type a number, then Start) is gone.
- Above the table cards, **a strip of every table**: a free table shows its number over "Start" on a
  dashed outline — **one tap starts it** and opens its order screen. A taken table shows its number
  over a small picture (receipt = waiting to pay at the counter, card = paying, cart = ordering,
  people = seated, check = paid, arrow = money returned) with a coloured bar; tap it to open that
  table. The table waiting to pay is the one tinted tile.
- If a diner scanned the table a moment before you tapped, the tap opens **their** table instead of a
  new order screen.
- A tile that another tablet cleared a split second ago ignores a tap for 0.6 s (you were reaching
  for the taken table).
- Each table card shows **what the kitchen has**: "2 not sent · 3 in kitchen · 1 ready to serve", or
  "Kitchen done", and a **minutes pill** (the kitchen's own late rule: calm, amber, red with a warning
  mark). The pill pops once when it turns amber or red — nothing blinks.
- When food comes out, the floor says **"Ready to serve — Table 7"** for 8 s and the card rings once.
- The floor's count line now says when a table is **waiting to pay at counter**.
- The card's time reads **"Opened 25m ago"** (when the table was opened), not the last change.
- Cards carry a **coloured edge** by state; a **refunded** table's chip says Refunded / Partly
  refunded (never Paid), on the card and on the table page.
- A start that gets no answer says **"No answer from the ordering system — it may have started. Check
  Tables & counter orders before you try again."** instead of an error screen.
- A console locked on another tab stops showing the live floor and goes to the lock screen.
- The help sheet's first counter card shows the new Start zone and a table tile.
- Under the strip, a **key**: each picture on screen with its word ("🧾 Pay at counter · 🛒
  Ordering · ● Not sent") — only for what is on the strip right now.
- A table with dishes **not sent** to the kitchen has a **red dot** in its tile's corner, and on its
  card "2 not sent" is now **red and bold** (it was grey).
- The table you tapped to start **stays bright with a spinner** while it starts; the other tables
  dim.
- A **refunded** table's chip is now **grey** ("Refunded"), the same as its tile — not orange.
- If you tap a table to start and then open another table before it answers, you **stay** on the
  table you opened (the new table still starts; it shows on the floor).
- Something else going on at the counter (the pickup lane, an approval) no longer freezes the Start
  buttons.
- In Burmese, the Phone order form's "Start" now says **ဖွင့်**, the same word as the table tiles.
- Help: "To **start** a table, tap its number under Tables." (was "seat").

## 6. K15 strings

New (every MY value is a Claude draft pending the native check):

| Key                           | EN                                                                                                            | MY                                                                                                       | HIGH?                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `floor.strip.label`           | Tables — tap a free one to start it                                                                           | စားပွဲများ — လွတ်နေတဲ့ စားပွဲကို နှိပ်ပြီး ဖွင့်ပါ                                                       | no                                                  |
| `floor.verb.start`            | Start                                                                                                         | ဖွင့်                                                                                                    | no (grounded: the retired `reg.start.table`'s verb) |
| `floor.verb.view`             | View                                                                                                          | ကြည့်                                                                                                    | no                                                  |
| `floor.kitchen.notSent`       | {n} not sent                                                                                                  | {n} ခု မပို့ရသေး                                                                                         | **yes**                                             |
| `floor.kitchen.inKitchen`     | {n} in kitchen                                                                                                | မီးဖိုချောင်မှာ {n} ခု                                                                                   | no (grounded: `kds.title`)                          |
| `floor.kitchen.up`            | {n} ready to serve                                                                                            | {n} ခု ဟင်းထွက်ပြီ                                                                                       | no (grounded: `board.pulse.up`)                     |
| `floor.kitchen.wait`          | {n} min                                                                                                       | {n} မိနစ်                                                                                                | no (grounded: `time.minAgo`)                        |
| `floor.kitchen.upNotice.one`  | Ready to serve — Table {id}                                                                                   | ဟင်းထွက်ပြီ — စားပွဲ {id}                                                                                | no (grounded)                                       |
| `floor.kitchen.upNotice.many` | Ready to serve — Tables {id}                                                                                  | ဟင်းထွက်ပြီ — စားပွဲ {id}                                                                                | no (plural pair)                                    |
| `floor.tables.asks`           | {n} waiting to pay at counter                                                                                 | ကောင်တာမှာ ရှင်းဖို့ စောင့်နေတဲ့ စားပွဲ {n} ခု                                                           | no                                                  |
| `floor.card.opened`           | Opened                                                                                                        | ဖွင့်တာ                                                                                                  | no                                                  |
| `floor.mint.unknown`          | No answer from the ordering system — it may have started. Check Tables & counter orders before you try again. | အော်ဒါစနစ်က အဖြေ မရပါ — စပြီးသား ဖြစ်နိုင်ပါတယ်။ ထပ်မနှိပ်ခင် စားပွဲများနဲ့ ကောင်တာ အော်ဒါများကို စစ်ပါ။ | no                                                  |
| `floor.key.notSent`           | Not sent                                                                                                      | မပို့ရသေး                                                                                                | **yes**                                             |

Reworded (MY re-drafted): `floor.tables.emptySub`, `help.how.counter.1.more` (and, in the critic
round, its EN: "To start a table, tap its number under Tables." — the MY already said ဖွင့်).

Re-drafted in the critic round: `reg.go` MY စဖွင့် → **ဖွင့်** (EN "Start" unchanged) — one Burmese verb
for starting on the counter screen (the strip's `floor.verb.start`, `reg.going`, the strip label and
the help line all say ဖွင့်). Pinned by `strings.test.ts` "one concept, one word — across namespaces
that draw on ONE screen".

Retired with their last reader (the typed table arm): `reg.start.table`, `reg.table.label`,
`reg.table.placeholder`, `reg.err.table`.

`STAFF_K15_HIGH` gains `floor.kitchen.notSent` and `floor.key.notSent`; `STAFF_PLURAL_PAIRS` gains
`floor.kitchen.upNotice.one` / `.many`.

## 7. Deviations from spec

- **`floorTone` lives in `lib/floor-tone.ts`, not `lib/floor-status.ts`.** `floor-status.ts` imports
  `pay-guard`, which is `server-only`; the chip, the card and the strip are client components.
- **"up" is "Ready to serve"** (`floor.kitchen.up`, the notice) — the wall's plain words since 2b
  (`board.pulse.up`), one word per concept; the spec drafted "{n} up" / "Food up".
- **The notice keys are a plural pair** (`floor.kitchen.upNotice.one/.many`) instead of
  `upNotice`/`upNoticeMany`: `strings.test.ts` refuses two keys on one surface sharing a Burmese value
  unless they are a listed plural pair.
- **A rejected start says `floor.mint.unknown`, not `out.write.failed`.** The brief's rule: an outcome
  whose response may have been lost after the server committed is said as unknown, never "wasn't
  saved".
- **The flip memory is `createFlipGuard` in lib** (clock injected), not a `freeSince` ref written in a
  layout effect: the React Compiler's purity rule flagged `Date.now()` inside the strip's layout
  effect (a false positive that appears only when the effect's dependency is derived from the
  `tableStrip` result). The rule is now falsifiable by value (`floor-rows.test.ts`).
- **The focus-across-a-flip refocus lives in `TableStrip`**, not `FloorBoard` (the strip owns the
  tiles; FloorBoard is edited in parallel by the bell area, so its hunks stay minimal). It refocuses
  only when the focused element was REPLACED, never when the person moved focus elsewhere.
- **The strip list is named once.** The visible label names the `<ul role="list">`
  (`aria-labelledby`); no wrapping `role="group"` with the same name (heard twice).
- **The card's status edge is an inset shadow on a full-card overlay**, not a 4px-wide box with the
  card's radius (a 4px box cannot carry a 20px radius without its corners collapsing).
- **The fold has no explicit `voided`/`draft` skip.** Neither state is in the sets it counts, so the
  skips were unreachable (their mutants could only survive); the voided case stays pinned as a value.
- **`run()` admits a start; callers pass `onStart`/`onRefusal`.** The first cut had callers pre-check
  `isBusy()`, which made the lock's own ref check unreachable — `verify:slice` reported
  `p2d-floor/mint-lock-without-the-ref` SURVIVING; now killed.
- **`FloorBoard` renders the strip only for a non-empty registry** (hooks cannot be conditional inside
  the strip, and `useCounterMint` throws outside the provider — the empty case needs neither).
- **Only two floor suites got the staff-lock mock** (`floor-dinein-only`, `floor-settled-detail` —
  the ones that call `getFloorView`); the other four import `lib/floor.ts` but never call it, and all
  six ran unmutated green.
- **Help card 1** shows the zone's grid (Walk-up + Phone order) beside one free tile, in a
  placement-only `.help-pic-start` wrapper (not two `.staff-arm`s: Walk-up is a Button now); the tile
  sits in the strip's own `.floor-strip` track, which is what sizes it.
- **Test harness:** suites that leave an async transition pending forever now settle it at the end of
  each case (`FloorBoard.test.tsx` `hang()`), and a refusal case waits one extra `act` tick for
  `isPending` to clear — see LEARNINGS candidates.
- **Not built (scope):** the counter bell and any sound (bell area), the tablet split pane (wave 2),
  anything in the order pad or settle components.
- **(critic round) "Not sent" is `--warn` bold, not the plan's `--t2`,** and a warn dot marks the
  owed tile. The plan's "render it once, as the segment" resolved two COMPETING counts (send-kitchen's
  Badge vs the floor's segment); the dot reads the same one count and carries no number. Filed as an
  owner check.
- **(critic round) A refunded chip is the muted `--t2`/`--sf`, not the spec's `--warn`/`--warnb`.**
  The spec coloured one table two ways (warn chip, muted tile/edge); one ink per tone is now pinned,
  and muted keeps `--warn` meaning "act now". Filed as an owner check.
- **(critic round) The key, not a word on each tile.** The critic offered either; a word on a 60–96px
  tile wraps unpredictably in Burmese and stretches the row (unmeasurable here), while the key costs
  one line, works at 390 and 1024 alike, and lists only what is on screen.
- **(critic round) The busy tile keeps "Start" beside the spinner** rather than swapping to
  `reg.going`: the primitive Button's busy rule (spinner beside the kept label), "Starting…" does not
  fit a 60px tile, and a kept label keeps the name's containment without a second al() shape.
- **(critic round) `stripKey`/`owedSendUnits` live in `lib/floor-rows.ts`,** beside `tableStrip`, and
  `FLOOR_TONES` (the tone order) in `lib/floor-tone.ts`.

## 8. Seams for the next wave

- **Tablet split — where a start lands:** `apps/qr/components/staff/CounterMint.tsx` —
  `mintLanding(sessionId, created)` and the `router.push(mintLanding(…))` inside
  `CounterMintProvider`'s `run`. `created:false` opens the seated table; the pane's `openFromCard`
  plugs in here when `useTablePane()` is present.
- **Tablet split — an occupied tile's tap:** `apps/qr/components/staff/TableStrip.tsx` —
  `tapOccupied` (the `<Link>`'s `onClick`); every tile and card carries `data-session-id`.
- **Tablet split — the card grid:** `FloorBoard.tsx` `grid` (`min(100%, 18rem)`), and
  `app/staff/loading.tsx` `cardGrid` (the `staff-split` wrapper goes around the two zones).
- **Provider stack:** `app/staff/page.tsx` — `CounterMintProvider` wraps zones 1–2 ONLY; per plan 2d
  "why", `LiveConnectionProvider > CounterBellProvider > StaffBar … > CounterSplit > split-main >
CounterMintProvider > zones 1–2` — the bell and the split wrap OUTSIDE it.
- **Bell area:** `FloorBoard.tsx` `refresh` — the `upRose` loop (the ready-to-serve cue) and the
  region's precedence render; the bell adds no second region and no second ring. The refusal dwell
  is `ERR_DWELL_MS` and the ready notice's `UP_NOTICE_DWELL_MS` (`lib/floor-kitchen.ts`) — the bell's
  own cue timing should read these, not restate 8 s.
- **Tablet split — a start that lands after the screen changed:** `CounterMint.tsx` `run` skips the
  push when the provider has unmounted (`mounted` ref). A pane that keeps the counter mounted while a
  table opens beside it must decide whether a landing start replaces the pane — that is the
  `openFromCard` seam above, not a second push.

## 9. LEARNINGS candidates

- **A React 19 async transition left pending forever poisons every LATER transition in the file.**
  Transitions are entangled: one never-settling action (a test that throws mid-transition, or a mock
  that returns `new Promise(() => {})`) keeps `isPending` true for every later `startTransition` —
  unrelated cases then read their controls as held. Settle every hung start at the end of the case.
  And an async action's `isPending` clears one tick AFTER the action returns: `await act(async () =>
{})` once more before asserting a re-armed control.
- **The React Compiler's purity rule can flag `Date.now()` inside an effect** when the effect's
  dependency is derived (via `.map`) from a value the compiler treats as a fresh mutable array — a
  false positive. Moving the clock into a lib helper with an injected `now` fixed it and made the rule
  testable by value.
- **Never read `useTransition`'s `pending` as a lock in a provider that shares a page with other
  async transitions.** React 19 entangles every pending async transition, so a sibling's action in
  flight holds another hook's `pending` true — the counter's start lock stayed held while the expo
  lane's action ran. Keep the lock in a ref + state you write yourself.
- **`window.location.assign` cannot be spied under jsdom, but the `location` global can be stubbed
  whole** (`vi.stubGlobal("location", { ...window.location, assign })`, `vi.unstubAllGlobals()` in
  `afterEach`). The first cut filed the lock redirect as untestable; it was not.
- **A regex that finds CSS rules as `(^|})\s*sel\s*\{…\}` with the `g` flag skips every other rule**
  — each match consumes the `}` the next one needs. Match `([^{}]+)\{([^{}]*)\}` and split the
  selector list instead. (Found because the new tone-parity guard read ZERO rules and failed for the
  wrong reason — a red that is not the red you induced proves nothing.)
- **A pre-check in every caller makes the callee's own guard unreachable.** The mint lock's ref check
  survived its mutant until the callers stopped pre-checking; one admission point, with the caller's
  side effects passed in as `onStart`, keeps the guard reachable and the side effect ordered.

## Critic findings (Phase 2d critic round)

Fixed (commits on `p2d/floor`):

| #   | Finding                                                        | Fix                                                                                                                                              |
| --- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | "Not sent" drawn in the quietest ink; nothing on the tile      | `--warn` bold segment (TableCard.test binds the rule to the segment's `data-seg`); owed dot + name clause on the tile; contrast pairs            |
| 2   | A late landing yanks the person off a table opened from a card | `mounted` ref in `CounterMintProvider`; FloorBoard.test (k); mutant `mint-pushes-after-unmount`                                                  |
| 3   | The starting tile looks like every held tile                   | full ink + the kit's spinner beside the kept verb; FloorBoard.test (m) (the CSS order parsed); mutant `strip-busy-tile-unmarked`                 |
| 4   | Refocus pulls focus back after a click on a non-focusable node | the blur re-read in a microtask (connected and not active = forget); FloorBoard.test (n); mutant `strip-refocus-after-a-click-away`              |
| 5   | The lock reads `pending`, entangled with other transitions     | `held`/`isBusy` read `inFlight`/`minting` only; FloorBoard.test (l) (a sibling's hung transition); `mint-lock-without-the-ref` re-anchored       |
| 6   | "Not sent" ignores a counter ask on a host table               | filed as an owner question (OPEN-ITEMS rows above) — the binding is owner decision 5c                                                            |
| 7   | Help replica tile stretches to the line                        | the replica sits in `.floor-strip`; HelpPicture.test pins the parent                                                                             |
| 8   | A refunded table is two colours                                | the chip's `returned` is the muted pair; `CHIP_TONE` exported and pinned to each `--floor-ink` by a parsing test (TableCard.test "ONE tone map") |
| 9   | `NOTICE_DWELL_MS` restates `ERR_DWELL_MS`                      | the refusal reads `ERR_DWELL_MS`; the ready notice `UP_NOTICE_DWELL_MS` (lib/floor-kitchen, documented against it); tests read both              |
| 10  | The board's `locked` arm untested                              | FloorBoard.test (p) via `vi.stubGlobal("location")`; mutant `board-locked-goes-to-login`; the "untestable" OPEN-ITEMS row removed                |
| 11a | No mutant for tick isolation                                   | mutant `board-clock-rerenders-every-card` (killed by FloorBoard.test (a))                                                                        |
| 12  | Two Burmese words for "Start"; "To seat a table"               | `reg.go` MY → ဖွင့်; the help line says "start"; a cross-namespace "one screen, one word" guard                                                  |
| 14  | Occupied tiles carry no word                                   | the strip's KEY (`stripKey`); mutants `key-owed-never-set`, `key-in-tile-order`                                                                  |
| 15  | Hardcoded px in the floor CSS                                  | `minmax(var(--s15), calc(3 * var(--s8)))`, `calc(var(--s6) + var(--s1))`, `vertical-align: text-bottom`                                          |

## Critic findings — rejected

- **#11 (second half) — "MUTATION: fold paid lines into aggByCart" cannot be a mutant.** It is
  EQUIVALENT under the code as built: `aggByCart` is keyed by `cart_id`, paid lines carry their PAID
  cart's id, and the assembly reads only the OPEN cart's id (`aggByCart.get(cart.id)`), so a paid
  line folded in lands under a key nothing reads. Measured, not argued: the exact mutation the
  critic proposed (the paid read widened to `unit_price_cents,created_at,comped`, and the loop over
  `[...lines, ...paidLines]`) left `lib/floor-kitchen-read.test.ts` 14/14 green; as a verify:slice
  mutant it would only ever SURVIVE. The per-cart key IS the guard; the "(b) never reaches 'so far'"
  case stays as the pin against a per-SESSION restructure. The first half (tick isolation) is fixed.
- **#13 — the flame on every kitchen row is not a false "cooking" signal.** In this console the flame
  is the KITCHEN's glyph, not a cooking state: the Kitchen door (`StaffDoors.tsx`) and the Kitchen nav
  entry (`lib/staff-more.ts`, `floor.nav.kitchen`) both draw it. On the card it names the row
  ("Kitchen: 2 not sent", "Kitchen: Kitchen done"), which is what a person who has walked through that
  door reads it as. Showing it only while something cooks would make one glyph mean two things
  (place and state) and make the row's label come and go; a second "neutral" glyph would give the
  kitchen two symbols. Kept, and the reason written into §1.

## Verification (critic round, at `db72d41` + notes)

| Command                                                                                                                                                                                                                                                                                                                                                 | Exit                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm turbo lint typecheck`                                                                                                                                                                                                                                                                                                                             | 0                                                                                                                                                 |
| `pnpm --filter @mms/qr test`                                                                                                                                                                                                                                                                                                                            | 0 (309 files · 4090 tests)                                                                                                                        |
| `pnpm --filter @mms/ui test`                                                                                                                                                                                                                                                                                                                            | 0 (8 files · 276 tests)                                                                                                                           |
| `pnpm turbo build --filter=@mms/qr`                                                                                                                                                                                                                                                                                                                     | 0                                                                                                                                                 |
| fast lane: `check:theme` · `check:types-sorted` · `format:check` · `check:migration-versions` · `check:promo-pin` · `check:pay-attempt` · `check:freeze-parity` · `check:staff-lang` · `check:child-freeze` · `check:echo-coalesce` · `check:mutant-anchors` · `check:scan-repeat` · `check:style-literals` · `check-test-env` · `check-money-coverage` | all 0                                                                                                                                             |
| `pnpm check:docs`                                                                                                                                                                                                                                                                                                                                       | 1 — COUNTS only (mutants 1119→1177, target modules 163→169 / lib 138→140, qr/ui test counts, tracked docs 100→101); no table or non-count failure |
| `pnpm verify:slice --no-gate --only=p2d-floor/`                                                                                                                                                                                                                                                                                                         | 0 — 58/58 caught (every new and re-anchored floor mutant), orphan guard clean, tree clean after                                                   |
