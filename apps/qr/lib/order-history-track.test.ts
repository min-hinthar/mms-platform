import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Lifecycle audit (2026-10-13), E — /account's history gave a pickup still to collect only "Order
 * again": once the pill forgot it and its session lapsed, the guest at the counter had no in-app way
 * back to the claim ticket and "I’m here". `getOrderHistory` now carries `trackHref` for exactly that
 * row (`uncollectedPickupHref`, pinned by value in lib/live-order.test.ts); this pins the wiring —
 * the read selects the columns the link needs and hands the link to the card.
 */
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: () => Promise.resolve({}) }));

let cols = "";
let orders: Record<string, unknown>[] = [];
function chain(table: string): unknown {
  const api: Record<string, unknown> = {};
  for (const m of ["eq", "in", "or", "order", "limit", "gte"]) api[m] = () => api;
  api.select = (c: string) => {
    if (table === "qr_orders") cols = c;
    return api;
  };
  api.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve({ data: table === "qr_orders" ? orders : [], error: null }).then(res, rej);
  return api;
}
vi.mock("@mms/db/server", () => ({
  serverClient: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "uid-1" } } }) },
  }),
  serviceClient: () => ({ from: chain }),
}));

const { getOrderHistory } = await import("./rewards");

const NOW = Date.parse("2026-10-13T21:00:00.000Z"); // 2 PM in Covina
function row(over: Record<string, unknown>) {
  return {
    id: "aaaaaaaa-0000-4000-8000-000000000001",
    created_at: "2026-10-13T18:00:00.000Z",
    total_cents: 2400,
    refunded_cents: 0,
    dropped_lines: [],
    status: "paid",
    tender: "card",
    pickup_slot: "2026-10-14T01:20:00.000Z",
    table_number: null,
    subtotal_cents: 2200,
    discount_cents: 0,
    service_charge_cents: 0,
    tax_cents: 200,
    tip_cents: 0,
    togo_status: "preparing",
    stripe_payment_intent_id: "pi_1",
    cart_id: "c1",
    ...over,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  cols = "";
  orders = [];
});

describe("getOrderHistory — a pickup still to collect keeps its way back to /track", () => {
  it("links tonight's uncollected pickup to its resume URL, and selects what the link needs", async () => {
    orders = [row({})];
    const h = await getOrderHistory();
    // RED when the read stops carrying the link: the row offers only "Order again".
    expect(h?.[0]?.trackHref).toBe(
      "/track?payment_intent=pi_1&redirect_status=succeeded&resume=1&cart=c1",
    );
    for (const c of ["togo_status", "stripe_payment_intent_id", "cart_id"])
      expect(cols).toContain(c);
  });

  it("gives a collected pickup, or a past order, no tracker link — they are receipts", async () => {
    orders = [
      row({ togo_status: "picked_up" }),
      row({ id: "aaaaaaaa-0000-4000-8000-000000000002", pickup_slot: null }),
    ];
    const h = await getOrderHistory();
    expect(h?.map((e) => e.trackHref)).toEqual([null, null]);
  });
});
