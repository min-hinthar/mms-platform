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
/** Called after each page of the open-cart line read, with its 1-based page number. */
let betweenPages: (page: number) => void = () => {};
let openPages = 0;

/** One PostgREST filter term — `col.op.value`, or an `and(…)` of terms. The value may be quoted. */
type Term = { col: string; op: string; val: string } | { and: Term[] };
/** Split on the commas at THIS level — never inside `and(…)` or a quoted value. */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quoted = false;
  let cur = "";
  for (const ch of s) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === "(") depth++;
    else if (!quoted && ch === ")") depth--;
    if (ch === "," && depth === 0 && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}
function parseTerm(t: string): Term {
  if (t.startsWith("and(") && t.endsWith(")")) return { and: parseOr(t.slice(4, -1)) };
  const m = /^([a-z_]+)\.(eq|gt|gte|lt|lte)\.(.+)$/.exec(t);
  // A shape this fake cannot evaluate is a loud failure, never a filter silently passed.
  if (!m) throw new Error(`fake or(): cannot evaluate "${t}"`);
  return { col: m[1]!, op: m[2]!, val: m[3]!.replace(/^"(.*)"$/, "$1") };
}
function parseOr(expr: string): Term[] {
  return splitTop(expr).map(parseTerm);
}
/** A timestamptz as an INSTANT in microseconds — the column's own precision, whatever offset
 *  notation it is written in — so the fake compares times the way the database does. A cursor that
 *  went through `Date` (milliseconds) is a DIFFERENT instant from the row it came from, here as
 *  there. `null` for anything that is not a timestamp. */
function instant(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(v);
  if (!m) return null;
  return Date.parse(`${m[1]}${m[3]}`) * 1000 + Number((m[2] ?? "").padEnd(6, "0"));
}
function cmp(a: unknown, b: unknown): number {
  const x = instant(a);
  const y = instant(b);
  if (x !== null && y !== null) return x < y ? -1 : x > y ? 1 : 0;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}
function holds(t: Term, r: Row): boolean {
  if ("and" in t) return t.and.every((x) => holds(x, r));
  const c = cmp(r[t.col], t.val);
  if (t.op === "eq") return c === 0;
  if (t.op === "gt") return c > 0;
  if (t.op === "gte") return c >= 0;
  if (t.op === "lt") return c < 0;
  return c <= 0;
}

