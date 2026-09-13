import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clockLabel,
  readServedToday,
  SERVED_RAIL_CAP,
  settleServedRail,
  shapeServedLines,
  type ServedRow,
  type ServedSessionRow,
} from "./served-today";

/**
 * K31 — the served rail, falsified twice: the READ by what it asks (every predicate recorded, since a
 * pass-through mock returns the fixture whatever the query said), and the SHAPE by value.
 */
const CART_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CART_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SESS_T6 = "66666666-6666-4666-8666-666666666666";
const SESS_PU = "77777777-7777-4777-8777-777777777777";
const DISH = "11111111-1111-4111-8111-111111111111";
const OPT = "33333333-3333-4333-8333-333333333333";
const ORDER = "99999999-9999-4999-8999-99999999abcdef";
const FLOOR = "2026-09-13T07:00:00.000Z";
const TZ = "America/Los_Angeles";

const T6: ServedSessionRow = { id: SESS_T6, qr_code: "T6", table_number: 6, mode: "dinein" };
const PU: ServedSessionRow = { id: SESS_PU, qr_code: "P-12", table_number: null, mode: "pickup" };

const row = (over: Partial<ServedRow> & Pick<ServedRow, "id" | "bumped_at">): ServedRow => ({
  name: "Mohinga",
  qty: 1,
  state: "served",
  modifiers: [],
  modifier_option_ids: null,
  cart_id: CART_A,
  fulfillment: "dinein",
  menu_item_id: DISH,
  ...over,
});

const names = {
  nameMyByRef: new Map<string, string | null>([[DISH, "မုန့်ဟင်းခါး"]]),
  optionNameMy: new Map<string, string | null>([[OPT, "အစပ်"]]),
};
const ctx = () => ({
  cartById: new Map([
    [CART_A, { id: CART_A, session_id: SESS_T6 }],
    [CART_B, { id: CART_B, session_id: SESS_PU }],
  ]),
  sessById: new Map([
    [SESS_T6, T6],
    [SESS_PU, PU],
  ]),
  orderByCart: new Map([[CART_B, ORDER]]),
  names,
});

describe("shapeServedLines — newest first, labelled like the live ticket", () => {
  it("carries the Burmese pair through the loader's maps and the dine-in table by number", () => {
    const [l] = shapeServedLines(
      [
        row({
          id: "l1",
          bumped_at: "2026-09-13T18:00:00Z",
          modifiers: ["Extra spicy"],
          modifier_option_ids: [OPT],
        }),
      ],
      ctx(),
      TZ,
    );
    expect(l).toMatchObject({
      id: "l1",
      name: "Mohinga",
      nameMy: "မုန့်ဟင်းခါး",
      modifiers: ["Extra spicy"],
      modifiersMy: ["အစပ်"],
      channel: "dinein",
      label: "T6",
      tableNumber: 6,
      shortCode: null,
      bumpedAt: "2026-09-13T18:00:00Z",
      bumpedAtLabel: "11:00", // 18:00Z in PDT — a clock, Latin, in the service zone
    });
  });

  it("a line voided AFTER service still went out — carried, and marked (Codex round 2 on A4·1)", () => {
    const out = shapeServedLines(
      [
        row({ id: "kept", bumped_at: "2026-09-13T18:00:00Z" }),
        row({ id: "lost", bumped_at: "2026-09-13T18:05:00Z", state: "voided" }),
      ],
      ctx(),
      TZ,
    );
    expect(out.map((l) => [l.id, l.voided])).toEqual([
      ["lost", true],
      ["kept", false],
    ]);
  });

  it("orders by bump time, NEWEST first — the cook asks about the last thing that left", () => {
    // MUTATION: drop the sort (trust the read's order) → the fixture below is oldest-first and the
    // rail reads backwards; the SQL's ORDER BY is the read's business, the rule is stated here.
    const out = shapeServedLines(
      [
        row({ id: "old", bumped_at: "2026-09-13T17:00:00Z" }),
        row({ id: "new", bumped_at: "2026-09-13T19:00:00Z" }),
        row({ id: "mid", bumped_at: "2026-09-13T18:00:00Z" }),
      ],
      ctx(),
      TZ,
    );
    expect(out.map((l) => l.id)).toEqual(["new", "mid", "old"]);
  });

  it("a pickup line carries the order's short code, no table", () => {
    const [l] = shapeServedLines(
      [row({ id: "p", bumped_at: "2026-09-13T18:00:00Z", cart_id: CART_B, fulfillment: "togo" })],
      ctx(),
      TZ,
    );
    expect(l).toMatchObject({
      channel: "pickup",
      label: "P-12",
      tableNumber: null,
      shortCode: "ABCDEF",
      fulfillment: "togo",
    });
  });

  it("a row whose cart or session cannot be resolved is dropped, never shown unlabelled", () => {
    const c = ctx();
    c.cartById.delete(CART_B);
    const out = shapeServedLines(
      [
        row({ id: "orphan", bumped_at: "2026-09-13T18:00:00Z", cart_id: CART_B }),
        row({ id: "ok", bumped_at: "2026-09-13T17:00:00Z" }),
      ],
      c,
      TZ,
    );
    expect(out.map((l) => l.id)).toEqual(["ok"]);
  });
});

