import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STAFF_HANG_MS, outstanding, resetLedgerForTests, stalledSince } from "./bounded-write";
import { raceTimeout } from "./staff-outage";
import { createPollGate } from "./poll-gate";

/**
 * Phase 2h (decision 9f) — the poll gate. A tick over an unanswered raw read starts NOTHING (each
 * read it started would queue behind the hung one in Next's one-at-a-time queue), owes ONE read to
 * the raw's answer, and — only once the raw has been out a hang's worth of time — counts as a miss,
 * so the board's degraded banner arms instead of wearing a live face over a frozen feed.
 *
 * Every clock here is THIS device's: the gate takes no time of its own (F2). `at` moves the fake
 * clock FORWARD (`advanceTimersByTime`), which moves the monotonic clock the gate and the ledger read
 * (`monoNow`, Codex r2 B4) and the wall clock together; a wall-clock CORRECTION alone
 * (`vi.setSystemTime`) moves neither measurement.
 */
const T0 = Date.parse("2026-10-01T18:00:00.000Z");

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
/** Drain every microtask, then run whatever timer is due NOW (the deferred kick is one). */
const settle = () => vi.advanceTimersByTimeAsync(0);
const at = (ms: number) => {
  const step = T0 + ms - Date.now();
  if (step < 0) throw new Error(`at(${ms}) would move the clock back by ${-step}ms`);
  vi.advanceTimersByTime(step);
};

beforeEach(() => {
  vi.useFakeTimers({ now: T0 });
  resetLedgerForTests();
});
afterEach(() => {
  resetLedgerForTests();
  vi.useRealTimers();
});

describe("ask — one read in the air, never two", () => {
  it("an idle gate says start", () => {
    const gate = createPollGate(vi.fn());
    expect(gate.ask()).toEqual({ go: "start" });
    expect(gate.pending()).toBe(false);
  });

  it("a watched raw shuts it: every ask is owed, none starts — until the raw answers", async () => {
    // MUTATION (p2h-core/gate/stacks-reads): the ask starts a read over the hung one — the pile
    // grows every 5s in the action queue; red.
    const gate = createPollGate(vi.fn());
    const raw = deferred<string>();
    expect(gate.watch(raw.promise)).toBe(raw.promise); // returns the raw itself
    // MUTATION (p2h-core/gate/pending-lies): `pending()` answers false over a hung read — an owner
    // that holds a control (a Refresh) or a loop on it starts a read behind the hung one; red.
    expect(gate.pending()).toBe(true);
    at(5_000);
    expect(gate.ask().go).toBe("owed");
    at(10_000);
    expect(gate.ask().go).toBe("owed");
    raw.resolve("x");
    await settle();
    expect(gate.pending()).toBe(false);
    at(11_000);
    expect(gate.ask()).toEqual({ go: "start" });
  });

  it("a REJECTED raw opens it too", async () => {
    const gate = createPollGate(vi.fn());
    const raw = deferred<string>();
    void gate.watch(raw.promise).catch(() => {});
    raw.reject(new Error("fetch failed"));
    await settle();
    expect(gate.pending()).toBe(false);
    expect(gate.ask()).toEqual({ go: "start" });
  });
});

