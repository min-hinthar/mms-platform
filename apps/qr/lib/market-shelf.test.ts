import { describe, expect, it } from "vitest";
import { shelfDetail } from "./market-shelf";

/**
 * Codex on #363 (P2) — the market list's identifying line. Same-name, same-aisle rows exist in the
 * catalog (measured from `supabase/data/grocery_catalog.json`: four such groups, one of which —
 * two "Grandma" 150g at $3.90 — differs ONLY by barcode), so the line ends in the barcode, the
 * table's primary key: two rows can never print the same line.
 */
describe("shelfDetail", () => {
  it("brand · size · price · barcode", () => {
    expect(
      shelfDetail({
        brand: "Grandma",
        sizeQty: 150,
        sizeUnit: "g",
        priceCents: 390,
        barcode: "2990190809102",
      }),
    ).toBe("Grandma · 150g · $3.90 · 2990190809102");
  });
  it("rows identical but for the barcode print different lines", () => {
    const base = { brand: "Grandma", sizeQty: 150, sizeUnit: "g", priceCents: 390 };
    expect(shelfDetail({ ...base, barcode: "2990190809102" })).not.toBe(
      shelfDetail({ ...base, barcode: "2990190809133" }),
    );
  });
  it("a missing brand or size is left out, never printed as a blank", () => {
    expect(
      shelfDetail({
        brand: "  ",
        sizeQty: null,
        sizeUnit: null,
        priceCents: 336,
        barcode: "29901603",
      }),
    ).toBe("$3.36 · 29901603");
  });
});
