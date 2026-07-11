import "./globals.css";
import type { ReactNode } from "react";
import type { Viewport } from "next";
import { headers } from "next/headers";
import { Fraunces, Hanken_Grotesk, Padauk } from "next/font/google";
import { ViewTransitions } from "next-view-transitions";
import { AnonAuthGate } from "@/components/AnonAuthGate";
import { ThemeSync } from "@/components/ThemeSync";
import { MotionProvider } from "@/components/MotionProvider";
import { ActiveOrderProvider } from "@/components/ActiveOrderProvider";
import { AppHeader } from "@/components/AppHeader";
import { NavDirectionSync } from "@/components/nav/TransitionNav";
import { SurfaceMemory } from "@/components/nav/SurfaceMemory";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });
const hanken = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-hanken" });
// Padauk is the Burmese (Myanmar-script) face — request the `myanmar` subset, or next/font only
// emits @font-face for `latin` and every `name_my` string silently falls back to the system sans
// (defeats the bilingual moat). Keep `latin` too for any Latin chars inside a MY subtree.
const padauk = Padauk({
  subsets: ["latin", "myanmar"],
  weight: ["400", "700"],
  variable: "--font-padauk",
});

export const metadata = {
  title: "Mandalay Morning Star — Order",
  description: "Order at the teahouse: dine-in, scan & go, or pickup.",
  // The ✦ Morning Star mark (apps/qr/public/icon.svg) is QR's first brand asset — replaces the emoji
  // identity. SVG favicon scales crisply on every tab/PWA surface.
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }] },
  openGraph: {
    title: "Mandalay Morning Star",
    description: "Order at the teahouse: dine-in, scan & go, or pickup.",
    siteName: "Mandalay Morning Star",
    type: "website",
  },
};

// The nonce CSP (proxy.ts) mints a fresh nonce per request; Next can only stamp it onto its
// <script> tags during a per-request render. A statically prerendered page bakes its scripts at
// build time with no nonce, so 'strict-dynamic' would block them. Render every route dynamically
// so the current request's nonce reaches the framework scripts. (The app is anon-auth + DB-driven,
// so the four otherwise-static shells lose no meaningful optimization.)
export const dynamic = "force-dynamic";

// Next 16 split themeColor/viewport out of metadata into its own export. These MUST match the real page
// background `--pg` (tokens.css: #faf9f5 light / #171221 Night) — the old #fffaf2/#0f1115 left a visible
// address-bar/status-bar seam over the Night purple (audit U-Q5).
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf9f5" },
    { media: "(prefers-color-scheme: dark)", color: "#171221" },
  ],
  width: "device-width",
  initialScale: 1,
  // Draw edge-to-edge (under the notch/home-bar) so `env(safe-area-inset-*)` resolves non-zero —
  // required for the bottom-sheet/CTA safe-area insets to actually take effect (P5.2).
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Per-request CSP nonce (proxy.ts mints it, exposes it as `x-nonce`). The theme script below MUST
  // carry it or `strict-dynamic` blocks the inline script and dark never activates. `headers()` is
  // available because the layout is `force-dynamic`.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  // Surface the silent failure: no nonce → the theme script is CSP-blocked → dark never activates.
  // The proxy matcher covers every document route, so this should be unreachable; warn (dev only) if not.
  if (!nonce && process.env.NODE_ENV !== "production") {
    console.warn(
      "[layout] missing x-nonce — theme script will be CSP-blocked; dark mode won't activate.",
    );
  }
  // `lang` is set per-locale on the client when the user switches EN/MY (WCAG 3.1.2).
  return (
    // J1 continuity engine: <ViewTransitions> wraps client-side route changes in
    // document.startViewTransition (progressive — non-supporting browsers keep the instant cut).
    // The direction grammar + chrome-stability names live in globals.css; TransitionNav stamps the
    // direction; SurfaceMemory keeps entrance staggers a once-per-session premiere.
    <ViewTransitions>
      <html
        lang="en"
        suppressHydrationWarning
        className={`${fraunces.variable} ${hanken.variable} ${padauk.variable}`}
      >
        <body>
          {/* Richness R2 — dark-mode activation. Blocking + first-in-body so `.dark` is set from the OS
            scheme BEFORE content paints (no flash of the wrong theme). The full Night palette lives in
            @mms/ui tokens.css `.dark`; nothing set the class until here. ThemeSync keeps it live on a
            mid-session OS flip. */}
          <script
            nonce={nonce}
            dangerouslySetInnerHTML={{
              __html: `try{document.documentElement.classList.toggle("dark",matchMedia("(prefers-color-scheme:dark)").matches)}catch(e){}`,
            }}
          />
          <ThemeSync />
          <AnonAuthGate />
          <NavDirectionSync />
          <SurfaceMemory />
          <MotionProvider>
            {/* Persistent wayfinding spine (M-nav): the store observes the URL for mode/cart/order, the header
                reads it. Both are client components; AppHeader self-hides on /staff. */}
            <ActiveOrderProvider>
              <AppHeader />
              {children}
            </ActiveOrderProvider>
          </MotionProvider>
        </body>
      </html>
    </ViewTransitions>
  );
}
