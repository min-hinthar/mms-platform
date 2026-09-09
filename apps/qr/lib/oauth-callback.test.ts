import { describe, expect, it } from "vitest";
import {
  readCallbackOutcome,
  callbackMessage,
  googleAction,
  googleButtonLabel,
  shouldAutoRecover,
} from "./oauth-callback";

/**
 * A7b — the Google bounce, read as a value.
 *
 * The owner's production URL is the fixture this whole suite is built around:
 *
 *   /account?error=server_error&error_code=identity_already_exists
 *           &error_description=Identity+is+already+linked+to+another+user#…same again…
 *
 * Google completed; Supabase refused at the LINK step because that identity already belongs to a real
 * account. What must follow is a plain sign-in onto that account. Every branch below decides whether
 * the diner gets there, so each is asserted on the values that actually arrive rather than on a
 * paraphrase of them.
 */
describe("readCallbackOutcome", () => {
  it("reads the owner's production bounce as already-linked", () => {
    // Both params present, exactly as Supabase sent them.
    expect(readCallbackOutcome("identity_already_exists", "server_error")).toEqual({
      kind: "already-linked",
    });
  });

  it("is already-linked on the code alone, without a generic `error` beside it", () => {
    expect(readCallbackOutcome("identity_already_exists", null)).toEqual({
      kind: "already-linked",
    });
  });

  it("names a bounce that carries ONLY `error` — the case that used to render nothing at all", () => {
    // The original derivation keyed on error_code alone, so this landed as a raw error URL with no
    // message, no recovery, and nothing on screen to explain it.
    expect(readCallbackOutcome(null, "server_error")).toEqual({ kind: "generic" });
  });

  it("names an error_code it does not recognize rather than staying silent", () => {
    expect(readCallbackOutcome("provider_disabled", null)).toEqual({ kind: "generic" });
  });

  it("is null on an ordinary visit — no params at all", () => {
    expect(readCallbackOutcome(null, null)).toBeNull();
  });

  it("does not treat an empty-string param as a bounce", () => {
    // The URL's trailing `sb=` shows Supabase can leave empty values around; an empty error is not one.
    expect(readCallbackOutcome("", "")).toBeNull();
  });

  it("does not match a code that merely CONTAINS the identity string", () => {
    expect(readCallbackOutcome("no_identity_already_exists_here", null)).toEqual({
      kind: "generic",
    });
  });
});

describe("googleAction", () => {
  it("sends an already-linked bounce to sign-in, never back to link", () => {
    // `link` here is the 422 repeated: another full round trip through Google to the same refusal.
    expect(googleAction({ kind: "already-linked" })).toBe("sign-in");
  });

  it("keeps link as the first attempt when there has been no bounce", () => {
    // linkIdentity keeps the uid, so orders and Stars carry across with no merge at all. It is the
    // better call when it can work — it just cannot work for a returning customer.
    expect(googleAction(null)).toBe("link");
  });

  it("keeps link on a bounce we cannot name", () => {
    expect(googleAction({ kind: "generic" })).toBe("link");
  });
});

describe("googleButtonLabel", () => {
  it("agrees with the action on every outcome", () => {
    // The label is the diner's only evidence of what the press will do; a disagreement here is a lie
    // on the button face.
    for (const outcome of [
      null,
      { kind: "already-linked" } as const,
      { kind: "generic" } as const,
    ]) {
      const expected =
        googleAction(outcome) === "sign-in" ? "Sign in with Google" : "Continue with Google";
      expect(googleButtonLabel(outcome)).toBe(expected);
    }
  });

  it("says Sign in on an already-linked bounce", () => {
    expect(googleButtonLabel({ kind: "already-linked" })).toBe("Sign in with Google");
  });

  it("says Continue with no bounce", () => {
    expect(googleButtonLabel(null)).toBe("Continue with Google");
  });
});

describe("callbackMessage", () => {
  it("NAMES the button on the already-linked path, matching its email sibling", () => {
    // Without the label the sentence says "sign in" while the control it means sits below an
    // aria-hidden "or" divider, distinguished only by two changed words.
    const msg = callbackMessage({ kind: "already-linked" });
    expect(msg).toContain(googleButtonLabel({ kind: "already-linked" }));
  });

  it("promises the carry-over on the already-linked path", () => {
    expect(callbackMessage({ kind: "already-linked" })).toContain("Stars");
  });

  it("apologizes without inventing a cause on a generic bounce", () => {
    const msg = callbackMessage({ kind: "generic" });
    expect(msg).toBe("Couldn’t finish with Google — please try again.");
    // It must NOT claim the already-linked cause it has no evidence for.
    expect(msg).not.toContain("already has");
  });

  it("says nothing when there was no bounce", () => {
    expect(callbackMessage(null)).toBeNull();
  });
});

describe("shouldAutoRecover", () => {
  it("completes an already-linked bounce without a second press", () => {
    expect(shouldAutoRecover({ kind: "already-linked" }, false)).toBe(true);
  });

  it("refuses a SECOND automatic attempt — the loop guard", () => {
    expect(shouldAutoRecover({ kind: "already-linked" }, true)).toBe(false);
  });

  it("never auto-recovers a bounce we cannot name", () => {
    // Redirecting into an unknown failure is how a loop gets built.
    expect(shouldAutoRecover({ kind: "generic" }, false)).toBe(false);
  });

  it("never auto-recovers an ordinary visit", () => {
    expect(shouldAutoRecover(null, false)).toBe(false);
  });
});
