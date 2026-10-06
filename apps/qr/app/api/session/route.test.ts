import { beforeEach, describe, expect, it, vi } from "vitest";
import { BIND_COPY } from "@/lib/bind-copy";

/**
 * `/api/session` — the mint, pinned at the WIRING level with a FILTER-AWARE mock (Phase 3c-ii):
 * every `table_sessions` / `session_members` / `qr_tables` read is answered by applying the
 * captured predicates (`eq` · `gt` · `lte` · `is`) to fixture rows, and every update applies its
 * payload to the rows it matches. The previous mock answered every sessions select with one row,
 * which could not tell a number-keyed read from a token-keyed one — and the whole of D25 is that
 * difference.
 *
 * Phase 2f · P2v (Codex r3 on #308) — the route never attaches a diner to a counter order. A
 * register (`reg-`) counter order is minted by staff with NO member row; a client that knew an
 * active `reg-` code could JOIN it and add a to-go draft the counter Send fires unpaid. The
 * decision is `reservedCodeRefusal` (lib/session-code.ts); this suite pins that a refused join
 * answers before ANY write — no expiry slide, no host claim, no membership, no cart.
 *
 * Phase 3c-ii (D21 · D25) — the sticker scan, the `?table` claim and the home card converge BY
 * NUMBER through the one predicate; a claim from a phone with a live UNBOUND hosted session BINDS
 * it (J33's unbound half); a number-found reserved session still meets the "join" refusal; a
 * failed number read is an outage; a bare host-start never consults the number.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: () => Promise.resolve({}) }));

const SEAT = "00000000-0000-0000-0000-00000000cx30";
const OTHER = "00000000-0000-0000-0000-00000000ffff";

type Row = {
  id: string;
  mode: string;
  host_seat: string | null;
  qr_code: string;
  table_number: number | null;
  status: string;
  expires_at: string;
};
type Q = {
  table: string;
  op: "select" | "insert" | "update";
  cols?: string;
  payload?: Record<string, unknown>;
  opts?: Record<string, unknown>;
  eq: [string, unknown][];
  gt: [string, unknown][];
  lte: [string, unknown][];
  is: [string, unknown][];
};

/** The refused-join copy — true for a counter order AND a kiosk order, so it names neither. */
const JOIN_REFUSED = "That order can’t be joined from a phone — please ask staff.";
const FUTURE = new Date(Date.now() + 3_600_000).toISOString();
const PAST = new Date(Date.now() - 60_000).toISOString();

let sessions: Row[] = [];
let members: { session_id: string; seat_id: string }[] = [];
let registry: { table_number: number; qr_code: string; active: boolean }[] = [];
/** Every write the route issued, as `table:op`. */
let writes: string[] = [];
let queries: Q[] = [];
/** The first `table_sessions` insert refuses with this code, after `then` ran (the concurrent winner). */
let insertCollision: { code: string; then?: () => void } | null = null;
/** The bind's CAS refuses with this code (a phone/kiosk took N between the read and the write). */
let bindCollision: { code: string } | null = null;
/** Runs when the bind's CAS is issued, BEFORE it matches rows — the row moving under the write. */
let bindHook: (() => void) | null = null;
/** The number-keyed read fails (an outage). */
let numberReadFails = false;
/** The membership read fails (an outage). */
let membersReadFails = false;

vi.mock("@/lib/rate", () => ({ withinJoinRate: () => Promise.resolve(true) }));
vi.mock("@/lib/posthog-server", () => ({ getPostHogClient: () => ({ capture: () => {} }) }));

let nextId = 0;
function matches(row: Record<string, unknown>, q: Q): boolean {
  return (
    q.eq.every(([c, v]) => row[c] === v) &&
    q.gt.every(([c, v]) => String(row[c]) > String(v)) &&
    q.lte.every(([c, v]) => String(row[c]) <= String(v)) &&
    q.is.every(([c, v]) => (v === null ? row[c] == null : row[c] === v))
  );
}
function pick(row: Row, cols?: string) {
  if (!cols) return row;
  return Object.fromEntries(cols.split(",").map((c) => [c, (row as Record<string, unknown>)[c]]));
}

