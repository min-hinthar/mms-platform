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
const h = vi.hoisted(() => ({ readMyLiveOrders: vi.fn() }));
vi.mock("./orders", () => ({ readMyLiveOrders: h.readMyLiveOrders }));

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
  h.readMyLiveOrders.mockResolvedValue({ ok: true, orders: [ORDER] });
});
afterEach(() => {
  cleanup();
  h.readMyLiveOrders.mockReset();
});

describe("useLiveOrders without a seed — the AppHeader call, unchanged", () => {
  it("starts empty and loading, then loads on mount", async () => {
    render(<Probe enabled poke="a" />);
    expect(probe()).toBe("loading:0");
    await waitFor(() => expect(probe()).toBe("idle:1"));
    expect(h.readMyLiveOrders).toHaveBeenCalledTimes(1);
  });

  it("reloads when pokeKey changes", async () => {
    const { rerender } = render(<Probe enabled poke="a" />);
    await waitFor(() => expect(h.readMyLiveOrders).toHaveBeenCalledTimes(1));
    rerender(<Probe enabled poke="b" />);
    await waitFor(() => expect(h.readMyLiveOrders).toHaveBeenCalledTimes(2));
  });

  it("does nothing while disabled", async () => {
    render(<Probe enabled={false} poke="a" />);
    expect(probe()).toBe("idle:0");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });
    expect(h.readMyLiveOrders).not.toHaveBeenCalled();
  });
});

describe("useLiveOrders with a seed — /account's live row (blind review)", () => {
  const A = { id: "a" } as LiveOrder;
  const B = { id: "b" } as LiveOrder;
  function Seeded({ initial }: { initial: LiveOrder[] }) {
    const { orders } = useLiveOrders(true, null, initial);
    return <p data-testid="seeded">{orders.map((o) => o.id).join(",") || "none"}</p>;
  }
  const seeded = () => screen.getByTestId("seeded").textContent;
  const wake = () =>
    act(async () => {
      window.dispatchEvent(new Event("focus"));
      await new Promise((r) => setTimeout(r, 60));
    });

  it("a FAILED read keeps the last good list — the only order status on /account never blinks out", async () => {
    // RED when a failure is applied as an empty list: `getMyLiveOrders` swallows every read error
    // into [], so the wake refetch erased the section on a transient blip.
    h.readMyLiveOrders.mockResolvedValue({ ok: false, orders: [] });
    render(<Seeded initial={[A]} />);
    await wake();
    expect(h.readMyLiveOrders).toHaveBeenCalledTimes(1);
    expect(seeded()).toBe("a");
  });

  it("a NEW server snapshot supersedes a read already in flight (M225's rule)", async () => {
    // RED without the invalidation: the older response lands after the fresh snapshot and
    // overwrites it — after a sign-in refresh, possibly the previous uid's orders.
    let land: (v: { ok: true; orders: LiveOrder[] }) => void = () => {};
    h.readMyLiveOrders.mockReturnValue(
      new Promise((resolve) => {
        land = resolve;
      }),
    );
    const { rerender } = render(<Seeded initial={[A]} />);
    await wake(); // a read is now in flight
    rerender(<Seeded initial={[B]} />);
    expect(seeded()).toBe("b");
    await act(async () => {
      land({ ok: true, orders: [A] });
      await Promise.resolve();
    });
    expect(seeded()).toBe("b");
  });
});
