import "server-only";

/**
 * The app's canonical public origin, env-resolved — the SINGLE source of truth for absolute URLs:
 *   1. `NEXT_PUBLIC_SITE_URL` (explicit override; trailing slashes trimmed)
 *   2. `VERCEL_PROJECT_PRODUCTION_URL` (Vercel's stable production host)
 *   3. the prod domain fallback.
 *
 * Consumed by email links (`lib/email.tsx`) AND the root `metadataBase` (W7 brand kit) that resolves
 * relative OG / twitter / manifest asset URLs to absolute ones. Kept in ONE place so the two can't drift.
 * `server-only`: `VERCEL_PROJECT_PRODUCTION_URL` is a server env var (undefined on the client), so a
 * client import would silently skip step 2 and mis-resolve — this makes that a build error instead.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) {
    const trimmed = explicit.replace(/\/+$/, "");
    // Guarantee a scheme: `metadataBase: new URL(siteUrl())` throws (500s EVERY route) on a bare host,
    // and email links would be malformed — so a schemeless override is normalized to https, not trusted.
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  }
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (prod) return `https://${prod}`;
  return "https://qr.mandalaymorningstar.com";
}
