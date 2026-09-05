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
 * P6 hangs a SECOND section on the same screen (the kitchen pulse) and therefore a second set of
 * reads, with a DIFFERENT failure posture — and the difference is what the last block here pins:
 *
 *  · the session-mode read stays fail-CLOSED (503, nothing published), because its failure would
 *    let dine-in names onto the Ready column;
 *  · the pulse reads are fail-DEGRADED (`pulse: null`, the Ready column still publishes), because
 *    their failure can only remove information — and `null` is NOT zero. A zeroed pulse would draw
 *    an "all clear" band over a full wok, the exact lie `lib/kitchen.ts` refuses one screen over.
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

type LineRow = {
  cart_id: string;
  menu_item_id: string;
  name: string;
  qty: number;
  state: string;
  fire_at: string | null;
  bumped_at: string | null;
};

type CartRow = { id: string; session_id: string; status: string };
type SessionRow = {
  id: string;
  mode: string;
  status: string;
  table_number: number | null;
  expires_at: string | null;
};

// A FIXED instant, deliberately not "around now". Several assertions below prove the pulse's
// windows are cut from the DATABASE clock (`mms_now`, mocked to this value) rather than the Node
// process clock — and a fixture set to the current time would make those two indistinguishable, so
// the guard would pass whichever clock the route actually used.
const NOW_ISO = "2026-09-01T19:00:00.000Z";
const NOW = Date.parse(NOW_ISO);
const MIN = 60_000;
const LIVE = new Date(NOW + 60 * MIN).toISOString(); // a session inside its TTL

let gate: { ok: boolean; reason?: string } = { ok: true };
let orders: OrderRow[] = [];
let ordersError: { message: string } | null = null;
let sessions: SessionRow[] = [];
let sessionsError: { message: string } | null = null;
let lines: LineRow[] = [];
let linesError: { message: string } | null = null;
let carts: CartRow[] = [];
let cartsError: { message: string } | null = null;
let menu: { id: string; name_my: string | null }[] = [];
let menuError: { message: string } | null = null;

vi.mock("@/lib/device-auth", () => ({ authorizeDevice: () => Promise.resolve(gate) }));

/** The ids the route actually asked the session read for — the predicate, not just the shape. */
let requestedSessionIds: unknown[] = [];
/**
 * Everything the pulse's LINE read was issued with. Recorded, not applied: `.gte()`/`.not()` are
 * pass-throughs in this mock, so a route that dropped either would still get the configured rows
 * back — which is precisely why each predicate is asserted DIRECTLY below instead of being trusted
 * to show up as a missing row.
 */
let lineOrFilter: string | null = null;
let lineGte: [string, unknown][] = [];
let lineNot: [string, string, unknown][] = [];
/** The cart-status values the pulse's cart read demanded. */
let requestedCartStatuses: unknown[] = [];

