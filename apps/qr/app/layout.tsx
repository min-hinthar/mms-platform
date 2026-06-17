import "./globals.css";
import type { ReactNode } from "react";
import { Fraunces, Hanken_Grotesk, Padauk } from "next/font/google";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });
const hanken = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-hanken" });
const padauk = Padauk({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-padauk" });

export const metadata = {
  title: "Mandalay Morning Star — Order",
  description: "Order at the teahouse: dine-in, scan & go, or pickup.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // `lang` is set per-locale on the client when the user switches EN/MY (WCAG 3.1.2).
  return (
    <html lang="en" className={`${fraunces.variable} ${hanken.variable} ${padauk.variable}`}>
      <body>{children}</body>
    </html>
  );
}
