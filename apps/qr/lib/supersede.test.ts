import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * M151 — the Stripe half of supersession, tested as SEQUENCE: which calls are made, in what order,
 * and which outcomes each Stripe answer maps to. The verdict table itself is `live-intent.test.ts`;
 * this suite pins that the orchestration consults it and never touches the row on the wrong arm.
 */
vi.mock("server-only", () => ({}));

let status = "requires_payment_method";
let metadata: Record<string, string> = {};
let retrieveThrows: { code?: string } | null = null;
let cancelThrows: { code?: string } | null = null;
let statusAfterCancel: string | null = null;
const calls: string[] = [];
vi.mock("./stripe", () => ({
  getStripe: () => ({
    paymentIntents: {
      retrieve: async (id: string) => {
        calls.push(`retrieve:${id}`);
        if (retrieveThrows) throw retrieveThrows;
        // A second retrieve (after a refused cancel) reads the moved status.
        const seen = calls.filter((c) => c.startsWith("retrieve:")).length;
        return {
          status: seen > 1 && statusAfterCancel !== null ? statusAfterCancel : status,
          metadata,
        };
      },
      cancel: async (id: string) => {
        calls.push(`cancel:${id}`);
        if (cancelThrows) throw cancelThrows;
        return {};
      },
    },
  }),
}));

let live: string | null = null;
let liveFor: string | null = null;
let unlinkError: { message: string } | null = null;
let releaseResult: { released: boolean; error: { message: string } | null } = {
  released: true,
  error: null,
};
const lockCalls: string[] = [];
vi.mock("./lock", () => ({
  readLiveIntent: async (cartId: string) => {
    lockCalls.push(`readLiveIntent:${cartId}`);
    return live;
  },
  readLiveIntentFor: async (cartId: string, uid: string, era: string | null) => {
    lockCalls.push(`readLiveIntentFor:${cartId}:${uid}:${era}`);
    return liveFor;
  },
  unlinkPaymentIntent: async (cartId: string, pi: string) => {
    lockCalls.push(`unlink:${cartId}:${pi}`);
    return unlinkError;
  },
  releasePayAttempt: async (cartId: string, uid: string, era: string | null) => {
    lockCalls.push(`releasePayAttempt:${cartId}:${uid}:${era}`);
    return releaseResult;
  },
}));

// M151 — the ledger write a superseded PICKUP HOLD owes (`mms_mark_settle_canceled`), recorded as
// the RPC name + args so the reason and the payer are asserted, not just "an rpc ran".
let rpcError: { message: string } | null = null;
const rpcCalls: [string, Record<string, unknown>][] = [];
vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push([name, args]);
      return { data: null, error: rpcError };
    },
  }),
}));

const { supersedeLiveIntent, supersedeCartIntent, releasePayAttemptSafely } =
  await import("./supersede");

beforeEach(() => {
  status = "requires_payment_method";
  metadata = {};
  rpcError = null;
  rpcCalls.length = 0;
  retrieveThrows = null;
  cancelThrows = null;
  statusAfterCancel = null;
  calls.length = 0;
  lockCalls.length = 0;
  live = null;
  liveFor = null;
  unlinkError = null;
  releaseResult = { released: true, error: null };
});

describe("supersedeLiveIntent — retrieve decides, cancel follows, a refusal is re-read", () => {
  it("cancels an unconfirmed intent and reports cleared", async () => {
    expect(await supersedeLiveIntent("pi_1")).toBe("cleared");
    expect(calls).toEqual(["retrieve:pi_1", "cancel:pi_1"]);
  });

  it("NEVER cancels a captured intent — the verdict is read BEFORE any cancel", async () => {
    // THE M151 CASE. The order of `calls` is the assertion: a cancel that ran before the retrieve
    // would have been a cancel of a real charge.
    status = "succeeded";
    expect(await supersedeLiveIntent("pi_1")).toBe("captured");
    expect(calls).toEqual(["retrieve:pi_1"]);
    status = "processing";
    calls.length = 0;
    expect(await supersedeLiveIntent("pi_1")).toBe("captured");
    expect(calls).toEqual(["retrieve:pi_1"]);
  });

  it("a dead intent clears with no cancel call", async () => {
    status = "canceled";
    expect(await supersedeLiveIntent("pi_1")).toBe("cleared");
    expect(calls).toEqual(["retrieve:pi_1"]);
  });

  it("a state-refused cancel is re-read once, and the re-read decides", async () => {
    cancelThrows = { code: "payment_intent_unexpected_state" };
    statusAfterCancel = "succeeded";
    expect(await supersedeLiveIntent("pi_1")).toBe("captured");
    expect(calls).toEqual(["retrieve:pi_1", "cancel:pi_1", "retrieve:pi_1"]);
  });

  it("a transport failure on retrieve or cancel is unknown — never cleared", async () => {
    retrieveThrows = { code: "api_connection_error" };
    expect(await supersedeLiveIntent("pi_1")).toBe("unknown");
    retrieveThrows = null;
    cancelThrows = { code: "rate_limit" };
    expect(await supersedeLiveIntent("pi_1")).toBe("unknown");
  });

  it("a vanished intent is cleared — nothing left that could capture", async () => {
    retrieveThrows = { code: "resource_missing" };
    expect(await supersedeLiveIntent("pi_1")).toBe("cleared");
  });
});

