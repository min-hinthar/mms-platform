import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * W7b — scanAdd's half of the scan-event contract: the queue's `scanId` must be FORWARDED into
 * `insertOrIncLine` (the last TS hop before the SQL dedupe), and a live scan must forward nothing.
 * The rest of the pipeline is pinned elsewhere (order-lines-scan.test.ts → the RPC payloads;
 * supabase/tests/scan_dedupe_test.sql → the SQL). The queue itself never sends a price — this path
 * re-derives every cent from the catalog row, exactly as before.
 */

vi.mock("server-only", () => ({}));
vi.mock("./authz", () => ({
  assertCartMember: () =>
    Promise.resolve({ uid: "seat-1", sessionId: "sess-1", role: "host", locked: false, lockedBy: null, settling: false, settleBy: null }),
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
                ? { barcode: "12345678", name: "Test Jar", price_cents: 350, tax_category: "grocery_food", ebt_eligible: true, weighed: false, available: true }
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
