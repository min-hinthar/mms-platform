import { describe, expect, it, vi } from "vitest";
// `pay-guard` (for `isFresh`) is server-only and pulls the service client; neither is exercised here.
vi.mock("server-only", () => ({}));
vi.mock("@mms/db/server", () => ({ serviceClient: () => ({}) }));
import { deriveFloorStatus } from "./floor-status";

/**
 * A1 — the floor status RANK, pinned as values. Each case differs from its neighbour by exactly
 * one input, so a mutant that reorders or drops one rule flips exactly one verdict.
 */
const now = Date.now();
const fresh = new Date(now - 30_000).toISOString(); // inside every TTL
const stale = new Date(now - 60 * 60_000).toISOString(); // outside both TTLs
const open = { locked: false, locked_at: null, settle_at: null, counter_requested_at: null };

describe("deriveFloorStatus", () => {
  it("seated → ordering → paid follow the cart and the order", () => {
    expect(deriveFloorStatus(null, 0, false)).toBe("seated");
    expect(deriveFloorStatus(open, 0, false)).toBe("seated");
    expect(deriveFloorStatus(open, 2, false)).toBe("ordering");
    expect(deriveFloorStatus(null, 0, true)).toBe("paid");
  });

  it("a counter ask on a table with items reads 'counter'", () => {
    expect(deriveFloorStatus({ ...open, counter_requested_at: fresh }, 2, false)).toBe("counter");
    // An OLD ask is still an ask — there is no TTL on it by design.
    expect(deriveFloorStatus({ ...open, counter_requested_at: stale }, 2, false)).toBe("counter");
  });

  it("an ask on an EMPTY table does not light the floor", () => {
    expect(deriveFloorStatus({ ...open, counter_requested_at: fresh }, 0, false)).toBe("seated");
  });

  it("a live card payment outranks the ask; a stale lock does not", () => {
    expect(
      deriveFloorStatus(
        { ...open, locked: true, locked_at: fresh, counter_requested_at: fresh },
        2,
        false,
      ),
    ).toBe("paying");
    expect(
      deriveFloorStatus(
        { ...open, locked: true, locked_at: stale, counter_requested_at: fresh },
        2,
        false,
      ),
    ).toBe("counter");
  });

  it("a split freeze outranks everything", () => {
    expect(
      deriveFloorStatus(
        { locked: true, locked_at: fresh, settle_at: fresh, counter_requested_at: fresh },
        2,
        false,
      ),
    ).toBe("settling");
  });
});
