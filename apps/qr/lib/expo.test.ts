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

// Phase 2f — the lane's unpaid read, answered per case.
const uq = vi.hoisted(() => ({ value: { ok: true, carts: [], truncated: false } as unknown }));
vi.mock("./register-queue", async (orig) => ({
  ...(await orig<typeof import("./register-queue")>()),
  readUnpaidCounterCarts: () => Promise.resolve(uq.value),
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
/** The `count: "exact"` the cart-lines read carries — more than the rows means PostgREST truncated. */
let cartLinesCount: number | null = null;
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
    then(resolve: (v: { data: unknown; error: unknown; count?: number | null }) => unknown) {
      const answer = (): { data: unknown; error: unknown; count?: number | null } => {
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
            ? { data: null, error: { message: "lines unreadable" }, count: null }
            : { data: cartLineRows, error: null, count: cartLinesCount ?? cartLineRows.length };
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
  uq.value = { ok: true, carts: [], truncated: false };
  cartLinesFail = false;
  cartLinesCount = null;
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
  it("a cart-lines read that came back SHORT of its own count is truncated — every bag reads unknown (Codex round 1)", async () => {
    // PostgREST caps a response at its max-rows and says nothing; a cart whose cooking row fell past
    // the cap would read `done` off its surviving served rows and be lifted as finished. The read
    // carries `count: "exact"` from the SAME statement, and a count above the rows is the truncation
    // — advisory, like a failed read: every bag `unknown`, the queue keeps its due order, logged.
    cartLineRows = [
      { cart_id: CART_A, state: "served", fulfillment: "togo" },
      { cart_id: CART_B, state: "fired", fulfillment: "togo" },
    ];
    cartLinesCount = 3;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await getExpoQueue();
    if (!res.ok) throw new Error("expected a queue");
    expect(res.queue.tickets.map((t) => [t.orderId, t.kitchen])).toEqual([
      [ORDER_B, "unknown"],
      [ORDER_A, "unknown"],
    ]);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("truncated"), expect.anything());
    spy.mockRestore();
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

// ── Phase 2f · P2v — the lane's unpaid bags ──────────────────────────────────────────────────────
describe("getExpoQueue — an open counter order with food in the kitchen is an UNPAID bag", () => {
  const item = (over: Row) => ({
    id: "i",
    name: "Mohinga",
    qty: 1,
    modifiers: [],
    modifier_option_ids: null,
    fulfillment: "togo",
    notes: null,
    menu_item_id: "dish-1",
    state: "draft",
    fire_at: null,
    bumped_at: null,
    comped: false,
    ...over,
  });
  const unpaidCart = (items: Row[]) => ({
    id: "cart-u",
    session_id: "sess-u",
    customer_name: "Aye",
    items,
  });

  it("one served + one draft: a bag of the SENT line, one more not sent, kitchen done", async () => {
    uq.value = {
      ok: true,
      truncated: false,
      carts: [
        unpaidCart([
          item({ id: "s", state: "served", fire_at: "2026-09-13T17:50:00.000Z" }),
          item({ id: "d", qty: 1 }),
        ]),
      ],
    };
    const res = await getExpoQueue();
    if (!res.ok) throw new Error("expected ok");
    expect(res.queue.unpaid).toEqual([
      {
        cartId: "cart-u",
        sessionId: "sess-u",
        customerName: "Aye",
        lines: [
          {
            id: "s",
            name: "Mohinga",
            nameMy: null,
            qty: 1,
            modifiers: [],
            modifiersMy: [],
            fulfillment: "togo",
            notes: null,
          },
        ],
        moreUnits: 1,
        kitchen: "done",
        sentAt: "2026-09-13T17:50:00.000Z",
      },
    ]);
  });

  it("a cart whose send is still inside its grace is not a bag yet", async () => {
    uq.value = {
      ok: true,
      truncated: false,
      carts: [unpaidCart([item({ state: "fired", fire_at: "2026-09-13T18:00:05.000Z" })])],
    };
    const res = await getExpoQueue();
    if (!res.ok) throw new Error("expected ok");
    expect(res.queue.unpaid).toEqual([]);
  });

  it("with no paid bags at all, the unpaid bags still reach the lane", async () => {
    orderRows = [];
    uq.value = {
      ok: true,
      truncated: false,
      carts: [unpaidCart([item({ state: "fired", fire_at: "2026-09-13T17:59:00.000Z" })])],
    };
    const res = await getExpoQueue();
    if (!res.ok) throw new Error("expected ok");
    expect(res.queue.tickets).toEqual([]);
    expect(res.queue.unpaid.map((b) => b.cartId)).toEqual(["cart-u"]);
  });

  it("an unreadable unpaid read is an OUTAGE of the lane, never an empty one", async () => {
    // unpaid-read-failure-renders-an-empty-lane
    uq.value = { ok: false };
    expect(await getExpoQueue()).toEqual({ ok: false, reason: "outage" });
  });

  it("a saturated unpaid read is an OUTAGE too — the newest bag would be the one hidden", async () => {
    // unpaid-read-saturation-ignored
    uq.value = { ok: true, carts: [], truncated: true };
    expect(await getExpoQueue()).toEqual({ ok: false, reason: "outage" });
  });

  it("every paid ticket carries its cart id (the bell keys a bag by its cart)", async () => {
    const res = await getExpoQueue();
    if (!res.ok) throw new Error("expected ok");
    expect(Object.fromEntries(res.queue.tickets.map((t) => [t.orderId, t.cartId]))).toEqual({
      [ORDER_A]: CART_A,
      [ORDER_B]: CART_B,
    });
  });
});
