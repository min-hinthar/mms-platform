# Phase 2d · split — the counter's tablet split (K24, counter/table half)

Branch `p2d/split`, base `3c77873` (main 2b6a957 + Phase 2d floor + bell merged).

## 1. DESIGN-LANGUAGE draft (§17 bullets)

- **The counter splits on a tablet (K24).** `/staff?floor=1` is a master-detail: the counter's zones
  in `.staff-split-main`, the selected table in `.staff-split-pane` beside them. ONE mounted tree
  (`CounterSplit` wraps the zones; the bell provider and the boards are never remounted across a
  breakpoint) — CSS decides the shape: below 48em today's column (a selection takes the column, the
  floor stays mounted and polling, just not displayed); 48–64em side by side only while a table is
  open (`data-pane="open"`); ≥64em the pane column is always there with its empty state ("Pick a
  table"), so the grid keeps one shape all shift. Breakpoints are named once in `lib/floor-pane.ts`
  (`PANE_QUERY` / `PANE_IDLE_QUERY`) and parity-tested against the two `display: grid` rules.
- **The selection is the URL hash** (`#table-<uuid>`): a reload keeps it, Back fires `hashchange`, a
  link can name it. **One entry deep:** open pushes, a switch replaces, close walks back only over an
  entry THIS mount pushed (hash AND `history.length`), otherwise it replaces to `#floor-h` — never an
  empty hash, never a same-hash neighbour. Writes carry no `__NA`; a native fragment entry (the
  approvals circle) is synced into Next's canonical URL on `hashchange`. A zone jump keeps the table
  beside it at split width and clears it below 48em.
- **A card tap opens in the pane only for a plain primary click at split width, read at CLICK time**
  (SSR never guesses a width); cmd/ctrl/shift/alt, a middle click and every phone tap keep the real
  link to `/staff/table/[id]`. Occupied strip tiles, a start that converged on a seated table
  (`created:false`), the order pad's "← Table 7", its Done and its Take payment land in the pane the
  same way (`SplitAwareLink` / `tableDestination`); `?settle=1` rides in as a one-shot param.
- **The pick cap.** A selected card carries `aria-current="true"`, the console's ONE lit cap on its
  NAME only (`.floor-card-label` joins the shared rule — a pick from a live list, not "you are here";
  never the door's 18%-gold ground, where Night --t3/--warn/--ok fall below AA), a gold edge and a
  `--glow-gold` halo restated on `:hover`/`:active` so the press never erases it. The label carries
  the cap's padding at rest, so selecting paints and moves nothing.
- **The pane is a column, not a card and not a page:** sticky UNDER the bar (§17 amendment: a detail
  column may stick under the bar and never takes the notch inset), its own scroller
  (`overscroll-behavior-y: contain`), an opaque `--pg` head with the table's name (h2, one line,
  ellipsis) and a 44px ✕; no `<main>`, no second bar, sections h3 (Tables › Table 7 › Order).
- **Focus.** On select the pane heading takes focus ONCE (preventScroll at split width); it renders
  from the tapped card's hint, so focus never moves when the detail lands. Close: a cleared table →
  the floor heading (its card lingers until the next poll); a control close → the card/tile that
  opened it, else the heading; a Back close moves focus only from inside the pane or `<body>`. The
  pane's catch-all owns only focus INSIDE the pane. Escape closes — never over a sheet that handled
  it, mid-IME-composition, or from inside a field.
- **The freeze is one fact, spoken once:** the pane's frozen line always SHOWS; it is SAID only while
  the floor's own region is not already saying it (`paneFreezeSpoken`, the lane's rule).
