import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 3c-ii (D24) — `bindTable(cartId, n)`: the host seats an UNBOUND dine-in session at a
 * registered table, once, under the lock model, with refusals that name the recovery and never a
 * merge. Asserted as QUERIES and ORDER on one log (the degenerate-mock lesson), with the REAL
 * `lib/seated.ts` helpers running against the scripted client — so the sweep's and the CAS's
 * predicates are exercised here, not mocked away.
 *
 * The laws this file pins: every refusal lands BEFORE any write, in `sendToKitchen`'s order; the
 * bind is ONE call, `mms_bind_session_table` (M263 — the freeze read under the cart's lock and the
 * CAS in one transaction; its SQL is pinned by supabase/tests/m263_bind_session_table_test.sql), and
 * writes no membership row and no expiry; the sweep precedes the call and the peers' resync
 * (`touchCart`) follows a LANDING only; the holder at N decides before any write (`holderVerdict`:
 * a party → `seated`, a kiosk order → `kiosk`, a table a server started → handed to the RPC as the
 * shell — J40); the RPC's own refusals are answered by name (`locked` · `settling` · `sticker_table`
 * — J41) or by a re-read BY NUMBER (`gone` · `held` · a 23505) with nothing written on another
 * session; an `unmoved` CAS is answered by the own-row re-read, and an unreadable answer is `error`
 * — never a landing.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: () => Promise.resolve({}) }));

/** One log of everything the action did, in order. */
let log: string[] = [];

type Authz = {
  uid: string;
  sessionId: string;
  role: "host" | "guest";
  locked: boolean;
  lockedBy: string | null;
  settling: boolean;
  settleBy: string | null;
  mode: string;
};
const HOST: Authz = {
  uid: "seat-host",
  sessionId: "sess-1",
  role: "host",
  locked: false,
  lockedBy: null,
  settling: false,
  settleBy: null,
  mode: "dinein",
};
let authz: Authz | (() => never) = HOST;
let rateOk = true;

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
  assertCartMember: () => {
    log.push("authz");
    return typeof authz === "function" ? Promise.reject(authz()) : Promise.resolve(authz);
  },
  AuthzError,
  UNAVAILABLE: () => new AuthzError("down", 503, "unavailable"),
}));
vi.mock("./rate", () => ({ withinMutationRate: () => Promise.resolve(rateOk) }));
vi.mock("./order-lines", () => ({
  touchCart: (id: string, ctx: string) => {
    log.push(`touch:${id}:${ctx}`);
    return Promise.resolve();
  },
}));
let captured: { event: string; properties?: Record<string, unknown> }[] = [];
vi.mock("./posthog-server", () => ({
  getPostHogClient: () => ({
    capture: (e: { event: string; properties?: Record<string, unknown> }) => {
      captured.push(e);
    },
  }),
}));

type Q = {
  table: string;
  op: "select" | "update" | "insert" | "rpc";
  cols?: string;
  payload?: Record<string, unknown>;
  opts?: Record<string, unknown>;
  eq: [string, unknown][];
  is: [string, unknown][];
  gt: [string, unknown][];
  lte: [string, unknown][];
};
let queries: Q[] = [];
/** The registry row for the requested number (null = unregistered / inactive). */
let registryRow: { table_number: number; qr_code: string } | null = {
  table_number: 5,
  qr_code: "STICKER5",
};
let registryError: { message: string } | null = null;
/** What the ONE call (`mms_bind_session_table`) answers — PostgREST's `{ data, error }`. */
type RpcAnswer = { data: unknown; error: { code: string; message: string } | null };
const LANDED: RpcAnswer = { data: [{ outcome: "bound", at_table: 5 }], error: null };
const answerWith = (outcome: string, at_table: number | null = null): RpcAnswer => ({
  data: [{ outcome, at_table }],
  error: null,
});
let rpcAnswer: RpcAnswer = LANDED;
/** What each number-keyed read (`seatedSessionFor`) answers, in order — the PRE-READ before the
 *  write, then the 23505 re-read; the last entry repeats. Empty by default: nobody at 5. */
