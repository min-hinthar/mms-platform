import type { SettlementShare } from "./split";

/**
 * Is every share on the settlement board actually in — i.e. will `captureAllIfReady` capture?
 *
 * W10d pre-merge RE-REVIEW. This is a pure function rather than an inline `.every()` for one reason:
 * the board expressed it as "not pending and not failed", which was an exact complement of the old
 * `canPay` and silently stopped being one the moment `canPay` learned `canceled`. A `canceled` share
 * then counted as *in*, so the board rendered "…authorized — finishing up…" over a table that CANNOT
 * finish (capture is gated on that very share) — directly above that payer's Canceled badge and the
 * Pay form they were meant to retry in. The `everyoneIn` twin was worse: it is spoken into the view's
 * single live region, so "that's everyone" became an unqualified false assertion with no adjacent
 * figure to contradict it.
 *
 * Stating it as the POSITIVE set mirrors `captureAllIfReady`'s own gate (`every(authorized|captured)`),
 * so the board and the capture path can only disagree if someone edits this line — and a `.tsx`
 * component has no suite in this repo, whereas this file does.
 */
export function everyShareIn(shares: Pick<SettlementShare, "status">[]): boolean {
  return (
    shares.length > 0 && shares.every((s) => s.status === "authorized" || s.status === "captured")
  );
}
