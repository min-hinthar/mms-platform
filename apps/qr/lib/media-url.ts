/**
 * W13 — the ONE image-URL containment guard, shared by every server view that hands a photo URL
 * to the client. Two reasons it must be airtight, both pinned red-first (lib/media-url.test.ts):
 *
 *  1. `next/image` THROWS AT RENDER on a non-allowlisted host (next.config.ts allows only the two
 *     Supabase projects) — one bad DB row would crash the whole surface, not just its thumb.
 *  2. The CSP `img-src` mirrors the same boundary — a URL that slips past here is silently blocked
 *     by the browser anyway, so passing it through only manufactures broken images.
 *
 * Accepts: site-relative paths ("/…") and https on one of the TWO project hosts below. Everything
 * else — http:, data:, protocol-relative, foreign hosts, supabase.co lookalikes, and any OTHER
 * Supabase tenant — answers null and the UI falls to the designed PhotoPlaceholder.
 */

/**
 * ⚠️ These must stay in lockstep with `next.config.ts` remotePatterns and the `img-src` list in
 * `proxy.ts` — this function's whole contract is "what those two will accept".
 *
 * W16d review MED: the old test was `[^/]+\.supabase\.co`, i.e. ANY tenant. Supabase projects are
 * free to create, so a row pointing at a third project passed containment and then threw inside
 * `next/image` at render — the exact crash this guard exists to prevent, and newly load-bearing
 * now that the kiosk and the staff register lean on it (both used to pass raw values).
 * (Menu photos still hotlink the DELIVERY bucket until W2a migrates them, hence two hosts.)
 */
const ALLOWED_IMAGE_HOSTS = [
  "https://fasnpdhtvqtzjlvruqcu.supabase.co/", // QR
  "https://ukuzkhuppqwtrdkjqrkv.supabase.co/", // delivery (menu photography lives here)
] as const;

export function safeImageUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // "/x" is site-relative; "//host/x" is PROTOCOL-relative — the browser resolves it to
  // https://host/x, a foreign-origin escape the W4b inline guard missed (caught red-first here).
  const siteRelative = raw.startsWith("/") && !raw.startsWith("//");
  const allowedHost = ALLOWED_IMAGE_HOSTS.some((h) => raw.startsWith(h));
  return siteRelative || allowedHost ? raw : null;
}

/**
 * ⚠️ W16d — `displayImageUrl` IS GONE, and it must not come back. It layered a
 * `endsWith("/fallback.jpg") → null` filter on top of the containment above, on the W13 assumption
 * that those rows pointed at ONE generic stock image standing in for missing photography.
 *
 * THE ASSUMPTION WAS WRONG. The owner asked why dishes like Kyay-O had lost their photos; probing
 * the live bucket settled it: every `menu-photos/<id>/fallback.jpg` is a DISTINCT real photo of
 * that dish (different byte sizes and etags per id; the sibling `photo.jpg` some rows were assumed
 * to have 404s). The filename is just the convention the delivery app uploaded under. MEASURED
 * against prod (66 active menu_items): 34 rows carry a `fallback.jpg` — every one a real photo the
 * filter was hiding on every diner surface at once (menu grid, item-sheet hero, Start-here,
 * favorites, cart + bill thumbs, order history) — 29 carry another filename, and just 3 are
 * genuinely NULL. The kiosk, which never imported the filter, had been showing those same photos
 * the whole time: live evidence against the assumption.
 *
 * Containment (`safeImageUrl`) is the only rule left: it is about what `next/image` and the CSP
 * will accept, which is a real boundary. "Does this dish have a good photo?" is a DATA question —
 * a row with no photo carries NULL and still gets the designed PhotoPlaceholder.
 *
 * The filter must not creep back in at a CALL SITE either (the mappers in menu/page.tsx, cart.ts,
 * favorites.ts, rewards.ts). `scripts/check-photo-filter.mjs` bans that repo-wide, because a test
 * on this module alone would stay green while a caller re-added it — the review caught exactly
 * that gap in the first cut of this slice.
 */
