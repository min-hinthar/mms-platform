# Phase 2c · review fixes · pad2 — the order pad's blind-review findings

Branch `p2c/pad2`, base `97517ad` (the integrated 2c head). Findings: the "PAD area" section of the
three-lens blind review (P1–P13 and its two open questions). Every finding was re-verified against
the code at the base before it was fixed. No migration; no file of the other fixer's area was touched
(`FloorDetailLive.tsx`, the settle buttons, `TerminalSettle`, `register-math`, the staff-cart settle
paths and `Checkout.tsx` are unchanged). Shared files carry one labelled block each
(`// ── Phase 2c · review fixes · pad2 ──`): `lib/i18n/staff.ts` (end of `STAFF`, end of
`STAFF_K15_HIGH`), `app/globals.css` (end of file) and `scripts/verify-slice.mjs` (end of
`MUTANTS`); the one edited existing line in `globals.css` is `.pad-ticket-title`'s `outline: none`
(P10).

Commits: `aded400` (the component and lib fixes, with their tests) · `dfeb418` (the stylesheet: P10
and the reflow tier, with their contract) · `3406676` (the verify-slice mutants).

## Per finding

| Id  | Verdict                      | Commit    |
| --- | ---------------------------- | --------- |
| P1  | fixed                        | `aded400` |
| P2  | fixed                        | `aded400` |
| P3  | fixed                        | `aded400` |
| P4  | fixed                        | `aded400` |
| P5  | fixed                        | `aded400` |
| P6  | fixed                        | `aded400` |
| P7  | fixed                        | `aded400` |
| P8  | fixed                        | `aded400` |
| P9  | fixed                        | `aded400` |
| P10 | fixed                        | `dfeb418` |
| P11 | fixed                        | `aded400` |
| P12 | fixed                        | `aded400` |
| P13 | fixed                        | `aded400` |
| OQ1 | rejected (not real) — pinned | `aded400` |
| OQ2 | fixed as far as unmeasured   | `dfeb418` |

**P1 — a dish whose add is UNKNOWN is never added again under a new key.** Real: `padTileBlock`
refused only `unconfirmed`, so a lost Mohinga left its tile live and the re-tap minted a new key; the
sheet ran `heldKey.current = null` on open. New pure rule `padDishHold(pending, itemId, key)`
(`lib/order-pad.ts`): the first add on THIS dish that is lost or unconfirmed, excluding the attempt at
`key` itself (the sheet's same choice again is the one safe retry). `padTileBlock` takes `dishHeld`
and answers `"held"`, so the tile renders aria-disabled; the tap decides AT THE TAP from refs
(`writes.holdFor(id)`, `writes.counts()`), and says the Send's own lost/unconfirmed sentence
(`sendHoldMsg`). The options corner and the sheet's open go through the same tap, so they refuse too;
inside an open sheet, a NEW choice (a new key) for a held dish is refused with the same sentence. A
flying add is not a hold (its answer is coming — a second tap on it is a second dish), and a lost add
still never freezes the other tiles (`pad/lost-add-blocks-the-tiles` still caught).
Tests: `lib/order-pad.test.ts` (padDishHold ×4, padTileBlock held/settling); `OrderPad.test.tsx`
"P1 — …" (re-tap refused with the fix sentence, the corner refused, the Tea still adds; the sheet
closed and reopened is refused) and "P1/P2 — … a DIFFERENT choice … is refused". Red on the base
(the re-tap called `staffAddItem` twice; the reopened sheet opened). Mutants:
`pad2/dish-hold-ignores-lost`, `pad2/dish-hold-by-any-dish`, `pad2/dish-hold-blocks-its-own-retry`,
`pad2/tile-held-dish-live`, `pad2/tile-tap-ignores-the-dish-hold`,
`pad2/sheet-new-key-over-a-held-dish`.

**P2 — a retry refused before the ledger leaves the add unknown, under the same key.** Real: every
definite refusal `staffAddItem` gives is decided before `insertOrIncLine`'s add-key ledger (gate,
cart read, payment mutex, pricing) or by the insert's "not open" guard — none of them is a verdict on
the FIRST attempt, which may have committed. New pure `padRetryVerdict` (`lib/pad-errors.ts`): a
refused retry (sign-in excepted) becomes `{ kind: "unknown", retry }` with a sentence that says why
the retry could not run and that the dish MAY already be on (`pad.err.retry.outage` / `.paying` /
`.failed`). `usePadWrites` marks every resend (`retried`), reads the answer through
`padRetryVerdict` BEFORE the ghost and the origin's outcome (so the ghost stays `lost`, `finals` is
never set, and the sheet's `heldAfter` keeps its key); the sheet shows the retry's sentence
(`writes.retryRefusal`). A resend's refusal is now said by its ORIGIN: the ghost's "Try again" clears
the sheet's quiet flag, so a sheet add retried from the ghost after the sheet closed is said in the
pad's region, not to a closed sheet.
Tests: `lib/pad-errors.test.ts` "padRetryVerdict — …" (every definite code → unknown; outage/paying
named, the rest generic; the sentences say "may already be on", never "didn't go on"; pass-through;
the chain's outcome is unknown); `OrderPad.test.tsx` "P2 — …" (outage then paying on Try again — the
ghost stays lost, the same key three times, the region says why; `closed` on a retry → the generic
sentence; the sheet keeps its key across a refused retry) and "Try again on the ghost of a SHEET
add…". Red on the base (the ghost vanished and the region said "Mohinga didn't go on"). Mutants:
`pad2/retry-refusal-read-as-definite`, `pad2/retry-outage-said-as-failed`,
`pad2/retry-reads-first-attempt`, `pad2/ghost-retry-said-to-the-sheet`.

