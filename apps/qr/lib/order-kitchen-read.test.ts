import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Lifecycle audit (2026-10-13) — the post-order kitchen read's AUTHORIZATION is the diner's own RLS.
 * Both data reads must go through the caller's cookie client (`serverClient`), where `qr_order_read`
 * and `qr_citem_read` (`is_member`) decide; the service client may answer ONLY the clock. The mock
 * keeps two separate ledgers, one per client, so a read moved onto the service client (which bypasses
 * RLS: any signed-in visitor could read any order's lines by guessing its id) turns these red.
 *
 * The RLS client is modelled the way RLS behaves: a non-member is not refused, they simply see NO
 * row. A failed read is an ERROR, never an empty kitchen (W10a).
 */
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: () => Promise.resolve({}) }));

type Ledger = { table: string; eq: [string, unknown][] }[];
const rls: Ledger = [];
const service: Ledger = [];
const calls: string[] = [];
let member = true;
let user: { id: string } | null = { id: "uid-1" };
let authErr: unknown = null;
let failing: "order" | "lines" | null = null;
let clock: { data: unknown; error: unknown } = { data: "2026-10-13T19:00:00.000Z", error: null };

const ORDER = "11111111-1111-4111-8111-111111111111";
const CART = "22222222-2222-4222-8222-222222222222";
const LINES = [
  {
    id: "l1",
    name: "Mohinga",
    qty: 2,
    state: "in_progress",
    fire_at: "2026-10-13T18:50:00.000Z",
    bumped_at: null,
    fulfillment: "dinein",
    created_at: "2026-10-13T18:40:00.000Z",
  },
];

function client(ledger: Ledger, enforcesRls: boolean) {
  return (table: string) => {
    const q = { table, eq: [] as [string, unknown][] };
    ledger.push(q);
    const visible = !enforcesRls || member;
    const api = {
      select: () => api,
      eq: (c: string, v: unknown) => (q.eq.push([c, v]), api),
      order: () => {
        calls.push(`lines:${table}`);
        return Promise.resolve(
          failing === "lines"
            ? { data: null, error: { message: "boom" } }
            : { data: visible ? LINES : [], error: null },
        );
      },
      maybeSingle: () => {
        calls.push(`order:${table}`);
        return Promise.resolve(
          failing === "order"
            ? { data: null, error: { message: "boom" } }
            : { data: visible ? { cart_id: CART } : null, error: null },
        );
      },
    };
    return api;
  };
}

vi.mock("@mms/db/server", () => ({
  serverClient: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user }, error: authErr }) },
    from: client(rls, true),
  }),
  serviceClient: () => ({
    from: client(service, false),
    rpc: (fn: string) => {
      calls.push(`rpc:${fn}`);
      return Promise.resolve(clock);
    },
  }),
}));

const { getOrderKitchen } = await import("./order-kitchen-read");

beforeEach(() => {
  rls.length = 0;
  service.length = 0;
  calls.length = 0;
  member = true;
  user = { id: "uid-1" };
  authErr = null;
  failing = null;
  clock = { data: "2026-10-13T19:00:00.000Z", error: null };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("getOrderKitchen — the diner's own RLS is the whole authorization", () => {
  it("reads the order's cart and its lines through the CALLER's client, never the service one", async () => {
    const r = await getOrderKitchen({ orderId: ORDER });
    expect(r).toEqual({
      ok: true,
      cartId: CART,
      dbNow: "2026-10-13T19:00:00.000Z",
      lines: [
        {
          id: "l1",
          name: "Mohinga",
          qty: 2,
          lineState: "in_progress",
          fireAt: "2026-10-13T18:50:00.000Z",
          bumpedAt: null,
          fulfillment: "dinein",
        },
      ],
    });
    expect(rls.map((q) => q.table)).toEqual(["qr_orders", "qr_cart_items"]);
    expect(rls[0]?.eq).toContainEqual(["id", ORDER]);
    expect(rls[1]?.eq).toContainEqual(["cart_id", CART]);
    // RED when either read moves onto the service client (RLS bypassed).
    expect(service).toEqual([]);
  });

  it("a NON-member (or a member whose session closed) is unreadable — no lines, whatever the id", async () => {
    member = false;
    await expect(getOrderKitchen({ orderId: ORDER })).resolves.toEqual({
      ok: false,
      reason: "unreadable",
    });
  });

  it("reads the DB clock BEFORE the lines (a later clock could read Served over an Undo)", async () => {
    await getOrderKitchen({ orderId: ORDER });
    expect(calls.indexOf("rpc:mms_now")).toBeGreaterThan(-1);
    expect(calls.indexOf("rpc:mms_now")).toBeLessThan(calls.indexOf("lines:qr_cart_items"));
  });

  it("falls back to the app clock, logged, when the DB clock is unreadable", async () => {
    clock = { data: null, error: { message: "boom" } };
    const r = await getOrderKitchen({ orderId: ORDER });
    expect(r.ok).toBe(true);
    expect(r.ok && Number.isFinite(Date.parse(r.dbNow))).toBe(true);
  });

  it("a FAILED line read is an error, never an empty kitchen", async () => {
    failing = "lines";
    await expect(getOrderKitchen({ orderId: ORDER })).resolves.toEqual({
      ok: false,
      reason: "error",
    });
  });

  it("a FAILED order read is an error, never 'not yours'", async () => {
    failing = "order";
    await expect(getOrderKitchen({ orderId: ORDER })).resolves.toEqual({
      ok: false,
      reason: "error",
    });
  });

  it("an auth TRANSPORT failure is an error; no session is unreadable; junk never reaches a read", async () => {
    authErr = Object.assign(new Error("fetch failed"), { name: "AuthRetryableFetchError" });
    user = null;
    await expect(getOrderKitchen({ orderId: ORDER })).resolves.toEqual({
      ok: false,
      reason: "error",
    });
    authErr = null;
    await expect(getOrderKitchen({ orderId: ORDER })).resolves.toEqual({
      ok: false,
      reason: "unreadable",
    });
    user = { id: "uid-1" };
    rls.length = 0;
    await expect(getOrderKitchen({ orderId: "not-a-uuid" })).resolves.toEqual({
      ok: false,
      reason: "unreadable",
    });
    expect(rls).toEqual([]);
  });
});
