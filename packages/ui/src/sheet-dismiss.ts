/**
 * M82 — when a `Sheet` may be dismissed, and the four ways a person can ask.
 *
 * PURE by design, and split out of `sheet.tsx` for the reason this repo has now learned three times
 * (W17's "decision logic belongs in `lib/`, not a component", then `your-usual.ts` and `chime.ts`):
 * a rule that lives inside a component cannot be guarded. `packages/ui`'s vitest is
 * `environment: "node"` with no DOM — there is no React runner anywhere in this monorepo — so a
 * predicate written next to the JSX would be untestable, while this file matches the existing
 * `src/**\/*.test.ts` glob with zero config change.
 *
 * ── Why a module for what looks like `!busy` ─────────────────────────────────────────────────────
 *
 * Because the interesting property is not the boolean, it is the **enumeration**. `Sheet` hands a
 * caller four ways to dismiss, and the whole defect class is a guard that covers some of them:
 *
 *   · `esc`   — Radix `DismissableLayer`'s `useEscapeKeydown` → `onDismiss()` → `onOpenChange(false)`
 *   · `scrim` — `usePointerDownOutside` → `onDismiss()` → `onOpenChange(false)`
 *   · `close` — the ✕; `Dialog.Close` is a plain button whose composed `onClick` calls the same thing
 *   · `drag`  — ours: a decisive downward flick on the grab handle, thresholds below
 *
 * ── Vectors are what a PERSON does; channels are what the code can tell apart ─────────────────────
 *
 * Radix funnels `esc`, `scrim` and `close` into ONE `onOpenChange` callback, so the primitive cannot
 * distinguish them and does not pretend to — `channelOf` maps all three to `"radix"`, and the drag,
 * which never enters Radix, to `"drag"`. Two channels, four vectors. That collapse is exactly why a
 * complete guard is cheap here, and why the enumeration below is documentation rather than dispatch.
 *
 * ⚠️ **An earlier version of this header overclaimed and the claim is retracted.** It said that a
 * `busy` built to `docs/OPEN-ITEMS.md`'s description — which counts "three dismissal vectors",
 * naming Esc, ✕ and drag and **omitting the scrim** — "would have blocked three and leaked the
 * fourth". In THIS code shape it would not have: a guard on `onOpenChange` catches the scrim whether
 * or not its author was thinking about the scrim, and leaking it would take deliberately ADDING an
 * `onPointerDownOutside`. The registry's miscount is a real documentation error worth fixing — a
 * reader planning this work would have reasoned about three exits — but it was never one edit away
 * from shipping a hole, and saying so was a scarier story than the facts support. What the
 * enumeration actually buys is stated plainly: `channelOf` proves the choke point covers three of
 * the four, so a future edit cannot quietly move one of them onto its own path.
 *
 * ── The thresholds live here too ─────────────────────────────────────────────────────────────────
 *
 * `120px` and `700` had been inline magic numbers in `sheet.tsx` since R5b with no assertion of any
 * kind. They decide whether a scroll that wandered downward closes someone's half-filled sheet, so
 * they are a rule, not a constant.
 */

/** The four ways a person can ask a `Sheet` to close. There is no fifth — see the header. */
export type DismissVector = "esc" | "scrim" | "close" | "drag";

/** Every vector, for a caller (or a test) that needs to prove it covered all of them. */
export const DISMISS_VECTORS: readonly DismissVector[] = ["esc", "scrim", "close", "drag"];

/**
 * What the WIRING can actually distinguish. Three vectors share one callback, so there are two.
 *
 * Naming this is the honest alternative to threading a `via` the primitive would have to invent:
 * the choke point passes `"radix"` because that is genuinely all it knows, rather than passing
 * `"close"` for an Esc keypress and quietly making the vector type decorative.
 */
export type DismissChannel = "radix" | "drag";

/** Which callback a vector arrives on. The three-into-one collapse, stated once and testable. */
export function channelOf(vector: DismissVector): DismissChannel {
  return vector === "drag" ? "drag" : "radix";
}

/** A downward drag past this many pixels is a decisive "close". */
export const DRAG_CLOSE_PX = 120;

/** …or a flick faster than this, in px/s, however short. */
export const DRAG_CLOSE_VELOCITY = 700;

/**
 * Was this release a decisive downward dismissal, or a wander to be sprung back?
 *
 * Downward only, on both axes of the test: a negative offset is an UPWARD tug (the sheet is already
 * at the top of its constraint and rubber-bands), and a negative velocity is an upward flick. Either
 * closing the sheet would mean pulling a sheet up to make it go away.
 */
export function dragClosed(offsetY: number, velocityY: number): boolean {
  return offsetY > DRAG_CLOSE_PX || velocityY > DRAG_CLOSE_VELOCITY;
}

/**
 * May the sheet close right now?
 *
 * `busy` means the sheet body has an irreversible write in flight — a refund moving real money, a
 * void that has already spent one of a manager's PIN attempts, an add whose refusal has nowhere else
 * to be shown. Dismissing then does not cancel the write; it only guarantees nobody sees how it
 * ended, on a tree that has usually unmounted by the time the server answers.
 *
 * ⚠️ **`busy` must be driven by something that SETTLES, including on the failure path** — a
 * `useTransition` flag or a promise's `finally`, never a bare boolean a code path can strand. All
 * four exits are blocked while it is true, and the sheet's focus scope is `trapped`, so a `busy`
 * that never clears is a permanent keyboard trap (WCAG 2.1.2). The primitive cannot enforce that and
 * does not pretend to; it is the one thing a caller owns.
 */
export function mayDismiss(opts: { busy: boolean }): boolean {
  return !opts.busy;
}

/**
 * The whole decision, for one vector, in one call — what `sheet.tsx` actually consults.
 *
 * Takes a CHANNEL, not a vector — see `channelOf`. The `drag` channel carries its own threshold
 * test, so a caller cannot apply the busy gate while re-deriving "was that flick decisive" somewhere
 * else and letting the two disagree. Anything arriving on the `radix` channel has already decided it
 * wants to close.
 */
export function sheetDismiss(
  opts: { busy: boolean } & (
    | { via: "radix" }
    | { via: "drag"; offsetY: number; velocityY: number }
  ),
): boolean {
  if (!mayDismiss(opts)) return false;
  return opts.via === "drag" ? dragClosed(opts.offsetY, opts.velocityY) : true;
}