describe("missed — only once the raw has been out a hang's worth of time", () => {
  it("false a millisecond before STAFF_HANG_MS, true AT it and after", () => {
    // MUTATION (p2h-core/gate/miss-before-bound): a slow-but-healthy read counts as a miss and the
    // banner calls a congested tablet broken; red at ms-1.
    // MUTATION (p2h-core/gate/miss-after-bound): `>` — the tick at exactly the bound is forgiven,
    // one more silent poll on a hung feed; red at ms.
    // MUTATION (p2h-core/gate/skip-never-a-miss): no skip is ever a miss — the pad's old bug, the
    // banner never arms on a hang; red at ms.
    const gate = createPollGate(vi.fn());
    void gate.watch(new Promise(() => {}));
    at(5_000);
    expect(gate.ask()).toEqual({ go: "owed", missed: false });
    at(STAFF_HANG_MS - 1);
    expect(gate.ask()).toEqual({ go: "owed", missed: false });
    at(STAFF_HANG_MS);
    expect(gate.ask()).toEqual({ go: "owed", missed: true });
    at(60_000);
    expect(gate.ask()).toEqual({ go: "owed", missed: true });
  });

  it("is measured from the watched read's OWN start, not the gate's first", async () => {
    const gate = createPollGate(vi.fn());
    const first = deferred<string>();
    void gate.watch(first.promise);
    first.resolve("x");
    await settle();
    at(30_000);
    void gate.watch(new Promise(() => {}));
    at(30_000 + STAFF_HANG_MS - 1);
    expect(gate.ask()).toEqual({ go: "owed", missed: false });
    at(30_000 + STAFF_HANG_MS);
    expect(gate.ask()).toEqual({ go: "owed", missed: true });
  });

  it("a wall clock set BACK mid-hang still counts the miss at the bound (Codex r2 on #310, B4)", () => {
    // MUTATION (p2h-cx2b/gate/miss-on-wall-clock): `missed` ages on `Date.now()` again — an hour set
    // back keeps the board's live face over a frozen feed for an hour while the money taps (on the
    // ledger's monotonic clock) already refuse as stuck; red.
    const gate = createPollGate(vi.fn());
    void gate.watch(new Promise(() => {}));
    at(10_000);
    vi.setSystemTime(Date.now() - 3_600_000);
    vi.advanceTimersByTime(STAFF_HANG_MS - 10_000 - 1);
    expect(gate.ask()).toEqual({ go: "owed", missed: false });
    vi.advanceTimersByTime(1);
    expect(gate.ask()).toEqual({ go: "owed", missed: true });
    expect(stalledSince()).toBe(T0);
  });

  it("the miss and the ledger's stall are ONE measurement, on this device's clock", () => {
    // The tick that first counts a miss is the instant the ledger refuses the next money tap — and
    // not a millisecond either side, because both read `monoNow()` against the same start.
    const gate = createPollGate(vi.fn());
    at(2_000);
    void gate.watch(new Promise(() => {}));
    at(2_000 + STAFF_HANG_MS - 1);
    expect(gate.ask()).toEqual({ go: "owed", missed: false });
    expect(stalledSince()).toBeNull();
    at(2_000 + STAFF_HANG_MS);
    expect(gate.ask()).toEqual({ go: "owed", missed: true });
    expect(stalledSince()).toBe(T0 + 2_000);
  });
});

describe("the owed read — ONE kick, just after the raw's answer", () => {
  it("many refused asks owe exactly one kick, after the answer", async () => {
    // MUTATION (p2h-core/gate/owed-dropped): the refused asks are forgotten — a landed change waits
    // for the next poll; red.
    const kick = vi.fn();
    const gate = createPollGate(kick);
    const raw = deferred<string>();
    void gate.watch(raw.promise);
    at(5_000);
    gate.ask();
    at(10_000);
    gate.ask();
    at(15_000);
    gate.ask();
    expect(kick).not.toHaveBeenCalled();
    raw.resolve("x");
    await settle();
    expect(kick).toHaveBeenCalledTimes(1);
  });

  it("no ask refused, no kick", async () => {
    const kick = vi.fn();
    const gate = createPollGate(kick);
    const raw = deferred<string>();
    void gate.watch(raw.promise);
    raw.resolve("x");
    await settle();
    expect(kick).not.toHaveBeenCalled();
  });

  it("the debt is paid once: the NEXT read's answer kicks nothing unless a new ask was refused", async () => {
    // MUTATION (p2h-core/gate/kicks-twice): the debt is never cleared, so every later answer kicks
    // another read — the gate itself becomes the pile; red.
    const kick = vi.fn();
    const gate = createPollGate(kick);
    const a = deferred<string>();
    void gate.watch(a.promise);
    at(5_000);
    gate.ask();
    a.resolve("a");
    await settle();
    expect(kick).toHaveBeenCalledTimes(1);
    // The kicked read goes out and answers, with no ask refused meanwhile.
    const b = deferred<string>();
    at(6_000);
    expect(gate.ask()).toEqual({ go: "start" });
    void gate.watch(b.promise);
    b.resolve("b");
    await settle();
    expect(kick).toHaveBeenCalledTimes(1);
  });

  it("a rejected raw pays the debt too", async () => {
    const kick = vi.fn();
    const gate = createPollGate(kick);
    const raw = deferred<string>();
    void gate.watch(raw.promise).catch(() => {});
    at(5_000);
    gate.ask();
    raw.reject(new Error("x"));
    await settle();
    expect(kick).toHaveBeenCalledTimes(1);
  });

  it("no kick after dispose", async () => {
    // MUTATION (p2h-core/gate/kicks-after-dispose): an unmounted board dispatches a read into the
    // queue nobody will read; red.
    const kick = vi.fn();
    const gate = createPollGate(kick);
    const raw = deferred<string>();
    void gate.watch(raw.promise);
    at(5_000);
    gate.ask();
    gate.dispose();
    raw.resolve("x");
    await settle();
    expect(kick).not.toHaveBeenCalled();
  });

  it("a dispose between the answer and the deferred kick cancels the kick", async () => {
    // MUTATION (p2h-core/gate/dispose-leaves-kick): the kick already scheduled at the answer still
    // fires after the board unmounted; red.
    const kick = vi.fn();
    const gate = createPollGate(kick);
    const raw = deferred<string>();
    void gate.watch(raw.promise);
    at(5_000);
    gate.ask();
    raw.resolve("x");
    // The answer's handlers have run (microtasks) but the deferred kick (a macrotask) has not.
    await Promise.resolve();
    await Promise.resolve();
    expect(gate.pending()).toBe(false);
    gate.dispose();
    await settle();
    expect(kick).not.toHaveBeenCalled();
  });

  it("an OLDER read's answer never reopens the gate over a younger one still out", async () => {
    // MUTATION (p2h-core/gate/stale-answer-opens): the first answer opens the gate while the second
    // read is still queued, and the next tick stacks a third behind it; red.
    const kick = vi.fn();
    const gate = createPollGate(kick);
    const older = deferred<string>();
    const younger = deferred<string>();
    void gate.watch(older.promise);
    at(1_000);
    void gate.watch(younger.promise);
    at(2_000);
    gate.ask();
    older.resolve("old");
    await settle();
    expect(gate.pending()).toBe(true);
    at(3_000);
    expect(gate.ask().go).toBe("owed");
    expect(kick).not.toHaveBeenCalled();
    younger.resolve("young");
    await settle();
    expect(gate.pending()).toBe(false);
    expect(kick).toHaveBeenCalledTimes(1);
  });
});

