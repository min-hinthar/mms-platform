import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A4·3 · M204 · M183 — `getSettledToday`'s WIRING: the read is scoped to the service day, the
 * ledger sets both the per-line `refunded` flag and the remaining pool the offer is clamped to, the
 * refund path comes from the two stored facts, a full page says `truncated`, and a failed read
 * answers `outage` — never an empty day. The money rules themselves are pinned by value in
 * `refund-console.test.ts`; this suite proves the read reaches them.
 */
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("./posthog-server", () => ({ getPostHogClient: () => ({ capture() {}, flush() {} }) }));
vi.mock("./stripe", () => ({ getStripe: () => ({ refunds: { create: () => Promise.reject() } }) }));
vi.mock("./staff-pin", () => ({ verifyStaffPin: () => Promise.resolve({ status: "ok" }) }));
let gateOk = true;
vi.mock("./staff", () => ({
  getStaffAuth: () =>
    Promise.resolve({ kind: "staff", uid: "u-1", staffId: "s-1", role: "manager" }),
  roleAtLeast: () => true,
  staffGate: () =>
    Promise.resolve(
      gateOk
        ? { ok: true, caller: { uid: "u-1", staffId: "s-1", role: "manager" } }
        : { ok: false, error: "That needs a manager — ask one to step in." },
    ),
}));
vi.mock("./line-names", () => ({
  loadLineNames: () =>
    Promise.resolve({
      nameMyByRef: new Map([["dish-1", "မုန့်ဟင်းခါး"]]),
      optionNameMy: new Map(),
    }),
}));

// 2026-09-13 19:00Z = 12:00 PM in Los Angeles; the day floor is 07:00Z.
const NOW = "2026-09-13T19:00:00.000Z";
const ORDER_A = "11111111-1111-4111-8111-1111110a1b2c";
const ORDER_B = "22222222-2222-4222-8222-222222d3e4f5";

type Row = Record<string, unknown>;
type Rec = { table: string; calls: [string, unknown[]][] };
let recs: Rec[] = [];
let orderRows: Row[] = [];
let ledgerRows: Row[] = [];
/** The ledger rows SINCE the floor — the today-ledger read (a `gte` on `mms_refunds`) answers these. */
let ledgerTodayRows: Row[] = [];
let failTable: string | null = null;

