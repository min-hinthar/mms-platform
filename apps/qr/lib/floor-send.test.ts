import { beforeEach, describe, expect, it, vi } from "vitest";
/**
 * Phase 2a · send — `getTableDetail` carries what the table page's Send needs: the ONE send count
 * (`staffSendCounts`, so the Send's "3 items", the add page's "3 not sent" and the diner's Pay gate
 * agree), whether a diner host runs the table, and per line whether the Send fires it.
 *
 * The fake reads the rows the real query would return, including `fulfillment` — a select that
 * dropped the column would hand every line `fulfillment: undefined`, so no line would be sendable
 * and the counts would read 0. Each case is the one a `floor/*` send mutant in
 * `scripts/verify-slice.mjs` turns red.
 */
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("./posthog-server", () => ({
  getPostHogClient: () => ({ capture() {}, flush: () => Promise.resolve() }),
}));
vi.mock("./authz", () => ({ AuthzError: class AuthzError extends Error {} }));
vi.mock("./staff", () => ({
  getStaffAuth: () =>
    Promise.resolve({
      kind: "staff",
      caller: { uid: "u", staffId: "st", role: "server", displayName: "S", email: null },
    }),
  requireStaff: () => Promise.resolve({}),
  staffGate: () => Promise.resolve({ ok: true, caller: {} }),
  STAFF_WRITE_OUTAGE: "outage",
}));
vi.mock("./pay-guard", () => ({
  isFresh: () => false,
  paymentInFlightReason: () => Promise.resolve(null),
}));
vi.mock("@mms/db/schemas", () => ({
  clearTableInput: { safeParse: (x: unknown) => ({ success: true, data: x }) },
  mergeTablesInput: { safeParse: (x: unknown) => ({ success: true, data: x }) },
}));
vi.mock("./totals", () => ({
  getCartTotals: () =>
    Promise.resolve({
      subtotalCents: 5000,
      discountCents: 0,
      rewardCents: 0,
      rewardFaceCents: 0,
      promoCents: 0,
      serviceChargeCents: 0,
      taxCents: 330,
      tipCents: 0,
      totalCents: 5330,
    }),
}));

type Row = Record<string, unknown>;
const SESSION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
let hostSeat: string | null = null;
let mode = "dinein";
let cartRow: Row | null = null;
let cartItemRows: Row[] = [];
let orderRows: Row[] = [];
let orderItemRows: Row[] = [];
// The columns the fake was asked for, per table — a row only carries the columns the query SELECTED,
// like PostgREST, so dropping `fulfillment` from the select is visible as an undefined field.
let lastItemsSelect = "";

function pick(row: Row, cols: string): Row {
  const out: Row = {};
  for (const c of cols.split(",").map((s) => s.trim())) if (c in row) out[c] = row[c];
  return out;
}

function tableApi(name: string) {
  let cols = "*";
  const eqs: [string, unknown][] = [];
  const api: Record<string, unknown> = {
    select(c: string) {
      cols = c;
      if (name === "qr_cart_items") lastItemsSelect = c;
      return api;
    },
    eq(col: string, val: unknown) {
      eqs.push([col, val]);
      return api;
    },
    in() {
      return api;
    },
    order() {
      return api;
    },
    limit() {
      return api;
    },
    gt() {
      return api;
    },
    not() {
      return api;
    },
    or() {
      return api;
    },
    is() {
      return api;
    },
    maybeSingle() {
      if (name === "table_sessions")
        return Promise.resolve({
          data: {
            id: SESSION,
            qr_code: "t-7",
            table_number: 7,
            mode,
            status: "active",
            host_seat: hostSeat,
            created_at: "2026-09-09T00:00:00.000Z",
          },
          error: null,
        });
      if (name === "qr_carts") return Promise.resolve({ data: cartRow, error: null });
      return Promise.resolve({ data: null, error: null });
    },
    then(resolve: (r: { data: Row[] | null; error: unknown }) => void) {
      if (name === "qr_cart_items")
        return resolve({ data: cartItemRows.map((r) => pick(r, cols)), error: null });
      if (name === "qr_orders") return resolve({ data: orderRows, error: null });
      if (name === "qr_order_items") return resolve({ data: orderItemRows, error: null });
      if (name === "session_members")
        return resolve({
          data: hostSeat ? [{ seat_id: hostSeat, display_name: "Aye", role: "host" }] : [],
          error: null,
        });
      resolve({ data: [], error: null });
    },
  };
  return api;
}
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (name: string) => tableApi(name),
    rpc: () => Promise.resolve({ data: null, error: null }),
  }),
}));

