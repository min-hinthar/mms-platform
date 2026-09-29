import { beforeEach, describe, expect, it, vi } from "vitest";
/**
 * Phase 2d · floor — THE FLOOR READ BEHIND THE STRIP AND THE KITCHEN ROW.
 *
 * `getFloorView` gained a lock gate (K14), three reads in its first round trip (the registry, the
 * kitchen's thresholds, the database clock), the kitchen columns on its open-cart line read, a
 * second read over the table's PAID carts, and a bound on both line reads. The fake below
 * EVALUATES `.eq()`, `.in()` and `.limit()` and answers `rpc("mms_now")`, so a read that drops a
 * filter, a column or a guard changes the OUTCOME here rather than a call transcript.
 *
 * The database clock is set in 2099 on purpose: a line that fired ten minutes before it is in the
 * kitchen on the DB clock and in the FUTURE on the app clock, so a read that times the fold on the
 * wrong clock skips it — and that stays true on any day this suite runs before then.
 */
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("./posthog-server", () => ({
  getPostHogClient: () => ({ capture() {}, flush: () => Promise.resolve() }),
}));
vi.mock("./authz", () => ({ AuthzError: class AuthzError extends Error {} }));
vi.mock("./staff", () => ({
  getStaffAuth: () =>
    Promise.resolve({
      kind: "staff",
      caller: { uid: "u", staffId: "st", role: "server", displayName: "S", email: null },
    }),
  requireStaff: () => Promise.resolve({}),
  staffGate: () => Promise.resolve({ ok: true, caller: {} }),
  STAFF_WRITE_OUTAGE: "outage",
}));
let locked = false;
vi.mock("./staff-lock", () => ({ isConsoleLocked: () => Promise.resolve(locked) }));
vi.mock("./pay-guard", () => ({
  isFresh: () => false,
  paymentInFlightReason: () => Promise.resolve(null),
}));
vi.mock("@mms/db/schemas", () => ({
  clearTableInput: { safeParse: (x: unknown) => ({ success: true, data: x }) },
  mergeTablesInput: { safeParse: (x: unknown) => ({ success: true, data: x }) },
}));
vi.mock("./totals", () => ({ getCartTotals: () => Promise.resolve(null) }));

type Row = Record<string, unknown>;
const DB_NOW = "2099-01-01T19:00:00.000Z";
const ago = (min: number) => new Date(Date.parse(DB_NOW) - min * 60_000).toISOString();

let rows: Record<string, Row[]> = {};
let failing = new Set<string>();
let dbNow: string | null = DB_NOW;

function tableApi(name: string) {
  const eqs: [string, unknown][] = [];
  const ins: [string, unknown[]][] = [];
  let cap: number | null = null;
  let select = "";
  const answer = (): Row[] => {
    // `readRegisterQueue` reads open carts joined to their session; this suite is about the room.
    if (name === "qr_carts" && select.includes("table_sessions!inner")) return [];
    const hit = (rows[name] ?? []).filter(
      (r) =>
        eqs.every(([c, v]) => !(c in r) || r[c] === v) &&
        ins.every(([c, vs]) => !(c in r) || vs.includes(r[c])),
    );
    // A column the read did not SELECT is not on the row it gets back — so a read that drops one
    // hands the fold an `undefined`, exactly as PostgREST would omit it.
    const cols = select.includes("(") ? null : select.split(",").map((c) => c.trim());
    const shaped = cols
      ? hit.map((r) => Object.fromEntries(cols.filter((c) => c in r).map((c) => [c, r[c]])))
      : hit;
    return cap === null ? shaped : shaped.slice(0, cap);
  };
  const api: Record<string, unknown> = {
    select(s: string) {
      select = s;
      return api;
    },
    eq(col: string, val: unknown) {
      eqs.push([col, val]);
      return api;
    },
    in(col: string, vals: unknown[]) {
      ins.push([col, vals]);
      return api;
    },
    limit(n: number) {
      cap = n;
      return api;
    },
    order: () => api,
    gt: () => api,
    not: () => api,
    or: () => api,
    is: () => api,
    maybeSingle() {
      if (failing.has(name)) return Promise.resolve({ data: null, error: { message: "down" } });
      return Promise.resolve({ data: answer()[0] ?? null, error: null });
    },
    then(resolve: (r: { data: Row[] | null; error: unknown }) => void) {
      if (failing.has(name)) return resolve({ data: null, error: { message: "down" } });
      resolve({ data: answer(), error: null });
    },
  };
  return api;
}
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (name: string) => tableApi(name),
    rpc: (fn: string) =>
      Promise.resolve(
        fn === "mms_now" && dbNow !== null
          ? { data: dbNow, error: null }
          : { data: null, error: { message: "no clock" } },
      ),
  }),
}));

