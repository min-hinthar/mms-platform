"use client";
import Link from "next/link";
import { useActiveOrder } from "./ActiveOrderProvider";
import { useOrderStatus } from "@/lib/useOrderStatus";

/**
 * Homepage "resume your order" card (M-nav) — when a live order exists, the entry screen leads with a way
 * back to its tracker instead of only the mode picker. Reads the wayfinding store + derives live status from
 * `useOrderStatus` (single-pay); split-tender shows a generic "your order is in" → `/track?cart=…&paid=1`.
 * Renders nothing when there's no live order or it has reached a terminal state (picked up / refunded /
 * failed) — the header owns retiring the stored key.
 */
export function HomeResumeCard() {
  const { order } = useActiveOrder();
  const { order: tracked } = useOrderStatus(order?.paymentIntent ?? null, null);
  if (!order) return null;
  const done =
    !!tracked &&
    (tracked.togoStatus === "picked_up" ||
      tracked.status === "refunded" ||
      tracked.status === "failed");
  if (done) return null;

  const isPickup = order.mode === "pickup";
  const statusText = !order.paymentIntent
    ? "Your order is in" // split-tender — no client-side live status
    : !tracked
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
