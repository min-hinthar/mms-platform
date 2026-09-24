"use client";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import type { Appearance, CustomFontSource } from "@stripe/stripe-js";
import { resolvePublishableKey } from "./stripe-env";
import { buildStripeAppearance, buildStripeFonts, STRIPE_LENGTH_TOKENS } from "./stripe-appearance";

/**
 * The DOM ADAPTER for `lib/stripe-appearance.ts` (Phase 1c — F17). The iframe can't read our CSS
 * vars, so the Payment/Setup Element gets resolved values: colours and weights via
 * `getPropertyValue`, LENGTHS through one hidden probe element (`probe.style.width = var(--x)`, then
 * the computed px) because Stripe parses no rem/max()/calc(). Shared by PaymentSection (pay),
 * SharePay (split share) and SecureTabButton (card-save), so every Element surface mirrors the
 * live theme and loads the same first-party Hanken face. Mount-time by design (see ThemeSync).
 *
 * The mapping and its FALLBACK table live in `stripe-appearance.ts` (pure, unit-tested, and pinned
 * to tokens.css by `scripts/check-theme-parity.mjs`); this file only reads the document.
 */
function withTokenReader<T>(fn: (read: (token: string) => string) => T): T {
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const probe = document.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText =
    "position:absolute;visibility:hidden;pointer-events:none;inset-block-start:0;inset-inline-start:0;block-size:0;overflow:hidden";
  (document.body ?? root).appendChild(probe);
  try {
    return fn((token) => {
      // An EMPTY property is the fallback case (a stylesheet that failed): probing it would answer
      // `0px` for an invalid `var()`, which is a confident wrong value, so it is never probed.
      const raw = cs.getPropertyValue(token).trim();
      if (!raw || !STRIPE_LENGTH_TOKENS.has(token)) return raw;
      probe.style.width = `var(${token})`;
      const px = getComputedStyle(probe).width.trim();
      return /^\d+(?:\.\d+)?px$/.test(px) ? px : ""; // unresolved (no layout engine) → fallback
    });
  } finally {
    probe.remove();
  }
}

export function stripeAppearance(): Appearance {
  if (typeof window === "undefined") return { theme: "stripe" };
  const isDark = document.documentElement.classList.contains("dark");
  // Guarded: jsdom (and very old engines) have no matchMedia — no signal means no preference.
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  return withTokenReader((read) => buildStripeAppearance(read, { isDark, reducedMotion }));
}

/** The iframe's first-party font (the family `stripeAppearance` names). [] on the server. */
export function stripeFonts(): CustomFontSource[] {
  if (typeof window === "undefined") return [];
  return withTokenReader((read) => buildStripeFonts(window.location.origin, read));
}

// Browser Stripe.js singleton — loaded once and reused (loadStripe injects a script tag; calling it
// per-render would re-inject). PAN never touches our code: it lives only in the Payment Element
// iframe Stripe.js mounts (SAQ-A). Returns null when the publishable key is absent so the checkout
// can degrade gracefully (a clear "card checkout unavailable" message) instead of throwing.
let _promise: Promise<Stripe | null> | null = null;

export function getStripePromise(): Promise<Stripe | null> | null {
  // Resolved through `stripe-env` so the browser reads the SAME name the server picked. The literal
  // `process.env.NEXT_PUBLIC_*` reads live in `publishableKeyCandidates` because Next.js inlines
  // them at build time by textual substitution: a computed lookup is undefined in the browser.
  const key = resolvePublishableKey()?.value;
  if (!key) return null;
  if (!_promise) _promise = loadStripe(key);
  return _promise;
}

/**
 * Phase 1c — forget a Stripe.js load so the NEXT `getStripePromise()` injects the script again
 * (stripe-js clears its own cached promise on a failed load, so a fresh `loadStripe` really does
 * retry).
 *
 * ONE caller: `PaymentSection`'s retry, and only after Stripe.js ITSELF rejected
 * (`retryResetsLoader`). ⚠️ The accessor above must NEVER reset on its own: `SharePay` and
 * `SecureTabButton` call `getStripePromise()` in their RENDER bodies, so an auto-reset on rejection
 * would mint a fresh `loadStripe` — a fresh script injection — on every render after a failure.
 */
export function resetStripePromise(): void {
  _promise = null;
}
