/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";

/**
 * Phase 3c-i (D15) — the send's undo window, lifted out of the leaf into a hook Checkout owns, so a
 * stage flip no longer destroys the only UI that can recall the send. Three invariants, each with a
 * mutant: the window is never shortened by a freeze; the undo targets exactly `batch`; `graceWrites`
 * never rejects — and J37's fourth: a REJECTED undo never opens the gate on the clock. J34 moved the
 * seconds count out of the hook's host into `useGraceCountdown` (the Undo label's own leaf). Observed
 * through the hook's own state — never by reaching into an internal.
 */
const h = vi.hoisted(() => ({ undoFire: vi.fn() }));
vi.mock("@/lib/cart", () => ({ undoFire: h.undoFire, sendToKitchen: vi.fn() }));

const {
  useUndoGrace,
  useGraceCountdown,
  BROUGHT_BACK_NOTE,
  FROZEN_NOTE,
  RESYNC_FAILED_NOTE,
  RESYNC_RETRY_MS,
  UNDO_UNCONFIRMED_NOTE,
  UNDO_UNCONFIRMED_FINAL,
  VOIDED_NOTE,
  reasonCopy,
  undoReasonCopy,
} = await import("./useUndoGrace");
const { graceRemainingSec } = await import("@/lib/send-grace");
const KITCHEN_LINE = "That’s already with the kitchen — ask a server to change it.";

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

  it("a VOIDED batch closes the window with a sentence that claims nothing came back — never 'Brought back' (self-review on #315)", async () => {
    const say = vi.fn();
    const { result } = renderHook(() => useUndoGrace({ say }));
    act(() => result.current.open(receipt(), Date.now()));
    h.undoFire.mockResolvedValueOnce({ ok: false, reason: "voided" });
    // MUTATION (undo-grace/voided-keeps-the-window): the voided answer falls through to the refusal
    // branch — an `undefined` sentence and an Undo left live over a dish staff removed; red.
    await act(async () => {
      await result.current.undo("cart-1", false);
    });
    expect(result.current.message).toEqual({ kind: "ok", text: VOIDED_NOTE });
    expect(say).toHaveBeenLastCalledWith({ kind: "ok", text: VOIDED_NOTE });
    expect(VOIDED_NOTE).not.toBe(BROUGHT_BACK_NOTE);
    expect(result.current.deadlineMs).toBeNull();
    expect(result.current.closedBy).toBe("expired");
  });

  it("a refused UNDO says the undo's sentence, never the Send's (J43): error · settling · not_host; the lock's and the rate limit's are shared", async () => {
    const { result } = renderHook(() => useUndoGrace());
    act(() => result.current.open(receipt(), Date.now()));
    const before = result.current.deadlineMs;
    for (const reason of ["error", "settling", "not_host"] as const) {
      h.undoFire.mockResolvedValueOnce({ ok: false, reason });
      await act(async () => {
        await result.current.undo("cart-1", false);
      });
      // MUTATION (undo-grace/undo-refusal-says-the-send): the Send's `reasonCopy` — "Couldn't send
      // that just now" over a tap that tried to bring something back; red.
      expect(result.current.message).toEqual({ kind: "err", text: undoReasonCopy[reason] });
      expect(undoReasonCopy[reason]).not.toBe(reasonCopy[reason]);
      expect(result.current.deadlineMs).toBe(before); // nothing un-fired: the window stays
    }
    expect(undoReasonCopy.error).toBe("Couldn’t bring that back just now — please try again.");
    expect(undoReasonCopy.settling).toBe(
      "Your table is paying — that can’t change while everyone pays.",
    );
    expect(undoReasonCopy.locked).toBe(reasonCopy.locked);
    expect(undoReasonCopy.rate_limited).toBe(reasonCopy.rate_limited);
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

    // A thrown action is a message, never a rejection — each write owns its errors. J37: the read
    // applied, so the ONE confirm runs, and it throws too — still a message, never a rejection.
    h.undoFire.mockRejectedValueOnce(new Error("boom")).mockRejectedValueOnce(new Error("boom"));
    act(() => result.current.open(receipt(), Date.now()));
    await act(async () => {
      await result.current.undo("cart-1", false);
    });
    await expect(result.current.graceWrites.current).resolves.toBeUndefined();
    expect(result.current.message?.text).toBe(UNDO_UNCONFIRMED_FINAL);
    // Unconfirmable twice: the window runs on for the view to decide — nothing closed, nothing held.
    expect(result.current.deadlineMs).not.toBeNull();
    expect(result.current.closedBy).toBeNull();
    expect(result.current.pending).toBe(false);
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
    expect(graceRemainingSec(result.current.deadlineMs, Date.now())).toBe(0);
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

  it('a re-sync that answers "failed" is retried with the gate still shut; the window closes on the attempt that APPLIES', async () => {
    vi.useFakeTimers();
    h.undoFire.mockResolvedValue({ ok: true });
    const onChanged = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("failed")
      .mockResolvedValueOnce("failed")
      .mockResolvedValueOnce("applied");
    const { result } = renderHook(() => useUndoGrace({ onChanged }));
    act(() => result.current.open(receipt(), Date.now()));
    let undoPromise!: Promise<void>;
    act(() => {
      undoPromise = result.current.undo("cart-1", false);
    });
    // The server said ok and the first re-read FAILED (Checkout's `refresh` RESOLVES "failed", it
    // does not throw): nothing closes, nothing releases.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(onChanged).toHaveBeenCalledTimes(1);
    // MUTATION (undo-grace/failed-re-sync-closes-the-window): a failed read counts as applied — the
    // window shuts over the old fired lines under "Brought back", Pay live with no drafts in view
    // and no grace, until create-intent refuses the drafts the undo restored; red here.
    expect(result.current.deadlineMs).not.toBeNull();
    expect(result.current.pending).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RESYNC_RETRY_MS);
    });
    expect(onChanged).toHaveBeenCalledTimes(2);
    expect(result.current.deadlineMs).not.toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RESYNC_RETRY_MS);
      await undoPromise;
    });
    expect(onChanged).toHaveBeenCalledTimes(3);
    expect(result.current.deadlineMs).toBeNull();
    expect(result.current.closedBy).toBe("undone");
    expect(result.current.pending).toBe(false);
  });

  it("when every re-sync fails the window stays OPEN and `pending` stays TRUE — the Undo reads 'bringing it back', Pay stays held — while the read is retried in the background; it closes as undone when a read applies", async () => {
    vi.useFakeTimers();
    h.undoFire.mockResolvedValue({ ok: true });
    const onChanged = vi.fn(() => Promise.resolve("failed"));
    const say = vi.fn();
    const { result } = renderHook(() => useUndoGrace({ onChanged, say }));
    act(() => result.current.open(receipt(), Date.now()));
    let undoPromise!: Promise<void>;
    act(() => {
      undoPromise = result.current.undo("cart-1", false);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RESYNC_RETRY_MS * 2 + 10);
      await undoPromise;
    });
    expect(onChanged).toHaveBeenCalledTimes(3);
    // The undo LANDED (the server said so) but the screen could not show it: the chain is released
    // (Pay's drain never waits on an outage), the diner is told — and the state that gates money
    // does NOT move: the window is open, `pending` holds, and the read is retried in the background.
    expect(result.current.deadlineMs).not.toBeNull();
    expect(result.current.closedBy).toBeNull();
    expect(result.current.pending).toBe(true);
    expect(result.current.isOpen()).toBe(true);
    expect(result.current.message).toEqual({ kind: "err", text: RESYNC_FAILED_NOTE });
    expect(say).toHaveBeenLastCalledWith({ kind: "err", text: RESYNC_FAILED_NOTE });
    // The background retry keeps asking…
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RESYNC_RETRY_MS * 2);
    });
    expect(onChanged.mock.calls.length).toBeGreaterThanOrEqual(5);
    expect(result.current.pending).toBe(true);
    // …and the first read that APPLIES closes the window as undone and says so.
    onChanged.mockImplementation(() => Promise.resolve("applied"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RESYNC_RETRY_MS + 10);
    });
    expect(result.current.deadlineMs).toBeNull();
    expect(result.current.closedBy).toBe("undone");
    expect(result.current.pending).toBe(false);
    expect(result.current.message).toEqual({ kind: "ok", text: BROUGHT_BACK_NOTE });
  });

  it("a landed undo whose reads keep failing PAST the deadline keeps the window shut — the tick may not close it as elapsed (Codex round 5 on #313); it closes as undone when a read applies", async () => {
    vi.useFakeTimers();
    h.undoFire.mockResolvedValue({ ok: true });
    const onChanged = vi.fn(() => Promise.resolve("failed"));
    const { result } = renderHook(() => useUndoGrace({ onChanged }));
    act(() => result.current.open(receipt(), Date.now())); // a 10 s measured grace
    let undoPromise!: Promise<void>;
    act(() => {
      undoPromise = result.current.undo("cart-1", false);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_000); // past the deadline, every read failed
      await undoPromise;
    });
    // MUTATION (undo-grace/landed-undo-released-at-the-deadline): `pending` released after the
    // failed attempts — the tick closes the expired deadline as "elapsed" over a view that still
    // shows the lines fired: Pay live over drafts the server restored, refused at create-intent; red.
    expect(graceRemainingSec(result.current.deadlineMs, Date.now())).toBe(0);
    expect(result.current.deadlineMs).not.toBeNull();
    expect(result.current.closedBy).toBeNull();
    expect(result.current.isOpen()).toBe(true);
    expect(result.current.pending).toBe(true);
    onChanged.mockImplementation(() => Promise.resolve("applied"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RESYNC_RETRY_MS + 10);
    });
    expect(result.current.deadlineMs).toBeNull();
    expect(result.current.closedBy).toBe("undone");
    expect(result.current.pending).toBe(false);
  });

  it("a second Undo tap after a LANDED undo whose re-syncs all failed retries only the READ — never re-fires (since J37 a re-fire answers `gone`: a redundant Server Action the read alone settles)", async () => {
    vi.useFakeTimers();
    h.undoFire
      .mockResolvedValueOnce({ ok: true, unfired: 2, gone: false })
      .mockResolvedValueOnce({ ok: true, unfired: 0, gone: true }); // what a re-fire WOULD get (J37)
    const onChanged = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("failed")
      .mockResolvedValueOnce("failed")
      .mockResolvedValueOnce("failed")
      .mockResolvedValueOnce("applied");
    const { result } = renderHook(() => useUndoGrace({ onChanged }));
    act(() => result.current.open(receipt(), Date.now()));
    let first!: Promise<void>;
    act(() => {
      first = result.current.undo("cart-1", false);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RESYNC_RETRY_MS * 2 + 10);
      await first;
    });
    expect(result.current.deadlineMs).not.toBeNull();
    expect(result.current.pending).toBe(true); // bringing it back — the read is still owed
    expect(result.current.message).toEqual({ kind: "err", text: RESYNC_FAILED_NOTE });
    // The diner follows the note and taps Undo again.
    let second!: Promise<void>;
    act(() => {
      second = result.current.undo("cart-1", false);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RESYNC_RETRY_MS);
      await second;
    });
    // MUTATION (undo-grace/second-tap-re-fires-a-landed-undo): `undoFire` runs again — a second
    // Server Action for a batch already brought back (before J37 it answered `expired` and closed the
    // window as expired over drafts); red here (called twice).
    expect(h.undoFire).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledTimes(4);
    expect(result.current.deadlineMs).toBeNull();
    expect(result.current.closedBy).toBe("undone");
    expect(result.current.message).toEqual({
      kind: "ok",
      text: "Brought back to your order — change it and send again.",
    });
    // A NEW window (a new send, a new batch) forgets the landed undo: its Undo fires.
    h.undoFire.mockResolvedValueOnce({ ok: true });
    act(() => result.current.open(receipt({ undoBatch: "batch-2" }), Date.now()));
    let third!: Promise<void>;
    act(() => {
      third = result.current.undo("cart-1", false);
    });
    await act(async () => {
      await third;
    });
    expect(h.undoFire).toHaveBeenCalledTimes(2);
    expect(h.undoFire).toHaveBeenLastCalledWith("cart-1", "batch-2");
  });

  it("an `overtaken` re-sync is NOT an applied one — the watermark can advance without a view reaching the screen (`confirmedWrite`), so the gate holds until a read APPLIES (Codex round 6 on #313)", async () => {
    vi.useFakeTimers();
    h.undoFire.mockResolvedValue({ ok: true });
    const onChanged = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("overtaken")
      .mockResolvedValueOnce("overtaken")
      .mockResolvedValueOnce("applied");
    const { result } = renderHook(() => useUndoGrace({ onChanged }));
    act(() => result.current.open(receipt(), Date.now()));
    let undoPromise!: Promise<void>;
    act(() => {
      undoPromise = result.current.undo("cart-1", false);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(onChanged).toHaveBeenCalledTimes(1);
    // MUTATION (undo-grace/overtaken-read-counts-as-applied): `!== "failed"` — the gate opens on a
    // read that never reached the screen while the view still shows the lines fired; red here.
    expect(result.current.deadlineMs).not.toBeNull();
    expect(result.current.pending).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RESYNC_RETRY_MS * 2 + 10);
      await undoPromise;
    });
    expect(onChanged).toHaveBeenCalledTimes(3);
    expect(result.current.deadlineMs).toBeNull();
    expect(result.current.closedBy).toBe("undone");
    expect(result.current.pending).toBe(false);
    // A host whose `onChanged` returns no outcome at all still counts as applied (the contract).
    const silent = vi.fn(() => undefined);
    const { result: r2 } = renderHook(() => useUndoGrace({ onChanged: silent }));
    act(() => r2.current.open(receipt(), Date.now()));
    let p2!: Promise<void>;
    act(() => {
      p2 = r2.current.undo("cart-1", false);
    });
    await act(async () => {
      await p2;
    });
    expect(r2.current.closedBy).toBe("undone");
  });

  it("`expired` closes the window even when the re-sync fails — an Undo over lines the kitchen has can never land", async () => {
    vi.useFakeTimers();
    h.undoFire.mockResolvedValue({ ok: false, reason: "expired" });
    const onChanged = vi.fn(() => Promise.resolve("failed"));
    const { result } = renderHook(() => useUndoGrace({ onChanged }));
    act(() => result.current.open(receipt(), Date.now()));
    let undoPromise!: Promise<void>;
    act(() => {
      undoPromise = result.current.undo("cart-1", false);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RESYNC_RETRY_MS * 3);
      await undoPromise;
    });
    expect(result.current.deadlineMs).toBeNull();
    expect(result.current.closedBy).toBe("expired");
  });

  it("an unmounted hook stops asking — a read that was OUT at unmount must not re-arm the background retry when it fails (Codex round 7 on #313)", async () => {
    vi.useFakeTimers();
    h.undoFire.mockResolvedValue({ ok: true });
    const inFlight = deferred<string>();
    const onChanged = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("failed")
      .mockResolvedValueOnce("failed")
      .mockResolvedValueOnce("failed")
      .mockImplementationOnce(() => inFlight.promise) // the read that is out when the diner leaves
      .mockResolvedValue("failed"); // what any later ask gets — the outage goes on
    const { result, unmount } = renderHook(() => useUndoGrace({ onChanged }));
    act(() => result.current.open(receipt(), Date.now()));
    let undoPromise!: Promise<void>;
    act(() => {
      undoPromise = result.current.undo("cart-1", false);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RESYNC_RETRY_MS * 2 + 10);
      await undoPromise;
    });
    // The bounded attempts failed; the background retry fired once and its read is now OUT.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RESYNC_RETRY_MS + 10);
    });
    expect(onChanged).toHaveBeenCalledTimes(4);
    unmount(); // the diner navigates away mid-read
    inFlight.resolve("failed");
    await vi.advanceTimersByTimeAsync(RESYNC_RETRY_MS * 4);
    // MUTATION (undo-grace/unmounted-hook-keeps-polling): the cleanup clears a timer the callback had
    // already nulled before awaiting, and leaves the retry TARGET standing — the failed read re-arms
    // `retry` from a hook nobody renders, and the abandoned checkout polls its cart every 750 ms for
    // as long as the outage lasts; red here (a fifth call and more).
    expect(onChanged).toHaveBeenCalledTimes(4);
  });

  it("an undo whose FOREGROUND read is out at unmount neither keeps reading nor revives the background retry (Codex round 8 on #313)", async () => {
    vi.useFakeTimers();
    h.undoFire.mockResolvedValue({ ok: true });
    const inFlight = deferred<string>();
    const onChanged = vi
      .fn<() => Promise<string>>()
      .mockImplementationOnce(() => inFlight.promise) // attempt 1 — out when the diner leaves
      .mockResolvedValue("failed"); // every later ask — the outage goes on
    const { result, unmount } = renderHook(() => useUndoGrace({ onChanged }));
    act(() => result.current.open(receipt(), Date.now()));
    let undoPromise!: Promise<void>;
    act(() => {
      undoPromise = result.current.undo("cart-1", false);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(onChanged).toHaveBeenCalledTimes(1);
    unmount(); // the diner navigates away while the first re-sync is out
    inFlight.resolve("failed");
    await vi.advanceTimersByTimeAsync(RESYNC_RETRY_MS * 6);
    await undoPromise;
    // MUTATION (undo-grace/unmounted-undo-keeps-reading): the bounded loop runs its remaining
    // attempts against a screen nobody has — two more reads; red here (3 calls).
    // MUTATION (undo-grace/unmounted-undo-revives-the-retry): the close block writes the target back
    // and arms `retryRead` from the dead hook — round 7's cleanup undone by the continuation it could
    // not cancel, the abandoned checkout polling every 750 ms through the outage; red here (many calls).
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("the 250 ms tick closes the window when it elapses, and is cleared on unmount", () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useUndoGrace());
    act(() => result.current.open(receipt(), Date.now()));
    expect(graceRemainingSec(result.current.deadlineMs, Date.now())).toBe(10);
    act(() => {
      vi.advanceTimersByTime(4_000);
    });
    expect(graceRemainingSec(result.current.deadlineMs, Date.now())).toBe(6);
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

describe("useUndoGrace — a REJECTED undo is uncertain, never failed (J37)", () => {
  it("a THROWN undo holds `pending` and the window through an outage — past the deadline, the tick may not close it — and once a read applies the server is asked ONCE more (`gone` → undone)", async () => {
    vi.useFakeTimers();
    h.undoFire.mockRejectedValueOnce(new Error("lost")); // the answer, lost — the un-fire may have landed
    const onChanged = vi.fn<() => Promise<string>>(() => Promise.resolve("failed"));
    const say = vi.fn();
    const { result } = renderHook(() => useUndoGrace({ onChanged, say }));
    act(() => result.current.open(receipt(), Date.now())); // a 10 s measured grace
    let undoPromise!: Promise<void>;
    act(() => {
      undoPromise = result.current.undo("cart-1", false);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_000); // past the deadline, every read failed
      await undoPromise;
    });
    // MUTATION (undo-grace/thrown-undo-released-on-the-clock): the rejection releases `pending` —
    // the tick closes the window as "elapsed" over a view that may predate a landed un-fire: Pay live
    // over drafts the server restored, refused at create-intent; red here (closedBy "elapsed").
    expect(result.current.deadlineMs).not.toBeNull();
    expect(result.current.closedBy).toBeNull();
    expect(result.current.pending).toBe(true);
    expect(result.current.isOpen()).toBe(true);
    expect(result.current.message).toEqual({ kind: "err", text: UNDO_UNCONFIRMED_NOTE });
    expect(say).toHaveBeenCalledWith({ kind: "err", text: UNDO_UNCONFIRMED_NOTE });
    expect(h.undoFire).toHaveBeenCalledTimes(1); // no write is looped through the outage
    // The reads come back — and the confirm learns the first undo HAD landed (`gone`).
    onChanged.mockImplementation(() => Promise.resolve("applied"));
    h.undoFire.mockResolvedValueOnce({ ok: true, unfired: 0, gone: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RESYNC_RETRY_MS + 10);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RESYNC_RETRY_MS + 10);
    });
    expect(h.undoFire).toHaveBeenCalledTimes(2);
    expect(h.undoFire).toHaveBeenNthCalledWith(1, "cart-1", "batch-1");
    expect(h.undoFire).toHaveBeenNthCalledWith(2, "cart-1", "batch-1");
    expect(result.current.deadlineMs).toBeNull();
    expect(result.current.closedBy).toBe("undone");
    expect(result.current.pending).toBe(false);
    expect(result.current.message).toEqual({ kind: "ok", text: BROUGHT_BACK_NOTE });
  });

  it("an uncertain undo whose confirm answers `expired` closes as expired with the kitchen line", async () => {
    h.undoFire
      .mockRejectedValueOnce(new Error("lost"))
      .mockResolvedValueOnce({ ok: false, reason: "expired" });
    const onChanged = vi.fn(() => Promise.resolve("applied"));
    const { result } = renderHook(() => useUndoGrace({ onChanged }));
    act(() => result.current.open(receipt(), Date.now()));
    await act(async () => {
      await result.current.undo("cart-1", false);
    });
    // MUTATION (undo-grace/uncertain-confirm-skipped): the gate opens on the read and nobody asks
    // the server — "checking your order…" stands and the window runs on; red here (one call).
    expect(h.undoFire).toHaveBeenCalledTimes(2);
    expect(h.undoFire).toHaveBeenLastCalledWith("cart-1", "batch-1");
    expect(result.current.deadlineMs).toBeNull();
    expect(result.current.closedBy).toBe("expired");
    expect(result.current.message?.text).toBe(KITCHEN_LINE);
    expect(result.current.pending).toBe(false);
  });

  it("an uncertain undo whose confirm ALSO throws releases WITHOUT a close once a read has applied — the view decides, and the window runs out on its own", async () => {
    vi.useFakeTimers();
    h.undoFire
      .mockRejectedValueOnce(new Error("lost"))
      .mockRejectedValueOnce(new Error("session closed"));
    const onChanged = vi.fn(() => Promise.resolve("applied"));
    const { result } = renderHook(() => useUndoGrace({ onChanged }));
    act(() => result.current.open(receipt(), Date.now()));
    await act(async () => {
      await result.current.undo("cart-1", false);
    });
    expect(h.undoFire).toHaveBeenCalledTimes(2);
    // MUTATION (undo-grace/unconfirmed-undo-closes-as-undone): a confirm that knows nothing closes
    // the window as undone — the Undo shut over lines that may be cooking; red here.
    expect(result.current.deadlineMs).not.toBeNull();
    expect(result.current.closedBy).toBeNull();
    expect(result.current.pending).toBe(false);
    expect(result.current.message).toEqual({ kind: "err", text: UNDO_UNCONFIRMED_FINAL });
    act(() => {
      vi.advanceTimersByTime(10_500);
    });
    expect(result.current.deadlineMs).toBeNull();
    expect(result.current.closedBy).toBe("elapsed");
    expect(h.undoFire).toHaveBeenCalledTimes(2); // never a third: the confirm is asked ONCE
  });

  it("a confirm answered `locked` says why and releases with the window open", async () => {
    h.undoFire
      .mockRejectedValueOnce(new Error("lost"))
      .mockResolvedValueOnce({ ok: false, reason: "locked" });
    const onChanged = vi.fn(() => Promise.resolve("applied"));
    const { result } = renderHook(() => useUndoGrace({ onChanged }));
    act(() => result.current.open(receipt(), Date.now()));
    await act(async () => {
      await result.current.undo("cart-1", false);
    });
    expect(result.current.message).toEqual({ kind: "err", text: reasonCopy.locked });
    expect(result.current.deadlineMs).not.toBeNull();
    expect(result.current.closedBy).toBeNull();
    expect(result.current.pending).toBe(false);
  });

  it("the BACKGROUND confirm rides the write chain — Pay's drain waits for the server's answer", async () => {
    vi.useFakeTimers();
    const confirmAnswer = deferred<{ ok: false; reason: "expired" }>();
    h.undoFire.mockRejectedValueOnce(new Error("lost")).mockReturnValueOnce(confirmAnswer.promise);
    const onChanged = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("failed")
      .mockResolvedValueOnce("failed")
      .mockResolvedValueOnce("failed")
      .mockResolvedValue("applied");
    const { result } = renderHook(() => useUndoGrace({ onChanged }));
    act(() => result.current.open(receipt(), Date.now()));
    let undoPromise!: Promise<void>;
    act(() => {
      undoPromise = result.current.undo("cart-1", false);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RESYNC_RETRY_MS * 2 + 10);
      await undoPromise;
    });
    expect(onChanged).toHaveBeenCalledTimes(3);
    expect(h.undoFire).toHaveBeenCalledTimes(1); // no read applied yet — nothing asked
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RESYNC_RETRY_MS + 10);
    });
    expect(onChanged).toHaveBeenCalledTimes(4);
    expect(h.undoFire).toHaveBeenCalledTimes(2); // the read applied → the confirm is out
    let drained = false;
    void result.current.graceWrites.current.then(() => {
      drained = true;
    });
    await act(async () => {
      await Promise.resolve();
    });
    // MUTATION (undo-grace/background-confirm-off-the-chain): the confirm runs beside the chain —
    // Pay's drain resolves at once and decides against a server answer still in flight; red.
    expect(drained).toBe(false);
    expect(result.current.pending).toBe(true);
    await act(async () => {
      confirmAnswer.resolve({ ok: false, reason: "expired" });
      await result.current.graceWrites.current;
    });
    expect(drained).toBe(true);
    expect(result.current.closedBy).toBe("expired");
    expect(result.current.pending).toBe(false);
  });

  it("an unmounted hook stops the UNCERTAIN retry — a read OUT at unmount re-arms nothing and sends no confirm", async () => {
    vi.useFakeTimers();
    h.undoFire.mockRejectedValueOnce(new Error("lost"));
    const inFlight = deferred<string>();
    const onChanged = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("failed")
      .mockResolvedValueOnce("failed")
      .mockResolvedValueOnce("failed")
      .mockImplementationOnce(() => inFlight.promise) // the background read that is out at unmount
      .mockResolvedValue("failed"); // the outage goes on
    const { result, unmount } = renderHook(() => useUndoGrace({ onChanged }));
    act(() => result.current.open(receipt(), Date.now()));
    let undoPromise!: Promise<void>;
    act(() => {
      undoPromise = result.current.undo("cart-1", false);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RESYNC_RETRY_MS * 2 + 10);
      await undoPromise;
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RESYNC_RETRY_MS + 10);
    });
    expect(onChanged).toHaveBeenCalledTimes(4);
    unmount(); // the diner leaves mid-read
    inFlight.resolve("failed");
    await vi.advanceTimersByTimeAsync(RESYNC_RETRY_MS * 4);
    // MUTATION (undo-grace/unmounted-uncertain-hook-keeps-polling): the cleanup leaves the uncertain
    // TARGET standing — the failed read re-arms the 750 ms loop from a hook nobody renders; red here.
    expect(onChanged).toHaveBeenCalledTimes(4);
    expect(h.undoFire).toHaveBeenCalledTimes(1);
  });
});

