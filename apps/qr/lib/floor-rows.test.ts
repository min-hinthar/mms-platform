import { describe, expect, it } from "vitest";
import {
  FLIP_GUARD_MS,
  createFlipGuard,
  floorRowKey,
  freeTapAllowed,
  mergeFloorRows,
  tableStrip,
} from "./floor-rows";
import type { FloorTable } from "./floor-types";
import type { RegisterQueueRow } from "./register-queue";

/**
 * A4·2 — the merge decides only where the two lists MEET; each list's own order is its own rule
 * (A1's sort on the floor, oldest-first on the queue), so the cases pin the seam and the
 * preservation, never a re-sort this module does not perform.
 */
const table = (
  id: string,
  counterRequestedAt: string | null,
  status: FloorTable["status"] = counterRequestedAt ? "counter" : "ordering",
): FloorTable => ({
  sessionId: id,
  label: id,
  tableNumber: 7,
  mode: "dinein",
  status,
  partySize: 2,
  hostName: null,
  itemCount: 1,
  runningSubtotalCents: 1200,
  paidTotalCents: null,
  refund: null,
  tab: "none",
  tabOverCeiling: false,
  counterRequestedAt,
  lastActivityAt: "2026-09-13T18:00:00Z",
  openedAt: "2026-09-13T17:00:00Z",
  kitchen: null,
});
const order = (id: string): RegisterQueueRow => ({
  sessionId: id,
  customerName: null,
  itemCount: 1,
  subtotalCents: 900,
  startedAt: "2026-09-13T18:00:00Z",
  source: "register",
});
const keys = (rows: ReturnType<typeof mergeFloorRows>) => rows.map(floorRowKey);

describe("mergeFloorRows — tables and counter orders as ONE list", () => {
  it("a table that asked to pay at the counter stays above the counter orders being built", () => {
    // MUTATION: put the counter orders first → a party waiting to leave drops beneath a walk-up
    // that has not ordered yet.
    const rows = mergeFloorRows([table("t-ask", "2026-09-13T17:50:00Z")], [order("reg-1")]);
    expect(keys(rows)).toEqual(["t-ask", "reg-1"]);
  });
  it("a stamped table that moved on to a card payment keeps its floor place — only status `counter` rises (Codex round 1)", () => {
    // The stamp outlives the ask: a table that asked, then started a fresh card or split payment,
    // keeps `counterRequestedAt` while `deriveFloorStatus` reports `paying` — and the floor's own
    // sort (A1) lifts only status `counter`. The first draft partitioned on the stamp and lifted
    // the paying table above the counter orders, where staff cannot settle it.
    const rows = mergeFloorRows(
      [
        table("t-paying", "2026-09-13T17:50:00Z", "paying"),
        table("t-ask", "2026-09-13T17:55:00Z"),
        table("t-open", null),
      ],
      [order("c1")],
    );
    expect(keys(rows)).toEqual(["t-ask", "c1", "t-paying", "t-open"]);
  });

  it("counter orders come before the tables that have not asked, in the queue's own order", () => {
    const rows = mergeFloorRows(
      [table("t-1", null), table("t-2", null)],
      [order("reg-old"), order("reg-new")],
    );
    expect(keys(rows)).toEqual(["reg-old", "reg-new", "t-1", "t-2"]);
  });
  it("preserves the floor's own order inside each group and never invents or drops a row", () => {
    const tables = [
      table("t-a", null),
      table("t-ask-1", "2026-09-13T17:00:00Z"),
      table("t-b", null),
      table("t-ask-2", "2026-09-13T17:30:00Z"),
    ];
    const rows = mergeFloorRows(tables, [order("reg-1")]);
    expect(keys(rows)).toEqual(["t-ask-1", "t-ask-2", "reg-1", "t-a", "t-b"]);
    expect(rows.filter((r) => r.kind === "table")).toHaveLength(4);
  });
  it("either side may be empty", () => {
    expect(keys(mergeFloorRows([], [order("reg-1")]))).toEqual(["reg-1"]);
    expect(keys(mergeFloorRows([table("t-1", null)], []))).toEqual(["t-1"]);
    expect(mergeFloorRows([], [])).toEqual([]);
  });
});

