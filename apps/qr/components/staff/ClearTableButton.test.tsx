/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STAFF_DOOR_TARGET } from "@/lib/staff-door";
import { STAFF_HANG_MS } from "@/lib/bounded-write";

/**
 * Phase 2a · tablet — a cleared table returns to the FLOOR, asked for by name. A bare `/staff`
 * resolves by the door cookie: on a tablet whose Counter tap was refused (or never written) it lands
 * on the doors screen, so every clear dropped the server out of the floor they were working.
 */
const clearTable = vi.fn();
vi.mock("@/lib/floor", () => ({ clearTable: (...a: unknown[]) => clearTable(...(a as [])) }));
const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));

const { StaffLangProvider } = await import("./StaffLangProvider");
const { ClearTableButton } = await import("./ClearTableButton");
const { ts } = await import("@/lib/i18n/staff");

afterEach(() => {
  cleanup();
  clearTable.mockReset();
  replace.mockReset();
  refresh.mockReset();
});

describe("ClearTableButton — a successful clear", () => {
  it("replaces to the floor (STAFF_DOOR_TARGET.counter), never a bare /staff", async () => {
    clearTable.mockResolvedValue({ ok: true });
    render(
      <StaffLangProvider lang="en">
        <ClearTableButton sessionId="s1" label="4" paymentInFlight={false} />
      </StaffLangProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: ts("en", "settle.clear.btn") }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: ts("en", "settle.confirm") }));
    });
    expect(clearTable).toHaveBeenCalledWith({ sessionId: "s1" });
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(STAFF_DOOR_TARGET.counter);
  });

  it("a refused clear stays put — no navigation", async () => {
    clearTable.mockResolvedValue({ ok: false, error: "Invalid request." });
    render(
      <StaffLangProvider lang="en">
        <ClearTableButton sessionId="s1" label="4" paymentInFlight={false} />
      </StaffLangProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: ts("en", "settle.clear.btn") }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: ts("en", "settle.confirm") }));
    });
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});

describe("ClearTableButton — Phase 2f · a counter order with food in the kitchen", () => {
  it("a `sent` refusal says the page's sentence (the way out), not the server's English", async () => {
    clearTable.mockResolvedValue({
      ok: false,
      error:
        "Food for this order went to the kitchen — use “They didn’t come” instead of clearing it.",
      code: "sent",
    });
    render(
      <StaffLangProvider lang="my">
        <ClearTableButton sessionId="s1" label="reg-x" paymentInFlight={false} />
      </StaffLangProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /ရှင်း|Clear/ }));
    await act(async () => {
      fireEvent.click(document.querySelectorAll("button")[1]!);
    });
    const alert = screen.getByRole("alert");
    expect(alert.querySelector('[lang="my"]')?.textContent).toContain(
      ts("my", "settle.clear.counterSent"),
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it("any other refusal still reads the server's sentence through OutageText", async () => {
    clearTable.mockResolvedValue({ ok: false, error: "Invalid request." });
    render(
      <StaffLangProvider lang="en">
        <ClearTableButton sessionId="s1" label="4" paymentInFlight={false} />
      </StaffLangProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: ts("en", "settle.clear.btn") }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: ts("en", "settle.confirm") }));
    });
    expect(screen.getByRole("alert").textContent).toBe("Invalid request.");
  });
});

