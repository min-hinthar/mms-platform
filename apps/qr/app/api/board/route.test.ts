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

vi.mock("@/lib/kitchen-round-read", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/kitchen-round-read")>()),
  readRounds: (_db: unknown, ids: readonly string[]) => {
    roundSessions = [...ids];
    return Promise.resolve(roundsAnswer);
  },
}));

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
          in: (col: string, values: unknown[]) => {
            if (col !== "togo_status") throw new Error(`unexpected qr_orders filter ${col}`);
            statuses = values;
            orderStatuses = values;
            return chain;
          },
          or: () => chain,
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
      if (table === "qr_cart_items") {
        let batches: unknown[] | null = null;
        let states: unknown[] | null = null;
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
            if (col === "fire_batch") batches = values;
            else if (col === "state") states = values;
            else throw new Error(`unexpected qr_cart_items filter ${col}`);
            return chain;
          },
          order: () => chain,
          limit: (n: number) => {
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
          in: () => Promise.resolve({ data: [], error: null }),
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

const order = (id: string, sessionId: string | null, status = "ready"): OrderRow => ({
  id,
  session_id: sessionId,
  togo_status: status,
  togo_ready_at: status === "ready" ? "2026-08-23T00:00:00.000Z" : null,
  created_at: "2026-08-23T00:00:00.000Z",
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
  requestedSessionIds = [];
  orderStatuses = [];
  orderCols = "";
  lineCols = [];
  lineOrFilters = [];
  requestedCartStatuses = [];
  roundSessions = null;
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
