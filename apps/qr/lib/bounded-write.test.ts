import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  STAFF_HANG_MS,
  boundWrite,
  outstanding,
  resetLedgerForTests,
  settleLate,
  stalledSince,
  track,
  type Bounded,
  type Late,
} from "./bounded-write";

/**
 * Phase 2h (P2cz · P2fc) — the bounded await and the per-tab stall ledger. Every case is a VALUE
 * the staff copy reads: `waiting` is "no answer yet — it may still be recorded", `threw` is
 * "couldn't confirm", and `stalledSince` refuses the next money tap. So each boundary is pinned at
 * the exact millisecond on both sides, and each case holds the outcome in a variable written by a
 * `.then` (never `await`ed blind), so a mutant that never settles goes red at once instead of
 * timing the suite out.
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
/** Run every queued microtask (and any timer due at the current fake time). */
const settle = () => vi.advanceTimersByTimeAsync(0);
/** The outcome of a promise, as soon as it settles — `undefined` until then. */
function watchOutcome<T>(p: Promise<T>): { get: () => T | undefined } {
  let got: T | undefined;
  void p.then((v) => {
    got = v;
  });
  return { get: () => got };
}

beforeEach(() => {
  vi.useFakeTimers({ now: T0 });
  resetLedgerForTests();
});
afterEach(() => {
  resetLedgerForTests();
  vi.useRealTimers();
});

describe("STAFF_HANG_MS — the one number", () => {
  it("is 15 seconds (raceTimeout's measured hang bound, W10b)", () => {
    expect(STAFF_HANG_MS).toBe(15_000);
  });
});

describe("settleLate — the raw promise as an outcome that never rejects", () => {
  it("an answer is `answer`, whatever it says", async () => {
    await expect(settleLate(Promise.resolve({ ok: false }))).resolves.toEqual({
      kind: "answer",
      value: { ok: false },
    });
  });
  it("a rejection is `threw`, carrying the error — never a rejection of its own", async () => {
    // MUTATION (p2h-core/bounded/settle-late-rethrows): the rejection is passed on — a caller awaiting
    // `late` after its sheet unmounted raises an unhandled rejection instead of reading "couldn't
    // confirm"; red.
    const err = new Error("network");
    await expect(settleLate(Promise.reject(err))).resolves.toEqual({ kind: "threw", error: err });
  });
});

