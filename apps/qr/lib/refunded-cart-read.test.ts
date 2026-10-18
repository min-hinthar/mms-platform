import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RefundOrderRow } from "./refunded-cart";
/**
 * #360 (the blind pass, CRITICAL 1) — the line ledger the three staff readers tag a refunded cart by
 * (`foodRefundedInFull`'s arm (b)): ONE batched read per table, chunked, for exactly the orders that
 * can need it, and failing OPEN (null — the line arm undecided, the read logged), never a guess.
 */
vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;
type Req = { table: string; select: string; col: string; ids: string[]; limit: number | null };
let tables: Record<string, Row[]> = {};
let failTable: string | null = null;
let throwTable: string | null = null;
let requests: Req[] = [];

function fakeDb() {
  return {
    from(table: string) {
      const req: Req = { table, select: "", col: "", ids: [], limit: null };
      const api = {
        select(s: string) {
          req.select = s;
          return api;
        },
        in(col: string, ids: string[]) {
          req.col = col;
          req.ids = ids;
          return api;
        },
        limit(n: number) {
          req.limit = n;
          return api;
        },
        then(resolve: (r: { data: Row[] | null; error: { message: string } | null }) => void) {
          requests.push(req);
          if (table === throwTable) throw new Error("socket hang up");
          if (table === failTable) return resolve({ data: null, error: { message: "down" } });
          const hit = (tables[table] ?? []).filter((r) => req.ids.includes(String(r[req.col])));
          const cols = req.select.split(",");
          const shaped = hit.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]])));
          resolve({ data: req.limit === null ? shaped : shaped.slice(0, req.limit), error: null });
        },
      };
      return api;
    },
  };
}

const { readLineRefunds, REFUND_ID_CHUNK, LINE_REFUND_ROW_CAP } =
  await import("./refunded-cart-read");
