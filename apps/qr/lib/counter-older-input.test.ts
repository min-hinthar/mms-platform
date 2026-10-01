import { describe, expect, it } from "vitest";
import { counterOlderInput } from "@mms/db/schemas";

/**
 * Phase 2g · P2fz — the oldest-first sheet's cursor is the rail between a client value and a
 * PostgREST `or=` filter (`readCounterOrdersOldestFirst` quotes both halves into it). So each half is
 * held to what it IS: `startedAt` an ISO timestamp with an offset — PostgREST's own `+00:00` form,
 * microseconds included, never a string that could close the quote or the group — and bounded;
 * `sessionId` a uuid. Each bound is pinned on both sides: the value the server itself hands back
 * passes, the evasion is refused.
 */

const SID = "11111111-1111-4111-8111-111111111111";
const RAW = "2026-09-30T08:00:00.123456+00:00";

describe("counterOlderInput", () => {
  it("takes the first page (null) and the cursor the server returned, microseconds and all", () => {
    expect(counterOlderInput.safeParse({ after: null }).success).toBe(true);
    expect(counterOlderInput.safeParse({ after: { startedAt: RAW, sessionId: SID } }).success).toBe(
      true,
    );
    expect(
      counterOlderInput.safeParse({
        after: { startedAt: "2026-09-30T08:00:00+00:00", sessionId: SID },
      }).success,
    ).toBe(true);
  });

  it("the cursor is REQUIRED — an absent one is not 'the first page'", () => {
    // p2g-older/schemas/cursor-optional
    expect(counterOlderInput.safeParse({}).success).toBe(false);
  });

  it("startedAt must BE a timestamp with an offset — never filter syntax", () => {
    // p2g-older/schemas/cursor-any-string
    for (const startedAt of [
      'x",id.gt."0',
      "2026-09-30T08:00:00.1+00:00,id.gt.0",
      "2026-09-30T08:00:00", // no offset: a local time names no instant
      "",
    ])
      expect(counterOlderInput.safeParse({ after: { startedAt, sessionId: SID } }).success).toBe(
        false,
      );
  });

  it("startedAt is bounded — 40 characters admit any real stamp and nothing longer", () => {
    // p2g-older/schemas/cursor-unbounded
    const long = "2026-09-30T08:00:00.12345678901234567890123+00:00";
    expect(long.length).toBeGreaterThan(40);
    expect(
      counterOlderInput.safeParse({ after: { startedAt: long, sessionId: SID } }).success,
    ).toBe(false);
    expect(RAW.length).toBeLessThanOrEqual(40);
  });

  it("sessionId must be a uuid", () => {
    // p2g-older/schemas/cursor-session-any-string
    for (const sessionId of [`${SID}")`, "reg-ab12", ""])
      expect(counterOlderInput.safeParse({ after: { startedAt: RAW, sessionId } }).success).toBe(
        false,
      );
  });
});
