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

const { LIVE_ORDERS_POLL_MS, useLiveOrders } = await import("./useLiveOrders");
const { READY_BAG_POLL_MS } = await import("./live-order");

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

describe("useLiveOrders — J, a re-poll for every caller, gated by the moving rule alone (lifecycle audit)", () => {
  // The header's tray rows and its cross-device chip, and /account "Today", have no realtime of their
  // own; the gate is `liveOrdersMoving` — fired and not Ready — and nothing else (the second capped
  // pass on #359: an opt-in left the header's tray frozen).
  const cooking = {
    id: "c",
    hasTogoFood: true,
    togoStatus: "preparing",
    fireAt: null,
  } as LiveOrder;
  const ready = { id: "r", hasTogoFood: true, togoStatus: "ready", fireAt: null } as LiveOrder;
  const heldFor = (ms: number) =>
    ({
      id: "h",
      hasTogoFood: true,
      togoStatus: "preparing",
      fireAt: new Date(Date.now() + ms).toISOString(),
    }) as LiveOrder;
  function Seeded({ initial }: { initial: LiveOrder[] }) {
    const { orders } = useLiveOrders(true, null, initial);
    return <p data-testid="polled">{orders.map((o) => o.id).join(",") || "none"}</p>;
  }
  const tick = (n = 1) =>
    act(async () => {
      vi.advanceTimersByTime(LIVE_ORDERS_POLL_MS * n);
      await Promise.resolve();
    });
  afterEach(() => vi.useRealTimers());

  it("/account Today re-reads every LIVE_ORDERS_POLL_MS while a fired bag is cooking", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    h.readMyLiveOrders.mockResolvedValue({ ok: true, orders: [cooking] });
    render(<Seeded initial={[cooking]} />);
    expect(h.readMyLiveOrders).not.toHaveBeenCalled(); // the seed is fresh — no mount read
    await tick();
    // RED when nothing polls: the Ready edge waited for a tab switch.
    expect(h.readMyLiveOrders).toHaveBeenCalledTimes(1);
  });

  it("the HEADER's call (no seed) re-reads too while a fired bag isn't Ready — its tray has no feed", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "requestAnimationFrame"] });
    h.readMyLiveOrders.mockResolvedValue({ ok: true, orders: [cooking] });
    render(<Probe enabled poke="a" />);
    await act(async () => {
      vi.advanceTimersToNextFrame();
      await Promise.resolve();
    });
    await waitFor(() => expect(probe()).toBe("idle:1"));
    const mountReads = h.readMyLiveOrders.mock.calls.length;
    await tick();
    // RED when the timer is opt-in (or /account's alone): the header's tray froze on "Preparing".
    expect(h.readMyLiveOrders.mock.calls.length).toBe(mountReads + 1);
  });

  it("reads NOTHING on a timer while every order is held or at rest — header or /account", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "requestAnimationFrame"] });
    h.readMyLiveOrders.mockResolvedValue({
      ok: true,
      orders: [ready, heldFor(24 * 60 * 60 * 1000)],
    });
    render(<Probe enabled poke="a" />);
    await act(async () => {
      vi.advanceTimersToNextFrame();
      await Promise.resolve();
    });
    await waitFor(() => expect(probe()).toBe("idle:2"));
    const mountReads = h.readMyLiveOrders.mock.calls.length;
    await tick(3);
    expect(h.readMyLiveOrders.mock.calls.length).toBe(mountReads);
  });

  it("a READY bag is still re-read, at the slower READY_BAG_POLL_MS — its hand-off is the server dropping it (Codex on #359)", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    vi.setSystemTime(Date.parse("2026-10-13T21:00:00.000Z"));
    h.readMyLiveOrders.mockResolvedValue({ ok: true, orders: [] }); // the expo marked it picked up
    render(<Seeded initial={[ready]} />);
    const ticksPerRead = READY_BAG_POLL_MS / LIVE_ORDERS_POLL_MS;
    await tick(ticksPerRead - 1); // inside the slower cadence: nothing read
    expect(h.readMyLiveOrders).not.toHaveBeenCalled();
    // RED when a Ready bag stops every tick: "Ready for pickup" stood after the hand-off until a
    // focus or visibility event, because nothing pushes the picked_up transition to this list.
    await tick();
    expect(h.readMyLiveOrders).toHaveBeenCalledTimes(1);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("polled").textContent).toBe("none");
  });

  it("never reads a Ready bag while the tab is hidden", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    vi.setSystemTime(Date.parse("2026-10-13T21:00:00.000Z"));
    const vis = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    render(<Seeded initial={[ready]} />);
    await tick((READY_BAG_POLL_MS / LIVE_ORDERS_POLL_MS) * 3);
    expect(h.readMyLiveOrders).not.toHaveBeenCalled();
    vis.mockRestore();
  });

  it("a HELD pickup starts the reads by itself once its fire_at passes", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    vi.setSystemTime(Date.parse("2026-10-13T21:00:00.000Z"));
    const held = heldFor(45_000); // fires 45 s from now
    h.readMyLiveOrders.mockResolvedValue({ ok: true, orders: [held] });
    render(<Seeded initial={[held]} />);
    await tick(); // 30 s: still held — nothing read
    expect(h.readMyLiveOrders).not.toHaveBeenCalled();
    await tick(); // 60 s: past fire_at — the tick reads by itself. RED when the gate ignores the clock.
    expect(h.readMyLiveOrders).toHaveBeenCalledTimes(1);
  });
});
