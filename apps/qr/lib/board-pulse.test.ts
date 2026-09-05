import { describe, expect, it } from "vitest";
import {
  PULSE_RAIL_MAX_ROWS,
  PULSE_RAIL_MIN_TICKETS,
  PULSE_READY_LINGER_MS,
  shapeBoardPulse,
  type PulseCartRow,
  type PulseLineRow,
  type PulseSessionRow,
} from "./board-pulse";

/**
 * P6 — the wall TV's kitchen pulse, and the boundary is the whole subject.
 *
 * Every assertion here is about WHAT REACHES A PUBLIC SCREEN, not about copy. Three classes:
 *
 *  1. **The allowlists.** The table strip is dine-in and nothing else, exactly as the orders half is
 *     takeout and nothing else. A mode this code has never heard of belongs off the wall — staff can
 *     see a missing row; nobody can see a row that should not be there.
 *  2. **The exposure floor.** The all-day rail and the table strip are safe apart and not together:
 *     at one live ticket the rail IS that table's order. Asserted in BOTH directions, because a
 *     floor that never opens is not a floor, it is a disabled feature.
 *  3. **Derived, never invented.** `ready` is `bumped_at` inside a bounded window and nothing else;
 *     `cooking` is a live line state and nothing else. A table with neither is absent.
 *
 * The fixtures separate the rules NUMERICALLY wherever a rule is about a boundary — a served line
 * one millisecond either side of the linger, a ticket count one either side of the floor — so a
 * mutant that widens a comparison cannot pass on a fixture that never approaches it.
 */

const NOW = Date.parse("2026-09-05T19:00:00.000Z");
const MIN = 60_000;

const line = (over: Partial<PulseLineRow> & { cart_id: string }): PulseLineRow => ({
  menu_item_id: "11111111-1111-4111-8111-111111111111",
  name: "Mohinga",
  qty: 1,
  state: "fired",
  fire_at: new Date(NOW - 4 * MIN).toISOString(),
  bumped_at: null,
  ...over,
});

const cart = (id: string, sessionId: string): PulseCartRow => ({ id, session_id: sessionId });

const session = (over: Partial<PulseSessionRow> & { id: string }): PulseSessionRow => ({
  mode: "dinein",
  status: "active",
  table_number: 2,
  ...over,
});

function shape(opts: {
  lines: PulseLineRow[];
  carts: PulseCartRow[];
  sessions: PulseSessionRow[];
  nameMy?: [string, string | null][];
  nowMs?: number;
}) {
  return shapeBoardPulse({
    lines: opts.lines,
    cartById: new Map(opts.carts.map((c) => [c.id, c])),
    sessionById: new Map(opts.sessions.map((s) => [s.id, s])),
    nameMyByItem: new Map(opts.nameMy ?? []),
    nowMs: opts.nowMs ?? NOW,
  });
}

/** N distinct cooking tickets, each on its own cart + pickup session (no table strip involved). */
function tickets(n: number, dish = (i: number) => `Dish ${i}`) {
  return {
    lines: Array.from({ length: n }, (_, i) =>
      line({ cart_id: `c${i}`, name: dish(i), menu_item_id: `m${i}` }),
    ),
    carts: Array.from({ length: n }, (_, i) => cart(`c${i}`, `s${i}`)),
    sessions: Array.from({ length: n }, (_, i) =>
      session({ id: `s${i}`, mode: "pickup", table_number: null }),
    ),
  };
}

