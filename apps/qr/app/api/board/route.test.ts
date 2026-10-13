import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The wall TV's read, `/api/board`: what it PUBLISHES and what it refuses to publish when it cannot
 * tell. These assertions are about the ANSWER, not about copy.
 *
 * Two halves, two failure postures — and the difference is what the suite pins:
 *
 *  · the CODE column (pickup and scan-and-go bags as `{ code, status }`) rests on the session-mode
 *    read, which is fail-CLOSED: its `{ error }` was discarded once, an empty mode map let every
 *    `undefined !== "dinein"` pass, and a table's guests went up on a screen the dining room reads.
 *    A dropped read must never expose MORE than a successful one: 503, nothing published.
 *  · the KITCHEN half (PD9 — every dine-in table's dishes, the owner's 2026-10-07 reversal of the
 *    shipped boundary, OPEN-ITEMS K32(b) / P6a) is fail-DEGRADED: a failed or saturated kitchen read
 *    is `tables: null` — never `[]`, which would read "all clear" over a full wok — and the code
 *    column still publishes. The round read and the name read are advisory below that.
 *
 * ⚠️ THE PIN THIS SUITE REVERSED, KNOWINGLY: until PD9 a case here read "carries the dine-in table
 * by NUMBER and status, with no name and NO DISH attached to it". The owner's message is the
 * decision K32(b) was waiting for; the case below now reads "a dish name rides only inside its
 * table, with no quantity".
 */

vi.mock("server-only", () => ({}));

type OrderRow = {
  id: string;
  session_id: string | null;
  togo_status: string;
  togo_ready_at: string | null;
  created_at: string;
  // The lifecycle audit — the columns `boardOrderLive` decides on.
  status: string;
  pickup_slot: string | null;
  fire_at: string | null;
  cart_id: string | null;
};

type LineRow = {
  id: string;
  cart_id: string;
  menu_item_id: string;
  name: string;
  state: string;
  fire_at: string | null;
  fire_batch: string | null;
  fulfillment: string | null;
  created_at: string;
  bumped_at: string | null;
};

type CartRow = { id: string; session_id: string; status: string };
type SessionRow = {
  id: string;
  mode: string;
  status: string;
  table_number: number | null;
  expires_at: string | null;
  qr_code: string;
};

// A FIXED instant, deliberately not "around now": several assertions prove the kitchen windows are
// cut from the DATABASE clock (`mms_now`, mocked to this value) rather than the Node process clock.
const NOW_ISO = "2026-09-01T19:00:00.000Z";
const NOW = Date.parse(NOW_ISO);
const MIN = 60_000;
const LIVE = new Date(NOW + 60 * MIN).toISOString(); // a session inside its TTL
const BATCH = "eeeeeeee-eeee-4eee-8eee-eeeeeeee0005";

let gate: { ok: boolean; reason?: string } = { ok: true };
let orders: OrderRow[] = [];
let ordersError: { message: string } | null = null;
/** The lifecycle audit — each order's takeaway snapshot lines (`qr_order_items`); null = one to-go
 *  dish per asked order (a bag). */
let orderItems: { order_id: string; fulfillment: string }[] | null = null;
let orderItemsError: { message: string } | null = null;
/** The bag's comped takeaway lines (`qr_cart_items`, comped). */
let compLines: { cart_id: string; state: string; fulfillment: string }[] = [];
/** What the orders read was filtered with: its `.eq()`s and its `.or()` expressions. */
let orderEqs: [string, unknown][] = [];
let orderOrs: string[] = [];
let sessions: SessionRow[] = [];
let sessionsError: { message: string } | null = null;
/** What the kitchen LINE read answers. */
let lines: LineRow[] = [];
let linesError: { message: string } | null = null;
/** Lines only the SEND COMPLETION read can see (served before the linger floor). */
let sendExtra: LineRow[] = [];
let sendError: { message: string } | null = null;
let carts: CartRow[] = [];
let cartsError: { message: string } | null = null;
let menu: { id: string; name_my: string | null }[] = [];
let menuError: { message: string } | null = null;
/** Every catalog read the name loader issued: which table, for which refs (Codex round 1 on #336). */
let catalogReads: { table: string; ids: unknown[] }[] = [];
/** The idle re-read: the cart each line names NOW (`null` = the row is gone), the ids it was asked
 *  for (`null` = never asked), and its failure. */
let movedTo: Record<string, string | null> = {};
let rereadIds: unknown[] | null = null;
let rereadError: { message: string } | null = null;

vi.mock("@/lib/device-auth", () => ({ authorizeDevice: () => Promise.resolve(gate) }));

/** The ids the route actually asked the session read for — the predicate, not just the shape. */
let requestedSessionIds: unknown[] = [];
/** The statuses the orders read demanded, and its columns. */
let orderStatuses: unknown[] = [];
let orderCols = "";
/** Every column list `qr_cart_items` was read with, and every `.or()` filter the line read used. */
let lineCols: string[] = [];
let lineOrFilters: string[] = [];
/** The cart-status values the kitchen's cart read demanded. */
let requestedCartStatuses: unknown[] = [];
/** The session ids the round read was asked for (`null` = never asked). */
let roundSessions: string[] | null = null;
let roundsAnswer: ReadonlyMap<
  string,
  { ordinals: ReadonlyMap<string, number>; seen: ReadonlySet<string> }
> | null = new Map();
/** PD5b, ported — run the KDS's REAL round read against this file's fake database instead of
 *  answering `roundsAnswer`, so a case can pin what the read itself decides. */
let realRounds = false;
/** Lines only the ROUND read sees: a table's earlier Sends, served and gone from the wall, which the
 *  round read ranks and the wall's own line reads never return. */
let roundOnly: LineRow[] = [];

vi.mock("@/lib/kitchen-round-read", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/kitchen-round-read")>();
  return {
    ...actual,
    readRounds: (...args: Parameters<typeof actual.readRounds>) => {
      roundSessions = [...args[1]];
      return realRounds ? actual.readRounds(...args) : Promise.resolve(roundsAnswer);
    },
  };
});

