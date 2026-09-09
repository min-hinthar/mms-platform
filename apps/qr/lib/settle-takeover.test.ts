import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SettleResult } from "./lock";
import type { SupersedeOutcome } from "./live-intent";

/**
 * M197 — `acquireSettlementSuperseding`'s arm table, which is where the double-charge lives.
 *
 * The acquire and the Stripe sequence are both pinned elsewhere (`lock.test.ts` for the statement,
 * `supersede`'s own arms via `live-intent.test.ts` for the verdict). What has no other home is the
 * COMPOSITION: which outcomes may proceed to a second acquire, which must refuse, and which must
 * refuse without pretending to know why. Getting that wrong is not a latency bug — `captured`
 * reaching the retry is staff taking cash on a card that is already charging.
 */
vi.mock("server-only", () => ({}));
vi.mock("@mms/db/server", () => ({ serviceClient: () => ({}) }));
vi.mock("./stripe", () => ({ getStripe: () => ({}) }));

let acquireResults: SettleResult[] = [];
let acquireCalls = 0;
let supersedeResult: SupersedeOutcome = "cleared";
let supersedeCalls = 0;

let liveIntent: string | null = "pi_abandoned";
let liveIntentThrows = false;
let claimed = true;
let claimCalls: { intentId: string }[] = [];
let released: string[] = [];
let pinCleared: { cartId: string; intentId: string }[] = [];

vi.mock("./lock", () => ({
  acquireSettlement: () => {
    const r = acquireResults[acquireCalls] ?? acquireResults[acquireResults.length - 1];
    acquireCalls += 1;
    return Promise.resolve(r);
  },
  readLiveIntent: () => {
    if (liveIntentThrows) return Promise.reject(new Error("postgrest down"));
    return Promise.resolve(liveIntent);
  },
  claimStaleSettlement: (_c: string, _u: string, intentId: string) => {
    claimCalls.push({ intentId });
    return Promise.resolve({ claimed, error: null });
  },
  releaseSettlement: (cartId: string) => {
    released.push(cartId);
    return Promise.resolve(null);
  },
  releaseByIntent: (cartId: string, intentId: string) => {
    pinCleared.push({ cartId, intentId });
    return Promise.resolve({ released: true, error: null });
  },
  readLiveIntentFor: () => Promise.resolve(null),
  releasePayAttempt: () => Promise.resolve({ released: false, error: null }),
  unlinkPaymentIntent: () => Promise.resolve(null),
}));

const { acquireSettlementSuperseding } = await import("./supersede");
// The Stripe sequence has its own suite; here it is a SEAM (the defaulted `supersede` parameter),
// so the composition is falsified without five mocks of a client this decision never touches.
let supersedeArgs: string[] = [];
const fakeSupersede = (id: string) => {
  supersedeCalls += 1;
  supersedeArgs.push(id);
  return Promise.resolve(supersedeResult);
};
const takeover = (c: string, u: string) => acquireSettlementSuperseding(c, u, fakeSupersede);

beforeEach(() => {
  acquireCalls = 0;
  supersedeCalls = 0;
  supersedeResult = "cleared";
  acquireResults = ["acquired"];
  liveIntent = "pi_abandoned";
  liveIntentThrows = false;
  claimed = true;
  claimCalls = [];
  supersedeArgs = [];
  released = [];
  pinCleared = [];
});

