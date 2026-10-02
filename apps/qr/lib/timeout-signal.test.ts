import { describe, expect, it, vi } from "vitest";
import { timeoutSignal } from "./timeout-signal";

/**
 * The one bounded-signal helper (Codex r1 on #311, P2it): the version read and the health probe both
 * bound their fetch through it, so an iPadOS older than 16 — which has no `AbortSignal.timeout` —
 * still gets an answer, and still gets it bounded.
 */
const MS = 4_000;

describe("timeoutSignal", () => {
  it("the platform's own when it has one; otherwise a timer aborts at the bound", () => {
    // MUTATION (p2i-apply/timeout-fallback-throws): no fallback — a missing AbortSignal.timeout
    // throws; red. MUTATION (p2i-apply/timeout-fallback-never-aborts): the fallback's timer is
    // dropped — a hung read on an old tablet never ends, and the watcher's one-at-a-time latch holds
    // every later check behind it; red. MUTATION (p2i-apply/timeout-fallback-late): it aborts a tick
    // after the bound; red.
    const own = new AbortController().signal;
    const timeout = vi.fn(() => own);
    expect(timeoutSignal(MS, { timeout })).toBe(own);
    expect(timeout).toHaveBeenCalledWith(MS);
    vi.useFakeTimers();
    try {
      const s = timeoutSignal(MS, {});
      expect(s.aborted).toBe(false);
      vi.advanceTimersByTime(MS - 1);
      expect(s.aborted).toBe(false);
      vi.advanceTimersByTime(1);
      expect(s.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reads the global at the call: no AbortSignal.timeout → the fallback, still an AbortSignal", () => {
    const real = AbortSignal.timeout;
    Object.defineProperty(AbortSignal, "timeout", { configurable: true, value: undefined });
    try {
      expect(timeoutSignal(MS)).toBeInstanceOf(AbortSignal);
    } finally {
      Object.defineProperty(AbortSignal, "timeout", { configurable: true, value: real });
    }
  });
});