// ── Phase 2d · floor ──
/**
 * The strip is the room's MAP and its start: one tile per registered table, occupancy from the SAME
 * snapshot the cards read, so a tile and its card cannot disagree.
 */
describe("tableStrip — one tile per registered table, from the cards' own snapshot", () => {
  const at = (
    id: string,
    n: number | null,
    status: FloorTable["status"],
    last = "2026-09-13T18:00:00Z",
  ) => ({
    ...table(id, null, status),
    tableNumber: n,
    lastActivityAt: last,
  });

  it("tiles follow the REGISTRY, ascending — a live number outside it gets no tile, a free one gets a null", () => {
    // MUTATION: build the tiles from the live tables → tile 12 appears and the free tiles vanish.
    const strip = tableStrip([1, 2, 3, 7, 10], [at("s7", 7, "ordering"), at("s12", 12, "seated")]);
    expect(strip.map((t) => t.n)).toEqual([1, 2, 3, 7, 10]);
    expect(strip.find((t) => t.n === 7)?.table?.sessionId).toBe("s7");
    expect(strip.filter((t) => t.table !== null).map((t) => t.n)).toEqual([7]);
  });

  it("an unregistered sticker (no number) never takes a tile", () => {
    expect(tableStrip([1], [at("sx", null, "ordering")])).toEqual([{ n: 1, table: null }]);
  });

  it("two live sessions on one number: the tile opens the one that needs a person first (STRIP_RANK)", () => {
    // A seated session listed FIRST and a pay-at-counter ask second: the ask wins.
    // MUTATION: take the first match → the seated one.
    const strip = tableStrip([4], [at("seated", 4, "seated"), at("ask", 4, "counter")]);
    expect(strip[0]?.table?.sessionId).toBe("ask");
  });

  it("a rank tie goes to the latest activity", () => {
    const strip = tableStrip(
      [4],
      [
        at("old", 4, "ordering", "2026-09-13T17:00:00Z"),
        at("new", 4, "ordering", "2026-09-13T18:00:00Z"),
      ],
    );
    expect(strip[0]?.table?.sessionId).toBe("new");
  });
});

describe("freeTapAllowed — a tile that JUST turned free ignores the tap (the flip guard)", () => {
  it("600 ms: a tap inside the window is ignored, at the edge it goes, with no flip it always goes", () => {
    expect(FLIP_GUARD_MS).toBe(600);
    const t0 = 1_000_000;
    // MUTATION: always allow → the 599 ms tap mints a table the person was trying to OPEN.
    expect(freeTapAllowed(t0, t0 + 599)).toBe(false);
    expect(freeTapAllowed(t0, t0 + 600)).toBe(true);
    expect(freeTapAllowed(null, t0)).toBe(true);
  });
});

describe("createFlipGuard — the strip remembers which tiles JUST turned free", () => {
  const tile = (n: number, occupied: boolean) => ({
    n,
    table: occupied ? { ...table(`s${n}`, null), tableNumber: n } : null,
  });

  it("a tile that flipped occupied → free refuses a tap for 600 ms, then allows it", () => {
    let now = 10_000;
    const g = createFlipGuard(() => now);
    g.observe([tile(7, true), tile(8, false)]);
    now = 12_000;
    g.observe([tile(7, false), tile(8, false)]); // another tablet cleared 7
    now = 12_599;
    // MUTATION (floor-rows): a guard that never stamps the flip → the tap mints a table the person
    // was reaching to OPEN.
    expect(g.allows(7)).toBe(false);
    // A tile that was free all along was never flipped: it starts at once.
    expect(g.allows(8)).toBe(true);
    now = 12_600;
    expect(g.allows(7)).toBe(true);
  });

  it("first sight is not a flip, and a tile occupied again forgets its stamp", () => {
    let now = 0;
    const g = createFlipGuard(() => now);
    g.observe([tile(3, false)]);
    expect(g.allows(3)).toBe(true);
    g.observe([tile(3, true)]);
    now = 100;
    g.observe([tile(3, false)]);
    now = 200;
    expect(g.allows(3)).toBe(false);
    g.observe([tile(3, true)]);
    expect(g.allows(3)).toBe(true);
  });
});
