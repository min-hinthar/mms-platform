/** @vitest-environment jsdom */
import { StrictMode, useLayoutEffect } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handoffStashKey } from "@/lib/floor-pane";
import {
  READER_COLLECT_KEY,
  READER_LANDED_KEY,
  READER_POLL_SILENT_MS,
  READER_UNRECORDED_MS,
  legacyCollectKey,
  type ReaderStart,
} from "@/lib/reader-collect";

/**
 * Phase 2g · reader (P2em · P2en) — the collect's owner, above navigation. Driven through a probe
 * that reads the provider's API, with the server actions mocked: the poll's CADENCE and its in-flight
 * guard, what survives the child that started it, the stash round-trip, the landing's card, and the
 * D4 "Back to payment" that keeps polling.
 */
const terminalStatus = vi.fn();
const cancelTerminal = vi.fn();
vi.mock("@/lib/terminal", () => ({
  settleCard: vi.fn(),
  terminalStatus: (...a: unknown[]) => terminalStatus(...(a as [])),
  cancelTerminal: (...a: unknown[]) => cancelTerminal(...(a as [])),
}));

const { ReaderCollectProvider } = await import("./ReaderCollectProvider");
const { useReaderCollect, ReaderShown } = await import("./ReaderCollectContext");
type Api = ReturnType<typeof useReaderCollect>;

let api!: Api;
function Probe() {
  const r = useReaderCollect();
  // Read after each commit (never a module write during render — react-hooks/globals).
  useLayoutEffect(() => {
    api = r;
  });
  return null;
}
/** A view of one table: registers it as shown, hands landings to `onLanded`. */
function Viewer({ id, onLanded }: { id: string; onLanded?: (h: unknown) => void }) {
  const reader = useReaderCollect();
  const shownHere = reader.shownHere;
  useLayoutEffect(() => shownHere(id, { onLanded }), [id, shownHere, onLanded]);
  return <p>viewing {id}</p>;
}

const START: ReaderStart = {
  sessionId: "s-7",
  paymentIntentId: "pi_7",
  totalCents: 4210,
  isCounter: true,
  name: { counter: true, display: "reg-7f3a" },
  sentEarly: true,
  cartId: "c-7",
};
const collecting = { ok: true, state: "collecting" } as const;
const tick = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
const mount = (children: React.ReactNode = null, strict = false) => {
  const tree = (
    <ReaderCollectProvider>
      <Probe />
      {children}
    </ReaderCollectProvider>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_800_000_000_000);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  terminalStatus.mockReset();
  cancelTerminal.mockReset();
  sessionStorage.clear();
});

describe("the poll lives above the view that started it (P2em)", () => {
  it("keeps calling terminalStatus every 2.5 s after the table's view unmounts", async () => {
    terminalStatus.mockResolvedValue(collecting);
    const r = mount(<Viewer id="s-7" />);
    await act(async () => api.start(START));
    await tick(0);
    expect(terminalStatus).toHaveBeenCalledWith({ sessionId: "s-7", paymentIntentId: "pi_7" });
    // "← Floor", Lock, More, a mint landing: the view goes; the provider stays.
    r.rerender(
      <ReaderCollectProvider>
        <Probe />
      </ReaderCollectProvider>,
    );
    const before = terminalStatus.mock.calls.length;
    await tick(7500);
    // MUTATION (p2g-reader/poll-dies-with-the-panel): the poll keyed on a view being mounted — it
    // stops with the detail, the freeze stops sliding and the counter's #CODE is never recorded; red.
    expect(terminalStatus.mock.calls.length).toBe(before + 3);
  });

  it("a start that answers after its view left still polls (P2en) — and owes no focus", async () => {
    terminalStatus.mockResolvedValue(collecting);
    mount();
    // No view registered for s-7: the detail that tapped is gone.
    await act(async () => api.start(START));
    await tick(0);
    expect(terminalStatus).toHaveBeenCalledTimes(1);
    expect(api.focusOwed).toBeNull();
  });

  it("a start made IN VIEW owes its panel the focus, once", async () => {
    terminalStatus.mockResolvedValue(collecting);
    mount(<Viewer id="s-7" />);
    await act(async () => api.start(START));
    expect(api.focusOwed).toBe("pi_7");
    await act(async () => api.focusTaken("pi_7"));
    expect(api.focusOwed).toBeNull();
  });
});