describe("what is on the wall — the table strip", () => {
  it("publishes a dine-in table by NUMBER and status, and nothing else about it", () => {
    const p = shape({
      lines: [line({ cart_id: "c1" })],
      carts: [cart("c1", "s1")],
      sessions: [session({ id: "s1", table_number: 7 })],
    });
    expect(p.tables).toEqual([{ table: 7, status: "cooking" }]);
    // The SHAPE is the boundary: a guest name, a session id or a dish list can only reach the wall
    // by being added to this object, so the key set is asserted rather than the values alone.
    expect(Object.keys(p.tables[0]!).sort()).toEqual(["status", "table"]);
  });

  it("a mode this code has never heard of is NOT on the strip", () => {
    // The allowlist's whole reason to exist, pointed the other way from the orders half. The day
    // `table_sessions.mode`'s CHECK gains a fourth value that means table service, it must be a
    // DECISION to put it on the wall, not a consequence of `!== "pickup"`.
    const p = shape({
      lines: [line({ cart_id: "c1" })],
      carts: [cart("c1", "s1")],
      sessions: [session({ id: "s1", mode: "counter-seated", table_number: 7 })],
    });
    expect(p.tables).toEqual([]);
    // …and it still counted toward the kitchen's load, which names nobody.
    expect(p.tickets).toBe(1);
  });

  it("pickup and scan-and-go never appear on the strip — they have no table", () => {
    for (const mode of ["pickup", "scango"]) {
      const p = shape({
        lines: [line({ cart_id: "c1" })],
        carts: [cart("c1", "s1")],
        sessions: [session({ id: "s1", mode, table_number: 7 })],
      });
      expect(p.tables).toEqual([]);
    }
  });

  it("a CLEARED table drops off the wall the moment its session closes", () => {
    for (const status of ["closed", "locked"]) {
      const p = shape({
        lines: [line({ cart_id: "c1" })],
        carts: [cart("c1", "s1")],
        sessions: [session({ id: "s1", status, table_number: 7 })],
      });
      expect(p.tables).toEqual([]);
    }
  });

  it("an UNREGISTERED sticker has no number to show, so it shows none — and still counts", () => {
    const p = shape({
      lines: [line({ cart_id: "c1" })],
      carts: [cart("c1", "s1")],
      sessions: [session({ id: "s1", table_number: null })],
    });
    expect(p.tables).toEqual([]);
    expect(p.tickets).toBe(1);
  });

  it("COOKING wins over ready on the same table — a runner must not be sent for food still on the wok", () => {
    // One cart just bumped, a second round already fired. Ordered so the READY session is seen
    // first, which is the ordering a `ready`-wins bug would pass under.
    const p = shape({
      lines: [
        line({
          cart_id: "cReady",
          state: "served",
          bumped_at: new Date(NOW - 1 * MIN).toISOString(),
        }),
        line({ cart_id: "cCooking" }),
      ],
      carts: [cart("cReady", "sReady"), cart("cCooking", "sCooking")],
      sessions: [
        session({ id: "sReady", table_number: 3 }),
        session({ id: "sCooking", table_number: 3 }),
      ],
    });
    expect(p.tables).toEqual([{ table: 3, status: "cooking" }]);
  });

  it("tables come out ascending by number", () => {
    const p = shape({
      lines: [line({ cart_id: "a" }), line({ cart_id: "b" }), line({ cart_id: "c" })],
      carts: [cart("a", "sa"), cart("b", "sb"), cart("c", "sc")],
      sessions: [
        session({ id: "sa", table_number: 9 }),
        session({ id: "sb", table_number: 2 }),
        session({ id: "sc", table_number: 5 }),
      ],
    });
    expect(p.tables.map((t) => t.table)).toEqual([2, 5, 9]);
  });
});

describe("`ready` is derived from a stamp, never invented", () => {
  const readySession = [session({ id: "s1", table_number: 4 })];
  const readyCart = [cart("c1", "s1")];

  it("a line bumped INSIDE the linger reads ready", () => {
    const p = shape({
      lines: [
        line({
          cart_id: "c1",
          state: "served",
          bumped_at: new Date(NOW - PULSE_READY_LINGER_MS + 1).toISOString(),
        }),
      ],
      carts: readyCart,
      sessions: readySession,
    });
    expect(p.tables).toEqual([{ table: 4, status: "ready" }]);
    // A bumped line has left the wok: it is not load, and it is not on the rail.
    expect(p.tickets).toBe(0);
    expect(p.oldestFiredAt).toBeNull();
  });

  it("a line bumped OUTSIDE the linger says nothing at all", () => {
    // The wall stops asserting a state it can no longer see, rather than keeping a table `ready`
    // from the bump until it pays. One millisecond past the bound, so a widened comparison fails.
    const p = shape({
      lines: [
        line({
          cart_id: "c1",
          state: "served",
          bumped_at: new Date(NOW - PULSE_READY_LINGER_MS - 1).toISOString(),
        }),
      ],
      carts: readyCart,
      sessions: readySession,
    });
    expect(p.tables).toEqual([]);
  });

  it("a served line with NO bump stamp is not ready — an unstamped row is unknown, not done", () => {
    const p = shape({
      lines: [line({ cart_id: "c1", state: "served", bumped_at: null })],
      carts: readyCart,
      sessions: readySession,
    });
    expect(p.tables).toEqual([]);
  });

  it("a VOIDED line is neither cooking nor ready", () => {
    const p = shape({
      lines: [
        line({ cart_id: "c1", state: "voided", bumped_at: new Date(NOW).toISOString() }),
        line({ cart_id: "c1", state: "draft" }),
      ],
      carts: readyCart,
      sessions: readySession,
    });
    expect(p.tables).toEqual([]);
    expect(p.tickets).toBe(0);
  });
});

