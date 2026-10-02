/** @vitest-environment jsdom */
import { useLayoutEffect } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STAFF } from "@/lib/i18n/staff";
import { tf } from "@/lib/i18n/fill";
import { SETTLE_MINUTES } from "@/lib/inflight-refusal";
import { READER_UNRECORDED_MS } from "@/lib/reader-collect";
import { STAFF_HANG_MS, track } from "@/lib/bounded-write";

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

/** Review a (A5) — whether the region's CONTENT was replaced or rewritten (what a screen reader
 *  announces) between this call and the returned check; equal text rendered in place records none. */
function watchRegion(node: Element) {
  const recs: MutationRecord[] = [];
  const obs = new MutationObserver((rs) => {
    recs.push(...rs);
  });
  obs.observe(node, { childList: true, subtree: true, characterData: true });
  return () => {
    recs.push(...obs.takeRecords());
    obs.disconnect();
    return recs.some(
      (r) => r.type === "characterData" || (r.type === "childList" && r.addedNodes.length > 0),
    );
  };
}

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
    // Phase 2h (9e) — THROWN is a LOST answer: "couldn't confirm … the reader may be asking for the
    // card now", never "couldn't start — try again" (a second tender while the reader collects).
    // MUTATION (p2h-doors/reader-start-threw-says-start-failed): red.
    expect(screen.getByRole("alert").textContent).toBe(STAFF["settle.reader.unknown"].en);
    expect(onStarted).not.toHaveBeenCalled();
  });
});

