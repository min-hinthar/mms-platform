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
/** M119 (b) — the acquire path also does a diagnostic SELECT, so the mock grew a read half. The
 *  update half is untouched, so the W6c assertions above still measure what they always did. */
let updateCount: number | null = 0;
let updateError: { message: string } | null = null;
let statusRow: { status: string } | null = null;
let statusError: { message: string } | null = null;

vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (table: string) => ({
      update: (payload: Record<string, unknown>, opts?: { count?: string }) => {
        const q: Q = { table, payload, eq: [] };
        queries.push(q);
        return opts?.count ? countChain() : chain(q);
      },
      select: () => {
        const api: Record<string, unknown> = {
          eq: () => api,
          maybeSingle: () => Promise.resolve({ data: statusRow, error: statusError }),
        };
        return api;
      },
    }),
  }),
}));

function countChain() {
  const api: Record<string, unknown> = {
    eq: () => api,
    or: () => api,
    then: (r: (v: { count: number | null; error: unknown }) => unknown) =>
      Promise.resolve({ count: updateCount, error: updateError }).then(r),
  };
  return api;
}

const { releaseSettlementFor, releaseSettlement, acquireCartLock } = await import("./lock");

beforeEach(() => {
  queries = [];
  updateCount = 0;
  updateError = null;
  statusRow = { status: "open" };
  statusError = null;
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

/**
 * M119 (b) — the diagnostic read that exists to "message it honestly" was the one dropping its error.
 *
 * This is the SAME defect the acquire path's own comment already describes and fixes one statement
 * up: "The old code destructured only `data`, ignored that error, saw 0 rows, and returned
 * 'held_by_other'" — which gave EVERY checkout a spurious 409 after the PostgREST 14 upgrade. That
 * fix landed on the UPDATE; the identical shape survived three lines below.
 *
 * Unbound, a failed status read makes `cart` null, `cart?.status === "open"` false, and the verdict
 * `closed` — so `create-intent` answers "This order is no longer open." to a diner whose order is
 * open, and they cannot pay.
 */
describe("acquireCartLock — an unreadable status is not a closed order", () => {
  it("THE DEFECT — a failed status read must not report the order closed", async () => {
    updateCount = 0; // the conditional UPDATE matched nothing, so the diagnostic read runs
    statusRow = null;
    statusError = { message: "transport failure" };
    const res = await acquireCartLock("cart-1", "u1");
    expect(res).not.toBe("closed");
    expect(res).toBe("unavailable");
  });

  it("a genuinely closed cart still reports closed — the honest case is untouched", async () => {
    updateCount = 0;
    statusRow = { status: "paid" };
    statusError = null;
    await expect(acquireCartLock("cart-1", "u1")).resolves.toBe("closed");
  });

  it("a fresh lock held by another member still reports held_by_other", async () => {
    updateCount = 0;
    statusRow = { status: "open" };
    await expect(acquireCartLock("cart-1", "u1")).resolves.toBe("held_by_other");
  });

  it("the ordinary acquire is unaffected", async () => {
    updateCount = 1;
    await expect(acquireCartLock("cart-1", "u1")).resolves.toBe("acquired");
  });
});
