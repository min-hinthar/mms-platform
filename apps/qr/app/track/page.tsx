import type { Metadata } from "next";
import { TransitionLink as Link } from "@/components/nav/TransitionNav"; // J1 journey grammar
import { OrderTracker } from "@/components/OrderTracker";
import { getSplitOrderId } from "@/lib/order";

// /track — post-payment, live. Stripe appends `payment_intent` + `redirect_status` to the Payment
// Element return_url; for succeeded/processing we mount the Realtime <OrderTracker> (the order shows
// the moment the signature-verified webhook fulfills, no manual refresh). The kitchen lifecycle +
// ETA arrive with S2's KDS / M2.2 — the same subscription carries them.
const wrap = { padding: 24, maxWidth: 440, margin: "0 auto" } as const;

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
    if (orderId)
      return <OrderTracker paymentIntent={null} orderId={orderId} processing={false} justPaid />;
    return (
      <main style={wrap}>
        <div className="card card-textured track-notice">
          <div className="track-notice-medallion" aria-hidden>
            🫖
          </div>
          <h1>Payment received</h1>
          <p>Your share is in — we’re finalizing the table’s order. Check back in a moment.</p>
          <Link href={`/track?cart=${encodeURIComponent(cart)}&paid=1`} className="nav-link-strong">
            Refresh
          </Link>
        </div>
      </main>
    );
  }

  if (status === "succeeded" || status === "processing") {
    // The PaymentIntent id keys the live subscription. Stripe always appends it; if it's somehow
    // absent, fall back to a static confirmation rather than a tracker that can never resolve.
    if (paymentIntent)
      return (
        <OrderTracker
          paymentIntent={paymentIntent}
          processing={status === "processing"}
          justPaid={status === "succeeded"}
        />
      );
    return (
      <main style={wrap}>
        <div className="card card-textured track-notice">
          <div className="track-notice-medallion" aria-hidden>
            {status === "processing" ? "⏳" : "🧾"}
          </div>
          <h1>{status === "processing" ? "Payment processing" : "Payment received"}</h1>
          <p>
            {status === "processing"
              ? "We’re still confirming your payment — check back shortly for your order."
              : "Your order’s in — the kitchen has it. Check back anytime for updates."}
          </p>
          <Link href="/menu" className="nav-link">
            <span aria-hidden className="nav-arrow nav-arrow-back">
              ←
            </span>{" "}
            Back to menu
          </Link>
        </div>
      </main>
    );
  }

  if (status)
    return (
      <main style={wrap}>
        <div className="card card-textured track-notice">
          <div className="track-notice-medallion track-notice-medallion-warn" aria-hidden>
            ↺
          </div>
          <h1>Payment didn’t go through</h1>
          <p>No charge was made — you can try again from your order.</p>
          <Link
            href={cart ? `/cart?cart=${encodeURIComponent(cart)}` : "/menu"}
            className="nav-link-strong"
          >
            <span aria-hidden className="nav-arrow nav-arrow-back">
              ←
            </span>{" "}
            Back to your order
          </Link>
        </div>
      </main>
    );

  // Direct visit (no payment redirect) — stub until an order exists.
  return (
    <main style={wrap}>
      <div className="card card-textured track-notice">
        <div className="track-notice-medallion" aria-hidden>
          🍵
        </div>
        <h1>Track your order</h1>
        <p>Your order timeline and ETA will appear here once you’ve placed an order.</p>
        <Link href="/menu" className="nav-link-strong">
          Browse the menu{" "}
          <span aria-hidden className="nav-arrow nav-arrow-fwd">
            →
          </span>
        </Link>
      </div>
    </main>
  );
}
