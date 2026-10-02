import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 2i (P2bi) — `freshTruth`, the probe a reload decision reads. `diagnose()`'s probe is cached
 * for 15s (a burst of failures costs one request); the reload's pre-flight must never ride that
 * cache, or a screen reloads into an outage the cache has not seen yet.
 */
const answers: Array<{ db: string }> = [];
const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => {
  const body = answers.shift() ?? { db: "ok" };
  return new Response(JSON.stringify(body), { status: 200 });
});

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockClear();
  answers.length = 0;
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("freshTruth — never the cached answer", () => {
  it("two calls inside the cache window are two probes, and the second sees the outage", async () => {
    // MUTATION (p2i-truth/fresh-uses-cache): `freshTruth` returns the cached truth — the reload's
    // pre-flight reads a 15s-old "unknown" while the order system is down; red.
    const { freshTruth } = await import("./useConnectionTruth");
    answers.push({ db: "ok" }, { db: "down" });
    expect(await freshTruth()).toBe("unknown");
    expect(await freshTruth()).toBe("we-down");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("asks the health probe with no-store", async () => {
    const { freshTruth } = await import("./useConnectionTruth");
    await freshTruth();
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/health");
    expect(fetchMock.mock.calls[0]![1]?.cache).toBe("no-store");
  });

  it("waits for a probe already in flight, then runs its own", async () => {
    // MUTATION (p2i-truth/fresh-joins-in-flight): it returns the in-flight probe's answer — a probe
    // that started before the caller's own check; red.
    let release!: () => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((res) => {
          release = () => res(new Response(JSON.stringify({ db: "ok" }), { status: 200 }));
        }),
    );
    answers.push({ db: "down" });
    const { freshTruth } = await import("./useConnectionTruth");
    const first = freshTruth();
    const second = freshTruth();
    release();
    expect(await first).toBe("unknown");
    expect(await second).toBe("we-down");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("offline answers at once, with no probe", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const { freshTruth } = await import("./useConnectionTruth");
    expect(await freshTruth()).toBe("you-offline");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