describe("TerminalSettleButton — Phase 2h: the START is bounded (9b · 9d · 9e)", () => {
  // A landed start writes the reader stash; a fresh provider would restore (and poll) it.
  beforeEach(() => {
    sessionStorage.clear();
    terminalStatus.mockResolvedValue({ ok: true, state: "collecting" });
  });
  /** The button in its provider, with the page's outcome hook, and a way to take it off the page. */
  function startTree() {
    const onSettleOutcome = vi.fn();
    const onStarted = vi.fn();
    const onBlockedTap = vi.fn();
    const view = (withButton: boolean) => (
      <StaffLangProvider lang="en">
        <ReaderCollectProvider>
          <Probe />
          {withButton && (
            <TerminalSettleButton
              sessionId="s1"
              totalCents={4210}
              tap={TAP}
              onStarted={onStarted}
              onSettleOutcome={onSettleOutcome}
              onBlockedTap={onBlockedTap}
            />
          )}
        </ReaderCollectProvider>
      </StaffLangProvider>
    );
    const r = render(view(true));
    // Held once: a busy Button keeps its element (the label swaps to "Starting the reader…").
    const el = screen.getByRole("button", { name: /Card on the reader/ });
    const trigger = () => el;
    const reloadBtn = () => screen.queryByRole("button", { name: STAFF["out.reload"].en });
    return {
      ...r,
      onSettleOutcome,
      onStarted,
      onBlockedTap,
      trigger,
      reloadBtn,
      unmountButton: () => r.rerender(view(false)),
    };
  }
  /** A start whose answer the case holds. */
  function hungStart() {
    let answer!: (v: unknown) => void;
    let fail!: (e: Error) => void;
    settleCard.mockReturnValueOnce(
      new Promise((res, rej) => {
        answer = res;
        fail = rej;
      }),
    );
    return { answer: (v: unknown) => answer(v), fail: (e: Error) => fail(e) };
  }

  it("a start with no answer frees the trigger AT the bound, says 'no answer yet' and offers the reload", async () => {
    // MUTATION (p2h-doors/reader-start-unbounded): the bound never fires — "Starting…" holds for as
    // long as the queue is stuck, the W10c latch in a new shape; red.
    hungStart();
    terminalStatus.mockResolvedValue({ ok: true, state: "collecting" });
    const t = startTree();
    await act(async () => {
      fireEvent.click(t.trigger());
    });
    await flush(STAFF_HANG_MS - 1);
    expect(t.trigger().getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByRole("alert")).toBeNull();
    await flush(1);
    expect(t.trigger().getAttribute("aria-busy")).toBeNull();
    // MUTATION (p2h-doors/reader-start-waiting-unsaid): said as "couldn't confirm" — the waiting
    // line's reload is never offered, and a late start reads as a lost one; red.
    expect(screen.getByRole("alert").textContent).toBe(STAFF["settle.reader.waiting"].en);
    // MUTATION (p2h-doors/reader-start-reload-missing): the line says "reload the page" on a
    // standalone console with no browser reload button; red.
    const reload = t.reloadBtn();
    expect(reload).not.toBeNull();
    // Beside the alert, never inside it (one live region; the button is no region of its own).
    expect(screen.getByRole("alert").contains(reload)).toBe(false);
    expect(t.onSettleOutcome).toHaveBeenCalledWith("unknown");
    expect(document.querySelectorAll("[disabled]")).toHaveLength(0);
  });

  it("while its start waits the trigger is HELD: a re-tap never replaces the money warning with 'this did nothing' (S2 critic D4)", async () => {
    const h = hungStart();
    const t = startTree();
    await act(async () => {
      fireEvent.click(t.trigger());
    });
    await flush(STAFF_HANG_MS);
    // MUTATION (p2h-doors/reader-start-waiting-retap-overwrites): the trigger is live again — the
    // re-tap meets its own stuck start in the ledger and the alert becomes out.stalled, dropping
    // "the reader may still start asking for the card. Don't take cash"; red.
    expect(t.trigger().getAttribute("aria-disabled")).toBe("true");
    expect(t.trigger().getAttribute("aria-describedby")).toContain("terminal-alert");
    await act(async () => {
      fireEvent.click(t.trigger());
    });
    expect(screen.getByRole("alert").textContent).toBe(STAFF["settle.reader.waiting"].en);
    expect(settleCard).toHaveBeenCalledTimes(1);
    expect(t.reloadBtn()).not.toBeNull();
    // The late answer frees it (a refusal: the trigger is the way forward again).
    await act(async () => h.answer({ ok: false, error: "The reader is offline." }));
    expect(t.trigger().getAttribute("aria-disabled")).toBeNull();
  });

  it("a LATE start lands: the provider's collect starts with the TAP's facts, and 'no answer yet' goes", async () => {
    const h = hungStart();
    terminalStatus.mockResolvedValue({ ok: true, state: "collecting" });
    const t = startTree();
    await act(async () => {
      fireEvent.click(t.trigger());
    });
    await flush(STAFF_HANG_MS);
    expect(screen.getByRole("alert").textContent).toBe(STAFF["settle.reader.waiting"].en);
    expect(api.record).toBeNull();
    // MUTATION (p2h-doors/reader-start-late-ok-dropped): the late answer is dropped — the reader IS
    // asking for the card, and no poll records the charge or slides the freeze; red.
    await act(async () => h.answer({ ok: true, paymentIntentId: "pi_late", totalCents: 4210 }));
    expect(api.record).toMatchObject({ sessionId: "s1", paymentIntentId: "pi_late", cartId: "c1" });
    expect(t.onStarted).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(STAFF["settle.reader.waiting"].en)).toBeNull();
    expect(t.reloadBtn()).toBeNull();
  });

  // Phase 2h · integration (doors residual · boards P1) — the late start answers the `unknown`
  // handed up at the bound: `landed` (the reader IS asking; the provider's chip says it), so a pane
  // that said "we don't know if the payment went through" off that unknown can retract it.
  it("a LATE start answers the unknown it handed up: 'landed', exactly once, after 'unknown' — even after unmount", async () => {
    const h = hungStart();
    const t = startTree();
    await act(async () => {
      fireEvent.click(t.trigger());
    });
    await flush(STAFF_HANG_MS);
    expect(t.onSettleOutcome.mock.calls).toEqual([["unknown"]]);
    t.unmountButton(); // the pane moved on mid-wait
    await act(async () => h.answer({ ok: true, paymentIntentId: "pi_late", totalCents: 4210 }));
    expect(api.record).toMatchObject({ sessionId: "s1", paymentIntentId: "pi_late" });
    // MUTATION (p2h-int-a/reader-landed-unreported): the late start hands nothing up — the pane
    // keeps "we don't know if the payment went through" while the reader is collecting it; red.
    // Critic F2 — `started`, never `landed`: the reader is asking for the card, nothing went through
    // yet. MUTATION (p2h-int-a/f2-reader-start-landed): the pane would say "went through"; red.
    expect(t.onSettleOutcome.mock.calls).toEqual([["unknown"], ["started"]]);
  });

  it("an ON-TIME start never says 'landed' — nothing was said to be unknown; a late REFUSAL or THROW never does either", async () => {
    settleCard.mockResolvedValueOnce({ ok: true, paymentIntentId: "pi_now", totalCents: 4210 });
    const t = startTree();
    await act(async () => {
      fireEvent.click(t.trigger());
    });
    await flush(0);
    expect(t.onStarted).toHaveBeenCalledTimes(1);
    // MUTATION (p2h-int-a/reader-landed-on-time): every start says `landed` — a start the pane
    // never doubted retracts whatever this table's line says; red.
    expect(t.onSettleOutcome).not.toHaveBeenCalled();
    cleanup();
    sessionStorage.clear(); // the landed start's stash: a fresh provider would restore its collect
    const refused = hungStart();
    const u = startTree();
    await act(async () => {
      fireEvent.click(u.trigger());
    });
    await flush(STAFF_HANG_MS);
    await act(async () => refused.answer({ ok: false, error: "The reader is offline." }));
    // MUTATION (p2h-int-a/reader-landed-on-refusal): any late answer says `landed` — the refusal's
    // "didn't go through" is retracted as it is said; red.
    expect(u.onSettleOutcome.mock.calls).toEqual([["unknown"], ["refused"]]);
    cleanup();
    const thrown = hungStart();
    const w = startTree();
    await act(async () => {
      fireEvent.click(w.trigger());
    });
    await flush(STAFF_HANG_MS);
    await act(async () => thrown.fail(new Error("fetch failed")));
    // MUTATION (p2h-int-a/reader-landed-on-throw): a lost late answer says `landed` — "we don't
    // know" is retracted while the reader may still be asking for the card; red.
    expect(w.onSettleOutcome.mock.calls).toEqual([["unknown"]]);
  });

  it("a LATE refusal is said while the button is here; after it left, the page is told instead", async () => {
    const first = hungStart();
    const t = startTree();
    await act(async () => {
      fireEvent.click(t.trigger());
    });
    await flush(STAFF_HANG_MS);
    expect(t.trigger().getAttribute("aria-busy")).toBeNull(); // free at the bound, not at the answer
    expect(screen.getByRole("alert").textContent).toBe(STAFF["settle.reader.waiting"].en);
    // MUTATION (p2h-doors/reader-start-late-refusal-unsaid): a late refusal is never said — the
    // cashier is left on "no answer yet" for a start the server refused; red.
    await act(async () => first.answer({ ok: false, error: "The reader is offline." }));
    expect(screen.getByRole("alert").textContent).toBe("The reader is offline.");
    expect(t.onSettleOutcome).toHaveBeenLastCalledWith("refused");
    const second = hungStart();
    await act(async () => {
      fireEvent.click(t.trigger());
    });
    await flush(STAFF_HANG_MS);
    t.unmountButton();
    // MUTATION (p2h-doors/reader-start-late-refusal-after-unmount): a late `unsent` refusal from a
    // button that is GONE still jumps the page to the Send — focus pulled off wherever the cashier
    // went; red. The page is told through `onSettleOutcome` instead.
    await act(async () =>
      second.answer({ ok: false, code: "unsent", units: 2, error: "Send the dishes first." }),
    );
    expect(t.onSettleOutcome).toHaveBeenLastCalledWith("refused");
    expect(t.onBlockedTap).not.toHaveBeenCalled();
    expect(api.record).toBeNull();
  });

  it("a LATE throw says 'couldn't confirm' over the waiting line — the reader may still be asking", async () => {
    const h = hungStart();
    const t = startTree();
    await act(async () => {
      fireEvent.click(t.trigger());
    });
    await flush(STAFF_HANG_MS);
    expect(screen.getByRole("alert").textContent).toBe(STAFF["settle.reader.waiting"].en);
    // MUTATION (p2h-doors/reader-start-late-throw-unsaid): the lost answer leaves "no answer yet"
    // standing for good; red.
    await act(async () => h.fail(new Error("fetch failed")));
    expect(screen.getByRole("alert").textContent).toBe(STAFF["settle.reader.unknown"].en);
    expect(t.reloadBtn()).toBeNull();
  });

  it("refused AT THE TAP while an earlier action is stuck: nothing is sent, the alert says so, the reload is beside it (9d)", async () => {
    terminalStatus.mockResolvedValue({ ok: true, state: "collecting" });
    const t = startTree();
    // An earlier action on this tab, unanswered for the bound (a hung poll, another sheet's write).
    void track(new Promise(() => {}));
    await flush(STAFF_HANG_MS);
    await act(async () => {
      fireEvent.click(t.trigger());
    });
    // MUTATION (p2h-doors/reader-start-stalled-dispatched): the start is dispatched into the stuck
    // queue — it could start the reader minutes from now, after the cashier took cash; red.
    expect(settleCard).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe(STAFF["out.stalled"].en);
    expect(t.reloadBtn()).not.toBeNull();
    expect(t.trigger().getAttribute("aria-busy")).toBeNull();
    // Review a (A5) — a SECOND refused tap puts the same sentence in the same alert: it must be
    // RE-SAID (the content replaced), or the screen reader hears nothing and the tap reads as dead.
    const said = watchRegion(screen.getByRole("alert"));
    await act(async () => {
      fireEvent.click(t.trigger());
    });
    expect(settleCard).not.toHaveBeenCalled();
    // MUTATION (p2h-rev-a/reader/resay-unkeyed): equal text rendered in place — no DOM change; red.
    expect(said()).toBe(true);
    expect(screen.getByRole("alert").textContent).toBe(STAFF["out.stalled"].en);
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

  it("a cancel with no answer at the bound frees, says 'no answer yet' in the panel and the region, and offers the reload beside them", async () => {
    terminalStatus.mockResolvedValue({ ok: true, state: "collecting" });
    cancelTerminal.mockReturnValueOnce(new Promise(() => {}));
    const { onStatus } = await panel();
    await flush();
    const cancel = screen.getByRole("button", { name: /Cancel the reader|Canceling/ });
    await act(async () => {
      fireEvent.click(cancel);
    });
    await flush(STAFF_HANG_MS);
    expect(cancel.getAttribute("aria-busy")).toBeNull();
    expect(group()!.textContent).toContain(STAFF["settle.reader.cancelWaiting"].en);
    expect(lastStatus(onStatus)).toEqual({
      tone: "warn",
      msg: { k: "settle.reader.cancelWaiting" },
    });
    // MUTATION (p2h-doors/panel-cancel-reload-missing): the line says "reload the page" and the
    // panel offers no reload — on a standalone console there is no other; red.
    const reload = screen.getByRole("button", { name: STAFF["out.reload"].en });
    expect(group()!.contains(reload)).toBe(true);
    // The panel is no live region; the button is none either (the page's region says it).
    expect(group()!.querySelectorAll('[role="alert"],[role="status"],[aria-live]')).toHaveLength(0);
    // MUTATION (p2h-doors/panel-cancel-waiting-live): the Cancel looks ready while its own cancel
    // is still out — a tap that can only do nothing (S2 critic D4); red.
    expect(cancel.getAttribute("aria-disabled")).toBe("true");
  });

  it("a THROWN cancel says 'couldn't confirm' — in the panel and the region, one binding (Phase 2h · 9e)", async () => {
    // MUTATION (p2h-core/panel-cancel-words-forked): the panel keeps its own copy of the cancel's
    // words ("Couldn't cancel just now — try again") while the region says the honest one — two
    // sentences about one tap, and the visible one invites a blind retry over a reader that may
    // already be cancelled; red.
    terminalStatus.mockResolvedValue({ ok: true, state: "collecting" });
    cancelTerminal.mockRejectedValueOnce(new Error("fetch failed"));
    const { onStatus } = await panel();
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Cancel the reader/ }));
    });
    await flush();
    expect(group()!.textContent).toContain(STAFF["settle.reader.cancelUnknown"].en);
    expect(group()!.textContent).not.toContain(STAFF["settle.reader.cancelFailed"].en);
    expect(lastStatus(onStatus)).toEqual({
      tone: "warn",
      msg: { k: "settle.reader.cancelUnknown" },
    });
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
    // Given up as unrecorded (C1): the POLL stops, but the hold becomes the WARNING's (Codex r2 on
    // #309) — a start here would replace the tab's one record and the only "don't take payment
    // again" with it — and it says why and how it lifts.
    await flush(READER_UNRECORDED_MS);
    expect(api.poll.phase).toBe("unrecorded");
    expect(mine!.getAttribute("aria-disabled")).toBe("true");
    expect(document.getElementById("terminal-busy")!.textContent).toBe(
      tf("en", "settle.reader.busyUnrecorded", { x: tf("en", "floor.table", { id: "7" }) }),
    );
    // Closed: the hold lifts.
    await act(async () => api.dismiss());
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
