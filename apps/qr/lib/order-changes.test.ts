import { describe, expect, it } from "vitest";
import type { CartItem } from "@mms/db";
import { orderChangeNotice, orderChanges, type PendingWrites } from "./order-changes";

/**
 * Lifecycle audit (out-of-stock 2 · diner-live-status 3 · edit-notes 7) — a change someone ELSE made
 * to the order is SAID, once, and a change this phone made is never read back to it.
 */
const ME = "seat-me";
const NONE: PendingWrites = { lineIds: new Set(), dishes: new Set() };
const line = (over: Partial<CartItem>): CartItem => ({
  id: "l1",
  menuItemId: "mohinga",
  name: "Mohinga",
  qty: 1,
  modifiers: [],
  unitPriceCents: 1200,
  taxCents: 0,
  bySeat: ME,
  lineState: "draft",
  fulfillment: "dinein",
  notes: null,
  ...over,
});

describe("orderChanges — what someone else changed", () => {
  it("staff removing a dish is said — with 'we ran out' when that was the reason", () => {
    // MUTATION (lcb/order-changes/void-unsaid): skip the not-voided → voided edge — the dish just
    // vanishes from the strip; red. MUTATION (lcb/order-changes/void-reason-dropped): read the
    // reason as never sold out — nobody is prompted to pick a replacement; red.
    const sent = line({ id: "a", name: "Tea Leaf Salad", lineState: "fired", bySeat: "seat-ana" });
    const out = orderChanges(
      [sent],
      [{ ...sent, lineState: "voided", removedReason: "sold_out" }],
      ME,
      NONE,
    );
    expect(out).toEqual([{ kind: "removed_by_staff", name: "Tea Leaf Salad", soldOut: true }]);
    expect(orderChangeNotice(out)).toBe("We ran out of Tea Leaf Salad — it’s off your order.");
    const plain = orderChanges([sent], [{ ...sent, lineState: "voided" }], ME, NONE);
    expect(orderChangeNotice(plain)).toBe("Our staff removed Tea Leaf Salad from your order.");
  });

  it("the viewer's OWN unsent dish: removed, quantity moved, note cleared or changed", () => {
    const mine = line({ id: "m", qty: 2, notes: "No peanuts — allergy" });
    expect(orderChanges([mine], [], ME, NONE)).toEqual([{ kind: "own_removed", name: "Mohinga" }]);
    expect(orderChanges([mine], [{ ...mine, qty: 1 }], ME, NONE)).toEqual([
      { kind: "own_qty", name: "Mohinga", qty: 1 },
    ]);
    expect(orderChanges([mine], [{ ...mine, notes: null }], ME, NONE)).toEqual([
      { kind: "own_note", name: "Mohinga", cleared: true },
    ]);
    expect(orderChanges([mine], [{ ...mine, notes: "No egg" }], ME, NONE)).toEqual([
      { kind: "own_note", name: "Mohinga", cleared: false },
    ]);
  });

  it("a change THIS phone has in flight is never read back to it — by line, or by the dish an add targets", () => {
    // MUTATION (lcb/order-changes/own-write-announced): drop the pending exclusion — "Mohinga on your
    // order is now 2" right after the diner's own "+"; red.
    const mine = line({ id: "m", qty: 1 });
    const grown = [{ ...mine, qty: 2 }];
    expect(orderChanges([mine], grown, ME, { lineIds: new Set(["m"]), dishes: new Set() })).toEqual(
      [],
    );
    expect(
      orderChanges([mine], grown, ME, { lineIds: new Set(), dishes: new Set(["mohinga"]) }),
    ).toEqual([]);
    expect(orderChanges([mine], [], ME, { lineIds: new Set(["m"]), dishes: new Set() })).toEqual(
      [],
    );
  });

  it("a tablemate's own line, a Send, and an Undo are not 'your order changed'", () => {
    const ana = line({ id: "x", bySeat: "seat-ana" });
    expect(orderChanges([ana], [{ ...ana, qty: 3 }], ME, NONE)).toEqual([]);
    expect(orderChanges([ana], [], ME, NONE)).toEqual([]);
    const mine = line({ id: "m" });
    expect(orderChanges([mine], [{ ...mine, lineState: "fired" }], ME, NONE)).toEqual([]);
    expect(
      orderChanges([{ ...mine, lineState: "fired" }], [{ ...mine, lineState: "draft" }], ME, NONE),
    ).toEqual([]);
  });

  it("a dish a SERVER added (no seat) is said; a diner's add (it has a seat) is realtime's to say", () => {
    const staff = line({ id: "s", name: "Shan Noodles", bySeat: undefined });
    expect(orderChanges([], [staff], ME, NONE)).toEqual([
      { kind: "staff_added", name: "Shan Noodles" },
    ]);
    expect(orderChanges([], [line({ id: "d", bySeat: "seat-ana" })], ME, NONE)).toEqual([]);
  });

  it("an unknown seat diffs nothing of 'yours' (and still tells the table about a removal)", () => {
    const mine = line({ id: "m" });
    expect(orderChanges([mine], [], "", NONE)).toEqual([]);
  });
});

describe("orderChangeNotice — ONE sentence per re-read, never a toast per change", () => {
  it("two changes are both said; more say the first and count the rest", () => {
    // MUTATION (lcb/order-changes/notice-stacks-every-change): join every sentence — five changes
    // become a paragraph the single-slot region cannot hold; red.
    const a = { kind: "own_removed", name: "Mohinga" } as const;
    const b = { kind: "staff_added", name: "Shan Noodles" } as const;
    const c = { kind: "own_qty", name: "Tea", qty: 2 } as const;
    expect(orderChangeNotice([])).toBeNull();
    expect(orderChangeNotice([a])).toBe("Mohinga was taken off your order.");
    expect(orderChangeNotice([a, b])).toBe(
      "Mohinga was taken off your order. Our staff added Shan Noodles to your order.",
    );
    expect(orderChangeNotice([a, b, c])).toBe(
      "Mohinga was taken off your order. And 2 more changes — check your order.",
    );
  });

  it("a dish the kitchen ran out of is said FIRST", () => {
    const out = orderChanges(
      [line({ id: "m", qty: 1 }), line({ id: "t", name: "Tea", lineState: "fired" })],
      [
        line({ id: "m", qty: 2 }),
        line({ id: "t", name: "Tea", lineState: "voided", removedReason: "sold_out" }),
      ],
      ME,
      NONE,
    );
    expect(out[0]).toEqual({ kind: "removed_by_staff", name: "Tea", soldOut: true });
  });
});
