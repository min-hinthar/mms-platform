import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * W6a — the register mint + name write, asserted as QUERIES (predicate included), because both
 * defects live there:
 *
 *   • a counter mint that quietly writes a `session_members` row (or a non-`reg-` code, or the
 *     wrong mode) re-enters the diner machinery the design keeps it out of — party trigger, floor
 *     board, is_member visibility;
 *   • a name write without the `status='open'` guard renames an already-SETTLED order's cart — and
 *     a 0-row update reports `{ error: null }`, so without the read-back the action lies "saved".
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("./staff", () => ({
  staffGate: () =>
    Promise.resolve({ ok: true, caller: { uid: "u-1", staffId: "s-1", role: "manager" } }),
  STAFF_WRITE_OUTAGE: "outage",
}));
vi.mock("./session-code", () => ({ generateJoinCode: () => "ABCD1234" }));

type Q = {
  table: string;
  op: "select" | "insert" | "update";
  payload?: Record<string, unknown>;
  eq: [string, unknown][];
};
let queries: Q[] = [];
/** Rows the update's read-back returns (the 0-row honesty test flips this). */
let updatedRows: { id: string }[] = [];

function chain(q: Q) {
  const api = {
    eq(col: string, val: unknown) {
      q.eq.push([col, val]);
      return api;
    },
    gt: () => api,
    lte: () => api,
    like: () => api,
    in: () => api,
    order: () => api,
    limit: () => api,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    single: () =>
      Promise.resolve(
        q.op === "insert" && q.table === "table_sessions"
          ? { data: { id: "sess-1" }, error: null }
          : { data: null, error: null },
      ),
    select(_cols?: string) {
      // A mutation's read-back resolves rows; a plain select keeps chaining.
      if (q.op === "update")
        return Object.assign(Promise.resolve({ data: updatedRows, error: null }), api);
      return api;
    },
    then(res: (v: { data: unknown; error: null }) => unknown) {
      return Promise.resolve({ data: [], error: null }).then(res);
    },
  };
  return api;
}

vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (table: string) => ({
      select: (_cols: string) => chain(pushQ(table, "select")),
      insert: (payload: Record<string, unknown>) => chain(pushQ(table, "insert", payload)),
      update: (payload: Record<string, unknown>) => chain(pushQ(table, "update", payload)),
    }),
  }),
}));

/** Register the query in the log and return the SAME object so chain() records into it. */
function pushQ(table: string, op: Q["op"], payload?: Record<string, unknown>) {
  const q: Q = { table, op, payload, eq: [] };
  queries.push(q);
  return q;
}

const { openRegisterOrder, setCartCustomerName } = await import("./register");
const SESSION = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  queries = [];
  updatedRows = [{ id: "cart-1" }];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("openRegisterOrder — the counter mint stays OUT of the diner machinery", () => {
  it("mints a pickup-mode reg- session with NO member row", async () => {
    const r = await openRegisterOrder({ kind: "walkup" });
    expect(r.ok).toBe(true);
    const mint = queries.find((q) => q.table === "table_sessions" && q.op === "insert");
    expect(mint?.payload?.mode).toBe("pickup");
    expect(String(mint?.payload?.qr_code)).toMatch(/^reg-/);
    expect(mint?.payload?.table_number).toBeNull();
    // The whole point of the service-role mint: no membership, so no diner surface can see it.
    expect(queries.some((q) => q.table === "session_members")).toBe(false);
  });

  it("a phone order lands the caller's name on the CART (the expo call-out)", async () => {
    await openRegisterOrder({ kind: "phone", customerName: "Thiri" });
    const cart = queries.find((q) => q.table === "qr_carts" && q.op === "insert");
    expect(cart?.payload?.customer_name).toBe("Thiri");
  });
});

describe("setCartCustomerName — open-cart-guarded, read-back-verified", () => {
  it("scopes the write to THIS session's OPEN cart", async () => {
    const r = await setCartCustomerName({ sessionId: SESSION, name: "Ko Ko" });
    expect(r.ok).toBe(true);
    const w = queries.find((q) => q.op === "update" && q.table === "qr_carts");
    expect(w?.eq).toContainEqual(["session_id", SESSION]);
    // Without this predicate the action renames a SETTLED order's cart.
    expect(w?.eq).toContainEqual(["status", "open"]);
  });

  it("a 0-row update is a refusal, not a silent success", async () => {
    updatedRows = [];
    const r = await setCartCustomerName({ sessionId: SESSION, name: "Ko Ko" });
    expect(r.ok).toBe(false);
  });
});
