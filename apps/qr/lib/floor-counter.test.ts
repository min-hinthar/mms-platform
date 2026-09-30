import { beforeEach, describe, expect, it, vi } from "vitest";
/**
 * Phase 2f · P2v — the FLOOR's half of "a counter order may cook before it is paid".
 *
 *  - `getTableDetail` carries the counter order's facts (counter / arm / name / unpaid / the sent
 *    line ids / mergeable / the switch), with "sent" measured on the DATABASE clock;
 *  - `clearTable` routes a counter order's cancel through `mms_clear_counter_cart` (the SENT check
 *    and the cancel are one locked SQL decision — Codex r2 on #308), maps its verdicts (sent →
 *    refusal, ok / not_open → proceed, an error or any other verdict → outage, fail CLOSED) and writes
 *    nothing when it refuses; a table keeps the plain status-guarded cancel;
 *  - `mergeTables` refuses any counter TARGET and a counter source with sent food, before the RPC;
 *  - `getFloorView` flags a register row's unpaid food and folds its kitchen row.
 *
 * The database clock is an hour AHEAD of the process clock on purpose: a line fired two minutes
 * before the DB clock is past its grace there and still in the FUTURE on the app clock, so a read
 * that measures the grace on the wrong clock separates. Each case is the one a `p2f-lib/floor/*`
 * mutant in `scripts/verify-slice.mjs` turns red.
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
  staffGate: () => Promise.resolve({ ok: true, caller: { staffId: "st", role: "server" } }),
  STAFF_WRITE_OUTAGE: "outage",
}));
vi.mock("./staff-lock", () => ({ isConsoleLocked: () => Promise.resolve(false) }));
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
      subtotalCents: 1200,
      discountCents: 0,
      rewardCents: 0,
      rewardFaceCents: 0,
      promoCents: 0,
      serviceChargeCents: 0,
      taxCents: 0,
      tipCents: 0,
      totalCents: 1200,
    }),
}));
vi.mock("./line-names", () => ({
  loadLineNames: () => Promise.resolve({ optionNameMy: new Map() }),
}));
const rq = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("./register-queue", async (orig) => ({
  ...(await orig<typeof import("./register-queue")>()),
  readRegisterQueue: () => Promise.resolve(rq.value),
}));

type Row = Record<string, unknown>;
const DB_NOW_MS = Date.now() + 60 * 60_000;
const DB_NOW = new Date(DB_NOW_MS).toISOString();
const dbAgo = (sec: number) => new Date(DB_NOW_MS - sec * 1000).toISOString();

const REG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TABLE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const KIOSK = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

let sessions: Record<string, Row> = {};
let carts: Record<string, Row | null> = {};
let items: Record<string, Row[]> = {};
let itemsError: { message: string } | null = null;
let nowError: { message: string } | null = null;
let updates: { table: string; patch: Row }[] = [];
let rpcCalls: string[] = [];
let rpcArgs: Record<string, unknown>[] = [];
// `mms_clear_counter_cart`'s verdict for the counter cart; any other cart id answers what the SQL
// would for a cart it does not treat as a counter order (so a table routed there cannot clear).
let clearVerdict: { data: string | null; error: { message: string } | null } = {
  data: "ok",
  error: null,
};

function pick(row: Row, cols: string): Row {
  const out: Row = {};
  for (const c of cols.split(",").map((s) => s.trim())) if (c in row) out[c] = row[c];
  return out;
}

function tableApi(name: string) {
  let cols = "*";
  let head = false;
  const eqs: Record<string, unknown> = {};
  let patch: Row | null = null;
  const api: Record<string, unknown> = {
    select(c: string, opts?: { head?: boolean }) {
      cols = c;
      head = !!opts?.head;
      return api;
    },
    update(p: Row) {
      patch = p;
      return api;
    },
    eq(col: string, val: unknown) {
      eqs[col] = val;
      return api;
    },
    neq() {
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
    maybeSingle() {
      if (name === "table_sessions")
        return Promise.resolve({ data: sessions[eqs.id as string] ?? null, error: null });
      if (name === "qr_carts")
        return Promise.resolve({ data: carts[eqs.session_id as string] ?? null, error: null });
      return Promise.resolve({ data: null, error: null });
    },
    then(resolve: (r: unknown) => void) {
      if (patch) {
        updates.push({ table: name, patch });
        return resolve({ data: null, error: null });
      }
      if (name === "qr_cart_items") {
        if (head) return resolve({ count: (items[eqs.cart_id as string] ?? []).length });
        if (itemsError) return resolve({ data: null, error: itemsError });
        return resolve({
          data: (items[eqs.cart_id as string] ?? []).map((r) => pick(r, cols)),
          error: null,
        });
      }
      resolve({ data: [], error: null });
    },
  };
  return api;
}
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (name: string) => tableApi(name),
    rpc: (fn: string, args?: Record<string, unknown>) => {
      rpcCalls.push(fn);
      if (args) rpcArgs.push(args);
      if (fn === "mms_clear_counter_cart")
        return Promise.resolve(
          args?.p_cart_id === "cart-reg" ? clearVerdict : { data: "not_counter", error: null },
        );
      if (fn === "mms_now")
        return Promise.resolve(
          nowError ? { data: null, error: nowError } : { data: DB_NOW, error: null },
        );
      if (fn === "mms_merge_table_orders") return Promise.resolve({ data: 1, error: null });
      return Promise.resolve({ data: null, error: null });
    },
  }),
}));

const { getTableDetail, clearTable, mergeTables, getFloorView } = await import("./floor");

const line = (over: Row): Row => ({
  id: "l",
  name: "Mohinga",
  qty: 1,
  unit_price_cents: 1200,
  by_seat: null,
  created_at: "2026-10-01T00:01:00.000Z",
  menu_item_id: null,
  state: "draft",
  comped: false,
  notes: null,
  modifiers: [],
  fulfillment: "togo",
  modifier_option_ids: null,
  fire_at: null,
  ...over,
});
const cart = (id: string, over: Row = {}): Row => ({
  id,
  locked: false,
  locked_at: null,
  settle_at: null,
  settle_by: null,
  counter_requested_at: null,
  tab_type: "none",
  tab_opened_at: null,
  intended_tip_cents: null,
  promo_code: null,
  customer_name: "Aye",
  counter_arm: "phone",
  ...over,
});
const session = (id: string, qr_code: string, mode: string): Row => ({
  id,
  qr_code,
  table_number: mode === "dinein" ? 7 : null,
  mode,
  status: "active",
  host_seat: null,
  created_at: "2026-10-01T00:00:00.000Z",
});

beforeEach(() => {
  sessions = {
    [REG]: session(REG, "reg-ab12", "pickup"),
    [TABLE]: session(TABLE, "t-7", "dinein"),
    [KIOSK]: session(KIOSK, "kiosk-ab12", "pickup"),
  };
  carts = {
    [REG]: cart("cart-reg"),
    [TABLE]: cart("cart-t", { customer_name: null, counter_arm: null }),
  };
  items = {
    // fired 2 minutes before the DB clock — past the grace there, an hour ahead of the app clock
    "cart-reg": [
      line({ id: "sent", state: "fired", fire_at: dbAgo(120) }),
      line({ id: "draft", qty: 2 }),
    ],
    "cart-t": [line({ id: "t1", state: "fired", fulfillment: "dinein", fire_at: dbAgo(120) })],
  };
  itemsError = null;
  nowError = null;
  updates = [];
  rpcCalls = [];
  rpcArgs = [];
  clearVerdict = { data: "ok", error: null };
  rq.value = null;
});

async function detail(id: string) {
  const r = await getTableDetail(id);
  if (r.kind !== "detail") throw new Error(`expected a detail, got ${r.kind}`);
  return r.detail;
}

describe("getTableDetail — a counter order's facts, on the DB clock", () => {
  it("food past its grace BY THE DB CLOCK: unpaid, its sent line ids, not mergeable", async () => {
    const d = await detail(REG);
    expect(d.counterOrder).toBe(true);
    expect(d.counterArm).toBe("phone");
    expect(d.customerName).toBe("Aye");
    // detail-unpaid-on-the-app-clock
    expect(d.unpaidSent).toBe(true);
    expect(d.sentLineIds).toEqual(["sent"]);
    // the dropped set rides beside it, on the same rows and clock
    expect(d.droppedLineIds).toEqual(["draft"]);
    // mergeable-with-sent-food
    expect(d.mergeable).toBe(false);
    expect(d.payAtPickup).toBe(true);
    expect(d.send.counterDraft).toBe(2);
    // the page's clock is the DB clock on a counter order
    expect(d.serverNow).toBe(DB_NOW);
  });

  it("a send still inside its grace is not unpaid-sent, and the order merges", async () => {
    items["cart-reg"] = [line({ id: "g", state: "fired", fire_at: dbAgo(-5) })];
    const d = await detail(REG);
    expect(d.unpaidSent).toBe(false);
    expect(d.sentLineIds).toEqual([]);
    expect(d.droppedLineIds).toEqual(["g"]);
    expect(d.mergeable).toBe(true);
  });

  it("the DROPPED set is the SQL no-show's effect on the DB clock — a comped in-grace dish included (Codex r2 on #308)", async () => {
    items["cart-reg"] = [
      line({ id: "sent", state: "fired", fire_at: dbAgo(120) }),
      // in grace by the DB clock (5s ahead of it): dropped, comped or not
      line({ id: "comp-grace", state: "fired", comped: true, fire_at: dbAgo(-5) }),
      // past grace BY THE DB CLOCK (the app clock runs an hour behind it here, so an app-clock read
      // would call this in grace and drop it): the kitchen had it, the comp already audited it —
      // neither sent nor dropped
      line({ id: "comp-past", state: "fired", comped: true, fire_at: dbAgo(120) }),
      line({ id: "draft", qty: 2 }),
      line({ id: "bag", fulfillment: "grocery" }),
      line({ id: "cook", state: "in_progress", fire_at: dbAgo(300) }),
    ];
    const d = await detail(REG);
    expect(d.sentLineIds).toEqual(["sent", "cook"]);
    expect(d.droppedLineIds).toEqual(["comp-grace", "draft", "bag"]);
  });

  it("a table with fired food is never unpaid, never a counter order, and merges", async () => {
    const d = await detail(TABLE);
    expect(d.counterOrder).toBe(false);
    expect(d.counterArm).toBeNull();
    expect(d.unpaidSent).toBe(false);
    expect(d.sentLineIds).toEqual([]);
    // off a counter order there is no no-show, so nothing is "dropped" by one
    expect(d.droppedLineIds).toEqual([]);
    expect(d.mergeable).toBe(true);
    // no DB clock read off a counter order
    expect(rpcCalls).not.toContain("mms_now");
  });

  it("an unreadable DB clock falls back to the app clock (advisory — the SQL decides writes)", async () => {
    nowError = { message: "boom" };
    const d = await detail(REG);
    // an hour ahead of the app clock, so on the fallback the line is still in its grace
    expect(d.unpaidSent).toBe(false);
  });

  it("no open cart: no arm, no name, nothing unpaid, nothing to merge", async () => {
    carts[REG] = null;
    const d = await detail(REG);
    expect(d.counterOrder).toBe(true);
    expect(d.counterArm).toBeNull();
    expect(d.customerName).toBeNull();
    expect(d.unpaidSent).toBe(false);
    expect(d.mergeable).toBe(false);
  });
});

describe("clearTable — a counter order's cancel is ONE locked SQL decision", () => {
  it("'sent' refuses with code `sent` and writes NOTHING", async () => {
    clearVerdict = { data: "sent", error: null };
    const r = await clearTable({ sessionId: REG });
    // counter-clear-writes-off-food
    expect(r).toMatchObject({ ok: false, code: "sent" });
    expect(updates).toEqual([]);
  });

  it("'ok' cancelled THIS cart in SQL; the session closes, and no second cancel is written", async () => {
    expect(await clearTable({ sessionId: REG })).toEqual({ ok: true });
    // p2f-cx2-clear/counter-through-plain-cancel · p2f-cx2-clear/wrong-cart-id
    expect(rpcCalls).toContain("mms_clear_counter_cart");
    expect(rpcArgs).toContainEqual({ p_cart_id: "cart-reg" });
    expect(updates.map((u) => u.table)).toEqual(["table_sessions"]);
  });

  it("'not_open' — the cart left open since the read — proceeds, as a no-row cancel always has", async () => {
    // p2f-cx2-clear/not-open-refused
    clearVerdict = { data: "not_open", error: null };
    expect(await clearTable({ sessionId: REG })).toEqual({ ok: true });
    expect(updates.map((u) => u.table)).toEqual(["table_sessions"]);
  });

  it("a table with fired lines still clears through the plain cancel (Clear's precedent)", async () => {
    // p2f-cx2-clear/table-through-the-counter-rpc
    expect(await clearTable({ sessionId: TABLE })).toEqual({ ok: true });
    expect(rpcCalls).not.toContain("mms_clear_counter_cart");
    expect(updates.map((u) => u.table)).toEqual(["qr_carts", "table_sessions"]);
  });

  it("an RPC error refuses as an outage and writes nothing (fail closed)", async () => {
    // p2f-cx2-clear/rpc-error-proceeds
    // `data` carries a would-be 'ok' on purpose: with null data the unknown-verdict branch refuses
    // anyway, and this case could not tell whether the error itself is ever read as a verdict.
    clearVerdict = { data: "ok", error: { message: "boom" } };
    expect(await clearTable({ sessionId: REG })).toEqual({ ok: false, error: "outage" });
    expect(updates).toEqual([]);
  });

  it("any other verdict refuses as an outage and writes nothing (fail closed)", async () => {
    // p2f-cx2-clear/unexpected-verdict-proceeds
    for (const v of ["not_counter", "not_found", null]) {
      clearVerdict = { data: v, error: null };
      expect(await clearTable({ sessionId: REG })).toEqual({ ok: false, error: "outage" });
    }
    expect(updates).toEqual([]);
  });
});

describe("mergeTables — never into a counter order, never one whose food is in the kitchen", () => {
  it("a sent counter source is refused before the RPC", async () => {
    sessions[TABLE] = session(TABLE, "reg-zz99", "pickup");
    carts[TABLE] = cart("cart-t2", { customer_name: "Ko" });
    items["cart-t2"] = [];
    // counter-order-merged
    const r = await mergeTables({ sourceSessionId: REG, targetSessionId: TABLE });
    expect(r.ok).toBe(false);
    expect(rpcCalls).not.toContain("mms_merge_table_orders");
  });

  it("a drafts-only counter source into a table-kind target reaches the RPC", async () => {
    // Same mode needed: a second pickup, NOT a counter order (a diner's own pickup).
    sessions[TABLE] = session(TABLE, "T9", "pickup");
    items["cart-reg"] = [line({ id: "d" })];
    const r = await mergeTables({ sourceSessionId: REG, targetSessionId: TABLE });
    expect(r).toMatchObject({ ok: true });
    expect(rpcCalls).toContain("mms_merge_table_orders");
  });

  it("a counter TARGET is refused, even from a source with nothing sent", async () => {
    sessions[KIOSK] = session(KIOSK, "T9", "pickup");
    carts[KIOSK] = cart("cart-k", { customer_name: null });
    items["cart-k"] = [];
    items["cart-reg"] = [line({ id: "d" })];
    // merge-into-a-counter-order
    const r = await mergeTables({ sourceSessionId: KIOSK, targetSessionId: REG });
    expect(r.ok).toBe(false);
    expect(rpcCalls).not.toContain("mms_merge_table_orders");
  });

  it("an unreadable check refuses as an outage", async () => {
    sessions[TABLE] = session(TABLE, "T9", "pickup");
    itemsError = { message: "boom" };
    expect(await mergeTables({ sourceSessionId: REG, targetSessionId: TABLE })).toEqual({
      ok: false,
      error: "outage",
    });
  });
});

describe("getFloorView — a register row's unpaid food and kitchen row", () => {
  const qline = (over: Row) => ({
    id: "q",
    qty: 1,
    state: "fired",
    fulfillment: "togo",
    fire_at: dbAgo(120),
    bumped_at: null,
    comped: false,
    by_seat: null,
    ...over,
  });
  const row = (sessionId: string, source: "register" | "kiosk") => ({
    sessionId,
    customerName: "Aye",
    itemCount: 1,
    subtotalCents: 1200,
    startedAt: "2026-10-01T00:00:00.000Z",
    source,
  });

  it("a register row with a line past its grace is unpaid-sent with a kitchen row; a kiosk row never", async () => {
    rq.value = {
      ok: true,
      rows: [row(REG, "register"), row(KIOSK, "kiosk")],
      truncated: false,
      lines: new Map([
        [REG, [qline({ id: "r1" })]],
        [KIOSK, [qline({ id: "k1" })]],
      ]),
    };
    const r = await getFloorView();
    if (!r.ok) throw new Error("expected a snapshot");
    const [reg, kiosk] = r.snapshot.counter;
    expect(reg).toMatchObject({ sessionId: REG, unpaidSent: true });
    expect(reg?.kitchen).toMatchObject({ inKitchen: 1 });
    // unpaid-flag-on-a-kiosk-order
    expect(kiosk).toMatchObject({ sessionId: KIOSK, unpaidSent: false, kitchen: null });
  });

  it("a register row whose only send is inside its grace is not unpaid-sent", async () => {
    rq.value = {
      ok: true,
      rows: [row(REG, "register")],
      truncated: false,
      lines: new Map([[REG, [qline({ id: "r1", fire_at: dbAgo(-5) })]]]),
    };
    const r = await getFloorView();
    if (!r.ok) throw new Error("expected a snapshot");
    expect(r.snapshot.counter[0]).toMatchObject({ unpaidSent: false });
  });
});
