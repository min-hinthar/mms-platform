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
/** A configurable Stripe, so `supersedeSettlementIntent`'s own rules are reachable by VALUE. */
let intentFixture: Record<string, unknown> = {};
let retrieveThrows: { code?: string } | null = null;
let cancelCalls: string[] = [];
vi.mock("./stripe", () => ({
  getStripe: () => ({
    paymentIntents: {
      retrieve: () => {
        if (retrieveThrows) return Promise.reject(retrieveThrows);
        return Promise.resolve(intentFixture);
      },
      cancel: (id: string) => {
        cancelCalls.push(id);
        return Promise.resolve({ id, status: "canceled" });
      },
    },
  }),
}));

let acquireResults: SettleResult[] = [];
let acquireThrowsFromCall: number | null = null;
let acquireCalls = 0;
let supersedeResult: SupersedeOutcome = "cleared";
let supersedeCalls = 0;

let liveIntent: string | null = "pi_abandoned";
let liveIntentThrows = false;
let claimed = true;
let pinClearFails = false;
let supersedeThrows = false;
let claimCalls: { intentId: string }[] = [];
let probeReleases: { cartId: string; attemptId: string }[] = [];
let acquireOwners: string[] = [];
let released: string[] = [];
let pinCleared: { cartId: string; intentId: string }[] = [];