/**
 * The mock APPLIES the `.in()` predicates rather than ignoring them (Codex round 2, P2). A chain
 * that answers the configured rows for any arguments would keep every allowlist case and the board
 * mutant green while the route queried the wrong ids entirely (`o.id` instead of `o.session_id`) —
 * which in production returns no modes at all and empties the board of every legitimate pickup
 * order. A mock looser than the database cannot express that bug.
 *
 * Per TABLE rather than one shared chain, because the four reads have different terminal calls
 * (`.limit()` for the two scans, `.in()` for the three lookups, and `qr_carts` takes TWO `.in()`s
 * in a row). One chain that answered anything to anything would silently accept a route that asked
 * `qr_carts` for a status set it never meant.
 */
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    rpc: (fn: string) => {
      if (fn !== "mms_now") throw new Error(`unexpected rpc ${fn}`);
      return Promise.resolve({ data: NOW_ISO, error: null });
    },
    from: (table: string) => {
      if (table === "qr_orders") {
        const chain: Record<string, unknown> = {
          select: () => chain,
          is: () => chain,
          gte: () => chain,
          or: () => chain,
          order: () => chain,
          limit: () => Promise.resolve({ data: orders, error: ordersError }),
        };
        return chain;
      }
      if (table === "qr_cart_items") {
        const chain: Record<string, unknown> = {
          select: () => chain,
          not: (col: string, op: string, value: unknown) => {
            lineNot.push([col, op, value]);
            return chain;
          },
          gte: (col: string, value: unknown) => {
            lineGte.push([col, value]);
            return chain;
          },
          or: (filter: string) => {
            lineOrFilter = filter;
            return chain;
          },
          order: () => chain,
          limit: () => Promise.resolve({ data: linesError ? null : lines, error: linesError }),
        };
        return chain;
      }
      if (table === "qr_carts") {
        let ids: unknown[] = [];
        const chain: Record<string, unknown> = {
          select: () => chain,
          in: (col: string, values: unknown[]) => {
            if (col === "id") {
              ids = values;
              return chain;
            }
            if (col !== "status") throw new Error(`unexpected qr_carts filter ${col}`);
            requestedCartStatuses = values;
            if (cartsError) return Promise.resolve({ data: null, error: cartsError });
            return Promise.resolve({
              data: carts.filter((c) => ids.includes(c.id) && values.includes(c.status)),
              error: null,
            });
          },
        };
        return chain;
      }
      if (table === "table_sessions") {
        const chain: Record<string, unknown> = {
          select: () => chain,
          in: (col: string, ids: unknown[]) => {
            requestedSessionIds = ids;
            if (sessionsError) return Promise.resolve({ data: null, error: sessionsError });
            return Promise.resolve({
              data: sessions.filter((s) => col === "id" && ids.includes(s.id)),
              error: null,
            });
          },
        };
        return chain;
      }
      if (table === "menu_items") {
        const chain: Record<string, unknown> = {
          select: () => chain,
          in: (col: string, ids: unknown[]) => {
            if (menuError) return Promise.resolve({ data: null, error: menuError });
            return Promise.resolve({
              data: menu.filter((m) => col === "id" && ids.includes(m.id)),
              error: null,
            });
          },
        };
        return chain;
      }
      throw new Error(`unexpected ${table}`);
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
const DISH = "cccccccc-cccc-4ccc-8ccc-cccccccc0003";

type Body = {
  orders?: { name: string | null }[];
  pulse?: {
    tickets: number;
    oldestMinutes: number | null;
    allDay: { name: string; nameMy: string | null; qty: number }[];
    allDayMore: number;
    tables: { table: number; status: string }[];
  } | null;
  reason?: string;
};

beforeEach(() => {
  gate = { ok: true };
  orders = [order(TOGO, "sess-togo", "Nilar"), order(DINEIN, "sess-dinein", "Thura")];
  ordersError = null;
  sessions = [
    { id: "sess-togo", mode: "pickup", status: "active", table_number: null, expires_at: LIVE },
    { id: "sess-dinein", mode: "dinein", status: "active", table_number: 4, expires_at: LIVE },
  ];
  sessionsError = null;
  lines = [];
  linesError = null;
  carts = [];
  cartsError = null;
  menu = [];
  menuError = null;
  requestedSessionIds = [];
  requestedCartStatuses = [];
  lineOrFilter = null;
  lineGte = [];
  lineNot = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/board — dine-in never reaches the wall", () => {
  it("resolves modes by the orders' SESSION ids, not their order ids", async () => {
    // Named explicitly because everything else here would survive the substitution: asking for
    // `o.id` returns no modes, and under the allowlist that empties the board — a total outage of
    // the wall display that reads exactly like "nothing is ready".
    await GET(req());
    expect([...requestedSessionIds].sort()).toEqual(["sess-dinein", "sess-togo"]);
  });

  it("publishes the to-go order and drops the dine-in one", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as Body;
    expect(body.orders!.map((o) => o.name)).toEqual(["Nilar"]);
  });

  it("refuses rather than publishing when the mode read FAILS", async () => {
    sessionsError = { message: "connection terminated" };
    const res = await GET(req());
    expect(res.status).toBe(503);
    const body = (await res.json()) as Body;
    // Nothing is published — not the to-go row either, and not the pulse. A partial board on an
    // unknowable read would be indistinguishable, on the screen, from a complete one.
    expect(body.orders).toBeUndefined();
    expect(body.pulse).toBeUndefined();
    // `unavailable` is the reason the board's client folds to retry-and-hold (board-poll.ts). A 401
    // or a bare 503 would unlink the screen or blank it; this keeps the last snapshot up.
    expect(body.reason).toBe("unavailable");
  });

  it("publishes scan-and-go as well as pickup — both are board modes", async () => {
    orders = [order(TOGO, "sess-togo", "Nilar")];
    sessions = [
      { id: "sess-togo", mode: "scango", status: "active", table_number: null, expires_at: LIVE },
    ];
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as Body;
    expect(body.orders!.map((o) => o.name)).toEqual(["Nilar"]);
  });

  it("a mode this code has never heard of is NOT published", async () => {
    // The allowlist's whole reason to exist. `table_sessions.mode`'s CHECK admits three values
    // today; the day it gains a fourth that means table service, `!== "dinein"` would have put those
    // names on the wall with nobody having decided that. Staff can see a missing name; nobody can
    // see a name that should not be there.
    orders = [order(TOGO, "sess-togo", "Nilar")];
    sessions = [
      {
        id: "sess-togo",
        mode: "counter-seated",
        status: "active",
        table_number: null,
        expires_at: LIVE,
      },
    ];
    const res = await GET(req());
    const body = (await res.json()) as Body;
    expect(body.orders).toEqual([]);
  });

  it("a session whose row is MISSING from a successful read is not published", async () => {
    // Not the same as a failed read: the read answered, and it did not name a board mode. Publish
    // what is known to belong on the wall, never what was merely not seen.
    sessions = [
      { id: "sess-togo", mode: "pickup", status: "active", table_number: null, expires_at: LIVE },
    ];
    orders = [order(DINEIN, "sess-dinein", "Thura")];
    const res = await GET(req());
    const body = (await res.json()) as Body;
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
    const body = (await res.json()) as Body;
    expect(body.orders).toEqual([]);
  });
});