describe("ONE poll in the air", () => {
  it("Strict Mode's double effects dispatch no second poll — and its answers still land", async () => {
    terminalStatus.mockResolvedValue({ ok: true, state: "failed", error: "Declined." });
    mount(null, true);
    await act(async () => api.start(START));
    await tick(0);
    expect(terminalStatus).toHaveBeenCalledTimes(1);
    // MUTATION (p2g-reader/alive-latched-by-strict-mode): the "still here" latch set once and cleared
    // by Strict Mode's mount-time cleanup — every answer is dropped as if the provider had gone; red.
    expect(api.poll.phase).toBe("failed");
    await tick(2500);
    expect(terminalStatus).toHaveBeenCalledTimes(1); // declined: the poll stopped
  });

  it("a hung poll is never re-dispatched; its silence costs a miss per span, then the panel says blind", async () => {
    terminalStatus.mockReturnValueOnce(new Promise(() => {}));
    mount();
    await act(async () => api.start(START));
    await tick(0);
    expect(terminalStatus).toHaveBeenCalledTimes(1);
    await tick(READER_POLL_SILENT_MS * 3 + 2500);
    // MUTATION (p2g-reader/poll-dispatched-over-an-unanswered-one): no in-flight guard — a poll every
    // 2.5 s queues behind the hung one (Next runs Server Actions one at a time); red.
    expect(terminalStatus).toHaveBeenCalledTimes(1);
    // MUTATION (p2g-reader/hung-poll-never-a-miss): silence is not counted — "waiting" forever over
    // a reader nobody can see; red.
    expect(api.poll.misses).toBe(3);
    expect(api.status).toEqual({ tone: "warn", msg: { k: "settle.reader.status.blind" } });
  });
});

describe("the stash — one record per tab, restored after a hard navigation", () => {
  it("start writes it; a fresh provider restores it and polls the same handle", async () => {
    terminalStatus.mockResolvedValue(collecting);
    const r = mount();
    await act(async () => api.start(START));
    await tick(0);
    const raw = sessionStorage.getItem(READER_COLLECT_KEY);
    expect(raw).toContain('"paymentIntentId":"pi_7"');
    r.unmount(); // a reload: the provider is gone, sessionStorage stays
    terminalStatus.mockClear();
    mount();
    await tick(0);
    // MUTATION (p2g-reader/restore-skipped): no restore on mount — a reload mid-collect orphans the
    // reader charge with no Cancel and no #CODE; red.
    expect(api.record?.paymentIntentId).toBe("pi_7");
    expect(api.record?.name).toEqual(START.name);
    expect(terminalStatus).toHaveBeenCalledWith({ sessionId: "s-7", paymentIntentId: "pi_7" });
  });

  it("each LIVE answer slides the stash's clock: a collect still answering after the freeze's TTL is restored", async () => {
    terminalStatus.mockResolvedValue(collecting);
    const r = mount();
    await act(async () => api.start(START));
    await tick(11 * 60_000); // a slow guest: eleven minutes of live answers
    r.unmount();
    mount();
    await tick(0);
    // MUTATION (p2g-reader/live-answer-never-slides-the-stash): the clock frozen at the start — a
    // reload eleven minutes in drops a collect whose freeze the poll is still holding; red.
    expect(api.record?.paymentIntentId).toBe("pi_7");
  });

  it("a legacy per-table entry is adopted once by its table's detail — never over a standing record", async () => {
    terminalStatus.mockResolvedValue(collecting);
    sessionStorage.setItem(
      legacyCollectKey("s-4"),
      JSON.stringify({ paymentIntentId: "pi_4", totalCents: 1200 }),
    );
    mount();
    await tick(0);
    const at = {
      sessionId: "s-4",
      isCounter: false,
      name: { counter: false, display: "4" },
      sentEarly: false,
      cartId: "c-4",
    };
    await act(async () => api.adoptLegacy(at));
    expect(api.record?.paymentIntentId).toBe("pi_4");
    expect(sessionStorage.getItem(legacyCollectKey("s-4"))).toBeNull();
    // A second legacy entry while that one stands is read and dropped, never adopted.
    sessionStorage.setItem(
      legacyCollectKey("s-5"),
      JSON.stringify({ paymentIntentId: "pi_5", totalCents: 500 }),
    );
    await act(async () => api.adoptLegacy({ ...at, sessionId: "s-5" }));
    expect(api.record?.paymentIntentId).toBe("pi_4");
    expect(sessionStorage.getItem(legacyCollectKey("s-5"))).toBeNull();
  });
});

