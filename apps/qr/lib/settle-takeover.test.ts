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
let pinClearFails = false;
let supersedeThrows = false;
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
    if (pinClearFails)
      return Promise.resolve({ released: false, error: { message: "write failed" } });
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
let supersedeArgs: { cartId: string; intentId: string }[] = [];
const fakeSupersede = (cartId: string, intentId: string) => {
  supersedeCalls += 1;
  if (supersedeThrows) throw new Error("stripe unavailable");
  supersedeArgs.push({ cartId, intentId });
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
  pinClearFails = false;
  supersedeThrows = false;
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
    expect(supersedeArgs).toEqual([{ cartId: "c", intentId: "pi_abandoned" }]);
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

  it("hands the superseder BOTH the cart and the intent, in that order", async () => {
    // ⚠️ CODEX ROUND 3, P1 — AND THE TEST THAT REPLACED IT ENCODED THE BUG. The seam used to be
    // `(id, classify)` with `supersedeCartIntent` as its default — a function whose first parameter
    // is a CART id. Passing the diagnosed intent id typechecked (both are `string`), and in
    // production it looked up a cart named `pi_…`, found none, returned "cleared" WITHOUT CALLING
    // STRIPE, and this path then cleared the real cart's pin and link and let staff settle over a
    // still-confirmable intent. The old assertion here — "the intent id is passed" — was a
    // restatement of the defect, which is why it stayed green.
    //
    // Two NAMED parameters is the fix: a caller cannot put the right type in the wrong slot.
    acquireResults = ["locked_stale"];
    await takeover("c", "u");
    expect(supersedeArgs).toEqual([{ cartId: "c", intentId: "pi_abandoned" }]);
  });

  it("releases the claimed freeze when a post-claim step THROWS", async () => {
    // Codex round 3, P2. Once the claim lands the freeze blocks every tender; converting a throw to
    // `unavailable` while holding it stranded the table for the settle TTL over a step that never
    // ran. `supersedeSettlementIntent` calls `getStripe()`, which throws on a missing key.
    acquireResults = ["locked_stale"];
    supersedeThrows = true;
    expect(await takeover("c", "u")).toBe("unavailable");
    expect(released).toEqual(["c"]);
  });

  it("does NOT release a freeze it never claimed", async () => {
    // The other direction: a throw BEFORE the claim must not null a freeze someone else holds.
    acquireResults = ["locked_stale"];
    liveIntentThrows = true;
    expect(await takeover("c", "u")).toBe("unavailable");
    expect(released).toEqual([]);
  });

  it("REFUSES to settle when the cancelled attempt's pin cannot be cleared", async () => {
    // Codex round 3, P2. Returning `acquired` after a failed `releaseByIntent` handed the caller
    // straight to `getCartTotals`, which reads the pin still on the row — settling the table at the
    // cancelled attempt's frozen discount, the exact defect clearing the pin exists to prevent.
    acquireResults = ["locked_stale"];
    pinClearFails = true;
    expect(await takeover("c", "u")).toBe("unavailable");
    expect(released).toEqual(["c"]);
  });
});
