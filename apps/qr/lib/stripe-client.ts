"use client";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import type { Appearance } from "@stripe/stripe-js";

// Build the Payment/Setup Element appearance from the document's resolved design tokens (light =
// editorial, .dark = Night) — the iframe can't read our CSS vars, so we pass resolved values. Shared by
// PaymentSection (pay) and SecureTabButton (card-save) so both match the live theme. SSR-safe fallback.
/**
 * W22d — the FALLBACKS have to follow the theme too.
 *
 * Every fallback here used to be the LIGHT hex, while `theme` correctly branched on `.dark`. The
 * fallback fires when `getPropertyValue` comes back empty — and the honest account of WHEN is
 * narrower than it first looks: a parser-inserted stylesheet link is script-blocking, so on a merely
 * SLOW load hydration waits too and this never runs against an unstyled tree. The reachable case is
 * the stylesheet FAILING — a 404 against a stale chunk after a deploy, a blocked request — which is
 * rarer but real, and precisely when you least want a surprise. `.dark` is still trustworthy there
 * because the blocking inline script in `layout.tsx` sets it before any of this.
 *
 * The consequence is also narrower than "unreadable": light text on a light card is internally
 * consistent, so what a diner gets is a bright card form sitting in a dark page — jarring and
 * off-brand rather than illegible. Worth fixing, not worth overclaiming.
 *
 * The values mirror tokens.css and are pinned by `scripts/check-theme-parity.mjs` (which reads this
 * FALLBACK map by name — the earlier version of this sentence claimed that before it was true).
 */
const FALLBACK = {
  light: { ac: "#a65f10", cd: "#fffdf8", tx: "#1b1714", t2: "#6e6358", warn: "#a44b34" },
  dark: { ac: "#e7a53a", cd: "#2c1d35", tx: "#f3ecdf", t2: "#bcafc8", warn: "#e0855f" },
} as const;

export function stripeAppearance(): Appearance {
  if (typeof window === "undefined") return { theme: "stripe" };
  const cs = getComputedStyle(document.documentElement);
  const isDark = document.documentElement.classList.contains("dark");
  const fb = isDark ? FALLBACK.dark : FALLBACK.light;
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    theme: isDark ? "night" : "stripe",
    variables: {
      colorPrimary: v("--ac", fb.ac),
      colorBackground: v("--cd", fb.cd),
      colorText: v("--tx", fb.tx),
      colorTextSecondary: v("--t2", fb.t2),
      colorDanger: v("--warn", fb.warn),
      fontFamily: v("--font-body", "system-ui, sans-serif"),
      borderRadius: v("--r-sm", "12px"),
      spacingUnit: "4px",
    },
  };
}

// Browser Stripe.js singleton — loaded once and reused (loadStripe injects a script tag; calling it
// per-render would re-inject). PAN never touches our code: it lives only in the Payment Element
// iframe Stripe.js mounts (SAQ-A). Returns null when the publishable key is absent so the checkout
// can degrade gracefully (a clear "card checkout unavailable" message) instead of throwing.
let _promise: Promise<Stripe | null> | null = null;

export function getStripePromise(): Promise<Stripe | null> | null {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key) return null;
  if (!_promise) _promise = loadStripe(key);
  return _promise;
}
