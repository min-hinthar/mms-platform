# Phase 2b · kitchen — integration notes

Branch `p2b/kitchen` off `bd946c4`. Scope: kitchen-tickets `final` changes 0–17 (commit 1 + the
droppable commit 2), floor `final` changes 0–2 (the `kds-urgency` lift), and feedback `final`
changes 10, 11, the SOUND half of 22, the `.kds-undo` safe-area line of 24, and feedback tests 25/26.

## 1. DESIGN-LANGUAGE draft (§17 bullets, as-built)

- **The 86 lives behind the line's ⋯, never one tap under the line (K22).** A trailing `.kds-line-more`
  cell (48px × the row's full height, a `--bd` hairline on its left, the lucide Ellipsis at 1.15em
  against the dial, `.staff-press`) renders only where `canEightySix(line)` holds (a menu dish, not
  already sold out) and is named by sr-only `<Chrome k="kds.line.more">` ("More for {x}") with
  `aria-haspopup="dialog"` + `aria-expanded`. It opens ONE board-level `Sheet` (`className="dark
kds-menu"`, titled by `TicketDishTitle`): the hint, the sheet's ONE `role=status` region (above the
  button, so a refusal grows the sheet upward), then a `Button variant="danger" size="xl" block`.
  Two deliberate taps: the sheet's 86 is refused with no visual while `removeHeld(openedAt, now)`
  (SAME_GESTURE_MS from the sheet's mount) and while the sheet is exiting (`!open`). No Sheet `busy`
  (§16 — the write is reversible and resolves into the board).
- **The result resolves IN the sheet.** The Button goes busy (label kept); the dish's ⋯ is
  `aria-disabled` (the opener also `aria-busy`); a refusal renders in the sheet's region in the
  device language and re-arms the Button; a success UNMOUNTS the sheet (`landedKey`, never a close —
  a closing sheet keeps the board `aria-hidden` through its exit) in the same commit as the override,
  the undo bar and the region's notice, and focus lands once on the dish's own line button (only if
  orphaned; the flag is consumed in that commit). A cook who dismisses mid-write lands on the busy ⋯
  and the write finishes at board level; a refusal then goes to the board's region (8s dwell).
  `refresh()` runs on EVERY outcome.
- **A dish's kitchen note sits directly under that dish, as its description.** `TicketNote`, a sibling
  after `.kds-item-row` inside the same `<li class="kds-item">`, never inside the line button (the held
  fade never reaches it) and never after a control. EXACTLY two flex children — the aria-hidden ⚠ and
  ONE `.ticket-note-text` span holding an sr-only "Kitchen note — " prefix and the note's script runs
  (§6: a flex container drops whitespace-only children). The line button is `aria-describedby` the
  held slot, then the note (`lineDescribedBy`, never an empty attribute). The divider and the started
  wash live on `.kds-item`, so a note can only belong to the dish above it. It is the ONLY warn band
  inside a ticket. The expo bag line reuses it (`as="span"`, `.expo-note`, quotes dropped).
- **Sold out is a fact on the line and a clause in its name.** The tag row gains OFF THE MENU
  (`kds.86.done`) in `--tx` beside a 0.55em `--warn` dot (warn ink measures 4.44:1 on the started
  tint; pinned in composite-contrast). Because the line button's `aria-label` replaces its content,
  `al(kind:"line")` takes a REQUIRED `soldOut` and appends " — Off the menu".
- **The board's confirmed override is keyed on the poll sequence, never "until the prop agrees".**
  Every refresh that actually starts stamps `fetchSeq`; an OK 86 (or Undo) records
  `{soldOut, afterSeq: latest started}`; a snapshot drops it only when its fetch started later
  (`pruneSoldOut`: `snapshotSeq > afterSeq`). `overlaySoldOut(snap.tickets, overrides)` is the ONE
  binding the row, the tag, the ⋯, the sheet's subject, `expectedSoldOut` and the name read. The
  sheet's subject is the LIVE line (`lineMenuSubject`, across every ticket); the id is cleared in the
  render that finds it gone, so a recall never reopens the sheet.
- §17's action-button sentence (line ~704): the kitchen board's **nine** action buttons — bump ·
  fire · the line · the ⋯ · the sheet's 86 · undo · recall · the pager (‹ ›). Measured by hand from
  `KdsBoard.tsx` + `KdsLineMenu.tsx`.
- §6: a free-text note's Myanmar runs are marked `lang="my"` (Padauk 700, `font-synthesis: none`,
  `--lh-my`); Latin runs stay bare text nodes (`noteRuns`, neutrals ride the run before).
- §3: the 86 and its Undo buzz at the TAP (`haptic("commit")` synchronously), never after the round
  trip; opening the ⋯ buzzes `pick`.
