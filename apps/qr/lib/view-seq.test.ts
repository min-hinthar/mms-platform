import { describe, expect, it } from "vitest";
import { acceptView, issueRead, readIsOurs, readReachedServer, type ViewSeq } from "./view-seq";

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

const seq = (): ViewSeq => ({ issued: 0, applied: 0 });

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
  });

  // ⚠️ THE ROUND-2 FINDING, AND THE ONE THAT COSTS A DINER SOMETHING. A request in flight must
  // reserve nothing: the first draft refused any ticket that was not the newest ISSUED, so a newer
  // read that FAILED still suppressed an older read that had SUCCEEDED. On this surface that is
  // exactly the T20 bug returning — the scheduled re-read sees the lock expired, a visibility
  // refresh issued moments later 503s and applies nothing, and the good observation is thrown away.
  it("applies an older read that SUCCEEDS when the newer one never lands", () => {
    const s = seq();
    const older = issueRead(s);
    issueRead(s); // issued later, and it will fail — it applies nothing, so it blocks nothing
    expect(acceptView(s, older)).toBe(true);
  });

  it("refuses the older read only once the newer one has actually LANDED", () => {
    const s = seq();
    const older = issueRead(s);
    const newer = issueRead(s);
    expect(acceptView(s, newer)).toBe(true); // this is what supersedes it …
    expect(acceptView(s, older)).toBe(false); // … not the mere fact that it was issued
  });

  it("refuses a duplicate delivery of a view that already landed", () => {
    const s = seq();
    const t = issueRead(s);
    expect(acceptView(s, t)).toBe(true);
    // The watermark has moved to this ticket, so a re-delivery is no longer newer than the screen.
    expect(acceptView(s, t)).toBe(false);
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

  // The bound on the policy above: a mutation outranks reads issued BEFORE it landed, and nothing
  // further. A read issued afterwards is a genuinely later observation and must not be suppressed —
  // otherwise one add would blind this client until the next event.
  it("does not suppress a read issued after the mutation's view landed", () => {
    const s = seq();
    issueRead(s); // in flight when the add resolves — this one loses
    expect(acceptView(s, undefined)).toBe(true);
    const later = issueRead(s);
    expect(acceptView(s, later)).toBe(true);
  });

  it("hands out strictly increasing tickets, and issuing alone moves no watermark", () => {
    const s = seq();
    const tickets = [issueRead(s), issueRead(s), issueRead(s)];
    expect(tickets).toEqual([1, 2, 3]);
    expect(s.issued).toBe(3);
    // The distinction the round-2 fix rests on: three reads outstanding, nothing on screen yet.
    expect(s.applied).toBe(0);
  });
});

describe("ReadOutcome — the two questions a read answers, named apart (T26)", () => {
  it("readReachedServer treats an OVERTAKEN read as a success", () => {
    // T20's re-arm rests on this. An overtaken read still proves the cart is reachable — the freeze
    // axes on screen came from the view that beat it — and narrowing this to `applied` would kill
    // the re-arm chain on a cart that is still frozen, whose unchanged axes do not re-run the
    // effect: the permanent dead menu T20 exists to fix.
    expect(readReachedServer("applied")).toBe(true);
    expect(readReachedServer("overtaken")).toBe(true);
    expect(readReachedServer("failed")).toBe(false);
  });

  it("readIsOurs treats an OVERTAKEN read as NOT ours", () => {
    // The recovery path's question. A view that beat ours to the screen may be a mutation's, which
    // lands without a ticket and may have read its rows BEFORE our write committed — so `itemsRef`
    // is not evidence of our own add.
    expect(readIsOurs("applied")).toBe(true);
    expect(readIsOurs("overtaken")).toBe(false);
    expect(readIsOurs("failed")).toBe(false);
  });

  it("the two disagree on exactly one state, and that state is why they are separate", () => {
    const states = ["applied", "overtaken", "failed"] as const;
    const differ = states.filter((s) => readReachedServer(s) !== readIsOurs(s));
    expect(differ).toEqual(["overtaken"]);
  });
});
