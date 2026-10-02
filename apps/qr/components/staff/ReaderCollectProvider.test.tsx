/** @vitest-environment jsdom */
import { StrictMode, useLayoutEffect } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handoffStashKey } from "@/lib/floor-pane";
import { STAFF_HANG_MS, stalledSince, track } from "@/lib/bounded-write";
import {
  READER_COLLECT_KEY,
  READER_COLLECT_MAX_IDLE_MS,
  READER_LANDED_KEY,
  READER_PENDING_KEY,
  READER_POLL_SILENT_MS,
  READER_UNRECORDED_MS,
  legacyCollectKey,
  readerResumeDelay,
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
/** Codex r2 on #310 (A3) — the read-only resume of a start a reload stranded. */
const terminalResume = vi.fn();
vi.mock("@/lib/terminal", () => ({
  settleCard: vi.fn(),
  terminalStatus: (...a: unknown[]) => terminalStatus(...(a as [])),
  cancelTerminal: (...a: unknown[]) => cancelTerminal(...(a as [])),
  terminalResume: (...a: unknown[]) => terminalResume(...(a as [])),
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
  terminalResume.mockResolvedValue({ ok: true, collect: null, held: false });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  terminalStatus.mockReset();
  cancelTerminal.mockReset();
  terminalResume.mockReset();
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

  it("a hung poll's FIRST miss lands at the very instant the stall ledger calls the tab stalled — one bound, STAFF_HANG_MS (integration c · R1)", async () => {
    terminalStatus.mockReturnValueOnce(new Promise(() => {}));
    mount();
    await act(async () => api.start(START));
    await tick(0);
    expect(terminalStatus).toHaveBeenCalledTimes(1);
    // The poll's interval lands a tick on the bound itself (15 s is six 2.5 s ticks).
    await tick(STAFF_HANG_MS - 1);
    expect(stalledSince()).toBeNull();
    expect(api.poll.misses).toBe(0);
    await tick(1);
    // MUTATION (p2h-int-c/reader/silence-bound-late): a second spelling of the bound a hair long —
    // the money doors already refuse "this tablet is still waiting" while the reader panel still
    // reads its silent poll as healthy; red.
    expect(stalledSince()).not.toBeNull();
    expect(api.poll.misses).toBe(1);
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

  // Codex r4 on #309 — the race behind it: the poll moves the collect on while the cancel is still in
  // the air, and the refusal answers afterwards. Those phases never poll again, so a refusal written
  // then would mask the newer outcome for good.
  it("a refusal that answers AFTER a poll moved the collect on is dropped, not written", async () => {
    terminalStatus.mockResolvedValue(collecting);
    let answerCancel!: (v: { ok: false; error: string }) => void;
    cancelTerminal.mockReturnValueOnce(new Promise((r) => (answerCancel = r)));
    mount();
    await act(async () => api.start(START));
    await tick(0);
    let pending!: Promise<void>;
    await act(async () => {
      pending = api.cancel();
    });
    terminalStatus.mockResolvedValue({
      ok: true,
      state: "failed",
      error: "The card was declined.",
    });
    await tick(2500);
    expect(api.poll.phase).toBe("failed");
    await act(async () => {
      answerCancel({ ok: false, error: "Too late to cancel." });
      await pending;
    });
    // MUTATION (p2g-cx4/late-refusal-masks-the-outcome): written regardless of the phase it was
    // asked in — "Too late to cancel." stands over the decline for good; red.
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

describe("Phase 2h (9d) — the status read sits on the stall ledger until it answers", () => {
  it("a hung status read makes the tab read stalled at 15s — and one poll stays in the air", async () => {
    // MUTATION (p2h-core/track-reader-status): the 2.5s status read is not tracked — hung, it holds
    // the action queue while the ledger calls the tab healthy, and a cash or refund tap is
    // dispatched behind it; red.
    terminalStatus.mockReturnValue(new Promise(() => {}));
    mount();
    const startedAt = Date.now();
    await act(async () => api.start(START));
    await tick(STAFF_HANG_MS - 1);
    expect(stalledSince()).toBeNull();
    await tick(1);
    expect(stalledSince()).toBe(startedAt);
    // Never a second read over the hung one (`flight`).
    expect(terminalStatus).toHaveBeenCalledTimes(1);
  });
});

describe("Phase 2h — the reader CANCEL is bounded (9b · 9d · 9e)", () => {
  /** A cancel whose answer the case holds. */
  function hungCancel() {
    let answer!: (v: { ok: true } | { ok: false; error: string }) => void;
    let fail!: (e: Error) => void;
    cancelTerminal.mockReturnValueOnce(
      new Promise((res, rej) => {
        answer = res;
        fail = rej;
      }),
    );
    return { answer: (v: { ok: true } | { ok: false; error: string }) => answer(v), fail };
  }
  async function collectingNow() {
    terminalStatus.mockResolvedValue(collecting);
    mount();
    await act(async () => api.start(START));
    await tick(0);
  }
  const declined = { ok: true, state: "failed", error: "The card was declined." } as const;

  it("no answer at the bound: busy frees, the region says 'no answer yet' — and the LATE cancel lands canceled", async () => {
    const h = hungCancel();
    await collectingNow();
    await act(async () => {
      void api.cancel();
    });
    expect(api.cancelBusy).toBe(true);
    await tick(STAFF_HANG_MS - 1);
    expect(api.cancelBusy).toBe(true);
    expect(api.cancelError).toBeNull();
    await tick(1);
    // Free AT the bound, never held by the raw (fact 3).
    expect(api.cancelBusy).toBe(false);
    // MUTATION (p2h-doors/cancel-waiting-unsaid): the bound passes in silence — the cashier is told
    // nothing while the reader may still take the card; red.
    expect(api.cancelError).toEqual({ kind: "waiting" });
    expect(api.spoken).toEqual({ tone: "warn", msg: { k: "settle.reader.cancelWaiting" } });
    // MUTATION (p2h-doors/cancel-late-ok-dropped): the late answer is dropped — the reader WAS
    // cancelled, and the collect keeps saying "on the reader"; red.
    await act(async () => h.answer({ ok: true }));
    expect(api.poll.phase).toBe("canceled");
    expect(api.cancelError).toBeNull();
    expect(api.spoken).toEqual({ tone: "ok", msg: { k: "settle.reader.status.canceled" } });
    expect(sessionStorage.getItem(READER_COLLECT_KEY)).toBeNull();
  });

  it("a re-tap while this cancel still waits changes nothing — the money warning stands, nothing is sent (S2 critic D4)", async () => {
    const h = hungCancel();
    await collectingNow();
    await act(async () => {
      void api.cancel();
    });
    await tick(STAFF_HANG_MS);
    expect(api.cancelError).toEqual({ kind: "waiting" });
    // MUTATION (p2h-doors/cancel-waiting-retap-overwrites): the re-tap meets its own stuck cancel
    // in the ledger and the region says "this did nothing — reload", dropping "the reader may still
    // be taking the card. Check it before you take another payment"; red.
    await act(async () => api.cancel());
    expect(api.cancelError).toEqual({ kind: "waiting" });
    expect(cancelTerminal).toHaveBeenCalledTimes(1);
    // The late answer lets go of it: a refusal, then a fresh tap is a fresh cancel.
    await act(async () => h.answer({ ok: false, error: "Too late to cancel." }));
    cancelTerminal.mockResolvedValueOnce({ ok: true });
    await act(async () => api.cancel());
    // MUTATION (p2h-doors/cancel-waiting-never-clears): the latch outlives its answer — every later
    // cancel of this collect is swallowed; red.
    expect(cancelTerminal).toHaveBeenCalledTimes(2);
  });

  it("a LATE refusal while the collect is where it was asked is said over the waiting line", async () => {
    const h = hungCancel();
    await collectingNow();
    await act(async () => {
      void api.cancel();
    });
    await tick(STAFF_HANG_MS);
    expect(api.cancelError).toEqual({ kind: "waiting" });
    await act(async () => h.answer({ ok: false, error: "Too late to cancel." }));
    expect(api.spoken).toEqual({ tone: "warn", msg: "Too late to cancel." });
  });

  it("a LATE throw while the collect is where it was asked says 'couldn't confirm' over the waiting line", async () => {
    const h = hungCancel();
    await collectingNow();
    await act(async () => {
      void api.cancel();
    });
    await tick(STAFF_HANG_MS);
    expect(api.cancelError).toEqual({ kind: "waiting" });
    // MUTATION (p2h-doors/cancel-late-throw-unsaid): the lost answer leaves "no answer yet"
    // standing for good; red.
    await act(async () => h.fail(new Error("fetch failed")));
    expect(api.cancelError).toEqual({ kind: "local" });
    expect(api.spoken).toEqual({ tone: "warn", msg: { k: "settle.reader.cancelUnknown" } });
  });

  it("a waiting line is never written over a collect that moved on before the bound", async () => {
    hungCancel();
    await collectingNow();
    await act(async () => {
      void api.cancel();
    });
    terminalStatus.mockResolvedValue(declined);
    await tick(2500);
    expect(api.poll.phase).toBe("failed");
    await tick(STAFF_HANG_MS);
    expect(api.cancelBusy).toBe(false);
    // MUTATION (p2h-doors/cancel-waiting-masks-the-outcome): the bound writes "no answer yet" over
    // the decline — and a failed collect never polls again, so it masks the decline for good; red.
    expect(api.cancelError).toBeNull();
    expect(api.spoken).toEqual(api.status);
  });

  it("a LATE throw after the collect moved on is dropped — the newer outcome stands", async () => {
    const h = hungCancel();
    await collectingNow();
    await act(async () => {
      void api.cancel();
    });
    await tick(STAFF_HANG_MS);
    expect(api.cancelError).toEqual({ kind: "waiting" });
    terminalStatus.mockResolvedValue(declined);
    await tick(2500);
    expect(api.poll.phase).toBe("failed");
    expect(api.cancelError).toBeNull(); // the phase change retired the waiting line
    // MUTATION (p2h-doors/cancel-late-throw-masks-the-outcome): the lost answer is written as
    // "couldn't confirm" over the decline, for good; red.
    await act(async () => h.fail(new Error("fetch failed")));
    expect(api.cancelError).toBeNull();
    expect(api.spoken).toEqual(api.status);
  });

  it("refused AT THE TAP while an earlier action is stuck: never sent, the region says so (9d)", async () => {
    await collectingNow();
    void track(new Promise(() => {}));
    await tick(STAFF_HANG_MS);
    await act(async () => api.cancel());
    // MUTATION (p2h-doors/cancel-stalled-dispatched): the cancel is queued behind the stuck action —
    // it could reach the reader minutes from now, after a second payment was taken; red.
    expect(cancelTerminal).not.toHaveBeenCalled();
    expect(api.cancelBusy).toBe(false);
    expect(api.cancelError).toEqual({ kind: "stalled" });
    expect(api.spoken).toEqual({ tone: "warn", msg: { k: "out.stalled" } });
  });
});

// ── Codex r2 on #310 (A3) — a reader START whose answer a reload aborted. The start was written down
// before it was sent; the next document asks the server, read-only, what the reader is doing for that
// table, and re-adopts the collect (poll, Cancel, landing) or forgets the record.
describe("a start a reload stranded is resolved, read-only (Codex r2 on #310, A3)", () => {
  const T = 1_800_000_000_000;
  /** What the tap wrote before the start was sent (TerminalSettleButton → `startPending`). */
  const PENDING = {
    token: "t-1",
    sessionId: "s-7",
    startedAt: T - STAFF_HANG_MS - 2000,
    isCounter: true,
    name: { counter: true, display: "reg-7f3a" },
    sentEarly: true,
    cartId: "c-7",
  };
  const seed = (...ps: object[]) => sessionStorage.setItem(READER_PENDING_KEY, JSON.stringify(ps));
  const live = {
    ok: true,
    collect: { paymentIntentId: "pi_live", totalCents: 4321, cartId: "c-7" },
  } as const;

  it("the reader is asking for that table's card: the collect is ADOPTED — polled, cancellable, owing no focus — and the record goes", async () => {
    seed(PENDING);
    terminalResume.mockResolvedValue(live);
    terminalStatus.mockResolvedValue(collecting);
    mount(<Viewer id="s-7" />);
    await tick(0);
    // MUTATION (p2h-cx2a/provider/pending-never-resolved): the restore never asks — the reader takes
    // the card with nothing on the tablet polling it, sliding its freeze or able to cancel it; red.
    expect(terminalResume).toHaveBeenCalledTimes(1);
    expect(terminalResume).toHaveBeenCalledWith({ sessionId: "s-7" });
    // MUTATION (p2h-cx2a/provider/adopt-dropped): the read answers, nothing is adopted; red.
    expect(api.record).toMatchObject({
      sessionId: "s-7",
      paymentIntentId: "pi_live",
      totalCents: 4321,
      isCounter: true,
      name: { counter: true, display: "reg-7f3a" },
      sentEarly: true,
      cartId: "c-7",
    });
    expect(api.poll.phase).toBe("collecting");
    expect(terminalStatus).toHaveBeenCalledWith({ sessionId: "s-7", paymentIntentId: "pi_live" });
    // A re-attach, never a start made in view: the panel does not pull focus off where the person is.
    // MUTATION (p2h-cx2a/provider/adopt-owes-focus): the adoption goes through `start` — focus is
    // pulled onto the panel the moment the page loads; red.
    expect(api.focusOwed).toBeNull();
    // The collect's own record now carries the handle (a further reload restores THAT).
    expect(sessionStorage.getItem(READER_COLLECT_KEY)).toContain('"paymentIntentId":"pi_live"');
    // MUTATION (p2h-cx2a/provider/answered-record-kept): the pending record outlives the adoption; red.
    expect(sessionStorage.getItem(READER_PENDING_KEY)).toBeNull();
  });

  it("the reader has nothing of that table's: no collect, and the record is forgotten", async () => {
    seed(PENDING);
    terminalResume.mockResolvedValue({ ok: true, collect: null, held: false });
    mount();
    await tick(0);
    expect(terminalResume).toHaveBeenCalledTimes(1);
    expect(api.record).toBeNull();
    expect(terminalStatus).not.toHaveBeenCalled();
    // MUTATION (p2h-cx2a/provider/answered-record-kept): the record stands — every reload asks
    // again, and a later charge on that cart is adopted as this start's; red.
    expect(sessionStorage.getItem(READER_PENDING_KEY)).toBeNull();
  });

  it("a read that could not be made (refused, or thrown) KEEPS the record for the next document", async () => {
    seed(PENDING);
    terminalResume.mockResolvedValueOnce({ ok: false, error: "Couldn’t reach Stripe." });
    const r = mount();
    await tick(0);
    expect(api.record).toBeNull();
    // MUTATION (p2h-cx2a/provider/outage-drops-record): an outage forgets the start — the next
    // reload has nothing left to ask about; red.
    expect(sessionStorage.getItem(READER_PENDING_KEY)).toContain('"token":"t-1"');
    r.unmount();
    terminalResume.mockRejectedValueOnce(new Error("fetch failed"));
    const r2 = mount();
    await tick(0);
    expect(sessionStorage.getItem(READER_PENDING_KEY)).toContain('"token":"t-1"');
    r2.unmount();
    terminalResume.mockResolvedValue(live);
    terminalStatus.mockResolvedValue(collecting);
    mount();
    await tick(0);
    expect(api.record?.paymentIntentId).toBe("pi_live");
  });

  it("a LATE resume answer (past the bound) is still applied — and the read sits on the stall ledger meanwhile", async () => {
    seed(PENDING);
    let answer!: (v: unknown) => void;
    terminalResume.mockReturnValueOnce(new Promise((res) => (answer = res)));
    terminalStatus.mockResolvedValue(collecting);
    mount();
    await tick(0);
    await tick(STAFF_HANG_MS);
    // MUTATION (p2h-cx2a/provider/resume-untracked): the read is off the ledger — a money tap made
    // while it hangs is queued behind it instead of refused; red.
    expect(stalledSince()).not.toBeNull();
    expect(api.record).toBeNull();
    await act(async () => answer(live));
    // MUTATION (p2h-cx2a/provider/late-resume-dropped): the answer past the bound is dropped; red.
    expect(api.record?.paymentIntentId).toBe("pi_live");
  });

  it("a collect that STANDS is the newer fact: the record goes without a read", async () => {
    terminalStatus.mockResolvedValue(collecting);
    const r = mount();
    await act(async () => api.start(START));
    await tick(0);
    r.unmount();
    seed(PENDING);
    mount();
    await tick(0);
    expect(api.record?.paymentIntentId).toBe("pi_7");
    // MUTATION (p2h-cx2a/provider/resolves-over-a-record): the reader is asked about a start whose
    // collect is already standing — a second table's charge could replace it; red.
    expect(terminalResume).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(READER_PENDING_KEY)).toBeNull();
  });

  it("a collect started while the read was out is never replaced by its answer", async () => {
    seed(PENDING);
    let answer!: (v: unknown) => void;
    terminalResume.mockReturnValueOnce(new Promise((res) => (answer = res)));
    terminalStatus.mockResolvedValue(collecting);
    mount();
    await tick(0);
    await act(async () => api.start({ ...START, sessionId: "s-9", paymentIntentId: "pi_9" }));
    await act(async () => answer(live));
    // MUTATION (p2h-cx2a/provider/adopt-over-a-record): the late answer replaces the collect that
    // started meanwhile — its poll stops, and its charge goes unrecorded; red.
    expect(api.record?.paymentIntentId).toBe("pi_9");
    expect(sessionStorage.getItem(READER_PENDING_KEY)).toBeNull();
  });

  it("a start THIS document sends before the restore's tick is never resolved by it (only a previous document's)", async () => {
    mount();
    // A tap in the instant after mount: its record is written before the start is sent.
    let token = "";
    act(() => {
      token = api.startPending({
        sessionId: "s-7",
        isCounter: true,
        name: PENDING.name,
        sentEarly: true,
        cartId: "c-7",
      });
    });
    await tick(0);
    // MUTATION (p2h-cx2a/provider/resolves-its-own-start): the restore reads the stash in its tick —
    // it asks the reader about this document's own start before the start reached it, finds nothing
    // and forgets the record; a reload then has nothing to resume; red.
    expect(terminalResume).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(READER_PENDING_KEY)).toContain(`"token":"${token}"`);
    // Its own answer ends it.
    act(() => api.startAnswered(token));
    expect(sessionStorage.getItem(READER_PENDING_KEY)).toBeNull();
  });

  it("Strict Mode's double effects ask ONCE; an expired record is never asked about", async () => {
    seed(PENDING, {
      ...PENDING,
      token: "t-old",
      sessionId: "s-8",
      startedAt: T - READER_COLLECT_MAX_IDLE_MS - 1,
    });
    terminalResume.mockResolvedValue({ ok: true, collect: null, held: false });
    mount(null, true);
    await tick(0);
    expect(terminalResume).toHaveBeenCalledTimes(1);
    expect(terminalResume).toHaveBeenCalledWith({ sessionId: "s-7" });
  });
  // ── Codex r2 on #310 follow-up (R1) — a start still on its way to the reader at the resume read:
  // `settleCard` takes the freeze before it hands the charge to the reader, so the reader can be idle
  // while the table's freeze is HELD. The record is kept and the read asked again — a single read
  // forgot it, and the charge then landed on the reader with no handle on the tablet.
  it("the reader idle while the table's freeze is HELD: KEPT, asked again on a widening gap — and the charge that lands is ADOPTED", async () => {
    seed(PENDING);
    terminalResume
      .mockResolvedValueOnce({ ok: true, collect: null, held: true })
      .mockResolvedValueOnce({ ok: true, collect: null, held: true })
      .mockResolvedValue(live);
    terminalStatus.mockResolvedValue(collecting);
    mount();
    await tick(0);
    expect(terminalResume).toHaveBeenCalledTimes(1);
    // MUTATION (p2h-cx2a/provider/held-forgotten): the held answer forgets the record — the start
    // hands its charge to the reader a moment later with nothing here to poll or cancel it; red.
    expect(sessionStorage.getItem(READER_PENDING_KEY)).toContain('"token":"t-1"');
    expect(api.record).toBeNull();
    // The read worked: nothing to SAY (the table's own freeze line says a payment is under way).
    expect(api.unchecked).toEqual([]);
    // MUTATION (p2h-cx2a/provider/held-asked-once): never asked again — the single read of the old
    // code; red.
    await tick(readerResumeDelay(1) - 1);
    expect(terminalResume).toHaveBeenCalledTimes(1);
    await tick(1);
    expect(terminalResume).toHaveBeenCalledTimes(2);
    await tick(readerResumeDelay(2));
    expect(terminalResume).toHaveBeenCalledTimes(3);
    expect(api.record?.paymentIntentId).toBe("pi_live");
    expect(terminalStatus).toHaveBeenCalledWith({ sessionId: "s-7", paymentIntentId: "pi_live" });
    expect(sessionStorage.getItem(READER_PENDING_KEY)).toBeNull();
    // Adopted: no more asks.
    await tick(readerResumeDelay(9) * 3);
    expect(terminalResume).toHaveBeenCalledTimes(3);
  });

  it("asked again only while the record lives: past the freeze's lifetime it is forgotten, unasked", async () => {
    seed({ ...PENDING, startedAt: T - READER_COLLECT_MAX_IDLE_MS + 3000 });
    terminalResume.mockResolvedValue({ ok: true, collect: null, held: true });
    mount();
    await tick(0);
    expect(terminalResume).toHaveBeenCalledTimes(1);
    // The next ask falls past the record's expiry (4 s later; it had 3 s left).
    await tick(readerResumeDelay(1));
    // MUTATION (p2h-cx2a/provider/asks-past-expiry): the ask goes out for a start no freeze can still
    // be carrying — the asks never end while a lapsed freeze row reads "held"; red.
    expect(terminalResume).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(READER_PENDING_KEY)).toBeNull();
    await tick(readerResumeDelay(9) * 3);
    expect(terminalResume).toHaveBeenCalledTimes(1);
  });

  it("a collect started while a re-ask waits is the newer fact: the record goes, unasked", async () => {
    seed(PENDING);
    terminalResume.mockResolvedValue({ ok: true, collect: null, held: true });
    terminalStatus.mockResolvedValue(collecting);
    mount();
    await tick(0);
    await act(async () => api.start({ ...START, sessionId: "s-9", paymentIntentId: "pi_9" }));
    await tick(readerResumeDelay(1));
    // MUTATION (p2h-cx2a/provider/resolves-over-a-record): asked while a collect stands; red.
    expect(terminalResume).toHaveBeenCalledTimes(1);
    expect(api.record?.paymentIntentId).toBe("pi_9");
    expect(sessionStorage.getItem(READER_PENDING_KEY)).toBeNull();
  });

  // ── Codex r2 on #310 follow-up (R4) — an outage on the resume read is SAID ──
  it("a read that fails is SAID (the reader could not be checked) while the record stands — and unsaid once a read answers", async () => {
    seed(PENDING);
    terminalResume
      .mockResolvedValueOnce({ ok: false, error: "Couldn’t reach Stripe." })
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValueOnce({ ok: true, collect: null, held: true })
      .mockResolvedValue({ ok: true, collect: null, held: false });
    mount();
    await tick(0);
    // MUTATION (p2h-cx2a/provider/outage-unsaid): kept silently — nothing on any screen says the
    // reader may be asking for the card; red.
    expect(api.unchecked).toEqual([expect.objectContaining({ token: "t-1", sessionId: "s-7" })]);
    await tick(readerResumeDelay(1));
    expect(terminalResume).toHaveBeenCalledTimes(2);
    expect(api.unchecked).toHaveLength(1); // a THROWN read too
    await tick(readerResumeDelay(2));
    expect(terminalResume).toHaveBeenCalledTimes(3);
    // The read worked (held): the line goes; the record stays.
    // MUTATION (p2h-cx2a/provider/unchecked-sticks): the line outlives a read that answered; red.
    expect(api.unchecked).toEqual([]);
    expect(sessionStorage.getItem(READER_PENDING_KEY)).toContain('"token":"t-1"');
    await tick(readerResumeDelay(3));
    expect(terminalResume).toHaveBeenCalledTimes(4);
    expect(sessionStorage.getItem(READER_PENDING_KEY)).toBeNull();
    expect(api.unchecked).toEqual([]);
  });

  it("an unchecked line ends with its record — dropped at expiry, never left standing", async () => {
    seed({ ...PENDING, startedAt: T - READER_COLLECT_MAX_IDLE_MS + 3000 });
    terminalResume.mockResolvedValue({ ok: false, error: "Couldn’t reach Stripe." });
    mount();
    await tick(0);
    expect(api.unchecked).toHaveLength(1);
    await tick(readerResumeDelay(1));
    // MUTATION (p2h-cx2a/provider/expired-unchecked-sticks): the record lapses, the line stays on
    // every page for the rest of the shift; red.
    expect(api.unchecked).toEqual([]);
    expect(sessionStorage.getItem(READER_PENDING_KEY)).toBeNull();
  });

  it("the provider gone (it left the staff tree): no re-ask fires, and a read still out is not acted on — the next provider asks", async () => {
    seed(PENDING);
    terminalResume.mockResolvedValueOnce({ ok: false, error: "Couldn’t reach Stripe." });
    const r = mount();
    await tick(0);
    expect(terminalResume).toHaveBeenCalledTimes(1);
    r.unmount();
    await tick(readerResumeDelay(9) * 2);
    // MUTATION (p2h-cx2a/provider/re-ask-outlives-the-provider): the gap's timer survives the
    // provider and asks again for a tree that is gone; red.
    expect(terminalResume).toHaveBeenCalledTimes(1);
    // A read out when the provider goes: its answer (the reader's charge) is not acted on there.
    let answer!: (v: unknown) => void;
    terminalResume.mockReturnValueOnce(new Promise((res) => (answer = res)));
    const r2 = mount();
    await tick(0);
    r2.unmount();
    await act(async () => answer(live));
    // MUTATION (p2h-cx2a/provider/dead-provider-acts): a provider that is gone forgets the record
    // and writes a collect nobody polls — the next provider has nothing left to ask about; red.
    expect(sessionStorage.getItem(READER_PENDING_KEY)).toContain('"token":"t-1"');
    expect(sessionStorage.getItem(READER_COLLECT_KEY)).toBeNull();
  });

  // ── Codex r2 on #310 follow-up (R3) — a start that THREW is resolved on this page too ──
  it("resumeStart: a start this page sent that THREW is asked about after the first gap — adopted, and the tapping control is told", async () => {
    mount();
    let token = "";
    act(() => {
      token = api.startPending({
        sessionId: "s-7",
        isCounter: true,
        name: PENDING.name,
        sentEarly: true,
        cartId: "c-7",
      });
    });
    await tick(0);
    terminalResume.mockResolvedValue(live);
    terminalStatus.mockResolvedValue(collecting);
    const adopted = vi.fn();
    act(() => api.resumeStart(token, adopted));
    // Its server may still be running it: the first read waits a gap.
    await tick(readerResumeDelay(0) - 1);
    expect(terminalResume).not.toHaveBeenCalled();
    await tick(1);
    // MUTATION (p2h-cx2a/provider/thrown-never-resumed): only a reload resolves it — the reader asks
    // for the card while this page shows "couldn't confirm" and nothing polls the charge; red.
    expect(terminalResume).toHaveBeenCalledWith({ sessionId: "s-7" });
    expect(api.record?.paymentIntentId).toBe("pi_live");
    expect(api.focusOwed).toBeNull();
    // MUTATION (p2h-cx2a/provider/adoption-untold): the control that said "couldn't confirm" is
    // never told — the pane's "we don't know" stands over a charge the reader is taking; red.
    expect(adopted).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(READER_PENDING_KEY)).toBeNull();
  });

  it("resumeStart works off the record held in memory when the stash cannot hold it (privacy mode)", async () => {
    mount();
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    let token = "";
    act(() => {
      token = api.startPending({
        sessionId: "s-7",
        isCounter: true,
        name: PENDING.name,
        sentEarly: true,
        cartId: "c-7",
      });
    });
    setItem.mockRestore();
    expect(sessionStorage.getItem(READER_PENDING_KEY)).toBeNull();
    terminalResume.mockResolvedValue(live);
    terminalStatus.mockResolvedValue(collecting);
    act(() => api.resumeStart(token));
    await tick(readerResumeDelay(0));
    // MUTATION (p2h-cx2a/provider/thrown-needs-the-stash): the record is looked up in storage only —
    // a tablet that cannot write it never resolves its own thrown start; red.
    expect(terminalResume).toHaveBeenCalledTimes(1);
    expect(api.record?.paymentIntentId).toBe("pi_live");
  });
});
