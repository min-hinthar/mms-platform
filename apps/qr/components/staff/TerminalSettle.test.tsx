/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STAFF } from "@/lib/i18n/staff";
import { tf } from "@/lib/i18n/fill";
import { SETTLE_MINUTES } from "@/lib/inflight-refusal";

/**
 * Phase 2c · register — the card reader's two halves after the register's Button conversion and the
 * P2r region change: the trigger is a `@mms/ui` Button (never native `disabled`, K35), the collect
 * panel SHOWS its status but SAYS it through the page's one region (`onStatus`), and a landed charge
 * re-reads the page's own detail (`onChanged`, not a `router.refresh()`).
 */
const settleCard = vi.fn();
const terminalStatus = vi.fn();
const cancelTerminal = vi.fn();
vi.mock("@/lib/terminal", () => ({
  settleCard: (...a: unknown[]) => settleCard(...(a as [])),
  terminalStatus: (...a: unknown[]) => terminalStatus(...(a as [])),
  cancelTerminal: (...a: unknown[]) => cancelTerminal(...(a as [])),
}));

const { StaffLangProvider } = await import("./StaffLangProvider");
const { TerminalSettleButton, TerminalCollectPanel } = await import("./TerminalSettle");

const flush = (ms = 0) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  settleCard.mockReset();
  terminalStatus.mockReset();
  cancelTerminal.mockReset();
});

describe("TerminalSettleButton — a Button, secondary by default", () => {
  it("starts the reader once, busy with its label kept as a word, never natively disabled; a rejection clears busy and says so", async () => {
    let fail!: (e: Error) => void;
    settleCard.mockReturnValueOnce(new Promise((_r, j) => (fail = j)));
    const onStarted = vi.fn();
    render(
      <StaffLangProvider lang="en">
        <TerminalSettleButton sessionId="s1" totalCents={4210} onStarted={onStarted} />
      </StaffLangProvider>,
    );
    const trigger = screen.getByRole("button", { name: /Card on the reader/ });
    expect(trigger.classList.contains("ui-btn-secondary")).toBe(true);
    await act(async () => {
      fireEvent.click(trigger);
    });
    expect(trigger.getAttribute("aria-busy")).toBe("true");
    expect(trigger.textContent).toBe(STAFF["settle.reader.starting"].en);
    expect(document.querySelectorAll("[disabled]")).toHaveLength(0);
    await act(async () => {
      fireEvent.click(trigger);
    });
    expect(settleCard).toHaveBeenCalledTimes(1);
    await act(async () => {
      fail(new Error("fetch failed"));
    });
    expect(trigger.getAttribute("aria-busy")).toBeNull();
    expect(screen.getByRole("alert").textContent).toBe(STAFF["settle.reader.startFailed"].en);
    expect(onStarted).not.toHaveBeenCalled();
  });
});

