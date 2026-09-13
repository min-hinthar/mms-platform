/**
 * WHO a `payment_intent.payment_failed` is allowed to un-freeze (Codex round 8 on #275, P1).
 *
 * `qr_carts.settle_at`/`settle_by` is the STAFF settlement mutex. It is not the diner pay-lock
 * (`locked`/`locked_at`/`live_payment_intent_id`), and a diner's PaymentIntent has no relationship
 * to it whatsoever. The webhook's generic single-pay arm nevertheless called
 * `releaseSettlement(cartId)` — unconditional by cart — on EVERY decline, so a diner's failed card
 * nulled whatever freeze the row happened to be carrying, including one a staff settle was actively
 * relying on. `closeSecureTab` names the freeze, not its idempotency key, as the concurrent
 * double-charge guard.
 *
 * That arm's own comment argued the release had to stay unconditional because "no equivalent
 * predicate available here". That was true when it was written and is FALSE now: `closeSecureTab`
 * already stamps `closedBy: "staff"` on the one intent the release exists for. All that was missing
 * was the freeze OWNER — the intent carried `closedByStaffId` (attribution) while the freeze is held
 * under a request-unique `settleAttempt` — so the release had nothing to scope itself by.
 *
 * ⚠️ THE OWNER IS `settleAttempt`, NEVER A PERSON (A3 · M201). Between #275 and A3 the key was
 * `closedByUid` — the staff auth uid the tab-close held its freeze under — and it was the residual
 * this row named: a uid is shared by every request that person makes, so a DELAYED decline could
 * strip a same-staff retry's live freeze. `closeSecureTab` now mints a fresh uuid per request, the
 * same key the Terminal has always stamped, and the shared-uid key is not read at all — an intent
 * from the deploy before this one heals on the TTL like any other owner-less intent.
 *
 * The rule is deliberately FAIL-CLOSED in both directions that matter:
 *   • a diner intent yields `null` → nothing is released, because it never held the freeze;
 *   • a staff-close intent minted by an OLDER deploy (no `settleAttempt`) also yields `null`, so it
 *     heals on the 10-minute `SETTLE_TTL` rather than releasing a freeze it cannot prove is its own.
 *
 * The uuid shape is checked because `qr_carts.settle_by` is a `uuid` column: a non-uuid owner is a
 * PostgREST 22P02 error, not a predicate that matches zero rows.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SettleReleaseMeta = Record<string, string | undefined> | null | undefined;

/** The settlement owner this event may release, or `null` when it may release nothing. */
export function settleReleaseOwner(meta: SettleReleaseMeta): string | null {
  if (!meta) return null;
  // Only a staff close ever holds `settle_at` through an intent. Anything else — a diner single-pay,
  // a scan-and-go, an unlabelled legacy intent — is not this mutex's owner and releases nothing.
  if (meta.closedBy !== "staff") return null;
  // `settleAttempt` and nothing else: not `closedByStaffId` (attribution, not the owner) and not
  // `closedByUid` (a shared owner — the exact residual this scope exists to close).
  const owner = meta.settleAttempt;
  if (typeof owner !== "string") return null;
  const trimmed = owner.trim();
  return UUID.test(trimmed) ? trimmed : null;
}
