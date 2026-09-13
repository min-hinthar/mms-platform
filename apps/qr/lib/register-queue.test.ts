import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readRegisterQueue, REG_PREFIX, REGISTER_QUEUE_CAP } from "./register-queue";

/**
 * A4·2 — the counter queue read, asserted as a QUERY (every predicate recorded) and by value.
 * A pass-through fake answers the fixture whatever the query said, so each predicate that keeps a
 * settled or a dine-in cart out of the queue is asserted on the recorded chain.
 */
type Rec = {
  table: string;
  cols: string;
  eqs: [string, unknown][];
  ors: [string, unknown][];
  order: [string, { ascending?: boolean } | undefined] | null;
  limit: number | null;
};
let rec: Rec | null = null;
let rows: Record<string, unknown>[] = [];
let fail = false;

function fakeDb() {
  return {
    from(table: string) {
      const r: Rec = { table, cols: "", eqs: [], ors: [], order: null, limit: null };
      rec = r;
      const api = {
        select(cols: string) {
          r.cols = cols;
          return api;
        },
        eq(col: string, val: unknown) {
          r.eqs.push([col, val]);
          return api;
        },
        or(expr: string, opts?: unknown) {
          r.ors.push([expr, opts]);
          return api;
        },
        order(col: string, opts?: { ascending?: boolean }) {
          r.order = [col, opts];
          return api;
        },
        limit(n: number) {
          r.limit = n;
          return api;
        },
        then(res: (v: { data: unknown; error: unknown }) => unknown) {
          return Promise.resolve(
            fail ? { data: null, error: { message: "boom" } } : { data: rows, error: null },
          ).then(res);
        },
      };
      return api;
    },
  } as unknown as Parameters<typeof readRegisterQueue>[0];
}

const cart = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "cart-1",
  session_id: "sess-1",
  customer_name: "Aye",
  created_at: "2026-09-13T18:00:00Z",
  qr_cart_items: [
    { qty: 2, unit_price_cents: 600, state: "draft", comped: false },
    { qty: 1, unit_price_cents: 900, state: "voided", comped: false },
    { qty: 1, unit_price_cents: 500, state: "draft", comped: true },
  ],
  table_sessions: { qr_code: "reg-ABCD", mode: "pickup", status: "active" },
  ...over,
});

beforeEach(() => {
  rec = null;
  rows = [cart()];
  fail = false;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("readRegisterQueue — the open counter orders, oldest first", () => {
  it("reads OPEN carts on ACTIVE pickup sessions carrying a counter code, oldest first, capped", async () => {
    const res = await readRegisterQueue(fakeDb());
    expect(res.ok).toBe(true);
    expect(rec?.table).toBe("qr_carts");
    // MUTATION: drop the open guard → settled-but-unexpired orders fill the queue in a rush.
    expect(rec?.eqs).toContainEqual(["status", "open"]);
    expect(rec?.eqs).toContainEqual(["table_sessions.mode", "pickup"]);
    expect(rec?.eqs).toContainEqual(["table_sessions.status", "active"]);
    // MUTATION: drop the kiosk prefix → self-minted counter orders vanish from the counter.
    expect(rec?.ors).toEqual([
      [`qr_code.like.${REG_PREFIX}%,qr_code.like.kiosk-%`, { referencedTable: "table_sessions" }],
    ]);
    expect(rec?.order).toEqual(["created_at", { ascending: true }]);
    expect(rec?.limit).toBe(REGISTER_QUEUE_CAP);
    expect(rec?.cols).toContain("table_sessions!inner(");
  });
  it("counts and totals the LIVE lines only — voided and comped lines are off the card", async () => {
    const res = await readRegisterQueue(fakeDb());
    if (!res.ok) throw new Error("expected ok");
    expect(res.rows).toEqual([
      {
        sessionId: "sess-1",
        source: "register",
        customerName: "Aye",
        itemCount: 2,
        subtotalCents: 1200,
        startedAt: "2026-09-13T18:00:00Z",
      },
    ]);
    expect(res.truncated).toBe(false);
  });
  it("badges a kiosk-minted session by its code", async () => {
    rows = [cart({ table_sessions: { qr_code: "kiosk-Z9", mode: "pickup", status: "active" } })];
    const res = await readRegisterQueue(fakeDb());
    if (!res.ok) throw new Error("expected ok");
    expect(res.rows[0]?.source).toBe("kiosk");
  });
  it("a full page is REPORTED as truncated, never passed off as the whole queue", async () => {
    rows = Array.from({ length: REGISTER_QUEUE_CAP }, (_, i) =>
      cart({ id: `cart-${i}`, session_id: `sess-${i}` }),
    );
    const res = await readRegisterQueue(fakeDb());
    if (!res.ok) throw new Error("expected ok");
    expect(res.truncated).toBe(true);
    expect(console.warn).toHaveBeenCalled();
  });
  it("a failed read is an outage, never an empty queue", async () => {
    fail = true;
    expect(await readRegisterQueue(fakeDb())).toEqual({ ok: false, reason: "outage" });
  });
});
