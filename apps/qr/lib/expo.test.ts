import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A4·2 · K30 (B) — `getExpoQueue`'s WIRING of the kitchen state: the cart-lines read is by the
 * tickets' carts, its failure is advisory (the counter keeps its bags and its order), and the state
 * lands on the ticket and in the lane's order. The rules themselves are pinned by value in
 * `expo-rules.test.ts`; this suite proves the read reaches them.
 */
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("./posthog-server", () => ({ getPostHogClient: () => ({ capture() {}, flush() {} }) }));
vi.mock("./staff", () => ({
  getStaffAuth: () =>
    Promise.resolve({ kind: "staff", uid: "u-1", staffId: "s-1", role: "server" }),
  staffGate: () =>
    Promise.resolve({ ok: true, caller: { uid: "u-1", staffId: "s-1", role: "server" } }),
}));
vi.mock("./staff-lock", () => ({ isConsoleLocked: () => Promise.resolve(false) }));
vi.mock("./line-names", () => ({
  loadLineNames: () => Promise.resolve({ nameMyByRef: new Map(), optionNameMy: new Map() }),
}));

const NOW = "2026-09-13T18:00:00.000Z";
const CART_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CART_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ORDER_A = "11111111-1111-4111-8111-111111111111";
const ORDER_B = "22222222-2222-4222-8222-222222222222";

type Row = Record<string, unknown>;
type Rec = { table: string; ins: [string, unknown[]][] };
let recs: Rec[] = [];
let cartLinesFail = false;
let orderRows: Row[] = [];
let cartLineRows: Row[] = [];

function tableApi(name: string) {
  const r: Rec = { table: name, ins: [] };
  recs.push(r);
  const api: Record<string, unknown> = {
    select: () => api,
    eq: () => api,
    or: () => api,
    order: () => api,
    limit: () => api,
    in(col: string, vals: unknown[]) {
      r.ins.push([col, vals]);
      return api;
    },
    then(resolve: (v: { data: unknown; error: unknown }) => unknown) {
      const answer = (): { data: unknown; error: unknown } => {
        if (name === "qr_orders") return { data: orderRows, error: null };
        if (name === "qr_order_items")
          return {
            data: orderRows.map((o) => ({
              id: `line-${o.id}`,
              order_id: o.id,
              name: "Mohinga",
              qty: 1,
              modifiers: [],
              modifier_option_ids: [],
              fulfillment: "togo",
              notes: null,
              menu_item_id: "dish-1",
            })),
            error: null,
          };
        if (name === "qr_carts")
          return {
            data: [
              { id: CART_A, customer_phone: null },
              { id: CART_B, customer_phone: null },
            ],
            error: null,
          };
        if (name === "qr_cart_items")
          return cartLinesFail
            ? { data: null, error: { message: "lines unreadable" } }
            : { data: cartLineRows, error: null };
        return { data: [], error: null };
      };
      return Promise.resolve(answer()).then(resolve);
    },
  };
  return api;
}
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (name: string) => tableApi(name),
    rpc: () => Promise.resolve({ data: NOW, error: null }),
  }),
}));

const { getExpoQueue } = await import("./expo");

const order = (id: string, cartId: string | null, createdAt: string): Row => ({
  id,
  togo_status: "preparing",
  session_id: null,
  table_number: null,
  pickup_slot: null,
  arrived_at: null,
  created_at: createdAt,
  customer_name: null,
  cart_id: cartId,
});

beforeEach(() => {
  recs = [];
  cartLinesFail = false;
  // B is due EARLIER than A; only the kitchen state can put A first.
  orderRows = [
    order(ORDER_A, CART_A, "2026-09-13T17:30:00Z"),
    order(ORDER_B, CART_B, "2026-09-13T17:00:00Z"),
  ];
  cartLineRows = [
    { cart_id: CART_A, state: "served", fulfillment: "togo" },
    { cart_id: CART_B, state: "fired", fulfillment: "togo" },
  ];
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("getExpoQueue — the kitchen state reaches the bags (K30 B)", () => {
  it("reads the tickets' cart lines by cart id and lifts a finished bag above one still cooking", async () => {
    const res = await getExpoQueue();
    if (!res.ok) throw new Error("expected ok");
    const lines = recs.find((r) => r.table === "qr_cart_items");
    expect(lines?.ins).toEqual([["cart_id", [CART_A, CART_B]]]);
    expect(res.queue.tickets.map((t) => [t.orderId, t.kitchen])).toEqual([
      [ORDER_A, "done"],
      [ORDER_B, "cooking"],
    ]);
  });
  it("a failed cart-lines read is ADVISORY: every bag reads unknown, the queue keeps its due order", async () => {
    // MUTATION: refuse the counter (`outage`) on the failed read → the whole lane freezes over a
    // badge, the over-blocking direction.
    cartLinesFail = true;
    const res = await getExpoQueue();
    if (!res.ok) throw new Error("expected ok — the badge is advisory");
    expect(res.queue.tickets.map((t) => [t.orderId, t.kitchen])).toEqual([
      [ORDER_B, "unknown"],
      [ORDER_A, "unknown"],
    ]);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("kitchen-state read failed"),
      expect.anything(),
    );
  });
  it("an order with no cart (or a cart whose lines are absent) reads unknown, never done", async () => {
    orderRows = [
      order(ORDER_A, null, "2026-09-13T17:30:00Z"),
      order(ORDER_B, CART_B, "2026-09-13T17:00:00Z"),
    ];
    cartLineRows = [];
    const res = await getExpoQueue();
    if (!res.ok) throw new Error("expected ok");
    expect(res.queue.tickets.map((t) => t.kitchen)).toEqual(["unknown", "unknown"]);
  });
});
