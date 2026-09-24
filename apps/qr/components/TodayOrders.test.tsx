/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import type { LiveOrder } from "@/lib/live-order";

/**
 * Phase 1c · account-star — /account's "Your live orders" moved to the TOP of the page, which only
 * makes sense if it is FRESH: a snapshot called "live" at position one is a lie the moment a Ready
 * lands. So it is seeded by the server read (no fetch, no flash on mount), refreshed on a
 * hidden→visible wake — which is exactly the email-code round trip to Mail and back — and replaced by
 * any new server snapshot (router.refresh after a sign-in or a merge).
 */
const h = vi.hoisted(() => ({ readMyLiveOrders: vi.fn() }));
vi.mock("@/lib/orders", () => ({ readMyLiveOrders: h.readMyLiveOrders }));
vi.mock("./nav/TransitionNav", () => ({
  TransitionLink: ({
    href,
    children,
    "aria-label": label,
  }: {
    href: string;
    children?: React.ReactNode;
    "aria-label"?: string;
  }) => (
    <a href={href} aria-label={label}>
      {children}
    </a>
  ),
}));

const { TodayOrders } = await import("./TodayOrders");
const { AccountLiveOrders } = await import("./AccountLiveOrders");

const row = (o: Partial<LiveOrder>): LiveOrder => ({
  id: "order-1",
  kind: "togo",
  statusWord: "Preparing",
  togoStatus: "preparing",
  tableNumber: null,
  pickupSlot: null,
  createdAt: "2026-09-24T10:00:00.000Z",
  hasTogoFood: true,
  hasGrocery: false,
  arrivedAt: null,
  paymentIntent: "pi_1",
  cartId: null,
  ...o,
});

/** "Today" as the page mounts it: inside the ONE live-orders provider. */
const today = (orders: LiveOrder[]) => (
  <AccountLiveOrders initial={orders}>
    <TodayOrders />
  </AccountLiveOrders>
);

/** Real frames: the hook defers its mount load a rAF, and the wake is coalesced over 50ms. */
const frames = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 80));
  });

beforeEach(() => {
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
});
afterEach(() => {
  cleanup();
  h.readMyLiveOrders.mockReset();
});

describe("TodayOrders — seeded, then kept fresh", () => {
  it("renders the server snapshot with NO fetch on mount", async () => {
    // RED when the seeded mount fetch is not skipped.
    render(today([row({})]));
    expect(screen.getByText("Preparing")).toBeTruthy();
    await frames();
    expect(h.readMyLiveOrders).not.toHaveBeenCalled();
  });

  it("a hidden→visible wake refetches, and the status word updates", async () => {
    // RED when the wake refetch is removed — the word stays "Preparing" after the order is Ready.
    render(today([row({})]));
    await frames();
    h.readMyLiveOrders.mockResolvedValue({
      ok: true,
      orders: [row({ statusWord: "Ready", togoStatus: "ready" })],
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(screen.getByText("Ready")).toBeTruthy());
    expect(h.readMyLiveOrders).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Preparing")).toBeNull();
  });

  it("a new server snapshot replaces the list", () => {
    // RED when the prop change is ignored (the seeded list sticks after router.refresh).
    const { rerender } = render(today([row({})]));
    rerender(today([row({ id: "order-2", statusWord: "Ready for pickup" })]));
    expect(screen.getByText("Ready for pickup")).toBeTruthy();
    expect(screen.queryByText("Preparing")).toBeNull();
  });

  it("renders nothing when nothing is live", () => {
    const { container } = render(today([]));
    expect(container.innerHTML).toBe("");
  });
});
