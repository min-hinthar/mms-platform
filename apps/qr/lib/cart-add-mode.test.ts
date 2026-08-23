import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * M108 — `addItem`'s session-mode fork, the busiest money fork in the app: it sets every added
 * line's routing tag and, through the tag, its per-line tax.
 *
 * `reorder-mode.test.ts` has guarded the same rule on the re-add path since W17a. This path — the one
 * a diner takes on every single tap of Add — had none, and that is how it carried a defect for as
 * long as it did: the fork read `table_sessions.mode` in a SECOND query whose `{ error }` was
 * discarded, so an unreadable session resolved to `undefined !== "dinein"` and tagged a real dine-in
 * table's food `togo` at the to-go tax. Under-collection is the direction M97 calls the legally
 * worse one, and nothing in the suite could see it.
 *
 * The fix deleted the second read: the mode now rides out of `assertCartMember`, which took it off
 * the same row it used to prove the session active and throws 503 when that read fails. So the DB
 * mock below carries NO `table_sessions` row — re-introducing the second read makes `dineIn` collapse
 * to false and turns the dine-in case red.
 *
 * Asserted against what reaches `insertOrIncLine`, with a `cold_food` fixture precisely because it is
 * the one shape whose two arms produce DIFFERENT integers (CDTFA Reg 1603: cold food is taxable
 * dine-in, exempt to-go — a `hot_prepared` fixture is taxable either way and would let a collapsed
 * fork pass). The tax integers are computed by the real `lineTax`, never transcribed.
 */

/** The session's mode, as `assertCartMember` reports it. */
let sessionMode = "pickup";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: (fn: () => void) => fn() }));
vi.mock("./rate", () => ({
  assertMutationRate: () => Promise.resolve(),
  withinMutationRate: () => Promise.resolve(true),
}));
vi.mock("./posthog-server", () => ({
  getPostHogClient: () => ({ capture() {}, flush: () => Promise.resolve() }),
}));
vi.mock("./authz", () => ({
  assertCartMember: () =>
    Promise.resolve({
      uid: "u-1",
      sessionId: "s-1",
      role: "guest",
      locked: false,
      lockedBy: null,
      settling: false,
      settleBy: null,
      mode: sessionMode,
    }),
  assertCartItemMember: () => Promise.resolve({ uid: "u-1", sessionId: "s-1", role: "guest" }),
  AuthzError: class extends Error {},
}));

const UNIT = 1200;
const insertCalls: { fulfillment: unknown; taxCents: unknown; unitPriceCents: unknown }[] = [];
vi.mock("./order-lines", () => ({
  // A COLD line: taxable dine-in, exempt to-go — the only shape that separates the two arms.
  priceItem: () =>
    Promise.resolve({
      name: "Tomato Salad",
      unitPriceCents: UNIT,
      category: "cold_food",
      opts: [],
      optionIds: [],
    }),
  insertOrIncLine: (
    _cartId: string,
    line: { fulfillment?: unknown; taxCents?: unknown; unitPriceCents?: unknown },
  ) => {
    insertCalls.push({
      fulfillment: line.fulfillment,
      taxCents: line.taxCents,
      unitPriceCents: line.unitPriceCents,
    });
    return Promise.resolve();
  },
  touchCart: () => Promise.resolve(),
}));

// The view `addItem` returns afterwards is not what this file is about — stub it to a constant so a
// failure here can only ever be the fork.
vi.mock("./totals", () => ({ getCartTotals: () => Promise.resolve({ totalCents: 0 }) }));

const ITEM = "11111111-1111-4111-8111-111111111111";
const CART = "33333333-3333-4333-8333-333333333333";

// No `table_sessions` here on purpose (see the header): the fork must not need a second read.
vi.mock("@mms/db/server", () => ({
  serviceClient: () => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      in: () => Promise.resolve({ data: [], error: null }),
      or: () => chain,
      order: () => Promise.resolve({ data: [], error: null }),
      limit: () => Promise.resolve({ data: [], error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      single: () => Promise.resolve({ data: null, error: null }),
      update: () => chain,
    };
    return { from: () => chain, rpc: () => Promise.resolve({ data: null, error: null }) };
  },
}));

const { addItem } = await import("./cart");

beforeEach(() => {
  insertCalls.length = 0;
  sessionMode = "pickup";
});

describe("addItem — the session-mode fork tags the line (and with it, the tax)", () => {
  it("a PICKUP session adds the line as togo — cold food exempt, tax 0", async () => {
    await addItem(CART, ITEM);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]?.fulfillment).toBe("togo");
    expect(insertCalls[0]?.taxCents).toBe(0);
  });

  it("a TABLE session adds the same line as dinein — cold food taxable", async () => {
    sessionMode = "dinein";
    await addItem(CART, ITEM);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]?.fulfillment).toBe("dinein");
    // Computed by the real lineTax on the same UNIT, never transcribed — the two arms must differ.
    const { lineTax } = await import("./tax");
    expect(insertCalls[0]?.taxCents).toBe(lineTax(UNIT, "cold_food", true));
    expect(lineTax(UNIT, "cold_food", true)).toBeGreaterThan(0);
  });

  it("a GROCERY/scan session is togo too — only 'dinein' is dine-in", async () => {
    sessionMode = "grocery";
    await addItem(CART, ITEM);
    expect(insertCalls[0]?.fulfillment).toBe("togo");
  });

  it("charges the SAME unit price either way — the fork moves the tag and the tax, never the price", async () => {
    await addItem(CART, ITEM);
    sessionMode = "dinein";
    await addItem(CART, ITEM);
    expect(insertCalls).toHaveLength(2);
    expect(insertCalls[0]?.unitPriceCents).toBe(UNIT);
    expect(insertCalls[1]?.unitPriceCents).toBe(UNIT);
  });
});
