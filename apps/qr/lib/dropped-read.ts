import "server-only";
import { serviceClient } from "@mms/db/server";
import { parseDroppedLines, settleCancelReason, type SettleCanceled } from "./dropped-view";

/**
 * W23d — the cancelled-hold read. Thin on purpose: every rule lives in the pure `./dropped-view`,
 * which is where the tests and the `verify:slice` mutants can reach it. Same split as
 * `availability.ts` / `availability-read.ts`.
 *
 * ── Why this is an OUTCOME and not a nullable value ──────────────────────────────────────────────
 * There are THREE answers here and only one of them may produce "you weren't charged":
 *
 *   • decided   — a cancellation of this caller's own is on record. Say so.
 *   • undecided — no row. This is the ordinary case for every healthy payment in the world, and it
 *                 is ALSO what a capture that is still in flight looks like: in the beat between
 *                 `paymentIntents.capture` and `mms_fulfill_order`, "no order and no verdict" is
 *                 indistinguishable from a perfectly good partial capture whose webhook has not
 *                 landed. Announcing a cancellation here would tell a guest whose money IS moving
 *                 that nothing was taken. That is why the verdict is RECORDED rather than inferred
 *                 from absence, and why this arm falls through to today's copy unchanged.
 *   • error     — the read failed. Emphatically not "undecided": a transient blip must not silently
 *                 become an answer. The delivery repo's rule, one process boundary out — a failure
 *                 must never read as empty.
 *
 * ── Authorization ────────────────────────────────────────────────────────────────────────────────
 * `mms_settlement_cancellation` scopes on `payer_uid = p_uid` IN THE SQL STATEMENT. The
 * PaymentIntent id is a LOOKUP, never a credential — the same rule `getMyOrderFallback` states for
 * its own key, and the reason neither can simply trust a /track URL.
 *
 * ⚠️ Deliberately NOT routed through `assertCartMember`: it raises `cart_closed` and
 * `session_expired` BEFORE it reaches the membership check, and a cart whose settlement was
 * cancelled is very often in exactly those states. Do not "tidy" this into the shared helper.
 */
export type SettlementRead =
  | { state: "decided"; settle: SettleCanceled }
  | { state: "undecided" }
  | { state: "error" };

export async function settlementVerdict(
  paymentIntent: string,
  uid: string,
): Promise<SettlementRead> {
  if (!paymentIntent || !uid) return { state: "undecided" };
  const db = serviceClient();
  const { data, error } = await db.rpc("mms_settlement_cancellation", {
    p_intent: paymentIntent,
    p_uid: uid,
  });
  if (error) {
    console.error("[dropped] settlement verdict read failed", error.message);
    return { state: "error" };
  }
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return { state: "undecided" };
  return {
    state: "decided",
    settle: {
      reason: settleCancelReason(row.reason),
      dropped: parseDroppedLines(row.lines),
    },
  };
}
