import "server-only";
import { cookies } from "next/headers";
import { serverClient, serviceClient } from "@mms/db/server";
import { CART_LOCK_TTL_MS, SETTLE_TTL_MS } from "./lock-ttl";
import type { LineState } from "./permissions";
import {
  SESSION_RENEW_THRESHOLD_MS,
  sessionExpiryFromNow,
  sessionRenewBeforeIso,
} from "./session-ttl";

/**
 * Slide a still-active session's expiry forward once it's into the back half of its window — the
 * shared renewal both the cart- and session-scoped guards call (bugfix: the hard 4h TTL stranded
 * in-use dine-in tables behind a 403 the client showed as "Couldn't add that"). The JS pre-check
 * skips the round-trip on the common plenty-of-window path; the WHERE `.lt("expires_at", cutoff)`
 * makes concurrent renewals race-clean (once one commits the fresh expiry the others no-op, so a
 * multi-phone realtime fan-out can't burst N redundant writes). Non-fatal — never blocks the request.
 */
async function maybeRenewSession(
  db: ReturnType<typeof serviceClient>,
  sessionId: string,
  expiresAt: string,
): Promise<void> {
  if (new Date(expiresAt).getTime() - Date.now() >= SESSION_RENEW_THRESHOLD_MS) return;
  const { error } = await db
    .from("table_sessions")
    .update({ expires_at: sessionExpiryFromNow() })
    .eq("id", sessionId)
    .eq("status", "active")
    .lt("expires_at", sessionRenewBeforeIso());
  if (error) console.error("[authz] session renewal failed", error.message);
}

/**
 * The ONE authorization guard (RED-TEAM standard #2: "every mutation authorizes itself").
 * Server Actions and route handlers are public POST endpoints — IDOR by default — so every path
 * that reads or mutates a cart calls through here first.
 *
 * Identity is the diner's anonymous-auth uid, read from the SSR cookie session and VERIFIED by
 * `getUser()` (not a client-asserted id). Membership is data: the uid must have a `session_members`
 * row for the cart's session, and that session must be active (mirrors the `is_member` RLS fn in
 * 20260618000000_qr_platform_init.sql). Service-role does the membership lookup so RLS can't hide
 * the row from us; the *authorization decision* is ours.
 */

/**
 * W9b — a STABLE machine-readable discriminator. `status` alone can't separate "this cart was
 * fulfilled" from "you aren't a member": both are 403. Any UI that branches on WHY authorization
 * failed (the settlement board routes to the receipt on `cart_closed` and only on `cart_closed`)
 * must key on this — never on `message`, which is human copy and free to change.
 */
export type AuthzCode =
  | "unauthenticated"
  | "no_cart"
  | "cart_closed"
  | "session_expired"
  | "not_member"
  | "no_item"
  /** W10a — the answer is UNKNOWABLE: auth/DB transport failed (paused project, outage). Not a
   *  verdict about the caller — routes map it to 503 + honest we-are-down copy, never 401/404. */
  | "unavailable";

/** Distinguishes 401 (no/!invalid session) from 403 (valid diner, not a member) from 503 (WE are
 *  unreachable — W10a) for route mapping. */
export class AuthzError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403 | 404 | 503,
    readonly code?: AuthzCode,
  ) {
    super(message);
    this.name = "AuthzError";
  }
}

/**
 * W10a — was this Supabase error a TRANSPORT failure (our platform unreachable — the paused-project
 * incident) rather than a verdict? supabase-js surfaces network failures as
 * `AuthRetryableFetchError` (auth) or a fetch TypeError/abort bubbled into `error.message`
 * (PostgREST). The live 2026-08-01 pause reproduced both. Deciding wrong in the "verdict" direction
 * tells a diner mid-meal their session is invalid and pushes them into futile re-scan loops — so a
 * recognized transport shape always wins over the status-shaped fallback.
 */
export function isTransportFailure(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const name = (e as { name?: string }).name ?? "";
  const msg = (e as { message?: string }).message ?? "";
  const status = (e as { status?: number }).status;
  if (name === "AuthRetryableFetchError") return true;
  // Any 5xx from the auth/REST gateway is infrastructure, not a verdict — Supabase has used
  // non-standard codes for paused projects (e.g. 540), and auth-js only wraps 500-504/520-530
  // into AuthRetryableFetchError (pre-PR review).
  if (typeof status === "number" && (status === 0 || status >= 500)) return true;
  return /fetch failed|Failed to fetch|network|socket|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|timed? ?out|aborted/i.test(
    msg,
  );
}