const { getFloorView } = await import("./floor");
const { DEFAULT_KDS_THRESHOLDS } = await import("./kds-urgency");

const S7 = "s-7";
const OPEN = "c-open";
const PAID = "c-paid";
const line = (over: Row): Row => ({
  id: `l-${Math.random()}`,
  cart_id: OPEN,
  qty: 1,
  unit_price_cents: 1000,
  created_at: ago(30),
  state: "draft",
  comped: false,
  fulfillment: "dinein",
  fire_at: null,
  bumped_at: null,
  by_seat: null,
  ...over,
});

beforeEach(() => {
  locked = false;
  failing = new Set();
  dbNow = DB_NOW;
  rows = {
    table_sessions: [
      {
        id: S7,
        qr_code: "3F9A2C1B",
        table_number: 7,
        mode: "dinein",
        status: "active",
        host_seat: null,
        created_at: ago(40),
      },
    ],
    qr_tables: [
      ...Array.from({ length: 10 }, (_, i) => ({ table_number: 10 - i, active: true })),
      { table_number: 11, active: false }, // a retired sticker
      { table_number: 7, active: true }, // a table with two stickers — still one tile
    ],
    qr_carts: [
      {
        id: OPEN,
        session_id: S7,
        status: "open",
        locked: false,
        locked_at: null,
        settle_at: null,
        counter_requested_at: null,
        created_at: ago(20),
        tab_type: "none",
      },
    ],
    qr_orders: [
      {
        session_id: S7,
        cart_id: PAID,
        total_cents: 2140,
        created_at: ago(25),
        status: "paid",
        refunded_cents: 0,
      },
    ],
    qr_cart_items: [
      // The table's FIRST round, paid for and still on the wok.
      line({ cart_id: PAID, state: "in_progress", fire_at: ago(10), unit_price_cents: 900 }),
      // The second round, open: one dine-in draft, one to-go draft.
      line({ created_at: ago(5) }),
      line({ fulfillment: "togo", created_at: ago(4) }),
    ],
    session_members: [],
    mms_tab_config: [],
    mms_kds_config: [],
  };
});

async function table7() {
  const r = await getFloorView();
  if (!r.ok) throw new Error(`expected ok, got ${r.reason}`);
  return { snap: r.snapshot, t: r.snapshot.tables.find((x) => x.sessionId === S7)! };
}

describe("getFloorView — the kitchen row reads the table's paid carts too", () => {
  it("a paid round still cooking counts as in the kitchen, on the DATABASE clock", async () => {
    // MUTATION: drop the paid-cart read → 0. MUTATION: time the fold on the app clock → the line
    // fired "in the future" and is skipped → 0.
    const { t } = await table7();
    expect(t.kitchen?.inKitchen).toBe(1);
    expect(t.kitchen?.oldestFireAt).toBe(ago(10));
  });

  it("the paid round never reaches the open cart's 'so far' figures", async () => {
    const { t } = await table7();
    expect(t.itemCount).toBe(2);
    expect(t.runningSubtotalCents).toBe(2000);
  });

  it("'not sent' counts the dine-in draft and not the to-go one", async () => {
    // MUTATION: drop `fulfillment` from the open-line select → the send rule sees no dine-in
    // fulfillment and the table owes nothing.
    const { t } = await table7();
    expect(t.kitchen?.notSent).toBe(1);
  });

  it("on a HOST table 'not sent' counts only what staff added", async () => {
    // One staff-added draft (by_seat null) and one diner's (the host's seat): the host's round is
    // theirs to send. MUTATION: drop `by_seat` from the select → both read as staff-added → 2.
    // MUTATION: ignore the session's host → 2.
    rows.table_sessions = [{ ...(rows.table_sessions![0] as Row), host_seat: "seat-h" }];
    rows.qr_cart_items = [line({}), line({ by_seat: "seat-h" })];
    const { t } = await table7();
    expect(t.kitchen?.notSent).toBe(1);
  });

  it("'Opened' is the session's own start, not its last activity", async () => {
    // MUTATION: openedAt = lastActivity → ago(4), the to-go draft's add.
    const { t } = await table7();
    expect(t.openedAt).toBe(ago(40));
    expect(t.lastActivityAt).not.toBe(t.openedAt);
  });

  it("serverNow is the database clock; a failed clock read falls back to the app's", async () => {
    // MUTATION: `const serverNow = nowIso` → an app-clock instant.
    expect((await table7()).snap.serverNow).toBe(DB_NOW);
    dbNow = null;
    const r = await getFloorView();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.snapshot.serverNow).not.toBe(DB_NOW);
  });
});