- **The paid card follows its table:** stashed in this tab's sessionStorage (`mms-handoff:{id}`,
  register's canonical shape, display-only, try/catch) inside the settle's own callback, so a settle
  that lands after a switch still leaves its #CODE; restored on reselect without stealing focus;
  removed on ✕, Escape, Back and Clear. A refusal that lands after the pane moved on ("A change on
  Table 7 didn't save — view it to check.") is shown with a one-tap "View Table 7" and said through
  the view's one region.
- **Motion:** the cap, head and 48–64em reflow are instant (layout never animates); the pane body
  rises once per selection (`mms-rise` at `--dur-base`, keyed), RM-escorted. **Staff routes opt out
  of the J1 root drift** (`html:has(.staff-main) { view-transition-name: none }`): every staff Back
  is instant.
- §7 note (per-zone regions on the counter screen): FloorBoard, ExpoBoard and RegisterStart each keep
  their always-mounted region (each speaks a different fact; the room's state is FloorBoard's); the
  pane adds at most ONE at a time — the mounted detail's region, else the pane's own sr-only status.

## 2. CHANGELOG

- **Staff · the counter splits on a tablet (K24).** On a tablet the counter screen keeps the floor in
  view and opens the tapped table beside it (the URL hash holds the selection, Back closes it, one
  history entry deep; a persistent "Pick a table" column from 64em); the paid card's #CODE follows
  its table across a switch; a change that didn't save on a table you left is said with a one-tap way
  back; every staff Back is now instant (no slide).

## 3. OPEN-ITEMS rows

| Sev | Item                                                                                                                                                                                                                                                                                      | Why / where                                                                                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| med | K24 remainder: a `--w-staff` tier for the other staff pages' inline `.staff-col` widths, expo's masonry hole, the ~9988px menu-prices column, the bar's title/utilities 1.6 m apart at 1920                                                                                               | Out of scope for the split (spec `out_of_scope`). K24's counter/table half is DONE by this branch; the row should be narrowed to this remainder, not closed. |
| med | Measure pane-write latency vs the table page (p50 for a qty step AND a cash settle, incl. the server-action queue wait behind the floor/lane/approvals pollers); if the pane is >250ms worse, trim the table-scoped `revalidatePath` (its own mutate-set PR)                              | Each revalidating pane write re-renders /staff (~10 reads) instead of the table page (~6). No preview/device here — unmeasured.                              |
| low | Measure `--w-staff-pane: clamp(22rem, 34vw, 34rem)` / `--w-staff-split: 96rem` and the pane head's 60px on the real iPads (768 · 834 · 1024 · 1180 · 1366) and a 1920 screen, both themes, incl. the on-screen keyboard over the sticky scroller                                          | Spec starting values, not measured (no device/preview). `globals.css` "Phase 2d · split".                                                                    |
| low | Manual QA the split in the preview: one POST and zero RSC GETs per tap; hash kept after a pane qty edit; Back closes with no hang; ✕ then an immediate second tap lands; open table → approvals circle → approve → tap the same table → Back; VoiceOver on iPad lands on the pane heading | jsdom cannot observe Next's router or the real view-transition library.                                                                                      |
| low | Degrade /staff's floor outage IN PLACE during an action re-render (today a failing floor read on a pane write's revalidation returns the whole-screen outage shell, unmounting the pane; the hash + handoff stash survive, so it reopens)                                                 | Needs a cold-load vs re-render signal (spec `out_of_scope`).                                                                                                 |
| low | Drop the no-op `router.refresh()` left on the full PAGE's Open-a-tab fallback / other page-variant settle paths; `OpenTabButton` is also still hardcoded English with the banned word "tab" (parked surface, `SURFACES.cardOnFileTabs`)                                                   | Out of scope; OpenTab now takes `onChanged` and the pane passes it.                                                                                          |
| low | Same-topic remount race on the whole-floor `floor`/`expo` channels (only on a /staff route round-trip inside the unsubscribe window)                                                                                                                                                      | Pre-existing (spec `out_of_scope`).                                                                                                                          |
| low | Verify: GroceryBrowse writes `#aisle-*` with `__NA` riding along (grocery-view.ts), so a revalidating action / `router.refresh()` on /grocery may replaceState the aisle hash away                                                                                                        | Suspected sibling defect (spec `out_of_scope`).                                                                                                              |
| low | Open counter orders (CounterOrderCard → /add) in the pane and give counter cards the pick cap; a per-selection `document.title`; K14/K23 in the pane (a locked console, unlock losing the hash)                                                                                           | Spec `out_of_scope`.                                                                                                                                         |
| low | A 5s `getTableDetail` poll runs all shift while a table stays selected (parity with a tablet parked on the table page) — a 15s pane-only backstop is the owner's alternative                                                                                                              | Owner decision kept at parity.                                                                                                                               |

