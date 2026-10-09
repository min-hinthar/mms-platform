import type { CartItem } from "@mms/db";

/**
 * PD1 (PATH_DESIGN_2026-10-07 moment 1) — "Show a server": what the guest's pass lists, and when
 * it flips. Pure, so every rule is falsified by a value.
 *
 * The pass is the table's ticket held up for Dad: the dishes the kitchen has NOT got — the dine-in
 * drafts, exactly what `mms_fire_cart` fires (never a to-go draft, which fires at pay; never a
 * grocery line). Its one delight is the flip to "Sent to kitchen · ပို့ပြီး", and the flip is
 * HONEST (m1 A3 · B3 · B4): it lands only when an APPLIED server view shows the dishes past their
 * 10-second grace — the same instant Mom's KDS draws the ticket (`kdsLineGate`, lib/counter-order)
 * — never on the fire edge (the host can still undo inside the grace, and the past tense would be a
 * claim nothing kept), and never by a client clock: `serverNowMs` is the SERVER's clock as the same
 * view reported it (`getCartView.serverNow`), compared against the lines' own `fire_at`.
 *
 * The rows the pass PRINTED stay on it after they go (the ticket then shows what was sent), so the
 * host keeps the ids it listed (`passDishes`) and reads the status over THOSE rows — a second round's
 * old served dishes never make a removal read as a send.
 */

/** The lines the pass lists when it opens: dine-in drafts, in the view's order. */
export function waitingDishes(items: ReadonlyArray<CartItem>): CartItem[] {
  return items.filter((i) => i.lineState === "draft" && i.fulfillment === "dinein");
}

/**
 * The listed rows as the current view shows them: a dine-in line whose id the pass printed, in the
 * view's order, whatever state it reached — minus a voided ("Removed") one, and minus any line the
 * view no longer carries. An unlisted line never joins (a tablemate's new draft joins only through
 * the host re-listing it from `waitingDishes`).
 */
export function passDishes(
  items: ReadonlyArray<CartItem>,
  listed: ReadonlySet<string>,
): CartItem[] {
  return items.filter(
    (i) => listed.has(i.id) && i.fulfillment === "dinein" && i.lineState !== "voided",
  );
}

export type ShowServerStatus = "waiting" | "sending" | "sent" | "none";

/**
 * The pass's status, from one applied view over the rows it lists:
 *  - `waiting` — a dine-in draft is still with the table (the hollow ring);
 *  - `sending` — no draft, and a sent dine-in line is still inside its grace (`fireAt` after the
 *    server's now): the words stay "Not sent yet" — the kitchen has not got it, and an Undo may
 *    bring it back;
 *  - `sent` — no draft, and every sent dine-in line is past its grace (or carries no `fireAt`,
 *    which the KDS treats as fired at or before now): the track's first stamp, "Sent to kitchen ·
 *    ပို့ပြီး";
 *  - `none` — nothing dine-in was sent and nothing waits (every listed dish was REMOVED): the pass
 *    closes itself — a removal never reads as a send.
 */
export function showServerStatus(
  dishes: ReadonlyArray<CartItem>,
  serverNowMs: number,
): ShowServerStatus {
  if (waitingDishes(dishes).length > 0) return "waiting";
  const sent = dishes.filter(
    (i) =>
      i.fulfillment === "dinein" &&
      (i.lineState === "fired" || i.lineState === "in_progress" || i.lineState === "served"),
  );
  if (sent.length === 0) return "none";
  const inGrace = sent.some((i) => i.fireAt != null && Date.parse(i.fireAt) > serverNowMs);
  return inGrace ? "sending" : "sent";
}

/**
 * The one re-read the pass schedules: how long (ms, from the receipt of this view) until the
 * earliest in-grace line passes its grace on the SERVER's clock, plus a small margin so the read
 * lands after the instant rather than on it; null when nothing is in grace. Counted as a DURATION
 * between two server stamps, never the server's absolute stamp against this device's clock
 * (lib/send-grace's rule).
 */
export const GRACE_REREAD_MARGIN_MS = 300;
export function graceRereadDelayMs(
  dishes: ReadonlyArray<CartItem>,
  serverNowMs: number,
): number | null {
  let soonest: number | null = null;
  for (const i of dishes) {
    if (i.fulfillment !== "dinein" || i.fireAt == null) continue;
    if (i.lineState !== "fired" && i.lineState !== "in_progress") continue;
    const left = Date.parse(i.fireAt) - serverNowMs;
    if (left > 0 && (soonest === null || left < soonest)) soonest = left;
  }
  return soonest === null ? null : soonest + GRACE_REREAD_MARGIN_MS;
}
