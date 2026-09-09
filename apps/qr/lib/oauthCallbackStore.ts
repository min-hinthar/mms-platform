import type { CallbackOutcome } from "./oauth-callback";

/**
 * A7b — the OAuth bounce, held somewhere the URL cleanup cannot reach.
 *
 * ⚠️ WHY THE URL IS NOT A STORE. `AccountUpgrade` derived the whole recovery live from
 * `useSearchParams()` and then, one effect later, cleaned the query with
 * `window.history.replaceState(null, "", pathname)` — on the strength of a comment asserting that
 * Next's search params do not react to it. They do. Next 16.2.9 PATCHES `window.history.replaceState`
 * (`next/dist/client/components/app-router.js`) and only bails to the original when the state object
 * carries `__NA` or `_N`; a `null` state with a truthy url runs `applyUrlFromHistoryPushReplace`,
 * which feeds `canonicalUrl` — and `useSearchParams()` is built from exactly that. So the message was
 * erased, the button reverted from "Sign in with Google" to "Continue with Google", and its handler
 * reverted to the `linkIdentity` call that had just been refused. A returning diner saw a flash and
 * then a dead button.
 *
 * sessionStorage rather than localStorage on purpose: a bounce belongs to THIS browsing session and to
 * this tab's attempt. It must not still be sitting there tomorrow, and it must not follow a device
 * handover — `AccountStatus.toGuest()` clears it for that reason.
 *
 * Every access is wrapped: private mode, storage-disabled and quota failures degrade to "no memory of
 * the bounce", which is the pre-A7b behaviour and never worse than it.
 */
const KIND_KEY = "mms.oauth_callback";
const ATTEMPT_KEY = "mms.oauth_recovered";

/** Remember a bounce so a reload or a client navigation cannot erase the recovery with it. */
export function stashCallbackOutcome(outcome: CallbackOutcome): void {
  try {
    window.sessionStorage.setItem(KIND_KEY, outcome.kind);
  } catch {
    /* no memory of the bounce — the card still works for the render that carried it in the URL */
  }
}

/** Read the remembered bounce. Unknown values are treated as absent rather than coerced. */
export function readStashedCallbackOutcome(): CallbackOutcome | null {
  try {
    const kind = window.sessionStorage.getItem(KIND_KEY);
    if (kind === "already-linked") return { kind: "already-linked" };
    if (kind === "generic") return { kind: "generic" };
    return null;
  } catch {
    return null;
  }
}

/**
 * Mark the one automatic recovery as spent.
 *
 * ⚠️ CALLED BEFORE THE REDIRECT, NEVER AFTER. The whole point is that the page is about to be left; a
 * flag written on the way back would be written by a page that may never load.
 */
export function markRecoveryAttempted(): void {
  try {
    window.sessionStorage.setItem(ATTEMPT_KEY, "1");
  } catch {
    /* cannot remember the attempt → fall through to the MANUAL recovery, never to a second automatic
       one: `readRecoveryAttempted` answers true on a storage failure for exactly this reason */
  }
}

/**
 * Has the automatic recovery already been spent?
 *
 * ⚠️ A STORAGE FAILURE ANSWERS **TRUE**, and that direction is deliberate. If we cannot remember
 * whether we already redirected, the safe answer is "yes, we did" — that costs a diner one manual tap
 * on a button that says exactly what it does, whereas the other direction costs them a redirect loop
 * through Google with no way to stop it. The card's manual recovery is always present behind this.
 */
export function readRecoveryAttempted(): boolean {
  try {
    return window.sessionStorage.getItem(ATTEMPT_KEY) !== null;
  } catch {
    return true;
  }
}

/** Forget the bounce and the attempt — a completed sign-in, or a device handover. */
export function clearCallbackOutcome(): void {
  try {
    window.sessionStorage.removeItem(KIND_KEY);
    window.sessionStorage.removeItem(ATTEMPT_KEY);
  } catch {
    /* ignore */
  }
}