describe("the landing — the card, the stash, and whoever shows its table", () => {
  const landed = { ok: true, state: "succeeded", orderId: "o-00a1b2c3", totalCents: 4210 } as const;

  it("off screen: the counter's card is stashed for its table and held for the chip", async () => {
    terminalStatus.mockResolvedValue(landed);
    mount();
    await act(async () => api.start(START));
    await tick(0);
    // MUTATION (p2g-reader/landed-not-stashed): no stash — the pane's closed state (the webhook
    // closed the counter session) has no card to show; red.
    expect(sessionStorage.getItem(handoffStashKey("s-7"))).toContain("o-00a1b2c3");
    expect(api.landed).toEqual([
      {
        sessionId: "s-7",
        name: START.name,
        orderId: "o-00a1b2c3",
        totalCents: 4210,
        handoff: {
          orderId: "o-00a1b2c3",
          totalCents: 4210,
          tipCents: null,
          tenderedCents: null,
          isCounter: true,
          cartId: "c-7",
          sentEarly: true,
        },
        landedAt: Date.now(),
      },
    ]);
    expect(api.record).toBeNull();
    expect(sessionStorage.getItem(READER_COLLECT_KEY)).toBeNull();
    // The poll is over.
    const n = terminalStatus.mock.calls.length;
    await tick(5000);
    expect(terminalStatus.mock.calls.length).toBe(n);
  });

  it("on screen: handed to the view (which adopts it), never held for the chip", async () => {
    terminalStatus.mockResolvedValue(landed);
    const onLanded = vi.fn();
    mount(<Viewer id="s-7" onLanded={onLanded} />);
    await act(async () => api.start(START));
    await tick(0);
    expect(onLanded).toHaveBeenCalledWith(expect.objectContaining({ orderId: "o-00a1b2c3" }));
    expect(api.landed).toEqual([]);
  });

  it("a TABLE landing hands the view null (re-read; the paid state is the signal) and holds nothing", async () => {
    terminalStatus.mockResolvedValue(landed);
    const onLanded = vi.fn();
    mount(<Viewer id="s-7" onLanded={onLanded} />);
    await act(async () =>
      api.start({ ...START, isCounter: false, name: { counter: false, display: "7" } }),
    );
    await tick(0);
    expect(onLanded).toHaveBeenCalledWith(null);
    expect(sessionStorage.getItem(handoffStashKey("s-7"))).toBeNull();
    expect(api.landed).toEqual([]);
  });

  it("a TABLE landing OFF screen is held too — no card, its amount and name (PT-1)", async () => {
    terminalStatus.mockResolvedValue(landed);
    mount();
    await act(async () =>
      api.start({ ...START, isCounter: false, name: { counter: false, display: "7" } }),
    );
    await tick(0);
    // MUTATION (p2g-fix-reader/table-landing-vanishes): only a counter's card is held — the chip that
    // told the cashier to wait for the table's order just disappears when it lands; red.
    expect(api.landed).toEqual([
      {
        sessionId: "s-7",
        name: { counter: false, display: "7" },
        orderId: "o-00a1b2c3",
        totalCents: 4210,
        handoff: null,
        landedAt: Date.now(),
      },
    ]);
    expect(sessionStorage.getItem(handoffStashKey("s-7"))).toBeNull();
  });

  it("two landings off screen BOTH stand, oldest first — and a remount (a hard navigation) restores them (M1)", async () => {
    terminalStatus.mockResolvedValue(landed);
    const r = mount();
    await act(async () => api.start(START));
    await tick(0);
    terminalStatus.mockResolvedValue({ ...landed, orderId: "o-00b2b2b2" });
    await act(async () =>
      api.start({ ...START, sessionId: "s-8", paymentIntentId: "pi_8", cartId: "c-8" }),
    );
    await tick(0);
    expect(api.landed.map((l) => [l.sessionId, l.orderId])).toEqual([
      ["s-7", "o-00a1b2c3"],
      ["s-8", "o-00b2b2b2"],
    ]);
    const held = api.landed;
    r.unmount(); // `window.location.assign("/staff/lock")`, a reload: the provider is gone
    mount();
    await tick(0);
    // MUTATION (p2g-fix-reader/landed-never-restored): the queue lives in memory only — the floor
    // poll's lock bounce erases every #CODE the bar was holding; red.
    // MUTATION (p2g-fix-reader/landed-never-stashed): the queue is never written — the same; red.
    expect(api.landed).toEqual(held);
    expect(JSON.parse(sessionStorage.getItem(READER_LANDED_KEY)!)).toHaveLength(2);
  });

  it("a restored landing whose table is ALREADY shown goes straight to that view — never held for the chip", async () => {
    terminalStatus.mockResolvedValue(landed);
    const r = mount();
    await act(async () => api.start(START));
    await tick(0);
    r.unmount();
    const onLanded = vi.fn();
    mount(<Viewer id="s-7" onLanded={onLanded} />);
    await tick(0);
    expect(onLanded).toHaveBeenCalledWith(expect.objectContaining({ orderId: "o-00a1b2c3" }));
    expect(api.landed).toEqual([]);
    expect(sessionStorage.getItem(READER_LANDED_KEY)).toBeNull();
  });

  it("a card that landed off screen goes to the view that shows its table later — once", async () => {
    terminalStatus.mockResolvedValue(landed);
    const r = mount();
    await act(async () => api.start(START));
    await tick(0);
    expect(api.landed[0]?.sessionId).toBe("s-7");
    const onLanded = vi.fn();
    r.rerender(
      <ReaderCollectProvider>
        <Probe />
        <Viewer id="s-7" onLanded={onLanded} />
      </ReaderCollectProvider>,
    );
    expect(onLanded).toHaveBeenCalledTimes(1);
    // MUTATION (p2g-fix-reader/shown-table-keeps-its-landing): handed over AND still held — the chip
    // comes back with a card the view already showed, once the table is left; red.
    expect(api.landed).toEqual([]);
    expect(sessionStorage.getItem(READER_LANDED_KEY)).toBeNull();
  });

  it("dismissing one landing leaves the others standing", async () => {
    terminalStatus.mockResolvedValue(landed);
    mount();
    await act(async () => api.start(START));
    await tick(0);
    terminalStatus.mockResolvedValue({ ...landed, orderId: "o-00b2b2b2" });
    await act(async () =>
      api.start({ ...START, sessionId: "s-8", paymentIntentId: "pi_8", cartId: "c-8" }),
    );
    await tick(0);
    await act(async () => api.dismissLanded("s-7"));
    expect(api.landed.map((l) => l.sessionId)).toEqual(["s-8"]);
  });
});

