import "./globals.css";
import type { ReactNode } from "react";
import type { Viewport } from "next";
import { Fraunces, Hanken_Grotesk, Padauk } from "next/font/google";
import { AnonAuthGate } from "@/components/AnonAuthGate";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });
const hanken = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-hanken" });
const padauk = Padauk({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-padauk" });

export const metadata = {
  title: "Mandalay Morning Star — Order",
  description: "Order at the teahouse: dine-in, scan & go, or pickup.",
};

// Next 16 split themeColor/viewport out of metadata into its own export. Set both
// schemes so the address-bar/status-bar matches Day and Night surfaces.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fffaf2" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1115" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // `lang` is set per-locale on the client when the user switches EN/MY (WCAG 3.1.2).
  return (
    <html lang="en" className={`${fraunces.variable} ${hanken.variable} ${padauk.variable}`}>
      <body>
        <AnonAuthGate />
        {children}
      </body>
    </html>
  );
}
