import { describe, expect, it } from "vitest";
import { optionsCameBackDifferent, storedOptionIds } from "./reorder-options";

/**
 * M3 — the faithful-reorder decision rules. Each rule here owns a verify:slice mutant:
 *  - reorder/stored-ids-ignored (storedOptionIds → always []) — kills the faithful path entirely;
 *  - reorder/vanished-option-silent (partial honor reads as faithful) — a diner assumes their usual;
 *  - reorder/legacy-reset-lost (labels-only line stops disclosing the base-dish fallback).
 */

describe("storedOptionIds", () => {
  it("normalizes the stored jsonb to the string ids (the faithful-reorder input)", () => {
    expect(storedOptionIds(["a", "b"])).toEqual(["a", "b"]);
  });
  it("legacy/malformed shapes read as NO ids — today's label-only behavior, never a throw", () => {
    expect(storedOptionIds([])).toEqual([]);
    expect(storedOptionIds(null)).toEqual([]);
    expect(storedOptionIds(undefined)).toEqual([]);
    expect(storedOptionIds("nope")).toEqual([]);
    expect(storedOptionIds([1, "a", { x: 1 }])).toEqual(["a"]);
  });
});

describe("optionsCameBackDifferent", () => {
  it("a legacy labels-only line comes back as the BASE dish → disclosed", () => {
    expect(optionsCameBackDifferent(0, 0, true)).toBe(true);
  });
  it("a legacy line that never had options is faithful → silent", () => {
    expect(optionsCameBackDifferent(0, 0, false)).toBe(false);
  });
  it("an id line with a vanished option (honored < stored) is partial → disclosed", () => {
    expect(optionsCameBackDifferent(3, 2, true)).toBe(true);
    expect(optionsCameBackDifferent(1, 0, true)).toBe(true);
  });
  it("an id line whose every stored id survived is faithful → silent", () => {
    expect(optionsCameBackDifferent(2, 2, true)).toBe(false);
  });
});
