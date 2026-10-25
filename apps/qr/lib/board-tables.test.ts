import { describe, expect, it } from "vitest";
import {
  idleRecheck,
  kitchenIdle,
  shapeBoardTables,
  wallDishLines,
  type BoardLineRow,
  type ShapeTablesInput,
} from "./board-tables";
import { PULSE_PASS_LINGER_MS, type PulseCartRow, type PulseSessionRow } from "./board-pulse";
import { KDS_UNDO_MS } from "./kds-undo";
import { seatKey } from "./guest-names";
import type { KitchenRound } from "./kitchen-types";

/**
 * PD9 — the TV board's tables (m9; PATH_DESIGN decision 11). Every rule `board-tables.ts` holds is
 * falsified here by a value, and each carries a `board-tables/*` mutant. The stage itself is
 * `kitchen-track.ts`'s (its own suite); this suite pins what the WALL decides: which food is on it,
 * how it groups, when it leaves, how a round is told, and that the shape publishes nothing else.
 */
const NOW = "2026-10-09T19:48:00.000Z";
const at = (sec: number) => new Date(Date.parse(NOW) + sec * 1000).toISOString();
const LIVE = at(3600); // a session inside its TTL
const B1 = "b1000000-0000-4000-8000-000000000001";
const B2 = "b2000000-0000-4000-8000-000000000002";
const B3 = "b3000000-0000-4000-8000-000000000003";

let n = 0;
const line = (over: Partial<BoardLineRow> = {}): BoardLineRow => ({
  id: `l${++n}`,
  cart_id: "c4",
  menu_item_id: "m-mohinga",
  name: "Mohinga",
  state: "fired",
  fire_at: at(-120),
  fire_batch: B1,
  fulfillment: "dinein",
  created_at: at(-130),
  bumped_at: null,
  added_by: null,
  ...over,
});

const carts: PulseCartRow[] = [
  { id: "c4", session_id: "s4", status: "open" },
  { id: "c4b", session_id: "s4b", status: "open" },
  { id: "c7", session_id: "s7", status: "open" },
  { id: "cp", session_id: "sp", status: "paid" },
];
const sessions: PulseSessionRow[] = [
  { id: "s4", mode: "dinein", status: "active", table_number: 4, expires_at: LIVE, qr_code: "T4" },
  {
    id: "s4b",
    mode: "dinein",
    status: "active",
    table_number: 4,
    expires_at: LIVE,
    qr_code: "T4B",
  },
  { id: "s7", mode: "dinein", status: "active", table_number: 7, expires_at: LIVE, qr_code: "T7" },
  // A pickup minted at a numbered sticker: only the mode keeps its food off the wall.
  { id: "sp", mode: "pickup", status: "active", table_number: 9, expires_at: LIVE, qr_code: "PK9" },
];

const input = (
  lines: BoardLineRow[],
  over: Partial<ShapeTablesInput> & { sessions?: PulseSessionRow[] } = {},
): ShapeTablesInput => ({
  lines,
  cartById: new Map(carts.map((c) => [c.id, c])),
  sessionById: new Map((over.sessions ?? sessions).map((s) => [s.id, s])),
  nameMyByItem: new Map([["m-mohinga", "မုန့်ဟင်းခါး"]]),
  guestBySeat: new Map(),
  roundOf: () => ({ kind: "n", n: 1 }),
  nowIso: NOW,
  ...over,
});
const shape = (lines: BoardLineRow[], over: Parameters<typeof input>[1] = {}) =>
  shapeBoardTables(input(lines, over));

