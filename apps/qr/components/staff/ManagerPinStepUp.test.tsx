/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Approver } from "@/lib/voids";
import { STAFF_HANG_MS, resetOutReadsForTests, youngWrite } from "@/lib/bounded-write";
import { lockoutDuration, secondsUntil, useApproverRoster } from "./ManagerPinStepUp";

/**
 * P7·2 — the shared PIN vocabulary. The mapper returns KEYS, not sentences, so what is pinned is the
 * key chosen and the slot it carries; the sentence itself is the dictionary's, guarded there. The
 * duration is the one string this module formats, in both tongues.
 */
afterEach(cleanup);

describe("lockoutDuration", () => {
  it("English: seconds alone, or minutes with zero-padded seconds", () => {
    expect(lockoutDuration("en", 45)).toBe("45s");
    expect(lockoutDuration("en", 65)).toBe("1m 05s");
    expect(lockoutDuration("en", 600)).toBe("10m 00s");
  });
  it("Burmese: the device's numerals and the unit words, no Latin at all", () => {
    expect(lockoutDuration("my", 45)).toBe("၄၅ စက္ကန့်");
    expect(lockoutDuration("my", 65)).toBe("၁ မိနစ် ၀၅ စက္ကန့်");
    expect(/[A-Za-z0-9]/.test(lockoutDuration("my", 125))).toBe(false);
  });
});

describe("secondsUntil — the lock screen's countdown", () => {
  it("secondsUntil is ceiled and floored at zero", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    expect(secondsUntil("2026-01-01T00:01:00Z", now)).toBe(60);
    expect(secondsUntil("2026-01-01T00:00:00.400Z", now)).toBe(1);
    expect(secondsUntil("2025-12-31T23:59:00Z", now)).toBe(0);
  });
});

describe("useApproverRoster — Phase 2h: both reads end at the bound", () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  const flush = (ms = 0) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });

  it("a mount read with no answer becomes a FAILURE at the bound — never 'Loading…' for good, never an empty roster", async () => {
    vi.useFakeTimers();
    const load = vi.fn((): Promise<Approver[]> => new Promise(() => {}));
    const { result } = renderHook(() => useApproverRoster(load));
    await flush(STAFF_HANG_MS - 1);
    expect(result.current.approvers).toBeNull();
    expect(result.current.failed).toBe(false);
    // MUTATION (p2h-doors/roster-mount-unbounded): the read is awaited raw — the picker says
    // "Loading…" for as long as the queue is stuck, and no Try again is ever offered; red.
    await flush(1);
    expect(result.current.failed).toBe(true);
    expect(result.current.approvers).toBeNull();
  });

  it("a Try again with no answer stops 'retrying' at the bound and reports the failure", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const load = vi.fn((): Promise<Approver[]> => {
      calls += 1;
      return calls === 1 ? Promise.reject(new Error("unavailable")) : new Promise(() => {});
    });
    const { result } = renderHook(() => useApproverRoster(load));
    await flush();
    expect(result.current.failed).toBe(true);
    let ok: boolean | undefined;
    await act(async () => {
      void result.current.retry().then((v) => (ok = v));
    });
    expect(result.current.retrying).toBe(true);
    await flush(STAFF_HANG_MS - 1);
    expect(result.current.retrying).toBe(true);
    // MUTATION (p2h-doors/roster-retry-unbounded): "Trying again…" holds for good — the button
    // never comes back, so the manager cannot even ask again; red.
    await flush(1);
    expect(result.current.retrying).toBe(false);
    expect(ok).toBe(false);
    expect(result.current.failed).toBe(true);
  });
});

describe("useApproverRoster — Phase 2i: both roster reads are READs on the ledger", () => {
  it("the mount read in flight never reads as a young write", async () => {
    const load = vi.fn((): Promise<Approver[]> => new Promise(() => {}));
    renderHook(() => useApproverRoster(load));
    await act(async () => {});
    expect(load).toHaveBeenCalledTimes(1);
    // MUTATION (p2i-kind/roster-mount): the mount's race labels the roster read a write; red.
    expect(youngWrite()).toBe(false);
  });

  it("a Try again's read in flight never reads as a young write", async () => {
    let calls = 0;
    const load = vi.fn((): Promise<Approver[]> => {
      calls += 1;
      return calls === 1 ? Promise.reject(new Error("unavailable")) : new Promise(() => {});
    });
    const { result } = renderHook(() => useApproverRoster(load));
    await act(async () => {});
    expect(result.current.failed).toBe(true);
    await act(async () => {
      void result.current.retry();
    });
    expect(load).toHaveBeenCalledTimes(2);
    // MUTATION (p2i-kind/roster-retry): the Try again's race labels the roster read a write; red.
    expect(youngWrite()).toBe(false);
  });
});

