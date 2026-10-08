import { describe, expect, it } from "vitest";
import {
  APPROVALS_UNREADABLE_REFUSAL,
  APPROVAL_PENDING_REFUSAL,
  approvalPendingRefusal,
  approvalsUnreadableRefusal,
  staffSettleApprovalVerdict,
  type PendingFlag,
} from "./settle-approvals";

/**
 * PD8 (PATH_DESIGN decision 4, m8 decision 24, Codex correction 13) — tapping a settle door with a
 * flag up IS the acknowledgement, and the server refuses `approval_pending` ONLY for a request the
 * acknowledgement did not cover. The compare is a set operation on ids; it is never a block.
 */
describe("staffSettleApprovalVerdict — the acknowledged-ids compare", () => {
  it("nothing pending: no verdict, whatever was acknowledged", () => {
    expect(staffSettleApprovalVerdict([], [])).toBeNull();
    expect(staffSettleApprovalVerdict([], ["a"])).toBeNull();
  });
  it("every pending id acknowledged at the tap: the door passes", () => {
    expect(staffSettleApprovalVerdict(["a", "b"], ["b", "a"])).toBeNull();
  });
  it("a request the tap did not display: refused, naming exactly the uncovered ids", () => {
    expect(staffSettleApprovalVerdict(["a", "b"], ["a"])).toEqual({ unacknowledged: ["b"] });
    expect(staffSettleApprovalVerdict(["a"], [])).toEqual({ unacknowledged: ["a"] });
  });
  it("an acknowledgement of ids that are no longer pending covers nothing and blocks nothing", () => {
    expect(staffSettleApprovalVerdict(["a"], ["a", "gone"])).toBeNull();
  });
  it("an UNREADABLE pending read is its own verdict — never 'nothing pending' (the staff doors fail closed, P2dc)", () => {
    expect(staffSettleApprovalVerdict(null, [])).toBe("unreadable");
    expect(staffSettleApprovalVerdict(null, ["a"])).toBe("unreadable");
  });
});

describe("the refusal shapes", () => {
  const flag: PendingFlag = {
    id: "r1",
    kind: "void",
    lineId: "l1",
    lineName: "Mohinga",
    nameMy: "မုန့်ဟင်းခါး",
    qty: 1,
    amountCents: 1400,
    cooked: true,
    initiatorName: "Thiri",
    initiatorStaffId: "thiri",
    createdAt: "2026-10-08T10:00:00Z",
  };
  it("approval_pending carries the typed code, the sentence, and EVERY pending flag (the card re-draws all of them)", () => {
    expect(approvalPendingRefusal([flag])).toEqual({
      ok: false,
      code: "approval_pending",
      error: APPROVAL_PENDING_REFUSAL,
      pending: [flag],
    });
  });
  it("approval_unreadable is a retry sentence, never the write-outage 'keep it on paper'", () => {
    const r = approvalsUnreadableRefusal();
    expect(r).toEqual({
      ok: false,
      code: "approval_unreadable",
      error: APPROVALS_UNREADABLE_REFUSAL,
    });
    expect(r.error).not.toMatch(/paper/);
  });
});
