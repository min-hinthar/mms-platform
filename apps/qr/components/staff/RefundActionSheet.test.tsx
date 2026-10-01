/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { startTransition } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RefundResult, SettledLine, SettledOrder } from "@/lib/refunds";
import { STAFF } from "@/lib/i18n/staff";
import { STAFF_HANG_MS, track } from "@/lib/bounded-write";

/**
 * manager-5 — the refund sheet's PIN discipline, pinned where it lives: a refused PIN leaves the
 * masked field (the next tap used to re-send the same wrong digits and burn an attempt toward the
 * lockout) with focus back in it; a lockout makes the field READ-ONLY and refuses the submit
 * (§17 — never native `disabled`, and `locked` was never read here at all).
 */
const refundLine = vi.fn(
  (): Promise<RefundResult> =>
    Promise.resolve({ ok: false, reason: "pin_wrong", attemptsRemaining: 2 }),
);
vi.mock("@/lib/refunds", () => ({ refundLine: (...a: unknown[]) => refundLine(...(a as [])) }));
vi.mock("./TicketText", () => ({ ExpoLineMy: () => null }));

const { StaffLangProvider } = await import("./StaffLangProvider");
const { RefundActionSheet } = await import("./RefundActionSheet");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const line = {
  id: "li1",
  name: "Mohinga",
  nameMy: null,
  qty: 1,
  unitPriceCents: 1200,
  taxCents: 100,
  modifiers: [],
  modifiersMy: [],
  notes: null,
  fulfillment: "dinein",
  refundedCents: 0,
  refunded: false,
  offeredCents: 1300,
  offerClamped: false,
} as SettledLine;
const order = {
  id: "o1",
  code: "AB12",
  tableNumber: 4,
  refundPath: "app",
  lines: [line],
} as unknown as SettledOrder;

function mount() {
  render(
    <StaffLangProvider lang="en">
      <RefundActionSheet open order={order} line={line} onClose={() => {}} onDone={() => {}} />
    </StaffLangProvider>,
  );
  const pin = () => document.getElementById("refund-pin") as HTMLInputElement;
  const refund = () =>
    screen.getByRole("button", { name: /Refund \$13\.00|Refunding/ }) as HTMLButtonElement;
  return { pin, refund };
}

describe("RefundActionSheet — the PIN discipline", () => {
  it("a wrong PIN empties the field and hands focus back to it; the Refund button is aria-disabled, never native", async () => {
    const { pin, refund } = mount();
    fireEvent.change(pin(), { target: { value: "1234" } });
    expect(refund().getAttribute("aria-disabled")).toBeNull();
    await act(async () => {
      fireEvent.click(refund());
    });
    expect(refundLine).toHaveBeenCalledTimes(1);
    // MUTATION: drop `setPin("")` from the refusal — the field keeps "1234" and this reddens.
    expect(pin().value).toBe("");
    expect(document.activeElement).toBe(pin());
    expect(refund().disabled).toBe(false);
    expect(refund().getAttribute("aria-disabled")).toBe("true"); // empty PIN — a stated refusal
    expect(document.querySelector('[role="status"]')?.textContent).toContain("2");
  });

  it("a lockout makes the field read-only and refuses the submit until it lifts", async () => {
    const { pin, refund } = mount();
    fireEvent.change(pin(), { target: { value: "1234" } });
    refundLine.mockResolvedValueOnce({
      ok: false,
      reason: "pin_locked",
      lockedUntil: new Date(Date.now() + 30_000).toISOString(),
    });
    await act(async () => {
      fireEvent.click(refund());
    });
    expect(refundLine).toHaveBeenCalledTimes(1);
    // MUTATION: leave `locked` out of `useLockout`'s destructure — the field stays editable and the
    // button live, and this reddens on both.
    expect(pin().readOnly).toBe(true);
    expect(pin().disabled).toBe(false);
    fireEvent.change(pin(), { target: { value: "5678" } });
    expect(refund().getAttribute("aria-disabled")).toBe("true");
    await act(async () => {
      fireEvent.click(refund());
    });
    expect(refundLine).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="status"]')?.textContent).toMatch(
      new RegExp(STAFF["pin.lockedFor"].en.split("{x}")[0]!.trim()),
    );
  });

  it("§17 — while the refund runs the button is aria-disabled + busy and says a stated word", async () => {
    let release: ((r: RefundResult) => void) | null = null;
    refundLine.mockReturnValueOnce(
      new Promise<RefundResult>((r) => {
        release = r;
      }),
    );
    const { pin, refund } = mount();
    fireEvent.change(pin(), { target: { value: "1234" } });
    await act(async () => {
      fireEvent.click(refund());
    });
    expect(refund().disabled).toBe(false);
    expect(refund().getAttribute("aria-busy")).toBe("true");
    expect(refund().textContent).toContain(STAFF["floor.refund.working"].en);
    await act(async () => {
      fireEvent.click(refund());
    });
    expect(refundLine).toHaveBeenCalledTimes(1);
    await act(async () => {
      release!({ ok: true, amountCents: 1300 });
    });
  });
});

