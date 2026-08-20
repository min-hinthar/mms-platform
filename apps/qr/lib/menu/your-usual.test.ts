import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MIN_DISTINCT_DAYS,
  USUAL_HEADING,
  USUAL_WINDOW_DAYS,
  laDayKey,
  usualAction,
  usualDishes,
  yourUsual,
  type UsualCandidate,
  type UsualRow,
} from "./your-usual";

const dish = (id: string, name: string, soldOut = false, needsChoice = false): UsualCandidate => ({
  id,
  name,
  soldOut,
  needsChoice,
});
const CATALOG: UsualCandidate[] = [
  dish("moh", "Mohinga"),
  dish("tea", "Tea Leaf Salad"),
  dish("sam", "Samosa"),
];
/** A line on a given LA day. Noon local, so no case straddles a UTC boundary by accident. */
const on = (menuItemId: string, day: string, orderId = `${day}-1`): UsualRow => ({
  menuItemId,
  orderId,
  orderedAt: `${day}T20:00:00Z`, // 20:00Z = 13:00 in LA — comfortably inside the same LA day
});

describe("yourUsual", () => {
  it("says NOTHING below the threshold — one visit is not a habit", () => {
    expect(yourUsual([on("moh", "2026-08-01")], CATALOG)).toEqual({ state: "none" });
    expect(yourUsual([], CATALOG)).toEqual({ state: "none" });
  });

  it("⚠️ counts distinct DAYS — not rows, and not orders", () => {
    // Rule 1, with the two separating cases the first version failed.
    // (a) three of the same dish in ONE order is one occurrence.
    const oneOrder = [on("moh", "2026-08-01"), on("moh", "2026-08-01"), on("moh", "2026-08-01")];
    expect(yourUsual(oneOrder, CATALOG)).toEqual({ state: "none" });

    // (b) TWO ORDERS IN ONE SITTING is still one occurrence. The session mints a fresh cart after
    // each payment, so a second round or a forgotten drink is a second order id an hour later —
    // counting orders would have called that a habit after a single evening.
    const twoOrdersOneNight: UsualRow[] = [
      { menuItemId: "moh", orderId: "round-1", orderedAt: "2026-08-01T02:00:00Z" }, // Jul 31, 7pm LA
      { menuItemId: "moh", orderId: "round-2", orderedAt: "2026-08-01T03:10:00Z" }, // Jul 31, 8:10pm LA
    ];
    expect(yourUsual(twoOrdersOneNight, CATALOG)).toEqual({ state: "none" });

    // (c) two different days DOES qualify.
    const twoDays = [on("moh", "2026-08-01"), on("moh", "2026-08-09")];
    expect(yourUsual(twoDays, CATALOG)).toEqual({
      state: "single",
      items: [dish("moh", "Mohinga")],
    });
  });

  it("⚠️ NEVER joins two dishes with a + unless they were ordered together", () => {
    // Rule 2. Both qualify independently, but never on the same day — "Mohinga + Tea" would assert
    // a meal that never happened.
    const separate = [
      on("moh", "2026-08-01"),
      on("moh", "2026-08-02"),
      on("tea", "2026-08-05"),
      on("tea", "2026-08-06"),
    ];
    const out = yourUsual(separate, CATALOG);
    expect(out.state).toBe("single");
    expect(usualDishes(out)).not.toContain("+");

    // The separating case: same dishes, same counts, now genuinely co-ordered.
    const together = [
      on("moh", "2026-08-01"),
      on("tea", "2026-08-01"),
      on("moh", "2026-08-02"),
      on("tea", "2026-08-02"),
    ];
    const paired = yourUsual(together, CATALOG);
    expect(paired.state).toBe("pair");
    expect(usualDishes(paired)).toBe("Mohinga + Tea Leaf Salad");
  });

  it("needs the pair to have co-occurred on TWO days, not one", () => {
    const sharedOnce = [
      on("moh", "2026-08-01"),
      on("tea", "2026-08-01"),
      on("moh", "2026-08-02"),
      on("tea", "2026-08-07"),
    ];
    expect(yourUsual(sharedOnce, CATALOG).state).toBe("single");
  });

  it("⚠️ never offers a dish that REQUIRES A CHOICE — a bare add throws server-side", () => {
    // Rule 4, and the defect the review caught: `priceItem`'s enforceCardinality throws for any item
    // with a min_select>=1 group, and this card adds with no modifiers. Burmese Milk Tea is one of
    // them, which made the proposal's own "Mohinga + Tea" example the broken case.
    const rows = [
      on("tea", "2026-08-01"),
      on("tea", "2026-08-02"),
      on("tea", "2026-08-03"),
      on("moh", "2026-08-01"),
      on("moh", "2026-08-02"),
    ];
    const catalog = [
      dish("moh", "Mohinga"),
      dish("tea", "Tea Leaf Salad", false, true), // required choice
      dish("sam", "Samosa"),
    ];
    // Tea is the stronger habit and is dropped anyway; Mohinga — which CAN be one-tapped — survives.
    expect(yourUsual(rows, catalog)).toEqual({ state: "single", items: [dish("moh", "Mohinga")] });
  });

  it("⚠️ drops sold-out dishes BEFORE ranking, so the runner-up survives", () => {
    const rows = [
      on("moh", "2026-08-01"),
      on("moh", "2026-08-02"),
      on("moh", "2026-08-03"),
      on("tea", "2026-08-01"),
      on("tea", "2026-08-02"),
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
    expect(yourUsual([on("gone", "2026-08-01"), on("gone", "2026-08-02")], CATALOG)).toEqual({
      state: "none",
    });
  });

  it("⚠️ breaks a tie on RECENCY, not on row order", () => {
    const tied = [
      on("moh", "2026-01-01"),
      on("moh", "2026-01-02"),
      on("tea", "2026-06-01"),
      on("tea", "2026-06-02"),
    ];
    const expected = { state: "single", items: [dish("tea", "Tea Leaf Salad")] };
    expect(yourUsual(tied, CATALOG)).toEqual(expected);
    // Reversing the INPUT must not change the answer — that is what proves it is not row order.
    expect(yourUsual([...tied].reverse(), CATALOG)).toEqual(expected);
  });

  it("⚠️ tracks the NEWEST day per dish, not the oldest", () => {
    // Separating fixture for the recency accumulator: the two dishes' ranges OVERLAP, so min and max
    // disagree. Mohinga was eaten most recently (Aug) and must win; tracking the oldest would pick
    // Tea (Feb vs Mohinga's Jan). The earlier fixture had disjoint ranges and could not tell them
    // apart — a degenerate fixture, which is what a surviving mutant means.
    const overlapping = [
      on("moh", "2026-01-01"),
      on("moh", "2026-08-01"),
      on("tea", "2026-02-01"),
      on("tea", "2026-03-01"),
    ];
    expect(yourUsual(overlapping, CATALOG)).toEqual({
      state: "single",
      items: [dish("moh", "Mohinga")],
    });
  });

  it("prefers the stronger habit when counts differ, regardless of recency", () => {
    const rows = [
      on("moh", "2026-01-01"),
      on("moh", "2026-01-02"),
      on("moh", "2026-01-03"),
      on("tea", "2026-07-01"),
      on("tea", "2026-07-02"),
    ];
    expect(yourUsual(rows, CATALOG)).toEqual({ state: "single", items: [dish("moh", "Mohinga")] });
  });
});

describe("laDayKey", () => {
  it("⚠️ uses the RESTAURANT's day, so one late dinner is never two days", () => {
    // 03:00Z on Aug 2 is 8pm on Aug 1 in Covina. Counting UTC days would split a single evening in
    // two and hand out a "usual" after one sitting.
    expect(laDayKey("2026-08-02T03:00:00Z")).toBe("2026-08-01");
    expect(laDayKey("2026-08-02T20:00:00Z")).toBe("2026-08-02");
  });

  it("returns '' for an unparseable stamp rather than inventing a day", () => {
    expect(laDayKey("not-a-date")).toBe("");
  });
});

describe("the copy and the bounds", () => {
  it("ASKS rather than tells, and never quotes a count", () => {
    expect(USUAL_HEADING).toContain("?");
    expect(USUAL_HEADING).not.toMatch(/\d/);
  });

  it("agrees its action label with how many dishes are actually added", () => {
    const pair = yourUsual(
      [
        on("moh", "2026-08-01"),
        on("tea", "2026-08-01"),
        on("moh", "2026-08-02"),
        on("tea", "2026-08-02"),
      ],
      CATALOG,
    );
    const single = yourUsual([on("moh", "2026-08-01"), on("moh", "2026-08-02")], CATALOG);
    expect(usualAction(pair)).toBe("Add both");
    expect(usualAction(single)).toBe("Add it");
    expect(usualDishes({ state: "none" })).toBe("");
  });

  it("pins BOTH honesty bounds", () => {
    // The window decides whether "usual" describes who the diner is NOW. It was previously pinned by
    // nothing — a surviving mutant at 3650 days proved it, so it is asserted here.
    expect(MIN_DISTINCT_DAYS).toBe(2);
    expect(USUAL_WINDOW_DAYS).toBe(90);
  });
});

describe("the read is scoped to the caller — guarded as TEXT, not by import", () => {
  // `your-usual-read.ts` imports `server-only`, which this node runner refuses, so it can never be
  // imported here and can carry no mutant. Its security-critical lines are asserted against the
  // SOURCE instead — reading a file needs no module resolution.
  //
  // ⚠️ COMMENTS ARE STRIPPED FIRST. The first version asserted on raw source, and review proved the
  // bypass: move the scoping into a comment, replace the query with an unscoped read, and all the
  // assertions still passed. The header of that file paraphrases the query in prose, which makes
  // that edit the natural one — so a guard that a comment can satisfy is not a guard.
  const raw = readFileSync(new URL("./your-usual-read.ts", import.meta.url), "utf8");
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("⚠️ pins the history query to the caller's OWN uid", () => {
    expect(src).toContain('.eq("qr_orders.earned_by", user.id)');
    expect(src).toContain('.eq("qr_orders.status", "paid")');
  });

  it("⚠️ verifies the session with getUser(), never getSession()", () => {
    // `getSession()` decodes the auth cookie WITHOUT checking it against GoTrue, so a tampered cookie
    // would hand an arbitrary uid into an RLS-bypassing service-role query. Review proved the swap
    // passed every other assertion.
    expect(src).toContain("auth.getUser()");
    expect(src).not.toContain("getSession");
  });

  it("⚠️ counts only history where the payer is certainly the eater", () => {
    // `qr_order_items` carries no seat, so a dine-in host owns every guest's dish in this data.
    expect(src).toContain('.neq("fulfillment", "dinein")');
    // A partial refund leaves status='paid' (W23b), so the line filter is the only signal.
    expect(src).toContain('.eq("refunded_cents", 0)');
  });

  it("takes NO uid parameter — the uid comes from the verified session only", () => {
    const sig = /export async function getYourUsual\(([^)]*)\)/.exec(src)?.[1] ?? "";
    expect(sig).toContain("catalog");
    expect(sig).not.toMatch(/uid|userId|user_id/i);
  });

  it("degrades to silence rather than throwing on the busiest page in the app", () => {
    expect(src).toContain("} catch {");
    expect(src).toContain('return { state: "none" }');
  });
});
