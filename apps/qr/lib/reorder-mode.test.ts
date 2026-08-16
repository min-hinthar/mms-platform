import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * W17a — reorder's session-mode fork. Under W16a this fork chose a PRICE factor; the markup is gone,
 * but the fork itself is still a money rule: it sets the re-added line's routing tag AND, through it,
 * the per-line tax. Cold food is taxable dine-in and EXEMPT to-go (CDTFA Reg 1603), so collapsing the
 * fork silently taxes every pickup reorder of a salad.
 *
 * Asserted against what reaches `insertOrIncLine` — the fixture is a `cold_food` line precisely so the
 * two arms produce DIFFERENT integers (a hot_prepared fixture is taxable either way and would let a
 * collapsed fork pass). The tax integers are computed in Node, never transcribed.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: (fn: () => void) => fn() }));
vi.mock("@mms/db/schemas", () => ({
  reorderInput: { safeParse: (x: unknown) => ({ success: true, data: x }) },
}));
vi.mock("./rate", () => ({ assertMutationRate: () => Promise.resolve() }));
vi.mock("./posthog-server", () => ({
  getPostHogClient: () => ({ capture() {}, flush: () => Promise.resolve() }),
}));
vi.mock("./authz", () => ({
  assertCartMember: () =>
    Promise.resolve({ uid: "u-1", sessionId: "s-1", locked: false, settling: false }),
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

const ITEM = "11111111-1111-4111-8111-111111111111";
const ORDER = "22222222-2222-4222-8222-222222222222";
const CART = "33333333-3333-4333-8333-333333333333";

let sessionMode = "pickup";
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (table: string) => {
      const rows: Record<string, unknown> = {
        qr_orders: { id: ORDER, earned_by: "u-1", status: "paid" },
        table_sessions: { mode: sessionMode },
      };
      const list: Record<string, unknown[]> = {
        qr_order_items: [
          {
            menu_item_id: ITEM,
            name: "Tomato Salad",
            qty: 1,
            modifiers: [],
            modifier_option_ids: [],
            fulfillment: "togo",
            notes: null,
          },
        ],
        menu_items: [{ id: ITEM, is_active: true, is_sold_out: false }],
      };
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        in: () => Promise.resolve({ data: list[table] ?? [], error: null }),
        order: () => chain,
        limit: () => Promise.resolve({ data: list[table] ?? [], error: null }),
        maybeSingle: () => Promise.resolve({ data: rows[table] ?? null, error: null }),
        single: () => Promise.resolve({ data: rows[table] ?? null, error: null }),
        update: () => chain,
      };
      return chain;
    },
  }),
}));

const { reorderOrder } = await import("./reorder");

beforeEach(() => {
  insertCalls.length = 0;
  sessionMode = "pickup";
});

describe("reorderOrder — the session-mode fork tags the line (and with it, the tax)", () => {
  it("a PICKUP session re-adds the line as togo — cold food exempt, tax 0", async () => {
    const r = await reorderOrder({ cartId: CART, orderId: ORDER });
    expect(r.ok).toBe(true);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]?.fulfillment).toBe("togo");
    expect(insertCalls[0]?.taxCents).toBe(0);
  });

  it("a TABLE session re-adds the same line as dinein — cold food taxable, 1200 → 126", async () => {
    sessionMode = "dinein";
    const r = await reorderOrder({ cartId: CART, orderId: ORDER });
    expect(r.ok).toBe(true);
    expect(insertCalls[0]?.fulfillment).toBe("dinein");
    expect(insertCalls[0]?.taxCents).toBe(126); // Math.round(1200 * 0.105)
  });

  it("re-prices at TODAY's value — the historical unit price is never copied", async () => {
    await reorderOrder({ cartId: CART, orderId: ORDER });
    expect(insertCalls[0]?.unitPriceCents).toBe(UNIT);
  });
});
