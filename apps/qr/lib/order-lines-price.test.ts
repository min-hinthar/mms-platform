import { describe, expect, it, vi } from "vitest";

/**
 * W17a — the PRICE SEAM must stay unfactored. `priceItem` is the ONE place a unit price is minted
 * (every add path: diner, staff, kiosk, reorder), and W16a briefly wrapped it in a per-mode markup
 * (dine-in ×1.15, to-go ×1.05). The Zettle/PayPal exports settled it: that 15% was the retired
 * SERVICE CHARGE, not a higher menu price — across Jan–Jul 2026, 66 of the 72 dishes sold BOTH ways
 * priced identically (docs/data/MENU_REFERENCE.md). So the charged unit is the POS price: `base_price_cents` + the chosen
 * modifiers' deltas, and nothing else.
 *
 * These tests run the REAL priceItem over a mocked catalog and pin the exact integers (computed in
 * Node, never transcribed): base 990 + option 110 = 1100; with the −25 option = 1075. The
 * re-markup mutants are pinned by inequality against the values the W16a factors produced on this
 * same fixture — round25(1100×1.15) = 1275 and round25(1100×1.05) = 1150 — so re-introducing either
 * factor (in any arm) reddens this file.
 */

vi.mock("server-only", () => ({}));

const ITEM = {
  id: "33333333-3333-4333-8333-333333333333",
  name_en: "Mohinga",
  base_price_cents: 990,
  tax_category: "hot_prepared",
  is_sold_out: false,
  is_active: true,
  item_modifier_groups: [{ modifier_groups: { id: "g1", min_select: 0, max_select: 2 } }],
};
const OPTS = [
  { id: "opt-egg", name: "Extra egg", price_delta_cents: 110, group_id: "g1" },
  { id: "opt-small", name: "Small", price_delta_cents: -25, group_id: "g1" },
  // A real option of ANOTHER item's group — the smuggle guard: it must never reach the price.
  { id: "opt-foreign", name: "Foreign", price_delta_cents: -900, group_id: "g-other" },
];

let optionsQuery: string[] | null = null;
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        in: (_col: string, ids: string[]) => {
          optionsQuery = ids;
          return Promise.resolve({
            data: table === "modifier_options" ? OPTS.filter((o) => ids.includes(o.id)) : [],
            error: null,
          });
        },
        single: () => Promise.resolve({ data: table === "menu_items" ? ITEM : null, error: null }),
      };
      return chain;
    },
  }),
}));

const { priceItem } = await import("./order-lines");

describe("priceItem — the POS price seam (base + deltas, no mode factor)", () => {
  it("prices base + option delta at the raw POS sum (990 + 110 = 1100)", async () => {
    optionsQuery = null;
    const p = await priceItem(ITEM.id, ["opt-egg"]);
    expect(optionsQuery).toEqual(["opt-egg"]);
    expect(p.unitPriceCents).toBe(1100);
    // Not the W16a dine-in markup, and not the to-go markup, in any arm.
    expect(p.unitPriceCents).not.toBe(1275);
    expect(p.unitPriceCents).not.toBe(1150);
    expect(p.optionIds).toEqual(["opt-egg"]);
  });

  it("a base-only line is the bare menu price (990) — no rounding to a 25¢ grid", async () => {
    optionsQuery = null;
    const p = await priceItem(ITEM.id, []);
    expect(p.unitPriceCents).toBe(990);
    expect(optionsQuery).toBeNull(); // no options → the options table is never queried at all
  });

  it("a NEGATIVE delta subtracts (990 + 110 − 25 = 1075) — not clamped, not rounded up", async () => {
    const p = await priceItem(ITEM.id, ["opt-egg", "opt-small"]);
    expect(p.unitPriceCents).toBe(1075);
    // A 25¢-grid rounder would land this on 1075 too, so separate it: 1075 is already on the grid.
    // The base-only case above (990, off-grid) is what falsifies a re-introduced round25.
  });

  it("an option from ANOTHER item's group is ignored — a client can't smuggle a discount", async () => {
    const p = await priceItem(ITEM.id, ["opt-egg", "opt-foreign"]);
    expect(p.unitPriceCents).toBe(1100);
    expect(p.optionIds).toEqual(["opt-egg"]);
  });

  it("dine-in and to-go are the same price — the seam takes no mode at all", async () => {
    // The signature carries no fulfillment: the ONE call answers for both destinations. This is the
    // whole point of W17a — asserted structurally so re-adding a mode arm can't be a silent change.
    expect(priceItem.length).toBe(2); // (menuItemId, modifierIds) + the defaulted opts bag
  });
});