describe("shapeBoardTables — which food is on the wall", () => {
  it("a sent dish of an active dine-in table is on its pass, with the catalog's Burmese and its stage", () => {
    expect(shape([line()])).toEqual([
      {
        table: 4,
        out: false,
        rounds: [
          {
            n: 1,
            next: false,
            dishes: [
              { name: "Mohinga", nameMy: "မုန့်ဟင်းခါး", stage: "sent", togo: false, guests: [] },
            ],
          },
        ],
      },
    ]);
  });

  it("a dish not yet sent never appears — a draft is not food the kitchen has (`board-tables/draft-on-the-wall`)", () => {
    expect(shape([line({ state: "draft", fire_at: null, fire_batch: null })])).toEqual([]);
    // Beside a dish the kitchen HAS, in the same card (an unstamped fired line keys by its cart, as a
    // draft does): the linger cannot drop the draft there, so only the stage allowlist keeps it off.
    const t = shape([
      line({ fire_at: null, fire_batch: null }),
      line({ name: "Tea", menu_item_id: "m-tea", state: "draft", fire_at: null, fire_batch: null }),
    ]);
    expect(t[0]!.rounds.flatMap((r) => r.dishes.map((d) => [d.name, d.stage]))).toEqual([
      ["Mohinga", "sent"],
    ]);
  });

  it("a Send inside its 10 s grace never appears — the KDS does not show it either", () => {
    expect(shape([line({ fire_at: at(4) })])).toEqual([]);
  });

  it("a voided dish and a grocery line never appear", () => {
    expect(shape([line({ state: "voided" })])).toEqual([]);
    expect(shape([line({ fulfillment: "grocery", name: "Rice 5lb" })])).toEqual([]);
  });

  it("a pickup's food never appears as a table — its CODE is on the wall, its dishes are not (`board-tables/table-allowlist-becomes-a-blacklist`)", () => {
    expect(shape([line({ cart_id: "cp", fulfillment: "togo" })])).toEqual([]);
  });

  it("a CLEARED table leaves the wall at once (`board-tables/cleared-table-on-the-wall`)", () => {
    const cleared = sessions.map((s) => (s.id === "s4" ? { ...s, status: "closed" } : s));
    expect(shape([line()], { sessions: cleared })).toEqual([]);
  });

  it("a GHOST table — past its TTL, nothing closes it — stays off the wall (`board-tables/ghost-table-pinned-to-the-wall`)", () => {
    const ghost = sessions.map((s) => (s.id === "s4" ? { ...s, expires_at: at(-1) } : s));
    expect(shape([line()], { sessions: ghost })).toEqual([]);
  });

  it("an unregistered sticker has no number to show (`board-tables/unregistered-sticker-on-the-wall`)", () => {
    const unnumbered = sessions.map((s) => (s.id === "s4" ? { ...s, table_number: null } : s));
    expect(shape([line()], { sessions: unnumbered })).toEqual([]);
  });

  it("an unplaceable line — no cart, no session — is never published", () => {
    expect(shape([line({ cart_id: "gone" })])).toEqual([]);
  });
});