// ── the read ──────────────────────────────────────────────────────────────────────────────────
type Q = {
  table: string;
  select: unknown[];
  eq: [string, unknown][];
  not: [string, string, unknown][];
  gte: [string, unknown][];
  in: [string, unknown[]][];
  order: [string, unknown][];
  limit: number[];
};
let queries: Q[] = [];
let itemRows: unknown[] | null = [];
/** The `count: "exact"` the rows read carries — the day's total from the SAME statement. */
let itemCount: number | null = null;
let itemsError: { message: string } | null = null;
let cartsError: { message: string } | null = null;
let sessionsError: { message: string } | null = null;

function builder(table: string) {
  const q: Q = { table, select: [], eq: [], not: [], gte: [], in: [], order: [], limit: [] };
  queries.push(q);
  const answer = () => {
    if (table === "qr_cart_items")
      return Promise.resolve({
        data: itemsError ? null : itemRows,
        error: itemsError,
        count: itemsError ? null : itemCount,
      });
    if (table === "qr_carts")
      return Promise.resolve({
        data: cartsError ? null : [{ id: CART_A, session_id: SESS_T6 }],
        error: cartsError,
      });
    if (table === "table_sessions")
      return Promise.resolve({ data: sessionsError ? null : [T6], error: sessionsError });
    if (table === "qr_orders") return Promise.resolve({ data: [], error: null });
    return Promise.resolve({ data: [], error: null });
  };
  // Every step records and returns the chain; the chain is a THENABLE, so `await` at any depth
  // (`.in()` alone, `.in().eq()`, `.limit()`) answers from the fixture — the query's shape is
  // asserted from the record, never from where the mock happened to stop chaining.
  const chain: Record<string, unknown> = {
    select: (_cols: string, opts?: unknown) => (q.select.push(opts ?? null), chain),
    eq: (c: string, v: unknown) => (q.eq.push([c, v]), chain),
    not: (c: string, op: string, v: unknown) => (q.not.push([c, op, v]), chain),
    gte: (c: string, v: unknown) => (q.gte.push([c, v]), chain),
    in: (c: string, v: unknown[]) => (q.in.push([c, v]), chain),
    order: (c: string, o: unknown) => (q.order.push([c, o]), chain),
    limit: (n: number) => (q.limit.push(n), chain),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      answer().then(resolve, reject),
  };
  return chain;
}
const db = { from: builder } as unknown as Parameters<typeof readServedToday>[0];
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  queries = [];
  itemRows = [];
  itemCount = null;
  itemsError = null;
  cartsError = null;
  sessionsError = null;
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

