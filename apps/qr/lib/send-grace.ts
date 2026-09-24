import { removeHeld } from "@mms/ui";

/**
 * Phase 2a · send — the ONE client reading of the kitchen send's server-clocked grace.
 *
 * `mms_fire_cart` stamps every line it fires with `fire_at = now() + 10s` (captured once in the
 * statement) and hands that deadline back beside `serverNow`, the app server's clock at the moment
 * the action answered. The grace this app shows is the server-MEASURED duration between those two,
 * counted from THIS device's receipt of the answer — never the absolute server timestamp compared
 * against `Date.now()`. A tablet whose clock runs five minutes fast would otherwise see a window that
 * closed before it opened (or a slow one, a window that never closes). The server re-checks
 * `fire_at > now()` on undo regardless, so the countdown is advisory; what it must never be is WRONG.
 *
 * Two surfaces read it and neither restates it: the diner's `SendToKitchenButton` (whose inline copy
 * of this arithmetic this module replaces, byte-equivalent) and the staff console's `useStaffSend`.
 * "The same gesture" is `removeHeld` / `SAME_GESTURE_MS` from `@mms/ui` — one number for every control
 * that relabels under a finger — so `undoTapHeld` delegates rather than carrying a second 350.
 *
 * Pure and dependency-light so every rule is falsified by a VALUE, not a render.
 */

/** The fields of a send result this module reads — the diner's and the staff's results share them. */
export type GraceReceipt = {
  undoUntil: string | null;
  serverNow: string;
  undoBatch: string | null;
};

/**
 * The client-local deadline (epoch ms on THIS device's clock) of the undo window, or null when no
 * window may open: no deadline, a non-positive grace, or no batch to target (an undo without a batch
 * could reverse a line some other actor fired inside the same grace — S4-audit P1-3).
 */
export function graceDeadlineMs(res: GraceReceipt, receiptMs: number): number | null {
  const graceMs = res.undoUntil ? Date.parse(res.undoUntil) - Date.parse(res.serverNow) : 0;
  return graceMs > 0 && res.undoBatch !== null ? receiptMs + graceMs : null;
}

/** Whole seconds left in the window, rounded UP (a window with 200ms left still says 1s), floor 0. */
export function graceRemainingSec(deadlineMs: number | null, nowMs: number): number {
  if (deadlineMs === null) return 0;
  return Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000));
}

/**
 * Is a tap at `now` still the same gesture as the relabel stamped at `armedAt`? A control that turns
 * into another control under the finger (Send → Undo, Undo → Send) ignores taps for this long, so the
 * second half of a double-tap never lands on the control that replaced the first. `null` = never
 * relabelled this stay, so nothing is held.
 */
export function undoTapHeld(armedAt: number | null, now: number): boolean {
  return removeHeld(armedAt, now);
}

/**
 * After a successful undo the control stays busy until the table view shows the drafts again (the
 * rendered Send), so a stale "Everything's been sent" row never flashes under "Brought back — not
 * sent". Bounded at two detail commits: the first may be a poll that STARTED before the undo landed.
 */
export function holdResolved(viewKind: string, commitsSinceUndo: number): boolean {
  return viewKind === "send" || commitsSinceUndo >= 2;
}
