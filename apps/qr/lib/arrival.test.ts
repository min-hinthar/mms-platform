import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PD3 — `stampArrival`, the ONE "I’m here" write (m3 decision 22; judges' graft 4; guided risk 1).
 *
 * The mock ENFORCES every predicate the statement carries (the authz.test.ts rule: a mock looser
 * than the database is a fixture that cannot express the bug). The row lives in a Map; `update`
 * applies only when every recorded filter holds, and `.select("id")` answers the rows it changed —
 * so a dropped `.gte/.lt` (the same-day rule), a dropped `.or` (the collected guard), or a write
 * that ignores its own row count each turns exactly one case red. verify:slice: arrival/*.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: () => Promise.resolve({}) }));

const ORDER = "0b6c1e58-0000-4000-8000-00000000abcd";
const SESSION = "5e551011-0000-4000-8000-000000000001";
const UID = "u-diner-1";
// 6:20 PM PDT on Oct 8 = 01:20Z Oct 9; "now" is 6:01 PM the same evening.
const SLOT = "2026-10-09T01:20:00.000Z";
const NOW = Date.parse("2026-10-09T01:01:00.000Z");

type Row = {
  id: string;
  session_id: string | null;
  earned_by: string | null;
  arrived_at: string | null;
  pickup_slot: string | null;
  togo_status: string | null;
  status: string;
  tender: string;
};
let row: Row;
let member: { ok: true; uid: string } | { ok: false; code: string };
/** The caller's uid, `null` for not signed in, `"unavailable"` for an auth-transport failure. */
let callerUid: string | null | { unavailable: true };
/** The durable proofs beside `earned_by` (Codex r1 on #330): split payers and seats. */
let payers: { order_id: string; payer_uid: string }[];
let seats: { session_id: string; seat_id: string }[];
/** A transport failure on the FIRST lookup (the read that decides whether the order exists). */
let lookupErr: { message: string } | null;
/** A transport failure on the read that CLASSIFIES a refused UPDATE. */
let classifyErr: { message: string } | null;
/** Runs right after the first lookup answers — a racing writer between the read and the UPDATE. */
let afterLookup: (() => void) | null;
/** How many times `qr_orders` was touched — the flood guard runs before any of them. */
let orderReads: number;
let updateErr: { message: string } | null;
let selectedAfterUpdate: string | null;

type Filter = (r: Row) => boolean;
function parseOr(expr: string): Filter {
  // "togo_status.is.null,togo_status.neq.picked_up" — the two shapes this suite's statement uses.
  const alts = expr.split(",").map((part) => {
    const [col, op, val] = part.split(".") as [keyof Row, string, string];
    if (op === "is" && val === "null") return (r: Row) => r[col] === null;
    if (op === "neq") return (r: Row) => r[col] !== val;
    throw new Error(`unsupported or() clause ${part}`);
  });
  return (r) => alts.some((f) => f(r));
}

class FakeAuthzError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "AuthzError";
  }
}
vi.mock("./authz", () => ({
  AuthzError: FakeAuthzError,
  assertSessionMember: () =>
    member.ok
      ? Promise.resolve({ uid: member.uid })
      : Promise.reject(
          new FakeAuthzError(member.code, member.code === "unavailable" ? 503 : 403, member.code),
        ),
  getCallerUid: () =>
    typeof callerUid === "string"
      ? Promise.resolve(callerUid)
      : callerUid === null
        ? Promise.reject(new FakeAuthzError("Not signed in", 401, "unauthenticated"))
        : Promise.reject(new FakeAuthzError("down", 503, "unavailable")),
}));
/** The flood guard's answer; `false` refuses like the real limiter. */
let rateOk = true;
vi.mock("./rate", () => ({
  assertMutationRate: () =>
    rateOk ? Promise.resolve() : Promise.reject(new Error("Too many changes too fast")),
}));
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (table: string) => {
      if (table === "qr_order_payers" || table === "session_members") {
        // The proof tables: every `.eq` must hold on a row for it to answer.
        const eqs: [string, unknown][] = [];
        const rows: Record<string, unknown>[] = table === "qr_order_payers" ? payers : seats;
        const c: Record<string, unknown> = {
          select: () => c,
          eq: (col: string, val: unknown) => {
            eqs.push([col, val]);
            return c;
          },
          limit: () => c,
          maybeSingle: () =>
            Promise.resolve({
              data: rows.find((r) => eqs.every(([k, v]) => r[k] === v)) ?? null,
              error: null,
            }),
        };
        return c;
      }
      if (table !== "qr_orders") throw new Error(`unexpected table ${table}`);
      orderReads += 1;
      const filters: Filter[] = [];
      let patch: Partial<Row> | null = null;
      let cols = "";
      const chain: Record<string, unknown> = {
        select: (c: string) => {
          cols = c;
          if (patch) {
            selectedAfterUpdate = c;
            if (updateErr) return Promise.resolve({ data: null, error: updateErr });
            const hit = filters.every((f) => f(row));
            if (hit) Object.assign(row, patch);
            return Promise.resolve({ data: hit ? [{ id: row.id }] : [], error: null });
          }
          return chain;
        },
        update: (p: Partial<Row>) => {
          patch = p;
          return chain;
        },
        eq: (col: keyof Row, val: unknown) => {
          filters.push((r) => r[col] === val);
          return chain;
        },
        is: (col: keyof Row, val: unknown) => {
          filters.push((r) => r[col] === val);
          return chain;
        },
        gte: (col: keyof Row, val: string) => {
          filters.push((r) => r[col] !== null && Date.parse(String(r[col])) >= Date.parse(val));
          return chain;
        },
        lte: (col: keyof Row, val: string) => {
          filters.push((r) => r[col] !== null && Date.parse(String(r[col])) <= Date.parse(val));
          return chain;
        },
        lt: (col: keyof Row, val: string) => {
          filters.push((r) => r[col] !== null && Date.parse(String(r[col])) < Date.parse(val));
          return chain;
        },
        or: (expr: string) => {
          filters.push(parseOr(expr));
          return chain;
        },
        maybeSingle: () => {
          const lookup = cols.includes("earned_by");
          if (lookup && lookupErr) return Promise.resolve({ data: null, error: lookupErr });
          if (!lookup && classifyErr) return Promise.resolve({ data: null, error: classifyErr });
          const data = filters.every((f) => f(row)) ? { ...row } : null;
          if (lookup) afterLookup?.();
          return Promise.resolve({ data, error: null });
        },
      };
      return chain;
    },
  }),
}));