describe("useGraceCountdown — the Undo label's own ticker (J34)", () => {
  it("counts the window down on its own subscription — 10, 6 after 4 s, 0 past the deadline; a new deadline reads at once; a null deadline is 0", () => {
    vi.useFakeTimers();
    const initialProps: { d: number | null } = { d: Date.now() + 10_000 };
    const { result, rerender } = renderHook(({ d }: { d: number | null }) => useGraceCountdown(d), {
      initialProps,
    });
    expect(result.current).toBe(10);
    act(() => {
      vi.advanceTimersByTime(4_000);
    });
    // MUTATION (undo-grace/countdown-never-ticks): the label reads the clock only when its parent
    // renders — and nothing renders it: frozen at 10; red here.
    expect(result.current).toBe(6);
    act(() => {
      vi.advanceTimersByTime(6_500);
    });
    expect(result.current).toBe(0);
    rerender({ d: Date.now() + 5_000 });
    expect(result.current).toBe(5);
    rerender({ d: null });
    expect(result.current).toBe(0);
  });

  it("its ticker is torn down on unmount", () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useGraceCountdown(Date.now() + 10_000));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    // MUTATION (undo-grace/countdown-ticker-survives-unmount): the unsubscribe keeps the interval —
    // a quarter-second timer per Undo ever drawn, for the life of the tab; red here.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("the countdown never re-renders the hook's HOST — a ten-second window costs the host its open and its close, not forty renders", () => {
    vi.useFakeTimers();
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return useUndoGrace();
    });
    act(() => result.current.open(receipt(), Date.now()));
    const opened = renders;
    // One `act` PER TICK, as the browser runs them (each interval callback its own task): a single
    // `act` around 9 s would batch every tick's setState into ONE render and hide the storm.
    for (let tick = 0; tick < 36; tick++)
      act(() => {
        vi.advanceTimersByTime(250);
      });
    // Red-first BY HAND, not a verify-slice mutant: restoring the pre-J34 `nowMs` state and its
    // per-tick `setNowMs(now)` (two edits, not adjacent) renders the host 36 more times here.
    expect(renders).toBe(opened);
    act(() => {
      vi.advanceTimersByTime(1_250);
    });
    expect(result.current.closedBy).toBe("elapsed");
    expect(renders - opened).toBeLessThanOrEqual(1);
  });
});
