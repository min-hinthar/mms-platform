import { PULSE_PASS_LINGER_MS } from "./board-pulse";
import { trackStage, type KitchenStage } from "./kitchen-track";
import type { PaidKitchenLine } from "./floor-types";

/**
 * The lifecycle audit (2026-10-13) — a table that PAID a round while its food was still cooking.
 *
 * The settle gate refuses only UNSENT dishes, so a table pays with its mains on the wok. The floor
 * card kept folding that paid cart ("Paid · 2 in kitchen", then "1 ready to serve"), but the page the
 * card opens showed only the settled record — names, quantities, prices, no stage — and once a guest
 * added a tea and a new round opened, the cooking mains appeared nowhere on it. Card and drill-down
 * disagreed about one table, and the server opening it to see "which dish?" could not.
 *
 * Which dishes the group draws: every paid-round dish on the ONE kitchen track (`trackStage`) that is
 * still Sending, Sent or Cooking — or Served within the wall's linger (`PULSE_PASS_LINGER_MS`, the
 * window the floor card calls "ready to serve"), so the dish the card just announced is the one the
 * page names. A voided or grocery line is off the track; a dish served long ago is history (the record
 * above it already lists it). Pure: no I/O; the clock is the read's.
 */

/** A paid cart line as the table page reads it. */
export type PaidKitchenRow = {
  id: string;
  name: string;
  qty: number;
  state: string;
  fire_at: string | null;
  bumped_at: string | null;
  fulfillment: string | null;
  notes: string | null;
  modifiers: unknown;
};

const SHOWN: ReadonlySet<KitchenStage> = new Set<KitchenStage>(["sending", "sent", "cooking"]);

export function paidRoundKitchen(
  rows: readonly PaidKitchenRow[],
  nowIso: string,
  lingerMs: number = PULSE_PASS_LINGER_MS,
): PaidKitchenLine[] {
  const now = Date.parse(nowIso);
  const out: PaidKitchenLine[] = [];
  for (const r of rows) {
    const stage = trackStage(
      { state: r.state, fire_at: r.fire_at, bumped_at: r.bumped_at, fulfillment: r.fulfillment },
      nowIso,
    );
    if (stage === null) continue;
    if (!SHOWN.has(stage)) {
      // Served (settled): drawn only while the floor card still calls it "ready to serve".
      const bumped = r.bumped_at === null ? Number.NaN : Date.parse(r.bumped_at);
      if (stage !== "served" || !(now - bumped < lingerMs)) continue;
    }
    out.push({
      id: r.id,
      name: r.name,
      qty: r.qty,
      stage,
      notes: r.notes ?? null,
      modifiers: Array.isArray(r.modifiers) ? (r.modifiers as string[]) : [],
      togo: r.fulfillment === "togo",
    });
  }
  return out;
}
