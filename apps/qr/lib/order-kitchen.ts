import type { CartItem } from "@mms/db";
import { trackStage, type KitchenStage } from "./kitchen-track";
import { settleRereadDelayMs, trackLineOf } from "./live-pass";
import { DINER_STAGE_WORD } from "./line-state-copy";
import { TRACK } from "./i18n/track";
import type { Entry } from "./i18n/types";
import type { PickupStage } from "./pickup-promise";

/**
 * Lifecycle audit (2026-10-13) — what the kitchen has done to a PAID order, decided ONCE for /track.
 *
 * After payment the order row (`qr_orders`) moves only on the expo's taps (`togo_status`), so every
 * post-order surface was blind to the kitchen: a dine-in table that settled at the counter saw "your
 * server will take it from here" while the TV wall drew its dishes Cooking, and a pickup guest read
 * "with the kitchen" from payment until the bagger's tap, through Mom's Start and Done (K30). The
 * kitchen's truth lives on the paid cart's own lines (`qr_cart_items.state / fire_at / bumped_at`),
 * which the diner may read while their session is open (`is_member`, the ONE read in
 * `lib/order-kitchen-read.ts`). This module turns those lines into what /track says.
 *
 * WHAT DECIDES A STAGE IS NOT HERE: `lib/kitchen-track.ts` derives every line's stage for every
 * surface (the Bill's pass, the menu strip, the TV, Dad's pane), against the read's DB clock — a Send
 * inside its grace is "sending", a bump inside Mom's undo window is still "cooking". This module only
 * picks the lines a /track arm is about and says what may be claimed from them. Pure: no React, no I/O.
 *
 * The durable fix is K30(A)'s `qr_orders.kitchen_done_at` stamp (OPEN-ITEMS, a migration on the
 * owner's go): this read lapses with the session, so a pickup booked hours ahead is past it by its
 * slot, and the page then says only what the order row knows — never less than the truth, never more.
 */

/** One paid line as the post-order read returns it: the cart view's own fields, never re-shaped. */
export type KitchenLine = Pick<
  CartItem,
  "id" | "name" | "qty" | "lineState" | "fireAt" | "bumpedAt" | "fulfillment"
>;

/** A dish on the track, in cart order, at its stage. */
export type KitchenRow = { id: string; name: string; qty: number; stage: KitchenStage };

/** A line's stage on the ONE KITCHEN TRACK, or null when it is off it (voided, grocery) or never sent:
 *  a draft has no stage here (TimelineStrip's rule — the Send has not happened, and on a paid cart
 *  `mms_fire_pending_food` has already fired every food draft). */
function stageOf(l: KitchenLine, nowIso: string): KitchenStage | null {
  if (l.lineState === "draft") return null;
  return trackStage(trackLineOf(l), nowIso);
}

/**
 * A — the dine-in settled card's dishes: every food line on the track, in cart order (rows never
 * re-sort under a thumb), each at its stage against the read's DB clock.
 */
export function kitchenRows(lines: ReadonlyArray<KitchenLine>, nowIso: string): KitchenRow[] {
  const rows: KitchenRow[] = [];
  for (const l of lines) {
    const stage = stageOf(l, nowIso);
    if (stage === null) continue;
    rows.push({ id: l.id, name: l.name, qty: l.qty, stage });
  }
  return rows;
}

/** Is a dish still with the kitchen? While one is, a return to the page re-reads (the wake). */
export function kitchenPending(rows: ReadonlyArray<KitchenRow>): boolean {
  return rows.some((r) => r.stage !== "served");
}

/**
 * B — the to-go BAG's kitchen state, from its own food lines (a dine-in plate on the same order is
 * not in the bag):
 *   • "done"    — every to-go dish Served (Mom's Done, past her undo window): the bag is the
 *                 counter's to make now;
 *   • "cooking" — the kitchen has STARTED it: any to-go dish Cooking, or Served while another waits
 *                 (the roll-up's least-advanced rule is the pay door's; this line answers "has the
 *                 kitchen begun?", and a dish already out says it has);
 *   • "sent"    — fired and past its grace, nobody has tapped Start yet;
 *   • null      — nothing to say: no to-go dish on the track, or only Sends still inside their grace
 *                 (a HELD pickup's lines are fired with `fire_at = slot − prep`, so they read
 *                 "sending" until the kitchen gets the ticket).
 */
export type BagKitchen = "sent" | "cooking" | "done";

export function bagKitchen(lines: ReadonlyArray<KitchenLine>, nowIso: string): BagKitchen | null {
  const stages: KitchenStage[] = [];
  for (const l of lines) {
    if (l.fulfillment !== "togo") continue;
    const s = stageOf(l, nowIso);
    if (s !== null) stages.push(s);
  }
  if (stages.length === 0) return null;
  if (stages.every((s) => s === "served")) return "done";
  if (stages.some((s) => s === "cooking" || s === "served")) return "cooking";
  if (stages.some((s) => s === "sent")) return "sent";
  return null;
}

/**
 * G — the to-go rail's "In the kitchen" sub. It read "Cooking" from the moment of payment (the
 * webhook stamps `togo_status = 'preparing'` before the wok is touched). Now it claims Cooking only
 * when Mom's Start says so, and the honest default is the family's "Sent to kitchen" — true of every
 * order on that step, which fired at payment. Never a stage the lines do not back.
 */
export function railKitchenSub(bag: BagKitchen | null): string {
  if (bag === "done") return "Kitchen’s done — bagging it";
  if (bag === "cooking") return DINER_STAGE_WORD.cooking.en;
  return DINER_STAGE_WORD.sent.en;
}

/**
 * B — the pickup page's line under its Now sentence, from the bag's kitchen state. Only while the
 * kitchen has the ticket and the bag is not yet Ready (`cooking`, or `late` — a late order the
 * kitchen has finished is worth saying so to a guest at the counter); never for a held booking.
 * Null leaves the guide's own sub in place.
 */
export function pickupKitchenLine(stage: PickupStage, bag: BagKitchen | null): Entry | null {
  if (stage !== "cooking" && stage !== "late") return null;
  if (bag === "done") return TRACK.kitchenDone;
  if (bag === "cooking") return TRACK.kitchenCooking;
  return null;
}

/**
 * The ONE scheduled re-read: when the clock alone will move a stage (a Send leaving its grace, a bump
 * leaving Mom's undo window), on the read's DB clock — the Bill's own rule (`settleRereadDelayMs`,
 * lib/live-pass.ts), never a copy of it. Realtime brings every other change.
 */
export function kitchenRereadDelayMs(
  lines: ReadonlyArray<KitchenLine>,
  nowMs: number | null,
): number | null {
  return settleRereadDelayMs(lines, nowMs);
}
