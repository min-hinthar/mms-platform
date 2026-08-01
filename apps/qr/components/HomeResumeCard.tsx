"use client";
import { TransitionLink as Link } from "./nav/TransitionNav"; // J1 journey grammar
import { useActiveOrderStatus } from "./useActiveOrderStatus";

/**
 * Homepage "resume your order" card (M-nav) — when a live order exists, the entry screen leads with a way
 * back to its tracker instead of only the mode picker. Live status (single-pay AND split-tender, via the
 * server-side split-id resolve) comes from `useActiveOrderStatus`; the homepage owns the subscription
 * (`track=true` — the header pill is hidden here). Renders nothing when there's no live order or it has
 * reached a terminal state (picked up / refunded / failed).
 */
export function HomeResumeCard() {
  const { order, tracked, statusWord, isDone } = useActiveOrderStatus(true);
  if (!order || isDone) return null;

  const isPickup = order.mode === "pickup";
  // W10a — `statusWord` is the hook's HONEST floor (W9c built it for the header pill; this card
  // was the consumer that never adopted it): on a timed-out/unreachable status feed it says
  // "Placed" — the one fact our client record proves — instead of this card's old hand-rolled
  // "Confirming your order", which claimed active work FOREVER during the paused-DB outage.
  const statusText = !tracked
    ? (statusWord ?? "Order placed")
    : tracked.togoStatus === "ready"
      ? isPickup
        ? "Ready for pickup"
        : "Your order is ready"
      : tracked.togoStatus === "preparing"
        ? "Preparing your order"
        : "Your order is in";
  const href = order.paymentIntent
    ? `/track?payment_intent=${encodeURIComponent(order.paymentIntent)}&redirect_status=succeeded${order.cartId ? `&cart=${encodeURIComponent(order.cartId)}` : ""}`
    : `/track?cart=${encodeURIComponent(order.cartId ?? "")}&paid=1`;

  return (
    <Link href={href} className="home-resume" aria-label={`${statusText} — track your order`}>
      <span className="home-resume-medallion" aria-hidden>
        🧾
      </span>
      <span className="home-resume-body">
        <span className="home-resume-kicker">In progress</span>
        <span className="home-resume-status">{statusText}</span>
      </span>
      <span className="home-resume-arrow" aria-hidden>
        →
      </span>
    </Link>
  );
}
