import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * W10d pre-merge RE-REVIEW — `paymentInFlightReason`, the shared money mutex.
 *
 * This is the single guard standing between an in-flight card payment and the two staff actions that
 * would invalidate it (cash settle, clear-table turnover) plus every mutation that routes through them.
 * It had no test of any kind, and it failed **OPEN**: the count read's `error` was never destructured,
 * so a transport failure yielded `count: null`, `(count ?? 0) > 0` was false, and the answer was
 * "nothing in flight — go ahead".
 *
 * That window is not theoretical. `captureAllIfReady` deliberately captures on a STALE freeze once the
 * table is fully covered (otherwise a table that took longer than the TTL to enter every card would
 * dead-end). Between that capture and the succeeded webhook the cart is still `open` and `settle_at` is
 * already stale — so the freshness branch returns nothing and this count is the ONLY thing left.
 * `mms_fulfill_cash_order` gates on `cart.status = 'open'` alone, so cash gets collected on top of
 * captured cards.
 *
 * The assertions are on the QUERY (predicates included), because both defects live in the predicate.
 */

vi.mock("server-only", () => ({}));

type Query = {
  eq: [string, unknown][];
  inList?: string[];
  not: [string, string, unknown][];
  head?: boolean;
  countRequested?: boolean;
};
let queries: Query[] = [];
let count: number | null = 0;
let readError: { message: string } | null = null;

vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: () => ({
      select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
        const q: Query = { eq: [], not: [], head: opts?.head, countRequested: opts?.count != null };
        queries.push(q);
        const api = {
          eq(col: string, val: unknown) {
            q.eq.push([col, val]);
            return api;
          },
          in(_col: string, list: string[]) {
            q.inList = list;
            return api;
          },
          not(col: string, operator: string, val: unknown) {
            q.not.push([col, operator, val]);
            return api;
          },
          // postgrest's real shape, both directions: `count` is parsed from the content-range header
          // ONLY when the request carried `Prefer: count=…` (round-3 review — the earlier mock handed
          // a count back unconditionally, so dropping `{ count: "exact" }` from the guard left all
          // nine tests green), and it is null on any failure (parsed only inside `if (res.ok)`).
          then: (res: (v: { count: number | null; error: typeof readError }) => unknown) =>
            Promise.resolve({
              count: q.countRequested && !readError ? count : null,
              error: readError,
            }).then(res),
        };
        return api;
      },
    }),
  }),
}));

const { paymentInFlightReason } = await import("./pay-guard");

const CART = { id: "cart-1", locked: false, locked_at: null, settle_at: null };

beforeEach(() => {
  queries = [];
  count = 0;
  readError = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("paymentInFlightReason — the mutex must fail CLOSED", () => {
  it("refuses when the in-flight share read fails", async () => {
    // The defect. A blip on this one read used to green-light cash settle, clear-table, merge, voids,
    // comps and approvals over captured cards awaiting their fulfillment webhook.
    readError = { message: "connection reset" };
    await expect(paymentInFlightReason(CART)).resolves.toBe("split_in_progress");
  });

  it("allows the action when the read genuinely returns zero", async () => {
    // The other direction, so failing closed can't be implemented as "always refuse".
    count = 0;
    await expect(paymentInFlightReason(CART)).resolves.toBeNull();
  });

  it("refuses when a share really is in flight", async () => {
    count = 1;
    await expect(paymentInFlightReason(CART)).resolves.toBe("split_in_progress");
  });
});

describe("paymentInFlightReason — a $0 seat is not money in flight", () => {
  it("excludes shares with no PaymentIntent from the count", async () => {
    // `openSettlement` auto-settles a $0 by-person seat to `captured` with a NULL PI so it can't block
    // the all-covered gate. Counting it returned `split_in_progress` INDEPENDENT of the freshness TTL,
    // which permanently refused every settle path on that table — with no host-side escape either,
    // because abort was refused by the sibling copy of the same mistake.
    await paymentInFlightReason(CART);
    expect(queries[0]?.not).toContainEqual(["stripe_payment_intent_id", "is", null]);
  });

  it("still scopes the count to this cart and to in-flight statuses", async () => {
    // Without the cart scope this counts EVERY table's shares — one live split anywhere would freeze
    // the whole restaurant. Without the status list it counts pending rows that hold nothing.
    await paymentInFlightReason(CART);
    expect(queries[0]?.eq).toContainEqual(["cart_id", "cart-1"]);
    expect(queries[0]?.inList).toEqual(["authorized", "captured"]);
  });
});

describe("paymentInFlightReason — the freshness branch still short-circuits", () => {
  it("reports mid_payment on a fresh single-pay lock without reading shares", async () => {
    const locked = { ...CART, locked: true, locked_at: new Date().toISOString() };
    await expect(paymentInFlightReason(locked)).resolves.toBe("mid_payment");
    expect(queries).toHaveLength(0);
  });

  it("reports mid_payment on a fresh settlement freeze", async () => {
    const settling = { ...CART, settle_at: new Date().toISOString() };
    await expect(paymentInFlightReason(settling)).resolves.toBe("mid_payment");
  });

  it("falls through to the share count once the freeze is stale", async () => {
    // The exact window the fail-closed rule protects: stale freeze, cart still open, capture may have
    // already run.
    const stale = { ...CART, settle_at: new Date(Date.now() - 60 * 60 * 1000).toISOString() };
    count = 1;
    await expect(paymentInFlightReason(stale)).resolves.toBe("split_in_progress");
    expect(queries).toHaveLength(1);
  });

  it("returns null for a cart that does not exist", async () => {
    await expect(paymentInFlightReason(null)).resolves.toBeNull();
  });
});