- §24: the `.kds-undo` pill mounts in the ⋯ sheet's button footprint, so its eighty6 Undo is held for
  SAME_GESTURE_MS from the pill's mount (`shownAt`). The bump's Undo is not held yet (filed).
- §15 (KDS): `soundOn` FOLLOWS the engine — `KdsChime.subscribe` → `setSoundOn(armed)` on the
  context's `statechange` and after every arm — and `enableSound` sets `soundWanted` on the mount
  that armed it, so a context suspended under a sleeping tablet shows the warn chip and re-arms off
  the next tap, silently.
- (commit 2, droppable) A qty-1 chip is a quiet ringed `--tx` numeral; only a multiple
  (`qtyStands`) wears the lit `--ac` fill. A started item carries an inset 4px `--ac` left edge (the
  COOKING tag stays). The bump's ✓ is 0.9em against the dial.
- Lateness is `kdsUrgency` + `DEFAULT_KDS_THRESHOLDS` + `shapeKdsThresholds` (`lib/kds-urgency.ts`);
  the KDS reads it, the floor (2d) will import it; nobody restates 8/12.

## 2. CHANGELOG

- **Phase 2b · kitchen (K22).** The 86 moves behind a per-line ⋯ into a sheet — two deliberate taps,
  the second held for the same gesture, resolved in the sheet with its refusal beside the finger and a
  held Undo — and a board override keyed on the poll sequence stops a coalesced poll re-offering it;
  each dish's kitchen note now sits directly under that dish as its description, with Burmese runs
  marked (the expo bag line too); sold out is a tag on the line and a clause in its name; the KDS
  sound chip follows the audio engine (a slept tablet shows "Sound off — tap to turn on" instead of a
  dead slider); the undo pill clears the home indicator; lateness is one module (`kds-urgency`).
  Separate commit: quiet single quantities, a started-line edge, a scaling bump ✓. K15: 3 new strings
  - 1 re-draft, 2 HIGH (`kds.86.hint`, `help.how.kitchen.3`).

## 3. OPEN-ITEMS rows

| Sev | Item                                                                                         | Why / where                                                                                                                                                                                                                                                                                                                                                                      |
| --- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Med | An unlogged 86 gets no undo entry                                                            | `setItemSoldOut`'s ledger-insert failure lands the flag but answers `ok:false code:'sentence'`, indistinguishable from the outage sentence (`menu-availability.ts` ~160-171). Needs a distinct `SoldOutErrCode` in that mutate-set module plus the `MenuPriceEditor` consumer. The board refreshes on every outcome, so the dish shows sold out, but the 6s Undo is not offered. |
| Low | The BUMP's undo pill has no same-gesture hold                                                | Only the eighty6 kind is held (`shownAt`). The bump's source control is not in the pill's footprint by construction; holding it churns every bump test.                                                                                                                                                                                                                          |
| Low | Owner decision: quantity emphasis (commit 2)                                                 | Shipped as its own commit (`6765ba6`), droppable alone. Uniform lit chips vs quiet singles.                                                                                                                                                                                                                                                                                      |
| Low | Owner decision: 86 placement                                                                 | Per-line ⋯ built; the alternative is one ⋯ per ticket opening a dish list (no name width cost, a mis-pick risk).                                                                                                                                                                                                                                                                 |
| Low | Owner decision: idle auto-close for the ⋯ sheet                                              | Not built; one tap on the scrim closes it and it closes itself when its line leaves. Pinned by the "unattended sheet" test.                                                                                                                                                                                                                                                      |
| Low | Owner decision: put-back from the kitchen                                                    | Kept OFF the ticket (W23a): the 6s undo, then /staff/menu (server-and-up).                                                                                                                                                                                                                                                                                                       |
| Low | Owner decision: catalog allergens on tickets                                                 | Recommended NO (alarm fatigue dilutes the one warn band).                                                                                                                                                                                                                                                                                                                        |
| Med | K15 native check                                                                             | `kds.86.hint` (HIGH), re-drafted `help.how.kitchen.3` (HIGH, re-queued), `kds.line.more`, `kds.note.sr`.                                                                                                                                                                                                                                                                         |
| Low | Measure the ⋯ and glance constants on the real 15.6" KDS                                     | Spec starting values, unmeasured here (no device): the ⋯ cell 48px wide × ≥56px, glyph 1.15em; the sold-out dot 0.55em; the started edge 4px; the bump ✓ 0.9em; the estimated ~50px (EN) / ~62px (MY) per-line height reclaim at Small.                                                                                                                                          |
| Low | Viewport / screenshot pass not run                                                           | 390 phone (sheet full-width, bottom-flush), 768/1024 tablets, 1280 (4 columns, ~14% name width to the ⋯), 1920; both tongues, S/M/L. And the `.kds-undo` safe-area inset on a notched device.                                                                                                                                                                                    |
| Low | A second dish's sheet opened while another dish's 86 is in flight                            | Only reachable after dismissing the first; that dish's refusal goes to the board region, which is under the second sheet's aria-hidden — visible behind the scrim, unannounced. Noted, not engineered.                                                                                                                                                                           |
| Low | A hung `setItemSoldOut` is not timed out                                                     | Pre-existing; the sheet stays dismissible (no `busy`), so the cook is never trapped.                                                                                                                                                                                                                                                                                             |
| Low | Bag it / Cooking are not in the line's accessible name                                       | Pre-existing gap; only the sold-out clause was added (it replaces a statement 2b deleted).                                                                                                                                                                                                                                                                                       |
| Low | The `sold_out_at` "since" stamp on the ticket's tag                                          | Needs a read change in `lib/kitchen.ts`.                                                                                                                                                                                                                                                                                                                                         |
| Low | KDS sound: audioSession / silent-switch parity, and the chip fully on `useSyncExternalStore` | Feedback spec out-of-scope; this phase lands only the engine subscription and the two `soundWanted` writes.                                                                                                                                                                                                                                                                      |

