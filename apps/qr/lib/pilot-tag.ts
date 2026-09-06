/**
 * P5 — the pilot's ONE tag, and the ONE normalizer that makes it comparable.
 *
 * Pure (no `server-only`, no DB, no React) so the money-path routes, the nightly sheet and the tests
 * share one rule. `pilot.ts` holds the reads; this holds the naming.
 *
 * WHY A NORMALIZER RATHER THAN `cart.promo_code` STRAIGHT ONTO THE EVENT. The analytics property is
 * what someone types into a PostHog filter two weeks from now, and a filter is exact-match: a code
 * reported once as `PILOT15`, once as `pilot15` and once as `""` is three campaigns, one of which is
 * a phantom. Today `applyPromo` is the only writer of `qr_carts.promo_code` and it uppercases
 * (`cart.ts` — `const normalized = input.code.toUpperCase()`), so this is currently a no-op on the
 * happy path. It is not decoration: OPEN-ITEMS **P2e** exists precisely because a second writer is
 * coming (P3's staff apply and the clear-for-merge it names), and the one thing a reporting property
 * must never inherit is whatever shape the newest writer happened to use. The empty string is the
 * case that actually bites — `""` is not a promo, and a column that can hold it must not be allowed
 * to report it as one.
 *
 * ⚠️ THIS IS AN ANALYTICS TAG AND NOTHING ELSE. It never authorizes, never prices, and is never read
 * back to decide anything: `mms_promo_check` / `mms_promo_discount` remain the only authorities on
 * what a code is worth, and `promo_redemptions` remains the only record that one was spent. A
 * normalizer that started gating would be a client-influenced string on the money path.
 */

/**
 * The pilot's code (`docs/PILOT_PLAN.md` §2 · D2). Named here so the nightly sheet, the printed
 * runbook and any later filter read one binding — the row itself is DATA that P3 inserts, and this
 * constant does not create it, authorize it, or assert it exists.
 */
export const PILOT_PROMO_CODE = "PILOT15";

/**
 * The reportable form of a cart's promo code: upper-cased, trimmed, and `null` for anything that is
 * not a code — an absent column, a blank string, or whitespace.
 *
 * Returning `null` rather than omitting the property is deliberate: an absent property and "no promo"
 * are indistinguishable in a PostHog filter, so every event on the money path carries the key and
 * says explicitly that there was no code.
 */
export function promoTag(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed.toUpperCase();
}

/** Is this cart's code the pilot's? Used by the nightly sheet's copy, never by a gate. */
export function isPilotCode(raw: string | null | undefined): boolean {
  return promoTag(raw) === PILOT_PROMO_CODE;
}
