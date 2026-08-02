/**
 * The Stripe idempotency key for one payer's share PaymentIntent (M3·P3.3b).
 *
 * W10d (M39) — this exists as its own pure function because the key was WRONG in a way that dead-ended
 * a declined payer, and the fault was invisible inside the route.
 *
 * The key was `share_<id>_<amount>`. Stripe caches an idempotency key's RESPONSE for 24h, so re-issuing
 * a create under a key it has already seen replays the original PaymentIntent rather than minting one.
 * That is exactly what we want for a double-tap. It is exactly what we do NOT want after the route has
 * just CANCELED that PaymentIntent:
 *
 *   1. payer authorizes with no tip → key `share_X_2400` → PI_1
 *   2. their card is declined → the share is marked `failed`, still pointing at PI_1
 *   3. they refresh (or the board remounts) → SharePay re-mints at the SAME tip → the route cancels
 *      PI_1, calls create under `share_X_2400` again, and Stripe hands back **PI_1 — now canceled**
 *   4. `confirmPayment` on a canceled intent fails, forever, for the full 24h key window
 *
 * The only escape was changing the tip, which no copy anywhere suggests. So the key has to identify
 * *which* attempt it is, not just which share and amount. Including the PaymentIntent being REPLACED
 * does that exactly: it reads as "the intent that supersedes PI_X for this share at this amount".
 *
 *   • first mint (nothing to replace)      → `share_X_2400_new`   → PI_1
 *   • retry after PI_1                     → `share_X_2400_pi_1`  → PI_2   (a genuinely new key)
 *   • double-tap of either                 → identical inputs, identical key → the same PI back
 *
 * Double-tap protection is preserved because two concurrent requests read the same `previousIntentId`
 * (neither has claimed the row yet), so they derive the same key and Stripe returns one intent.
 */
export function shareIntentKey(
  shareId: string,
  amountCents: number,
  previousIntentId: string | null,
): string {
  // The two cases carry DIFFERENT prefixes rather than sharing a namespace with a sentinel value. A
  // bare sentinel (`…_new`) is only safe as long as no intent id can equal it — true today, since
  // Stripe's are `pi_…`, but that is an argument about someone else's format, not a property of this
  // function. `first` vs `after-<id>` cannot collide for any input at all, which is the version a test
  // can actually pin. (The first draft used the sentinel and its own test caught it.)
  const attempt = previousIntentId === null ? "first" : `after-${previousIntentId}`;
  return `share_${shareId}_${amountCents}_${attempt}`;
}
