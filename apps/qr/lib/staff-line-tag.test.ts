import { describe, expect, it } from "vitest";
import { lineTagKey } from "./staff-line-tag";

/** The lifecycle audit — a sent dish's word is its stage on the one track, the raw state only without one. */
describe("lineTagKey", () => {
  it("reads the stage when the read gave one", () => {
    // lck/staff-line-tag/raw-state-wins
    expect(lineTagKey({ state: "fired", stage: "sending" })).toBe("table.line.state.sending");
    expect(lineTagKey({ state: "fired", stage: "sent" })).toBe("table.line.state.fired");
    expect(lineTagKey({ state: "served", stage: "cooking" })).toBe("table.line.state.inProgress");
    expect(lineTagKey({ state: "served", stage: "served" })).toBe("table.line.state.served");
  });
  it("keeps the shipped word for a line with no stage", () => {
    expect(lineTagKey({ state: "in_progress" })).toBe("table.line.state.inProgress");
    expect(lineTagKey({ state: "served", stage: null })).toBe("table.line.state.served");
    expect(lineTagKey({ state: "fired" })).toBe("table.line.state.fired");
  });
});
