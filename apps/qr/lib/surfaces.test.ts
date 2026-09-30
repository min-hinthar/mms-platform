import { describe, expect, it } from "vitest";
import { SURFACES, surfaceOpen } from "./surfaces";
import { sendRoute } from "./staff-send-view";

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
  it("Phase 2f — pay at pickup is OPEN (owner decisions 1 + 7)", () => {
    expect(SURFACES.payAtPickup).toBe(true);
  });
  it("Phase 2f — the counter door is ANSWERED where the action reads it: parked, a counter Send refuses", () => {
    const reg = { mode: "pickup", qrCode: "reg-ab12" };
    expect(sendRoute(reg, surfaceOpen("payAtPickup"))).toEqual({ rpc: "counter" });
    // the flip: the same session with the door parked
    expect(sendRoute(reg, false)).toEqual({ refuse: "counter" });
    // a table never reads the switch
    expect(sendRoute({ mode: "dinein", qrCode: "T7" }, false)).toEqual({ rpc: "dinein" });
  });
  it("surfaceOpen reads the table, not a copy", () => {
    for (const k of Object.keys(SURFACES) as (keyof typeof SURFACES)[])
      expect(surfaceOpen(k)).toBe(SURFACES[k]);
  });
});
