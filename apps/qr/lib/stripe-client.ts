"use client";
import { loadStripe, type Stripe } from "@stripe/stripe-js";

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
