import type { TaxCategory } from "@mms/db";

// TS mirror of mms_taxable / mms_line_tax (packages/db migration). Keep in sync.
// CA CDTFA Reg 1603 / 80-80: hot & prepared always taxable; cold food taxable only dine-in;
// retail non-food always taxable; grocery staples exempt.
// Amounts are integer CENTS (parity with the SQL engine + the delivery schema).
const RATE = 0.105; // L.A combined (owner-confirmed, W16a — closes C13); update here and in SQL together.

export function isTaxable(category: TaxCategory, dineIn: boolean): boolean {
  switch (category) {
    case "hot_prepared":
    case "beverage_hot":
    case "retail_nonfood":
      return true;
    case "cold_food":
    case "beverage_cold":
      return dineIn;
    case "grocery_food":
      return false;
    default:
      return true; // safe default
  }
}

// amountCents → taxCents (integer), rounded to the nearest cent.
//
// ⚠️ Tax is SINGLE-CATEGORY PER LINE by architecture: `getCartTotals` (the charge authority) reads
// each cart line's stored `tax_cents` only as a BOOLEAN taxable-or-not flag and taxes the FULL
// `unit_price_cents` — it has no per-line taxable-base breakdown, and the SQL fulfillment-toggle
// recompute (`mms_set_line_fulfillment`) can't reconstruct one (modifiers fold into `unit_price_cents`
// at insert; only their labels persist). So a modifier's price delta inherits its PARENT line's tax
// category. Known limitation: a HOT add-on on a COLD to-go parent (Mohinga Soup on a to-go salad) rides
// the parent's exemption and is under-taxed — see docs/OPEN-ITEMS.md C11; the correct fix is a per-line
// taxable-base engine change (own milestone), not a line-storage tweak (which would only mislead the
// boolean authority — the W5c pre-merge attempt did exactly that and OVER-charged the whole line).
export function lineTax(amountCents: number, category: TaxCategory, dineIn: boolean): number {
  return isTaxable(category, dineIn) ? Math.round(amountCents * RATE) : 0;
}

export const taxRate = () => RATE;
