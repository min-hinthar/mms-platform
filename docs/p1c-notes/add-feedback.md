# Phase 1c · add-feedback — integration notes

Branch `p1c/add-feedback` (base `0a1a5c6`). The menu's add moment: a quiet, named claim at the tap,
a named correction plus a settle cue when the write does not land, one-shot focus, and one arbitrated
notice slot.

## 1 · DESIGN-LANGUAGE draft

### §XX The add moment (Phase 1c)

- **Three layers, and only the first is instant.** INTENT happens on the tap: press, ripple, haptic,
  the pill→stepper morph, the digit pop, the CartBar capsule pop, the Add pill's MicroBurst, and the
  spoken claim. RECEIPT is the CartBar's subtotal roll when the server view lands. REVERSAL is the
  "+" glyph's settle cue, a named correction, and one focus landing. Amounts are never part of
  intent; the CartBar amount reads "—" until confirmed.
- **The claim names the dish, and it is spoken at the TAP, not when a queued write starts.** Pill:
  "Mohinga added" · "ထည့်ပြီးပါပြီ". Stepper: "Mohinga, quantity 3" / "Removed Mohinga", English
  only (a Burmese quantity pattern waits for K15). The copy lives once in `lib/add-feedback.ts`.
- **An in-place change is spoken, not drawn.** The pill and stepper claims are QUIET: they ride the
  Toast's own live region and draw no pill, because the row already shows the change where the diner
  tapped. A claim whose origin is gone is VISIBLE: the item sheet closes on the tap, so
  `sheetAddClaim` ("2 Mohinga added", never "2 ×") is drawn, and held for `freshnessDurationMs`.
- **A claim is never a count.** v7.2's "${n} added, ${cartCount()} items" is dropped. In dine-in the
  basket count is a tablemate's tap away from wrong the moment it is spoken (§21).
- **Every non-landing retracts the claim visibly, and names the dish.** "Mohinga didn’t go through —
  the order’s locked while someone checks out." / "We couldn’t confirm Mohinga — the order below is
  up to date." (the hedge rides the `unknown` cause, as in the unnamed sentence) / "We couldn’t
  confirm Mohinga — check your order below." The named sentences sit BESIDE the unnamed ones
  (`namedRefusedWriteNotice`, `namedUnconfirmedWriteNotice`), held to them by parity tests. The
  stepper "−" corrections are still unnamed (filed).
- **The settle cue draws only a DEFINITE non-landing** (`createRevertCue`): `refused`, or `applied`
  with no own line in a current view. Never `unconfirmed` (it may be on the bill), never when the
  seat or view is unknown. It is `.mms-settle` on the "+" GLYPH ("set back down", no overshoot, so
  it never invites a re-tap), never on the button, so `whileTap` and the frozen dim are untouched.
- **The burst is intent, and it is the pill's alone.** MicroBurst plays on the Add pill's 0→1 tap
  (v7.2 quickAdd) and ends ≤560ms after it, well before a non-landing can arrive (~1.7s measured).
  A stepper step has no gems (v7.2 `bump()`). A stepper that remounts never replays an old burst.
- **Focus lands ONCE, never later.** When a pill create settles with focus orphaned (<body>/null) or
  inside its own row, focus lands once after the reconcile: landed → "+" (or "−" when "+" is
  disabled), reverted → the pill. If a freeze has natively disabled that pill, the one pill stays
  focusable as `aria-disabled`, with its reason in its name, until it blurs (the sold-out pattern).
  Focus anywhere else never moves. Every refocus flag in the row is one-shot and orphan-guarded, so
  a freeze lifting later can never pull focus back.
- **The CartBar's entrance is spent by a CONFIRMED appearance.** An empty visit or a pending-only
  appearance does not use up the once-per-visit spring.

**The one slot — precedence (`lib/notice-slot.ts`).** Every notice is a CLAIM (the diner's own
change, said for them; may be quiet), a CORRECTION (always visible) or NEWS (always visible; the
default). Rules, in order:

1. empty slot → show;
2. a correction over an IDENTICAL correction → extend (same node, not re-announced: five refused
   taps under one lock are one sentence); any other correction → show;
3. a claim over a correction still in its window → defer;
4. a quiet line over visible text → defer;
5. anything else → show.

