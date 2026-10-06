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
vi.mock("./session-code", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./session-code")>()),
  generateJoinCode: () => "ABCD1234",
}));

type Q = {
  table: string;
  op: "select" | "insert" | "update";
  cols?: string;
  payload?: Record<string, unknown>;
  eq: [string, unknown][];
  gt: [string, unknown][];
  lte: [string, unknown][];
};
let queries: Q[] = [];
/** Phase 3c-ii — `startTable`'s registry row (null = unregistered). */
let registryRow: { table_number: number; qr_code: string; active: boolean } | null = null;
/** What each number-keyed read (`seatedSessionFor`) answers, in order — the last entry repeats. */
let numberRows: (Record<string, unknown> | null)[] = [null];
let numberReads = 0;
/** The live NUMBERLESS row on the table's sticker token (the predicate's second read). */
let tokenRow: Record<string, unknown> | null = null;
/** What each `table_sessions` insert answers, in order (null = lands) — the last entry repeats. */
let insertErrors: ({ code: string } | null)[] = [null];
let sessionInserts = 0;
/** Rows the update's read-back returns (the 0-row honesty test flips this). */
let updatedRows: { id: string }[] = [];
/** Phase 2f — every RPC called, and what `mms_clear_cart_name` answers. */
let rpcCalls: { fn: string; args: unknown }[] = [];
let clearVerdict: { data: unknown; error: { message: string } | null } = {
  data: "ok",
  error: null,
};

function chain(q: Q) {
  const api = {
    eq(col: string, val: unknown) {
      q.eq.push([col, val]);
      return api;
    },
    gt(col: string, val: unknown) {
      q.gt.push([col, val]);
      return api;
    },
    lte(col: string, val: unknown) {
      q.lte.push([col, val]);
      return api;
    },
    like: () => api,
    in: () => api,
    is: () => api, // the predicate's token read (`table_number IS NULL`); its conjuncts are pinned in seated.test
    order: () => api,
    limit: () => api,
    maybeSingle: () => {
      if (q.table === "qr_tables") return Promise.resolve({ data: registryRow, error: null });
      if (q.table === "table_sessions" && q.eq.some(([col]) => col === "table_number")) {
        const i = Math.min(numberReads++, numberRows.length - 1);
        return Promise.resolve({ data: numberRows[i] ?? null, error: null });
      }
      if (
        q.table === "table_sessions" &&
        q.op === "select" &&
        q.eq.some(([col]) => col === "qr_code")
      )
        return Promise.resolve({ data: tokenRow, error: null });
      return Promise.resolve({ data: null, error: null });
    },
    single: () => {
      if (q.op !== "insert" || q.table !== "table_sessions")
        return Promise.resolve({ data: null, error: null });
      const i = Math.min(sessionInserts++, insertErrors.length - 1);
      const err = insertErrors[i] ?? null;
      return Promise.resolve(
        err ? { data: null, error: err } : { data: { id: "sess-1" }, error: null },
      );
    },
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
    // The service-day read (`readServiceDay`): the server's clock; `pickup_config` answers null
    // through the chain below, so the floor is the default zone's.
    rpc: (fn: string, args: unknown) => {
      rpcCalls.push({ fn, args });
      if (fn === "mms_clear_cart_name") return Promise.resolve(clearVerdict);
      return Promise.resolve({ data: "2026-09-13T19:00:00.000Z", error: null });
    },
    from: (table: string) => ({
      select: (cols: string) => chain(pushQ(table, "select", undefined, cols)),
      insert: (payload: Record<string, unknown>) => chain(pushQ(table, "insert", payload)),
      update: (payload: Record<string, unknown>) => chain(pushQ(table, "update", payload)),
    }),
  }),
}));

/** Register the query in the log and return the SAME object so chain() records into it. */
function pushQ(table: string, op: Q["op"], payload?: Record<string, unknown>, cols?: string) {
  const q: Q = { table, op, cols, payload, eq: [], gt: [], lte: [] };
  queries.push(q);
  return q;
}

const { openRegisterOrder, setCartCustomerName } = await import("./register");
const SESSION = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  queries = [];
  registryRow = null;
  numberRows = [null];
  numberReads = 0;
  tokenRow = null;
  insertErrors = [null];
  sessionInserts = 0;
  updatedRows = [{ id: "cart-1" }];
  rpcCalls = [];
  clearVerdict = { data: "ok", error: null };
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

// ── Phase 2f · P2v — the arm is recorded; a name is kept once food is in ─────────────────────────
describe("openRegisterOrder — the counter arm is recorded at mint (owner decision 7a)", () => {
  it("a phone order records `phone`, a walk-up `walkup`", async () => {
    // phone-arm-not-recorded
    await openRegisterOrder({ kind: "phone", customerName: "Thiri" });
    expect(
      queries.find((q) => q.table === "qr_carts" && q.op === "insert")?.payload?.counter_arm,
    ).toBe("phone");
    queries = [];
    await openRegisterOrder({ kind: "walkup" });
    expect(
      queries.find((q) => q.table === "qr_carts" && q.op === "insert")?.payload?.counter_arm,
    ).toBe("walkup");
  });
});