function tableApi(name: string) {
  const r: Rec = { table: name, calls: [] };
  recs.push(r);
  const api: Record<string, unknown> = {
    select: (...a: unknown[]) => (r.calls.push(["select", a]), api),
    eq: (...a: unknown[]) => (r.calls.push(["eq", a]), api),
    gte: (...a: unknown[]) => (r.calls.push(["gte", a]), api),
    or: (...a: unknown[]) => (r.calls.push(["or", a]), api),
    in: (...a: unknown[]) => (r.calls.push(["in", a]), api),
    order: (...a: unknown[]) => (r.calls.push(["order", a]), api),
    limit: (...a: unknown[]) => (r.calls.push(["limit", a]), api),
    maybeSingle: () => Promise.resolve({ data: { tz: "America/Los_Angeles" }, error: null }),
    then(resolve: (v: { data: unknown; error: unknown }) => unknown) {
      const answer = (): { data: unknown; error: unknown } => {
        if (failTable === name) return { data: null, error: { message: `${name} unreadable` } };
        if (name === "qr_orders") return { data: orderRows, error: null };
        if (name === "mms_refunds")
          return {
            data: r.calls.some((c) => c[0] === "gte") ? ledgerTodayRows : ledgerRows,
            error: null,
          };
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

const { getSettledToday } = await import("./refunds");

const line = (id: string, over: Row = {}): Row => ({
  id,
  name: "Mohinga",
  qty: 2,
  unit_price_cents: 1000,
  tax_cents: 80,
  fulfillment: "dinein",
  modifiers: ["Extra lime"],
  modifier_option_ids: [],
  notes: null,
  refunded_cents: 0,
  menu_item_id: "dish-1",
  ...over,
});
const order = (id: string, over: Row = {}): Row => ({
  id,
  created_at: "2026-09-13T18:41:00Z",
  status: "paid",
  tender: "card",
  table_number: 4,
  customer_name: null,
  pickup_slot: null,
  subtotal_cents: 4000,
  discount_cents: 400,
  service_charge_cents: 0,
  tax_cents: 300,
  tip_cents: 700,
  total_cents: 4600,
  refunded_cents: 0,
  stripe_payment_intent_id: "pi_1",
  qr_order_items: [line(`${id}-l1`), line(`${id}-l2`, { tax_cents: 0, name: "Tea" })],
  ...over,
});

beforeEach(() => {
  recs = [];
  gateOk = true;
  failTable = null;
  orderRows = [order(ORDER_A), order(ORDER_B, { tender: "cash", stripe_payment_intent_id: null })];
  ledgerRows = [];
  ledgerTodayRows = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("getSettledToday — today's settled orders, as the receipt shows them", () => {
  it("scopes the read to the service day's floor and to settled statuses, newest first, capped", async () => {
    const res = await getSettledToday();
    if (!res.ok) throw new Error("expected ok");
    const q = recs.find((r) => r.table === "qr_orders")!;
    expect(q.calls).toContainEqual(["gte", ["created_at", "2026-09-13T07:00:00.000Z"]]);
    expect(q.calls).toContainEqual(["in", ["status", ["paid", "refunded"]]]);
    expect(q.calls).toContainEqual(["order", ["created_at", { ascending: false }]]);
    // The lines in the receipt's own order — `receipt-entry.ts` reads `.order("id")`.
    expect(q.calls).toContainEqual([
      "order",
      ["id", { referencedTable: "qr_order_items", ascending: true }],
    ]);
    expect(q.calls).toContainEqual(["limit", [50]]);
    expect(q.calls.some((c) => c[0] === "or")).toBe(false);
    expect(res.sinceIso).toBe("2026-09-13T07:00:00.000Z");
    expect(res.serverNow).toBe(NOW);
    expect(res.truncated).toBe(false);
  });

  it("an earlier day's order refunded HERE today is in the list — the union keeps the floor on the paid arm (blind pass on A4·3, CRITICAL 1)", async () => {
    const OLD = "44444444-4444-4444-8444-444444444444";
    ledgerTodayRows = [{ order_id: OLD }, { order_id: OLD }];
    const res = await getSettledToday();
    if (!res.ok) throw new Error("expected ok");
    const today = recs.filter((r) => r.table === "mms_refunds")[0]!;
    expect(today.calls).toContainEqual(["gte", ["created_at", "2026-09-13T07:00:00.000Z"]]);
    const q = recs.find((r) => r.table === "qr_orders")!;
    expect(q.calls).toContainEqual([
      "or",
      [`created_at.gte.2026-09-13T07:00:00.000Z,id.in.(${OLD})`],
    ]);
    expect(q.calls.some((c) => c[0] === "gte")).toBe(false);
  });

  it("a failed today-ledger read answers `outage` — the union is not silently narrowed to the paid arm", async () => {
    failTable = "mms_refunds";
    expect(await getSettledToday()).toEqual({ ok: false, reason: "outage" });
  });

  it("carries the receipt's own figures: code, clock, snapshot breakdown, ONE refund verdict, Burmese", async () => {
    const res = await getSettledToday();
    if (!res.ok) throw new Error("expected ok");
    const a = res.orders[0]!;
    expect(a.code).toBe("0A1B2C");
    expect(a.settledAt).toBe("11:41 AM");
    expect(a.tableNumber).toBe(4);
    expect(a.breakdown).toEqual({
      subtotalCents: 4000,
      discountCents: 400,
      serviceChargeCents: 0,
      taxCents: 300,
      tipCents: 700,
    });
    expect(a.totalCents).toBe(4600);
    expect(a.refund).toEqual({ state: "none", refundedCents: 0, netPaidCents: 4600 });
    expect(a.lines[0]).toMatchObject({
      name: "Mohinga",
      nameMy: "မုန့်ဟင်းခါး",
      modifiers: ["Extra lime"],
      refunded: false,
      refundedCents: 0,
    });
  });

  it("M183 — the path comes from tender + PaymentIntent: a card order with a PI refunds in-app, a cash order from the drawer", async () => {
    const res = await getSettledToday();
    if (!res.ok) throw new Error("expected ok");
    expect(res.orders.map((o) => [o.tender, o.refundPath])).toEqual([
      ["card", "app"],
      ["cash", "cash"],
    ]);
  });

  it("the ledger flags the refunded line AND shrinks the pool every other line is clamped to", async () => {
    // A's pool: 4600 − 0 service − 700 tip = 3900. Line 1 (taxable, 2×1000, tax share 2000/2000 of
    // 300) is worth 1800 + 300 = 2100; line 2 (non-taxable) is worth 1800. A ledger row of 2100
    // against line 1 leaves 1800 — line 2 fits exactly. A second, line-less (dashboard) row of 1000
    // leaves 800, so line 2's offer is CLAMPED to 800 and says so.
    ledgerRows = [
      { order_id: ORDER_A, order_item_id: `${ORDER_A}-l1`, amount_cents: 2100 },
      { order_id: ORDER_A, order_item_id: null, amount_cents: 1000 },
    ];
    const res = await getSettledToday();
    if (!res.ok) throw new Error("expected ok");
    const a = res.orders[0]!;
    expect(a.remainingCents).toBe(800);
    expect(a.lines.map((l) => [l.refunded, l.offeredCents, l.offerClamped])).toEqual([
      [true, 800, true],
      [false, 800, true],
    ]);
    // B has no ledger rows: its pool is intact and neither offer is clamped.
    const b = res.orders[1]!;
    expect(b.remainingCents).toBe(3900);
    expect(b.lines.map((l) => [l.refunded, l.offeredCents, l.offerClamped])).toEqual([
      [false, 2100, false],
      [false, 1800, false],
    ]);
  });

  it("a FULL page is `truncated` — part of the day is never passed off as the whole", async () => {
    orderRows = Array.from({ length: 50 }, (_, i) =>
      order(`33333333-3333-4333-8333-${String(i).padStart(12, "0")}`),
    );
    const res = await getSettledToday();
    if (!res.ok) throw new Error("expected ok");
    expect(res.truncated).toBe(true);
  });

  it("a failed orders read or a failed LEDGER read answers `outage`, never an empty day or cleared flags", async () => {
    failTable = "qr_orders";
    expect(await getSettledToday()).toEqual({ ok: false, reason: "outage" });
    failTable = "mms_refunds";
    expect(await getSettledToday()).toEqual({ ok: false, reason: "outage" });
  });

  it("a non-manager is `forbidden` (the zone hides itself), not an outage", async () => {
    gateOk = false;
    expect(await getSettledToday()).toEqual({ ok: false, reason: "forbidden" });
  });
});