describe("TerminalCollectPanel — shown here, said by the page's one region", () => {
  function panel(isCounter = true) {
    const onStatus = vi.fn();
    const onDone = vi.fn();
    const onChanged = vi.fn();
    const r = render(
      <StaffLangProvider lang="en">
        <TerminalCollectPanel
          sessionId="s1"
          collect={{ paymentIntentId: "pi_1", totalCents: 4210 }}
          isCounter={isCounter}
          onStatus={onStatus}
          onDone={onDone}
          onChanged={onChanged}
        />
      </StaffLangProvider>,
    );
    return { ...r, onStatus, onDone, onChanged };
  }
  const lastStatus = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.at(-1)?.[0];

  it("hands its status UP (the waiting line), shows it in the panel, and carries no region of its own", async () => {
    terminalStatus.mockResolvedValue({ ok: true, state: "collecting" });
    const { onStatus, container } = panel();
    await flush();
    // MUTATION: drop the `onStatus` hand-up — the page's region never says the reader is waiting; red.
    expect(lastStatus(onStatus)).toEqual({
      tone: "ok",
      msg: { k: "settle.reader.status.waiting" },
    });
    expect(container.textContent).toContain(STAFF["settle.reader.status.waiting"].en);
    expect(container.querySelector('[role="status"]')).toBeNull();
    // A poll tick that changes nothing says nothing new.
    const calls = onStatus.mock.calls.length;
    await flush(2500);
    expect(onStatus.mock.calls.length).toBe(calls);
  });

  it("three missed polls: the panel admits it can't see the processor — a WARN, said and shown", async () => {
    terminalStatus.mockResolvedValue(null);
    const { onStatus, container } = panel();
    await flush();
    await flush(2500);
    await flush(2500);
    // MUTATION: never go blind (`blind = false`) — the page keeps saying "waiting" over a reader it
    // cannot see, and the cashier takes another tender; red.
    expect(lastStatus(onStatus)).toEqual({
      tone: "warn",
      msg: { k: "settle.reader.status.blind" },
    });
    expect(container.textContent).toContain(STAFF["settle.reader.status.blind"].en);
  });

  it("a counter charge that lands hands up the order (no tip, no tender) and re-reads the page's detail", async () => {
    terminalStatus.mockResolvedValue({
      ok: true,
      state: "succeeded",
      orderId: "o-1",
      totalCents: 4210,
    });
    const { onDone, onChanged } = panel(true);
    await flush();
    expect(onDone).toHaveBeenCalledWith({ orderId: "o-1", totalCents: 4210 });
    // MUTATION: drop `onChanged` — the page waits up to 5s to show the paid state; red.
    expect(onChanged).toHaveBeenCalled();
  });

  it("a TABLE charge that lands hands up nothing (the paid state is the quiet signal)", async () => {
    terminalStatus.mockResolvedValue({
      ok: true,
      state: "succeeded",
      orderId: "o-2",
      totalCents: 4210,
    });
    const { onDone, onChanged } = panel(false);
    await flush();
    expect(onDone).toHaveBeenCalledWith(null);
    expect(onChanged).toHaveBeenCalled();
  });

  it("Cancel and Back to payment are Buttons: Cancel busy while it runs, never natively disabled", async () => {
    terminalStatus.mockResolvedValue({ ok: true, state: "collecting" });
    let done!: (v: { ok: true }) => void;
    cancelTerminal.mockReturnValueOnce(new Promise((r) => (done = r)));
    const { onDone, onStatus } = panel();
    await flush();
    const cancel = screen.getByRole("button", { name: /Cancel the reader/ });
    expect(cancel.classList.contains("ui-btn-secondary")).toBe(true);
    await act(async () => {
      fireEvent.click(cancel);
    });
    expect(cancel.getAttribute("aria-busy")).toBe("true");
    expect(document.querySelectorAll("[disabled]")).toHaveLength(0);
    await act(async () => {
      done({ ok: true });
    });
    expect(lastStatus(onStatus)).toEqual({
      tone: "ok",
      msg: { k: "settle.reader.status.canceled" },
    });
    const back = screen.getByRole("button", { name: /Back to payment/ });
    expect(back.classList.contains("ui-btn")).toBe(true);
    fireEvent.click(back);
    expect(onDone).toHaveBeenCalledWith(null);
  });
});

describe("TerminalSettleButton — a refusal mid-payment is said in the device language (P2w, critic finding)", () => {
  it("the typed `inflight` refusal renders its holder's key in Burmese — never the server's English", async () => {
    const english = "A payment started at the register on this table hasn’t finished.";
    settleCard.mockResolvedValueOnce({
      ok: false,
      code: "inflight",
      holder: "register",
      error: english,
    });
    render(
      <StaffLangProvider lang="my">
        <TerminalSettleButton sessionId="s1" totalCents={4210} onStarted={vi.fn()} />
      </StaffLangProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });
    // MUTATION: render `res.error` through <OutageText> — the English passes through verbatim; red.
    const alert = screen.getByRole("alert").textContent;
    expect(alert).toBe(tf("my", "settle.inflight.register", { n: SETTLE_MINUTES }));
    expect(alert).not.toContain(english);
  });
});
