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
let cancelThrows = false;
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
        if (cancelThrows) return Promise.reject(new Error("stripe down"));
        cancels.push(id);
        return Promise.resolve({});
      },
    },
  }),
}));

let gone: { id: string; name: string }[] = [];
let readOk = true;
vi.mock("./availability-read", () => ({
  unavailableLines: () => Promise.resolve(readOk ? { ok: true, lines: gone } : { ok: false }),
}));

// The live total AFTER the voids — getCartTotals re-derives it, tip included, at the chosen rate.
let liveTotal = 5200;
let totalsThrows = false;
vi.mock("./totals", () => ({
  getCartTotals: () => {
    if (totalsThrows) throw new Error("unreadable cart");
    return Promise.resolve({ totalCents: liveTotal });
  },
}));

const PAYER = "payer-uid-1";
const lockReleases: string[] = [];
vi.mock("./lock", () => ({
  releaseCartLock: (cartId: string) => {
    lockReleases.push(cartId);
    return Promise.resolve(null);
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
  readOk = true;
  lockReleases.length = 0;
  cancelThrows = false;
});

describe("settleAuthorizedPickup", () => {
  it("captures the full hold when the catalog still has everything", async () => {
    const r = await settleAuthorizedPickup("pi_1", "cart_1", 5200, 0.2, PAYER);
    expect(r).toEqual({ kind: "captured", amountCents: 5200, partial: false, dropped: [] });
    expect(captures).toEqual([{ id: "pi_1", amount: 5200 }]);
    // The precheck runs even with nothing to drop — it is the proof the cart is still open and
    // still ours, and a check that skipped the ordinary path would be a check the ordinary path
    // does not have.
    expect(voidCalls).toHaveLength(1);
    expect(voidCalls[0]).toMatchObject({
      fn: "mms_settle_precheck_and_void",
      args: { p_cart: "cart_1", p_menu_ids: [], p_payer: PAYER },
    });
  });

  it("voids what ran out, then captures the REDUCED total", async () => {
    gone = [{ id: "m1", name: "Mohinga" }];
    voidResult = 1;
    liveTotal = 3800; // re-derived after the void, tip recomputed at the chosen rate
    const r = await settleAuthorizedPickup("pi_2", "cart_2", 5200, 0.2, PAYER);
    expect(r).toEqual({
      kind: "captured",
      amountCents: 3800,
      partial: true,
      dropped: ["Mohinga"],
    });
    expect(captures).toEqual([{ id: "pi_2", amount: 3800 }]);
    // The IDS have to reach the RPC, not just the call. Without this the suite passes whether the
    // precheck is handed the sold-out dish or an empty list — the mocked total hides the difference,
    // and the void becomes a no-op that still captures a reduced amount by coincidence.
    expect(voidCalls[0]).toMatchObject({
      fn: "mms_settle_precheck_and_void",
      args: { p_cart: "cart_2", p_menu_ids: ["m1"], p_payer: PAYER },
    });
  });

  it("re-derives the total AFTER voiding, never before", async () => {
    // The ordering IS the money rule: totals read before the void would still contain the dish the
    // kitchen cannot make, and the guest would be charged for it.
    gone = [{ id: "m1", name: "Mohinga" }];
    voidResult = 1;
    liveTotal = 3800;
    await settleAuthorizedPickup("pi_3", "cart_3", 5200, 0.2, PAYER);
    expect(voidCalls).toHaveLength(1);
    expect(captures[0]!.amount).toBe(3800); // the post-void figure, not the 5200 hold
  });

  it("does NOT capture when the void could not be read", async () => {
    // We have just been told the kitchen cannot fill this basket. Capturing the full hold on an
    // unreadable void is the exact charge this path exists to prevent, so leave the hold standing
    // and let Stripe redeliver.
    gone = [{ id: "m1", name: "Mohinga" }];
    voidError = { message: "transport" };
    const r = await settleAuthorizedPickup("pi_4", "cart_4", 5200, 0.2, PAYER);
    expect(r.kind).toBe("retry");
    expect(captures).toEqual([]);
    expect(cancels).toEqual([]); // the hold is left INTACT for the retry, not thrown away
  });

  it("does NOT capture when the precheck failed and NOTHING had run out", async () => {
    // The separating case for the precheck guard. With lines to drop, the "nothing voided" guard
    // below catches a failed precheck too — so only the ordinary all-available path can prove this
    // one exists. And it is the important one: a failed precheck means we do not know the cart is
    // still open or still ours, which is exactly when capturing is unsafe.
    gone = [];
    voidError = { message: "transport" };
    const r = await settleAuthorizedPickup("pi_12", "cart_12", 5200, 0.2, PAYER);
    expect(r.kind).toBe("retry");
    expect(captures).toEqual([]);
    expect(cancels).toEqual([]);
  });

  it("cancels the hold when the cart is no longer open", async () => {
    gone = [{ id: "m1", name: "Mohinga" }];
    voidResult = -1; // the RPC's "cart is not open" answer
    const r = await settleAuthorizedPickup("pi_5", "cart_5", 5200, 0.2, PAYER);
    expect(r).toEqual({ kind: "canceled", reason: "cart no longer open" });
    expect(cancels).toEqual(["pi_5"]);
    expect(captures).toEqual([]);
    // The settlement is definitively over, so OUR lock comes off rather than freezing the cart for
    // the rest of its TTL — `payment_intent.canceled` handles only split and Terminal intents, so
    // no later event would have released it.
    expect(lockReleases).toEqual(["cart_5"]);
  });

  it("cancels rather than capturing when nothing survives", async () => {
    gone = [{ id: "m1", name: "Mohinga" }];
    voidResult = 1;
    liveTotal = 0;
    const r = await settleAuthorizedPickup("pi_6", "cart_6", 5200, 0.2, PAYER);
    expect(r).toEqual({ kind: "canceled", reason: "nothing_left" });
    expect(cancels).toEqual(["pi_6"]);
    expect(captures).toEqual([]);
    expect(lockReleases).toEqual(["cart_6"]);
  });

  it("RETRIES a failed cancellation instead of acknowledging it", async () => {
    // A hold ties up the guest's available funds for days, on a card they may need, for an order
    // they are not getting — it is the most user-visible thing this path can leave behind, not
    // tidiness. Cancellation is idempotent and no money has moved, so a 5xx is safe.
    cancelThrows = true;
    liveTotal = 0;
    const r = await settleAuthorizedPickup("pi_13", "cart_13", 5200, 0.2, PAYER);
    expect(r.kind).toBe("retry");
    expect(captures).toEqual([]);
    // The lock is NOT released either — the settlement has not actually ended yet.
    expect(lockReleases).toEqual([]);
  });

  it("does nothing to an intent that is no longer capturable", async () => {
    // Stripe redelivers for 72h. A second delivery of this event must not re-void a basket whose
    // money has already moved.
    intentStatus = "succeeded";
    const r = await settleAuthorizedPickup("pi_7", "cart_7", 5200, 0.2, PAYER);
    expect(r.kind).toBe("already");
    expect(captures).toEqual([]);
    expect(cancels).toEqual([]);
    expect(voidCalls).toEqual([]); // it returns before touching the cart at all
  });

  it("does NOT capture when the catalog could not be read — silence is not availability", async () => {
    // The gate upstream fails OPEN on purpose. Here that same silence would capture the full hold
    // for a basket that may contain a dish nobody can make.
    readOk = false;
    const r = await settleAuthorizedPickup("pi_9", "cart_9", 5200, 0.2, PAYER);
    expect(r.kind).toBe("retry");
    expect(captures).toEqual([]);
    expect(voidCalls).toEqual([]);
  });

  it("cancels when the pay lock has moved to another payer", async () => {
    voidResult = -2;
    const r = await settleAuthorizedPickup("pi_10", "cart_10", 5200, 0.2, PAYER);
    expect(r).toEqual({ kind: "canceled", reason: "lock lost to another payer" });
    expect(captures).toEqual([]);
    expect(cancels).toEqual(["pi_10"]);
    // Deliberately NOT released: that lock belongs to somebody else now, and one settlement must
    // never clear another's.
    expect(lockReleases).toEqual([]);
  });

  it("refuses to capture when lines had to go and none did", async () => {
    // A predicate drifting between the gate and the RPC is exactly how the comped-line hole
    // appeared. Rather than reason about WHY nothing matched, refuse: the basket still contains
    // something the kitchen cannot make.
    gone = [{ id: "m1", name: "Mohinga" }];
    voidResult = 0;
    const r = await settleAuthorizedPickup("pi_11", "cart_11", 5200, 0.2, PAYER);
    expect(r.kind).toBe("retry");
    expect(captures).toEqual([]);
    expect(cancels).toEqual([]);
  });

  it("leaves the hold intact when the totals read fails", async () => {
    totalsThrows = true;
    const r = await settleAuthorizedPickup("pi_8", "cart_8", 5200, 0.2, PAYER);
    expect(r.kind).toBe("retry");
    expect(captures).toEqual([]);
    expect(cancels).toEqual([]);
  });
});
