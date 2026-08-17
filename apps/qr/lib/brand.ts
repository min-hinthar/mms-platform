/**
 * W22r — the restaurant's identity, ONCE (owner: receipts/emails/tracking "polished as delivery
 * app with restaurant logos, addresses, contact information"). Every string here is copied
 * VERBATIM from the delivery repo's production constants (src/lib/email/constants.ts,
 * src/lib/constants/kitchen.ts, SiteFooter) — the single source the owner already runs in
 * production. Nothing here is invented; notably there are NO business hours anywhere in either
 * repo, so none are offered (fabricating hours would be the exact honesty violation the design
 * language forbids).
 *
 * Scattered literals this module replaces going forward: the pickup sheet's abbreviated address,
 * the refund copy's phone. Surfaces adopt these constants as they're touched — no big-bang sweep.
 */

export const BRAND_NAME = "Mandalay Morning Star";

/** The full street address (delivery repo BUSINESS_ADDRESS / KITCHEN_COORDS, verbatim). */
export const BRAND_ADDRESS = "750 Terrado Plaza, Suite 33, Covina, CA 91723";

/** Public phone — displayed and dialable forms (delivery repo SiteFooter, verbatim). */
export const BRAND_PHONE_DISPLAY = "(626) 665-5317";
export const BRAND_PHONE_TEL = "+16266655317";

/** Public contact inbox (delivery repo EMAIL_FROM/REPLY_TO/footer, verbatim). */
export const BRAND_EMAIL = "admin@mandalaymorningstar.com";

/** Social profiles (delivery repo email BrandFooter, verbatim). */
export const BRAND_INSTAGRAM = "https://www.instagram.com/mandalays.morningstar/";
export const BRAND_FACEBOOK = "https://www.facebook.com/MandalayMorningStarLA/";
