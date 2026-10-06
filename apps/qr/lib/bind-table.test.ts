import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 3c-ii (D24) — `bindTable(cartId, n)`: the host seats an UNBOUND dine-in session at a
 * registered table, once, under the lock model, with refusals that name the recovery and never a
 * merge. Asserted as QUERIES and ORDER on one log (the degenerate-mock lesson), with the REAL
 * `lib/seated.ts` helpers running against the scripted client — so the sweep's and the CAS's
 * predicates are exercised here, not mocked away.
 *
 * The laws this file pins: every refusal lands BEFORE any write, in `sendToKitchen`'s order; the
 * bind writes `table_number` ONLY (no `qr_code`, no `expires_at`, no membership row); the sweep
 * precedes the CAS and the peers' resync (`touchCart`) follows a LANDED row only; a 23505 is
 * re-read BY NUMBER and answered `seated` with nothing written on the other session; a zero-row CAS
 * is answered by the re-read, never reported as a landing.
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
  op: "select" | "update" | "insert";
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
/** What the CAS answers. */
let cas: { count: number | null; error: { code: string; message: string } | null } = {
  count: 1,
  error: null,
};
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
      if (q.op === "update" && "table_number" in (q.payload ?? {})) {
        log.push("cas");
        return Promise.resolve(cas).then(res, rej);
      }
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
  }),
}));

const { bindTable } = await import("./bind-table");

const CART = "ca97f000-0000-4000-8000-000000000002";
const writes = () => queries.filter((q) => q.op !== "select");
const sessionWrites = () => writes().filter((q) => q.table === "table_sessions");

