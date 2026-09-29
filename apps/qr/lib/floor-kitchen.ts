import { PULSE_COOKING_STATES, PULSE_PASS_LINGER_MS } from "./board-pulse";
import { kdsUrgency } from "./kds-urgency";
import { staffOwedSendUnits, staffSendCounts } from "./staff-send-view";
import type { FloorKitchen } from "./floor-types";
import type { KdsThresholds } from "./kitchen-types";

/**
 * Phase 2d · floor — what the FLOOR may say about a table's kitchen, decided ONCE and pure.
 *
 * A server on the floor could not see which tables were waiting on food, for how long, or whose
 * food had just come out, without walking to the kitchen tablet. The card's kitchen row says it now
 * — and every word in it is a rule that already lives somewhere else, READ from there, never
 * restated:
 *
 *   in the kitchen  `PULSE_COOKING_STATES` (fired · in_progress) — the wall's and the KDS's set.
 *   send grace      a line whose `fire_at` is still ahead is invisible, exactly as the KDS and the
 *                   wall skip it (the 10-second undo, a held pickup). `nowMs` is the DATABASE clock.
 *   ready to serve  served with `bumped_at` inside `PULSE_PASS_LINGER_MS` — the wall's own window, so
 *                   the TV's "Ready to serve" and the card's count agree at every instant. Never a
 *                   claim that anyone RAN the food: no runner event exists.
 *   not sent        2a's ONE count (plan conflict "floor × send-kitchen"): `staffOwedSendUnits(
 *                   hostPresent, staffSendCounts(…))` over the OPEN cart — every sendable dish on a
 *                   hostless table, only staff-added ones on a host table (owner decision 5c).
 *   late            `kdsUrgency` with the kitchen's own thresholds (`floorWait`).
 *
 * Plain module (no "server-only"): `lib/floor.ts` folds server-side; the card renders the result.
 */

/** A `qr_cart_items` row as the floor reads it, flagged by which cart it came from. */
export type FloorKitchenRow = {
  qty: number;
  state: string;
  fulfillment: string;
  fire_at: string | null;
  bumped_at: string | null;
  /** Who added it (`null` = staff) — the host-table half of the "not sent" rule reads it. */
  by_seat: string | null;
  /** The table's OPEN cart (true) or one of its paid carts (false). Only the open cart can owe a
   *  Send: a paid cart's leftovers are fired by settlement. */
  onOpenCart: boolean;
};

export type FloorKitchenContext = {
  /** The session's mode — the floor holds dine-in only (K21), and the send rule reads it anyway. */
  mode: string;
  /** The session has a diner host (`host_seat` set). */
  hostPresent: boolean;
  /** The DATABASE clock (`mms_now`), the one the grace and the linger are measured against. */
  nowMs: number;
};

const parse = (iso: string | null): number | null => {
  if (iso === null) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
};

export function foldFloorKitchen(
  rows: readonly FloorKitchenRow[],
  ctx: FloorKitchenContext,
  lingerMs: number = PULSE_PASS_LINGER_MS,
): FloorKitchen | null {
  const notSent = staffOwedSendUnits(
    ctx.hostPresent,
    staffSendCounts(
      ctx.mode,
      rows.filter((r) => r.onOpenCart),
    ),
  );
  let inKitchen = 0;
  let up = 0;
  let done = 0;
  let oldestMs = Number.POSITIVE_INFINITY;
  let oldestFireAt: string | null = null;
  for (const r of rows) {
    if (r.state === "voided") continue;
    // A draft has not reached the kitchen; the only thing it can say is "not sent", counted above.
    if (r.state === "draft") continue;
    const fireMs = parse(r.fire_at);
    if (fireMs === null) continue;
    // Held, or inside the send's undo grace: the kitchen has not seen it, so the floor must not.
    if (fireMs > ctx.nowMs) continue;
    if (PULSE_COOKING_STATES.has(r.state)) {
      inKitchen += r.qty;
      if (fireMs < oldestMs) {
        oldestMs = fireMs;
        oldestFireAt = r.fire_at;
      }
      continue;
    }
    if (r.state === "served") {
      const bumpedMs = parse(r.bumped_at);
      if (bumpedMs !== null && bumpedMs >= ctx.nowMs - lingerMs) up += r.qty;
      else done += r.qty;
    }
  }
  if (notSent === 0 && inKitchen === 0 && up === 0 && done === 0) return null;
  return { notSent, inKitchen, up, done, oldestFireAt };
}

/** One segment of the card's kitchen row — a count key with its `{n}`, or the all-done word. */
export type KitchenSegment =
  | { k: "floor.kitchen.notSent" | "floor.kitchen.inKitchen" | "floor.kitchen.up"; n: number }
  | { k: "expo.kitchenDone" };

/**
 * The row's words, in the order the card shows them. "Kitchen done" (the expo's word) stands alone
 * and only when nothing is unsent, cooking or ready — a table still owing a Send is never "done".
 */
export function kitchenSegments(k: FloorKitchen | null): KitchenSegment[] {
  if (k === null) return [];
  const out: KitchenSegment[] = [];
  if (k.notSent > 0) out.push({ k: "floor.kitchen.notSent", n: k.notSent });
  if (k.inKitchen > 0) out.push({ k: "floor.kitchen.inKitchen", n: k.inKitchen });
  if (k.up > 0) out.push({ k: "floor.kitchen.up", n: k.up });
  if (k.notSent === 0 && k.inKitchen === 0 && k.up === 0 && k.done > 0)
    out.push({ k: "expo.kitchenDone" });
  return out;
}

export type FloorWaitLevel = "ok" | "amber" | "red";

/**
 * The wait pill: how long the table's OLDEST in-kitchen line has been cooking, in WHOLE minutes (a
 * glance surface — per-second digits on every card would be perpetual motion), from one whole
 * minute. The level is the KDS's own dine-in rule, `kdsUrgency`, with the configured thresholds.
 */
export function floorWait(
  k: FloorKitchen | null,
  nowMs: number,
  th: KdsThresholds,
): { min: number; level: FloorWaitLevel } | null {
  if (k === null || !(k.inKitchen > 0)) return null;
  const oldestMs = parse(k.oldestFireAt);
  if (oldestMs === null) return null;
  const ageMs = Math.max(0, nowMs - oldestMs);
  const min = Math.floor(ageMs / 60_000);
  if (min < 1) return null;
  return { min, level: kdsUrgency("dinein", ageMs, th) };
}

/** The wait levels in rising order — a pill replays its pop only when the rank RISES. */
export const FLOOR_WAIT_RANK: Readonly<Record<FloorWaitLevel, number>> = {
  ok: 0,
  amber: 1,
  red: 2,
};

/**
 * Did this table's "ready to serve" count RISE between two polls? First sight is never a rise (a
 * table already showing food up when the screen loads must not ring), and a decay — the window
 * closing, a recall — never cues: only food coming OUT is an event a server can act on.
 */
export function upRose(prev: number | undefined, next: number): boolean {
  return prev !== undefined && next > prev;
}
