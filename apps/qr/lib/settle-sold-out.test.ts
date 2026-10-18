import { beforeEach, describe, expect, it, vi } from "vitest";
import { soldOutUnreadableRefusal, soldOutUnseenRefusal } from "./settle-sold-out";

/**
 * The lifecycle audit (2026-10-13), as reworked on #360 — a SOLD-OUT draft at a staff door is a
 * RE-WARNING, never a block (PD8's acknowledged-ids pattern, PATH_DESIGN decision 4). The server
 * refuses `sold_out_unseen` only when a sold-out draft exists that the tap did NOT display, so staff
 * always see it before money moves; an acknowledged one settles (and settlement still fires it — the
 * KDS line wears its sold-out tag). The read runs UNDER the freeze, BEFORE the unsent read and the
 * totals; every refusal releases its own freeze; an unreadable read follows PD8's
 * `approval_unreadable` (fail closed, retry). (The reader's door is pinned in terminal.test.ts.)
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

const MOHINGA = { id: "11111111-1111-4111-8111-111111111111", name: "Mohinga" };
const TEA = { id: "22222222-2222-4222-8222-222222222222", name: "Tea leaf salad" };
const cash = (ack: string[] = []) =>
  settleCash({ sessionId: SESSION, tipCents: 0, quotedCents: 4368, acknowledgedSoldOutIds: ack });
const tabClose = (ack: string[] = []) =>
  closeSecureTab({ sessionId: SESSION, quotedCents: 4368, acknowledgedSoldOutIds: ack });

describe("settleCash — a sold-out draft is SEEN before money moves, never blocked", () => {
  it("an UNSEEN sold-out draft refuses naming it, records nothing, reads no totals, releases its freeze", async () => {
    // lck/staff-cart/cash-charges-an-unseen-sold-out-draft — the counter took cash for the 86'd dish
    // nobody had been shown, and the after() fire sent it to a kitchen that could not make it.
    session = { id: SESSION, mode: "pickup", qr_code: "reg-7K2Q" };
    rows = [{ state: "draft", fulfillment: "togo", qty: 1 }];
    availability = { ok: true, lines: [MOHINGA] };
    expect(await cash()).toEqual(soldOutUnseenRefusal([MOHINGA]));
    expect(cashRecorded()).toBe(false);
    expect(ops).toEqual(["acquire", "sold-out-read", "release"]);
    releasedOwnFreeze();
  });

  it("an ACKNOWLEDGED sold-out draft settles — a re-warning, never a block", async () => {
    // lck/settle-sold-out/acknowledgement-ignored — the tap displayed it and was refused anyway; red.
    session = { id: SESSION, mode: "pickup", qr_code: "reg-7K2Q" };
    availability = { ok: true, lines: [MOHINGA] };
    expect(await cash([MOHINGA.id])).toMatchObject({ ok: true, orderId: "order-1" });
    expect(cashRecorded()).toBe(true);
  });

  it("one dish acknowledged and a NEW one not: refused, naming every sold-out dish for the next tap", async () => {
    availability = { ok: true, lines: [MOHINGA, TEA] };
    expect(await cash([MOHINGA.id])).toEqual(soldOutUnseenRefusal([MOHINGA, TEA]));
    expect(cashRecorded()).toBe(false);
    releasedOwnFreeze();
  });

  it("an unreadable read follows PD8's unreadable rule: refused with a retry, freeze released", async () => {
    // lck/staff-cart/cash-sold-out-read-fails-open
    availability = { ok: false };
    expect(await cash([MOHINGA.id])).toEqual(soldOutUnreadableRefusal());
    expect(cashRecorded()).toBe(false);
    releasedOwnFreeze();
  });

  it("a basket with nothing sold out settles exactly as before", async () => {
    rows = [{ state: "draft", fulfillment: "togo", qty: 1 }];
    expect(await cash()).toMatchObject({ ok: true, orderId: "order-1" });
    expect(ops.slice(0, 3)).toEqual(["acquire", "sold-out-read", "unsent-read"]);
  });
});

describe("closeSecureTab — an unseen sold-out draft never rides an off-session charge", () => {
  it("refuses an UNSEEN one naming it, mints NO PaymentIntent, and releases the freeze it took", async () => {
    // lck/staff-cart/tab-close-charges-an-unseen-sold-out-draft · tab-close-sold-out-freeze-kept
    tabType = "secure";
    rows = [{ state: "draft", fulfillment: "togo", qty: 1 }];
    availability = { ok: true, lines: [MOHINGA, TEA] };
    expect(await tabClose()).toEqual(soldOutUnseenRefusal([MOHINGA, TEA]));
    expect(charged()).toBe(false);
    expect(ops).toEqual(["acquire", "sold-out-read", "release"]);
    releasedOwnFreeze();
  });

  it("an unreadable read refuses and releases; an ACKNOWLEDGED one charges the server's total", async () => {
    // lck/staff-cart/tab-close-sold-out-read-fails-open
    tabType = "secure";
    availability = { ok: false };
    expect(await tabClose()).toEqual(soldOutUnreadableRefusal());
    expect(charged()).toBe(false);
    releasedOwnFreeze();
    ops = [];
    owners = [];
    availability = { ok: true, lines: [MOHINGA] };
    rows = [{ state: "fired", fulfillment: "dinein", qty: 3 }];
    expect(await tabClose([MOHINGA.id])).toEqual({ ok: true });
    expect(ops).toContain("pi.create:4368");
  });
});