/** The ONE "we cannot see it" answer. Exported because `getCartView` needs to give the same one:
 *  `/cart` branches on `e instanceof AuthzError && e.code === "unavailable"` to reach the outage
 *  screen, and a bare `Error` from anywhere else falls to the arm that tells the diner their order
 *  "isn't available on this device" — the audit's worst-rated copy, which W10a exists to have
 *  deleted. One sentence, one code, one construction site. */
export const UNAVAILABLE = () =>
  new AuthzError("We’re having trouble on our end — try again in a moment", 503, "unavailable");

/** Verify the caller's anonymous-auth session from cookies → their `auth.uid()`. */
export async function getCallerUid(): Promise<string> {
  const supa = serverClient(await cookies());
  const {
    data: { user },
    error,
  } = await supa.auth.getUser();
  // W10a — an auth TRANSPORT failure is not "not signed in": during the paused-project outage every
  // verified diner's request landed here and was told their session was invalid (audit HIGH).
  // Unknowable ≠ unauthenticated.
  if (error && isTransportFailure(error)) throw UNAVAILABLE();
  if (error || !user) throw new AuthzError("Not signed in", 401, "unauthenticated");
  return user.id;
}

export type CartAuthz = {
  uid: string;
  sessionId: string;
  /** The caller's role in this session (M3·P3.3a) — drives canMutateLine (host may edit any line). */
  role: "host" | "guest";
  /** The EFFECTIVE lock — true only while a pay-window lock is held AND still fresh (within the TTL),
   *  so an abandoned pay-screen auto-releases and never permanently freezes the cart. */
  locked: boolean;
  /** The seat holding the lock (null when not effectively locked) — for "X is checking out" + scoping. */
  lockedBy: string | null;
  /** The EFFECTIVE split-tender settlement freeze (M3·P3.3b) — true while a split is in flight AND
   *  fresh (within SETTLE_TTL). Like `locked` but TABLE-WIDE: every member's cart edit is frozen while
   *  the table pays. Mutually exclusive with `locked` (one freeze mode at a time — see acquireCartLock). */
  settling: boolean;
  /** The host that opened the settlement (null when not effectively settling). */
  settleBy: string | null;
  /** The session's mode, read from the SAME row that proved the session is active (M108). Callers
   *  that fork on dine-in vs to-go — the line's routing tag and, through it, its per-line tax — read
   *  it from here rather than re-reading `table_sessions`: a second read is a second chance to fail,
   *  and both callers that had one discarded its error and defaulted to `togo`, silently
   *  under-collecting tax at a real dine-in table. This read already fails CLOSED (503 above), so
   *  the fork can no longer be decided by an unreadable row. */
  mode: string;
};

/**
 * Authorize the caller against a cart: they must be a verified member of the cart's *active*
 * session. Returns the uid (for `by_seat` provenance), the session id, and the EFFECTIVE lock state
 * so the caller can additionally reject writes while a member holds the pay-window lock.
 */
