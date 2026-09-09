import { beforeEach, describe, expect, it, vi } from "vitest";
/**
 * K33 — THE FLOOR DRILL-DOWN AFTER THE TABLE PAYS.
 *
 * `getTableDetail`'s cart read is `.eq("status","open")` and both fulfillment RPCs flip the cart to
 * 'paid', so at the instant of settlement the whole line block stopped running and the screen printed
 * "Nothing in the cart yet." over a table that had just eaten. The lines never went anywhere —
 * `mms_fulfill_order` copies them into `qr_order_items` — so the settled path reads them from there.
 *
 * The fake DB EVALUATES its filters (the cart-promo-freeze pattern), so a mutant that drops the
 * status guard, reads the wrong table, or lets the settled lines leak into the open-cart "so far"
 * bindings changes the OUTCOME here rather than a call transcript.
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
let cartRow: Row | null = null;
let orderRow: Row | null = null;
let orderItemRows: Row[] = [];
let cartItemRows: Row[] = [];
let orderItemsFail = false;

function tableApi(name: string) {
  const eqs: [string, unknown][] = [];
  const ins: [string, unknown[]][] = [];
  const api: Record<string, unknown> = {
    select() {
      return api;
    },
    eq(col: string, val: unknown) {
      eqs.push([col, val]);
      return api;
    },
    in(col: string, vals: unknown[]) {
      ins.push([col, vals]);
      return api;
    },
    order() {
      return api;
    },
    limit() {
      return api;
    },
    // A row satisfies the read only if every filter it can answer actually matches — a fixture that
    // ignored the filters would let a dropped guard report clean.
    maybeSingle() {
      if (name === "table_sessions")
        return Promise.resolve({
          data: {
            id: "s-1",
            qr_code: "t-7",
            table_number: 7,
            mode: "dinein",
            status: "active",
            host_seat: null,
            created_at: "2026-09-09T00:00:00.000Z",
          },
          error: null,
        });
      const r = name === "qr_carts" ? cartRow : name === "qr_orders" ? orderRow : null;
      if (r === null) return Promise.resolve({ data: null, error: null });
      const hit =
        eqs.every(([c, v]) => !(c in r) || r[c] === v) &&
        ins.every(([c, vs]) => !(c in r) || vs.includes(r[c]));
      return Promise.resolve({ data: hit ? r : null, error: null });
    },
    then(resolve: (r: { data: Row[] | null; error: unknown }) => void) {
      if (name === "qr_order_items") {
        if (orderItemsFail)
          return resolve({ data: null, error: { message: "order items unreadable" } });
        const hit = orderItemRows.filter((r) => eqs.every(([c, v]) => !(c in r) || r[c] === v));
        return resolve({ data: hit, error: null });
      }
      if (name === "qr_cart_items") return resolve({ data: cartItemRows, error: null });
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
const SESSION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

beforeEach(() => {
  cartRow = null; // the table has PAID — no open cart exists
  orderRow = {
    id: "o-1",
    status: "paid",
    total_cents: 5330,
    created_at: "2026-09-09T01:00:00.000Z",
  };
  orderItemRows = [
    {
      id: "oi-1",
      order_id: "o-1",
      name: "Mohinga",
      qty: 2,
      unit_price_cents: 1400,
      notes: "no egg",
      modifiers: ["Extra fish", "No egg"],
      added_by: null,
    },
    {
      id: "oi-2",
      order_id: "o-1",
      name: "Tea leaf salad",
      qty: 1,
      unit_price_cents: 900,
      notes: null,
      modifiers: [],
      added_by: null,
    },
  ];
  cartItemRows = [];
  orderItemsFail = false;
});

describe("K33 — a settled table still shows what it ordered", () => {
  it("reads the paid order's lines instead of printing an empty cart", async () => {
    const r = await getTableDetail(SESSION);
    expect(r.kind).toBe("detail");
    if (r.kind !== "detail") throw new Error("unreachable: asserted detail above");
    expect(r.detail.settled).toBe(true);
    expect(r.detail.lines.map((l) => l.name)).toEqual(["Mohinga", "Tea leaf salad"]);
    expect(r.detail.lines[0]?.qty).toBe(2);
    // The fulfilment-time snapshot, verbatim — never re-derived.
    expect(r.detail.lines[0]?.unitPriceCents).toBe(1400);
    expect(r.detail.paidTotalCents).toBe(5330);
  });

  it("carries the chosen options and the kitchen note — the details the floor never showed", async () => {
    const r = await getTableDetail(SESSION);
    expect(r.kind).toBe("detail");
    if (r.kind !== "detail") throw new Error("unreachable: asserted detail above");
    expect(r.detail.lines[0]?.modifiers).toEqual(["Extra fish", "No egg"]);
    expect(r.detail.lines[0]?.notes).toBe("no egg");
    // A line with no options carries an empty array, never undefined — the renderer maps over it.
    expect(r.detail.lines[1]?.modifiers).toEqual([]);
  });

  it("never lets a settled line reach the open-cart 'so far' bindings", async () => {
    // `itemCount`/`runningSubtotalCents` drive LiveMoney's running total; a settled table's
    // authoritative figure is `paidTotalCents`. Leaking the order into them would print a
    // live-looking basket beside a paid total — two numbers for one meal.
    const r = await getTableDetail(SESSION);
    expect(r.kind).toBe("detail");
    if (r.kind !== "detail") throw new Error("unreachable: asserted detail above");
    expect(r.detail.itemCount).toBe(0);
    expect(r.detail.runningSubtotalCents).toBe(0);
    expect(r.detail.settleTotalCents).toBeNull();
    expect(r.detail.cartId).toBeNull();
  });

  it("a REFUNDED order still shows its lines, and stops deriving as 'seated'", async () => {
    orderRow = { ...(orderRow as Row), status: "refunded" };
    const r = await getTableDetail(SESSION);
    expect(r.kind).toBe("detail");
    if (r.kind !== "detail") throw new Error("unreachable: asserted detail above");
    expect(r.detail.settled).toBe(true);
    expect(r.detail.lines).toHaveLength(2);
    expect(r.detail.status).toBe("paid"); // a settled table, not an empty one
  });

  it("an OPEN cart still wins — the settled path is the fallback, not an override", async () => {
    cartRow = {
      id: "c-1",
      status: "open",
      locked: false,
      locked_at: null,
      settle_at: null,
      counter_requested_at: null,
      tab_type: "none",
      tab_opened_at: null,
      intended_tip_cents: null,
      promo_code: null,
    };
    cartItemRows = [
      {
        id: "ci-1",
        name: "Mohinga",
        qty: 1,
        unit_price_cents: 1400,
        by_seat: null,
        created_at: "2026-09-09T00:30:00.000Z",
        menu_item_id: null,
        state: "draft",
        comped: false,
        notes: null,
        modifiers: ["No egg"],
      },
    ];
    const r = await getTableDetail(SESSION);
    expect(r.kind).toBe("detail");
    if (r.kind !== "detail") throw new Error("unreachable: asserted detail above");
    expect(r.detail.settled).toBe(false);
    expect(r.detail.lines).toHaveLength(1);
    expect(r.detail.lines[0]?.modifiers).toEqual(["No egg"]); // the open path carries them too
    expect(r.detail.itemCount).toBe(1); // the running bindings are live again
    expect(r.detail.runningSubtotalCents).toBe(1400);
  });

  it("an unreadable order-items read is an OUTAGE, never an empty table", async () => {
    // The exact false verdict this branch exists to end: "nothing here" over a table that just paid.
    orderItemsFail = true;
    const r = await getTableDetail(SESSION);
    expect(r.kind).toBe("outage");
  });
});
