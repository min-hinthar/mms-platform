/**
 * W21 (owner: "pickup should need name and phone number") — the pickup contact gate, pure.
 *
 * Why this is a module and not inline route code: it REFUSES a payment (create-intent returns 400
 * until the contact is complete), and a refusal rule on the charge boundary is authority logic —
 * it lives where a test (and a verify:slice mutant) can watch it fail, not in a route with no
 * runner. The client runs the SAME predicate for instant feedback; the route's run is the
 * load-bearing one (a hostile/raw POST can't skip it).
 *
 * Scope is deliberately PICKUP-only: dine-in's identity is the table, and scango is a self-scanned
 * walk-out with no counter handoff to call — requiring a phone there would gate a payment on data
 * nobody will ever use. The phone is stored on the CART (qr_carts.customer_phone, CHECK-bounded)
 * for staff contact about a live order; never analytics (PII), never a money value.
 */

/** Transport shape: digits with common separators, bounded 7–20 chars (mirrors the column CHECK). */
export const PICKUP_PHONE_RE = /^[0-9+(). -]{7,20}$/;

/**
 * A real phone needs at least 7 DIGITS — the shape alone would accept "-------" (7 chars, 0
 * digits). The digit floor is the rule a separator-heavy fake fails.
 */
export function validPickupPhone(phone: string): boolean {
  const p = phone.trim();
  if (!PICKUP_PHONE_RE.test(p)) return false;
  return (p.match(/[0-9]/g) ?? []).length >= 7;
}

/**
 * What's missing from the pickup contact, in ask order (name first — it's the top field), or null
 * when complete. One predicate, both ends: the client gates the Pay tap on it and create-intent
 * refuses on it, so their answers cannot drift.
 */
export function pickupContactMissing(name: string, phone: string): "name" | "phone" | null {
  if (name.trim().length === 0) return "name";
  if (!validPickupPhone(phone)) return "phone";
  return null;
}
