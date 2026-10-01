/** @vitest-environment jsdom */
import { useLayoutEffect } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STAFF } from "@/lib/i18n/staff";
import { tf } from "@/lib/i18n/fill";
import { SETTLE_MINUTES } from "@/lib/inflight-refusal";
import { READER_UNRECORDED_MS } from "@/lib/reader-collect";

/**
 * Phase 2c · register — the card reader's two halves after the register's Button conversion and the
 * P2r region change: the trigger is a `@mms/ui` Button (never native `disabled`, K35), the collect
 * panel SHOWS its status but SAYS it through the page's one region (`onStatus`). Phase 2g · reader —
 * the collect is `ReaderCollectProvider`'s: the button starts it there (with the tap's facts) and is
 * held while another table's collect is live; the panel is a view over it.
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
const { ReaderCollectProvider } = await import("./ReaderCollectProvider");
const { TerminalSettleButton, TerminalCollectPanel } = await import("./TerminalSettle");
const { useReaderCollect } = await import("./ReaderCollectContext");

/** The bill as the detail's render reads it — carried by a tap into the provider's collect. */
const TAP = {
  isCounter: true,
  name: { counter: true, display: "reg-7f3a" },
  sentEarly: true,
  cartId: "c1",
};
let api!: ReturnType<typeof useReaderCollect>;
function Probe() {
  const r = useReaderCollect();
  // Read after each commit (never a module write during render — react-hooks/globals).
  useLayoutEffect(() => {
    api = r;
  });
  return null;
}

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
        <ReaderCollectProvider>
          <TerminalSettleButton sessionId="s1" totalCents={4210} tap={TAP} onStarted={onStarted} />
        </ReaderCollectProvider>
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

