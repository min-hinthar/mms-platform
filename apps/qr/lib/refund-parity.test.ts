import { beforeEach, describe, expect, it, vi } from "vitest";
/**
 * #360 (CRITICAL 1 + 2) — ONE refunded paid cart, read by all three staff surfaces at once: the KDS
 * (`getKitchenQueue`), the floor card (`getFloorView`) and the table page (`getTableDetail`). Each
 * read runs for real over ONE fake database that EVALUATES `.eq/.in/.is/.or/.order/.limit`, so the
 * three answer from the same rows — and must tell one story: the food is still there, still cooking,
 * TAGGED refunded; and once a cook bumps it, it leaves all three together.
 *
 * Before the fix the KDS dropped the card (nobody could bump it), the floor kept counting it "in
 * kitchen" forever, and the table page filtered it out. Every case is one a `lck/` mutant turns red.
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
  STAFF_SIGNIN_REQUIRED: "signin",
  STAFF_WRITE_OUTAGE: "outage",
}));
vi.mock("./staff-lock", () => ({ isConsoleLocked: () => Promise.resolve(false) }));
vi.mock("./pay-guard", () => ({
  isFresh: () => false,
  paymentInFlightReason: () => Promise.resolve(null),
}));
vi.mock("@mms/db/schemas", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  clearTableInput: { safeParse: (x: unknown) => ({ success: true, data: x }) },
  mergeTablesInput: { safeParse: (x: unknown) => ({ success: true, data: x }) },
}));
vi.mock("./totals", () => ({ getCartTotals: () => Promise.resolve(null) }));
vi.mock("./served-today", () => ({
  readServedToday: () => Promise.resolve(null),
  settleServedRail: () => Promise.resolve(null),
}));
vi.mock("./kitchen-stop-read", async (importOriginal) => ({
  // the ONE id splitter, real: the line ledger read chunks with it
  chunkIds: (await importOriginal<typeof import("./kitchen-stop-read")>()).chunkIds,
  readKitchenStops: () => Promise.resolve(null),
  settleKitchenStops: () => Promise.resolve(null),
}));
vi.mock("./kitchen-round-read", () => ({
  readRounds: () => Promise.resolve(null),
  roundFor: () => ({ kind: "none" }),
}));
vi.mock("./line-names", () => ({
  loadLineNames: () => Promise.resolve({ optionNameMy: new Map() }),
}));

type Row = Record<string, unknown>;
const DB_NOW = "2099-01-01T19:00:00.000Z";
const ago = (min: number) => new Date(Date.parse(DB_NOW) - min * 60_000).toISOString();

let rows: Record<string, Row[]> = {};

type Term = { col: string; op: string; val: string } | { and: Term[] };
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}
function parseTerm(t: string): Term {
  if (t.startsWith("and(") && t.endsWith(")"))
    return { and: splitTop(t.slice(4, -1)).map(parseTerm) };
  const m = /^([a-z_]+)\.(eq|gt|gte|lt|lte|is)\.(.+)$/.exec(t);
  if (!m) throw new Error(`fake or(): cannot evaluate "${t}"`);
  return { col: m[1]!, op: m[2]!, val: m[3]!.replace(/^"(.*)"$/, "$1") };
}
function holds(t: Term, r: Row): boolean {
  if ("and" in t) return t.and.every((x) => holds(x, r));
  const v = r[t.col];
  if (t.op === "is") return t.val === "null" ? v == null : String(v) === t.val;
  if (v == null) return false;
  const a = String(v);
  if (t.op === "eq") return a === t.val;
  if (t.op === "gt") return a > t.val;
  if (t.op === "gte") return a >= t.val;
  if (t.op === "lt") return a < t.val;
  return a <= t.val;
}

function tableApi(name: string) {
  const filters: ((r: Row) => boolean)[] = [];
  const sorts: [string, boolean][] = [];
  let cap: number | null = null;
  let select = "";
  const answer = (): Row[] => {
    // The register queue's open-cart read (joined to its session) — this suite is about one table.
    if (select.includes("!inner")) return [];
    const hit = (rows[name] ?? []).filter((r) => filters.every((f) => f(r)));
    hit.sort((a, b) => {
      for (const [c, asc] of sorts) {
        const x = String(a[c]);
        const y = String(b[c]);
        if (x !== y) return (x < y ? -1 : 1) * (asc ? 1 : -1);
      }
      return 0;
    });
    const cols =
      select.includes("(") || select === "*" ? null : select.split(",").map((c) => c.trim());
    const shaped = cols
      ? hit.map((r) => Object.fromEntries(cols.filter((c) => c in r).map((c) => [c, r[c]])))
      : hit;
    return cap === null ? shaped : shaped.slice(0, cap);
  };
  const api: Record<string, unknown> = {
    select(s: string) {
      select = s;
      return api;
    },
    eq(c: string, v: unknown) {
      filters.push((r) => !(c in r) || r[c] === v);
      return api;
    },
    neq(c: string, v: unknown) {
      filters.push((r) => !(c in r) || r[c] !== v);
      return api;
    },
    in(c: string, vs: unknown[]) {
      filters.push((r) => !(c in r) || vs.includes(r[c]));
      return api;
    },
    is(c: string, v: unknown) {
      filters.push((r) => !(c in r) || (v === null ? r[c] == null : r[c] === v));
      return api;
    },
    gt(c: string, v: unknown) {
      filters.push((r) => !(c in r) || String(r[c]) > String(v));
      return api;
    },
    gte(c: string, v: unknown) {
      filters.push((r) => !(c in r) || String(r[c]) >= String(v));
      return api;
    },
    lte(c: string, v: unknown) {
      filters.push((r) => !(c in r) || String(r[c]) <= String(v));
      return api;
    },
    lt(c: string, v: unknown) {
      filters.push((r) => !(c in r) || String(r[c]) < String(v));
      return api;
    },
    not: () => api,
    or(expr: string, opts?: { referencedTable?: string }) {
      if (!opts?.referencedTable) {
        const terms = splitTop(expr).map(parseTerm);
        filters.push((r) => terms.some((t) => holds(t, r)));
      }
      return api;
    },
    order(c: string, o?: { ascending?: boolean }) {
      sorts.push([c, o?.ascending !== false]);
      return api;
    },
    limit(n: number) {
      cap = n;
      return api;
    },
    maybeSingle: () => Promise.resolve({ data: answer()[0] ?? null, error: null }),
    single: () => Promise.resolve({ data: answer()[0] ?? null, error: null }),
    then(resolve: (r: { data: Row[]; error: null; count: number }) => void) {
      const got = answer();
      resolve({ data: got, error: null, count: got.length });
    },
  };
  return api;
}
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (name: string) => tableApi(name),
    rpc: (fn: string) =>
      Promise.resolve(
        fn === "mms_now" ? { data: DB_NOW, error: null } : { data: null, error: null },
      ),
  }),
}));

const { getKitchenQueue } = await import("./kitchen");
const { getFloorView, getTableDetail } = await import("./floor");

const S7 = "77777777-7777-4777-8777-777777777777";
const PAID = "c-paid";
const ORDER = "order-00abcdef";
const mainLine = (over: Row = {}): Row => ({
  id: "l-main",
  cart_id: PAID,
  name: "Mohinga",
  qty: 2,
  unit_price_cents: 1200,
  modifiers: [],
  modifier_option_ids: [],
  state: "fired",
  fire_at: ago(10),
  fire_batch: "b-1",
  created_at: ago(11),
  fulfillment: "dinein",
  notes: null,
  menu_item_id: "not-a-uuid",
  comped: false,
  bumped_at: null,
  by_seat: null,
  ...over,
});

beforeEach(() => {
  rows = {
    table_sessions: [
      {
        id: S7,
        qr_code: "T7",
        table_number: 7,
        mode: "dinein",
        status: "active",
        host_seat: null,
        created_at: ago(40),
      },
    ],
    qr_tables: [{ table_number: 7, active: true }],
    qr_carts: [
      {
        id: PAID,
        session_id: S7,
        status: "paid",
        customer_name: null,
        pickup_slot: null,
        created_at: ago(30),
      },
    ],
    // A goodwill comp: the table's round refunded IN FULL while it is still eating. $24.00 = $20.00
    // of goods and tax (two $10.00 dishes) + a $4.00 TIP — every fixture carries one (#360's blind
    // pass, CRITICAL 1: the refund pool is `total − service − tip`).
    qr_orders: [
      {
        id: ORDER,
        session_id: S7,
        cart_id: PAID,
        total_cents: 2400,
        service_charge_cents: 0,
        tip_cents: 400,
        created_at: ago(9),
        status: "refunded",
        refunded_cents: 2400,
      },
    ],
    qr_cart_items: [mainLine()],
    qr_order_items: [
      { id: "oi-1", order_id: ORDER },
      { id: "oi-2", order_id: ORDER },
    ],
    mms_refunds: [],
    session_members: [],
    mms_tab_config: [],
    mms_kds_config: [],
  };
});

async function threeReads() {
  const k = await getKitchenQueue();
  if (!k.ok) throw new Error(`KDS: ${k.reason}`);
  const f = await getFloorView();
  if (!f.ok) throw new Error(`floor: ${f.reason}`);
  const d = await getTableDetail(S7);
  if (d.kind !== "detail") throw new Error(`detail: ${d.kind}`);
  return {
    kds: k.queue.tickets.filter((t) => t.cartId === PAID),
    floor: f.snapshot.tables.find((t) => t.sessionId === S7)!.kitchen,
    page: d.detail.paidKitchen ?? null,
  };
}

describe("one refunded paid cart, three surfaces, one story (#360, CRITICAL 1 + 2)", () => {
  it("the food stays on all three — the KDS card, the floor's count and the page's dish — TAGGED refunded", async () => {
    const { kds, floor, page } = await threeReads();
    // lck/kitchen/refund-hides-the-food — the KDS drops the card nobody can then bump; red.
    expect(kds.map((t) => [t.lines.map((l) => [l.id, l.qty]), t.refunded])).toEqual([
      [[["l-main", 2]], true],
    ]);
    // the floor counts exactly what the KDS shows, and says the same thing about it
    const kdsUnits = kds.flatMap((t) => t.lines).reduce((n, l) => n + l.qty, 0);
    expect(floor?.inKitchen).toBe(kdsUnits);
    // lck/floor/refunded-flag-dropped — the card counts it but never says refunded; red.
    expect(floor?.refunded).toBe(kdsUnits);
    // lck/floor/paid-round-refund-hides-food — the page filters to paid orders; red.
    expect(page?.map((l) => [l.id, l.qty, l.refunded])).toEqual([["l-main", 2, true]]);
  });

  it("a cook's bump takes it off all three together — nothing counts 'in kitchen' forever", async () => {
    rows.qr_cart_items = [mainLine({ state: "served", bumped_at: ago(1) })];
    const { kds, floor, page } = await threeReads();
    expect(kds).toEqual([]);
    expect(floor?.inKitchen ?? 0).toBe(0);
    expect(floor?.refunded ?? 0).toBe(0);
    // the page still names the dish just out (the floor's "ready to serve" window), as served
    expect(page?.map((l) => [l.id, l.stage])).toEqual([["l-main", "served"]]);
  });

  it("a PAID cart beside it untags it on all three (a partial refund leaves the order paid)", async () => {
    rows.qr_orders!.push({
      id: "order-11abcdef",
      session_id: S7,
      cart_id: PAID,
      total_cents: 2400,
      service_charge_cents: 0,
      tip_cents: 400,
      created_at: ago(8),
      status: "paid",
      refunded_cents: 0,
    });
    const { kds, floor, page } = await threeReads();
    expect(kds.map((t) => t.refunded)).toEqual([undefined]);
    expect(floor?.inKitchen).toBe(2);
    expect(floor?.refunded ?? 0).toBe(0);
    expect(page?.map((l) => l.refunded)).toEqual([undefined]);
  });

  it("every dish cash-refunded with the TIP kept is tagged on all three — the amounts fall short of the total", async () => {
    // `mms_refund_cash_line` clamps each line to the pool (`total − service − tip`) and leaves the
    // order `paid`; the two lines' shares round a cent short of it. Only the ledger's line rows say
    // every dish went back. lck/refunded-cart/line-arm-dropped · lck/kitchen/line-refunds-unread ·
    // lck/floor/line-refunds-unread · lck/floor/paid-round-line-refunds-unread — red.
    rows.qr_orders = [{ ...rows.qr_orders![0]!, status: "paid", refunded_cents: 1999 }];
    rows.mms_refunds = [
      { order_id: ORDER, order_item_id: "oi-1", amount_cents: 1000 },
      { order_id: ORDER, order_item_id: "oi-2", amount_cents: 999 },
    ];
    const { kds, floor, page } = await threeReads();
    expect(kds.map((t) => t.refunded)).toEqual([true]);
    expect(floor?.refunded).toBe(2);
    expect(page?.map((l) => l.refunded)).toEqual([true]);
  });

  it("an ORDER-LEVEL refund of the goods (no line rows, the tip kept) is tagged on all three", async () => {
    // A dashboard refund reconciled from Stripe raises `refunded_cents` and writes no ledger row.
    // lck/refunded-cart/pool-arm-dropped · lck/kitchen/refund-amounts-unread · lck/floor/orders-pool-unread — red.
    rows.qr_orders = [{ ...rows.qr_orders![0]!, status: "paid", refunded_cents: 2000 }];
    const { kds, floor, page } = await threeReads();
    expect(kds.map((t) => t.refunded)).toEqual([true]);
    expect(floor?.refunded).toBe(2);
    expect(page?.map((l) => l.refunded)).toEqual([true]);
  });

  it("ONE of two dishes refunded leaves the order standing: untagged on all three", async () => {
    // lck/refunded-cart/one-line-is-every-line — red.
    rows.qr_orders = [{ ...rows.qr_orders![0]!, status: "paid", refunded_cents: 1000 }];
    rows.mms_refunds = [{ order_id: ORDER, order_item_id: "oi-1", amount_cents: 1000 }];
    const { kds, floor, page } = await threeReads();
    expect(kds.map((t) => t.refunded)).toEqual([undefined]);
    expect(floor?.inKitchen).toBe(2);
    expect(floor?.refunded ?? 0).toBe(0);
    expect(page?.map((l) => l.refunded)).toEqual([undefined]);
  });
});
