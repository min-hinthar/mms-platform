import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * W6b — the kiosk's authority rules, asserted as QUERIES + gate behavior (the degenerate-mock
 * lesson: assert predicates and payloads, never a chosen answer):
 *
 *   • the device token is the ONLY authority (constant-time compare; UNSET = feature off — a kiosk
 *     with no configured token must refuse, never open);
 *   • the reset's destruction is scoped to `kiosk-` sessions IN THE STATEMENTS — the token can
 *     never close a diner table or a staff counter order;
 *   • the reset DEFERS TO THE REGISTER: the cart cancel carries the counter-settle freeze + pay-lock
 *     predicates, so an idle reset can never destroy an order money is moving on;
 *   • the mint writes the membership row (it is what authorizes every later diner-path cart write)
 *     and refuses an OCCUPIED table (a kiosk claim must never open a second cart over a seated
 *     party's order).
 */

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: () => Promise.resolve({}) }));
vi.mock("./session-code", () => ({ generateJoinCode: () => "ABCD1234" }));

/**
 * The device gate moved to `./device-auth` (shared with the board). It is mocked here so this file
 * can drive the one thing it owns: how `kioskReset` MAPS a gate refusal to its own reason. The gate's
 * own rules — token first, the zero-cost wrong-token path, the staff credential — are asserted in
 * `device-auth.test.ts`; duplicating them here would be two copies of one rule.
 */
let gateAnswer: { ok: boolean; via?: string; reason?: string } | null = null;
vi.mock("./device-auth", async (importOriginal) => {
  const real = (await importOriginal()) as Record<string, unknown>;
  return {
    ...real,
    authorizeDevice: (surface: "kiosk" | "board", given: string) =>
      gateAnswer
        ? Promise.resolve(gateAnswer)
        : (real.authorizeDevice as (s: string, g: string) => Promise<unknown>)(surface, given),
  };
});

type Q = {
  table: string;
  op: "select" | "insert" | "update";
  payload?: Record<string, unknown>;
  eq: [string, unknown][];
  like: [string, string][];
  or: string[];
};
let queries: Q[] = [];
/** Scripted single-row answers keyed by table for maybeSingle reads. */
let tableRow: Record<string, unknown> | null = null;
let occupiedRow: Record<string, unknown> | null = null;
/** The reset's scope read (table_sessions select WITHOUT a table_number filter). */
let sessionRow: Record<string, unknown> | null = { id: "sess-1" };
let closedRows: { id: string }[] = [{ id: "sess-1" }];
let cancelledRows: { id: string }[] = [{ id: "cart-1" }];

function chain(q: Q) {
  const api = {
    eq(col: string, val: unknown) {
      q.eq.push([col, val]);
      return api;
    },
    gt: () => api,
    lte: () => api,
    limit: () => api,
    like(col: string, val: string) {
      q.like.push([col, val]);
      return api;
    },
    or(expr: string) {
      q.or.push(expr);
      return api;
    },
    maybeSingle: () =>
      Promise.resolve({
        data:
          q.table === "qr_tables"
            ? tableRow
            : q.eq.some(([col]) => col === "table_number")
              ? occupiedRow
              : sessionRow,
        error: null,
      }),
    single: () =>
      Promise.resolve(
        q.op === "insert"
          ? { data: { id: q.table === "qr_carts" ? "cart-1" : "sess-1" }, error: null }
          : { data: null, error: null },
      ),
    select(_cols?: string) {
      if (q.op === "update")
        return Object.assign(
          Promise.resolve({
            data: q.table === "qr_carts" ? cancelledRows : closedRows,
            error: null,
          }),
          api,
        );
      return api;
    },
    then(res: (v: { data: unknown; error: null }) => unknown) {
      return Promise.resolve({ data: null, error: null }).then(res);
    },
  };
  return api;
}
function pushQ(table: string, op: Q["op"], payload?: Record<string, unknown>) {
  const q: Q = { table, op, payload, eq: [], like: [], or: [] };
  queries.push(q);
  return q;
}

