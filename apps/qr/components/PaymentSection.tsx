"use client";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Elements,
  ExpressCheckoutElement,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import type { Appearance, StripeElementsOptions } from "@stripe/stripe-js";
import type { CartTotals } from "@mms/db";
import { getStripePromise, stripeAppearance } from "@/lib/stripe-client";
import { confirmCopy } from "@/lib/confirm-copy";
import { ConfirmSwap } from "./ConfirmSwap";

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
  onPayingChange,
}: {
  cartId: string;
  clientSecret: string;
  totals: CartTotals;
  onEdit: () => void;
  /** W9b — mirror the in-flight confirm up to Checkout, so the pay step's new top-of-view "Back to
   *  review" can disable itself while a PaymentIntent is being confirmed. Editing then would release
   *  the pay-window lock out from under a live authorization. */
  onPayingChange?: (paying: boolean) => void;
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
      <p role="alert" style={{ fontSize: "var(--fs-sm)", color: "var(--warn)", marginTop: 12 }}>
        Card checkout is temporarily unavailable. Please try again shortly.
      </p>
    );

  return (
    <Elements stripe={stripePromise} options={options}>
      <PayForm cartId={cartId} totals={totals} onEdit={onEdit} onPayingChange={onPayingChange} />
    </Elements>
  );
}

function PayForm({
  cartId,
  totals,
  onEdit,
  onPayingChange,
}: {
  cartId: string;
  totals: CartTotals;
  onEdit: () => void;
  onPayingChange?: (paying: boolean) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // W16c — the finalize confirm step (card path only; see onSubmit).
  const [confirming, setConfirming] = useState(false);
  const payBtnRef = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);
  // Focus back to the Pay trigger when the confirm closes without charging (the staff idiom).
  useEffect(() => {
    if (!confirming && wasConfirming.current) payBtnRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);
  // W2d — whether the browser/domain surfaced any wallet (Apple/Google Pay/Link). Drives the "or pay
  // with card" divider; false ⇒ the Express element rendered nothing and the card flow stands alone.
  const [walletReady, setWalletReady] = useState(false);

  // Shared confirm — used by BOTH the card form submit and the Express (wallet) onConfirm. The Elements
  // is clientSecret-initialized (server-authoritative amount), so we confirm directly (no elements.submit
  // — that's the deferred-intent flow). On success Stripe redirects to return_url; only an immediate
  // (validation / declined-inline) error returns here, and `error.message` is user-facing + safe to show.
  async function confirm() {
    if (!stripe || !elements) return; // Stripe.js still loading
    setSubmitting(true);
    onPayingChange?.(true); // W9b — freeze the pay step's back control for the confirm round-trip
    setError(null);
    const { error: payErr } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/track?cart=${encodeURIComponent(cartId)}`,
      },
    });
    if (payErr) {
      setError(payErr.message ?? "Payment couldn’t be completed. Please try another card.");
      setSubmitting(false);
      // Return to the live Pay button so a declined card can be retried — never strand the diner
      // on a confirm whose proceed already fired. (Success redirects away, so this is failure-only.)
      setConfirming(false);
      onPayingChange?.(false); // only an INLINE failure lands here; success redirects away
    }
  }

  // W16c — the finalize confirm gates the CARD path only (owner: "finalize pay bill should ask to
  // confirm decision"). It sits HERE, on the charge, not on the review step's "Pay · $X" (which
  // only mints the intent and is reversible via "Edit order"). The WALLET path is deliberately
  // exempt: Apple/Google Pay already interpose the OS payment sheet — an app-level pre-ask would
  // be a double confirm, and stalling ExpressCheckoutElement's onConfirm can expire the wallet
  // session outright.
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    // Guard `elements` too, not just `stripe`: `confirm()` early-returns when either is still
    // null, so opening the confirm on a half-loaded Stripe.js would park the diner on a card whose
    // proceed button silently does nothing (the button's own disabled check only ever saw `stripe`).
    if (!stripe || !elements || submitting) return;
    setConfirming(true);
  }

  const dollars = `$${(totals.totalCents / 100).toFixed(2)}`;

  return (
    <form onSubmit={onSubmit}>
      {/* W2d — wallet-first: Apple/Google Pay/Link ABOVE the card (the single highest-leverage
          benchmark finding — 83% scan-to-pay). Pays the SAME server-authoritative PaymentIntent via the
          shared confirm(). Renders NOTHING until the browser has a wallet AND the domain is registered in
          Stripe (Apple/Google Pay) — the card flow below is untouched meanwhile, so it's safe to ship
          before the domain is verified. `onLoadError` fails closed to the card path. */}
      <ExpressCheckoutElement
        options={{ buttonHeight: 48 }}
        onReady={({ availablePaymentMethods }) =>
          // Stripe passes `undefined` when no wallet is available; guard the (unlikely) all-false object
          // too, so the "or pay with card" divider never orphans above the card with no wallet above it.
          setWalletReady(Object.values(availablePaymentMethods ?? {}).some(Boolean))
        }
        onConfirm={() => void confirm()}
        onLoadError={() => setWalletReady(false)}
      />
      {walletReady && (
        <div className="checkout-pay-divider" aria-hidden>
          <span>or pay with card</span>
        </div>
      )}
      <PaymentElement options={{ layout: "tabs" }} />

      {/* Polite, atomic live region for the pay error (the only announced status here). */}
      <p
        role="status"
        aria-atomic="true"
        style={{
          minHeight: 16,
          margin: "10px 0 0",
          fontSize: "var(--fs-sm)",
          color: "var(--warn)",
        }}
      >
        {error}
      </p>

      {confirming ? (
        <ConfirmSwap
          copy={confirmCopy({ kind: "pay", amountCents: totals.totalCents })}
          busy={submitting}
          busyLabel="Processing…"
          onCancel={() => setConfirming(false)}
          onProceed={() => void confirm()}
        />
      ) : (
        <button
          ref={payBtnRef}
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
            // with the review step's "Pay · $X" CTA. The label rides above the ::after sweep on its own layer.
            fontWeight: 800,
            fontSize: "var(--fs-body)",
            cursor: !stripe || submitting ? "default" : "pointer",
            opacity: !stripe || submitting ? 0.7 : 1,
          }}
        >
          <span style={{ position: "relative", zIndex: 1 }}>
            {submitting ? "Processing…" : `Pay ${dollars}`}
          </span>
        </button>
      )}

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
