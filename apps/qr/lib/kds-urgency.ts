import type { KdsThresholds, KitchenChannel } from "./kitchen-types";

/**
 * Phase 2b — kitchen lateness, named ONCE (plan.json shared rule "TIMERS AND URGENCY").
 *
 * `kdsUrgency` was `urgency()`, private to `KdsBoard.tsx`, and the thresholds' defaults were
 * `DEFAULT_THRESHOLDS`, private to `kitchen.ts` — a `"use server"` module, which may export only async
 * functions, so the value could not be shared from there. The floor's wait pill needs the same
 * "late" the KDS strip shows, and a second copy of 8/12 is the drift the name-it-once rule exists
 * for. Lifted verbatim; the board's behaviour and CSS are unchanged. Pure: no React, no I/O.
 */

/** The fallback when `mms_kds_config` has no row (or its read failed): 8/12 min both channels, 75s. */
export const DEFAULT_KDS_THRESHOLDS: KdsThresholds = {
  dineinAmberMin: 8,
  dineinRedMin: 12,
  pickupAmberMin: 8,
  pickupRedMin: 12,
  rechimeSec: 75,
};

/**
 * How late a ticket is, by its channel's pair: dine-in ages on the dine-in thresholds, pickup AND
 * scan-and-go on the pickup ones (that customer is at the counter). Both edges are inclusive — a
 * ticket exactly 12:00 old is red.
 */
export function kdsUrgency(
  channel: KitchenChannel,
  ageMs: number,
  th: KdsThresholds,
): "ok" | "amber" | "red" {
  const amber = channel === "dinein" ? th.dineinAmberMin : th.pickupAmberMin;
  const red = channel === "dinein" ? th.dineinRedMin : th.pickupRedMin;
  const min = ageMs / 60_000;
  if (min >= red) return "red";
  if (min >= amber) return "amber";
  return "ok";
}

/** The `mms_kds_config` row's threshold columns, as `kitchen.ts` selects them. */
export type KdsConfigRow = {
  dinein_amber_min: number;
  dinein_red_min: number;
  pickup_amber_min: number;
  pickup_red_min: number;
  rechime_sec: number;
};

/** The config row, field for field — or the defaults when there is none. */
export function shapeKdsThresholds(row: KdsConfigRow | null | undefined): KdsThresholds {
  if (!row) return DEFAULT_KDS_THRESHOLDS;
  return {
    dineinAmberMin: row.dinein_amber_min,
    dineinRedMin: row.dinein_red_min,
    pickupAmberMin: row.pickup_amber_min,
    pickupRedMin: row.pickup_red_min,
    rechimeSec: row.rechime_sec,
  };
}