describe("a charge that never records is given up (C1 · P2gb)", () => {
  const charged = { ok: true, state: "succeeded", orderId: null, totalCents: 4210 } as const;

  it("put away while recording, it comes BACK as unrecorded: the poll stops, the warning is KEPT, the reader is free, Close clears it", async () => {
    terminalStatus.mockResolvedValue(charged);
    mount();
    await act(async () => api.start(START));
    await tick(0);
    await act(async () => api.dismiss()); // "Hide this — we'll keep checking"
    expect(api.record?.hidden).toBe(true);
    expect(api.startRefused("s-9")).toBe(true);
    await tick(READER_UNRECORDED_MS);
    expect(api.poll.phase).toBe("unrecorded");
    // MUTATION (p2g-fix-reader/unrecorded-stays-hidden): the given-up charge stays put away — the
    // panel and the chip never say "don't take payment again"; red.
    expect(api.record?.hidden).toBe(false);
    expect(api.live).toBe(false);
    expect(api.startRefused("s-9")).toBe(true);
    // Codex r1 on #309 — the stash is the warning's only durable copy on this tab: KEPT, marked.
    // MUTATION (p2g-cx1/unrecorded-stash-dropped): dropped at the bound — a reload erases "don't take
    // payment again" while the cart is still open; red.
    expect(JSON.parse(sessionStorage.getItem(READER_COLLECT_KEY) ?? "null")).toMatchObject({
      paymentIntentId: START.paymentIntentId,
      hidden: false,
      unrecordedAt: expect.any(Number),
    });
    expect(api.status).toEqual({ tone: "warn", msg: { k: "settle.reader.status.unrecorded" } });
    const n = terminalStatus.mock.calls.length;
    await tick(10_000);
    expect(terminalStatus.mock.calls.length).toBe(n);
    await act(async () => api.dismiss());
    expect(api.record).toBeNull();
    // Close is the ONE way out — it takes the stash with it, and frees the reader (Codex r2).
    expect(sessionStorage.getItem(READER_COLLECT_KEY)).toBeNull();
    expect(api.startRefused("s-9")).toBe(false);
  });

  it("a reload after the bound brings the WARNING back — no poll, the reader free, and long past any idle expiry", async () => {
    terminalStatus.mockResolvedValue(charged);
    const r = mount();
    await act(async () => api.start(START));
    await tick(0);
    await tick(READER_UNRECORDED_MS);
    expect(api.poll.phase).toBe("unrecorded");
    r.unmount();
    // Hours later — far past the idle bound a LIVE collect would expire at.
    await tick(READER_UNRECORDED_MS * 4);
    const n = terminalStatus.mock.calls.length;
    mount();
    await tick(0);
    // MUTATION (p2g-cx1/restore-unrecorded-polls): the restore resumes "recording" — the screen polls
    // a charge it already gave up on and says it is still checking; red.
    expect(api.poll.phase).toBe("unrecorded");
    expect(api.record?.paymentIntentId).toBe(START.paymentIntentId);
    expect(api.status).toEqual({ tone: "warn", msg: { k: "settle.reader.status.unrecorded" } });
    expect(api.startRefused("s-9")).toBe(true);
    await tick(10_000);
    expect(terminalStatus.mock.calls.length).toBe(n);
    await act(async () => api.dismiss());
    expect(sessionStorage.getItem(READER_COLLECT_KEY)).toBeNull();
  });

  it("a reload mid-recording resumes the SAME clock — never a fresh window, never 'On the reader' again", async () => {
    terminalStatus.mockResolvedValue(charged);
    const r = mount();
    await act(async () => api.start(START));
    await tick(0);
    await tick(READER_UNRECORDED_MS / 2);
    r.unmount();
    mount();
    await tick(0);
    expect(api.poll.phase).toBe("recording");
    // MUTATION (p2g-fix-reader/recording-clock-never-stashed): the clock rides only the poll — the
    // reload restarts it, and a charge that never records holds the tab another full window; red.
    // MUTATION (p2g-fix-reader/restore-starts-collecting): the restored record resumes from
    // "collecting" with no clock; red.
    await tick(READER_UNRECORDED_MS / 2 + 2500);
    expect(api.poll.phase).toBe("unrecorded");
  });
});

