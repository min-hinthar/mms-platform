import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * M252 — a cash settle of a cart with NOTHING chargeable on it is refused.
 *
 * The count `settleCash` makes before its freeze counts EVERY line, comped and voided ones included,
 * and `mms_fulfill_cash_order` accepts a derived subtotal of 0 against a passed 0. So a table whose
 * every dish was comped settled as a "paid" order with no snapshot row (the RPC snapshots only lines
 * that are neither voided nor comped) and a `togo_status` nobody ever stamps. The UI hides the settle
 * section then; the Server Action did not.
 *
 * The fixtures SEPARATE the rule from its near-misses: the same zero subtotal with a chargeable $0
 * line (a grocery item may be priced 0) must still settle, and the whole-cart count above the freeze
 * answers 2 here — so a refusal can only come from the chargeable read, never from the empty-table
 * check that was already there.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("./staff", () => ({
  staffGate: () => Promise.resolve({ ok: true, caller: { uid: "u-1", staffId: "s-1" } }),
  STAFF_WRITE_OUTAGE: "outage",
}));
const CART = "33333333-3333-4333-8333-333333333333";
const SESSION = "22222222-2222-4222-8222-222222222222";
vi.mock("./staff-open-cart", () => ({
  openCartFor: () =>
    Promise.resolve({
      session: { id: SESSION, mode: "dinein" },
      cart: {
        id: CART,
        tab_type: "none",
        locked: false,
        locked_at: null,
        settle_at: null,
        settle_by: null,
      },
      unavailable: false,
    }),
  closeCounterStyleSession: () => Promise.resolve(),
}));
vi.mock("./pay-guard", () => ({ paymentInFlightReason: () => Promise.resolve(null) }));
/** Every acquire and release, in order, with its owner — "the freeze taken is the freeze released"
 *  is a VALUE, not a count. */
const lockCalls: { op: "acquire" | "release"; cartId: string; owner: string }[] = [];
vi.mock("./lock", () => ({
  releasePromoGrantFor: () => Promise.resolve(null),
  acquireSettlement: (cartId: string, owner: string) => {
    lockCalls.push({ op: "acquire", cartId, owner });
    return Promise.resolve("acquired");
  },
  releaseSettlementFor: (cartId: string, owner: string) => {
    lockCalls.push({ op: "release", cartId, owner });
    return Promise.resolve({ released: true, error: null });
  },
}));
// The settle gate and the acknowledgement compare answer explicitly (nothing unsent, nothing
// pending), so every case below reaches the totals through the gates' REAL pass branches.
vi.mock("./approvals-read", () => ({ readPendingApprovalFlags: () => Promise.resolve([]) }));
vi.mock("./unsent-read", () => ({
  readKitchenDraftUnits: () => Promise.resolve(0),
  kitchenDraftUnits: () => Promise.resolve(0),
}));
vi.mock("./tax", () => ({ lineTax: () => 0 }));
vi.mock("./order-lines", () => ({
  insertOrIncLine: () => Promise.resolve(),
  priceItem: () => Promise.resolve({}),
  touchCart: () => Promise.resolve(),
}));
vi.mock("./posthog-server", () => ({
  getPostHogClient: () => ({ capture() {}, flush: () => Promise.resolve() }),
}));
vi.mock("./stripe", () => ({ getStripe: () => null }));
vi.mock("./tab-events", () => ({ logTabEvent: () => Promise.resolve() }));

/** What `computeTotals` answers for a cart whose every line is comped or voided: all zero. */
const ZERO = {
  subtotalCents: 0,
  discountCents: 0,
  promoCents: 0,
  rewardCents: 0,
  serviceChargeCents: 0,
  taxCents: 0,
  tipCents: 0,
  totalCents: 0,
};
let totals = ZERO;
vi.mock("./totals", () => ({ getCartTotals: () => Promise.resolve(totals) }));

/** Each count query on `qr_cart_items`, with the filters it applied — the predicate is asserted as a
 *  call shape, never inferred from an answer this mock chose. */
type Filter = [op: "eq" | "neq", column: string, value: unknown];
let queries: Filter[][] = [];
/** The whole-cart count above the freeze: two lines, both comped — the table is NOT empty. */
const WHOLE_CART_COUNT = 2;
/** The chargeable count's answer (lines neither voided nor comped). */
let chargeableCount: number | null = 0;
let chargeableError: { message: string } | null = null;
const isChargeableRead = (q: Filter[]) =>
  q.some(([op, col, v]) => op === "eq" && col === "comped" && v === false);