/** A live dine-in ticket at table 4, plus its cart and the session already in `beforeEach`. */
function seedCookingTable() {
  lines = [
    {
      cart_id: "cart-1",
      menu_item_id: DISH,
      name: "Mohinga",
      qty: 2,
      state: "fired",
      fire_at: new Date(NOW - 6 * MIN).toISOString(),
      bumped_at: null,
    },
  ];
  carts = [{ id: "cart-1", session_id: "sess-dinein", status: "open" }];
}

describe("GET /api/board — the kitchen pulse publishes load, not people", () => {
  it("carries the dine-in table by NUMBER and status, with no name and no dish attached to it", async () => {
    seedCookingTable();
    const res = await GET(req());
    const body = (await res.json()) as Body;
    expect(body.pulse!.tables).toEqual([{ table: 4, status: "cooking" }]);
    expect(body.pulse!.tickets).toBe(1);
    // The dine-in guest's name is on this very order row and must not appear ANYWHERE in the
    // response — not in the Ready column it is already excluded from, and not in the new band.
    expect(JSON.stringify(body)).not.toContain("Thura");
  });

  it("WITHHOLDS the all-day rail at one live ticket — the rail would be that table's order", async () => {
    seedCookingTable();
    const res = await GET(req());
    const body = (await res.json()) as Body;
    expect(body.pulse!.allDay).toEqual([]);
    expect(body.pulse!.allDayMore).toBe(0);
    expect(JSON.stringify(body)).not.toContain("Mohinga");
  });

  it("publishes the rail once three tickets are live, with the catalog's Burmese", async () => {
    seedCookingTable();
    for (const n of [2, 3]) {
      lines.push({ ...lines[0]!, cart_id: `cart-${n}`, qty: 1 });
      carts.push({ id: `cart-${n}`, session_id: "sess-togo", status: "paid" });
    }
    menu = [{ id: DISH, name_my: "မုန့်ဟင်းခါး" }];
    const res = await GET(req());
    const body = (await res.json()) as Body;
    expect(body.pulse!.tickets).toBe(3);
    expect(body.pulse!.allDay).toEqual([{ name: "Mohinga", nameMy: "မုန့်ဟင်းခါး", qty: 4 }]);
  });

  it("asks the kitchen read for live and just-bumped lines only, bounded by the linger window", async () => {
    // The route's own predicates, asserted rather than assumed. This mock returns the configured
    // rows whatever it is asked, so none of these would surface as a missing row: a read that
    // dropped the `served` arm silently retires every `up` table; one that dropped the `bumped_at`
    // floor scans an evening of served rows to answer a question about five minutes; one that
    // dropped the day floor or the `fire_at is not null` guard scans the whole table forever.
    await GET(req());
    expect(lineOrFilter).toMatch(/state\.in\.\(fired,in_progress\)/);
    expect(lineOrFilter).toMatch(/state\.eq\.served/);
    const floor = /bumped_at\.gte\.([0-9TZ:.-]+)/.exec(lineOrFilter ?? "");
    expect(floor).not.toBeNull();
    expect(NOW - Date.parse(floor![1]!)).toBe(5 * 60 * 1000);
    expect(lineNot).toEqual([["fire_at", "is", null]]);
    expect(lineGte).toHaveLength(1);
    expect(lineGte[0]![0]).toBe("fire_at");
    // …and every window is cut from the DATABASE clock, not the Node process clock. `NOW_ISO` is a
    // fixed instant nowhere near the runner's own, so the app clock cannot satisfy this by luck.
    expect(NOW - Date.parse(String(lineGte[0]![1]))).toBe(24 * 60 * 60 * 1000);
  });

  it("asks for carts the kitchen may legitimately cook — open or paid, never cancelled", async () => {
    seedCookingTable();
    await GET(req());
    expect([...requestedCartStatuses].sort()).toEqual(["open", "paid"]);
  });

  it("publishes NO identifier of any kind, anywhere in the response", async () => {
    // The boundary asserted as a property over the whole serialized body rather than as a key-name
    // check on one object. Every id the pulse READS is given a value that could not appear by
    // coincidence, and none of them may come back out — not the session, cart or order ids, not the
    // catalog id behind a rail row, and not the dine-in guest's name.
    seedCookingTable();
    for (const n of [2, 3]) {
      lines.push({ ...lines[0]!, cart_id: `cart-SECRET-${n}`, qty: 1 });
      carts.push({ id: `cart-SECRET-${n}`, session_id: "sess-togo", status: "paid" });
    }
    const res = await GET(req());
    const body = JSON.stringify(await res.json());
    for (const leak of [
      "cart-1",
      "cart-SECRET-2",
      "sess-dinein",
      "sess-togo",
      DISH,
      DINEIN,
      "Thura",
    ])
      expect(body).not.toContain(leak);
    // …while the things it IS for did come through, so this is not passing on an empty payload.
    expect(body).toContain('"tickets":3');
    expect(body).toContain('"table":4');
  });

  it("a failed KITCHEN read is null, never an empty band — and the Ready column still publishes", async () => {
    // The whole degrade. `pulse: {tickets: 0}` would draw "all clear" over a full wok; `null` is the
    // screen's cue to say it cannot read the kitchen. And the customer-facing half is untouched,
    // because a dropped kitchen read says nothing about which bags are ready.
    for (const fail of ["lines", "carts"] as const) {
      seedCookingTable();
      linesError = fail === "lines" ? { message: "connection terminated" } : null;
      cartsError = fail === "carts" ? { message: "connection terminated" } : null;
      const res = await GET(req());
      expect(res.status).toBe(200);
      const body = (await res.json()) as Body;
      expect(body.pulse).toBeNull();
      expect(body.orders!.map((o) => o.name)).toEqual(["Nilar"]);
    }
  });

  it("a failed NAME read degrades to English — a label can never withhold the band", async () => {
    seedCookingTable();
    for (const n of [2, 3]) {
      lines.push({ ...lines[0]!, cart_id: `cart-${n}`, qty: 1 });
      carts.push({ id: `cart-${n}`, session_id: "sess-togo", status: "paid" });
    }
    menuError = { message: "connection terminated" };
    const res = await GET(req());
    const body = (await res.json()) as Body;
    expect(body.pulse!.allDay).toEqual([{ name: "Mohinga", nameMy: null, qty: 4 }]);
  });
});