// Codex r2 on #309 — the pane keeps ONE \`ReaderShown\` across selections, so a switch A → B reuses
// it, and \`shownHere(B)\` hands B's queued landing over synchronously in the registration's layout
// effect. The handler it calls must already be B's.
describe("ReaderShown reused across a switch hands a landing to the NEW table's handler", () => {
  const landedFor = (orderId: string) =>
    ({ ok: true, state: "succeeded", orderId, totalCents: 4210 }) as const;

  it("A → B: B's queued card reaches B's handler, never A's", async () => {
    terminalStatus.mockResolvedValue(landedFor("o-00b2b2b2"));
    const onA = vi.fn();
    const onB = vi.fn();
    const r = mount(<ReaderShown sessionId="s-1" onLanded={onA} />);
    await act(async () =>
      api.start({ ...START, sessionId: "s-8", paymentIntentId: "pi_8", cartId: "c-8" }),
    );
    await tick(0);
    expect(api.landed.map((l) => l.sessionId)).toEqual(["s-8"]);
    r.rerender(
      <ReaderCollectProvider>
        <Probe />
        <ReaderShown sessionId="s-8" onLanded={onB} />
      </ReaderCollectProvider>,
    );
    // MUTATION (p2g-cx2/shown-handler-updated-late): the handler ref is refreshed in a PASSIVE
    // effect — the registration's layout effect runs first and files B's card under A; red.
    expect(onA).not.toHaveBeenCalled();
    expect(onB).toHaveBeenCalledWith(expect.objectContaining({ orderId: "o-00b2b2b2" }));
    expect(api.landed).toEqual([]);
  });
});

describe("the alert memory", () => {
  it("remembers EVERY outcome said, not just the last (a queue of landings, then a decline)", async () => {
    mount();
    await act(async () => api.markAlertSaid("o-1:landed"));
    await act(async () => api.markAlertSaid("pi_7:failed"));
    // MUTATION (p2g-fix-reader/alert-memory-one-slot): one slot — closing the decline brings the
    // first landing back to the chip and it is said a second time; red.
    expect(api.alertSaid.has("o-1:landed")).toBe(true);
    expect(api.alertSaid.has("pi_7:failed")).toBe(true);
  });
});

