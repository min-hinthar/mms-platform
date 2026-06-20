import type { Metadata } from "next";
import Link from "next/link";
import { OrderTracker } from "@/components/OrderTracker";

// /track — post-payment, live. Stripe appends `payment_intent` + `redirect_status` to the Payment
// Element return_url; for succeeded/processing we mount the Realtime <OrderTracker> (the order shows
// the moment the signature-verified webhook fulfills, no manual refresh). The kitchen lifecycle +
// ETA arrive with S2's KDS / M2.2 — the same subscription carries them.
const wrap = { padding: 24, maxWidth: 440, margin: "0 auto" } as const;
// inline-block + vertical padding → ≥44px touch target (QA §A P0)
const back = {
  color: "var(--ac)",
  fontWeight: 700,
  display: "inline-block",
  padding: "12px 0",
} as const;

type SearchParams = Promise<{ redirect_status?: string; cart?: string; payment_intent?: string }>;

// Per-state tab title — after the Stripe redirect the tab would otherwise keep the Element's title.
export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const { redirect_status: status } = await searchParams;
  const title =
    status === "succeeded"
      ? "Order confirmed"
      : status === "processing"
        ? "Confirming payment"
        : status
          ? "Payment unsuccessful"
          : "Track your order";
  return { title };
}

export default async function Track({ searchParams }: { searchParams: SearchParams }) {
  const { redirect_status: status, cart, payment_intent: paymentIntent } = await searchParams;

  if (status === "succeeded" || status === "processing") {
    // The PaymentIntent id keys the live subscription. Stripe always appends it; if it's somehow
    // absent, fall back to a static confirmation rather than a tracker that can never resolve.
    if (paymentIntent)
      return <OrderTracker paymentIntent={paymentIntent} processing={status === "processing"} />;
    return (
      <main style={wrap}>
        <h1 style={{ fontSize: 28, margin: "8px 0" }}>
          {status === "processing" ? "Payment processing" : "Payment received"}
        </h1>
        <p style={{ color: "var(--t2)" }}>
          {status === "processing"
            ? "We’re still confirming your payment — check back shortly for your order."
            : "Your order’s in — the kitchen has it. Check back anytime for updates."}
        </p>
        <Link href="/menu" style={back}>
          Back to menu
        </Link>
      </main>
    );
  }

  if (status)
    return (
      <main style={wrap}>
        <h1 style={{ fontSize: 28 }}>Payment didn’t go through</h1>
        <p style={{ color: "var(--t2)" }}>
          No charge was made — you can try again from your order.
        </p>
        <Link href={cart ? `/cart?cart=${encodeURIComponent(cart)}` : "/menu"} style={back}>
          <span aria-hidden>←</span> Back to your order
        </Link>
      </main>
    );

  // Direct visit (no payment redirect) — stub until an order exists.
  return (
    <main style={wrap}>
      <h1 style={{ fontSize: 28 }}>Track</h1>
      <p style={{ color: "var(--t2)" }}>
        Your order timeline and ETA will appear here once you’ve placed an order.
      </p>
      <Link href="/menu" style={back}>
        Browse the menu
      </Link>
    </main>
  );
}
