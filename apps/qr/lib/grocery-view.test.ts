import { describe, expect, it } from "vitest";
import { aisleFromHash, aisleHistoryOp, hashForAisle, popShowsBrowse } from "./grocery-view";

/** Phase 1c — the aisle view's history. Each MUTATION was induced and watched go red. */

describe("aisleFromHash — ours, and stocked", () => {
  it("accepts a stocked aisle and refuses an unstocked one", () => {
    expect(aisleFromHash("#aisle-cooking", ["cooking", "health"])).toBe("cooking");
    // MUTATION: skip the stocked check → an empty aisle opens as a dead end; red.
    expect(aisleFromHash("#aisle-cooking", ["health"])).toBeNull();
  });

  it("refuses what is not an aisle hash", () => {
    expect(aisleFromHash("#aisle-", ["cooking"])).toBeNull();
    expect(aisleFromHash("#bill", ["cooking"])).toBeNull();
    expect(aisleFromHash("", ["cooking"])).toBeNull();
  });

  it("hashForAisle round-trips", () => {
    expect(hashForAisle("cooking")).toBe("#aisle-cooking");
    expect(hashForAisle(null)).toBe("");
    expect(aisleFromHash(hashForAisle("tea-laphet"), ["tea-laphet"])).toBe("tea-laphet");
  });
});

describe("aisleHistoryOp — Back always lands on the market home", () => {
  it("home → aisle pushes", () => {
    expect(aisleHistoryOp({ from: null, to: "cooking", pushedByUs: false })).toBe("push");
  });

  it("aisle → aisle replaces", () => {
    // MUTATION: push → Back lands on the PREVIOUS aisle instead of home; red.
    expect(aisleHistoryOp({ from: "cooking", to: "health", pushedByUs: true })).toBe("replace");
  });

  it("aisle → home walks back when we pushed, replaces when we did not", () => {
    // MUTATION: invert → a deep-linked aisle's "All aisles" leaves /grocery, and a pushed one stacks
    // a same-path, same-hash duplicate (the ~4s Back hang); red.
    expect(aisleHistoryOp({ from: "cooking", to: null, pushedByUs: true })).toBe("back");
    expect(aisleHistoryOp({ from: "cooking", to: null, pushedByUs: false })).toBe("replace");
  });

  it("same → none", () => {
    expect(aisleHistoryOp({ from: "cooking", to: "cooking", pushedByUs: true })).toBe("none");
    expect(aisleHistoryOp({ from: null, to: null, pushedByUs: false })).toBe("none");
  });
});

describe("popShowsBrowse — a popped aisle entry is never invisible", () => {
  it("a pop that changes the aisle while Scan shows switches to Browse", () => {
    expect(popShowsBrowse({ tab: "scan", before: "cooking", after: null })).toBe(true);
    expect(popShowsBrowse({ tab: "scan", before: null, after: "cooking" })).toBe(true);
  });

  it("no switch when Browse already shows, or when the aisle did not change", () => {
    expect(popShowsBrowse({ tab: "browse", before: "cooking", after: null })).toBe(false);
    expect(popShowsBrowse({ tab: "scan", before: "cooking", after: "cooking" })).toBe(false);
  });
});