const rpcCalls: string[] = [];
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (table: string) => {
      if (table === "qr_orders") {
        const order: Record<string, unknown> = {
          select: () => order,
          eq: () => order,
          single: () => Promise.resolve({ data: { total_cents: 0, tip_cents: 0 }, error: null }),
        };
        return order;
      }
      return {
        select: () => {
          const filters: Filter[] = [];
          queries.push(filters);
          const chain = {
            eq: (column: string, value: unknown) => {
              filters.push(["eq", column, value]);
              return chain;
            },
            neq: (column: string, value: unknown) => {
              filters.push(["neq", column, value]);
              return chain;
            },
            then: (resolve: (v: { count: number | null; error: unknown }) => unknown) =>
              Promise.resolve(
                isChargeableRead(filters)
                  ? { count: chargeableCount, error: chargeableError }
                  : { count: WHOLE_CART_COUNT, error: null },
              ).then(resolve),
          };
          return chain;
        },
      };
    },
    rpc: (fn: string) => {
      rpcCalls.push(fn);
      if (fn === "mms_fulfill_cash_order") return Promise.resolve({ data: "order-1", error: null });
      return Promise.resolve({ data: null, error: null });
    },
  }),
}));

const { settleCash } = await import("./staff-cart");
const settled = () => rpcCalls.includes("mms_fulfill_cash_order");
/** The freeze this settle took was released under the same owner, and nothing else happened to it. */
function expectFreezeReleased() {
  const acquired = lockCalls.filter((c) => c.op === "acquire");
  expect(acquired).toHaveLength(1);
  expect(lockCalls).toEqual([
    { op: "acquire", cartId: CART, owner: acquired[0]!.owner },
    { op: "release", cartId: CART, owner: acquired[0]!.owner },
  ]);
}

beforeEach(() => {
  totals = ZERO;
  queries = [];
  chargeableCount = 0;
  chargeableError = null;
  rpcCalls.length = 0;
  lockCalls.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("settleCash — a cart with nothing chargeable is refused, never minted as a $0 order (M252)", () => {
  it("every line comped: refused as nothing to settle — the RPC never runs, the freeze is released", async () => {
    const r = await settleCash({ sessionId: SESSION, tipCents: 0 });
    expect(r).toEqual({ ok: false, error: "There’s nothing on this table to settle." });
    expect(settled()).toBe(false);
    expectFreezeReleased();
    // The predicate is the RPC's own snapshot filter: this cart's lines, neither voided nor comped.
    const chargeable = queries.filter(isChargeableRead);
    expect(chargeable).toHaveLength(1);
    expect(chargeable[0]).toEqual([
      ["eq", "cart_id", CART],
      ["neq", "state", "voided"],
      ["eq", "comped", false],
    ]);
  });

  it("…and a cash tip typed over it changes nothing: still refused, nothing recorded", async () => {
    const r = await settleCash({ sessionId: SESSION, tipCents: 500 });
    expect(r).toEqual({ ok: false, error: "There’s nothing on this table to settle." });
    expect(settled()).toBe(false);
  });

  it("a zero subtotal over a chargeable $0 line still settles — zero alone is not 'nothing'", async () => {
    chargeableCount = 1;
    const r = await settleCash({ sessionId: SESSION, tipCents: 0 });
    expect(r).toMatchObject({ ok: true, orderId: "order-1" });
    expect(settled()).toBe(true);
  });

  it("an unreadable chargeable read is an outage, never a verdict either way — nothing settles", async () => {
    chargeableError = { message: "connection reset" };
    chargeableCount = null;
    const r = await settleCash({ sessionId: SESSION, tipCents: 0 });
    expect(r).toEqual({ ok: false, error: "outage" });
    expect(settled()).toBe(false);
    expectFreezeReleased();
  });

  it("a positive subtotal settles without the extra read — the RPC's own reconcile carries it", async () => {
    totals = { ...ZERO, subtotalCents: 1450, taxCents: 133, totalCents: 1583 };
    const r = await settleCash({ sessionId: SESSION, tipCents: 0 });
    expect(r).toMatchObject({ ok: true, orderId: "order-1" });
    expect(settled()).toBe(true);
    expect(queries.filter(isChargeableRead)).toEqual([]);
  });
});
