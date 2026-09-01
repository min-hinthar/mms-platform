import "server-only";
import { serviceClient } from "@mms/db/server";

/**
 * Pay-window cart lock (M3·P3.2-lock). Internal server helpers — NOT Server Actions (this file is
 * `server-only`, not `"use server"`), so a hostile client can't call them; create-intent / the webhook
 * own when the lock is taken and released. The mutation GUARD is the existing `locked` check in
 * assertCartMember + every cart-mutating path; this module only manages the lock's lifecycle.
 */

// How long a lock holds before it's treated as abandoned and re-acquirable. A diner rarely spends
// >5 min on the Payment Element; a hard tab-close (no decline / no "Edit order") frees the cart for
// the rest of the table within this window. MUST match the staleness cutoff used by both the acquire
// UPDATE below and the effective-lock check in lib/authz.ts.
export const CART_LOCK_TTL_MS = 5 * 60 * 1000;

// Split-tender settlement freeze (M3·P3.3b). Longer than the single-pay lock: a whole table pays in
// turn (each person opens the Element, picks a tip, authorizes), so 10 min before an abandoned
// settlement auto-frees. Same staleness-cutoff discipline as the pay-lock (acquire UPDATE + the
// effective-settling check in lib/authz.ts both use this, on the app clock).
export const SETTLE_TTL_MS = 10 * 60 * 1000;

/** M119 (b) — `unavailable` is the honest fourth answer: we could not READ the cart's status, so
 *  we do not know whether it is open. It is not `closed`; see the acquire path below. */
export type LockResult = "acquired" | "held_by_other" | "closed" | "unavailable";

/**
 * The outcome of an acquisition, plus the ERA it stamped.
 *
 * M70 — `locked_at` identifies the checkout ATTEMPT: `acquireCartLock` refreshes it on every
 * acquisition, a re-acquire by the same diner included, so two overlapping create-intent requests
 * are two eras on one cart. Anything that later asks "am I still the attempt that owns this cart?"
 * — releasing a promo grant, keying a Stripe idempotency key — needs the value THIS call wrote.
 *
 * Returned rather than re-read. create-intent used to SELECT `locked_at` back a few statements
 * later, which is a second derivation of a value we already hold, and the gap between the write and
 * that read is exactly where a competing acquisition lands. `era` is null on every non-acquired
 * outcome: there is no attempt to name.
 */
export type LockAcquisition =
  | { result: "acquired"; era: string }
  | { result: "held_by_other"; era: null }
  | { result: "closed"; era: null }
  | { result: "unavailable"; era: null };
export type SettleResult = "acquired" | "locked" | "settling_other" | "closed";

/**
 * Atomically acquire the lock for `uid` (called by create-intent at the pay boundary). ONE conditional
 * UPDATE: the cart must be OPEN and either unlocked, already held by THIS seat (re-acquire after a
 * refresh / double-tap — so the payer is never told "someone's checking out" by their own lock), or
 * STALE (TTL elapsed → take over an abandoned lock). Postgres re-evaluates the WHERE under the row lock,
 * so two members reaching checkout at once can't both win. The timestamp basis is the app clock (same
 * `Date.now()` the effective-lock check uses) so there's no DB/app skew at the boundary.
 *
 * PRECONDITION: the caller must have already `assertCartMember`'d — this UPDATE does not re-verify
 * membership (create-intent asserts immediately before, with no await-gap that could change it).
 */
