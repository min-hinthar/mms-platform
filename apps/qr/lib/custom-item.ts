import type { PricedLine } from "./order-lines";
import { lineTax } from "./tax";

/**
 * A CUSTOM item on a table's order (owner, 2026-10-24: "manual new item add to tables orders") — a
 * dish or charge that is not on the menu (a special, a corkage, a birthday cake brought in), typed by
 * a manager with its own name and price.
 *
 * WHY IT NEEDS NO CATALOG ROW. Every amount downstream reads the LINE's snapshot — `getCartTotals`
 * sums `unit_price_cents` + `tax_cents`, and every fulfill RPC copies the line into `qr_order_items`
 * verbatim — so a line with no menu row prices, settles and receipts exactly like a menu line. The
 * line is decided here, once:
 *
 *   · `menuItemId` is `custom:<add key>` — never a uuid (so no catalog read, no 86 control on the
 *     ticket, and the insert's M17 stamp reads no category), and UNIQUE per add (so `insertOrIncLine`
 *     never folds one custom item into another: its merge key is the item id).
 *   · the tax is `hot_prepared`'s — the category the SQL already falls back to for a line with no
 *     stamp (`coalesce(v_cat, 'hot_prepared')`), so the TS and SQL halves agree with no new rule.
 *   · the name is the manager's text, trimmed with inner whitespace collapsed; the bounds (name
 *     1–60, $0.25–$5,000, qty 1–9) are the schema's and the columns'.
 *
 * PURE: falsified by values in `custom-item.test.ts` and by `custom-item/*` mutants.
 */
export const CUSTOM_ITEM_PREFIX = "custom:";

/** Whether a line's item id is a custom item's — the KDS, the receipt and the pad read it so. */
export function isCustomItemId(menuItemId: string): boolean {
  return menuItemId.startsWith(CUSTOM_ITEM_PREFIX);
}

export function customItemLine(input: {
  addKey: string;
  name: string;
  priceCents: number;
  dineIn: boolean;
  notes?: string;
}): PricedLine {
  const name = input.name.replace(/\s+/g, " ").trim();
  return {
    menuItemId: `${CUSTOM_ITEM_PREFIX}${input.addKey}`,
    name,
    opts: [],
    optionIds: [],
    unitPriceCents: input.priceCents,
    taxCents: lineTax(input.priceCents, "hot_prepared", input.dineIn),
    fulfillment: input.dineIn ? "dinein" : "togo",
    notes: input.notes?.trim() ? input.notes.trim() : undefined,
  };
}
