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
const ATTEMPT = "2026-08-19T18:00:00.000Z";
const lockReleases: string[] = [];
vi.mock("./lock", () => ({
  releaseCartLock: (cartId: string) => {
    lockReleases.push(cartId);
    return Promise.resolve(null);
  },
}));

let voidResult: number | null = 0;
let voidError: { message: string } | null = null;
let markError: { message: string } | null = null;
const voidCalls: unknown[] = [];
/** W23d — every RPC in call order, so the ORDERING between the verdict and the Stripe cancel can be
 *  asserted rather than assumed. `voidCalls` keeps only the precheck, so the W23c assertions above
 *  (`toHaveLength(1)`, `voidCalls[0]`) keep meaning exactly what they meant. */
const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      if (fn === "mms_mark_settle_canceled")
        return Promise.resolve({ data: markError ? null : 1, error: markError });
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
  markError = null;
  rpcCalls.length = 0;
  readOk = true;
  lockReleases.length = 0;
  cancelThrows = false;
});

describe("settleAuthorizedPickup", () => {
  it("captures the full hold when the catalog still has everything", async () => {
    const r = await settleAuthorizedPickup("pi_1", "cart_1", 5200, 0.2, PAYER, ATTEMPT);
    expect(r).toEqual({ kind: "captured", amountCents: 5200, partial: false, dropped: [] });
    expect(captures).toEqual([{ id: "pi_1", amount: 5200 }]);
    // The precheck runs even with nothing to drop — it is the proof the cart is still open and
    // still ours, and a check that skipped the ordinary path would be a check the ordinary path
    // does not have.
    expect(voidCalls).toHaveLength(1);
    expect(voidCalls[0]).toMatchObject({
      fn: "mms_settle_precheck_and_void",
      args: { p_cart: "cart_1", p_menu_ids: [], p_payer: PAYER, p_attempt: ATTEMPT },
    });
  });

  it("voids what ran out, then captures the REDUCED total", async () => {
    gone = [{ id: "m1", name: "Mohinga" }];
    voidResult = 1;
    liveTotal = 3800; // re-derived after the void, tip recomputed at the chosen rate
    const r = await settleAuthorizedPickup("pi_2", "cart_2", 5200, 0.2, PAYER, ATTEMPT);
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
      args: { p_cart: "cart_2", p_menu_ids: ["m1"], p_payer: PAYER, p_attempt: ATTEMPT },
    });
  });

  it("re-derives the total AFTER voiding, never before", async () => {
    // The ordering IS the money rule: totals read before the void would still contain the dish the
    // kitchen cannot make, and the guest would be charged for it.
    gone = [{ id: "m1", name: "Mohinga" }];
    voidResult = 1;
    liveTotal = 3800;
    await settleAuthorizedPickup("pi_3", "cart_3", 5200, 0.2, PAYER, ATTEMPT);
    expect(voidCalls).toHaveLength(1);
    expect(captures[0]!.amount).toBe(3800); // the post-void figure, not the 5200 hold
  });

  it("does NOT capture when the void could not be read", async () => {
    // We have just been told the kitchen cannot fill this basket. Capturing the full hold on an
    // unreadable void is the exact charge this path exists to prevent, so leave the hold standing
    // and let Stripe redeliver.
    gone = [{ id: "m1", name: "Mohinga" }];
    voidError = { message: "transport" };
    const r = await settleAuthorizedPickup("pi_4", "cart_4", 5200, 0.2, PAYER, ATTEMPT);
    expect(r.kind).toBe("retry");
    expect(captures).toEqual([]);
    expect(cancels).toEqual([]); // the hold is left INTACT for the retry, not thrown away
  });

  it("carries the attempt era into the precheck", async () => {
    // Without it a superseded authorization passes the lock check (same payer!) and captures its own
    // older amount and tip against the successor attempt's basket.
    await settleAuthorizedPickup("pi_14", "cart_14", 5200, 0.2, PAYER, ATTEMPT);
    expect(voidCalls[0]).toMatchObject({ args: { p_attempt: ATTEMPT } });
  });

  it("does NOT capture when the precheck failed and NOTHING had run out", async () => {
    // The separating case for the precheck guard. With lines to drop, the "nothing voided" guard
    // below catches a failed precheck too — so only the ordinary all-available path can prove this
    // one exists. And it is the important one: a failed precheck means we do not know the cart is
    // still open or still ours, which is exactly when capturing is unsafe.
    gone = [];
    voidError = { message: "transport" };
    const r = await settleAuthorizedPickup("pi_12", "cart_12", 5200, 0.2, PAYER, ATTEMPT);
    expect(r.kind).toBe("retry");
    expect(captures).toEqual([]);
    expect(cancels).toEqual([]);
  });

  it("cancels the hold when the cart is no longer open", async () => {
    gone = [{ id: "m1", name: "Mohinga" }];
    voidResult = -1; // the RPC's "cart is not open" answer
    const r = await settleAuthorizedPickup("pi_5", "cart_5", 5200, 0.2, PAYER, ATTEMPT);
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
    const r = await settleAuthorizedPickup("pi_6", "cart_6", 5200, 0.2, PAYER, ATTEMPT);
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
    const r = await settleAuthorizedPickup("pi_13", "cart_13", 5200, 0.2, PAYER, ATTEMPT);
    expect(r.kind).toBe("retry");
    expect(captures).toEqual([]);
    // The lock is NOT released either — the settlement has not actually ended yet.
    expect(lockReleases).toEqual([]);
  });

  it("does nothing to an intent that is no longer capturable", async () => {
    // Stripe redelivers for 72h. A second delivery of this event must not re-void a basket whose
    // money has already moved.
    intentStatus = "succeeded";
    const r = await settleAuthorizedPickup("pi_7", "cart_7", 5200, 0.2, PAYER, ATTEMPT);
    expect(r.kind).toBe("already");
    expect(captures).toEqual([]);
    expect(cancels).toEqual([]);
    expect(voidCalls).toEqual([]); // it returns before touching the cart at all
  });

  it("does NOT capture when the catalog could not be read — silence is not availability", async () => {
    // The gate upstream fails OPEN on purpose. Here that same silence would capture the full hold
    // for a basket that may contain a dish nobody can make.
    readOk = false;
    const r = await settleAuthorizedPickup("pi_9", "cart_9", 5200, 0.2, PAYER, ATTEMPT);
    expect(r.kind).toBe("retry");
    expect(captures).toEqual([]);
    expect(voidCalls).toEqual([]);
  });

  it("cancels when the lock has moved to another payer OR to a later attempt", async () => {
    // -2 covers both: `locked_by` naming someone else, and `locked_at` naming a LATER checkout by
    // this same diner. The second is the era-confusion case — a re-checkout with a different tip
    // leaves the first authorization's webhook still naming a valid payer, and only the attempt
    // stamp separates them.
    voidResult = -2;
    const r = await settleAuthorizedPickup("pi_10", "cart_10", 5200, 0.2, PAYER, ATTEMPT);
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
    const r = await settleAuthorizedPickup("pi_11", "cart_11", 5200, 0.2, PAYER, ATTEMPT);
    expect(r.kind).toBe("retry");
    expect(captures).toEqual([]);
    expect(cancels).toEqual([]);
  });

  it("leaves the hold intact when the totals read fails", async () => {
    totalsThrows = true;
    const r = await settleAuthorizedPickup("pi_8", "cart_8", 5200, 0.2, PAYER, ATTEMPT);
    expect(r.kind).toBe("retry");
    expect(captures).toEqual([]);
    expect(cancels).toEqual([]);
  });

  // ── W23d — the cancellation verdict (registry M71) ───────────────────────────────────────────

  it("stamps every dropped line with THIS attempt's PaymentIntent", async () => {
    // Without the intent on the row, the fulfillment snapshot can only join on cart_id — and a
    // cancelled all-dropped attempt leaves the cart OPEN, so the guest's next order in that same
    // cart would print "sold out" about dishes it never contained.
    gone = [{ id: "m1", name: "Mohinga" }];
    voidResult = 1;
    liveTotal = 3800;
    await settleAuthorizedPickup("pi_20", "cart_20", 5200, 0.2, PAYER, ATTEMPT);
    expect(voidCalls[0]).toMatchObject({ args: { p_intent: "pi_20" } });
  });

  it("RECORDS the cancellation before it cancels the hold", async () => {
    // ⚠️ The ordering is the rule. A failed cancel is retryable — the intent is still
    // requires_capture — but the moment the hold IS cancelled, every redelivery short-circuits on
    // `live.status !== "requires_capture"` and this write never runs again. Cancel-then-mark would
    // strand the guest on "your payment is safe, show this screen to staff" for a hold nobody took.
    liveTotal = 0;
    const r = await settleAuthorizedPickup("pi_21", "cart_21", 5200, 0.2, PAYER, ATTEMPT);
    expect(r).toEqual({ kind: "canceled", reason: "nothing_left" });
    const markIndex = rpcCalls.findIndex((c) => c.fn === "mms_mark_settle_canceled");
    expect(markIndex).toBeGreaterThanOrEqual(0);
    expect(rpcCalls[markIndex]!.args).toMatchObject({
      p_intent: "pi_21",
      p_cart: "cart_21",
      p_reason: "nothing_left",
      p_payer: PAYER,
      p_attempt: ATTEMPT,
    });
    // The Stripe cancel is what has to come SECOND. Both happened, so only the order separates a
    // correct implementation from the one that loses the verdict.
    expect(cancels).toEqual(["pi_21"]);
  });

  it("does NOT cancel the hold when the verdict could not be recorded", async () => {
    // The other half of the ordering rule. Cancelling first and failing to record leaves a guest
    // with no explanation and no way to ever get one; leaving the hold standing costs them a
    // pending authorization for one redelivery cycle and keeps the fact recoverable.
    liveTotal = 0;
    markError = { message: "transport" };
    const r = await settleAuthorizedPickup("pi_22", "cart_22", 5200, 0.2, PAYER, ATTEMPT);
    expect(r).toEqual({ kind: "retry", note: "verdict not recorded" });
    expect(cancels).toEqual([]);
    expect(captures).toEqual([]);
    expect(lockReleases).toEqual([]);
  });

  it("records a promo-lapsed cancellation as over_authorized, NOT as a shortage", async () => {
    // The separating case for the reason vocabulary. `over_authorized` is reachable with ZERO lines
    // voided (a promo drops on `valid_until`, purely on time), and the copy for it must not blame a
    // sold-out dish — so the two cancel arms have to be distinguishable at the point of record.
    gone = [];
    voidResult = 0;
    liveTotal = 6000; // above the 5200 hold — you can capture less than you authorized, never more
    const r = await settleAuthorizedPickup("pi_23", "cart_23", 5200, 0.2, PAYER, ATTEMPT);
    expect(r).toEqual({ kind: "canceled", reason: "over_authorized" });
    expect(rpcCalls.find((c) => c.fn === "mms_mark_settle_canceled")?.args).toMatchObject({
      p_reason: "over_authorized",
    });
  });

  it("records the cart-not-open and superseded arms under their own reasons", async () => {
    voidResult = -1;
    await settleAuthorizedPickup("pi_24", "cart_24", 5200, 0.2, PAYER, ATTEMPT);
    expect(rpcCalls.find((c) => c.fn === "mms_mark_settle_canceled")?.args).toMatchObject({
      p_reason: "cart_not_open",
    });

    rpcCalls.length = 0;
    cancels.length = 0;
    voidResult = -2;
    await settleAuthorizedPickup("pi_25", "cart_25", 5200, 0.2, PAYER, ATTEMPT);
    expect(rpcCalls.find((c) => c.fn === "mms_mark_settle_canceled")?.args).toMatchObject({
      p_reason: "superseded",
    });
  });

  it("sends a NULL era rather than an empty string when the attempt is unknown", async () => {
    // `attemptStamp` is `locked_at ?? ""` at mint time. An empty string does not cast to timestamptz,
    // so passing it raw would error the RPC, answer `retry`, and burn Stripe's whole 72h redelivery
    // budget on the same failure while the guest's hold stood. Null is refused as -2, which cancels.
    await settleAuthorizedPickup("pi_26", "cart_26", 5200, 0.2, PAYER, "");
    expect(voidCalls[0]).toMatchObject({ args: { p_attempt: null } });
  });

  it("captures without recording any cancellation on the ordinary path", async () => {
    // The verdict is ASSERTED, never a by-product. A row written on a successful capture would make
    // /track tell a guest whose money moved that nothing was taken.
    await settleAuthorizedPickup("pi_27", "cart_27", 5200, 0.2, PAYER, ATTEMPT);
    expect(captures).toEqual([{ id: "pi_27", amount: 5200 }]);
    expect(rpcCalls.filter((c) => c.fn === "mms_mark_settle_canceled")).toEqual([]);
  });
});
