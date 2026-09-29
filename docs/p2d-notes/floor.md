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
  tablet, tiles capped at 96px. An empty registry draws no strip (never a dead control).
- **One mint lock per screen.** `CounterMintProvider` wraps zones 1–2; Walk-up, Phone order and every
  free tile start through `useCounterMint().run`, the ONE place a start is admitted (tap-time ref;
  `minting` names which control went; every start control `aria-disabled`, the minting one
  `aria-busy`; never native `disabled`; a landed start holds until the route swap; a refusal or a
  rejection re-arms). The hook throws outside the provider. A caller's "new tap" work rides `onStart`
  (only for a start that goes, before the server is asked), never a pre-check of its own.
- **A start whose answer never came is UNKNOWN, never "not saved".** A rejected server action is
  caught (the error boundary never replaces the counter screen) and said as `floor.mint.unknown` — the
  next poll shows the table taken if it landed.
- **`created:false` opens the seated table, never its add screen** (`mintLanding`).
- **A stale-free tap never mints.** A tile that flipped occupied → free within `FLIP_GUARD_MS`
  (600 ms) ignores the tap (`createFlipGuard` — the memory and its clock live in lib; the strip only
  asks). Focus survives a tile's button ↔ link flip, and only when the element was REPLACED under it.
- **The Start zone is two controls.** Walk-up is the zone's ONE primary (the primitive Button, `xl`,
  block); Phone order the `.staff-arm` beside it; while the Phone form is open its Go is the primary
  and Walk-up steps down to secondary. Stacked on a phone, `2fr 1fr` from 48em (`.reg-start`).
