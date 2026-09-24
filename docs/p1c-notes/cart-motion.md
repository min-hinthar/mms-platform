# Phase 1c · cart-motion — integration notes

Branch `p1c/cart-motion`. Removing a line on /cart: the row leaves in place (the house arrival
reversed) while the list closes over it, whatever moved under a finger is held from taps, a
double-tap on "−" can no longer delete a dish, and focus lands on the neighbouring dish's name.

## §XX Removal — a row leaves in place, and focus stays where the diner is

_Integration: this is written as three inserts into existing sections — a §3 table row, a §3 rules
paragraph and a §7 bullet — rather than a new section. Number/merge as fits._

**§3 table row** (after `.mms-send-beat`):

| Idiom                      | Meaning                                                          | Where              |
| -------------------------- | ---------------------------------------------------------------- | ------------------ |
| `.mms-remove` + FLIP close | something was REMOVED — it sinks away as the list closes over it | /cart line removal |

**§3 rules** (as built):

- **A removed row is the arrival reversed, and the list closes over it.** `.mms-remove` is
  `mmsRise` played `reverse both` on `--dur-base` / `--ease-out` (the prototype `fade`, v7.2:47,
  backwards — the ease-out becomes an ease-in exit). The word is REMOVED; `.mms-send-beat` owns
  LEAVES. The row stays drawn as a GHOST — same key, same node, `inert` + `aria-hidden`,
  `pointer-events: none` — while `viewItems` (every count, total and write) has already dropped it.
  Amounts are never optimistic: the ghost shows the line exactly as last painted.
- **The close is a FLIP measured in ONE synchronous block.** In a layout effect: mark the tail
  (everything after the row up to `<main>`, fixed/sticky skipped) `data-flip`
  (`:root:has([data-flip]) { overflow-anchor: none }`), read, take the ghost out of flow
  (`position:absolute` at its own offsets), read again, and play each ≥0.5px delta back to zero
  with WAAPI on `--dur-base` / `--spring` (`--ease-out` where `linear()` throws, before Safari 17.2),
  `composite: "add"` so two quick removals compose. Transform only; no height animation, no blur.
- **A ghost exists only while its section survives.** Emptying a section — or the whole cart —
  swaps the view structurally in one frame (a ghost there would keep a stale section header, or the
  Pay CTA and a stale sum, over an empty basket). A ghost wholly above the viewport takes no FLIP
  and no `data-flip`: scroll anchoring keeps the page still. A view change (order ⇄ bill ⇄ pay ⇄
  settle) clears every ghost.
- **A ghost ends on its OWN `animationend`** (a descendant's `.mms-pop` bubbles one too and is
  ignored), bounded at 1000ms with motion, `SAME_GESTURE_MS` without. A leaving row never writes:
  its stepper, pills and "Send to kitchen now" refuse even where `inert` is unsupported.
- **Whatever moves under a finger is held from taps for `SAME_GESTURE_MS` (350ms)** —
  `[data-settling] { pointer-events: none }`. An own removal holds the row's whole tail at tap time
  (rows ABOVE never move and stay live); a measured close or return also holds exactly what moved.
- **So is a Remove that was a "−" a moment ago.** The `@mms/ui` Stepper's remove-arm: when "−" at
  qty 2 becomes "Remove {name}", that Remove ignores taps for `SAME_GESTURE_MS` (Android's 300ms
  double-tap timeout + a frame), silently — it is the second half of the same gesture. A Remove that
  mounted at the minimum is never held. Both Stepper consumers (/cart, the staff line editor) get it.
  One constant, exported from `@mms/ui`, feeds both holds.
