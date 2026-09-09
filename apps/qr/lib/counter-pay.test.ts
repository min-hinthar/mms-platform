import { beforeEach, describe, expect, it, vi } from "vitest";
/**
 * A1 — `requestCounterPay` / `withdrawCounterPay` / `counterPayOutcome` against a fake PostgREST
 * that EVALUATES its filters (the cart-promo-freeze pattern): a mutant that drops
 * `.eq("status", "open")` or `.is("counter_requested_at", null)` changes the OUTCOME here, not a
 * call transcript.
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
let authz: Authz | (() => never) = {
  uid: "u-1",
  sessionId: "s-1",
  locked: false,
  settling: false,
  mode: "dinein",
};
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
  assertCartMember: () => {
    if (typeof authz === "function") return Promise.reject(authz());
    return Promise.resolve(authz);
  },
}));
let cartOrder: string | null = null;
vi.mock("./order", () => ({ getCartOrderId: () => Promise.resolve(cartOrder) }));

type Row = Record<string, unknown>;
let cart: Row | null = null;
let itemCount = 2;
let countFails = false;
let updateFails = false;
let readFails = false;

type Filter = { kind: "eq" | "is"; col: string; val: unknown };
const matches = (r: Row, filters: Filter[]) =>
  filters.every((f) =>
    f.kind === "eq"
      ? r[f.col] === f.val
      : f.val === null
        ? r[f.col] === null || r[f.col] === undefined
        : r[f.col] === f.val,
  );
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
    select() {
      // `.update(...).select("id")` — the row-count read the action depends on.
      return api;
    },
    maybeSingle() {
      if (readFails) return Promise.resolve({ data: null, error: { message: "read failed" } });
      const hit = cart && matches(cart, filters) ? { ...cart } : null;
      return Promise.resolve({ data: hit, error: null });
    },
    then(resolve: (r: { data: Row[] | null; count: number | null; error: unknown }) => void) {
      if (table === "qr_cart_items" && head) {
        resolve(
          countFails
            ? { data: null, count: null, error: { message: "count failed" } }
            : { data: null, count: itemCount, error: null },
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
        data: cart && matches(cart, filters) ? [{ ...cart }] : [],
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
  authz = { uid: "u-1", sessionId: "s-1", locked: false, settling: false, mode: "dinein" };
  cart = { id: "c-1", status: "open", counter_requested_at: null };
  itemCount = 2;
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

  it("refuses a pickup cart, a locked cart, a settling cart and an empty cart — and writes nothing", async () => {
    authz = { ...(authz as Authz), mode: "pickup" };
    expect((await requestCounterPay({ cartId: "c-1" })).ok).toBe(false);
    authz = { ...(authz as Authz), mode: "dinein", locked: true };
    const locked = await requestCounterPay({ cartId: "c-1" });
    expect(locked).toMatchObject({ ok: false, reason: "paying" });
    authz = { ...(authz as Authz), locked: false, settling: true };
    expect(await requestCounterPay({ cartId: "c-1" })).toMatchObject({
      ok: false,
      reason: "settling",
    });
    authz = { ...(authz as Authz), settling: false };
    itemCount = 0;
    expect(await requestCounterPay({ cartId: "c-1" })).toMatchObject({
      ok: false,
      reason: "empty",
    });
    expect(cart!.counter_requested_at).toBeNull();
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
    authz = { ...(authz as Authz), locked: true };
    expect(await withdrawCounterPay({ cartId: "c-1" })).toEqual({
      ok: true,
      counterRequestedAt: null,
    });
    expect(cart!.counter_requested_at).toBeNull();
  });
  it("never touches a settled cart", async () => {
    cart = { id: "c-1", status: "paid", counter_requested_at: "2026-09-09T10:00:00.000Z" };
    authz = () => {
      throw new AuthzError("Cart is no longer open", 403, "cart_closed");
    };
    expect(await withdrawCounterPay({ cartId: "c-1" })).toMatchObject({
      ok: false,
      reason: "closed",
    });
    expect(cart.counter_requested_at).toBe("2026-09-09T10:00:00.000Z");
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
  it("open → open; paid → paid with the member's order id; a paid cart with no visible order carries null", async () => {
    expect(await counterPayOutcome({ cartId: "c-1" })).toEqual({ kind: "open" });
    cart!.status = "paid";
    expect(await counterPayOutcome({ cartId: "c-1" })).toEqual({ kind: "paid", orderId: null });
    cartOrder = "o-9";
    expect(await counterPayOutcome({ cartId: "c-1" })).toEqual({ kind: "paid", orderId: "o-9" });
  });
  it("a missing or cancelled cart is gone; an unreadable one is unknown, never a verdict", async () => {
    cart = null;
    expect(await counterPayOutcome({ cartId: "c-1" })).toEqual({ kind: "gone" });
    cart = { id: "c-1", status: "cancelled", counter_requested_at: null };
    expect(await counterPayOutcome({ cartId: "c-1" })).toEqual({ kind: "gone" });
    readFails = true;
    expect(await counterPayOutcome({ cartId: "c-1" })).toEqual({ kind: "unknown" });
  });
});