## 4. Mutate-set / CLAUDE.md enumeration changes

- **Files added to the mutate set (both lib):** `apps/qr/lib/kds-urgency.ts`, `apps/qr/lib/kds-line.ts`.
- **Measured at this head** (the documented greps): `130 apps/qr/lib` + `3 apps/qr/app/api` +
  `15` components + `1 packages/db/src/schemas.ts` = **149** files; **870** mutant ids (was 147 / 854).
  No component was added; the prose component list is unchanged.
- **Mutants added (16), one block `// ── Phase 2b · kitchen ──` at the end of MUTANTS:**
  `kds-urgency/channel-swapped` · `kds-urgency/amber-edge-exclusive` · `kds-urgency/red-edge-exclusive` ·
  `kds-urgency/config-ignored` · `kds-urgency/config-crossed` · `kds-line/sold-out-still-offered` ·
  `kds-line/describedby-empty-string` · `kds-line/override-cleared-by-inflight-poll` ·
  `kds-line/override-never-dropped` · `kds-line/override-ignored` · `staff-labels/line-drops-sold-out` ·
  `ticket-names/note-runs-never-burmese` · `ticket-text/note-myanmar-run-unmarked` ·
  `ticket-text/note-runs-unwrapped` · `ticket-text/dish-title-drops-echo` · `kds-line/qty-one-stands`
  (the last in commit 2). All KILLED (`verify:slice --no-gate --only=` per module).
- **Mutants re-anchored:** none. `staff-labels.ts`'s anchored `line-qty-stays-latin` line was kept
  byte-identical (the sold-out clause is appended after it); `kitchen.ts` carries no mutants.

## 5. Owner-visible behaviour changes

