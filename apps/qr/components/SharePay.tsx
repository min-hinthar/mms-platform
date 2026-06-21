"use client";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import type { Appearance, StripeElementsOptions } from "@stripe/stripe-js";
import { getStripePromise } from "@/lib/stripe-client";

/**
 * One payer's share-pay screen (M3·P3.3b, split-tender). The diner picks their OWN tip, then authorizes
 * their share on a Payment Element — `create-share-intent` mints a `capture_method: manual` PaymentIntent
 * (server-derived amount; the client never sends a price), and `confirmPayment({ redirect: "if_required" })`
 * AUTHORIZES (status → requires_capture) without leaving the board. No money moves yet: the webhook
 * captures every share together once the whole table has authorized. Changing the tip re-mints the PI
 * (the old one is canceled server-side). PAN lives only in Stripe's iframe (SAQ-A).
 */
const TIPS: [label: string, rate: number][] = [
  ["No tip", 0],
  ["15%", 0.15],
  ["18%", 0.18],
  ["20%", 0.2],
];

export function SharePay({ cartId, onAuthorized }: { cartId: string; onAuthorized: () => void }) {
  const [tipRate, setTipRate] = useState(0);
  const [retry, setRetry] = useState(0); // bump to re-mint after a transient failure
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [amountCents, setAmountCents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const stripePromise = getStripePromise();

  const appearance = useMemo<Appearance>(() => {
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
  }, []);

  // (Re)mint this payer's PaymentIntent for the chosen tip. Re-runs on a tip change (the route cancels
  // the prior pending PI). setState lives in the async callbacks (the allowed "sync from an external
  // system" pattern), with a cancel guard against an unmounted/raced update.
  useEffect(() => {
    let active = true;
    fetch("/api/stripe/create-share-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cartId, tipRate }),
    })
      .then(async (r) => {
        const d = (await r.json()) as {
          clientSecret?: string;
          amountCents?: number;
          error?: string;
        };
        if (!active) return;
        if (!r.ok || !d.clientSecret) {
          // 4xx carries a safe server reason; 5xx stays generic (no raw SDK string → recon).
          setError(
            r.status < 500 && d.error ? d.error : "Couldn’t start your payment — please try again.",
          );
          return;
        }
        setClientSecret(d.clientSecret);
        setAmountCents(d.amountCents ?? 0);
      })
      .catch(() => {
        if (active) setError("Couldn’t start your payment — please try again.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [cartId, tipRate, retry]);

  // Reset → re-mint lives in these EVENT handlers (not the effect body — the React Compiler forbids a
  // synchronous setState there); the effect only fetches + sets results in its async callbacks.
  function selectTip(rate: number) {
    if (rate === tipRate) return;
    setClientSecret(null);
    setLoading(true);
    setError(null);
    setTipRate(rate);
  }
  function tryAgain() {
    setClientSecret(null);
    setLoading(true);
    setError(null);
    setRetry((n) => n + 1);
  }

  const options = useMemo<StripeElementsOptions | null>(
    () => (clientSecret ? { clientSecret, appearance } : null),
    [clientSecret, appearance],
  );

  return (
    <div style={{ marginTop: 12 }}>
      <div role="group" aria-label="Add a tip to your share" style={{ display: "flex", gap: 8 }}>
        {TIPS.map(([label, rate]) => {
          const on = tipRate === rate;
          return (
            <button
              key={rate}
              type="button"
              aria-pressed={on}
              onClick={() => selectTip(rate)}
              style={{
                flex: 1,
                minHeight: 44,
                borderRadius: 12,
                border: `1.5px solid ${on ? "var(--ac)" : "var(--bd)"}`,
                background: on ? "color-mix(in oklab, var(--ac) 9%, var(--cd))" : "var(--cd)",
                color: on ? "var(--ac-strong)" : "var(--tx)",
                fontWeight: 800,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {error ? (
        <p role="alert" style={{ fontSize: 13, color: "var(--warn)", marginTop: 10 }}>
          {error}{" "}
          <button
            type="button"
            onClick={tryAgain}
            style={{
              minHeight: 44,
              padding: "0 4px",
              background: "none",
              border: "none",
              color: "var(--warn)",
              fontWeight: 800,
              textDecoration: "underline",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </p>
      ) : !stripePromise ? (
        <p role="alert" style={{ fontSize: 13, color: "var(--warn)", marginTop: 10 }}>
          Card payment is temporarily unavailable. Please try again shortly.
        </p>
      ) : loading || !options ? (
        // Plain text (not a live region): the disabled flow + visible label convey loading, and the
        // settlement view already has its status region — no redundant aria-live (QA §A).
        <p style={{ fontSize: 13, color: "var(--t2)", marginTop: 12 }}>Preparing your payment…</p>
      ) : (
        <Elements key={clientSecret} stripe={stripePromise} options={options}>
          <ShareForm amountCents={amountCents} onAuthorized={onAuthorized} />
        </Elements>
      )}
    </div>
  );
}

function ShareForm({
  amountCents,
  onAuthorized,
}: {
  amountCents: number;
  onAuthorized: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);
    // Authorize only (manual capture) — stay on the board. A redirect-based method round-trips back to
    // /cart; a card/wallet resolves inline. `error.message` from Stripe is user-facing + safe to show.
    const { error: payErr, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/cart?cart=${encodeURIComponent(
          new URLSearchParams(window.location.search).get("cart") ?? "",
        )}`,
      },
      redirect: "if_required",
    });
    if (payErr) {
      setError(payErr.message ?? "Payment couldn’t be authorized. Please try another card.");
      setSubmitting(false);
      return;
    }
    if (
      paymentIntent &&
      (paymentIntent.status === "requires_capture" || paymentIntent.status === "succeeded")
    ) {
      onAuthorized(); // re-sync the board; the webhook marks the share authorized
      return; // keep the spinner — the row flips to "Authorized" on the next board sync
    }
    // Rare non-terminal status (e.g. still processing) with no error — re-enable + tell the diner
    // honestly rather than leaving a dead button.
    setError("Your payment is still processing — watch the board for your status.");
    setSubmitting(false);
  }

  const dollars = `$${(amountCents / 100).toFixed(2)}`;
  return (
    <form onSubmit={onSubmit} style={{ marginTop: 12 }}>
      <PaymentElement options={{ layout: "tabs" }} />
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{ minHeight: 16, margin: "10px 0 0", fontSize: 13, color: "var(--warn)" }}
      >
        {error}
      </p>
      <button
        type="submit"
        disabled={!stripe || submitting}
        aria-busy={submitting}
        style={{
          width: "100%",
          marginTop: 12,
          minHeight: 50,
          borderRadius: 12,
          border: "none",
          background: "var(--ac)",
          color: "var(--oa)",
          fontWeight: 800,
          fontSize: 16,
          cursor: !stripe || submitting ? "default" : "pointer",
          opacity: !stripe || submitting ? 0.7 : 1,
        }}
      >
        {submitting ? "Authorizing…" : `Authorize ${dollars}`}
      </button>
      <p style={{ fontSize: 11, color: "var(--t3)", marginTop: 8, lineHeight: 1.5 }}>
        You’re only authorized now — your card is charged when everyone at the table has paid their
        share.
      </p>
    </form>
  );
}
