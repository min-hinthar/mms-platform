// W7 shell — the Twitter/X card reuses the exact Open Graph render (one lockup, one source of truth).
// Re-exporting the default + route config is all Next needs to serve it at /twitter-image.
export { default, alt, size, contentType } from "./opengraph-image";
// Match the OG route's explicit static config (re-exports don't carry route-segment config).
export const dynamic = "force-static";