/**
 * Codex round 1 on #310 (CX1) — a Try again never queues a SECOND roster read behind a hung one.
 * Next runs Server Actions one at a time per tab, and the bound frees the CALLER, never the action:
 * at STAFF_HANG_MS the race rejected while the raw read was still queued, and every Try again then
 * dispatched another read behind it — all of them draining later, ahead of every staff action the
 * manager tapped next. So a Try again while the raw is still out ATTACHES to it (a fresh bound, no
 * new read), and the raw's answer lands whenever it comes; a new read goes only once it settled.
 */
describe("useApproverRoster — Codex r1 on #310: one roster read in the queue, its late answer lands", () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  const flush = (ms = 0) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  const AYE: Approver[] = [
    { staffId: "m1", displayName: "Aye", role: "manager", active: true, self: false },
  ];
  /** A roster read that answers only when told to — the hung raw at the head of the queue. */
  function hungLoad() {
    const answers: Array<(a: Approver[]) => void> = [];
    const load = vi.fn(
      (): Promise<Approver[]> => new Promise<Approver[]>((res) => answers.push(res)),
    );
    return { load, answer: (a: Approver[]) => answers[0]!(a) };
  }

  it("a hung read + three Try agains: ONE read in the queue, each Try again ends at its own bound, and the late answer loads the roster", async () => {
    vi.useFakeTimers();
    const { load, answer } = hungLoad();
    const { result } = renderHook(() => useApproverRoster(load));
    await flush(STAFF_HANG_MS);
    expect(result.current.failed).toBe(true);
    for (let i = 0; i < 3; i += 1) {
      let ok: boolean | undefined;
      await act(async () => {
        void result.current.retry().then((v) => (ok = v));
      });
      expect(result.current.retrying).toBe(true);
      // A FRESH bound for each Try again: never "Trying again…" for good, never a dead button.
      await flush(STAFF_HANG_MS);
      expect(result.current.retrying).toBe(false);
      expect(ok).toBe(false);
    }
    // MUTATION (p2h-cx1/roster/retry-dispatches-behind-hung): every Try again sends another read
    // behind the hung one — four in the queue, each delaying every staff action after it; red.
    expect(load).toHaveBeenCalledTimes(1);
    // The answer that finally came lands: the list loads and the failure goes (the cases below pin
    // each bound's late landing on its own).
    await act(async () => answer(AYE));
    expect(result.current.approvers).toEqual(AYE);
    expect(result.current.failed).toBe(false);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("the MOUNT read's late answer loads the roster and clears the failure — no Try again needed", async () => {
    vi.useFakeTimers();
    const { load, answer } = hungLoad();
    const { result } = renderHook(() => useApproverRoster(load));
    await flush(STAFF_HANG_MS);
    expect(result.current.failed).toBe(true);
    await flush(STAFF_HANG_MS * 3);
    // MUTATION (p2h-cx1/roster/mount-late-dropped): the answer that finally came is dropped — the
    // picker reads "couldn't load" over a list that is here, and the manager's Try again queues a
    // read for it; red.
    await act(async () => answer(AYE));
    expect(result.current.approvers).toEqual(AYE);
    // MUTATION (p2h-cx1/roster/late-keeps-failure): the failure stands over the list it brought —
    // "couldn't load" with Try again under a picker that is full; red.
    expect(result.current.failed).toBe(false);
  });

  it("a Try again's OWN read, answering after its bound, still loads the roster", async () => {
    vi.useFakeTimers();
    const answers: Array<(a: Approver[]) => void> = [];
    const load = vi
      .fn<() => Promise<Approver[]>>()
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockImplementation(() => new Promise<Approver[]>((res) => answers.push(res)));
    const { result } = renderHook(() => useApproverRoster(load));
    await flush();
    expect(result.current.failed).toBe(true);
    let ok: boolean | undefined;
    await act(async () => {
      void result.current.retry().then((v) => (ok = v));
    });
    await flush(STAFF_HANG_MS);
    expect(ok).toBe(false);
    expect(load).toHaveBeenCalledTimes(2);
    // MUTATION (p2h-cx1/roster/retry-late-dropped): the Try again's late answer is dropped; red.
    await act(async () => answers[0]!(AYE));
    expect(result.current.approvers).toEqual(AYE);
    expect(result.current.failed).toBe(false);
  });

  it("a Try again attached to the hung read resolves true the moment that read answers inside the fresh bound", async () => {
    vi.useFakeTimers();
    const { load, answer } = hungLoad();
    const { result } = renderHook(() => useApproverRoster(load));
    await flush(STAFF_HANG_MS);
    let ok: boolean | undefined;
    await act(async () => {
      void result.current.retry().then((v) => (ok = v));
    });
    await flush(STAFF_HANG_MS - 1);
    await act(async () => answer(AYE));
    expect(ok).toBe(true);
    expect(result.current.retrying).toBe(false);
    expect(result.current.failed).toBe(false);
    expect(result.current.approvers).toEqual(AYE);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("a Try again after the read FAILED reads afresh — and so does one after it ANSWERED", async () => {
    vi.useFakeTimers();
    const load = vi
      .fn<() => Promise<Approver[]>>()
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockResolvedValue(AYE);
    const { result } = renderHook(() => useApproverRoster(load));
    await flush();
    expect(result.current.failed).toBe(true);
    let ok: boolean | undefined;
    await act(async () => {
      void result.current.retry().then((v) => (ok = v));
    });
    await flush();
    // MUTATION (p2h-cx1/roster/failed-never-clears): the failed read is still "the one out", so
    // the Try again re-awaits a settled rejection and never reads again — a dead button; red.
    expect(load).toHaveBeenCalledTimes(2);
    expect(ok).toBe(true);
    expect(result.current.approvers).toEqual(AYE);
    // A read that ANSWERED is no longer out either: the next ask reads again (fresh), never the old
    // answer handed back.
    await act(async () => {
      void result.current.retry();
    });
    await flush();
    // MUTATION (p2h-cx1/roster/answered-never-clears): red.
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("closing and reopening the sheet while the read hangs: the new mount ATTACHES to it — ONE read in the queue, and its late answer loads the reopened sheet (Codex r2 B2)", async () => {
    vi.useFakeTimers();
    const { load, answer } = hungLoad();
    // The loss sheet opens, its roster read hangs, the manager gives up and closes it.
    const first = renderHook(() => useApproverRoster(load));
    await flush(STAFF_HANG_MS);
    expect(first.result.current.failed).toBe(true);
    first.unmount();
    // Reopened (the same sheet, or the no-show sheet — both read through the one `listApprovers`).
    const second = renderHook(() => useApproverRoster(load));
    await flush();
    // MUTATION (p2h-cx2b/roster/read-slot-per-mount): the outstanding read is the hook INSTANCE's —
    // the reopened sheet starts with an empty slot and sends a second read behind the hung one,
    // every reopen another, each ahead of every staff action tapped after it; red.
    expect(load).toHaveBeenCalledTimes(1);
    // It waits on that read with a FRESH bound — never "Loading…" for good.
    await flush(STAFF_HANG_MS);
    expect(second.result.current.failed).toBe(true);
    // A Try again on the reopened sheet attaches too.
    await act(async () => {
      void second.result.current.retry();
    });
    await flush(STAFF_HANG_MS);
    expect(load).toHaveBeenCalledTimes(1);
    // The answer that finally came loads the sheet that is OPEN now.
    // MUTATION (p2h-cx2b/roster/late-reads-own-slot): the late landing looks for the read in a slot
    // of its own that never held it — the reopened sheet keeps "couldn't load" over a list that came;
    // red.
    await act(async () => answer(AYE));
    expect(second.result.current.approvers).toEqual(AYE);
    expect(second.result.current.failed).toBe(false);
    // Settled: the next open reads afresh, never the old answer handed back.
    second.unmount();
    renderHook(() => useApproverRoster(load));
    await flush();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("a read that settles AFTER the register was emptied leaves the newer read standing — the next open attaches to it (Codex r2 follow-up, R4)", async () => {
    vi.useFakeTimers();
    const answers: Array<(a: Approver[]) => void> = [];
    const load = vi.fn(
      (): Promise<Approver[]> => new Promise<Approver[]>((res) => answers.push(res)),
    );
    const first = renderHook(() => useApproverRoster(load));
    await flush();
    first.unmount();
    // The register is emptied while the first read is still out — what `lib/test-setup.ts` does
    // between two cases, and the only way two reads of one key can be out at once.
    resetOutReadsForTests();
    const second = renderHook(() => useApproverRoster(load));
    await flush();
    expect(load).toHaveBeenCalledTimes(2);
    // The OLD read answers now.
    await act(async () => answers[0]!(AYE));
    second.unmount();
    renderHook(() => useApproverRoster(load));
    await flush();
    // MUTATION (p2h-cx2b/roster/settle-clears-newer): the old read's settle clears the register
    // whatever it holds — the newer read is forgotten while still out, and this open sends a third
    // read behind it; red.
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("a reopen BEFORE the bound attaches too, and the one answer lands on the open sheet (Codex r2 B2)", async () => {
    vi.useFakeTimers();
    const { load, answer } = hungLoad();
    const first = renderHook(() => useApproverRoster(load));
    await flush(5_000);
    first.unmount();
    const second = renderHook(() => useApproverRoster(load));
    await flush(5_000);
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => answer(AYE));
    expect(second.result.current.approvers).toEqual(AYE);
    expect(second.result.current.failed).toBe(false);
  });
});

/**
 * Codex r1 follow-up on #310 (V1) — the ONE rule both loss sheets hold their region to: the roster
 * failure sentence never stands over a list in hand. A recovery by ANY path — a Try again that
 * answered on time, or a read that answered after its bound (CX1) — retires exactly that sentence,
 * back to "a manager needs to approve" while the server's step-up is pending, else to silence; any
 * other sentence is the SAME object (nothing re-said).
 */
