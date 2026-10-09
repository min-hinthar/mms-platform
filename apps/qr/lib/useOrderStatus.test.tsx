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
      const ch = { on: () => ch, subscribe: () => ch };
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
afterEach(() => {
  cleanup();
  answers.length = 0;
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