export async function acquireCartLock(cartId: string, uid: string): Promise<LockAcquisition> {
  const db = serviceClient();
  const cutoff = new Date(Date.now() - CART_LOCK_TTL_MS).toISOString();
  // The era this acquisition stamps, held in a local so the value RETURNED is byte-identical to the
  // one written — a second `new Date()` is a different millisecond and would name a different attempt.
  const era = new Date().toISOString();
  const settleCutoff = new Date(Date.now() - SETTLE_TTL_MS).toISOString();
  // All interpolated values are SERVER-derived (uid = verified auth.uid() from assertCartMember;
  // cutoffs = server ISO timestamps) — never a client string — so these `.or()`s carry no injection
  // risk. Don't pipe a user-supplied value through here. The two `.or()` groups are ANDed: single-pay
  // can only lock when (unlocked / mine / stale) AND no FRESH split settlement is in flight — so the
  // two freeze modes are mutually exclusive (the foundation review's lock×settle interaction).
  //
  // Count the affected rows via `{ count: "exact" }` (Content-Range header), NOT `.select()`. A mutation
  // with `.select()` asks PostgREST for `Prefer: return=representation`, and PostgREST 14 re-applies the
  // top-level `or()` logic-tree against the RETURNING projection — with only `id` selected, `qr_carts.locked`
  // falls out of scope and the whole UPDATE 400s with 42703 (undefined_column). The old code destructured
  // only `data`, ignored that error, saw 0 rows, and returned "held_by_other" — so EVERY checkout got a
  // spurious 409 after Supabase's PostgREST 14 upgrade. `count` reads the affected-row count with no
  // representation/re-projection; surfacing `error` (throw) makes a real failure a 500 the diner can retry,
  // never a phantom lock conflict.
  const { count, error } = await db
    .from("qr_carts")
    .update({ locked: true, locked_at: era, locked_by: uid }, { count: "exact" })
    .eq("id", cartId)
    .eq("status", "open")
    .or(`locked.eq.false,locked_by.eq.${uid},locked_at.lte.${cutoff}`)
    .or(`settle_at.is.null,settle_at.lte.${settleCutoff}`);
  if (error) throw error;
  if ((count ?? 0) > 0) return { result: "acquired", era };
  // 0 rows: closed, or a FRESH lock held by another. Read the status to message it honestly.
  //
  // M119 (b) — bind the error, because "honestly" is exactly what dropping it prevented. This is the
  // SAME defect the comment above already describes and fixes one statement up: "The old code
  // destructured only `data`, ignored that error, saw 0 rows, and returned 'held_by_other'". That
  // fix landed on the UPDATE (`if (error) throw error;`) and the identical shape survived three
  // lines below, on the read whose whole job is to tell the diner WHY.
  //
  // Unbound, a failed read makes `cart` null, `cart?.status === "open"` false, and the answer
  // `closed` — so `create-intent` tells a diner whose order is open that it is "no longer open",
  // and they cannot check out. `unavailable` instead: the caller maps it to a retryable 503, which
  // is what an outage is.
  const { data: cart, error: statusError } = await db
    .from("qr_carts")
    .select("status")
    .eq("id", cartId)
    .maybeSingle();
  if (statusError) return { result: "unavailable", era: null };
  // One member per literal, not `{ result: Exclude<LockResult, "acquired">; era: null }`: a member
  // whose discriminant is itself a union cannot be ELIMINATED by a `===` check, so the caller would
  // never narrow to the acquired branch and `era` would stay nullable everywhere it is used.
  return cart?.status === "open"
    ? { result: "held_by_other", era: null }
    : { result: "closed", era: null };
}

/**
 * Acquire the table-wide SETTLEMENT freeze (split-tender, M3·P3.3b) for `uid` (the host opening the
 * split). ONE conditional UPDATE: the cart must be OPEN, NOT single-pay-locked, and either not
 * settling, already settling by THIS seat (re-open), or STALE (TTL elapsed). Postgres re-evaluates
 * under the row lock so two opens can't both win. Mirrors acquireCartLock; same app-clock basis.
 * PRECONDITION: caller has already assertCartMember'd (host check is the caller's).
 */
export async function acquireSettlement(cartId: string, uid: string): Promise<SettleResult> {
  const db = serviceClient();
  const cutoff = new Date(Date.now() - SETTLE_TTL_MS).toISOString();
  // `{ count: "exact" }`, not `.select()` — same PostgREST-14 `return=representation` + `or()` re-projection
  // trap as acquireCartLock (a `.select()` here 400s with 42703 undefined_column and mis-reads as
  // settling_other). Count the affected rows and surface any real error instead of swallowing it.
  const { count, error } = await db
    .from("qr_carts")
    .update({ settle_at: new Date().toISOString(), settle_by: uid }, { count: "exact" })
    .eq("id", cartId)
    .eq("status", "open")
    .eq("locked", false) // never start a split while a single payer holds the pay-lock
    .or(`settle_at.is.null,settle_by.eq.${uid},settle_at.lte.${cutoff}`);
  if (error) throw error;
  if ((count ?? 0) > 0) return "acquired";
  const { data: cart } = await db
    .from("qr_carts")
    .select("status,locked")
    .eq("id", cartId)
    .maybeSingle();
  if (cart?.status !== "open") return "closed";
  if (cart.locked) return "locked";
  return "settling_other";
}

