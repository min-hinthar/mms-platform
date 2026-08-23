import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * W17a — the dinein↔togo toggle is TAX-ONLY again. Under W16a's mode pricing this function had to
 * re-derive the charged price on every flip (exact ▸ rescale ▸ refuse); now dine-in and to-go ring
 * the same POS price, so a flip may change ONLY the routing tag and the per-line tax the SQL fn
 * recomputes. This file pins that it never mints a price:
 *   - `priceItem` is not called at all
 *   - the RPC carries exactly p_line + p_fulfillment; `p_unit_price_cents` is ABSENT (its documented
 *     "leave the price alone" path — coalesce(null, stored)). A re-added price forward reddens here.
 *   - the SQL fn's verdicts (is_grocery / not_draft / stale) surface as {ok:false, reason} and are
 *     never swallowed into ok — the guards live in the SQL statement, not in this client.
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

const priceItemCalls: unknown[] = [];
vi.mock("./order-lines", () => ({
  priceItem: (...args: unknown[]) => {
    priceItemCalls.push(args);
    return Promise.resolve({
      name: "Kyay-O",
      category: "hot_prepared",
      opts: [],
      unitPriceCents: 2100,
      optionIds: [],
    });
  },
  insertOrIncLine: () => Promise.resolve(),
  touchCart: () => Promise.resolve(),
}));

// What the SQL fn answers — mutable per test.
let rpcVerdict: { data: string | null; error: { message: string } | null } = {
  data: "ok",
  error: null,
};
const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        single: () => Promise.resolve({ data: null, error: null }),
      };
      return chain;
    },
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve(rpcVerdict);
    },
  }),
}));

const { setLineFulfillment, makeItNow } = await import("./cart");

const LINE = "44444444-4444-4444-8444-444444444444";

beforeEach(() => {
  priceItemCalls.length = 0;
  rpcCalls.length = 0;
  rpcVerdict = { data: "ok", error: null };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("setLineFulfillment — tax-only (W17a: a flip never re-prices)", () => {
  it("sends ONLY the line + destination — no price rides the write", async () => {
    const r = await setLineFulfillment(LINE, "togo");
    expect(r).toEqual({ ok: true });
    expect(rpcCalls).toEqual([
      { fn: "mms_set_line_fulfillment", args: { p_line: LINE, p_fulfillment: "togo" } },
    ]);
    // Structural, not just value-equal: the parameter must be ABSENT, so `coalesce(null, stored)`
    // in the SQL keeps the charged price. Passing an explicit undefined would fail this too.
    expect(Object.keys(rpcCalls[0]!.args).sort()).toEqual(["p_fulfillment", "p_line"]);
  });

  it("never re-derives a price — priceItem is not consulted on a flip", async () => {
    await setLineFulfillment(LINE, "togo");
    expect(priceItemCalls).toHaveLength(0);
  });

  it.each([
    "is_grocery",
    "not_draft",
    "not_open",
    "stale",
    "not_found",
    // M100 — the session-mode refusal. The RULE has one home, and it is the SQL statement (a second
    // copy here would be the "computed in one place, quoted in another" drift this repo keeps
    // paying for). What this pins is that the new verdict reaches the caller by NAME rather than
    // being flattened into a generic "error", so a reader grepping `not_dinein_session` finds both
    // sides of it.
    "not_dinein_session",
    // M17 — the line's menu item is gone (or its id is not a uuid), so its tax CATEGORY is
    // unknowable and the RPC refuses rather than assuming 'hot_prepared', which is taxable both
    // ways and over-collected on every cold line sent to-go. Same rule as above: one home, in the
    // SQL; what this pins is that the verdict arrives by name.
    "unknown_item",
  ])("surfaces the SQL verdict %s as a refusal — never swallowed into ok", async (verdict) => {
    rpcVerdict = { data: verdict, error: null };
    expect(await setLineFulfillment(LINE, "togo")).toEqual({ ok: false, reason: verdict });
  });

  it("an RPC error is a refusal, not a silent success", async () => {
    rpcVerdict = { data: null, error: { message: "boom" } };
    expect(await setLineFulfillment(LINE, "togo")).toEqual({ ok: false, reason: "error" });
  });

  it("a null verdict with no error still refuses (never a truthy-ok fallthrough)", async () => {
    rpcVerdict = { data: null, error: null };
    expect(await setLineFulfillment(LINE, "togo")).toEqual({ ok: false, reason: "error" });
  });
});

/**
 * M107 — "Make it now" had no test at all: this file mocked `makeItNowInput` and never called the
 * action. Its guard is the same shape as the toggle's (the rule lives in `mms_fire_line`, and the
 * client's `isDineIn &&` render gate is advisory), so what belongs here is the same thing — that the
 * SQL's verdict reaches the caller by name and is never flattened into a success.
 */
describe("makeItNow — the SQL owns the verdict", () => {
  it("sends ONLY the line — the fire decision is entirely the RPC's", async () => {
    expect(await makeItNow(LINE)).toEqual({ ok: true });
    expect(rpcCalls).toEqual([{ fn: "mms_fire_line", args: { p_line: LINE } }]);
  });

  it.each(["not_togo", "not_draft", "not_open", "stale", "not_found", "not_dinein_session"])(
    "surfaces the SQL verdict %s as a refusal — never swallowed into ok",
    async (verdict) => {
      rpcVerdict = { data: verdict, error: null };
      expect(await makeItNow(LINE)).toEqual({ ok: false, reason: verdict });
    },
  );

  it("an RPC error is a refusal, not a silent fire", async () => {
    rpcVerdict = { data: null, error: { message: "boom" } };
    expect(await makeItNow(LINE)).toEqual({ ok: false, reason: "error" });
  });

  it("a null verdict with no error still refuses (never a truthy-ok fallthrough)", async () => {
    rpcVerdict = { data: null, error: null };
    expect(await makeItNow(LINE)).toEqual({ ok: false, reason: "error" });
  });
});
