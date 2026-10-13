import { beforeEach, describe, expect, it, vi } from "vitest";
/**
 * The lifecycle audit (2026-10-13) — `getTableDetail` hands each sent line its STAGE on the one
 * kitchen track (the editor's tag), and the table's PAID rounds' food still in the kitchen
 * (`paidKitchen`, the "From the paid round" group). The fake answers like PostgREST — a row carries
 * only the columns the query SELECTED — so a select that drops `bumped_at` shows up as a wrong stage.
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
const OPEN = "cart-1";
const PAID = "cart-paid";
// The table page's clock on a dine-in table is the app clock: fixtures are cut from the real now.
const NOW = Date.now();
const ago = (ms: number) => new Date(NOW - ms).toISOString();

let openRows: Row[] = [];
let paidRows: Row[] = [];
let paidReadFails = false;
let orders: Row[] = [];
let paidAsked: unknown[] | null = null;

function pick(row: Row, cols: string): Row {
  const out: Row = {};
  for (const c of cols.split(",").map((s) => s.trim())) if (c in row) out[c] = row[c];
  return out;
}

function tableApi(name: string) {
  let cols = "*";
  let inCarts: unknown[] | null = null;
  const api: Record<string, unknown> = {
    select(c: string) {
      cols = c;
      return api;
    },
    eq: () => api,
    in(col: string, v: unknown[]) {
      if (name === "qr_cart_items" && col === "cart_id") inCarts = v;
      return api;
    },
    order: () => api,
    limit: () => api,
    gt: () => api,
    not: () => api,
    or: () => api,
    is: () => api,
    maybeSingle() {
      if (name === "table_sessions")
        return Promise.resolve({
          data: {
            id: SESSION,
            qr_code: "t-7",
            table_number: 7,
            mode: "dinein",
            status: "active",
            host_seat: null,
            created_at: ago(3_600_000),
          },
          error: null,
        });
      if (name === "qr_carts")
        return Promise.resolve({
          data: {
            id: OPEN,
            locked: false,
            locked_at: null,
            settle_at: null,
            counter_requested_at: null,
            tab_type: "none",
            tab_opened_at: null,
            intended_tip_cents: null,
            promo_code: null,
          },
          error: null,
        });
      return Promise.resolve({ data: null, error: null });
    },
    then(resolve: (r: { data: Row[] | null; error: unknown }) => void) {
      if (name === "qr_orders") return resolve({ data: orders, error: null });
      if (name === "qr_cart_items") {
        if (inCarts !== null) {
          paidAsked = inCarts;
          if (paidReadFails) return resolve({ data: null, error: { message: "down" } });
          return resolve({ data: paidRows.map((r) => pick(r, cols)), error: null });
        }
        return resolve({ data: openRows.map((r) => pick(r, cols)), error: null });
      }
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
  id: "l-1",
  name: "Mohinga",
  qty: 1,
  unit_price_cents: 1200,
  by_seat: null,
  created_at: ago(600_000),
  menu_item_id: "not-a-uuid",
  state: "fired",
  comped: false,
  notes: null,
  modifiers: [],
  fulfillment: "dinein",
  modifier_option_ids: [],
  fire_at: ago(120_000),
  bumped_at: null,
  ...over,
});

async function detail() {
  const r = await getTableDetail(SESSION);
  if (r.kind !== "detail") throw new Error(`expected a detail, got ${r.kind}`);
  return r.detail;
}

beforeEach(() => {
  openRows = [];
  paidRows = [];
  paidReadFails = false;
  orders = [];
  paidAsked = null;
});

describe("getTableDetail — a sent line's tag is its stage on the one track", () => {
  it("Sending… inside the send grace, Sent past it, Cooking inside Mom's undo, Served after", async () => {
    // lck/floor/stage-reads-the-raw-state — the page said "Sent" (with Void/Comp) while the diner's
    // grace still ran, and "Served" inside the six-second Undo.
    openRows = [
      line({ id: "grace", fire_at: new Date(NOW + 60_000).toISOString() }),
      line({ id: "sent" }),
      line({ id: "undo", state: "served", bumped_at: ago(1_000) }),
      line({ id: "out", state: "served", bumped_at: ago(120_000) }),
      line({ id: "draft", state: "draft", fire_at: null }),
    ];
    const d = await detail();
    expect(d.lines.map((l) => [l.id, l.stage])).toEqual([
      ["grace", "sending"],
      ["sent", "sent"],
      ["undo", "cooking"],
      ["out", "served"],
      ["draft", "unsent"],
    ]);
  });
});

describe("getTableDetail — the paid round's food still in the kitchen", () => {
  it("a PAID round's cooking dishes ride the detail, read from its cart, never the open one", async () => {
    // lck/floor/paid-round-unread — once a new round opened, the paid round's cooking mains appeared
    // nowhere on the page the floor card links to.
    orders = [
      {
        id: "o-1",
        total_cents: 2140,
        created_at: ago(900_000),
        status: "paid",
        refunded_cents: 0,
        tip_cents: 0,
        cart_id: PAID,
      },
    ];
    paidRows = [line({ id: "main", state: "in_progress", notes: "no peanuts" })];
    openRows = [line({ id: "tea", state: "draft", fire_at: null, name: "Tea" })];
    const d = await detail();
    expect(paidAsked).toEqual([PAID]);
    expect(d.paidKitchen?.map((l) => [l.id, l.stage, l.notes])).toEqual([
      ["main", "cooking", "no peanuts"],
    ]);
  });

  it("a refunded round is nobody's food; no paid round reads nothing; a failed read draws no group", async () => {
    orders = [
      {
        id: "o-1",
        total_cents: 2140,
        created_at: ago(900_000),
        status: "refunded",
        refunded_cents: 2140,
        tip_cents: 0,
        cart_id: PAID,
      },
    ];
    paidRows = [line({ id: "main", state: "in_progress" })];
    expect((await detail()).paidKitchen).toEqual([]);
    expect(paidAsked).toBeNull();
    orders = [{ ...orders[0]!, status: "paid", refunded_cents: 0 }];
    paidReadFails = true;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await detail()).paidKitchen).toBeNull();
    spy.mockRestore();
  });
});
