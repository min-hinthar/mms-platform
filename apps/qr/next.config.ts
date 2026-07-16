import type { NextConfig } from "next";

// next/font/google fetches font CSS at build time through Turbopack's Rust fetcher, which
// ignores the system CA store. Behind a TLS-intercepting proxy (CI / remote sandboxes) that
// fetch fails; opt Turbopack into the system trust store. No-op where the default certs work
// (Vercel), and set before the build reads it. Override per-environment if needed.
process.env.NEXT_TURBOPACK_EXPERIMENTAL_USE_SYSTEM_TLS_CERTS ??= "1";

// Static security headers (QA checklist P1). The nonce-based Content-Security-Policy is set
// per-request in `proxy.ts` (a fresh nonce per response can't be a static header); these nonce-free
// headers live here so they also cover the API + static responses the CSP matcher skips.
const securityHeaders = [
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // camera=(self): the grocery Scan & Go viewfinder (getUserMedia) needs it first-party; an empty
  // allowlist `camera=()` would block our own scanner. mic/geo stay fully off — no feature uses them.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

// W1·Q11: static FALLBACK CSP for the document requests the proxy matcher deliberately skips —
// prefetch-header'd navigations (`next-router-prefetch` / `purpose: prefetch`). Those responses are
// normally RSC payloads, but anything served as HTML under a prefetch header would otherwise carry
// NO CSP at all. No nonce here (a static header can't mint one), so no 'unsafe-inline' either —
// inline script in a prefetched document simply doesn't run, which is exactly right for a payload
// that should never need it. The real per-request nonce CSP still lands on the actual navigation.
const fallbackCsp = [
  "default-src 'self'",
  "script-src 'self' https://js.stripe.com https://*.js.stripe.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com",
  "frame-src https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    // Dish photos live in Supabase Storage. W1·Q11 pins the optimizer to the two REAL hosts instead
    // of every *.supabase.co tenant: the QR project + the DELIVERY project (photos still hotlink the
    // latter until the W2a bucket migration — drop it then; PRODUCTION_PLAN W2a).
    remotePatterns: [
      { protocol: "https", hostname: "fasnpdhtvqtzjlvruqcu.supabase.co" },
      { protocol: "https", hostname: "ukuzkhuppqwtrdkjqrkv.supabase.co" },
    ],
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The prefetch-CSP fallback (see fallbackCsp above). Two rules — Next `has` conditions are
      // ANDed within a rule, and either header alone marks a prefetch.
      {
        source: "/:path*",
        has: [{ type: "header", key: "next-router-prefetch" }],
        headers: [{ key: "Content-Security-Policy", value: fallbackCsp }],
      },
      {
        source: "/:path*",
        has: [{ type: "header", key: "purpose", value: "prefetch" }],
        headers: [{ key: "Content-Security-Policy", value: fallbackCsp }],
      },
    ];
  },
  async rewrites() {
    // PostHog reverse proxy — keeps analytics first-party, dodges blockers
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/array/:path*",
        destination: "https://us-assets.i.posthog.com/array/:path*",
      },
      { source: "/ingest/:path*", destination: "https://us.i.posthog.com/:path*" },
    ];
  },
  // Required to support PostHog trailing slash API requests
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
