/**
 * W13 — the ONE image-URL containment guard, shared by every server view that hands a photo URL
 * to the client. Two reasons it must be airtight, both pinned red-first (lib/media-url.test.ts):
 *
 *  1. `next/image` THROWS AT RENDER on a non-allowlisted host (next.config.ts allows only the two
 *     Supabase projects) — one bad DB row would crash the whole surface, not just its thumb.
 *  2. The CSP `img-src` mirrors the same boundary — a URL that slips past here is silently blocked
 *     by the browser anyway, so passing it through only manufactures broken images.
 *
 * Accepts: site-relative paths ("/…") and `https://<anything>.supabase.co/…` (either project —
 * menu photos still hotlink the delivery bucket until W2a migrates them). Everything else — http:,
 * data:, protocol-relative, foreign hosts, supabase.co lookalikes — answers null and the UI falls
 * to the designed PhotoPlaceholder. Matches the guard grocery.ts has carried since W4b.
 */
export function safeImageUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // "/x" is site-relative; "//host/x" is PROTOCOL-relative — the browser resolves it to
  // https://host/x, a foreign-origin escape the W4b inline guard missed (caught red-first here).
  const siteRelative = raw.startsWith("/") && !raw.startsWith("//");
  return siteRelative || /^https:\/\/[^/]+\.supabase\.co\//.test(raw) ? raw : null;
}

/**
 * ⚠️ W16d — `displayImageUrl` IS GONE, and it must not come back. It layered a
 * `endsWith("/fallback.jpg") → null` filter on top of the containment above, on the W13 assumption
 * that those rows pointed at ONE generic stock image standing in for missing photography.
 *
 * THE ASSUMPTION WAS WRONG. The owner asked why dishes like Kyay-O had lost their photos; probing
 * the live bucket settled it: every `menu-photos/<id>/fallback.jpg` is a DISTINCT real photo of
 * that dish (different byte sizes and etags per id; the sibling `photo.jpg` some rows were assumed
 * to have 404s). The filename is just the convention the delivery app uploaded under. So the
 * filter was hiding ~28 real dish photos behind the placeholder on every diner surface at once —
 * the menu grid, the item sheet hero, Start-here, favorites, the cart and bill thumbs, and order
 * history. The kiosk, which never imported the filter, had been showing those same photos the
 * whole time — live evidence against the assumption.
 *
 * Containment (`safeImageUrl`) is the only rule left: it is about what `next/image` and the CSP
 * will accept, which is a real boundary. "Does this dish have a good photo?" is a DATA question —
 * a row with no photo carries NULL and still gets the designed PhotoPlaceholder.
 */
