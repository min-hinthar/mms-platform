import { describe, expect, it } from "vitest";
import {
  actionOutcome,
  clearPendingArrival,
  pendingArrivalCleared,
  pendingArrivalKey,
  readPendingArrival,
  reconcileDue,
  writePendingArrival,
} from "./arrival-pending";

/**
 * PD3 (m3 §F, §G; correction 16) — the pending "I’m here" record, falsified by value. The store is a
 * Map-backed fake that can also THROW, so both halves of "fails toward no record" are asserted.
 * verify:slice mutants: arrival-pending/*.
 */
const ORDER = "0b6c1e58-0000-4000-8000-00000000abcd";
const OTHER = "0b6c1e58-0000-4000-8000-00000000ffff";
const T0 = Date.parse("2026-10-09T01:01:00.000Z");

function fakeStore(throwing = false) {
  const m = new Map<string, string>();
  const boom = () => {
    throw new Error("quota");
  };
  return {
    m,
    getItem: (k: string) => (throwing ? boom() : (m.get(k) ?? null)),
    setItem: (k: string, v: string) => (throwing ? boom() : void m.set(k, v)),
    removeItem: (k: string) => (throwing ? boom() : void m.delete(k)),
  };
}

describe("the pending record — one per order, written at the commit", () => {
  it("round-trips the committed arrival under the order's own key", () => {
    const s = fakeStore();
    writePendingArrival(s, ORDER, T0);
    expect(s.m.has(pendingArrivalKey(ORDER))).toBe(true);
    expect(readPendingArrival(s, ORDER)).toEqual({
      orderId: ORDER,
      committedAt: "2026-10-09T01:01:00.000Z",
    });
    // Another order's record is never this order's.
    expect(readPendingArrival(s, OTHER)).toBeNull();
  });
  it("a record written under one order never reads for another, even at the same key shape", () => {
    // MUTATION: drop the orderId check in the reader — a foreign entry parked at this key reads as
    // this order's arrival.
    const s = fakeStore();
    s.m.set(pendingArrivalKey(ORDER), JSON.stringify({ orderId: OTHER, committedAt: "x" }));
    expect(readPendingArrival(s, ORDER)).toBeNull();
  });
  it("clears, and a second commit overwrites rather than duplicates", () => {
    const s = fakeStore();
    writePendingArrival(s, ORDER, T0);
    writePendingArrival(s, ORDER, T0 + 5_000);
    expect(s.m.size).toBe(1);
    clearPendingArrival(s, ORDER);
    expect(readPendingArrival(s, ORDER)).toBeNull();
  });
  it("a throwing or absent store reads as no record and swallows the write", () => {
    expect(readPendingArrival(fakeStore(true), ORDER)).toBeNull();
    expect(() => writePendingArrival(fakeStore(true), ORDER, T0)).not.toThrow();
    expect(() => clearPendingArrival(fakeStore(true), ORDER)).not.toThrow();
    expect(readPendingArrival(null, ORDER)).toBeNull();
  });
  it("malformed JSON reads as no record", () => {
    const s = fakeStore();
    s.m.set(pendingArrivalKey(ORDER), "{not json");
    expect(readPendingArrival(s, ORDER)).toBeNull();
  });
});

describe("what clears the record (§F1, §G2) — every ANSWER does; a send with no answer keeps it", () => {
  it("success clears", () => {
    expect(pendingArrivalCleared({ answered: true, ok: true })).toBe(true);
  });
  it("a refusal is an answer and clears — the card is back at the question", () => {
    // MUTATION: `outcome.answered` → `outcome.answered && outcome.ok` — a refused write leaves the
    // record behind after the guest gave up, and the next visit rings Dad's bell for nobody.
    expect(pendingArrivalCleared({ answered: true, ok: false })).toBe(true);
  });
  it("no answer at all keeps it for the next visit's retry", () => {
    // MUTATION: `return true` — a dropped beacon is never repaired.
    expect(pendingArrivalCleared({ answered: false })).toBe(false);
  });
});

describe("actionOutcome — a RESOLVED action is not always an answer (Codex r1 on #330, P1)", () => {
  it("ok, and every decided refusal, are answers", () => {
    expect(actionOutcome({ ok: true })).toEqual({ answered: true, ok: true });
    for (const reason of ["unauthorized", "not_today", "collected", "closed"])
      expect(actionOutcome({ ok: false, reason })).toEqual({ answered: true, ok: false });
  });
  it("`failed` and `rate` are NOT answers — the record stays for the next visit", () => {
    // MUTATION: drop the `failed` arm — a transient failure retires the one repair for a committed
    // arrival, and a guest who closes the page then never reaches Dad.
    expect(actionOutcome({ ok: false, reason: "failed" })).toEqual({ answered: false });
    expect(actionOutcome({ ok: false, reason: "rate" })).toEqual({ answered: false });
  });
});

describe("reconcileDue — only an unanswered record for an unstamped order is re-sent", () => {
  const rec = { orderId: ORDER, committedAt: "2026-10-09T01:01:00.000Z" };
  it("due when a record exists and the server shows no stamp", () => {
    expect(reconcileDue(rec, null)).toBe(true);
  });
  it("not due once the server shows the stamp — the record is stale, never re-sent", () => {
    // MUTATION: ignore arrivedAt — every revisit re-posts an arrival the server already holds.
    expect(reconcileDue(rec, "2026-10-09T01:02:00.000Z")).toBe(false);
  });
  it("not due with no record", () => {
    expect(reconcileDue(null, null)).toBe(false);
  });
});
