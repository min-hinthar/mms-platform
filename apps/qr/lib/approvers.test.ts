import { describe, expect, it } from "vitest";
import {
  eligibleApprovers,
  preselectApprover,
  zeroEligibleReason,
  type ApproverCandidate,
} from "./approvers";

/**
 * PD8 (m8 decisions 8 · 9 · 13) — the picker lists ONLY people who can sign, and a name is pre-lit
 * only when it is the one name. Each rule is a VALUE here; the roster below separates every rule from
 * every other (one candidate fails exactly one rule), so a dropped term is caught by name, never by
 * a fixture where two rules happen to agree.
 */
const aye: ApproverCandidate = {
  staffId: "aye",
  displayName: "Aye",
  role: "manager",
  active: true,
  hasPin: true,
};
const owner: ApproverCandidate = { ...aye, staffId: "min", displayName: "Min", role: "owner" };
const server: ApproverCandidate = {
  ...aye,
  staffId: "thiri",
  displayName: "Thiri",
  role: "server",
};
const inactive: ApproverCandidate = { ...aye, staffId: "zaw", displayName: "Zaw", active: false };
const noPin: ApproverCandidate = { ...aye, staffId: "nu", displayName: "Nu", hasPin: false };

describe("eligibleApprovers — only those who can sign", () => {
  it("keeps an active manager or owner with a PIN who is not the asker", () => {
    expect(eligibleApprovers([aye, owner], "thiri").map((a) => a.staffId)).toEqual(["aye", "min"]);
  });
  it("drops a server even with a PIN — the role rule", () => {
    expect(eligibleApprovers([aye, server], "someone")).toEqual([aye]);
  });
  it("drops an inactive manager — the active rule", () => {
    expect(eligibleApprovers([aye, inactive], "someone")).toEqual([aye]);
  });
  it("drops a manager with no tablet PIN — the PIN rule", () => {
    expect(eligibleApprovers([aye, noPin], "someone")).toEqual([aye]);
  });
  it("drops the asker themself — nobody approves their own request", () => {
    expect(eligibleApprovers([aye, owner], "aye")).toEqual([owner]);
  });
  it("the asker may sign a CLOSE (selfAllowed) — the paid-table card's one exception", () => {
    expect(eligibleApprovers([aye, owner], "aye", { selfAllowed: true })).toEqual([aye, owner]);
    // selfAllowed widens nothing else: the role, active and PIN rules still hold.
    expect(eligibleApprovers([server, inactive, noPin], "aye", { selfAllowed: true })).toEqual([]);
  });
  it("keeps the roster's order and never invents a person", () => {
    expect(eligibleApprovers([owner, aye], "x")).toEqual([owner, aye]);
    expect(eligibleApprovers([], "x")).toEqual([]);
  });
});

describe("preselectApprover — exactly one eligible arrives lit", () => {
  it("one eligible: that id", () => {
    expect(preselectApprover([aye])).toBe("aye");
  });
  it("two or more: none — a pre-lit wrong name spends someone else's lockout", () => {
    expect(preselectApprover([aye, owner])).toBe("");
  });
  it("none: nothing to light", () => {
    expect(preselectApprover([])).toBe("");
  });
});

describe("zeroEligibleReason — the two TRUE sentences, never 'none are signed in'", () => {
  it("the asker is the only signer here: 'only {x} can approve, and nobody approves their own'", () => {
    expect(zeroEligibleReason([aye, server, noPin], "aye")).toEqual({
      kind: "only_self",
      name: "Aye",
    });
  });
  it("no manager has a tablet PIN: 'nobody can approve it here'", () => {
    expect(zeroEligibleReason([noPin, server], "thiri")).toEqual({ kind: "no_pin" });
    expect(zeroEligibleReason([], "thiri")).toEqual({ kind: "no_pin" });
  });
  it("an INACTIVE manager with a PIN is not a signer: still 'no PIN here'", () => {
    expect(zeroEligibleReason([inactive], "thiri")).toEqual({ kind: "no_pin" });
  });
  it("someone else can sign: no zero-eligible sentence at all", () => {
    expect(zeroEligibleReason([aye, owner], "aye")).toBeNull();
  });
});
