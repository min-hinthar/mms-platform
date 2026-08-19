import { describe, expect, it, beforeEach, vi } from "vitest";

/**
 * W23c — the sequence that moves the money, pinned.
 *
 * `manual-capture.ts` decides the AMOUNT; this file decides the ORDER OF OPERATIONS, and on a money
 * path the order is the rule. Three of the four tests below describe a state where capturing would
 * be wrong, and in each one the correct behaviour is to leave the authorization untouched — a hold
 * that nobody captures expires by itself within a week and costs the guest nothing, while a wrong
 * capture costs them money and buys the refund this whole track exists to avoid.
 */
vi.mock("server-only", () => ({}));

let intentStatus = "requires_capture";
const captures: { id: string; amount: number }[] = [];
const cancels: string[] = [];
vi.mock("./stripe", () => ({
  getStripe: () => ({
    paymentIntents: {
      retrieve: () => Promise.resolve({ status: intentStatus }),
      capture: (id: string, opts: { amount_to_capture: number }) => {
        captures.push({ id, amount: opts.amount_to_capture });
        return Promise.resolve({});
      },
      cancel: (id: string) => {
        cancels.push(id);
        return Promise.resolve({});
      },
    },
  }),
}));

let gone: { id: string; name: string }[] = [];
vi.mock("./availability-read", () => ({ unavailableLines: () => Promise.resolve(gone) }));

// The live total AFTER the voids — getCartTotals re-derives it, tip included, at the chosen rate.
let liveTotal = 5200;
let totalsThrows = false;
vi.mock("./totals", () => ({
  getCartTotals: () => {
    if (totalsThrows) throw new Error("unreadable cart");
    return Promise.resolve({ totalCents: liveTotal });
  },
}));

let voidResult: number | null = 0;
let voidError: { message: string } | null = null;
const voidCalls: unknown[] = [];
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    rpc: (fn: string, args: unknown) => {
      voidCalls.push({ fn, args });
      return Promise.resolve({ data: voidResult, error: voidError });
    },
  }),
}));

const { settleAuthorizedPickup } = await import("./manual-capture-run");

beforeEach(() => {
  intentStatus = "requires_capture";
  captures.length = 0;
  cancels.length = 0;
  voidCalls.length = 0;
  gone = [];
  liveTotal = 5200;
  totalsThrows = false;
  voidResult = 0;
  voidError = null;
});

describe("settleAuthorizedPickup", () => {
  it("captures the full hold when the catalog still has everything", async () => {
    const r = await settleAuthorizedPickup("pi_1", "cart_1", 5200, 0.2);
    expect(r).toEqual({ kind: "captured", amountCents: 5200, partial: false, dropped: [] });
    expect(captures).toEqual([{ id: "pi_1", amount: 5200 }]);
    // Nothing ran out, so nothing is voided — the common path must not touch the basket at all.
    expect(voidCalls).toEqual([]);
  });

  it("voids what ran out, then captures the REDUCED total", async () => {
    gone = [{ id: "m1", name: "Mohinga" }];
    voidResult = 1;
    liveTotal = 3800; // re-derived after the void, tip recomputed at the chosen rate
    const r = await settleAuthorizedPickup("pi_2", "cart_2", 5200, 0.2);
    expect(r).toEqual({
      kind: "captured",
      amountCents: 3800,
      partial: true,
      dropped: ["Mohinga"],
    });
    expect(captures).toEqual([{ id: "pi_2", amount: 3800 }]);
  });

  it("re-derives the total AFTER voiding, never before", async () => {
    // The ordering IS the money rule: totals read before the void would still contain the dish the
    // kitchen cannot make, and the guest would be charged for it.
    gone = [{ id: "m1", name: "Mohinga" }];
    voidResult = 1;
    liveTotal = 3800;
    await settleAuthorizedPickup("pi_3", "cart_3", 5200, 0.2);
    expect(voidCalls).toHaveLength(1);
    expect(captures[0]!.amount).toBe(3800); // the post-void figure, not the 5200 hold
  });

  it("does NOT capture when the void could not be read", async () => {
    // We have just been told the kitchen cannot fill this basket. Capturing the full hold on an
    // unreadable void is the exact charge this path exists to prevent, so leave the hold standing
    // and let Stripe redeliver.
    gone = [{ id: "m1", name: "Mohinga" }];
    voidError = { message: "transport" };
    const r = await settleAuthorizedPickup("pi_4", "cart_4", 5200, 0.2);
    expect(r.kind).toBe("retry");
    expect(captures).toEqual([]);
    expect(cancels).toEqual([]); // the hold is left INTACT for the retry, not thrown away
  });

  it("cancels the hold when the cart is no longer open", async () => {
    gone = [{ id: "m1", name: "Mohinga" }];
    voidResult = -1; // the RPC's "cart is not open" answer
    const r = await settleAuthorizedPickup("pi_5", "cart_5", 5200, 0.2);
    expect(r).toEqual({ kind: "canceled", reason: "cart no longer open" });
    expect(cancels).toEqual(["pi_5"]);
    expect(captures).toEqual([]);
  });

  it("cancels rather than capturing when nothing survives", async () => {
    gone = [{ id: "m1", name: "Mohinga" }];
    voidResult = 1;
    liveTotal = 0;
    const r = await settleAuthorizedPickup("pi_6", "cart_6", 5200, 0.2);
    expect(r).toEqual({ kind: "canceled", reason: "nothing_left" });
    expect(cancels).toEqual(["pi_6"]);
    expect(captures).toEqual([]);
  });

  it("does nothing to an intent that is no longer capturable", async () => {
    // Stripe redelivers for 72h. A second delivery of this event must not re-void a basket whose
    // money has already moved.
    intentStatus = "succeeded";
    const r = await settleAuthorizedPickup("pi_7", "cart_7", 5200, 0.2);
    expect(r.kind).toBe("already");
    expect(captures).toEqual([]);
    expect(cancels).toEqual([]);
    expect(voidCalls).toEqual([]);
  });

  it("leaves the hold intact when the totals read fails", async () => {
    totalsThrows = true;
    const r = await settleAuthorizedPickup("pi_8", "cart_8", 5200, 0.2);
    expect(r.kind).toBe("retry");
    expect(captures).toEqual([]);
    expect(cancels).toEqual([]);
  });
});