export async function assertCartMember(cartId: string): Promise<CartAuthz> {
  const uid = await getCallerUid();
  const db = serviceClient();

  const { data: cart, error: cartErr } = await db
    .from("qr_carts")
    .select("session_id,locked,locked_at,locked_by,settle_at,settle_by,status")
    .eq("id", cartId)
    .maybeSingle();
  // W10a — a failed READ is not a missing cart: 404 "no_cart" on a transport failure told diners
  // their live order didn't exist (and /cart rendered "isn't available on this device") while the
  // DB was merely paused. The unknowable answer is 503, never a verdict.
  if (cartErr) throw UNAVAILABLE();
  if (!cart) throw new AuthzError("No such cart", 404, "no_cart");
  // A paid/cancelled cart is immutable — `mms_fulfill_order` flips status to 'paid', so this stops
  // any post-payment addItem/setQty/applyPromo from desyncing the fulfilled order (defense in depth).
  if (cart.status !== "open") throw new AuthzError("Cart is no longer open", 403, "cart_closed");

  // Effective lock: held AND fresh. A stale lock (a diner closed the pay tab) is ignored, so the
  // cart frees itself after the TTL — the next acquire takes it over. Same cutoff as lib/lock.ts.
  const lockedFresh =
    cart.locked &&
    cart.locked_at !== null &&
    new Date(cart.locked_at).getTime() > Date.now() - CART_LOCK_TTL_MS;
  // Effective settlement freeze (split-tender): a fresh settle_at means the table is paying — the
  // whole cart is read-only until fulfillment or the TTL frees an abandoned settlement.
  const settlingFresh =
    cart.settle_at !== null && new Date(cart.settle_at).getTime() > Date.now() - SETTLE_TTL_MS;

  const { data: sess, error: sessErr } = await db
    .from("table_sessions")
    .select("status,expires_at,mode")
    .eq("id", cart.session_id)
    .maybeSingle();
  if (sessErr) throw UNAVAILABLE(); // W10a — unknowable ≠ expired
  if (!sess || sess.status === "closed" || new Date(sess.expires_at) <= new Date())
    throw new AuthzError("Session is no longer active", 403, "session_expired");

  const { data: member, error: memberErr } = await db
    .from("session_members")
    .select("seat_id,role")
    .eq("session_id", cart.session_id)
    .eq("seat_id", uid)
    .maybeSingle();
  if (memberErr) throw UNAVAILABLE(); // W10a — unknowable ≠ non-member
  if (!member) throw new AuthzError("Not a member of this session", 403, "not_member");

  // Sliding renewal (bugfix: the 4h hard TTL stranded in-use dine-in tables). The session passed the
  // freshness check above, so any authorized touch slides expires_at forward — a table that's actually
  // being used never reaches the TTL; only a truly-idle session expires (then the mint sweeps it).
  await maybeRenewSession(db, cart.session_id, sess.expires_at);

  return {
    uid,
    sessionId: cart.session_id,
    role: member.role === "host" ? "host" : "guest",
    locked: lockedFresh,
    lockedBy: lockedFresh ? cart.locked_by : null,
    settling: settlingFresh,
    settleBy: settlingFresh ? cart.settle_by : null,
    mode: sess.mode,
  };
}

/**
 * Authorize the caller against a *session* (not a cart) — for membership-scoped mutations that
 * aren't a cart write (e.g. renaming your own seat for the presence guest list). Same rule as
 * is_member: a verified uid with a row in this active session. Returns the uid (the seat to scope
 * the write to — a member can only touch their OWN membership, never another seat's).
 */
export async function assertSessionMember(sessionId: string): Promise<{ uid: string }> {
  const uid = await getCallerUid();
  const db = serviceClient();

  const { data: sess, error: sessErr } = await db
    .from("table_sessions")
    .select("status,expires_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (sessErr) throw UNAVAILABLE(); // W10a — unknowable ≠ expired
  if (!sess || sess.status === "closed" || new Date(sess.expires_at) <= new Date())
    throw new AuthzError("Session is no longer active", 403, "session_expired");

  const { data: member, error: memberErr } = await db
    .from("session_members")
    .select("seat_id")
    .eq("session_id", sessionId)
    .eq("seat_id", uid)
    .maybeSingle();
  if (memberErr) throw UNAVAILABLE(); // W10a — unknowable ≠ non-member
  if (!member) throw new AuthzError("Not a member of this session", 403, "not_member");

  // Symmetric with assertCartMember: a table kept alive by presence/renames (not just cart writes)
  // also slides its expiry forward, so a chatty-but-not-ordering table doesn't expire mid-meal.
  await maybeRenewSession(db, sessionId, sess.expires_at);

  return { uid };
}

/** Same guard, keyed by a cart *line* id (resolves the owning cart first). Also returns the line's
 *  owner seat (`lineSeat`) and its `lineState` so a caller can apply canMutateLine (host-any /
 *  guest-own-only, draft-only for diners — S2.1a). */
export async function assertCartItemMember(
  cartItemId: string,
): Promise<
  CartAuthz & { cartId: string; lineSeat: string | null; lineState: LineState; comped: boolean }
> {
  const { data: item, error: itemErr } = await serviceClient()
    .from("qr_cart_items")
    .select("cart_id,by_seat,state,comped")
    .eq("id", cartItemId)
    .maybeSingle();
  if (itemErr) throw UNAVAILABLE(); // W10a — unknowable ≠ missing line
  if (!item) throw new AuthzError("No such cart item", 404, "no_item");
  return {
    ...(await assertCartMember(item.cart_id)),
    cartId: item.cart_id,
    lineSeat: item.by_seat ?? null,
    lineState: (item.state ?? "draft") as LineState,
    comped: item.comped ?? false,
  };
}
