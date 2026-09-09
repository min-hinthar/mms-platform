import "server-only";
import { serviceClient } from "@mms/db/server";

/**
 * Pay-window cart lock (M3·P3.2-lock). Internal server helpers — NOT Server Actions (this file is
 * `server-only`, not `"use server"`), so a hostile client can't call them; create-intent / the webhook
 * own when the lock is taken and released. The mutation GUARD is the existing `locked` check in
 * assertCartMember + every cart-mutating path; this module only manages the lock's lifecycle.
 */

// T20 — the two TTLs moved to `lib/lock-ttl.ts`, a module without `server-only`, because a CLIENT
// needs them: both freezes expire by arithmetic with no row write, so no realtime event can ever
// clear a component's cached `true`. Re-exported here would leave two import paths for one value,
// so every caller was repointed instead — this module now IMPORTS them like any other consumer and
// deliberately does NOT re-export them. Read that module's header before changing either value.
import { CART_LOCK_TTL_MS, SETTLE_TTL_MS } from "./lock-ttl";

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
/**
 * M197 — the settlement acquisition's answer, and two arms it did not used to have.
 *
 * `locked_stale` and `unavailable` are not padding. Before them this function collapsed FOUR
 * distinct situations into two words, and both collapses were wrong in a direction that costs
 * service:
 *
 *   • `locked` meant "a single payer holds the pay-lock", full stop — with no way to say whether
 *     that payer is still there. `releaseCartLock`'s own docblock promises a declined attempt stays
 *     frozen "until the diner ends the attempt or the TTL does", and for `acquireCartLock` that is
 *     true (its third disjunct hands the lock to any member once the era is stale). This function
 *     had no such disjunct, so for cash, Terminal, tab-close and split the TTL never arrived: a
 *     diner who declined a card and walked out froze every other tender FOREVER.
 *   • `closed` was also what a FAILED READ produced — `const { data: cart } = …` discarded its
 *     error, so an outage told staff a live table was "no longer open". That is M119's shape
 *     exactly, in the one function whose whole job is to say why.
 */