describe("TerminalCollectPanel — a view over the provider: shown here, said by the page's one region", () => {
  /** The provider holding a collect for `sessionId` (started through its own `start`). */
  async function panel(opts: { sessionId?: string; shownFor?: string; isCounter?: boolean } = {}) {
    const onStatus = vi.fn();
    const r = render(
      <StaffLangProvider lang="en">
        <ReaderCollectProvider>
          <Probe />
          <TerminalCollectPanel sessionId="s1" onStatus={onStatus} />
        </ReaderCollectProvider>
      </StaffLangProvider>,
    );
    await act(async () =>
      api.start({
        sessionId: opts.sessionId ?? "s1",
        paymentIntentId: "pi_1",
        totalCents: 4210,
        ...TAP,
        isCounter: opts.isCounter ?? true,
      }),
    );
    return { ...r, onStatus };
  }
  const lastStatus = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.at(-1)?.[0];
  const group = () => screen.queryByRole("group", { name: /Card reader payment/ });

  it("hands its status UP (the waiting line), shows it in the panel, and carries no region of its own", async () => {
    terminalStatus.mockResolvedValue({ ok: true, state: "collecting" });
    const { onStatus, container } = await panel();
    await flush();
    // MUTATION (p2c-register/reader-status-never-said): drop the `onStatus` hand-up — the page's
    // region never says the reader is waiting; red.
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
    const { onStatus, container } = await panel();
    await flush();
    await flush(2500);
    await flush(2500);
    expect(lastStatus(onStatus)).toEqual({
      tone: "warn",
      msg: { k: "settle.reader.status.blind" },
    });
    expect(container.textContent).toContain(STAFF["settle.reader.status.blind"].en);
  });

  it("another table's collect renders NOTHING here (the bar's chip carries it)", async () => {
    terminalStatus.mockResolvedValue({ ok: true, state: "collecting" });
    const { onStatus } = await panel({ sessionId: "s9" });
    await flush();
    expect(group()).toBeNull();
    expect(onStatus).not.toHaveBeenCalled();
  });

  it("a charge that lands takes the panel down — the collect is over (the card is the detail's)", async () => {
    terminalStatus.mockResolvedValue({
      ok: true,
      state: "succeeded",
      orderId: "o-1",
      totalCents: 4210,
    });
    await panel();
    await flush();
    expect(group()).toBeNull();
  });

  it("Cancel and Back to payment are Buttons: Cancel busy while it runs, never natively disabled", async () => {
    terminalStatus.mockResolvedValue({ ok: true, state: "collecting" });
    let done!: (v: { ok: true }) => void;
    cancelTerminal.mockReturnValueOnce(new Promise((r) => (done = r)));
    const { onStatus } = await panel();
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
    await act(async () => {
      fireEvent.click(back);
    });
    // Declined or cancelled: "Back to payment" clears the collect — the panel goes.
    expect(group()).toBeNull();
    expect(api.record).toBeNull();
  });

  it("charged but slow to record: the button HIDES the panel and says so — never 'Back to payment' (PT-10)", async () => {
    terminalStatus.mockResolvedValue({
      ok: true,
      state: "succeeded",
      orderId: null,
      totalCents: 4210,
    });
    await panel();
    await flush();
    // Recording, within the bound: no button at all.
    expect(screen.queryByRole("button")).toBeNull();
    await flush(20_001);
    expect(screen.getByText(STAFF["settle.reader.status.recordingLong"].en)).toBeTruthy();
    // MUTATION (p2g-fix-reader/recording-offers-back-to-payment): "Back to payment" under "don't
    // charge again" — there is no payment to go back to; red.
    expect(screen.queryByRole("button", { name: /Back to payment/ })).toBeNull();
    const hide = screen.getByRole("button", { name: /Hide this/ });
    const n = terminalStatus.mock.calls.length;
    await act(async () => {
      fireEvent.click(hide);
    });
    expect(group()).toBeNull();
    expect(api.record?.hidden).toBe(true);
    await flush(2500);
    expect(terminalStatus.mock.calls.length).toBeGreaterThan(n);
  });

  it("given up as unrecorded: the warning, and a Close — there is no payment to go back to (C1)", async () => {
    terminalStatus.mockResolvedValue({
      ok: true,
      state: "succeeded",
      orderId: null,
      totalCents: 4210,
    });
    const { onStatus } = await panel();
    await flush();
    await flush(READER_UNRECORDED_MS);
    expect(lastStatus(onStatus)).toEqual({
      tone: "warn",
      msg: { k: "settle.reader.status.unrecorded" },
    });
    expect(screen.getByText(STAFF["settle.reader.status.unrecorded"].en)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Back to payment/ })).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: STAFF["shell.close"].en }));
    });
    expect(group()).toBeNull();
    expect(api.record).toBeNull();
  });

  it("takes focus on its first mount after a start made in view — never on a re-attach", async () => {
    terminalStatus.mockResolvedValue({ ok: true, state: "collecting" });
    function Shown() {
      const r = useReaderCollect();
      const shownHere = r.shownHere;
      useLayoutEffect(() => shownHere("s1"), [shownHere]);
      return null;
    }
    const tree = (withPanel: boolean) => (
      <StaffLangProvider lang="en">
        <ReaderCollectProvider>
          <Probe />
          <Shown />
          {withPanel && <TerminalCollectPanel sessionId="s1" />}
          <button type="button">elsewhere</button>
        </ReaderCollectProvider>
      </StaffLangProvider>
    );
    const r = render(tree(true));
    await act(async () =>
      api.start({ sessionId: "s1", paymentIntentId: "pi_1", totalCents: 4210, ...TAP }),
    );
    await flush();
    expect(document.activeElement).toBe(group());
    // The person moves on, then comes back: the panel re-attaches WITHOUT pulling focus.
    r.rerender(tree(false));
    screen.getByRole("button", { name: "elsewhere" }).focus();
    r.rerender(tree(true));
    await flush();
    expect(group()).not.toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "elsewhere" }));
  });
});