describe("setCartCustomerName — clearing a name goes through the cart-locked SQL (decision 7c)", () => {
  it("an EMPTY name is decided by mms_clear_cart_name, never the PostgREST update", async () => {
    const r = await setCartCustomerName({ sessionId: SESSION, name: "" });
    expect(r).toEqual({ ok: true });
    expect(rpcCalls).toEqual([{ fn: "mms_clear_cart_name", args: { p_session_id: SESSION } }]);
    expect(queries.some((q) => q.op === "update")).toBe(false);
  });

  it("`keep_name` refuses with the keepName CODE, and nothing else is written", async () => {
    // empty-name-bypasses-the-lock
    clearVerdict = { data: "keep_name", error: null };
    const r = await setCartCustomerName({ sessionId: SESSION, name: "  " });
    expect(r).toMatchObject({ ok: false, code: "keepName" });
    expect(queries.some((q) => q.op === "update")).toBe(false);
  });

  it("`not_open` is the settled sentence; an RPC error is the outage", async () => {
    clearVerdict = { data: "not_open", error: null };
    const r = await setCartCustomerName({ sessionId: SESSION, name: "" });
    expect(r.ok).toBe(false);
    expect(r).not.toHaveProperty("code");
    clearVerdict = { data: null, error: { message: "boom" } };
    expect(await setCartCustomerName({ sessionId: SESSION, name: "" })).toEqual({
      ok: false,
      error: "outage",
    });
  });

  it("a non-empty rename is still the guarded update, no RPC", async () => {
    await setCartCustomerName({ sessionId: SESSION, name: "Ko Ko" });
    expect(rpcCalls).toEqual([]);
    expect(queries.find((q) => q.op === "update")?.payload).toEqual({ customer_name: "Ko Ko" });
  });
});

/**
 * Phase 3c-ii (D22 · D26) — the register's "Start a table" finds the live session BY NUMBER through
 * the ONE predicate (`seatedSessionFor`, lib/seated.ts) and CONVERGES on it: a diner who bound a
 * generated code to 7 at Send holds a session the sticker TOKEN could never find, so a token-keyed
 * Start minted a SECOND session on the same table — two ledgers, one party. The registry read now
 * refuses an inactive table (the mint already requires `active = true` on both of its arms), the
 * dead row is swept off N beside the token sweep, and a 23505 is re-read by number.
 */