/**
 * Critic F4 — the owners as they are written. Four boards coalesce on a bare
 * `if (inFlight.current) return` with no rerun flag; the gate's kick must reach them AFTER their own
 * `await raceTimeout(raw)` has resumed and their `finally` has cleared `inFlight`, or the owed read
 * is coalesced away and the board keeps the stale answer until the next poll.
 */
function bareBoard() {
  let reads = 0;
  let inFlight = false;
  const raws: Array<ReturnType<typeof deferred<string>>> = [];
  const gate = createPollGate(() => void refresh());
  async function refresh() {
    const asked = gate.ask();
    if (asked.go === "owed") return;
    if (inFlight) return; // KdsBoard · FloorBoard · ExpoBoard · ApprovalsBoard: no rerun flag
    inFlight = true;
    try {
      reads += 1;
      const raw = deferred<string>();
      raws.push(raw);
      await raceTimeout(gate.watch(raw.promise));
    } catch {
      /* a miss — not this test's subject */
    } finally {
      inFlight = false;
    }
  }
  return { refresh, gate, reads: () => reads, raws };
}

describe("the owed read reaches an owner that coalesces on a bare inFlight (F4)", () => {
  it("a read answering INSIDE the bound, with a tick refused meanwhile, is followed by exactly ONE more", async () => {
    // MUTATION (p2h-core/gate/kicks-inside-the-answer): the kick fires inside the raw's settle
    // handler, before the owner's await resumes — `inFlight` is still true, the owed read is
    // coalesced away, and the board keeps the stale answer; red (one read where two are owed).
    const board = bareBoard();
    void board.refresh();
    expect(board.reads()).toBe(1);
    at(5_000);
    void board.refresh(); // a tick while the read is slow: owed
    expect(board.reads()).toBe(1);
    board.raws[0]!.resolve("A");
    await settle();
    expect(board.reads()).toBe(2);
    // …and the debt is paid: the owed read's own answer kicks nothing more.
    board.raws[1]!.resolve("B");
    await settle();
    expect(board.reads()).toBe(2);
  });

  it("a read hung past the bound gives ONE read at its answer, however many ticks it refused", async () => {
    const board = bareBoard();
    void board.refresh();
    for (let s = 5_000; s <= 60_000; s += 5_000) {
      await vi.advanceTimersByTimeAsync(5_000);
      void board.refresh();
    }
    expect(board.reads()).toBe(1);
    board.raws[0]!.resolve("late");
    await settle();
    expect(board.reads()).toBe(2);
  });

  it("a read that starts before the deferred kick fires pays the debt itself — no read on top", async () => {
    // MUTATION (p2h-core/gate/kick-not-cancelled): the deferred kick still fires over the read the
    // owner just started — it is refused as owed, and that read's answer kicks a THIRD; red.
    const kick = vi.fn();
    const gate = createPollGate(kick);
    const a = deferred<string>();
    void gate.watch(a.promise);
    at(5_000);
    gate.ask();
    a.resolve("a");
    await Promise.resolve();
    await Promise.resolve();
    // A realtime nudge starts the next read before the macrotask runs.
    expect(gate.ask()).toEqual({ go: "start" });
    const b = deferred<string>();
    void gate.watch(b.promise);
    await settle();
    expect(kick).not.toHaveBeenCalled();
    b.resolve("b");
    await settle();
    expect(kick).not.toHaveBeenCalled();
  });
});

