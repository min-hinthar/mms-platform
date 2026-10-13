/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";

/**
 * PD3 (Codex r1 on #330, P1) — the live read can LOSE the row it once had: the 4-hour session sweeps
 * (or the table clears), RLS hides the order, and a later read answers no row while `order` still
 * holds the last live snapshot. That snapshot is not live any more — the host must know, or a
 * far-booked pickup stays at Booked for ever on a page that believes it is subscribed.
 */
/** Each read's answer: a row, no row, or a failed read. */
const answers: ({ id: string } | null | "error")[] = [];
/** How many reads the hook has made, and the channel's status callback (the socket's (re)joins). */
let reads = 0;
let onStatus: ((status: string) => void) | null = null;
/** The session the hook reads. Replacing the object is what a Supabase token refresh does. */
let anon = { accessToken: "t1", seat: "s" };
vi.mock("./useAnonSession", () => ({ useAnonSession: () => anon }));
vi.mock("@mms/db", () => ({
  browserClient: () => ({
    realtime: { setAuth: () => {} },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => {
            reads += 1;
            const a = answers.shift() ?? null;
            return Promise.resolve(
              a === "error"
                ? { data: null, error: { message: "fetch failed" } }
                : { data: a, error: null },
            );
          },
        }),
      }),
    }),
    channel: () => {
      const ch = {
        on: () => ch,
        subscribe: (cb?: (status: string) => void) => {
          onStatus = cb ?? null;
          return ch;
        },
      };
      return ch;
    },
    removeChannel: () => {},
  }),
}));
vi.mock("./track-order", () => ({
  TRACK_ORDER_SELECT: "id",
  shapeTrackedOrder: (d: { id: string }) => ({ id: d.id }),
}));

const { useOrderStatus } = await import("./useOrderStatus");
const ORDER_ID = "11111111-1111-4111-8111-111111111111";
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  answers.length = 0;
  reads = 0;
  onStatus = null;
  anon = { accessToken: "t1", seat: "s" };
});

describe("useOrderStatus — a row that goes dark is stale, not still live", () => {
  it("delivers the row, then marks it stale when a later read answers none, keeping the snapshot", async () => {
    answers.push({ id: "o1" }, null);
    const { result } = renderHook(() => useOrderStatus("pi_1"));
    await waitFor(() => expect(result.current.order?.id).toBe("o1"));
    expect(result.current.stale).toBe(false);
    // RED when a null read after a delivered row is treated as "not fulfilled yet".
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.stale).toBe(true));
    expect(result.current.order?.id).toBe("o1");
    expect(result.current.timedOut).toBe(false);
  });

  it("a FAILED read after a delivered row is not a lapse — the row stays live (critical, second blind pass)", async () => {
    // Only a read that SUCCEEDED and found no row means the session lapsed. An errored read used to
    // fall into that arm, flip `stale`, and hand the page an older snapshot (Ready → an earlier
    // stage). MUTATION: let an errored read reach the stale arm.
    answers.push({ id: "o1" }, "error", null);
    const { result } = renderHook(() => useOrderStatus("pi_1"));
    await waitFor(() => expect(result.current.order?.id).toBe("o1"));
    act(() => result.current.refresh());
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.stale).toBe(false);
    expect(result.current.order?.id).toBe("o1");
    // …and a real lapse (a successful read, no row) is still noticed.
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.stale).toBe(true));
  });

  it("remembers the delivered row across a token refresh — the lapse still reads stale", async () => {
    // A refresh hands back a new session object and re-runs the subscription; a per-run flag forgot
    // the row had been delivered, so the lapse read as "not fulfilled yet" and the page never fell
    // back. MUTATION-shaped: key the "seen" fact to the effect run instead of the order key.
    answers.push({ id: "o1" }, null);
    const { result, rerender } = renderHook(() => useOrderStatus("pi_1"));
    await waitFor(() => expect(result.current.order?.id).toBe("o1"));
    anon = { accessToken: "t2", seat: "s" };
    rerender();
    await waitFor(() => expect(result.current.stale).toBe(true));
    expect(result.current.order?.id).toBe("o1");
  });
});

describe("useOrderStatus — F, it catches up after a gap on its own (lifecycle audit, 2026-10-13)", () => {
  // Postgres Changes are not replayed: an expo Ready that lands while iOS has the socket suspended,
  // or during a Wi-Fi → LTE rejoin, is gone. Every consumer (the rail, the pill, the home card)
  // depended on a read that only the pickup page ever made.
  async function mounted() {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    answers.push({ id: "o1" });
    const hook = renderHook(() => useOrderStatus("pi_1"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(hook.result.current.order?.id).toBe("o1");
    expect(reads).toBe(1);
    // Past the one-second coalescing window of the mount's own read.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    return hook;
  }

  it("ONE read on a return to the page (visibilitychange + focus coalesced)", async () => {
    await mounted();
    answers.push({ id: "o1" });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    // RED when the hook has no wake of its own.
    expect(reads).toBe(2);
  });

  it("a read on the channel's RE-join — never on its first join (the mount's read covers that)", async () => {
    await mounted();
    act(() => onStatus?.("SUBSCRIBED"));
    expect(reads).toBe(1);
    answers.push({ id: "o1" });
    await act(async () => {
      onStatus?.("SUBSCRIBED");
      await vi.advanceTimersByTimeAsync(0);
    });
    // RED when a re-join reads nothing: the Ready edge lost in the gap stays lost.
    expect(reads).toBe(2);
  });

  it("skips a catch-up that would duplicate a read begun within the last second", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    answers.push({ id: "o1" });
    const { result } = renderHook(() => useOrderStatus("pi_1"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    act(() => onStatus?.("SUBSCRIBED"));
    answers.push({ id: "o1" });
    act(() => result.current.refresh()); // the host's own wake read
    act(() => onStatus?.("SUBSCRIBED")); // a re-join right behind it
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(reads).toBe(2);
  });
});

describe("useOrderStatus — F, an order KNOWN to exist that a read cannot see is stale at once (the blind pass on #359)", () => {
  it("known: the FIRST successful empty read of a fresh subscription is stale — no ten polls to 'Placed'", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    answers.push(null);
    const { result } = renderHook(() => useOrderStatus(null, ORDER_ID, { known: true }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    // RED without the arm: the header after a cleared table polled to `timedOut` and never set stale.
    expect(result.current.stale).toBe(true);
    expect(result.current.timedOut).toBe(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(reads).toBe(1); // no poll behind it
  });

  it("known: a FAILED read is not 'gone' — it retries, never stale", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    answers.push("error", { id: ORDER_ID });
    const { result } = renderHook(() => useOrderStatus(null, ORDER_ID, { known: true }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.stale).toBe(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    expect(result.current.order?.id).toBe(ORDER_ID);
  });

  it("NOT known (a fresh Stripe return racing the webhook): an empty read polls, as before", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    answers.push(null, { id: "o1" });
    const { result } = renderHook(() => useOrderStatus("pi_1"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.stale).toBe(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    expect(result.current.order?.id).toBe("o1");
  });
});
