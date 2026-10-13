/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { OrderKitchenRead } from "./order-kitchen-read";

/**
 * Lifecycle audit (2026-10-13) — WHEN /track asks the kitchen again. The rules of what the lines mean
 * are pinned by value in lib/order-kitchen.test.ts; this pins the wiring: a return to the page re-reads
 * while a dish is still with the kitchen (iOS suspends the socket — the Served edge lands on return),
 * a change on the cart's channel re-reads, a decided `unreadable` drops the stages, and a failed read
 * after a good one keeps the good one.
 */
const reads: OrderKitchenRead[] = [];
const getOrderKitchen = vi.fn(() =>
  Promise.resolve(reads.shift() ?? ({ ok: false, reason: "error" } as const)),
);
vi.mock("./order-kitchen-read", () => ({ getOrderKitchen: () => getOrderKitchen() }));
vi.mock("./useAnonSession", () => ({ useAnonSession: () => ({ accessToken: "t", seat: "s" }) }));
let onCartChange: (() => void) | null = null;
vi.mock("./realtime", () => ({
  useCartRealtime: (cartId: string, _t: string, cb: () => void) => {
    onCartChange = cartId ? cb : null;
  },
}));

const { useOrderKitchen } = await import("./useOrderKitchen");

const ORDER = "11111111-1111-4111-8111-111111111111";
const NOW = "2026-10-13T19:00:00.000Z";
const cooking: OrderKitchenRead = {
  ok: true,
  cartId: "cart-1",
  dbNow: NOW,
  lines: [
    {
      id: "a",
      name: "Mohinga",
      qty: 1,
      lineState: "in_progress",
      fireAt: "2026-10-13T18:50:00.000Z",
      bumpedAt: null,
      fulfillment: "dinein",
    },
  ],
};
const served: OrderKitchenRead = {
  ...cooking,
  lines: [{ ...cooking.lines[0]!, lineState: "served", bumpedAt: "2026-10-13T18:55:00.000Z" }],
};

function wake() {
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
  });
}
const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 350));
  });

beforeEach(() => {
  reads.length = 0;
  getOrderKitchen.mockClear();
  onCartChange = null;
});
afterEach(() => cleanup());

describe("useOrderKitchen — when /track asks the kitchen again", () => {
  it("reads once on mount, then ONE coalesced re-read on a return to the page while a dish cooks", async () => {
    reads.push(cooking, served);
    const { result } = renderHook(() => useOrderKitchen(ORDER));
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(getOrderKitchen).toHaveBeenCalledTimes(1);
    // visibilitychange AND focus — one read. RED when the wake listener is gone.
    wake();
    await settle();
    expect(getOrderKitchen).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(result.current.status === "ready" && result.current.lines[0]?.lineState).toBe(
        "served",
      ),
    );
  });

  it("does NOT re-read on a return once every dish is Served", async () => {
    reads.push(served);
    const { result } = renderHook(() => useOrderKitchen(ORDER));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    wake();
    await settle();
    expect(getOrderKitchen).toHaveBeenCalledTimes(1);
  });

  it("re-reads on every change on the paid cart's channel", async () => {
    reads.push(cooking, served);
    const { result } = renderHook(() => useOrderKitchen(ORDER));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await waitFor(() => expect(onCartChange).not.toBeNull());
    act(() => onCartChange?.());
    await waitFor(() => expect(getOrderKitchen).toHaveBeenCalledTimes(2));
  });

  it("a decided `unreadable` drops the stages (the session closed: they would be a claim)", async () => {
    reads.push(cooking, { ok: false, reason: "unreadable" });
    const { result } = renderHook(() => useOrderKitchen(ORDER));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    wake();
    await settle();
    await waitFor(() => expect(result.current.status).toBe("unreadable"));
  });

  it("a FAILED read after a good one keeps the good one; a failed FIRST read says error and retries on wake", async () => {
    reads.push(cooking, { ok: false, reason: "error" });
    const { result } = renderHook(() => useOrderKitchen(ORDER));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    wake();
    await settle();
    expect(getOrderKitchen).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("ready");
    cleanup();
    getOrderKitchen.mockClear();
    reads.length = 0;
    reads.push({ ok: false, reason: "error" }, cooking);
    const second = renderHook(() => useOrderKitchen(ORDER));
    await waitFor(() => expect(second.result.current.status).toBe("error"));
    wake();
    await settle();
    await waitFor(() => expect(second.result.current.status).toBe("ready"));
  });

  it("asks nothing at all while no arm wants it", async () => {
    const { result } = renderHook(() => useOrderKitchen(null));
    expect(result.current.status).toBe("off");
    wake();
    await settle();
    expect(getOrderKitchen).not.toHaveBeenCalled();
  });
});