/**
 * W10c — the two release helpers RETURN their write error instead of dropping it.
 *
 * They are deliberately best-effort at every call site (the TTLs above are the real backstop, and a
 * caller that failed to release must not fail the money operation it just completed), but "we chose
 * not to act on it" is not the same as "we never knew". postgrest-js resolves a transport failure
 * into `{ data: null, error }` rather than rejecting, so `await q` produced a silent success during
 * an outage — a lock left on a cart, with nothing in the logs to say so. Callers that don't care
 * still just `await` and ignore the value; the one that should shout (the Stripe webhook's
 * payment_failed branch) reads it and logs.
 */
export type ReleaseError = { message: string } | null;

/** Release the settlement freeze (abort or fulfill). Unconditional by cart — the host owns it and the
 *  TTL is the backstop. Idempotent. Returns the write error, or null on success. */
export async function releaseSettlement(cartId: string): Promise<ReleaseError> {
  const db = serviceClient();
  const { error } = await db
    .from("qr_carts")
    .update({ settle_at: null, settle_by: null })
    .eq("id", cartId);
  return error;
}

/**
 * Release the freeze ONLY IF a specific attempt still owns it (W6c). The Terminal settle keys the
 * freeze on a per-ATTEMPT id (not the staff uid), so every release — the poll's decline release,
 * staff cancel, and the late webhook canceled/payment_failed deliveries — carries the attempt it
 * belongs to in the predicate. A release that outlived its attempt (a redelivered event, a stale
 * panel, a double-tap loser) matches ZERO rows instead of nulling a successor's live freeze —
 * the era-confusion class the W6c review confirmed HIGH.
 */
export async function releaseSettlementFor(
  cartId: string,
  attemptId: string,
): Promise<ReleaseError> {
  const db = serviceClient();
  const { error } = await db
    .from("qr_carts")
    .update({ settle_at: null, settle_by: null })
    .eq("id", cartId)
    .eq("settle_by", attemptId);
  return error;
}

/**
 * Extend a LIVE settlement freeze (W1·Q4): slide `settle_at` forward only while it is STILL FRESH.
 * Called on payer activity (a share PI mint, a share authorization) so a table that takes longer
 * than the TTL to cover the bill can't dead-end with every card authorized and capture refused.
 * The `.gt(settle_at, cutoff)` predicate is the safety hinge — this NEVER revives a settlement
 * that is null (host aborted: shares are being canceled) or stale (a single payer may have taken
 * over via acquireCartLock, whose takeover branch requires exactly that staleness). `settle_by`
 * is untouched (the host keeps ownership). Best-effort + idempotent.
 */
export async function extendSettlement(cartId: string): Promise<void> {
  const db = serviceClient();
  const cutoff = new Date(Date.now() - SETTLE_TTL_MS).toISOString();
  await db
    .from("qr_carts")
    .update({ settle_at: new Date().toISOString() })
    .eq("id", cartId)
    .eq("status", "open")
    .gt("settle_at", cutoff);
}