const { stampArrival } = await import("./arrival");

beforeEach(() => {
  row = {
    id: ORDER,
    session_id: SESSION,
    earned_by: UID,
    arrived_at: null,
    pickup_slot: SLOT,
    togo_status: "preparing",
    status: "paid",
    tender: "card",
  };
  member = { ok: true, uid: UID };
  callerUid = UID;
  payers = [];
  seats = [];
  lookupErr = null;
  classifyErr = null;
  afterLookup = null;
  orderReads = 0;
  rateOk = true;
  updateErr = null;
  selectedAfterUpdate = null;
});

describe("stampArrival — the write, guarded IN the statement", () => {
  it("stamps a member's own pickup on its day, once, and reads the row count back", async () => {
    await expect(stampArrival({ orderId: ORDER }, NOW)).resolves.toEqual({ ok: true });
    expect(row.arrived_at).toBe(new Date(NOW).toISOString());
    expect(selectedAfterUpdate).toBe("id");
    // Idempotent: the second call is a member's success, and the stamp is untouched.
    const first = row.arrived_at;
    await expect(stampArrival({ orderId: ORDER }, NOW + 60_000)).resolves.toEqual({ ok: true });
    expect(row.arrived_at).toBe(first);
  });

  it("idempotence rides the STATEMENT: a racer stamps between the read and the UPDATE, and the first stamp stands", async () => {
    // Blind pass on #330: the old test's second call returned at the pre-read's early exit, so the
    // statement's `.is("arrived_at", null)` was never reached. Here the pre-read sees null and the
    // row is stamped by the time the UPDATE runs. MUTATION: drop `.is("arrived_at", null)`.
    const EARLIER = "2026-10-09T01:00:30.000Z";
    afterLookup = () => {
      row.arrived_at = EARLIER;
    };
    await expect(stampArrival({ orderId: ORDER }, NOW)).resolves.toEqual({ ok: true });
    expect(row.arrived_at).toBe(EARLIER);
  });

  it("is TOO EARLY before the lead bound — the same rule the page offers by, enforced in the statement (blind pass on #330)", async () => {
    // MUTATION: drop the statement's lead bound — a 9 AM call for a 6:20 PM slot stamps "Here now".
    const lead = 30 * 60_000;
    await expect(stampArrival({ orderId: ORDER }, Date.parse(SLOT) - lead - 1)).resolves.toEqual({
      ok: false,
      reason: "too_early",
    });
    expect(row.arrived_at).toBeNull();
    await expect(stampArrival({ orderId: ORDER }, Date.parse(SLOT) - lead)).resolves.toEqual({
      ok: true,
    });
  });

  it("a failed CLASSIFICATION read is `failed`, never a decided `not_today` (blind pass on #330)", async () => {
    // The statement refused (another day); the read that says WHICH guard fails. MUTATION: ignore
    // that read's error.
    row.pickup_slot = "2026-10-10T01:20:00.000Z";
    classifyErr = { message: "connection reset" };
    await expect(stampArrival({ orderId: ORDER }, NOW)).resolves.toEqual({
      ok: false,
      reason: "failed",
    });
  });

  it("refuses a slot on another day — the restaurant's day, enforced by the statement", async () => {
    // MUTATION: drop `.gte("pickup_slot", start).lt("pickup_slot", end)` — a couch tap the night
    // before rings Dad's bell for tomorrow's bag.
    row.pickup_slot = "2026-10-10T01:20:00.000Z"; // tomorrow 6:20 PM
    await expect(stampArrival({ orderId: ORDER }, NOW)).resolves.toEqual({
      ok: false,
      reason: "not_today",
    });
    expect(row.arrived_at).toBeNull();
    // And the day is Covina's: 11 PM PDT the night before is already the slot's UTC date.
    row.pickup_slot = SLOT;
    await expect(
      stampArrival({ orderId: ORDER }, Date.parse("2026-10-08T06:00:00.000Z")),
    ).resolves.toEqual({ ok: false, reason: "not_today" });
    expect(row.arrived_at).toBeNull();
  });

  it("refuses a collected order in the statement, never stamping a bag that left", async () => {
    // MUTATION: drop `.or("togo_status.is.null,togo_status.neq.picked_up")`.
    row.togo_status = "picked_up";
    await expect(stampArrival({ orderId: ORDER }, NOW)).resolves.toEqual({
      ok: false,
      reason: "collected",
    });
    expect(row.arrived_at).toBeNull();
    // A pickup whose togo_status the webhook has not initialised yet still takes the arrival.
    row.togo_status = null;
    await expect(stampArrival({ orderId: ORDER }, NOW)).resolves.toEqual({ ok: true });
  });

  it("a BLOCKED write never reports ok — the row count decides, not the absence of an error", async () => {
    // The statement's own predicates refuse, PostgREST answers zero rows and no error. Without the
    // row check the counter is told it knows about a guest it was never told about.
    // MUTATION: `if (rows.length === 0)` → `if (false)`.
    row.pickup_slot = "2026-10-10T01:20:00.000Z";
    const r = await stampArrival({ orderId: ORDER }, NOW);
    expect(r.ok).toBe(false);
  });

  it("a refunded or failed order never takes an arrival — the paid predicate rides the statement (Codex r1 on #330)", async () => {
    // A commit delayed past a refund, or a direct call by an authorized member, would otherwise pin
    // a stamp on a terminal order and ring a false "Here now" on Dad's lane.
    // MUTATION: drop `.eq("status", "paid")`.
    row.status = "refunded";
    await expect(stampArrival({ orderId: ORDER }, NOW)).resolves.toEqual({
      ok: false,
      reason: "closed",
    });
    expect(row.arrived_at).toBeNull();
  });

  it("a non-pickup order (no slot) never takes an arrival", async () => {
    row.pickup_slot = null;
    await expect(stampArrival({ orderId: ORDER }, NOW)).resolves.toEqual({
      ok: false,
      reason: "not_today",
    });
  });
});