describe("Back to payment (D4) and cancel", () => {
  it("charged-not-recorded: put away, still polling — and the order's card still lands", async () => {
    terminalStatus.mockResolvedValue({
      ok: true,
      state: "succeeded",
      orderId: null,
      totalCents: 4210,
    });
    mount();
    await act(async () => api.start(START));
    await tick(0);
    expect(api.poll.phase).toBe("recording");
    await act(async () => api.dismiss());
    expect(api.record?.hidden).toBe(true);
    const n = terminalStatus.mock.calls.length;
    await tick(5000);
    // MUTATION (p2g-reader/recording-dismiss-stops-the-poll): "Back to payment" clears the collect —
    // the poll stops while the charge has gone through, and its #CODE is never recorded; red.
    expect(terminalStatus.mock.calls.length).toBeGreaterThan(n);
    terminalStatus.mockResolvedValue({
      ok: true,
      state: "succeeded",
      orderId: "o-00a1b2c3",
      totalCents: 4210,
    });
    await tick(2500);
    expect(api.landed[0]?.handoff?.orderId).toBe("o-00a1b2c3");
  });

  it("declined: the stash goes at once (nothing to re-attach), the outcome stands until dismissed", async () => {
    terminalStatus.mockResolvedValue({ ok: true, state: "failed", error: "Declined." });
    mount();
    await act(async () => api.start(START));
    await tick(0);
    expect(api.poll.phase).toBe("failed");
    expect(api.live).toBe(false);
    expect(sessionStorage.getItem(READER_COLLECT_KEY)).toBeNull();
    expect(api.record).not.toBeNull();
    await act(async () => api.dismiss());
    expect(api.record).toBeNull();
  });

  it("cancel lands canceled even with no view up; a refusal is spoken, not applied", async () => {
    terminalStatus.mockResolvedValue(collecting);
    cancelTerminal.mockResolvedValueOnce({ ok: false, error: "Too late to cancel." });
    mount();
    await act(async () => api.start(START));
    await tick(0);
    await act(async () => api.cancel());
    expect(api.poll.phase).toBe("collecting");
    expect(api.spoken).toEqual({ tone: "warn", msg: "Too late to cancel." });
    cancelTerminal.mockResolvedValueOnce({ ok: true });
    await act(async () => api.cancel());
    expect(api.poll.phase).toBe("canceled");
    expect(api.spoken).toEqual({ tone: "ok", msg: { k: "settle.reader.status.canceled" } });
    expect(sessionStorage.getItem(READER_COLLECT_KEY)).toBeNull();
  });
  // Codex r3 on #309 — a cancel refusal answers the phase it was asked in. A poll that then learns a
  // NEW outcome is the newer fact: the old "too late" must never mask a decline (or "don't take
  // payment again"), which the panel would otherwise mark as said behind it.
  it("a cancel refusal is retired the moment a poll learns a new outcome", async () => {
    terminalStatus.mockResolvedValue(collecting);
    cancelTerminal.mockResolvedValueOnce({ ok: false, error: "Too late to cancel." });
    mount();
    await act(async () => api.start(START));
    await tick(0);
    await act(async () => api.cancel());
    expect(api.spoken).toEqual({ tone: "warn", msg: "Too late to cancel." });
    // The same phase answered again: the refusal still stands (it is still the newest fact).
    await tick(2500);
    expect(api.spoken).toEqual({ tone: "warn", msg: "Too late to cancel." });
    terminalStatus.mockResolvedValue({
      ok: true,
      state: "failed",
      error: "The card was declined.",
    });
    await tick(2500);
    expect(api.poll.phase).toBe("failed");
    // MUTATION (p2g-cx3/cancel-refusal-masks-the-outcome): the refusal outlives its phase — the
    // region keeps "Too late to cancel." over the decline; red.
    expect(api.cancelError).toBeNull();
    expect(api.spoken).toEqual(api.status);
  });
});

describe("the one refusal, read at tap time", () => {
  it("another table is refused while live; its own is not; a declined collect holds nothing", async () => {
    terminalStatus.mockResolvedValue(collecting);
    mount();
    await act(async () => api.start(START));
    await tick(0);
    expect(api.startRefused("s-9")).toBe(true);
    expect(api.startRefused("s-7")).toBe(false);
    terminalStatus.mockResolvedValue({ ok: true, state: "failed", error: "Declined." });
    await tick(2500);
    expect(api.startRefused("s-9")).toBe(false);
  });
});
