/**
 * The price bounds a MANAGER may set from the console, named ONCE and zod-free so the client can
 * read them without the schema bundle (menu-5). `setMenuPriceInput` (schemas.ts) bounds the
 * Server Action on these; the `menu_items_base_price_cents_bounds` column CHECK is the DB's copy;
 * `apps/qr/lib/menu-price-draft.ts` reads them to say WHY a draft is refused before the tap. The
 * 25¢ floor clears today's catalog floor ($2.00); the $5,000 ceiling makes a fat-fingered extra
 * zero a refusal instead of a money incident.
 */
export const PRICE_MIN_CENTS = 25;
export const PRICE_MAX_CENTS = 500000;
