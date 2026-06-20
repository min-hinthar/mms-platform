import type { NextConfig } from "next";

// next/font/google fetches font CSS at build time through Turbopack's Rust fetcher, which
// ignores the system CA store. Behind a TLS-intercepting proxy (CI / remote sandboxes) that
// fetch fails; opt Turbopack into the system trust store. No-op where the default certs work
// (Vercel), and set before the build reads it. Override per-environment if needed.
process.env.NEXT_TURBOPACK_EXPERIMENTAL_USE_SYSTEM_TLS_CERTS ??= "1";

// Static security headers (QA checklist P1). The nonce-based Content-Security-Policy is set
// per-request in `middleware.ts` (a fresh nonce per response can't be a static header); these
// nonce-free headers live here so they also cover the API + static responses the CSP matcher skips.
const securityHeaders = [
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // camera=(self): the grocery Scan & Go viewfinder (getUserMedia) needs it first-party; an empty
  // allowlist `camera=()` would block our own scanner. mic/geo stay fully off — no feature uses them.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    // self-host dish photos in Supabase Storage; no third-party hotlinking (QA checklist)
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co" }],
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
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
