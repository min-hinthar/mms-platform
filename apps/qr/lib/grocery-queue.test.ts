import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  classifyReplay,
  drainCart,
  drainSummary,
  enqueueScan,
  flushCart,
  loadQueue,
  pendingFor,
  pruneEntries,
  QUEUE_TTL_MS,
} from "./grocery-queue";

/**
 * W7b — the offline scan queue's rules, pinned (the mutants' owning suite):
 *   • verdict mapping: a definitive catalog refusal DEQUEUES (never retry-loops), a TERMINAL cart
 *     flushes the WHOLE cart's queue (a replay into a re-minted fresh basket charges it for the
 *     dead basket's scans), a throw is always retryable;
 *   • the persisted entry is {scanId, cartId, barcode, queuedAt} and NOTHING else — never a price;
 *   • the entry stores the CALLER's scanId verbatim (review HIGH: the live attempt and its queued
 *     retry must share one identity, or a lost-response live add replays under a fresh id and
 *     double-adds past the server ledger — this module never mints its own);
 *   • the drain is strictly serialized FIFO with spacing (a parallel burst reads as flood to the
 *     mutation rate limit, whose throw is prod-redacted into a generic transport error);
 *   • drainSummary composes ONE toast — a rejected saved scan must never vanish behind the
 *     success line (review MED: the page's flash channel is single-slot).
 */

// node-env localStorage stub
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});

const CART = "11111111-1111-4111-8111-111111111111";
/** Deterministic per-test scan ids — minted by the CALLER, as the page does. */
let sidSeq = 0;
const sid = () => `00000000-0000-4000-8000-${String(sidSeq++).padStart(12, "0")}`;

describe("classifyReplay — the verdict mapping", () => {
  it("ok = delivered; an ok with lost lines is STILL delivered (the write committed)", () => {
    expect(classifyReplay({ ok: true })).toBe("delivered");
  });
  it("catalog refusals dequeue as rejected — a permanent answer, never a retry loop", () => {
    for (const reason of ["unknown_barcode", "unavailable", "weighed_item"])
      expect(classifyReplay({ ok: false, reason })).toBe("rejected");
  });
  it("a finished cart is terminal — paid/cancelled/expired", () => {
    for (const reason of ["paid", "cancelled", "session_expired"])
      expect(classifyReplay({ ok: false, reason })).toBe("terminal");
  });
  it("freezes and throws are retryable", () => {
    for (const reason of ["locked", "settling", "unreadable"])
      expect(classifyReplay({ ok: false, reason })).toBe("retry");
    expect(classifyReplay(null)).toBe("retry");
  });
});

describe("the persisted entry", () => {
  it("carries ONLY {scanId, cartId, barcode, queuedAt} — never a price, name, or qty", () => {
    enqueueScan(CART, "12345678", sid());
    const [entry] = loadQueue();
    expect(Object.keys(entry!).sort()).toEqual(["barcode", "cartId", "queuedAt", "scanId"]);
  });
  it("stores the CALLER's scanId verbatim — the live attempt and its retry share one identity", () => {
    // Review HIGH: a lost-response live add replays under whatever id the queue holds. If this
    // module minted its own, the retry would cross idempotency keys and double-add past the
    // server ledger. The id the page sent on the live attempt must be the id that replays.
    const liveAttemptId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    enqueueScan(CART, "12345678", liveAttemptId);
    expect(loadQueue()[0]!.scanId).toBe(liveAttemptId);
  });
  it("prunes corrupt shapes and TTL-expired entries at load", () => {
    const now = 10_000_000;
    const good = {
      scanId: "00000000-0000-4000-8000-000000000001",
      cartId: CART,
      barcode: "12345678",
      queuedAt: now - 1000,
    };
    const stale = {
      ...good,
      scanId: "00000000-0000-4000-8000-000000000002",
      queuedAt: now - QUEUE_TTL_MS - 1,
    };
    const corrupt = {
      scanId: "nope",
      cartId: CART,
      barcode: "12345678",
      queuedAt: now,
      priceCents: 350,
    };
    expect(pruneEntries([good, stale, corrupt, "junk"], now)).toEqual([good]);
  });
});

