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
  useActiveOrder: () => ({ order: stored, clearOrder, noteTrackedOrder: () => {} }),
}));
const ORDER_ID = "11111111-1111-4111-8111-111111111111";
vi.mock("@/lib/order-actions", () => ({ resolveSplitOrderId: () => Promise.resolve(ORDER_ID) }));

const { useActiveOrderStatus } = await import("./useActiveOrderStatus");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  reads = 0;
  clearOrder.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Let the hook live a while longer and keep its history — a verdict that would flip later shows. */
const linger = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(5_000);
  });

describe("useActiveOrderStatus — a cleared table retires the pill through the real empty read", () => {
  it("a COUNTER-paid PURE dine-in pointer (cart branch) /track saw land is finished on its first empty read", async () => {
    stored = {
      paymentIntent: null,
      cartId: "c1",
      mode: "dinein",
      createdAt: Date.now(),
      landed: { kind: "dinein", hasTogoFood: false },
    };
    const { result } = renderHook(() => useActiveOrderStatus(true));
    // RED without `known`: ten polls, `timedOut`, "Placed" — and the pointer lives its whole TTL.
    await vi.waitFor(() => expect(clearOrder).toHaveBeenCalled());
    expect(result.current.isDone).toBe(true);
    expect(reads).toBe(1);
  });

  it("a single-pay PURE dine-in pointer /track saw land reads the same way", async () => {
    stored = {
      paymentIntent: "pi_1",
      cartId: null,
      mode: "dinein",
      createdAt: Date.now(),
      landed: { kind: "dinein", hasTogoFood: false },
    };
    const { result } = renderHook(() => useActiveOrderStatus(true));
    await vi.waitFor(() => expect(result.current.isDone).toBe(true));
  });

  it("an ALL-TO-GO order placed at a dine-in table (door 'dinein', row 'togo') SURVIVES — its bag still cooks", async () => {
    // The second capped pass on #359: the device's door is not the order's kind. RED when the fate
    // is read off `mode`: the clear deletes the pointer while the bag is still on the wok.
    stored = {
      paymentIntent: null,
      cartId: "c1",
      mode: "dinein",
      createdAt: Date.now(),
      landed: { kind: "togo", hasTogoFood: true },
    };
    const { result } = renderHook(() => useActiveOrderStatus(true));
    await vi.waitFor(() => expect(result.current.statusWord).toBe("Placed"));
    await linger();
    expect(result.current.isDone).toBe(false);
    expect(clearOrder).not.toHaveBeenCalled();
  });

  it("a stale pointer with NO recorded row goes quiet ('Placed') and is never cleared", async () => {
    stored = { paymentIntent: null, cartId: "c1", mode: "dinein", createdAt: Date.now() };
    const { result } = renderHook(() => useActiveOrderStatus(true));
    await vi.waitFor(() => expect(result.current.statusWord).toBe("Placed"));
    await linger();
    expect(result.current.isDone).toBe(false);
    expect(clearOrder).not.toHaveBeenCalled();
  });

  it("a fresh Stripe return (not landed) racing the webhook is NOT finished by an empty read", async () => {
    stored = { paymentIntent: "pi_1", cartId: null, mode: "dinein", createdAt: Date.now() };
    const { result } = renderHook(() => useActiveOrderStatus(true));
    // History, not a moment: past the poll's 3 s the hook has read again (the first empty read's
    // verdict was "not yet"), and still nothing is finished.
    await linger();
    expect(reads).toBeGreaterThanOrEqual(2);
    expect(result.current.isDone).toBe(false);
    expect(result.current.statusWord).toBe("Confirming");
    expect(clearOrder).not.toHaveBeenCalled();
  });
});
