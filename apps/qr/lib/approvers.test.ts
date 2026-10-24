import { describe, expect, it } from "vitest";
import { approverFor, canApproveLoss, decideAs, type DeciderRow } from "./approvers";

/**
 * No-PIN (owner, 2026-10-24) — the approver is the SIGNED-IN caller, and only when their role may
 * sign. Each rule is a VALUE here, on fixtures where exactly one rule separates the cases, so a
 * dropped term is caught by name. Every rule carries an `approvers/*` mutant.
 */
describe("canApproveLoss — the SQL's role in ('manager','owner')", () => {
  it("a manager and an owner may; a server and an unknown role may not", () => {
    expect(canApproveLoss("manager")).toBe(true);
    expect(canApproveLoss("owner")).toBe(true);
    expect(canApproveLoss("server")).toBe(false);
    expect(canApproveLoss("")).toBe(false);
  });
});

describe("approverFor — what a gated write SENDS as its approver", () => {
  it("a manager or owner is sent as their own approver (`approvers/manager-not-sent`)", () => {
    expect(approverFor({ staffId: "aye", role: "manager" })).toBe("aye");
    expect(approverFor({ staffId: "min", role: "owner" })).toBe("min");
  });
  it("a server is sent with NONE — never their own id in the approver slot (`approvers/server-sent`)", () => {
    expect(approverFor({ staffId: "thiri", role: "server" })).toBeUndefined();
  });
});

describe("decideAs — who decides a queued request on this device", () => {
  const aye: DeciderRow = { staffId: "aye", displayName: "Aye", role: "manager", self: true };
  const min: DeciderRow = { staffId: "min", displayName: "Min", role: "owner", self: false };
  const thiri: DeciderRow = { staffId: "thiri", displayName: "Thiri", role: "server", self: true };

  it("the signed-in manager decides a server's request, by name", () => {
    expect(decideAs([aye, min], false, "thiri", false)).toEqual({
      kind: "as",
      staffId: "aye",
      name: "Aye",
    });
  });
  it("reads the SELF row, never the first manager listed (`approvers/decider-not-self`)", () => {
    const meMin: DeciderRow = { ...min, self: true };
    const notMe: DeciderRow = { ...aye, self: false };
    expect(decideAs([notMe, meMin], false, "thiri", false)).toMatchObject({ staffId: "min" });
  });
  it("a server cannot decide (`approvers/server-decides`)", () => {
    expect(decideAs([thiri, min], false, "someone", false)).toEqual({ kind: "not_manager" });
  });
  it("the asker cannot approve or deny their own request, but may CLOSE it (`approvers/own-request-decides`)", () => {
    expect(decideAs([aye], false, "aye", false)).toEqual({ kind: "own_request" });
    expect(decideAs([aye], false, "aye", true)).toMatchObject({ kind: "as", staffId: "aye" });
  });
  it("a roster still loading is loading; an unreadable one, or one with no self row, is unknown — never a verdict", () => {
    expect(decideAs(null, false, "x", false)).toEqual({ kind: "loading" });
    expect(decideAs(null, true, "x", false)).toEqual({ kind: "unknown" });
    expect(decideAs([min], false, "x", false)).toEqual({ kind: "unknown" });
  });
});