vi.mock("./lock", () => ({
  acquireSettlement: (_cartId: string, owner: string) => {
    // Indexed, so a test can make ONLY the stand-down probe throw and leave the first
    // (diagnosing) acquire intact — the two are the same function on different calls.
    if (acquireThrowsFromCall !== null && acquireCalls >= acquireThrowsFromCall) {
      acquireCalls += 1;
      acquireOwners.push(owner);
      return Promise.reject(new Error("postgrest down"));
    }
    const r = acquireResults[acquireCalls] ?? acquireResults[acquireResults.length - 1];
    acquireCalls += 1;
    acquireOwners.push(owner);
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
  releaseSettlementFor: (cartId: string, attemptId: string) => {
    probeReleases.push({ cartId, attemptId });
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

const { acquireSettlementSuperseding, supersedeSettlementIntent } = await import("./supersede");
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
  acquireThrowsFromCall = null;
  supersedeCalls = 0;
  supersedeResult = "cleared";
  acquireResults = ["acquired"];
  liveIntent = "pi_abandoned";
  liveIntentThrows = false;
  claimed = true;
  claimCalls = [];
  probeReleases = [];
  acquireOwners = [];
  supersedeArgs = [];
  pinClearFails = false;
  supersedeThrows = false;
  intentFixture = {
    id: "pi_x",
    status: "requires_payment_method",
    capture_method: "automatic",
    metadata: {},
  };
  retrieveThrows = null;
  cancelCalls = [];
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

  it("a LOST claim can never be promoted back to `acquired` — the round-3 fix moved this hole", async () => {
    // ⚠️ CODEX ROUND 4, P1. Dropping `settle_by.eq.<uid>` from the CLAIM stopped two same-staff
    // takeovers both winning it — and the loser then re-asked through `acquireSettlement`, whose
    // predicate still carries that arm. The winner has by then CLEARED THE LINK, which is exactly
    // what opens the lock arm for the loser: `locked_at <= cutoff AND live_payment_intent_id IS
    // NULL` is now true, and `settle_by = uid` is true because the winner wrote it. Both answer
    // `acquired`, both mint an off-session PaymentIntent, and that idempotency key is deliberately
    // per-attempt — so the guest is charged twice, off one staff member double-tapping.
    acquireResults = ["locked_stale", "acquired"];
    claimed = false;
    expect(await takeover("c", "u")).toBe("unavailable");
    expect(supersedeCalls).toBe(0);
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

  it("re-asks when the row no longer names an intent — and STILL will not be promoted", async () => {
    // ⚠️ CODEX ROUND 5, P1, AND I ARGUED THE OPPOSITE ONE ROUND EARLIER. I claimed this branch was
    // safe because "no claim was attempted, so the loser-rides-the-winner sequence cannot arise".
    // It can, because THE WINNER IS WHAT MAKES THIS BRANCH REACHABLE: request A claims, cancels and
    // clears the link; request B — same staff uid, moments behind — reads `readLiveIntent` and sees
    // null precisely BECAUSE A cleared it, so B never attempts a claim and falls through here. The
    // old `collapse` then passed on the `acquired` that `acquireSettlement` grants via
    // `settle_by.eq.<uid>`, and both minted an off-session PaymentIntent under a per-attempt key.
    acquireResults = ["locked_stale", "acquired"];
    liveIntent = null;
    expect(await takeover("c", "u")).toBe("unavailable");
    expect(claimCalls).toHaveLength(0);
    expect(supersedeCalls).toBe(0);
  });

  it("still reports the REASON on both re-asks — standing down is not going silent", async () => {
    // The over-blocking direction. Refusing the grant must not flatten every diagnosis to
    // `unavailable`: staff still need to learn that the table closed, or that a colleague holds the
    // freeze, or they are told "try again" forever against a cart that will never come back.
    for (const answer of ["closed", "settling_other", "locked"] as const) {
      acquireCalls = 0;
      liveIntent = null;
      acquireResults = ["locked_stale", answer];
      expect(await takeover("c", "u")).toBe(answer);
    }
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

describe("supersedeSettlementIntent — what settlement may and may not cancel", () => {
  it("REFUSES a manual-capture intent in a cancelable state, and does not call cancel", async () => {
    // ⚠️ THE MUTANT THAT SURVIVED (Codex round 3, P1). The tests above stub the superseder wholesale,
    // so this rule was reachable by nothing — exactly the degenerate-fixture case CLAUDE.md names:
    // the code could not express the failure, so the guard was decorative.
    //
    // A status is a SNAPSHOT. The DB claim stops a new `acquireCartLock`; it cannot stop the Payment
    // Element the diner already has mounted from confirming with its existing client secret. So an
    // authorization read as `requires_action` can become `requires_capture` before our cancel lands,
    // and Stripe still permits cancelling that — staff would revoke money the guest just committed.
    // Refusing on `capture_method` is a fact about the intent rather than a race-able reading of it.
    intentFixture = {
      id: "pi_hold",
      status: "requires_action",
      capture_method: "manual",
      metadata: {},
    };
    expect(await supersedeSettlementIntent("c", "pi_hold")).toBe("captured");
    expect(cancelCalls).toEqual([]);
  });

  it("refuses on the pickup_manual metadata too — the belt for a hold minted without the flag", async () => {
    intentFixture = {
      id: "pi_hold",
      status: "requires_payment_method",
      capture_method: "automatic",
      metadata: { kind: "pickup_manual" },
    };
    expect(await supersedeSettlementIntent("c", "pi_hold")).toBe("captured");
    expect(cancelCalls).toEqual([]);
  });

  it("still cancels an ordinary auto-capture attempt — the deadlock's exit must stay open", async () => {
    // The over-blocking direction. Refusing everything would leave M197 exactly as it was, with a
    // wider refusal surface to disguise it.
    intentFixture = {
      id: "pi_abandoned",
      status: "requires_payment_method",
      capture_method: "automatic",
      metadata: {},
    };
    expect(await supersedeSettlementIntent("c", "pi_abandoned")).toBe("cleared");
    expect(cancelCalls).toEqual(["pi_abandoned"]);
  });

  it("treats an already-cancelled intent as cleared without cancelling again", async () => {
    intentFixture = { id: "pi_dead", status: "canceled", capture_method: "manual", metadata: {} };
    expect(await supersedeSettlementIntent("c", "pi_dead")).toBe("cleared");
    expect(cancelCalls).toEqual([]);
  });

  it("a vanished intent is cleared; any other retrieve failure is unknown", async () => {
    retrieveThrows = { code: "resource_missing" };
    expect(await supersedeSettlementIntent("c", "pi_gone")).toBe("cleared");
    retrieveThrows = { code: "rate_limit" };
    expect(await supersedeSettlementIntent("c", "pi_x")).toBe("unknown");
  });
});

describe("standDown — a diagnosis must not leave a freeze behind (Codex round 6)", () => {
  it("gives back a freeze the probe accidentally acquired", async () => {
    // ⚠️ `acquireSettlement` is a mutating UPDATE: answering `acquired` means it has ALREADY written
    // `settle_at`/`settle_by`. Suppressing only the returned verdict left that write in place, so the
    // action reported a retryable failure while the table stayed frozen for the settle TTL — worst
    // for the Terminal settle, whose every retry carries a fresh attempt id and so meets its own
    // orphan as `settling_other`.
    acquireResults = ["locked_stale", "acquired"];
    liveIntent = null; // the !live stand-down path
    expect(await takeover("c", "u")).toBe("unavailable");
    expect(probeReleases).toHaveLength(1);
    expect(probeReleases[0]!.cartId).toBe("c");
  });

  it("probes under a UNIQUE owner, never the caller's uid", async () => {
    // Two things ride on this. The release is scoped by `settle_by`, so a probe uuid is what makes
    // it provably OURS — `releaseSettlement(cartId)` is unconditional by cart and would null the
    // WINNER's freeze, the very request we stood down for. And a unique owner cannot match
    // `acquireSettlement`'s `settle_by.eq.<uid>` arm, so a stand-down can only ever acquire a cart
    // that is genuinely free: the promotion this function exists to prevent becomes structurally
    // impossible rather than suppressed after the fact.
    acquireResults = ["locked_stale", "acquired"];
    liveIntent = null;
    await takeover("c", "u");
    expect(acquireOwners).toHaveLength(2);
    expect(acquireOwners[0]).toBe("u"); // the first, real acquire
    expect(acquireOwners[1]).toBe(probeReleases[0]!.attemptId); // …and we release what we probed

    // ⚠️ UNIQUENESS IS THE PROPERTY, NOT "DIFFERENT FROM THE UID" — and the first draft of this
    // assertion tested the latter, so `verify:slice` reported the mutant SURVIVING: substituting
    // `cartId` for the probe is still `!== uid` while being IDENTICAL across two concurrent requests
    // on the same cart, which is exactly the collision the uuid exists to prevent. A second run must
    // produce a different owner, and nothing constant can satisfy that.
    const first = acquireOwners[1];
    acquireCalls = 0;
    probeReleases = [];
    acquireOwners = [];
    acquireResults = ["locked_stale", "acquired"];
    await takeover("c", "u");
    expect(acquireOwners[1]).not.toBe(first);
    // It is also not merely a copy of either input.
    expect(acquireOwners[1]).not.toBe("u");
    expect(acquireOwners[1]).not.toBe("c");
  });

  it("releases nothing when the probe did not acquire", async () => {
    // The winner holds the freeze; touching it would be the catastrophe this design avoids.
    acquireResults = ["locked_stale", "settling_other"];
    liveIntent = null;
    expect(await takeover("c", "u")).toBe("settling_other");
    expect(probeReleases).toEqual([]);
  });
  /**
   * Codex round 8 on #275, P2 — the `await` on both stand-down re-asks.
   *
   * `return standDown(cartId)` hands the promise back and EXITS THE TRY before it settles, so the
   * catch never converts a rejection into `unavailable`. These two assert the RESOLUTION, which is
   * the only thing that separates the two spellings: with the await the union's retryable member
   * comes back, without it the Server Action rejects and the staff control latches on `busy`.
   */
  it("the !live stand-down answers unavailable when its probe THROWS, rather than rejecting", async () => {
    acquireResults = ["locked_stale"];
    liveIntent = null;
    acquireThrowsFromCall = 1; // the probe inside standDown, not the diagnosing acquire
    await expect(takeover("c", "u")).resolves.toBe("unavailable");
  });

  it("the lost-claim stand-down answers unavailable when its probe THROWS, rather than rejecting", async () => {
    acquireResults = ["locked_stale"];
    liveIntent = "pi_abandoned";
    claimed = false;
    acquireThrowsFromCall = 1;
    await expect(takeover("c", "u")).resolves.toBe("unavailable");
  });

  it("a throwing probe releases nothing — no claim was held, so there is no freeze of ours to give back", async () => {
    acquireResults = ["locked_stale"];
    liveIntent = null;
    acquireThrowsFromCall = 1;
    await expect(takeover("c", "u")).resolves.toBe("unavailable");
    expect(released).toEqual([]);
    expect(probeReleases).toEqual([]);
  });
});
