import type { SettleTakeover } from "./supersede";

/**
 * M197 — the ONE staff-facing sentence for a settlement that could not start.
 *
 * ## Why this is a module
 *
 * Three staff surfaces refuse for the same five reasons — `settleCash`, `closeSecureTab` and the
 * Terminal's `settleCard` — and before this each carried its own hand-written pair of sentences,
 * already drifted ("wait for that to finish" vs "wait a moment and try again") for one identical
 * fact. That is the W17 shape: a value derived in one place and quoted in another WILL drift, and
 * the fix is one binding every consumer reads. Adding two verdicts to `SettleResult` would have made
 * it three near-identical five-armed ladders instead.
 *
 * ## The sentences promise only what the code keeps
 *
 * `unavailable` in particular is the reason this is worth stating carefully. It arrives when the
 * cart could not be READ, or when Stripe could not be reached to judge a stale attempt — and the old
 * code turned the first of those into "That table is no longer open", which is a dead end staff
 * cannot act on. It is a retry, and the copy says so.
 *
 * `paying` is the one that must never be softened. It means a real card payment on this cart is
 * charged or charging, and the honest instruction is to STOP — a second tender here is the guest
 * paying twice and waiting on a manual refund.
 */
export function settleRefusal(result: Exclude<SettleTakeover, "acquired">): string {
  switch (result) {
    case "closed":
      return "That table is no longer open.";
    case "locked":
      return "Someone’s already paying on their phone — wait for that to finish.";
    case "paying":
      return "A card payment on this table is already going through — don’t take another tender until it settles.";
    case "settling_other":
      return "Another settlement is already open on this table.";
    case "unavailable":
      return "Couldn’t check this table just now — try again in a moment.";
  }
}