let holderRows: (Record<string, unknown> | null)[] = [null];
let holderReads = 0;
/** The live NUMBERLESS row on the table's sticker token, for the predicate's second read. */
let tokenHolderRow: Record<string, unknown> | null = null;
/** The own row the zero-row re-read finds. */
let ownRow: { status: string; expires_at: string; table_number: number | null } | null = null;

const chain = (q: Q) => {
  const api = {
    eq(col: string, val: unknown) {
      q.eq.push([col, val]);
      return api;
    },
    is(col: string, val: unknown) {
      q.is.push([col, val]);
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
    limit: () => api,
    maybeSingle: () => {
      if (q.table === "qr_tables")
        return Promise.resolve({ data: registryRow, error: registryError });
      if (q.eq.some(([c]) => c === "table_number")) {
        const i = Math.min(holderReads++, holderRows.length - 1);
        const row = holderRows[i] ?? null;
        if (row && typeof row.__error === "string")
          return Promise.resolve({ data: null, error: { message: row.__error } });
        return Promise.resolve({ data: row, error: null });
      }
      if (q.eq.some(([c]) => c === "qr_code"))
        return Promise.resolve({ data: tokenHolderRow, error: null });
      return Promise.resolve({ data: ownRow, error: null });
    },
    then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
      if (q.op === "update") log.push("sweep");
      return Promise.resolve({ count: null, error: null }).then(res, rej);
    },
  };
  return api;
};
function pushQ(table: string, op: Q["op"], extra: Partial<Q> = {}) {
  const q: Q = { table, op, eq: [], is: [], gt: [], lte: [], ...extra };
  queries.push(q);
  return q;
}
vi.mock("@mms/db/server", () => ({
  serverClient: () => ({}),
  serviceClient: () => ({
    from: (table: string) => ({
      select: (cols: string) => chain(pushQ(table, "select", { cols })),
      update: (payload: Record<string, unknown>, opts?: Record<string, unknown>) =>
        chain(pushQ(table, "update", { payload, opts })),
      insert: (payload: Record<string, unknown>) => chain(pushQ(table, "insert", { payload })),
    }),
    rpc: (name: string, args: Record<string, unknown>) => {
      log.push(`rpc:${name}`);
      pushQ(`rpc:${name}`, "rpc", { payload: args });
      return Promise.resolve(rpcAnswer);
    },
  }),
}));

const { bindTable } = await import("./bind-table");

const CART = "ca97f000-0000-4000-8000-000000000002";
const RPC = "rpc:mms_bind_session_table";
const writes = () => queries.filter((q) => q.op !== "select");
const sessionWrites = () => writes().filter((q) => q.table === "table_sessions");
const calls = () => queries.filter((q) => q.table === RPC);