describe("stampArrival — who may write (the session arm, then the durable earned_by arm)", () => {
  it("a lapsed session still stamps for the diner who PAID — the earned_by arm (risk 3)", async () => {
    // A pickup booked more than four hours ahead loses its session (session-ttl.ts); the order row
    // outlives it, stamped `earned_by` at fulfilment. MUTATION: `order.earned_by === uid` → false —
    // "I’m here" refuses every tap on exactly the far-booked pickup M65 is about.
    member = { ok: false, code: "session_expired" };
    await expect(stampArrival({ orderId: ORDER }, NOW)).resolves.toEqual({ ok: true });
    expect(row.arrived_at).not.toBeNull();
  });
  it("a lapsed session still stamps for a split PAYER and for a durable SEAT — the tracker's own proofs (Codex r1 on #330)", async () => {
    // `getMyOrderFallback` lets a non-host payer (`qr_order_payers`) and a counter-paid seat
    // (`session_members`, whatever the session's status) read the page; the arrival must accept
    // the same proofs or their "I’m here" refuses every tap.
    member = { ok: false, code: "session_expired" };
    row.earned_by = "u-host";
    callerUid = "u-payer";
    payers = [{ order_id: ORDER, payer_uid: "u-payer" }];
    await expect(stampArrival({ orderId: ORDER }, NOW)).resolves.toEqual({ ok: true });
    row.arrived_at = null;
    callerUid = "u-seat";
    seats = [{ session_id: SESSION, seat_id: "u-seat" }];
    row.tender = "cash"; // a counter-paid order: the seat is the counter arm's own proof
    await expect(stampArrival({ orderId: ORDER }, NOW)).resolves.toEqual({ ok: true });
    // A payer row for ANOTHER order proves nothing.
    row.arrived_at = null;
    callerUid = "u-other";
    payers = [{ order_id: "0b6c1e58-0000-4000-8000-00000000ffff", payer_uid: "u-other" }];
    seats = [];
    await expect(stampArrival({ orderId: ORDER }, NOW)).resolves.toEqual({
      ok: false,
      reason: "unauthorized",
    });
  });

  it("a former seat proves nothing on a CARD-paid order — the counter arm's tender gate (Codex r2 on #330)", async () => {
    // getMyOrderFallback accepts a seat only after proving a counter tender; a tablemate who kept
    // another member's card-paid pickup id must not stamp a false "Here now" once the session
    // lapses. MUTATION: drop the COUNTER_TENDERS check on the seat arm.
    member = { ok: false, code: "session_expired" };
    row.earned_by = "u-host";
    row.tender = "card";
    callerUid = "u-tablemate";
    seats = [{ session_id: SESSION, seat_id: "u-tablemate" }];
    await expect(stampArrival({ orderId: ORDER }, NOW)).resolves.toEqual({
      ok: false,
      reason: "unauthorized",
    });
    expect(row.arrived_at).toBeNull();
    // The same seat on a terminal-paid order is the counter arm, and stamps.
    row.tender = "terminal";
    await expect(stampArrival({ orderId: ORDER }, NOW)).resolves.toEqual({ ok: true });
  });

  it("a failed FIRST lookup is `failed`, not a decided `unauthorized` (Codex r2 on #330)", async () => {
    // `unauthorized` is a 200 the client clears its pending record on — a transient PostgREST
    // failure must keep it. MUTATION: ignore the lookup's error.
    lookupErr = { message: "connection reset" };
    await expect(stampArrival({ orderId: ORDER }, NOW)).resolves.toEqual({
      ok: false,
      reason: "failed",
    });
    expect(row.arrived_at).toBeNull();
  });

  it("throttles EVERY caller before any order read — a refused one too (blind pass on #330)", async () => {
    // The flood guard used to run only after authorization succeeded, so a loop on a known order id
    // bought several backend reads per request, unthrottled. MUTATION: drop the guard.
    rateOk = false;
    member = { ok: false, code: "not_member" };
    callerUid = "u-stranger";
    await expect(stampArrival({ orderId: ORDER }, NOW)).resolves.toEqual({
      ok: false,
      reason: "rate",
    });
    expect(orderReads).toBe(0);
    expect(row.arrived_at).toBeNull();
  });

  it("an unverified caller (a token mid-refresh, no session) is `failed`, never a decided `unauthorized` (blind pass on #330)", async () => {
    // A reconcile at mount can race the browser's token rotation; a decided refusal there retired
    // the record. MUTATION: answer `unauthorized` when no caller is verified.
    callerUid = null;
    await expect(stampArrival({ orderId: ORDER }, NOW)).resolves.toEqual({
      ok: false,
      reason: "failed",
    });
    expect(orderReads).toBe(0);
  });

  it("an auth-transport failure is `failed`, never a decided refusal (Codex r1 on #330)", async () => {
    // A decided `unauthorized` is a 200 the client clears its pending record on — so an identity
    // service that is merely DOWN must not read as "not yours". MUTATION: map every throw to null.
    member = { ok: false, code: "session_expired" };
    callerUid = { unavailable: true };
    await expect(stampArrival({ orderId: ORDER }, NOW)).resolves.toEqual({
      ok: false,
      reason: "failed",
    });
    member = { ok: false, code: "unavailable" };
    callerUid = UID;
    await expect(stampArrival({ orderId: ORDER }, NOW)).resolves.toEqual({
      ok: false,
      reason: "failed",
    });
    expect(row.arrived_at).toBeNull();
  });

  it("refuses a stranger: no membership and not the earner, with the one generic answer", async () => {
    member = { ok: false, code: "not_member" };
    callerUid = "u-stranger";
    await expect(stampArrival({ orderId: ORDER }, NOW)).resolves.toEqual({
      ok: false,
      reason: "unauthorized",
    });
    expect(row.arrived_at).toBeNull();
  });
  it("refuses an unknown order and a malformed id with the same answer (no existence oracle)", async () => {
    await expect(stampArrival({ orderId: "not-a-uuid" }, NOW)).resolves.toEqual({
      ok: false,
      reason: "unauthorized",
    });
    row.id = "0b6c1e58-0000-4000-8000-00000000ffff";
    await expect(stampArrival({ orderId: ORDER }, NOW)).resolves.toEqual({
      ok: false,
      reason: "unauthorized",
    });
  });
  it("a failed UPDATE is 'failed' — a transport answer, never a refusal", async () => {
    updateErr = { message: "connection reset" };
    await expect(stampArrival({ orderId: ORDER }, NOW)).resolves.toEqual({
      ok: false,
      reason: "failed",
    });
  });
});
