import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MIN_DISTINCT_ORDERS,
  USUAL_HEADING,
  usualAction,
  usualDishes,
  yourUsual,
  type UsualCandidate,
  type UsualRow,
} from "./your-usual";

const dish = (id: string, name: string, soldOut = false): UsualCandidate => ({ id, name, soldOut });
const CATALOG: UsualCandidate[] = [
  dish("moh", "Mohinga"),
  dish("tea", "Tea Leaf Salad"),
  dish("sam", "Samosa"),
];
/** One history line. `at` only ever matters for the recency tiebreak. */
const row = (menuItemId: string, orderId: string, at = "2026-08-01T00:00:00Z"): UsualRow => ({
  menuItemId,
  orderId,
  orderedAt: at,
});

describe("yourUsual", () => {
  it("says NOTHING below the threshold — one visit is not a habit", () => {
    // Rule 5. A card that appears for a first-timer is a guess wearing recognition's clothes.
    expect(yourUsual([row("moh", "o1")], CATALOG)).toEqual({ state: "none" });
    expect(yourUsual([], CATALOG)).toEqual({ state: "none" });
  });

  it("⚠️ counts DISTINCT ORDERS, never quantity — three teas in one sitting is not a habit", () => {
    // Rule 1, and the separating case: identical row COUNT, opposite verdicts. Same dish three times
    // within one order must stay silent, while the same dish across two orders qualifies.
    const oneBigOrder = [row("moh", "o1"), row("moh", "o1"), row("moh", "o1")];
    expect(yourUsual(oneBigOrder, CATALOG)).toEqual({ state: "none" });
    const twoVisits = [row("moh", "o1"), row("moh", "o2")];
    expect(yourUsual(twoVisits, CATALOG)).toEqual({
      state: "single",
      items: [dish("moh", "Mohinga")],
    });
  });

  it("⚠️ NEVER joins two dishes with a + unless they were actually ordered together", () => {
    // Rule 2 — the honesty core. Both dishes qualify independently, but they never shared an order,
    // so "Mohinga + Tea" would assert a pairing that never happened.
    const separateHabits = [row("moh", "o1"), row("moh", "o2"), row("tea", "o3"), row("tea", "o4")];
    const out = yourUsual(separateHabits, CATALOG);
    expect(out.state).toBe("single");
    expect(usualDishes(out)).not.toContain("+");

    // The separating case: same two dishes, same counts — but now genuinely co-ordered.
    const realPair = [row("moh", "o1"), row("tea", "o1"), row("moh", "o2"), row("tea", "o2")];
    const paired = yourUsual(realPair, CATALOG);
    expect(paired.state).toBe("pair");
    expect(usualDishes(paired)).toBe("Mohinga + Tea Leaf Salad");
  });

  it("needs the pair to have co-occurred TWICE, not once", () => {
    // One shared order is a coincidence; the threshold is the same MIN_DISTINCT_ORDERS as everywhere.
    const sharedOnce = [row("moh", "o1"), row("tea", "o1"), row("moh", "o2"), row("tea", "o3")];
    expect(yourUsual(sharedOnce, CATALOG).state).toBe("single");
  });

  it("⚠️ drops sold-out dishes BEFORE ranking, so the runner-up survives", () => {
    // Rule 4. Mohinga is the stronger habit but is 86'd today; the diner should be offered the dish
    // they CAN have, not nothing — and never the one they cannot (the W23a last-tap refusal).
    const rows = [
      row("moh", "o1"),
      row("moh", "o2"),
      row("moh", "o3"),
      row("tea", "o1"),
      row("tea", "o2"),
    ];
    const soldOut = [
      dish("moh", "Mohinga", true),
      dish("tea", "Tea Leaf Salad"),
      dish("sam", "Samosa"),
    ];
    const out = yourUsual(rows, soldOut);
    expect(out).toEqual({ state: "single", items: [dish("tea", "Tea Leaf Salad")] });
    expect(usualDishes(out)).not.toContain("Mohinga");
  });

  it("drops dishes that have left the menu entirely", () => {
    // Not in today's catalog at all — a discontinued dish is as unofferable as a sold-out one.
    const rows = [row("gone", "o1"), row("gone", "o2")];
    expect(yourUsual(rows, CATALOG)).toEqual({ state: "none" });
  });

  it("⚠️ breaks a tie on RECENCY, not on row order", () => {
    // Rule 3. Both dishes sit at exactly two orders. Returning whichever the database happened to
    // list first would invent a preference; the newest order is a fact the history actually holds.
    const tied = [
      row("moh", "o1", "2026-01-01T00:00:00Z"),
      row("moh", "o2", "2026-01-02T00:00:00Z"),
      row("tea", "o3", "2026-06-01T00:00:00Z"),
      row("tea", "o4", "2026-06-02T00:00:00Z"),
    ];
    expect(yourUsual(tied, CATALOG)).toEqual({
      state: "single",
      items: [dish("tea", "Tea Leaf Salad")],
    });
    // Reversing the INPUT order must not change the answer — that is what proves it is not row order.
    expect(yourUsual([...tied].reverse(), CATALOG)).toEqual({
      state: "single",
      items: [dish("tea", "Tea Leaf Salad")],
    });
  });

  it("prefers the stronger habit when counts differ, regardless of recency", () => {
    // The separating case for the tiebreak: recency must only decide EQUAL counts, never outrank one.
    const rows = [
      row("moh", "o1", "2026-01-01T00:00:00Z"),
      row("moh", "o2", "2026-01-02T00:00:00Z"),
      row("moh", "o3", "2026-01-03T00:00:00Z"),
      row("tea", "o4", "2026-07-01T00:00:00Z"),
      row("tea", "o5", "2026-07-02T00:00:00Z"),
    ];
    expect(yourUsual(rows, CATALOG)).toEqual({ state: "single", items: [dish("moh", "Mohinga")] });
  });
});