export type SettleResult =
  /** The freeze is ours. */
  | "acquired"
  /** A single payer holds a FRESH pay-lock — their attempt is live. Refuse. */
  | "locked"
  /** The pay-lock's era is past its TTL, but the cart still names a live PaymentIntent. The holder
   *  may be gone or may be retrying a decline against that same intent, so this is NOT free to take:
   *  the caller must make the intent unusable at Stripe first (`acquireSettlementSuperseding`). */
  | "locked_stale"
  /** Another settlement holds the table-wide freeze. */
  | "settling_other"
  /** The cart is not open. */
  | "closed"
  /** We could not read the cart, so we do not know. Never a verdict — retryable. */
  | "unavailable";

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
  // M197 — the pay-lock term is a DISJUNCTION now, not `.eq("locked", false)`.
  //
  // The bare equality had no way out. `acquireCartLock` takes over a lock whose era is older than
  // `CART_LOCK_TTL_MS`, so single-pay always had an escape from an abandoned attempt; settlement
  // did not, and a declined card is DELIBERATELY left locked (`releaseCartLock`'s docblock: the
  // intent is still confirmable from the mounted Element, so the cart stays frozen "until the diner
  // ends the attempt or the TTL does"). For cash, Terminal, tab-close and split that TTL never
  // arrived. One diner declining and walking out froze every other tender on the table for good.
  //
  // ⚠️ A BARE STALENESS DISJUNCT WOULD TRADE THE DEAD END FOR A DOUBLE CHARGE, which is why the
  // second conjunct is here. `locked_at` is only refreshed by `acquireCartLock` — an inline retry
  // re-confirms the SAME PaymentIntent client-side and never calls create-intent — so a diner still
  // sitting there feeding cards into a declined intent has a STALE era and a live intent. Settlement
  // is a different collection channel from that intent (cash in the drawer, a Terminal tap, split
  // shares), so taking the lock on age alone could collect twice. The link is the evidence: this
  // statement takes over only a lock whose attempt named NO intent, and the caller that wants the
  // rest must first make the named intent unusable at Stripe (`acquireSettlementSuperseding`).
  //
  // `lockCutoff` is the PAY-lock TTL, not the settle one: the age being judged belongs to
  // `locked_at`, and using `cutoff` here would let a settlement take over a pay-lock at 10 minutes
  // that single-pay may take at 5 — two different answers to "is this attempt still alive?".
  const lockCutoff = new Date(Date.now() - CART_LOCK_TTL_MS).toISOString();
  const { count, error } = await db
    .from("qr_carts")
    .update({ settle_at: new Date().toISOString(), settle_by: uid }, { count: "exact" })
    .eq("id", cartId)
    .eq("status", "open")
    .or(`locked.eq.false,and(locked_at.lte.${lockCutoff},live_payment_intent_id.is.null)`)
    .or(`settle_at.is.null,settle_by.eq.${uid},settle_at.lte.${cutoff}`);
  if (error) throw error;
  if ((count ?? 0) > 0) return "acquired";
  // ⚠️ THE READ'S ERROR IS BOUND (M119's rule, and this function was the counter-example). Dropping
  // it made `cart` null on an outage, `cart?.status !== "open"` true, and the answer `closed` — so a
  // transient failure told staff that a live table was no longer open, on the one screen whose job
  // is to explain the refusal. `unavailable` is retryable; `closed` is a dead end.
  const { data: cart, error: readError } = await db
    .from("qr_carts")
    .select("status,locked,locked_at,live_payment_intent_id")
    .eq("id", cartId)
    .maybeSingle();
  if (readError) return "unavailable";
  if (cart?.status !== "open") return "closed";
  // ⚠️ ASK WHETHER THE LOCK TERM ACTUALLY REFUSED, not merely whether the cart is locked (blind
  // adversarial pass on #275, CRITICAL 2). The UPDATE ANDs two `.or()` groups, so zero rows means at
  // least one refused — and once the lock term gained a staleness arm, `locked = true` stopped
  // implying the lock is what blocked us. A cart that is locked, stale and unlinked PASSES the lock
  // term and can still be refused by the SETTLE term: two staff taking over the same abandoned table
  // at once is enough. Reporting `locked` there sends the loser to wait on a guest who is doing
  // nothing, while the real blocker is the colleague beside them. This mirrors the UPDATE's own
  // predicate rather than restating the shape of it, so the two cannot drift apart.
  const stale = !!cart.locked_at && cart.locked_at <= lockCutoff;
  const lockRefused = cart.locked && !(stale && !cart.live_payment_intent_id);
  if (!lockRefused) return "settling_other";
  // Stale AND still naming an intent: supersedable, not a dead end.
  return stale && cart.live_payment_intent_id ? "locked_stale" : "locked";
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
  /**
   * The exact `settle_at` this caller wrote. Supply it whenever the owner may be SHARED — a staff uid
   * is, a per-attempt uuid is not — so the release cannot reach a successor who took the row over
   * under the same owner. Omitted, this scopes by owner alone, which is correct only for a
   * request-unique one (`terminal.ts`'s attempt id, `standDown`'s probe).
   */
  settleAt?: string,
): Promise<ReleaseError> {
  const db = serviceClient();
  const scoped = db
    .from("qr_carts")
    .update({ settle_at: null, settle_by: null })
    .eq("id", cartId)
    .eq("settle_by", attemptId);
  const { error } = await (settleAt === undefined ? scoped : scoped.eq("settle_at", settleAt));
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
      // M151 — and the LINK. `releasePayAttemptSafely` (lib/supersede.ts) has already cancelled the
      // intent this attempt minted, or refused; by the time this statement runs there is nothing
      // left that could reconcile against the pin, so dropping the link here is what makes
      // "pin cleared, link still set" unreachable from the client exits.
      {
        promo_granted_cents: null,
        live_payment_intent_id: null,
        locked: false,
        locked_at: null,
        locked_by: null,
      },
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
 * Release the lock. `uid` scopes it to the locker (the capture cron's `releaseOurLock` — a caller can
 * only release the lock it owns, never unlock another payer mid-checkout). `null` is the
 * unconditional, cart-wide form. ⚠️ NO PRODUCT PATH PASSES `null` ANY MORE: the decline webhook did,
 * and stopped (M152 c′, #257) — a declined PaymentIntent is still confirmable from the mounted
 * Element, so the cart it prices must stay frozen until the diner ends the attempt or the TTL does.
 * The arm is kept as the primitive (an ops release, a future staff control), not as a live rule.
 * Idempotent. Returns the write error, or null on success (see the `ReleaseError` note above).
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

/**
 * M197 (Codex round 2 on #275, P1) — CLAIM the settlement freeze against ONE named stale attempt,
 * atomically, before anything irreversible happens to it.
 *
 * ## The window this closes
 *
 * `acquireSettlementSuperseding` used to diagnose `locked_stale` and then cancel at Stripe while
 * holding NO mutex. Between those two steps the diner can call create-intent, re-acquire the pay
 * lock with a fresh era and link a live PaymentIntent — and `supersedeCartIntent` reads the row
 * FRESH, so it cancelled whatever the cart named at that instant: an actively resumed checkout.
 * The second acquire then noticed the new lock and refused staff, so the net effect was to kill a
 * live payment and gain nothing.
 *
 * The asymmetry is with create-intent, which calls the same supersede AFTER `acquireCartLock` has
 * succeeded — it holds the lock, so nothing can move under it. This path held nothing.
 *
 * ## Why claiming the SETTLE freeze is the right mutex
 *
 * `acquireCartLock` requires `settle_at` null or stale, so a fresh `settle_at` blocks the diner's
 * re-acquire outright. Claiming it first therefore freezes the exact state we diagnosed, and the
 * cancel that follows can only ever touch the attempt we named.
 *
 * ## The predicate is the evidence, restated
 *
 * `live_payment_intent_id = <the id we read>` is what makes this a claim on ONE attempt rather than
 * on the cart: if create-intent superseded and relinked in the meantime, the id differs and this
 * matches zero rows — which is the answer, not a failure. `locked_at <= cutoff` is re-tested for the
 * same reason: an inline retry does not refresh the era, but a fresh create-intent does, and a
 * claim must not succeed against an attempt that has just come back to life.
 */
export async function claimStaleSettlement(
  cartId: string,
  uid: string,
  intentId: string,
): Promise<{ claimed: boolean; error: ReleaseError; settleAt: string }> {
  const db = serviceClient();
  const lockCutoff = new Date(Date.now() - CART_LOCK_TTL_MS).toISOString();
  const settleCutoff = new Date(Date.now() - SETTLE_TTL_MS).toISOString();
  // ⚠️ THE ERA WE WRITE IS RETURNED, AND IT IS WHAT MAKES OUR FREEZE IDENTIFIABLE (Codex round 12 on
  // #275, P1). `settle_by` alone cannot say WHICH request holds the row: `staff-cart.ts` passes
  // `caller.uid` at both call sites, so a same-staff successor that acquires through
  // `acquireSettlement`'s same-owner arm writes a byte-identical `settle_by`. Every writer of
  // `settle_at` in this repo stamps a FRESH `new Date().toISOString()` and none restores an old one,
  // so the pair (settle_by, settle_at) does identify this claim — and a release scoped to the pair
  // matches zero rows the moment anyone else takes the row over.
  const settleAt = new Date().toISOString();
  const { count, error } = await db
    .from("qr_carts")
    .update({ settle_at: settleAt, settle_by: uid }, { count: "exact" })
    .eq("id", cartId)
    .eq("status", "open")
    .eq("locked", true)
    .lte("locked_at", lockCutoff)
    .eq("live_payment_intent_id", intentId)
    // ⚠️ NO SAME-OWNER RE-ACQUIRE ARM, unlike `acquireSettlement` (Codex round 3 on #275, P1). That
    // disjunct exists there so a host can RE-OPEN their own split; here it would defeat the whole
    // mutex. `settleCash` and `closeSecureTab` both pass `caller.uid`, so two concurrent takeovers
    // by the same staff member would BOTH match — the first writes `settle_by = uid`, the second
    // sails through on `settle_by.eq.<uid>` — and each then mints its own Stripe charge, because the
    // off-session idempotency key is deliberately per-attempt (a stable key would cache a decline
    // for 24h). A one-shot takeover of an abandoned attempt has no legitimate re-entry: the loser
    // stands down and re-asks.
    .or(`settle_at.is.null,settle_at.lte.${settleCutoff}`);
  return { claimed: (count ?? 0) > 0, error, settleAt };
}

/**
 * M151 — the cart→intent LINK, the DB half. The Stripe half (cancel the predecessor, refuse if it
 * captured) is `lib/supersede.ts`; the verdict is `lib/live-intent.ts`. Read the migration header
 * (`20260905000000_m151_live_payment_intent.sql`) for why the fact exists at all.
 *
 * Every helper here is a query SHAPE — one predicate, one payload — and each is pinned by
 * `lock.test.ts` and a `verify:slice` mutant, because the predicate IS the rule.
 */

/** The intent the cart currently names, or null. Read under the caller's own lock. */
export async function readLiveIntent(cartId: string): Promise<string | null> {
  const db = serviceClient();
  const { data, error } = await db
    .from("qr_carts")
    .select("live_payment_intent_id")
    .eq("id", cartId)
    .maybeSingle();
  if (error) throw error;
  return data?.live_payment_intent_id ?? null;
}

/**
 * The intent THIS attempt minted, or null — scoped to the seat and era, so a client exit from a
 * superseded tab reads nothing and cancels nothing that is not its own (M124's discriminator is
 * the intent id, but the way in is still the attempt that owns the lock).
 */
export async function readLiveIntentFor(
  cartId: string,
  uid: string,
  era: string | null,
): Promise<string | null> {
  if (!era) return null;
  const db = serviceClient();
  const { data, error } = await db
    .from("qr_carts")
    .select("live_payment_intent_id")
    .eq("id", cartId)
    .eq("locked_by", uid)
    .eq("locked_at", era)
    .maybeSingle();
  if (error) throw error;
  return data?.live_payment_intent_id ?? null;
}

/**
 * Name the intent this attempt just minted. Scoped to the seat AND the era that minted it, and
 * only where the link is null or ALREADY this intent — Stripe idempotency can hand two same-era
 * requests one intent, and the second must not read as a conflict. Zero rows means the lock moved
 * between the mint and this write: the caller cancels the intent it minted and refuses.
 *
 * `intentId` is Stripe-generated and server-side — never a client string — so the interpolated
 * `.or()` carries no injection surface (the same argument `acquireCartLock` makes for `uid`).
 */
export async function linkPaymentIntent(
  cartId: string,
  uid: string,
  era: string,
  intentId: string,
): Promise<{ linked: boolean; error: ReleaseError }> {
  const db = serviceClient();
  const { count, error } = await db
    .from("qr_carts")
    .update({ live_payment_intent_id: intentId }, { count: "exact" })
    .eq("id", cartId)
    .eq("locked_by", uid)
    .eq("locked_at", era)
    .or(`live_payment_intent_id.is.null,live_payment_intent_id.eq.${intentId}`);
  return { linked: (count ?? 0) > 0, error };
}

/**
 * Drop the link to ONE intent — after the successor has made it unusable at Stripe. Keyed on the
 * intent id and nothing else: a late caller naming an intent the cart no longer holds matches
 * zero rows, which is the whole point of keying on a distinct token rather than an era.
 */
export async function unlinkPaymentIntent(cartId: string, intentId: string): Promise<ReleaseError> {
  const db = serviceClient();
  const { error } = await db
    .from("qr_carts")
    .update({ live_payment_intent_id: null })
    .eq("id", cartId)
    .eq("live_payment_intent_id", intentId);
  return error;
}

/**
 * The intent is TERMINAL (Stripe said `payment_intent.canceled`): clear the pin AND the link in ONE
 * statement, keyed on the intent — and NOTHING ELSE.
 *
 * ⚠️ THE LOCK IS DELIBERATELY NOT IN THIS PAYLOAD (blind adversarial pass on #257, CRITICAL 4). A
 * successor cancels its predecessor at Stripe and only THEN drops the link (`supersedeCartIntent`,
 * in that order, because the cancel can refuse). Stripe dispatches `payment_intent.canceled` the
 * moment the cancel lands, so this handler can run in the window before the successor's unlink —
 * the row still names the predecessor, this predicate matches, and a payload that also nulled the
 * lock would null the SUCCESSOR's lock: its `linkPaymentIntent` (scoped to its era) then matches
 * zero rows, it cancels the intent it just minted, and the only diner checking out is told
 * "Someone at your table is checking out". The first draft's docblock claimed the intent key made
 * a successor unreachable; the key protects the successor's LINK, not its lock, which the row
 * carries under a different column. So the lock is left to whoever holds it — the era-scoped
 * client exits and the 5-minute TTL — and only the two intent-bound facts are cleared here.
 *
 * Best-effort at the call site (a late delivery matching zero rows is the normal case, not an
 * error).
 */
export async function releaseByIntent(
  cartId: string,
  intentId: string,
): Promise<{ released: boolean; error: ReleaseError }> {
  const db = serviceClient();
  const { count, error } = await db
    .from("qr_carts")
    .update(
      {
        promo_granted_cents: null,
        live_payment_intent_id: null,
      },
      { count: "exact" },
    )
    .eq("id", cartId)
    .eq("live_payment_intent_id", intentId);
  return { released: (count ?? 0) > 0, error };
}