**P3 — the Send re-reads the note hold after its drain.** Real (`useStaffSend` read `getHold()` once,
at the tap). Now, only when a `drain` is passed (the pad), the hold is read again after the drain; a
hold found then returns the phase to idle, focuses the note field and says `sendHoldMsg(hold)`
through the controller's `onNotice`. The table page passes no drain, so nothing awaits between its
one read and its fire — its behaviour is unchanged. `SendMsg`'s `vars` widened to
`Record<string, string | number>` (`lib/staff-send-view.ts`): the hold sentence carries the dish name.
Test: `OrderPad.test.tsx` "P3 — …" (a note typed while the Send drained: no fire, the note sentence,
focus in the field). Red on the base (`staffFireCart` was called). Mutant:
`pad2/send-fires-past-a-late-note`.

**P4 — nothing is added while Take payment is on its way out.** Real. `padTileBlock` takes
`settling` (`"settling"`); the tap reads Take payment's phase from a ref (`phaseRef`, moved together
with the state by `toPhase`) and says what Take payment is doing (`padSettleBusyKey` — "Saving the
name…" / "Opening payment…"). The sheet's Add refuses on the same phase. After a successful name
save the chain drains AGAIN and re-reads its blocker before `router.push`.
Tests: `OrderPad.test.tsx` "P4 — …" (a tile during the name save and during "Opening payment…": no
add, the busy sentence in the region). Red on the base (the tile added). Mutants:
`pad2/tile-live-while-settling`, `pad2/tap-ignores-the-settle`. The sheet's guard and the second
drain have no test and no mutant, deliberately: no door can reach them once the tiles refuse (the
options sheet is modal over Take payment, and a lost ghost refuses Take payment before it starts), so
they are defence in depth — a test would have to fabricate a path the product does not have.

**P5 — a hung detail read is never piled on.** Real (`raceTimeout` freed `inFlight` at 15s; each 5s
poll then queued another abandoned call behind the hung action). `usePadDetailLive` watches the RAW
promise (`rawPending`, cleared when it answers); no read starts while it is unanswered, and every ask
it refused is owed ONE read the moment it answers (`owed` → `kick`, the refresh mirrored in an effect).
Test: `OrderPad.test.tsx` "P5 — …" (45s of a hung read: one call; its answer kicks exactly one more).
Red on the base (three calls). Mutants: `pad2/detail-read-piles-on-a-hung-one`,
`pad2/owed-read-never-kicked`.

**P6 — a hung add is said, and so is the resolution.** Real. At the dispatch timeout the region says
`pad.err.add.checking` once ("No answer yet about {x} — still checking. If it stays, reload the
order.") unless the add's origin (the sheet) was still waiting, which is told by its own line instead.
Every add whose doubt was SAID — this timeout, "we couldn't confirm", the sheet giving up — is said to
land (`browse.added`, as NEWS: never deferred behind the correction it answers). Every retry follows
one of those, so a retry that lands is said too.
Tests: `OrderPad.test.tsx` "P6 — …" (the REGION at 16s, then "Added 1 × Mohinga." on the late ok; a
Try again that lands). Red on the base (the region was empty at 16s; the retry's ok left "We couldn't
confirm" standing). Mutants: `pad2/hang-said-to-nobody`, `pad2/retry-ok-silent`.

**P7 — focus never falls to <body>.** Real. (a) `GhostRow` keeps its "Try again" `Button` once tapped
(`tried`): busy ("Adding…" / "Checking…", aria-busy) while the retry is on its way, live again if it
comes back lost — the SAME node, so focus stays. (b) A pad-level catch-all, FloorDetailLive's rule:
on any detail commit or pending change, focus that FELL to <body> after real focus on the pad goes to
the ticket's heading (the search circle when the phone shows the menu); declared after the dock's own
restore, which wins. (c) `StaffLineEditor`: a saved note closes the editor with `flushSync`, then
focus that fell goes to the note button (the table page benefits too).
Tests: `OrderPad.test.tsx` "P7 — …" (focus stays on the busy Try again; when the ghost leaves, the
heading); `StaffLineEditor.test.tsx` "P7 — …" (Save → the note button). Red on the base (<body> in
both). No mutant: focus wiring, not a money/authority/decision rule.

**P8 — the view button says what the adds ARE.** Real. New pure `padViewStatus(counts)`: lost →
`pad.bar.check` ("Check the order"), unconfirmed → `pad.ghost.checking`, flying/unseen →
`pad.ghost.adding`, most urgent first. Tests: `lib/order-pad.test.ts` "padViewStatus — …";
`OrderPad.test.tsx` "P8 — …". Red on the base ("Order · 1 item · Adding…" over a lost add). Mutants:
`pad2/view-lost-said-adding`, `pad2/view-unconfirmed-said-adding`.

**P9 — a tile's name keeps each run's language.** Real. `PadTile` is named by `aria-labelledby` over
its own runs, in reading order: the verb (an sr-only `browse.add.verb.add` on an add tile, whose only
visible mark is the aria-hidden +; the visible Choose / Sold out span otherwise), the lead and the
echo (each with its own `lang`), the price, the `×N`, and the `+N` with `pad.ghost.adding` (sr-only)
after it — WCAG 2.5.3 now holds for the pending count too. No hand-built name string remains
(`al()` is no longer used here). Test: `OrderPad.test.tsx` "P9 — …". Red on the base (no
`aria-labelledby`). No mutant (a naming rule).

**P10 — the heading's focus ring.** Real (`.pad-ticket-title { outline: none }` beat the global
`:focus-visible` by source order). The outline now goes only on
`.pad-ticket-title:focus:not(:focus-visible)` (pad2 block at the end of `globals.css`). Test: new
`lib/pad-shell-contract.test.ts` (no `.pad-*` rule turns the outline off without
`:not(:focus-visible)`, parsed with the shared `cssDeclarations`). Red on the base.

**P11 — a counter-name Save is never a live-looking no-op.** Real for the empty-with-nothing-saved
case; the empty-over-a-saved-name case already cleared the name (`nameDirty` → `saveName("")`) and is
now pinned. New pure `padNameSave(value, saved)`: `save` / `saved` / `empty`. `empty` renders Save
aria-disabled with an `aria-describedby` reason (sr-only `pad.name.empty`) and a tap says it through
the pad's region. Tests: `lib/order-pad.test.ts` "padNameSave — …"; `OrderPad.test.tsx` "P11 — …"
(empty → aria-disabled, the reason, said once, no write; emptied over "Aye" → cleared). Red on the
base (no aria-disabled). Mutants: `pad2/name-empty-reads-saved`, `pad2/name-clear-refused`,
`pad2/name-empty-tap-silent`.

**P12 — one dish name per line row.** Real. `StaffLineEditor` reads ONE binding,
`dishLabel = dishVisible(lang, line.name, line.nameMy)` — the stepper's labels, the Remove-or-make-free
button, both note-button names and the note field's label. Tests: `StaffLineEditor.test.tsx` "P12 —
…" (Burmese note button, note label, loss button). Red on the base ("— Mohinga" under `my`). No
mutant (a naming rule).

**P13 — the guards.** The one-region test now runs the REAL `StaffBar` (only its two server actions
are stubbed; the whole suite passes with it) and documents why a dialog is excluded (the options sheet
is a modal view with its own one region, and the Toast stays live beside it — OQ1's test). The 15s
test asserts the region (P6), the Try again test asserts focus (P7), a refused retry is tested (P2)
and so is the post-drain note (P3).

**OQ1 — is the pad's Toast hidden while the options sheet is open? — REJECTED, not real.** Radix's
modal sweep is `aria-hidden`'s `hideOthers`, which keeps every `[aria-live]` node present at the time
(`node_modules/.pnpm/aria-hidden@1.2.6/node_modules/aria-hidden/dist/es2015/index.js:131-133`), and
the `@mms/ui` Toast region is always mounted with `aria-live="polite"` (`packages/ui/src/toast.tsx`,
its docblock names exactly this case). Pinned by `OrderPad.test.tsx` "open question — the options
sheet never hides the pad's one region"; red-first by dropping `aria-live` from the Toast (the test
went red: the region sat inside an `aria-hidden` subtree), reverted.

**OQ2 — reflow at 320×256.** Real in principle and unmeasurable here: a `@media (max-height: 20em)`
tier (pad2 block, `globals.css`) turns the app shell into a document — `.pad-main` `height: auto;
overflow: visible`, the panes stop scrolling on their own (`.pad-ticket` takes the `overflow`
shorthand: beside its hidden x-axis a `visible` y-axis would compute to `auto`), and the dock follows
the ticket. Pinned by `lib/pad-shell-contract.test.ts` (the tier exists, reaches 16em, and declares
exactly that). Unmeasured in a browser — OPEN-ITEMS row below.

## OPEN-ITEMS rows

Existing rows this branch changes:

- **CLOSED — "A late `ok` on a sheet add after the sheet gave up is not announced"** (pad notes, low).
  The sheet giving up now marks the add as announced (`usePadWrites` `resolveOnce`), and its late ok
  is said as news (`browse.added`) — P6.
- **CHANGED — "Starting constants, unmeasured"** (pad notes, low): add the reflow tier's `20em`.

New rows:

| Sev | Item                                                      | Why / where                                                                                                                                                                                                                                                                                                                                                              |
| --- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| low | The pad's reflow tier is unmeasured                       | `@media (max-height: 20em)` at the end of `app/globals.css`: the threshold and the document-mode layout (the page scrolls, the panes do not, the dock follows the ticket) were written without a browser. Measure at 320×256 CSS px (a laptop at 400% zoom) and on a small phone in landscape; the Toast's `--cta-dock-h` offset is not re-measured in document mode.    |
| low | A queued sheet add whose sheet gave up is not a dish hold | `padDishHold` holds a dish only on a lost or unconfirmed add. A sheet add queued behind a hung one tells its sheet "couldn't confirm" at 15s while its ghost is still `flying`; once the hung add answers, it dispatches, and until its own answer (normally milliseconds) a re-opened sheet for the dish mints a new key. Every tile is held while the add ahead hangs. |
| low | Refused retries have no family sentence                   | `pad.err.retry.*` are said without a `.family` form (`usePadWrites`, `padSlotNotice`): two dishes' retries refused a beat apart show the second sentence over the first. Each ghost still offers Try again, so nothing is lost; add families if it happens.                                                                                                              |

## K15 strings

Every MY value is a Claude-authored draft pending Min's native check; each is grounded in the pad's
own words (named in the `staff.ts` block comment). HIGH = K15-HIGH (trailing marker + in
`STAFF_K15_HIGH`). No plural pairs; no key retired; `pad.a11y.adding` was drafted and dropped before
commit (the strings guard caught it as a fork of `pad.ghost.adding` — the tile's name reuses that key).

| Key                  | EN                                                                                          | MY                                                                                                         | HIGH? |
| -------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----- |
| pad.err.retry.outage | We can’t reach the system — {x} may already be on the order. Check the order, or try again. | စနစ်နဲ့ ဆက်သွယ်မရပါ — {x} အော်ဒါထဲ ရောက်ပြီးသား ဖြစ်နိုင်ပါတယ်။ အော်ဒါကို စစ်ပါ၊ ဒါမှမဟုတ် ထပ်စမ်းပါ။      | HIGH  |
| pad.err.retry.paying | A guest is paying for this table — {x} may already be on the order. Check the order.        | ဧည့်သည်တစ်ယောက် ဒီစားပွဲအတွက် ငွေရှင်းနေပါတယ် — {x} အော်ဒါထဲ ရောက်ပြီးသား ဖြစ်နိုင်ပါတယ်။ အော်ဒါကို စစ်ပါ။ | HIGH  |
| pad.err.retry.failed | That didn’t go through — {x} may already be on the order. Check the order, or reload it.    | မအောင်မြင်ပါ — {x} အော်ဒါထဲ ရောက်ပြီးသား ဖြစ်နိုင်ပါတယ်။ အော်ဒါကို စစ်ပါ၊ ဒါမှမဟုတ် အော်ဒါ ပြန်ဖွင့်ပါ။    | HIGH  |
| pad.err.add.checking | No answer yet about {x} — still checking. If it stays, reload the order.                    | {x} အတွက် အဖြေ မရသေးပါ — စစ်နေဆဲပါ။ ဒီအတိုင်း ကြာနေရင် အော်ဒါ ပြန်ဖွင့်ပါ။                                 | HIGH  |
| pad.bar.check        | Check the order                                                                             | အော်ဒါကို စစ်ပါ                                                                                            |       |
| pad.name.empty       | Type a name to save — it’s optional.                                                        | သိမ်းဖို့ နာမည် ရိုက်ပါ — မထည့်လည်း ရပါတယ်။                                                                |       |

## CHANGELOG

- **Staff order pad — review fixes (Phase 2c).** A dish whose add may already be on the order can no
  longer be added again under a new key: its tile, its options and a new choice in its sheet refuse
  and point to "Try again" or a reload, and a "Try again" that cannot reach the system keeps the dish
  in doubt (same key) and says it may already be on, instead of "didn't go on". The Send re-checks a
  kitchen note typed while it waited, nothing is added while Take payment is leaving, a hung read is
  never piled on, a 15-second silence and its resolution are both said, focus never drops to the
  page, the phone's order button says "Check the order" / "Checking…" instead of "Adding…", tile names
  keep each language's voice and count what is on its way, an empty name Save says why, every
  control on a line names the dish the same way, the order heading shows its keyboard focus ring, and
  a very short screen scrolls the pad as one page.

## DESIGN-LANGUAGE (§28 · §17) — rule changes

§28, added or amended:

- **A dish whose add is unknown refuses a NEW add** (`padDishHold`): lost or unconfirmed, on THIS
  dish — the tile (aria-disabled, `"held"`), its options corner, the sheet's open and a new choice in
  an open sheet. The refusal is the Send's own sentence (Try again on it, or reload). The held
  attempt's own key always passes. A flying add is not a hold, and no other dish is held.
- **A retry's refusal is no verdict on the first attempt** (`padRetryVerdict`): the add stays lost
  under its key, and the sentence says why the retry could not run and that the dish may already be
  on — never "didn't go on". A retry's outcome is said by its origin (the ghost's in the pad's
  region, the sheet's in the sheet).
- **Every decision a tap makes is taken at the tap, from refs** — the adds (`holdFor`, `counts`) and
  Take payment's phase (`phaseRef`), never the last render.
- **Nothing goes on while Take payment is leaving** (`padTileBlock` `"settling"`; the sheet's Add
  too); a tap says what Take payment is doing. The chain drains again after the name save.
- **The Send re-reads its hold after the pad's drain.**
- **One raw read in flight.** A detail read that timed out is still in Next's action queue: no read
  starts until it answers, and the asks it refused are owed one read at its answer.
- **Doubt said is resolution said.** 15s unanswered is said once (`pad.err.add.checking`); an add
  whose doubt was said is said to land (news, never deferred behind the correction it answers).
- **The phone's view button says what the adds ARE** (`padViewStatus`): Check the order · Checking… ·
  Adding….
- **A tile is named by its own runs** (`aria-labelledby`): verb, lead, echo (each its own `lang`),
  price, ×N, +N with its word. No flattened aria-label.
- **Focus catch-all on the pad** (FloorDetailLive's rule): focus that falls to <body> after real focus
  on the pad goes to the ticket's heading. "Try again" keeps its node through the retry; a saved note
  hands focus to its note button.
- **A programmatic focus target never turns its outline off bare** — only under
  `:focus:not(:focus-visible)`, so the keyboard landing keeps the global ring.
- **The reflow tier** (`max-height: 20em`): the shell becomes a document; the bar stays the only
  sticky element.

§17, added: **An empty Save is refused, never a no-op** — nothing typed and nothing saved is
aria-disabled with a stated reason, said once on a tap; an emptied field over a saved value clears it.

## Mutate-set / CLAUDE.md enumeration

Measured with `grep -oE '^\s+file: "[^"]+"' scripts/verify-slice.mjs | sort -u` against base
`97517ad`: **160 → 163 modules** (lib 138, api 3, db 1 unchanged; components 18 → 21). Joined, bucket
components: `apps/qr/components/staff/usePadWrites.ts`, `apps/qr/components/staff/useStaffSend.ts`,
`apps/qr/components/staff/usePadDetailLive.ts`. Mutants **1056 → 1078** (+22, block
`// ── Phase 2c · review fixes · pad2 ──` at the end of `MUTANTS`). CLAUDE.md's `verify:slice` comment
and its component enumeration are integration's to update (they still read 158 / 988 / SIXTEEN at the
base).

Mutants added — all 22 KILLED (`pnpm verify:slice --no-gate --only=pad2/`, exit 0):
`pad2/dish-hold-ignores-lost`, `pad2/dish-hold-by-any-dish`, `pad2/dish-hold-blocks-its-own-retry`,
`pad2/tile-held-dish-live`, `pad2/tile-live-while-settling`, `pad2/view-lost-said-adding`,
`pad2/view-unconfirmed-said-adding`, `pad2/name-empty-reads-saved`, `pad2/name-clear-refused`,
`pad2/retry-refusal-read-as-definite`, `pad2/retry-outage-said-as-failed`,
`pad2/retry-reads-first-attempt`, `pad2/ghost-retry-said-to-the-sheet`, `pad2/retry-ok-silent`,
`pad2/hang-said-to-nobody`, `pad2/tile-tap-ignores-the-dish-hold`, `pad2/tap-ignores-the-settle`,
`pad2/sheet-new-key-over-a-held-dish`, `pad2/name-empty-tap-silent`,
`pad2/send-fires-past-a-late-note`, `pad2/detail-read-piles-on-a-hung-one`,
`pad2/owed-read-never-kicked`.

No mutant re-anchored (`check:mutant-anchors` clean). Existing mutants on the touched modules re-run
and all KILLED: `--only=pad` 89 caught (pad/, pad-ui/, p2a-padserver/, pad2/), `--only=staff-send` 32
caught, `--only=staff-add` 5 caught.

## LEARNINGS candidates

- **A retry's refusal is about the retry.** Where an idempotency ledger sits AFTER the refusal
  points (gate, mutex, pricing), a same-key retry that is refused has not consulted the ledger — it
  proves nothing about the first attempt. Read it through its own verdict function before the state
  machine AND before the origin's outcome: transforming it inside the handler alone left the origin
  resolving "refused" and dropping the held key.
- **A `raceTimeout` frees the caller, not the queue.** Under Next's one-at-a-time Server Actions, a
  read that timed out is still queued; the next "fresh" read queues behind it. Watch the raw promise
  apart from its timeout.
- **"Same English, same Burmese" catches a key you did not need.** A lowercase "adding" for an
  accessible name was the ghost's "Adding…" folded — reuse the key, one word per concept.