describe("boundWrite — three outcomes, never a rejection", () => {
  it("an answer before the bound is `answer`", async () => {
    const raw = deferred<string>();
    const out = watchOutcome(boundWrite(raw.promise));
    await vi.advanceTimersByTimeAsync(STAFF_HANG_MS - 1);
    raw.resolve("ok");
    await settle();
    expect(out.get()).toEqual({ kind: "answer", value: "ok" });
  });

  it("a rejection is `threw` at once — never `waiting`, never a rejection", async () => {
    // MUTATION (p2h-core/bounded/reject-reads-as-waiting): the throw falls through to the timer and
    // the sheet says "it may still be recorded" about an action that has already ENDED; red.
    const err = new Error("fetch failed");
    const out = watchOutcome(boundWrite(Promise.reject(err)));
    await settle();
    expect(out.get()).toEqual({ kind: "threw", error: err });
    // …and the bound passing changes nothing: one outcome per write.
    await vi.advanceTimersByTimeAsync(STAFF_HANG_MS);
    expect(out.get()).toEqual({ kind: "threw", error: err });
  });

  it("a raw still out is `waiting` at EXACTLY the bound — not a millisecond before", async () => {
    const raw = deferred<string>();
    const out = watchOutcome(boundWrite(raw.promise));
    // MUTATION (p2h-core/bounded/waits-early): `waiting` a millisecond early; red here.
    await vi.advanceTimersByTimeAsync(STAFF_HANG_MS - 1);
    expect(out.get()).toBeUndefined();
    // MUTATION (p2h-core/bounded/never-waits): no bound at all — the sheet holds until the raw
    // answers, which on a hung queue is never; red here.
    await vi.advanceTimersByTimeAsync(1);
    expect(out.get()?.kind).toBe("waiting");
  });

  it("a custom bound is honoured at its own exact millisecond", async () => {
    const out = watchOutcome(boundWrite(new Promise<never>(() => {}), 3_000));
    await vi.advanceTimersByTimeAsync(2_999);
    expect(out.get()).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(out.get()?.kind).toBe("waiting");
  });

  it("the LATE answer arrives through `late` — never dropped", async () => {
    const raw = deferred<{ ok: true; orderId: string }>();
    const out = watchOutcome(boundWrite(raw.promise));
    await vi.advanceTimersByTimeAsync(STAFF_HANG_MS);
    const waiting = out.get() as Extract<Bounded<unknown>, { kind: "waiting" }>;
    expect(waiting.kind).toBe("waiting");
    // MUTATION (p2h-core/bounded/late-dropped): `late` is a promise that never settles — a late ok
    // never hands its card over and the cashier is told to reload for a payment that landed; red.
    const late = watchOutcome(waiting.late);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(late.get()).toBeUndefined();
    raw.resolve({ ok: true, orderId: "o-1" });
    await settle();
    expect(late.get()).toEqual({ kind: "answer", value: { ok: true, orderId: "o-1" } });
    // The outcome the caller already read does not change under it.
    expect(out.get()?.kind).toBe("waiting");
  });

  it("a LATE rejection arrives through `late` as `threw`", async () => {
    const raw = deferred<string>();
    const out = watchOutcome(boundWrite(raw.promise));
    await vi.advanceTimersByTimeAsync(STAFF_HANG_MS);
    const waiting = out.get() as Extract<Bounded<string>, { kind: "waiting" }>;
    const late = watchOutcome<Late<string>>(waiting.late);
    const err = new Error("socket hang up");
    raw.reject(err);
    await settle();
    expect(late.get()).toEqual({ kind: "threw", error: err });
  });

  it("tracks the raw in the ledger until it settles", async () => {
    // MUTATION (p2h-core/bounded/untracked): a hung WRITE is invisible to `stalledSince`, so the
    // next money tap is dispatched into the queue behind it; red.
    const raw = deferred<string>();
    void boundWrite(raw.promise);
    expect(outstanding()).toBe(1);
    vi.setSystemTime(T0 + STAFF_HANG_MS);
    expect(stalledSince()).toBe(T0);
    raw.resolve("late");
    await settle();
    expect(outstanding()).toBe(0);
  });
});