- **A refused removal reappears in place and the rows below slide DOWN to make room** — the same
  measurement run the other way ('before' with the row out of flow, 'after' back in), held the same
  way. A still-mounted ghost's fade is cancelled on the spot; a row whose ghost already dropped
  remounts (its photo's blur-up replays — not motionless, by design). Never an arrival idiom: no
  `.mms-rise`. The one live region still says why (M224's sentence).
- **Reduced motion:** the same ghost and measurement, but `.mms-remove` is `animation: none;
opacity: 0` and there is no FLIP — the removal and a refused return are visually instant. Never a
  `display` rule (the row's inline `display:flex` would beat it). The hold, the remove-arm and the
  focus landing still apply: safety and a11y are not motion. RM is read synchronously from
  `matchMedia` at effect time.

**§7 bullet** (as built):

- **On a removal, focus lands on the NEIGHBOURING dish's name — next, else previous, across
  sections — in place (`preventScroll`; `scrollIntoView({block:"nearest"})` only when it matches
  `:focus-visible`), never on a control that could repeat the action** (at qty 1 the neighbour's "−"
  IS "Remove {next dish}"). Each line's name is `data-line-name tabIndex={-1}`: a screen reader
  speaking it is the removal's confirmation. An own removal moves focus BEFORE the write, while the
  old control is still live. **The heading takes focus only when the view swaps** — the last line
  removed (the empty state's `<h1>` now carries the heading ref) or a refused last-line removal
  restored — and only when focus was actually lost. **A peer's removal moves focus only if it was
  inside the removed row**: the list records the focused line id (a `<body>` test cannot tell a
  stolen focus from an idle iOS tap, and an unmounted row cannot be asked), keyed on the removed id
  SET, never a count (a same-length remove + add refresh is caught). S2.2's fired-line landing is
  keyed on ids too: a firing is a draft that is still here.

## CHANGELOG

- **Phase 1c · cart-motion** — /cart line removal leaves in place: the row sinks away (`.mms-remove`,
  the arrival reversed) while the list closes over it with a FLIP, whatever moved under a finger is
  held from taps for `SAME_GESTURE_MS`, a refused removal reappears in place, the `@mms/ui` Stepper's
  remove-arm stops a double-tap on "−" from deleting a dish, and focus lands on the neighbouring
  dish's name (the empty-cart heading when the last line goes; a peer's removal moves focus only if
  it was inside the removed row).

## OPEN-ITEMS rows

| Sev | Item                                                                                                           | Why / where                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| med | Undo after a line removal on /cart (§22 "Undo beats are you sure")                                             | The real recovery path for an accidental removal. Needs server restore or deferred-delete semantics and new bilingual copy (K15). The remove-arm only stops the double-tap case. Filed from Phase 1c · cart-motion out_of_scope.                                                                                                                                                                                                                                                                                   |
| med | Skeleton deferral — MEASURE FIRST                                                                              | Six diner route `loading.tsx` + three client-fetch skeletons (PickupSlotSheet:132, SettlementBoard:339, GroceryBrowse:148). React's client retry throttle is 300ms; Fizz adds `$RT+300` and a 2000–2300ms hold on hard loads (QR scan→/menu, Stripe return_url→/track). Measure p50/p75 navigation-to-reveal per route (Speed Insights or performance marks) before changing anything; keep route skeletons instant unless the data says otherwise; any client deferral pairs a delay with a minimum-visible hold. |
| low | A haptic for the /cart stepper                                                                                 | v7.2 `bumpLine` buzzes `pick` on every step; /cart buzzes on none. Add it stepper-wide (not to Remove alone, which would make the vocabulary inconsistent).                                                                                                                                                                                                                                                                                                                                                        |
| low | An arrival motion for a tablemate's NEW line on /cart                                                          | Same engine (`useLineMotion`): `.mms-rise` + a tail FLIP. Separate decision from removal.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| low | Reuse `useLineMotion` in the Scan & Go basket and `StaffLineEditor`'s line list                                | Both still drop a removed row in one frame. The hook is generic over `{ id }` rows with a `group`/`sig`.                                                                                                                                                                                                                                                                                                                                                                                                           |
| low | A section move (for-here ⇄ to-go) still jumps                                                                  | Re-grouping is a move, not a removal (identity is the line id across the whole list), so it takes no ghost and no FLIP; the rows below jump as before. Same engine could FLIP it.                                                                                                                                                                                                                                                                                                                                  |
| low | /cart `loading.tsx` has no `PaperAmbient`                                                                      | The ground flips from flat to textured when Checkout mounts. One-line fix, unrelated to removal.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| low | Device-verify the removal FLIP + scroll anchoring                                                              | No device/preview here. Verify on iOS Safari (no scroll anchoring — relies on the hold) and Android Chrome: the 240ms close on `--spring`, the `linear()` fallback on Safari < 17.2, `composite:"add"` on two quick removals, the page-bottom scroll clamp (the whole page may move up to one row — accepted), and that a tap inside 350ms on a moved row / tip chip / Pay CTA is swallowed. Starting values: `SAME_GESTURE_MS` 350 (Android 300 + a frame), ghost bound 1000ms, FLIP on `--dur-base` 240ms.       |
| low | Residual Chrome console warning on a peer's removal while focus is inside the removed row                      | `aria-hidden` lands on the focused element's ancestor in the same commit as `inert`; the landing runs in `useLayoutEffect` before first paint. Own removals avoid it (focus moves before the write).                                                                                                                                                                                                                                                                                                               |
| low | A returned row whose ghost already dropped and that sits wholly ABOVE the viewport slides in-view content down | Its reinsertion can only be measured after `data-flip` is on (reading layout first would let anchoring adjust between the reads), so Chrome/Firefox anchoring does not hold the page still in that one case — rare (a refusal after the diner scrolled the removed row out of view above).                                                                                                                                                                                                                         |

## Mutate-set / CLAUDE.md enumeration changes

- **No new files in the mutate set** (132 files unchanged). `apps/qr/lib/line-motion.ts` and
  `apps/qr/lib/css-declarations.ts` match no `MONEY_MARKERS` noun (`check-money-coverage`: clean), so
  no mutant or exemption is owed; `packages/ui/src/stepper.tsx` / `gesture.ts` are not in the set.
- **Mutants added (4)** — one block, `// ── Phase 1c · cart-motion ──`, at the end of `MUTANTS`,
  all `apps/qr/components/Checkout.tsx` → `components/Checkout.test.tsx`, all CAUGHT:
  `p1c-cart-motion/removal-skips-the-landing` · `p1c-cart-motion/empty-heading-drops-its-ref` ·
  `p1c-cart-motion/a-removed-draft-reads-as-fired` · `p1c-cart-motion/ghost-rendered-as-a-live-row`.
  Mutant count 754 → 758 (`check:mutant-anchors`: 758 anchors, 132 files).
- **Mutants re-anchored:** none. All 34 existing `Checkout.tsx` mutants re-run and caught
  (`--only=m224` 22 · `m230` 5 · `m227` 4 · `t33/cart-` 3).

## Owner-visible behaviour changes

- **/cart, removing a dish:** the row fades and sinks away (240ms) while the dishes below slide up
  into its place, instead of vanishing and everything jumping up in one frame. Under reduced motion
  it disappears at once, as before.
- **A quick second tap is safe:** for 350ms after a removal, whatever slid under the finger (the next
  dish, a tip chip, the Pay button) ignores taps. Dishes above the removed one stay live.
- **Double-tapping "−" at quantity 2 no longer deletes the dish** (/cart AND the staff line editor):
  the Remove it turns into ignores taps for 350ms. Staff: a deliberate "−, −" to clear a qty-2 line
  within 350ms now needs a third tap.
- **A refused removal** (a lock, a closed cart) brings the dish back where it was and the dishes
  below slide down to make room; the existing sentence still says why.
- **Keyboard / screen-reader focus** after removing a dish lands on the NEXT dish's name (else the
  previous one) without scrolling, instead of jumping to the page heading at the top. Removing the
  last dish lands on the empty-cart heading ("Your order", then "Nothing in your cart yet") instead
  of losing focus. A tablemate removing a dish no longer moves your focus (or VoiceOver cursor)
  unless you were on that dish.

## Deviations from spec

1. **globals.css block placement** — appended at the END of `globals.css` as one labelled block
   (`/* ── Phase 1c · cart-motion ── */`), per the brief's shared-file rule, not "after the .mms-rise
   RM block (~1080)". `@keyframes mmsRise` is global, and being last also wins any equal-specificity
   tie.
2. **The CSS walker was lifted, not copied** — `motion-contract.test.ts` "reuses
   responsive-contract.test.ts's walker": it now lives in `apps/qr/lib/css-declarations.ts`
   (verbatim, throwing instead of `expect` on the brace-in-string ambiguity), and
   `responsive-contract.test.ts` imports it (its 18 cases unchanged and green).
3. **mergeLeaving's live-wins filter is not visible in the render on its own.** The spec says the
   Checkout refusal case "pins mergeLeaving's live-wins in the render". The renderer reads the state
   `reconcileLines` produced in the same render, which already drops revived ids, so either filter
   alone keeps the render right (measured: the `mergeLeaving`-only mutant SURVIVED the Checkout
   suite). Each filter is pinned by itself in `line-motion.test.ts`; the Checkout case pins their
   conjunction (both removed → two Mohinga rows, red — measured).
4. **Returned rows:** the spec's returned path has no in-view gate. As built, a still-mounted ghost
   (out of flow at its own spot, unmoved by the commit) is gated on its own rect — above the fold it
   goes back in flow with anchoring on; a remounted row is always measured, and only after
   `data-flip` is on, because reading layout first would let anchoring adjust between the reads.
   Filed the residual case in OPEN-ITEMS.
5. **Hold in jsdom:** jsdom has no layout, so the "rows BELOW … held" case is driven by the tap-time
   hold (`noteRemoval`), and the measured holds (ghost close, both return paths) are exercised
   through a one-dimensional `stubLayout()` (in-flow sibling index × 100px).
6. **The FLIP is skipped if `--dur-base` cannot be read** (never in the app; jsdom) rather than
   carrying a transcribed 240ms fallback.
7. **`focusWasLost()` also treats a disconnected `activeElement` as lost** (engines differ on when a
   removed focus falls to `<body>`).
8. **Additions beyond the spec** (each red-first): a leaving row never writes (stepper, pills,
   make-now refuse while `leaving`; `inert` is unsupported before Safari 15.5) + its test; the
   refusal-after-drop (remount) case; "a Remove that MOUNTED at the minimum is never held"; lib cases
   for the first-row anchor, a two-row single refresh and the 64-id `gone` cap; motion-contract
   refusing a compound `.mms-remove` override and parsing the hook's `token(...)` calls against
   `tokens.css :root`; the 4 verify:slice mutants.
9. **Docs not edited here** (brief): DESIGN-LANGUAGE §3/§7, CHANGELOG, OPEN-ITEMS, README/HANDOFF
   counts — all above for integration. `check:docs` fails ONLY on measured counts on this branch:
   qr tests 2958 → 2996, ui tests 146 → 149, verify:slice mutants 754 → 758, tracked docs files
   100 → 101 (this notes file). No table-render or menu-reference failure.

## LEARNINGS candidates

- **A `void x` lint probe is dead code to the React Compiler.** Probing whether `react-hooks/refs`
  covered a new hook with `const p = ref.current; void p;` reported NOTHING — the compiler drops the
  unused value, so the rule never sees a render-time read. The probe only works when the value
  flows into render output (`return { p }`), which then errors correctly. A silent probe is not
  evidence the rule is off, and not evidence the code is clean.
- **Two redundant guards make each other's mutants survive.** `reconcileLines` and `mergeLeaving`
  both drop a revived id; in the render either suffices, so each single-filter mutant survived the
  component suite. Pin each in the pure suite, and the conjunction in the component suite.
- **Reading any layout after a commit that re-inserted a row lets Chrome's scroll anchoring adjust
  before your first read.** A FLIP's "before" must be taken after `overflow-anchor: none` is on —
  including the innocent-looking "is it in view?" rect read.
- **jsdom rects are all zero**, so an in-view gate (`rect.bottom > 0`) is always false there. A
  one-dimensional layout stub (top = in-flow previous siblings × row + parent's top; inline
  `position:absolute` leaves the flow) is enough to make FLIP deltas and "what moved" testable.
