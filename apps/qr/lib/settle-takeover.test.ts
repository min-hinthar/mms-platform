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

vi.mock("./lock", () => ({
  acquireSettlement: () => {
    const r = acquireResults[acquireCalls] ?? acquireResults[acquireResults.length - 1];
    acquireCalls += 1;
    return Promise.resolve(r);
  },
  readLiveIntent: () => Promise.resolve(null),
  readLiveIntentFor: () => Promise.resolve(null),
  releasePayAttempt: () => Promise.resolve({ released: false, error: null }),
  unlinkPaymentIntent: () => Promise.resolve(null),
}));

const { acquireSettlementSuperseding } = await import("./supersede");
// The Stripe sequence has its own suite; here it is a SEAM (the defaulted `supersede` parameter),
// so the composition is falsified without five mocks of a client this decision never touches.
const fakeSupersede = () => {
  supersedeCalls += 1;
  return Promise.resolve(supersedeResult);
};
const takeover = (c: string, u: string) => acquireSettlementSuperseding(c, u, fakeSupersede);

beforeEach(() => {
  acquireCalls = 0;
  supersedeCalls = 0;
  supersedeResult = "cleared";
  acquireResults = ["acquired"];
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
    acquireResults = ["locked_stale", "acquired"];
    supersedeResult = "cleared";
    expect(await takeover("c", "u")).toBe("acquired");
    expect(supersedeCalls).toBe(1);
    expect(acquireCalls).toBe(2);
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

  it("retries exactly once, and never leaks `locked_stale` to a caller with no arm for it", async () => {
    // If the second acquire still refuses, something else moved under us — a fresh lock, a rival
    // settlement, the cart closing — and that is an answer, not a reason to loop. `locked_stale`
    // cannot be the answer twice after a successful supersede, but the TYPE says it can, and a leak
    // would reach four call sites that render it as nothing at all.
    acquireResults = ["locked_stale", "locked_stale"];
    supersedeResult = "cleared";
    expect(await takeover("c", "u")).toBe("locked");
    expect(acquireCalls).toBe(2);
    expect(supersedeCalls).toBe(1);
  });
});