- KDS: no "86 this dish" band under each line any more. Each food line has a ⋯ at its right edge;
  tapping it opens a sheet named for the dish with a hint ("Guests can't order it any more. Orders
  already on the board stay — tell the counter if you can't make them.") and a big red "86 this dish".
  The sheet stays open with a spinner until the server answers; a refusal shows inside the sheet;
  success closes it, the line shows OFF THE MENU, loses its ⋯, and the 6s "Mohinga off the menu ·
  Undo" bar appears (its Undo ignores a tap in its first 350ms).
- KDS: a dish's allergy/request note now sits right under that dish (⚠ icon, warn band), not under
  the 86 band; Burmese in a note renders in Padauk. Sold-out dishes show a small OFF THE MENU tag
  with a red dot instead of a full-width band.
- KDS (separate commit): single quantities are a quiet outlined number, multiples stay the lit chip;
  a started dish has an accent bar down its left edge; the bump's ✓ grows with the text size.
- KDS: after the tablet sleeps, the sound control shows "Sound off — tap to turn on" (and re-arms on
  the next tap) instead of a volume slider over a silent board — including on the first shift a
  device was armed. The undo pill sits above the home indicator on notched devices.
- Counter lane: a bag line's note shows as a ⚠ note with a warn rule instead of quoted text.
- Help sheet, kitchen card 3: now reads "Out of a dish? Tap More on its line, then 86 it — guests
  can't order it any more." and pictures the ⋯ → the red 86 button.

## 6. K15 strings

| Key                             | EN                                                                                                          | MY                                                                                                     | HIGH? |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----- |
| `kds.line.more`                 | More for {x}                                                                                                | {x} အတွက် နောက်ထပ်                                                                                     | no    |
| `kds.86.hint`                   | Guests can’t order it any more. Orders already on the board stay — tell the counter if you can’t make them. | ဧည့်သည်တွေ မမှာနိုင်တော့ပါ။ ဘုတ်ပေါ်က အော်ဒါတွေကတော့ ဆက်ရှိနေမယ် — မလုပ်ပေးနိုင်ရင် ကောင်တာကို ပြောပါ။ | yes   |
| `kds.note.sr`                   | Kitchen note                                                                                                | မီးဖိုချောင် မှတ်ချက်                                                                                  | no    |
| `help.how.kitchen.3` (re-draft) | Out of a dish? Tap More on its line, then 86 it — guests can’t order it any more.                           | ဟင်းကုန်ရင် အဲဒီဟင်းရဲ့ နောက်ထပ် ကို နှိပ်ပြီး ဖြုတ်လိုက်ပါ — ဧည့်သည်တွေ မမှာနိုင်တော့ပါ။              | yes   |

Also: `kds.86`'s stale comment ("undone on a DIFFERENT screen") now reads "a 6s undo in the bar,
then /staff/menu". `kds.86.hint` joined `STAFF_K15_HIGH`.

## 7. Deviations from spec

- **Override pruning** runs in `refresh()`'s functional updater, batched with `setSnap` and using
  the seq that fetch stamped at its start, instead of a separate `snapSeq` state pruned during render.
  Same rule (`pruneSoldOut(prev, seq)`), one fewer state and no render-time setState.
- **KdsBoard wiring mutations** (the spec's "MUTATION:" lines on `KdsBoard.test.tsx`) were run
  red-first BY HAND (a scripted apply → run → restore), not as `verify:slice` mutants: `KdsBoard.tsx`
  is not in the mutate set and adding it would change the component bucket. All went red except the
  two noted below.
- **The landing effect** is pinned by the dismissed-mid-write order, not the sheet-open one: in the
  sheet-open order my sheet's orphan-only `onCloseAutoFocus` fallback (⋯ → line → heading) also lands
  on the line once the ⋯ is gone, so deleting the effect leaves that case green (the spec expected
  "heading"). The dismissed-mid-write case goes red without it.
- **`!open` is refused twice** (the Button's `disabled` → inert, and the onClick guard); dropping only
  the onClick half survives because the primitive still refuses. Kept as belt-and-braces.
- **`blocked`** (another line of the same dish in flight) is kept per the spec's props, though
  `openMenu` already refuses a dish in flight, so it is unreachable today.
- **Two mutants beyond the spec's list:** `kds-line/override-never-dropped` (the spec's "never drop →
  the put-back case goes red") and `ticket-text/note-runs-unwrapped` (the spec's wrapper-drop).
- **chime-core:** the one `notify` handler is attached when `arm` creates the context (an EventTarget
  dedupes a repeated add), not also in `subscribe` — a hand mutation showed that call was dead code.
- **New staff keys** live in the `// ── Phase 2b · kitchen ──` block at the END of `STAFF` (brief),
  not "beside the kds.86 block" (spec). The two in-place edits are `help.how.kitchen.3` and `kds.86`'s
  comment.
- **Not edited here (brief):** `CLAUDE.md` (the mutate-set enumeration — numbers in §4 above),
  `docs/DESIGN-LANGUAGE.md`, `CHANGELOG.md`, `docs/OPEN-ITEMS.md`, `docs/HANDOFF.md`.
  `pnpm check:docs` fails on COUNTS only (mutants 870, targets 149/130, qr/ui test counts).
- **Outside the ownership list:** `apps/qr/lib/sheet-busy-callers.test.ts` gains
  `staff/KdsLineMenu.tsx` in its UNGUARDED list (the M82 guard discovers every Sheet caller; the whole
  qr suite went red without it). One line + reason.
- **Added guards not in the specs:** a stylesheet assertion that `.kds-undo`'s bottom adds the
  safe-area inset; the ExpoBoard noted-bag-line case is appended at the END of `ExpoBoard.test.tsx` to
  keep the merge with the feedback agent's pick/undo edits mechanical.
- **ExpoBoard edit kept minimal:** the import, the one note span → `TicketNote`, and the deleted
  `noteInline` style. The `.expo-note` rules live in the kitchen's globals.css block beside `.kds-note`.

## 8. LEARNINGS candidates

- `vitest -t` takes a REGEX. A test named "…the --kfs-_ tier…" matched ZERO tests under a
  `-t "--kfs-_ tier"` pattern, so an induced mutation read "green" with every test skipped. A
  red-first harness must treat "0 passed, all skipped" as no result, not as a survivor.
- KdsBoard's persisted-controls hydration is a two-microtask chain after mount; a test that clicks
  synchronously after `render` races it (the hydration's `setSoundWanted(false)` landed AFTER the
  click's `true`). Flush two microtasks first, as the kitchen-8 test does.
- An EventTarget ignores a second `addEventListener` of the SAME function, so an "attach once" guard
  around it is dead code — a surviving hand mutant found it.