const { foodRefundedInFull } = await import("./refunded-cart");
const order = (id: string, over: Partial<RefundOrderRow> = {}): RefundOrderRow => ({
  id,
  cart_id: `c-${id}`,
  status: "paid",
  total_cents: 2400,
  refunded_cents: 1000,
  service_charge_cents: 0,
  tip_cents: 400,
  ...over,
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the fake answers the two calls used
const db = () => fakeDb() as any;

beforeEach(() => {
  tables = { qr_order_items: [], mms_refunds: [] };
  failTable = null;
  throwTable = null;
  requests = [];
});

describe("readLineRefunds — the line ledger, read once, chunked, failing open", () => {
  it("returns each order's lines and the lines the ledger refunded", async () => {
    tables.qr_order_items = [
      { id: "i1", order_id: "o1" },
      { id: "i2", order_id: "o1" },
      { id: "i3", order_id: "o9" },
    ];
    tables.mms_refunds = [
      { order_id: "o1", order_item_id: "i1" },
      { order_id: "o1", order_item_id: null }, // an order-level row: no line
    ];
    const got = await readLineRefunds(db(), [order("o1")], "test");
    expect(got).not.toBeNull();
    expect([...(got?.itemsByOrder.get("o1") ?? [])]).toEqual(["i1", "i2"]);
    expect(got?.itemsByOrder.has("o9")).toBe(false);
    expect([...(got?.refundedLines ?? [])]).toEqual(["i1"]);
  });

  it("a GROCERY line is not a dish: every dish refunded with the grocery kept is food refunded in full (#360, Codex P2)", async () => {
    // lck/refunded-cart-read/grocery-counts-as-a-dish — the grocery's snapshot id stayed in the
    // order's lines, so "every line refunded" was false; the amount arm was false too (the grocery is
    // in the goods pool), and the KDS, the floor and the paid round never tagged the refunded dishes.
    tables.qr_order_items = [
      { id: "i-dish", order_id: "o1", fulfillment: "dinein" },
      { id: "i-togo", order_id: "o1", fulfillment: "togo" },
      { id: "i-groc", order_id: "o1", fulfillment: "grocery" },
    ];
    tables.mms_refunds = [
      { order_id: "o1", order_item_id: "i-dish" },
      { order_id: "o1", order_item_id: "i-togo" },
    ];
    // $24.00, a $4.00 tip, $10.00 back: the amount arm alone says partial
    const o = order("o1");
    const got = await readLineRefunds(db(), [o], "test");
    expect([...(got?.itemsByOrder.get("o1") ?? [])]).toEqual(["i-dish", "i-togo"]);
    expect(foodRefundedInFull(o, got)).toBe(true);
    // …and a dish still standing beside the grocery keeps the order untagged
    tables.mms_refunds = [{ order_id: "o1", order_item_id: "i-dish" }];
    expect(foodRefundedInFull(o, await readLineRefunds(db(), [o], "test"))).toBe(false);
    // a grocery-only order holds no dish: the line arm has nothing to say (the order row decides)
    tables.qr_order_items = [{ id: "i-groc", order_id: "o1", fulfillment: "grocery" }];
    tables.mms_refunds = [{ order_id: "o1", order_item_id: "i-groc" }];
    const groc = await readLineRefunds(db(), [o], "test");
    expect(groc?.itemsByOrder.has("o1")).toBe(false);
    expect(foodRefundedInFull(o, groc)).toBe(false);
  });

  it("reads only a PAID order with money back — a refunded order is decided by its status, an untouched one has no rows", async () => {
    // lck/refunded-cart-read/reads-every-order — red (the requests name o-ref and o-none).
    await readLineRefunds(
      db(),
      [
        order("o1"),
        order("o-ref", { status: "refunded", refunded_cents: 2400 }),
        order("o-none", { refunded_cents: 0 }),
      ],
      "test",
    );
    expect(new Set(requests.flatMap((r) => r.ids))).toEqual(new Set(["o1"]));
    // nothing to read reads nothing
    requests = [];
    const none = await readLineRefunds(db(), [order("o-none", { refunded_cents: 0 })], "test");
    expect(requests).toEqual([]);
    expect(none?.itemsByOrder.size).toBe(0);
  });

  it("202 orders go in IN-lists of at most REFUND_ID_CHUNK, every chunk's answer counts", async () => {
    // (question c) — 202 uuids in one query string is ~7.8 KB of URL against an unmeasured limit.
    // lck/refunded-cart-read/one-in-list — red. lck/refunded-cart-read/last-chunk-dropped — red.
    const orders = Array.from({ length: 202 }, (_, i) => order(`o${i}`));
    tables.qr_order_items = orders.map((o) => ({ id: `i-${o.id}`, order_id: o.id }));
    tables.mms_refunds = orders.map((o) => ({ order_id: o.id, order_item_id: `i-${o.id}` }));
    const got = await readLineRefunds(db(), orders, "test");
    expect(REFUND_ID_CHUNK).toBe(50);
    for (const t of ["qr_order_items", "mms_refunds"]) {
      const sizes = requests.filter((r) => r.table === t).map((r) => r.ids.length);
      expect(sizes).toEqual([50, 50, 50, 50, 2]);
    }
    expect(got?.itemsByOrder.size).toBe(202);
    expect(got?.refundedLines.has("i-o201")).toBe(true);
    expect(got?.itemsByOrder.get("o201")).toEqual(["i-o201"]);
  });

  it("a failed leg is null, logged — never a partial ledger", async () => {
    // lck/refunded-cart-read/error-swallowed — red.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    tables.qr_order_items = [{ id: "i1", order_id: "o1" }];
    tables.mms_refunds = [{ order_id: "o1", order_item_id: "i1" }];
    for (const t of ["qr_order_items", "mms_refunds"]) {
      failTable = t;
      expect(await readLineRefunds(db(), [order("o1")], "test")).toBeNull();
    }
    failTable = null;
    throwTable = "mms_refunds";
    expect(await readLineRefunds(db(), [order("o1")], "test")).toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("a chunk that comes back AT the row cap cannot say it is whole: null, logged", async () => {
    // PostgREST's `max_rows` truncates SILENTLY: a missing line would make "every line refunded"
    // true of the lines that came back. lck/refunded-cart-read/saturation-unseen — red.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    tables.qr_order_items = Array.from({ length: LINE_REFUND_ROW_CAP + 5 }, (_, i) => ({
      id: `i${i}`,
      order_id: "o1",
    }));
    tables.mms_refunds = Array.from({ length: LINE_REFUND_ROW_CAP }, (_, i) => ({
      order_id: "o1",
      order_item_id: `i${i}`,
    }));
    expect(await readLineRefunds(db(), [order("o1")], "test")).toBeNull();
    expect(requests.every((r) => r.limit === LINE_REFUND_ROW_CAP)).toBe(true);
    spy.mockRestore();
  });
});