// ── Phase 2g · reader ── the button starts the PROVIDER's collect, and is the one refusal left.
describe("TerminalSettleButton — the collect is the provider's; one reader", () => {
  const tree = (sessionId = "s1") => (
    <StaffLangProvider lang="en">
      <ReaderCollectProvider>
        <Probe />
        <TerminalSettleButton sessionId={sessionId} totalCents={4210} tap={TAP} />
      </ReaderCollectProvider>
    </StaffLangProvider>
  );

  it("a start hands the provider the server's handle and the TAP's facts", async () => {
    settleCard.mockResolvedValueOnce({ ok: true, paymentIntentId: "pi_1", totalCents: 4210 });
    terminalStatus.mockResolvedValue({ ok: true, state: "collecting" });
    render(tree());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Card on the reader/ }));
    });
    expect(api.record).toMatchObject({
      sessionId: "s1",
      paymentIntentId: "pi_1",
      totalCents: 4210,
      isCounter: true,
      sentEarly: true,
      cartId: "c1",
      name: { counter: true, display: "reg-7f3a" },
    });
  });

  it("a start that answers after the button unmounted still starts the provider's poll (P2en)", async () => {
    let ok!: (v: unknown) => void;
    settleCard.mockReturnValueOnce(new Promise((r) => (ok = r)));
    terminalStatus.mockResolvedValue({ ok: true, state: "collecting" });
    const r = render(tree());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Card on the reader/ }));
    });
    r.rerender(
      <StaffLangProvider lang="en">
        <ReaderCollectProvider>
          <Probe />
        </ReaderCollectProvider>
      </StaffLangProvider>,
    );
    await act(async () => ok({ ok: true, paymentIntentId: "pi_1", totalCents: 4210 }));
    await flush();
    expect(terminalStatus).toHaveBeenCalledWith({ sessionId: "s1", paymentIntentId: "pi_1" });
  });

  it("held while the reader takes another table's payment: aria-disabled (never native), the note says whose, a tap asks nothing of the server", async () => {
    settleCard.mockResolvedValueOnce({ ok: true, paymentIntentId: "pi_9", totalCents: 1200 });
    terminalStatus.mockResolvedValue({ ok: true, state: "collecting" });
    render(
      <StaffLangProvider lang="en">
        <ReaderCollectProvider>
          <Probe />
          <TerminalSettleButton
            sessionId="s9"
            totalCents={1200}
            tap={{ ...TAP, isCounter: false, name: { counter: false, display: "7" } }}
          />
          <TerminalSettleButton sessionId="s1" totalCents={4210} tap={TAP} />
        </ReaderCollectProvider>
      </StaffLangProvider>,
    );
    const [seven, mine] = screen.getAllByRole("button", { name: /Card on the reader/ });
    await act(async () => {
      fireEvent.click(seven!);
    });
    await flush();
    expect(api.record?.sessionId).toBe("s9");
    expect(mine!.getAttribute("aria-disabled")).toBe("true");
    expect(mine!.hasAttribute("disabled")).toBe(false);
    const note = document.getElementById("terminal-busy")!;
    expect(note.textContent).toBe(
      tf("en", "settle.reader.busyElsewhere", { x: tf("en", "floor.table", { id: "7" }) }),
    );
    expect(mine!.getAttribute("aria-describedby")).toContain("terminal-busy");
    // The collecting table's own button is not "busy for itself".
    expect(seven!.getAttribute("aria-disabled")).toBeNull();
    await act(async () => {
      fireEvent.click(mine!);
    });
    // MUTATION (p2g-reader/reader-tap-ignores-the-collect): no tap-time refusal — a second freeze
    // and PaymentIntent for a reader already taking a card; red.
    expect(settleCard).toHaveBeenCalledTimes(1);
    // The collect ends (declined): the button is live again.
    terminalStatus.mockResolvedValue({ ok: true, state: "failed", error: "Declined." });
    await flush(2500);
    expect(mine!.getAttribute("aria-disabled")).toBeNull();
  });

  it("while the other payment is being RECORDED the hold says so — never 'taking a payment … finish that one first' (PT-2)", async () => {
    settleCard.mockResolvedValueOnce({ ok: true, paymentIntentId: "pi_9", totalCents: 1200 });
    terminalStatus.mockResolvedValue({
      ok: true,
      state: "succeeded",
      orderId: null,
      totalCents: 1200,
    });
    render(
      <StaffLangProvider lang="en">
        <ReaderCollectProvider>
          <Probe />
          <TerminalSettleButton
            sessionId="s9"
            totalCents={1200}
            tap={{ ...TAP, isCounter: false, name: { counter: false, display: "7" } }}
          />
          <TerminalSettleButton sessionId="s1" totalCents={4210} tap={TAP} />
        </ReaderCollectProvider>
      </StaffLangProvider>,
    );
    const [seven, mine] = screen.getAllByRole("button", { name: /Card on the reader/ });
    await act(async () => {
      fireEvent.click(seven!);
    });
    await flush();
    expect(api.poll.phase).toBe("recording");
    expect(mine!.getAttribute("aria-disabled")).toBe("true");
    // MUTATION (p2g-fix-reader/busy-note-ignores-the-phase): the note keeps "taking a payment …
    // finish that one first" over an idle reader and nothing to finish; red.
    expect(document.getElementById("terminal-busy")!.textContent).toBe(
      tf("en", "settle.reader.busyRecording", { x: tf("en", "floor.table", { id: "7" }) }),
    );
    // Given up as unrecorded (C1): the hold lifts.
    await flush(READER_UNRECORDED_MS);
    expect(api.poll.phase).toBe("unrecorded");
    expect(mine!.getAttribute("aria-disabled")).toBeNull();
    expect(document.getElementById("terminal-busy")).toBeNull();
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
        <ReaderCollectProvider>
          <TerminalSettleButton sessionId="s1" totalCents={4210} tap={TAP} onStarted={vi.fn()} />
        </ReaderCollectProvider>
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
        <ReaderCollectProvider>
          <TerminalSettleButton
            sessionId="s1"
            totalCents={4210}
            tap={TAP}
            onStarted={vi.fn()}
            blocked
            blockedNoteId="settle-unsent-note"
            onBlockedTap={onBlockedTap}
          />
        </ReaderCollectProvider>
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
        <ReaderCollectProvider>
          <TerminalSettleButton sessionId="s1" totalCents={4210} tap={TAP} onStarted={vi.fn()} />
        </ReaderCollectProvider>
      </StaffLangProvider>,
    );
    const trigger = screen.getByRole("button", { name: /Card on the reader/ });
    expect(trigger.getAttribute("aria-disabled")).toBeNull();
    expect(trigger.getAttribute("aria-describedby")).toBe("terminal-hint");
  });

  // ── Phase 2d · P2el ──
  it("a server `unreadable` refusal is said in Burmese in the one alert — the reader was never asked", async () => {
    settleCard.mockResolvedValueOnce({ ok: false, code: "unreadable", error: "english" });
    render(
      <StaffLangProvider lang="my">
        <ReaderCollectProvider>
          <TerminalSettleButton sessionId="s1" totalCents={4210} tap={TAP} onStarted={vi.fn()} />
        </ReaderCollectProvider>
      </StaffLangProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button")[0]!);
    });
    // MUTATION (p2d-el/reader-unreadable-said-as-server): drop the `unreadable` arm; red.
    expect(screen.getByRole("alert").textContent).toBe(tf("my", "settle.unsentUnreadable", {}));
    expect(document.body.textContent).not.toContain("english");
  });

  it("a server `unsent` refusal renders the dictionary sentence in Burmese with ITS count, hands the jump up once, and mounts no second alert", async () => {
    const english = "Some dishes haven’t gone to the kitchen.";
    settleCard.mockResolvedValueOnce({ ok: false, code: "unsent", units: 3, error: english });
    const onBlockedTap = vi.fn();
    render(
      <StaffLangProvider lang="my">
        <ReaderCollectProvider>
          <TerminalSettleButton
            sessionId="s1"
            totalCents={4210}
            tap={TAP}
            onStarted={vi.fn()}
            onBlockedTap={onBlockedTap}
          />
        </ReaderCollectProvider>
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
  it("a raced `unsent` refusal re-reads the page's detail so the Send it points at exists (Codex round 2, P2)", async () => {
    settleCard.mockResolvedValueOnce({ ok: false, code: "unsent", units: 1, error: "x" });
    const onChanged = vi.fn();
    render(
      <StaffLangProvider lang="en">
        <ReaderCollectProvider>
          <TerminalSettleButton
            sessionId="s1"
            totalCents={4210}
            tap={TAP}
            onStarted={vi.fn()}
            onBlockedTap={vi.fn()}
            onChanged={onChanged}
          />
        </ReaderCollectProvider>
      </StaffLangProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button")[0]!);
    });
    // MUTATION: no re-read — the page keeps its stale detail (no Send, no new line) until the poll; red.
    expect(onChanged).toHaveBeenCalledTimes(1);
  });
  // ── the critic's findings (Phase 2c · gate, round 2) ──
  const raced = { ok: false, code: "unsent", units: 2, error: "Some dishes haven’t gone." };
  const said = (running: boolean) =>
    tf("en", running ? "table.send.settleBlocked.tab.many" : "table.send.settleBlocked.many", {
      n: 2,
    });
  const el = (p: { blocked?: boolean; gateLive?: boolean; running?: boolean }) => (
    <StaffLangProvider lang="en">
      <ReaderCollectProvider>
        <TerminalSettleButton
          sessionId="s1"
          totalCents={4210}
          tap={TAP}
          onStarted={vi.fn()}
          {...p}
        />
      </ReaderCollectProvider>
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
