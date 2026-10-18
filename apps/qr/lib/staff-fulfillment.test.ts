import { describe, expect, it } from "vitest";
import { REROUTE_SENT, staffCanReroute, staffRerouteOutcome } from "./staff-fulfillment";

/** The lifecycle audit (K18) — what the staff re-route offers, and what each answer says. */
describe("staffCanReroute", () => {
  it("only a DRAFT food line at a DINE-IN table", () => {
    // lck/staff-fulfillment/reroute-anywhere
    expect(staffCanReroute("dinein", { state: "draft", fulfillment: "dinein" })).toBe(true);
    expect(staffCanReroute("dinein", { state: "draft", fulfillment: "togo" })).toBe(true);
    expect(staffCanReroute("pickup", { state: "draft", fulfillment: "togo" })).toBe(false);
    expect(staffCanReroute("dinein", { state: "fired", fulfillment: "dinein" })).toBe(false);
    expect(staffCanReroute("dinein", { state: "draft", fulfillment: "grocery" })).toBe(false);
  });
});

describe("staffRerouteOutcome", () => {
  it("only `ok` lands; every refusal names itself; an unknown word is never a landing", () => {
    // lck/staff-fulfillment/unknown-answer-lands
    expect(staffRerouteOutcome("ok")).toEqual({ ok: true });
    expect(staffRerouteOutcome("not_draft")).toEqual({ ok: false, error: REROUTE_SENT });
    for (const w of ["not_open", "not_found", "is_grocery", "not_dinein_session", null, "x"])
      expect(staffRerouteOutcome(w).ok).toBe(false);
  });
});
