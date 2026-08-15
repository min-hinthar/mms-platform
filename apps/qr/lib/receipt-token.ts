import "server-only";
import { randomBytes } from "crypto";
import { serviceClient } from "@mms/db/server";

/**
 * W7a (S1) — the durable receipt token: an opaque ≥256-bit bearer that resolves to ONE order's
 * receipt view, so the artifact outlives the 4h anon session TTL (and every other identity the
 * order's readers key on). The `mms_merge_tokens` pattern (lib/merge.ts): random `base64url`,
 * stored server-side, service-role only, TTL-bounded, revocable by deleting the row.
 *
 * The doctrine seam, stated plainly: `lib/orders.ts` guarantees that order ids / PaymentIntent
 * ids / #CODE are LOOKUPS, never credentials. This token is the one deliberate exception — a
 * purpose-minted bearer credential for exactly one order's receipt. What keeps that safe:
 *  - opaque + ≥256-bit (unguessable; never derived from the order id),
 *  - expiring (90 days — a receipt's useful life, ≫ the merge token's 24h),
 *  - scoped (one token → one order; the resolve predicate carries the expiry),
 *  - PII-free (the URL never carries an email or name),
 *  - only minted server-side for a caller ALREADY authorized on the order (earner/payer), or
 *    embedded in the receipt email sent to the address the diner themselves supplied.
 */

export const RECEIPT_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

// randomBytes(32).base64url = 43 chars; the shape gate keeps junk (and pathological long input)
// out of the query entirely.
const TOKEN_RE = /^[A-Za-z0-9_-]{40,64}$/;

export function isReceiptTokenShape(raw: unknown): raw is string {
  return typeof raw === "string" && TOKEN_RE.test(raw);
}

/**
 * Find-or-create the order's ONE durable token. Reuses a live token (the link a diner already
 * emailed themselves must not die under them); rotates only once the stored one has EXPIRED (an
 * expired link stays dead — rotation must never revive it under the old value). Best-effort:
 * null on any failure — the caller simply doesn't render the link (never a broken receipt).
 */
export async function mintReceiptToken(orderId: string): Promise<string | null> {
  try {
    const db = serviceClient();
    const { data: existing, error: readErr } = await db
      .from("mms_receipt_tokens")
      .select("token,expires_at")
      .eq("order_id", orderId)
      .maybeSingle();
    if (readErr) return null;
    if (existing && new Date(existing.expires_at).getTime() > Date.now()) {
      // SLIDING window on reuse (review MED): the email promises "works for 90 days", so a
      // re-send on day 89 must not embed a link that dies tomorrow. Extending a LIVE token never
      // revives an expired one — the rotate-only-after-expiry invariant holds. Best-effort: a
      // failed bump leaves the original expiry, which was already honest at mint time.
      await db
        .from("mms_receipt_tokens")
        .update({ expires_at: new Date(Date.now() + RECEIPT_TOKEN_TTL_MS).toISOString() })
        .eq("token", existing.token);
      return existing.token;
    }
    const token = randomBytes(32).toString("base64url");
    // Upsert on the UNIQUE order_id: replaces an expired row's token+expiry in one statement (a
    // concurrent double-mint just means the later write wins and both callers re-read a valid
    // link on their next ask — never two live tokens for one order).
    const { error } = await db.from("mms_receipt_tokens").upsert(
      {
        token,
        order_id: orderId,
        expires_at: new Date(Date.now() + RECEIPT_TOKEN_TTL_MS).toISOString(),
      },
      { onConflict: "order_id" },
    );
    if (error) return null;
    return token;
  } catch {
    return null; // best-effort — no link this time, the receipt view itself is unaffected
  }
}

/**
 * Resolve a presented token → its order id, or null. The WHOLE authorization is this predicate:
 * exact token match AND unexpired — there is no session, no uid, no other gate on the `?r=` view.
 */
export async function resolveReceiptOrder(rawToken: string): Promise<string | null> {
  if (!isReceiptTokenShape(rawToken)) return null;
  try {
    const db = serviceClient();
    const { data, error } = await db
      .from("mms_receipt_tokens")
      .select("order_id")
      .eq("token", rawToken)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (error) return null;
    return data?.order_id ?? null;
  } catch {
    return null;
  }
}
