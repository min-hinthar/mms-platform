import type { Metadata } from "next";
import Link from "next/link";
import { OrderTracker } from "@/components/OrderTracker";
import { getSplitOrderId } from "@/lib/order";

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

type SearchParams = Promise<{
  redirect_status?: string;
  cart?: string;
  payment_intent?: string;
  paid?: string; // set by the split-tender SettlementBoard redirect (no Stripe redirect params)
}>;

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
  const { redirect_status: status, cart, payment_intent: paymentIntent, paid } = await searchParams;

  // Split-tender completion (M3·P3.3b): the SettlementBoard sends the whole table here with
  // `?cart=…&paid=1` once every share is captured. There's no Stripe `redirect_status`/`payment_intent`
  // (each payer has their own PI), so resolve the member-gated split order and render the SAME live
  // tracker single-pay gets. Until the order row is stamped (a brief post-capture race) show an honest
  // "payment received — finalizing" with a refresh, never the "no order yet" stub. The `paid` marker
  // distinguishes this from a stray direct visit to `/track?cart=…`.
  if (paid && cart) {
    const orderId = await getSplitOrderId(cart).catch(() => null);
    if (orderId) return <OrderTracker paymentIntent={null} orderId={orderId} processing={false} />;
    return (
      <main style={wrap}>
        <h1 style={{ fontSize: 28, margin: "8px 0" }}>Payment received</h1>
        <p style={{ color: "var(--t2)" }}>
          Your share is in — we’re finalizing the table’s order. Check back in a moment.
        </p>
        <Link href={`/track?cart=${encodeURIComponent(cart)}&paid=1`} style={back}>
          Refresh
        </Link>
      </main>
    );
  }

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
