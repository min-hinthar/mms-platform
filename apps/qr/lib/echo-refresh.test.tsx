/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  ECHO_COALESCE_MS,
  ECHO_MAX_WAIT_MS,
  echoDelayMs,
  useCoalescedRefresh,
} from "./echo-refresh";

/**
 * M193 — the coalescer is ONE module now, so this is the one suite that falsifies it. Both screens
 * (`TableCartProvider` on /menu, `Checkout` on /cart) call the same hook, and
 * `scripts/check-echo-coalesce.mjs` is what proves neither of them stopped.
 *
 * The arithmetic gets VALUE tests and the timer gets a render, because the two rules fail
 * differently: the quiet period is a latency question, and the deadline is the one that decides
 * whether a RECOVERY read ever happens on a busy table.
 */

describe("echoDelayMs — the quiet period and the deadline are two rules", () => {
  it("waits the full quiet period for a burst that has only just started", () => {
    expect(echoDelayMs(0)).toBe(ECHO_COALESCE_MS);
  });

  it("still waits the quiet period while the deadline is comfortably ahead", () => {
    // 600 - 300 = 300, which is larger than 150, so the quiet period is the binding term.
    expect(echoDelayMs(300)).toBe(ECHO_COALESCE_MS);
  });

  it("SHORTENS to whatever is left of the deadline once that is the tighter bound", () => {
    // The separating input: a fixture that only ever exercises fresh bursts cannot tell the two
    // terms apart, because the quiet period wins every time until the burst is 450 ms old.
    expect(echoDelayMs(ECHO_MAX_WAIT_MS - 40)).toBe(40);
  });

  it("fires immediately at the deadline", () => {
    expect(echoDelayMs(ECHO_MAX_WAIT_MS)).toBe(0);
  });

  it("never returns a negative delay past the deadline", () => {
    expect(echoDelayMs(ECHO_MAX_WAIT_MS + 5_000)).toBe(0);
  });
});

describe("useCoalescedRefresh — one read per burst, and never none", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("re-reads ONCE for a burst, not once per event", () => {
    const refresh = vi.fn();
    const { result } = renderHook(() => useCoalescedRefresh(refresh));

    act(() => {
      // The shape one add actually produces: the line INSERT, the cart touch, and the qty UPDATE
      // that follows a merge into an existing line.
      result.current();
      result.current();
      result.current();
    });
    expect(refresh).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(ECHO_COALESCE_MS);
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("re-reads under a SUSTAINED stream — a trailing debounce alone starves the recovery", () => {
    // Every gap is under the quiet period, so a debounce that only ever re-armed would postpone the
    // read forever. The read is a RECOVERY path (the "written, unreadable" heal, and T14's
    // stale-freeze correction), so a busy table is exactly when losing it costs.
    //
    // The bound is the DEADLINE, not "eventually": six ticks of 100 ms reaches exactly
    // ECHO_MAX_WAIT_MS, and the read must have happened by then however busy the channel still is.
    const refresh = vi.fn();
    const { result } = renderHook(() => useCoalescedRefresh(refresh));

    for (let i = 0; i < ECHO_MAX_WAIT_MS / 100; i += 1) {
      act(() => {
        result.current();
        vi.advanceTimersByTime(100);
      });
    }

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("survives the device clock jumping BACKWARD mid-burst", () => {
    // M226(c). The deadline is an ELAPSED DURATION, and a wall clock cannot measure one: an NTP
    // correction or a manual set moves `Date.now()` backward, `waitedMs` goes negative, and
    // `ECHO_MAX_WAIT_MS - waitedMs` then exceeds the quiet period — so `Math.min` picks the quiet
    // period on EVERY event, the deadline stops binding, and a stream of events under 150 ms apart
    // re-arms the timer forever. That starves the recovery read, which is the exact failure
    // ECHO_MAX_WAIT_MS exists to prevent, restored by a clock that went backwards.
    //
    // ⚠️ THE JUMP IS WHAT MAKES THIS TEST DISCRIMINATE, and it only does so because the two clocks
    // move independently under fake timers — MEASURED, not assumed: `vi.setSystemTime(t - 5000)`
    // moves `Date.now()` by -5000 and `performance.now()` by 0. So this case is green on
    // `performance.now()` and red on `Date.now()`, which is the whole point of it.
    const refresh = vi.fn();
    const { result } = renderHook(() => useCoalescedRefresh(refresh));

    // The burst opens, anchoring the deadline.
    act(() => {
      result.current();
      vi.advanceTimersByTime(100);
    });

    // The device clock lurches back an hour, mid-burst.
    act(() => {
      vi.setSystemTime(new Date(Date.now() - 3_600_000));
    });

    // The stream continues, every gap under the quiet period. The deadline must still bind.
    for (let i = 0; i < ECHO_MAX_WAIT_MS / 100; i += 1) {
      act(() => {
        result.current();
        vi.advanceTimersByTime(100);
      });
    }

    expect(refresh).toHaveBeenCalled();
  });

  it("starts a FRESH deadline once a burst has drained", () => {
    // The anchor reset inside the timer, and it needed a SEPARATING fixture: two bursts a tick apart
    // give the same delay whether or not the anchor survived, so the first draft of this test scored
    // green against the mutation. The idle gap is what separates them — with a stale anchor the
    // second burst is already past its deadline, so every echo reads IMMEDIATELY and the coalescer
    // is dead for the rest of the session.
    const refresh = vi.fn();
    const { result } = renderHook(() => useCoalescedRefresh(refresh));

    act(() => {
      result.current();
      vi.advanceTimersByTime(ECHO_COALESCE_MS);
    });
    expect(refresh).toHaveBeenCalledTimes(1);

    // A quiet minute at the table — longer than the deadline, which is the point.
    act(() => {
      vi.advanceTimersByTime(ECHO_MAX_WAIT_MS * 2);
    });

    act(() => {
      result.current();
      result.current();
      vi.advanceTimersByTime(ECHO_COALESCE_MS - 1);
    });
    // A stale anchor would have read 0 ms of budget left and fired both of these already.
    expect(refresh).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("DROPS a pending read when the reader changes — a cart switch must not paint the old cart", () => {
    // Codex round 2 on #275 (P2). The subtree stays mounted across a table switch, so an unmount-only
    // cleanup let a pending echo fire the PREVIOUS cart's reader after the new cart's first read.
    const oldCart = vi.fn();
    const newCart = vi.fn();
    const { result, rerender } = renderHook(({ r }) => useCoalescedRefresh(r), {
      initialProps: { r: oldCart },
    });

    act(() => {
      result.current();
    });
    rerender({ r: newCart });
    act(() => {
      vi.advanceTimersByTime(ECHO_MAX_WAIT_MS * 2);
    });

    expect(oldCart).not.toHaveBeenCalled();
    expect(newCart).not.toHaveBeenCalled();
  });

  it("cancels on unmount", () => {
    const refresh = vi.fn();
    const { result, unmount } = renderHook(() => useCoalescedRefresh(refresh));
    act(() => {
      result.current();
    });
    unmount();
    act(() => {
      vi.advanceTimersByTime(ECHO_MAX_WAIT_MS * 2);
    });
    expect(refresh).not.toHaveBeenCalled();
  });
});
