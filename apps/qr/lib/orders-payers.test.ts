import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * W11 (M29) — the `qr_order_payers` probes are AUTHORIZATION decisions, and both live in their
 * predicates: `payer_uid = uid` is the entire reason a split payer may see the full tracker for an
 * order `earned_by` never mentions them on. Drop that `.eq()` and any signed-in visitor is authorized
 * for any order id they can guess — which is why the money-coverage gate refused to let this file ship
 * unguarded. The mock records the QUERY; the assertions are about the predicate, not a chosen answer.
 */

vi.mock("server-only", () => ({}));

type Q = { table: string; cols: string; eq: [string, unknown][] };
let queries: Q[] = [];

/** Rows per table, keyed by a marker column in the requested cols. */
let payerRow: { order_id: string } | null = null;
let orderRow: Record<string, unknown> | null = null;
let paidOrderRow: { id: string } | null = null;

function sel(table: string, cols: string) {
  const q: Q = { table, cols, eq: [] };
  queries.push(q);
  const api = {
    eq(col: string, val: unknown) {
      q.eq.push([col, val]);
      return api;
    },
    not() {
      return api;
    },
    gte() {
      return api;
    },
    or() {
      return api;
    },
    order() {
      return Promise.resolve({ data: [], error: null });
    },
    limit() {
      return api;
    },
    maybeSingle() {
      if (table === "qr_order_payers") return Promise.resolve({ data: payerRow, error: null });
      // The earned_by-scoped reads answer EMPTY here — the whole point of these tests is the path a
      // split payer takes when `earned_by` never mentions them.
      if (q.eq.some(([col]) => col === "earned_by"))
        return Promise.resolve({ data: null, error: null });
      if (table === "qr_orders" && cols === "id")
        return Promise.resolve({ data: paidOrderRow, error: null });
      if (table === "qr_orders") return Promise.resolve({ data: orderRow, error: null });
      return Promise.resolve({ data: null, error: null });
    },
    then(res: (v: { data: unknown; error: null }) => unknown) {
      return Promise.resolve({ data: [], error: null }).then(res);
    },
  };
  return api;
}

vi.mock("next/headers", () => ({ cookies: () => Promise.resolve({}) }));
vi.mock("@mms/db/server", () => ({
  serverClient: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "uid-1" } } }) },
  }),
  serviceClient: () => ({
    from: (table: string) => ({ select: (cols: string) => sel(table, cols) }),
  }),
}));

const ORDER = "22222222-2222-4222-8222-222222222222";
const CART = "11111111-1111-4111-8111-111111111111";
const { getMyOrderFallback, didIPayForCart } = await import("./orders");

beforeEach(() => {
  queries = [];
  payerRow = null;
  orderRow = null;
  paidOrderRow = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("getMyOrderFallback — the payers probe is the authorization", () => {
  it("scopes the probe to THIS order AND THIS uid", async () => {
    payerRow = { order_id: ORDER };
    orderRow = { id: ORDER, status: "paid", total_cents: 3439, qr_order_items: [] };
    const r = await getMyOrderFallback({ orderId: ORDER });
    expect(r.ok).toBe(true);
    const probe = queries.find((q) => q.table === "qr_order_payers");
    // Both halves, or the probe authorizes any visitor for any order id they can guess.
    expect(probe?.eq).toContainEqual(["order_id", ORDER]);
    expect(probe?.eq).toContainEqual(["payer_uid", "uid-1"]);
  });

  it("stays not_found when no payers row exists (and no share row)", async () => {
    const r = await getMyOrderFallback({ orderId: ORDER });
    expect(r).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("didIPayForCart — the durable proof probes payer_uid, never trusts the caller", () => {
  it("answers true through a payers row, scoped to the paid order and the caller's uid", async () => {
    paidOrderRow = { id: ORDER };
    payerRow = { order_id: ORDER };
    await expect(didIPayForCart(CART)).resolves.toBe(true);
    const probe = queries.find((q) => q.table === "qr_order_payers");
    expect(probe?.eq).toContainEqual(["order_id", ORDER]);
    expect(probe?.eq).toContainEqual(["payer_uid", "uid-1"]);
  });

  it("fails closed when nothing proves payment", async () => {
    await expect(didIPayForCart(CART)).resolves.toBe(false);
  });
});
