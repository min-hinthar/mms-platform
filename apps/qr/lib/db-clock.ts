import "server-only";
import { serviceClient } from "@mms/db/server";

/**
 * #362 (blind pass 9) — the DATABASE clock (`mms_now()`, ISO), for a stamp a CLIENT compares with
 * another stamp.
 *
 * /menu decides whether a dish is sold out from the freshest of three readings (`freshestSoldOut`,
 * `lib/dish-sold-out.ts`): the catalog render, the cart view and a refusal. The cart view is stamped
 * with `mms_now()` (`getCartView`'s `dbNow`, read before its lines); the render and the refusal were
 * stamped with the APP server's `Date.now()` — a second machine's clock, and on serverless a
 * different instance each request. Comparing across them ordered readings by clock skew whenever
 * two landed close together. Every reading now takes this one clock, so "freshest" is a comparison
 * on one timeline.
 *
 * ADVISORY, like `getCartView`'s read: a failed `mms_now()` falls back, LOGGED, to this server's clock
 * at the same point — a stamp is a freshness hint for the menu's sold-out mark, never a gate (the
 * charge boundary re-reads availability regardless), so an unreadable clock must not fail the
 * request it rides on.
 */
export async function dbClockIso(context: string): Promise<string> {
  try {
    const { data, error } = await serviceClient().rpc("mms_now");
    if (!error && typeof data === "string" && Number.isFinite(Date.parse(data))) return data;
    console.error(`[db-clock] ${context}: mms_now unreadable — stamped on the app clock`, {
      error: error?.message,
    });
  } catch (e) {
    console.error(`[db-clock] ${context}: mms_now threw — stamped on the app clock`, e);
  }
  return new Date().toISOString();
}