describe("load — the count and the age", () => {
  it("a HELD line, and a dine-in line inside its undo grace, are not cooking yet", () => {
    // `fire_at` in the future is either a scheduled pickup the kitchen has not started or a send the
    // diner can still pull back. Either way the kitchen has not seen it, so the wall must not.
    const p = shape({
      lines: [line({ cart_id: "c1", fire_at: new Date(NOW + 1).toISOString() })],
      carts: [cart("c1", "s1")],
      sessions: [session({ id: "s1", table_number: 6 })],
    });
    expect(p.tickets).toBe(0);
    expect(p.tables).toEqual([]);
    expect(p.oldestFiredAt).toBeNull();
  });

  it("counts TICKETS, not lines — four lines on one cart are one ticket", () => {
    const p = shape({
      lines: [
        line({ cart_id: "c1", name: "A" }),
        line({ cart_id: "c1", name: "B" }),
        line({ cart_id: "c1", name: "C" }),
        line({ cart_id: "c2", name: "D" }),
      ],
      carts: [cart("c1", "s1"), cart("c2", "s2")],
      sessions: [session({ id: "s1", table_number: 1 }), session({ id: "s2", table_number: 2 })],
    });
    expect(p.tickets).toBe(2);
  });

  it("the oldest age comes from a COOKING line — a stale served line cannot age the board", () => {
    const p = shape({
      lines: [
        line({
          cart_id: "c1",
          state: "served",
          fire_at: new Date(NOW - 90 * MIN).toISOString(),
          bumped_at: new Date(NOW - 1 * MIN).toISOString(),
        }),
        line({ cart_id: "c2", fire_at: new Date(NOW - 7 * MIN).toISOString() }),
        line({ cart_id: "c3", fire_at: new Date(NOW - 3 * MIN).toISOString() }),
      ],
      carts: [cart("c1", "s1"), cart("c2", "s2"), cart("c3", "s3")],
      sessions: [
        session({ id: "s1", table_number: 1 }),
        session({ id: "s2", table_number: 2 }),
        session({ id: "s3", table_number: 3 }),
      ],
    });
    expect(p.oldestFiredAt).toBe(new Date(NOW - 7 * MIN).toISOString());
  });

  it("a line we cannot PLACE is dropped, not counted anonymously", () => {
    // Two ways a row goes unplaceable: its cart was cancelled (absent from the cart read, which
    // filters to open/paid) or its session did not come back. Either way the row is silently gone
    // from the load figures rather than swelling a count nobody can explain.
    const orphanCart = shape({
      lines: [line({ cart_id: "gone" })],
      carts: [],
      sessions: [session({ id: "s1", table_number: 1 })],
    });
    expect(orphanCart.tickets).toBe(0);
    const orphanSession = shape({
      lines: [line({ cart_id: "c1" })],
      carts: [cart("c1", "sMissing")],
      sessions: [],
    });
    expect(orphanSession.tickets).toBe(0);
  });
});

