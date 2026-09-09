import { beforeEach, describe, expect, it, vi } from "vitest";
/**
 * A1 — `requestCounterPay` / `withdrawCounterPay` / `counterPayOutcome` against a fake PostgREST
 * that EVALUATES its filters (the cart-promo-freeze pattern): a mutant that drops
 * `.eq("status", "open")`, `.is("counter_requested_at", null)` or the line-state filters changes
 * the OUTCOME here, not a call transcript.
 */
vi.mock("server-only", () => ({}));
vi.mock("@mms/db/schemas", () => ({
  counterPayInput: {
    safeParse: (x: unknown) => {
      const cartId = (x as { cartId?: unknown } | null)?.cartId;
      return typeof cartId === "string" && cartId.length > 0
        ? { success: true, data: { cartId } }
        : { success: false };
    },
  },
}));

type Authz = {
  uid: string;
  sessionId: string;
  locked: boolean;
  settling: boolean;
  mode: "dinein" | "scango" | "pickup";
};
const OPEN_AUTHZ: Authz = {
  uid: "u-1",
  sessionId: "s-1",
  locked: false,
  settling: false,
  mode: "dinein",
};
let authz: Authz | (() => never) = OPEN_AUTHZ;
let callerUid: string | null = "u-1";
class AuthzError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}
vi.mock("./authz", () => ({
  AuthzError,
  getCallerUid: () =>
    callerUid ? Promise.resolve(callerUid) : Promise.reject(new Error("no uid")),
  assertCartMember: () => {
    if (typeof authz === "function") return Promise.reject(authz());
    return Promise.resolve(authz);
  },
}));
let cartOrder: string | null = null;
vi.mock("./order", () => ({ getCartOrderId: () => Promise.resolve(cartOrder) }));

type Row = Record<string, unknown>;
let cart: Row | null = null;
/** The cart's lines — the count EVALUATES the action's filters against these (state / comped). */
let items: Row[] = [];
let members: Row[] = [];
let orders: Row[] = [];
let countFails = false;
let updateFails = false;
let readFails = false;

type Filter = { kind: "eq" | "is" | "neq"; col: string; val: unknown };
const matches = (r: Row, filters: Filter[]) =>
  filters.every((f) =>
    f.kind === "eq"
      ? r[f.col] === f.val
      : f.kind === "neq"
        ? r[f.col] !== f.val
        : f.val === null
          ? r[f.col] === null || r[f.col] === undefined
          : r[f.col] === f.val,
  );
const rowsFor = (table: string): Row[] =>
  table === "qr_cart_items"
    ? items
    : table === "session_members"
      ? members
      : table === "qr_orders"
        ? orders
        : cart
          ? [cart]
          : [];
function builder(table: string, mode: "select" | "update", values: Row | null, head: boolean) {
  const filters: Filter[] = [];
  const api = {
    eq(col: string, val: unknown) {
      filters.push({ kind: "eq", col, val });
      return api;
    },
    is(col: string, val: unknown) {
      filters.push({ kind: "is", col, val });
      return api;
    },
    neq(col: string, val: unknown) {
      filters.push({ kind: "neq", col, val });
      return api;
    },
    limit() {
      return api;
    },
    select() {
      // `.update(...).select("id")` — the row-count read the action depends on.
      return api;
    },
    maybeSingle() {
      if (readFails) return Promise.resolve({ data: null, error: { message: "read failed" } });
      const hit = rowsFor(table).find((r) => matches(r, filters));
      return Promise.resolve({ data: hit ? { ...hit } : null, error: null });
    },
    then(resolve: (r: { data: Row[] | null; count: number | null; error: unknown }) => void) {
      if (table === "qr_cart_items" && head) {
        resolve(
          countFails
            ? { data: null, count: null, error: { message: "count failed" } }
            : { data: null, count: items.filter((r) => matches(r, filters)).length, error: null },
        );
        return;
      }
      if (mode === "update") {
        if (updateFails) {
          resolve({ data: null, count: null, error: { message: "update failed" } });
          return;
        }
        const hit = cart !== null && matches(cart, filters);
        if (hit && values) Object.assign(cart as Row, values);
        resolve({ data: hit ? [{ id: cart!.id }] : [], count: null, error: null });
        return;
      }
      resolve({
        data: rowsFor(table).filter((r) => matches(r, filters)),
        count: null,
        error: null,
      });
    },
  };
  return api;
}
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (table: string) => ({
      select: (_cols: string, opts?: { head?: boolean }) =>
        builder(table, "select", null, !!opts?.head),
      update: (values: Row) => builder(table, "update", values, false),
    }),
  }),
}));

const { requestCounterPay, withdrawCounterPay, counterPayOutcome } = await import("./counter-pay");

