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
/** The bind call refuses with this code (a phone/kiosk took N between the read and the write). */
let bindCollision: { code: string } | null = null;
/** Runs when the bind call is issued, BEFORE it matches rows — the row moving under the write. */
let bindHook: (() => void) | null = null;
/** Every RPC the route issued (M263: the bind is ONE call, `mms_bind_session_table`). */
let rpcs: { name: string; args: Record<string, unknown> }[] = [];
/** A scripted answer for the bind call; null = the SQL's CAS emulated on the fixture rows. */
let rpcAnswer: { data: unknown; error: unknown } | null = null;
/** A `table_sessions` read keyed on THIS id fails (an outage) — M264's live re-check. */
let idReadFailsFor: string | null = null;
/** Per-session carts (J40's adopt cancels the shell's); null = every cart read answers `cart-1`. */
let carts: { id: string; session_id: string; status: string }[] | null = null;
/** Shells with something on them the fixtures cannot show (a line, a name, a promo…): the SQL
 *  predicate `mms_shell_untouched` reads them false (members are read from `members`). */
let touchedShells = new Set<string>();
/** A scripted answer for the grid claim's host claim (`mms_claim_untouched_shell`); null = emulated. */
let claimAnswer: { data: unknown; error: unknown } | null = null;
/** Runs when the grid claim's host claim is issued — the row moving between the claim and the re-read. */
let claimHook: (() => void) | null = null;
/** Runs once when a write matching `on` is issued, BEFORE it applies — a row moving under it (M264). */
let writeHook: { on: (q: Q) => boolean; run: () => void } | null = null;
/** The number-keyed read fails (an outage). */
let numberReadFails = false;
/** The membership read fails (an outage). */
let membersReadFails = false;
/** The registry (`qr_tables`) read fails (an outage) — the sticker arm's and the claim arm's. */
let registryReadFails = false;
/** A `table_sessions` read keyed on THIS token fails (an outage) — the prior-code read, the zero-row re-read. */
let tokenReadFailsFor: string | null = null;

vi.mock("@/lib/rate", () => ({ withinJoinRate: () => Promise.resolve(true) }));
vi.mock("@/lib/posthog-server", () => ({ getPostHogClient: () => ({ capture: () => {} }) }));

let nextId = 0;
/**
 * `mms_bind_session_table`'s CAS on the fixture rows (the freeze, J41 and J40 are the SQL test's —
 * supabase/tests/m263_bind_session_table_test.sql): a live, unbound, dine-in row lands; a live
 * dine-in row already AT the number raises 23505 (the index); anything else is `unmoved`.
 */
