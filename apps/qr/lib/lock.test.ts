import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * W6c — the attempt-scoped release predicate, asserted as a QUERY SHAPE (terminal.test.ts mocks
 * this module, so nothing else pins the statement itself). The `.eq(settle_by, attemptId)` term is
 * the whole point of `releaseSettlementFor`: without it, a late webhook delivery / stale panel /
 * double-tap loser releases whatever freeze the cart holds NOW — the successor-era confusion the
 * W6c review confirmed HIGH.
 */

vi.mock("server-only", () => ({}));

type Q = { table: string; payload: Record<string, unknown>; eq: [string, unknown][] };
let queries: Q[] = [];
function chain(q: Q) {
  const api = {
    eq(col: string, val: unknown) {
      q.eq.push([col, val]);
      return api;
    },
    then(res: (v: { error: null }) => unknown) {
      return Promise.resolve({ error: null }).then(res);
    },
  };
  return api;
}
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (table: string) => ({
      update: (payload: Record<string, unknown>) => {
        const q: Q = { table, payload, eq: [] };
        queries.push(q);
        return chain(q);
      },
    }),
  }),
}));

const { releaseSettlementFor, releaseSettlement } = await import("./lock");

beforeEach(() => {
  queries = [];
});

describe("releaseSettlementFor — the era guard lives IN the statement", () => {
  it("nulls the freeze ONLY where this attempt still owns it", async () => {
    const err = await releaseSettlementFor("cart-1", "attempt-1");
    expect(err).toBeNull();
    const q = queries[0]!;
    expect(q.table).toBe("qr_carts");
    expect(q.payload).toEqual({ settle_at: null, settle_by: null });
    expect(q.eq).toContainEqual(["id", "cart-1"]);
    // Without this predicate a release that outlived its attempt nulls a SUCCESSOR's live freeze.
    expect(q.eq).toContainEqual(["settle_by", "attempt-1"]);
  });

  it("the unscoped release stays unscoped (the online paths' documented, TTL-backstopped shape)", async () => {
    await releaseSettlement("cart-1");
    const q = queries[0]!;
    expect(q.eq).toContainEqual(["id", "cart-1"]);
    expect(q.eq.some(([col]) => col === "settle_by")).toBe(false);
  });
});
