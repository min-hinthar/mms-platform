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
/** What `getCartOrderId` answers — an Error is THROWN (a 403 verdict, or an outage). */
let cartOrder: string | null | Error = null;
vi.mock("./order", () => ({
  getCartOrderId: () =>
    cartOrder instanceof Error ? Promise.reject(cartOrder) : Promise.resolve(cartOrder),
}));

type Row = Record<string, unknown>;
let cart: Row | null = null;
/** The cart's lines — the count EVALUATES the action's filters against these (state / comped). */
let items: Row[] = [];
let members: Row[] = [];
/** Phase 2c · gate — the session rows the host read sees (`host_seat`). */
let sessions: Row[] = [];
let orders: Row[] = [];
/** Session truth — the `qr_table_clears` rows (`mms_clear_table`'s durable record). */
let clears: Row[] = [];
/** Session truth — a table whose read answers an error (the other reads unaffected). */
let failTable: string | null = null;
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
      : table === "table_sessions"
        ? sessions
        : table === "qr_orders"
          ? orders
          : table === "qr_table_clears"
            ? clears
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
      if (readFails || failTable === table)
        return Promise.resolve({ data: null, error: { message: "read failed" } });
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
      if (table === "qr_table_clears" && head) {
        resolve(
          failTable === table
            ? { data: null, count: null, error: { message: "count failed" } }
            : { data: null, count: clears.filter((r) => matches(r, filters)).length, error: null },
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

/** A session clock well inside / well past its expiry, so no case races the wall clock. */
const LATER = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const EARLIER = new Date(Date.now() - 60 * 60 * 1000).toISOString();

beforeEach(() => {
  authz = OPEN_AUTHZ;
  callerUid = "u-1";
  cart = { id: "c-1", session_id: "s-1", status: "open", counter_requested_at: null };
  items = [
    { cart_id: "c-1", state: "fired", comped: false },
    { cart_id: "c-1", state: "draft", comped: false },
  ];
  members = [{ session_id: "s-1", seat_id: "u-1" }];
  sessions = [{ id: "s-1", host_seat: null, status: "active", expires_at: LATER }];
  orders = [];
  clears = [];
  failTable = null;
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
  it("refuses a settling cart as settling and writes nothing — in the REGISTER's words while the split is parked (PD2, m2 decision 15)", async () => {
    authz = { ...OPEN_AUTHZ, settling: true };
    // `SURFACES.selfServeSplit` is read for real: only the register holds the freeze today, so the
    // sentence must not name a split the table cannot open.
    expect(await requestCounterPay({ cartId: "c-1" })).toMatchObject({
      ok: false,
      reason: "settling",
      error:
        "The counter is taking your table’s payment right now — this screen updates when it’s done.",
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

// ── PD2 (m2 STATES "Unsent dishes", decision 12) — the ask CARRIES unsent dishes ──
describe("requestCounterPay — the ask carries unsent dishes to the counter (PD2's lift, after P2do)", () => {
  it("a hosted table holding unsent dine-in dishes asks, and is stamped — the counter checks them with the table", async () => {
    // Phase 2c refused this as `unsent` until counter-floor's P2do; P2do shipped (#334): the floor
    // reads "Not sent yet" on an asked table, and the register's settle doors still refuse over
    // unsent dishes on their own (the staff gate), so the ask moves no money.
    sessions = [{ id: "s-1", host_seat: "u-1" }];
    items = [
      { cart_id: "c-1", state: "draft", fulfillment: "dinein", qty: 2, comped: false },
      { cart_id: "c-1", state: "fired", fulfillment: "dinein", qty: 1, comped: false },
    ];
    const r = await requestCounterPay({ cartId: "c-1" });
    expect(r.ok).toBe(true);
    expect(typeof cart!.counter_requested_at).toBe("string");
    if (r.ok) expect(r.counterRequestedAt).toBe(cart!.counter_requested_at);
  });

  it("a table of nothing but unsent dishes asks too — a draft is something to settle", async () => {
    sessions = [{ id: "s-1", host_seat: "u-1" }];
    items = [{ cart_id: "c-1", state: "draft", fulfillment: "dinein", qty: 2, comped: false }];
    expect((await requestCounterPay({ cartId: "c-1" })).ok).toBe(true);
  });

  it("a hostless table and a to-go draft ask exactly as before", async () => {
    sessions = [{ id: "s-1", host_seat: null }];
    items = [{ cart_id: "c-1", state: "draft", fulfillment: "dinein", qty: 2, comped: false }];
    expect((await requestCounterPay({ cartId: "c-1" })).ok).toBe(true);
    cart!.counter_requested_at = null;
    sessions = [{ id: "s-1", host_seat: "u-1" }];
    items = [
      { cart_id: "c-1", state: "draft", fulfillment: "togo", qty: 1, comped: false },
      { cart_id: "c-1", state: "served", fulfillment: "dinein", qty: 2, comped: false },
    ];
    expect((await requestCounterPay({ cartId: "c-1" })).ok).toBe(true);
  });

  it("the wider refusals still hold over unsent dishes — a frozen or locked table says that", async () => {
    sessions = [{ id: "s-1", host_seat: "u-1" }];
    items = [{ cart_id: "c-1", state: "draft", fulfillment: "dinein", qty: 2, comped: false }];
    authz = { ...OPEN_AUTHZ, locked: true };
    expect(await requestCounterPay({ cartId: "c-1" })).toMatchObject({
      ok: false,
      reason: "paying",
    });
    authz = { ...OPEN_AUTHZ, settling: true };
    expect(await requestCounterPay({ cartId: "c-1" })).toMatchObject({
      ok: false,
      reason: "settling",
    });
    expect(cart!.counter_requested_at).toBeNull();
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
      sessionLive: true,
      complete: true,
    });
    cartOrder = "o-9";
    expect(await counterPayOutcome({ cartId: "c-1" })).toEqual({
      kind: "paid",
      tender: "counter",
      orderId: "o-9",
      sessionLive: true,
      complete: true,
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
      sessionLive: true,
      complete: true,
    });
  });
  it("a paid cart whose order row is not readable yet reports tender unknown", async () => {
    cart!.status = "paid";
    expect(await counterPayOutcome({ cartId: "c-1" })).toEqual({
      kind: "paid",
      tender: "unknown",
      orderId: null,
      sessionLive: true,
      complete: true,
    });
  });
  it("Codex round 2 on #361 — a FAILED order read is an incomplete answer, never 'no order'", async () => {
    // MUTATION (lcs/outcome-failed-tender-read-is-complete): the failed read is cached as the
    // end — tender unknown and no receipt link, with the poll stopped, for as long as the card is
    // open. An unknowable read establishes nothing (M116).
    cart!.status = "paid";
    orders = [{ cart_id: "c-1", status: "paid", tender: "cash" }];
    failTable = "qr_orders";
    expect(await counterPayOutcome({ cartId: "c-1" })).toEqual({
      kind: "paid",
      tender: "unknown",
      orderId: null,
      sessionLive: true,
      complete: false,
    });
  });
  it("Codex round 2 on #361 — an OUTAGE on the visibility read is incomplete; the gate's own 403 is a verdict", async () => {
    // MUTATION (lcs/outcome-failed-order-id-is-complete): every throw reads as "no order this
    // seat may see" — an outage drops the receipt link for good.
    // MUTATION (lcs/outcome-refusal-is-incomplete): a 403 reads as an outage too — a tablemate's
    // card order on a table staff then cleared (`assertSessionMember` refuses a closed session by
    // design) is asked about once a minute for as long as the card is open, and never resolves.
    cart!.status = "paid";
    orders = [{ cart_id: "c-1", status: "paid", tender: "card" }];
    cartOrder = new AuthzError("We’re having trouble on our end", 503, "unavailable");
    expect(await counterPayOutcome({ cartId: "c-1" })).toMatchObject({
      tender: "card",
      orderId: null,
      complete: false,
    });
    cartOrder = new Error("fetch failed");
    expect(await counterPayOutcome({ cartId: "c-1" })).toMatchObject({ complete: false });
    sessions = [{ id: "s-1", host_seat: null, status: "closed", expires_at: LATER }];
    cartOrder = new AuthzError("Session is no longer active", 403, "session_expired");
    expect(await counterPayOutcome({ cartId: "c-1" })).toEqual({
      kind: "paid",
      tender: "card",
      orderId: null,
      sessionLive: false,
      complete: true,
    });
  });
  it("session truth — a paid table staff then closed says so: `sessionLive` false, so the menu's new order never stays at it", async () => {
    cart!.status = "paid";
    sessions = [{ id: "s-1", host_seat: null, status: "closed", expires_at: LATER }];
    expect(await counterPayOutcome({ cartId: "c-1" })).toMatchObject({
      kind: "paid",
      sessionLive: false,
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
  it("session truth — a stranger is told nothing about a CLEARED table either (the gate sits before every disclosure)", async () => {
    // MUTATION (counter/outcome-answers-a-stranger, the gate's own mutant): without the membership
    // read, any uuid answers whether that table was cleared.
    members = [{ session_id: "s-1", seat_id: "u-2" }];
    cart!.status = "cancelled";
    sessions = [{ id: "s-1", host_seat: null, status: "closed", expires_at: LATER }];
    clears = [{ id: "clr-1", session_id: "s-1" }];
    expect(await counterPayOutcome({ cartId: "c-1" })).toEqual({ kind: "unknown" });
  });
  it("session truth — a MISSING cart is unknown, the same answer a stranger gets (no existence oracle)", async () => {
    // MUTATION (lcs/outcome-missing-cart-is-a-verdict): answer `ended` for a uuid that names no
    // cart — the action then tells anyone which ids are real carts.
    cart = null;
    expect(await counterPayOutcome({ cartId: "c-1" })).toEqual({ kind: "unknown" });
  });
  it("session truth — a staff CLEAR reads `cleared` (its `qr_table_clears` row names the session)", async () => {
    cart!.status = "cancelled";
    sessions = [{ id: "s-1", host_seat: null, status: "closed", expires_at: LATER }];
    clears = [{ id: "clr-1", session_id: "s-1" }];
    expect(await counterPayOutcome({ cartId: "c-1" })).toEqual({ kind: "ended", why: "cleared" });
    // Another table's clear says nothing about this one.
    clears = [{ id: "clr-2", session_id: "s-other" }];
    expect(await counterPayOutcome({ cartId: "c-1" })).toEqual({ kind: "ended", why: "closed" });
  });
  it("session truth — a MERGE (cancelled cart, closed session, no clear record) reads the neutral `closed`", async () => {
    cart!.status = "cancelled";
    sessions = [{ id: "s-1", host_seat: null, status: "closed", expires_at: LATER }];
    expect(await counterPayOutcome({ cartId: "c-1" })).toEqual({ kind: "ended", why: "closed" });
  });
  it("session truth — the SWEEP (an open cart on a session past its clock) reads `expired`, swept or not yet", async () => {
    // MUTATION (lcs/outcome-open-cart-on-a-dead-session): trust the cart's `open` alone — an open
    // cart on a swept session answers `open`, the menu stays frozen, and the next tap re-mints.
    sessions = [{ id: "s-1", host_seat: null, status: "active", expires_at: EARLIER }];
    expect(await counterPayOutcome({ cartId: "c-1" })).toEqual({ kind: "ended", why: "expired" });
    sessions = [{ id: "s-1", host_seat: null, status: "closed", expires_at: EARLIER }];
    expect(await counterPayOutcome({ cartId: "c-1" })).toEqual({ kind: "ended", why: "expired" });
  });
  it("session truth — a failed session or clear read is unknown, never a guess between a clear and a merge", async () => {
    cart!.status = "cancelled";
    sessions = [{ id: "s-1", host_seat: null, status: "closed", expires_at: LATER }];
    clears = [{ id: "clr-1", session_id: "s-1" }];
    failTable = "qr_table_clears";
    expect(await counterPayOutcome({ cartId: "c-1" })).toEqual({ kind: "unknown" });
    failTable = "table_sessions";
    expect(await counterPayOutcome({ cartId: "c-1" })).toEqual({ kind: "unknown" });
  });
  it("an unreadable cart is unknown, never a verdict", async () => {
    readFails = true;
    expect(await counterPayOutcome({ cartId: "c-1" })).toEqual({ kind: "unknown" });
  });
});
