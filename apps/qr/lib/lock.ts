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
export async function acquireCartLock(cartId: string, uid: string): Promise<LockResult> {
  const db = serviceClient();
  const cutoff = new Date(Date.now() - CART_LOCK_TTL_MS).toISOString();
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
    .update(
      { locked: true, locked_at: new Date().toISOString(), locked_by: uid },
      { count: "exact" },
    )
    .eq("id", cartId)
    .eq("status", "open")
    .or(`locked.eq.false,locked_by.eq.${uid},locked_at.lte.${cutoff}`)
    .or(`settle_at.is.null,settle_at.lte.${settleCutoff}`);
  if (error) throw error;
  if ((count ?? 0) > 0) return "acquired";
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
  if (statusError) return "unavailable";
  return cart?.status === "open" ? "held_by_other" : "closed";
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
