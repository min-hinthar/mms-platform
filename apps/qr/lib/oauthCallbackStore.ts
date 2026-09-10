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

/**
 * Remember a bounce so a reload or a client navigation cannot erase the recovery with it.
 *
 * ⚠️ ONLY `already-linked` IS WORTH REMEMBERING, and storing both kinds was a defect the blind pass
 * found. A `generic` bounce carries no recovery — there is nothing for the diner to press differently
 * — so reviving it only re-prints "Couldn't finish with Google" on a later visit where nothing was
 * attempted. Worse, it is unclearable in practice: `clearCallbackOutcome` runs from the non-anonymous
 * auth listener and from a device handover, and an anonymous diner who never signs in reaches
 * neither, so the false sentence follows them for the rest of the tab session. What is actionable
 * survives a reload; what is only an apology belongs to the render that earned it.
 */
export function stashCallbackOutcome(outcome: CallbackOutcome): void {
  if (outcome.kind !== "already-linked") return;
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
 * Mark the one automatic recovery as spent. Returns whether the marker actually PERSISTED.
 *
 * ⚠️ CALLED BEFORE THE REDIRECT, NEVER AFTER. The whole point is that the page is about to be left; a
 * flag written on the way back would be written by a page that may never load.
 *
 * ⚠️ AND IT REPORTS, RATHER THAN SWALLOWING — because the caller's next act is irreversible. A quota
 * that admits the outcome key and then refuses this one throws here, and `readRecoveryAttempted`
 * cannot cover it: that guard answers `true` only when the READ throws, and after a write-only
 * failure the read succeeds and honestly answers `null` → false. So the next mount finds the bounce
 * remembered, the attempt unrecorded, and fires a SECOND automatic redirect through Google — the
 * loop the one-shot exists to make impossible. A caller that cannot record the attempt must not
 * spend it; the manual button is always rendered behind this.
 *
 * The write is read BACK rather than trusted: `setItem` can resolve without storing in some
 * private-mode implementations, which is the same "a failure must never read as success" rule the
 * merge-token stash follows one module over.
 */
export function markRecoveryAttempted(): boolean {
  try {
    window.sessionStorage.setItem(ATTEMPT_KEY, "1");
    return window.sessionStorage.getItem(ATTEMPT_KEY) !== null;
  } catch {
    return false;
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
