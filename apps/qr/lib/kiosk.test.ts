import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * W6b — the kiosk's two authority rules, asserted as QUERIES + gate behavior (the degenerate-mock
 * lesson: assert predicates and payloads, never a chosen answer):
 *
 *   • the device token is the ONLY authority (constant-time compare; UNSET = feature off — a kiosk
 *     with no configured token must refuse, never open);
 *   • the reset's destructive close is scoped to `kiosk-` sessions IN THE STATEMENT — the token can
 *     never close a diner table or a staff counter order;
 *   • the mint writes the membership row (it is what authorizes every later diner-path cart write)
 *     and refuses an OCCUPIED table (a kiosk claim must never open a second cart over a seated
 *     party's order).
 */

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: () => Promise.resolve({}) }));
vi.mock("./session-code", () => ({ generateJoinCode: () => "ABCD1234" }));

type Q = {
  table: string;
  op: "select" | "insert" | "update";
  payload?: Record<string, unknown>;
  eq: [string, unknown][];
  like: [string, string][];
};
let queries: Q[] = [];
/** Scripted single-row answers keyed by table for maybeSingle reads. */
let tableRow: Record<string, unknown> | null = null;
let occupiedRow: Record<string, unknown> | null = null;
let closedRows: { id: string }[] = [{ id: "sess-1" }];

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
    maybeSingle: () =>
      Promise.resolve({
        data: q.table === "qr_tables" ? tableRow : occupiedRow,
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
        return Object.assign(Promise.resolve({ data: closedRows, error: null }), api);
      return api;
    },
    then(res: (v: { data: unknown; error: null }) => unknown) {
      return Promise.resolve({ data: null, error: null }).then(res);
    },
  };
  return api;
}
function pushQ(table: string, op: Q["op"], payload?: Record<string, unknown>) {
  const q: Q = { table, op, payload, eq: [], like: [] };
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
  tableRow = null;
  occupiedRow = null;
  closedRows = [{ id: "sess-1" }];
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

describe("kioskReset — prefix-scoped destruction", () => {
  it("the close is scoped to kiosk- sessions IN THE STATEMENT", async () => {
    const r = await kioskReset({ k: TOKEN, sessionId: SESSION });
    expect(r.ok).toBe(true);
    const close = queries.find((q) => q.table === "table_sessions" && q.op === "update");
    expect(close?.eq).toContainEqual(["id", SESSION]);
    expect(close?.eq).toContainEqual(["status", "active"]);
    // Without this predicate the device token closes ANY session id it's handed — a diner table,
    // a staff counter order — and cancels its cart.
    expect(close?.like).toContainEqual(["qr_code", "kiosk-%"]);
  });

  it("a 0-row close is a refusal (a non-kiosk id simply matches nothing)", async () => {
    closedRows = [];
    const r = await kioskReset({ k: TOKEN, sessionId: SESSION });
    expect(r.ok).toBe(false);
    // And the cart cancel never runs for a refused close.
    expect(queries.some((q) => q.table === "qr_carts" && q.op === "update")).toBe(false);
  });

  it("a wrong token performs no DB work at all", async () => {
    const r = await kioskReset({ k: "wrong", sessionId: SESSION });
    expect(r.ok).toBe(false);
    expect(queries).toHaveLength(0);
  });
});
