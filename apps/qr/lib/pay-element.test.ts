import { describe, expect, it } from "vitest";
import {
  PAY_ELEMENT_TIMING,
  canConfirm,
  classifyCardLoadError,
  hasWallet,
  initialPayElementState,
  payElementReducer,
  payElementReserve,
  payElementView,
  payFailureCopy,
  payNoteCopy,
  retryResetsLoader,
  shouldAutoRetry,
  type PayElementEvent,
  type PayElementState,
} from "./pay-element";
import { t } from "./i18n";

/**
 * Phase 1c — the pay step's card form, as values. `payElementView(s).payable` is the card-path
 * CHARGE GATE (the Pay button's aria-disabled and `confirm()` both read it), so every rule here is a
 * money rule: the component suite (`components/PaymentSection.test.tsx`) only pins the wiring.
 */

const run = (
  events: PayElementEvent[],
  s: PayElementState = initialPayElementState({ configMissing: false }),
) => events.reduce(payElementReducer, s);

const A0 = 0;
const cardReady = (attempt = A0): PayElementEvent => ({ type: "card-ready", attempt });
const walletReady = (available: boolean, attempt = A0): PayElementEvent => ({
  type: "wallet-ready",
  attempt,
  available,
});
const settle = (attempt = A0): PayElementEvent => ({ type: "settled", attempt });
const fail = (errorType?: string, attempt = A0): PayElementEvent => ({
  type: "card-error",
  attempt,
  errorType,
});

