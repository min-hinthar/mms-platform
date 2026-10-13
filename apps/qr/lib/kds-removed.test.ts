import { describe, expect, it } from "vitest";
import { kdsRemovals, mergeRemovals, ownBumpsAfter, removalsForStation } from "./kds-removed";
import type { KitchenLine, KitchenTicket } from "./kitchen-types";

/**
 * The lifecycle audit — the KDS calls out a dish that LEFT its board without a bump, until Got it.
 * Every case is the one a `lck/kds-removed/*` mutant turns red: each fixture separates a void from
 * the bumps, merges and clears that also take a line off the board.
 */
const line = (id: string, over: Partial<KitchenLine> = {}): KitchenLine => ({
  id,
  menuItemId: null,
  soldOut: false,
  name: "Mohinga",
  nameMy: null,
  qty: 1,
  modifiers: [],
  modifiersMy: [],
  notes: null,
  state: "fired",
  firedAt: "2026-10-13T18:00:00.000Z",
  fulfillment: "dinein",
  station: "wok",
  ...over,
});
const card = (
  key: string,
  lines: KitchenLine[],
  over: Partial<KitchenTicket> = {},
): KitchenTicket => ({
  key,
  cartId: "cart-6",
  sessionId: "s-6",
  fireBatch: null,
  round: { kind: "none" },
  stampIso: "2026-10-13T18:00:00.000Z",
  channel: "dinein",
  label: "T6",
  tableNumber: 6,
  customerName: null,
  shortCode: null,
  pickupSlot: null,
  held: false,
  unpaid: false,
  lines,
  firedAt: "2026-10-13T18:00:00.000Z",
  ...over,
});
const none = new Set<string>();
const run = (
  prev: KitchenTicket[],
  next: KitchenTicket[],
  over: { ownBumps?: Set<string>; served?: Set<string> | null; refunded?: Set<string> } = {},
) =>
  kdsRemovals({
    prev,
    next,
    ownBumps: over.ownBumps ?? none,
    served: over.served === undefined ? none : over.served,
    refunded: over.refunded ?? none,
  });

describe("kdsRemovals — a dish that left the board without a bump", () => {
  const mohinga = line("l-mohinga");
  const tea = line("l-tea", { name: "Tea", station: "drinks" });
  const before = [card("b|1", [mohinga, tea])];

  it("a line that left a card still on the board, bumped by nobody, is REMOVED", () => {
    // lck/kds-removed/void-unsaid — the server voided the Mohinga the cook had started; the row
    // vanished from Table 6's card with no word.
    const r = run(before, [card("b|1", [tea])]);
    expect(r.map((x) => [x.key, x.why, x.line.name, x.ticket.tableNumber])).toEqual([
      ["removed:l-mohinga", "removed", "Mohinga", 6],
    ]);
  });

  it("the cook's own tap on this tablet is never an alarm", () => {
    // lck/kds-removed/own-bump-alarms — a per-line Done here would read as "Removed — stop".
    expect(run(before, [card("b|1", [tea])], { ownBumps: new Set(["l-mohinga"]) })).toEqual([]);
  });

  it("a teammate's bump on another tablet carries a stamp on the served rail — not a removal", () => {
    // lck/kds-removed/served-elsewhere-alarms — another tablet's Done is on the rail.
    expect(run(before, [card("b|1", [tea])], { served: new Set(["l-mohinga"]) })).toEqual([]);
  });

  it("an unreadable served rail says nothing: a teammate's Done would read as a void", () => {
    // lck/kds-removed/unknown-rail-guesses — never a false "stop".
    expect(run(before, [card("b|1", [tea])], { served: null })).toEqual([]);
  });

  it("a whole card that leaves is not a removal (a clear has its stop card; a session closed)", () => {
    // lck/kds-removed/whole-card-guesses — a closed session or a cleared table hides every line.
    expect(run(before, [])).toEqual([]);
  });

  it("a line still on the board under ANOTHER card (a merge, a Cook now) never left", () => {
    expect(run(before, [card("b|1", [tea]), card("b|2", [mohinga])])).toEqual([]);
  });

  it("a REFUNDED order's dishes are said whether or not their card is still up — refunded wins", () => {
    // lck/kds-removed/refund-unsaid — a refunded pickup's card left the board silently while the
    // wok kept going; a refund reported for a line still on a live card is said as a refund too.
    const pickup = card("b|9", [line("l-curry", { name: "Curry" })], {
      channel: "pickup",
      tableNumber: null,
      shortCode: "A1B2C3",
    });
    const r = run([pickup], [], { refunded: new Set(["l-curry"]), served: null });
    expect(r.map((x) => [x.key, x.ticket.shortCode])).toEqual([["refunded:l-curry", "A1B2C3"]]);
    // …and the cook's own tap still wins over a refund (she bumped it before the refund landed)
    expect(
      run([pickup], [], { refunded: new Set(["l-curry"]), ownBumps: new Set(["l-curry"]) }),
    ).toEqual([]);
  });

  it("each line once, even if two prior cards held it", () => {
    const r = run([card("b|1", [mohinga, tea]), card("b|1b", [mohinga])], [card("b|1", [tea])]);
    expect(r.map((x) => x.key)).toEqual(["removed:l-mohinga"]);
  });
});

describe("mergeRemovals / removalsForStation / ownBumpsAfter", () => {
  const a = {
    key: "removed:l-a",
    why: "removed" as const,
    line: line("l-a"),
    ticket: card("b|1", []),
  };
  const b = {
    key: "removed:l-b",
    why: "removed" as const,
    line: line("l-b", { station: "drinks" }),
    ticket: card("b|1", []),
  };
  it("a new wave keeps the standing markers and replaces a line's own", () => {
    const refundA = { ...a, key: "refunded:l-a", why: "refunded" as const };
    expect(mergeRemovals([a, b], [refundA]).map((r) => r.key)).toEqual([
      "removed:l-b",
      "refunded:l-a",
    ]);
  });
  it("a station draws only its own dishes; the all view draws every one", () => {
    expect(removalsForStation([a, b], "drinks").map((r) => r.key)).toEqual(["removed:l-b"]);
    expect(removalsForStation([a, b], "all")).toHaveLength(2);
  });
  it("a pending bump stays pending only while its line is on the board", () => {
    // lck/kds-removed/own-bumps-never-pruned — a stale pending id would hide a LATER void of the same
    // line once a recall put it back.
    const left = ownBumpsAfter(new Set(["l-a", "l-b"]), [card("b|1", [line("l-b")])]);
    expect([...left]).toEqual(["l-b"]);
  });
});
