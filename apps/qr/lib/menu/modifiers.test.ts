import { describe, expect, it } from "vitest";
import {
  initialSelection,
  isSelectionValid,
  selectedIds,
  selectionDeltaCents,
  toggleOption,
  type ModGroup,
} from "@/lib/menu/modifiers";

/**
 * Modifier-selection unit tests (R6b). These pure helpers are the LAST client-side gate before a server add,
 * so the CTA must never enable on an under-min / over-max selection. (The charge is still server-authoritative
 * — `priceItem` — but a wrong client gate ships a confusing/invalid sheet.)
 */

const opt = (id: string, d = 0) => ({ id, name: id, priceDeltaCents: d });

const reqSingle: ModGroup = {
  id: "g-style",
  name: "Curry style",
  selectionType: "single",
  minSelect: 1,
  maxSelect: 1,
  options: [opt("mild"), opt("medium"), opt("hot")],
};
const optMulti: ModGroup = {
  id: "g-addons",
  name: "Add-ons",
  selectionType: "multiple",
  minSelect: 0,
  maxSelect: 2,
  options: [opt("brains", 200), opt("egg", 150), opt("extra", 100)],
};
const reqMulti: ModGroup = {
  id: "g-pick2",
  name: "Pick two",
  selectionType: "multiple",
  minSelect: 2,
  maxSelect: 2,
  options: [opt("a"), opt("b"), opt("c")],
};

describe("initialSelection", () => {
  it("pre-seeds a required single-select with its first option (opens valid)", () => {
    expect(initialSelection([reqSingle])).toEqual({ "g-style": ["mild"] });
  });
  it("leaves optional and required-multi groups empty (explicit choice)", () => {
    expect(initialSelection([optMulti, reqMulti])).toEqual({ "g-addons": [], "g-pick2": [] });
  });
});

describe("isSelectionValid", () => {
  it("required single is valid once seeded, invalid when emptied", () => {
    expect(isSelectionValid([reqSingle], { "g-style": ["mild"] })).toBe(true);
    expect(isSelectionValid([reqSingle], { "g-style": [] })).toBe(false);
  });
  it("required multi stays invalid until min, then valid, never over max", () => {
    expect(isSelectionValid([reqMulti], { "g-pick2": ["a"] })).toBe(false);
    expect(isSelectionValid([reqMulti], { "g-pick2": ["a", "b"] })).toBe(true);
    expect(isSelectionValid([reqMulti], { "g-pick2": ["a", "b", "c"] })).toBe(false);
  });
  it("optional group is always valid (0 ≤ n ≤ max)", () => {
    expect(isSelectionValid([optMulti], { "g-addons": [] })).toBe(true);
    expect(isSelectionValid([optMulti], { "g-addons": ["brains", "egg"] })).toBe(true);
  });
  it("a missing group key counts as zero selected", () => {
    expect(isSelectionValid([reqSingle], {})).toBe(false);
  });
});

describe("toggleOption", () => {
  it("single-select replaces the choice", () => {
    expect(toggleOption(reqSingle, ["mild"], "hot")).toEqual(["hot"]);
  });
  it("a required single-select can't be emptied by re-tapping the only choice", () => {
    expect(toggleOption(reqSingle, ["mild"], "mild")).toEqual(["mild"]);
  });
  it("an optional single-select clears on re-tap", () => {
    const optSingle: ModGroup = { ...reqSingle, id: "g-opt", minSelect: 0 };
    expect(toggleOption(optSingle, ["mild"], "mild")).toEqual([]);
  });
  it("multi-select adds, removes, and ignores past the cap", () => {
    expect(toggleOption(optMulti, [], "brains")).toEqual(["brains"]);
    expect(toggleOption(optMulti, ["brains", "egg"], "brains")).toEqual(["egg"]);
    expect(toggleOption(optMulti, ["brains", "egg"], "extra")).toEqual(["brains", "egg"]); // at cap
  });
});

describe("selectionDeltaCents", () => {
  it("sums only the selected options' deltas", () => {
    expect(selectionDeltaCents([reqSingle, optMulti], { "g-style": ["hot"], "g-addons": ["brains", "egg"] })).toBe(350);
  });
  it("ignores ids not present in the group's options", () => {
    expect(selectionDeltaCents([optMulti], { "g-addons": ["ghost"] })).toBe(0);
  });
});

describe("selectedIds", () => {
  it("flattens chosen ids and drops ids foreign to the group", () => {
    expect(selectedIds([reqSingle, optMulti], { "g-style": ["mild"], "g-addons": ["egg", "ghost"] })).toEqual([
      "mild",
      "egg",
    ]);
  });
});
