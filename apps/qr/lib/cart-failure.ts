import "server-only";
import { serviceClient } from "@mms/db/server";
import { getCallerUid } from "./authz";
import type { CartUnavailable } from "./cart-unavailable";
import { CART_LOCK_TTL_MS, SETTLE_TTL_MS } from "./lock-ttl";

/**
 * W9d — WHY a cart the shopper is holding stopped working, safe to tell them.
 *
 * The grocery page catches every `assertCartMember` throw and blames the radio ("check your
 * connection"), so a shopper whose basket was paid for on another tab, or whose session aged out,
 * taps Retry forever against a cart that will never open again. To say the true thing we need the
 * failure REASON on the client.
 *
 * ⚠️ The reason cannot simply be forwarded from `AuthzError.code`, and W9c is the war story.
 * `assertCartMember` raises `cart_closed` and `session_expired` from a service-role `qr_carts` /
 * `table_sessions` read that runs BEFORE the membership check — so those codes are answerable for a
 * cart the caller has nothing to do with. A Server Action that returned them verbatim would be a
 * lifecycle oracle: POST any uuid, read the reason, learn whether that table's order exists and
 * whether it has been paid.
 *
 * So this asks membership FIRST, on its own, and every non-member gets `unreadable` — the same
 * answer a nonexistent cart gives. Only a caller with a `session_members` row for the cart's session
 * is told anything, and membership is a fact they already possess. Note the membership lookup
 * deliberately does NOT require the session to be active: a member of an EXPIRED session is still a
 * member, and telling THEM their session ended is the whole point.
 *
 * The `CartUnavailable` type + `isTerminal` predicate live in `cart-unavailable.ts` (client-safe —
 * the /grocery page needs them at render time, and this module is `server-only`).
 *
 * Known, accepted residual: an unknown cart answers after one query and a real-but-not-yours cart
 * after two — a timing side channel on cart EXISTENCE (never state). Accepted because cart ids are
 * unguessable uuids and serverless latency jitter swamps one indexed read; the string oracle is the
 * one that matters, and it is sealed.
 */
export type { CartUnavailable } from "./cart-unavailable";

export async function whyCartUnavailable(cartId: string): Promise<CartUnavailable> {
  let uid: string;
  try {
    uid = await getCallerUid();
  } catch {
    // No verified anon session — we can't establish membership, so we can't say anything. (The
    // client's own mint is the recovery for this; it is not a cart fact.)
    return "unreadable";
  }

  const db = serviceClient();
  const { data: cart, error: cartErr } = await db
    .from("qr_carts")
    .select("session_id,status,locked,locked_at,settle_at")
    .eq("id", cartId)
    .maybeSingle();
  // A read FAILURE and an unknown cart both fall to the generic answer: one is a transient we must
  // not dress up as terminal, the other is the probe we refuse to answer. Same string either way.
  if (cartErr) {
    console.error("[cart-failure] cart read failed", cartErr);
    return "unreadable";
  }
  if (!cart) return "unreadable";

  // ── The gate. Everything below this line is disclosed ONLY to a proven member. ──
  const { data: member, error: memberErr } = await db
    .from("session_members")
    .select("seat_id")
    .eq("session_id", cart.session_id)
    .eq("seat_id", uid)
    .maybeSingle();
  if (memberErr) {
    console.error("[cart-failure] membership read failed", memberErr);
    return "unreadable";
  }
  if (!member) return "unreadable";

  if (cart.status === "paid") return "paid";
  if (cart.status !== "open") return "cancelled";

  const { data: sess, error: sessErr } = await db
    .from("table_sessions")
    .select("status,expires_at")
    .eq("id", cart.session_id)
    .maybeSingle();
  if (sessErr) {
    console.error("[cart-failure] session read failed", sessErr);
    return "unreadable";
  }
  if (!sess || sess.status === "closed" || new Date(sess.expires_at) <= new Date())
    return "session_expired";

  // The cart is open and the session is live, so the block is one of the two transient freezes.
  // Both are read from the SAME columns assertCartMember uses; a freeze whose TTL has lapsed is not
  // a freeze, so an abandoned pay tab reports `unreadable` (Retry) rather than a permanent lock.
  if (cart.settle_at !== null && new Date(cart.settle_at).getTime() > Date.now() - SETTLE_TTL_MS)
    return "settling";
  if (
    cart.locked &&
    cart.locked_at !== null &&
    new Date(cart.locked_at).getTime() > Date.now() - CART_LOCK_TTL_MS
  )
    return "locked";

  return "unreadable";
}
