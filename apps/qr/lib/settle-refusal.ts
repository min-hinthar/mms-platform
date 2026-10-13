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

// ── Phase 2c · gate ──
/**
 * The staff settle gate's refusal (`code: "unsent"`), named ONCE for its three doors — `settleCash`,
 * `closeSecureTab` and the reader's `settleCard`. Plain words (never "settle", never "tab"): it names
 * the fix. Every current client renders the dictionary sentence from the typed code
 * (`table.send.settleBlocked.*`, which carries the count); this English is for a bundle older than
 * the code.
 */
export const UNSENT_SETTLE_REFUSAL =
  "Some dishes haven’t gone to the kitchen — send them first (or remove them if the guest has left), then take payment.";

/** The refusal's shape — one arm of every staff settle's code union (`SettleCashRefusal`,
 *  `SettleCardResult`). `units` is the server's own count of the dine-in dishes still to send (the
 *  table page's `detail.send.sendable`, read fresh under the freeze), so the sentence can name it. */
export type UnsentRefusal = { ok: false; error: string; code: "unsent"; units: number };

export function unsentRefusal(units: number): UnsentRefusal {
  return { ok: false, error: UNSENT_SETTLE_REFUSAL, code: "unsent", units };
}

// ── Phase 2d · P2el ──
/**
 * P2dc's refusal (owner decision 5a): the unsent read FAILED at a dine-in table, so the gate could not
 * be checked and the staff door refused rather than take money over it. Nothing was recorded or
 * charged and the freeze was released, so the same tap retries. Typed, so every current client says
 * it through the dictionary (`settle.unsentUnreadable`, both scripts); this English is for a bundle
 * older than the code. Never the write-outage sentence ("keep it on paper") — a single read blip at a
 * payment door is a retry, not an outage.
 */
export const UNSENT_UNREADABLE_REFUSAL = "Couldn’t check the kitchen — try again.";

export type UnreadableRefusal = { ok: false; error: string; code: "unreadable" };

export function unreadableRefusal(): UnreadableRefusal {
  return { ok: false, error: UNSENT_UNREADABLE_REFUSAL, code: "unreadable" };
}