describe("supersedeCartIntent — create-intent's step", () => {
  it("is a no-op on a cart that names no intent (the ordinary first checkout)", async () => {
    expect(await supersedeCartIntent("cart-1")).toBe("cleared");
    expect(calls).toEqual([]);
    expect(lockCalls).toEqual(["readLiveIntent:cart-1"]);
  });

  it("drops the link ONLY after the intent is cleared at Stripe", async () => {
    live = "pi_old";
    expect(await supersedeCartIntent("cart-1")).toBe("cleared");
    expect(calls).toEqual(["retrieve:pi_old", "cancel:pi_old"]);
    expect(lockCalls).toEqual(["readLiveIntent:cart-1", "unlink:cart-1:pi_old"]);
  });

  it("still reports cleared when the unlink itself fails — the intent is dead, the row heals next time", async () => {
    // The bookkeeping write is best-effort by design (a refusal here would strand a diner over a
    // row the next attempt heals anyway) — but it must be LOUD, never a silent swallow (W10c).
    live = "pi_old";
    unlinkError = { message: "boom" };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await supersedeCartIntent("cart-1")).toBe("cleared");
      expect(calls).toEqual(["retrieve:pi_old", "cancel:pi_old"]);
      expect(lockCalls).toEqual(["readLiveIntent:cart-1", "unlink:cart-1:pi_old"]);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0]![0]).toBe("[supersede] link not dropped after cancel");
    } finally {
      spy.mockRestore();
    }
  });

  it("RECORDS a superseded pickup hold before dropping the link, with the hold's own payer and era", async () => {
    // THE /track CASE (blind pass on #257, CRITICAL 3). Before the link the cron superseded a hold
    // LAZILY at fire time and wrote this exact row; cancelling it eagerly here meant the cron met a
    // dead intent, answered `already`, and `/track` polled "authorized" over a hold Stripe had
    // released. The row is what the dropped view renders as "This payment was replaced".
    live = "pi_hold";
    status = "requires_capture";
    metadata = { kind: "pickup_manual", cartId: "cart-1", earnerUid: "u-hold", attempt: "era-h" };
    expect(await supersedeCartIntent("cart-1")).toBe("cleared");
    expect(calls).toEqual(["retrieve:pi_hold", "cancel:pi_hold"]);
    expect(rpcCalls).toEqual([
      [
        "mms_mark_settle_canceled",
        {
          p_intent: "pi_hold",
          p_cart: "cart-1",
          p_reason: "superseded",
          p_payer: "u-hold",
          p_attempt: "era-h",
        },
      ],
    ]);
    // The row lands BEFORE the unlink: a successor's link write after this must never find the
    // hold un-recorded.
    expect(lockCalls).toEqual(["readLiveIntent:cart-1", "unlink:cart-1:pi_hold"]);
  });

  it("a hold with empty attempt metadata records a NULL era, never an empty string", async () => {
    live = "pi_hold";
    status = "requires_capture";
    metadata = { kind: "pickup_manual", cartId: "cart-1", earnerUid: "u-hold", attempt: "" };
    await supersedeCartIntent("cart-1");
    expect(rpcCalls[0]![1]).toMatchObject({ p_attempt: null });
  });

  it("writes NO ledger row for an auto-capture intent, an already-dead hold, or a refused cancel", async () => {
    // Only a cancel WE issued and Stripe accepted is a cancellation we may record as ours.
    live = "pi_auto";
    metadata = { cartId: "cart-1", earnerUid: "u1" };
    await supersedeCartIntent("cart-1");
    expect(rpcCalls).toEqual([]);
    // Dead hold: the cron (or a dashboard cancel) already ended it; its own row stands or does not.
    calls.length = 0;
    live = "pi_hold";
    status = "canceled";
    metadata = { kind: "pickup_manual", cartId: "cart-1", earnerUid: "u1", attempt: "e" };
    await supersedeCartIntent("cart-1");
    expect(rpcCalls).toEqual([]);
    // Refused cancel: nothing was cancelled by this call.
    status = "requires_capture";
    cancelThrows = { code: "rate_limit" };
    await supersedeCartIntent("cart-1");
    expect(rpcCalls).toEqual([]);
  });

  it("a failed ledger write is logged and does NOT refuse the successor — the hold is already gone", async () => {
    live = "pi_hold";
    status = "requires_capture";
    metadata = { kind: "pickup_manual", cartId: "cart-1", earnerUid: "u1", attempt: "e" };
    rpcError = { message: "boom" };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await supersedeCartIntent("cart-1")).toBe("cleared");
      expect(lockCalls).toEqual(["readLiveIntent:cart-1", "unlink:cart-1:pi_hold"]);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });

  it("touches NOTHING on the row when the predecessor captured or Stripe could not say", async () => {
    // M152 (b) in the fix's own terms: the link outlives our attempt when the intent it names is
    // real. An unlink here would let the very next statement clear the pin under it.
    live = "pi_old";
    status = "succeeded";
    expect(await supersedeCartIntent("cart-1")).toBe("captured");
    expect(lockCalls).toEqual(["readLiveIntent:cart-1"]);
    lockCalls.length = 0;
    status = "requires_payment_method";
    cancelThrows = { code: "rate_limit" };
    expect(await supersedeCartIntent("cart-1")).toBe("unknown");
    expect(lockCalls).toEqual(["readLiveIntent:cart-1"]);
  });
});

