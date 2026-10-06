import type { KdsThresholds, KitchenChannel, KitchenTicket } from "./kitchen-types";

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

/** A ticket's lateness: calm, aging, or late (the strip's three colours). */
export type KdsLevel = "ok" | "amber" | "red";

/**
 * How late a ticket is, by its channel's pair: dine-in ages on the dine-in thresholds, pickup AND
 * scan-and-go on the pickup ones (that customer is at the counter). Both edges are inclusive — a
 * ticket exactly 12:00 old is red.
 */
export function kdsUrgency(channel: KitchenChannel, ageMs: number, th: KdsThresholds): KdsLevel {
  const amber = channel === "dinein" ? th.dineinAmberMin : th.pickupAmberMin;
  const red = channel === "dinein" ? th.dineinRedMin : th.pickupRedMin;
  const min = ageMs / 60_000;
  if (min >= red) return "red";
  if (min >= amber) return "amber";
  return "ok";
}

/**
 * Phase 3d — a TICKET's level. A held card has not been handed to the kitchen yet, so it is never
 * late — not even on a frozen board whose last snapshot still says held after its slot passed.
 * Lifted out of `TicketCard`, so the glance strip's Late and every badge read ONE rule.
 */
export function kdsTicketLevel(
  t: Pick<KitchenTicket, "held" | "channel" | "firedAt">,
  nowMs: number,
  th: KdsThresholds,
): KdsLevel {
  return t.held ? "ok" : kdsUrgency(t.channel, nowMs - Date.parse(t.firedAt), th);
}

/** Phase 3d — the glance strip's Late: exactly the tickets whose badge says Late. */
export function kdsLateCount(
  tickets: readonly Pick<KitchenTicket, "held" | "channel" | "firedAt">[],
  nowMs: number,
  th: KdsThresholds,
): number {
  let n = 0;
  for (const t of tickets) {
    if (kdsTicketLevel(t, nowMs, th) === "red") n += 1;
  }
  return n;
}

/** What a ticket's badge says BEFORE its channel: at most one dictionary key. */
export type KdsBadgeLead = "kds.held" | "kds.stat.late";

/**
 * Phase 3d — the badge's lead word. "Later" on a held card (K15-HIGH: a held card read as live is
 * food cooked an hour early); "Late" on a red one, because under reduced motion the red strip's
 * pulse stops and its HUE was then the only thing telling it from amber (WCAG 1.4.1). Amber says
 * nothing — its clock already does.
 */
export function kdsBadgeKeys(held: boolean, level: KdsLevel): readonly KdsBadgeLead[] {
  if (held) return ["kds.held"];
  return level === "red" ? ["kds.stat.late"] : [];
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