beforeEach(() => {
  authz = OPEN_AUTHZ;
  callerUid = "u-1";
  cart = { id: "c-1", session_id: "s-1", status: "open", counter_requested_at: null };
  items = [
    { cart_id: "c-1", state: "fired", comped: false },
    { cart_id: "c-1", state: "draft", comped: false },
  ];
  members = [{ session_id: "s-1", seat_id: "u-1" }];
  orders = [];
  countFails = false;
  updateFails = false;
  readFails = false;
  cartOrder = null;
});

describe("requestCounterPay", () => {
  it("stamps an open dine-in cart with items, and reports the stamp", async () => {
    const r = await requestCounterPay({ cartId: "c-1" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.counterRequestedAt).toBe(cart!.counter_requested_at);
    expect(typeof cart!.counter_requested_at).toBe("string");
  });

  it("re-asking keeps the FIRST stamp (idempotent, never pushes the table down the queue)", async () => {
    cart!.counter_requested_at = "2026-09-09T10:00:00.000Z";
    const r = await requestCounterPay({ cartId: "c-1" });
    expect(r).toEqual({ ok: true, counterRequestedAt: "2026-09-09T10:00:00.000Z" });
    expect(cart!.counter_requested_at).toBe("2026-09-09T10:00:00.000Z");
  });

  // One refusal per case, each naming its REASON — a block that aborted on the first failing
  // `expect` hid the later rules, and `.ok === false` alone let a wrong reason pass (blind audit).
  it("refuses a pickup cart as not_dinein and writes nothing", async () => {
    authz = { ...OPEN_AUTHZ, mode: "pickup" };
    expect(await requestCounterPay({ cartId: "c-1" })).toMatchObject({
      ok: false,
      reason: "not_dinein",
    });
    expect(cart!.counter_requested_at).toBeNull();
  });
  it("refuses a locked cart as paying and writes nothing", async () => {
    authz = { ...OPEN_AUTHZ, locked: true };
    expect(await requestCounterPay({ cartId: "c-1" })).toMatchObject({
      ok: false,
      reason: "paying",
    });
    expect(cart!.counter_requested_at).toBeNull();
  });
  it("refuses a settling cart as settling and writes nothing", async () => {
    authz = { ...OPEN_AUTHZ, settling: true };
    expect(await requestCounterPay({ cartId: "c-1" })).toMatchObject({
      ok: false,
      reason: "settling",
    });
    expect(cart!.counter_requested_at).toBeNull();
  });
  it("refuses an empty cart as empty and writes nothing", async () => {
    items = [];
    expect(await requestCounterPay({ cartId: "c-1" })).toMatchObject({
      ok: false,
      reason: "empty",
    });
    expect(cart!.counter_requested_at).toBeNull();
  });
  it("a cart whose every line is voided or comped is EMPTY — the same count the floor keeps", async () => {
    // Blind audit CRITICAL 3: the action counted every row while the floor counted chargeable
    // lines, so a fully-voided table got the counter card and the register never saw the ask.
    items = [
      { cart_id: "c-1", state: "voided", comped: false },
      { cart_id: "c-1", state: "fired", comped: true },
    ];
    expect(await requestCounterPay({ cartId: "c-1" })).toMatchObject({
      ok: false,
      reason: "empty",
    });
    // …and one live line is enough.
    items.push({ cart_id: "c-1", state: "fired", comped: false });
    expect((await requestCounterPay({ cartId: "c-1" })).ok).toBe(true);
  });

  it("a cart that closed between authz and the write answers 'closed', never 'asked'", async () => {
    // The status guard is IN the statement: the fake row is paid, so the update matches nothing
    // and the diagnosis read names the real state.
    cart!.status = "paid";
    const r = await requestCounterPay({ cartId: "c-1" });
    expect(r).toMatchObject({ ok: false, reason: "closed" });
    expect(cart!.counter_requested_at).toBeNull();
  });

  it("an unreadable count is an outage, not an empty table", async () => {
    countFails = true;
    expect(await requestCounterPay({ cartId: "c-1" })).toMatchObject({
      ok: false,
      reason: "error",
    });
    expect(cart!.counter_requested_at).toBeNull();
  });

  it("a closed cart at authz reports closed; a transport failure reports error", async () => {
    authz = () => {
      throw new AuthzError("Cart is no longer open", 403, "cart_closed");
    };
    expect(await requestCounterPay({ cartId: "c-1" })).toMatchObject({
      ok: false,
      reason: "closed",
    });
    authz = () => {
      throw new AuthzError("unavailable", 503, "unavailable");
    };
    expect(await requestCounterPay({ cartId: "c-1" })).toMatchObject({
      ok: false,
      reason: "error",
    });
  });

  it("a malformed request is refused before any read", async () => {
    expect(await requestCounterPay({})).toMatchObject({ ok: false, reason: "error" });
    expect(await requestCounterPay(null)).toMatchObject({ ok: false, reason: "error" });
  });
});

describe("withdrawCounterPay", () => {
  it("clears the stamp on an open cart, freeze or not", async () => {
    cart!.counter_requested_at = "2026-09-09T10:00:00.000Z";
    authz = { ...OPEN_AUTHZ, locked: true };
    expect(await withdrawCounterPay({ cartId: "c-1" })).toEqual({
      ok: true,
      counterRequestedAt: null,
    });
    expect(cart!.counter_requested_at).toBeNull();
  });
  it("never touches a settled cart, and says 'closed' whether authz or the row count reports it", async () => {
    cart = {
      id: "c-1",
      session_id: "s-1",
      status: "paid",
      counter_requested_at: "2026-09-09T10:00:00.000Z",
    };
    authz = () => {
      throw new AuthzError("Cart is no longer open", 403, "cart_closed");
    };
    expect(await withdrawCounterPay({ cartId: "c-1" })).toMatchObject({
      ok: false,
      reason: "closed",
    });
    expect(cart.counter_requested_at).toBe("2026-09-09T10:00:00.000Z");
    // The cart settled BETWEEN authz and the write: the status guard in the statement matches
    // nothing, and the read-back names the real state instead of reporting a withdrawal.
    authz = OPEN_AUTHZ;
    expect(await withdrawCounterPay({ cartId: "c-1" })).toMatchObject({
      ok: false,
      reason: "closed",
    });
    expect(cart.counter_requested_at).toBe("2026-09-09T10:00:00.000Z");
  });
  it("withdrawing an ask that is already null is still ok", async () => {
    expect(await withdrawCounterPay({ cartId: "c-1" })).toEqual({
      ok: true,
      counterRequestedAt: null,
    });
  });
  it("a failed write is an error, not a withdrawal", async () => {
    cart!.counter_requested_at = "2026-09-09T10:00:00.000Z";
    updateFails = true;
    expect(await withdrawCounterPay({ cartId: "c-1" })).toMatchObject({
      ok: false,
      reason: "error",
    });
  });
});

describe("counterPayOutcome", () => {
  it("open → open", async () => {
    expect(await counterPayOutcome({ cartId: "c-1" })).toEqual({ kind: "open" });
  });
  it("a COUNTER settle reports tender counter, with the member's order id when one is visible", async () => {
    cart!.status = "paid";
    orders = [{ cart_id: "c-1", status: "paid", tender: "cash" }];
    expect(await counterPayOutcome({ cartId: "c-1" })).toEqual({
      kind: "paid",
      tender: "counter",
      orderId: null,
    });
    cartOrder = "o-9";
    expect(await counterPayOutcome({ cartId: "c-1" })).toEqual({
      kind: "paid",
      tender: "counter",
      orderId: "o-9",
    });
    orders = [{ cart_id: "c-1", status: "paid", tender: "terminal" }];
    expect(await counterPayOutcome({ cartId: "c-1" })).toMatchObject({ tender: "counter" });
  });
  it("a tablemate's CARD reports tender card — never 'settled at the counter' (blind audit, CRITICAL 1)", async () => {
    cart!.status = "paid";
    orders = [{ cart_id: "c-1", status: "paid", tender: "card" }];
    expect(await counterPayOutcome({ cartId: "c-1" })).toEqual({
      kind: "paid",
      tender: "card",
      orderId: null,
    });
  });
  it("a paid cart whose order row is not readable yet reports tender unknown", async () => {
    cart!.status = "paid";
    expect(await counterPayOutcome({ cartId: "c-1" })).toEqual({
      kind: "paid",
      tender: "unknown",
      orderId: null,
    });
  });
  it("a NON-member gets unknown, not the cart's status — a cart id is in every URL", async () => {
    members = [{ session_id: "s-1", seat_id: "u-2" }];
    expect(await counterPayOutcome({ cartId: "c-1" })).toEqual({ kind: "unknown" });
    cart!.status = "paid";
    expect(await counterPayOutcome({ cartId: "c-1" })).toEqual({ kind: "unknown" });
    callerUid = null;
    members = [{ session_id: "s-1", seat_id: "u-1" }];
    expect(await counterPayOutcome({ cartId: "c-1" })).toEqual({ kind: "unknown" });
  });
  it("a missing or cancelled cart is gone; an unreadable one is unknown, never a verdict", async () => {
    cart = null;
    expect(await counterPayOutcome({ cartId: "c-1" })).toEqual({ kind: "gone" });
    cart = { id: "c-1", session_id: "s-1", status: "cancelled", counter_requested_at: null };
    expect(await counterPayOutcome({ cartId: "c-1" })).toEqual({ kind: "gone" });
    readFails = true;
    expect(await counterPayOutcome({ cartId: "c-1" })).toEqual({ kind: "unknown" });
  });
});
