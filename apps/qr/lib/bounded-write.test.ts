import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  STAFF_HANG_MS,
  boundWrite,
  hasOwnWait,
  monoNow,
  moveOwnOut,
  outReadSlot,
  outstanding,
  ownWaitSlot,
  releaseOutRead,
  resetOutReadsForTests,
  resetOwnWaitsForTests,
  subscribeOwnWait,
  resetLedgerForTests,
  settleLate,
  stalledSince,
  tapRefusal,
  track,
  type Bounded,
  type Late,
  type OwnOut,
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
    vi.advanceTimersByTime(STAFF_HANG_MS);
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
    vi.advanceTimersByTime(10 * STAFF_HANG_MS);
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
    vi.advanceTimersByTime(14_000);
    track(raw.promise);
    expect(outstanding()).toBe(1);
    vi.advanceTimersByTime(STAFF_HANG_MS - 14_000);
    expect(stalledSince()).toBe(T0);
    raw.resolve(1);
    await settle();
    expect(outstanding()).toBe(0);
  });

  it("the start is THIS device's clock at registration — there is no other clock to hand it", () => {
    // The ledger is read at every money tap and written by every board; a board's server-offset
    // clock (`stampNow()`) written here would refuse every tap by the device's skew (critic F2). The
    // signature is the guard: `track` takes no time, so this is the only start it can record.
    vi.advanceTimersByTime(4_000);
    track(new Promise(() => {}));
    vi.advanceTimersByTime(STAFF_HANG_MS - 1);
    expect(stalledSince()).toBeNull();
    vi.advanceTimersByTime(1);
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
    vi.advanceTimersByTime(10 * STAFF_HANG_MS);
    expect(stalledSince()).toBeNull();
  });

  it("is the start at EXACTLY the bound, null a millisecond before", () => {
    // MUTATION (p2h-core/ledger/stall-boundary): `>` — the sheet says "no answer yet" at 15s while
    // the next tap is still dispatched into the stuck queue for one more millisecond; red.
    track(new Promise(() => {}));
    vi.advanceTimersByTime(STAFF_HANG_MS - 1);
    expect(stalledSince()).toBeNull();
    vi.advanceTimersByTime(1);
    expect(stalledSince()).toBe(T0);
  });

  it("reads the OLDEST entry — a young read queued behind a hung write never clears it", async () => {
    // MUTATION (p2h-core/ledger/stall-reads-newest): the fresh poll queued behind a hung settle
    // calls the tab healthy, and a second payment is dispatched behind the first; red.
    const hungWrite = deferred<string>();
    const youngRead = deferred<string>();
    track(hungWrite.promise);
    vi.advanceTimersByTime(10_000);
    track(youngRead.promise);
    vi.advanceTimersByTime(STAFF_HANG_MS - 10_000);
    expect(stalledSince()).toBe(T0);
    // The oldest answers: the next oldest is now the clock, and it is bound by its OWN start.
    hungWrite.resolve("ok");
    await settle();
    vi.advanceTimersByTime(10_000 - 1);
    expect(stalledSince()).toBeNull();
    vi.advanceTimersByTime(1);
    expect(stalledSince()).toBe(T0 + 10_000);
  });

  it("reset forgets every entry (the test seam)", () => {
    track(new Promise(() => {}));
    resetLedgerForTests();
    expect(outstanding()).toBe(0);
    vi.advanceTimersByTime(STAFF_HANG_MS);
    expect(stalledSince()).toBeNull();
  });
});

