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
};
let row: Row;
let member: { ok: true; uid: string } | { ok: false; code: string };
let callerUid: string | null;
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

vi.mock("./authz", () => ({
  assertSessionMember: () =>
    member.ok ? Promise.resolve({ uid: member.uid }) : Promise.reject(new Error(member.code)),
  getCallerUid: () => (callerUid ? Promise.resolve(callerUid) : Promise.reject(new Error("no"))),
}));
vi.mock("./rate", () => ({ assertMutationRate: () => Promise.resolve() }));
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (table: string) => {
      if (table !== "qr_orders") throw new Error(`unexpected table ${table}`);
      const filters: Filter[] = [];
      let patch: Partial<Row> | null = null;
      const chain: Record<string, unknown> = {
        select: (cols: string) => {
          if (patch) {
            selectedAfterUpdate = cols;
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
        lt: (col: keyof Row, val: string) => {
          filters.push((r) => r[col] !== null && Date.parse(String(r[col])) < Date.parse(val));
          return chain;
        },
        or: (expr: string) => {
          filters.push(parseOr(expr));
          return chain;
        },
        maybeSingle: () =>
          Promise.resolve({ data: filters.every((f) => f(row)) ? { ...row } : null, error: null }),
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
  };
  member = { ok: true, uid: UID };
  callerUid = UID;
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