vi.mock("@mms/db/server", () => ({
  sessionClient: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: { id: SEAT } }, error: null }) },
  }),
  serviceClient: () => ({
    from: (table: string) => {
      const q: Q = { table, op: "select", eq: [], gt: [], lte: [], is: [] };
      queries.push(q);
      const result = (): { data: unknown; error: unknown; count?: number | null } => {
        if (q.op === "insert") {
          if (table === "table_sessions") {
            if (insertCollision) {
              const c = insertCollision;
              insertCollision = null;
              c.then?.();
              return { data: null, error: { code: c.code, message: "duplicate key" } };
            }
            const row: Row = {
              id: `sess-new-${++nextId}`,
              status: "active",
              expires_at: FUTURE,
              ...(q.payload as Omit<Row, "id" | "status" | "expires_at">),
            };
            sessions.push(row);
            return { data: pick(row, q.cols), error: null };
          }
          if (table === "qr_carts") return { data: { id: "cart-1" }, error: null };
          if (table === "session_members") {
            members.push(q.payload as { session_id: string; seat_id: string });
            return { data: null, error: null };
          }
          return { data: null, error: null };
        }
        if (q.op === "update") {
          if (table !== "table_sessions") return { data: null, error: null, count: 0 };
          if (bindCollision && "table_number" in (q.payload ?? {}))
            return { data: null, error: { code: bindCollision.code, message: "dup" }, count: null };
          if (bindHook && "table_number" in (q.payload ?? {})) {
            const h = bindHook;
            bindHook = null;
            h();
          }
          const hit = sessions.filter((r) => matches(r, q));
          for (const r of hit) Object.assign(r, q.payload);
          const first = hit[0];
          return { data: first ? pick(first, q.cols) : null, error: null, count: hit.length };
        }
        if (table === "table_sessions") {
          if (numberReadFails && q.eq.some(([c]) => c === "table_number"))
            return { data: null, error: { message: "fetch failed" } };
          const hit = sessions.filter((r) => matches(r, q)).map((r) => pick(r, q.cols));
          return { data: hit, error: null };
        }
        if (table === "session_members") {
          if (membersReadFails) return { data: null, error: { message: "fetch failed" } };
          const hit = members.filter((m) => matches(m, q));
          return {
            data: hit.map((m) => ({ id: `${m.session_id}:${m.seat_id}` })),
            error: null,
            count: hit.length,
          };
        }
        if (table === "qr_tables") {
          return { data: registry.filter((r) => matches(r, q)), error: null };
        }
        if (table === "qr_carts") return { data: [{ id: "cart-1" }], error: null };
        return { data: [], error: null, count: 0 };
      };
      const one = () => {
        const r = result();
        return { ...r, data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data };
      };
      const chain: Record<string, unknown> = {
        select: (cols?: string, opts?: Record<string, unknown>) => {
          q.cols = cols;
          if (opts) q.opts = opts;
          return chain;
        },
        eq: (c: string, v: unknown) => {
          q.eq.push([c, v]);
          return chain;
        },
        gt: (c: string, v: unknown) => {
          q.gt.push([c, v]);
          return chain;
        },
        lte: (c: string, v: unknown) => {
          q.lte.push([c, v]);
          return chain;
        },
        is: (c: string, v: unknown) => {
          q.is.push([c, v]);
          return chain;
        },
        order: () => chain,
        limit: () => chain,
        insert: (r: Record<string, unknown>) => {
          q.op = "insert";
          q.payload = r;
          writes.push(`${table}:insert`);
          return chain;
        },
        update: (r: Record<string, unknown>, opts?: Record<string, unknown>) => {
          q.op = "update";
          q.payload = r;
          q.opts = opts;
          writes.push(`${table}:update`);
          return chain;
        },
        maybeSingle: () => Promise.resolve(one()),
        single: () => Promise.resolve(one()),
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
          Promise.resolve(result()).then(res, rej),
      };
      return chain;
    },
  }),
}));

const { POST } = await import("./route");

function req(body: Record<string, unknown>) {
  return {
    json: () => Promise.resolve(body),
    headers: { get: (h: string) => (h === "authorization" ? "Bearer anon-token" : null) },
  } as unknown as Parameters<typeof POST>[0];
}