vi.mock("@mms/db/server", () => ({
  serverClient: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "kiosk-uid" } } }) },
  }),
  serviceClient: () => ({
    from: (table: string) => ({
      select: (_cols: string) => chain(pushQ(table, "select")),
      insert: (payload: Record<string, unknown>) => chain(pushQ(table, "insert", payload)),
      update: (payload: Record<string, unknown>) => chain(pushQ(table, "update", payload)),
    }),
  }),
}));

const { openKioskOrder, kioskReset } = await import("./kiosk");
const SESSION = "11111111-1111-4111-8111-111111111111";
const TOKEN = "kiosk-device-token-for-tests";

beforeEach(() => {
  queries = [];
  gateAnswer = null;
  tableRow = null;
  occupiedRow = null;
  sessionRow = { id: SESSION };
  closedRows = [{ id: "sess-1" }];
  cancelledRows = [{ id: "cart-1" }];
  vi.stubEnv("KIOSK_DEVICE_TOKEN", TOKEN);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the device-token gate", () => {
  it("an UNSET token means the kiosk is OFF — refuse, never open", async () => {
    vi.stubEnv("KIOSK_DEVICE_TOKEN", "");
    const r = await openKioskOrder({ k: "anything", kind: "togo" });
    expect(r).toEqual({ ok: false, reason: "not_configured" });
    expect(queries).toHaveLength(0); // an invalid caller costs no DB read
  });

  it("a wrong token is denied before any DB work", async () => {
    const r = await openKioskOrder({ k: "wrong-token", kind: "togo" });
    expect(r).toEqual({ ok: false, reason: "denied" });
    expect(queries).toHaveLength(0);
  });
});

describe("openKioskOrder — the mint shape", () => {
  it("mints a kiosk- pickup session WITH the membership row (the cart-write authorization)", async () => {
    const r = await openKioskOrder({ k: TOKEN, kind: "togo", customerName: "Thiri" });
    expect(r.ok).toBe(true);
    const mint = queries.find((q) => q.table === "table_sessions" && q.op === "insert");
    expect(String(mint?.payload?.qr_code)).toMatch(/^kiosk-/);
    expect(mint?.payload?.mode).toBe("pickup");
    const member = queries.find((q) => q.table === "session_members" && q.op === "insert");
    // Without this row, assertCartMember refuses every later addItem/scanAdd from the kiosk device.
    expect(member?.payload?.seat_id).toBe("kiosk-uid");
    const cart = queries.find((q) => q.table === "qr_carts" && q.op === "insert");
    expect(cart?.payload?.customer_name).toBe("Thiri");
  });

  it("refuses an OCCUPIED table — never a second cart over a seated party", async () => {
    tableRow = { table_number: 4 };
    occupiedRow = { id: "other-sess" };
    const r = await openKioskOrder({ k: TOKEN, kind: "dinein", tableNumber: 4 });
    expect(r).toEqual({ ok: false, reason: "occupied" });
    expect(queries.some((q) => q.op === "insert")).toBe(false);
  });

  it("a dine-in claim carries the table number and dinein mode", async () => {
    tableRow = { table_number: 4 };
    const r = await openKioskOrder({ k: TOKEN, kind: "dinein", tableNumber: 4 });
    expect(r.ok).toBe(true);
    const mint = queries.find((q) => q.table === "table_sessions" && q.op === "insert");
    expect(mint?.payload?.mode).toBe("dinein");
    expect(mint?.payload?.table_number).toBe(4);
  });
});