describe("shapeBoardTables — one row per dish, at its slowest bowl, never a count", () => {
  it("two bowls of one dish in a Send are ONE row, at the least advanced stage (`board-tables/one-row-per-bowl`; the stage is `kitchen-track`'s `groupStage`)", () => {
    const t = shape([
      line({ state: "served", bumped_at: at(-30) }),
      line({ state: "in_progress" }),
    ]);
    expect(t[0]!.rounds[0]!.dishes).toEqual([
      { name: "Mohinga", nameMy: "မုန့်ဟင်းခါး", stage: "cooking", togo: false, guests: [] },
    ]);
  });

  it("the same dish to go is its OWN row with the to-go tag, and the dine-in row never borrows it (Codex round 4 on #319; `board-tables/togo-folded-into-dinein`)", () => {
    const t = shape([line(), line({ fulfillment: "togo", state: "in_progress" })]);
    expect(t[0]!.rounds[0]!.dishes.map((d) => [d.stage, d.togo])).toEqual([
      ["sent", false],
      ["cooking", true],
    ]);
  });

  it("dishes in fire order, then by name", () => {
    const t = shape([
      line({ name: "Tea", menu_item_id: "m-tea" }),
      line({ name: "Faluda", menu_item_id: "m-faluda" }),
      line({ name: "Coffee", menu_item_id: "m-coffee", fire_at: at(-200) }),
    ]);
    expect(t[0]!.rounds[0]!.dishes.map((d) => d.name)).toEqual(["Coffee", "Faluda", "Tea"]);
  });

  it("a dish with no catalog Burmese carries its English alone", () => {
    const t = shape([line({ name: "Tea", menu_item_id: "m-tea" })]);
    expect(t[0]!.rounds[0]!.dishes[0]).toMatchObject({ name: "Tea", nameMy: null });
  });

  it("Served waits out Mom's Undo: a dish bumped inside KDS_UNDO_MS still reads Cooking, and the table is not out", () => {
    const fresh = shape([line({ state: "served", bumped_at: at(-(KDS_UNDO_MS / 1000) + 1) })]);
    expect(fresh[0]!.rounds[0]!.dishes[0]!.stage).toBe("cooking");
    expect(fresh[0]!.out).toBe(false);
    const settled = shape([line({ state: "served", bumped_at: at(-(KDS_UNDO_MS / 1000)) })]);
    expect(settled[0]!.rounds[0]!.dishes[0]!.stage).toBe("served");
    expect(settled[0]!.out).toBe(true);
  });

  it("a recalled dish (back in progress, its bump cleared) reads Cooking again", () => {
    expect(
      shape([line({ state: "in_progress", bumped_at: null })])[0]!.rounds[0]!.dishes[0]!.stage,
    ).toBe("cooking");
  });
});

describe("shapeBoardTables — the pass, its rounds and when it leaves", () => {
  it("one Send is one round, oldest first; numbers come from the KDS's read (`board-tables/round-order-reversed`)", () => {
    const rounds: Record<string, KitchenRound> = {
      [B1]: { kind: "n", n: 1 },
      [B2]: { kind: "n", n: 2 },
    };
    const t = shape(
      [
        line({ fire_batch: B2, fire_at: at(-30), name: "Tea", menu_item_id: "m-tea" }),
        line({ fire_batch: B1, fire_at: at(-600) }),
      ],
      { roundOf: (_s, b) => rounds[b ?? ""] ?? { kind: "unknown" } },
    );
    expect(t[0]!.rounds.map((r) => [r.n, r.next, r.dishes[0]!.name])).toEqual([
      [1, false, "Mohinga"],
      [2, false, "Tea"],
    ]);
  });

  it("an UNKNOWN number reads 'next round' only beside an older round on the pass; an unnumbered Send never does (`board-tables/next-without-an-older-round`, `board-tables/none-reads-next`)", () => {
    const t = shape(
      [line({ fire_batch: B1, fire_at: at(-600) }), line({ fire_batch: B2, fire_at: at(-30) })],
      { roundOf: () => ({ kind: "unknown" }) },
    );
    expect(t[0]!.rounds.map((r) => [r.n, r.next])).toEqual([
      [null, false],
      [null, true],
    ]);
    // A settlement or to-go-only Send is never numbered, and never "next round" either.
    const none = shape(
      [line({ fire_batch: B1, fire_at: at(-600) }), line({ fire_batch: B2, fire_at: at(-30) })],
      { roundOf: (_s, b) => (b === B1 ? { kind: "n", n: 1 } : { kind: "none" }) },
    );
    expect(none[0]!.rounds.map((r) => [r.n, r.next])).toEqual([
      [1, false],
      [null, false],
    ]);
  });

  it("a fully served Send stays for the linger, then leaves; a table with nothing left leaves (`board-tables/linger-unbounded`)", () => {
    const within = at(-(PULSE_PASS_LINGER_MS / 1000) + 1);
    const past = at(-(PULSE_PASS_LINGER_MS / 1000) - 1);
    expect(shape([line({ state: "served", bumped_at: within })])).toHaveLength(1);
    expect(shape([line({ state: "served", bumped_at: past })])).toEqual([]);
  });

  it("a Send with one dish still cooking keeps EVERY dish, however long ago the others were served (Codex round 4 on #319; `board-tables/linger-drops-a-live-send`)", () => {
    const t = shape([
      line({ state: "served", bumped_at: at(-3600), name: "Tea", menu_item_id: "m-tea" }),
      line({ state: "in_progress" }),
    ]);
    expect(t[0]!.rounds[0]!.dishes.map((d) => [d.name, d.stage])).toEqual([
      ["Mohinga", "cooking"],
      ["Tea", "served"],
    ]);
  });

  it("a table is out only when EVERY dish on the pass is served (`board-tables/out-on-one-served-round`)", () => {
    const t = shape([
      line({ fire_batch: B1, fire_at: at(-600), state: "served", bumped_at: at(-60) }),
      line({ fire_batch: B2, fire_at: at(-30) }),
    ]);
    expect(t[0]!.out).toBe(false);
  });

  it("two sessions on one number share ONE pass: their Sends merge oldest first, and cooking wins over out (`board-tables/re-seat-overwrites-cooking`)", () => {
    const t = shape([
      line({ fire_batch: B1, fire_at: at(-900), state: "served", bumped_at: at(-60) }),
      line({
        cart_id: "c4b",
        fire_batch: B3,
        fire_at: at(-90),
        name: "Tea",
        menu_item_id: "m-tea",
      }),
    ]);
    expect(t).toHaveLength(1);
    expect(t[0]!.table).toBe(4);
    expect(t[0]!.out).toBe(false);
    expect(t[0]!.rounds.map((r) => r.dishes[0]!.name)).toEqual(["Mohinga", "Tea"]);
  });

  it("tables are sorted by number, never by status", () => {
    const t = shape([
      line({ cart_id: "c7", fire_batch: B3 }),
      line({ state: "served", bumped_at: at(-60) }),
    ]);
    expect(t.map((x) => [x.table, x.out])).toEqual([
      [4, true],
      [7, false],
    ]);
  });
});