News never defers: the lock-release banner contradicts the refusal it follows and must replace it
at once. The deferred slot is one deep, newest wins, and shows when the current window ends. A
correction drops a waiting claim, so a retracted claim is never spoken afterwards. The Toast is
keyed on a monotonic sequence, so a repeated sentence is announced again.

**Deliberate deviations from v7.2:** the quickAdd count is dropped (§21); `bump`'s "qty" is spelled
"quantity"; `addFromSheet`'s gems are omitted (a modifier line has no row stepper, and `--ac` gems on
the `--ac` bar would be invisible); the sheet toast's Burmese is the trusted "ထည့်ပြီးပါပြီ", not a
new named string; `.ui-toast` wraps where `.toast` was nowrap.

**Rejected:** fly-to-cart (launches for adds that later fail, a sheet add has no origin, a layout
read per tap); a check-morph on the "+" (delays the stepper and shows ✓ before anything is
confirmed); a header count bump (the slot is not on /menu); a haptic after the round trip (§3/§12);
a burst gated on confirmation (a ~1.7s round trip makes it rare and random in timing, so it cannot be
learned).

**Reduced motion:** every fact, no motion. `haptic()` is off; whileTap and the ripple are skipped;
every `.mms-pop` is `animation:none`; MicroBurst and the glyph's `.mms-settle` are JS-gated with CSS
belts; the CartBar spring collapses through its token; the quiet line has no motion at all.

### Edits to existing sections (for integration)

- **§3 table**, two rows:

  | Idiom                          | Meaning                               | Where                             |
  | ------------------------------ | ------------------------------------- | --------------------------------- |
  | MicroBurst (✦◆)                | intent: the pill's 0→1 add            | menu row stepper (never per step) |
  | `.mms-settle` on the "+" glyph | your add did not land — set back down | menu row pill                     |

- **§12** — replace "`announce` is a single-slot **visible** toast, so anything it says replaces
  whatever the diner was reading" with: "`announce` is the view's one arbitrated slot
  (`lib/notice-slot.ts`): news and corrections are always visible, a claim may be quiet, a quiet line
  never blanks visible text and a claim never erases a correction — but NEWS still replaces whatever
  the diner was reading, so an unrequested ambient sentence overwrites the claim of the thing they
  just tapped."
- **§20 Toast** — replace "confirmation only" with: "the view's one live region — visible for news,
  corrections and claims whose origin is gone; `quiet` (spoken, not drawn) for an in-place change."

## 2 · CHANGELOG

- **Phase 1c · add-feedback** — the menu add speaks the dish's name quietly at the tap
  ("Mohinga added"), the sheet add names it visibly ("2 Mohinga added"), and a write that does not
  land retracts it by name ("Mohinga didn’t go through — …") with a settle cue on the "+" and one
  focus landing; the diner's one notice slot is arbitrated (a claim never erases a correction, a
  quiet line never blanks visible text, news never waits); the stepper "+" no longer replays gems;
  the CartBar's entrance is spent only by a confirmed appearance; the `@mms/ui` Toast gains `quiet`.

## 3 · OPEN-ITEMS rows

