import { describe, expect, it } from "vitest";
import { bareMenuRedirect } from "./menu-entry";

describe("bareMenuRedirect — a mode-less /menu never becomes scan & go (F9)", () => {
  it("sends a bare /menu to the door picker", () => {
    // MUTATION: `return null` for the no-code case (render the scan-&-go default again) → red.
    expect(bareMenuRedirect({})).toBe("/");
    expect(bareMenuRedirect({ door: "togo", reorder: "x" })).toBe("/");
  });

  it("treats a sticker token or an invite code as a table, keeping every other param", () => {
    // MUTATION: `mode: "pickup"` for a coded entry → red (a table guest lands in a pickup session).
    expect(bareMenuRedirect({ t: "3F9A2C1B" })).toBe("/menu?mode=dinein&t=3F9A2C1B");
    expect(bareMenuRedirect({ j: "AB12", door: "dinein" })).toBe(
      "/menu?mode=dinein&j=AB12&door=dinein",
    );
  });

  it("reads a repeated key as its LAST value, the same as the proxy's URLSearchParams does", () => {
    expect(bareMenuRedirect({ t: ["OLD", "NEW"] })).toBe("/menu?mode=dinein&t=NEW");
  });

  it("honours an explicit mode, whatever it is", () => {
    for (const mode of ["dinein", "pickup", "scango"]) {
      expect(bareMenuRedirect({ mode, t: "x" })).toBeNull();
    }
  });
});
