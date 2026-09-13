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
/** The rows the UNION read (`in("id", …)` on `qr_orders`, no floor) answers — the orders the
 *  today-ledger named. The paid read (a `gte` floor) answers `orderRows`. */
let unionOrderRows: Row[] = [];
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
        if (name === "qr_orders")
          return {
            data: r.calls.some((c) => c[0] === "in" && (c[1] as unknown[])[0] === "id")
              ? unionOrderRows
              : orderRows,
            error: null,
          };
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
  // A is the newer order: the list is newest first, and the merge ranks by that same instant (the
  // id is only a tiebreak), so the fixture's order must be the ranking's, not insertion's.
  orderRows = [
    order(ORDER_A),
    order(ORDER_B, {
      tender: "cash",
      stripe_payment_intent_id: null,
      created_at: "2026-09-13T18:30:00Z",
    }),
  ];
  unionOrderRows = [];
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

  it("an earlier day's order refunded HERE today is in the list — its own read, no floor; the paid arm keeps the floor (blind pass on A4·3, CRITICAL 1)", async () => {
    const OLD = "44444444-4444-4444-8444-444444444444";
    ledgerTodayRows = [
      { order_id: OLD, created_at: "2026-09-13T18:20:00Z" },
      { order_id: OLD, created_at: "2026-09-13T18:50:00Z" },
    ];
    unionOrderRows = [order(OLD, { created_at: "2026-09-12T19:41:00Z", refunded_cents: 2100 })];
    const res = await getSettledToday();
    if (!res.ok) throw new Error("expected ok");
    const today = recs.filter((r) => r.table === "mms_refunds")[0]!;
    expect(today.calls).toContainEqual(["gte", ["created_at", "2026-09-13T07:00:00.000Z"]]);
    const [paid, union] = recs.filter((r) => r.table === "qr_orders");
    expect(paid!.calls).toContainEqual(["gte", ["created_at", "2026-09-13T07:00:00.000Z"]]);
    expect(union!.calls).toContainEqual(["in", ["id", [OLD]]]);
    expect(union!.calls.some((c) => c[0] === "gte")).toBe(false);
    expect(union!.calls).toContainEqual(["limit", [50]]);
    const old = res.orders.find((o) => o.id === OLD)!;
    // The row says WHICH day it was paid and WHEN today its money moved (Codex round 1 on #283, P2).
    expect(old.settledOn).toBe("Sep 12");
    expect(old.settledAt).toBe("12:41 PM");
    expect(old.refundedTodayAt).toBe("11:50 AM"); // the LATEST movement today, not the first
    // A paid-today row carries neither.
    expect(res.orders.find((o) => o.id === ORDER_A)).toMatchObject({
      settledOn: null,
      refundedTodayAt: null,
    });
  });

  it("with the day's paid page FULL, an earlier day's order refunded today still makes the list — ranked by the refund, not its order time (Codex round 1 on #283, P1)", async () => {
    const OLD = "44444444-4444-4444-8444-444444444444";
    // Fifty orders paid today, 11:41 AM through 12:30 PM — the paid read's whole page.
    orderRows = Array.from({ length: 50 }, (_, i) =>
      order(`55555555-5555-4555-8555-${String(i).padStart(12, "0")}`, {
        created_at: new Date(Date.parse("2026-09-13T18:41:00Z") + i * 60_000).toISOString(),
      }),
    );
    ledgerTodayRows = [{ order_id: OLD, created_at: "2026-09-13T19:10:30Z" }]; // 12:10:30 PM
    unionOrderRows = [order(OLD, { created_at: "2026-09-12T19:41:00Z", refunded_cents: 2100 })];
    const res = await getSettledToday();
    if (!res.ok) throw new Error("expected ok");
    expect(res.orders.length).toBe(50);
    expect(res.truncated).toBe(true);
    const at = res.orders.findIndex((o) => o.id === OLD);
    expect(at).toBeGreaterThanOrEqual(0);
    // Ranked by the instant it settled TODAY (12:10:30): after the twenty orders paid 12:11–12:30,
    // before the thirty paid earlier — not last, and not off the list.
    expect(at).toBe(20);
    // Both arms full → one of the fifty paid today fell off, and the row says the list is capped.
    expect(res.orders.filter((o) => o.id !== OLD).length).toBe(49);
  });

  it("with more than fifty orders refunded today, the union arm keeps the fifty most recently REFUNDED — capped by the refund, before the read (Codex round 2 on #283, P1)", async () => {
    // Fifty-one orders refunded today. The OLDEST-created one carries today's LATEST refund; the
    // newest-created one carries the EARLIEST. Capped by creation (the DB's own order under the
    // limit), the oldest fell out before the merge could rank it.
    const idOf = (i: number) => `66666666-6666-4666-8666-${String(i).padStart(12, "0")}`;
    ledgerTodayRows = Array.from({ length: 51 }, (_, i) => ({
      order_id: idOf(i),
      // i = 0 refunded last (12:51 PM), i = 50 refunded first (12:01 PM)
      created_at: new Date(Date.parse("2026-09-13T19:51:00Z") - i * 60_000).toISOString(),
    }));
    unionOrderRows = [];
    const res = await getSettledToday();
    if (!res.ok) throw new Error("expected ok");
    const union = recs.filter((r) => r.table === "qr_orders")[1]!;
    const inCall = union.calls.find((c) => c[0] === "in" && (c[1] as unknown[])[0] === "id")!;
    const ids = (inCall[1] as [string, string[]])[1];
    expect(ids.length).toBe(50);
    expect(ids).toContain(idOf(0)); // the latest refund today, on the oldest order
    expect(ids).not.toContain(idOf(50)); // the earliest refund today is the one that falls off
    expect(ids[0]).toBe(idOf(0)); // ranked newest refund first
    expect(res.truncated).toBe(true);
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
    expect(a.settledOn).toBeNull();
    expect(a.refundedTodayAt).toBeNull();
    expect(a.pickupSlotAt).toBeNull();
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

  it("a pickup slot is formatted in the SERVICE zone on the server, like the clock — never the tablet's (Codex round 2 on #283)", async () => {
    orderRows = [order(ORDER_A, { table_number: null, pickup_slot: "2026-09-13T19:30:00Z" })];
    const res = await getSettledToday();
    if (!res.ok) throw new Error("expected ok");
    expect(res.orders[0]!.pickupSlotAt).toBe("12:30 PM");
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
