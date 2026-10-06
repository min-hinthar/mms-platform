import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 3c-ii (D23 · D25) — `seatedSessionFor` is the ONE server predicate for "a party is seated at
 * table N", read by the mint, the register, the kiosk, the picker's occupancy and the bind. Asserted
 * as QUERIES (the `kiosk.test.ts` idiom): every consumer inherits exactly these four conjuncts —
 * `table_number = N · mode = 'dinein' · status = 'active' · expires_at > now()` — so a reader that
 * dropped one would seat a table on an expired, closed or pickup row for EVERY surface at once.
 *
 * A read error THROWS (W10a — unknowable ≠ free): before this module the picker destructured
 * `{ data: active }` with no error branch, so a failed sessions read marked every table Open
 * (finding 6). The pure halves — `occupancyFor`, `claimDisposition`, `bindVerdict` — are falsified
 * by VALUE.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: () => Promise.resolve({}) }));
vi.mock("@mms/db/server", () => ({ serverClient: () => ({}), serviceClient: () => ({}) }));

type Q = {
  table: string;
  op: "select" | "update";
  cols?: string;
  payload?: Record<string, unknown>;
  opts?: Record<string, unknown>;
  eq: [string, unknown][];
  gt: [string, unknown][];
  lte: [string, unknown][];
  is: [string, unknown][];
  limit: number[];
};
let queries: Q[] = [];
type Answer = { data: unknown; error: { message: string; code?: string } | null; count?: number };
/** What the next read answers. */
let answer: Answer = { data: null, error: null };
/** Scripted answers for consecutive reads (the token fallback is a SECOND read); `answer` repeats
 *  once the script is spent. */
let answers: Answer[] = [];
const next = () => answers.shift() ?? answer;

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
    is(col: string, val: unknown) {
      q.is.push([col, val]);
      return api;
    },
    limit(n: number) {
      q.limit.push(n);
      return api;
    },
    maybeSingle: () => Promise.resolve(next()),
    then(res: (v: Answer) => unknown, rej?: (e: unknown) => unknown) {
      return Promise.resolve(next()).then(res, rej);
    },
  };
  return api;
}
const db = {
  from: (table: string) => ({
    select: (cols: string) => {
      const q: Q = { table, op: "select", cols, eq: [], gt: [], lte: [], is: [], limit: [] };
      queries.push(q);
      return chain(q);
    },
    update: (payload: Record<string, unknown>, opts?: Record<string, unknown>) => {
      const q: Q = {
        table,
        op: "update",
        payload,
        opts,
        eq: [],
        gt: [],
        lte: [],
        is: [],
        limit: [],
      };
      queries.push(q);
      return chain(q);
    },
  }),
} as unknown as Parameters<typeof seatedSessionFor>[0];

const {
  bindSessionTable,
  bindVerdict,
  claimDisposition,
  occupancyFor,
  seatedSessionFor,
  seatedTableNumbers,
  sweepExpiredOnTable,
} = await import("./seated");
const { AuthzError } = await import("./authz");

const SESS = {
  id: "sess-7",
  mode: "dinein",
  host_seat: "seat-a",
  qr_code: "GENCODE7",
  table_number: 7,
};

