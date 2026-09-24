import { describe, expect, it } from "vitest";
import {
  dropLeaving,
  firedSince,
  landingAfter,
  mergeLeaving,
  reconcileLines,
  renderedOrder,
  type Leaving,
  type LineMotionState,
} from "./line-motion";

/**
 * Phase 1c · cart-motion — the pure half of a removed line's exit, value-falsified. Each case names
 * the mutation that breaks it where the assertion lives. The DOM half (FLIP, the tap hold, focus) is
 * wired in `components/useLineMotion.ts` and pinned through the real /cart in `Checkout.test.tsx`.
 */
type Row = { id: string; g: string };
const r = (id: string, g = "g1"): Row => ({ id, g });
const group = (t: Row) => t.g;
const EMPTY: LineMotionState<Row> = { leaving: [], gone: [] };
const KEEP = { group, reset: false };
const RESET = { group, reset: true };
const A = r("A");
const B = r("B");
const C = r("C");
const D = r("D");
const ids = (rows: { item: Row }[]) => rows.map((x) => x.item.id);
const at = (l: Leaving<Row>) => [l.item.id, l.after];

describe("reconcileLines + mergeLeaving — a removed row keeps its place", () => {
  it("a removed row keeps its place", () => {
    const s = reconcileLines([A, B, C], [A, C], EMPTY, KEEP);
    expect(s.leaving.map(at)).toEqual([["B", "A"]]);
    expect(s.removed).toEqual(["B"]);
    const drawn = mergeLeaving([A, C], s.leaving);
    // MUTATION: anchor to the FOLLOWING row, or append leavers at the end → [A, C, B], red.
    expect(ids(drawn)).toEqual(["A", "B", "C"]);
    expect(drawn.map((x) => x.leaving)).toEqual([false, true, false]);
  });

  it("the first row's ghost is anchored to nothing and drawn first", () => {
    const s = reconcileLines([A, B], [B], EMPTY, KEEP);
    expect(s.leaving.map(at)).toEqual([["A", null]]);
    expect(ids(mergeLeaving([B], s.leaving))).toEqual(["A", "B"]);
  });

  it("a returning id loses its ghost and is reported", () => {
    // Case 1 — the ghost is still mounted (a refusal inside the fade).
    const s1 = reconcileLines(
      [A, C],
      [A, B, C],
      { leaving: [{ item: B, after: "A" }], gone: [] },
      KEEP,
    );
    // MUTATION: drop the live-id filter on existing leavers → B still leaving, red.
    expect(s1.leaving).toEqual([]);
    expect(s1.returned).toEqual(["B"]);
    // Case 2 — the ghost had already dropped; only `gone` remembers it.
    const s2 = reconcileLines([A, C], [A, B, C], { leaving: [], gone: ["B"] }, KEEP);
    // MUTATION: ignore `gone` → returned [], red.
    expect(s2.returned).toEqual(["B"]);
    expect(s2.gone).toEqual([]);
    // The renderer's half: a leaver whose id is live again is skipped, so ids stay unique.
    // MUTATION: mergeLeaving keeps a revived leaver → a duplicate B, red.
    const drawn = mergeLeaving([A, B, C], [{ item: B, after: "A" }]);
    expect(ids(drawn)).toEqual(["A", "B", "C"]);
    expect(drawn.find((x) => x.item.id === "B")!.leaving).toBe(false);
  });

  it("a section move is not a removal", () => {
    const s = reconcileLines(
      [r("A", "g1"), r("B", "g1")],
      [r("A", "g2"), r("B", "g1")],
      EMPTY,
      KEEP,
    );
    // MUTATION: diff on id + group → A reads as removed and leaves a ghost behind, red.
    expect(s.leaving).toEqual([]);
    expect(s.removed).toEqual([]);
  });

  it("anchors stay inside the group", () => {
    const prev = [r("A", "g1"), r("B", "g2"), r("C", "g1")];
    const s = reconcileLines(prev, [prev[0]!, prev[1]!], EMPTY, KEEP);
    // MUTATION: ignore the group when anchoring → 'B', a row in another section, red.
    expect(s.leaving.map(at)).toEqual([["C", "A"]]);
  });

  it("two quick removals keep order; dropping the first re-anchors the second", () => {
    const s1 = reconcileLines([A, B, C, D], [A, C, D], EMPTY, KEEP);
    const s2 = reconcileLines([A, C, D], [A, D], s1, KEEP);
    expect(s2.leaving.map(at)).toEqual([
      ["B", "A"],
      ["C", "B"],
    ]);
    expect(ids(mergeLeaving([A, D], s2.leaving))).toEqual(["A", "B", "C", "D"]);
    const dropped = dropLeaving(s2.leaving, "B");
    // MUTATION: drop without re-anchoring → C anchored to a row that is gone → [C, A, D], red.
    expect(dropped.map(at)).toEqual([["C", "A"]]);
    expect(ids(mergeLeaving([A, D], dropped))).toEqual(["A", "C", "D"]);
  });

  it("two rows removed by ONE refresh keep their order", () => {
    const s = reconcileLines([A, B, C, D], [A, D], EMPTY, KEEP);
    expect(ids(mergeLeaving([A, D], s.leaving))).toEqual(["A", "B", "C", "D"]);
  });

  it("no ghost into an emptied list or an emptied section, but the removal is still reported", () => {
    // An EXISTING leaver is what separates the empty-list clause from the section clause: a new
    // removal into an empty list has no surviving section anyway.
    const s1 = reconcileLines([A], [], { leaving: [{ item: B, after: "A" }], gone: ["B"] }, KEEP);
    // MUTATION: delete the `next.length === 0` clause → B's ghost outlives the list, red.
    expect(s1.leaving).toEqual([]);
    expect(s1.removed).toEqual(["A"]);
    const s2 = reconcileLines([r("A", "g1"), r("B", "g2")], [r("A", "g1")], EMPTY, KEEP);
    // MUTATION: delete the group-survives clause → a ghost under a section that is gone, red.
    expect(s2.leaving).toEqual([]);
    // MUTATION: suppress `removed` along with the ghost → the focus rule never hears of it, red.
    expect(s2.removed).toEqual(["B"]);
  });

  it("reset clears everything", () => {
    const s = reconcileLines(
      [A, C],
      [A],
      { leaving: [{ item: B, after: "A" }], gone: ["B"] },
      RESET,
    );
    // MUTATION: ignore `reset` → the order screen's ghosts follow the diner onto the bill, red.
    expect(s).toEqual({ leaving: [], gone: [], removed: [], returned: [] });
  });

  it("remembers only the most recent removals", () => {
    const many = Array.from({ length: 70 }, (_, i) => r(`x${i}`));
    const s = reconcileLines([...many, A], [A], EMPTY, KEEP);
    expect(s.gone).toHaveLength(64);
    expect(s.gone[s.gone.length - 1]).toBe("x69");
  });
});

