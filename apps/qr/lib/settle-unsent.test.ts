import { beforeEach, describe, expect, it, vi } from "vitest";
import { UNSENT_SETTLE_REFUSAL } from "./settle-refusal";

/**
 * Phase 2c · gate — the staff settle gate on the two `staff-cart` doors (owner decision 3,
 * 2026-09-24: "every settle door refuses while dine-in dishes are unsent").
 *
 * A cash settle or a card-on-file close used to charge for AND fire every unsent draft — a dessert
 * added but never sent was billed, then cooked after the table had left. The check runs UNDER the
 * freeze, BEFORE the totals, and a refusal releases the freeze it took, scoped to its own attempt.
 * (Phase 2c · review, R7 — this used to say "nothing can add or fire between the verdict and the
 * charge". False: the add paths check the freeze with a read before their write, and the insert RPC
 * guards only `status = 'open'`, so an add can land after the verdict. The cash settle and the
 * running-bill close refuse that through their compare-and-swap; the reader has none — OPEN-ITEMS.)
 *
 * The DB fake answers the unsent read with ROWS, so the count is the real
 * `kitchenDraftUnitsFromRows` (dine-in drafts only) and the mode is the real session's: a to-go
 * draft never blocks, and a counter order never does.
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
  session = { id: SESSION, mode: "dinein", qr_code: "t-7" };
  tabType = "none";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("settleCash — refused while dine-in dishes are unsent", () => {
  it("refuses with the typed code and the count, records nothing, and releases its own freeze", async () => {
    // MUTATION (settle/cash-over-unsent): delete the check — the cash order is recorded over two
    // dishes the kitchen never got, and the after() fire cooks them once the table has paid; red.
    rows = [
      { state: "draft", fulfillment: "dinein", qty: 2 },
      { state: "fired", fulfillment: "dinein", qty: 1 },
      { state: "draft", fulfillment: "togo", qty: 1 },
    ];
    const r = await settleCash({ sessionId: SESSION, tipCents: 0, quotedCents: 4368 });
    expect(r).toEqual({ ok: false, code: "unsent", units: 2, error: UNSENT_SETTLE_REFUSAL });
    expect(cashRecorded()).toBe(false);
    // UNDER the freeze, BEFORE the totals — a SEQUENCE, not a count: read above the acquire, a
    // guest's add could land between the verdict and the charge; and a refusal costs no totals read.
    // MUTATION (settle/cash-unsent-read-before-the-freeze): check above the acquire; red.
    // MUTATION (settle/cash-unsent-read-after-the-totals): read the totals first; red.
    expect(ops).toEqual(["acquire", "unsent-read", "release"]);
    releasedOwnFreeze();
  });

  it("a counter (reg-) order with a to-go draft still settles — paying IS ordering there", async () => {
    session = { id: SESSION, mode: "pickup", qr_code: "reg-7K2Q" };
    rows = [{ state: "draft", fulfillment: "togo", qty: 2 }];
    const r = await settleCash({ sessionId: SESSION, tipCents: 0, quotedCents: 4368 });
    expect(r).toMatchObject({ ok: true, orderId: "order-1" });
    expect(cashRecorded()).toBe(true);
  });

  it("a table whose only drafts are to-go (they cook at payment) settles", async () => {
    rows = [
      { state: "draft", fulfillment: "togo", qty: 1 },
      { state: "served", fulfillment: "dinein", qty: 2 },
    ];
    const r = await settleCash({ sessionId: SESSION, tipCents: 0, quotedCents: 4368 });
    expect(r.ok).toBe(true);
    expect(cashRecorded()).toBe(true);
  });

  it("an unreadable line read fails OPEN — today's settle-fires behaviour, never a stranded table", async () => {
    rowsFail = true;
    const r = await settleCash({ sessionId: SESSION, tipCents: 0, quotedCents: 4368 });
    expect(r.ok).toBe(true);
    expect(cashRecorded()).toBe(true);
  });
});

describe("closeSecureTab — the running-bill close is gated too, before any PaymentIntent", () => {
  it("refuses with the typed code, mints NO PaymentIntent, and releases the freeze it took", async () => {
    // MUTATION (settle/tab-close-over-unsent): delete the check — the card on file is charged for
    // three dishes nobody sent, off-session, for a guest who may already have left; red.
    tabType = "secure";
    rows = [{ state: "draft", fulfillment: "dinein", qty: 3 }];
    const r = await closeSecureTab({ sessionId: SESSION, quotedCents: 4368 });
    expect(r).toEqual({ ok: false, code: "unsent", units: 3, error: UNSENT_SETTLE_REFUSAL });
    expect(charged()).toBe(false);
    // MUTATION (settle/unsent-refusal-strands-freeze): drop the release — this path has no blanket
    // `finally`, so the refusal would strand the table frozen for the whole TTL: no cash, no card,
    // no edits, and the Send the refusal points at is refused too; red.
    // MUTATION (settle/tab-close-unsent-read-before-the-freeze): check above the acquire; red.
    // MUTATION (settle/tab-close-unsent-read-after-the-totals): read the totals first; red.
    expect(ops).toEqual(["acquire", "unsent-read", "release"]);
    releasedOwnFreeze();
  });

  it("a fully sent running bill charges the server's total", async () => {
    tabType = "secure";
    rows = [{ state: "fired", fulfillment: "dinein", qty: 3 }];
    const r = await closeSecureTab({ sessionId: SESSION, quotedCents: 4368 });
    expect(r).toEqual({ ok: true });
    expect(ops).toContain("pi.create:4368");
  });
});

// ── Phase 2c · review fixes · reg2 ──
describe("the counter's exemption is the MODE's — not a coincidence of to-go rows (R6)", () => {
  // Every case above that pins the exemption uses to-go drafts, which count 0 in ANY mode — so
  // replacing `session.mode` with "dinein" at either door survived. A pickup (counter) session
  // holding DINE-IN-fulfilment drafts separates the two: the rows count, and only the mode exempts.
  const COUNTER = { id: SESSION, mode: "pickup", qr_code: "reg-7K2Q" };

  it("settleCash — a counter order with dine-in drafts still settles", async () => {
    // MUTATION (p2c-reg2/cash-gate-ignores-the-mode): read the gate with "dinein" — the counter,
    // which cooks when it is PAID, can never take cash for this order; red.
    session = COUNTER;
    rows = [{ state: "draft", fulfillment: "dinein", qty: 2 }];
    const r = await settleCash({ sessionId: SESSION, tipCents: 0, quotedCents: 4368 });
    expect(r).toMatchObject({ ok: true, orderId: "order-1" });
    expect(cashRecorded()).toBe(true);
    // The rows were read and DID count — the mode is what let it through.
    expect(ops).toContain("unsent-read");
  });

  it("closeSecureTab — a counter order with dine-in drafts still charges", async () => {
    // MUTATION (p2c-reg2/tab-close-gate-ignores-the-mode): the same, at the running-bill close; red.
    session = COUNTER;
    tabType = "secure";
    rows = [{ state: "draft", fulfillment: "dinein", qty: 2 }];
    const r = await closeSecureTab({ sessionId: SESSION, quotedCents: 4368 });
    expect(r).toEqual({ ok: true });
    expect(ops).toContain("pi.create:4368");
  });
});
