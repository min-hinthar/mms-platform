/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { TrackedOrder } from "@/lib/track-order";

/**
 * Lifecycle audit (2026-10-13), F and C — the pill's and the home card's status for the device's own
 * order. `useOrderStatus` marks a read STALE when the row it had goes dark (the session closed or
 * lapsed); this hook ignored it, so a dine-in table cleared and left read "At your table" (pill) and
 * "In progress" (home card) for the rest of the 4 h TTL. And a cash refund to the last cent — which
 * leaves `status` 'paid' — never retired the order. The rules are pinned by value in
 * lib/live-order.test.ts / lib/track-settled.test.ts; this pins that the hook OBEYS them.
 */
let status: { order: TrackedOrder | null; timedOut: boolean; stale: boolean } = {
  order: null,
  timedOut: false,
  stale: false,
};
vi.mock("@/lib/useOrderStatus", () => ({
  useOrderStatus: () => ({ ...status, refresh: () => {} }),
}));
const clearOrder = vi.fn();
vi.mock("./ActiveOrderProvider", () => ({
  useActiveOrder: () => ({
    order: { paymentIntent: "pi_1", cartId: "c1", mode: "dinein", createdAt: Date.now() },
    clearOrder,
  }),
}));
vi.mock("@/lib/order-actions", () => ({ resolveSplitOrderId: () => Promise.resolve(null) }));

const { useActiveOrderStatus } = await import("./useActiveOrderStatus");

function tracked(over: Partial<TrackedOrder>): TrackedOrder {
  return {
    id: "o1",
    status: "paid",
    totalCents: 4200,
    itemCount: 2,
    pickupSlot: null,
    fireAt: null,
    togoStatus: null,
    hasTogoFood: false,
    hasDineInFood: true,
    arrivedAt: null,
    hasGrocery: false,
    tableNumber: 4,
    lines: [],
    breakdown: {
      subtotalCents: 3800,
      discountCents: 0,
      serviceChargeCents: 0,
      taxCents: 400,
      tipCents: 0,
    },
    refund: { state: "none", refundedCents: 0, netPaidCents: 4200 },
    dropped: { count: 0, lines: [] },
    tender: "cash",
    createdAt: "2026-10-13T18:00:00.000Z",
    customerName: null,
    togoReadyAt: null,
    togoPickedUpAt: null,
    ...over,
  };
}

beforeEach(() => {
  clearOrder.mockReset();
  status = { order: null, timedOut: false, stale: false };
});
afterEach(cleanup);

describe("useActiveOrderStatus — a stale read is not a live status", () => {
  it("a live dine-in order reads At your table", () => {
    status = { order: tracked({}), timedOut: false, stale: false };
    const { result } = renderHook(() => useActiveOrderStatus(true));
    expect(result.current.statusWord).toBe("At your table");
    expect(result.current.isDone).toBe(false);
  });

  it("a STALE dine-in order is finished — the pill and home card retire it", async () => {
    status = { order: tracked({}), timedOut: false, stale: true };
    const { result } = renderHook(() => useActiveOrderStatus(true));
    // RED when `stale` is ignored: "At your table" for a meal eaten hours ago.
    expect(result.current.isDone).toBe(true);
    await waitFor(() => expect(clearOrder).toHaveBeenCalled());
  });

  it("a STALE pickup drops to the honest floor, not its last word, and is not retired", () => {
    status = {
      order: tracked({
        hasDineInFood: false,
        hasTogoFood: true,
        pickupSlot: "2026-10-14T01:20:00.000Z",
        togoStatus: "ready",
        tableNumber: null,
      }),
      timedOut: false,
      stale: true,
    };
    const { result } = renderHook(() => useActiveOrderStatus(true));
    expect(result.current.statusWord).toBe("Placed");
    expect(result.current.ready).toBe(false);
    expect(result.current.isDone).toBe(false);
    expect(clearOrder).not.toHaveBeenCalled();
  });

  it("C — a cash refund to the last cent retires the order though status still reads 'paid'", async () => {
    status = {
      order: tracked({ refund: { state: "full", refundedCents: 4200, netPaidCents: 0 } }),
      timedOut: false,
      stale: false,
    };
    const { result } = renderHook(() => useActiveOrderStatus(true));
    expect(result.current.isDone).toBe(true);
    await waitFor(() => expect(clearOrder).toHaveBeenCalled());
  });
});