describe("acquireSettlementSuperseding — M197", () => {
  it("does NOT reach Stripe on any verdict but `locked_stale`", async () => {
    // The ordinary path must stay one statement. A wrapper that retrieved an intent on every cash
    // settle would put a Stripe round trip in front of the counter's fastest operation, and would
    // cancel nothing — there is no abandoned attempt to supersede.
    for (const r of ["acquired", "locked", "settling_other", "closed", "unavailable"] as const) {
      acquireCalls = 0;
      supersedeCalls = 0;
      acquireResults = [r];
      expect(await takeover("c", "u")).toBe(r);
      expect(supersedeCalls).toBe(0);
      expect(acquireCalls).toBe(1);
    }
  });

  it("supersedes an abandoned attempt, then acquires — the deadlock's exit", async () => {
    // The whole item: a declined card is deliberately left locked (`releaseCartLock`'s docblock),
    // and before this the TTL that docblock promises never arrived for cash, Terminal, tab-close or
    // split. One diner walking out froze every other tender on the table for good.
    acquireResults = ["locked_stale"];
    supersedeResult = "cleared";
    expect(await takeover("c", "u")).toBe("acquired");
    expect(supersedeCalls).toBe(1);
    // ⚠️ ONE acquire, not two. The freeze is taken by the CLAIM, and re-running the ordinary acquire
    // afterwards could only risk losing what we already hold.
    expect(acquireCalls).toBe(1);
    expect(claimCalls).toEqual([{ intentId: "pi_abandoned" }]);
    // The cancelled attempt's promo pin goes with it, keyed on that intent.
    expect(pinCleared).toEqual([{ cartId: "c", intentId: "pi_abandoned" }]);
  });

  it("CLAIMS the stale attempt before cancelling anything at Stripe", async () => {
    // Codex round 2, P1. Until the claim lands this path holds no mutex, so the diner can call
    // create-intent, re-acquire the pay lock and link a live intent in the gap — and the old code
    // read the row FRESH and cancelled whatever it named, killing a resumed checkout and still
    // refusing staff. A fresh `settle_at` blocks `acquireCartLock`, so claiming first freezes the
    // exact state we diagnosed.
    acquireResults = ["locked_stale"];
    await takeover("c", "u");
    expect(claimCalls).toHaveLength(1);
    // …and the cancel targets the id we DIAGNOSED, never "whatever the row names now".
    expect(supersedeArgs).toEqual(["pi_abandoned"]);
  });

  it("stands down when the claim loses — something moved, so re-ask instead of cancelling", async () => {
    acquireResults = ["locked_stale", "locked"];
    claimed = false;
    expect(await takeover("c", "u")).toBe("locked");
    expect(supersedeCalls).toBe(0); // nothing irreversible on a claim we did not win
    expect(acquireCalls).toBe(2);
  });

  it("gives the freeze BACK when the supersede refuses", async () => {
    // The claim is a real freeze on a live table. Refusing without releasing would strand every
    // tender for the settle TTL over an attempt we decided not to touch.
    acquireResults = ["locked_stale"];
    supersedeResult = "captured";
    expect(await takeover("c", "u")).toBe("paying");
    expect(released).toEqual(["c"]);
    expect(pinCleared).toEqual([]); // a captured attempt keeps its pin — the webhook reconciles it
  });

  it("answers `unavailable` when a step THROWS instead of returning", async () => {
    // Codex round 2, P2. `readLiveIntent` rethrows its postgrest error and `getStripe()` throws on a
    // missing/mode-mismatched key. Both callers are Server Actions that set `busy` before awaiting
    // and have no catch, so an escaping rejection latches the staff control instead of showing the
    // retryable sentence this union carries.
    acquireResults = ["locked_stale"];
    liveIntentThrows = true;
    expect(await takeover("c", "u")).toBe("unavailable");
    expect(supersedeCalls).toBe(0);
  });

  it("re-asks plainly when the row no longer names an intent", async () => {
    // Whatever made it `locked_stale` is gone; the ordinary acquire can have it.
    acquireResults = ["locked_stale", "acquired"];
    liveIntent = null;
    expect(await takeover("c", "u")).toBe("acquired");
    expect(claimCalls).toHaveLength(0);
    expect(supersedeCalls).toBe(0);
  });

  it("REFUSES when the abandoned attempt turns out to be charging", async () => {
    // The direction that costs money rather than service. `captured` means the card is charged or
    // charging and the webhook is about to fulfil; taking cash on top collects twice and leaves the
    // guest waiting on a manual refund. The second acquire must never run.
    acquireResults = ["locked_stale", "acquired"];
    supersedeResult = "captured";
    expect(await takeover("c", "u")).toBe("paying");
    expect(acquireCalls).toBe(1);
  });

  it("reports an unreachable Stripe as `unavailable`, never as `locked`", async () => {
    // M119's rule, one hop out: a transport failure is not a verdict. Answering `locked` would tell
    // staff a diner is checking out, which we did not establish — the truth is that we could not
    // tell, and that is a retry.
    acquireResults = ["locked_stale", "acquired"];
    supersedeResult = "unknown";
    expect(await takeover("c", "u")).toBe("unavailable");
    expect(acquireCalls).toBe(1);
  });

  it("never lets `locked_stale` reach a caller — no call site has an arm for it", async () => {
    // A re-ask can still answer `locked_stale`: `supersedeCartIntent` returns `cleared` even when
    // `unlinkPaymentIntent` errors (it logs and proceeds — refusing over a bookkeeping write would
    // strand the caller; that swallow is OPEN-ITEMS M178), so the row can still name an intent that
    // is already dead at Stripe. Reporting that as `locked` renders "Someone's already paying on
    // their phone" over an authorization that no longer exists — the fabricated diagnosis this
    // function exists to end. Both re-ask paths collapse it to the retry it actually is.
    acquireResults = ["locked_stale", "locked_stale"];
    claimed = false; // the claim lost → re-ask → still stale
    expect(await takeover("c", "u")).toBe("unavailable");
    acquireCalls = 0;
    liveIntent = null; // the other re-ask path
    acquireResults = ["locked_stale", "locked_stale"];
    expect(await takeover("c", "u")).toBe("unavailable");
  });

  it("uses the SETTLEMENT verdict table, not create-intent's — an authorized hold is not cancelable here", async () => {
    // ⚠️ CRITICAL 1 from the blind pass. `classifyLiveIntent` calls `requires_capture` CANCELABLE,
    // and its stated reason is specific to create-intent: that caller's successor holds a fresh era,
    // so `mms_settle_precheck_and_void` would refuse the hold anyway (→ -2) and cancelling early
    // loses nothing. THIS caller writes only `settle_at`/`settle_by` — it never moves `locked_at` —
    // so the cron WOULD have captured, and cancelling voids a guest's authorized pickup payment.
    // `openCartFor` has no mode filter, so such a cart is reachable from every staff settle surface.
    let sawClassifier: ((s: string) => unknown) | null = null;
    acquireResults = ["locked_stale", "acquired"];
    await acquireSettlementSuperseding("c", "u", (_id, classify) => {
      sawClassifier = classify;
      return Promise.resolve("cleared" as const);
    });
    expect(sawClassifier).not.toBeNull();
    expect(sawClassifier!("requires_capture")).toBe("captured");
    // …and the states that are genuinely not money still are cancelable, or the takeover would
    // refuse every abandoned attempt and the deadlock would be exactly as it was.
    expect(sawClassifier!("requires_payment_method")).toBe("cancelable");
    expect(sawClassifier!("requires_action")).toBe("cancelable");
    expect(sawClassifier!("succeeded")).toBe("captured");
  });
});