function emulateBind(args: Record<string, unknown>): { data: unknown; error: unknown } {
  const n = args.p_table as number;
  const me = sessions.find((r) => r.id === args.p_session);
  const live = (r: Row) => r.status === "active" && r.expires_at > new Date().toISOString();
  // J40 — the shell, re-checked as the SQL re-checks it: a live hostless dine-in row AT n (else
  // `gone`), with no member (else `held`). Line / cart-state `held` cases are scripted (`rpcAnswer`).
  const shell = args.p_shell ? sessions.find((r) => r.id === args.p_shell) : undefined;
  if (args.p_shell) {
    if (
      !shell ||
      !live(shell) ||
      shell.mode !== "dinein" ||
      shell.host_seat != null ||
      shell.table_number !== n
    )
      return { data: [{ outcome: "gone", at_table: null }], error: null };
    if (members.some((m) => m.session_id === shell.id) || touchedShells.has(shell.id))
      return { data: [{ outcome: "held", at_table: null }], error: null };
  }
  // The CAS decides before anything is written here — the SQL's subtransaction rolls an adopt back
  // with a CAS that moved no row, which is the same observable.
  if (!me || !live(me) || me.mode !== "dinein" || me.table_number != null)
    return { data: [{ outcome: "unmoved", at_table: null }], error: null };
  if (
    sessions.some(
      (r) =>
        r !== me &&
        r !== shell &&
        r.status === "active" &&
        r.mode === "dinein" &&
        r.table_number === n,
    )
  )
    return { data: null, error: { code: "23505", message: "duplicate key" } };
  if (shell) {
    shell.status = "closed";
    for (const c of carts ?? [])
      if (c.session_id === shell.id && c.status === "open") c.status = "cancelled";
  }
  me.table_number = n;
  return { data: [{ outcome: shell ? "adopted" : "bound", at_table: n }], error: null };
}
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
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcs.push({ name, args });
      writes.push(`rpc:${name}`);
      if (name === "mms_claim_untouched_shell") {
        if (claimHook) {
          const h = claimHook;
          claimHook = null;
          h();
        }
        if (claimAnswer) return Promise.resolve(claimAnswer);
        // The SQL's one statement: hostless · live · dine-in · the predicate (no member, nothing on it).
        const sh = sessions.find((r) => r.id === args.p_shell);
        const ok =
          !!sh &&
          sh.host_seat == null &&
          sh.status === "active" &&
          sh.mode === "dinein" &&
          !touchedShells.has(sh.id) &&
          !members.some((m) => m.session_id === sh.id);
        if (ok) sh.host_seat = args.p_seat as string;
        return Promise.resolve({ data: ok, error: null });
      }
      if (bindCollision)
        return Promise.resolve({ data: null, error: { code: bindCollision.code, message: "dup" } });
      if (rpcAnswer) return Promise.resolve(rpcAnswer);
      if (bindHook) {
        const h = bindHook;
        bindHook = null;
        h();
      }
      return Promise.resolve(emulateBind(args));
    },
    from: (table: string) => {
      const q: Q = { table, op: "select", eq: [], gt: [], lte: [], is: [] };
      queries.push(q);
      const result = (): { data: unknown; error: unknown; count?: number | null } => {
        if (writeHook && q.op !== "select" && writeHook.on(q)) {
          const h = writeHook;
          writeHook = null;
          h.run();
        }
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
          if (table === "qr_carts") {
            if (!carts) return { data: { id: "cart-1" }, error: null };
            const c = {
              id: `cart-new-${++nextId}`,
              session_id: String((q.payload as { session_id: string }).session_id),
              status: "open",
            };
            carts.push(c);
            return { data: { id: c.id }, error: null };
          }
          if (table === "session_members") {
            members.push(q.payload as { session_id: string; seat_id: string });
            return { data: null, error: null };
          }
          return { data: null, error: null };
        }
        if (q.op === "update") {
          if (table !== "table_sessions") return { data: null, error: null, count: 0 };
          const hit = sessions.filter((r) => matches(r, q));
          for (const r of hit) Object.assign(r, q.payload);
          const first = hit[0];
          return { data: first ? pick(first, q.cols) : null, error: null, count: hit.length };
        }
        if (table === "table_sessions") {
          if (idReadFailsFor && q.eq.some(([c, v]) => c === "id" && v === idReadFailsFor))
            return { data: null, error: { message: "fetch failed" } };
          if (numberReadFails && q.eq.some(([c]) => c === "table_number"))
            return { data: null, error: { message: "fetch failed" } };
          if (
            tokenReadFailsFor &&
            q.eq.some(([c, v]) => c === "qr_code" && v === tokenReadFailsFor)
          )
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
          if (registryReadFails) return { data: null, error: { message: "fetch failed" } };
          return { data: registry.filter((r) => matches(r, q)), error: null };
        }
        if (table === "qr_carts") {
          if (!carts) return { data: [{ id: "cart-1" }], error: null };
          return {
            data: carts.filter((c) => matches(c, q)).map((c) => ({ id: c.id })),
            error: null,
          };
        }
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
const bindUpdates = () => rpcs.filter((r) => r.name === "mms_bind_session_table");
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
  registryReadFails = false;
  tokenReadFailsFor = null;
  rpcs = [];
  rpcAnswer = null;
  idReadFailsFor = null;
  writeHook = null;
  carts = null;
  touchedShells = new Set();
  claimAnswer = null;
  claimHook = null;
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

  it("(b) the persisted code names a live unbound dine-in session this seat HOSTS → ONE bind call, no insert, drafts intact", async () => {
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
    // M263 — ONE call with THIS session and the number; never a shell (this arm binds an EMPTY
    // table). The CAS's own predicate (table_number ONLY, unbound · live) is the SQL test's.
    expect(binds[0]?.args.p_session).toBe("sess-MYCODE12");
    expect(binds[0]?.args.p_table).toBe(7);
    expect(binds[0]?.args.p_shell === undefined).toBe(true);
    // No table_sessions UPDATE carries a number: the route never writes the bind itself.
    expect(
      queries.some(
        (q) =>
          q.table === "table_sessions" && q.op === "update" && "table_number" in (q.payload ?? {}),
      ),
    ).toBe(false);
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

  it("a FAILED prior-code read is 503 'we're down', never a second session minted over the drafts (Codex r1 on #314, P1)", async () => {
    sessions = [mine()];
    tokenReadFailsFor = "MYCODE12";
    const res = await POST(req({ qrCode: "MYCODE12", tableNumber: 7, mode: "dinein" }));
    expect(res.status).toBe(503);
    // The dead-row sweep by number (dead rows only) may have run; nothing is minted or bound.
    expect(bindUpdates()).toHaveLength(0);
    expect(sessionInserts()).toHaveLength(0);
    expect(writes.filter((w) => w !== "table_sessions:update")).toEqual([]);
  });

  it("the RPC's `locked` · `settling` · `sticker` hold the claim-arm bind: the phone REJOINS its session unbound (the next Send asks, where bindTable names the refusal) — no bind, no mint, no touch (M263 · J41)", async () => {
    for (const answer of [
      { outcome: "locked", at_table: null },
      { outcome: "settling", at_table: null },
      { outcome: "sticker", at_table: 3 },
    ]) {
      sessions = [mine()];
      members = [{ session_id: "sess-MYCODE12", seat_id: SEAT }];
      writes = [];
      queries = [];
      rpcs = [];
      rpcAnswer = { data: [answer], error: null };
      const res = await POST(req({ qrCode: "MYCODE12", tableNumber: 7, mode: "dinein" }));
      expect(res.status).toBe(200);
      expect((await res.json()) as Record<string, unknown>).toMatchObject({
        sessionId: "sess-MYCODE12",
        tableNumber: null,
        created: false,
      });
      expect(bindUpdates()).toHaveLength(1);
      expect(sessionInserts()).toHaveLength(0);
      expect(sessions[0]?.table_number).toBeNull();
      expect(queries.some((q) => q.table === "qr_carts" && q.op === "update")).toBe(false);
    }
  });

  it("the route reads NO freeze itself — the lock model is decided where the lock is (M263); the old two-statement read is gone", async () => {
    sessions = [mine()];
    members = [{ session_id: "sess-MYCODE12", seat_id: SEAT }];
    await POST(req({ qrCode: "MYCODE12", tableNumber: 7, mode: "dinein" }));
    const cartReads = queries.filter((q) => q.table === "qr_carts" && q.op === "select");
    expect(cartReads.some((q) => /locked|settle_at/.test(q.cols ?? ""))).toBe(false);
  });

  it("a TRANSPORT failure on the bind call is the W10a 503, never a verdict; nothing minted", async () => {
    sessions = [mine()];
    rpcAnswer = { data: null, error: { message: "TypeError: fetch failed" } };
    const res = await POST(req({ qrCode: "MYCODE12", tableNumber: 7, mode: "dinein" }));
    expect(res.status).toBe(503);
    expect(sessionInserts()).toHaveLength(0);
  });

  it("any other bind error (PGRST202 — a stale schema cache, too) is 'try again' (500); nothing minted", async () => {
    sessions = [mine()];
    rpcAnswer = { data: null, error: { code: "PGRST202", message: "Could not find the function" } };
    const res = await POST(req({ qrCode: "MYCODE12", tableNumber: 7, mode: "dinein" }));
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: string }).error).toBe(
      "Could not check the table — try again.",
    );
    expect(sessionInserts()).toHaveLength(0);
  });

  it("an answer this build cannot read ([] · an unknown word) is 'try again' (500) — never a landing, never a mint", async () => {
    for (const data of [[], [{ outcome: "weird", at_table: 7 }]]) {
      sessions = [mine()];
      writes = [];
      rpcAnswer = { data, error: null };
      const res = await POST(req({ qrCode: "MYCODE12", tableNumber: 7, mode: "dinein" }));
      expect(res.status).toBe(500);
      expect(sessionInserts()).toHaveLength(0);
      expect(sessions[0]?.table_number).toBeNull();
    }
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

describe("/api/session — a failed REGISTRY read is an outage, never a legacy sticker and never a verdict (Codex round 4 on #314, P1)", () => {
  // The sticker arm discarded the `qr_tables` error: `sessionTable` stayed null, the find went
  // token-only — which cannot see a late-bound generated-code party at that table — and the mint
  // stamped a SECOND, numberless session on the sticker: the stranded shape, at its origin
  // (LEARNINGS #234). The register and the kiosk already fail closed on the same read.
  it("a sticker scan while the registry read fails is a 503 — no token-only find, no insert", async () => {
    registryReadFails = true;
    // A late-bound party at 7 under a GENERATED code (bound at Send): the token-only find cannot
    // see it, so the fail-open path minted beside it.
    sessions = [{ ...row("ABCD1234", "dinein", OTHER), table_number: 7 }];
    const res = await POST(req({ qrCode: "STICKER7", mode: "dinein" }));
    // MUTANT session-route/sticker-registry-outage-reads-as-legacy: the error is dropped and the
    // sticker reads as a legacy code — a second, numberless session is minted on STICKER7 beside the
    // party at 7; red (a 200 with an insert).
    expect(res.status).toBe(503);
    expect(((await res.json()) as { kind: string }).kind).toBe("unavailable");
    expect(sessionInserts()).toHaveLength(0);
    expect(
      queries.some(
        (q) =>
          q.table === "table_sessions" &&
          q.op === "select" &&
          q.eq.some(([c, v]) => c === "qr_code" && v === "STICKER7"),
      ),
    ).toBe(false);
  });

  it("a `?table=7` claim while the registry read fails is the same 503 — not the 400 verdict 'pick another'", async () => {
    registryReadFails = true;
    const res = await POST(req({ tableNumber: 7, mode: "dinein" }));
    // MUTANT session-route/claim-registry-outage-is-a-verdict: the error is dropped and the claim
    // answers BIND_COPY.unavailable as if the table were unregistered — a sentence that is a verdict
    // ("pick another") for a read that did not happen; red (a 400).
    expect(res.status).toBe(503);
    expect(((await res.json()) as { kind: string }).kind).toBe("unavailable");
    expect(sessionInserts()).toHaveLength(0);
  });

  it("a registered sticker with NO registry row (a legacy/host-mint code) still takes the token path — only a failed read is refused", async () => {
    registry = [];
    sessions = [row("ABCD1234", "dinein", OTHER)];
    members = [{ session_id: "sess-ABCD1234", seat_id: OTHER }];
    const res = await POST(req({ qrCode: "ABCD1234", mode: "dinein" }));
    expect(res.status).toBe(200);
    expect(sessionInserts()).toHaveLength(0);
  });
});

describe("/api/session — M264: a hostless row closed UNDER a join is never handed out (red-team #3 on J40)", () => {
  // A table a server started (host_seat null) is the one row another phone's Send can ADOPT (J40 —
  // `mms_bind_session_table` closes it) or staff can clear while this join is in flight. The host
  // claim is guarded on the row still being live, and the join re-reads it once its own writes have
  // landed: a closed row's cart is cancelled, and one minted on it would carry this diner's order on
  // a session every write refuses. The retry re-resolves the table from the top.
  const shell = () => row("STICKER7", "dinein", null, { table_number: 7 });
  const closeShell = () => {
    sessions[0]!.status = "closed";
  };
  const isSlide = (q: Q) => q.table === "table_sessions" && "expires_at" in (q.payload ?? {});
  const isMemberInsert = (q: Q) => q.table === "session_members" && q.op === "insert";

  it("a sticker scan of a LIVE shell still claims host (W6a) — the claim is guarded on status = 'active'", async () => {
    sessions = [shell()];
    const res = await POST(req({ qrCode: "STICKER7", mode: "dinein" }));
    expect(res.status).toBe(200);
    expect((await res.json()) as Record<string, unknown>).toMatchObject({
      sessionId: "sess-STICKER7",
      role: "host",
      tableNumber: 7,
    });
    const claimQ = queries.find(
      (q) => q.table === "table_sessions" && q.op === "update" && "host_seat" in (q.payload ?? {}),
    );
    expect(claimQ?.is).toContainEqual(["host_seat", null]);
    expect(claimQ?.eq).toContainEqual(["status", "active"]);
    expect(sessions[0]?.host_seat).toBe(SEAT);
  });

  it("the shell ADOPTED before the host claim: no host_seat lands on the closed row, and the join answers 'try again' (409) with no cart — never a cartId on a dead session", async () => {
    sessions = [shell()];
    writeHook = { on: isSlide, run: closeShell };
    const res = await POST(req({ qrCode: "STICKER7", mode: "dinein" }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe(
      "Could not check the table — try again.",
    );
    expect(sessions[0]?.host_seat).toBeNull();
    expect(writes).not.toContain("qr_carts:insert");
  });

  it("an invite (`?j=`) joiner of a shell adopted between its slide and its membership insert: 409, no cart", async () => {
    sessions = [shell()];
    writeHook = { on: isMemberInsert, run: closeShell };
    const res = await POST(req({ qrCode: "STICKER7", mode: "dinein", joinOnly: true }));
    expect(res.status).toBe(409);
    expect(writes).not.toContain("qr_carts:insert");
  });

  it("the live re-check failing on TRANSPORT is the W10a 503", async () => {
    sessions = [shell()];
    idReadFailsFor = "sess-STICKER7";
    const res = await POST(req({ qrCode: "STICKER7", mode: "dinein" }));
    expect(res.status).toBe(503);
  });

  it("a HOSTED party's join skips the re-check: nothing adopts a party (no extra round trip on the common path)", async () => {
    sessions = [row("STICKER7", "dinein", OTHER, { table_number: 7 })];
    const res = await POST(req({ qrCode: "STICKER7", mode: "dinein" }));
    expect(res.status).toBe(200);
    const byId = queries.filter(
      (q) =>
        q.table === "table_sessions" &&
        q.op === "select" &&
        q.cols === "status" &&
        q.eq.some(([c]) => c === "id"),
    );
    expect(byId).toHaveLength(0);
  });
});

describe("/api/session — J40: a `?table=N` claim on a table a server STARTED (the DoorSheet's Open chip)", () => {
  // The picker reads such a table Open (`awaitsFirstDiner`, lib/seated.ts), so the claim it sends
  // must do what "open — sit here" says: a phone with no unbound session of its own joins the shell
  // as its HOST (W6a, the sticker's own path); one with an unbound session ADOPTS it through the one
  // bind call and keeps its drafts; a TOUCHED shell (anything on it, or anyone joined —
  // `mms_shell_untouched`) answers `held` by name — never the join form, which asks for a code
  // nobody at that table holds. A party and a kiosk order keep today's refusals.
  const shell = () => row("STICKER7", "dinein", null, { table_number: 7 });
  const mine = () => row("MYCODE12", "dinein", SEAT);

  it("an UNTOUCHED shell, no prior session → joined as its HOST: no insert, no bind call, host_seat claimed, the shell's own cart", async () => {
    sessions = [shell()];
    carts = [{ id: "cart-shell", session_id: "sess-STICKER7", status: "open" }];
    const res = await POST(req({ tableNumber: 7, mode: "dinein" }));
    expect(res.status).toBe(200);
    expect((await res.json()) as Record<string, unknown>).toMatchObject({
      sessionId: "sess-STICKER7",
      role: "host",
      tableNumber: 7,
      cartId: "cart-shell",
      created: false,
    });
    expect(sessionInserts()).toHaveLength(0);
    expect(bindUpdates()).toHaveLength(0);
    // The host claim went through the ONE predicate, in one statement — never W6a's plain claim.
    const claims = rpcs.filter((r) => r.name === "mms_claim_untouched_shell");
    expect(claims).toEqual([
      { name: "mms_claim_untouched_shell", args: { p_shell: "sess-STICKER7", p_seat: SEAT } },
    ]);
    expect(
      queries.some(
        (q) =>
          q.table === "table_sessions" && q.op === "update" && "host_seat" in (q.payload ?? {}),
      ),
    ).toBe(false);
    expect(sessions[0]?.host_seat).toBe(SEAT);
    expect(members).toContainEqual(
      expect.objectContaining({ session_id: "sess-STICKER7", seat_id: SEAT }),
    );
  });

  it("a phone with an UNBOUND session that has drafts → the ONE bind call ADOPTS the shell: its session at 7, its drafts' cart handed back, the shell closed with its empty cart cancelled", async () => {
    sessions = [mine(), shell()];
    members = [{ session_id: "sess-MYCODE12", seat_id: SEAT }];
    carts = [
      { id: "cart-mine", session_id: "sess-MYCODE12", status: "open" },
      { id: "cart-shell", session_id: "sess-STICKER7", status: "open" },
    ];
    const res = await POST(req({ qrCode: "MYCODE12", tableNumber: 7, mode: "dinein" }));
    expect(res.status).toBe(200);
    expect((await res.json()) as Record<string, unknown>).toMatchObject({
      sessionId: "sess-MYCODE12",
      joinCode: "MYCODE12",
      tableNumber: 7,
      role: "host",
      cartId: "cart-mine",
      created: false,
    });
    const binds = bindUpdates();
    expect(binds).toHaveLength(1);
    expect(binds[0]?.args).toMatchObject({
      p_session: "sess-MYCODE12",
      p_table: 7,
      p_shell: "sess-STICKER7",
    });
    expect(sessions.find((r) => r.id === "sess-STICKER7")?.status).toBe("closed");
    expect(carts.find((c) => c.id === "cart-shell")?.status).toBe("cancelled");
    expect(carts.find((c) => c.id === "cart-mine")?.status).toBe("open");
    expect(sessionInserts()).toHaveLength(0);
    // D30 — the adopt is a landing: the drafts' cart is touched so every peer re-reads the table.
    const touch = queries.find((q) => q.table === "qr_carts" && q.op === "update");
    expect(touch?.eq).toContainEqual(["id", "cart-mine"]);
  });

  it("a TOUCHED shell (`held`) → 409 with BIND_COPY.held(7) — no join form's sentence, no insert, the shell and the prior session untouched", async () => {
    sessions = [mine(), shell()];
    members = [{ session_id: "sess-MYCODE12", seat_id: SEAT }];
    rpcAnswer = { data: [{ outcome: "held", at_table: null }], error: null };
    const res = await POST(req({ qrCode: "MYCODE12", tableNumber: 7, mode: "dinein" }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe(BIND_COPY.held(7));
    expect(sessionInserts()).toHaveLength(0);
    expect(sessions.find((r) => r.id === "sess-STICKER7")?.status).toBe("active");
    expect(sessions.find((r) => r.id === "sess-MYCODE12")?.table_number).toBeNull();
  });

  it("red-team #5 — `gone`: a tablemate adopted it first, so a PARTY holds 7 now → the shipped 409 seated; the same shell still there without a cart → 'try again' (500)", async () => {
    sessions = [mine(), shell()];
    members = [{ session_id: "sess-MYCODE12", seat_id: SEAT }];
    rpcAnswer = { data: [{ outcome: "gone", at_table: null }], error: null };
    // The re-read by number finds a hosted party at 7.
    sessions[1]!.host_seat = OTHER;
    let res = await POST(req({ qrCode: "MYCODE12", tableNumber: 7, mode: "dinein" }));
    // A hosted party at 7 never reaches the bind: it is the shipped 409 at the member check.
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe(BIND_COPY.seated);
    // Now the shell is hostless at the pre-read, and a party seats itself between the call and the
    // re-read: the call says `gone`, the re-read names the party.
    sessions[1]!.host_seat = null;
    rpcs = [];
    rpcAnswer = null;
    bindHook = () => {
      sessions[1]!.host_seat = OTHER;
    };
    res = await POST(req({ qrCode: "MYCODE12", tableNumber: 7, mode: "dinein" }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe(BIND_COPY.seated);
    // `gone` with the same hostless shell still there (its cart vanished) → a retry, never `held`.
    sessions[1]!.host_seat = null;
    rpcAnswer = { data: [{ outcome: "gone", at_table: null }], error: null };
    res = await POST(req({ qrCode: "MYCODE12", tableNumber: 7, mode: "dinein" }));
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: string }).error).toBe(
      "Could not check the table — try again.",
    );
  });

  it("red-team #5 — `gone` because this phone's OTHER tab already adopted it: the re-read finds its own row at 7 → rejoined, 200", async () => {
    sessions = [mine(), shell()];
    members = [{ session_id: "sess-MYCODE12", seat_id: SEAT }];
    bindHook = () => {
      sessions[1]!.status = "closed";
      sessions[0]!.table_number = 7;
    };
    const res = await POST(req({ qrCode: "MYCODE12", tableNumber: 7, mode: "dinein" }));
    expect(res.status).toBe(200);
    expect((await res.json()) as Record<string, unknown>).toMatchObject({
      sessionId: "sess-MYCODE12",
      tableNumber: 7,
      created: false,
    });
    expect(sessionInserts()).toHaveLength(0);
  });

  it("the prior session DIED under the adopt (`unmoved`, the adopt rolled back with the CAS) → the shell is joined as its first diner's, never a mint that 409s against it", async () => {
    sessions = [mine(), shell()];
    members = [{ session_id: "sess-MYCODE12", seat_id: SEAT }];
    bindHook = () => {
      sessions[0]!.status = "closed";
    };
    const res = await POST(req({ qrCode: "MYCODE12", tableNumber: 7, mode: "dinein" }));
    expect(res.status).toBe(200);
    expect((await res.json()) as Record<string, unknown>).toMatchObject({
      sessionId: "sess-STICKER7",
      role: "host",
      tableNumber: 7,
    });
    expect(sessionInserts()).toHaveLength(0);
    expect(sessions.find((r) => r.id === "sess-STICKER7")?.status).toBe("active");
  });

  it("a HOSTED party at 7 keeps the shipped 409 (BIND_COPY.seated) with nothing written — the join form is right there", async () => {
    sessions = [row("GENCODE7", "dinein", OTHER, { table_number: 7 })];
    const res = await POST(req({ tableNumber: 7, mode: "dinein" }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe(BIND_COPY.seated);
    expect(writes).toEqual([]);
  });

  it("a KIOSK order at 7 is refused by name (403, 'please ask staff') before any write — never adopted, never joined", async () => {
    sessions = [row("kiosk-AB12CD34", "dinein", "kiosk-uid", { table_number: 7 })];
    for (const body of [
      { tableNumber: 7, mode: "dinein" },
      { qrCode: "MYCODE12", tableNumber: 7, mode: "dinein" },
    ]) {
      writes = [];
      const res = await POST(req(body));
      expect(res.status).toBe(403);
      expect(((await res.json()) as { error: string }).error).toBe(JOIN_REFUSED);
      expect(writes).toEqual([]);
    }
  });
});

describe("/api/session — J40: a TOUCHED shell is never hosted from the grid (the lead's follow-up)", () => {
  // The picker reads a shell Open only while the ONE SQL predicate says nothing and nobody is on it,
  // but the read is the RSC's and the tap comes later (or the `?table=` is typed). So the claim's host
  // claim re-asks the predicate IN its UPDATE's WHERE: a shell anything has since landed on (a
  // server's line, a name, a promo, a tab, a pay attempt) or anyone has joined is refused by name —
  // `held` — and nobody becomes host of a table a server is holding.
  const shell = () => row("STICKER7", "dinein", null, { table_number: 7 });
  // `held`'s sentence, PASTED: true for every touched shell. This arm's diner has no order to add,
  // and a joined-only shell has no order on it — so it says neither.
  const HELD_7 = "A server has Table 7 open — ask them to seat you there, or pick another.";

  it("a TOUCHED shell, no prior session → 409 BIND_COPY.held(7): no host, no membership, no cart, no insert", async () => {
    sessions = [shell()];
    touchedShells = new Set(["sess-STICKER7"]);
    const res = await POST(req({ tableNumber: 7, mode: "dinein" }));
    expect(res.status).toBe(409);
    const said = ((await res.json()) as { error: string }).error;
    expect(said).toBe(BIND_COPY.held(7));
    expect(said).toBe(HELD_7);
    expect(sessions[0]?.host_seat).toBeNull();
    expect(members.some((m) => m.session_id === "sess-STICKER7")).toBe(false);
    expect(writes).not.toContain("qr_carts:insert");
    expect(sessionInserts()).toHaveLength(0);
  });

  it("a shell somebody JOINED (a member) is touched too → 409 held, the joiner's table never hosted by a stranger", async () => {
    sessions = [shell()];
    members = [{ session_id: "sess-STICKER7", seat_id: OTHER }];
    const res = await POST(req({ tableNumber: 7, mode: "dinein" }));
    expect(res.status).toBe(409);
    const said = ((await res.json()) as { error: string }).error;
    expect(said).toBe(BIND_COPY.held(7));
    expect(said).toBe(HELD_7);
    expect(sessions[0]?.host_seat).toBeNull();
  });

  it("a refused claim whose re-read finds a PARTY (a host claimed it first) → the shipped 409 seated", async () => {
    sessions = [shell()];
    claimAnswer = { data: false, error: null };
    // A diner's sticker scan claims host between the pre-read and this claim.
    claimHook = () => {
      sessions[0]!.host_seat = OTHER;
    };
    const res = await POST(req({ tableNumber: 7, mode: "dinein" }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe(BIND_COPY.seated);
  });

  it("a refused claim with NOBODY at 7 any more (cleared) → 'try again' (500), never a mint over it", async () => {
    sessions = [shell()];
    claimAnswer = { data: false, error: null };
    claimHook = () => {
      sessions[0]!.status = "closed";
    };
    const res = await POST(req({ tableNumber: 7, mode: "dinein" }));
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: string }).error).toBe(
      "Could not check the table — try again.",
    );
    expect(sessionInserts()).toHaveLength(0);
  });

  it("a refused claim whose re-read finds THIS seat already its host (another tab) → rejoined, 200", async () => {
    sessions = [shell()];
    claimAnswer = { data: false, error: null };
    claimHook = () => {
      sessions[0]!.host_seat = SEAT;
    };
    const res = await POST(req({ tableNumber: 7, mode: "dinein" }));
    expect(res.status).toBe(200);
    expect((await res.json()) as Record<string, unknown>).toMatchObject({
      sessionId: "sess-STICKER7",
      role: "host",
    });
  });

  it("the host claim's TRANSPORT failure is the W10a 503; any other error is 'try again' (500) — never a join without the predicate", async () => {
    sessions = [shell()];
    claimAnswer = { data: null, error: { message: "TypeError: fetch failed" } };
    let res = await POST(req({ tableNumber: 7, mode: "dinein" }));
    expect(res.status).toBe(503);
    claimAnswer = {
      data: null,
      error: { code: "PGRST202", message: "Could not find the function" },
    };
    res = await POST(req({ tableNumber: 7, mode: "dinein" }));
    expect(res.status).toBe(500);
    expect(sessions[0]?.host_seat).toBeNull();
    expect(members.some((m) => m.session_id === "sess-STICKER7")).toBe(false);
  });

  it("the prior session DIED under the adopt and the shell has since been TOUCHED → 409 held, never hosted", async () => {
    sessions = [row("MYCODE12", "dinein", SEAT), shell()];
    members = [{ session_id: "sess-MYCODE12", seat_id: SEAT }];
    bindHook = () => {
      sessions[0]!.status = "closed";
    };
    claimHook = () => {
      touchedShells = new Set(["sess-STICKER7"]);
    };
    // The bind call sees an untouched shell and a dead binder → `unmoved`; the claim that follows
    // sees the order that landed meanwhile.
    const res = await POST(req({ qrCode: "MYCODE12", tableNumber: 7, mode: "dinein" }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe(BIND_COPY.held(7));
    expect(sessions[1]?.host_seat).toBeNull();
  });

  it("a STICKER scan of a touched shell keeps W6a: the table's own physical code makes the scanner host (the party staff seated)", async () => {
    sessions = [shell()];
    touchedShells = new Set(["sess-STICKER7"]);
    const res = await POST(req({ qrCode: "STICKER7", mode: "dinein" }));
    expect(res.status).toBe(200);
    expect((await res.json()) as Record<string, unknown>).toMatchObject({
      sessionId: "sess-STICKER7",
      role: "host",
    });
    expect(rpcs.some((r) => r.name === "mms_claim_untouched_shell")).toBe(false);
  });
});
