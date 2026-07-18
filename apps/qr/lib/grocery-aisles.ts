import type { IconName } from "@mms/ui";

/**
 * W4b — the shopper-facing aisle registry. Slugs match the `grocery_items.category` CHECK
 * (migration 20260717000000) and the import artifact (supabase/data/grocery_catalog.json), which
 * folds the ~40 wholesale price-list categories into these ten aisles. Bilingual by design — the
 * Myanmar name renders beside the English on every chip (W5 makes the pair toggleable app-wide).
 * Order = merchandising order (signature Burmese aisles first), not alphabetical.
 */
export type Aisle = { slug: string; en: string; my: string; icon: IconName };

export const AISLES: Aisle[] = [
  { slug: "tea-laphet", en: "Tea Leaf & Laphet", my: "လက်ဖက်", icon: "cat-leaf" },
  {
    slug: "noodles-mohinga",
    en: "Noodles & Mohinga",
    my: "ခေါက်ဆွဲ / မုန့်ဟင်းခါး",
    icon: "cat-noodles",
  },
  { slug: "canned-fish", en: "Canned Fish & Meat", my: "ငါးဗူး / အသားဗူး", icon: "cat-fish" },
  { slug: "cooking", en: "Cooking Essentials", my: "ချက်ပြုတ်ရန်", icon: "cat-pot" },
  { slug: "snacks-sweets", en: "Snacks & Sweets", my: "မုန့်နှင့် သရေစာ", icon: "cat-candy" },
  {
    slug: "preserved-fruit",
    en: "Preserved Fruit & Pickles",
    my: "ယိုနှင့် အချဉ်",
    icon: "cat-fruit",
  },
  { slug: "canned-vegetables", en: "Canned Vegetables", my: "ဟင်းသီးဟင်းရွက်ဗူး", icon: "cat-jar" },
  { slug: "coffee-drinks", en: "Coffee & Drinks", my: "ကော်ဖီနှင့် ဖျော်ရည်", icon: "cat-drink" },
  { slug: "health", en: "Health & Nutrition", my: "ကျန်းမာရေး", icon: "cat-health" },
  { slug: "home-personal", en: "Home & Personal", my: "အိမ်သုံးပစ္စည်း", icon: "cat-home" },
];

export const aisleBySlug = new Map(AISLES.map((a) => [a.slug, a]));

/** Pack-size label ("400g") — grams stay grams (the catalog is metric); other units pass through. */
export function sizeLabel(qty: number | null, unit: string | null): string | null {
  if (!qty || !unit) return null;
  return `${qty}${unit}`;
}

/**
 * W4e sale math (display only). A row is "on sale" when the catalog carries a compare-at ABOVE the
 * charged price (the server + DB CHECK guarantee compare_at_cents > price_cents when present, but we
 * re-assert here so a bad row can never render a fake or negative discount). `compareAt` is a market
 * reference ("Compare at $X"), not a former price of ours.
 */
export type SaleInfo = { compareAtCents: number; saveCents: number; pct: number };
export function saleInfo(priceCents: number, compareAtCents: number | null): SaleInfo | null {
  if (compareAtCents == null || compareAtCents <= priceCents) return null;
  return {
    compareAtCents,
    saveCents: compareAtCents - priceCents,
    pct: Math.round((1 - priceCents / compareAtCents) * 100),
  };
}

export const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * Honest unit price for comparison shopping (W4a: "$/lb, $/oz on every card"). Metric sizes render
 * as $/100g|ml (the natural unit at these pack sizes); count packs as $/ct. Null when size is
 * unknown — never a fabricated rate.
 */
export function unitPriceLabel(
  priceCents: number,
  qty: number | null,
  unit: string | null,
): string | null {
  if (!qty || !unit || priceCents <= 0) return null;
  if (unit === "g" || unit === "ml") {
    const per100 = (priceCents / qty) * 100;
    return `$${(per100 / 100).toFixed(2)}/100${unit}`;
  }
  if (unit === "oz" || unit === "lb" || unit === "ct") {
    const per = priceCents / qty;
    return `$${(per / 100).toFixed(2)}/${unit}`;
  }
  return null;
}
