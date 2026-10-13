/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ActiveOrder } from "./ActiveOrderProvider";

/**
 * F, through the REAL read (the blind pass on #359: the first suite only mocked `stale: true`). A
 * cleared table, as it happens: the pill is off on /track, so after the clear the header mounts a
 * FRESH `useOrderStatus` whose first read finds no row (`is_member` lapsed with the session). Nothing
 * here mocks `useOrderStatus` — the browser client answers an empty, SUCCESSFUL read, and the hook's
 * own branches decide. The pointer must retire (a dine-in table's clear is the end of its meal), not
 * poll to "Placed" and live out its TTL; a Stripe return still racing the webhook must not.
 */
let reads = 0;
vi.mock("@mms/db", () => ({
  browserClient: () => ({
    realtime: { setAuth: () => {} },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => {
            reads += 1;
            return Promise.resolve({ data: null, error: null });
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
const anon = { accessToken: "t", seat: "s" };
vi.mock("@/lib/useAnonSession", () => ({ useAnonSession: () => anon }));
let stored: ActiveOrder;
const clearOrder = vi.fn();
vi.mock("./ActiveOrderProvider", () => ({
  useActiveOrder: () => ({ order: stored, clearOrder }),
}));
const ORDER_ID = "11111111-1111-4111-8111-111111111111";
vi.mock("@/lib/order-actions", () => ({ resolveSplitOrderId: () => Promise.resolve(ORDER_ID) }));

const { useActiveOrderStatus } = await import("./useActiveOrderStatus");

const settle = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
  });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  reads = 0;
  clearOrder.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useActiveOrderStatus — a cleared table retires the pill through the real empty read", () => {
  it("a COUNTER-paid dine-in pointer (cart branch, resolved id) is finished on its first empty read", async () => {
    stored = { paymentIntent: null, cartId: "c1", mode: "dinein", createdAt: Date.now() };
    const { result } = renderHook(() => useActiveOrderStatus(true));
    await settle();
    expect(reads).toBe(1);
    // RED without `known`: ten polls, `timedOut`, "Placed" — and the pointer lives its whole TTL.
    expect(result.current.isDone).toBe(true);
    await settle();
    expect(clearOrder).toHaveBeenCalled();
  });

  it("a single-pay pointer /track has SEEN land (`landed`) reads the same way", async () => {
    stored = {
      paymentIntent: "pi_1",
      cartId: null,
      mode: "dinein",
      createdAt: Date.now(),
      landed: true,
    };
    const { result } = renderHook(() => useActiveOrderStatus(true));
    await settle();
    expect(result.current.isDone).toBe(true);
  });

  it("a fresh Stripe return (not landed) racing the webhook is NOT finished by an empty read", async () => {
    stored = { paymentIntent: "pi_1", cartId: null, mode: "dinein", createdAt: Date.now() };
    const { result } = renderHook(() => useActiveOrderStatus(true));
    await settle();
    expect(result.current.isDone).toBe(false);
    expect(result.current.statusWord).toBe("Confirming");
    expect(clearOrder).not.toHaveBeenCalled();
  });

  it("a landed PICKUP pointer that cannot be read drops to 'Placed' and stays (its bag may wait)", async () => {
    stored = {
      paymentIntent: "pi_1",
      cartId: null,
      mode: "pickup",
      createdAt: Date.now(),
      landed: true,
    };
    const { result } = renderHook(() => useActiveOrderStatus(true));
    await settle();
    expect(result.current.isDone).toBe(false);
    expect(result.current.statusWord).toBe("Placed");
  });
});
