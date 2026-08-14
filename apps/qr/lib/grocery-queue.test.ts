import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  classifyReplay,
  drainCart,
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
 *   • the drain is strictly serialized FIFO with spacing (a parallel burst reads as flood to the
 *     mutation rate limit, whose throw is prod-redacted into a generic transport error).
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
  let seq = 0;
  vi.stubGlobal("crypto", { randomUUID: () => `00000000-0000-4000-8000-${String(seq++).padStart(12, "0")}` });
});

const CART = "11111111-1111-4111-8111-111111111111";

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
    enqueueScan(CART, "12345678");
    const [entry] = loadQueue();
    expect(Object.keys(entry!).sort()).toEqual(["barcode", "cartId", "queuedAt", "scanId"]);
  });
  it("prunes corrupt shapes and TTL-expired entries at load", () => {
    const now = 10_000_000;
    const good = { scanId: "00000000-0000-4000-8000-000000000001", cartId: CART, barcode: "12345678", queuedAt: now - 1000 };
    const stale = { ...good, scanId: "00000000-0000-4000-8000-000000000002", queuedAt: now - QUEUE_TTL_MS - 1 };
    const corrupt = { scanId: "nope", cartId: CART, barcode: "12345678", queuedAt: now, priceCents: 350 };
    expect(pruneEntries([good, stale, corrupt, "junk"], now)).toEqual([good]);
  });
});

describe("drainCart — serialized FIFO with the terminal flush", () => {
  it("sends strictly one at a time, oldest first, with spacing between sends", async () => {
    enqueueScan(CART, "11111111");
    enqueueScan(CART, "22222222");
    enqueueScan(CART, "33333333");
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
    enqueueScan(CART, "11111111");
    enqueueScan(CART, "22222222");
    const otherCart = "22222222-2222-4222-8222-222222222222";
    enqueueScan(otherCart, "99999999");
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
    enqueueScan(CART, "11111111");
    enqueueScan(CART, "22222222");
    await drainCart(CART, async () => ({ ok: false as const, reason: "locked" }), {
      sleep: async () => {},
    });
    expect(pendingFor(CART)).toHaveLength(2); // nothing lost
  });

  it("a REJECTED verdict dequeues just that entry and continues", async () => {
    enqueueScan(CART, "11111111");
    enqueueScan(CART, "22222222");
    const results = [
      { ok: false as const, reason: "unknown_barcode" },
      { ok: true as const },
    ];
    await drainCart(CART, async () => results.shift() ?? null, { sleep: async () => {} });
    expect(pendingFor(CART)).toEqual([]);
  });

  it("flushCart is the fresh-basket hook — every entry for the cart drops at once", () => {
    enqueueScan(CART, "11111111");
    enqueueScan(CART, "22222222");
    flushCart(CART);
    expect(pendingFor(CART)).toEqual([]);
  });
});