describe("readServedToday — the read asks exactly for today's served lines", () => {
  it("bumped rows — served, or VOIDED after service — since the CALLER's day floor, newest first, capped", async () => {
    // MUTATION: `state = fired` (the live queue's rows) or a dropped `gte` (all time) or a dropped
    // `order` / `limit` — each is a different rail: cooking food, last week's, or an unbounded read.
    // `served` alone (the first draft) made food that went out and was then written off as a cooked
    // loss VANISH from "what went out today" — `mms_void_line` flips the state and keeps the stamp;
    // only a recall clears `bumped_at`, and the stamp predicate still excludes those (Codex round 2).
    await readServedToday(db, FLOOR, TZ);
    const q = queries.find((x) => x.table === "qr_cart_items");
    expect(q?.eq).toEqual([]);
    expect(q?.in).toEqual([["state", ["served", "voided"]]]);
    expect(q?.not).toEqual([["bumped_at", "is", null]]);
    expect(q?.gte).toEqual([["bumped_at", FLOOR]]);
    expect(q?.order).toEqual([["bumped_at", { ascending: false }]]);
    expect(q?.limit).toEqual([SERVED_RAIL_CAP]);
    // The cap is a POLICY pinned here as a literal (the blind pass: an import-of-itself pins nothing).
    expect(SERVED_RAIL_CAP).toBe(40);
  });

  it("a read that came back FULL is reported as truncated — the board says 'the last N of {count}'", async () => {
    // Blind pass, CRITICAL 2. MUTATION: drop the `queueEmptiness` → a "today" heading over a list
    // missing the morning while the stat cell beside it counts every served line since midnight.
    itemRows = Array.from({ length: SERVED_RAIL_CAP }, (_, i) =>
      row({ id: `l${i}`, bumped_at: new Date(Date.parse(FLOOR) + i * 60_000).toISOString() }),
    );
    const out = await readServedToday(db, FLOOR, TZ);
    expect(out?.truncated).toBe(true);
    expect(out?.lines).toHaveLength(SERVED_RAIL_CAP);
    itemRows = itemRows.slice(1);
    expect((await readServedToday(db, FLOOR, TZ))?.truncated).toBe(false);
  });

  it("the day's total rides the rows read — one statement, one snapshot (Codex round 2 on A4·1)", async () => {
    // "Showing the last 40 of 39" was reachable: the stats rpc counted before the rail read, and a
    // bump between the two put the rail ahead of its own denominator. `count: "exact"` on the rows
    // read answers the total from the SAME statement, and `truncated` is that total against the cap
    // — no longer a full-page inference.
    itemRows = Array.from({ length: SERVED_RAIL_CAP }, (_, i) =>
      row({ id: `l${i}`, bumped_at: new Date(Date.parse(FLOOR) + i * 60_000).toISOString() }),
    );
    itemCount = 57;
    const out = await readServedToday(db, FLOOR, TZ);
    const q = queries.find((x) => x.table === "qr_cart_items");
    expect(q?.select).toEqual([{ count: "exact" }]);
    expect(out?.total).toBe(57);
    expect(out?.truncated).toBe(true);
    itemCount = SERVED_RAIL_CAP; // a full page that IS the whole day
    expect(await readServedToday(db, FLOOR, TZ)).toMatchObject({
      total: SERVED_RAIL_CAP,
      truncated: false,
    });
    itemCount = null; // no count header — the page-full inference stands in, and the total is unknown
    expect(await readServedToday(db, FLOOR, TZ)).toMatchObject({ total: null, truncated: true });
  });

  it("labels a pickup by its SETTLED order — paid or refunded, by cart (Codex round 1 on A4·1)", async () => {
    // A fully refunded pickup keeps its served lines: `mms_apply_refund_reconcile` flips
    // `qr_orders.status` to `refunded` and touches no cart item, so a `paid`-only read stopped
    // resolving the code printed on the guest's order the moment money went back. Both settled
    // statuses resolve; `refunded` is never dropped.
    itemRows = [row({ id: "l1", bumped_at: "2026-09-13T18:00:00Z" })];
    await readServedToday(db, FLOOR, TZ);
    const q = queries.find((x) => x.table === "qr_orders");
    expect(q?.in).toEqual([
      ["cart_id", [CART_A]],
      ["status", ["paid", "refunded"]],
    ]);
    expect(q?.eq).toEqual([]);
  });

  it("an empty day asks nothing further and answers [] — an empty rail, not an unreadable one", async () => {
    const out = await readServedToday(db, FLOOR, TZ);
    expect(out).toEqual({ lines: [], truncated: false, total: null });
    expect(queries.map((q) => q.table)).toEqual(["qr_cart_items"]);
  });

  it("resolves carts of ANY status — a line served on a since-cleared table still went out", async () => {
    // MUTATION: `.in("status", ["open","paid"])` on the cart read → the cleared table's dishes vanish
    // from history and the cook is told they never went out.
    itemRows = [row({ id: "l1", bumped_at: "2026-09-13T18:00:00Z" })];
    const out = await readServedToday(db, FLOOR, TZ);
    const carts = queries.find((x) => x.table === "qr_carts");
    expect(carts?.eq).toEqual([]);
    expect(carts?.in).toEqual([["id", [CART_A]]]);
    expect(out?.lines.map((l) => l.label)).toEqual(["T6"]);
    expect(out?.truncated).toBe(false);
  });

  it("a failed line read is null and logged — the rail says so, never an empty history", async () => {
    // MUTATION: return [] on error → "Nothing served yet today" over a full day's service.
    itemsError = { message: "connection reset" };
    expect(await readServedToday(db, FLOOR, TZ)).toBeNull();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("a failed LABEL read is null too — a rail missing its labels would attribute food to no table", async () => {
    itemRows = [row({ id: "l1", bumped_at: "2026-09-13T18:00:00Z" })];
    sessionsError = { message: "boom" };
    expect(await readServedToday(db, FLOOR, TZ)).toBeNull();
    cartsError = { message: "boom" };
    sessionsError = null;
    expect(await readServedToday(db, FLOOR, TZ)).toBeNull();
  });
});

describe("clockLabel / settleServedRail — the rail's clock and its budget", () => {
  it("formats the bump as a 24h clock in the service zone, Latin digits", () => {
    expect(clockLabel("2026-09-13T18:00:00Z", "America/Los_Angeles")).toBe("11:00");
    expect(clockLabel("2026-09-13T18:05:00Z", "Asia/Yangon")).toBe("00:35");
  });
  it("answers the rail when it lands inside the budget", async () => {
    const rail = Promise.resolve({ lines: [], truncated: false, total: 0 });
    expect(await settleServedRail(rail, 50)).toEqual({ lines: [], truncated: false, total: 0 });
  });
  it("answers null — not a rejected queue, not a hung poll — when the rail overruns its budget", async () => {
    // MUTATION: await the rail unconditionally → three serial history hops gate the pass on every poll.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const slow = new Promise<{ lines: never[]; truncated: false; total: number }>((resolve) =>
      setTimeout(() => resolve({ lines: [], truncated: false, total: 0 }), 200),
    );
    expect(await settleServedRail(slow, 20)).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
  it("a rail that REJECTS is null, never a rejected queue", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await settleServedRail(Promise.reject(new Error("boom")), 50)).toBeNull();
    spy.mockRestore();
  });
});
