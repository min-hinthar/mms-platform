import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * W16a review MED — the MODE-PRICE SEAM must be un-revertible. `priceItem` is the ONE place a unit
 * price is minted (every add path: diner, staff, kiosk, reorder), and the review proved mechanically
 * that deleting its `modePriceCents(...)` wrapper left every gate green: mode-price.test.ts pins the
 * HELPER, nothing pinned the CALL. These tests run the REAL priceItem over a mocked catalog and pin
 * the factored integers (computed in Node, never transcribed):
 *   base 990 + option 110 = sum 1100 → dinein round25(1100×1.15) = 1275 · togo 1150 · grocery 1100
 *   base 990 alone → dinein 1150 · togo 1050
 * The sum rule is pinned by inequality: dinein(base+delta) = 1275 ≠ dinein(base)+delta = 1260 — a
 * factor applied to the base alone (delta added after) cannot pass.
 */

vi.mock("server-only", () => ({}));

const ITEM = {
  id: "33333333-3333-4333-8333-333333333333",
  name_en: "Mohinga",
  base_price_cents: 990,
  tax_category: "hot_prepared",
  item_modifier_groups: [{ modifier_groups: { id: "g1", min_select: 0, max_select: 2 } }],
};
const OPTS = [{ id: "opt-egg", name: "Extra egg", price_delta_cents: 110, group_id: "g1" }];

vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (table: string) => {
      const single = () => Promise.resolve({ data: table === "menu_items" ? ITEM : null, error: null });
      const chain = {
        select: () => chain,
        eq: () => chain,
        in: () => Promise.resolve({ data: table === "modifier_options" ? OPTS : [], error: null }),
        single,
      };
      return chain;
    },
  }),
}));

const { priceItem } = await import("./order-lines");

beforeEach(() => {});

describe("priceItem — the W16a mode-price seam (factor over the SUM, round 25¢)", () => {
  it("dine-in prices the base+delta SUM at ×1.15 round25 (990+110 → 1275)", async () => {
    const p = await priceItem(ITEM.id, ["opt-egg"], { fulfillment: "dinein" });
    expect(p.unitPriceCents).toBe(1275);
    // The factor rides the SUM, not the base: base-alone dinein (1150) + raw delta (110) = 1260 ≠ 1275.
    const baseOnly = await priceItem(ITEM.id, [], { fulfillment: "dinein" });
    expect(baseOnly.unitPriceCents).toBe(1150);
    expect(p.unitPriceCents).not.toBe(baseOnly.unitPriceCents + 110);
    // And it is never the raw sum (the seam-deleted mutant's answer).
    expect(p.unitPriceCents).not.toBe(1100);
  });

  it("to-go prices the sum at ×1.05 round25 (990+110 → 1150; base alone → 1050)", async () => {
    const p = await priceItem(ITEM.id, ["opt-egg"], { fulfillment: "togo" });
    expect(p.unitPriceCents).toBe(1150);
    const baseOnly = await priceItem(ITEM.id, [], { fulfillment: "togo" });
    expect(baseOnly.unitPriceCents).toBe(1050);
  });

  it("grocery is exempt — the shelf sum IS the price (1100)", async () => {
    const p = await priceItem(ITEM.id, ["opt-egg"], { fulfillment: "grocery" });
    expect(p.unitPriceCents).toBe(1100);
  });

  it("an omitted fulfillment defaults to togo — no caller can mint an unfactored price by omission", async () => {
    const p = await priceItem(ITEM.id, ["opt-egg"]);
    expect(p.unitPriceCents).toBe(1150);
  });
});
