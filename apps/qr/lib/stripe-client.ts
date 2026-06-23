"use client";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import type { Appearance } from "@stripe/stripe-js";

// Build the Payment/Setup Element appearance from the document's resolved design tokens (light =
// editorial, .dark = Night) — the iframe can't read our CSS vars, so we pass resolved values. Shared by
// PaymentSection (pay) and SecureTabButton (card-save) so both match the live theme. SSR-safe fallback.
export function stripeAppearance(): Appearance {
  if (typeof window === "undefined") return { theme: "stripe" };
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    theme: document.documentElement.classList.contains("dark") ? "night" : "stripe",
    variables: {
      colorPrimary: v("--ac", "#a65f10"),
      colorBackground: v("--cd", "#fffdf8"),
      colorText: v("--tx", "#1b1714"),
      colorTextSecondary: v("--t2", "#6e6358"),
      colorDanger: v("--warn", "#a44b34"),
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
