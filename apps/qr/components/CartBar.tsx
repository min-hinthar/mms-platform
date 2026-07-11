"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { NumberFlow } from "@mms/ui";
import { useJourneyRouter } from "./nav/TransitionNav";
import { useCart } from "./TableCartProvider";

/**
 * Sticky order bar — appears once the cart has items, navigating to /cart with the server-issued
 * cartId. A real `<button>` (not an `<a>`) so it activates on both Enter AND Space (QA §A P1).
 * Shows the live count + subtotal but is NOT an `aria-live` region — the rolling total must not be
 * announced on every tap (RED-TEAM/QA); the static `aria-label` is read on focus only.
 */
export function CartBar() {
  const router = useRouter(); // prefetch only — the navigation itself rides the journey grammar below
  const journey = useJourneyRouter(); // J1: menu→cart is a FORWARD cut; the total morphs into the checkout hero
  const { count, totals, cartId } = useCart();
  const href = cartId ? `/cart?cart=${encodeURIComponent(cartId)}` : null;
  // Warm the /cart route (its RSC payload + code + the new loading skeleton) as soon as the bar can
  // appear, so a tap navigates without a cold server round-trip — the "opening the cart is slow" fix.
  useEffect(() => {
    if (href) router.prefetch(href);
  }, [href, router]);
  if (!cartId || !href || count === 0) return null;
  const subtotalCents = totals?.subtotalCents ?? 0;
  const dollars = `$${(subtotalCents / 100).toFixed(2)}`;

  return (
    <button
      type="button"
      onClick={() => journey.push(href)}
      onPointerEnter={() => router.prefetch(href)}
      aria-label={`View order — ${count} ${count === 1 ? "item" : "items"}, subtotal ${dollars}`}
      className="card"
      style={{
        position: "fixed",
        left: 12,
        right: 12,
        // clear the iOS home-bar inset so the bar isn't half-hidden behind it (position, not padding)
        bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
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
      {/* Roll the subtotal as it changes (R7a). The button's accessible name is the static aria-label
          above (read on focus) — the rolling figure is presentation, not a per-tap announcement.
          `.vt-cart-total` (J1): on the menu→cart cut this figure MORPHS into the checkout hero total —
          the money the diner is watching never blinks out of existence. */}
      <span className="vt-cart-total" style={{ fontVariantNumeric: "tabular-nums" }}>
        <NumberFlow value={subtotalCents / 100} format={{ style: "currency", currency: "USD" }} />
      </span>
    </button>
  );
}
