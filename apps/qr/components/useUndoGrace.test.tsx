/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";

/**
 * Phase 3c-i (D15) — the send's undo window, lifted out of the leaf into a hook Checkout owns, so a
 * stage flip no longer destroys the only UI that can recall the send. Three invariants, each with a
 * mutant: the window is never shortened by a freeze; the undo targets exactly `batch`; `graceWrites`
 * never rejects. Observed through the hook's own state — never by reaching into an internal.
 */
const h = vi.hoisted(() => ({ undoFire: vi.fn() }));
vi.mock("@/lib/cart", () => ({ undoFire: h.undoFire, sendToKitchen: vi.fn() }));

const { useUndoGrace, FROZEN_NOTE, reasonCopy } = await import("./useUndoGrace");

afterEach(() => {
  cleanup();
  h.undoFire.mockReset();
  vi.useRealTimers();
});

const SERVER_NOW = "2026-10-04T12:00:00.000Z";
/** A send receipt whose server-MEASURED grace is 10 s, from a server clock far from this one. */
const receipt = (over: Partial<{ undoUntil: string | null; undoBatch: string | null }> = {}) => ({
  undoUntil: "2026-10-04T12:00:10.000Z",
  serverNow: SERVER_NOW,
  undoBatch: "batch-1",
  ...over,
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useUndoGrace — the window", () => {
  it("opens only with a batch AND a positive measured grace, counted from THIS device's receipt", () => {
    const { result } = renderHook(() => useUndoGrace());
    expect(result.current.deadlineMs).toBeNull();
    // MUTATION: open with the server's absolute `undoUntil` instead of receipt + measured grace —
    // a skewed device clock sees a window already closed (or one that never closes); red.
    act(() => result.current.open(receipt(), 1_000));
    expect(result.current.deadlineMs).toBe(11_000);
    expect(result.current.batch).toBe("batch-1");
    // Without a batch there is nothing an undo may target (S4-audit P1-3): no window.
    act(() => result.current.open(receipt({ undoBatch: null }), 1_000));
    expect(result.current.deadlineMs).toBeNull();
    // A non-positive grace is no window either.
    act(() => result.current.open(receipt({ undoUntil: SERVER_NOW }), 1_000));
    expect(result.current.deadlineMs).toBeNull();
  });

  it("a frozen tap is refused at the door and leaves deadlineMs UNCHANGED — the window is never shortened by a freeze", async () => {
    const say = vi.fn();
    const { result } = renderHook(() => useUndoGrace({ say }));
    act(() => result.current.open(receipt(), Date.now()));
    const before = result.current.deadlineMs;
    expect(before).not.toBeNull();
    // MUTATION (undo-grace/frozen-tap-closes-the-window): close the window on the refusal — the SQL
    // would still honour the undo once the lock clears, and the diner forfeits it; red.
    await act(async () => {
      await result.current.undo("cart-1", true);
    });
    expect(result.current.deadlineMs).toBe(before);
    expect(h.undoFire).not.toHaveBeenCalled();
    expect(result.current.message?.text).toBe(FROZEN_NOTE);
    expect(say).toHaveBeenCalledWith(expect.objectContaining({ text: FROZEN_NOTE }));
  });

  it("an undo targets exactly `batch`, and ok closes the window", async () => {
    h.undoFire.mockResolvedValue({ ok: true });
    const onChanged = vi.fn();
    const { result } = renderHook(() => useUndoGrace({ onChanged }));
    act(() => result.current.open(receipt({ undoBatch: "batch-7" }), Date.now()));
    await act(async () => {
      await result.current.undo("cart-1", false);
    });
    // MUTATION: target a batch other than the one this send minted — the host's Undo claws back a
    // guest's make-it-now line sharing the grace; red.
    expect(h.undoFire).toHaveBeenCalledWith("cart-1", "batch-7");
    expect(result.current.deadlineMs).toBeNull();
    expect(result.current.closedBy).toBe("undone");
    expect(result.current.message).toEqual({
      kind: "ok",
      text: "Brought back to your order — change it and send again.",
    });
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("`expired` closes the window with the kitchen line", async () => {
    h.undoFire.mockResolvedValue({ ok: false, reason: "expired" });
    const { result } = renderHook(() => useUndoGrace());
    act(() => result.current.open(receipt(), Date.now()));
    await act(async () => {
      await result.current.undo("cart-1", false);
    });
    // MUTATION (undo-grace/expired-keeps-the-window): leave the window open on `expired` — an Undo
    // that counts down over lines the kitchen already has; red.
    expect(result.current.deadlineMs).toBeNull();
    expect(result.current.closedBy).toBe("expired");
    expect(result.current.message?.text).toBe(
      "That’s already with the kitchen — ask a server to change it.",
    );
  });

  it("locked / rate_limited keep the window open and say why", async () => {
    const { result } = renderHook(() => useUndoGrace());
    act(() => result.current.open(receipt(), Date.now()));
    const before = result.current.deadlineMs;
    h.undoFire.mockResolvedValueOnce({ ok: false, reason: "locked" });
    await act(async () => {
      await result.current.undo("cart-1", false);
    });
    expect(result.current.deadlineMs).toBe(before);
    expect(result.current.message).toEqual({ kind: "err", text: reasonCopy.locked });
    h.undoFire.mockResolvedValueOnce({ ok: false, reason: "rate_limited" });
    await act(async () => {
      await result.current.undo("cart-1", false);
    });
    expect(result.current.deadlineMs).toBe(before);
    expect(result.current.message).toEqual({ kind: "err", text: reasonCopy.rate_limited });
  });

  it("graceWrites.current resolves only AFTER the undo (and its re-sync) — and never rejects on a thrown action", async () => {
    const fire = deferred<{ ok: true }>();
    h.undoFire.mockReturnValueOnce(fire.promise);
    const sync = deferred<void>();
    const onChanged = vi.fn(() => sync.promise);
    const { result } = renderHook(() => useUndoGrace({ onChanged }));
    act(() => result.current.open(receipt(), Date.now()));
    let undoPromise!: Promise<void>;
    act(() => {
      undoPromise = result.current.undo("cart-1", false);
    });
    expect(result.current.pending).toBe(true);
    let drained = false;
    void result.current.graceWrites.current.then(() => {
      drained = true;
    });
    await act(async () => {
      await Promise.resolve();
    });
    // MUTATION (undo-grace/undo-write-not-chained): run the undo OUTSIDE `graceWrites` — Pay's
    // drain resolves at once and a charge mints over lines that are about to come back; red.
    expect(drained).toBe(false);
    await act(async () => {
      fire.resolve({ ok: true });
      await Promise.resolve();
    });
    // Landed, but the re-sync the chain owns is still out: the drain still waits.
    expect(drained).toBe(false);
    await act(async () => {
      sync.resolve();
      await undoPromise;
    });
    expect(drained).toBe(true);
    expect(result.current.pending).toBe(false);

    // A thrown action is a message, never a rejection — each write owns its errors.
    h.undoFire.mockRejectedValueOnce(new Error("boom"));
    act(() => result.current.open(receipt(), Date.now()));
    await act(async () => {
      await result.current.undo("cart-1", false);
    });
    await expect(result.current.graceWrites.current).resolves.toBeUndefined();
    expect(result.current.message?.text).toBe("Couldn’t undo that just now — please try again.");
    // Uncertain outcome: the window is left to expire on its own.
    expect(result.current.deadlineMs).not.toBeNull();
  });

  it("the window and `pending` stay until the re-sync LANDS — the answer is said at once, the state that gates Pay moves with the view", async () => {
    h.undoFire.mockResolvedValue({ ok: true });
    const sync = deferred<void>();
    const onChanged = vi.fn(() => sync.promise);
    const say = vi.fn();
    const { result } = renderHook(() => useUndoGrace({ onChanged, say }));
    act(() => result.current.open(receipt(), Date.now()));
    let undoPromise!: Promise<void>;
    act(() => {
      undoPromise = result.current.undo("cart-1", false);
    });
    // The server has answered — the sentence is out and the re-read has been asked — but the read
    // has not landed.
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(say).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Brought back to your order — change it and send again." }),
    );
    // MUTATION (undo-grace/window-closes-before-the-re-sync): close and clear on the ANSWER — a
    // render with the window shut, nothing pending and the lines still `fired`: Pay live over
    // drafts the undo has just returned, for the whole round trip of the read; red.
    expect(result.current.deadlineMs).not.toBeNull();
    expect(result.current.pending).toBe(true);
    expect(result.current.isOpen()).toBe(true);
    expect(result.current.closedBy).toBeNull();
    await act(async () => {
      sync.resolve();
      await undoPromise;
    });
    expect(result.current.deadlineMs).toBeNull();
    expect(result.current.pending).toBe(false);
    expect(result.current.closedBy).toBe("undone");
  });

  it("the tick never closes a window whose undo is still answering — the window ends on the read, not the clock", async () => {
    vi.useFakeTimers();
    const fire = deferred<{ ok: true }>();
    h.undoFire.mockReturnValueOnce(fire.promise);
    const { result } = renderHook(() => useUndoGrace());
    act(() => result.current.open(receipt(), Date.now()));
    let undoPromise!: Promise<void>;
    act(() => {
      undoPromise = result.current.undo("cart-1", false);
    });
    // Past the deadline while the undo is in flight.
    act(() => {
      vi.advanceTimersByTime(10_500);
    });
    // MUTATION (undo-grace/tick-closes-a-window-mid-undo): the tick closes it as "elapsed" — the
    // Bill says "Ready to pay." over an undo that is about to put the dishes back; red.
    expect(result.current.remaining).toBe(0);
    expect(result.current.deadlineMs).not.toBeNull();
    expect(result.current.isOpen()).toBe(true);
    expect(result.current.closedBy).toBeNull();
    await act(async () => {
      fire.resolve({ ok: true });
      await undoPromise;
    });
    expect(result.current.deadlineMs).toBeNull();
    expect(result.current.closedBy).toBe("undone");
  });

  it("the 250 ms tick closes the window when it elapses, and is cleared on unmount", () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useUndoGrace());
    act(() => result.current.open(receipt(), Date.now()));
    expect(result.current.remaining).toBe(10);
    act(() => {
      vi.advanceTimersByTime(4_000);
    });
    expect(result.current.remaining).toBe(6);
    act(() => {
      vi.advanceTimersByTime(6_250);
    });
    expect(result.current.deadlineMs).toBeNull();
    expect(result.current.closedBy).toBe("elapsed");
    expect(vi.getTimerCount()).toBe(0);
    // A window open at unmount takes its interval with it.
    act(() => result.current.open(receipt(), Date.now()));
    expect(vi.getTimerCount()).toBe(1);
    // MUTATION (undo-grace/interval-survives-unmount): drop the effect's cleanup — a settle/lock
    // flip that unmounts mid-grace leaves a timer setting state on a dead component; red.
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