| Sev | Item                                                                                   | Why / where                                                                                                                                                                                                                  |
| --- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| low | CartBar capsule trails the row digit for queued "+" taps                               | The provider's `pendingDelta` moves only when a queued `add()` starts. Needs a provider-level count reservation or an unchained "+" inside the T26 write chain (`TableCartProvider.tsx` `add`, `AddButton.tsx` `increment`). |
| low | CartBar has no exit animation when a refused first add empties it                      | It unmounts at the `count === 0` early return (`CartBar.tsx`). Needs a leaving phase with `inert`/`aria-hidden` plus `useCtaDock` timing.                                                                                    |
| med | The stepper "−" corrections do not name the dish                                       | `setItemQty`'s publish fork is the `refusal/qty-refusal-goes-unpublished` anchor and `setItemQty` holds a cartItemId, not a name. Pass a name through like `add`'s `opts.name`, re-anchoring that mutant.                    |
| med | A reverted "−" under a freeze can leave focus stranded                                 | The stepper's buttons are natively disabled, so `refocusStepper` can land only after the freeze lifts. The orphan guard stops the steal; the fix is the pill's focus-hold pattern applied to the stepper (`AddButton.tsx`).  |
| low | No per-row "in your order ×N" badge for configured (modifier) dishes after a sheet add | `matchOwnLines` excludes modifier lines. Needs an own-seat derivation in `lib/`.                                                                                                                                             |
| med | Two extra `role="status"` regions on /menu                                             | `MenuBrowser.tsx` (~932) and `DietFilterButton.tsx` (~112) each render one, against the one-live-region rule; the reason QA §A's live-region item is not ticked here.                                                        |
| low | Burmese for the quiet stepper lines                                                    | "{name}, quantity {n}" / "Removed {name}" are English-only. Needs a K15-cleared quantity pattern and an owner call on screen-reader verbosity.                                                                               |
| low | Rename `freshnessDurationMs` to a reading-time name                                    | It is now the one reading-rate rule (the freshness sentence AND `sheetAddClaim`); the name says "freshness".                                                                                                                 |
| low | The item sheet's CTA name says "Add 2 × Mohinga to your order"                         | Found, not fixed (out of this spec's scope): VoiceOver reads "×" as "times" — the reason `sheetAddClaim` says "2 Mohinga added". `ItemSheet.tsx` CTA `aria-label`.                                                           |
| low | A deferred quiet claim can be spoken up to one visible window late (≤7000ms)           | By design (the change is on screen in the row, and the stepper's sr-only quantity answers a query); listed so the trade is visible.                                                                                          |

No unmeasured starting constants: every duration used is an existing token or `freshnessDurationMs`,
and the ~1.7s round trip is the measurement already recorded in `CartBar.tsx`.

## 4 · Mutate-set / CLAUDE.md enumeration changes

- **Files added to the mutate set (bucket `lib`):** `apps/qr/lib/add-feedback.ts`,
  `apps/qr/lib/notice-slot.ts`. Measured after the change: **761 mutants**, **134 target files** =
  118 `apps/qr/lib` + 3 `apps/qr/app/api` + 12 components + 1 `packages/db` (was 754 / 132 = 116 +
  3 + 12 + 1). Re-measure at integration; siblings add mutants too.
- **Mutants added (7):** `refusal/add-correction-loses-its-dish`, `refusal/named-opener-drops-hedge`,
  `add-feedback/unconfirmed-cues-a-revert`, `add-feedback/unknown-seat-cues-a-revert`,
  `notice/claim-erases-a-correction`, `notice/quiet-erases-visible-text`,
  `notice/retracted-claim-spoken-late` — one block `// ── Phase 1c · add-feedback ──` at the end of
  `MUTANTS`.
- **Mutants re-anchored (3), same mutation:** `refusal/add-refusal-goes-unpublished`,
  `refusal/unconfirmed-retraction-goes-silent`, `refusal/unconfirmed-lent-a-refusals-sentence`.
- Watched `verify:slice --no-gate` runs, all caught, none stale: `--only=refusal` (54),
  `--only=notice/` (3), `--only=add-feedback/` (2), `--only=t33/` (19), `--only=perf/` (10),
  `--only=written/` (8), `--only=freeze/` (10).

## 5 · Owner-visible behaviour changes

- ⚠️ **The quick-add's VISIBLE toast is now quiet.** Tapping a row's "+" no longer floats the
  "Added to your order" pill over the menu for ~2s; screen readers hear "Mohinga added" · "ထည့်ပြီးပါပြီ"
  instead. The row morph, gems, haptic and capsule are unchanged. This is v7.2's design (quickAdd
  speaks into the sr-only `#sr`). **Revert in one line:** drop `quiet: true` from `pillAddClaim` in
  `apps/qr/lib/add-feedback.ts`.
- ⚠️ **The stepper "+" stops replaying the gems.** Only the pill's 0→1 add bursts; v7.2's `bump()` has
  none. **Revert in one line:** `if (fromPill) setBurstKey(...)` → `setBurstKey(...)` in
  `AddButton.tsx` `increment`.
- The sheet add's toast names the dish: "Mohinga added" / "2 Mohinga added" (was "Added to your order").
- A refused or unconfirmed add now names the dish: "Mohinga didn’t go through — the order’s locked
  while someone checks out.", "We couldn’t confirm Mohinga — check your order below."
