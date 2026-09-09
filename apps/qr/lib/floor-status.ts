import { CART_LOCK_TTL_MS, SETTLE_TTL_MS } from "./lock-ttl";
import { isFresh } from "./pay-guard";
import { counterAskLive } from "./counter-pay-state";
import type { FloorStatus } from "./floor-types";

/**
 * The floor's per-table status, derived from the open cart — ONE function for the floor cards and
 * the drill-down header, so the two can never disagree (it used to live inside `lib/floor.ts`,
 * which is `"use server"` and may only export async functions; A1 moved it here so the RANK can be
 * pinned by a value test and a mutant).
 *
 * The rank, widest state first:
 *   settling  — a split-tender freeze is open (every payer's hold rides it)
 *   paying    — a fresh single-pay lock (a card is in flight on a phone)
 *   counter   — A1: the table ASKED for the register; below the two above because those are money
 *               in flight and the register must not settle under them, above `ordering` because
 *               "waiting for you" is the whole point of the chip
 *   ordering  — an open cart with items
 *   paid      — a settled order rests on the table
 *   seated    — an active session with nothing on it
 */
export type FloorCartRow = {
  locked: boolean;
  locked_at: string | null;
  settle_at: string | null;
  counter_requested_at: string | null;
};

export function deriveFloorStatus(
  cart: FloorCartRow | null,
  itemCount: number,
  hasPaidOrder: boolean,
): FloorStatus {
  if (cart) {
    if (isFresh(cart.settle_at, SETTLE_TTL_MS)) return "settling";
    if (cart.locked && isFresh(cart.locked_at, CART_LOCK_TTL_MS)) return "paying";
    if (counterAskLive(cart.counter_requested_at) && itemCount > 0) return "counter";
    if (itemCount > 0) return "ordering";
  }
  if (hasPaidOrder) return "paid";
  return "seated";
}