describe("landingAfter — the neighbour, never the top of the page", () => {
  it("lands on the next dish, else the previous one, else nothing", () => {
    // MUTATION: backward-first → 'A' in case 1, red.
    expect(landingAfter(["A", "B", "C"], "B", new Set(["A", "C"]))).toBe("C");
    // MUTATION: skip the backward scan → null, red.
    expect(landingAfter(["A", "B", "C"], "B", new Set(["A"]))).toBe("A");
    expect(landingAfter(["A", "B", "C"], "B", new Set())).toBeNull();
    expect(landingAfter(["A", "B", "C"], "Z", new Set(["A"]))).toBeNull();
  });
});

describe("renderedOrder — section by section, as the page draws it", () => {
  it("orders by the group order, keeping live order inside a group", () => {
    const items = [r("X", "g2"), r("A", "g1"), r("Y", "g2"), r("B", "g1")];
    // MUTATION: return the items in list order → [X, A, Y, B], red.
    expect(renderedOrder(items, group, ["g1", "g2"])).toEqual(["A", "B", "X", "Y"]);
  });
});

describe("firedSince — a removal is never a firing", () => {
  it("counts a draft that is still here and no longer a draft, and nothing else", () => {
    // MUTATION: count-based (`draft.size < prevDraft.length`) → a REMOVED draft reads as fired, red.
    expect(firedSince(["A", "B"], new Set(["A"]), new Set(["A"]))).toBe(false);
    expect(firedSince(["A", "B"], new Set(["A", "B"]), new Set(["B"]))).toBe(true);
  });
});
