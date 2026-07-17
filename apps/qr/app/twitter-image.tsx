// W7 shell — the Twitter/X card reuses the exact Open Graph render (one lockup, one source of truth).
// Re-exporting the default + route config is all Next needs to serve it at /twitter-image.
export { default, alt, size, contentType } from "./opengraph-image";
