import { beforeEach, describe, expect, it, vi } from "vitest";
import { UNSENT_UNREADABLE_REFUSAL, soldOutRefusal } from "./settle-refusal";

/**
 * The lifecycle audit (2026-10-13) — the staff settle doors refuse a DRAFT dish that is sold out.
 *
 * The staff unsent gate counts only dine-in drafts, so a to-go draft at a table, or a counter order's
 * draft, went through cash or a card-on-file close: the guest was charged for the 86'd dish and
 * settlement then FIRED it to the kitchen (`mms_fire_pending_food`) — a paid cart cannot be voided,
 * so the only way back was a manager's refund. The diner's own door refuses the same basket. The read
 * runs UNDER the freeze, BEFORE the unsent read and the totals; a refusal releases its own freeze;
 * an unreadable catalog refuses (the staff doors fail CLOSED); and a clean basket still settles.
 * (The reader's door, `settleCard`, is pinned in terminal.test.ts.)
 */

vi.mock("server-only", () => ({}));
/** What the sold-out read answers (`unavailableLines`): the dishes, or an unreadable catalog. */
let availability: { ok: true; lines: { id: string; name: string }[] } | { ok: false } = {
  ok: true,
  lines: [],
};
vi.mock("./availability-read", () => ({
  unavailableLines: () => {
    ops.push("sold-out-read");
    return Promise.resolve(availability);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("./staff", () => ({
  staffGate: () => Promise.resolve({ ok: true, caller: { uid: "u-1", staffId: "s-1" } }),
  STAFF_WRITE_OUTAGE: "outage",
}));
const CART = "66666666-6666-4666-8666-666666666666";
const SESSION = "77777777-7777-4777-8777-777777777777";

/** Every money-relevant step, in order — so "under the freeze, before the totals" is a SEQUENCE,
 *  not a count. */
let ops: string[] = [];
/** The owner each acquire / release names (the freeze taken is the freeze released). */
let owners: { op: "acquire" | "release"; owner: string }[] = [];

let session = { id: SESSION, mode: "dinein" as string, qr_code: "t-7" };
let tabType: "none" | "trust" | "secure" = "none";
vi.mock("./staff-open-cart", () => ({
  openCartFor: () =>
    Promise.resolve({
      session,
      cart: {
        id: CART,
        tab_type: tabType,
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
vi.mock("./lock", () => ({
  // M268 — the settlement's ordinary path releases a stale promo pin under its freeze; here it
  // answers released (its own suite is settle-takeover / m268-settle-stale-pin).
  releasePromoGrantFor: () => Promise.resolve(null),
  acquireSettlement: (_cart: string, owner: string) => {
    ops.push("acquire");
    owners.push({ op: "acquire", owner });
    return Promise.resolve("acquired");
  },
  releaseSettlementFor: (_cart: string, owner: string) => {
    ops.push("release");
    owners.push({ op: "release", owner });
    return Promise.resolve({ released: true, error: null });
  },
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
vi.mock("./tab-events", () => ({ logTabEvent: () => Promise.resolve() }));
vi.mock("./totals", () => ({
  getCartTotals: () => {
    ops.push("totals");
    return Promise.resolve({
      subtotalCents: 4000,
      discountCents: 0,
      promoCents: 0,
      rewardCents: 0,
      serviceChargeCents: 0,
      taxCents: 368,
      tipCents: 0,
      totalCents: 4368,
    });
  },
}));
vi.mock("./stripe", () => ({
  getStripe: () => ({
    paymentIntents: {
      create: (p: { amount: number }) => {
        ops.push(`pi.create:${p.amount}`);
        return Promise.resolve({ status: "succeeded" });
      },
    },
  }),
}));

// PD8 — the pending-request read behind the acknowledgement compare, mocked by module exactly as the
// unsent read above: nothing waits here; the compare itself is pinned in staff-cart.test / terminal.test.
vi.mock("./approvals-read", () => ({ readPendingApprovalFlags: () => Promise.resolve([]) }));
type Row = { state: string; fulfillment: string; qty: number };
/** The cart's lines, as the unsent read sees them. */
let rows: Row[] = [];
let rowsFail = false;
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: (table: string) => {
      if (table === "qr_cart_items")
        return {
          select: (_cols: string, opts?: { head?: boolean }) => ({
            eq: () => {
              if (opts?.head) return Promise.resolve({ count: 3, error: null });
              ops.push("unsent-read");
              return Promise.resolve(
                rowsFail
                  ? { data: null, error: { message: "read failed" } }
                  : { data: rows, error: null },
              );
            },
          }),
        };
      const q: Record<string, unknown> = {
        select: () => q,
        eq: () => q,
        single: () => Promise.resolve({ data: { total_cents: 4368, tip_cents: 0 }, error: null }),
        maybeSingle: () =>
          Promise.resolve({
            data:
              table === "mms_tab_secure"
                ? { stripe_customer_id: "cus_1", stripe_payment_method_id: "pm_1" }
                : null,
            error: null,
          }),
      };
      return q;
    },
    rpc: (fn: string) => {
      ops.push(`rpc:${fn}`);
      if (fn === "mms_fulfill_cash_order") return Promise.resolve({ data: "order-1", error: null });
      return Promise.resolve({ data: null, error: null });
    },
  }),
}));

const { settleCash, closeSecureTab } = await import("./staff-cart");
const cashRecorded = () => ops.includes("rpc:mms_fulfill_cash_order");
const charged = () => ops.some((o) => o.startsWith("pi.create"));
/** The freeze taken was released, once, under the SAME owner. */
function releasedOwnFreeze() {
  const acquired = owners.filter((o) => o.op === "acquire");
  expect(acquired).toHaveLength(1);
  expect(owners).toEqual([
    { op: "acquire", owner: acquired[0]!.owner },
    { op: "release", owner: acquired[0]!.owner },
  ]);
}

beforeEach(() => {
  ops = [];
  owners = [];
  rows = [];
  rowsFail = false;
  availability = { ok: true, lines: [] };
  session = { id: SESSION, mode: "dinein", qr_code: "t-7" };
  tabType = "none";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const MOHINGA = { id: "m-1", name: "Mohinga" };

describe("settleCash — a sold-out draft is never charged and then fired", () => {
  it("refuses naming the dish, records nothing, reads no totals, and releases its own freeze", async () => {
    // lck/staff-cart/cash-charges-a-sold-out-draft — the counter took cash for the 86'd dish and the
    // after() fire sent it to a kitchen that could not make it.
    session = { id: SESSION, mode: "pickup", qr_code: "reg-7K2Q" };
    rows = [{ state: "draft", fulfillment: "togo", qty: 1 }];
    availability = { ok: true, lines: [MOHINGA] };
    const r = await settleCash({ sessionId: SESSION, tipCents: 0, quotedCents: 4368 });
    expect(r).toEqual(soldOutRefusal(["Mohinga"]));
    expect(cashRecorded()).toBe(false);
    expect(ops).toEqual(["acquire", "sold-out-read", "release"]);
    releasedOwnFreeze();
  });

  it("an unreadable catalog refuses, typed `unreadable` — never 'nothing is sold out'", async () => {
    // lck/staff-cart/cash-sold-out-read-fails-open
    availability = { ok: false };
    const r = await settleCash({ sessionId: SESSION, tipCents: 0, quotedCents: 4368 });
    expect(r).toEqual({ ok: false, code: "unreadable", error: UNSENT_UNREADABLE_REFUSAL });
    expect(cashRecorded()).toBe(false);
    releasedOwnFreeze();
  });

  it("a basket with nothing sold out settles exactly as before", async () => {
    rows = [{ state: "draft", fulfillment: "togo", qty: 1 }];
    const r = await settleCash({ sessionId: SESSION, tipCents: 0, quotedCents: 4368 });
    expect(r).toMatchObject({ ok: true, orderId: "order-1" });
    expect(ops.slice(0, 3)).toEqual(["acquire", "sold-out-read", "unsent-read"]);
  });
});

describe("closeSecureTab — a sold-out draft never rides an off-session charge", () => {
  it("refuses naming the dish, mints NO PaymentIntent, and releases the freeze it took", async () => {
    // lck/staff-cart/tab-close-charges-a-sold-out-draft
    tabType = "secure";
    rows = [{ state: "draft", fulfillment: "togo", qty: 1 }];
    availability = { ok: true, lines: [MOHINGA, { id: "t-1", name: "Tea leaf salad" }] };
    const r = await closeSecureTab({ sessionId: SESSION, quotedCents: 4368 });
    expect(r).toEqual(soldOutRefusal(["Mohinga", "Tea leaf salad"]));
    expect(charged()).toBe(false);
    expect(ops).toEqual(["acquire", "sold-out-read", "release"]);
    releasedOwnFreeze();
  });

  it("an unreadable catalog refuses and releases; a clean bill charges the server's total", async () => {
    // lck/staff-cart/tab-close-sold-out-read-fails-open
    tabType = "secure";
    availability = { ok: false };
    expect(await closeSecureTab({ sessionId: SESSION, quotedCents: 4368 })).toEqual({
      ok: false,
      code: "unreadable",
      error: UNSENT_UNREADABLE_REFUSAL,
    });
    expect(charged()).toBe(false);
    releasedOwnFreeze();
    ops = [];
    owners = [];
    availability = { ok: true, lines: [] };
    rows = [{ state: "fired", fulfillment: "dinein", qty: 3 }];
    expect(await closeSecureTab({ sessionId: SESSION, quotedCents: 4368 })).toEqual({ ok: true });
    expect(ops).toContain("pi.create:4368");
  });
});
