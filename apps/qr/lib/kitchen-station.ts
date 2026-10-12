import type { KitchenStation } from "./kitchen-types";

/**
 * W3d station tags: menu category slug → coarse station chip. A missing or unknown category cooks on
 * the wok (the default line). Client-side filter only — a second physical screen is config, not
 * schema. Moved out of `lib/kitchen.ts` (a `"use server"` module, which may export only actions) for
 * M270 (1): the live tickets AND the stop cards derive a dish's station through this ONE rule, so a
 * station's view never shows a stop card for a dish it would not have shown as a ticket.
 */
const STATION_BY_CATEGORY: Readonly<Record<string, KitchenStation>> = {
  drinks: "drinks",
  "appetizers-salads": "cold",
};

/** The station a dish cooks on, from its menu category's slug (none or unknown: the wok). */
export function stationForCategory(slug: string | null | undefined): KitchenStation {
  return (slug && STATION_BY_CATEGORY[slug]) || "wok";
}
