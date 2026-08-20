/**
 * W22c — the haptic vocabulary. Four named moments, one weight each, no numbers at call sites.
 *
 * ── Why this replaces `hapticTap(ms)` outright ───────────────────────────────────────────────────
 * The numeric API let the same weight mean opposite things, and it did: **8ms was both a PICK and a
 * COMMIT**. `ItemSheet.choose` buzzed 8 for selecting a modifier option — its own comment reasoning
 * "8 < the Add's 12 — a pick is smaller than a commit" — while `AddButton`'s pill tap and the
 * grocery scan-add buzzed the SAME 8 for putting an item in the basket. A diner's thumb was told
 * "you chose something" and "you bought something" in identical language.
 *
 * A vocabulary is the fix, and it only works if the numbers cannot come back: `haptic()` takes a
 * MOMENT, not a duration, so a raw millisecond is now a compile error rather than a lint warning.
 * That is the whole reason the old export is deleted instead of re-typed.
 *
 * ── Four names, not the proposal's three ─────────────────────────────────────────────────────────
 * `docs/W22_DESIGN_PROPOSAL.md` sketches "pick < commit < celebrate". The code has FOUR distinct
 * moments, because the v7.2 prototype designed three add-weights (6 stepper · 8 quick-add · 12
 * sheet-add) and this repo treats v7.2 as the fidelity source. Collapsing quick-add and sheet-add
 * into one word would delete a designed distinction — and, worse, would re-create the exact
 * ambiguity the vocabulary exists to remove, one level up. So the sketch's three words gain the
 * fourth weight already shipped:
 *
 *   pick  (6)  — a REVERSIBLE adjustment. Nothing is bought: a stepper step, a modifier option.
 *   add   (8)  — one tap put an item in the basket: the Add pill, a grocery scan.
 *   commit(12) — a CONFIGURED dish entered the basket from a sheet, after choices were made.
 *   celebrate  — the pattern. Money moved. Exactly one caller, and it is PaySuccess.
 *
 * The one call site whose weight CHANGES is `ItemSheet.choose` (8 → `pick`, 6ms). That is not a
 * side effect of the rename; it is the defect above being corrected.
 *
 * ── Two rules that are not negotiable ────────────────────────────────────────────────────────────
 * 1. **Reduced motion is read SYNCHRONOUSLY from matchMedia**, never via `useAnimationPreference` —
 *    that hook seeds `shouldAnimate = true` before its effect resolves (SSR-safe by design), and a
 *    haptic is irreversible: an RM user would get buzzed once per first-tap. `PaySuccess` used to
 *    carry its own copy of this guard, which is why the rule now lives in exactly one function.
 * 2. **A haptic may never be the ONLY feedback for an event.** iOS Safari does not implement
 *    `navigator.vibrate` at all, so on the app's single most common device every one of these is a
 *    silent no-op. This holds today by construction — pick has the stepper digit + MicroBurst, add
 *    has the cart count capsule, commit closes the sheet, celebrate has the confetti — and any new
 *    moment has to bring its own visible half.
 */

/** The vocabulary. Values are the v7.2 weights; `celebrate` is a pattern, hence the array. */
export const HAPTIC = {
  pick: 6,
  add: 8,
  commit: 12,
  celebrate: [10, 40, 18],
} as const;

export type HapticMoment = keyof typeof HAPTIC;

/**
 * Buzz one named moment. No-ops under reduced motion, on the server, and on every platform without
 * the Vibration API (which is all of iOS) — see rule 2 above.
 */
export function haptic(moment: HapticMoment): void {
  try {
    if (typeof window === "undefined" || typeof navigator === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // `slice()` because the Vibration API spec permits an implementation to retain the pattern
    // array, and HAPTIC is a shared frozen-by-convention constant — never hand it out directly.
    const w = HAPTIC[moment];
    navigator.vibrate?.(typeof w === "number" ? w : w.slice());
  } catch {
    /* deliberate: haptics are garnish — never let a platform quirk break the add */
  }
}
