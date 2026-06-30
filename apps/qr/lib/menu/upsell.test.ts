import { describe, expect, it } from "vitest";
import { goesWellWith, type UpsellItem } from "@/lib/menu/upsell";

/**
 * "Goes well with" unit tests (R6b). The pairing map must only ever surface REAL, in-stock items — never the
 * current item, never sold-out, never a duplicate, never a fabricated suggestion.
 */

const mk = (id: string, category: string, opts: Partial<UpsellItem> = {}): UpsellItem => ({
  id,
  category,
  tags: opts.tags ?? [],
  is_sold_out: opts.is_sold_out ?? false,
});

const curry = mk("c1", "Curries");
const catalog: UpsellItem[] = [
  curry,
  mk("r1", "Rice & Noodles"),
  mk("r2", "Rice & Noodles"),
  mk("s1", "Sides"),
  mk("d1", "Drinks", { tags: ["popular"] }),
];

describe("goesWellWith", () => {
  it("suggests paired categories for the current item (curry → rice/side …)", () => {
    const picks = goesWellWith(curry, catalog).map((i) => i.id);
    expect(picks).toContain("r1");
    expect(picks.length).toBeLessThanOrEqual(3);
  });
  it("never includes the current item", () => {
    expect(goesWellWith(curry, catalog).some((i) => i.id === "c1")).toBe(false);
  });
  it("never includes sold-out items", () => {
    const withSoldOut = [curry, mk("r1", "Rice & Noodles", { is_sold_out: true }), mk("s1", "Sides")];
    expect(goesWellWith(curry, withSoldOut).some((i) => i.id === "r1")).toBe(false);
  });
  it("returns no duplicates", () => {
    const ids = goesWellWith(curry, catalog).map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("respects the limit", () => {
    const big = [curry, ...Array.from({ length: 8 }, (_, i) => mk(`r${i}`, "Rice & Noodles"))];
    expect(goesWellWith(curry, big, 3)).toHaveLength(3);
  });
  it("falls back to other-category items when no rule matches", () => {
    const odd = mk("x1", "Mystery");
    const picks = goesWellWith(odd, [odd, mk("y1", "Specials"), mk("y2", "Specials")]);
    expect(picks.length).toBeGreaterThan(0);
    expect(picks.every((i) => i.id !== "x1")).toBe(true);
  });
  it("is empty when the only other items are the current one / sold-out", () => {
    expect(goesWellWith(curry, [curry, mk("c2", "Curries", { is_sold_out: true })])).toEqual([]);
  });
});
