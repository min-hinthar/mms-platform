import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The lifecycle audit (K18) — `staffSetLineFulfillment`: a staff member moves a DRAFT dish between
 * For here and To go through the diner's own RPC (service role, no new SQL). The action adds what the
 * RPC cannot know — the line is on THIS table's open cart — and the mid-payment refusal every staff
 * line edit carries; only the RPC's `ok` lands.
 */
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("./staff", () => ({
  staffGate: () => Promise.resolve({ ok: true, caller: { uid: "u-1", staffId: "s-1" } }),
  STAFF_WRITE_OUTAGE: "outage",
}));
const CART = "66666666-6666-4666-8666-666666666666";
const SESSION = "77777777-7777-4777-8777-777777777777";
const LINE = "88888888-8888-4888-8888-888888888888";
vi.mock("./staff-open-cart", () => ({
  openCartFor: () =>
    Promise.resolve({
      session: { id: SESSION, mode: "dinein", qr_code: "t-7" },
      cart: { id: CART, tab_type: "none", locked: false, settle_at: null },
      unavailable: false,
    }),
  closeCounterStyleSession: () => Promise.resolve(),
}));
let paying: string | null = null;
vi.mock("./pay-guard", () => ({ paymentInFlightReason: () => Promise.resolve(paying) }));
const touched: string[] = [];
vi.mock("./order-lines", () => ({
  insertOrIncLine: () => Promise.resolve(),
  priceItem: () => Promise.resolve({}),
  touchCart: (id: string) => {
    touched.push(id);
    return Promise.resolve();
  },
}));

/** The line as the scope read finds it on THIS table's cart (null: not on it). */
let lineOnCart: { id: string; state: string } | null = { id: LINE, state: "draft" };
let scopeAsked: [string, unknown][] = [];
let rpcAnswer: { data: unknown; error: { message: string } | null } = { data: "ok", error: null };
const rpc = vi.fn(() => Promise.resolve(rpcAnswer));
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: () => {
      const chain = {
        select: () => chain,
        eq: (col: string, v: unknown) => {
          scopeAsked.push([col, v]);
          return chain;
        },
        maybeSingle: () => Promise.resolve({ data: lineOnCart, error: null }),
      };
      return chain;
    },
    rpc,
  }),
}));

const { staffSetLineFulfillment } = await import("./staff-cart");

beforeEach(() => {
  rpc.mockClear();
  paying = null;
  touched.length = 0;
  lineOnCart = { id: LINE, state: "draft" };
  scopeAsked = [];
  rpcAnswer = { data: "ok", error: null };
});

describe("staffSetLineFulfillment", () => {
  it("re-routes a draft dish on this table through the diner's RPC, and touches the cart", async () => {
    const r = await staffSetLineFulfillment(SESSION, { cartItemId: LINE, fulfillment: "togo" });
    expect(r).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("mms_set_line_fulfillment", {
      p_line: LINE,
      p_fulfillment: "togo",
    });
    // lck/staff-cart/reroute-unscoped — the scope read is THIS table's open cart
    expect(scopeAsked).toContainEqual(["cart_id", CART]);
    expect(touched).toEqual([CART]);
  });

  it("a line that is not on this table's open cart is refused before the RPC", async () => {
    // lck/staff-cart/reroute-unscoped — an id from another table would be re-routed from here.
    lineOnCart = null;
    const r = await staffSetLineFulfillment(SESSION, { cartItemId: LINE, fulfillment: "togo" });
    expect(r.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("a table mid-payment is refused — the line is not re-taxed under a charge", async () => {
    // lck/staff-cart/reroute-while-paying
    paying = "mid_payment";
    const r = await staffSetLineFulfillment(SESSION, { cartItemId: LINE, fulfillment: "togo" });
    expect(r.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("a sent dish is refused before the RPC; the RPC's own refusal is never read as a landing", async () => {
    // lck/staff-cart/reroute-sent · reroute-refusal-lands
    lineOnCart = { id: LINE, state: "fired" };
    expect(
      (await staffSetLineFulfillment(SESSION, { cartItemId: LINE, fulfillment: "togo" })).ok,
    ).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    lineOnCart = { id: LINE, state: "draft" };
    rpcAnswer = { data: "not_draft", error: null };
    const r = await staffSetLineFulfillment(SESSION, { cartItemId: LINE, fulfillment: "togo" });
    expect(r.ok).toBe(false);
    expect(touched).toEqual([]);
  });

  it("a failed RPC is the outage sentence, never a refusal it did not make", async () => {
    rpcAnswer = { data: null, error: { message: "boom" } };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await staffSetLineFulfillment(SESSION, { cartItemId: LINE, fulfillment: "dinein" });
    expect(r).toEqual({ ok: false, error: "outage" });
  });
});
