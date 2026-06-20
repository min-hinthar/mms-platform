import "server-only";
import { cookies } from "next/headers";
import { serverClient, serviceClient } from "@mms/db/server";

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

/** Distinguishes 401 (no/!invalid session) from 403 (valid diner, not a member) for route mapping. */
export class AuthzError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403 | 404,
  ) {
    super(message);
    this.name = "AuthzError";
  }
}

/** Verify the caller's anonymous-auth session from cookies → their `auth.uid()`. */
export async function getCallerUid(): Promise<string> {
  const supa = serverClient(await cookies());
  const {
    data: { user },
    error,
  } = await supa.auth.getUser();
  if (error || !user) throw new AuthzError("Not signed in", 401);
  return user.id;
}

export type CartAuthz = { uid: string; sessionId: string; locked: boolean };

/**
 * Authorize the caller against a cart: they must be a verified member of the cart's *active*
 * session. Returns the uid (for `by_seat` provenance), the session id, and the lock state so the
 * caller can additionally reject writes while the host holds the lock.
 */
export async function assertCartMember(cartId: string): Promise<CartAuthz> {
  const uid = await getCallerUid();
  const db = serviceClient();

  const { data: cart } = await db
    .from("qr_carts")
    .select("session_id,locked,status")
    .eq("id", cartId)
    .maybeSingle();
  if (!cart) throw new AuthzError("No such cart", 404);
  // A paid/cancelled cart is immutable — `mms_fulfill_order` flips status to 'paid', so this stops
  // any post-payment addItem/setQty/applyPromo from desyncing the fulfilled order (defense in depth).
  if (cart.status !== "open") throw new AuthzError("Cart is no longer open", 403);

  const { data: sess } = await db
    .from("table_sessions")
    .select("status,expires_at")
    .eq("id", cart.session_id)
    .maybeSingle();
  if (!sess || sess.status === "closed" || new Date(sess.expires_at) <= new Date())
    throw new AuthzError("Session is no longer active", 403);

  const { data: member } = await db
    .from("session_members")
    .select("seat_id")
    .eq("session_id", cart.session_id)
    .eq("seat_id", uid)
    .maybeSingle();
  if (!member) throw new AuthzError("Not a member of this session", 403);

  return { uid, sessionId: cart.session_id, locked: cart.locked };
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

  const { data: sess } = await db
    .from("table_sessions")
    .select("status,expires_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (!sess || sess.status === "closed" || new Date(sess.expires_at) <= new Date())
    throw new AuthzError("Session is no longer active", 403);

  const { data: member } = await db
    .from("session_members")
    .select("seat_id")
    .eq("session_id", sessionId)
    .eq("seat_id", uid)
    .maybeSingle();
  if (!member) throw new AuthzError("Not a member of this session", 403);

  return { uid };
}

/** Same guard, keyed by a cart *line* id (resolves the owning cart first). */
export async function assertCartItemMember(
  cartItemId: string,
): Promise<CartAuthz & { cartId: string }> {
  const { data: item } = await serviceClient()
    .from("qr_cart_items")
    .select("cart_id")
    .eq("id", cartItemId)
    .maybeSingle();
  if (!item) throw new AuthzError("No such cart item", 404);
  return { ...(await assertCartMember(item.cart_id)), cartId: item.cart_id };
}