describe("getFloorView — the strip's registry and the kitchen's thresholds", () => {
  it("the registry is every ACTIVE number, ascending, once", async () => {
    // MUTATION: drop `.eq("active", true)` → 11 appears.
    const { snap } = await table7();
    expect(snap.registry).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("an unreadable registry is an OUTAGE — the strip is the only way to start a table", async () => {
    // MUTATION: ignore the error → an empty strip over a live room, with no way to start one.
    failing.add("qr_tables");
    expect(await getFloorView()).toEqual({ ok: false, reason: "outage" });
  });

  it("the no-sessions early return still carries the registry and the thresholds", async () => {
    // MUTATION: omit the registry there → an empty room at opening shows NO tiles to start from.
    rows.table_sessions = [];
    const r = await getFloorView();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.snapshot.registry).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(r.snapshot.thresholds).toEqual(DEFAULT_KDS_THRESHOLDS);
    expect(r.snapshot.serverNow).toBe(DB_NOW);
  });

  it("the configured thresholds reach the snapshot; an unreadable config is the defaults, never an outage", async () => {
    // MUTATION: hard-wire the defaults → 8/12. MUTATION: make the config error an outage.
    rows.mms_kds_config = [
      {
        dinein_amber_min: 5,
        dinein_red_min: 9,
        pickup_amber_min: 3,
        pickup_red_min: 6,
        rechime_sec: 60,
      },
    ];
    expect((await table7()).snap.thresholds).toEqual({
      dineinAmberMin: 5,
      dineinRedMin: 9,
      pickupAmberMin: 3,
      pickupRedMin: 6,
      rechimeSec: 60,
    });
    failing.add("mms_kds_config");
    expect((await table7()).snap.thresholds).toEqual(DEFAULT_KDS_THRESHOLDS);
  });
});

describe("getFloorView — guards", () => {
  it("a LOCKED console stops drawing the room (K14)", async () => {
    // MUTATION: delete the lock check → the live floor keeps drawing behind the lock screen.
    locked = true;
    expect(await getFloorView()).toEqual({ ok: false, reason: "locked" });
  });

  it("an open-cart line read that comes back AT its cap is an outage, never a partial room", async () => {
    // MUTATION: ignore the saturation → a truncated fold misstates the kitchen and the total.
    rows.qr_cart_items = Array.from({ length: 900 }, () => line({}));
    expect(await getFloorView()).toEqual({ ok: false, reason: "outage" });
  });

  it("a paid-cart line read that comes back AT its cap is an outage too", async () => {
    rows.qr_cart_items = Array.from({ length: 900 }, () =>
      line({ cart_id: PAID, state: "served", fire_at: ago(50), bumped_at: ago(45) }),
    );
    expect(await getFloorView()).toEqual({ ok: false, reason: "outage" });
  });

  it("one line under the cap is an ordinary read", async () => {
    rows.qr_cart_items = Array.from({ length: 899 }, () => line({}));
    const { t } = await table7();
    expect(t.itemCount).toBe(899);
  });
});
