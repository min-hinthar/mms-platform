/**
 * A7b — the ONE reading of an OAuth callback bounce, and the ONE decision about what to do next.
 *
 * ⚠️ WHY THIS IS A MODULE AND NOT THREE TERNARIES IN THE CARD. The recovery for a bounced Google
 * sign-in lived entirely in `AccountUpgrade`'s render as `searchParams.get("error_code") === …`,
 * read live on every render, and three separate ternaries keyed off it: the message, the button
 * label, and — the one that matters — which Supabase call the button fires. Nothing tested any of
 * them, and the whole recovery was erased one frame after it appeared (see the capture-once note in
 * AccountUpgrade). Pulling the decision out makes it a value a test can falsify without a render
 * plus five mocks, which is the repo's `lib/`-first rule applied to a branch that decides whether a
 * diner reaches their own account.
 *
 * THE SITUATION IT DESCRIBES. A diner on an anonymous session taps "Continue with Google". The card
 * calls `linkIdentity()`, which staples a provider onto the CALLER's user — so it can only succeed
 * for someone whose Google account has never signed in here. For a RETURNING customer, the exact
 * population most likely to tap it, Supabase answers 422 `identity_already_exists` and bounces back
 * to /account with the code in the query string. That refusal is correct; the identity genuinely
 * belongs to another user. What must follow is a plain `signInWithOAuth` onto that existing account,
 * carrying this device's Stars over on a merge token.
 *
 * ⚠️ THE QUERY STRING IS THE ONLY READABLE COPY. Supabase mirrors the error into the fragment too,
 * but `useSearchParams()` is built from the router's canonical URL and can never see a fragment, and
 * a fragment never reaches the server render at all. The query copy exists because `@supabase/ssr`
 * hardcodes `flowType: "pkce"`; `readCallbackOutcome` therefore takes the two values as arguments
 * rather than reaching for a hook, so the caller owns where they came from.
 */

/** A bounce we know how to act on, or one we can only apologize for. */
export type CallbackOutcome = { kind: "already-linked" } | { kind: "generic" };

/** Which Supabase call the Google button should fire on the NEXT press. */
export type GoogleAction = "link" | "sign-in";

/**
 * Read a callback bounce off the two params Supabase can set. `null` means "no bounce" — the
 * ordinary first visit to /account, which is most of them.
 *
 * ⚠️ BOTH PARAMS, NOT JUST `error_code`. The original derivation keyed on `error_code` alone, so a
 * bounce carrying only `?error=server_error` — which Supabase does send — rendered nothing at all:
 * no message, no recovery, and the raw error left sitting in the address bar. A bounce we cannot
 * name is still a bounce, and saying "we couldn't finish" beats saying nothing.
 */
export function readCallbackOutcome(
  errorCode: string | null,
  error: string | null,
): CallbackOutcome | null {
  if (errorCode === "identity_already_exists") return { kind: "already-linked" };
  if (errorCode || error) return { kind: "generic" };
  return null;
}

/**
 * What the card says about the bounce.
 *
 * The already-linked copy NAMES THE BUTTON, matching its email sibling ("tap 'Send sign-in code'").
 * Without the label the sentence says "sign in" while the control it means sits below an
 * `aria-hidden` "or" divider, and the only signal that anything changed is two words on a button the
 * diner has already looked at once and seen fail.
 */
export function callbackMessage(outcome: CallbackOutcome | null): string | null {
  if (!outcome) return null;
  if (outcome.kind === "already-linked")
    return "That Google account already has a Morning Star account — tap “Sign in with Google” below and we’ll move this device’s Stars onto it.";
  return "Couldn’t finish with Google — please try again.";
}

/**
 * Which call the Google button fires.
 *
 * ⚠️ `link` AFTER AN already-linked BOUNCE IS THE FAILURE, REPEATED. `linkIdentity` is still the
 * right FIRST attempt — it keeps the uid, so past orders and Stars carry across with no merge at all
 * — but once Supabase has said that identity belongs to someone else, calling it again produces the
 * identical 422 and another full round trip through Google. A `generic` bounce is different: we do
 * not know what failed, so the ordinary first attempt is still the right one to offer.
 */
export function googleAction(outcome: CallbackOutcome | null): GoogleAction {
  return outcome?.kind === "already-linked" ? "sign-in" : "link";
}

/** The Google button's visible label, which must agree with what the press will actually do. */
export function googleButtonLabel(outcome: CallbackOutcome | null): string {
  return googleAction(outcome) === "sign-in" ? "Sign in with Google" : "Continue with Google";
}

/**
 * Should the card complete the recovery WITHOUT waiting for a second press?
 *
 * The diner already asked to sign in with Google; the app knows the exact call that answers that
 * request, and knows the one it just made cannot. Making them press again is asking a human to
 * perform a translation the program can do — and the first press has already cost a round trip.
 *
 * ⚠️ ONE ATTEMPT, EVER, per browsing session. `attempted` comes from sessionStorage and is set
 * BEFORE the redirect, so a bounce that somehow returned to this same state could not re-fire. A
 * `generic` bounce never auto-recovers: we do not know what failed, and redirecting into an unknown
 * failure is how a loop is built.
 *
 * ⚠️ A LEND-MODE RESUME OUTRANKS THE RECOVERY, and getting this backwards moves somebody else's
 * Stars. `?resume=` is the OWNER coming back to their own account after lending the device, and
 * that path is deliberately merge-SUPPRESSED (`bringStars: false`) so the friend's rewards are
 * never swept onto the owner. The recovery is the opposite: it mints a token and carries whatever
 * this device holds. With both present and no rule between them, the auto-recovery fires from an
 * effect registered FIRST and wins the race — handing the owner the friend's Stars, which is
 * exactly what the resume path exists to prevent. Serializing them is not enough; the recovery has
 * to lose. The diner keeps the manual button, which is the right shape anyway: after a handover,
 * whose account to sign into is a person's decision, not the program's.
 */
export function shouldAutoRecover(
  outcome: CallbackOutcome | null,
  attempted: boolean,
  lendResumePresent: boolean,
): boolean {
  if (lendResumePresent) return false;
  return outcome?.kind === "already-linked" && !attempted;
}