describe("stalledSince — measured on a MONOTONIC clock, never the wall clock (Codex r2 on #310, B4)", () => {
  // `vi.setSystemTime` is a wall-clock CORRECTION (network time, a manual fix): it moves `Date.now()`
  // and leaves `performance.now()` — and every pending timer, the bound's included — where they were.
  const HOUR = 3_600_000;

  it("a wall clock set BACK mid-hang still reads stalled at the bound — the next money tap is refused", () => {
    // MUTATION (p2h-cx2b/ledger/ages-on-wall-clock): the age is `Date.now() - start` again — an hour
    // set back reads the hang as an hour in the future, the tab as healthy, and the next payment is
    // dispatched into the stuck queue behind it; red.
    track(new Promise(() => {}));
    vi.advanceTimersByTime(10_000);
    vi.setSystemTime(Date.now() - HOUR);
    vi.advanceTimersByTime(STAFF_HANG_MS - 10_000 - 1);
    expect(stalledSince()).toBeNull();
    vi.advanceTimersByTime(1);
    // The value is still the WALL-clock start (callers read only null / not null).
    expect(stalledSince()).toBe(T0);
  });

  it("a wall clock set FORWARD never calls a fresh action stuck", () => {
    // MUTATION (p2h-cx2b/ledger/ages-on-wall-clock): an hour forward reads a read sent this instant
    // as an hour out — every money tap refused as "stuck — reload" for a hang that does not exist; red.
    track(new Promise(() => {}));
    vi.setSystemTime(Date.now() + HOUR);
    expect(stalledSince()).toBeNull();
    vi.advanceTimersByTime(STAFF_HANG_MS - 1);
    expect(stalledSince()).toBeNull();
  });

  it("the OLDEST is chosen on the monotonic clock — a younger read with an EARLIER wall time never hides the hang", () => {
    // MUTATION (p2h-cx2b/ledger/oldest-by-wall-clock): after a correction backward the young read
    // carries the earlier wall time, so it is picked as "oldest" and ITS age is measured — the hung
    // write at the head of the queue reads healthy; red.
    track(new Promise(() => {})); // the hung write: mono 0, wall T0
    vi.advanceTimersByTime(5_000);
    vi.setSystemTime(Date.now() - HOUR);
    track(new Promise(() => {})); // a young read: mono 5s, wall T0 + 5s − 1h
    vi.advanceTimersByTime(STAFF_HANG_MS - 5_000);
    expect(stalledSince()).toBe(T0);
  });

  it("the clock is `performance.now()`, read at the call — so the fake timers drive it", () => {
    // MUTATION (p2h-cx2b/ledger/mono-is-wall): the seam reads `Date.now()` — the set-back case above
    // goes red through it, and here the two clocks part; red.
    const at = monoNow();
    vi.setSystemTime(Date.now() - HOUR);
    expect(monoNow()).toBe(at);
    vi.advanceTimersByTime(1_234);
    expect(monoNow()).toBe(at + 1_234);
  });
});

describe("tapRefusal — a surface's OWN wait outranks the tab's stall (Phase 2h · integration, owner decision)", () => {
  // Every case is the sentence a refused money tap SAYS. `own` stands for the surface's waiting line
  // ("No answer yet — this payment may still be recorded. Don't take it again…"), `stalled` for
  // `out.stalled` ("…so this did nothing") — the one a re-tap must NOT be answered with.
  const OWN = "settle.cash.waiting";
  const STALLED = "out.stalled";

  it("its own write still out past the bound: the OWN sentence — though the ledger calls the tab stalled", () => {
    // MUTATION (p2h-int-c/tap-refusal/ledger-outranks-own): the ledger read first — at the bound the
    // surface's own raw IS the stall, so every re-tap says "this did nothing" and the one line that
    // says "don't take it again" is gone; red.
    expect(tapRefusal(OWN, T0, STALLED)).toBe(OWN);
  });

  it("its own write still out with the wall clock set back (the ledger reads 'not stalled'): still the OWN sentence", () => {
    // MUTATION (p2h-int-c/tap-refusal/own-ignored): the own wait unread — a clock set back mid-hang
    // lets a second payment queue behind the first (critic F12); red.
    expect(tapRefusal(OWN, null, STALLED)).toBe(OWN);
  });

  it("ANOTHER action's stall, its own write not out: `out.stalled`", () => {
    // MUTATION (p2h-int-c/tap-refusal/stall-ignored): a stalled tablet dispatches the payment into
    // the stuck queue, to land minutes later (9d); red.
    expect(tapRefusal<string>(null, T0, STALLED)).toBe(STALLED);
  });

  it("neither: nothing refused — the tap is sent", () => {
    expect(tapRefusal<string>(null, null, STALLED)).toBeNull();
  });
});

describe("ownWaitSlot — a surface's own wait, by SUBJECT, outlives the mount (Phase 2h · review a, A4)", () => {
  afterEach(() => {
    resetOwnWaitsForTests();
  });

  it("a second handle on the SAME subject reads what the first wrote; another subject reads idle", () => {
    const first = ownWaitSlot("refund:li1", false);
    first.current = true;
    // A re-mounted sheet makes a NEW handle — it must read the old mount's wait.
    // MUTATION (p2h-rev-a/own-wait/never-read): the register is never read, so a remount forgets it; red.
    expect(ownWaitSlot("refund:li1", false).current).toBe(true);
    expect(hasOwnWait("refund:li1")).toBe(true);
    expect(ownWaitSlot("refund:li2", false).current).toBe(false);
    expect(hasOwnWait("refund:li2")).toBe(false);
  });

  it("writing idle clears the entry; any other value is stored as written", () => {
    const loss = ownWaitSlot<string | null>("loss:c1", null);
    loss.current = "table.loss.msg.requestWaiting";
    expect(ownWaitSlot<string | null>("loss:c1", null).current).toBe(
      "table.loss.msg.requestWaiting",
    );
    loss.current = null;
    // MUTATION (p2h-rev-a/own-wait/never-cleared): the late answer cannot free the subject; red.
    expect(hasOwnWait("loss:c1")).toBe(false);
    expect(ownWaitSlot<string | null>("loss:c1", null).current).toBeNull();
  });

  it("every write notifies the listeners until they unsubscribe", () => {
    const heard = vi.fn();
    const stop = subscribeOwnWait(heard);
    const cash = ownWaitSlot("cash:s1", false);
    cash.current = true;
    cash.current = false;
    // MUTATION (p2h-rev-a/own-wait/silent): a held trigger never hears its wait end; red.
    expect(heard).toHaveBeenCalledTimes(2);
    stop();
    cash.current = true;
    expect(heard).toHaveBeenCalledTimes(2);
  });
});

