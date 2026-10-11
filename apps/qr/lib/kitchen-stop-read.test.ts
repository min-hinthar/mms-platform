import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * M270 (1) — THE stop read (`lib/kitchen-stop-read.ts`), against a fake that EVALUATES its filters,
 * its order and its cap the way PostgREST would (the cap applied by the SQL, before anything the
 * TypeScript does after it): which records it takes, how a record becomes cards (one per Send, in the
 * slot its ticket stood in), and that every failed leg answers `null` — never a partial card. Each
 * case is the one an `m270/stop-read/*` mutant turns red.
 */
vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;
let tables: Record<string, Row[]> = {};
/** A leg to fail: the table read whose error the case injects. */
let failing: Set<string> = new Set();
/** #347 — fail only the Nth read of a table (1-based): one chunk of the dishes read. */
let failNth: { table: string; n: number } | null = null;
/** #347 — every IN-list's length, per table, in call order (the request-size bound). */
let inSizes: Record<string, number[]> = {};
let reads: Record<string, number> = {};

function query(name: string) {
  reads[name] = (reads[name] ?? 0) + 1;
  const nth = reads[name];
  const filters: ((r: Row) => boolean)[] = [];
  let order: { col: string; asc: boolean } | null = null;
  let lim: number | null = null;
  const api: Record<string, unknown> = {
    select: () => api,
    is(col: string, v: unknown) {
      if (v !== null) throw new Error(`fake: unsupported is(${col}, ${String(v)})`);
      filters.push((r) => r[col] === null);
      return api;
    },
    // The wire form `col=neq.{}` — an ARRAY column compared with the empty array.
    filter(col: string, op: string, v: unknown) {
      if (op !== "neq" || v !== "{}")
        throw new Error(`fake: unsupported filter ${op}.${String(v)}`);
      filters.push((r) => !(Array.isArray(r[col]) && (r[col] as unknown[]).length === 0));
      return api;
    },
    in(col: string, vs: unknown[]) {
      (inSizes[name] ??= []).push(vs.length);
      filters.push((r) => vs.includes(r[col]));
      return api;
    },
    order(col: string, opts?: { ascending?: boolean }) {
      order = { col, asc: opts?.ascending !== false };
      return api;
    },
    limit(n: number) {
      lim = n;
      return api;
    },
    then(res: (v: unknown) => unknown) {
      if (failing.has(name) || (failNth?.table === name && failNth.n === nth))
        return Promise.resolve({ data: null, error: { message: "boom" } }).then(res);
      let rows = (tables[name] ?? []).filter((r) => filters.every((f) => f(r)));
      if (order !== null) {
        const { col, asc } = order;
        rows = rows
          .slice()
          .sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1));
      }
      rows = rows.slice(0, lim ?? Infinity);
      return Promise.resolve({ data: rows, error: null }).then(res);
    },
  };
  return api;
}
const db = { from: (name: string) => query(name) } as never;

const {
  readKitchenStops,
  settleKitchenStops,
  shapeKitchenStops,
  stopLineBudget,
  chunkIds,
  STOP_CLEAR_CAP,
  STOP_ID_CHUNK,
  STOP_LINE_CAP,
} = await import("./kitchen-stop-read");

afterEach(() => {
  tables = {};
  failing = new Set();
  failNth = null;
  inSizes = {};
  reads = {};
  vi.useRealTimers();
});

const at = (min: number) => new Date(Date.UTC(2026, 9, 11, 18, 0) + min * 60_000).toISOString();
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const clear = (n: number, lineIds: string[], o: Row = {}): Row => ({
  id: `clear-${n}`,
  session_id: "sess-3",
  stop_line_ids: lineIds,
  created_at: at(n),
  stop_acknowledged_at: null,
  ...o,
});
const line = (id: string, o: Row = {}): Row => ({
  id,
  name: "Mohinga",
  qty: 1,
  modifiers: [],
  modifier_option_ids: null,
  menu_item_id: uuid(900),
  cart_id: "cart-3",
  fire_batch: "batch-1",
  fire_at: at(-10),
  created_at: at(-11),
  ...o,
});
const session = { id: "sess-3", qr_code: "t3-sticker", table_number: 3 };

