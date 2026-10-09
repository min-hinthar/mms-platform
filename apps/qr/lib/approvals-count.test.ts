import { describe, expect, it } from "vitest";
import { circleFromBoard, circleSeed, pendingCountVerdict } from "./approvals-count";

/**
 * PD8 (m8 decision 4) — the bar's approvals count never answers a FALSE 0. The shipped
 * `countPendingApprovals` returned `0` on any error (a deliberate degrade for an ornament); now that
 * the circle is the counter's one live approvals signal, an unknown count is `{ ok: false }` — the
 * circle draws a dashed ring and "couldn't check", never an all-clear.
 */
describe("pendingCountVerdict — unknown ≠ 0", () => {
  it("a read error is unknown, never zero", () => {
    expect(pendingCountVerdict({ count: null, error: { message: "down" } })).toEqual({ ok: false });
    // …even when the client library hands a count beside the error.
    expect(pendingCountVerdict({ count: 0, error: { message: "down" } })).toEqual({ ok: false });
  });
  it("a missing count (no error) is unknown, never zero", () => {
    expect(pendingCountVerdict({ count: null, error: null })).toEqual({ ok: false });
  });
  it("a real zero is a real all-clear", () => {
    expect(pendingCountVerdict({ count: 0, error: null })).toEqual({ ok: true, count: 0 });
  });
  it("a count is the count", () => {
    expect(pendingCountVerdict({ count: 2, error: null })).toEqual({ ok: true, count: 2 });
  });
  it("a negative or non-finite count is not a count", () => {
    expect(pendingCountVerdict({ count: -1, error: null })).toEqual({ ok: false });
    expect(pendingCountVerdict({ count: Number.NaN, error: null })).toEqual({ ok: false });
  });
});

describe("circleFromBoard — the board never claims a number it did not read (the blind pass on #333)", () => {
  const frozenBoard = { read: false, count: 0, frozen: true, frozenCopy: "as of 10:02" };
  it("an initial queue outage keeps the seed's 'couldn't check' — never a count of 0", () => {
    // MUTATION (approvals-count/unread-queue-claims-its-count): the unread queue's 0 overwrites the
    // seed — the circle reads "Approvals", a false all-clear; red.
    const next = circleFromBoard(circleSeed({ ok: false }), frozenBoard);
    expect(next.count).toBeNull();
    expect(next.unknown).toBe(true);
    expect(next.frozen).toBe(true);
  });
  it("an initial queue outage keeps the server's own head count, dashed (it may be stale)", () => {
    const next = circleFromBoard(circleSeed({ ok: true, count: 3 }), frozenBoard);
    expect(next).toEqual({ count: 3, frozen: true, unknown: false, frozenCopy: "as of 10:02" });
  });
  it("a queue the page HAS read publishes its own count — 0 included — and clears the freeze", () => {
    const next = circleFromBoard(circleSeed({ ok: false }), {
      read: true,
      count: 0,
      frozen: false,
      frozenCopy: null,
    });
    expect(next).toEqual({ count: 0, frozen: false, unknown: false, frozenCopy: null });
  });
});
