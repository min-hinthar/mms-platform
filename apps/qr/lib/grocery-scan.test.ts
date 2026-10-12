import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * W7b — scanAdd's half of the scan-event contract: the queue's `scanId` must be FORWARDED into
 * `insertOrIncLine` (the last TS hop before the SQL dedupe), and a live scan must forward nothing.
 * The rest of the pipeline is pinned elsewhere (order-lines-scan.test.ts → the RPC payloads;
 * supabase/tests/scan_dedupe_test.sql → the SQL). The queue itself never sends a price — this path
 * re-derives every cent from the catalog row, exactly as before.
 */

vi.mock("server-only", () => ({}));
/** The session's mode as `assertCartMember` reads it off the session row (M108) — M189 forks on it. */
let sessionMode = "scango";
vi.mock("./authz", () => ({
  assertCartMember: () =>
    Promise.resolve({
      uid: "seat-1",
      sessionId: "sess-1",
      role: "host",
      locked: false,
      lockedBy: null,
      settling: false,
      settleBy: null,
      mode: sessionMode,
    }),
}));
vi.mock("./rate", () => ({ assertMutationRate: () => Promise.resolve() }));
vi.mock("./cart-failure", () => ({ whyCartUnavailable: () => Promise.resolve("unreadable") }));

let addCalls: unknown[][] = [];
vi.mock("./order-lines", () => ({
  insertOrIncLine: (...args: unknown[]) => {
    addCalls.push(args);
    return Promise.resolve();
  },
  touchCart: () => Promise.resolve(),
}));

vi.mock("@mms/db/server", () => ({
  publicClient: () => ({}),
  serviceClient: () => ({
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        order: () => chain,
        maybeSingle: () =>
          Promise.resolve({
            data:
              table === "grocery_items"
                ? {
                    barcode: "12345678",
                    name: "Test Jar",
                    price_cents: 350,
                    tax_category: "grocery_food",
                    ebt_eligible: true,
                    weighed: false,
                    available: true,
                  }
                : null,
            error: null,
          }),
        then: (res: (v: { data: unknown[]; error: null }) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(res),
      };
      return chain;
    },
  }),
}));

const { scanAdd } = await import("./grocery");

const CART = "11111111-1111-4111-8111-111111111111";
const SCAN = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  addCalls = [];
  sessionMode = "scango";
});

describe("scanAdd — scanId forwarding", () => {
  it("a queued replay's scanId reaches insertOrIncLine (the SQL dedupe's last TS hop)", async () => {
    const r = await scanAdd(CART, "12345678", SCAN);
    expect(r.ok).toBe(true);
    expect(addCalls).toHaveLength(1);
    // insertOrIncLine(cartId, line, bySeat, qty, scanId)
    expect(addCalls[0]![4]).toBe(SCAN);
  });

  it("a LIVE scan forwards NO scanId — repeat barcodes deliberately count", async () => {
    const r = await scanAdd(CART, "12345678");
    expect(r.ok).toBe(true);
    expect(addCalls[0]![4]).toBeUndefined();
  });
});

/**
 * M189 — owner ruling 2026-10-07 (OWNER_RULINGS_2026-10-07 §C): market items go only on scan-and-go
 * carts. `scanAdd` read `{ uid, locked, settling }` off its authz and never `mode`, so a direct POST
 * wrote grocery lines into a dine-in cart, where the split weights them and `create-share-intent`
 * tips on them with no grocery term, while single-pay forces a grocery-only tip to zero. The gate
 * runs before the catalog read and before any write.
 */
describe("scanAdd — market lines only on a scan-and-go cart (M189)", () => {
  it("⚠️ THE DEFECT — a DINE-IN cart takes no market line, and nothing is written", async () => {
    sessionMode = "dinein";
    const r = await scanAdd(CART, "12345678");
    expect(r.ok).toBe(false);
    expect(addCalls).toEqual([]);
  });

  it("⚠️ a plain online to-go (pickup) cart takes none either — the ruling names it", async () => {
    sessionMode = "pickup";
    const r = await scanAdd(CART, "12345678", SCAN);
    expect(r.ok).toBe(false);
    expect(addCalls).toEqual([]);
  });

  it("the refusal is `unreadable` — Retry only, never the fresh-basket offer or a catalog verdict", async () => {
    // Not `unknown_barcode` / `unavailable`: the offline queue DISCARDS those, and they would blame
    // a real product. Not a terminal reason: that offers a re-mint, abandoning the cart's lines.
    sessionMode = "dinein";
    const r = await scanAdd(CART, "12345678");
    expect(r).toEqual({ ok: false, reason: "unreadable" });
  });

  it("a scan-and-go cart is untouched — the control", async () => {
    const r = await scanAdd(CART, "12345678");
    expect(r.ok).toBe(true);
    expect(addCalls).toHaveLength(1);
  });

  it("an unknown mode fails CLOSED — only the one named mode is admitted", async () => {
    for (const mode of ["", "SCANGO", "scan-and-go", "grocery"]) {
      sessionMode = mode;
      addCalls = [];
      expect((await scanAdd(CART, "12345678")).ok).toBe(false);
      expect(addCalls).toEqual([]);
    }
  });
});
