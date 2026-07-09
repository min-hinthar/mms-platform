"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActiveOrder } from "./ActiveOrderProvider";
import { useOrderStatus } from "@/lib/useOrderStatus";
import { getRewardsBadge, type RewardsBadge } from "@/lib/rewards";

/**
 * Persistent top app-bar (M-nav) — the diner's wayfinding spine across every route: brand→home, a contextual
 * "your order" pill that resumes the live tracker, a rewards affordance (Star count + anon "save" nudge)→
 * account, and an off-menu "back to cart" link. Mounted once in the root layout (inside MotionProvider); it
 * early-returns on `/staff` (staff run their own console), mirroring AnonAuthGate's path-exclusion.
 *
 * Cart is a LINK, not a live counter: `useCart()`/TableCartProvider wrap only the menu subtree, so a
 * root-layout bar has no provider on `/cart`/`/track`/`/account`. It shows only off-menu when a cart id is
 * known (the menu's bottom CartBar owns the live count there) — no second source of truth to diverge.
 *
 * Live status comes from `useOrderStatus` (single-pay key). Split-tender has no client-side PI, so its pill
 * links to `/track?cart=…&paid=1` (status resolves server-side there) rather than showing a live label.
 */
export function AppHeader() {
  const pathname = usePathname();
  const hidden = pathname?.startsWith("/staff") ?? false;

  const { order, cartId, clearOrder } = useActiveOrder();
  // Single-pay orders carry a PI → live status; split-tender (paymentIntent null) no-ops the hook (generic pill).
  const { order: tracked } = useOrderStatus(order?.paymentIntent ?? null, null);

  const [badge, setBadge] = useState<RewardsBadge | null>(null);
  const orderKey = order?.paymentIntent ?? order?.cartId ?? null;
  useEffect(() => {
    if (hidden) return;
    let active = true;
    // Async server-action read → setState in the .then is async (lint-safe). Refetch when a new order lands
    // (its Star may have incremented). A transient failure just leaves the plain "Rewards" label.
    getRewardsBadge()
      .then((b) => {
        if (active) setBadge(b);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [hidden, orderKey]);

  // Terminal live states retire the resumable order (picked up / refunded / failed). clearOrder defers its
  // setState (rAF), so calling it from this status effect stays lint-safe.
  const isDone =
    !!tracked &&
    (tracked.togoStatus === "picked_up" ||
      tracked.status === "refunded" ||
      tracked.status === "failed");
  useEffect(() => {
    if (order && isDone) clearOrder();
  }, [order, isDone, clearOrder]);

  if (hidden) return null;

  // The order pill is redundant on the homepage (the resume card lives there) and on /track (you're already
  // watching it) — show it everywhere else while an order is live.
  const showOrder = !!order && !isDone && pathname !== "/track" && pathname !== "/";
  const onMenu = pathname === "/menu";
  const showCart = !!cartId && !order && !onMenu && pathname !== "/cart";

  const mode = order?.mode ?? "scango";
  const base = mode === "pickup" ? "Pickup" : "Your order";
  const ready = tracked?.togoStatus === "ready";
  const orderLabel = !order?.paymentIntent
    ? base // split-tender: no client-side live status
    : !tracked
      ? `${base} · Confirming`
      : ready
        ? `${base} · Ready`
        : tracked.togoStatus === "preparing"
          ? `${base} · Preparing`
          : `${base} · Placed`;
  const orderHref = order?.paymentIntent
    ? `/track?payment_intent=${encodeURIComponent(order.paymentIntent)}&redirect_status=succeeded${order.cartId ? `&cart=${encodeURIComponent(order.cartId)}` : ""}`
    : `/track?cart=${encodeURIComponent(order?.cartId ?? "")}&paid=1`;

  const anonWithStars = !!badge && !badge.isUpgraded && badge.stars > 0;
  const rewardsAria = badge
    ? `Rewards, ${badge.stars} ${badge.stars === 1 ? "Star" : "Stars"}${anonWithStars ? " — save them to an account" : ""}`
    : "Rewards and account";

  return (
    <header className="app-header">
      <Link href="/" className="app-header-brand" aria-label="Mandalay Morning Star — home">
        <span className="app-header-star" aria-hidden>
          ✦
        </span>
        <span>Morning Star</span>
      </Link>

      <nav className="app-header-actions" aria-label="Account and order">
        {showOrder && (
          <Link
            href={orderHref}
            className={`app-header-order${ready ? " app-header-order-ready" : ""}`}
            aria-label={`${orderLabel} — view status`}
          >
            <span className="app-header-order-dot" aria-hidden />
            <span>{orderLabel}</span>
          </Link>
        )}
        {showCart && (
          <Link
            href={`/cart?cart=${encodeURIComponent(cartId)}`}
            className="app-header-cart"
            aria-label="Back to your cart"
          >
            <span aria-hidden>🛒</span>
            <span>Cart</span>
          </Link>
        )}
        <Link href="/account" className="app-header-rewards" aria-label={rewardsAria}>
          <span className="app-header-star" aria-hidden>
            ✦
          </span>
          <span>{badge && badge.stars > 0 ? badge.stars : "Rewards"}</span>
          {anonWithStars && (
            <span className="app-header-save" aria-hidden>
              Save
            </span>
          )}
        </Link>
      </nav>
    </header>
  );
}
