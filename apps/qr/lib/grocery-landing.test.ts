import { describe, expect, it } from "vitest";
import {
  GROCERY_DEFAULT_DOOR,
  aisleSlugFromHash,
  groceryLanding,
  parseDoor,
} from "./grocery-landing";

/**
 * Phase 1c — the landing ladder. Each MUTATION line names the edit that turns its case red; every
 * one was induced against the module and watched fail before this shipped.
 */
describe("groceryLanding — first match wins", () => {
  it("an explicit ?tab link outranks the stored tap and the hash", () => {
    // MUTATION: evaluate `stored` before `tabParam` → browse/chosen; red.
    expect(
      groceryLanding({ tabParam: "scan", stored: "browse", aisleHash: "#aisle-tea-laphet" }),
    ).toEqual({ door: "scan", reason: "link" });
  });

  it("the visit's stored tap outranks an aisle hash (a reload on Scan stays on Scan)", () => {
    // MUTATION: test the hash before `stored` → browse/aisle-link; red.
    expect(groceryLanding({ tabParam: null, stored: "scan", aisleHash: "#aisle-cooking" })).toEqual(
      { door: "scan", reason: "chosen" },
    );
  });

  it("a corrupted stored value is ignored, and the aisle hash opens Browse", () => {
    // MUTATION: honour any non-null `stored` → door "bogus"; red.
    expect(
      groceryLanding({ tabParam: null, stored: "bogus", aisleHash: "#aisle-cooking" }),
    ).toEqual({ door: "browse", reason: "aisle-link" });
  });

  it("an unknown ?tab value falls through to the default", () => {
    expect(groceryLanding({ tabParam: "camera", stored: null, aisleHash: null })).toEqual({
      door: GROCERY_DEFAULT_DOOR,
      reason: "default",
    });
  });

  it("nothing at all → Browse by default, and a scan default is reachable (the switch-on arm)", () => {
    expect(GROCERY_DEFAULT_DOOR).toBe("browse");
    expect(groceryLanding({ tabParam: null, stored: null, aisleHash: null })).toEqual({
      door: "browse",
      reason: "default",
    });
    // MUTATION: hardcode "browse" in the last arm → browse/default; red.
    expect(groceryLanding({ tabParam: null, stored: null, aisleHash: null }, "scan")).toEqual({
      door: "scan",
      reason: "default",
    });
  });
});

describe("parseDoor / aisleSlugFromHash — syntax only", () => {
  it("parseDoor admits exactly the two doors", () => {
    expect(parseDoor("scan")).toBe("scan");
    expect(parseDoor("browse")).toBe("browse");
    expect(parseDoor("Scan")).toBeNull();
    expect(parseDoor("")).toBeNull();
    expect(parseDoor(null)).toBeNull();
  });

  it("aisleSlugFromHash reads a well-formed aisle hash and nothing else", () => {
    expect(aisleSlugFromHash("#aisle-cooking")).toBe("cooking");
    expect(aisleSlugFromHash("#aisle-tea-laphet")).toBe("tea-laphet");
    // The bare prefix, a shouted prefix and a checkout hash are not ours.
    expect(aisleSlugFromHash("#aisle-")).toBeNull();
    expect(aisleSlugFromHash("#AISLE-x")).toBeNull();
    expect(aisleSlugFromHash("#bill")).toBeNull();
    expect(aisleSlugFromHash("aisle-cooking")).toBeNull();
    expect(aisleSlugFromHash(null)).toBeNull();
  });
});
