import { dollars, sizeLabel } from "./grocery-aisles";

/**
 * Codex on #363 (P2) — the line that tells two market rows apart on /staff/menu?shelf=market. The
 * catalog carries same-name, same-aisle rows (three "ThaNatKhar" in home-personal, two "Grandma"
 * 150g jars at $3.90), so a list that printed the name alone let staff 86 the wrong SKU. Brand, size
 * and price are what a person holding the jar compares; the barcode — `grocery_items`' primary key —
 * closes the line, so no two rows can ever print the same one. Display only: the price is the
 * catalog's, shown, never edited or charged here.
 */
export function shelfDetail(i: {
  brand: string | null;
  sizeQty: number | null;
  sizeUnit: string | null;
  priceCents: number;
  barcode: string;
}): string {
  const brand = i.brand?.trim() ? i.brand.trim() : null;
  return [brand, sizeLabel(i.sizeQty, i.sizeUnit), dollars(i.priceCents), i.barcode]
    .filter((p): p is string => p !== null && p !== "")
    .join(" · ");
}

/** The row's whole name — the shown name and its identifying line — for a control's accessible name
 *  and the live region, so what is announced names the SKU, not only the name two rows share. */
export function shelfWho(i: { nameEn: string; detail: string }): string {
  return i.detail ? `${i.nameEn} · ${i.detail}` : i.nameEn;
}
