import type { CartItem } from "@mms/db";
import { GRACE_REREAD_MARGIN_MS, passHead, viewClockIso } from "./live-pass";

export { GRACE_REREAD_MARGIN_MS };

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
 * claim nothing kept), and never by a client clock.
 *
 * WHAT DECIDES THE STAGE IS NOT HERE (PD1's tail; round 3: one derivation for every surface). The
 * status is the ONE KITCHEN TRACK's roll-up (`lib/kitchen-track.ts`, fed through the live pass's
 * adapter `passHead`), read on the view's DATABASE clock (`getCartView.dbNow` — the clock that
 * stamped the lines' `fire_at`, so no second host's skew enters the comparison; it replaced the app
 * server's `serverNow` here, which m1 §H justified only by a round trip PD10 has since paid on every
 * view). So this pass, the Bill's live pass, the TV board and Dad's pane flip on one rule.
 *
 * The rows the pass PRINTED stay on it after they go (the ticket then shows what was sent), so the
 * host keeps the ids it listed (`passDishes`) and reads the status over THOSE rows — a second round's
 * old served dishes never make a removal read as a send. A dish that JOINS the open pass (a
 * tablemate's draft) is printed too, so its id is kept from the view it joins in (`passListedNow`) —
 * otherwise it leaves the ticket the moment it is sent (Codex's post-merge review of #335).
 */

/** The lines the pass lists when it opens: dine-in drafts, in the view's order. */
export function waitingDishes(items: ReadonlyArray<CartItem>): CartItem[] {
  return items.filter((i) => i.lineState === "draft" && i.fulfillment === "dinein");
}

/**
 * The ids the open pass has PRINTED: `listed` plus every dine-in draft waiting in this view (a
 * tablemate's dish added while the pass is up joins it). The host keeps the result, so a dish that
 * joined stays listed through "Sending…" and "Sent to kitchen" — without it the sent dish left the
 * ticket, and when the dishes the pass opened on had been removed the empty rows read `none` and
 * closed the pass instead of showing the send (Codex's post-merge review of #335).
 *
 * Returns `listed` ITSELF when no new draft joins: the host adjusts its state during render (React's
 * derived-state pattern), and only an unchanged reference lets that settle.
 */
export function passListedNow(
  items: ReadonlyArray<CartItem>,
  listed: ReadonlySet<string>,
): ReadonlySet<string> {
  let next: Set<string> | null = null;
  for (const i of waitingDishes(items)) {
    if (listed.has(i.id)) continue;
    next ??= new Set(listed);
    next.add(i.id);
  }
  return next ?? listed;
}

/**
 * The pass's rows in the current view: every dine-in line it LISTED (whatever state it reached since
 * — the ticket keeps showing what was sent), plus any dine-in draft waiting now (a tablemate's dish
 * added while the pass is up joins it: "the list follows the confirmed view"; `passListedNow` keeps
 * it listed once it is sent), in the view's order.
 * A voided ("Removed") line leaves the ticket, and so does a line the view no longer carries. A SENT
 * line the pass never listed (an earlier round) never joins: it would make a removal read as a send.
 */
export function passDishes(
  items: ReadonlyArray<CartItem>,
  listed: ReadonlySet<string>,
): CartItem[] {
  return items.filter(
    (i) =>
      i.fulfillment === "dinein" &&
      i.lineState !== "voided" &&
      (listed.has(i.id) || i.lineState === "draft"),
  );
}

export type ShowServerStatus = "waiting" | "sending" | "sent" | "none";

/**
 * The pass's status, from one applied view over the rows it lists — the kitchen track's ROLL-UP
 * (the least-advanced stage) over its DINE-IN rows, on the view's DB clock:
 *  - `waiting` — `unsent`: a dine-in draft is still with the table (the hollow ring);
 *  - `sending` — `sending`: no draft, and a sent line is still inside its grace (`fire_at` after
 *    the view's clock — or a clock this reader cannot compare, which proves nothing about the
 *    grace): the words stay "Not sent yet" — the kitchen has not got it, and an Undo may bring it
 *    back;
 *  - `sent` — `sent`, `cooking` or `served`: every sent line is past its grace (or carries no
 *    `fire_at`, which the KDS treats as fired at or before now) — the track's first stamp, "Sent to
 *    kitchen · ပို့ပြီး"; a dish Mom has started is past it by her own tap;
 *  - `none` — nothing on the track (every listed dish was REMOVED, or only to-go and grocery lines
 *    are left): the pass closes itself — a removal never reads as a send.
 *
 * Only the DINE-IN rows are read: the ticket is what the Send fires, and a to-go draft — on the
 * track, since it cooks — fires at pay, so it never holds the pass at "waiting".
 *
 * `nowMs` is the view's DB clock (`getCartView.dbNow`); null is unknown, and an unknown clock never
 * reads "sent" (`viewClockIso` → "", which every comparison fails closed against).
 */
export function showServerStatus(
  dishes: ReadonlyArray<CartItem>,
  nowMs: number | null,
): ShowServerStatus {
  const head = passHead(
    dishes.filter((i) => i.fulfillment === "dinein"),
    viewClockIso(nowMs),
  );
  switch (head.stage) {
    case null:
      return "none";
    case "unsent":
      return "waiting";
    case "sending":
      return "sending";
    case "sent":
    case "cooking":
    case "served":
      return "sent";
  }
}

/**
 * The one re-read the pass schedules: how long (ms, from the receipt of this view) until the
 * earliest in-grace line passes its grace on the view's DB clock, plus the shared margin
 * (`GRACE_REREAD_MARGIN_MS`, lib/live-pass) so the read lands after the instant rather than on it;
 * null when nothing is in grace. Counted as a DURATION between two server stamps, never the
 * server's absolute stamp against this device's clock (lib/send-grace's rule).
 */
export function graceRereadDelayMs(dishes: ReadonlyArray<CartItem>, nowMs: number): number | null {
  let soonest: number | null = null;
  for (const i of dishes) {
    if (i.fulfillment !== "dinein" || i.fireAt == null) continue;
    if (i.lineState !== "fired" && i.lineState !== "in_progress") continue;
    const left = Date.parse(i.fireAt) - nowMs;
    if (left > 0 && (soonest === null || left < soonest)) soonest = left;
  }
  return soonest === null ? null : soonest + GRACE_REREAD_MARGIN_MS;
}
