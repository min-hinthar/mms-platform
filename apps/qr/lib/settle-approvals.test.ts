import { describe, expect, it } from "vitest";
import {
  ackForTap,
  reWarning,
  warnedDishes,
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
    lineNow: { qty: 1, unitPriceCents: 1400, offTheBill: false },
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

describe("ackForTap — one door's acknowledgement (the blind pass on #333)", () => {
  it("what the page displayed PLUS what this door's own re-warning named — so the next tap passes", () => {
    // The page never re-drew (no page, or a pane mid-read): the displayed snapshot is still [] and
    // only the door's warning covers r2. MUTATION (settle-approvals/warning-forgotten): the tap
    // re-sends the stale [] and is refused again, forever — a block, not a re-warning; red.
    expect(ackForTap([], ["r2"])).toEqual(["r2"]);
    expect(ackForTap(["r1"], ["r1", "r2"])).toEqual(["r1", "r2"]);
    // MUTATION (settle-approvals/displayed-forgotten): the page's own flags drop out; red.
    expect(ackForTap(["r1"], [])).toEqual(["r1"]);
  });
  it("never crosses the schema's 50-id rail", () => {
    const many = Array.from({ length: 60 }, (_, i) => `r${i}`);
    expect(ackForTap(many, []).length).toBe(50);
  });
  it("warnedDishes names every dish the refusal carried, oldest first", () => {
    expect(warnedDishes([flag("r1", "Mohinga"), flag("r2", "Tea leaf salad")])).toBe(
      "Mohinga · Tea leaf salad",
    );
  });
});
function flag(id: string, lineName: string) {
  return {
    id,
    kind: "void" as const,
    lineId: null,
    lineName,
    nameMy: null,
    qty: 1,
    amountCents: 100,
    cooked: false,
    initiatorName: "Thiri",
    initiatorStaffId: "thiri",
    createdAt: "2026-10-08T10:00:00Z",
    lineNow: "unknown" as const,
  };
}

describe("reWarning — the dishes a re-warning NAMES (the last blind pass on #333)", () => {
  it("names only what the tap did NOT acknowledge — the dish that caused the refusal", () => {
    const pending = [flag("r1", "Mohinga"), flag("r2", "Tea leaf salad")];
    // MUTATION (settle-approvals/re-warning-names-the-acknowledged): it names Mohinga, the dish the
    // cashier already saw and acknowledged, and Tea leaf salad goes unsaid; red.
    expect(reWarning(pending, ["r1"])).toEqual({ fresh: [pending[1]], dishes: "Tea leaf salad" });
    expect(reWarning(pending, []).dishes).toBe("Mohinga · Tea leaf salad");
  });
  it("names every pending dish when the server listed none new", () => {
    expect(reWarning([flag("r1", "Mohinga")], ["r1"]).dishes).toBe("Mohinga");
  });
});
