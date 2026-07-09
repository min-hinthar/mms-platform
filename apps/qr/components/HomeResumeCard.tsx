"use client";
import Link from "next/link";
import { useActiveOrderStatus } from "./useActiveOrderStatus";

/**
 * Homepage "resume your order" card (M-nav) — when a live order exists, the entry screen leads with a way
 * back to its tracker instead of only the mode picker. Live status (single-pay AND split-tender, via the
 * server-side split-id resolve) comes from `useActiveOrderStatus`; the homepage owns the subscription
 * (`track=true` — the header pill is hidden here). Renders nothing when there's no live order or it has
 * reached a terminal state (picked up / refunded / failed).
 */
export function HomeResumeCard() {
  const { order, tracked, isDone } = useActiveOrderStatus(true);
  if (!order || isDone) return null;

  const isPickup = order.mode === "pickup";
  const statusText = !tracked
    ? "Confirming your order"
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
