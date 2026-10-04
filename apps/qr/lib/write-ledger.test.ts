import { describe, expect, it } from "vitest";
import { bounded, createWriteLedger, DRAIN_MAX_MS } from "./write-ledger";

/**
 * Codex round 4 on #312 (P1) — the barrier the market lends the Order tab. Pinned as values: the
 * drain must not resolve while a write is in flight, must catch a write tracked DURING the wait,
 * must not swallow the caller's rejection, and must resolve at once when nothing is pending.
 */
const deferred = <T>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("createWriteLedger", () => {
  it("settled() resolves at once with nothing in flight", async () => {
    const l = createWriteLedger();
    let done = false;
    void l.settled().then(() => {
      done = true;
    });
    await tick();
    expect(done).toBe(true);
  });
  it("settled() waits for a tracked write, and for one tracked DURING the wait", async () => {
    const l = createWriteLedger();
    const a = deferred<string>();
    void l.track(a.promise);
    let done = false;
    void l.settled().then(() => {
      done = true;
    });
    await tick();
    expect(done).toBe(false);
    expect(l.size()).toBe(1);
    const b = deferred<string>();
    void l.track(b.promise); // the rapid second scan
    a.resolve("a");
    await tick();
    await tick();
    expect(done).toBe(false); // b is still open
    b.resolve("b");
    await tick();
    await tick();
    expect(done).toBe(true);
    expect(l.size()).toBe(0);
  });
  it("a rejected write releases the barrier and still rejects for its caller", async () => {
    const l = createWriteLedger();
    const a = deferred<string>();
    const tracked = l.track(a.promise);
    let caught: unknown = null;
    void tracked.catch((e) => {
      caught = e;
    });
    const wait = l.settled();
    a.reject(new Error("network"));
    await wait;
    expect(l.size()).toBe(0);
    expect((caught as Error).message).toBe("network");
  });
  it("track() hands back the same promise — `await track(p)` is `await p`", async () => {
    const l = createWriteLedger();
    const p = Promise.resolve(7);
    expect(l.track(p)).toBe(p);
    expect(await l.track(Promise.resolve("x"))).toBe("x");
  });
});

describe("bounded — the drain a navigation awaits has a deadline", () => {
  it("a settled barrier resolves at once, with nothing left behind", async () => {
    const ledger = createWriteLedger();
    let done = false;
    await bounded(ledger.settled(), 1000).then(() => {
      done = true;
    });
    expect(done).toBe(true);
  });
  it("a barrier that never resolves (a hung Server Action) is released at the deadline (deep pass on #312)", async () => {
    const never = new Promise<void>(() => {});
    let released = false;
    const p = bounded(never, 20).then(() => {
      released = true;
    });
    await new Promise((r) => setTimeout(r, 5));
    expect(released).toBe(false); // not early
    await p;
    expect(released).toBe(true);
  });
  it("the default deadline is a few seconds — long enough for a slow write, short enough that a dead tab is not forever", () => {
    expect(DRAIN_MAX_MS).toBeGreaterThanOrEqual(5000);
    expect(DRAIN_MAX_MS).toBeLessThanOrEqual(15000);
  });
});
