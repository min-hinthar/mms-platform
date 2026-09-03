import { describe, expect, it } from "vitest";
import { acceptView, issueRead, type ViewSeq } from "./view-seq";

/**
 * T21(b) partial — the read-ordering ticket, in the terms the defect is stated in: two views in
 * flight at once, and which one is allowed to reach the screen.
 *
 * The provider fans out several concurrent `getCartView` calls with no cancellation between them, so
 * without this rule the LAST TO RESOLVE won. The freeze re-read makes that expensive rather than
 * untidy: a slow read that observed `locked: true` resolving after a newer read that observed the
 * lock released puts the freeze BACK, and the surface then stays dead for another full TTL.
 *
 * Every case below is written as an interleaving — issue, issue, resolve out of order — because the
 * order of ISSUE and the order of ARRIVAL disagreeing is the entire subject.
 */

const seq = (): ViewSeq => ({ issued: 0 });

describe("issueRead / acceptView — the newest view wins, whatever order they land in", () => {
  it("applies a read that nothing overtook", () => {
    const s = seq();
    const a = issueRead(s);
    expect(acceptView(s, a)).toBe(true);
  });

  it("REFUSES the older of two reads when it lands last", () => {
    const s = seq();
    const older = issueRead(s);
    const newer = issueRead(s);
    // Arrival order reversed on purpose: the newer read answers first.
    expect(acceptView(s, newer)).toBe(true);
    expect(acceptView(s, older)).toBe(false);
  });

  it("keeps applying the newest read while an older one is still outstanding", () => {
    const s = seq();
    issueRead(s); // outstanding, never resolves
    const newer = issueRead(s);
    expect(acceptView(s, newer)).toBe(true);
    // Accepting it does NOT retire the ticket — a duplicate delivery of the same view is still the
    // newest thing issued, and refusing it would be an invented staleness.
    expect(acceptView(s, newer)).toBe(true);
  });

  it("applies a mutation's returned view unconditionally — it is server-commit fresh", () => {
    const s = seq();
    issueRead(s);
    issueRead(s);
    expect(acceptView(s, undefined)).toBe(true);
  });

  it("lets a mutation's view INVALIDATE a read that was issued before it", () => {
    const s = seq();
    const read = issueRead(s);
    // The add commits and renders its own view inside the same statement — strictly fresher than a
    // read that merely started earlier. The read must not be allowed to undo it.
    expect(acceptView(s, undefined)).toBe(true);
    expect(acceptView(s, read)).toBe(false);
  });

  it("gives a read issued AFTER a mutation a ticket that still wins", () => {
    const s = seq();
    acceptView(s, undefined);
    const after = issueRead(s);
    expect(acceptView(s, after)).toBe(true);
  });

  it("hands out strictly increasing tickets", () => {
    const s = seq();
    const tickets = [issueRead(s), issueRead(s), issueRead(s)];
    expect(tickets).toEqual([1, 2, 3]);
    expect(s.issued).toBe(3);
  });
});
