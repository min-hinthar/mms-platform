import type { MintOutcome } from "./merge";

/**
 * A7b — may we abandon this anonymous session?
 *
 * ⚠️ THE QUESTION IS NOT "DID THE MINT WORK", IT IS "IS ANYTHING LOST IF WE LEAVE". Signing into a
 * PRE-EXISTING account switches uid. The anonymous uid that owns this device's orders, Stars, coupons and
 * favourites is then unreachable: `mintMergeToken` requires `is_anonymous === true` and that session is
 * gone, `AccountStatus.toGuest()` mints a NEW anon uid rather than restoring the old one, order history
 * authorizes on `earned_by`, and `mms_merge_anon_rewards` is granted to `service_role` alone. So a merge
 * token that was not secured before the redirect can never be minted afterwards, and the value is gone for
 * good — while the card has already told the diner "we'll move this device's Stars onto it".
 *
 * Before A7b the card minted best-effort and redirected unconditionally (`if (mtoken) stash(mtoken)`, no
 * else), so every one of those failures destroyed value silently.
 *
 * ⚠️ AND THE STASH IS PART OF THE PROOF, NOT AN AFTERTHOUGHT. `stashMergeToken` swallows a storage failure
 * by design — private mode, storage disabled, a full quota — and a token that only exists server-side is
 * a token `MergeRedeemer` will never find. So the decision reads the value BACK and refuses on a mismatch;
 * a mint that succeeded and a stash that silently didn't is indistinguishable from a failed mint, and both
 * end the same way.
 *
 * ⚠️ OVER-BLOCKING IS ALSO A FAILURE. `blocked` must never mean "you cannot sign in" — the card pairs it
 * with an explicit way through that says plainly what will be left behind. A diner who genuinely has
 * nothing on this device (`nothing-to-carry`) is never blocked at all, so a mint outage cannot lock out
 * someone with nothing to lose.
 */
export type CarryDecision =
  | { kind: "proceed" }
  | { kind: "blocked"; reason: "mint" | "stash"; message: string };

const MINT_FAILED =
  "We couldn’t get this device’s Stars ready to move just now. Try again — or sign in without them.";
const STASH_FAILED =
  "This browser wouldn’t save the hand-off for your Stars — private browsing usually does this. Try again in a normal window, or sign in without them.";

/**
 * Decide from the mint's own answer plus what the stash actually reads back.
 *
 * `stashedBack` is `readMergeToken()` called AFTER `stashMergeToken()` — the caller passes it rather than
 * reading storage here so this stays a pure value question, mutable by `verify:slice` without a DOM.
 */
/**
 * The outcome for a mint whose SERVER ACTION never returned — a lost connection, a transport failure, an
 * uncaught server exception.
 *
 * ⚠️ `mintMergeToken`'s own try/catch cannot see this. It catches throws inside its BODY; a Server
 * Action promise rejects at the transport, before the body runs, so `await mintMergeToken()` throws at
 * the call site with no `{ kind }` to fall through to. Neither call site caught it, so a failed mint
 * left the card at `busy = true` with no message and no way forward — and the rejection went unhandled.
 * Treated as `failed`, because that is exactly what it is: the carry was not secured.
 */
export const MINT_TRANSPORT_FAILURE: MintOutcome = { kind: "failed" };

export function decideCarry(outcome: MintOutcome, stashedBack: string | null): CarryDecision {
  if (outcome.kind === "failed") return { kind: "blocked", reason: "mint", message: MINT_FAILED };
  // Nothing on this device to lose — the sign-in costs the diner nothing, so never stand in their way.
  if (outcome.kind === "nothing-to-carry") return { kind: "proceed" };
  if (stashedBack !== outcome.token)
    return { kind: "blocked", reason: "stash", message: STASH_FAILED };
  return { kind: "proceed" };
}

/**
 * The words for the escape hatch that follows a `blocked`. Stated as a loss, not as a shrug: the Stars do
 * NOT "stay on this device" — the session that owns them is abandoned by the very sign-in this button
 * performs, and nothing can reach them afterwards.
 */
export const CARRY_OVERRIDE_LABEL = "Sign in without them — leave this device’s Stars behind";

/**
 * WHICH sign-in the carry blocked, so the escape hatch can resume THAT one.
 *
 * ⚠️ THE HATCH MUST NOT CHANGE THE METHOD, AND IT DID. Both entry points mint — the Google recovery and
 * the email-taken recovery — so both can be blocked, and both render the same control. Wiring it
 * straight to `startGoogleSignIn(false)` meant a diner who had typed an email address and asked for a
 * code got sent to Google instead: a different provider, plausibly a different account, chosen by the
 * program rather than by them. "Continue without your Stars" is a decision about the STARS; it is not
 * consent to sign in as somebody else.
 */
export type BlockedFlow = { method: "google" } | { method: "email"; email: string };

/** A blocked carry, with the method it blocked so the hatch resumes rather than redirects. */
export type CarryBlock = { message: string; flow: BlockedFlow };