describe("kioskReset — prefix-scoped, register-deferring destruction", () => {
  it("the scope read AND the destructive close both carry the kiosk- prefix predicate", async () => {
    const r = await kioskReset({ k: TOKEN, sessionId: SESSION });
    expect(r.ok).toBe(true);
    // The read is the gate every write inherits its session id from…
    const read = queries.find((q) => q.table === "table_sessions" && q.op === "select");
    expect(read?.eq).toContainEqual(["id", SESSION]);
    expect(read?.eq).toContainEqual(["status", "active"]);
    // Without this predicate the device token resets ANY session id it's handed — a diner table,
    // a staff counter order — and cancels its cart.
    expect(read?.like).toContainEqual(["qr_code", "kiosk-%"]);
    // …and the destructive statement re-asserts scope + status itself (never only the read).
    const close = queries.find((q) => q.table === "table_sessions" && q.op === "update");
    expect(close?.eq).toContainEqual(["id", SESSION]);
    expect(close?.eq).toContainEqual(["status", "active"]);
    expect(close?.like).toContainEqual(["qr_code", "kiosk-%"]);
  });

  it("the cart cancel runs FIRST and defers to the register: open-status + settle-freeze + pay-lock live in the statement", async () => {
    const r = await kioskReset({ k: TOKEN, sessionId: SESSION });
    expect(r.ok).toBe(true);
    const cancel = queries.find((q) => q.table === "qr_carts" && q.op === "update");
    expect(cancel?.payload).toEqual({ status: "cancelled" });
    expect(cancel?.eq).toContainEqual(["session_id", SESSION]);
    // A settled cart ('paid') matches zero — the register owns the order from the settle on.
    expect(cancel?.eq).toContainEqual(["status", "open"]);
    // settleCash holds settle_at (acquireSettlement) BEFORE totals derive — the reset must lose
    // that race atomically, or an idle timer destroys an order money is moving on.
    expect(cancel?.or.some((e) => e.startsWith("settle_at.is.null,settle_at.lt."))).toBe(true);
    expect(cancel?.or.some((e) => e.startsWith("locked.eq.false,locked_at.lt."))).toBe(true);
    // And the cancel precedes the session close (the close only runs on a proven-dead cart).
    const cancelIdx = queries.findIndex((q) => q.table === "qr_carts" && q.op === "update");
    const closeIdx = queries.findIndex((q) => q.table === "table_sessions" && q.op === "update");
    expect(cancelIdx).toBeGreaterThan(-1);
    expect(cancelIdx).toBeLessThan(closeIdx);
  });

  it("a frozen/settled cart stands the whole reset down — the session is NEVER closed", async () => {
    cancelledRows = []; // the freeze predicates (or 'paid' status) matched zero rows
    const r = await kioskReset({ k: TOKEN, sessionId: SESSION });
    expect(r).toEqual({ ok: false, reason: "frozen" });
    // A settled kiosk DINE-IN session must stay active: its KDS ticket dies with the session.
    expect(queries.some((q) => q.table === "table_sessions" && q.op === "update")).toBe(false);
  });

  it("a non-kiosk / inactive session id reads nothing and writes NOTHING", async () => {
    sessionRow = null;
    const r = await kioskReset({ k: TOKEN, sessionId: SESSION });
    expect(r).toEqual({ ok: false, reason: "gone" });
    expect(queries.some((q) => q.op === "update")).toBe(false);
  });

  it("a wrong token performs no DB work at all", async () => {
    const r = await kioskReset({ k: "wrong", sessionId: SESSION });
    expect(r.ok).toBe(false);
    expect(queries).toHaveLength(0);
  });
});

/**
 * Red-first: reverting the mapping below leaves every other test in this file GREEN, which is how a
 * flattened reason would have shipped. `unavailable` authorizes a RETRY in the detached abandonment
 * path (`KioskOrderFlow`); reported as `denied` it stops the retry, and the cart — plus, for a
 * dine-in kiosk order, the table's occupancy — stays live until the session TTL expires.
 */
describe("kioskReset — an unknowable gate is not a refusal", () => {
  it("passes `unavailable` through instead of flattening it to `denied`", async () => {
    gateAnswer = { ok: false, reason: "unavailable" };
    expect(await kioskReset({ k: TOKEN, sessionId: SESSION })).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("still reports a real refusal as `denied`", async () => {
    // The other direction: a mapping that answered `unavailable` for everything would make the
    // caller retry a genuine refusal forever.
    gateAnswer = { ok: false, reason: "denied" };
    expect(await kioskReset({ k: TOKEN, sessionId: SESSION })).toEqual({
      ok: false,
      reason: "denied",
    });
  });

  it("writes NOTHING on an unknowable gate", async () => {
    gateAnswer = { ok: false, reason: "unavailable" };
    await kioskReset({ k: TOKEN, sessionId: SESSION });
    expect(queries.filter((q) => q.op !== "select")).toHaveLength(0);
  });
});
