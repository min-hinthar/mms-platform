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

/** M70 — the RPC half. `releasePromoGrantFor` calls `mms_release_promo_grant`, so the era it passes
 *  (and whether it calls at all) is the assertable surface. */
let rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
let rpcError: { message: string } | null = null;

vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve({ error: rpcError });
    },
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

const { releaseSettlementFor, releaseSettlement, releasePromoGrantFor, acquireCartLock } =
  await import("./lock");

beforeEach(() => {
  queries = [];
  rpcCalls = [];
  rpcError = null;
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
    expect(res.result).not.toBe("closed");
    expect(res.result).toBe("unavailable");
    // M70 — a non-acquired outcome names no attempt; there is no era to hand a later release.
    expect(res.era).toBeNull();
  });

  it("a genuinely closed cart still reports closed — the honest case is untouched", async () => {
    updateCount = 0;
    statusRow = { status: "paid" };
    statusError = null;
    await expect(acquireCartLock("cart-1", "u1")).resolves.toEqual({ result: "closed", era: null });
  });

  it("a fresh lock held by another member still reports held_by_other", async () => {
    updateCount = 0;
    statusRow = { status: "open" };
    await expect(acquireCartLock("cart-1", "u1")).resolves.toEqual({
      result: "held_by_other",
      era: null,
    });
  });

  it("the ordinary acquire is unaffected", async () => {
    updateCount = 1;
    const ok = await acquireCartLock("cart-1", "u1");
    expect(ok.result).toBe("acquired");
    // M70 — the era is the value THIS acquisition wrote, and every later "am I still the attempt
    // that owns this cart?" question reads it. An acquire that answers with no era would leave
    // create-intent unable to scope its own grant release.
    expect(ok.era).toEqual(expect.any(String));
    expect(Number.isNaN(Date.parse(ok.era as string))).toBe(false);
    // …and it is the SAME value the UPDATE wrote. A second `new Date()` inside the function would
    // be a different millisecond, so the returned era would name an attempt the row does not hold.
    const written = queries.find((q) => "locked_at" in q.payload)?.payload.locked_at;
    expect(written).toBe(ok.era);
  });
});

/**
 * M70 · Codex P1 on #233 — the DECLINE was the one exit that freed the cart and kept the promo pin.
 * The webhook's `payment_failed` arm released the lock and the freeze; nothing released the grant,
 * so the diner came back to an editable basket still carrying an authorized discount and the next
 * `mms_pin_promo_grant` no-op'd on the non-null pin.
 *
 * Asserted here rather than in the route because `app/api/**` is outside MONEY_PATHS and outside
 * `verify:slice`'s mutant set — a money rule written there cannot be guarded (CLAUDE.md, W17).
 */
describe("releasePromoGrantFor — the decline releases the grant, era-scoped", () => {
  it("clears the pin through the era-scoped RPC", async () => {
    const err = await releasePromoGrantFor("cart-1", "2026-08-29T00:00:00.000Z");
    expect(err).toBeNull();
    expect(rpcCalls).toEqual([
      {
        fn: "mms_release_promo_grant",
        args: { p_cart_id: "cart-1", p_attempt: "2026-08-29T00:00:00.000Z" },
      },
    ]);
  });

  it("passes the ERA, never a cart-wide clear — a successor's pin must survive a late decline", async () => {
    await releasePromoGrantFor("cart-1", "era-A");
    // The era is the whole predicate: the RPC matches `locked_at is not distinct from p_attempt`,
    // so a redelivered decline for era-A finds zero rows once era-B holds the cart. An empty or
    // absent attempt would match every era and wipe the live pin.
    expect(rpcCalls[0]?.args.p_attempt).toBe("era-A");
    expect(rpcCalls[0]?.args.p_attempt).not.toBe("");
  });

  it("does NOT clear anything when the intent cannot name its era", async () => {
    const err = await releasePromoGrantFor("cart-1", "");
    expect(err).toBeNull();
    // An intent minted before the era rode in metadata has nothing proving it is the current
    // attempt; a cart-wide clear is the successor-wiping hazard the scoping exists to prevent.
    expect(rpcCalls).toEqual([]);
  });

  it("surfaces the write error instead of swallowing it", async () => {
    rpcError = { message: "boom" };
    expect(await releasePromoGrantFor("cart-1", "era-A")).toEqual({ message: "boom" });
  });
});
