import type { Metadata } from "next";
import Link from "next/link";

// /track — P1.3 renders the post-payment confirmation from Stripe's `redirect_status` (appended to
// the Payment Element return_url). Fulfillment is asynchronous: the signature-verified webhook writes
// qr_orders + flips the cart to paid. The live placed → kitchen → ready timeline + ETA (Supabase
// Realtime on the orders table) is P1.5.
const wrap = { padding: 24, maxWidth: 440, margin: "0 auto" } as const;
const back = { color: "var(--ac)", fontWeight: 700 } as const;

type SearchParams = Promise<{ redirect_status?: string; cart?: string }>;

// Per-state tab title (brand hygiene): after the Stripe redirect the tab would otherwise keep the
// Payment Element's title.
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
  const { redirect_status: status, cart } = await searchParams;

  if (status === "succeeded")
    return (
      <main style={wrap}>
        <div style={{ fontSize: 44, lineHeight: 1 }} aria-hidden>
          ✓
        </div>
        <h1 style={{ fontSize: 28, margin: "8px 0" }}>Payment received</h1>
        <p style={{ color: "var(--t2)" }}>
          Your order’s in — the kitchen has it. Live status and your ETA will appear here.
        </p>
        <Link href="/menu" style={back}>
          Back to menu
        </Link>
      </main>
    );

  if (status === "processing")
    return (
      <main style={wrap}>
        <h1 style={{ fontSize: 28 }}>Payment processing</h1>
        <p style={{ color: "var(--t2)" }}>
          We’re confirming your payment — this can take a moment (some bank methods settle slowly).
          You can safely close this; your order goes to the kitchen the moment it clears, and live
          status will appear here.
        </p>
        <Link href="/menu" style={back}>
          Back to menu
        </Link>
      </main>
    );

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

  // Direct visit (no payment redirect) — timeline stub (P1.5).
  return (
    <main style={wrap}>
      <h1 style={{ fontSize: 28 }}>Track</h1>
      <p style={{ color: "var(--t2)" }}>Your order timeline and ETA will appear here.</p>
    </main>
  );
}