/**
 * Release the promo grant this attempt pinned (M70 · Codex P1 on #233, unanswered until now).
 *
 * `create-intent` pins `promo_granted_cents` at authorization so a promo that expires or a basket
 * that changes mid-settlement cannot move the amount the diner was charged. Three exits release it
 * again — the abandon paths in create-intent, and "Edit order" / the pagehide beacon via
 * `mms_release_promo_grant_for_holder`. A DECLINE was the fourth exit and released nothing: the
 * webhook freed the lock and the freeze, so the cart came back editable with the pin still set. The
 * diner then drops a $30 basket to $20, re-checks out, `mms_pin_promo_grant` is a no-op because the
 * pin is not null, and `mms_promo_discount` hands back the OLD grant — a discount priced against a
 * basket that never earned it, charged for real.
 *
 * ⚠️ ERA-SCOPED. The RPC matches on `locked_at is null or locked_at is not distinct from
 * p_attempt`, so it only ever clears a pin on a cart THIS attempt holds.
 *
 * ⚠️ WHERE IT IS CALLED FROM IS THE GUARD. A stale pin is cleared by the attempt that is about to REPLACE it, never by the attempt that
 * failed. That distinction is the whole design, and Codex round 2 on #240 is why it exists.
 *
 * The obvious place to release was the decline webhook — the exit that left an editable cart
 * carrying an authorized discount. It is the wrong place, for three reasons that only show up on
 * the paths a happy-path read skips:
 *
 *   1. AN INLINE DECLINE DOES NOT END THE ATTEMPT. `PaymentSection.confirm()` keeps the same
 *      Elements and the same clientSecret mounted and returns the diner to a live Pay button, so
 *      the SAME PaymentIntent is retried at its original, grant-inclusive amount. Clearing the pin
 *      on `payment_intent.payment_failed` means a successful retry captures a discount that
 *      fulfillment can no longer re-derive — a charged guest with no order, and a REGRESSION on a
 *      path that worked before, since the un-released pin used to make those amounts agree.
 *   2. THE LOCK RELEASE BESIDE IT IS CART-WIDE. `releaseCartLock(cartId, null)` nulls `locked_at`
 *      unconditionally, so a stale decline arriving after a successor acquired the cart erases the
 *      era this predicate reads. On redelivery the `locked_at is null` branch then matches and
 *      clears the SUCCESSOR's live pin.
 *   3. A REUSED INTENT CARRIES A STALE ERA. An automatic-capture idempotency key has no era in it,
 *      so a re-entered checkout gets the first PaymentIntent back with the FIRST era in its
 *      metadata, while the cart is locked under a new one — the release would match nothing and the
 *      pin would survive anyway.
 *
 * Releasing at the next `create-intent` dissolves all three: the caller holds the lock it is
 * releasing under, so there is no successor to wipe and no metadata to trust, and an intent nobody
 * re-minted keeps the pin its amount was built from. The pin is then immediately re-derived from
 * the basket as it stands, which is what "the amount charged is the amount this attempt derived"
 * actually requires.
 *
 * Lives here rather than inline in the route deliberately: `app/api/**` sits outside
 * `check-money-coverage`'s MONEY_PATHS and outside `verify:slice`'s mutant set, so a money rule
 * written there cannot be guarded at all (the W17 lesson, in CLAUDE.md).
 */
export async function releasePromoGrantFor(cartId: string, attempt: string): Promise<ReleaseError> {
  // No era, no release. The caller passes the era ITS OWN acquisition wrote; an empty one means we
  // cannot show the cart is ours, and a cart-wide clear is exactly the successor-wiping hazard
  // above — so the pin stays and the next honest re-derivation (or the cart closing) settles it.
  if (!attempt) return null;
  const db = serviceClient();
  const { error } = await db.rpc("mms_release_promo_grant", {
    p_cart_id: cartId,
    p_attempt: attempt,
  });
  return error;
}