/**
 * Review b (B2) — the MULTI-raw owner, as ApprovalsBoard is written: each tick dispatches three raw
 * reads (queue · roster · ledger), watches them AS ONE (`gate.watch(Promise.allSettled(raws))`), and
 * awaits a DIFFERENT promise — `Promise.allSettled` of each raw raced on its own. Two more settle
 * layers sit between the raws and the owner's `finally` than in the single-raw shape above, so the
 * deferred kick must still land after them, and the gate must stay shut until the LAST raw answers.
 */
function multiRawBoard() {
  let ticks = 0;
  let inFlight = false;
  const raws: Array<Array<ReturnType<typeof deferred<string>>>> = [];
  const gate = createPollGate(() => void refresh());
  async function refresh() {
    const asked = gate.ask();
    if (asked.go === "owed") return;
    if (inFlight) return; // ApprovalsBoard: a bare coalesce, no rerun flag
    inFlight = true;
    try {
      ticks += 1;
      const three = [deferred<string>(), deferred<string>(), deferred<string>()];
      raws.push(three);
      const [q, w, l] = three.map((d) => d.promise) as [
        Promise<string>,
        Promise<string>,
        Promise<string>,
      ];
      void gate.watch(Promise.allSettled([q, w, l]));
      await Promise.allSettled([raceTimeout(q), raceTimeout(w), raceTimeout(l)]);
    } finally {
      inFlight = false;
    }
  }
  return { refresh, gate, ticks: () => ticks, raws };
}

describe("the multi-raw owner (ApprovalsBoard's shape) — review b · B2", () => {
  it("a refused tick, then the LAST raw answering, gives exactly ONE more tick", async () => {
    // MUTATION (p2h-core/gate/kicks-inside-the-answer · p2h-rev-b/gate/kick-on-a-microtask): the
    // owed kick reaches the owner before its `await Promise.allSettled(raced)` has resumed —
    // `inFlight` is still true and the owed tick is coalesced away; red (one tick where two are owed).
    const board = multiRawBoard();
    void board.refresh();
    expect(board.ticks()).toBe(1);
    at(5_000);
    void board.refresh(); // refused: owed
    expect(board.ticks()).toBe(1);
    const [queue, who, ledger] = board.raws[0]!;
    queue!.resolve("rows");
    who!.resolve("roster");
    await settle();
    // Two of three answered: the gate is still shut, nothing is kicked.
    expect(board.gate.pending()).toBe(true);
    expect(board.ticks()).toBe(1);
    ledger!.resolve("ledger"); // the LAST raw
    await settle();
    expect(board.ticks()).toBe(2);
    // …and the debt is paid: the owed tick's own answers kick nothing more.
    for (const d of board.raws[1]!) d.resolve("again");
    await settle();
    expect(board.ticks()).toBe(2);
  });
});

describe("the stall ledger — a hung READ holds the queue as a hung write does", () => {
  it("a watched raw is tracked, on this device's clock, until it settles", async () => {
    // MUTATION (p2h-core/gate/untracked): a poll hung for minutes is invisible to `stalledSince`,
    // and the next money tap is dispatched behind it; red.
    const gate = createPollGate(vi.fn());
    const raw = deferred<string>();
    at(2_000);
    void gate.watch(raw.promise);
    expect(outstanding()).toBe(1);
    at(2_000 + STAFF_HANG_MS);
    expect(stalledSince()).toBe(T0 + 2_000);
    raw.resolve("x");
    await settle();
    expect(outstanding()).toBe(0);
  });

  it("a board's SERVER-offset clock cannot reach the ledger (F2)", () => {
    // KdsBoard and ExpoBoard stamp every board time as `Date.now() + offset`. On a tablet whose clock
    // runs 20s AHEAD of the server, that is 20s in the past — and the old `watch(raw, nowMs)` wrote it
    // into the ledger every money tap reads: a read dispatched this instant read as stalled, and every
    // cash, reader, refund, loss and no-show tap was refused as "stuck — reload" (which a reload does
    // not fix). The gate takes no clock now; the extra argument below is a TYPE error, and at runtime
    // it is ignored.
    const stampNow = () => Date.now() - 20_000;
    const gate = createPollGate(vi.fn());
    // @ts-expect-error — the gate takes no clock (critic F2); this line fails typecheck if it ever does.
    void gate.watch(new Promise(() => {}), stampNow());
    expect(stalledSince()).toBeNull();
    // The critic's measurement, verbatim: the old ledger answered NON-null here, at the read's first
    // instant (the extra argument is ignored by today's `stalledSince`, which reads its own clock).
    // @ts-expect-error — `stalledSince` takes no clock either.
    expect(stalledSince(Date.now())).toBeNull();
    // @ts-expect-error — nor does `ask`.
    expect(gate.ask(stampNow())).toEqual({ go: "owed", missed: false });
  });
});