describe("the ledger — every entry leaves on settle, resolved OR rejected", () => {
  it("removes an entry when its raw RESOLVES", async () => {
    // MUTATION (p2h-core/ledger/forgets-on-reject-only): a resolved action stays "unanswered"
    // forever, and after 15s every money write on the tab is refused until a reload; red.
    const raw = deferred<number>();
    track(raw.promise);
    expect(outstanding()).toBe(1);
    raw.resolve(1);
    await settle();
    expect(outstanding()).toBe(0);
    vi.setSystemTime(T0 + 10 * STAFF_HANG_MS);
    expect(stalledSince()).toBeNull();
  });

  it("removes an entry when its raw REJECTS", async () => {
    // MUTATION (p2h-core/ledger/never-forgets): nothing ever leaves; red here and above.
    const raw = deferred<number>();
    const tracked = track(raw.promise);
    expect(tracked).toBe(raw.promise); // the SAME promise back — the caller still owns its outcome
    void tracked.catch(() => {});
    raw.reject(new Error("x"));
    await settle();
    expect(outstanding()).toBe(0);
  });

  it("the same raw tracked twice is ONE entry, at its FIRST start", async () => {
    // MUTATION (p2h-core/ledger/retrack-restarts-the-clock): `raceTimeout` re-registering a read the
    // poll gate already watches would restart the hang clock, so a read hung for 14s reads fresh; red.
    const raw = deferred<number>();
    track(raw.promise);
    vi.setSystemTime(T0 + 14_000);
    track(raw.promise);
    expect(outstanding()).toBe(1);
    vi.setSystemTime(T0 + STAFF_HANG_MS);
    expect(stalledSince()).toBe(T0);
    raw.resolve(1);
    await settle();
    expect(outstanding()).toBe(0);
  });

  it("the start is THIS device's clock at registration — there is no other clock to hand it", () => {
    // The ledger is read at every money tap and written by every board; a board's server-offset
    // clock (`stampNow()`) written here would refuse every tap by the device's skew (critic F2). The
    // signature is the guard: `track` takes no time, so this is the only start it can record.
    vi.setSystemTime(T0 + 4_000);
    track(new Promise(() => {}));
    vi.setSystemTime(T0 + 4_000 + STAFF_HANG_MS - 1);
    expect(stalledSince()).toBeNull();
    vi.setSystemTime(T0 + 4_000 + STAFF_HANG_MS);
    expect(stalledSince()).toBe(T0 + 4_000);
  });

  it("a SERVER-offset clock handed to it is ignored — the start stays this device's (F2)", () => {
    // MUTATION (p2h-core/ledger/takes-a-clock): `track` takes a start again. A board's `stampNow()`
    // (its clock 20s AHEAD of the server, so 20s in the past) is written into the ledger every money
    // tap reads: a read dispatched THIS instant reads as stalled, and every cash, reader, refund,
    // loss and no-show tap is refused as "stuck — reload", which a reload does not fix; red.
    const stampNow = () => Date.now() - 20_000;
    // @ts-expect-error — `track` takes no clock; this line fails typecheck if it ever does again.
    track(new Promise(() => {}), stampNow());
    expect(stalledSince()).toBeNull();
    // @ts-expect-error — nor does `stalledSince`: it reads the tap's own instant, never render state.
    expect(stalledSince(Date.now() + STAFF_HANG_MS)).toBeNull();
  });
});

describe("stalledSince — the OLDEST unanswered action, and only past the bound", () => {
  it("is null with nothing outstanding", () => {
    vi.setSystemTime(T0 + 10 * STAFF_HANG_MS);
    expect(stalledSince()).toBeNull();
  });

  it("is the start at EXACTLY the bound, null a millisecond before", () => {
    // MUTATION (p2h-core/ledger/stall-boundary): `>` — the sheet says "no answer yet" at 15s while
    // the next tap is still dispatched into the stuck queue for one more millisecond; red.
    track(new Promise(() => {}));
    vi.setSystemTime(T0 + STAFF_HANG_MS - 1);
    expect(stalledSince()).toBeNull();
    vi.setSystemTime(T0 + STAFF_HANG_MS);
    expect(stalledSince()).toBe(T0);
  });

  it("reads the OLDEST entry — a young read queued behind a hung write never clears it", async () => {
    // MUTATION (p2h-core/ledger/stall-reads-newest): the fresh poll queued behind a hung settle
    // calls the tab healthy, and a second payment is dispatched behind the first; red.
    const hungWrite = deferred<string>();
    const youngRead = deferred<string>();
    track(hungWrite.promise);
    vi.setSystemTime(T0 + 10_000);
    track(youngRead.promise);
    vi.setSystemTime(T0 + STAFF_HANG_MS);
    expect(stalledSince()).toBe(T0);
    // The oldest answers: the next oldest is now the clock, and it is bound by its OWN start.
    hungWrite.resolve("ok");
    await settle();
    vi.setSystemTime(T0 + 10_000 + STAFF_HANG_MS - 1);
    expect(stalledSince()).toBeNull();
    vi.setSystemTime(T0 + 10_000 + STAFF_HANG_MS);
    expect(stalledSince()).toBe(T0 + 10_000);
  });

  it("reset forgets every entry (the test seam)", () => {
    track(new Promise(() => {}));
    resetLedgerForTests();
    expect(outstanding()).toBe(0);
    vi.setSystemTime(T0 + STAFF_HANG_MS);
    expect(stalledSince()).toBeNull();
  });
});
