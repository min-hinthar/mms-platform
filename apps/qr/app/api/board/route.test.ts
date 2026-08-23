import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The order-ready board's ONE privacy rule: dine-in never reaches the wall.
 *
 * `table_number is null` alone does not express it — a dine-in session at an unregistered sticker
 * stamps null too — so the route resolves each order's session mode in a second read and drops the
 * dine-in rows. That second read was fail-OPEN: its `{ error }` was discarded, an unreadable answer
 * left the mode map empty, every `undefined !== "dinein"` passed, and the whole table's
 * diner-chosen first names went up on a screen the dining room can read. A dropped read must never
 * expose MORE than a successful one — the same shape as M108 one surface over, failing the other way.
 *
 * These assertions are about the ANSWER, not about copy: what the route publishes, and what it
 * refuses to publish when it cannot tell.
 */

vi.mock("server-only", () => ({}));

type OrderRow = {
  id: string;
  session_id: string | null;
  togo_status: string;
  customer_name: string | null;
  togo_ready_at: string | null;
  togo_picked_up_at: string | null;
  created_at: string;
};

let gate: { ok: boolean; reason?: string } = { ok: true };
let orders: OrderRow[] = [];
let ordersError: { message: string } | null = null;
let sessions: { id: string; mode: string }[] = [];
let sessionsError: { message: string } | null = null;

vi.mock("@/lib/device-auth", () => ({ authorizeDevice: () => Promise.resolve(gate) }));

vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        is: () => chain,
        gte: () => chain,
        or: () => chain,
        order: () => chain,
        limit: () => Promise.resolve({ data: orders, error: ordersError }),
        in: () => Promise.resolve({ data: sessions, error: sessionsError }),
      };
      if (table !== "qr_orders" && table !== "table_sessions")
        throw new Error(`unexpected ${table}`);
      return chain;
    },
  }),
}));

const { GET } = await import("./route");

const req = () =>
  ({ nextUrl: { searchParams: new URLSearchParams("k=tok") } }) as unknown as Parameters<
    typeof GET
  >[0];

const order = (id: string, sessionId: string | null, name: string): OrderRow => ({
  id,
  session_id: sessionId,
  togo_status: "ready",
  customer_name: name,
  togo_ready_at: "2026-08-23T00:00:00.000Z",
  togo_picked_up_at: null,
  created_at: "2026-08-23T00:00:00.000Z",
});

const TOGO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001";
const DINEIN = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0002";

beforeEach(() => {
  gate = { ok: true };
  orders = [order(TOGO, "sess-togo", "Nilar"), order(DINEIN, "sess-dinein", "Thura")];
  ordersError = null;
  sessions = [
    { id: "sess-togo", mode: "pickup" },
    { id: "sess-dinein", mode: "dinein" },
  ];
  sessionsError = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/board — dine-in never reaches the wall", () => {
  it("publishes the to-go order and drops the dine-in one", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { orders: { name: string | null }[] };
    expect(body.orders.map((o) => o.name)).toEqual(["Nilar"]);
  });

  it("refuses rather than publishing when the mode read FAILS", async () => {
    sessionsError = { message: "connection terminated" };
    const res = await GET(req());
    expect(res.status).toBe(503);
    const body = (await res.json()) as { reason?: string; orders?: unknown };
    // Nothing is published — not the to-go row either. A partial board on an unknowable read would
    // be indistinguishable, on the screen, from a complete one.
    expect(body.orders).toBeUndefined();
    // `unavailable` is the reason the board's client folds to retry-and-hold (board-poll.ts). A 401
    // or a bare 503 would unlink the screen or blank it; this keeps the last snapshot up.
    expect(body.reason).toBe("unavailable");
  });

  it("publishes scan-and-go as well as pickup — both are board modes", async () => {
    orders = [order(TOGO, "sess-togo", "Nilar")];
    sessions = [{ id: "sess-togo", mode: "scango" }];
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { orders: { name: string | null }[] };
    expect(body.orders.map((o) => o.name)).toEqual(["Nilar"]);
  });

  it("a mode this code has never heard of is NOT published", async () => {
    // The allowlist's whole reason to exist. `table_sessions.mode`'s CHECK admits three values
    // today; the day it gains a fourth that means table service, `!== "dinein"` would have put those
    // names on the wall with nobody having decided that. Staff can see a missing name; nobody can
    // see a name that should not be there.
    orders = [order(TOGO, "sess-togo", "Nilar")];
    sessions = [{ id: "sess-togo", mode: "counter-seated" }];
    const res = await GET(req());
    const body = (await res.json()) as { orders: { name: string | null }[] };
    expect(body.orders).toEqual([]);
  });

  it("a session whose row is MISSING from a successful read is not published", async () => {
    // Not the same as a failed read: the read answered, and it did not name a board mode. Publish
    // what is known to belong on the wall, never what was merely not seen.
    sessions = [{ id: "sess-togo", mode: "pickup" }];
    orders = [order(DINEIN, "sess-dinein", "Thura")];
    const res = await GET(req());
    const body = (await res.json()) as { orders: { name: string | null }[] };
    expect(body.orders).toEqual([]);
  });

  it("a null session_id is unknowable, not to-go", async () => {
    // `qr_orders.session_id` is nullable but every insert sources it from `qr_carts.session_id`,
    // which is NOT NULL — so this cannot happen today. Pinned anyway because the previous version of
    // this branch published such a row on the strength of a comment that claimed grocery orders
    // carry a null session, which the schema does not support.
    orders = [order(TOGO, null, "Nilar")];
    sessions = [];
    const res = await GET(req());
    const body = (await res.json()) as { orders: { name: string | null }[] };
    expect(body.orders).toEqual([]);
  });
});