function row(
  qr_code: string,
  mode: string,
  host_seat: string | null = null,
  extra: Partial<Row> = {},
): Row {
  return {
    id: `sess-${qr_code}`,
    mode,
    host_seat,
    qr_code,
    table_number: null,
    status: "active",
    expires_at: FUTURE,
    ...extra,
  };
}
const REG7 = { table_number: 7, qr_code: "STICKER7", active: true };
const sessionInserts = () => writes.filter((w) => w === "table_sessions:insert");
const bindUpdates = () =>
  queries.filter(
    (q) => q.table === "table_sessions" && q.op === "update" && "table_number" in (q.payload ?? {}),
  );
const numberReads = () =>
  queries.filter(
    (q) =>
      q.table === "table_sessions" && q.op === "select" && q.eq.some(([c]) => c === "table_number"),
  );

beforeEach(() => {
  sessions = [];
  members = [];
  registry = [REG7];
  writes = [];
  queries = [];
  insertCollision = null;
  bindCollision = null;
  bindHook = null;
  numberReadFails = false;
  membersReadFails = false;
  nextId = 0;
});

describe("/api/session — reserved codes (Codex r3 on #308)", () => {
  it("refuses a diner JOIN to an active reg- counter order, before any write", async () => {
    sessions = [row("reg-ABCD1234", "pickup")];
    for (const mode of ["pickup", "dinein", "scango"]) {
      const res = await POST(req({ qrCode: "reg-ABCD1234", mode }));
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: string; cartId?: string };
      expect(body.error).toBe(JOIN_REFUSED);
      expect(body.cartId).toBeUndefined();
    }
    // No expiry slide, no host claim, no membership row, no cart — the join touched nothing.
    expect(writes).toEqual([]);
  });

  it("still refuses CREATING a reg- session (no active one)", async () => {
    const res = await POST(req({ qrCode: "reg-ABCD1234", mode: "pickup" }));
    expect(res.status).toBe(404);
    expect(writes).toEqual([]);
  });

  it("refuses a JOIN to an active kiosk- session too, before any write — dine-in or pickup", async () => {
    // A kiosk DINE-IN cart fires through `mms_fire_cart` before payment, and the kiosk device
    // inserts its OWN membership (lib/kiosk.ts) — no real client joins a kiosk code here. Even a
    // seat that is the session's host_seat gets no pass: the kiosk never reaches this route.
    for (const [mode, host] of [
      ["dinein", null],
      ["pickup", SEAT],
    ] as const) {
      sessions = [row("kiosk-ABCD1234", mode, host)];
      const res = await POST(req({ qrCode: "kiosk-ABCD1234", mode }));
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: string; cartId?: string };
      expect(body.error).toBe(JOIN_REFUSED);
      expect(body.cartId).toBeUndefined();
    }
    expect(writes).toEqual([]);
  });

  it("an ordinary dine-in sticker join is unaffected", async () => {
    sessions = [row("ABCD2345", "dinein", "someone-else")];
    const res = await POST(req({ qrCode: "ABCD2345", mode: "dinein" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { cartId: string; role: string; created: boolean };
    expect(body).toMatchObject({ cartId: "cart-1", role: "guest", created: false });
    expect(writes).toContain("session_members:insert");
  });
});

describe("/api/session — the two refusals are BIND_COPY's sentences, byte for byte", () => {
  it("a stranger's claim at a seated table says BIND_COPY.seated", async () => {
    sessions = [row("GENCODE7", "dinein", OTHER, { table_number: 7 })];
    const res = await POST(req({ tableNumber: 7, mode: "dinein" }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe(BIND_COPY.seated);
    expect(BIND_COPY.seated).toBe(
      "That table was just seated — join with the party’s code, or pick another.",
    );
  });

  it("an unregistered or inactive number says BIND_COPY.unavailable", async () => {
    registry = [{ ...REG7, active: false }];
    const res = await POST(req({ tableNumber: 7, mode: "dinein" }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(BIND_COPY.unavailable);
    expect(BIND_COPY.unavailable).toBe("That table isn’t available — pick another.");
    expect(writes).toEqual([]);
  });
});

describe("/api/session — the claim and the sticker find the table BY NUMBER (D25)", () => {
  it("(a) a MEMBER's claim at a late-bound session converges — no insert, that session's joinCode", async () => {
    // Bound at Send from a generated code: the sticker token never names this row.
    sessions = [row("GENCODE7", "dinein", SEAT, { table_number: 7 })];
    members = [{ session_id: "sess-GENCODE7", seat_id: SEAT }];
    const res = await POST(req({ tableNumber: 7, mode: "dinein" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      sessionId: "sess-GENCODE7",
      joinCode: "GENCODE7",
      tableNumber: 7,
      role: "host",
      created: false,
    });
    expect(sessionInserts()).toHaveLength(0);
    const [find] = numberReads();
    expect(find?.eq).toContainEqual(["table_number", 7]);
    expect(find?.eq).toContainEqual(["mode", "dinein"]);
    expect(find?.eq).toContainEqual(["status", "active"]);
  });

  it("(a′) a STRANGER's claim at a late-bound session is the shipped 409, with no write", async () => {
    sessions = [row("GENCODE7", "dinein", OTHER, { table_number: 7 })];
    members = [{ session_id: "sess-GENCODE7", seat_id: OTHER }];
    const res = await POST(req({ tableNumber: 7, mode: "dinein" }));
    expect(res.status).toBe(409);
    expect(writes).toEqual([]);
  });

  it("(c) a sticker scan at a late-bound session joins THAT session — no insert, membership on its id, the host's code persisted", async () => {
    sessions = [row("GENCODE7", "dinein", OTHER, { table_number: 7 })];
    members = [{ session_id: "sess-GENCODE7", seat_id: OTHER }];
    const res = await POST(req({ qrCode: "STICKER7", mode: "dinein" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      sessionId: "sess-GENCODE7",
      joinCode: "GENCODE7",
      tableNumber: 7,
      role: "guest",
      created: false,
    });
    expect(sessionInserts()).toHaveLength(0);
    expect(members).toContainEqual(
      expect.objectContaining({ session_id: "sess-GENCODE7", seat_id: SEAT }),
    );
  });

  it("an UNREGISTERED sticker is still found by its token (no number to key on)", async () => {
    registry = [];
    sessions = [row("LEGACY99", "dinein", OTHER)];
    const res = await POST(req({ qrCode: "LEGACY99", mode: "dinein" }));
    expect(res.status).toBe(200);
    expect((await res.json()) as Record<string, unknown>).toMatchObject({
      sessionId: "sess-LEGACY99",
      tableNumber: null,
      created: false,
    });
    expect(numberReads()).toHaveLength(0);
  });

  it("(d) a 23505 on the claim's insert is re-read BY NUMBER: this seat's own winner converges", async () => {
    insertCollision = {
      code: "23505",
      then: () => sessions.push(row("STICKER7", "dinein", SEAT, { table_number: 7 })),
    };
    const res = await POST(req({ tableNumber: 7, mode: "dinein" }));
    expect(res.status).toBe(200);
    expect((await res.json()) as Record<string, unknown>).toMatchObject({
      sessionId: "sess-STICKER7",
      created: false,
    });
    const insertIdx = queries.findIndex((q) => q.table === "table_sessions" && q.op === "insert");
    const reread = queries
      .slice(insertIdx + 1)
      .find((q) => q.table === "table_sessions" && q.op === "select");
    expect(reread?.eq).toContainEqual(["table_number", 7]);
    expect(reread?.eq.some(([c]) => c === "qr_code")).toBe(false);
  });

  it("(d′) a 23505 on the claim's insert whose winner is a stranger is the shipped 409", async () => {
    insertCollision = {
      code: "23505",
      then: () => sessions.push(row("GENCODE7", "dinein", OTHER, { table_number: 7 })),
    };
    const res = await POST(req({ tableNumber: 7, mode: "dinein" }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe(BIND_COPY.seated);
  });

  it("(d‴) a 23505 on the claim's insert with NO holder to read is 'try again' (500), never a seated verdict by constraint name", async () => {
    // The blind pass on 3c-ii (concurrency lens): `bindTable` answers `error` for this state; the
    // claim arm answered BIND_COPY.seated for a dead row the sweep failed to close.
    insertCollision = { code: "23505" };
    const res = await POST(req({ tableNumber: 7, mode: "dinein" }));
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: string }).error).not.toBe(BIND_COPY.seated);
  });

  it("(d″) a 23505 on the STICKER's insert joins the number-found winner", async () => {
    insertCollision = {
      code: "23505",
      then: () => sessions.push(row("GENCODE7", "dinein", OTHER, { table_number: 7 })),
    };
    const res = await POST(req({ qrCode: "STICKER7", mode: "dinein" }));
    expect(res.status).toBe(200);
    expect((await res.json()) as Record<string, unknown>).toMatchObject({
      sessionId: "sess-GENCODE7",
      role: "guest",
      created: false,
    });
  });

  it("(e) a number-found kiosk- session meets the 'join' refusal — claim AND sticker, no write", async () => {
    sessions = [row("kiosk-ABCD1234", "dinein", "kiosk-uid", { table_number: 7 })];
    for (const body of [{ tableNumber: 7 }, { qrCode: "STICKER7" }]) {
      const res = await POST(req({ ...body, mode: "dinein" }));
      expect(res.status).toBe(403);
      expect(((await res.json()) as { error: string }).error).toBe(JOIN_REFUSED);
    }
    expect(writes).toEqual([]);
  });

  it("(f) a bare host-start never consults the number read", async () => {
    const res = await POST(req({ mode: "dinein" }));
    expect(res.status).toBe(200);
    expect((await res.json()) as Record<string, unknown>).toMatchObject({
      created: true,
      tableNumber: null,
    });
    expect(numberReads()).toHaveLength(0);
    expect(bindUpdates()).toHaveLength(0);
  });

  it("a FAILED number read is 503 'we're down', never a mint over an unknowable table", async () => {
    numberReadFails = true;
    const res = await POST(req({ tableNumber: 7, mode: "dinein" }));
    expect(res.status).toBe(503);
    expect((await res.json()) as Record<string, unknown>).toMatchObject({ kind: "unavailable" });
    expect(writes).toEqual([]);
  });

  it("an EXPIRED row holding N is swept (dead rows only) before the claim's insert lands", async () => {
    sessions = [row("OLDCODE7", "dinein", OTHER, { table_number: 7, expires_at: PAST })];
    const res = await POST(req({ tableNumber: 7, mode: "dinein" }));
    expect(res.status).toBe(200);
    expect((await res.json()) as Record<string, unknown>).toMatchObject({
      created: true,
      tableNumber: 7,
    });
    const sweep = queries.find(
      (q) =>
        q.table === "table_sessions" &&
        q.op === "update" &&
        q.payload?.status === "closed" &&
        q.eq.some(([c]) => c === "table_number"),
    );
    expect(sweep?.eq).toContainEqual(["table_number", 7]);
    expect(sweep?.lte[0]?.[0]).toBe("expires_at");
    expect(sessions.find((s) => s.qr_code === "OLDCODE7")?.status).toBe("closed");
    const insertIdx = queries.findIndex((q) => q.table === "table_sessions" && q.op === "insert");
    expect(queries.indexOf(sweep!)).toBeLessThan(insertIdx);
  });
});

describe("/api/session — a claim from a phone with a live UNBOUND hosted session BINDS it (J33's unbound half)", () => {
  const mine = () => row("MYCODE12", "dinein", SEAT);

  it("(b) the persisted code names a live unbound dine-in session this seat HOSTS → ONE bind update, no insert, drafts intact", async () => {
    sessions = [mine()];
    members = [{ session_id: "sess-MYCODE12", seat_id: SEAT }];
    const res = await POST(req({ qrCode: "MYCODE12", tableNumber: 7, mode: "dinein" }));
    expect(res.status).toBe(200);
    expect((await res.json()) as Record<string, unknown>).toMatchObject({
      sessionId: "sess-MYCODE12",
      joinCode: "MYCODE12",
      tableNumber: 7,
      role: "host",
      created: false,
    });
    expect(sessionInserts()).toHaveLength(0);
    const binds = bindUpdates();
    expect(binds).toHaveLength(1);
    // D21 — table_number ONLY, counted exactly, on THIS row while still unbound and live.
    expect(Object.keys(binds[0]?.payload ?? {})).toEqual(["table_number"]);
    expect(binds[0]?.opts).toEqual({ count: "exact" });
    expect(binds[0]?.eq).toContainEqual(["id", "sess-MYCODE12"]);
    expect(binds[0]?.is).toContainEqual(["table_number", null]);
    expect(sessions[0]?.table_number).toBe(7);
    expect(sessions[0]?.qr_code).toBe("MYCODE12");
    // D30 — the peers' resync: the session's open cart is touched after the bind landed, so every
    // tablemate's `qr_carts` watch re-reads the view and the number flips without a remount (the
    // blind pass on 3c-ii: this arm had no touch, so a peer's Checkout kept asking a bound table).
    const touch = queries.find((q) => q.table === "qr_carts" && q.op === "update");
    expect(touch?.payload).toHaveProperty("updated_at");
    expect(touch?.eq).toContainEqual(["id", "cart-1"]);
  });

  it("a GUEST's prior session mints instead (never a bind of someone else's table)", async () => {
    sessions = [row("MYCODE12", "dinein", OTHER)];
    members = [{ session_id: "sess-MYCODE12", seat_id: SEAT }];
    const res = await POST(req({ qrCode: "MYCODE12", tableNumber: 7, mode: "dinein" }));
    expect(res.status).toBe(200);
    expect((await res.json()) as Record<string, unknown>).toMatchObject({
      created: true,
      tableNumber: 7,
    });
    expect(bindUpdates()).toHaveLength(0);
    expect(sessionInserts()).toHaveLength(1);
  });

  it("a BOUND prior session mints instead (several memberships are allowed; the bound half stays filed)", async () => {
    sessions = [row("MYCODE12", "dinein", SEAT, { table_number: 3 })];
    const res = await POST(req({ qrCode: "MYCODE12", tableNumber: 7, mode: "dinein" }));
    expect(res.status).toBe(200);
    expect((await res.json()) as Record<string, unknown>).toMatchObject({
      created: true,
      tableNumber: 7,
    });
    expect(bindUpdates()).toHaveLength(0);
    expect(sessions.find((s) => s.qr_code === "MYCODE12")?.table_number).toBe(3);
  });

  it("a RESERVED prior code is never read as 'mine' — a forged kiosk- code mints, it binds nothing", async () => {
    sessions = [row("kiosk-MINE1234", "dinein", SEAT)];
    const res = await POST(req({ qrCode: "kiosk-MINE1234", tableNumber: 7, mode: "dinein" }));
    expect(res.status).toBe(200);
    expect((await res.json()) as Record<string, unknown>).toMatchObject({ created: true });
    expect(bindUpdates()).toHaveLength(0);
    expect(sessions.find((s) => s.qr_code === "kiosk-MINE1234")?.table_number).toBeNull();
  });

  it("the bind's 23505 (N taken between the read and the write) is the shipped 409, no insert", async () => {
    sessions = [mine()];
    bindCollision = { code: "23505" };
    const res = await POST(req({ qrCode: "MYCODE12", tableNumber: 7, mode: "dinein" }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe(BIND_COPY.seated);
    expect(sessionInserts()).toHaveLength(0);
  });

  it("a zero-row bind whose row DIED under the write (closed between the read and the CAS) falls through to the mint", async () => {
    // The blind pass on 3c-ii (concurrency lens): the previous fixture expired the row BEFORE the
    // read, so `findActive` answered null and the CAS never ran — a test of a path it never entered.
    sessions = [mine()];
    bindHook = () => {
      sessions[0]!.status = "closed";
    };
    const res = await POST(req({ qrCode: "MYCODE12", tableNumber: 7, mode: "dinein" }));
    expect(res.status).toBe(200);
    expect((await res.json()) as Record<string, unknown>).toMatchObject({
      created: true,
      tableNumber: 7,
    });
    expect(bindUpdates()).toHaveLength(1);
    expect(sessionInserts()).toHaveLength(1);
  });

  it("a zero-row bind whose row was BOUND meanwhile (another tab landed 3) rejoins it at 3 — never a second session over its drafts", async () => {
    sessions = [mine()];
    members = [{ session_id: "sess-MYCODE12", seat_id: SEAT }];
    bindHook = () => {
      sessions[0]!.table_number = 3;
    };
    const res = await POST(req({ qrCode: "MYCODE12", tableNumber: 7, mode: "dinein" }));
    expect(res.status).toBe(200);
    expect((await res.json()) as Record<string, unknown>).toMatchObject({
      sessionId: "sess-MYCODE12",
      joinCode: "MYCODE12",
      tableNumber: 3,
      role: "host",
      created: false,
    });
    expect(bindUpdates()).toHaveLength(1);
    expect(sessionInserts()).toHaveLength(0);
    expect(sessions).toHaveLength(1);
  });

  it("a rejoin by the SAME persisted code after a bind returns tableNumber N with no insert (D21)", async () => {
    sessions = [row("MYCODE12", "dinein", SEAT, { table_number: 7 })];
    members = [{ session_id: "sess-MYCODE12", seat_id: SEAT }];
    const res = await POST(req({ qrCode: "MYCODE12", mode: "dinein" }));
    expect(res.status).toBe(200);
    expect((await res.json()) as Record<string, unknown>).toMatchObject({
      sessionId: "sess-MYCODE12",
      joinCode: "MYCODE12",
      tableNumber: 7,
      created: false,
    });
    expect(sessionInserts()).toHaveLength(0);
  });
});

describe("/api/session — the stranded shape: a NUMBERLESS live row on a registered sticker (the blind pass on 3c-ii, money lens)", () => {
  // The mint stamps `table_number: null` when its own registry read fails, and a sticker
  // registered mid-session leaves one behind. Once every find went number-first that party was
  // reachable by nobody: the host's reload 500'd on its own token, an invite 404'd. The token is
  // the predicate's SECOND read, for this shape only (lib/seated.ts).
  const stranded = (host: string | null = OTHER) => row("STICKER7", "dinein", host);

  it("(g) a sticker scan joins the numberless party on that sticker — no insert, no 500", async () => {
    sessions = [stranded()];
    members = [{ session_id: "sess-STICKER7", seat_id: OTHER }];
    const res = await POST(req({ qrCode: "STICKER7", mode: "dinein" }));
    expect(res.status).toBe(200);
    expect((await res.json()) as Record<string, unknown>).toMatchObject({
      sessionId: "sess-STICKER7",
      joinCode: "STICKER7",
      role: "guest",
      created: false,
    });
    expect(sessionInserts()).toHaveLength(0);
    // Number first, then the token with the number still null — never the token alone.
    const byNumber = numberReads()[0];
    const byToken = queries.find(
      (q) =>
        q.table === "table_sessions" &&
        q.op === "select" &&
        q.eq.some(([c, v]) => c === "qr_code" && v === "STICKER7"),
    );
    expect(byNumber).toBeDefined();
    expect(byToken?.is).toContainEqual(["table_number", null]);
    expect(queries.indexOf(byNumber!)).toBeLessThan(queries.indexOf(byToken!));
  });

  it("(g′) the HOST's own reload (its persisted code is the sticker) rejoins as host", async () => {
    sessions = [stranded(SEAT)];
    members = [{ session_id: "sess-STICKER7", seat_id: SEAT }];
    const res = await POST(req({ qrCode: "STICKER7", mode: "dinein", persisted: true }));
    expect(res.status).toBe(200);
    expect((await res.json()) as Record<string, unknown>).toMatchObject({
      sessionId: "sess-STICKER7",
      role: "host",
      created: false,
    });
    expect(sessionInserts()).toHaveLength(0);
  });

  it("(g″) an invite `?j=` for that sticker is found, not 404", async () => {
    sessions = [stranded()];
    const res = await POST(req({ qrCode: "STICKER7", mode: "dinein", joinOnly: true }));
    expect(res.status).toBe(200);
    expect(sessionInserts()).toHaveLength(0);
  });

  it("(g‴) a stranger's `?table=7` claim meets the seated refusal — the party is there, numberless", async () => {
    sessions = [stranded()];
    const res = await POST(req({ tableNumber: 7, mode: "dinein" }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe(BIND_COPY.seated);
    expect(writes).toEqual([]);
  });

  it("(g⁗) a 23505 on the sticker's insert whose winner is numberless on the token joins it", async () => {
    insertCollision = { code: "23505", then: () => sessions.push(stranded()) };
    const res = await POST(req({ qrCode: "STICKER7", mode: "dinein" }));
    expect(res.status).toBe(200);
    expect((await res.json()) as Record<string, unknown>).toMatchObject({
      sessionId: "sess-STICKER7",
      created: false,
    });
  });
});

describe("/api/session — a PERSISTED code re-joins only a session this seat belongs to (J15, the front door)", () => {
  // A registered sticker token outlives its party — the next party at that table holds it within
  // hours — and 3c-ii's Dine-in door enters the menu code-free, where `useTableSession` resolves
  // the persisted key with neither `joinOnly` nor `tableNumber`. So a code the PHONE persisted
  // (never one from a URL) re-joins a session this seat is a member of, and otherwise the entry is
  // a bare host-start: a fresh generated code, no number — never a stranger's cart, never a session
  // minted AT a table from the couch for the real party to converge onto as guests.
  it("(h) a stranger's party at the sticker's table is NOT joined — a fresh code, no number, no membership on theirs", async () => {
    sessions = [row("GENCODE7", "dinein", OTHER, { table_number: 7 })];
    members = [{ session_id: "sess-GENCODE7", seat_id: OTHER }];
    const res = await POST(req({ qrCode: "STICKER7", mode: "dinein", persisted: true }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ created: true, tableNumber: null, role: "host" });
    expect(body.joinCode).not.toBe("GENCODE7");
    expect(body.joinCode).not.toBe("STICKER7");
    expect(members.some((m) => m.session_id === "sess-GENCODE7" && m.seat_id === SEAT)).toBe(false);
    expect(sessionInserts()).toHaveLength(1);
  });

  it("(h′) the party this seat BELONGS to is rejoined — no insert", async () => {
    sessions = [row("GENCODE7", "dinein", OTHER, { table_number: 7 })];
    members = [
      { session_id: "sess-GENCODE7", seat_id: OTHER },
      { session_id: "sess-GENCODE7", seat_id: SEAT },
    ];
    const res = await POST(req({ qrCode: "STICKER7", mode: "dinein", persisted: true }));
    expect(res.status).toBe(200);
    expect((await res.json()) as Record<string, unknown>).toMatchObject({
      sessionId: "sess-GENCODE7",
      tableNumber: 7,
      created: false,
    });
    expect(sessionInserts()).toHaveLength(0);
  });

  it("(h″) nobody at the sticker's table → a fresh host-start, never a session minted AT that table on its token", async () => {
    const res = await POST(req({ qrCode: "STICKER7", mode: "dinein", persisted: true }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ created: true, tableNumber: null });
    expect(body.joinCode).not.toBe("STICKER7");
    const insert = queries.find((q) => q.table === "table_sessions" && q.op === "insert");
    expect(insert?.payload?.qr_code).not.toBe("STICKER7");
    expect(insert?.payload?.table_number).toBeNull();
  });

  it("(h‴) a persisted GENERATED code whose session died mints a FRESH code, not the old one", async () => {
    const res = await POST(req({ qrCode: "OLDGEN123", mode: "dinein", persisted: true }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ created: true });
    expect(body.joinCode).not.toBe("OLDGEN123");
  });

  it("a URL sticker scan (no `persisted`) still joins the party at the table — the sticker is the join identity", async () => {
    sessions = [row("GENCODE7", "dinein", OTHER, { table_number: 7 })];
    const res = await POST(req({ qrCode: "STICKER7", mode: "dinein" }));
    expect(res.status).toBe(200);
    expect((await res.json()) as Record<string, unknown>).toMatchObject({
      sessionId: "sess-GENCODE7",
      created: false,
    });
  });

  it("a FAILED membership read is 'try again' (500) with nothing written — never a stranger's join, never a mint", async () => {
    sessions = [row("GENCODE7", "dinein", OTHER, { table_number: 7 })];
    membersReadFails = true;
    const res = await POST(req({ qrCode: "STICKER7", mode: "dinein", persisted: true }));
    expect(res.status).toBe(500);
    expect(writes).toEqual([]);
  });
});
