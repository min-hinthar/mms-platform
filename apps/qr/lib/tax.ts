import type { TaxCategory } from "@mms/db";

// TS mirror of mms_taxable / mms_line_tax (packages/db migration). Keep in sync.
// CA CDTFA Reg 1603 / 80-80: hot & prepared always taxable; cold food taxable only dine-in;
// retail non-food always taxable; grocery staples exempt.
// Amounts are integer CENTS (parity with the SQL engine + the delivery schema).
const RATE = 0.0975; // Covina combined; single source — update here and in SQL together.

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
export function lineTax(amountCents: number, category: TaxCategory, dineIn: boolean): number {
  return isTaxable(category, dineIn) ? Math.round(amountCents * RATE) : 0;
}

export const taxRate = () => RATE;
