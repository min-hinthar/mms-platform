import { describe, expect, it } from "vitest";
import { pendingCountVerdict } from "./approvals-count";

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