describe("which records the read takes", () => {
  it("an open record with a stopped line draws its card, named by the table off the tent", async () => {
    tables = {
      qr_table_clears: [clear(1, ["l1"])],
      qr_cart_items: [line("l1")],
      table_sessions: [session],
    };
    const stops = await readKitchenStops(db);
    expect(stops).toHaveLength(1);
    expect(stops![0]).toMatchObject({
      clearId: "clear-1",
      tableNumber: 3,
      label: "t3-sticker",
      lines: [{ id: "l1", name: "Mohinga", qty: 1 }],
    });
  });

  it("an acknowledged record is never read again", async () => {
    tables = {
      qr_table_clears: [clear(1, ["l1"], { stop_acknowledged_at: at(2) })],
      qr_cart_items: [line("l1")],
      table_sessions: [session],
    };
    // MUTATION m270/stop-read/ack-filter-dropped: Mom's Got it would never retire the card.
    expect(await readKitchenStops(db)).toEqual([]);
  });

  it("free clears (nothing stopped) never crowd the cap — the empty-array refusal is the SQL's", async () => {
    // A busy evening of paid tables cleared AFTER the one walkout: every free clear writes a record
    // with no stopped line, and nothing ever acknowledges it.
    const free = Array.from({ length: STOP_CLEAR_CAP + 6 }, (_, i) => clear(100 + i, []));
    tables = {
      qr_table_clears: [clear(1, ["l1"]), ...free],
      qr_cart_items: [line("l1")],
      table_sessions: [session],
    };
    // MUTATION m270/stop-read/empty-filter-dropped: the newest 24 are all free clears, the
    // TypeScript belt drops them AFTER the cap, and the board says nothing over a real stop.
    const stops = await readKitchenStops(db);
    expect(stops?.map((s) => s.clearId)).toEqual(["clear-1"]);
  });

  it("newest first, capped: past the cap the NEWEST open records are drawn — a fresh clear is never crowded out", async () => {
    const n = STOP_CLEAR_CAP + 1;
    tables = {
      qr_table_clears: Array.from({ length: n }, (_, i) => clear(i, [`l${i}`])),
      qr_cart_items: Array.from({ length: n }, (_, i) => line(`l${i}`, { fire_batch: `b${i}` })),
      table_sessions: [session],
    };
    const ids = (await readKitchenStops(db))!.map((s) => s.clearId);
    // MUTATION m270/stop-read/cap-widened: one more record than the cap.
    expect(ids).toHaveLength(STOP_CLEAR_CAP);
    // MUTATION m270/stop-read/oldest-first: the newest clear — the table that JUST left — is the one
    // the cap drops.
    expect(ids).toContain(`clear-${n - 1}`);
    expect(ids).not.toContain("clear-0");
  });
});

describe("a record becomes cards: one per Send, in the slot its ticket stood in", () => {
  it("two Sends of one cleared table are two cards, each with its own dishes and its own stamp", async () => {
    tables = {
      qr_table_clears: [clear(1, ["l1", "l2", "l3"])],
      qr_cart_items: [
        line("l1", { fire_batch: "batch-2", fire_at: at(-2) }),
        line("l2", { fire_batch: "batch-1", fire_at: at(-9), name: "Shan Noodles" }),
        line("l3", { fire_batch: "batch-2", fire_at: at(-2), qty: 2 }),
      ],
      table_sessions: [session],
    };
    const stops = (await readKitchenStops(db))!;
    // MUTATION m270/stop-read/one-card-per-clear: round 1 and round 2 collapse into one card, and the
    // slot round 2's ticket stood in empties under the cook's hand.
    expect(stops.map((s) => s.key)).toEqual(["stop|clear-1|b|batch-1", "stop|clear-1|b|batch-2"]);
    expect(stops[0]!.lines.map((l) => l.id)).toEqual(["l2"]);
    expect(stops[1]!.lines.map((l) => [l.id, l.qty])).toEqual([
      ["l1", 1],
      ["l3", 2],
    ]);
    // MUTATION m270/stop-read/slot-from-clear-time: stamped with the CLEAR's time, every stop card
    // would land at the tail of the board instead of where its ticket stood.
    expect(stops.map((s) => s.firedAt)).toEqual([at(-9), at(-2)]);
  });

  it("the dish's Burmese comes through the one loader; a failed name read renders English, never null", async () => {
    tables = {
      qr_table_clears: [clear(1, ["l1"])],
      qr_cart_items: [line("l1")],
      table_sessions: [session],
      menu_items: [{ id: uuid(900), name_my: "မုန့်ဟင်းခါး" }],
    };
    expect((await readKitchenStops(db))![0]!.lines[0]!.nameMy).toBe("မုန့်ဟင်းခါး");
    failing = new Set(["menu_items"]);
    const stops = await readKitchenStops(db);
    expect(stops).toHaveLength(1);
    expect(stops![0]!.lines[0]!.nameMy).toBeNull();
  });

  it("a record whose dishes are all missing still draws ONE card, so it can be acknowledged", () => {
    const stops = shapeKitchenStops(
      [
        {
          id: "clear-9",
          session_id: "sess-3",
          stop_line_ids: ["gone"],
          created_at: at(4),
        },
      ],
      [],
      [session],
      { nameMyByRef: new Map(), optionNameMy: new Map() },
    );
    expect(stops).toEqual([
      {
        key: "stop|clear-9|none",
        clearId: "clear-9",
        tableNumber: 3,
        label: "t3-sticker",
        firedAt: at(4),
        lines: [],
      },
    ]);
  });

  it("a record whose table cannot be read is never drawn under a name it does not have", () => {
    expect(
      shapeKitchenStops(
        [{ id: "c", session_id: "nowhere", stop_line_ids: ["l1"], created_at: at(1) }],
        [line("l1") as never],
        [session],
        { nameMyByRef: new Map(), optionNameMy: new Map() },
      ),
    ).toEqual([]);
  });
});