describe("Phase 1c — the pay element's timings and gates", () => {
  it("the timing values are the product decision", () => {
    // MUTATION: change any constant — red. Pinned ONCE here; the component suite reads them.
    // walletGraceMs is the spec's STARTING value, to be replaced by the measured p90 (OPEN-ITEMS).
    expect(PAY_ELEMENT_TIMING).toEqual({
      walletGraceMs: 1000,
      slowMs: 8000,
      stallMs: 20000,
      settleMs: 300,
    });
  });

  it("card ready alone does not reveal; the wallet settling OR grace-elapsed does", () => {
    // MUTATION (pay-element/reveal-ignores-wallet): revealed = card==='ready' — red.
    const ready = run([cardReady()]);
    expect(payElementView(ready).revealed).toBe(false);
    expect(payElementView(ready).skeleton).toBe(true);
    expect(payElementView(run([walletReady(false)], ready)).revealed).toBe(true);
    expect(payElementView(run([walletReady(true)], ready)).revealed).toBe(true);
    expect(payElementView(run([{ type: "grace-elapsed", attempt: A0 }], ready)).revealed).toBe(
      true,
    );
    // …and the wallet alone never reveals a card that is not there.
    expect(payElementView(run([walletReady(true)])).revealed).toBe(false);
  });

  it("payable waits for settled; canConfirm(wallet) does not", () => {
    // MUTATION (pay-element/payable-skips-settle): payable = revealed — red.
    const revealed = run([cardReady(), walletReady(true)]);
    const v = payElementView(revealed);
    expect(v.revealed).toBe(true);
    expect(v.payable).toBe(false);
    expect(canConfirm(v, "card")).toBe(false);
    expect(canConfirm(v, "wallet")).toBe(true); // the sheet is its own confirmation
    const live = payElementView(run([settle()], revealed));
    expect(live.payable).toBe(true);
    expect(canConfirm(live, "card")).toBe(true);
    // Nothing is confirmable before the reveal, from either path.
    const early = payElementView(run([cardReady()]));
    expect(canConfirm(early, "card")).toBe(false);
    expect(canConfirm(early, "wallet")).toBe(false);
    // A `settled` cannot precede a reveal (it means "held still SINCE the reveal").
    expect(run([settle(), cardReady(), walletReady(false)]).settled).toBe(false);
  });

  it("a wallet change after reveal re-arms settle (payable false until settled)", () => {
    // MUTATION: wallet-ready leaves `settled` alone — red.
    const live = run([cardReady(), { type: "grace-elapsed", attempt: A0 }, settle()]);
    expect(payElementView(live).payable).toBe(true);
    const moved = run([walletReady(true)], live);
    expect(moved.settled).toBe(false);
    expect(payElementView(moved).payable).toBe(false);
    expect(payElementView(moved).showWallet).toBe(true);
    expect(moved.walletLate).toBe(true);
    expect(payElementView(run([settle()], moved)).payable).toBe(true);
    // wallet-error after a reveal re-arms the same way (a reserved slot collapsing moves the layout).
    expect(run([{ type: "wallet-error", attempt: A0 }], live).settled).toBe(false);
  });

  it("slow/stalled/card-ready from attempt 0 are ignored at attempt 1", () => {
    // MUTATION (pay-element/stale-attempt-accepted): delete the attempt check — red.
    const retried = run([fail("api_connection_error"), { type: "retry", by: "diner" }]);
    expect(retried.attempt).toBe(1);
    const stale = run(
      [
        { type: "slow", attempt: 0 },
        { type: "stalled", attempt: 0 },
        cardReady(0),
        walletReady(true, 0),
        { type: "grace-elapsed", attempt: 0 },
        settle(0),
      ],
      retried,
    );
    expect(stale).toEqual(retried);
    expect(payElementView(stale).payable).toBe(false);
    // …while the CURRENT attempt's events land.
    expect(payElementView(run([cardReady(1), walletReady(false, 1)], retried)).revealed).toBe(true);
  });

  it("stalled → timeout with action review; a late card-ready recovers to revealed", () => {
    // MUTATION (pay-element/stall-ignores-late-ready): card-ready ignored once failed — red.
    // MUTATION: the timeout action is retry — red.
    const stalled = run([{ type: "stalled", attempt: A0 }]);
    expect(payElementView(stalled).failure).toBe("timeout");
    expect(payElementView(stalled).skeleton).toBe(false);
    const copy = payFailureCopy("timeout", {
      truth: "unknown",
      escalated: false,
      counterDoor: false,
    });
    expect(copy.action).toBe("review");
    const late = run([cardReady(), walletReady(false)], stalled);
    expect(payElementView(late).failure).toBeNull();
    expect(payElementView(late).revealed).toBe(true);
    // The stall only fires while the card is loading: a ready card is never timed out.
    expect(payElementView(run([cardReady(), { type: "stalled", attempt: A0 }])).failure).toBeNull();
  });

  it("stalled DURING a diner retry clears retrying, bumps failedRetries and sets waitAnnounced", () => {
    // MUTATION: omit the bookkeeping from stalled — red.
    const retrying = run([fail(), { type: "retry", by: "diner" }]);
    expect(retrying.retrying).toBe(true);
    expect(retrying.failedRetries).toBe(0);
    const s = run([{ type: "stalled", attempt: 1 }], { ...retrying, waitAnnounced: false });
    expect(s.retrying).toBe(false);
    expect(s.failedRetries).toBe(1);
    expect(s.waitAnnounced).toBe(true);
    expect(payElementView(s).failure).toBe("timeout");
    // A stall that is NOT a retry's does not count as a failed retry.
    expect(run([{ type: "stalled", attempt: A0 }]).failedRetries).toBe(0);
  });

  it("slow sets waitAnnounced; ready is announced after slow/offline/failure but NOT on the fast path", () => {
    // MUTATION: announce 'ready' whenever revealed — red on the fast path.
    // MUTATION: slow no longer sets waitAnnounced — red.
    const fast = run([cardReady(), walletReady(false)]);
    expect(payElementView(fast).announce).toBeNull();

    const slow = run([{ type: "slow", attempt: A0 }]);
    expect(slow.waitAnnounced).toBe(true);
    expect(payElementView(slow).note).toBe("slow");
    expect(payElementView(run([cardReady(), walletReady(false)], slow)).announce).toBe("ready");

    const offline = run([{ type: "connectivity", online: false }]);
    expect(payElementView(offline).note).toBe("offline");
    expect(payElementView(run([cardReady(), walletReady(false)], offline)).announce).toBe("ready");

    const recovered = run([{ type: "stalled", attempt: A0 }, cardReady(), walletReady(false)]);
    expect(payElementView(recovered).announce).toBe("ready");
    // Going offline AFTER the reveal is not a wait this step is running — nothing to announce.
    expect(
      payElementView(run([{ type: "connectivity", online: false }], fast)).announce,
    ).toBeNull();
  });

  it("classify: invalid_request_error→intent, authentication_error→config, api_connection_error/rate_limit_error/undefined→network", () => {
    // MUTATION (pay-element/intent-classified-as-network): swap intent/network — red.
    // MUTATION (pay-element/config-retries): authentication_error→network — red.
    expect(classifyCardLoadError("invalid_request_error")).toBe("intent");
    expect(classifyCardLoadError("authentication_error")).toBe("config");
    expect(classifyCardLoadError("api_connection_error")).toBe("network");
    expect(classifyCardLoadError("api_error")).toBe("network");
    expect(classifyCardLoadError("rate_limit_error")).toBe("network");
    expect(classifyCardLoadError(undefined)).toBe("network");
    // …and the reducer routes through it.
    expect(payElementView(run([fail("invalid_request_error")])).failure).toBe("intent");
    expect(payElementView(run([fail("authentication_error")])).failure).toBe("config");
    // Stripe.js itself rejecting is network-shaped, and it resets the loader on retry.
    const js = run([{ type: "stripe-failed", attempt: A0 }]);
    expect(payElementView(js).failure).toBe("network");
    expect(js.wallet).toBe("none");
    expect(retryResetsLoader(js)).toBe(true);
    expect(retryResetsLoader(run([fail()]))).toBe(false);
    // A missing publishable key is config from the first frame.
    const noKey = initialPayElementState({ configMissing: true });
    expect(payElementView(noKey).failure).toBe("config");
    expect(payElementView(noKey).skeleton).toBe(false);
  });

  it("a diner retry keeps the failure (failure non-null, skeleton false, announce null); an auto retry clears it (skeleton true)", () => {
    // MUTATION: clear cardFailure on every retry — red.
    // MUTATION: keep it on an auto retry — red.
    const failed = run([fail()]);
    expect(payElementView(failed).announce).toBe("network");
    const diner = run([{ type: "retry", by: "diner" }], failed);
    const dv = payElementView(diner);
    expect(dv.failure).toBe("network");
    expect(dv.skeleton).toBe(false);
    expect(dv.announce).toBeNull(); // cleared, so an identical repeat failure re-announces
    expect(payElementView(run([fail(undefined, 1)], diner)).announce).toBe("network");
    const auto = run([{ type: "retry", by: "auto" }], failed);
    const av = payElementView(auto);
    expect(av.failure).toBeNull();
    expect(av.skeleton).toBe(true);
    expect(auto.retrying).toBe(false);
    // The state itself forgets the failure (the rule), not just the view that hides it.
    expect(auto.cardFailure).toBeNull();
    expect(diner.cardFailure).toBe("network");
  });

  it("network escalates to action review after exactly two failed retries; payFailureCopy names the counter only when counterDoor", () => {
    // MUTATION: `>= 1` — red.
    // MUTATION (pay-element/escalation-keeps-retrying): escalated keeps 'retry' — red.
    const once = run([fail(), { type: "retry", by: "diner" }, fail(undefined, 1)]);
    expect(once.failedRetries).toBe(1);
    expect(payElementView(once).escalated).toBe(false);
    const twice = run([{ type: "retry", by: "diner" }, fail(undefined, 2)], once);
    expect(twice.failedRetries).toBe(2);
    expect(payElementView(twice).escalated).toBe(true);

    const base = { truth: "unknown" as const, counterDoor: false };
    expect(payFailureCopy("network", { ...base, escalated: false }).action).toBe("retry");
    const esc = payFailureCopy("network", { ...base, escalated: true });
    expect(esc.action).toBe("review");
    expect(esc.body.en).toBe(t("en", "payFailEscalated"));
    expect(esc.body.en).not.toContain("counter");

    const counter = (kind: "network" | "timeout" | "config") =>
      payFailureCopy(kind, { truth: "unknown", escalated: true, counterDoor: true }).body;
    expect(counter("network").en).toBe(t("en", "payFailEscalatedCounter"));
    expect(counter("timeout").en).toBe(t("en", "payFailTimeoutBodyCounter"));
    expect(counter("config").en).toBe(t("en", "payFailConfigBodyCounter"));
    for (const kind of ["network", "timeout", "config"] as const) {
      expect(counter(kind).en).toContain("counter");
      expect(counter(kind).my).toContain("ကောင်တာ");
      const plain = payFailureCopy(kind, { truth: "unknown", escalated: true, counterDoor: false });
      expect(plain.body.en).not.toContain("counter");
      expect(plain.action).toBe("review");
    }
    // config and intent never offer a retry, whatever else is true.
    expect(payFailureCopy("config", { ...base, escalated: false }).action).toBe("review");
    expect(payFailureCopy("intent", { ...base, escalated: false }).action).toBe("review");
  });

  it("shouldAutoRetry: true after offlineSeen with no reveal; false once revealed, or for intent/config", () => {
    // MUTATION: drop the revealed term — red.
    const offline = run([{ type: "connectivity", online: false }]);
    expect(shouldAutoRetry(offline)).toBe(true);
    expect(shouldAutoRetry(run([{ type: "stripe-failed", attempt: A0 }], offline))).toBe(true);
    expect(shouldAutoRetry(run([]))).toBe(false); // never saw offline
    // Revealed (the form came up while offline was flagged) — a remount would destroy a live form.
    const upAnyway = { ...run([cardReady(), walletReady(false)]), offlineSeen: true };
    expect(payElementView(upAnyway).revealed).toBe(true);
    expect(shouldAutoRetry(upAnyway)).toBe(false);
    expect(shouldAutoRetry(run([fail("invalid_request_error")], offline))).toBe(false);
    expect(shouldAutoRetry(run([fail("authentication_error")], offline))).toBe(false);
    // An auto retry resets offlineSeen, so it cannot fire twice for one outage.
    expect(shouldAutoRetry(run([{ type: "retry", by: "auto" }], offline))).toBe(false);
  });

  it("we-down gets the neutral body; you-offline the offline body; the intent body never says start again or charged", () => {
    // MUTATION: we-down → the offline body — red.
    const body = (truth: "you-offline" | "we-down" | "unknown") =>
      payFailureCopy("network", { truth, escalated: false, counterDoor: false }).body.en;
    expect(body("we-down")).toBe(t("en", "payFailBody"));
    expect(body("unknown")).toBe(t("en", "payFailBody"));
    expect(body("you-offline")).toBe(t("en", "payFailOfflineBody"));
    // /api/health measures OUR database, not Stripe — nothing may blame either side without proof.
    expect(body("we-down")).not.toMatch(/offline|our end|not your connection/i);
    for (const counterDoor of [true, false]) {
      const intent = payFailureCopy("intent", { truth: "we-down", escalated: true, counterDoor });
      expect(intent.body.en).toBe(t("en", "payFailIntentBody"));
      expect(`${intent.title.en} ${intent.body.en}`).not.toMatch(/start again|charged/i);
    }
  });

  it("payElementReserve rejects garbage, a width off by 60, h=900 and walletH>=h, and accepts {w:390,h:312,walletH:62} at 400", () => {
    // MUTATION: drop the width tolerance — red.
    const fb = { px: 280, walletPx: 0 };
    for (const bad of [
      null,
      undefined,
      "312",
      42,
      [],
      {},
      { w: "390", h: 312, walletH: 0 },
      { w: 390, h: Number.NaN, walletH: 0 },
      { w: 390, h: Infinity, walletH: 0 },
      { w: 340, h: 312, walletH: 0 }, // width off by 60
      { w: 390, h: 900, walletH: 0 },
      { w: 390, h: 120, walletH: 0 },
      { w: 390, h: 312, walletH: 312 },
      { w: 390, h: 312, walletH: -1 },
    ])
      expect(payElementReserve(bad, 400, 280)).toEqual(fb);
    expect(payElementReserve({ w: 390, h: 312, walletH: 62 }, 400, 280)).toEqual({
      px: 312,
      walletPx: 62,
    });
    expect(payElementReserve({ w: 360, h: 312, walletH: 0 }, 400, 280)).toEqual({
      px: 312,
      walletPx: 0,
    });
  });

  it("hasWallet is true only when some wallet is available (moved verbatim)", () => {
    expect(hasWallet(undefined)).toBe(false);
    expect(hasWallet({ applePay: false, googlePay: false, link: false })).toBe(false);
    expect(hasWallet({ applePay: false, googlePay: true })).toBe(true);
  });

  it("the note walks loading → slow / offline → secure, and says nothing on a failure", () => {
    expect(payElementView(run([])).note).toBe("loading");
    expect(payNoteCopy("loading").en).toBe("Loading the secure card form…");
    expect(payNoteCopy("secure").en).toBe("Your card goes straight to Stripe — never to us.");
    expect(payElementView(run([cardReady(), walletReady(false)])).note).toBe("secure");
    expect(payElementView(run([fail()])).note).toBeNull();
    for (const n of ["loading", "slow", "offline", "secure"] as const)
      expect(payNoteCopy(n).my).toMatch(/\p{Script=Myanmar}/u);
  });
});
