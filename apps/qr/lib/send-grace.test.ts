import { describe, expect, it } from "vitest";
import { graceDeadlineMs, graceRemainingSec, holdResolved, undoTapHeld } from "./send-grace";

/**
 * Phase 2a · send — the grace is measured by the SERVER and counted from this device's receipt.
 * Every case here is a value a mutant in `scripts/verify-slice.mjs` (`send-grace/*`) moves.
 */
const T = Date.parse("2026-09-24T18:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

describe("graceDeadlineMs — the server-measured duration, from local receipt", () => {
  it("a device clock 5 minutes AHEAD still gets the whole 10s window", () => {
    // The device receives the answer at what IT thinks is T+300s. An absolute reading of the
    // server's deadline (T+10s) against that clock would already be 290s in the past.
    const receipt = T + 300_000;
    const deadline = graceDeadlineMs(
      { undoUntil: iso(T + 10_000), serverNow: iso(T), undoBatch: "b" },
      receipt,
    );
    expect(deadline).toBe(T + 310_000);
    expect(graceRemainingSec(deadline, receipt)).toBe(10);
  });

  it("a device clock 5 minutes BEHIND gets the same 10s, not 310s", () => {
    const receipt = T - 300_000;
    const deadline = graceDeadlineMs(
      { undoUntil: iso(T + 10_000), serverNow: iso(T), undoBatch: "b" },
      receipt,
    );
    expect(graceRemainingSec(deadline, receipt)).toBe(10);
  });

  it("no batch → no window (an undo must target one send)", () => {
    expect(
      graceDeadlineMs({ undoUntil: iso(T + 10_000), serverNow: iso(T), undoBatch: null }, T),
    ).toBeNull();
  });

  it("no deadline, or one already passed on the SERVER's clock → no window", () => {
    expect(graceDeadlineMs({ undoUntil: null, serverNow: iso(T), undoBatch: "b" }, T)).toBeNull();
    expect(
      graceDeadlineMs({ undoUntil: iso(T - 1), serverNow: iso(T), undoBatch: "b" }, T),
    ).toBeNull();
    expect(graceDeadlineMs({ undoUntil: iso(T), serverNow: iso(T), undoBatch: "b" }, T)).toBeNull();
  });
});

describe("graceRemainingSec", () => {
  it("rounds UP — 200ms left still reads 1s — and floors at 0", () => {
    expect(graceRemainingSec(T + 200, T)).toBe(1);
    expect(graceRemainingSec(T + 9_001, T)).toBe(10);
    expect(graceRemainingSec(T + 9_000, T)).toBe(9);
    expect(graceRemainingSec(T - 5_000, T)).toBe(0);
    expect(graceRemainingSec(null, T)).toBe(0);
  });
});

describe("undoTapHeld — one number for 'the same gesture'", () => {
  it("holds a tap for 350ms after a relabel, releases at 350, and holds nothing never armed", () => {
    expect(undoTapHeld(T, T + 349)).toBe(true);
    expect(undoTapHeld(T, T + 350)).toBe(false);
    expect(undoTapHeld(null, T)).toBe(false);
  });
});

describe("holdResolved — the post-undo busy hold ends on the drafts, or after two commits", () => {
  it("one stale commit still holds; the Send view or a second commit releases", () => {
    expect(holdResolved("allSent", 0)).toBe(false);
    expect(holdResolved("allSent", 1)).toBe(false);
    expect(holdResolved("send", 1)).toBe(true);
    expect(holdResolved("send", 0)).toBe(true);
    expect(holdResolved("allSent", 2)).toBe(true);
  });
});
