import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * W16a — reorder's MODE FORK is a money rule: the re-added line's price is minted by priceItem
 * under the CURRENT session's mode (+15% dine-in / +5% to-go), so collapsing the fork prices a
 * pickup-session reorder at the dine-in factor (the exact class the review's staff-preview MED
 * was). Asserted against the CALL reorder makes (the degenerate-mock lesson) — what fulfillment
 * priceItem was asked to mint, both directions.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("@mms/db/schemas", () => ({
  reorderInput: { safeParse: (x: unknown) => ({ success: true, data: x }) },
}));
vi.mock("./authz", () => ({
  assertCartMember: () =>
    Promise.resolve({ uid: "u-1", sessionId: "s-1", locked: false, settling: false }),
}));
vi.mock("./rate", () => ({ assertMutationRate: () => Promise.resolve() }));
vi.mock("./posthog-server", () => ({ getPostHogClient: () => ({ capture() {}, flush() {} }) }));

const priceItemCalls: { ids: string[]; opts: Record<string, unknown> }[] = [];
vi.mock("./order-lines", () => ({
  priceItem: (_m: string, ids: string[], opts: Record<string, unknown>) => {
    priceItemCalls.push({ ids, opts });
    return Promise.resolve({
      name: "Mohinga",
      unitPriceCents: 1150,
      category: "hot_prepared",
      opts: [],
      optionIds: [],
    });
  },
  insertOrIncLine: () => Promise.resolve(),
  touchCart: () => Promise.resolve(),
}));

const ITEM_ID = "33333333-3333-4333-8333-333333333333";
let sessionMode = "pickup";
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (table: string) => {
      const answer = () => {
        if (table === "qr_orders")
          return { data: { id: "o-1", earned_by: "u-1", status: "paid" }, error: null };
        if (table === "qr_order_items")
          return {
            data: [
              {
                menu_item_id: ITEM_ID,
                name: "Mohinga",
                qty: 1,
                modifiers: [],
                modifier_option_ids: [],
                fulfillment: "togo",
                notes: null,
              },
            ],
            error: null,
          };
        if (table === "table_sessions") return { data: { mode: sessionMode }, error: null };
        if (table === "menu_items")
          return { data: [{ id: ITEM_ID, is_active: true, is_sold_out: false }], error: null };
        return { data: null, error: null };
      };
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => Promise.resolve(answer()),
        in: () => Promise.resolve(answer()),
        maybeSingle: () => Promise.resolve(answer()),
        single: () => Promise.resolve(answer()),
      };
      return chain;
    },
  }),
}));

const { reorderOrder } = await import("./reorder");

beforeEach(() => {
  priceItemCalls.length = 0;
  sessionMode = "pickup";
});

describe("reorderOrder — the session's mode prices the re-added line (W16a)", () => {
  it("a pickup session reorders at togo (×1.05) — never the dine-in factor", async () => {
    const r = await reorderOrder({ cartId: "c-1", orderId: "o-1" });
    expect(r.ok).toBe(true);
    expect(priceItemCalls).toHaveLength(1);
    expect(priceItemCalls[0]?.opts).toEqual({ enforceCardinality: true, fulfillment: "togo" });
  });

  it("a dine-in session reorders at dinein (×1.15) — the other arm of the fork", async () => {
    sessionMode = "dinein";
    const r = await reorderOrder({ cartId: "c-1", orderId: "o-1" });
    expect(r.ok).toBe(true);
    expect(priceItemCalls[0]?.opts).toEqual({ enforceCardinality: true, fulfillment: "dinein" });
  });
});