describe("drainCart — serialized FIFO with the terminal flush", () => {
  it("sends strictly one at a time, oldest first, with spacing between sends", async () => {
    enqueueScan(CART, "11111111", sid());
    enqueueScan(CART, "22222222", sid());
    enqueueScan(CART, "33333333", sid());
    const order: string[] = [];
    let inFlight = 0;
    let sawOverlap = false;
    const sleeps: number[] = [];
    await drainCart(
      CART,
      async (e) => {
        inFlight += 1;
        if (inFlight > 1) sawOverlap = true;
        order.push(e.barcode);
        await Promise.resolve();
        inFlight -= 1;
        return { ok: true as const };
      },
      { sleep: async (ms) => void sleeps.push(ms) },
    );
    expect(order).toEqual(["11111111", "22222222", "33333333"]);
    expect(sawOverlap).toBe(false); // never a parallel burst
    expect(sleeps.length).toBeGreaterThan(0); // spacing invoked between sends
    expect(loadQueue()).toEqual([]); // all delivered → dequeued
  });

  it("a TERMINAL verdict flushes the WHOLE cart's queue and stops the drain", async () => {
    enqueueScan(CART, "11111111", sid());
    enqueueScan(CART, "22222222", sid());
    const otherCart = "22222222-2222-4222-8222-222222222222";
    enqueueScan(otherCart, "99999999", sid());
    let sends = 0;
    await drainCart(
      CART,
      async () => {
        sends += 1;
        return { ok: false as const, reason: "paid" };
      },
      { sleep: async () => {} },
    );
    expect(sends).toBe(1); // stopped at the verdict — never replayed the rest
    expect(pendingFor(CART)).toEqual([]); // the dead cart's queue is GONE
    expect(pendingFor(otherCart)).toHaveLength(1); // other carts untouched
  });

  it("a RETRY verdict keeps the entry and stops (the next drain resumes)", async () => {
    enqueueScan(CART, "11111111", sid());
    enqueueScan(CART, "22222222", sid());
    await drainCart(CART, async () => ({ ok: false as const, reason: "locked" }), {
      sleep: async () => {},
    });
    expect(pendingFor(CART)).toHaveLength(2); // nothing lost
  });

  it("a REJECTED verdict dequeues just that entry and continues", async () => {
    enqueueScan(CART, "11111111", sid());
    enqueueScan(CART, "22222222", sid());
    const results = [{ ok: false as const, reason: "unknown_barcode" }, { ok: true as const }];
    await drainCart(CART, async () => results.shift() ?? null, { sleep: async () => {} });
    expect(pendingFor(CART)).toEqual([]);
  });

  it("flushCart is the fresh-basket hook — every entry for the cart drops at once", () => {
    enqueueScan(CART, "11111111", sid());
    enqueueScan(CART, "22222222", sid());
    flushCart(CART);
    expect(pendingFor(CART)).toEqual([]);
  });
});

describe("drainSummary — one composed toast, rejections never vanish", () => {
  it("a mixed drain reports BOTH — the rejection must not hide behind the success line", () => {
    const msg = drainSummary(2, ["12345678"]);
    expect(msg).toContain("added 2 saved scans");
    expect(msg).toContain("12345678");
    expect(msg).toContain("no longer available");
  });
  it("delivered-only keeps the plain success line", () => {
    expect(drainSummary(1, [])).toBe("Back online — added 1 saved scan.");
  });
  it("rejected-only names every refused barcode", () => {
    const msg = drainSummary(0, ["11111111", "22222222"]);
    expect(msg).toContain("2 saved scans");
    expect(msg).toContain("11111111, 22222222");
  });
  it("an empty drain says nothing", () => {
    expect(drainSummary(0, [])).toBeNull();
  });
});
