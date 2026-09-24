import { describe, expect, it } from "vitest";
import {
  AISLES,
  AISLE_PREVIEW,
  aislePreview,
  dollars,
  saleInfo,
  sizeLabel,
  stockedAisles,
  unitPriceLabel,
} from "./grocery-aisles";

/**
 * Phase 1c — the market home's shelves. Expected counts are COMPUTED from the fixture arrays, never
 * typed. Each MUTATION was induced and watched go red.
 */

type Row = { name: string; featured: boolean; category: string | null };
const row = (name: string, featured = false, category: string | null = "cooking"): Row => ({
  name,
  featured,
  category,
});

describe("aislePreview — one shelf of six, in catalog order", () => {
  it("exactly the preview size shows no See all; one more does", () => {
    const six = Array.from({ length: AISLE_PREVIEW }, (_, i) => row(`item ${i}`));
    const seven = [...six, row("item 6")];
    expect(aislePreview(six).more).toBe(false);
    // MUTATION: `>=` → exactly six offers "See all 6" onto the same six; red.
    expect(aislePreview(seven).more).toBe(true);
    expect(aislePreview(seven).total).toBe(seven.length);
  });

  it("caps what is shown at n", () => {
    const ten = Array.from({ length: 10 }, (_, i) => row(`item ${i}`));
    expect(aislePreview(ten).shown).toHaveLength(AISLE_PREVIEW);
    expect(aislePreview(ten, 3).shown).toHaveLength(3);
    expect(aislePreview(ten.slice(0, 2)).shown).toHaveLength(2);
  });

  it("keeps the input order even when a featured item sits seventh", () => {
    const items = [
      row("Anchovy"),
      row("Basil"),
      row("Chili"),
      row("Dal"),
      row("Egg noodles"),
      row("Fish sauce"),
      row("Garlic oil", true),
    ];
    // MUTATION: sort featured-first → the unreviewed seed (G19) leads the shelf; red.
    expect(aislePreview(items).shown.map((r) => r.name)).toEqual(
      items.slice(0, AISLE_PREVIEW).map((r) => r.name),
    );
  });

  it("the preview size is six (spelled out: the cases above read it symbolically)", () => {
    expect(AISLE_PREVIEW).toBe(6);
  });
});

describe("stockedAisles — merchandising order, counts measured", () => {
  it("omits an empty aisle and keeps AISLES order even when counts run the other way", () => {
    const first = AISLES[0]!.slug;
    const second = AISLES[1]!.slug;
    const last = AISLES[AISLES.length - 1]!.slug;
    // Counts deliberately INVERTED against merchandising order: the last aisle is the fullest.
    const catalog = [
      row("a", false, first),
      row("b", false, second),
      row("c", false, second),
      row("d", false, last),
      row("e", false, last),
      row("f", false, last),
      row("orphan", false, null),
    ];
    const got = stockedAisles(catalog);
    // MUTATION: sort by count → the last aisle leads; red.
    expect(got.map((s) => s.aisle.slug)).toEqual([first, second, last]);
    expect(got.map((s) => s.count)).toEqual(
      [first, second, last].map((slug) => catalog.filter((r) => r.category === slug).length),
    );
  });

  it("an empty catalog stocks nothing", () => {
    expect(stockedAisles([])).toEqual([]);
  });
});

describe("the display helpers this module already shipped (first suite for the module)", () => {
  it("sizeLabel / dollars", () => {
    expect(sizeLabel(400, "g")).toBe("400g");
    expect(sizeLabel(null, "g")).toBeNull();
    expect(dollars(1299)).toBe("$12.99");
  });

  it("saleInfo refuses a sub-1% or inverted compare-at", () => {
    expect(saleInfo(900, 1000)).toEqual({ compareAtCents: 1000, saveCents: 100, pct: 10 });
    expect(saleInfo(1000, 1000)).toBeNull();
    expect(saleInfo(1000, 1004)).toBeNull();
    expect(saleInfo(1000, null)).toBeNull();
  });

  it("unitPriceLabel is null-honest", () => {
    expect(unitPriceLabel(500, 250, "g")).toBe("$2.00/100g");
    expect(unitPriceLabel(600, 3, "ct")).toBe("$2.00/ct");
    expect(unitPriceLabel(600, null, "ct")).toBeNull();
    expect(unitPriceLabel(600, 3, "box")).toBeNull();
  });
});