describe("the all-day rail's exposure floor", () => {
  it(`is WITHHELD below ${PULSE_RAIL_MIN_TICKETS} live tickets — one ticket's rail is one party's order`, () => {
    for (let n = 1; n < PULSE_RAIL_MIN_TICKETS; n++) {
      const p = shape(tickets(n));
      expect(p.tickets).toBe(n);
      expect(p.allDay).toEqual([]);
      // …and the withheld rail publishes nothing ABOUT itself either: a remainder count would say
      // how many distinct dishes are cooking, which is a fact drawn from the data being withheld.
      expect(p.allDayMore).toBe(0);
    }
  });

  it("OPENS at the floor — a guard that never opens is a disabled feature, not a floor", () => {
    const p = shape(tickets(PULSE_RAIL_MIN_TICKETS));
    expect(p.tickets).toBe(PULSE_RAIL_MIN_TICKETS);
    expect(p.allDay.map((d) => d.name).sort()).toEqual(
      Array.from({ length: PULSE_RAIL_MIN_TICKETS }, (_, i) => `Dish ${i}`).sort(),
    );
  });

  it("counts only what is COOKING — a bumped dish has left the wok", () => {
    const base = tickets(PULSE_RAIL_MIN_TICKETS, () => "Mohinga");
    const p = shape({
      ...base,
      lines: [
        ...base.lines,
        line({
          cart_id: "cBumped",
          name: "Mohinga",
          qty: 40,
          state: "served",
          bumped_at: new Date(NOW - 1 * MIN).toISOString(),
        }),
      ],
      carts: [...base.carts, cart("cBumped", "sBumped")],
      sessions: [...base.sessions, session({ id: "sBumped", table_number: 8 })],
    });
    expect(p.allDay).toEqual([{ name: "Mohinga", nameMy: null, qty: PULSE_RAIL_MIN_TICKETS }]);
  });

  it("sums quantities per dish and ranks the busiest first", () => {
    const p = shape({
      lines: [
        line({ cart_id: "c1", name: "Tea", qty: 1, menu_item_id: "mTea" }),
        line({ cart_id: "c2", name: "Mohinga", qty: 2, menu_item_id: "mMoh" }),
        line({ cart_id: "c3", name: "Mohinga", qty: 2, menu_item_id: "mMoh" }),
      ],
      carts: [cart("c1", "s1"), cart("c2", "s2"), cart("c3", "s3")],
      sessions: [
        session({ id: "s1", mode: "pickup", table_number: null }),
        session({ id: "s2", mode: "pickup", table_number: null }),
        session({ id: "s3", mode: "pickup", table_number: null }),
      ],
    });
    expect(p.allDay).toEqual([
      { name: "Mohinga", nameMy: null, qty: 4 },
      { name: "Tea", nameMy: null, qty: 1 },
    ]);
  });

  it("caps the rail and COUNTS the remainder — a truncated all-day count is a wrong one", () => {
    const n = PULSE_RAIL_MAX_ROWS + 3;
    const p = shape(tickets(n));
    expect(p.allDay).toHaveLength(PULSE_RAIL_MAX_ROWS);
    expect(p.allDayMore).toBe(3);
  });
});

describe("the Burmese half of a rail row", () => {
  const three = tickets(PULSE_RAIL_MIN_TICKETS, () => "Mohinga");
  const withMenu = (nameMy: string | null) =>
    shape({ ...three, nameMy: three.lines.map((l) => [l.menu_item_id, nameMy]) });

  it("takes the catalog's Burmese when there is one", () => {
    expect(withMenu("မုန့်ဟင်းခါး").allDay[0]!.nameMy).toBe("မုန့်ဟင်းခါး");
  });

  it("is null when the catalog has none — the rail then shows the English snapshot alone", () => {
    expect(withMenu(null).allDay[0]!.nameMy).toBeNull();
  });

  it("is null when `name_my` carries no Myanmar script at all (the P1 catalog rule, reused)", () => {
    // A romanisation or a brand name stored in the Burmese column is not a second tongue, and the
    // rail must not typeset it in Padauk. This is `catalogNameMy`'s rule — read from there rather
    // than restated here, so a K15 correction to the rule reaches both the ticket and the wall.
    expect(withMenu("Mohinga").allDay[0]!.nameMy).toBeNull();
  });
});
