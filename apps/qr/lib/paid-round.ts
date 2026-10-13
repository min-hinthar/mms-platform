import { PULSE_PASS_LINGER_MS } from "./board-pulse";
import { trackStage, type KitchenStage } from "./kitchen-track";
import type { PaidKitchenLine } from "./floor-types";
import { plural } from "./i18n/fill";

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
  /** #360 (CRITICAL 1) — the line's cart was refunded IN FULL (`refundedCarts`): drawn, tagged. */
  refunded?: boolean;
};

/** The paid rounds' kitchen lines a table page reads (a table's paid food still on the wok or just
 *  out: a handful). Past it the read keeps the NEWEST and the page says so (#360, CRITICAL 3). */
export const PAID_KITCHEN_CAP = 100;

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
      ...(r.refunded === true ? { refunded: true as const } : {}),
    });
  }
  return out;
}

/**
 * #360 (the blind pass, CRITICAL 2) — what the group SAYS under a cap, with only a number that is
 * true. Two reads can stop short, and each gets its own sentence:
 *
 *   · the DISH read hit `PAID_KITCHEN_CAP` — the count is the dishes DRAWN (`shown`), never the cap:
 *     most of a long night's capped read is dishes served long ago, which the group does not draw,
 *     so "Showing the latest 100 dishes" stood over two of them. The read is newest first, so the
 *     dishes drawn ARE the latest ones on the track, and anything older is past what was read;
 *   · only the ROUND read hit its cap (the session's settled rounds past `PAID_ROUND_ORDER_CAP`,
 *     `lib/floor.ts`) — older rounds were not read; how many dishes they hold is unknown, so the
 *     sentence names no number.
 *
 * Both: the dish sentence alone, which already says older ones are not here. Neither: no note.
 */
export type PaidRoundCapNote = {
  key:
    | "table.detail.paidKitchen.capped.one"
    | "table.detail.paidKitchen.capped.many"
    | "table.detail.paidKitchen.olderRounds";
  vars?: { n: number };
};

export function paidRoundCapNote(
  shown: number,
  dishesCapped: boolean,
  roundsCapped: boolean,
): PaidRoundCapNote | null {
  if (dishesCapped)
    return {
      key: plural(
        shown,
        "table.detail.paidKitchen.capped.one",
        "table.detail.paidKitchen.capped.many",
      ),
      vars: { n: shown },
    };
  if (roundsCapped) return { key: "table.detail.paidKitchen.olderRounds" };
  return null;
}
