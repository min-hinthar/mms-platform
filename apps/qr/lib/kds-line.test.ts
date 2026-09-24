import { describe, expect, it } from "vitest";
import {
  canEightySix,
  lineDescribedBy,
  lineMenuSubject,
  overlaySoldOut,
  pruneSoldOut,
  qtyStands,
  recordSoldOut,
  type SoldOutOverride,
} from "./kds-line";
import type { KitchenLine, KitchenTicket } from "./kitchen-types";

/**
 * Phase 2b · kitchen — the line's decisions, each falsified by a value. The component suite
 * (`KdsBoard.test.tsx`) pins the WIRING; this file pins the rules the wiring reads.
 */
const line = (over: Partial<KitchenLine> = {}): KitchenLine => ({
  id: "line-1",
  menuItemId: "mi-1",
  soldOut: false,
  name: "Mohinga",
  nameMy: null,
  qty: 1,
  modifiers: [],
  modifiersMy: [],
  notes: null,
  state: "fired",
  firedAt: "2026-09-20T18:00:00.000Z",
  fulfillment: "dinein",
  station: "wok",
  ...over,
});
const ticket = (cartId: string, lines: KitchenLine[]): KitchenTicket => ({
  cartId,
  sessionId: `s-${cartId}`,
  channel: "dinein",
  label: "T4",
  tableNumber: 4,
  customerName: null,
  shortCode: null,
  pickupSlot: null,
  held: false,
  firedAt: "2026-09-20T18:00:00.000Z",
  lines,
});

describe("canEightySix — the one offer rule", () => {
  it("a menu dish that is on the menu can be 86'd; a grocery line or a sold-out dish cannot", () => {
    expect(canEightySix(line())).toBe(true);
    expect(canEightySix(line({ menuItemId: null }))).toBe(false);
    // MUTATION kds-line/sold-out-still-offered: drop `&& !line.soldOut` — a dish already off the
    // menu keeps its ⋯ and the sheet offers an 86 the server refuses 'stale'.
    expect(canEightySix(line({ soldOut: true }))).toBe(false);
  });
});

describe("lineDescribedBy — slot first, then the note, never an empty attribute", () => {
  it("joins what exists and answers undefined for nothing", () => {
    expect(lineDescribedBy({ slot: "slot" })).toBe("slot");
    expect(lineDescribedBy({ note: "note" })).toBe("note");
    expect(lineDescribedBy({ slot: "slot", note: "note" })).toBe("slot note");
    // MUTATION kds-line/describedby-empty-string: drop `|| undefined` — '' ships as an attribute.
    expect(lineDescribedBy({})).toBeUndefined();
    expect(lineDescribedBy({ slot: undefined, note: undefined })).toBeUndefined();
  });
});

describe("lineMenuSubject — the LIVE line, across every ticket", () => {
  it("finds the line on any ticket, returns the current object, and null once it has gone", () => {
    const first = ticket("c1", [line({ id: "a", station: "cold" })]);
    const second = ticket("c2", [line({ id: "b", station: "wok" })]);
    expect(lineMenuSubject([first, second], "b")).toBe(second.lines[0]);
    // A poll that flips the dish: the subject is the NEW object, so the sheet sees soldOut:true.
    const flipped = ticket("c2", [line({ id: "b", soldOut: true })]);
    expect(lineMenuSubject([first, flipped], "b")?.soldOut).toBe(true);
    expect(lineMenuSubject([first], "b")).toBeNull();
    expect(lineMenuSubject([first, second], null)).toBeNull();
  });
});

describe("the confirmed override — dropped by POLL SEQUENCE, never 'until the prop agrees'", () => {
  const recorded = recordSoldOut(new Map(), "mi-1", true, 7);

  it("recordSoldOut replaces the entry in a new map", () => {
    const empty = new Map<string, SoldOutOverride>();
    const next = recordSoldOut(empty, "mi-1", true, 7);
    expect(next).not.toBe(empty);
    expect(empty.size).toBe(0);
    expect(next.get("mi-1")).toStrictEqual({ soldOut: true, afterSeq: 7 });
    expect(recordSoldOut(next, "mi-1", false, 9).get("mi-1")).toStrictEqual({
      soldOut: false,
      afterSeq: 9,
    });
  });

  it("survives the poll that was in flight at the write (seq 7) — the same Map back", () => {
    // MUTATION kds-line/override-cleared-by-inflight-poll: `>` → `>=` — the stale poll that started
    // before the write drops the override and the ⋯ comes back on a dish the board just 86'd.
    expect(pruneSoldOut(recorded, 7)).toBe(recorded);
    expect(pruneSoldOut(recorded, 6)).toBe(recorded);
  });

  it("is dropped by the first poll that STARTED after the confirmation, whatever it says", () => {
    // seq 8 says the dish is AVAILABLE — put back on /staff/menu in between. The override must not
    // mask that. MUTATION kds-line/override-never-dropped: the board pins "off the menu" forever.
    const pruned = pruneSoldOut(recorded, 8);
    expect(pruned.has("mi-1")).toBe(false);
    const tickets = [ticket("c1", [line({ soldOut: false })])];
    expect(overlaySoldOut(tickets, pruned)[0]!.lines[0]!.soldOut).toBe(false);
  });

  it("drops only the superseded entries", () => {
    const two = recordSoldOut(recorded, "mi-2", true, 9);
    const pruned = pruneSoldOut(two, 8);
    expect([...pruned.keys()]).toEqual(["mi-2"]);
  });
});

describe("overlaySoldOut — the ONE binding every consumer reads", () => {
  it("flips every line of the dish on every ticket and leaves everything else as the same object", () => {
    const a = ticket("c1", [line({ id: "a1" }), line({ id: "a2", menuItemId: "mi-2" })]);
    const b = ticket("c2", [line({ id: "b1" })]);
    const c = ticket("c3", [line({ id: "c1", menuItemId: "mi-3" })]);
    const out = overlaySoldOut([a, b, c], recordSoldOut(new Map(), "mi-1", true, 1));
    // MUTATION kds-line/override-ignored: the input comes back and the line still offers its ⋯.
    expect(out[0]!.lines[0]!.soldOut).toBe(true);
    expect(out[1]!.lines[0]!.soldOut).toBe(true);
    expect(out[0]!.lines[1]).toBe(a.lines[1]);
    expect(out[2]).toBe(c);
    expect(a.lines[0]!.soldOut).toBe(false); // the snapshot itself is never mutated
  });

  it("returns the input array itself when there is nothing to lay over", () => {
    const tickets = [ticket("c1", [line()])];
    expect(overlaySoldOut(tickets, new Map())).toBe(tickets);
  });

  it("a put-back override (soldOut:false) un-flips a snapshot that still says sold out", () => {
    const tickets = [ticket("c1", [line({ soldOut: true })])];
    const out = overlaySoldOut(tickets, recordSoldOut(new Map(), "mi-1", false, 3));
    expect(out[0]!.lines[0]!.soldOut).toBe(false);
  });
});

describe("qtyStands — only a multiple lights the quantity chip (commit 2)", () => {
  it("1 is quiet; 2 and up stand out", () => {
    // MUTATION kds-line/qty-one-stands: `>= 1` — every chip lit again, a 2 reads like a 1.
    expect(qtyStands(1)).toBe(false);
    expect(qtyStands(2)).toBe(true);
    expect(qtyStands(12)).toBe(true);
  });
});