describe("outReadSlot — a raw READ still out, by key, outlives the mount (Codex r2 on #310, B2)", () => {
  afterEach(() => {
    resetOutReadsForTests();
  });
  const rosterRead = () => {};
  const otherRead = () => {};

  it("a second handle on the SAME key reads the raw the first stored; another key reads null", () => {
    const raw = new Promise<string[]>(() => {});
    outReadSlot<string[]>(rosterRead).current = raw;
    // A reopened sheet makes a NEW handle — it must find the read the closed one left out.
    // MUTATION (p2h-cx2b/out-read/never-read): the register is never read, so every reopen sends
    // another read behind the hung one; red.
    expect(outReadSlot<string[]>(rosterRead).current).toBe(raw);
    expect(outReadSlot<string[]>(otherRead).current).toBeNull();
  });

  it("writing null clears the key; the next handle reads null", () => {
    const slot = outReadSlot<number>(rosterRead);
    slot.current = Promise.resolve(1);
    slot.current = null;
    // MUTATION (p2h-cx2b/out-read/never-cleared): a settled read stays "out" — every later open
    // attaches to an old answer (or an old failure) and never reads again; red.
    expect(outReadSlot<number>(rosterRead).current).toBeNull();
  });
});

describe("moveOwnOut — a write held from dispatch moves only by its OWN token (Codex r2 follow-up on #310, R2 · R3)", () => {
  afterEach(() => {
    resetOwnWaitsForTests();
  });
  const never = <T>() => new Promise<Late<T>>(() => {});

  it("the bound marks the held write past, and its answer releases it — each only while it is still that write", () => {
    const first = never<number>();
    const slot = ownWaitSlot<OwnOut<number> | false>("open:c1", false);
    slot.current = { late: first, past: false };
    expect(moveOwnOut("open:c1", first, { late: first, past: true })).toBe(true);
    expect(slot.current).toEqual({ late: first, past: true });
    expect(moveOwnOut("open:c1", first, false)).toBe(true);
    expect(hasOwnWait("open:c1")).toBe(false);
    // Nothing held: a late move is a no-op, never a re-hold.
    expect(moveOwnOut("open:c1", first, { late: first, past: true })).toBe(false);
    expect(hasOwnWait("open:c1")).toBe(false);
  });

  it("an OLD write's answer never releases — nor marks — a NEWER write's hold on the same subject", () => {
    const first = never<number>();
    const second = never<number>();
    const slot = ownWaitSlot<OwnOut<number> | false>("refundmark:r1", false);
    slot.current = { late: second, past: false };
    // MUTATION (p2h-cx2b/own-out/move-untokened): any answer moves the subject's hold — the first
    // write's late answer frees the second while it is still out, and its tap sends a third; red.
    expect(moveOwnOut("refundmark:r1", first, false)).toBe(false);
    expect(moveOwnOut("refundmark:r1", first, { late: first, past: true })).toBe(false);
    expect(slot.current).toEqual({ late: second, past: false });
  });

  it("every move notifies the subscribed controls; a refused one does not", () => {
    const heard = vi.fn();
    const stop = subscribeOwnWait(heard);
    const late = never<number>();
    ownWaitSlot<OwnOut<number> | false>("open:c2", false).current = { late, past: false };
    expect(heard).toHaveBeenCalledTimes(1);
    moveOwnOut("open:c2", late, { late, past: true });
    expect(heard).toHaveBeenCalledTimes(2);
    moveOwnOut("open:c2", never<number>(), false);
    expect(heard).toHaveBeenCalledTimes(2);
    stop();
  });
});

describe("releaseOutRead — a read's settle clears only the read it is (Codex r2 follow-up on #310, R4)", () => {
  afterEach(() => {
    resetOutReadsForTests();
  });
  const rosterRead = () => {};

  it("clears the key while it holds this raw; a raw that settles AFTER the register refilled leaves the newer read standing", () => {
    const old = new Promise<string[]>(() => {});
    const fresh = new Promise<string[]>(() => {});
    outReadSlot<string[]>(rosterRead).current = old;
    releaseOutRead(rosterRead, old);
    expect(outReadSlot<string[]>(rosterRead).current).toBeNull();
    outReadSlot<string[]>(rosterRead).current = fresh;
    // MUTATION (p2h-cx2b/out-read/release-untokened): the old read's settle clears whatever the key
    // holds — the newer read is forgotten while still out, and the next open sends another behind
    // it; red.
    releaseOutRead(rosterRead, old);
    expect(outReadSlot<string[]>(rosterRead).current).toBe(fresh);
  });
});
