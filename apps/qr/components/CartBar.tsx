"use client";
import Link from "next/link";
import { useCart } from "./TableCartProvider";

/**
 * Sticky order bar — appears once the cart has items, linking to /cart with the server-issued
 * cartId. Shows the live count + subtotal (server-authoritative); not an `aria-live` region (the
 * rolling total must not be announced on every tap — RED-TEAM/QA).
 */
export function CartBar() {
  const { count, totals, cartId } = useCart();
  if (!cartId || count === 0) return null;
  const subtotalCents = totals?.subtotalCents ?? 0;

  return (
    <Link
      href={`/cart?cart=${cartId}`}
      className="card"
      style={{
        position: "fixed",
        left: 12,
        right: 12,
        bottom: 16,
        maxWidth: 416,
        margin: "0 auto",
        background: "var(--ac)",
        color: "var(--oa)",
        padding: "14px 18px",
        display: "flex",
        justifyContent: "space-between",
        textDecoration: "none",
        fontWeight: 800,
      }}
    >
      <span>
        View order · {count} {count === 1 ? "item" : "items"}
      </span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>
        ${(subtotalCents / 100).toFixed(2)}
      </span>
    </Link>
  );
}
