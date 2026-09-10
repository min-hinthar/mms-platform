/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  stashCallbackOutcome,
  readStashedCallbackOutcome,
  markRecoveryAttempted,
  readRecoveryAttempted,
  clearCallbackOutcome,
} from "./oauthCallbackStore";

/**
 * A7b — the OAuth bounce held somewhere the URL cleanup cannot reach, and the one-shot that bounds an
 * automatic redirect.
 *
 * Two of these cases are about what happens when storage does not work at all — private mode, disabled
 * site data, a full quota. Both directions matter and they point opposite ways: forgetting the BOUNCE
 * degrades to the pre-A7b behaviour (bad, survivable), while forgetting the ATTEMPT would remove the
 * only bound on a redirect the diner did not ask for a second time.
 */
afterEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});
beforeEach(() => window.sessionStorage.clear());

/** Make every sessionStorage access throw, the way a locked-down browser does. */
function breakStorage() {
  const boom = () => {
    throw new Error("SecurityError: storage is disabled");
  };
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(boom);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(boom);
  vi.spyOn(Storage.prototype, "removeItem").mockImplementation(boom);
}

describe("the remembered bounce", () => {
  it("round-trips an already-linked bounce", () => {
    stashCallbackOutcome({ kind: "already-linked" });
    expect(readStashedCallbackOutcome()).toEqual({ kind: "already-linked" });
  });

  it("does NOT remember a generic bounce — an apology is not a recovery", () => {
    // ⚠️ Blind pass. It carries nothing to press differently, and an anonymous diner can never clear
    // it (both clear sites need a sign-in or a handover), so reviving it prints "Couldn't finish with
    // Google" on later visits where nothing was attempted, for the rest of the tab session.
    stashCallbackOutcome({ kind: "generic" });
    expect(readStashedCallbackOutcome()).toBeNull();
  });

  it("reads nothing when nothing was stashed", () => {
    expect(readStashedCallbackOutcome()).toBeNull();
  });

  it("refuses to COERCE an unrecognized stored value into a bounce", () => {
    // ⚠️ sessionStorage is writable by anything on the origin and survives across visits. Treating an
    // unknown value as a bounce invents one that never happened — and on the already-linked arm that
    // auto-redirects someone who simply opened /account.
    window.sessionStorage.setItem("mms.oauth_callback", "something-else");
    expect(readStashedCallbackOutcome()).toBeNull();
  });

  it("forgets both the bounce and the attempt on a clear", () => {
    stashCallbackOutcome({ kind: "already-linked" });
    markRecoveryAttempted();
    clearCallbackOutcome();
    expect(readStashedCallbackOutcome()).toBeNull();
    expect(readRecoveryAttempted()).toBe(false);
  });

  it("degrades to no memory when storage throws, rather than propagating", () => {
    breakStorage();
    expect(() => stashCallbackOutcome({ kind: "already-linked" })).not.toThrow();
    expect(readStashedCallbackOutcome()).toBeNull();
    expect(() => clearCallbackOutcome()).not.toThrow();
  });
});

describe("the one-shot attempt flag", () => {
  it("is unset until the recovery is spent", () => {
    expect(readRecoveryAttempted()).toBe(false);
  });

  it("is set once marked, and REPORTS that it persisted", () => {
    expect(markRecoveryAttempted()).toBe(true);
    expect(readRecoveryAttempted()).toBe(true);
  });

  it("reports FALSE when the write throws, so the caller can decline to spend the attempt", () => {
    // ⚠️ `readRecoveryAttempted` cannot cover this: it answers true only when the READ throws. A quota
    // that admits the outcome key and refuses this one leaves the read working and honestly answering
    // "not attempted" — so without a return value the caller redirects, and the next mount finds the
    // bounce remembered with no marker and redirects AGAIN. That is the loop the one-shot prevents.
    breakStorage();
    expect(markRecoveryAttempted()).toBe(false);
  });

  it("reports FALSE when setItem resolves but stores nothing", () => {
    // Some private-mode implementations accept the write and drop it. A write that cannot be read
    // back did not happen — the same rule the merge-token stash follows one module over.
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
    expect(markRecoveryAttempted()).toBe(false);
  });

  it("answers TRUE when storage is unavailable — the fail-safe direction", () => {
    // ⚠️ The direction is the point. "We cannot remember whether we already redirected" must resolve to
    // "assume we did": that costs one manual tap on a button that says exactly what it does. The other
    // answer costs a redirect loop through Google with no way for the diner to stop it. The manual
    // recovery is always rendered behind this, so the safe answer strands nobody.
    breakStorage();
    expect(readRecoveryAttempted()).toBe(true);
  });

  it("does not throw when marking is impossible", () => {
    breakStorage();
    expect(() => markRecoveryAttempted()).not.toThrow();
  });
});
