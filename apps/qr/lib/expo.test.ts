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
const uq = vi.hoisted(() => ({
  value: { ok: true, carts: [], truncated: false } as unknown,
  /** When set, answers the read instead of `value` (the settlement-race fake below). */
  impl: null as null | (() => Promise<unknown>),
}));
vi.mock("./register-queue", async (orig) => ({
  ...(await orig<typeof import("./register-queue")>()),
  readUnpaidCounterCarts: () => (uq.impl ? uq.impl() : Promise.resolve(uq.value)),
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
/** When set, the orders read takes its snapshot here (the settlement-race fake). */
let ordersSnapshot: (() => Row[]) | null = null;
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
        if (name === "qr_orders") {
          if (ordersSnapshot) orderRows = ordersSnapshot();
          return { data: orderRows, error: null };
        }
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
  uq.impl = null;
  ordersSnapshot = null;
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
        doneAt: null,
        sentAt: "2026-09-13T17:50:00.000Z",
      },
    ]);
  });

  it("a finished unpaid bag carries its finish — the latest bump (the bell's key, review PT3)", async () => {
    uq.value = {
      ok: true,
      truncated: false,
      carts: [
        unpaidCart([
          item({
            id: "a",
            state: "served",
            fire_at: "2026-09-13T17:40:00.000Z",
            bumped_at: "2026-09-13T17:52:00.000Z",
          }),
          item({
            id: "b",
            state: "served",
            fire_at: "2026-09-13T17:41:00.000Z",
            bumped_at: "2026-09-13T17:55:00.000Z",
          }),
        ]),
      ],
    };
    const res = await getExpoQueue();
    if (!res.ok) throw new Error("expected ok");
    expect(res.queue.unpaid[0]?.doneAt).toBe("2026-09-13T17:55:00.000Z");
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

  it("a saturated unpaid read degrades ONLY the unpaid section — the paid bags keep rendering (review M1)", async () => {
    // p2f-rev-lib/expo/unpaid-saturation-blanks-the-lane — stale unpaid carts are exempt from the
    // sweep, so 40 of them used to turn the WHOLE lane into an outage: paid bags vanished from the
    // counter over orders nobody collected.
    uq.value = {
      ok: true,
      truncated: true,
      carts: [unpaidCart([item({ state: "fired", fire_at: "2026-09-13T17:59:00.000Z" })])],
    };
    const res = await getExpoQueue();
    if (!res.ok) throw new Error("expected the paid lane to keep rendering");
    expect(res.queue.tickets.map((t) => t.orderId).sort()).toEqual([ORDER_A, ORDER_B].sort());
    expect(res.queue.unpaid.map((b) => b.cartId)).toEqual(["cart-u"]);
    // unpaid-read-saturation-ignored — and the lane is TOLD the unpaid list is not the whole list
    expect(res.queue.unpaidTruncated).toBe(true);
  });

  it("an unsaturated unpaid read says the unpaid list is whole", async () => {
    const res = await getExpoQueue();
    if (!res.ok) throw new Error("expected ok");
    expect(res.queue.unpaidTruncated).toBe(false);
  });

  it("a paid bag the kitchen finished carries its finish off the cart lines; a cooking one none", async () => {
    // p2f-rev-lib/expo/paid-bag-done-unstamped — the paid counter bag must carry the SAME stamp
    // its unpaid bag did, or payment re-rings the bell (or a later finish never does).
    cartLineRows = [
      { cart_id: CART_A, state: "served", fulfillment: "togo", bumped_at: "2026-09-13T17:45:00Z" },
      { cart_id: CART_B, state: "fired", fulfillment: "togo", bumped_at: null },
    ];
    const res = await getExpoQueue();
    if (!res.ok) throw new Error("expected ok");
    const byId = Object.fromEntries(res.queue.tickets.map((t) => [t.orderId, t.doneAt]));
    expect(byId).toEqual({ [ORDER_A]: "2026-09-13T17:45:00Z", [ORDER_B]: null });
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

// ── Codex round 1 on #308 — settlement between the two lane reads ────────────────────────────────
/**
 * A fake DB in which ONE counter order settles between the lane's two snapshots: whichever read
 * snapshots first sees the cart open (unpaid) and no paid order; whichever snapshots second sees it
 * settled (no longer open; its paid order present). Each read snapshots when its statement RUNS.
 * The unpaid read here runs a macrotask after it is issued — so a paid read issued while it is still
 * in flight (the concurrent shape) snapshots FIRST, the adversary's order; a paid read issued after
 * it resolved (the serial shape) snapshots second.
 */
describe("getExpoQueue — a bag settled between the two reads is drawn once, as paid (Codex r1 on #308)", () => {
  const CART_U = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const ORDER_U = "33333333-3333-4333-8333-333333333333";
  const openCart = {
    id: CART_U,
    session_id: "sess-u",
    customer_name: "Aye",
    items: [
      {
        id: "s",
        name: "Mohinga",
        qty: 1,
        modifiers: [],
        modifier_option_ids: null,
        fulfillment: "togo",
        notes: null,
        menu_item_id: "dish-1",
        state: "fired",
        fire_at: "2026-09-13T17:50:00.000Z",
        bumped_at: null,
        comped: false,
      },
    ],
  };
  let settled = false;
  const snapshot = (): boolean => {
    const was = settled;
    settled = true; // the settlement commits right after the FIRST snapshot, whichever it is
    return was;
  };
  beforeEach(() => {
    settled = false;
    ordersSnapshot = () => (snapshot() ? [order(ORDER_U, CART_U, "2026-09-13T17:58:00Z")] : []);
  });

  it("unpaid read first, then the paid read: one bag, PAID — never once each way", async () => {
    // p2f-cx1-lane/lane-settled-bag-twice
    uq.impl = () =>
      Promise.resolve({ ok: true, truncated: false, carts: snapshot() ? [] : [openCart] });
    const res = await getExpoQueue();
    if (!res.ok) throw new Error("expected ok");
    expect(res.queue.tickets.map((t) => t.cartId)).toEqual([CART_U]);
    expect(res.queue.unpaid).toEqual([]);
  });

  it("the paid read is not issued until the unpaid read has answered: the bag never vanishes", async () => {
    // p2f-cx1-lane/lane-reads-concurrent — issued together, the paid snapshot can come first: the
    // bag is settled for the unpaid read and not yet paid for the paid one, and is in NEITHER list.
    uq.impl = () =>
      new Promise((resolve) =>
        setTimeout(
          () => resolve({ ok: true, truncated: false, carts: snapshot() ? [] : [openCart] }),
          0,
        ),
      );
    const res = await getExpoQueue();
    if (!res.ok) throw new Error("expected ok");
    const where = [
      ...res.queue.tickets.map((t) => `paid:${t.cartId}`),
      ...res.queue.unpaid.map((b) => `unpaid:${b.cartId}`),
    ];
    expect(where).toEqual([`paid:${CART_U}`]);
  });
});
