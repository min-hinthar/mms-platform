/** @vitest-environment jsdom */
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Approver } from "@/lib/voids";
import { STAFF_HANG_MS } from "@/lib/bounded-write";
import { StaffLangProvider } from "./StaffLangProvider";
import {
  ManagerPinFields,
  PIN_NO_PIN_COPY,
  lockoutDuration,
  pinFailureCopy,
  secondsUntil,
  useApproverRoster,
} from "./ManagerPinStepUp";

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

describe("pinFailureCopy", () => {
  const noop = vi.fn();
  it("a wrong PIN with tries left picks the plural key for the count", () => {
    expect(pinFailureCopy({ reason: "pin_wrong", attemptsRemaining: 3 }, noop)).toEqual({
      k: "pin.wrong.many",
      vars: { n: 3 },
    });
    expect(pinFailureCopy({ reason: "pin_wrong", attemptsRemaining: 1 }, noop)).toEqual({
      k: "pin.wrong.one",
      vars: { n: 1 },
    });
  });
  it("a wrong PIN with no tries left carries no count", () => {
    expect(pinFailureCopy({ reason: "pin_wrong", attemptsRemaining: 0 }, noop)).toEqual({
      k: "pin.wrong",
    });
  });
  it("a lockout seeds the countdown from the server clock and returns NO message — the countdown is the sentence", () => {
    // A message returned here outlived the lockout: "Too many tries on that PIN." stayed in the
    // region after the countdown reached zero (blind pass, CRITICAL). `lockCopy` says everything.
    const setLockLeft = vi.fn();
    const lockedUntil = new Date(Date.now() + 30_000).toISOString();
    expect(pinFailureCopy({ reason: "pin_locked", lockedUntil }, setLockLeft)).toBeNull();
    expect(setLockLeft).toHaveBeenCalledTimes(1);
    expect(setLockLeft.mock.calls[0]![0]).toBeGreaterThanOrEqual(29);
    expect(setLockLeft.mock.calls[0]![0]).toBeLessThanOrEqual(30);
  });
  it("secondsUntil is ceiled and floored at zero", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    expect(secondsUntil("2026-01-01T00:01:00Z", now)).toBe(60);
    expect(secondsUntil("2026-01-01T00:00:00.400Z", now)).toBe(1);
    expect(secondsUntil("2025-12-31T23:59:00Z", now)).toBe(0);
  });
  it("the no-PIN constant is a key, so the live region can mark it", () => {
    expect(PIN_NO_PIN_COPY).toEqual({ k: "pin.noPin.manager" });
  });
});

describe("ManagerPinFields", () => {
  const props = {
    idPrefix: "t",
    approverStaffId: "",
    onApproverChange: () => {},
    pin: "",
    onPinChange: () => {},
    locked: false,
  };
  it("under Burmese the labels are marked and the placeholder option carries the mark itself", () => {
    render(
      <StaffLangProvider lang="my">
        <ManagerPinFields {...props} approvers={null} />
      </StaffLangProvider>,
    );
    expect(document.querySelector('label[for="t-mgr"] [lang="my"]')?.textContent).toBe("မန်နေဂျာ");
    expect(document.querySelector('label[for="t-pin"] [lang="my"]')?.textContent).toBe("ပင်နံပါတ်");
    const placeholder = document.querySelector('option[value=""]')!;
    expect(placeholder.getAttribute("lang")).toBe("my");
    expect(placeholder.textContent).toBe("ဖွင့်နေပါတယ်…");
  });
  it("an empty roster says so in the option AND in the honest note beneath", () => {
    render(
      <StaffLangProvider lang="en">
        <ManagerPinFields {...props} approvers={[]} />
      </StaffLangProvider>,
    );
    expect(document.querySelector('option[value=""]')?.textContent).toBe("No managers available");
    expect((screen.getByLabelText("Manager") as HTMLSelectElement).disabled).toBe(true);
    expect(screen.getByText(/none are signed in right now/)).not.toBeNull();
  });
});

/**
 * Phase 2h (P2fc) — the roster reads are BOUNDED. Next runs Server Actions one at a time per tab, so
 * behind a stuck action the mount read sat on "Loading…" and Try again on "Trying again…" forever,
 * with nothing saying why — and a write-off that needs a manager could not even be asked for. A read
 * with no answer at STAFF_HANG_MS is a failure like any other (`pin.manager.loadFailed`, with Try
 * again), never an empty roster and never a spinner that cannot end.
 */
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
  const AYE: Approver[] = [{ staffId: "m1", displayName: "Aye", role: "manager" }];
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
});
