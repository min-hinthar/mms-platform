import type { NextConfig } from "next";

// Security headers (QA checklist P1). Tighten CSP as you add origins.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://js.stripe.com",
  "frame-src https://js.stripe.com https://hooks.stripe.com",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com",
  "img-src 'self' data: blob: https://*.supabase.co",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
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
      { source: "/ingest/static/:path*", destination: "https://us-assets.i.posthog.com/static/:path*" },
      { source: "/ingest/array/:path*", destination: "https://us-assets.i.posthog.com/array/:path*" },
      { source: "/ingest/:path*", destination: "https://us.i.posthog.com/:path*" },
    ];
  },
  // Required to support PostHog trailing slash API requests
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