- After a definite non-landing the pill's "+" plays a small "set back down" settle.
- Keyboard/screen-reader focus lands back on the pill after a refused add (focusable even under a
  lock, reading "Mohinga — the order’s locked while someone checks out") and never jumps back later.
- A tablemate's news toast is no longer cut short by the diner's own quiet claim; a sentence repeated
  within its window is announced again.
- The CartBar's spring now plays on the first real appearance after an empty menu visit.
- /kit's Toast section gains a "Speak quietly" demo.

## 6 · Deviations from spec

- **`.ui-toast-quiet` sits in a labelled block at the END of `primitives.css`**, not directly after
  `.ui-toast-leaving` (the brief's shared-file rule). No cascade interaction: no other rule targets
  the class.
- **`globals.css` comments were inserted in place** (two lines above `.mms-settle`, two above
  `.mms-burst`, each labelled `Phase 1c · add-feedback`), not in an end-of-file block — they
  describe those rules, and the lines sit far from every sibling's region. Comment-only.
- **`packages/ui` test plumbing:** `vitest.config.ts` gained `esbuild: { jsx: "automatic" }` (without
  it `toast.tsx` compiles to the classic runtime and throws `React is not defined`, the M83 defect),
  and `src/__tests__/react-dom-server.d.ts` declares the one `renderToStaticMarkup` export. The spec's
  "react-dom resolves from packages/ui" holds at runtime, not for types (TS7016 in `@mms/ui`
  typecheck). `pnpm add -D @types/react-dom --offline` rewrote `pnpm-lock.yaml` (−2139 lines), so it
  was reverted in favour of the narrow declaration.
- **AddButton case B's named mutation does not redden B alone.** Dropping the effect's orphan check
  leaves B green, because the chain-side check already refuses (focus is elsewhere at the settle). So
  the suite adds **case C** (focus on the row's own "−" during the create stays there — kills the
  effect-side mutation) and **"a refusal while focus is ELSEWHERE holds nothing"** (kills dropping the
  chain-side check). Case B is red when both checks are dropped.
- **"The lock lifting later does NOT move focus"**: the spec's mutation (arm the persistent
  `refocusAfterRemove` on revert) is caught only with that effect's new orphan guard also removed
  (the guard alone defends); red-first used the combined mutation. A test for `refocusStepper`'s
  orphan guard was added (the spec had none).
- **`refusal/unconfirmed-retraction-goes-silent`'s replace** is now
  `void [name, namedUnconfirmedWriteNotice, unconfirmedWriteNotice];` (was
  `void unconfirmedWriteNotice;`) — same meaning, every binding still referenced.
- **The `notice/*` mutants are owned by `lib/notice-slot.test.ts`** (the spec named no suite); the
  provider suite also kills rules 3, 4 and the purge through the wiring.
- **The claim-over-correction provider test announces a VISIBLE claim too** — a quiet claim is also
  deferred by rule 4, so deleting rule 3 is only visible through a visible claim.
- **"A correction drops the claim waiting behind it"** samples the region every 100ms inside `act`
  rather than observing mutations: a MutationObserver missed the short-lived line (React committed it
  after a whole fake-timer advance), and that draft stayed green against `purgesDeferred → false`.
- **Added a provider test the spec did not list:** an identical correction EXTENDS (same node), which
  pins rule 2's extend at the wiring.
- **`lib/haptics.ts` comment updated** (not in the spec): rule 2 listed MicroBurst as a "pick"
  feedback; the burst now rides the pill's add only.
- **QA-CHECKLIST §A not ticked:** its live-region item is not true on /menu while the two extra
  `role="status"` regions remain (filed above). `docs/REVIEW.md` is integration's.

## 7 · LEARNINGS candidates

- **A MutationObserver cannot prove "never rendered" under fake timers.** React may commit a
  short-lived state after the whole `advanceTimersByTimeAsync` window, so the observer records only
  the before and after. Step the clock inside `act` and sample at each step.
- **`pnpm add --offline` with pnpm 11 can rewrite the whole lockfile.** It pruned ~2100 lines of
  platform-optional entries. Diff `pnpm-lock.yaml` after any add, and revert the node_modules link
  too, or local typecheck passes on a package CI will not have.
- **Two guards in series make each one's mutant survive the other's test.** Check the pair with a
  sequence that gets past the first guard: here, focus inside the row at the settle, then still
  there after the reconcile.