/**
 * M124 — release the pay lock AND the promo pin, for the ONE attempt that names itself.
 *
 * This replaces the pair the two client exits used to run — `mms_release_promo_grant_for_holder`
 * followed by `releaseCartLock(cartId, uid)` — with a single conditional UPDATE, because the pair
 * had two separate defects and one of them was the pair itself.
 *
 * ## What was wrong
 *
 * `_for_holder` matches on `locked_by = p_uid` alone. `acquireCartLock` deliberately lets the SAME
 * uid re-acquire (a refresh, a second tab, a re-checkout with a different tip) and REFRESHES
 * `locked_at`, so one diner's two attempts share a uid and differ only by era. A late `pagehide`
 * beacon from the abandoned attempt therefore satisfies that predicate against the LIVE one and
 * clears its pin. Land that between capture and the fulfilment webhook and `getCartTotals`
 * re-derives without the pin: the reconcile disagrees with the captured amount, which is a charged
 * card and no order. `releaseCartLock(cartId, uid)` had the identical hole one statement later — it
 * unfroze the successor's cart mid-checkout.
 *
 * ## Why ONE statement
 *
 * Two statements are two chances to half-apply. The old order was grant-then-lock precisely because
 * the grant RPC's proof of ownership (`locked_by = uid`) stops being true once the lock is dropped —
 * so a failure between them left a released lock with a live pin, which is exactly the state
 * OPEN-ITEMS M123(a′) describes and cash/Terminal/split will happily charge. Releasing both in one
 * UPDATE makes that state unreachable: same row, same predicate, same statement.
 *
 * ## The predicate, and the disjunct that is deliberately ABSENT
 *
 * `.eq("locked_by", uid).eq("locked_at", era)` — this seat, this attempt. There is **no
 * `locked_at is null` disjunct**, and that omission is load-bearing rather than an oversight.
 * `mms_release_promo_grant` carries one (`locked_at is null or locked_at is not distinct from
 * p_attempt`) because its caller holds the lock it is releasing under; a client echo does not, and
 * an `is null` arm would let a stale token clear a pin the moment any release or TTL nulled the era
 * — which is the window M70's header says the pin MUST survive:
 *
 *   > "The pin has to outlive the lock for the charge to reconcile at all."
 *
 * A webhook delayed past `CART_LOCK_TTL_MS` (Stripe retries up to three times at an 80s timeout)
 * must still re-derive WITH the pin. So: no era, no match, no release.
 *
 * ## ⚠️ WHAT THIS DOES NOT CLOSE — the sub-millisecond collision (Codex P1 on #244)
 *
 * `locked_at` is the discriminator, and `acquireCartLock` mints it as `new Date().toISOString()`
 * BEFORE awaiting its UPDATE — millisecond resolution. Two same-uid requests that enter within the
 * SAME millisecond therefore compute and write the SAME era (same-uid re-acquire is allowed by
 * design), and an abandon from the first still matches the second. That window is inherited from
 * `mms_release_promo_grant`, which has keyed on `locked_at` since #240 — it is not introduced here.
 *
 * This is still a strict improvement, and the size of it is the point: the predicate it replaces
 * (`locked_by = uid` alone) collided for ANY two attempts by one diner, minutes apart; this one
 * collides only for two inside one millisecond. But it is a narrowing, NOT a closure, and calling it
 * closed would be the kind of overstatement the next reader would trust. A real closure needs a
 * discriminator whose uniqueness does not depend on wall-clock separation — a distinct token column,
 * which is the same migration OPEN-ITEMS M151/M152 already require. Tracked there.
 *
 * ⚠️ `{ count: "exact" }`, never `.select()` — the PostgREST-14 `return=representation` trap
 * documented on `acquireCartLock` above. The count is also the ANSWER: `released: false` tells
 * "Edit order" its tab was superseded, so it can say so instead of dropping the diner on a review
 * step that will refuse every edit.
 *
 * Best-effort by contract (returns the error, never throws): the callers are a page-unload beacon
 * that cannot surface anything and a Server Action whose diner is mid-tap. The TTL is the backstop.
 */
export async function releasePayAttempt(
  cartId: string,
  uid: string,
  era: string | null,
): Promise<{ released: boolean; error: ReleaseError }> {
  // No era, no release — the fail-closed arm. An old client bundle (mid-deploy) and a forged or
  // unparseable token land here alike, and all three mean the same thing: this caller cannot show
  // which attempt it is. Releasing anything on that basis is the M124 defect with extra steps.
  if (!era) return { released: false, error: null };
  const db = serviceClient();
  const { count, error } = await db
    .from("qr_carts")
    // The pin goes in the SAME payload as the lock. Dropping `promo_granted_cents` here leaves every
    // predicate assertion green while releasing a lock over a live pin — the `verify:slice` mutant
    // `lock/grant-dropped-from-payload` exists for exactly that, because it is invisible otherwise.
    .update(
      { promo_granted_cents: null, locked: false, locked_at: null, locked_by: null },
      { count: "exact" },
    )
    .eq("id", cartId)
    .eq("locked_by", uid)
    .eq("locked_at", era);
  return { released: (count ?? 0) > 0, error };
}

