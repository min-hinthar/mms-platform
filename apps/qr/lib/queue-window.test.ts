import { describe, expect, it } from "vitest";
import { QUEUE_WINDOW_MS, queueEmptiness, queueFloorIso } from "./queue-window";

describe("queueFloorIso — the live boards read a service window, not all of history (M180 · M181)", () => {
  it("floors exactly one window behind the server's clock", () => {
    const now = "2026-09-09T18:00:00.000Z";
    expect(queueFloorIso(now)).toBe(new Date(Date.parse(now) - QUEUE_WINDOW_MS).toISOString());
  });

  it("leaves FUTURE timestamps above the floor — HELD tickets must survive it", () => {
    // The KDS deliberately includes lines whose `fire_at` is in the future: a scheduled pickup shows
    // as a dimmed HELD card and goes live when the clock passes it. A window expressed as a RANGE
    // rather than a floor would have swept every scheduled order off the board, which is the
    // over-blocking direction — worse than the orphans this bound exists to stop.
    const now = "2026-09-09T18:00:00.000Z";
    const floor = queueFloorIso(now);
    const held = new Date(Date.parse(now) + 3 * 60 * 60 * 1000).toISOString();
    expect(held > floor).toBe(true);
  });

  it("falls back to the local clock rather than to 1970 when the server clock is unreadable", () => {
    // `Date.parse` answers NaN for a malformed timestamp, and `new Date(NaN - MS)` is an Invalid
    // Date whose ISO conversion throws — while the tempting `|| 0` fallback yields a 1970 floor that
    // admits every row ever written, i.e. exactly the unbounded read this function replaces. A bound
    // that silently stops bounding is worse than none, because nothing looks wrong.
    const floor = queueFloorIso("not a timestamp");
    expect(Number.isFinite(Date.parse(floor))).toBe(true);
    expect(Date.parse(floor)).toBeGreaterThan(Date.now() - QUEUE_WINDOW_MS - 60_000);
    expect(Date.parse(floor)).toBeLessThanOrEqual(Date.now() - QUEUE_WINDOW_MS + 60_000);
  });
});

describe("queueEmptiness — what a read with no live rows may claim", () => {
  it("claims `empty` only when the read saw the whole window", () => {
    // The over-blocking half, and it matters every quiet hour of every day: a rule that answered
    // `cannot-say` whenever nothing was live would freeze both boards permanently on a slow morning.
    expect(queueEmptiness(0, 500)).toBe("empty");
    expect(queueEmptiness(499, 500)).toBe("empty");
  });

  it("refuses to claim `empty` from a SATURATED read", () => {
    // M180 verbatim: 500 rows all sitting on cancelled carts made `sessionIds` empty and the queue
    // answered `ok: true` with zero tickets — an empty board over a full kitchen.
    expect(queueEmptiness(500, 500)).toBe("cannot-say");
    // `>=`, not `===`: a read that overshoots its own cap is LESS entitled to claim completeness, and
    // an equality would hand the worse case the more confident answer.
    expect(queueEmptiness(501, 500)).toBe("cannot-say");
  });

  it("reads the cap from its argument, so the two boards' different caps both bind", () => {
    // Expo's cap is 200, the kitchen's is 500. A rule that hardcoded either would be decorative on
    // one of the two surfaces it governs.
    expect(queueEmptiness(200, 200)).toBe("cannot-say");
    expect(queueEmptiness(200, 500)).toBe("empty");
  });
});