beforeEach(() => {
  log = [];
  queries = [];
  captured = [];
  authz = HOST;
  rateOk = true;
  registryRow = { table_number: 5, qr_code: "STICKER5" };
  registryError = null;
  cas = { count: 1, error: null };
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

describe("bindTable — the write: one column, swept first, peers resynced only on a landing", () => {
  it("the CAS writes table_number ONLY (no qr_code, no expires_at) with count: exact, under the unbound·live predicate", async () => {
    expect(await bindTable(CART, 5)).toEqual({ ok: true, tableNumber: 5, already: false });
    const casQ = sessionWrites().find((q) => "table_number" in (q.payload ?? {}));
    expect(Object.keys(casQ?.payload ?? {})).toEqual(["table_number"]);
    expect(casQ?.payload?.table_number).toBe(5);
    expect(casQ?.opts).toEqual({ count: "exact" });
    expect(casQ?.eq).toContainEqual(["id", "sess-1"]);
    expect(casQ?.is).toContainEqual(["table_number", null]);
    expect(casQ?.eq).toContainEqual(["status", "active"]);
    expect(casQ?.eq).toContainEqual(["mode", "dinein"]);
    expect(casQ?.gt[0]?.[0]).toBe("expires_at");
  });

  it("the sweep runs BEFORE the CAS and touchCart AFTER it — one log", async () => {
    await bindTable(CART, 5);
    expect(log).toEqual(["authz", "sweep", "cas", `touch:${CART}:bindTable`]);
    const sweep = sessionWrites().find((q) => q.payload?.status === "closed");
    expect(sweep?.eq).toContainEqual(["table_number", 5]);
    expect(sweep?.lte[0]?.[0]).toBe("expires_at");
  });

  it("writes NO membership row, consults NO membership, and slides NO expiry", async () => {
    await bindTable(CART, 5);
    expect(queries.some((q) => q.table === "session_members")).toBe(false);
    expect(writes().some((q) => "expires_at" in (q.payload ?? {}))).toBe(false);
    expect(writes().some((q) => "qr_code" in (q.payload ?? {}))).toBe(false);
  });

  it("a landing fires `table_bound` with the cart, session and number", async () => {
    await bindTable(CART, 5);
    expect(captured).toEqual([
      {
        distinctId: "seat-host",
        event: "table_bound",
        properties: { cart_id: CART, session_id: "sess-1", table_number: 5 },
      },
    ]);
  });
});

describe("bindTable — a 23505 is the number, read by NUMBER, answered seated, nothing evicted", () => {
  it("23505 → seated, re-read through the live-dine-in-at-N predicate", async () => {
    cas = { count: null, error: { code: "23505", message: "duplicate key" } };
    holderRows = [null, { id: "sess-other", table_number: 5 }]; // empty at the pre-read, taken at the re-read
    expect(await bindTable(CART, 5)).toEqual({ ok: false, reason: "seated" });
    const reread = queries.filter((q) => q.table === "table_sessions" && q.op === "select").pop();
    expect(reread?.eq).toContainEqual(["table_number", 5]);
    expect(reread?.eq).toContainEqual(["mode", "dinein"]);
    expect(reread?.eq).toContainEqual(["status", "active"]);
    expect(reread?.eq.some(([c]) => c === "qr_code")).toBe(false);
    expect(log).not.toContain(`touch:${CART}:bindTable`);
  });

  it("on seated, the ONLY session writes are the dead-row sweep and the own-row CAS — the other party is never closed or re-tabled", async () => {
    cas = { count: null, error: { code: "23505", message: "duplicate key" } };
    holderRows = [null, { id: "sess-other", table_number: 5 }];
    await bindTable(CART, 5);
    const w = sessionWrites();
    expect(w).toHaveLength(2);
    for (const q of w) {
      const ownRowOnly = q.eq.some(([c, v]) => c === "id" && v === "sess-1");
      const deadRowsOnly = q.lte.some(([c]) => c === "expires_at");
      expect(ownRowOnly || deadRowsOnly).toBe(true);
    }
    expect(w.some((q) => q.op === "insert")).toBe(false);
  });

  it("23505 whose holder has already gone → error (retryable), never seated-by-constraint-name", async () => {
    cas = { count: null, error: { code: "23505", message: "table_sessions_active_table_uniq" } };
    holderRows = [null];
    expect(await bindTable(CART, 5)).toEqual({ ok: false, reason: "error" });
  });

  it("23503 (the registry FK — the table retired between the read and the write) → unavailable", async () => {
    cas = { count: null, error: { code: "23503", message: "fk" } };
    expect(await bindTable(CART, 5)).toEqual({ ok: false, reason: "unavailable" });
  });

  it("any other write error → error", async () => {
    cas = { count: null, error: { code: "42703", message: "boom" } };
    expect(await bindTable(CART, 5)).toEqual({ ok: false, reason: "error" });
  });
});

describe("bindTable — the occupancy PRE-READ, before any write (the blind pass on 3c-ii, money lens)", () => {
  // The index is the authority for the truly simultaneous case; the pre-read decides the common
  // one. Without it a stale "Open" chip lands a second party on N in the deploy-before-apply window
  // the migration header names — the register and the kiosk pre-read the same way.
  it("a SEATED table → seated, with NO sweep and NO CAS", async () => {
    holderRows = [{ id: "sess-other", host_seat: "seat-x", table_number: 5 }];
    expect(await bindTable(CART, 5)).toEqual({ ok: false, reason: "seated" });
    expect(sessionWrites()).toEqual([]);
    expect(log).toEqual(["authz"]);
  });

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

  it("a NUMBERLESS live row on the table's sticker (the stranded shape) → seated, no CAS", async () => {
    tokenHolderRow = { id: "sess-stranded", qr_code: "STICKER5", table_number: null };
    expect(await bindTable(CART, 5)).toEqual({ ok: false, reason: "seated" });
    expect(sessionWrites()).toEqual([]);
    const byToken = queries.find((q) => q.eq.some(([c, v]) => c === "qr_code" && v === "STICKER5"));
    expect(byToken?.is).toContainEqual(["table_number", null]);
  });

  it("the OWN row already at n (two tabs) → ok, already — nothing written, no touch", async () => {
    holderRows = [{ id: "sess-1", host_seat: "seat-host", table_number: 5 }];
    expect(await bindTable(CART, 5)).toEqual({ ok: true, tableNumber: 5, already: true });
    expect(sessionWrites()).toEqual([]);
    expect(log).not.toContain(`touch:${CART}:bindTable`);
  });

  it("a FAILED pre-read → error, never a write over an unknowable table", async () => {
    // The scripted client answers the number read with an error through `seatedSessionFor`'s own
    // throw: script the registry fine and make the predicate's read fail.
    holderRows = [null];
    const failing = { message: "fetch failed" };
    const orig = registryRow;
    registryRow = orig;
    // Route the number read's error through the chain: the mock answers `holderRows` entries as
    // data; an Error-shaped entry is handed back as `error`.
    holderRows = [{ __error: failing.message }];
    expect(await bindTable(CART, 5)).toEqual({ ok: false, reason: "error" });
    expect(sessionWrites()).toEqual([]);
  });
});

describe("bindTable — zero rows is a re-read, never a landing", () => {
  const live = { status: "active", expires_at: new Date(Date.now() + 3_600_000).toISOString() };

  it("own row already at n → ok, already — and NO touchCart (the landing tab touched)", async () => {
    cas = { count: 0, error: null };
    ownRow = { ...live, table_number: 5 };
    expect(await bindTable(CART, 5)).toEqual({ ok: true, tableNumber: 5, already: true });
    expect(log).not.toContain(`touch:${CART}:bindTable`);
    expect(captured).toEqual([]);
    const reread = queries.filter((q) => q.table === "table_sessions" && q.op === "select").pop();
    expect(reread?.eq).toContainEqual(["id", "sess-1"]);
  });

  it("own row at 3 → already_bound 3", async () => {
    cas = { count: 0, error: null };
    ownRow = { ...live, table_number: 3 };
    expect(await bindTable(CART, 5)).toEqual({
      ok: false,
      reason: "already_bound",
      tableNumber: 3,
    });
  });

  it("own row closed → session_expired", async () => {
    cas = { count: 0, error: null };
    ownRow = { ...live, status: "closed", table_number: null };
    expect(await bindTable(CART, 5)).toEqual({ ok: false, reason: "session_expired" });
  });

  it("a null count is zero rows, never a landing", async () => {
    cas = { count: null, error: null };
    ownRow = null;
    expect(await bindTable(CART, 5)).toEqual({ ok: false, reason: "session_expired" });
    expect(log).not.toContain(`touch:${CART}:bindTable`);
  });
});