/**
 * M153 — release the lock for the ONE attempt that still holds it (the refusal paths in
 * `create-intent` that exit ABOVE the promo pin).
 *
 * ## Why the uid-only release was not enough
 *
 * `releaseCartLock(cartId, uid)` matches on `locked_by = uid` alone, and `acquireCartLock`
 * deliberately lets the SAME diner re-acquire — refreshing `locked_at` — so one diner's two
 * overlapping create-intents share a uid and differ only by era. The LOSING attempt's refusal
 * (a sold-out line, a filled pickup slot, a missing pickup contact) then satisfies that predicate
 * against the WINNER's lock and unfreezes a cart that is mid-checkout behind a mounted Payment
 * Element. That is the peer-mutation-during-checkout hole the lock exists to close, opened by the
 * lock's own release. Same shape as `releaseSettlementFor` vs `releaseSettlement`, and same fix.
 *
 * ## Why this releases the LOCK ONLY, and never the pin
 *
 * `releasePayAttempt` clears both because its callers abandon an attempt that pinned. These callers
 * exit BEFORE `mms_pin_promo_grant` runs, so any pin on the row belongs to a PREDECESSOR — and a
 * predecessor's pin may be the one a captured-but-unfulfilled PaymentIntent reconciles against:
 *
 *   > "The pin has to outlive the lock for the charge to reconcile at all." (M70)
 *
 * PR #244 tried clearing it here and REVERTED — Codex P1 and the blind adversarial pass agreed it
 * traded a lesser defect for a worse one. The state this leaves behind (`locked = false` over a live
 * pin, which cash/Terminal/split will charge) is real and is OPEN-ITEMS **M123 (a′)**; it needs the
 * cart→intent link to fix safely, not a wider release here.
 *
 * ## Why era-scoping cannot strand a table
 *
 * A non-matching predicate means someone ELSE holds the lock: either a live successor, which frees
 * it on its own exits, or nobody (`locked_at` already null). There is no state where this refuses
 * and the lock has no owner to release it — so the "a transient failure strands the table for the
 * full TTL" worry filed against M153 does not survive contact with `acquireCartLock`'s contract.
 * Fails CLOSED on a null era for the `releasePayAttempt` reason: a caller that cannot name its
 * attempt cannot show the lock is its own.
 *
 * ⚠️ Inherits the sub-millisecond collision `releasePayAttempt` documents: `locked_at` has
 * millisecond resolution and is minted before the await, so two same-uid acquisitions inside one
 * millisecond write the same era. A narrowing, not a closure; the real discriminator is the token
 * column OPEN-ITEMS M151/M152 require.
 */
export async function releaseCartLockFor(
  cartId: string,
  uid: string,
  era: string | null,
): Promise<ReleaseError> {
  if (!era) return null;
  const db = serviceClient();
  const { error } = await db
    .from("qr_carts")
    .update({ locked: false, locked_at: null, locked_by: null })
    .eq("id", cartId)
    .eq("locked_by", uid)
    .eq("locked_at", era);
  return error;
}

/**
 * Release the lock. `uid` scopes it to the locker (the "Edit order" path — a member can only release
 * THEIR OWN lock, never unlock another payer mid-checkout). Pass `null` for an unconditional release
 * (the webhook on a declined payment — the charge failed, so free the cart for everyone). Idempotent.
 * Returns the write error, or null on success (see the `ReleaseError` note above).
 */
export async function releaseCartLock(cartId: string, uid: string | null): Promise<ReleaseError> {
  const db = serviceClient();
  let q = db
    .from("qr_carts")
    .update({ locked: false, locked_at: null, locked_by: null })
    .eq("id", cartId);
  if (uid !== null) q = q.eq("locked_by", uid);
  const { error } = await q;
  return error;
}