beforeEach(() => {
  log = [];
  queries = [];
  captured = [];
  authz = HOST;
  rateOk = true;
  registryRow = { table_number: 5, qr_code: "STICKER5" };
  registryError = null;
  rpcAnswer = LANDED;
  holderRows = [null];
  holderReads = 0;
  tokenHolderRow = null;
  ownRow = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("bindTable — refusals in sendToKitchen's order, each before any write", () => {
  it("a GUEST → not_host, nothing written", async () => {
    authz = { ...HOST, role: "guest" };
    expect(await bindTable(CART, 5)).toEqual({ ok: false, reason: "not_host" });
    expect(writes()).toEqual([]);
  });

  it("a FRESH pay lock → locked, nothing written (the lock model: no cart-adjacent write while a peer's charge is live; the CAS requires NULL, so nothing is RE-tabled — the refusal keeps the receipt the payer is reading unchanged)", async () => {
    authz = { ...HOST, locked: true, lockedBy: "seat-peer" };
    expect(await bindTable(CART, 5)).toEqual({ ok: false, reason: "locked" });
    expect(writes()).toEqual([]);
  });

  it("a FRESH split freeze → settling, nothing written", async () => {
    authz = { ...HOST, settling: true, settleBy: "seat-host" };
    expect(await bindTable(CART, 5)).toEqual({ ok: false, reason: "settling" });
    expect(writes()).toEqual([]);
  });

  it("a STALE lock lands — the bind reads authz's EFFECTIVE flag and never re-derives it from qr_carts", async () => {
    // `assertCartMember` answers `locked: false` for a lock past its TTL (lib/authz.ts
    // `lockedFresh`; pinned in authz.test.ts). The bind must not keep a second derivation.
    authz = { ...HOST, locked: false };
    expect(await bindTable(CART, 5)).toMatchObject({ ok: true, tableNumber: 5 });
    expect(queries.some((q) => q.table === "qr_carts")).toBe(false);
  });

  it("a pickup session → not_dinein, nothing written", async () => {
    authz = { ...HOST, mode: "pickup" };
    expect(await bindTable(CART, 5)).toEqual({ ok: false, reason: "not_dinein" });
    expect(writes()).toEqual([]);
  });

  it("rate-limited → rate_limited before anything else", async () => {
    rateOk = false;
    expect(await bindTable(CART, 5)).toEqual({ ok: false, reason: "rate_limited" });
    expect(writes()).toEqual([]);
  });

  it("an expired session (assertCartMember's own verdict) → session_expired", async () => {
    authz = () => {
      throw new AuthzError("Session is no longer active", 403, "session_expired");
    };
    expect(await bindTable(CART, 5)).toEqual({ ok: false, reason: "session_expired" });
    expect(writes()).toEqual([]);
  });

  it("any other authz failure → error (an unknowable table is never a landing)", async () => {
    authz = () => {
      throw new AuthzError("down", 503, "unavailable");
    };
    expect(await bindTable(CART, 5)).toEqual({ ok: false, reason: "error" });
  });

  it("a forged number is refused by Zod before authz runs", async () => {
    for (const n of [0, 100, 5.5]) {
      expect(await bindTable(CART, n)).toEqual({ ok: false, reason: "error" });
    }
    expect(log).toEqual([]);
  });

  it("an UNREGISTERED or INACTIVE table → unavailable; the registry read requires active = true; no session write", async () => {
    registryRow = null;
    expect(await bindTable(CART, 5)).toEqual({ ok: false, reason: "unavailable" });
    const reg = queries.find((q) => q.table === "qr_tables");
    expect(reg?.eq).toContainEqual(["table_number", 5]);
    expect(reg?.eq).toContainEqual(["active", true]);
    expect(sessionWrites()).toEqual([]);
  });

  it("a failed registry read → error, never unavailable's 'pick another'", async () => {
    registryError = { message: "fetch failed" };
    expect(await bindTable(CART, 5)).toEqual({ ok: false, reason: "error" });
    expect(sessionWrites()).toEqual([]);
  });
});

describe("bindTable — the write: ONE call, swept first, peers resynced only on a landing (M263)", () => {
  it("ONE call, `mms_bind_session_table`, with exactly the session and the number — no shell on an empty table, and NO table_sessions UPDATE but the dead-row sweep", async () => {
    expect(await bindTable(CART, 5)).toEqual({
      ok: true,
      tableNumber: 5,
      already: false,
    });
    const [call, ...more] = calls();
    expect(more).toEqual([]);
    expect(call?.payload?.p_session).toBe("sess-1");
    expect(call?.payload?.p_table).toBe(5);
    // Red-team #10: the key is always present (`shellId ?? undefined`), so only its VALUE is read.
    expect(call?.payload?.p_shell === undefined).toBe(true);
    const w = sessionWrites();
    expect(w).toHaveLength(1);
    expect(w[0]?.payload).toEqual({ status: "closed" });
    expect(w[0]?.lte[0]?.[0]).toBe("expires_at");
  });

  it("the sweep runs BEFORE the call and touchCart AFTER it — one log", async () => {
    await bindTable(CART, 5);
    expect(log).toEqual(["authz", "sweep", RPC, `touch:${CART}:bindTable`]);
    const sweep = sessionWrites().find((q) => q.payload?.status === "closed");
    expect(sweep?.eq).toContainEqual(["table_number", 5]);
  });

  it("writes NO membership row, consults NO membership, and slides NO expiry", async () => {
    await bindTable(CART, 5);
    expect(queries.some((q) => q.table === "session_members")).toBe(false);
    expect(writes().some((q) => "expires_at" in (q.payload ?? {}))).toBe(false);
    expect(writes().some((q) => "qr_code" in (q.payload ?? {}))).toBe(false);
  });

  it("a landing fires `table_bound` with the cart, session, number — and `adopted: false`", async () => {
    await bindTable(CART, 5);
    expect(captured).toEqual([
      {
        distinctId: "seat-host",
        event: "table_bound",
        properties: {
          cart_id: CART,
          session_id: "sess-1",
          table_number: 5,
          adopted: false,
        },
      },
    ]);
  });
});

describe("bindTable — the RPC's own refusals, decided under the cart's lock (M263 · J41)", () => {
  it("a lock that committed AFTER authz's read: authz says unlocked, the RPC says `locked` → locked; no touch, no capture", async () => {
    rpcAnswer = answerWith("locked");
    expect(await bindTable(CART, 5)).toEqual({ ok: false, reason: "locked" });
    expect(log).not.toContain(`touch:${CART}:bindTable`);
    expect(captured).toEqual([]);
  });

  it("a split freeze that committed after authz's read → settling; no touch, no capture", async () => {
    rpcAnswer = answerWith("settling");
    expect(await bindTable(CART, 5)).toEqual({ ok: false, reason: "settling" });
    expect(log).not.toContain(`touch:${CART}:bindTable`);
    expect(captured).toEqual([]);
  });

  it("J41 — the session started from table 7's sticker, the tap was 5 → sticker_table NAMING 7; no touch", async () => {
    rpcAnswer = answerWith("sticker", 7);
    expect(await bindTable(CART, 5)).toEqual({
      ok: false,
      reason: "sticker_table",
      tableNumber: 7,
    });
    expect(log).not.toContain(`touch:${CART}:bindTable`);
  });

  it("an answer this build cannot read ([] · an unknown word · no data) → error, never a landing; no touch", async () => {
    for (const answer of [
      { data: [], error: null },
      answerWith("weird", 5),
      { data: null, error: null },
    ]) {
      log = [];
      captured = [];
      rpcAnswer = answer;
      expect(await bindTable(CART, 5)).toEqual({ ok: false, reason: "error" });
      expect(log).not.toContain(`touch:${CART}:bindTable`);
      expect(captured).toEqual([]);
    }
  });
});

describe("bindTable — J40: a table a server started yields; a party or a kiosk order never does", () => {
  const SHELL = {
    id: "shell-5",
    mode: "dinein",
    host_seat: null,
    qr_code: "STICKER5",
    table_number: 5,
  };

  it("a HOSTLESS row at 5 is handed to the RPC as `p_shell`; `adopted` → ok, one touch, `table_bound` with adopted: true", async () => {
    holderRows = [SHELL];
    rpcAnswer = answerWith("adopted", 5);
    expect(await bindTable(CART, 5)).toEqual({
      ok: true,
      tableNumber: 5,
      already: false,
    });
    expect(calls()[0]?.payload?.p_shell).toBe("shell-5");
    expect(log).toEqual(["authz", "sweep", RPC, `touch:${CART}:bindTable`]);
    expect(captured[0]?.properties).toMatchObject({
      table_number: 5,
      adopted: true,
    });
    // The adopt is the RPC's, under its locks: no table_sessions write here closes the shell.
    expect(sessionWrites().some((q) => q.eq.some(([c, v]) => c === "id" && v === "shell-5"))).toBe(
      false,
    );
  });

  it("`held` — the shell still has an order on it (the re-read finds it) → held NAMING 5; no touch", async () => {
    holderRows = [SHELL, SHELL];
    rpcAnswer = answerWith("held");
    expect(await bindTable(CART, 5)).toEqual({
      ok: false,
      reason: "held",
      tableNumber: 5,
    });
    expect(log).not.toContain(`touch:${CART}:bindTable`);
    // The re-read is BY NUMBER through the one predicate.
    const reread = queries.filter((q) => q.table === "table_sessions" && q.op === "select").pop();
    expect(reread?.eq).toContainEqual(["table_number", 5]);
  });

  it("red-team #5 — `held` but a host claimed the shell meanwhile → seated (the join form), never held", async () => {
    holderRows = [SHELL, { ...SHELL, host_seat: "seat-x" }];
    rpcAnswer = answerWith("held");
    expect(await bindTable(CART, 5)).toEqual({ ok: false, reason: "seated" });
  });

  it("red-team #5 — `gone`: a tablemate adopted the shell first → the re-read finds their party → seated", async () => {
    holderRows = [
      SHELL,
      {
        id: "sess-mate",
        mode: "dinein",
        host_seat: "seat-mate",
        qr_code: "GENMATE",
        table_number: 5,
      },
    ];
    rpcAnswer = answerWith("gone");
    expect(await bindTable(CART, 5)).toEqual({ ok: false, reason: "seated" });
  });

  it("red-team #5 — `gone`: this phone's OTHER tab adopted it → ok, already (no touch: that tab touched)", async () => {
    holderRows = [
      SHELL,
      {
        id: "sess-1",
        mode: "dinein",
        host_seat: "seat-host",
        qr_code: "GEN1",
        table_number: 5,
      },
    ];
    rpcAnswer = answerWith("gone");
    expect(await bindTable(CART, 5)).toEqual({
      ok: true,
      tableNumber: 5,
      already: true,
    });
    expect(log).not.toContain(`touch:${CART}:bindTable`);
  });

  it("red-team #5 — `gone` with nobody at 5 now, or the SAME shell still there without a cart → error (a retry), never held", async () => {
    for (const after of [null, SHELL]) {
      holderReads = 0;
      holderRows = [SHELL, after];
      rpcAnswer = answerWith("gone");
      expect(await bindTable(CART, 5)).toEqual({ ok: false, reason: "error" });
    }
  });

  it("a `kiosk-` holder → kiosk NAMING 5, with NO sweep and NO call (no phone joins a kiosk order)", async () => {
    holderRows = [
      {
        id: "sess-k",
        mode: "dinein",
        host_seat: "kiosk-uid",
        qr_code: "kiosk-AB12CD34",
        table_number: 5,
      },
    ];
    expect(await bindTable(CART, 5)).toEqual({
      ok: false,
      reason: "kiosk",
      tableNumber: 5,
    });
    expect(writes()).toEqual([]);
    expect(log).toEqual(["authz"]);
  });

  it("a HOSTED party → seated, with NO sweep and NO call", async () => {
    holderRows = [
      {
        id: "sess-other",
        mode: "dinein",
        host_seat: "seat-x",
        qr_code: "GENX",
        table_number: 5,
      },
    ];
    expect(await bindTable(CART, 5)).toEqual({ ok: false, reason: "seated" });
    expect(writes()).toEqual([]);
    expect(log).toEqual(["authz"]);
  });
});

describe("bindTable — a 23505 is the number, re-read by NUMBER and answered by the holder, nothing evicted", () => {
  const dup = (): RpcAnswer => ({
    data: null,
    error: { code: "23505", message: "duplicate key" },
  });
  const party = {
    id: "sess-other",
    mode: "dinein",
    host_seat: "seat-x",
    qr_code: "GENX",
    table_number: 5,
  };

  it("23505 with a party at 5 now → seated, re-read through the live-dine-in-at-N predicate", async () => {
    rpcAnswer = dup();
    holderRows = [null, party]; // empty at the pre-read, taken at the re-read
    expect(await bindTable(CART, 5)).toEqual({ ok: false, reason: "seated" });
    const reread = queries.filter((q) => q.table === "table_sessions" && q.op === "select").pop();
    expect(reread?.eq).toContainEqual(["table_number", 5]);
    expect(reread?.eq).toContainEqual(["mode", "dinein"]);
    expect(reread?.eq).toContainEqual(["status", "active"]);
    expect(reread?.eq.some(([c]) => c === "qr_code")).toBe(false);
    expect(log).not.toContain(`touch:${CART}:bindTable`);
  });

  it("on seated, the writes are the dead-row sweep and the ONE call — nothing keyed on the other party", async () => {
    rpcAnswer = dup();
    holderRows = [null, party];
    await bindTable(CART, 5);
    const w = writes();
    expect(w.map((q) => q.table)).toEqual(["table_sessions", RPC]);
    expect(w[0]?.lte.some(([c]) => c === "expires_at")).toBe(true);
    expect(JSON.stringify(w)).not.toContain("sess-other");
  });

  it("23505 with a kiosk order at 5 now → kiosk naming 5; with a hostless row → error (the retry's pre-read hands it to the adopt)", async () => {
    rpcAnswer = dup();
    holderRows = [null, { ...party, host_seat: "kiosk-uid", qr_code: "kiosk-XY" }];
    expect(await bindTable(CART, 5)).toEqual({
      ok: false,
      reason: "kiosk",
      tableNumber: 5,
    });
    holderReads = 0;
    holderRows = [null, { ...party, host_seat: null }];
    expect(await bindTable(CART, 5)).toEqual({ ok: false, reason: "error" });
  });

  it("23505 whose holder has already gone → error (retryable), never seated-by-constraint-name", async () => {
    rpcAnswer = {
      data: null,
      error: { code: "23505", message: "table_sessions_active_table_uniq" },
    };
    holderRows = [null];
    expect(await bindTable(CART, 5)).toEqual({ ok: false, reason: "error" });
  });

  it("23503 (the registry FK — the table retired between the read and the write) → unavailable", async () => {
    rpcAnswer = { data: null, error: { code: "23503", message: "fk" } };
    expect(await bindTable(CART, 5)).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("any other error (PGRST202 — the function missing on a stale schema cache, too) → error", async () => {
    for (const code of ["42703", "PGRST202"]) {
      rpcAnswer = { data: null, error: { code, message: "boom" } };
      expect(await bindTable(CART, 5)).toEqual({ ok: false, reason: "error" });
    }
  });
});

describe("bindTable — the occupancy PRE-READ, before any write (the blind pass on 3c-ii, money lens)", () => {
  // The index is the authority for the truly simultaneous case; the pre-read decides the common
  // one. Without it a stale "Open" chip lands a second party on N in the deploy-before-apply window
  // the migration header names — the register and the kiosk pre-read the same way.
  it("the pre-read is the ONE predicate, handed the registry's sticker token", async () => {
    await bindTable(CART, 5);
    const pre = queries.find((q) => q.table === "table_sessions" && q.op === "select");
    expect(pre?.eq).toContainEqual(["table_number", 5]);
    expect(pre?.eq).toContainEqual(["mode", "dinein"]);
    expect(pre?.eq).toContainEqual(["status", "active"]);
    // The registry read carries the token the predicate falls back to.
    const reg = queries.find((q) => q.table === "qr_tables");
    expect(reg?.cols?.split(",")).toEqual(expect.arrayContaining(["table_number", "qr_code"]));
  });

  it("a NUMBERLESS live party on the table's sticker (the stranded shape) → seated, no call", async () => {
    tokenHolderRow = {
      id: "sess-stranded",
      mode: "dinein",
      host_seat: "seat-x",
      qr_code: "STICKER5",
      table_number: null,
    };
    expect(await bindTable(CART, 5)).toEqual({ ok: false, reason: "seated" });
    expect(writes()).toEqual([]);
    const byToken = queries.find((q) => q.eq.some(([c, v]) => c === "qr_code" && v === "STICKER5"));
    expect(byToken?.is).toContainEqual(["table_number", null]);
  });

  it("the OWN numberless row on the table's sticker (this session is the stranded shape) is NOT 'already' — the call runs WITHOUT a shell and lands it (Codex r1 on #314, P1)", async () => {
    tokenHolderRow = {
      id: "sess-1",
      mode: "dinein",
      qr_code: "STICKER5",
      table_number: null,
      host_seat: "seat-host",
    };
    expect(await bindTable(CART, 5)).toEqual({
      ok: true,
      tableNumber: 5,
      already: false,
    });
    expect(log).toEqual(["authz", "sweep", RPC, `touch:${CART}:bindTable`]);
    expect(calls()[0]?.payload?.p_shell === undefined).toBe(true);
  });

  it("the OWN row already at n (two tabs) → ok, already — no call, no sweep, no touch", async () => {
    holderRows = [
      {
        id: "sess-1",
        mode: "dinein",
        host_seat: "seat-host",
        qr_code: "GEN1",
        table_number: 5,
      },
    ];
    expect(await bindTable(CART, 5)).toEqual({
      ok: true,
      tableNumber: 5,
      already: true,
    });
    expect(writes()).toEqual([]);
    expect(log).not.toContain(`touch:${CART}:bindTable`);
  });

  it("a FAILED pre-read → error, never a write over an unknowable table", async () => {
    // An Error-shaped entry is handed back as the number read's `error`, which the predicate throws.
    holderRows = [{ __error: "fetch failed" }];
    expect(await bindTable(CART, 5)).toEqual({ ok: false, reason: "error" });
    expect(writes()).toEqual([]);
  });
});

describe("bindTable — `unmoved` is a re-read, never a landing", () => {
  const live = {
    status: "active",
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
  };

  it("own row already at n → ok, already — and NO touchCart (the landing tab touched)", async () => {
    rpcAnswer = answerWith("unmoved");
    ownRow = { ...live, table_number: 5 };
    expect(await bindTable(CART, 5)).toEqual({
      ok: true,
      tableNumber: 5,
      already: true,
    });
    expect(log).not.toContain(`touch:${CART}:bindTable`);
    expect(captured).toEqual([]);
    const reread = queries.filter((q) => q.table === "table_sessions" && q.op === "select").pop();
    expect(reread?.eq).toContainEqual(["id", "sess-1"]);
  });

  it("own row at 3 → already_bound 3", async () => {
    rpcAnswer = answerWith("unmoved");
    ownRow = { ...live, table_number: 3 };
    expect(await bindTable(CART, 5)).toEqual({
      ok: false,
      reason: "already_bound",
      tableNumber: 3,
    });
  });

  it("own row closed (or gone) → session_expired; a live unbound row the CAS still refused → error", async () => {
    rpcAnswer = answerWith("unmoved");
    ownRow = { ...live, status: "closed", table_number: null };
    expect(await bindTable(CART, 5)).toEqual({
      ok: false,
      reason: "session_expired",
    });
    ownRow = null;
    expect(await bindTable(CART, 5)).toEqual({
      ok: false,
      reason: "session_expired",
    });
    ownRow = { ...live, table_number: null };
    expect(await bindTable(CART, 5)).toEqual({ ok: false, reason: "error" });
    expect(log).not.toContain(`touch:${CART}:bindTable`);
  });
});
