"use client";
import { useMemo, useState, type FormEvent } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import type { Appearance, StripeElementsOptions } from "@stripe/stripe-js";
import type { CartTotals } from "@mms/db";
import { getStripePromise, stripeAppearance } from "@/lib/stripe-client";

/**
 * The pay step (P1.3). PAN never touches our code — it lives only inside the Payment Element iframe
 * Stripe.js mounts (SAQ-A). The amount is server-authoritative: `clientSecret` + `totals` come from
 * the member-gated `create-intent` route, which locked the cart for this window. `confirmPayment`
 * redirects to `/track`; the signature-verified webhook reconciles and fulfills. The Element's
 * appearance is derived from our live design tokens so it matches the editorial / Night themes.
 */
export function PaymentSection({
  cartId,
  clientSecret,
  totals,
  onEdit,
}: {
  cartId: string;
  clientSecret: string;
  totals: CartTotals;
  onEdit: () => void;
}) {
  const stripePromise = getStripePromise();

  // Element appearance from the document's resolved tokens (shared helper; light = editorial, .dark =
  // Night). Computed once on mount (client only).
  const appearance = useMemo<Appearance>(() => stripeAppearance(), []);

  const options = useMemo<StripeElementsOptions>(
    () => ({ clientSecret, appearance }),
    [clientSecret, appearance],
  );

  if (!stripePromise)
    return (
      <p role="alert" style={{ fontSize: 13, color: "var(--warn)", marginTop: 12 }}>
        Card checkout is temporarily unavailable. Please try again shortly.
      </p>
    );

  return (
    <Elements stripe={stripePromise} options={options}>
      <PayForm cartId={cartId} totals={totals} onEdit={onEdit} />
    </Elements>
  );
}

function PayForm({
  cartId,
  totals,
  onEdit,
}: {
  cartId: string;
  totals: CartTotals;
  onEdit: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return; // Stripe.js still loading
    setSubmitting(true);
    setError(null);
    // On success Stripe redirects to return_url; only an immediate (validation / declined-inline)
    // error returns here. `error.message` from Stripe IS user-facing and safe to show.
    const { error: payErr } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/track?cart=${encodeURIComponent(cartId)}`,
      },
    });
    if (payErr) {
      setError(payErr.message ?? "Payment couldn’t be completed. Please try another card.");
      setSubmitting(false);
    }
  }

  const dollars = `$${(totals.totalCents / 100).toFixed(2)}`;

  return (
    <form onSubmit={onSubmit}>
      <PaymentElement options={{ layout: "tabs" }} />

      {/* Polite, atomic live region for the pay error (the only announced status here). */}
      <p
        role="status"
        aria-atomic="true"
        style={{ minHeight: 16, margin: "10px 0 0", fontSize: 13, color: "var(--warn)" }}
      >
        {error}
      </p>

      <button
        type="submit"
        disabled={!stripe || submitting}
        aria-busy={submitting}
        className="checkout-cta"
        style={{
          width: "100%",
          marginTop: 12,
          minHeight: 50,
          borderRadius: 12,
          border: "none",
          // bg/color come from .checkout-cta (gold-warmed gradient + sheen + one-sweep shine) — parity
          // with the "Continue to payment" CTA. The label rides above the ::after sweep on its own layer.
          fontWeight: 800,
          fontSize: 16,
          cursor: !stripe || submitting ? "default" : "pointer",
          opacity: !stripe || submitting ? 0.7 : 1,
        }}
      >
        <span style={{ position: "relative", zIndex: 1 }}>
          {submitting ? "Processing…" : `Pay ${dollars}`}
        </span>
      </button>

      <button
        type="button"
        onClick={onEdit}
        disabled={submitting}
        className="checkout-cta-ghost"
        style={{
          width: "100%",
          marginTop: 8,
          minHeight: 44,
          borderRadius: 12,
          border: "none",
          background: "transparent",
          // color lives in .checkout-cta-ghost so the :hover brighten isn't outranked by an inline color.
          fontWeight: 700,
          cursor: submitting ? "default" : "pointer",
        }}
      >
        <span aria-hidden>←</span> Edit order
      </button>
    </form>
  );
}