// ── Phase 2h · p2h-sheets ──
const hanging: Array<() => void> = [];
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
/** Settled in `afterEach` once the tree is gone: a pre-fix transition left pending by a red-first
 *  run must never entangle the next case. */
function hang<T>(end: T) {
  const d = deferred<T>();
  hanging.push(() => d.resolve(end));
  return d;
}

describe("RefundActionSheet — a hung refund never traps the sheet (Phase 2h · 9a · 9d · 9e)", () => {
  afterEach(async () => {
    vi.useRealTimers();
    cleanup();
    await act(async () => {
      for (const end of hanging.splice(0)) end();
    });
  });
  const region = () => document.querySelector('[role="dialog"] [role="status"]')!;
  const reloadBtn = () => screen.queryByRole("button", { name: STAFF["out.reload"].en });
  const closeX = () =>
    screen.getByRole("button", {
      name: (n) => n === STAFF["shell.close"].en || n === STAFF["shell.closeBusy"].en,
    });
  const cancelBtn = () =>
    screen.getByRole("button", { name: new RegExp(STAFF["table.appr.verb.cancel"].en) });
  const advance = (ms: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  function mountSpied() {
    const onDone = vi.fn();
    const onClose = vi.fn();
    render(
      <StaffLangProvider lang="en">
        <RefundActionSheet open order={order} line={line} onClose={onClose} onDone={onDone} />
      </StaffLangProvider>,
    );
    const pin = () => document.getElementById("refund-pin") as HTMLInputElement;
    const refund = () =>
      screen.getByRole("button", { name: /Refund \$13\.00|Refunding/ }) as HTMLButtonElement;
    const tap = async (digits = "1234") => {
      fireEvent.change(pin(), { target: { value: digits } });
      await act(async () => {
        fireEvent.click(refund());
      });
    };
    return { onDone, onClose, pin, refund, tap };
  }

  it("no answer at STAFF_HANG_MS: the sheet frees (✕ and Cancel live), says the refund may still go through, offers the reload, and keeps no PIN", async () => {
    vi.useFakeTimers();
    refundLine.mockReturnValueOnce(hang<RefundResult>({ ok: false, reason: "not_paid" }).promise);
    const { refund, pin, tap, onClose } = mountSpied();
    await tap();
    expect(refund().getAttribute("aria-busy")).toBe("true");
    expect(closeX().getAttribute("aria-disabled")).toBe("true");
    await advance(STAFF_HANG_MS - 1);
    expect(refund().getAttribute("aria-busy")).toBe("true");
    await advance(1);
    // MUTATION (p2h-sheets/refund/busy-never-clears): every exit refused forever; red.
    expect(refund().getAttribute("aria-busy")).toBeNull();
    expect(closeX().getAttribute("aria-disabled")).toBeNull();
    expect(cancelBtn().getAttribute("aria-disabled")).toBeNull();
    // MUTATION (p2h-sheets/refund/waiting-said-as-unknown): "couldn't confirm" over a refund that is
    // merely late; red.
    expect(region().textContent).toBe(STAFF["floor.refund.waiting"].en);
    // MUTATION (p2h-sheets/refund/no-reload): red.
    expect(reloadBtn()).not.toBeNull();
    // MUTATION (p2h-sheets/refund/waiting-keeps-the-pin): the masked digits stay, to be re-sent; red.
    expect(pin().value).toBe("");
    await act(async () => {
      fireEvent.click(cancelBtn());
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("the entanglement proxy: an UNRELATED async transition left hanging — the sheet still frees at the bound", async () => {
    vi.useFakeTimers();
    const other = hang<void>(undefined);
    act(() => {
      startTransition(async () => {
        await other.promise;
      });
    });
    refundLine.mockReturnValueOnce(hang<RefundResult>({ ok: false, reason: "not_paid" }).promise);
    const { refund, tap } = mountSpied();
    await tap();
    await advance(STAFF_HANG_MS);
    expect(refund().getAttribute("aria-busy")).toBeNull();
    expect(closeX().getAttribute("aria-disabled")).toBeNull();
  });

  it("a LATE ok reaches the board even after the sheet was closed: onDone with the SERVER's figure", async () => {
    vi.useFakeTimers();
    const late = deferred<RefundResult>();
    refundLine.mockReturnValueOnce(late.promise);
    const { tap, onDone } = mountSpied();
    await tap();
    await advance(STAFF_HANG_MS);
    expect(region().textContent).toBe(STAFF["floor.refund.waiting"].en);
    cleanup(); // the manager closed it; the board unmounted the sheet
    await act(async () => {
      late.resolve({ ok: true, amountCents: 1250 });
    });
    // MUTATION (p2h-sheets/refund/late-answer-dropped): money left the card and the board is never
    // told — no confirmation, no refresh; red.
    expect(onDone).toHaveBeenCalledWith(1250);
  });

  it("a LATE refusal is said while the sheet is open (and empties the PIN); a late throw is 'couldn't confirm'", async () => {
    vi.useFakeTimers();
    const late = deferred<RefundResult>();
    refundLine.mockReturnValueOnce(late.promise);
    const { tap, pin } = mountSpied();
    await tap();
    await advance(STAFF_HANG_MS);
    fireEvent.change(pin(), { target: { value: "99" } });
    await act(async () => {
      late.resolve({ ok: false, reason: "not_paid" });
    });
    expect(region().textContent).toBe(STAFF["floor.refund.err.notPaid"].en);
    expect(pin().value).toBe("");
    cleanup();
    const late2 = deferred<RefundResult>();
    refundLine.mockReturnValueOnce(late2.promise);
    const second = mountSpied();
    await second.tap();
    await advance(STAFF_HANG_MS);
    await act(async () => {
      late2.reject(new Error("fetch failed"));
    });
    // MUTATION (p2h-sheets/refund/late-throw-unsaid): "no answer yet" stands for good; red.
    expect(region().textContent).toBe(STAFF["floor.refund.err.unknown"].en);
  });

  it("a LATE refusal for a sheet that was closed never reaches into the refund sheet opened since", async () => {
    vi.useFakeTimers();
    const late = deferred<RefundResult>();
    refundLine.mockReturnValueOnce(late.promise);
    const first = mountSpied();
    await first.tap();
    await advance(STAFF_HANG_MS);
    cleanup(); // closed; the manager opens the next line's refund
    const next = mountSpied();
    fireEvent.change(next.pin(), { target: { value: "42" } });
    const reasonSelect = document.getElementById("refund-reason") as HTMLSelectElement;
    reasonSelect.focus();
    await act(async () => {
      late.resolve({ ok: false, reason: "not_paid" });
    });
    // MUTATION (p2h-sheets/refund/late-refusal-reaches-the-next-sheet): the closed sheet's refusal
    // focuses the NEW sheet's PIN field (the id is shared) out from under the manager; red.
    expect(document.activeElement).toBe(reasonSelect);
    expect(next.pin().value).toBe("42");
  });

  it("a THROWN refund may have moved money: 'couldn't confirm — check the order', never 'couldn't refund — try again'", async () => {
    vi.useFakeTimers();
    refundLine.mockRejectedValueOnce(new Error("fetch failed"));
    const { tap, pin, refund } = mountSpied();
    await tap();
    // MUTATION (p2h-sheets/refund/threw-said-as-failed): the old catch's "Couldn't refund that line —
    // try again" — and the manager refunds a second time; red.
    expect(region().textContent).toBe(STAFF["floor.refund.err.unknown"].en);
    expect(pin().value).toBe("");
    expect(refund().getAttribute("aria-busy")).toBeNull();
  });

  it("a re-tap while the refund is still out is REFUSED, never sent — even with a fresh PIN typed", async () => {
    vi.useFakeTimers();
    refundLine.mockReturnValueOnce(hang<RefundResult>({ ok: false, reason: "not_paid" }).promise);
    const { tap } = mountSpied();
    await tap();
    await advance(STAFF_HANG_MS);
    await tap("5678");
    // MUTATION (p2h-sheets/refund/stalled-tap-dispatches): a second refund queued behind the first;
    // red.
    expect(refundLine).toHaveBeenCalledTimes(1);
    expect(region().textContent).toBe(STAFF["out.stalled"].en);
    expect(reloadBtn()).not.toBeNull();
  });

  it("a tablet stalled on ANOTHER action refuses the refund at the tap: nothing dispatched", async () => {
    vi.useFakeTimers();
    track(new Promise(() => {}));
    await advance(STAFF_HANG_MS);
    const { tap, refund } = mountSpied();
    await tap();
    expect(refundLine).not.toHaveBeenCalled();
    expect(refund().getAttribute("aria-busy")).toBeNull();
    expect(region().textContent).toBe(STAFF["out.stalled"].en);
    expect(reloadBtn()).not.toBeNull();
  });
});
