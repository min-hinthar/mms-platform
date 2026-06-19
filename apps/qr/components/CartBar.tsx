"use client";
import { useRouter } from "next/navigation";
import { useCart } from "./TableCartProvider";

/**
 * Sticky order bar — appears once the cart has items, navigating to /cart with the server-issued
 * cartId. A real `<button>` (not an `<a>`) so it activates on both Enter AND Space (QA §A P1).
 * Shows the live count + subtotal but is NOT an `aria-live` region — the rolling total must not be
 * announced on every tap (RED-TEAM/QA); the static `aria-label` is read on focus only.
 */
export function CartBar() {
  const router = useRouter();
  const { count, totals, cartId } = useCart();
  if (!cartId || count === 0) return null;
  const subtotalCents = totals?.subtotalCents ?? 0;
  const dollars = `$${(subtotalCents / 100).toFixed(2)}`;

  return (
    <button
      type="button"
      onClick={() => router.push(`/cart?cart=${encodeURIComponent(cartId)}`)}
      aria-label={`View order — ${count} ${count === 1 ? "item" : "items"}, subtotal ${dollars}`}
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
        alignItems: "center",
        border: "none",
        font: "inherit",
        fontWeight: 800,
        cursor: "pointer",
      }}
    >
      <span>
        View order · {count} {count === 1 ? "item" : "items"}
      </span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{dollars}</span>
    </button>
  );
}