describe("startTable — finds by NUMBER and converges; an inactive table is refused", () => {
  const REG = { table_number: 7, qr_code: "STICKER7", active: true };
  const numberReadsOf = () =>
    queries.filter(
      (q) =>
        q.table === "table_sessions" &&
        q.op === "select" &&
        q.eq.some(([col]) => col === "table_number"),
    );
  const insertsOf = () => queries.filter((q) => q.table === "table_sessions" && q.op === "insert");

  it("an INACTIVE registered table is refused by name, before any table_sessions query", async () => {
    registryRow = { ...REG, active: false };
    const r = await openRegisterOrder({ kind: "table", tableNumber: 7 });
    expect(r).toEqual({ ok: false, error: "Table 7 isn’t active." });
    expect(queries.some((q) => q.table === "table_sessions")).toBe(false);
    // The registry read must ASK for `active` — a select that omits the column cannot refuse on it.
    const reg = queries.find((q) => q.table === "qr_tables");
    expect(reg?.cols?.split(",")).toContain("active");
  });

  it("an unregistered table keeps its sentence", async () => {
    expect(await openRegisterOrder({ kind: "table", tableNumber: 7 })).toEqual({
      ok: false,
      error: "Table 7 isn’t registered.",
    });
  });

  it("the find is the live-dine-in-at-N predicate — by NUMBER, never by qr_code — before the insert", async () => {
    registryRow = REG;
    const r = await openRegisterOrder({ kind: "table", tableNumber: 7 });
    expect(r).toEqual({ ok: true, sessionId: "sess-1", created: true });
    const [find] = numberReadsOf();
    expect(find?.eq).toContainEqual(["table_number", 7]);
    expect(find?.eq).toContainEqual(["mode", "dinein"]);
    expect(find?.eq).toContainEqual(["status", "active"]);
    expect(find?.gt[0]?.[0]).toBe("expires_at");
    const insertIdx = queries.findIndex((q) => q.table === "table_sessions" && q.op === "insert");
    expect(queries.indexOf(find!)).toBeLessThan(insertIdx);
    // The FIRST session read keys on the number, never the sticker token (finding 1); the token is
    // the predicate's SECOND read, after the number found nobody (the stranded shape, seated.test).
    const sessionReads = queries
      .slice(0, insertIdx)
      .filter((q) => q.table === "table_sessions" && q.op === "select");
    expect(sessionReads[0]).toBe(find);
    expect(find?.eq.some(([col]) => col === "qr_code")).toBe(false);
  });

  it("a live session at N (bound from a generated code) → created: false, NO insert, its cart ensured", async () => {
    registryRow = REG;
    numberRows = [{ id: "sess-bound", qr_code: "GENCODE7", table_number: 7 }];
    const r = await openRegisterOrder({ kind: "table", tableNumber: 7 });
    expect(r).toEqual({ ok: true, sessionId: "sess-bound", created: false });
    expect(insertsOf()).toHaveLength(0);
    const cartRead = queries.find((q) => q.table === "qr_carts" && q.op === "select");
    expect(cartRead?.eq).toContainEqual(["session_id", "sess-bound"]);
  });

  it("hands the registry's sticker token to the predicate: a NUMBERLESS live row on that sticker (the stranded shape) is the party — converge, no insert", async () => {
    // The blind pass on 3c-ii (money lens, CRITICAL 1): the register's insert on the sticker code
    // 23505'd against that row on the TOKEN index, the number re-read found nobody, and staff read
    // an outage for a table with a party at it.
    registryRow = REG;
    tokenRow = { id: "sess-stranded", qr_code: "STICKER7", table_number: null, host_seat: "d1" };
    const r = await openRegisterOrder({ kind: "table", tableNumber: 7 });
    expect(r).toEqual({ ok: true, sessionId: "sess-stranded", created: false });
    expect(insertsOf()).toHaveLength(0);
    const byToken = queries.find(
      (q) => q.op === "select" && q.eq.some(([col, v]) => col === "qr_code" && v === "STICKER7"),
    );
    expect(byToken?.eq).toContainEqual(["mode", "dinein"]);
    expect(byToken?.eq).toContainEqual(["status", "active"]);
  });

  it("a RESERVED holder at N (a kiosk dine-in mid-order) is refused by name — never opened as the diners' ledger", async () => {
    // The blind pass on 3c-ii (money lens): the number-first find converged staff onto a `kiosk-`
    // session; its idle reset then cancels the open cart staff added lines to.
    registryRow = REG;
    numberRows = [{ id: "sess-kiosk", qr_code: "kiosk-ABCD1234", table_number: 7 }];
    const r = await openRegisterOrder({ kind: "table", tableNumber: 7 });
    expect(r).toEqual({
      ok: false,
      error: "Table 7 has a kiosk order in progress — finish or clear it at the kiosk.",
    });
    expect(insertsOf()).toHaveLength(0);
    expect(queries.some((q) => q.table === "qr_carts")).toBe(false);
  });

  it("a 23505 on the insert is re-read BY NUMBER and converges on the winner", async () => {
    registryRow = REG;
    numberRows = [null, { id: "sess-winner", qr_code: "GENCODE7", table_number: 7 }];
    insertErrors = [{ code: "23505" }];
    const r = await openRegisterOrder({ kind: "table", tableNumber: 7 });
    expect(r).toEqual({ ok: true, sessionId: "sess-winner", created: false });
    const reads = numberReadsOf();
    expect(reads).toHaveLength(2);
    expect(reads[1]?.eq).toContainEqual(["table_number", 7]);
    expect(reads[1]?.eq.some(([col]) => col === "qr_code")).toBe(false);
  });

  it("sweeps the dead row off N (number + expired) beside the token sweep, before the find", async () => {
    registryRow = REG;
    await openRegisterOrder({ kind: "table", tableNumber: 7 });
    const sweeps = queries.filter(
      (q) => q.table === "table_sessions" && q.op === "update" && q.payload?.status === "closed",
    );
    const byNumber = sweeps.find((q) => q.eq.some(([col]) => col === "table_number"));
    expect(byNumber?.eq).toContainEqual(["table_number", 7]);
    expect(byNumber?.eq).toContainEqual(["mode", "dinein"]);
    expect(byNumber?.eq).toContainEqual(["status", "active"]);
    expect(byNumber?.lte[0]?.[0]).toBe("expires_at");
    const [find] = numberReadsOf();
    expect(queries.indexOf(byNumber!)).toBeLessThan(queries.indexOf(find!));
    // The token sweep stays for numberless token rows.
    expect(sweeps.some((q) => q.eq.some(([col, v]) => col === "qr_code" && v === "STICKER7"))).toBe(
      true,
    );
  });

  it("the insert payload is unchanged: the sticker code, dine-in, no host, the number", async () => {
    registryRow = REG;
    await openRegisterOrder({ kind: "table", tableNumber: 7 });
    expect(insertsOf()[0]?.payload).toEqual({
      qr_code: "STICKER7",
      mode: "dinein",
      host_seat: null,
      table_number: 7,
    });
  });
});