describe("shapeBoardTables — guest names (owner, 2026-10-24: m9's no-name rule reversed)", () => {
  const guestBySeat = new Map([
    [seatKey("s4", "seat-a"), "Aung"],
    [seatKey("s4", "seat-b"), "Mya"],
    [seatKey("s7", "seat-a"), "Thida"],
  ]);

  it("a dish row names who added it — distinct, first-added first, never a count (`board-tables/guests-dropped`, `board-tables/guests-unordered`)", () => {
    // Input out of add order: the row lists Mya (added first) before Aung, and Mya once.
    const t = shape(
      [
        line({ added_by: "seat-a", created_at: at(-135) }),
        line({ added_by: "seat-b", created_at: at(-140) }),
        line({ added_by: "seat-b", created_at: at(-131) }),
      ],
      { guestBySeat },
    );
    expect(t[0]!.rounds[0]!.dishes[0]!.guests).toEqual(["Mya", "Aung"]);
  });

  it("the seat is read IN its Send's session — two sessions on one table keep their own guests (`board-tables/guest-wrong-session`)", () => {
    const t = shape(
      [
        line({ added_by: "seat-a", fire_at: at(-200), created_at: at(-210) }),
        line({ cart_id: "c4b", fire_batch: B2, added_by: "seat-a" }),
      ],
      { guestBySeat: new Map([...guestBySeat, [seatKey("s4b", "seat-a"), "Ko"]]) },
    );
    expect(t[0]!.rounds.map((r) => r.dishes[0]!.guests)).toEqual([["Aung"], ["Ko"]]);
  });

  it("a staff-added line, an unknown seat and an empty name map name nobody", () => {
    expect(
      shape([line({ added_by: null })], { guestBySeat })[0]!.rounds[0]!.dishes[0]!.guests,
    ).toEqual([]);
    expect(
      shape([line({ added_by: "seat-z" })], { guestBySeat })[0]!.rounds[0]!.dishes[0]!.guests,
    ).toEqual([]);
    expect(shape([line({ added_by: "seat-a" })])[0]!.rounds[0]!.dishes[0]!.guests).toEqual([]);
  });
});

