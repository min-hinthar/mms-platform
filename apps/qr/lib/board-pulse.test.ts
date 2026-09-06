import { describe, expect, it } from "vitest";
import {
  PULSE_RAIL_MAX_ROWS,
  PULSE_RAIL_MIN_PARTIES,
  PULSE_PASS_LINGER_MS,
  PULSE_RAIL_MIN_DISHES,
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
 *  3. **Derived, never invented.** `up` is `bumped_at` inside a display window and nothing else;
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

/** Defaults to `open`, the dine-in shape; the load rule's non-dine-in arm needs `paid`. */
const cart = (id: string, sessionId: string, status = "open"): PulseCartRow => ({
  id,
  session_id: sessionId,
  status,
});

const session = (over: Partial<PulseSessionRow> & { id: string }): PulseSessionRow => ({
  mode: "dinein",
  status: "active",
  table_number: 2,
  expires_at: new Date(NOW + 60 * MIN).toISOString(),
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
    carts: Array.from({ length: n }, (_, i) => cart(`c${i}`, `s${i}`, "paid")),
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
    // ⚠️ NOT a key-name check. An earlier draft asserted `Object.keys(...)` and that is exactly the
    // matcher this repo distrusts: it stays green if `table` were populated from a session id, or
    // if a route edit spread a wider row into the shaper (the route casts rather than projects).
    // The property is about VALUES — nothing identifying may appear anywhere in the serialized
    // output, so the fixture uses ids and a name that could not arrive by coincidence.
    const identifying = shape({
      lines: [line({ cart_id: "cart-SECRET", menu_item_id: "item-SECRET" })],
      carts: [cart("cart-SECRET", "sess-SECRET")],
      sessions: [session({ id: "sess-SECRET", table_number: 7 })],
    });
    const json = JSON.stringify(identifying);
    for (const leak of ["cart-SECRET", "sess-SECRET", "item-SECRET"])
      expect(json).not.toContain(leak);
  });

  it("a mode this code has never heard of is NOT on the strip", () => {
    // The allowlist's whole reason to exist, pointed the other way from the orders half. The day
    // `table_sessions.mode`'s CHECK gains a fourth value that means table service, it must be a
    // DECISION to put it on the wall, not a consequence of `!== "pickup"`.
    const p = shape({
      lines: [line({ cart_id: "c1" })],
      carts: [cart("c1", "s1", "paid")],
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

  it("a CLEARED table drops off the wall the moment its session closes — strip AND load", () => {
    // ⚠️ `tickets` is asserted here, not only `tables`, and it is the CRITICAL this suite missed on
    // its first pass. The scenario is ordinary, not exotic: the table pays (its cart flips
    // open→PAID), one line was never bumped, and `clearTable` cancels only the OPEN cart before
    // closing the session — so that paid cart's `fired` line survives. With no liveness test on the
    // load path the wall counted it as live kitchen work for 24 hours while the KDS, which applies
    // the test, showed nothing. Both cart statuses are covered because only the paid one persists.
    for (const status of ["closed", "locked"]) {
      for (const cartStatus of ["open", "paid"]) {
        const p = shape({
          lines: [line({ cart_id: "c1" })],
          carts: [cart("c1", "s1", cartStatus)],
          sessions: [session({ id: "s1", status, table_number: 7 })],
        });
        expect(p.tables).toEqual([]);
        expect(p.tickets).toBe(0);
        expect(p.oldestMinutes).toBeNull();
      }
    }
  });

  it("non-dine-in food is counted only once its cart is PAID — the pass's rule, restated", () => {
    // `lib/kitchen.ts`: "a pre-payment fired line on an open pickup cart is an edge no diner surface
    // produces — skip rather than cook unpaid food." The wall must agree with the pass, or its count
    // is a different number wearing the same label.
    for (const mode of ["pickup", "scango", "counter-seated"]) {
      const open = shape({
        lines: [line({ cart_id: "c1" })],
        carts: [cart("c1", "s1", "open")],
        sessions: [session({ id: "s1", mode, table_number: null })],
      });
      expect(open.tickets).toBe(0);
      const paid = shape({
        lines: [line({ cart_id: "c1" })],
        carts: [cart("c1", "s1", "paid")],
        sessions: [session({ id: "s1", mode, table_number: null })],
      });
      expect(paid.tickets).toBe(1);
    }
    // …and dine-in is the mirror: it cooks on an OPEN cart, which is the whole point of the fork.
    const dineIn = shape({
      lines: [line({ cart_id: "c1" })],
      carts: [cart("c1", "s1", "open")],
      sessions: [session({ id: "s1", table_number: 7 })],
    });
    expect(dineIn.tickets).toBe(1);
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

  it("COOKING wins when ONE session is both — the second course is still on the wok", () => {
    // ⚠️ THE FIXTURE THAT SEPARATES THE RULE FROM ITS MUTANT, and the first draft did not.
    // `verify:slice` caught `cooking ? "cooking" : "up"` → `up ? "up" : "cooking"` SURVIVING,
    // because that draft put the two states on two DIFFERENT sessions: the later cooking row then
    // overwrote the earlier `up` one under both readings, so the ternary's polarity never mattered.
    // One session carrying both — a first course bumped while the second is already fired, which is
    // what a table actually looks like mid-service — is the input on which they disagree.
    const p = shape({
      lines: [
        line({
          cart_id: "c1",
          state: "served",
          bumped_at: new Date(NOW - 1 * MIN).toISOString(),
        }),
        line({ cart_id: "c1" }),
      ],
      carts: [cart("c1", "s1")],
      sessions: [session({ id: "s1", table_number: 3 })],
    });
    expect(p.tables).toEqual([{ table: 3, status: "cooking" }]);
  });

  it("COOKING wins across a re-seat too, whichever session the map saw first", () => {
    // Two sessions on one number — the old table paid and a new party sat down. Asserted in BOTH
    // orders, because the rule must not depend on which row arrived first; the guard that makes
    // that true carries its own mutant.
    const bumped = line({
      cart_id: "cUp",
      state: "served",
      bumped_at: new Date(NOW - 1 * MIN).toISOString(),
    });
    const cooking = line({ cart_id: "cCooking" });
    const carts = [cart("cUp", "sUp"), cart("cCooking", "sCooking")];
    const both = [
      session({ id: "sUp", table_number: 3 }),
      session({ id: "sCooking", table_number: 3 }),
    ];
    expect(shape({ lines: [bumped, cooking], carts, sessions: both }).tables).toEqual([
      { table: 3, status: "cooking" },
    ]);
    expect(
      shape({ lines: [bumped, cooking], carts, sessions: [...both].reverse() }).tables,
    ).toEqual([{ table: 3, status: "cooking" }]);
  });

  it("a GHOST session — still `active`, past its TTL — is off the wall", () => {
    // `is_member` requires `expires_at > now()`, so past the four-hour mint TTL the diners cannot
    // act on their own cart; nothing closes the row and nothing extends the clock. One unbumped
    // line would otherwise pin that number to a public wall for good. Asserted one millisecond
    // either side of the boundary.
    const live = shape({
      lines: [line({ cart_id: "c1" })],
      carts: [cart("c1", "s1")],
      sessions: [
        session({ id: "s1", table_number: 5, expires_at: new Date(NOW + 1).toISOString() }),
      ],
    });
    expect(live.tables).toEqual([{ table: 5, status: "cooking" }]);
    for (const expires_at of [new Date(NOW).toISOString(), new Date(NOW - 1).toISOString()]) {
      const ghost = shape({
        lines: [line({ cart_id: "c1" })],
        carts: [cart("c1", "s1")],
        sessions: [session({ id: "s1", table_number: 5, expires_at })],
      });
      expect(ghost.tables).toEqual([]);
      // …and it still counts toward the kitchen's load, which the KDS also still shows. The strip
      // follows the FLOOR board's liveness test; the load figures follow the KDS's, so the wall and
      // the pass keep counting the same tickets.
      expect(ghost.tickets).toBe(1);
    }
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

describe("`up` is derived from a stamp, never invented", () => {
  const readySession = [session({ id: "s1", table_number: 4 })];
  const readyCart = [cart("c1", "s1")];

  it("a line bumped INSIDE the linger reads `up`", () => {
    const p = shape({
      lines: [
        line({
          cart_id: "c1",
          state: "served",
          bumped_at: new Date(NOW - PULSE_PASS_LINGER_MS + 1).toISOString(),
        }),
      ],
      carts: readyCart,
      sessions: readySession,
    });
    expect(p.tables).toEqual([{ table: 4, status: "up" }]);
    // A bumped line has left the wok: it is not load, and it is not on the rail.
    expect(p.tickets).toBe(0);
    expect(p.oldestMinutes).toBeNull();
  });

  it("a line bumped OUTSIDE the linger says nothing at all", () => {
    // The wall stops asserting a state it can no longer see, rather than keeping a table `ready`
    // from the bump until it pays. One millisecond past the bound, so a widened comparison fails.
    const p = shape({
      lines: [
        line({
          cart_id: "c1",
          state: "served",
          bumped_at: new Date(NOW - PULSE_PASS_LINGER_MS - 1).toISOString(),
        }),
      ],
      carts: readyCart,
      sessions: readySession,
    });
    expect(p.tables).toEqual([]);
  });

  it("a served line with NO bump stamp is not `up` — an unstamped row is unknown, not done", () => {
    const p = shape({
      lines: [line({ cart_id: "c1", state: "served", bumped_at: null })],
      carts: readyCart,
      sessions: readySession,
    });
    expect(p.tables).toEqual([]);
  });

  it("a VOIDED line is neither cooking nor `up`", () => {
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
    expect(p.oldestMinutes).toBeNull();
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
    // …and it is a MINUTE COUNT, never the fire stamp: an exact timestamp beside one table on the
    // strip states that party's order instant to the room.
    const p = shape({
      lines: [
        line({
          cart_id: "c1",
          state: "served",
          fire_at: new Date(NOW - 90 * MIN).toISOString(),
          bumped_at: new Date(NOW - 1 * MIN).toISOString(),
        }),
        // ⚠️ 7m59s, not 7m00s. Every offset in the first draft of this suite was a whole minute, so
        // `Math.floor`, `Math.ceil` and `Math.round` all answered 7 and the rounding rule had no
        // guard at all. A wall must never round a 7-minute wait up to 8 and call a ticket late.
        line({ cart_id: "c2", fire_at: new Date(NOW - (7 * MIN + 59_000)).toISOString() }),
        line({ cart_id: "c3", fire_at: new Date(NOW - 3 * MIN).toISOString() }),
      ],
      carts: [cart("c1", "s1"), cart("c2", "s2"), cart("c3", "s3")],
      sessions: [
        session({ id: "s1", table_number: 1 }),
        session({ id: "s2", table_number: 2 }),
        session({ id: "s3", table_number: 3 }),
      ],
    });
    expect(p.oldestMinutes).toBe(7);
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
  it(`is WITHHELD below ${PULSE_RAIL_MIN_PARTIES} live tickets — one ticket's rail is one party's order`, () => {
    for (let n = 1; n < PULSE_RAIL_MIN_PARTIES; n++) {
      const p = shape(tickets(n));
      expect(p.tickets).toBe(n);
      expect(p.allDay).toEqual([]);
      // …and the withheld rail publishes nothing ABOUT itself either: a remainder count would say
      // how many distinct dishes are cooking, which is a fact drawn from the data being withheld.
      expect(p.allDayMore).toBe(0);
    }
  });

  it("counts PARTIES, not carts — one table holding two carts is one party", () => {
    // ⚠️ The unit is the finding. A dine-in session can hold a paid cart with unbumped lines beside
    // a fresh open one, so a cart count let two parties look like three and opened the rail one
    // party early — at which point the strip shows one number beside a rail that is substantially
    // that table's order, which is the exact fact the floor exists to prevent.
    const p = shape({
      lines: [
        line({ cart_id: "cPaid", name: "Mohinga" }),
        line({ cart_id: "cOpen", name: "Tea" }),
        line({ cart_id: "cOther", name: "Salad", menu_item_id: "mSalad" }),
      ],
      carts: [cart("cPaid", "s1", "paid"), cart("cOpen", "s1"), cart("cOther", "s2")],
      sessions: [session({ id: "s1", table_number: 2 }), session({ id: "s2", table_number: 3 })],
    });
    expect(p.tickets).toBe(3); // three tickets — that is what the KITCHEN has
    expect(p.allDay).toEqual([]); // …but only two parties, so the rail stays shut
  });

  it("OPENS at the floor — a guard that never opens is a disabled feature, not a floor", () => {
    const p = shape(tickets(PULSE_RAIL_MIN_PARTIES));
    expect(p.tickets).toBe(PULSE_RAIL_MIN_PARTIES);
    expect(p.allDay.map((d) => d.name).sort()).toEqual(
      Array.from({ length: PULSE_RAIL_MIN_PARTIES }, (_, i) => `Dish ${i}`).sort(),
    );
  });

  describe("a ONE-ROW rail names every cooking table on the strip", () => {
    /**
     * ⚠️ THE FRAME THIS SUITE GENERATED ON EVERY RUN AND INSPECTED WITH NOTHING. Three parties who
     * all ordered the same dish is an ordinary lull, not an adversarial input — and with one rail
     * row every cooking party's content IS that dish, so every `cooking` table beside it is named
     * by identity, in a single frame, at any party count. The party floor cannot see this: it
     * counts parties, and the exposure is the rail×strip JOIN.
     *
     * These assert on `tables` as well as `allDay`. The old tests asserted `tickets` and `allDay`
     * and never once looked at the strip, which is exactly why the frame went unnoticed.
     */
    /** N cooking parties all on ONE dish, plus a dine-in table among them. */
    function homogeneous(n: number, dish = "Mohinga") {
      const base = tickets(n, () => dish);
      return {
        ...base,
        lines: base.lines.map((l) => ({ ...l, menu_item_id: "mSame" })),
        sessions: [
          session({ id: "s0", table_number: 4 }), // dine-in, cooking
          ...base.sessions.slice(1),
        ],
      };
    }

    it("withholds the rail when the strip has a cooking table and the rail has one row", () => {
      const p = shape(homogeneous(PULSE_RAIL_MIN_PARTIES));
      expect(p.tickets).toBe(PULSE_RAIL_MIN_PARTIES);
      expect(p.tables).toEqual([{ table: 4, status: "cooking" }]);
      // The wall must not be able to say "the party at Table 4 is having Mohinga".
      expect(p.allDay).toEqual([]);
      expect(p.allDayMore).toBe(0);
    });

    it("PUBLISHES a one-row rail when no table on the strip is cooking — nothing to attribute", () => {
      // The other direction, and the reason the gate reads the JOIN rather than the rail alone: a
      // dish-count test on its own would withhold here and buy no privacy at all, while costing the
      // kitchen the all-day view. Three takeaway parties, one dish, empty strip.
      const p = shape(tickets(PULSE_RAIL_MIN_PARTIES, () => "Mohinga"));
      expect(p.tables).toEqual([]);
      expect(p.allDay).toEqual([{ name: "Mohinga", nameMy: null, qty: PULSE_RAIL_MIN_PARTIES }]);
    });

    it("an `up` table does not close the rail — a bumped line is not on it to be attributed", () => {
      // `up` comes out of `passSessions`, and a bumped line never enters `dishes`, so that table's
      // dish is absent from the rail. Closing the gate on it would withhold for no exposure.
      const base = tickets(PULSE_RAIL_MIN_PARTIES, () => "Mohinga");
      const p = shape({
        lines: [
          ...base.lines.map((l) => ({ ...l, menu_item_id: "mSame" })),
          line({
            cart_id: "cUp",
            name: "Tea",
            state: "served",
            bumped_at: new Date(NOW - 1 * MIN).toISOString(),
          }),
        ],
        carts: [...base.carts, cart("cUp", "sUp")],
        sessions: [...base.sessions, session({ id: "sUp", table_number: 6 })],
      });
      expect(p.tables).toEqual([{ table: 6, status: "up" }]);
      expect(p.allDay).toEqual([{ name: "Mohinga", nameMy: null, qty: PULSE_RAIL_MIN_PARTIES }]);
    });

    it(`opens again at ${PULSE_RAIL_MIN_DISHES} distinct dishes, cooking table and all`, () => {
      // A floor that never opens is a disabled feature. With two rows and three parties no single
      // frame determines which dish table 4 is having.
      const base = homogeneous(PULSE_RAIL_MIN_PARTIES);
      const p = shape({
        ...base,
        lines: base.lines.map((l, i) =>
          i === 0 ? { ...l, name: "Tea", menu_item_id: "mTea" } : l,
        ),
      });
      expect(p.tables).toEqual([{ table: 4, status: "cooking" }]);
      expect(p.allDay).toHaveLength(PULSE_RAIL_MIN_DISHES);
    });
  });

  it("counts only what is COOKING — a bumped dish has left the wok", () => {
    const base = tickets(PULSE_RAIL_MIN_PARTIES, () => "Mohinga");
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
    expect(p.allDay).toEqual([{ name: "Mohinga", nameMy: null, qty: PULSE_RAIL_MIN_PARTIES }]);
  });

  it("sums quantities per dish and ranks the busiest first", () => {
    const p = shape({
      lines: [
        line({ cart_id: "c1", name: "Tea", qty: 1, menu_item_id: "mTea" }),
        line({ cart_id: "c2", name: "Mohinga", qty: 2, menu_item_id: "mMoh" }),
        line({ cart_id: "c3", name: "Mohinga", qty: 2, menu_item_id: "mMoh" }),
      ],
      carts: [cart("c1", "s1", "paid"), cart("c2", "s2", "paid"), cart("c3", "s3", "paid")],
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
  const three = tickets(PULSE_RAIL_MIN_PARTIES, () => "Mohinga");
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

describe("every mode that may reach the strip is liveness-checked on the LOAD path too", () => {
  /**
   * ⚠️ WHY THIS EXISTS AT ALL, and why it passes a SET in rather than trusting the constant. The
   * strip once carried its own `status === 'active'` guard; `verify:slice` proved that guard dead,
   * because the load loop already refuses a non-`active` DINE-IN session above both branches that
   * feed the strip, and a dead guard is decorative — so it was deleted.
   *
   * That deletion is correct today and held by a COINCIDENCE: `PULSE_TABLE_MODES` has exactly one
   * member, so "may appear on the wall" and "is checked for liveness" happen to name the same mode.
   * Nothing states they must. Add a second table mode — a numbered bar counter — and it routes to
   * the load loop's `else if (cart.status !== "paid")` arm, which applies NO session-status test,
   * and a cleared session of that mode lands back on a public wall with a stale status.
   *
   * The set is a defaulted parameter for exactly this: the second member exists here, in the test,
   * so the proposition is falsifiable while production still ships one.
   */
  const MODES = ["dinein", "counter"] as const;
  const modes: ReadonlySet<string> = new Set(MODES);

  const withMode = (mode: string, status: string, cartStatus: string) =>
    shapeBoardPulse(
      {
        lines: [line({ cart_id: "c1" })],
        cartById: new Map([["c1", cart("c1", "s1", cartStatus)]]),
        sessionById: new Map([["s1", session({ id: "s1", mode, status, table_number: 7 })]]),
        nameMyByItem: new Map(),
        nowMs: NOW,
      },
      modes,
    );

  for (const mode of MODES) {
    // Both cart statuses, because the load loop forks on `paid` and the un-checked arm is the paid
    // one — a fixture that only ever passes `open` would never reach the branch this is about.
    for (const cartStatus of ["open", "paid"] as const) {
      it(`refuses a CLEARED \`${mode}\` session holding a \`${cartStatus}\` cart`, () => {
        const p = withMode(mode, "closed", cartStatus);
        expect(p.tables).toEqual([]);
        expect(p.tickets).toBe(0);
        expect(p.oldestMinutes).toBeNull();
        expect(p.allDay).toEqual([]);
      });
    }

    it(`still publishes a LIVE \`${mode}\` table — the rule refuses staleness, not the mode`, () => {
      // Anti-vacuity: without this, `tables: []` above would also be satisfied by a shaper that
      // dropped the mode entirely, and the test would pass for the wrong reason.
      expect(withMode(mode, "active", "open").tables).toEqual([{ table: 7, status: "cooking" }]);
    });
  }
});
