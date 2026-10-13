import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Lifecycle audit (2026-10-13), E — a pickup booked hours (or a day) ahead must not vanish from the
 * tray and /account "Today" before its slot. Its session lapses 2–4 h after payment; /track reaches
 * the order through the uid-scoped fallback regardless. So `readMyLiveOrders` reads a second,
 * SLOT-windowed set (today or later, whenever booked) and lets a pickup still to collect stand without
 * a live session — while every other kind keeps the gate (a dine-in's session closing is its end).
 *
 * The mock routes each `qr_orders` read by the window it asks for (`created_at` vs `pickup_slot`), so
 * dropping the slot read — or the exemption — loses the pickup and turns these red.
 */
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: () => Promise.resolve({}) }));

type Row = Record<string, unknown>;
let recent: Row[] = [];
let bySlot: Row[] = [];
let liveSessionIds: string[] = [];
const gtes: [string, string][] = [];

function chain(table: string): unknown {
  let window: string | null = null;
  const api: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gt", "neq", "in", "or", "order", "limit"]) api[m] = () => api;
  api.gte = (c: string, v: string) => {
    gtes.push([c, v]);
    if (table === "qr_orders") window = c;
    return api;
  };
  api.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
    const data =
      table === "qr_orders"
        ? window === "pickup_slot"
          ? bySlot
          : recent
        : table === "table_sessions"
          ? liveSessionIds.map((id) => ({ id }))
          : [];
    return Promise.resolve({ data, error: null }).then(res, rej);
  };
  return api;
}

vi.mock("@mms/db/server", () => ({
  serverClient: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "uid-1" } }, error: null }) },
  }),
  serviceClient: () => ({ from: chain }),
}));

const { readMyLiveOrders } = await import("./orders");

// 2026-10-13 2:00 PM in Covina (PDT): the restaurant's today began at 07:00Z.
const NOW = Date.parse("2026-10-13T21:00:00.000Z");
const TONIGHT = "2026-10-14T01:20:00.000Z"; // 6:20 PM
function order(over: Row): Row {
  return {
    id: "o",
    togo_status: "preparing",
    table_number: null,
    pickup_slot: null,
    fire_at: null,
    created_at: "2026-10-13T18:00:00.000Z",
    arrived_at: null,
    session_id: "s-lapsed",
    stripe_payment_intent_id: "pi_1",
    cart_id: "c1",
    total_cents: 2400,
    refunded_cents: 0,
    qr_order_items: [{ fulfillment: "togo" }],
    ...over,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  recent = [];
  bySlot = [];
  liveSessionIds = [];
  gtes.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("readMyLiveOrders — a pickup still to collect outlives its session", () => {
  it("keeps tonight's pickup whose session lapsed (it was booked this morning)", async () => {
    const pickup = order({ id: "p1", pickup_slot: TONIGHT, fire_at: "2026-10-14T01:00:00.000Z" });
    recent = [pickup];
    const r = await readMyLiveOrders();
    expect(r.ok).toBe(true);
    // RED when the exemption is dropped: the session gate removes it.
    expect(r.orders.map((o) => [o.id, o.kind, o.statusWord])).toEqual([
      ["p1", "pickup", "Scheduled"],
    ]);
    // The held pickup's fire time reaches the client: J's re-poll gate reads it (RED as `null`, which
    // would count a held pickup as fired and poll for a day).
    expect(r.orders[0]?.fireAt).toBe("2026-10-14T01:00:00.000Z");
  });

  it("finds a pickup booked YESTERDAY for today through the slot-windowed read", async () => {
    // Older than the 12 h window, so only the slot read can see it. RED when that read is gone.
    bySlot = [order({ id: "p2", pickup_slot: TONIGHT, created_at: "2026-10-12T20:00:00.000Z" })];
    const r = await readMyLiveOrders();
    expect(r.orders.map((o) => o.id)).toEqual(["p2"]);
    expect(gtes).toContainEqual(["pickup_slot", "2026-10-13T07:00:00.000Z"]);
  });

  it("dedupes an order both reads return", async () => {
    const pickup = order({ id: "p1", pickup_slot: TONIGHT });
    recent = [pickup];
    bySlot = [pickup];
    const r = await readMyLiveOrders();
    expect(r.orders.map((o) => o.id)).toEqual(["p1"]);
  });

  it("still drops a to-go or dine-in order whose session lapsed, and a collected pickup", async () => {
    recent = [
      order({ id: "togo" }),
      order({ id: "dine", qr_order_items: [{ fulfillment: "dinein" }], togo_status: null }),
      order({ id: "done", pickup_slot: TONIGHT, togo_status: "picked_up" }),
    ];
    const r = await readMyLiveOrders();
    expect(r.orders).toEqual([]);
  });

  it("drops a pickup whose money is ALL back though status still reads 'paid' (a cash refund)", async () => {
    // RED without the refund-state check: E keeps it without its session until the slot's day ends.
    recent = [
      order({ id: "gone", pickup_slot: TONIGHT, refunded_cents: 2400 }),
      order({ id: "part", pickup_slot: TONIGHT, refunded_cents: 400 }),
    ];
    const r = await readMyLiveOrders();
    expect(r.orders.map((o) => o.id)).toEqual(["part"]);
  });

  it("keeps the gate for a pickup whose slot was YESTERDAY", async () => {
    recent = [order({ id: "old", pickup_slot: "2026-10-13T01:20:00.000Z" })];
    const r = await readMyLiveOrders();
    expect(r.orders).toEqual([]);
  });

  it("a live session still admits every kind, as before", async () => {
    recent = [order({ id: "togo", session_id: "s-live" })];
    liveSessionIds = ["s-live"];
    const r = await readMyLiveOrders();
    expect(r.orders.map((o) => o.id)).toEqual(["togo"]);
  });
});