describe("the copy", () => {
  it("ASKS rather than tells, and never quotes a count", () => {
    // Two orders is enough to ask and nowhere near enough to tell. A question that misses is a shrug;
    // a statement that misses is the app claiming to know someone it does not.
    expect(USUAL_HEADING).toContain("?");
    expect(USUAL_HEADING).not.toMatch(/\d/);
  });

  it("agrees its action label with how many dishes are actually added", () => {
    const pair = yourUsual(
      [row("moh", "o1"), row("tea", "o1"), row("moh", "o2"), row("tea", "o2")],
      CATALOG,
    );
    const single = yourUsual([row("moh", "o1"), row("moh", "o2")], CATALOG);
    expect(usualAction(pair)).toBe("Add both");
    expect(usualAction(single)).toBe("Add it");
    expect(usualDishes({ state: "none" })).toBe("");
  });

  it("pins the threshold that every rule shares", () => {
    expect(MIN_DISTINCT_ORDERS).toBe(2);
  });
});

describe("the read is scoped to the caller — guarded as TEXT, not by import", () => {
  // `your-usual-read.ts` imports `server-only`, which this node runner refuses, so it can never be
  // imported here and can carry no mutant. Its security-critical lines are therefore asserted against
  // the SOURCE: reading a file needs no module resolution. Crude, and it is the difference between a
  // rule that is enforced and a rule that is merely written down in a header comment.
  const src = readFileSync(new URL("./your-usual-read.ts", import.meta.url), "utf8");

  it("⚠️ pins the history query to the caller's OWN uid", () => {
    // Without this the card would show one diner another diner's habits — a privacy breach carried
    // by a decorative surface, which is exactly where nobody would think to look for one.
    expect(src).toContain('.eq("qr_orders.earned_by", user.id)');
    expect(src).toContain('.eq("qr_orders.status", "paid")');
  });

  it("⚠️ takes NO uid parameter — the uid comes from the verified session only", () => {
    // The moment this accepts a uid it becomes an endpoint for reading strangers' habits, so the
    // SIGNATURE is the guard. `catalog` is the only argument it may have.
    const sig = /export async function getYourUsual\(([^)]*)\)/.exec(src)?.[1] ?? "";
    expect(sig).toContain("catalog");
    expect(sig).not.toMatch(/uid|userId|user_id/i);
  });

  it("degrades to silence rather than throwing on the busiest page in the app", () => {
    expect(src).toContain("} catch {");
    expect(src).toContain('return { state: "none" }');
  });
});