- **The kitchen row says what the kitchen has, in the wall's words.** `2 not sent · 3 in kitchen ·
1 ready to serve`, or "Kitchen done" alone — never over an unsent dish. "Not sent" is 2a's one
  count (`staffOwedSendUnits`); "in kitchen" is `PULSE_COOKING_STATES` past the send grace; "ready to
  serve" is the wall's `PULSE_PASS_LINGER_MS` window and the wall's own words. Never "ready" as a
  claim anyone ran the food.
- **The wait is the kitchen's own rule in whole minutes.** `floorWait` → `kdsUrgency('dinein', …)` with
  the configured thresholds; from one whole minute; ok quiet, amber the gold-tint pair with a gold
  edge (its shape cue), red the warn pair with an edge and the alert glyph. A LEAF with its own 15 s
  clock (skew-corrected once per `serverNow`); the board and the card re-render only on the poll.
- **No loop on the counter.** The pill replays the kit's one-shot `.mms-pop` only when its level RISES
  between ticks; "ready to serve" rings the card's existing one-shot `.floor-card-pulse` once.
- **One status word per state across tile, chip and name — and never a success word over returned
  money** (`floorStatusKey`: a refunded paid table reads Refunded / Partly refunded; `floorTone`:
  `returned` is `--t3`/`--t2`, never `--ok`). The drill-down header chip reads the same.
- **The card wears a status edge** (a 4px inset rail on a full-card overlay so it follows the card's
  corner; `rest` has none) and its clock reads **"Opened {ago}"** (the session's start), not last
  activity.
- **The board's ONE region, with a written precedence:** a strip refusal (8 s dwell, cleared by the
  next start) > the freeze > "Ready to serve — Table 7" (8 s) > the counts, which gain
  "{n} waiting to pay at counter" whenever a table asks. The strip, the tiles and the pill mount no
  live region.
- **Cards never re-sort by status.** The grid keeps the floor's stable order (`mergeFloorRows`); the
  strip carries the map. The card grid's minimum is `min(100%, 18rem)`.
- **Tone changes are instant** (`.floor-tile` overrides `.staff-press`'s box-shadow transition); only
  transform and opacity move.

## 2. CHANGELOG

- **Phase 2d · floor — the counter's room map and its one-tap start.** A strip of the room's tables
  above the cards: tap a free table to start it (a 600 ms guard keeps a just-cleared tile from
  starting a table someone meant to open), tap a taken one to open it. Walk-up is the Start zone's one
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

| Sev | Item                                                                           | Why / where                                                                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| med | Undo a table start (§22)                                                       | A mis-tapped free tile leaves an empty session; Clear table recovers it. A race-free "close while still empty" needs one RPC (no member, no line) — a prod migration, gated by M125. `apps/qr/lib/register.ts` `startTable`.                                                    |
| med | "Clear & seat next party" in the drill-down's Clear confirm (owner decision 7) | Turnover: clearTable → openRegisterOrder for the same number → /add in one row. Waits for K35's conversion of that confirm row (native `disabled`).                                                                                                                             |
| low | `startTable` converges by sticker `qr_code` only                               | The kiosk's occupancy predicate is `table_number`; a kiosk-coded dine-in session would allow a second start once SURFACES.kiosk un-parks. The strip opens an occupied number by session id and never re-mints it. `apps/qr/lib/register.ts:startTable`.                         |
| low | `startTable`'s registry read has no `.eq('active', true)`                      | The strip offers only active tables, so only a hand-built POST reaches an inactive number. `apps/qr/lib/register.ts:startTable`.                                                                                                                                                |
| low | The drill-down poll has no `locked` arm (K14's other half)                     | `getTableDetail` / `FloorDetailLive` keep polling behind a lock taken on another tab.                                                                                                                                                                                           |
| low | `.staff-zone-head` scroll-margin under the sticky bar                          | The approvals circle's fragment jump lands a heading under the bar; belongs to the chrome/bar area (measure from the tallest bar: Burmese title + echo).                                                                                                                        |
| low | Measure the floor on a device                                                  | No browser here. Owed: 390 / 768 / 1024 · en / my · Light / Night screenshots of the strip (5×2 on a phone, the 14px Burmese "Start"), the three pill levels, the status edge on a textured card, the Start zone's 2fr 1fr row, the loading skeleton against the hydrated page. |
| low | `FLIP_GUARD_MS` (600 ms) is a starting value                                   | Unmeasured under a real finger on a real poll; `apps/qr/lib/floor-rows.ts`.                                                                                                                                                                                                     |
| low | The board's `locked` arm is not unit-tested                                    | jsdom's `window.location.assign` cannot be spied (non-configurable); the reason is pinned at the lib level (`floor-kitchen-read.test.ts`) and the arm mirrors the KDS's. `apps/qr/components/staff/FloorBoard.tsx` refresh.                                                     |
| low | The card's spoken wait is as of the poll                                       | The visible pill ticks on its own 15 s clock; the card's accessible name computes the minutes at `serverNow` (≤ one poll behind). `apps/qr/components/staff/TableCard.tsx`.                                                                                                     |
| low | A paid round's kitchen lines come from refunded orders too                     | The floor's order read admits `paid` and `refunded` (K33's policy), so a fully refunded round's served lines count as "Kitchen done". Honest (the food was cooked) but worth a look if a refunded table should read differently. `apps/qr/lib/floor.ts` `paidCartSession`.      |
| low | K15 — the Phase 2d floor strings                                               | Every new Burmese value below is a Claude draft; `floor.kitchen.notSent` is K15-HIGH.                                                                                                                                                                                           |

## 4. Mutate-set / CLAUDE.md enumeration changes

Measured with the documented greps at this head: **169 target files** (140 `apps/qr/lib` + 3 API
routes + 25 components/hooks + 1 `packages/db`), **1168 mutants** (base: 163 files, 1119 mutants).

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
`card-clock-reads-last-activity` (all prefixed `p2d-floor/`).

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

Reworded (MY re-drafted): `floor.tables.emptySub`, `help.how.counter.1.more`.

Retired with their last reader (the typed table arm): `reg.start.table`, `reg.table.label`,
`reg.table.placeholder`, `reg.err.table`.

`STAFF_K15_HIGH` gains `floor.kitchen.notSent`; `STAFF_PLURAL_PAIRS` gains
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
  placement-only `.help-pic-start` wrapper (not two `.staff-arm`s: Walk-up is a Button now).
- **Test harness:** suites that leave an async transition pending forever now settle it at the end of
  each case (`FloorBoard.test.tsx` `hang()`), and a refusal case waits one extra `act` tick for
  `isPending` to clear — see LEARNINGS candidates.
- **Not built (scope):** the counter bell and any sound (bell area), the tablet split pane (wave 2),
  anything in the order pad or settle components.

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
  region's precedence render; the bell adds no second region and no second ring.

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
- **A pre-check in every caller makes the callee's own guard unreachable.** The mint lock's ref check
  survived its mutant until the callers stopped pre-checking; one admission point, with the caller's
  side effects passed in as `onStart`, keeps the guard reachable and the side effect ordered.