describe("ClearTableButton — Phase 2h: the clear is bounded, every control aria-disabled", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  const flush = (ms = 0) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  function hungClear() {
    let answer!: (v: unknown) => void;
    let fail!: (e: Error) => void;
    clearTable.mockReturnValueOnce(
      new Promise((res, rej) => {
        answer = res;
        fail = rej;
      }),
    );
    return { answer: (v: unknown) => answer(v), fail: (e: Error) => fail(e) };
  }
  function mount(paymentInFlight = false) {
    return render(
      <StaffLangProvider lang="en">
        <ClearTableButton sessionId="s1" label="4" paymentInFlight={paymentInFlight} />
      </StaffLangProvider>,
    );
  }
  const trigger = () => screen.getByRole("button", { name: ts("en", "settle.clear.btn") });
  const confirmClear = async () => {
    fireEvent.click(trigger());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: ts("en", "settle.confirm") }));
    });
  };
  const reload = () => screen.queryByRole("button", { name: ts("en", "out.reload") });

  it("while the clear is out, Cancel and Confirm are aria-disabled (never native) — and at the bound both free, the line says 'no answer yet' with the reload", async () => {
    hungClear();
    mount();
    await confirmClear();
    const cancel = screen.getByRole("button", { name: ts("en", "settle.cancel") });
    // MUTATION (p2h-doors/clear-cancel-native-disabled): Cancel natively disabled while the clear
    // is out — focus drops to <body> under the tap, and the step is stranded with it; red.
    expect(cancel.getAttribute("aria-disabled")).toBe("true");
    expect(document.querySelectorAll("[disabled]")).toHaveLength(0);
    fireEvent.click(cancel); // refused in the handler while busy
    expect(screen.getByRole("group")).toBeTruthy();
    await flush(STAFF_HANG_MS - 1);
    expect(screen.getByRole("group")).toBeTruthy();
    // MUTATION (p2h-doors/clear-unbounded): the bound never fires — "Clearing…" holds with Cancel
    // refused for as long as the action queue is stuck; red.
    await flush(1);
    expect(screen.queryByRole("group")).toBeNull();
    expect(document.activeElement).toBe(trigger());
    // MUTATION (p2h-doors/clear-waiting-unsaid): the bound passes in silence; red.
    expect(screen.getByRole("alert").textContent).toBe(ts("en", "settle.clear.waiting"));
    // MUTATION (p2h-doors/clear-reload-missing): "reload the page" with no reload; red.
    expect(reload()).not.toBeNull();
    expect(screen.getByRole("alert").contains(reload())).toBe(false);
    expect(replace).not.toHaveBeenCalled();
  });

  it("a LATE clear lands: the table leaves for the floor", async () => {
    const h = hungClear();
    mount();
    await confirmClear();
    await flush(STAFF_HANG_MS);
    expect(screen.getByRole("alert").textContent).toBe(ts("en", "settle.clear.waiting"));
    // MUTATION (p2h-doors/clear-late-ok-dropped): the late answer is dropped — the table WAS
    // cleared and its defunct detail stays up under "no answer yet"; red.
    await act(async () => h.answer({ ok: true }));
    expect(replace).toHaveBeenCalledWith(STAFF_DOOR_TARGET.counter);
  });

  it("a LATE clear from a detail that is GONE navigates nowhere — the person is not pulled off where they went", async () => {
    const h = hungClear();
    const r = mount();
    await confirmClear();
    await flush(STAFF_HANG_MS);
    r.unmount();
    // MUTATION (p2h-doors/clear-late-lands-after-unmount): the late clear replaces the route from a
    // detail nobody is looking at — the floor yanks them off the table they opened since; red.
    await act(async () => h.answer({ ok: true }));
    expect(replace).not.toHaveBeenCalled();
  });

  it("a LATE throw says 'couldn't confirm' over the waiting line", async () => {
    const h = hungClear();
    mount();
    await confirmClear();
    await flush(STAFF_HANG_MS);
    // MUTATION (p2h-doors/clear-late-throw-unsaid): "no answer yet" stands for good; red.
    await act(async () => h.fail(new Error("fetch failed")));
    expect(screen.getByRole("alert").textContent).toBe(ts("en", "settle.clear.unknown"));
    expect(reload()).toBeNull();
  });

  it("a THROWN clear says 'couldn't confirm' — never the server's 'wasn't saved' — and frees the controls", async () => {
    const h = hungClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mount();
    await confirmClear();
    // MUTATION (p2h-doors/clear-threw-unsaid): a lost answer is said as nothing — the rejection
    // reached the error boundary before; now it would leave the person with no line at all; red.
    await act(async () => h.fail(new Error("fetch failed")));
    expect(screen.getByRole("alert").textContent).toBe(ts("en", "settle.clear.unknown"));
    expect(screen.queryByRole("group")).toBeNull();
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  it("mid-payment the trigger is aria-disabled (never native), described by the reason, and inert", () => {
    mount(true);
    const btn = trigger();
    // MUTATION (p2h-doors/clear-mid-payment-native-disabled): natively disabled — focus drops to
    // <body> as the payment starts under it, and the reason is hidden from a screen reader; red.
    expect(btn.getAttribute("aria-disabled")).toBe("true");
    expect((btn as HTMLButtonElement).disabled).toBe(false);
    const described = document.getElementById(btn.getAttribute("aria-describedby") ?? "");
    expect(described?.textContent).toContain(ts("en", "settle.clear.midPayment"));
    fireEvent.click(btn);
    expect(screen.queryByRole("group")).toBeNull();
    expect(clearTable).not.toHaveBeenCalled();
  });
});
