import { describe, expect, it } from "vitest";
import { SURFACES, surfaceOpen } from "./surfaces";

/**
 * A1 — the parked surfaces are parked. This pins the DECISION (owner's go, 2026-09-09) so that
 * re-opening a door is a visible diff to a test, never a silent flip inside a component.
 */
describe("SURFACES", () => {
  it("the three Option-A doors are closed", () => {
    expect(SURFACES.selfServeSplit).toBe(false);
    expect(SURFACES.cardOnFileTabs).toBe(false);
    expect(SURFACES.kiosk).toBe(false);
  });
  it("surfaceOpen reads the table, not a copy", () => {
    for (const k of Object.keys(SURFACES) as (keyof typeof SURFACES)[])
      expect(surfaceOpen(k)).toBe(SURFACES[k]);
  });
});