describe("it fails SOFT — any failed leg is null, never a partial card", () => {
  const base = () => ({
    qr_table_clears: [clear(1, ["l1"])],
    qr_cart_items: [line("l1")],
    table_sessions: [session],
  });
  it.each([
    ["the records", "qr_table_clears"],
    // MUTATION m270/stop-read/tables-error-swallowed: a card with no table to name.
    ["the tables", "table_sessions"],
    // MUTATION m270/stop-read/dishes-error-swallowed: a card that under-says what to stop.
    ["the dishes", "qr_cart_items"],
  ])("%s read failing answers null", async (_, name) => {
    tables = base();
    failing = new Set([name]);
    expect(await readKitchenStops(db)).toBeNull();
  });

  it("the budget: a read that is late or rejects answers null — the queue is never held for it", async () => {
    vi.useFakeTimers();
    let late: unknown = "still waiting";
    void settleKitchenStops(new Promise(() => {}), 2_500).then((v) => {
      late = v;
    });
    await vi.advanceTimersByTimeAsync(2_499);
    expect(late).toBe("still waiting");
    await vi.advanceTimersByTimeAsync(1);
    // MUTATION m270/stop-read/budget-dropped: one slow read would hold the whole kitchen poll.
    expect(late).toBeNull();
    expect(await settleKitchenStops(Promise.reject(new Error("x")), 2_500)).toBeNull();
    const card = { key: "k" } as never;
    expect(await settleKitchenStops(Promise.resolve([card]), 2_500)).toEqual([card]);
  });
});

describe("the line budget — whole records only, newest first", () => {
  const c = (id: string, n: number) => ({
    id,
    session_id: "s",
    created_at: at(0),
    stop_line_ids: Array.from({ length: n }, (_, i) => `${id}-${i}`),
  });
  it("takes records whole until the next one would not fit, then stops (the older ones wait)", () => {
    const out = stopLineBudget([c("new", 3), c("mid", 4), c("old", 1)], 7);
    expect(out.clears.map((x) => x.id)).toEqual(["new", "mid"]);
    expect(out.ids).toHaveLength(7);
    // MUTATION m270/stop-read/budget-skips-ahead: an older record that fits jumps the one that does
    // not — the read stops at the first record that does not fit, whole records only.
    const tight = stopLineBudget([c("new", 3), c("mid", 4), c("old", 1)], 6);
    expect(tight.clears.map((x) => x.id)).toEqual(["new"]);
    expect(tight.ids).toEqual(["new-0", "new-1", "new-2"]);
  });
  it("#347 — one record larger than the cap on its own is taken alone, and WHOLE", () => {
    const out = stopLineBudget([c("huge", STOP_LINE_CAP + 5), c("next", 1)]);
    expect(out.clears.map((x) => x.id)).toEqual(["huge"]);
    // MUTATION m270/stop-read/oversized-truncated: drawn with 500 of its 505 dishes, and the one Got
    // it that retires the record retires the five nobody saw.
    expect(out.clears[0]!.stop_line_ids).toHaveLength(STOP_LINE_CAP + 5);
    expect(out.ids).toHaveLength(STOP_LINE_CAP + 5);
  });
  it("chunkIds: in order, at most the chunk each, nothing lost", () => {
    const ids = Array.from({ length: 205 }, (_, i) => `i${i}`);
    const chunks = chunkIds(ids, 100);
    expect(chunks.map((x) => x.length)).toEqual([100, 100, 5]);
    expect(chunks.flat()).toEqual(ids);
    expect(chunkIds([], 100)).toEqual([]);
  });
});

