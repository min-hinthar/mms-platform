# Phase 2b · feedback — integration notes (B: liveness · C: the thumb-zone Undo)

Branch `p2b/feedback`, base `bd946c4`. Counter bell (spec part A) is **not** here — it is 2d.

## 1. DESIGN-LANGUAGE draft

§17 (the staff console) — new bullets, as built:

- **The bar's status slot (feed pages only).** A page with a feed passes `live` to `StaffBar`:
  the counter passes `'counter'` (the PURE fold `counterFold` of the floor and the bags — never the
  manager's approvals rail), the KDS and a table page pass their own `degraded ? 'not_updating' :
'live'`, the same truth their banner reads, so bar and banner never disagree. Only then are the
  h1 and the slot wrapped in `.staff-bar-head`; a feedless bar keeps its DOM. The slot sits OUTSIDE
  the h1 (the heading's name, and the KDS region labelled by it, never change) and beside it on
  row 1 (R1's line-breaking counts the wrapper's natural width). Three states, three SHAPES, never
  colour alone: a filled 10px `--ok` dot (live), a hollow `--warn` ring + a visible "Not updating"
  (stale), the `offline` glyph + a visible "Offline" (a SUSTAINED device offline, which outranks the
  feed). 'Live' is sr-only at every width. The 14px mark box is reserved at SSR; before the
  counter's boards report it is EMPTY, never a guessed 'Live'. Plain text, not a live region — the
  boards' regions speak their freeze. A change between drawn states pops the mark once
  (`.mms-pop`); no pop on first paint or on the empty mark filling in.
- **The offline row (feedless pages only).** Menu, tips, glossary, team, sign-in, lock, the doors:
  after `NET_SHOW_MS` (2 s) of UNBROKEN device offline, one in-flow `role="note"` row INSIDE the
  sticky bar (full width, ordered last — the Lock-refusal idiom), "This device is offline — changes
  won't save." (no paper tail — that is a board sentence). It hides the moment the device is back
  (no dwell): one reflow per real transition. A feed page never draws it (its slot says Offline),
  so nothing ever covers or moves the KDS head. The device truth is `useDeviceOffline`: a store over
  `navigator.onLine` whose clock survives a soft-navigation remount and re-reads on `pageshow`.
  A `we-down` probe verdict never shows here.
- **Sticky sentence clause** (the plan's one rewrite of the §17 sticky sentence lands in 2c; 2b
  adds): _the offline row lives INSIDE the bar, so the bar is still the only sticky element._
- **`--staff-bar-h` has ONE publisher.** `StaffBarNet` (the bar's always-last child) publishes the
  header's measured height on `<html>` (ResizeObserver; removed on unmount), and
  `:root:has(.staff-bar)` sets `scroll-padding-top: calc(var(--staff-bar-h, …) + var(--s2))`, so a
  keyboard-focused control never parks under the sticky bar (WCAG 2.4.11), the offline row
  included. Everything else that needs the bar's height READS the variable.
- **The staff thumb-zone Undo (the expo pick).** "Picked up" / "Handed over" draws the `@mms/ui`
  Toast at `size="xl"` and `live={false}` — the lane's own region speaks the pick; the pill only
  draws (one voice per fact). 64px, and the WHOLE pill takes the tap, so a thumb that misses Undo
  lands on the visible pill, never on a hidden control beneath it; a LEAVING pill takes none
  (under reduced motion, where it is still drawn, it takes them back). It shows ONLY the pick that
  opened it (`toastPick`) and never an older one; a committing pick never keeps it. After its own
  Undo it stays VISIBLE and inert for `SAME_GESTURE_MS` (the shield), then leaves; the restored
  slot refuses a re-pick for the same gesture. The action's name is its visible word (no
  aria-label channel). A KEYBOARD user on either Undo (`:focus-visible` only — a tap never holds)
  holds the window (`lib/undo-hold`: a set of sources, capped at a minute); the drain pauses while
  held. After an Undo from the pill, focus lands on the card's restored slot, never `<body>`. The
  counter column carries `.staff-col-dock` so its last controls scroll clear of the pill.

§20 — amend "Toast — the view's one live region": _…unless the view's own region already speaks
the fact: then the Toast is `live={false}` (no role, no aria-live) and only draws — the staff
lane's xl Undo pill is the case. A silent Toast can never be `quiet` (the type refuses it)._

(§3's "`.floor-card-pulse` is the console's one just-changed ring, now on lane cards too" and §15's
counter-bell policy column are the bell's — 2d.)

## 2. CHANGELOG

- **Phase 2b · feedback** — the staff bar tells the truth about liveness: a status mark beside the
  title on the counter, the KDS and a table page (live · not updating · offline, three shapes, the
  board's own truth), an in-flow offline row inside the bar on pages with no feed after 2 s of
  sustained offline, and `--staff-bar-h` scroll-padding so a Tab never parks a control under the
  bar; and the counter lane's "Picked up" / "Handed over" gets a thumb-zone Undo pill (the
  `@mms/ui` Toast's new silent `xl` size: a drain over the real window, a visible shield against
  the double-tap, keyboard holds capped at a minute, focus returned to the card), with scan-and-go
  hand-overs now spoken as "handed over".

## 3. OPEN-ITEMS rows

| Sev | Item                                                          | Why / where                                                                                                                                                                                                                                                                                                                                               |
| --- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MED | Staff tabs never activate new builds                          | The SW update strip is hidden on `/staff` and `skipWaiting` is false, so a 24/7 kitchen/counter tablet runs old code (this phase included) until the tab is killed. A Refresh must be REFUSED while an expo pick window is open — a reload skips the unmount flush and drops the pick's write (the bag stays "ready"). `ResilienceShell.tsx`, `sw/sw.ts`. |
| LOW | Measure the `--staff-bar-h` fallbacks                         | `76px` (tablet: Burmese title + echo) and `128px` (≤720px two-row phone bar) are COMPUTED from globals.css, not measured on a device; they only apply before `StaffBarNet` hydrates. `globals.css` `:root:has(.staff-bar)`.                                                                                                                               |
| LOW | Browser pass for the status slot and the offline row          | At 360 / 390 / 768 / 1280 and the 15.6" KDS: `scrollWidth === clientWidth` on a manager's counter bar with "Not updating" showing; KDS offline shows only the slot (pager + status line untouched); `/staff/menu` offline at 390 shows the in-flow row and a Tab-focused control is never under the bar.                                                  |
| LOW | Browser pass for the xl pill's hit area                       | `document.elementFromPoint` over a showing pill returns the pill, and 130 ms after commit returns the card beneath; no transformed / filtered / contained ancestor of the lane section (a `position: fixed` region would be trapped).                                                                                                                     |
| LOW | Night `--warn` is the tightest glass-floor token              | The slot's word clears the Night glass floor at 4.5598 (`composite-contrast.test.ts`). Any Night `--warn` darkening fails it; the fallback is the word in `--tx` with only the mark in `--warn`.                                                                                                                                                          |
| LOW | Drain vs the hold cap                                         | Past `PICKED_HOLD_CAP_MS` the window resumes while a keyboard user is still on the pill: the drain stays paused (held) and the pill leaves on commit with its bar not empty. `ExpoBoard.tsx`, `primitives.css`.                                                                                                                                           |
| LOW | Migrate the KDS `.kds-undo` pill onto the Toast primitive     | Pinned by five `KdsBoard.test` cases and HelpPicture's shared-selector replica; do it once the lane pill is proven (spec out-of-scope).                                                                                                                                                                                                                   |
| LOW | ApprovalsBoard does not report its feed                       | Deliberate: the counter's slot folds floor + bags only, and the Help report's `aggregateConnection` is unchanged. Revisit if the manager rail needs its own liveness word.                                                                                                                                                                                |
| LOW | Unify `PICKED_UNDO_ARM_MS` (400) with `SAME_GESTURE_MS` (350) | Two numbers for "the same gesture" on one lane; the expo-rules mutant anchors hold the 400 (spec out-of-scope).                                                                                                                                                                                                                                           |
| LOW | Server-held picked-up grace                                   | Owner chose client-held (no migration). A tab killed inside the 6 s window drops the write (safe direction); other devices see the pick 6 s late. Revisit with K30(A)'s prod migration.                                                                                                                                                                   |
| LOW | Deferring the first-stage "Bagged & ready"                    | Not deferred: it lights /track and the TV at once, and speed of good news wins (spec out-of-scope, recorded).                                                                                                                                                                                                                                             |

(The bell's rows — the help call, a console-wide bell, the floor region announcing asks, a Help
card for the bell, KDS silent-switch parity, the KDS chip on `useSyncExternalStore` — belong to 2d
and the kitchen area; `xcut-10` is the kitchen area's `.kds-undo` safe-area.)

## 4. Mutate-set / CLAUDE.md enumeration changes

Files added to the mutate set (bucket `lib`):

- `apps/qr/lib/live-connection.ts`
- `apps/qr/lib/undo-hold.ts`

Measured at this branch's head (feedback alone, before the kitchen merge): **149** target modules
= 130 `apps/qr/lib` + 3 api + 15 components + 1 `packages/db` (base 147 = 128+3+15+1); **864**
mutants (base 854, +10). Re-measure after merging with the documented greps.

Mutants added (all KILLED by `verify:slice --no-gate --only=…`, watched finish):

- `live-connection/offline-hides-behind-a-feed`
- `live-connection/a-feedless-page-says-live`
- `live-connection/approvals-freezes-the-counter-dot`
- `live-connection/the-row-shows-on-a-blip`
- `undo-hold/an-unheld-release-counts`
- `undo-hold/one-release-frees-every-source`
- `undo-hold/the-hold-has-no-cap`
- `expo-rules/the-toast-falls-back-to-an-older-pick`
- `expo-rules/a-committing-pick-keeps-the-toast`
- `expo-rules/scan-go-by-any-line`

Mutants re-anchored: none (the 8 existing `expo-rules` find strings are byte-identical; the full
`--only=expo-rules/` run caught all 11).

## 5. Owner-visible behaviour changes

- **Counter, kitchen (KDS) and table pages:** a small mark beside the page title. A green dot
  when the boards are live (the word "Live" is only read out by a screen reader); a hollow ring and
  "Not updating" when the board has frozen; a wifi-off glyph and "Offline" when the device has been
  offline for 2 s. The counter's mark follows its floor and to-go boards, not the manager rail.
- **Pages with no live board** (menu, tips, glossary, team, sign-in, lock, the Screens doors):
  after 2 s offline, a line appears inside the top bar: "This device is offline — changes won't
  save." It disappears the moment the wifi is back.
- **Keyboard (Tab) focus** now always stops below the sticky top bar instead of under it.
- **Counter lane:** tapping "Picked up" / "Handed over" shows a large pill at the bottom of the
  screen — "Table 7 picked up · UNDO" — with a bar that drains over the 6-second window. Undo
  there takes the bag back (the pill stays a moment, inert, so a double-tap does nothing, then
  goes). The card's own Undo still works. The counter page has extra space at the bottom so the
  pill never covers the last buttons.
- A scan-and-go hand-over is now read out as "handed over", matching its button.
- Tapping the same slot within 350 ms of an Undo does nothing (no accidental re-pick).
- A keyboard user sitting on either Undo pauses the window (up to one minute).

## 6. K15 strings (all Claude-drafted Burmese, pending Min's native check)

| Key                      | EN                                           | MY                                                   | HIGH?                               |
| ------------------------ | -------------------------------------------- | ---------------------------------------------------- | ----------------------------------- |
| `shell.live.live`        | Live                                         | အသစ်တက်နေ (grounded: `report.conn.live`)             | no                                  |
| `shell.live.stale`       | Not updating                                 | အသစ်မတက်ပါ (grounded: `report.conn.notUpdating`)     | no                                  |
| `shell.live.offline`     | Offline                                      | အော့ဖ်လိုင်း                                         | no                                  |
| `shell.net.offline`      | This device is offline — changes won't save. | ဒီစက် အင်တာနက် မရှိပါ — ပြင်ဆင်မှုတွေ မသိမ်းနိုင်ပါ။ | **yes** (marker + `STAFF_K15_HIGH`) |
| `expo.toast.picked`      | {x} picked up                                | {x} ယူသွားပြီ                                        | no                                  |
| `expo.toast.pickedTable` | Table {id} picked up                         | စားပွဲ {id} ယူသွားပြီ                                | no                                  |
| `expo.toast.handedOver`  | {x} handed over                              | {x} လွှဲပေးပြီး                                      | no                                  |
| `expo.live.handedOver`   | {x} handed over — undo available.            | {x} လွှဲပေးပြီး — ပြန်ဖျက်နိုင်သေးသည်။               | no                                  |

The pill's action reuses `kds.undo` (ပြန်ဖျက်, K15-HIGH already) verbatim. `floor.sound.*` are 2d.

## 7. Deviations from spec

1. **`counterFold` + `COUNTER_FEEDS` (live-connection.ts) and `useLiveBoardStates()`
   (LiveConnection.tsx, additive).** The spec had `LiveDot` call `useLiveBoardState` twice and
   `liveFold([floor, bags])`. The fold of the whole reported map is now PURE, so "approvals never
   freezes the counter dot" is falsifiable by a lib mutant (`approvals-freezes-the-counter-dot`)
   instead of living only in a component.
2. **`--staff-bar-h` fallback** is `76px` (and `128px` ≤720px), computed from the stylesheet, not the
   spec's `68px` and not measured (no device here). Per the plan's conflict resolution the fallback
   is the tallest bar's (Burmese title + echo). Filed to measure.
3. **`StaffBarNet` reaches the header through a `<span hidden>` probe** (its parent). `hidden` is
   `display: none`, so no flex item and no gap — but it is a DOM child, so `EntrySkeleton.test`'s
   "same shape" count now compares LAID-OUT children (excluding `hidden`) and asserts the probe is
   the only one. The EntrySkeleton replica itself is untouched.
4. **@mms/ui exports added:** `matchesFocusVisible` (new `focus-visible.ts` — the ONE matcher the
   Toast's hold and the lane's slot both read), `TOAST_LEAVE_MS` (the leave phase's length, pinned
   to `--dur-fast` by `toast.test.ts`), and the `ToastAction` / `SilentToastMessage` types. The
   "type forbids `quiet` with `live={false}`" is a discriminated union, pinned by a
   `@ts-expect-error` case (watched red).
5. **The drain renders only on `size="xl"`** (it needs the xl pill's `position: relative`); an md
   pill's markup is unchanged.
6. **The pill's Undo arms on a toast-level timer** (`PICKED_UNDO_ARM_MS` after the pick's render),
   drawn `aria-disabled` until then; the handler still refuses on the pick's own `at`
   (`pickedUndoArmed`).
7. **Two robustness additions not in the spec:** a new pick taking the pill over releases any
   stale `toast` hold on another bag (a replaced button unmounts without a blur — the old bag would
   otherwise be held to the cap; pinned red-first); and a pill leaving from under keyboard focus
   hands focus to the lane's heading instead of `<body>`.
8. **`app/staff/page.tsx`:** `live` rides the shared header const as
   `home.view === "floor" ? "counter" : undefined` (the doors get no slot either way) rather than a
   separate const; `.staff-col-dock` is on the counter column (the non-bell half of change 18). The
   greet row, the sound chip and `CounterBellProvider` are 2d.
9. **`isScanGoBasket` also names the three lane counts** (`verifyCount`, `handOverCount`,
   `bagCount`), not only the card — `some(l => !grocery)` ≡ `!every(l => grocery)`, same semantics.
10. **Not written:** the "focus → lane h2 when the card has gone" test. A pill Undo that succeeds
    implies the pick (so the card) still exists; the fallback exists in code but is unreachable to
    drive from the suite.
11. **The mark's pop** excludes the empty mark filling in (the counter's first report) as part of
    "no pop on first paint".
12. **/kit** gains a `toast-xl` part and a "Thumb-zone undo" section (the demo's hold pauses the
    drain only; it does not extend the window).

## 8. LEARNINGS candidates

- **Inside one `await act(async () => vi.advanceTimersByTimeAsync(n))`, a state set by a timer does
  not commit until act ends** — so a timer an EFFECT schedules in response (a leave phase after a
  shield) starts at the END of the advance, not at the moment the first timer fired. Split the
  advance at the phase boundary, or the assertion reads the phase one timer late.
- **jsdom matches `:focus-visible` on ANY focused element**, programmatic focus included; a browser
  does not after a tap. A tap-vs-keyboard test must stub `Element.prototype.matches` (delegating
  every other selector) — otherwise a "tap focus never holds" test passes or fails for the wrong
  reason.
- **A focused element REMOVED from the DOM fires no blur** (browsers and jsdom alike). Any state
  keyed on focus/blur pairs (a hold, a paused timer) must be released explicitly when its control
  is replaced (a keyed remount), or it stays latched.
- **A client child reaching a server component's element:** a `<span hidden>` probe's
  `parentElement` — no ref on the server-rendered parent, no layout change (display: none is not a
  flex item) — but it IS a child, so shape guards that count children must count laid-out ones.
