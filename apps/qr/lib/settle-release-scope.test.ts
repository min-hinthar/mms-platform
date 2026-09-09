import { describe, expect, it } from "vitest";
import { settleReleaseOwner } from "./settle-release-scope";

/**
 * Codex round 8 on #275, P1. The question this module answers is "may THIS event un-freeze the
 * table?", and the only safe default is no. Every case below is a real intent shape reaching the
 * webhook's generic single-pay arm.
 */
const UID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const OTHER = "9c858901-8a57-4791-81fe-4c455b099bc9";

describe("settleReleaseOwner", () => {
  it("names the owner a staff close is holding the freeze under", () => {
    expect(settleReleaseOwner({ closedBy: "staff", closedByUid: UID })).toBe(UID);
  });

  it("refuses a DINER single-pay intent — it never held the settlement freeze", () => {
    // The whole population that reached the old unconditional release. cartId alone must not qualify.
    expect(settleReleaseOwner({ cartId: "c1", tipRate: "0" })).toBeNull();
  });

  it("refuses a staff close from an older deploy that carries no owner", () => {
    // Fail-closed: heal on the SETTLE_TTL rather than release a freeze we cannot prove is ours.
    expect(settleReleaseOwner({ closedBy: "staff", closedByStaffId: "staff_7" })).toBeNull();
  });

  it("does not accept the ATTRIBUTION id as the owner", () => {
    // closedByStaffId is who gets credit; the freeze is held under the auth uid. Confusing the two
    // is how a scoped release would match zero rows forever and look like it worked.
    expect(settleReleaseOwner({ closedBy: "staff", closedByStaffId: UID })).toBeNull();
  });

  it("refuses anything that is not a uuid — settle_by is a uuid column, so a bad owner is a 22P02", () => {
    expect(settleReleaseOwner({ closedBy: "staff", closedByUid: "" })).toBeNull();
    expect(settleReleaseOwner({ closedBy: "staff", closedByUid: "   " })).toBeNull();
    expect(settleReleaseOwner({ closedBy: "staff", closedByUid: "staff_7" })).toBeNull();
    expect(settleReleaseOwner({ closedBy: "staff", closedByUid: `${UID}x` })).toBeNull();
  });

  it("refuses a non-staff kind even when a well-formed uid rides along", () => {
    expect(settleReleaseOwner({ closedBy: "diner", closedByUid: OTHER })).toBeNull();
    expect(settleReleaseOwner({ closedByUid: OTHER })).toBeNull();
  });

  it("survives a missing metadata object", () => {
    expect(settleReleaseOwner(null)).toBeNull();
    expect(settleReleaseOwner(undefined)).toBeNull();
    expect(settleReleaseOwner({})).toBeNull();
  });

  it("trims surrounding whitespace rather than rejecting a padded uid", () => {
    expect(settleReleaseOwner({ closedBy: "staff", closedByUid: ` ${UID} ` })).toBe(UID);
  });
});
