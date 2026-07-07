"use client";
import { useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import type { StripeElementsOptions } from "@stripe/stripe-js";
import { getStripePromise, stripeAppearance } from "@/lib/stripe-client";
import { Card } from "@mms/ui";

/**
 * Secure-tab card-save (S3.2). Lets a diner save a card so the tab can settle off-session at close —
 * "order all night, walk out, we charge the card." SAQ-A: PAN lives ONLY in the Payment Element iframe;
 * we collect a SetupIntent (no charge). The save is recorded server-side by the webhook
 * (setup_intent.succeeded → the tab flips to 'secure'), so we never claim "secured" the gateway didn't
 * accept (T7) — on confirm we show a calm "saved, securing…" and let the realtime tab-state flip confirm it.
 */
export function SecureTabButton({ cartId, onSecured }: { cartId: string; onSecured: () => void }) {
  const [phase, setPhase] = useState<"idle" | "loading" | "form" | "done">("idle");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stripePromise = getStripePromise();

  const options = useMemo<StripeElementsOptions | null>(
    () => (clientSecret ? { clientSecret, appearance: stripeAppearance() } : null),
    [clientSecret],
  );

  async function begin() {
    setPhase("loading");
    setError(null);
    try {
      const res = await fetch("/api/stripe/setup-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cartId }),
      });
      const data = (await res.json()) as { clientSecret?: string; error?: string };
      if (!res.ok || !data.clientSecret) {
        setError(
          res.status < 500 && data.error ? data.error : "Couldn’t start the card save — try again.",
        );
        setPhase("idle");
        return;
      }
      setClientSecret(data.clientSecret);
      setPhase("form");
    } catch {
      setError("Couldn’t start the card save — try again.");
      setPhase("idle");
    }
  }

  if (phase === "done")
    return (
      <p style={doneNote} role="status">
        <span aria-hidden>✓ </span>Card saved — your tab is secured. Settle anytime.
      </p>
    );

  if (phase === "form" && options && stripePromise)
    return (
      <Card style={panel}>
        <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--t2)", lineHeight: 1.5 }}>
          Save a card to keep your tab open — we’ll charge it when you’re ready to close. No charge
          now.
        </p>
        <Elements stripe={stripePromise} options={options}>
          <SetupForm
            cartId={cartId}
            onDone={() => {
              setPhase("done");
              onSecured(); // realtime/refresh reconciles the tab to 'secure'
            }}
          />
        </Elements>
      </Card>
    );

  // idle / loading
  return (
    <div>
      <button
        type="button"
        onClick={begin}
        disabled={phase === "loading" || !stripePromise}
        aria-busy={phase === "loading"}
        style={secureBtn}
      >
        {phase === "loading" ? "Starting…" : "Secure your tab · save a card"}
      </button>
      <p style={hint}>Save a card now, settle the whole tab when you leave.</p>
      {(error || !stripePromise) && (
        <p role="alert" style={{ ...hint, color: "var(--warn)" }}>
          {error ?? "Card save is temporarily unavailable."}
        </p>
      )}
    </div>
  );
}

function SetupForm({ cartId, onDone }: { cartId: string; onDone: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return; // Stripe.js still loading
    setSubmitting(true);
    setError(null);
    // redirect:'if_required' → a card resolves inline (no redirect); a redirect-based method returns to
    // /cart. error.message from Stripe IS user-facing/safe. On success the webhook records + secures.
    const { error: setupErr } = await stripe.confirmSetup({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/cart?cart=${encodeURIComponent(cartId)}`,
      },
      redirect: "if_required",
    });
    if (setupErr) {
      setError(setupErr.message ?? "Couldn’t save that card. Please try another.");
      setSubmitting(false);
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={onSubmit}>
      <PaymentElement options={{ layout: "tabs" }} />
      {/* role="status" already implies aria-live=polite — don't double it (CLAUDE.md a11y). */}
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
        style={secureBtn}
      >
        {submitting ? "Saving…" : "Save card & secure tab"}
      </button>
    </form>
  );
}

const secureBtn: CSSProperties = {
  width: "100%",
  marginTop: 10,
  minHeight: 48,
  borderRadius: 12,
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--tx)",
  fontWeight: 700,
  fontSize: 15,
  cursor: "pointer",
};
// Surface (bg/border/radius/shadow) comes from `.card` via <Card>; this is layout only.
const panel: CSSProperties = {
  marginTop: 12,
  padding: "var(--s4)",
};
const hint: CSSProperties = {
  fontSize: 11.5,
  color: "var(--t3)",
  margin: "6px 0 0",
  textAlign: "center",
};
const doneNote: CSSProperties = {
  fontSize: 12.5,
  color: "var(--t2)",
  margin: "10px 0 0",
  textAlign: "center",
  lineHeight: 1.5,
};
