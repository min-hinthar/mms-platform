import { describe, expect, it } from "vitest";
import { lineTax } from "./tax";
import { CUSTOM_ITEM_PREFIX, customItemLine, isCustomItemId } from "./custom-item";

/**
 * A custom item's line, decided once (owner, 2026-10-24). Each rule is a value here and a
 * `custom-item/*` mutant in verify:slice.
 */
const base = { addKey: "k-1", name: "Birthday cake", priceCents: 2400, dineIn: true };

describe("customItemLine", () => {
  it("its id is custom:<add key> — never a catalog uuid, and unique per add (`custom-item/id-shared`)", () => {
    expect(customItemLine(base).menuItemId).toBe("custom:k-1");
    expect(customItemLine({ ...base, addKey: "k-2" }).menuItemId).not.toBe(
      customItemLine(base).menuItemId,
    );
    expect(isCustomItemId(customItemLine(base).menuItemId)).toBe(true);
    expect(isCustomItemId("3f0c1d2e-0000-4000-8000-000000000000")).toBe(false);
    expect(CUSTOM_ITEM_PREFIX).toBe("custom:");
  });

  it("taxes as hot_prepared — the SQL's own fallback for an unstamped line (`custom-item/tax-category`)", () => {
    // A price where hot_prepared and cold_food part ways to-go (cold food is exempt to-go).
    const togo = customItemLine({ ...base, dineIn: false });
    expect(togo.taxCents).toBe(lineTax(2400, "hot_prepared", false));
    expect(togo.taxCents).not.toBe(lineTax(2400, "cold_food", false));
    expect(customItemLine(base).taxCents).toBe(lineTax(2400, "hot_prepared", true));
  });

  it("the price is the typed price, the fulfillment follows the session, nothing is optioned", () => {
    const l = customItemLine(base);
    expect(l.unitPriceCents).toBe(2400);
    expect(l.fulfillment).toBe("dinein");
    expect(customItemLine({ ...base, dineIn: false }).fulfillment).toBe("togo");
    expect(l.opts).toEqual([]);
    expect(l.optionIds).toEqual([]);
  });

  it("the name and note are trimmed with whitespace collapsed; a blank note is none", () => {
    const l = customItemLine({ ...base, name: "  Corkage \n fee ", notes: "  " });
    expect(l.name).toBe("Corkage fee");
    expect(l.notes).toBeUndefined();
    expect(customItemLine({ ...base, notes: " no nuts " }).notes).toBe("no nuts");
  });
});