describe("shapeBoardTables — the shape is the boundary", () => {
  it("publishes a table number, dish names and who added them only: no id, quantity, time or note key anywhere", () => {
    const t = shape(
      [
        line({ added_by: "seat-a" }),
        line({ fire_batch: B2, fire_at: at(-30), state: "served", bumped_at: at(-20) }),
      ],
      { guestBySeat: new Map([[seatKey("s4", "seat-a"), "Aung"]]) },
    );
    const keys = new Set<string>();
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object")
        for (const [k, x] of Object.entries(v)) {
          keys.add(k);
          walk(x);
        }
    };
    walk(t);
    expect([...keys].sort()).toEqual(
      [
        "dishes",
        "guests",
        "name",
        "nameMy",
        "n",
        "next",
        "out",
        "rounds",
        "stage",
        "table",
        "togo",
      ].sort(),
    );
    const flat = JSON.stringify(t);
    // The seat id is the key to a name, never published as is.
    for (const leak of ["c4", "s4", "seat-a", B1, B2, "m-mohinga", NOW.slice(0, 10)])
      expect(flat).not.toContain(leak);
  });
});

describe('kitchenIdle — "All clear" is a claim about the WHOLE kitchen (the blind pass on #336)', () => {
  // The tables are dine-in only, so an empty wall of passes is not an empty wok.
  const counter: PulseSessionRow = {
    id: "sc",
    mode: "pickup",
    status: "active",
    table_number: null,
    expires_at: LIVE,
    qr_code: "reg-ab12",
  };
  /** The re-read's answer when nothing moved: every line is still on the cart it named. */
  const stay = (lines: readonly BoardLineRow[]) => new Map(lines.map((l) => [l.id, l.cart_id]));
  const idle = (
    lines: BoardLineRow[],
    over: {
      carts?: PulseCartRow[];
      sessions?: PulseSessionRow[];
      linesNow?: ReadonlyMap<string, string> | null;
    } = {},
  ) =>
    kitchenIdle({
      lines,
      cartById: new Map([...carts, ...(over.carts ?? [])].map((c) => [c.id, c])),
      sessionById: new Map([...sessions, counter, ...(over.sessions ?? [])].map((s) => [s.id, s])),
      nowIso: NOW,
      linesNow: over.linesNow === undefined ? stay(lines) : over.linesNow,
    });

  it("an empty read is an idle kitchen", () => {
    expect(idle([])).toBe(true);
  });

  it("a PAID pickup bag on the wok keeps the kitchen busy — no table on the wall, and still not all clear (`board-tables/idle-counts-tables-only`)", () => {
    const bag = line({ cart_id: "cp", fulfillment: "togo", fire_batch: B2 });
    expect(shapeBoardTables(input([bag]))).toEqual([]);
    expect(idle([bag])).toBe(false);
  });

  it("a COUNTER order sent before it was paid cooks on an open cart, and keeps the kitchen busy (`board-tables/idle-misses-counter-orders`)", () => {
    const sent = line({ cart_id: "cc", fulfillment: "togo", fire_batch: B2 });
    expect(idle([sent], { carts: [{ id: "cc", session_id: "sc", status: "open" }] })).toBe(false);
  });

  it("a table the wall does not draw — a session past its TTL — still has food on the wok", () => {
    const ghost = sessions.map((s) => (s.id === "s4" ? { ...s, expires_at: at(-1) } : s));
    const l = line();
    expect(shape([l], { sessions: ghost })).toEqual([]);
    expect(kitchenIdle({ ...input([l], { sessions: ghost }), linesNow: stay([l]) })).toBe(false);
  });

  it("food OUT of the wok, or not on it yet, is idle: a served dish, a HELD scheduled pickup, a Send in its grace (`board-tables/idle-counts-served`, `board-tables/idle-counts-held`)", () => {
    expect(idle([line({ state: "served", bumped_at: at(-60) })])).toBe(true);
    // A paid pickup scheduled for later: the KDS draws it HELD, dimmed — nothing is cooking yet.
    expect(idle([line({ cart_id: "cp", fulfillment: "togo", fire_at: at(1800) })])).toBe(true);
    // A dine-in Send inside its 10 s grace is not on the KDS yet.
    expect(idle([line({ fire_at: at(5) })])).toBe(true);
  });

  it("a dish bumped INSIDE Mom's undo window is still cooking — on a pickup bag, a counter order, a table the wall does not draw — exactly as the wall draws it Cooking on a table it does draw (the last blind pass on #336; `board-tables/idle-ignores-the-undo-window`)", () => {
    // Two seconds before the poll's DATABASE clock: a 5 s poll lands inside the window, Mom can still
    // tap Undo, and the dish may go back on the wok. Sixty seconds could not tell the two rules apart.
    const bumped = at(-2);
    expect(Date.parse(NOW) - Date.parse(bumped)).toBeLessThan(KDS_UNDO_MS);
    const ghost = sessions.map((s) => (s.id === "s4" ? { ...s, expires_at: at(-1) } : s));
    const fresh = { state: "served", bumped_at: bumped } as const;
    expect(idle([line({ cart_id: "cp", fulfillment: "togo", ...fresh })])).toBe(false);
    expect(
      idle([line({ cart_id: "cc", fulfillment: "togo", ...fresh })], {
        carts: [{ id: "cc", session_id: "sc", status: "open" }],
      }),
    ).toBe(false);
    const ghostLine = line(fresh);
    expect(
      kitchenIdle({ ...input([ghostLine], { sessions: ghost }), linesNow: stay([ghostLine]) }),
    ).toBe(false);
    // ONE definition in one payload: the table the wall DOES draw reads the same dish Cooking.
    const drawn = line(fresh);
    expect(shape([drawn])[0]!.rounds[0]!.dishes[0]!.stage).toBe("cooking");
    expect(idle([drawn])).toBe(false);
    // The window waited out, the bag is served on both and the kitchen is idle.
    const settled = at(-(KDS_UNDO_MS / 1000));
    expect(
      idle([line({ cart_id: "cp", fulfillment: "togo", state: "served", bumped_at: settled })]),
    ).toBe(true);
  });

  it("a grocery line is never food on the wok — the ONE track gives it no stage, so it neither draws nor holds back 'All clear' (`board-tables/idle-ignores-the-undo-window`)", () => {
    const bag = line({ cart_id: "cp", fulfillment: "grocery", name: "Rice 5lb", state: "fired" });
    expect(shape([bag])).toEqual([]);
    expect(idle([bag])).toBe(true);
  });

  it("a line on a CLEARED or cancelled cart is not cooking — once a re-read finds it still there: a clear leaves a table's lines on its cart, cancelled (the read keeps only open and paid carts; `board-tables/idle-counts-a-dropped-cart`)", () => {
    expect(idle([line({ cart_id: "gone" })])).toBe(true);
    // A table that PAID and was then cleared with food still unbumped: its cart stays paid, its
    // session closes, and the KDS hides it — off the wok once the re-read finds it in place.
    expect(
      idle([line({ cart_id: "cpaid" })], {
        carts: [{ id: "cpaid", session_id: "s-gone", status: "paid" }],
        sessions: [{ ...sessions[0]!, id: "s-gone", status: "closed" }],
      }),
    ).toBe(true);
  });

  it("a line a MERGE moved while the wall read is never called idle: its cart is gone from the cart read, but the line was re-parented, not cleared (Codex round 1 on #336; `board-tables/idle-trusts-a-dropped-cart`)", () => {
    // `mms_merge_table_orders` commits between the line read and the cart read: the line still names
    // the source cart, which the merge cancelled, and its food cooks on the target.
    const moved = line({ cart_id: "c-src" });
    expect(idle([moved], { linesNow: new Map([[moved.id, "c4"]]) })).toBe(false);
    // …or folded it into a matching target line: the source row is gone.
    expect(idle([moved], { linesNow: new Map() })).toBe(false);
    // …and a re-read that did not answer cannot tell a clear from a merge: silence.
    expect(idle([moved], { linesNow: null })).toBe(false);
  });

  it("a merge that lands between the CART read and the SESSION read is never idle either: the cart still reads open, its table closed — the same re-read tells a clear from a merge (Codex round 1 on #336; `board-tables/idle-hidden-is-off`)", () => {
    const merging = { carts: [{ id: "cx", session_id: "s-closed", status: "open" }] };
    const closed = [{ ...sessions[0]!, id: "s-closed", status: "closed" }];
    const l = line({ cart_id: "cx" });
    expect(idle([l], { ...merging, sessions: closed, linesNow: new Map([[l.id, "c4"]]) })).toBe(
      false,
    );
    // A CLEAR between the two reads leaves the line on its cart: off the wok.
    expect(idle([l], { ...merging, sessions: closed })).toBe(true);
  });

  it('a line whose SESSION cannot be read is never called idle — silence is the safe failure of "All clear" (`board-tables/idle-unknown-session-is-idle`)', () => {
    expect(
      idle([line({ cart_id: "cx" })], {
        carts: [{ id: "cx", session_id: "s-missing", status: "open" }],
      }),
    ).toBe(false);
  });

  it("the re-read is asked only when it can change the answer: for the lines the reads place on no live kitchen, and only while nothing else is cooking (`board-tables/idle-rereads-a-busy-kitchen`)", () => {
    const recheck = (ls: BoardLineRow[]) =>
      idleRecheck({
        lines: ls,
        cartById: new Map(carts.map((c) => [c.id, c])),
        sessionById: new Map([...sessions, counter].map((s) => [s.id, s])),
        nowIso: NOW,
      });
    const cleared = line({ cart_id: "gone" });
    expect(recheck([cleared])).toEqual([cleared.id]);
    // A dish cooking on a live table already answers "not idle": no re-read.
    expect(recheck([cleared, line()])).toEqual([]);
    // Nothing unplaced, nothing to ask — a served dish on a dead cart is off the wok either way.
    expect(
      recheck([line(), line({ cart_id: "gone", state: "served", bumped_at: at(-60) })]),
    ).toEqual([]);
    expect(recheck([])).toEqual([]);
  });
});

describe("wallDishLines — the dishes the wall DRAWS, the only ones whose names it asks for (Codex round 1 on #336)", () => {
  it("a drawn table's lines, and nothing else on the wok: no pickup bag, no grocery line, no cleared table, no Send past its linger", () => {
    const drawn = line();
    const lines = [
      drawn,
      line({ cart_id: "cp", fulfillment: "togo", menu_item_id: "m-bag" }),
      line({ cart_id: "cp", fulfillment: "grocery", menu_item_id: "0123456789012" }),
      line({ cart_id: "c7", fire_batch: B3, state: "served", bumped_at: at(-3600) }),
      line({ cart_id: "gone" }),
    ];
    const wall = input(lines);
    expect(wallDishLines(wall).map((l) => l.id)).toEqual([drawn.id]);
    // Exactly the lines `shapeBoardTables` draws a row for.
    expect(shapeBoardTables(wall).flatMap((t) => t.rounds.flatMap((r) => r.dishes))).toHaveLength(
      1,
    );
    expect(wallDishLines(input([lines[1]!, lines[2]!]))).toEqual([]);
  });
});
