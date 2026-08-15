import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * W7a — `getReceiptLink` mints a BEARER for the order's receipt, so the pre-mint authorization is
 * the whole game: the SSR uid must be the order's earner OR hold a qr_order_payers row. The mock
 * records the queries (the orders-payers.test.ts pattern); the payer table answers a row by
 * DEFAULT so a mutant that drops either scope predicate flips a refusal test red instead of
 * passing vacuously.
 */

vi.mock("server-only", () => ({}));

type Q = {
  table: string;
  cols: string;
  eq: [string, unknown][];
  in: [string, unknown][];
  updated?: Record<string, unknown>;
};
let queries: Q[] = [];
let earnedRow: { id: string } | null = null;
let payerRow: { order_id: string } | null = null;
let tokenRow: { token: string; expires_at: string } | null = null;
/** The settled re-check on the payer path (a bare id read, no earned_by) — settled by default. */
let settledRow: { id: string } | null = { id: "22222222-2222-4222-8222-222222222222" };
let rateAllowed = true;
let rateAsked = false;

function table(name: string) {
  const q: Q = { table: name, cols: "", eq: [], in: [] };
  queries.push(q);
  const api = {
    select(cols: string) {
      q.cols = cols;
      return api;
    },
    eq(col: string, val: unknown) {
      q.eq.push([col, val]);
      return api;
    },
    in(col: string, vals: unknown) {
      q.in.push([col, vals]);
      return api;
    },
    gt() {
      return api;
    },
    order() {
      return api;
    },
    update(row: Record<string, unknown>) {
      q.updated = row;
      return api;
    },
    maybeSingle() {
      if (name === "qr_orders") {
        if (q.eq.some(([c]) => c === "earned_by"))
          return Promise.resolve({ data: earnedRow, error: null });
        if (q.cols.includes("receipt_email"))
          return Promise.resolve({
            data: { receipt_email: null, receipt_sent_at: null },
            error: null,
          });
        if (q.cols.includes("total_cents"))
          // getReceiptEntry's order read (inside setReceiptEmail's success path).
          return Promise.resolve({
            data: {
              id: "22222222-2222-4222-8222-222222222222",
              status: "paid",
              created_at: "2026-08-15T00:00:00Z",
              total_cents: 100,
              tender: "card",
            },
            error: null,
          });
        // The payer path's settled re-check (bare id, no earned_by).
        return Promise.resolve({ data: settledRow, error: null });
      }
      if (name === "qr_order_payers") return Promise.resolve({ data: payerRow, error: null });
      if (name === "mms_receipt_tokens") return Promise.resolve({ data: tokenRow, error: null });
      return Promise.resolve({ data: null, error: null });
    },
    upsert() {
      return Promise.resolve({ error: null });
    },
    then(res: (v: { data: unknown[]; error: null }) => unknown) {
      // Awaited list reads (qr_order_items) and awaited updates both land here.
      return Promise.resolve({ data: [], error: null }).then(res);
    },
  };
  return api;
}

vi.mock("next/headers", () => ({ cookies: () => Promise.resolve({}) }));
vi.mock("next/server", () => ({ after: () => {} })); // the send drain is out of scope here
vi.mock("./rate", () => ({
  withinReceiptRate: () => {
    rateAsked = true;
    return Promise.resolve(rateAllowed);
  },
}));
vi.mock("./email", () => ({
  receiptEmailConfigured: () => true,
  sendOrderReceiptEmail: () => Promise.resolve({ ok: true }),
}));
vi.mock("@mms/db/server", () => ({
  serverClient: () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: "uid-1", is_anonymous: true } } }),
    },
  }),
  serviceClient: () => ({ from: table }),
}));

const { getReceiptLink, setReceiptEmail } = await import("./receipt");
const { getReceiptEntry } = await import("./receipt-entry");

const ORDER = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  queries = [];
  earnedRow = null;
  payerRow = null;
  tokenRow = { token: "T".repeat(43), expires_at: new Date(Date.now() + 1000_000).toISOString() };
  settledRow = { id: ORDER };
  rateAllowed = true;
  rateAsked = false;
});

