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

// W5c: a priced line can span more than one tax category — a hot add-on (e.g. Mohinga Soup) on a
// COLD salad is taxable to-go even though the salad isn't. `priceItem` returns the line as parts (base
// at the item's category + each add-on delta at its OWN category, null → inherit the parent), and this
// sums the tax per part. Same-category parts collapse into one bucket first, so a line with no
// cross-category add-on rounds EXACTLY as the old single `lineTax(unitPrice, category)` did.
export type TaxPart = { cents: number; category: TaxCategory };
export function sumLineTax(parts: TaxPart[], dineIn: boolean): number {
  const byCategory = new Map<TaxCategory, number>();
  for (const p of parts) byCategory.set(p.category, (byCategory.get(p.category) ?? 0) + p.cents);
  let tax = 0;
  for (const [category, cents] of byCategory) tax += lineTax(cents, category, dineIn);
  return tax;
}

export const taxRate = () => RATE;