/**
 * The mock APPLIES the `.in()` predicates rather than ignoring them (Codex round 2, P2): a chain that
 * answers the configured rows for any arguments would keep every allowlist case green while the
 * route queried the wrong ids entirely. Per TABLE, because the reads have different terminals.
 */
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    rpc: (fn: string) => {
      if (fn !== "mms_now") throw new Error(`unexpected rpc ${fn}`);
      return Promise.resolve({ data: NOW_ISO, error: null });
    },
    from: (table: string) => {
      if (table === "qr_orders") {
        // Honours EVERY `.order()` in sequence, nulls placement included, and LIMIT (A4·1): the
        // saturation rule is about which rows a capped read keeps.
        const keys: { col: keyof OrderRow; ascending: boolean; nullsFirst: boolean }[] = [];
        let statuses: unknown[] | null = null;
        const chain: Record<string, unknown> = {
          select: (cols: string) => {
            orderCols = cols;
            return chain;
          },
          is: () => chain,
          gte: () => chain,
          eq: (col: string, v: unknown) => {
            orderEqs.push([col, v]);
            return chain;
          },
          in: (col: string, values: unknown[]) => {
            if (col !== "togo_status") throw new Error(`unexpected qr_orders filter ${col}`);
            statuses = values;
            orderStatuses = values;
            return chain;
          },
          or: (expr: string) => {
            orderOrs.push(expr);
            return chain;
          },
          order: (col: keyof OrderRow, opts?: { ascending?: boolean; nullsFirst?: boolean }) => {
            keys.push({
              col,
              ascending: opts?.ascending !== false,
              nullsFirst: opts?.nullsFirst === true,
            });
            return chain;
          },
          limit: (n: number) => {
            if (ordersError) return Promise.resolve({ data: null, error: ordersError });
            const sorted = orders
              .filter((o) => statuses === null || statuses.includes(o.togo_status))
              .sort((a, b) => {
                for (const k of keys) {
                  const av = a[k.col];
                  const bv = b[k.col];
                  if (av === bv) continue;
                  if (av === null) return k.nullsFirst ? -1 : 1;
                  if (bv === null) return k.nullsFirst ? 1 : -1;
                  const c = String(av).localeCompare(String(bv));
                  if (c !== 0) return k.ascending ? c : -c;
                }
                return 0;
              });
            return Promise.resolve({ data: sorted.slice(0, n), error: null });
          },
        };
        return chain;
      }
      if (table === "qr_order_items") {
        let asked: unknown[] = [];
        const chain: Record<string, unknown> = {
          select: () => chain,
          in: (col: string, ids: unknown[]) => {
            if (col !== "order_id") throw new Error(`unexpected qr_order_items filter ${col}`);
            asked = ids;
            return chain;
          },
          limit: (n: number) => {
            if (orderItemsError) return Promise.resolve({ data: null, error: orderItemsError });
            const rows =
              orderItems ?? asked.map((id) => ({ order_id: id as string, fulfillment: "togo" }));
            return Promise.resolve({
              data: rows.filter((r) => asked.includes(r.order_id)).slice(0, n),
              error: null,
            });
          },
        };
        return chain;
      }
      if (table === "qr_cart_items") {
        let batches: unknown[] | null = null;
        /** The lifecycle audit — the bag read's comp leg (`.eq("comped", true)`). */
        let compRead = false;
        let states: unknown[] | null = null;
        /** The ROUND read's lines leg (`in("cart_id")`): every batched line of the asked carts. */
        let roundCarts: unknown[] | null = null;
        const chain: Record<string, unknown> = {
          select: (cols: string) => {
            lineCols.push(cols);
            return chain;
          },
          or: (filter: string) => {
            lineOrFilters.push(filter);
            return chain;
          },
          in: (col: string, values: unknown[]) => {
            if (col === "id") {
              // The IDLE RE-READ (Codex round 1 on #336): each asked line's CURRENT cart — moved by a
              // merge (`movedTo`), gone (folded: `null`), or where the line read saw it.
              rereadIds = values;
              if (rereadError) return Promise.resolve({ data: null, error: rereadError });
              const known = new Map([...lines, ...sendExtra].map((l) => [l.id, l.cart_id]));
              return Promise.resolve({
                data: values.flatMap((id) => {
                  const now = Object.hasOwn(movedTo, id as string)
                    ? movedTo[id as string]
                    : known.get(id as string);
                  return now ? [{ id, cart_id: now }] : [];
                }),
                error: null,
              });
            }
            if (col === "fire_batch") batches = values;
            else if (col === "state") states = values;
            else if (col === "cart_id") roundCarts = values;
            else throw new Error(`unexpected qr_cart_items filter ${col}`);
            return chain;
          },
          eq: (col: string, v: unknown) => {
            if (col !== "comped" || v !== true)
              throw new Error(`unexpected qr_cart_items eq ${col}`);
            compRead = true;
            return chain;
          },
          not: (col: string, op: string, v: unknown) => {
            if (col !== "fire_batch" || op !== "is" || v !== null)
              throw new Error(`unexpected qr_cart_items not(${col}, ${op})`);
            return chain;
          },
          order: () => chain,
          limit: (n: number) => {
            if (compRead) {
              const asked = roundCarts ?? [];
              return Promise.resolve({
                data: compLines.filter((c) => asked.includes(c.cart_id)).slice(0, n),
                error: null,
              });
            }
            if (roundCarts !== null) {
              const asked = roundCarts;
              const all = [
                ...new Map([...roundOnly, ...lines, ...sendExtra].map((l) => [l.id, l])).values(),
              ].filter((l) => asked.includes(l.cart_id) && l.fire_batch !== null);
              return Promise.resolve({ data: all.slice(0, n), error: null, count: all.length });
            }
            if (batches === null) {
              // The LINE read.
              if (linesError) return Promise.resolve({ data: null, error: linesError });
              return Promise.resolve({ data: lines.slice(0, n), error: null });
            }
            // The SEND COMPLETION read: every line of the asked batches, in the asked states.
            if (sendError) return Promise.resolve({ data: null, error: sendError });
            const rows = [...lines, ...sendExtra].filter(
              (l) =>
                batches!.includes(l.fire_batch) && (states === null || states.includes(l.state)),
            );
            return Promise.resolve({ data: rows.slice(0, n), error: null });
          },
        };
        return chain;
      }
      if (table === "qr_carts") {
        let ids: unknown[] = [];
        /** The ROUND read's carts leg: the asked sessions' carts, minus the status it refuses. */
        let roundSessionIds: unknown[] | null = null;
        let refused: unknown = undefined;
        const chain: Record<string, unknown> = {
          select: () => chain,
          neq: (col: string, v: unknown) => {
            if (col !== "status") throw new Error(`unexpected qr_carts neq ${col}`);
            refused = v;
            return chain;
          },
          limit: (n: number) => {
            if (roundSessionIds === null) throw new Error("qr_carts limit outside the round read");
            const asked = roundSessionIds;
            const rows = carts.filter((c) => asked.includes(c.session_id) && c.status !== refused);
            return Promise.resolve({ data: rows.slice(0, n), error: null });
          },
          in: (col: string, values: unknown[]) => {
            if (col === "session_id") {
              roundSessionIds = values;
              return chain;
            }
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
        // The SELECTED columns only, as PostgREST answers (the last blind pass on #336): a column the
        // route forgot to read is ABSENT from the row, so a rule that needs it cannot pass on a
        // fixture that carries it anyway.
        let cols: (keyof SessionRow)[] = [];
        const chain: Record<string, unknown> = {
          select: (list: string) => {
            cols = list.split(",") as (keyof SessionRow)[];
            return chain;
          },
          in: (col: string, ids: unknown[]) => {
            requestedSessionIds = ids;
            if (sessionsError) return Promise.resolve({ data: null, error: sessionsError });
            return Promise.resolve({
              data: sessions
                .filter((s) => col === "id" && ids.includes(s.id))
                .map((s) => Object.fromEntries(cols.map((c) => [c, s[c]]))),
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
            catalogReads.push({ table, ids });
            if (menuError) return Promise.resolve({ data: null, error: menuError });
            return Promise.resolve({
              data: menu.filter((m) => col === "id" && ids.includes(m.id)),
              error: null,
            });
          },
        };
        return chain;
      }
      if (table === "grocery_items") {
        // F18 (A4·1) — the ONE name loader partitions non-uuid refs to the grocery table.
        const chain: Record<string, unknown> = {
          select: () => chain,
          in: (_col: string, ids: unknown[]) => {
            catalogReads.push({ table, ids });
            return Promise.resolve({ data: [], error: null });
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

// The lifecycle audit — placed an hour before the DB clock (inside the due window `boardOrderLive`
// now applies in TS), paid, slotless, fired at settlement, on its own cart.
const order = (id: string, sessionId: string | null, status = "ready"): OrderRow => ({
  id,
  session_id: sessionId,
  togo_status: status,
  togo_ready_at: status === "ready" ? new Date(NOW - 30 * MIN).toISOString() : null,
  created_at: new Date(NOW - 60 * MIN).toISOString(),
  status: "paid",
  pickup_slot: null,
  fire_at: null,
  cart_id: `cart-${id}`,
});

const TOGO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001";
const DINEIN = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0002";
const DISH = "cccccccc-cccc-4ccc-8ccc-cccccccc0003";

type Body = {
  orders?: { code: string; status: string }[];
  tables?:
    | {
        table: number;
        out: boolean;
        rounds: {
          n: number | null;
          next: boolean;
          dishes: { name: string; nameMy: string | null; stage: string; togo: boolean }[];
        }[];
      }[]
    | null;
  kitchenIdle?: boolean | null;
  reason?: string;
};

beforeEach(() => {
  gate = { ok: true };
  orders = [order(TOGO, "sess-togo"), order(DINEIN, "sess-dinein")];
  ordersError = null;
  orderItems = null;
  orderItemsError = null;
  compLines = [];
  orderEqs = [];
  orderOrs = [];
  sessions = [
    {
      id: "sess-togo",
      mode: "pickup",
      status: "active",
      table_number: null,
      expires_at: LIVE,
      qr_code: "SESS-TOGO",
    },
    {
      id: "sess-dinein",
      mode: "dinein",
      status: "active",
      table_number: 4,
      expires_at: LIVE,
      qr_code: "SESS-DINEIN",
    },
  ];
  sessionsError = null;
  lines = [];
  linesError = null;
  sendExtra = [];
  sendError = null;
  carts = [];
  cartsError = null;
  menu = [];
  menuError = null;
  catalogReads = [];
  movedTo = {};
  rereadIds = null;
  rereadError = null;
  requestedSessionIds = [];
  orderStatuses = [];
  orderCols = "";
  lineCols = [];
  lineOrFilters = [];
  requestedCartStatuses = [];
  roundSessions = null;
  realRounds = false;
  roundOnly = [];
  roundsAnswer = new Map([
    ["sess-dinein", { ordinals: new Map([[BATCH, 1]]), seen: new Set([BATCH]) }],
  ]);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/board — the code column: a dine-in bag never reaches it, and no name ever does", () => {
  it("resolves modes by the orders' SESSION ids, not their order ids", async () => {
    // Named explicitly because everything else here would survive the substitution: asking for
    // `o.id` returns no modes, and under the allowlist that empties the board.
    await GET(req());
    expect([...requestedSessionIds].sort()).toEqual(["sess-dinein", "sess-togo"]);
  });

  it("publishes the to-go code and drops the dine-in one", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as Body;
    expect(body.orders).toEqual([{ code: "AA0001", status: "ready" }]);
  });

  it("publishes a code and a status ONLY — no name, no wait, no time; the name is never even read (m9 decision 19, critic B4; `board/orders-read-the-name`)", async () => {
    const body = (await (await GET(req())).json()) as Body;
    expect(Object.keys(body.orders![0]!).sort()).toEqual(["code", "status"]);
    expect(orderCols).not.toContain("customer_name");
    expect(orderCols).not.toContain("picked_up");
  });

  it("narrows the orders read with ONE `or` parameter — the window AND the fire gate, explicitly (#360, question a)", async () => {
    // lck/board/route-chains-two-ors — two `or=` params whose conjunction nothing here proves.
    await GET(req());
    expect(orderOrs).toHaveLength(1);
    expect(orderOrs[0]).toMatch(
      /^and\(or\(pickup_slot\.gte\.[^,]+,and\(pickup_slot\.is\.null,created_at\.gte\.[^)]+\)\),or\(togo_status\.eq\.ready,fire_at\.is\.null,fire_at\.lte\.[^)]+\)\)$/,
    );
  });

  it("never reads a COLLECTED bag — a handed-over code drawn as a Ready pass would be the room's one call for food someone holds (`board/collected-bags-on-the-wall`)", async () => {
    orders = [order(TOGO, "sess-togo", "picked_up")];
    const body = (await (await GET(req())).json()) as Body;
    expect([...orderStatuses].sort()).toEqual(["preparing", "ready"]);
    expect(body.orders).toEqual([]);
  });

  it("refuses rather than publishing when the mode read FAILS", async () => {
    sessionsError = { message: "connection terminated" };
    const res = await GET(req());
    expect(res.status).toBe(503);
    const body = (await res.json()) as Body;
    // Nothing is published — not the to-go code, and not the tables.
    expect(body.orders).toBeUndefined();
    expect(body.tables).toBeUndefined();
    // `unavailable` is the reason the board's client folds to retry-and-hold (board-poll.ts).
    expect(body.reason).toBe("unavailable");
  });

  it("publishes scan-and-go as well as pickup — both are board modes", async () => {
    orders = [order(TOGO, "sess-togo")];
    sessions = [
      {
        id: "sess-togo",
        mode: "scango",
        status: "active",
        table_number: null,
        expires_at: LIVE,
        qr_code: "SESS-TOGO",
      },
    ];
    const body = (await (await GET(req())).json()) as Body;
    expect(body.orders!.map((o) => o.code)).toEqual(["AA0001"]);
  });

  it("a mode this code has never heard of is NOT published", async () => {
    orders = [order(TOGO, "sess-togo")];
    sessions = [
      {
        id: "sess-togo",
        mode: "counter-seated",
        status: "active",
        table_number: null,
        expires_at: LIVE,
        qr_code: "SESS-TOGO",
      },
    ];
    const body = (await (await GET(req())).json()) as Body;
    expect(body.orders).toEqual([]);
  });

  it("a session whose row is MISSING from a successful read is not published", async () => {
    sessions = [
      {
        id: "sess-togo",
        mode: "pickup",
        status: "active",
        table_number: null,
        expires_at: LIVE,
        qr_code: "SESS-TOGO",
      },
    ];
    orders = [order(DINEIN, "sess-dinein")];
    const body = (await (await GET(req())).json()) as Body;
    expect(body.orders).toEqual([]);
  });

  it("a null session_id is unknowable, not to-go", async () => {
    orders = [order(TOGO, null)];
    sessions = [];
    const body = (await (await GET(req())).json()) as Body;
    expect(body.orders).toEqual([]);
  });

  it("Ready as the read ranked it (newest readiness first), then Preparing next up first — no instant crosses to the wall", async () => {
    orders = [
      {
        ...order(`${TOGO.slice(0, -4)}0p02`, "sess-togo", "preparing"),
        created_at: new Date(NOW - 2 * MIN).toISOString(),
      },
      {
        ...order(`${TOGO.slice(0, -4)}0r01`, "sess-togo"),
        togo_ready_at: new Date(NOW - 9 * MIN).toISOString(),
      },
      {
        ...order(`${TOGO.slice(0, -4)}0p01`, "sess-togo", "preparing"),
        created_at: new Date(NOW - 7 * MIN).toISOString(),
      },
      {
        ...order(`${TOGO.slice(0, -4)}0r02`, "sess-togo"),
        togo_ready_at: new Date(NOW - 1 * MIN).toISOString(),
      },
    ];
    const body = (await (await GET(req())).json()) as Body;
    expect(body.orders).toEqual([
      { code: "AA0R02", status: "ready" },
      { code: "AA0R01", status: "ready" },
      { code: "AA0P01", status: "preparing" },
      { code: "AA0P02", status: "preparing" },
    ]);
  });
});

/** A dine-in Send at table 4: one line on the board's read, its cart, the session in `beforeEach`. */
function seedCookingTable(over: Partial<LineRow> = {}) {
  lines = [
    {
      id: "line-1",
      cart_id: "cart-1",
      menu_item_id: DISH,
      name: "Mohinga",
      state: "in_progress",
      fire_at: new Date(NOW - 6 * MIN).toISOString(),
      fire_batch: BATCH,
      fulfillment: "dinein",
      created_at: new Date(NOW - 7 * MIN).toISOString(),
      bumped_at: null,
      ...over,
    },
  ];
  carts = [{ id: "cart-1", session_id: "sess-dinein", status: "open" }];
}

describe("GET /api/board — PD9: the kitchen half publishes a table number and dish names only", () => {
  it("a dish name rides only inside its table, with no quantity — the reversal of the shipped pin (K32(b))", async () => {
    seedCookingTable();
    menu = [{ id: DISH, name_my: "မုန့်ဟင်းခါး" }];
    const body = (await (await GET(req())).json()) as Body;
    expect(body.tables).toEqual([
      {
        table: 4,
        out: false,
        rounds: [
          {
            n: 1,
            next: false,
            dishes: [{ name: "Mohinga", nameMy: "မုန့်ဟင်းခါး", stage: "cooking", togo: false }],
          },
        ],
      },
    ]);
  });

  it("reads only the columns the wall draws — never a quantity, a modifier or a note", async () => {
    seedCookingTable();
    await GET(req());
    expect(lineCols.length).toBeGreaterThan(0);
    for (const cols of lineCols) {
      expect(cols.split(",")).not.toContain("qty");
      expect(cols).not.toMatch(/modifier|notes|comped|price/);
    }
  });

  it("asks the line read for the KDS's own window and the linger, cut from the DATABASE clock", async () => {
    await GET(req());
    // The KDS's M2 arm: a fired line with NO fire time created inside the day floor is on the wall
    // exactly when it is on the KDS.
    const window = lineOrFilters.find((f) => f.includes("fire_at.is.null"));
    expect(window).toMatch(
      /^fire_at\.gte\.([0-9TZ:.-]+),and\(fire_at\.is\.null,created_at\.gte\.\1\)$/,
    );
    const floor = /fire_at\.gte\.([0-9TZ:.-]+)/.exec(window!)![1]!;
    expect(NOW - Date.parse(floor)).toBe(24 * 60 * 60 * 1000);
    const live = lineOrFilters.find((f) => f.includes("state.in"));
    expect(live).toMatch(/state\.in\.\(fired,in_progress\)/);
    const linger = /bumped_at\.gte\.([0-9TZ:.-]+)/.exec(live ?? "");
    expect(NOW - Date.parse(linger![1]!)).toBe(5 * 60 * 1000);
  });

  it("asks for carts the kitchen may legitimately cook — open or paid, never cancelled", async () => {
    seedCookingTable();
    await GET(req());
    expect([...requestedCartStatuses].sort()).toEqual(["open", "paid"]);
  });

  it("a Send stays WHOLE: a dish served long before its round finished is still on the pass (Codex round 4 on #319; `board/send-read-ignored`)", async () => {
    seedCookingTable();
    sendExtra = [
      {
        ...lines[0]!,
        id: "line-0",
        name: "Tea",
        menu_item_id: "tea",
        state: "served",
        bumped_at: new Date(NOW - 40 * MIN).toISOString(),
      },
    ];
    const body = (await (await GET(req())).json()) as Body;
    expect(body.tables![0]!.rounds[0]!.dishes.map((d) => [d.name, d.stage])).toEqual([
      ["Mohinga", "cooking"],
      ["Tea", "served"],
    ]);
  });

  it("the round number is the KDS's own read, asked for the wall's DINE-IN sessions only (`board/round-read-for-every-session`)", async () => {
    seedCookingTable();
    lines.push({
      ...lines[0]!,
      id: "line-p",
      cart_id: "cart-p",
      fire_batch: null,
      fulfillment: "togo",
    });
    carts.push({ id: "cart-p", session_id: "sess-togo", status: "paid" });
    roundsAnswer = new Map([
      ["sess-dinein", { ordinals: new Map([[BATCH, 2]]), seen: new Set([BATCH]) }],
    ]);
    const body = (await (await GET(req())).json()) as Body;
    expect(roundSessions).toEqual(["sess-dinein"]);
    expect(body.tables![0]!.rounds[0]!.n).toBe(2);
  });

  it("a round read that does not answer leaves the round unnumbered — the tables still publish", async () => {
    seedCookingTable();
    roundsAnswer = null;
    const body = (await (await GET(req())).json()) as Body;
    expect(body.tables![0]!.rounds[0]).toMatchObject({ n: null, next: false });
  });

  it("the wall numbers a table's rounds by the batch's MARK, through the KDS's own read: settlement food is never a round, and the next Send stays round 2 (PD5b, ported; m5 §H.4; `board/settlement-food-numbered-on-the-wall`)", async () => {
    // The KDS's case "settlement food — its batch marked by the drain — is never a numbered round"
    // (`kitchen-queue-counter.test.ts`), drawn on the wall with the REAL round read: table 4 sent round
    // 1 (B1, served long ago — only the round read still sees it), paid at the counter with drafts,
    // which `mms_fire_pending_food` fired under a version-8 batch (BS), then sent again on a new cart
    // (BATCH). The read reads no order (this file's `qr_orders` fake refuses a `cart_id` filter, so
    // an orders leg throws and every round reads unknown): the mark alone decides.
    realRounds = true;
    const B1 = "11111111-1111-4111-8111-111111110001";
    const BS = "55555555-5555-8555-9555-555555550005";
    seedCookingTable();
    lines.unshift({
      ...lines[0]!,
      id: "line-s",
      cart_id: "cart-paid",
      name: "Tea",
      menu_item_id: "tea",
      fire_batch: BS,
      fire_at: new Date(NOW - 43 * MIN).toISOString(),
      created_at: new Date(NOW - 50 * MIN).toISOString(),
    });
    roundOnly = [
      {
        ...lines[1]!,
        id: "line-r1",
        cart_id: "cart-paid",
        fire_batch: B1,
        state: "served",
        fire_at: new Date(NOW - 50 * MIN).toISOString(),
        created_at: new Date(NOW - 51 * MIN).toISOString(),
        bumped_at: new Date(NOW - 45 * MIN).toISOString(),
      },
    ];
    carts.push({ id: "cart-paid", session_id: "sess-dinein", status: "paid" });
    const body = (await (await GET(req())).json()) as Body;
    expect(roundSessions).toEqual(["sess-dinein"]);
    expect(
      body.tables!.map((t) => [t.table, t.rounds.map((r) => [r.dishes[0]!.name, r.n, r.next])]),
    ).toEqual([
      [
        4,
        [
          ["Tea", null, false],
          ["Mohinga", 2, false],
        ],
      ],
    ]);
  });

  it("no kitchen food at all asks the round read for no session, and publishes an empty kitchen", async () => {
    const body = (await (await GET(req())).json()) as Body;
    expect(roundSessions).toEqual([]);
    expect(body.tables).toEqual([]);
    expect(body.kitchenIdle).toBe(true);
  });

  it('"All clear" is the WHOLE kitchen: a paid pickup bag on the wok draws no table and is NOT idle (the blind pass on #336; `board/idle-read-ignored`)', async () => {
    seedCookingTable({ cart_id: "cart-togo", fulfillment: "togo" });
    carts = [{ id: "cart-togo", session_id: "sess-togo", status: "paid" }];
    const body = (await (await GET(req())).json()) as Body;
    expect(body.tables).toEqual([]);
    expect(body.kitchenIdle).toBe(false);
  });

  it("a COUNTER order sent before it was paid keeps the kitchen busy — the one session read carries the code that tells it apart (`board/session-read-drops-the-code`)", async () => {
    // A staff counter order (`reg-` on a pickup session) cooks on an OPEN cart; without its code the
    // rule cannot tell it from a diner's unpaid pickup, which never cooks.
    sessions.push({
      id: "sess-reg",
      mode: "pickup",
      status: "active",
      table_number: null,
      expires_at: LIVE,
      qr_code: "reg-ab12",
    });
    seedCookingTable({ cart_id: "cart-reg", fulfillment: "togo", fire_batch: null });
    carts = [{ id: "cart-reg", session_id: "sess-reg", status: "open" }];
    const body = (await (await GET(req())).json()) as Body;
    expect(body.tables).toEqual([]);
    expect(body.kitchenIdle).toBe(false);
  });

  it("a bag bumped inside Mom's undo window on the DATABASE clock is still cooking — never 'All clear' over a dish she can take back (the last blind pass on #336; `board/idle-on-the-app-clock`)", async () => {
    // Two seconds before `mms_now`: on the database clock the Undo is still live. The process clock
    // is far past it — a rule read on THAT clock calls the bag served and the kitchen idle.
    seedCookingTable({
      cart_id: "cart-togo",
      fulfillment: "togo",
      fire_batch: null,
      state: "served",
      bumped_at: new Date(NOW - 2_000).toISOString(),
    });
    carts = [{ id: "cart-togo", session_id: "sess-togo", status: "paid" }];
    expect(Date.now() - NOW).toBeGreaterThan(60_000);
    const body = (await (await GET(req())).json()) as Body;
    expect(body.tables).toEqual([]);
    expect(body.kitchenIdle).toBe(false);
  });

  it("a line a MERGE moved between the line read and the cart read never reads 'All clear' — its cart reads cancelled, but the food cooks on the target (Codex round 1 on #336)", async () => {
    // Table 4's Send names the source cart; the merge cancelled it and moved the line to `cart-1`,
    // which no line of the first read named, so no read asked about it.
    seedCookingTable({ cart_id: "cart-src" });
    carts = [
      { id: "cart-src", session_id: "sess-dinein", status: "cancelled" },
      { id: "cart-1", session_id: "sess-dinein", status: "open" },
    ];
    movedTo = { "line-1": "cart-1" };
    const merged = (await (await GET(req())).json()) as Body;
    expect(merged.tables).toEqual([]);
    expect(merged.kitchenIdle).toBe(false);
    expect(rereadIds).toEqual(["line-1"]);
    // A CLEAR leaves the line on its cancelled cart: the re-read finds it there, and "All clear" holds.
    movedTo = {};
    const cleared = (await (await GET(req())).json()) as Body;
    expect(cleared.kitchenIdle).toBe(true);
    // A re-read that does not answer cannot tell the two apart: silence, and the tables still publish.
    rereadError = { message: "connection terminated" };
    const blind = (await (await GET(req())).json()) as Body;
    expect(blind.kitchenIdle).toBe(false);
    expect(blind.tables).toEqual([]);
  });

  it("'All clear' is judged on the FIRST line read: a merge landing before the Send completion read re-fetches the line on a cart no read asked about, and a re-read finding it there is not a clear (Codex round 1 on #336; `board/idle-reads-the-completed-sends`)", async () => {
    seedCookingTable();
    sendExtra = [{ ...lines[0]!, cart_id: "cart-tgt" }];
    movedTo = { "line-1": "cart-tgt" };
    const body = (await (await GET(req())).json()) as Body;
    expect(body.kitchenIdle).toBe(false);
  });

  it("the re-read is asked only when it can change the answer — never while a bag is on the wok, never with nothing unplaced (`board/idle-rereads-every-poll`)", async () => {
    seedCookingTable({ cart_id: "cart-togo", fulfillment: "togo" });
    carts = [{ id: "cart-togo", session_id: "sess-togo", status: "paid" }];
    lines.push({ ...lines[0]!, id: "line-cleared", cart_id: "cart-gone", fire_batch: null });
    expect(((await (await GET(req())).json()) as Body).kitchenIdle).toBe(false);
    expect(rereadIds).toBeNull();
    seedCookingTable();
    expect(((await (await GET(req())).json()) as Body).kitchenIdle).toBe(false);
    expect(rereadIds).toBeNull();
  });

  it("a failed KITCHEN read is null, never an empty kitchen — and the code column still publishes (`board/tables-on-a-failed-kitchen-read`)", async () => {
    for (const fail of ["lines", "carts", "send"] as const) {
      seedCookingTable();
      linesError = fail === "lines" ? { message: "connection terminated" } : null;
      cartsError = fail === "carts" ? { message: "connection terminated" } : null;
      sendError = fail === "send" ? { message: "connection terminated" } : null;
      const res = await GET(req());
      expect(res.status).toBe(200);
      const body = (await res.json()) as Body;
      expect(body.tables, fail).toBeNull();
      // …and so is "All clear": a kitchen that cannot be read is never idle (`board/idle-on-a-failed-read`).
      expect(body.kitchenIdle, fail).toBeNull();
      expect(body.orders!.map((o) => o.code)).toEqual(["AA0001"]);
    }
  });

  it("a SATURATED kitchen read is null too — a partial wall is a table missing a round (m9 decision 23; `board/saturated-line-read-publishes-tables`, `board/saturated-send-read-publishes-tables`)", async () => {
    seedCookingTable();
    // Only ONE of the 500 carries a batch, so the Send-completion read answers one row and is NOT
    // saturated: the line read's own cap is the only guard that can refuse this wall (a fixture where
    // every line shared the batch re-read all 500 and let the send guard mask this one).
    lines = Array.from({ length: 500 }, (_, i) => ({
      ...lines[0]!,
      id: `l${i}`,
      fire_batch: i === 0 ? BATCH : null,
    }));
    expect(((await (await GET(req())).json()) as Body).tables).toBeNull();
    seedCookingTable();
    sendExtra = Array.from({ length: 500 }, (_, i) => ({
      ...lines[0]!,
      id: `s${i}`,
      state: "served",
    }));
    expect(((await (await GET(req())).json()) as Body).tables).toBeNull();
  });

  it("a failed NAME read degrades to English — a label can never withhold a table", async () => {
    seedCookingTable();
    menu = [{ id: DISH, name_my: "မုန့်ဟင်းခါး" }];
    menuError = { message: "connection terminated" };
    const body = (await (await GET(req())).json()) as Body;
    expect(body.tables![0]!.rounds[0]!.dishes[0]).toMatchObject({ name: "Mohinga", nameMy: null });
  });

  it("a kitchen with no table to draw asks NO catalog for a name — a pickup-only or scan-and-go-only wok never costs the wall a menu or grocery read every 5 s (Codex round 1 on #336)", async () => {
    // A pickup bag on the wok: its dish is a menu uuid, its Burmese would be a menu read.
    seedCookingTable({ cart_id: "cart-togo", fulfillment: "togo" });
    carts = [{ id: "cart-togo", session_id: "sess-togo", status: "paid" }];
    const pickup = (await (await GET(req())).json()) as Body;
    expect(pickup.tables).toEqual([]);
    expect(catalogReads).toEqual([]);
    // A scan-and-go cart: its lines carry a grocery barcode, its Burmese a grocery read.
    sessions.push({
      id: "sess-sg",
      mode: "scango",
      status: "active",
      table_number: null,
      expires_at: LIVE,
      qr_code: "SESS-SG",
    });
    seedCookingTable({
      cart_id: "cart-sg",
      menu_item_id: "0123456789012",
      name: "Rice 5lb",
      fulfillment: "grocery",
      state: "fired",
      fire_batch: null,
    });
    carts = [{ id: "cart-sg", session_id: "sess-sg", status: "paid" }];
    catalogReads = [];
    const scango = (await (await GET(req())).json()) as Body;
    expect(scango.tables).toEqual([]);
    expect(catalogReads).toEqual([]);
  });

  it("the name read asks for the dishes the wall DRAWS, never the rest of the wok (Codex round 1 on #336; `board/names-for-every-line`)", async () => {
    seedCookingTable();
    lines.push({
      ...lines[0]!,
      id: "line-p",
      cart_id: "cart-p",
      menu_item_id: "dddddddd-dddd-4ddd-8ddd-dddddddd0004",
      fire_batch: null,
      fulfillment: "togo",
    });
    carts.push({ id: "cart-p", session_id: "sess-togo", status: "paid" });
    menu = [{ id: DISH, name_my: "မုန့်ဟင်းခါး" }];
    const body = (await (await GET(req())).json()) as Body;
    expect(body.tables![0]!.rounds[0]!.dishes[0]!.nameMy).toBe("မုန့်ဟင်းခါး");
    expect(catalogReads).toEqual([{ table: "menu_items", ids: [DISH] }]);
  });

  it("publishes NO identifier, quantity, modifier, note or time of any kind, anywhere in the response", async () => {
    // The boundary as a property over the whole serialized body. Every id the route READS has a
    // value that could not appear by coincidence, and none may come back out.
    seedCookingTable({ cart_id: "cart-SECRET", id: "line-SECRET", menu_item_id: "item-SECRET" });
    carts = [{ id: "cart-SECRET", session_id: "sess-dinein", status: "open" }];
    const res = await GET(req());
    const json = (await res.json()) as Record<string, unknown>;
    const body = JSON.stringify({ ...json, serverNow: undefined });
    for (const leak of [
      "cart-SECRET",
      "line-SECRET",
      "item-SECRET",
      "sess-dinein",
      BATCH,
      DINEIN,
      TOGO,
    ])
      expect(body).not.toContain(leak);
    const keys = new Set<string>();
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object")
        for (const [k, x] of Object.entries(v)) {
          keys.add(k);
          walk(x);
        }
    };
    walk(json);
    for (const k of [
      "qty",
      "quantity",
      "modifiers",
      "notes",
      "name_my",
      "customer_name",
      "readyMinutes",
      "readyAt",
      "id",
    ])
      expect(keys.has(k), k).toBe(false);
    // …while what it IS for did come through, so this is not passing on an empty payload.
    expect(body).toContain('"table":4');
    expect(body).toContain('"name":"Mohinga"');
  });
});

describe("K32 (A4·1) — a full orders read keeps the newest readiness and publishes", () => {
  it("a read that came back FULL keeps the NEWEST bags and publishes — never a 503, never an empty wall", async () => {
    // Untapped `ready` rows accumulate (picked_up is a manual tap), so the cap WILL be reached on a
    // busy day. MUTATION: oldest-first → the bag that just came up is the one dropped.
    orders = Array.from({ length: 61 }, (_, i) => ({
      ...order(`${TOGO.slice(0, -4)}${String(i).padStart(4, "0")}`, "sess-togo"),
      created_at: new Date(NOW - (61 - i) * MIN).toISOString(),
    }));
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as Body;
    expect(body.orders?.length).toBe(60);
    const codes = body.orders?.map((o) => o.code) ?? [];
    expect(codes).toContain("AA0060"); // the newest bag is on the wall, first
    expect(codes[0]).toBe("AA0060");
    expect(codes).not.toContain("AA0000"); // the oldest untapped one fell off
  });

  it("a scheduled bag placed early and readied LAST survives the cap — the wall ranks by readiness, not creation (Codex round 1 on A4·1)", async () => {
    const afternoon = Array.from({ length: 60 }, (_, i) => ({
      ...order(`${TOGO.slice(0, -4)}${String(i).padStart(4, "0")}`, "sess-togo"),
      created_at: new Date(NOW - (120 - i) * MIN).toISOString(),
      togo_ready_at: new Date(NOW - (119 - i) * MIN).toISOString(),
    }));
    const scheduled = {
      ...order(`${TOGO.slice(0, -4)}5chd`, "sess-togo"),
      created_at: new Date(NOW - 6 * 60 * MIN).toISOString(),
      togo_ready_at: new Date(NOW - 30_000).toISOString(),
    };
    orders = [scheduled, ...afternoon];
    const body = (await (await GET(req())).json()) as Body;
    expect(body.orders?.length).toBe(60);
    const codes = body.orders?.map((o) => o.code) ?? [];
    expect(codes).toContain("AA5CHD");
    expect(codes).not.toContain("AA0000");
  });

  it("one under the cap is a complete read and publishes every row", async () => {
    orders = Array.from({ length: 59 }, (_, i) => ({
      ...order(`${TOGO.slice(0, -4)}${String(i).padStart(4, "0")}`, "sess-togo"),
      created_at: new Date(NOW - (59 - i) * MIN).toISOString(),
    }));
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(((await res.json()) as Body).orders?.length).toBe(59);
  });
});

describe("the lifecycle audit — which codes the wall may publish", () => {
  const PAST = new Date(NOW - 5 * MIN).toISOString();
  const AHEAD = new Date(NOW + 30 * MIN).toISOString();
  const pickupOnly = () => {
    sessions = sessions.filter((x) => x.id === "sess-togo");
  };

  it("a READY bag is on the wall even before its scheduled fire time — Cook now moves only the lines", async () => {
    // lck/board-orders/ready-gated-on-fire-at — the bag cooked early and bagged sat off the wall,
    // uncalled, until the original fire time.
    pickupOnly();
    orders = [{ ...order(TOGO, "sess-togo"), fire_at: AHEAD }];
    expect(((await (await GET(req())).json()) as Body).orders).toEqual([
      { code: "AA0001", status: "ready" },
    ]);
    // …while a PREPARING bag still held for its schedule stays off, and one past it is on
    orders = [{ ...order(TOGO, "sess-togo", "preparing"), fire_at: AHEAD }];
    expect(((await (await GET(req())).json()) as Body).orders).toEqual([]);
    orders = [{ ...order(TOGO, "sess-togo", "preparing"), fire_at: PAST }];
    expect(((await (await GET(req())).json()) as Body).orders).toEqual([
      { code: "AA0001", status: "preparing" },
    ]);
  });

  it("the window is on the DUE time: a pickup booked days ahead is called the day it comes up", async () => {
    // lck/board-orders/window-on-creation — a `created_at` floor dropped a next-day pickup.
    pickupOnly();
    orders = [
      {
        ...order(TOGO, "sess-togo"),
        created_at: new Date(NOW - 30 * 60 * MIN).toISOString(),
        pickup_slot: new Date(NOW - 10 * MIN).toISOString(),
      },
    ];
    expect(((await (await GET(req())).json()) as Body).orders?.map((o) => o.code)).toEqual([
      "AA0001",
    ]);
    // …and an ASAP order placed before the window is not
    orders = [
      { ...order(TOGO, "sess-togo"), created_at: new Date(NOW - 30 * 60 * MIN).toISOString() },
    ];
    expect(((await (await GET(req())).json()) as Body).orders).toEqual([]);
  });

  it("a REFUNDED order is nobody's bag — never on the wall", async () => {
    // lck/board-orders/refunded-on-the-wall — the read had no status filter.
    pickupOnly();
    orders = [{ ...order(TOGO, "sess-togo"), status: "refunded" }];
    const body = (await (await GET(req())).json()) as Body;
    expect(body.orders).toEqual([]);
    expect(orderEqs).toContainEqual(["status", "paid"]);
  });

  it("a pure scan-and-go basket is never called Ready — one food line makes it a bag", async () => {
    // lck/board-orders/basket-on-the-wall — the shopper holds the goods; the wall's Ready is the
    // room's one call for food.
    pickupOnly();
    orders = [order(TOGO, "sess-togo")];
    orderItems = [{ order_id: TOGO, fulfillment: "grocery" }];
    expect(((await (await GET(req())).json()) as Body).orders).toEqual([]);
    orderItems = [
      { order_id: TOGO, fulfillment: "grocery" },
      { order_id: TOGO, fulfillment: "togo" },
    ];
    expect(((await (await GET(req())).json()) as Body).orders?.length).toBe(1);
    // a basket whose only food was comped is a bag too (the expo's own lines, M250)
    orderItems = [{ order_id: TOGO, fulfillment: "grocery" }];
    compLines = [{ cart_id: `cart-${TOGO}`, state: "served", fulfillment: "togo" }];
    expect(((await (await GET(req())).json()) as Body).orders?.length).toBe(1);
  });

  it("an unreadable bag read publishes every code, as before — a real bag is never left uncalled", async () => {
    pickupOnly();
    orders = [order(TOGO, "sess-togo")];
    orderItems = [{ order_id: TOGO, fulfillment: "grocery" }];
    orderItemsError = { message: "down" };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(((await (await GET(req())).json()) as Body).orders?.length).toBe(1);
    spy.mockRestore();
  });
});
