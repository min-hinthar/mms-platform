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

export type LockResult = "acquired" | "held_by_other" | "closed";

/**
 * Atomically acquire the lock for `uid` (called by create-intent at the pay boundary). ONE conditional
 * UPDATE: the cart must be OPEN and either unlocked, already held by THIS seat (re-acquire after a
 * refresh / double-tap — so the payer is never told "someone's checking out" by their own lock), or
 * STALE (TTL elapsed → take over an abandoned lock). Postgres re-evaluates the WHERE under the row lock,
 * so two members reaching checkout at once can't both win. The timestamp basis is the app clock (same
 * `Date.now()` the effective-lock check uses) so there's no DB/app skew at the boundary.
 */
export async function acquireCartLock(cartId: string, uid: string): Promise<LockResult> {
  const db = serviceClient();
  const cutoff = new Date(Date.now() - CART_LOCK_TTL_MS).toISOString();
  const { data } = await db
    .from("qr_carts")
    .update({ locked: true, locked_at: new Date().toISOString(), locked_by: uid })
    .eq("id", cartId)
    .eq("status", "open")
    .or(`locked.eq.false,locked_by.eq.${uid},locked_at.lte.${cutoff}`)
    .select("id");
  if (data && data.length > 0) return "acquired";
  // 0 rows: closed, or a FRESH lock held by another. Read the status to message it honestly.
  const { data: cart } = await db.from("qr_carts").select("status").eq("id", cartId).maybeSingle();
  return cart?.status === "open" ? "held_by_other" : "closed";
}

/**
 * Release the lock. `uid` scopes it to the locker (the "Edit order" path — a member can only release
 * THEIR OWN lock, never unlock another payer mid-checkout). Pass `null` for an unconditional release
 * (the webhook on a declined payment — the charge failed, so free the cart for everyone). Idempotent.
 */
export async function releaseCartLock(cartId: string, uid: string | null): Promise<void> {
  const db = serviceClient();
  let q = db
    .from("qr_carts")
    .update({ locked: false, locked_at: null, locked_by: null })
    .eq("id", cartId);
  if (uid !== null) q = q.eq("locked_by", uid);
  await q;
}