Closes / changes: **K24** — the counter/table half ("the table page is 640px in 1920 … the floor grid
… 27 of 33 sessions below the fold") is delivered by the split; narrow the row to the remainder above.

## 4. Mutate-set / CLAUDE.md enumeration changes

- Files ADDED to verify-slice's mutate set (this branch): `apps/qr/lib/floor-pane.ts` (lib),
  `apps/qr/components/staff/CounterSplit.tsx` (component), `apps/qr/components/staff/TablePane.tsx`
  (component). (`CounterMint.tsx`, `TableCard.tsx`, `FloorDetailLive.tsx`, `TableStrip.tsx` were
  already in the set.) Measured after this branch with CLAUDE.md's bucket grep: 144 apps/qr/lib · 3
  app/api · 28 component files (incl. the three staff hooks) · 1 packages/db; `grep -cE '^\s+find:'`
  = 1240. Integration re-measures after the merge.
- Mutants ADDED (block `// ── Phase 2d · split ──`, 31): `floor-pane/hash-accepts-any-id`,
  `floor-pane/zone-jump-closes-the-pane`, `floor-pane/zone-jump-keeps-pane-over-a-phone-column`,
  `floor-pane/re-push-onto-the-same-hash`, `floor-pane/a-switch-pushes`,
  `floor-pane/close-walks-back-over-an-entry-it-did-not-push`,
  `floor-pane/close-replaces-to-an-empty-hash`, `floor-pane/ownership-by-hash-alone`,
  `floor-pane/canonical-sync-never`, `floor-pane/a-modified-click-is-hijacked`,
  `floor-pane/escape-mid-composition-closes`, `floor-pane/a-late-read-lands-under-another-table`,
  `floor-pane/cleared-card-takes-focus`, `floor-pane/back-steals-focus-from-elsewhere`,
  `floor-pane/freeze-spoken-twice`, `floor-pane/unknown-failure-claims-an-outage`,
  `floor-pane/twin-is-the-closed-table`, `floor-pane/stash-total-not-integer`,
  `floor-pane/phone-sent-to-the-pane`, `counter-split/push-carries-next-state`,
  `counter-split/a-tap-navigates-anyway`, `counter-split/close-keeps-the-paid-card`,
  `counter-split/no-canonical-sync`, `table-pane/late-read-lands`,
  `floor-detail/pane-handoff-not-stashed`, `floor-detail/lost-write-dropped`,
  `floor-detail/pane-catch-all-samples-anywhere`, `floor-detail/pane-freeze-always-spoken`,
  `floor-detail/pane-closed-navigates`, `table-card/every-card-selected`,
  `counter-mint/converged-start-routes-on-a-tablet`. All KILLED (targeted runs).
- Mutants RE-ANCHORED (meaning kept): `p2d-floor/mint-pushes-after-unmount` (the mounted guard is now
  an early return before the pane/route choice), `p2d-floor/strip-link-races-a-held-start` (the held
  refusal now also returns before the pane's tap). Both KILLED.

## 5. Owner-visible behaviour changes

- On a tablet (≥48em) tapping a table card or an occupied strip tile opens that table BESIDE the
  floor instead of a new page; the floor, the to-go lane and Start stay in view through the settle.
  From 64em (landscape iPad, desktop, TV) an empty "Pick a table" column is always there.
- Back / ✕ / Escape close the table; Back never steps through every table visited (one entry deep).
- The selected table's name wears the gold cap; its card a gold edge and glow.
- After a cash settle the #CODE paid card stays with its table even if another table is tapped.
- A change that didn't save on a table you've left is said, with a "View Table 7" button.
- The order pad's "← Table 7", Done and Take payment return to the pane at tablet width.
- Every staff Back is instant (the 16px slide is gone on staff routes).
- Phones: unchanged (a tap still opens the full table page).

## 6. K15 strings

All new; every MY value is a Claude-authored K15 draft (commented in `staff.ts`):

| Key                            | EN                                              | MY                                                                | HIGH?                    |
| ------------------------------ | ----------------------------------------------- | ----------------------------------------------------------------- | ------------------------ |
| floor.pane.empty.title         | Pick a table                                    | စားပွဲတစ်ခု ရွေးပါ                                                | no                       |
| floor.pane.empty.sub           | Its order opens here, beside the list.          | အဲဒီစားပွဲရဲ့ အော်ဒါက စာရင်းဘေး ဒီနေရာမှာ ပေါ်လာပါမယ်။            | no                       |
| floor.pane.closed.counterTitle | This counter order is closed                    | ဒီကောင်တာ အော်ဒါ ပိတ်ထားပြီ                                       | no                       |
| floor.pane.closed.body         | It was cleared or merged, or its session ended. | ရှင်းလိုက်တာ၊ ပေါင်းလိုက်တာ ဒါမှမဟုတ် အချိန်ကုန်သွားတာ ဖြစ်ပါတယ်။ | no                       |
| floor.pane.closed.openCurrent  | View the current {x}                            | လက်ရှိ {x} ကို ကြည့်ပါ                                            | no                       |
| floor.pane.fail.title          | Couldn’t show this table yet                    | ဒီစားပွဲကို မပြနိုင်သေးပါ                                         | no                       |
| floor.pane.lostWrite           | A change on {x} didn’t save — view it to check. | {x} မှာ ပြင်လိုက်တာ မသိမ်းမိပါ — ကြည့်ပြီး စစ်ပါ။                 | **yes** (STAFF_K15_HIGH) |
| floor.pane.open                | View {x}                                        | {x} ကို ကြည့်ပါ                                                   | no                       |

No key retired.

## 7. Deviations from spec

- **Most of spec commits 1–2 shipped in 2a** (exits by name, the `alive` ref, the realtime topic
  sequence, the LiveConnection remove arm, FloorDetailLive.test page pin) — not rebuilt.
- **No DetailRefresh context** (plan resolution): register's `onChanged` (2c) already re-reads the
  detail in both variants; `OpenTabButton` gained the same optional `onChanged` (router.refresh only
  as its no-parent fallback).
- **HandoffCard is register's canonical card** (plan resolution): no role=status; the stash stores
  `{orderId,totalCents,tipCents,tenderedCents,isCounter,cartId}` and restore renders alongside
  `handoffStillCurrent`. A RESTORED card is separate state (`restoredHandoff`) so the parsed focus
  effect (keyed on a NEW settle) never pulls focus off the pane heading. HandoffCard gained `onDone`
  (in the pane "Back to the counter" closes the pane; a modified click keeps the link).
- **`--staff-bar-h`** is only READ (StaffBarNet is the one publisher, plan resolution) — no
  ResizeObserver in CounterSplit; fallbacks 76px (tablet) / 128px (phone head) per the existing sheet.
- **Copy:** "Open …" became **"View …"** (`floor.pane.open`, `openCurrent`) and the fail title "Couldn’t
  show this table yet": the floor's critic round made ကြည့် ("View") the occupied-table verb and ဖွင့်
  the strip's Start; "Open/ဖွင့်" would read as Start. `{table}` became `{x}` (a composed name, fill's
  own slot for a label).
- **The first read starts in an effect, not the click handler** — one frame later; the head and focus
  still land in the tap's frame from the hint.
- **`paneFreezeSpoken` gates only the degraded arm's own branch;** where the region is already
  speaking a higher-ranked line the frozen copy was already aria-hidden (2c).
- **The pane's `onClosed` acceptPaneRead check is not separately mutated:** the unmounted detail's
  `alive` ref already stops a late `closed`, so a mutant on the id check alone would survive
  (equivalent); the `table-pane/late-read-lands` mutant removes the WHOLE first-read gate (the
  effect's `live` flag + `acceptPaneRead`, redundant halves) for the same reason.
- **Loading skeleton:** the reserved ≥64em pane column is a plain `.staff-split-pane-idle` div with no
  divider (one extra CSS rule), not an `aria-hidden` element with a divider.
- **The table page's `← Floor`** stays the plain floor (no paneHref), as the spec says.
- **Selection context split into `TablePaneContext.tsx`:** importing `CounterSplit` into FloorBoard
  pulled the whole drill-down (and its `server-only` actions) into every board's graph and broke three
  suites; the context lives in its own module.

## 9. LEARNINGS candidates

- **A spread of `history.state` in a jsdom test is `{}` when the fixture's state is null** — a mutant
  that copies Next's `__NA` into a history write SURVIVED until the fixture seeded the entry with
  Next's own state. Seed the state you are guarding against.
- **Two guards on one landing make each single-guard mutant equivalent.** An effect's `live` flag and
  a selection check both stop a late read; mutate the gate, not one half — or the survivor is noise.
- **A context that only CONSUMERS need belongs in its own module.** Exporting `useTablePane` from the
  provider's file dragged the provider's children (the table drill-down, its server actions) into
  every consumer's import graph — three unrelated suites failed on `server-only`.
