import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * W16a review MED — the dinein↔togo toggle's RE-PRICE block had zero coverage and no mutant: the
 * exact-vs-rescale preference, the legacy refusal, and the p_unit_price_cents forward could each be
 * deleted with every gate green. Asserted against the CALLS the module makes (the degenerate-mock
 * lesson): what priceItem was asked, and what integer reached the RPC.
 *
 * Numbers computed in Node, never transcribed:
 *   exact path       → whatever priceItem answers (2100 in the fixture) rides to the RPC verbatim
 *   rescale fallback → stored 1150 dinein→togo = round25(1150×1.05/1.15) = 1050
 */

vi.mock("server-only", () => ({}));

// Every schema cart.ts destructures must exist; parse is a passthrough (Zod is not under test).
vi.mock("@mms/db/schemas", () => {
  const pass = { parse: (x: unknown) => x };
  return {
    addItemInput: pass,
    applyPromoInput: pass,
    applyRewardInput: pass,
    assignLineInput: pass,
    cartViewInput: pass,
    makeItNowInput: pass,
    sendToKitchenInput: pass,
    setLineFulfillmentInput: pass,
    setQtyInput: pass,
    undoFireInput: pass,
  };
});

vi.mock("./authz", () => ({
  assertCartItemMember: () =>
    Promise.resolve({
      locked: false,
      settling: false,
      role: "host",
      lineSeat: "u-1",
      lineState: "draft",
      comped: false,
      uid: "u-1",
      sessionId: "s-1",
      cartId: "c-1",
    }),
  assertCartMember: () =>
    Promise.resolve({ uid: "u-1", sessionId: "s-1", locked: false, settling: false }),
  AuthzError: class AuthzError extends Error {},
}));
vi.mock("./rate", () => ({
  assertMutationRate: () => Promise.resolve(),
  withinMutationRate: () => Promise.resolve(true),
}));
vi.mock("./permissions", () => ({ canMutateLine: () => true }));
vi.mock("./lock", () => ({ releaseCartLock: () => Promise.resolve() }));
vi.mock("./totals", () => ({ getCartTotals: () => Promise.resolve(null) }));
vi.mock("./posthog-server", () => ({ getPostHogClient: () => ({ capture() {}, flush() {} }) }));

const priceItemCalls: { menuItemId: string; ids: string[]; opts: unknown }[] = [];
let priceItemAnswer: { unitPriceCents: number; optionIds: string[] } | null = {
  unitPriceCents: 2100,
  optionIds: ["a", "b"],
};
vi.mock("./order-lines", () => ({
  priceItem: (menuItemId: string, ids: string[], opts: unknown) => {
    priceItemCalls.push({ menuItemId, ids, opts });
    if (!priceItemAnswer) return Promise.reject(new Error("Unknown menu item"));
    return Promise.resolve({
      name: "Kyay-O",
      category: "hot_prepared",
      opts: [],
      ...priceItemAnswer,
    });
  },
  insertOrIncLine: () => Promise.resolve(),
  touchCart: () => Promise.resolve(),
}));

// The line row the toggle reads — mutable per test.
let lineRow: Record<string, unknown> | null = null;
const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        maybeSingle: () => Promise.resolve({ data: lineRow, error: null }),
        single: () => Promise.resolve({ data: lineRow, error: null }),
      };
      return chain;
    },
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve({ data: "ok", error: null });
    },
  }),
}));

const { setLineFulfillment } = await import("./cart");

const LINE = "44444444-4444-4444-8444-444444444444";

beforeEach(() => {
  priceItemCalls.length = 0;
  rpcCalls.length = 0;
  priceItemAnswer = { unitPriceCents: 2100, optionIds: ["a", "b"] };
  lineRow = {
    menu_item_id: "m-1",
    unit_price_cents: 2300,
    fulfillment: "dinein",
    modifiers: ["Pork", "Extra egg"],
    modifier_option_ids: ["a", "b"],
  };
});

describe("setLineFulfillment — the W16a toggle re-price (exact ▸ rescale ▸ refuse)", () => {
  it("EXACT: every stored id resolves → priceItem's mode price rides to the RPC verbatim", async () => {
    const r = await setLineFulfillment(LINE, "togo");
    expect(r).toEqual({ ok: true });
    expect(priceItemCalls).toEqual([
      { menuItemId: "m-1", ids: ["a", "b"], opts: { fulfillment: "togo" } },
    ]);
    const call = rpcCalls.find((c) => c.fn === "mms_set_line_fulfillment");
    expect(call?.args.p_fulfillment).toBe("togo");
    expect(call?.args.p_unit_price_cents).toBe(2100);
  });

  it("RESCALE: a vanished option falls back to the factor ratio — never priceItem's shrunken price", async () => {
    lineRow = { ...lineRow!, unit_price_cents: 1150 };
    priceItemAnswer = { unitPriceCents: 9999, optionIds: ["a"] }; // one id vanished; 9999 must NOT be used
    const r = await setLineFulfillment(LINE, "togo");
    expect(r).toEqual({ ok: true });
    const call = rpcCalls.find((c) => c.fn === "mms_set_line_fulfillment");
    expect(call?.args.p_unit_price_cents).toBe(1050); // round25(1150 × 1.05/1.15)
  });

  it("RESCALE: a vanished ITEM (priceItem throws) keeps the line priced as charged, ratio-scaled", async () => {
    lineRow = { ...lineRow!, unit_price_cents: 1150 };
    priceItemAnswer = null;
    const r = await setLineFulfillment(LINE, "togo");
    expect(r).toEqual({ ok: true });
    expect(rpcCalls.find((c) => c.fn === "mms_set_line_fulfillment")?.args.p_unit_price_cents).toBe(
      1050,
    );
  });

  it("REFUSE: a legacy label-only line (pre-M3, unfactored stored price) is refused, not rescaled", async () => {
    lineRow = { ...lineRow!, modifier_option_ids: [], modifiers: ["Pork"] };
    const r = await setLineFulfillment(LINE, "togo");
    expect(r).toEqual({ ok: false, reason: "legacy" });
    expect(rpcCalls).toHaveLength(0); // the wrong-era price must never reach a write
  });

  it("an option-LESS line (no ids, no labels) re-derives exactly from the base", async () => {
    lineRow = { ...lineRow!, modifier_option_ids: [], modifiers: [] };
    priceItemAnswer = { unitPriceCents: 1050, optionIds: [] };
    const r = await setLineFulfillment(LINE, "togo");
    expect(r).toEqual({ ok: true });
    expect(priceItemCalls[0]?.ids).toEqual([]);
    expect(rpcCalls.find((c) => c.fn === "mms_set_line_fulfillment")?.args.p_unit_price_cents).toBe(
      1050,
    );
  });

  it("a no-op flip (same fulfillment) short-circuits ok with NO write", async () => {
    const r = await setLineFulfillment(LINE, "dinein");
    expect(r).toEqual({ ok: true });
    expect(rpcCalls).toHaveLength(0);
    expect(priceItemCalls).toHaveLength(0);
  });

  it("a grocery line refuses — routing + exemption are fixed", async () => {
    lineRow = { ...lineRow!, fulfillment: "grocery" };
    const r = await setLineFulfillment(LINE, "togo");
    expect(r).toEqual({ ok: false, reason: "is_grocery" });
    expect(rpcCalls).toHaveLength(0);
  });
});
