/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import type { LiveOrder } from "./live-order";

/**
 * Phase 1c · account-star added an optional `initial` seed to `useLiveOrders` for /account's live
 * row. The header (AppHeader) calls it WITHOUT one, and must behave exactly as before: an empty start
 * with `loading` true, a load on mount, a reload whenever `pokeKey` changes, and nothing at all when
 * disabled. This pins the unseeded contract so the seed cannot quietly change it.
 */
const h = vi.hoisted(() => ({ getMyLiveOrders: vi.fn() }));
vi.mock("./orders", () => ({ getMyLiveOrders: h.getMyLiveOrders }));

const { useLiveOrders } = await import("./useLiveOrders");

const ORDER = { id: "o1" } as LiveOrder;

function Probe({ enabled, poke }: { enabled: boolean; poke?: string | null }) {
  const { orders, loading } = useLiveOrders(enabled, poke);
  return (
    <p data-testid="probe">
      {loading ? "loading" : "idle"}:{orders.length}
    </p>
  );
}
const probe = () => screen.getByTestId("probe").textContent;

beforeEach(() => {
  h.getMyLiveOrders.mockResolvedValue([ORDER]);
});
afterEach(() => {
  cleanup();
  h.getMyLiveOrders.mockReset();
});

describe("useLiveOrders without a seed — the AppHeader call, unchanged", () => {
  it("starts empty and loading, then loads on mount", async () => {
    render(<Probe enabled poke="a" />);
    expect(probe()).toBe("loading:0");
    await waitFor(() => expect(probe()).toBe("idle:1"));
    expect(h.getMyLiveOrders).toHaveBeenCalledTimes(1);
  });

  it("reloads when pokeKey changes", async () => {
    const { rerender } = render(<Probe enabled poke="a" />);
    await waitFor(() => expect(h.getMyLiveOrders).toHaveBeenCalledTimes(1));
    rerender(<Probe enabled poke="b" />);
    await waitFor(() => expect(h.getMyLiveOrders).toHaveBeenCalledTimes(2));
  });

  it("does nothing while disabled", async () => {
    render(<Probe enabled={false} poke="a" />);
    expect(probe()).toBe("idle:0");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });
    expect(h.getMyLiveOrders).not.toHaveBeenCalled();
  });
});