describe("getReceiptLink — authorize BEFORE the bearer exists", () => {
  it("scopes the earner probe to THIS order, PAID, and THIS uid", async () => {
    earnedRow = { id: ORDER };
    const r = await getReceiptLink({ orderId: ORDER });
    expect(r).toMatchObject({ ok: true, path: `/track?r=${"T".repeat(43)}` });
    const probe = queries.find((x) => x.table === "qr_orders");
    expect(probe?.eq).toContainEqual(["id", ORDER]);
    // Settled statuses only — refunded keeps its receipt (stamped), unpaid never has one.
    expect(probe?.in).toContainEqual(["status", ["paid", "refunded"]]);
    expect(probe?.eq).toContainEqual(["earned_by", "uid-1"]);
  });

  it("authorizes a split payer through qr_order_payers, scoped to order AND uid", async () => {
    payerRow = { order_id: ORDER };
    const r = await getReceiptLink({ orderId: ORDER });
    expect(r.ok).toBe(true);
    const probe = queries.find((x) => x.table === "qr_order_payers");
    // Both halves, or any signed-in visitor mints a bearer for any order id they can guess.
    expect(probe?.eq).toContainEqual(["order_id", ORDER]);
    expect(probe?.eq).toContainEqual(["payer_uid", "uid-1"]);
  });

  it("refuses when neither proof exists — one generic refusal, no existence oracle", async () => {
    const r = await getReceiptLink({ orderId: ORDER });
    expect(r).toEqual({ ok: false, reason: "refused" });
    // And the refusal happened BEFORE any token table was touched.
    expect(queries.some((x) => x.table === "mms_receipt_tokens")).toBe(false);
  });

  it("refuses junk input without a database round trip", async () => {
    const r = await getReceiptLink({ orderId: "not-a-uuid" });
    expect(r).toEqual({ ok: false, reason: "refused" });
    expect(queries).toHaveLength(0);
  });
});

describe("getReceiptEntry — a receipt exists only for settled money", () => {
  it("carries the settled-status predicate in the read (never a pending/failed order)", async () => {
    await getReceiptEntry(ORDER);
    const read = queries.find((x) => x.table === "qr_orders" && x.cols.includes("total_cents"));
    expect(read?.eq).toContainEqual(["id", ORDER]);
    expect(read?.in).toContainEqual(["status", ["paid", "refunded"]]);
  });
});

describe("setReceiptEmail — authorize → rate → write, in that order", () => {
  const INPUT = { orderId: ORDER, email: "diner@example.com" };

  it("refuses an unauthorized caller BEFORE consulting the rate bucket or writing", async () => {
    const r = await setReceiptEmail(INPUT);
    expect(r).toEqual({ ok: false, reason: "refused" });
    expect(rateAsked).toBe(false); // the outbound budget never spends on a refused caller
    expect(queries.some((q) => q.updated)).toBe(false);
  });

  it("surfaces rate exhaustion honestly (never a silent drop) and writes nothing", async () => {
    earnedRow = { id: ORDER };
    rateAllowed = false;
    const r = await setReceiptEmail(INPUT);
    expect(r).toEqual({ ok: false, reason: "rate_limited" });
    expect(queries.some((q) => q.updated)).toBe(false);
  });

  it("carries the paid-status guard IN the write statement, scoped to the order", async () => {
    earnedRow = { id: ORDER };
    const r = await setReceiptEmail(INPUT);
    expect(r).toEqual({ ok: true, sentTo: "diner@example.com" });
    const write = queries.find((q) => q.updated && "receipt_email" in q.updated!);
    expect(write?.updated).toEqual({ receipt_email: "diner@example.com" });
    expect(write?.eq).toContainEqual(["id", ORDER]);
    // The doctrine: the settled-status guard rides the SQL statement, not just the earlier probe.
    expect(write?.in).toContainEqual(["status", ["paid", "refunded"]]);
  });
});