describe("#347 — each dish's station, the tickets' rule", () => {
  it("a dish's station is its menu category's (drinks → drinks; none or unknown → the wok)", async () => {
    tables = {
      qr_table_clears: [clear(1, ["l1", "l2", "l3"])],
      qr_cart_items: [
        line("l1", { menu_item_id: uuid(901) }),
        line("l2", { menu_item_id: uuid(902) }),
        line("l3", { menu_item_id: uuid(903) }),
      ],
      table_sessions: [session],
      menu_items: [
        { id: uuid(901), name_my: null, menu_categories: { slug: "drinks" } },
        { id: uuid(902), name_my: null, menu_categories: { slug: "curries" } },
        { id: uuid(903), name_my: null, menu_categories: null },
      ],
    };
    const lines = (await readKitchenStops(db))![0]!.lines;
    // MUTATION m270/stop-read/station-from-default: every stopped dish reads as the wok's, and the
    // drinks screen never sees its own stop.
    expect(lines.map((l) => [l.id, l.station])).toEqual([
      ["l1", "drinks"],
      ["l2", "wok"],
      ["l3", "wok"],
    ]);
  });

  it("a dish the menu read does not find, or a failed menu read: the station is UNKNOWN, never a guess", async () => {
    tables = {
      qr_table_clears: [clear(1, ["l1"])],
      qr_cart_items: [line("l1", { menu_item_id: uuid(904) })],
      table_sessions: [session],
      menu_items: [],
    };
    // MUTATION m270/stop-read/unknown-station-as-wok: a dish nobody could place would show only on
    // the wok's screen — hidden from the station actually cooking it.
    expect((await readKitchenStops(db))![0]!.lines[0]!.station).toBeNull();
    tables.menu_items = [{ id: uuid(904), name_my: null, menu_categories: { slug: "drinks" } }];
    failing = new Set(["menu_items"]);
    const stops = await readKitchenStops(db);
    // ADVISORY: still drawn — English, and shown on every station.
    expect(stops).toHaveLength(1);
    expect(stops![0]!.lines[0]!.station).toBeNull();
  });
});

describe("#347 — the dishes read is chunked; a record is never cut", () => {
  const big = (n: number) => Array.from({ length: n }, (_, i) => `big-${i}`);
  it("a 505-dish record is read WHOLE, in IN-lists of at most STOP_ID_CHUNK ids", async () => {
    const ids = big(STOP_LINE_CAP + 5);
    tables = {
      qr_table_clears: [clear(1, ids)],
      qr_cart_items: ids.map((id) => line(id)),
      table_sessions: [session],
    };
    const stops = (await readKitchenStops(db))!;
    expect(stops.flatMap((s) => s.lines)).toHaveLength(STOP_LINE_CAP + 5);
    // MUTATION m270/stop-read/chunk-unbounded: one ~19 KB query string.
    expect(STOP_ID_CHUNK).toBe(100);
    expect(inSizes.qr_cart_items!.every((n) => n <= STOP_ID_CHUNK)).toBe(true);
    expect(inSizes.qr_cart_items).toEqual([100, 100, 100, 100, 100, 5]);
  });

  it("ANY chunk failing answers null — never a card missing that chunk's dishes", async () => {
    const ids = big(250);
    tables = {
      qr_table_clears: [clear(1, ids)],
      qr_cart_items: ids.map((id) => line(id)),
      table_sessions: [session],
    };
    failNth = { table: "qr_cart_items", n: 3 };
    // MUTATION m270/stop-read/chunk-error-swallowed: only the first chunk's error is read, and a card
    // draws 200 of its 250 dishes.
    expect(await readKitchenStops(db)).toBeNull();
  });
});