describe("releasePayAttemptSafely — the client exits cancel THEIR OWN intent, then release", () => {
  it("fails closed with no era: no read, no Stripe, no statement", async () => {
    expect(await releasePayAttemptSafely("cart-1", "u1", null)).toEqual({
      released: false,
      error: null,
    });
    expect(lockCalls).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("reads the intent SCOPED to seat and era, cancels it, then releases", async () => {
    liveFor = "pi_mine";
    expect(await releasePayAttemptSafely("cart-1", "u1", "era-1")).toEqual({
      released: true,
      error: null,
    });
    expect(lockCalls).toEqual([
      "readLiveIntentFor:cart-1:u1:era-1",
      "releasePayAttempt:cart-1:u1:era-1",
    ]);
    expect(calls).toEqual(["retrieve:pi_mine", "cancel:pi_mine"]);
  });

  it("a superseded tab reads NO intent and falls through to the era-scoped release, which reports it", async () => {
    // M124's shape: the scoped read is what keeps a stale tab from cancelling the live tab's intent.
    liveFor = null;
    releaseResult = { released: false, error: null };
    expect(await releasePayAttemptSafely("cart-1", "u1", "era-old")).toEqual({
      released: false,
      error: null,
    });
    expect(calls).toEqual([]);
  });

  it("REFUSES with `paying` when this attempt's intent captured, and issues NO release statement", async () => {
    liveFor = "pi_mine";
    status = "processing";
    expect(await releasePayAttemptSafely("cart-1", "u1", "era-1")).toEqual({
      released: false,
      error: null,
      reason: "paying",
    });
    expect(lockCalls).toEqual(["readLiveIntentFor:cart-1:u1:era-1"]);
  });

  it("refuses as `unknown` on a Stripe transport failure, releasing nothing", async () => {
    liveFor = "pi_mine";
    cancelThrows = { code: "api_error" };
    expect(await releasePayAttemptSafely("cart-1", "u1", "era-1")).toEqual({
      released: false,
      error: null,
      reason: "unknown",
    });
    expect(lockCalls).toEqual(["readLiveIntentFor:cart-1:u1:era-1"]);
  });
});
