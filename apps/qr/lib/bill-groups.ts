import type { CartItem } from "@mms/db";

/**
 * W21 → PD10 — the ONE destination grouping every basket surface speaks: the Order stage's editing
 * cards, the Bill's One Pass body, and the pay step's itemization all read this, so their section
 * labels and order cannot drift. Moved here from `Checkout.tsx` when the Bill's rows moved into the
 * pass (`LivePass`): two components, one list. Headings render only when a basket really spans two
 * or more destinations.
 */
export const BILL_GROUPS: ReadonlyArray<readonly [label: string, key: CartItem["fulfillment"]]> = [
  ["At your table", "dinein"],
  ["To-go", "togo"],
  ["Grocery", "grocery"],
];

/** The section order the editing cards draw in — where focus looks for a removed dish's neighbour. */
export const BILL_GROUP_KEYS: CartItem["fulfillment"][] = BILL_GROUPS.map(([, k]) => k);