const { getTableDetail } = await import("./floor");

const line = (over: Row): Row => ({
  id: "l",
  name: "Mohinga",
  qty: 1,
  unit_price_cents: 1200,
  by_seat: null,
  created_at: "2026-09-09T00:01:00.000Z",
  menu_item_id: null,
  state: "draft",
  comped: false,
  notes: null,
  modifiers: [],
  fulfillment: "dinein",
  ...over,
});

// 2× a staff-added dine-in draft · 1× a diner's dine-in draft · 1× a staff-added TO-GO draft ·
// 3× already fired. Sendable 3, staff-added 2 — and a to-go line that must NOT count.
const MIXED = () => [
  line({ id: "a", qty: 2 }),
  line({ id: "b", qty: 1, by_seat: "s1" }),
  line({ id: "c", qty: 1, fulfillment: "togo" }),
  line({ id: "d", qty: 3, by_seat: "s1", state: "fired" }),
];

async function detail() {
  const r = await getTableDetail(SESSION);
  if (r.kind !== "detail") throw new Error(`expected a detail, got ${r.kind}`);
  return r.detail;
}

beforeEach(() => {
  hostSeat = null;
  mode = "dinein";
  cartRow = {
    id: "cart-1",
    locked: false,
    locked_at: null,
    settle_at: null,
    counter_requested_at: null,
    tab_type: "none",
    tab_opened_at: null,
    intended_tip_cents: null,
    promo_code: null,
  };
  cartItemRows = MIXED();
  orderRows = [];
  orderItemRows = [];
  lastItemsSelect = "";
});

describe("getTableDetail — the Send's one count", () => {
  it("counts the dine-in drafts the Send fires (3), and the staff-added ones among them (2)", async () => {
    const d = await detail();
    expect(d.send).toEqual({
      sendable: 3,
      staffAdded: 2,
      togoDraft: 1,
      inKitchen: true,
      foodDraft: true,
    });
    // The column the count rests on is actually READ.
    expect(lastItemsSelect.split(",")).toContain("fulfillment");
  });

  it("tags per line: only a dine-in DRAFT is sendable — never to-go, never fired", async () => {
    const d = await detail();
    const by = Object.fromEntries(d.lines.map((l) => [l.id, l.sendable]));
    expect(by).toEqual({ a: true, b: true, c: false, d: false });
  });

  it("off a dine-in session nothing is sendable, count or tag", async () => {
    mode = "pickup";
    const d = await detail();
    expect(d.send.sendable).toBe(0);
    expect(d.lines.some((l) => l.sendable)).toBe(false);
  });

  it("hostPresent mirrors host_seat", async () => {
    expect((await detail()).hostPresent).toBe(false);
    hostSeat = "s1";
    expect((await detail()).hostPresent).toBe(true);
  });
});

describe("getTableDetail — a settled record sends nothing", () => {
  it("every settled line is not sendable, and the counts are zero", async () => {
    cartRow = null;
    cartItemRows = [];
    orderRows = [
      {
        id: "o-1",
        session_id: SESSION,
        status: "paid",
        total_cents: 5330,
        refunded_cents: 0,
        created_at: "2026-09-09T01:00:00.000Z",
      },
    ];
    orderItemRows = [
      {
        id: "oi-1",
        order_id: "o-1",
        name: "Mohinga",
        qty: 2,
        unit_price_cents: 1400,
        notes: null,
        modifiers: [],
        refunded_cents: 0,
        added_by: null,
      },
    ];
    const d = await detail();
    expect(d.settled).toBe(true);
    expect(d.lines).toHaveLength(1);
    expect(d.lines.every((l) => l.sendable === false)).toBe(true);
    expect(d.send.sendable).toBe(0);
  });
});
