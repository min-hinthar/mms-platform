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
