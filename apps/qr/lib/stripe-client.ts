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
 * fallback only fires when `getPropertyValue` comes back empty — which is not hypothetical: this
 * runs on mount, and a custom property read before the stylesheet has applied (a cold load on slow
 * network, a hard refresh mid-paint) returns `""`. In dark that painted the LIGHT palette — near
 * black text, cream card — into an iframe Stripe was rendering with `theme: "night"`. A card form
 * that is unreadable exactly when the connection is already bad.
 *
 * The values mirror tokens.css and are pinned by `scripts/check-theme-parity.mjs`.
 */
const FALLBACK = {
  light: { ac: "#a65f10", cd: "#fffdf8", tx: "#1b1714", t2: "#6e6358", warn: "#a44b34" },
  dark: { ac: "#e7a53a", cd: "#271f38", tx: "#f3ecdf", t2: "#bcafc8", warn: "#e0855f" },
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