function tableApi(name: string) {
  const eqs: [string, unknown][] = [];
  const ins: [string, unknown[]][] = [];
  // Phase 2d · review — `.gt()` and `.order()` are EVALUATED too: the open-cart line read walks
  // keyset pages, so a read that drops the seek or the order reads the same page twice, or an
  // unordered one, and the total it builds is wrong here rather than merely logged.
  const gts: [string, unknown][] = [];
  // Phase 2d · Codex round 2 · lines — the open-cart read now seeks on `(created_at, id)` under an
  // upper bound, so `.lte()`, a composite `.order()` and the keyset's `.or()` are EVALUATED too: a
  // read that drops the bound, the tie-break or either sort key reads a different set here.
  const ltes: [string, unknown][] = [];
  const ors: Term[][] = [];
  const orderBy: [string, boolean][] = [];
  let cap: number | null = null;
  let select = "";
  const answer = (): Row[] => {
    // `readRegisterQueue` reads open carts joined to their session; this suite is about the room.
    if (name === "qr_carts" && select.includes("table_sessions!inner")) return [];
    const hit = (rows[name] ?? []).filter(
      (r) =>
        eqs.every(([c, v]) => !(c in r) || r[c] === v) &&
        ins.every(([c, vs]) => !(c in r) || vs.includes(r[c])) &&
        gts.every(([c, v]) => !(c in r) || cmp(r[c], v) > 0) &&
        ltes.every(([c, v]) => !(c in r) || cmp(r[c], v) <= 0) &&
        ors.every((any) => any.some((t) => holds(t, r))),
    );
    if (orderBy.length > 0)
      hit.sort((a, b) => {
        for (const [col, asc] of orderBy) {
          const c = cmp(a[col], b[col]);
          if (c !== 0) return asc ? c : -c;
        }
        return 0;
      });
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
    order(col: string, opts?: { ascending?: boolean }) {
      orderBy.push([col, opts?.ascending !== false]);
      return api;
    },
    gt(col: string, val: unknown) {
      gts.push([col, val]);
      return api;
    },
    lte(col: string, val: unknown) {
      ltes.push([col, val]);
      return api;
    },
    not: () => api,
    // The register queue's `.or()` rides its JOINED session (`referencedTable`) and that read is
    // answered empty above; every other `.or()` is parsed and evaluated.
    or(expr: string, opts?: { referencedTable?: string }) {
      if (!opts?.referencedTable) ors.push(parseOr(expr));
      return api;
    },
    is: () => api,
    maybeSingle() {
      if (failing.has(name)) return Promise.resolve({ data: null, error: { message: "down" } });
      return Promise.resolve({ data: answer()[0] ?? null, error: null });
    },
    then(resolve: (r: { data: Row[] | null; error: unknown }) => void) {
      if (failing.has(name)) return resolve({ data: null, error: { message: "down" } });
      const got = answer();
      // A write landing BETWEEN two pages of the open-cart read (the open read is the one that asks
      // for `unit_price_cents`; the paid read does not).
      if (name === "qr_cart_items" && select.includes("unit_price_cents"))
        betweenPages(++openPages);
      resolve({ data: got, error: null });
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
  betweenPages = () => {};
  openPages = 0;
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

  it("food just out carries its bump's key — the line id and its stamp, from BOTH reads", async () => {
    // Phase 2d · Codex round 1 · ready — the floor's cue is keyed to the bump, never the count.
    // MUTATION: drop `id` from the paid-cart select → the paid round's key has no line in it.
    rows.qr_cart_items = [
      line({ id: "l-paid", cart_id: PAID, state: "served", fire_at: ago(20), bumped_at: ago(2) }),
      line({ id: "l-open", state: "served", fire_at: ago(10), bumped_at: ago(1) }),
    ];
    const { t } = await table7();
    expect(t.kitchen?.up).toBe(2);
    expect([...(t.kitchen?.upKeys ?? [])].sort()).toEqual([`l-open@${ago(1)}`, `l-paid@${ago(2)}`]);
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

  it("one line under the cap is an ordinary read", async () => {
    rows.qr_cart_items = Array.from({ length: 899 }, () => line({}));
    const { t } = await table7();
    expect(t.itemCount).toBe(899);
  });
});

// ── Phase 2d · review (floor #6) — a full line read degrades, it never takes the room down ──
describe("getFloorView — a line read at its cap", () => {
  // At 900 rows a read cannot tell "exactly this many" from "we stopped counting", and it used to
  // answer `outage` for the WHOLE room: the strip, every card and every table start gone because
  // one table had a long night. Now: the OPEN carts' lines — which carry the money on the cards —
  // are read WHOLE in keyset pages, and the PAID carts' kitchen read, when full, makes the kitchen
  // picture honestly unknown while everything else keeps working.
  const pad = (n: number, i: number) =>
    `l-${String(n).padStart(2, "0")}-${String(i).padStart(5, "0")}`;

  it("an open-cart read past one page is read WHOLE — the card's count and total are never partial", async () => {
    // MUTATION: one page only → the 900-row page saturates and the room is an outage. MUTATION:
    // drop the keyset seek → page two is page one again, until the ceiling → an outage.
    // Inserted in DESCENDING id order, so a read that forgets the order walks a page boundary that
    // is not the keyset's and reads rows twice (MUTATION: drop the order → 1,799). Every line
    // shares ONE `created_at` (a round sent in one transaction), so a seek on the time alone stops
    // at the first boundary (Phase 2d · Codex round 2 · lines — MUTATION: drop the `id` tie-break →
    // 900).
    rows.qr_cart_items = Array.from({ length: 950 }, (_, i) => line({ id: pad(0, 949 - i) }));
    const { snap, t } = await table7();
    expect(t.itemCount).toBe(950);
    expect(t.runningSubtotalCents).toBe(950 * 1000);
    expect(snap.kitchenUnknown).toBe(false);
  });

  // ── Phase 2d · Codex round 2 · lines ── the pages are separate requests, each its own snapshot,
  // so the read has to say WHICH room it drew. `created_at` comes back at the column's own precision
  // (microseconds, `+00:00`), and the fixture is written that way on purpose.
  const T0_US = (Date.parse(DB_NOW) - 1000) * 1000;
  const stamp = (us: number) => {
    const total = T0_US + us;
    const secs = new Date(Math.floor(total / 1e6) * 1000).toISOString().slice(0, 19);
    return `${secs}.${String(total % 1e6).padStart(6, "0")}+00:00`;
  };

  it("a line added BETWEEN two pages is never skipped while one added beside it is counted — the room is the one at the poll's own clock", async () => {
    // A random uuid is no position in time: a line added between pages landed below the id cursor
    // or above it by chance, so the read counted one mid-read line and skipped the other (951, and
    // a last activity AFTER the clock the poll reports) — a room that never existed. Both lines
    // here began after that clock, so both are the NEXT poll's. MUTATION: drop the bound → 952.
    // 950 lines one microsecond apart inside ONE millisecond, their ids FALLING as they get newer:
    // id order is not time order (MUTATION: order by id alone → rows read twice), and a cursor
    // rounded through `Date` is not the row it came from (MUTATION → the millisecond re-read until
    // the ceiling).
    rows.qr_cart_items = Array.from({ length: 950 }, (_, i) =>
      line({ id: pad(3, 949 - i), created_at: stamp(i) }),
    );
    betweenPages = (page) => {
      if (page !== 1) return;
      rows.qr_cart_items!.push(
        line({ id: "l-00-00000", created_at: stamp(2_000_000) }), // below every id cursor
        line({ id: "l-99-99999", created_at: stamp(3_000_000) }), // above it, and added later
      );
    };
    const { snap, t } = await table7();
    expect(t.itemCount).toBe(950);
    expect(t.runningSubtotalCents).toBe(950 * 1000);
    // Nothing drawn is newer than the clock the poll reports (the id read: stamp(3_000_000)).
    expect(Date.parse(t.lastActivityAt)).toBeLessThanOrEqual(Date.parse(DB_NOW));
    expect(snap.serverNow).toBe(DB_NOW);
  });

  it("an unreadable database clock never bounds the lines on the app's — the room is still read", async () => {
    // The fallback `serverNow` is the APP clock, and the lines here are stamped on the database's
    // (2099). MUTATION: bound the read on `serverNow` → every line is "after" it and the table reads
    // empty.
    dbNow = null;
    const { t } = await table7();
    expect(t.itemCount).toBe(2);
    expect(t.runningSubtotalCents).toBe(2000);
  });

  it("an open-cart read past its page ceiling is an outage — a card's money is never a partial sum", async () => {
    // MUTATION: ignore the ceiling → a truncated total is drawn as the table's.
    rows.qr_cart_items = Array.from({ length: 900 * 5 }, (_, i) => line({ id: pad(1, i) }));
    expect(await getFloorView()).toEqual({ ok: false, reason: "outage" });
  });

  it("a paid-cart read at its cap keeps the room — tables, registry, money — and says the kitchen is unknown", async () => {
    // MUTATION: make the saturation an outage again → the strip, the cards and every start vanish.
    // MUTATION: fold anyway → a partial kitchen count drawn as the table's.
    rows.qr_cart_items = [
      line({ created_at: ago(5) }),
      ...Array.from({ length: 900 }, (_, i) =>
        line({
          id: pad(2, i),
          cart_id: PAID,
          state: "served",
          fire_at: ago(50),
          bumped_at: ago(45),
        }),
      ),
    ];
    const { snap, t } = await table7();
    expect(snap.kitchenUnknown).toBe(true);
    expect(t.kitchen).toBeNull();
    expect(t.itemCount).toBe(1);
    expect(t.runningSubtotalCents).toBe(1000);
    expect(snap.registry).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("an ordinary read says the kitchen is known", async () => {
    const { snap, t } = await table7();
    expect(snap.kitchenUnknown).toBe(false);
    expect(t.kitchen).not.toBeNull();
  });
});
