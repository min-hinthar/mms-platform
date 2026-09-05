import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * M151 — the Stripe half of supersession, tested as SEQUENCE: which calls are made, in what order,
 * and which outcomes each Stripe answer maps to. The verdict table itself is `live-intent.test.ts`;
 * this suite pins that the orchestration consults it and never touches the row on the wrong arm.
 */
vi.mock("server-only", () => ({}));

let status = "requires_payment_method";
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
        return { status: seen > 1 && statusAfterCancel !== null ? statusAfterCancel : status };
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

const { supersedeLiveIntent, supersedeCartIntent, releasePayAttemptSafely } =
  await import("./supersede");

beforeEach(() => {
  status = "requires_payment_method";
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