beforeEach(() => {
  queries = [];
  answer = { data: null, error: null };
  answers = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe("seatedSessionFor — the ONE live-dine-in-at-N predicate", () => {
  it("applies all four conjuncts and hands back the row", async () => {
    answer = { data: SESS, error: null };
    const got = await seatedSessionFor(db, 7);
    expect(got).toEqual(SESS);
    const [q] = queries;
    expect(q?.table).toBe("table_sessions");
    expect(q?.cols).toBe("id,mode,host_seat,qr_code,table_number");
    // Keyed on the NUMBER — a generated-code session bound late to 7 must be found here, and a
    // token-keyed read could not see it (finding 1).
    expect(q?.eq).toContainEqual(["table_number", 7]);
    expect(q?.eq).toContainEqual(["mode", "dinein"]);
    expect(q?.eq).toContainEqual(["status", "active"]);
    expect(q?.eq.some(([col]) => col === "qr_code")).toBe(false);
    expect(q?.gt).toHaveLength(1);
    expect(q?.gt[0]?.[0]).toBe("expires_at");
    expect(String(q?.gt[0]?.[1])).toMatch(ISO);
  });

  it("answers null for an empty table", async () => {
    expect(await seatedSessionFor(db, 7)).toBeNull();
  });

  it("a read ERROR throws `unavailable` — never 'free' (finding 6, W10a)", async () => {
    answer = { data: null, error: { message: "fetch failed" } };
    await expect(seatedSessionFor(db, 7)).rejects.toSatisfy(
      (e: unknown) => e instanceof AuthzError && e.code === "unavailable" && e.status === 503,
    );
  });

  // The blind pass on 3c-ii (money lens, CRITICAL 1): a live dine-in row on a REGISTERED sticker
  // whose number is still null — the mint stamps null when its own registry read fails, and a
  // sticker registered mid-session leaves one behind — was reachable by NOBODY once every find
  // went number-first: the host's reload 500'd on its own token, an invite 404'd, the register
  // read an outage. The token is the SECOND read, and only for that stranded shape.
  describe("the sticker-token fallback — a numberless live row on the registered token", () => {
    const STRANDED = { ...SESS, id: "sess-stranded", qr_code: "STICKER7", table_number: null };

    it("is the SECOND read, keyed on the token with the number still null, when nobody is at N", async () => {
      answers = [
        { data: null, error: null },
        { data: STRANDED, error: null },
      ];
      expect(await seatedSessionFor(db, 7, "STICKER7")).toEqual(STRANDED);
      expect(queries).toHaveLength(2);
      const [byNumber, byToken] = queries;
      expect(byNumber?.eq).toContainEqual(["table_number", 7]);
      expect(byToken?.eq).toContainEqual(["qr_code", "STICKER7"]);
      expect(byToken?.is).toContainEqual(["table_number", null]);
      // The same three live-dine-in conjuncts: a closed, expired or pickup row on the token is
      // not a party either.
      expect(byToken?.eq).toContainEqual(["mode", "dinein"]);
      expect(byToken?.eq).toContainEqual(["status", "active"]);
      expect(byToken?.gt[0]?.[0]).toBe("expires_at");
      expect(byToken?.eq.some(([col]) => col === "table_number")).toBe(false);
    });

    it("never runs when the number read found the party — the number is the identity", async () => {
      answer = { data: SESS, error: null };
      expect(await seatedSessionFor(db, 7, "STICKER7")).toEqual(SESS);
      expect(queries).toHaveLength(1);
    });

    it("never runs without a token (a generated code has no sticker to fall back to)", async () => {
      expect(await seatedSessionFor(db, 7)).toBeNull();
      expect(await seatedSessionFor(db, 7, null)).toBeNull();
      expect(queries).toHaveLength(2);
      expect(queries.every((q) => q.eq.some(([col]) => col === "table_number"))).toBe(true);
    });

    it("a failed token read throws `unavailable` like the number read", async () => {
      answers = [
        { data: null, error: null },
        { data: null, error: { message: "fetch failed" } },
      ];
      await expect(seatedSessionFor(db, 7, "STICKER7")).rejects.toSatisfy(
        (e: unknown) => e instanceof AuthzError && e.code === "unavailable",
      );
    });
  });
});

describe("seatedTableNumbers — the picker's occupancy read", () => {
  it("reads live dine-in rows with the same mode/status/expiry conjuncts and sets their numbers", async () => {
    answer = {
      data: [
        SESS,
        { ...SESS, id: "s2", table_number: 9 },
        { ...SESS, id: "s3", table_number: null },
      ],
      error: null,
    };
    const set = await seatedTableNumbers(db);
    expect(set).toEqual(new Set([7, 9]));
    const [q] = queries;
    expect(q?.eq).toContainEqual(["mode", "dinein"]);
    expect(q?.eq).toContainEqual(["status", "active"]);
    expect(q?.gt[0]?.[0]).toBe("expires_at");
    expect(q?.eq.some(([col]) => col === "qr_code")).toBe(false);
  });

  it("answers null (not an empty set) on a read error — the caller degrades, it never reads 'all Open'", async () => {
    answer = { data: null, error: { message: "fetch failed" } };
    expect(await seatedTableNumbers(db)).toBeNull();
  });
});

describe("occupancyFor — pure", () => {
  it("marks exactly the numbers in the set", () => {
    expect(occupancyFor([7, 8, 9], new Set([7, 9]))).toEqual([
      { tableNumber: 7, occupied: true },
      { tableNumber: 8, occupied: false },
      { tableNumber: 9, occupied: true },
    ]);
  });
  it("a null set (a failed read) is NO list — never every table Open", () => {
    expect(occupancyFor([7, 8], null)).toEqual([]);
  });
  it("an empty set marks nothing", () => {
    expect(occupancyFor([7], new Set())).toEqual([{ tableNumber: 7, occupied: false }]);
  });
});

describe("sweepExpiredOnTable — dead rows only, by NUMBER", () => {
  it("closes active dine-in rows on N whose expiry has passed, and nothing live", async () => {
    await sweepExpiredOnTable(db, 7);
    const [q] = queries;
    expect(q?.op).toBe("update");
    expect(q?.table).toBe("table_sessions");
    expect(q?.payload).toEqual({ status: "closed" });
    expect(q?.eq).toContainEqual(["table_number", 7]);
    expect(q?.eq).toContainEqual(["mode", "dinein"]);
    expect(q?.eq).toContainEqual(["status", "active"]);
    expect(q?.eq.some(([col]) => col === "qr_code")).toBe(false);
    // The one conjunct that keeps this from closing a LIVE table.
    expect(q?.lte).toHaveLength(1);
    expect(q?.lte[0]?.[0]).toBe("expires_at");
    expect(String(q?.lte[0]?.[1])).toMatch(ISO);
  });
});

describe("bindSessionTable — the row-count CAS (D21)", () => {
  it("writes table_number ONLY, counted exactly, under the unbound·active·dinein·live predicate", async () => {
    answer = { data: null, error: null, count: 1 };
    const r = await bindSessionTable(db, "sess-1", 5);
    expect(r).toEqual({ count: 1, error: null });
    const [q] = queries;
    expect(q?.op).toBe("update");
    expect(q?.table).toBe("table_sessions");
    // The join identity is the row's qr_code for its whole life (finding 4); the NUMBER is the seat.
    expect(Object.keys(q?.payload ?? {})).toEqual(["table_number"]);
    expect(q?.payload?.table_number).toBe(5);
    // `.update()` with no count reports a blocked write as success (lock.ts's lesson).
    expect(q?.opts).toEqual({ count: "exact" });
    expect(q?.eq).toContainEqual(["id", "sess-1"]);
    expect(q?.is).toContainEqual(["table_number", null]);
    expect(q?.eq).toContainEqual(["status", "active"]);
    expect(q?.eq).toContainEqual(["mode", "dinein"]);
    expect(q?.gt[0]?.[0]).toBe("expires_at");
  });

  it("hands the error back untouched — the caller reads 23505 / 23503 by code", async () => {
    answer = { data: null, error: { message: "dup", code: "23505" }, count: 0 };
    const r = await bindSessionTable(db, "sess-1", 5);
    expect(r.error?.code).toBe("23505");
  });
});

describe("claimDisposition — J33's unbound half (D25)", () => {
  const mine = { ...SESS, table_number: null, host_seat: "seat-a" };
  it("binds the live UNBOUND dine-in session THIS seat hosts, when the table is empty", () => {
    expect(claimDisposition({ seated: false, mine, seat: "seat-a" })).toBe("bind");
  });
  it("mints when the table is seated", () => {
    expect(claimDisposition({ seated: true, mine, seat: "seat-a" })).toBe("mint");
  });
  it("mints when the prior session is a GUEST's (host_seat differs)", () => {
    expect(claimDisposition({ seated: false, mine, seat: "seat-b" })).toBe("mint");
  });
  it("mints when the prior session is already BOUND", () => {
    expect(
      claimDisposition({ seated: false, mine: { ...mine, table_number: 3 }, seat: "seat-a" }),
    ).toBe("mint");
  });
  it("mints when the prior session is not dine-in", () => {
    expect(
      claimDisposition({ seated: false, mine: { ...mine, mode: "pickup" }, seat: "seat-a" }),
    ).toBe("mint");
  });
  it("mints with no prior session at all", () => {
    expect(claimDisposition({ seated: false, mine: null, seat: "seat-a" })).toBe("mint");
  });
});

describe("bindVerdict — every arm of the zero-row re-read (D24)", () => {
  const now = Date.parse("2026-10-05T12:00:00.000Z");
  const live = { status: "active", expires_at: "2026-10-05T15:00:00.000Z" };
  it("a landed row is ok (never already)", () => {
    expect(bindVerdict({ count: 1, reread: null, n: 5, nowMs: now })).toEqual({
      ok: true,
      tableNumber: 5,
      already: false,
    });
  });
  it("0 rows + the own row already at n → ok, already (two tabs)", () => {
    expect(
      bindVerdict({ count: 0, reread: { ...live, table_number: 5 }, n: 5, nowMs: now }),
    ).toEqual({
      ok: true,
      tableNumber: 5,
      already: true,
    });
  });
  it("0 rows + the own row at another number → already_bound(m)", () => {
    expect(
      bindVerdict({ count: 0, reread: { ...live, table_number: 3 }, n: 5, nowMs: now }),
    ).toEqual({
      ok: false,
      reason: "already_bound",
      tableNumber: 3,
    });
  });
  it("0 rows + a closed row → session_expired", () => {
    expect(
      bindVerdict({
        count: 0,
        reread: { ...live, status: "closed", table_number: null },
        n: 5,
        nowMs: now,
      }),
    ).toEqual({ ok: false, reason: "session_expired" });
  });
  it("0 rows + an expired row → session_expired", () => {
    expect(
      bindVerdict({
        count: 0,
        reread: { status: "active", expires_at: "2026-10-05T11:59:59.000Z", table_number: null },
        n: 5,
        nowMs: now,
      }),
    ).toEqual({ ok: false, reason: "session_expired" });
  });
  it("0 rows + no row at all → session_expired", () => {
    expect(bindVerdict({ count: 0, reread: null, n: 5, nowMs: now })).toEqual({
      ok: false,
      reason: "session_expired",
    });
  });
  it("0 rows + a live unbound row the CAS still refused → error, never a claimed landing", () => {
    expect(
      bindVerdict({ count: 0, reread: { ...live, table_number: null }, n: 5, nowMs: now }),
    ).toEqual({
      ok: false,
      reason: "error",
    });
  });
});
