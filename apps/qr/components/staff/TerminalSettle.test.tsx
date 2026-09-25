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

// ── Phase 2c · gate ──
describe("TerminalSettleButton — the settle gate (refused while dishes are unsent)", () => {
  it("blocked: aria-disabled (never native), read with the page's note first, and a tap starts NO reader — it hands up once", async () => {
    const onBlockedTap = vi.fn();
    render(
      <StaffLangProvider lang="en">
        <TerminalSettleButton
          sessionId="s1"
          totalCents={4210}
          onStarted={vi.fn()}
          blocked
          blockedNoteId="settle-unsent-note"
          onBlockedTap={onBlockedTap}
        />
      </StaffLangProvider>,
    );
    const trigger = screen.getByRole("button", { name: /Card on the reader/ });
    expect(trigger.getAttribute("aria-disabled")).toBe("true");
    expect(trigger.hasAttribute("disabled")).toBe(false);
    expect(trigger.getAttribute("aria-describedby")).toBe("settle-unsent-note terminal-hint");
    await act(async () => {
      fireEvent.click(trigger);
    });
    // MUTATION (terminal-ui/unsent-tap-starts-the-reader): drop `start`'s guard — the reader is
    // driven, a freeze taken and a PaymentIntent asked for over dishes nobody sent; red.
    expect(settleCard).not.toHaveBeenCalled();
    expect(onBlockedTap).toHaveBeenCalledTimes(1);
    expect(onBlockedTap).toHaveBeenCalledWith(null);
  });

  it("not blocked: no aria-disabled from the gate", () => {
    // MUTATION (terminal-ui/unsent-trigger-always-dimmed): spread aria-disabled regardless; red.
    render(
      <StaffLangProvider lang="en">
        <TerminalSettleButton sessionId="s1" totalCents={4210} onStarted={vi.fn()} />
      </StaffLangProvider>,
    );
    const trigger = screen.getByRole("button", { name: /Card on the reader/ });
    expect(trigger.getAttribute("aria-disabled")).toBeNull();
    expect(trigger.getAttribute("aria-describedby")).toBe("terminal-hint");
  });

  it("a server `unsent` refusal renders the dictionary sentence in Burmese with ITS count, hands the jump up once, and mounts no second alert", async () => {
    const english = "Some dishes haven’t gone to the kitchen.";
    settleCard.mockResolvedValueOnce({ ok: false, code: "unsent", units: 3, error: english });
    const onBlockedTap = vi.fn();
    render(
      <StaffLangProvider lang="my">
        <TerminalSettleButton
          sessionId="s1"
          totalCents={4210}
          onStarted={vi.fn()}
          onBlockedTap={onBlockedTap}
        />
      </StaffLangProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button")[0]!);
    });
    // MUTATION (terminal-ui/unsent-said-in-english): drop the `unsent` arm — the server's English
    // passes through on a Burmese console; red.
    const said = tf("my", "table.send.settleBlocked.many", { n: 3 });
    expect(document.body.textContent).toContain(said);
    expect(document.body.textContent).not.toContain(english);
    // MUTATION (terminal-ui/unsent-refusal-never-jumps): drop the hand-up — the cashier is left on
    // a refused reader button with the Send somewhere above; red.
    expect(onBlockedTap).toHaveBeenCalledTimes(1);
    expect(onBlockedTap).toHaveBeenCalledWith(3);
    // The page's ONE region says it; this line is shown, never a second announcement.
    expect(screen.queryByRole("alert")).toBeNull();
  });
  // ── the critic's findings (Phase 2c · gate, round 2) ──
  const raced = { ok: false, code: "unsent", units: 2, error: "Some dishes haven’t gone." };
  const said = (running: boolean) =>
    tf("en", running ? "table.send.settleBlocked.tab.many" : "table.send.settleBlocked.many", {
      n: 2,
    });
  const el = (p: { blocked?: boolean; gateLive?: boolean; running?: boolean }) => (
    <StaffLangProvider lang="en">
      <TerminalSettleButton sessionId="s1" totalCents={4210} onStarted={vi.fn()} {...p} />
    </StaffLangProvider>
  );

  it("a raced line is DROPPED once the page reads the table blocked — it never comes back when the table clears", async () => {
    settleCard.mockResolvedValueOnce(raced);
    const { rerender } = render(el({}));
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button")[0]!);
    });
    expect(document.body.textContent).toContain(said(false));
    // The page read the drafts: its note says it now.
    rerender(el({ blocked: true }));
    expect(document.body.textContent).not.toContain(said(false));
    // Sent: the page reads the table clear again.
    rerender(el({ blocked: false }));
    // MUTATION (terminal-ui/unsent-raced-line-outlives-the-page): clear only when the page's line
    // retires — standalone (no page line) the hidden error comes back under a live trigger; red.
    expect(document.body.textContent).not.toContain(said(false));
  });

  it("a raced line goes when the page's own gate line retires, even if the page never read the table blocked", async () => {
    settleCard.mockResolvedValueOnce(raced);
    const { rerender } = render(el({ gateLive: true }));
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button")[0]!);
    });
    expect(document.body.textContent).toContain(said(false));
    rerender(el({ gateLive: false }));
    // MUTATION (terminal-ui/unsent-raced-line-outlives-the-gate): clear only on `blocked` — the
    // dishes were removed before the page saw them, and the line says they are still there; red.
    expect(document.body.textContent).not.toContain(said(false));
    // …and a later gate line (another door refused) does not bring it back.
    rerender(el({ gateLive: true }));
    expect(document.body.textContent).not.toContain(said(false));
  });

  it("on a card-on-file running bill the raced line says the running bill's sentence", async () => {
    settleCard.mockResolvedValueOnce(raced);
    render(el({ running: true }));
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button")[0]!);
    });
    // MUTATION (terminal-ui/unsent-running-ignored): the table's sentence regardless — the reader
    // says "send them first" under a note offering removal; red.
    expect(document.body.textContent).toContain(said(true));
  });
});
