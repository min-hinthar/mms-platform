"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
// J1: header navs ride the journey grammar (direction-stamped view transitions) — drop-in Link swap.
import { TransitionLink as Link } from "./nav/TransitionNav";
import { browserClient } from "@mms/db";
import { useActiveOrder } from "./ActiveOrderProvider";
import { useActiveOrderStatus } from "./useActiveOrderStatus";
import { getRewardsBadge, type RewardsBadge } from "@/lib/rewards";
import { WalletChip } from "./WalletChip";

/**
 * Persistent top app-bar (M-nav) — the diner's wayfinding spine across every route: brand→home, a contextual
 * "your order" pill that resumes the live tracker, a rewards affordance (Star count + anon "save" nudge)→
 * account, and an off-menu "back to cart" link. Mounted once in the root layout (inside MotionProvider); it
 * early-returns on `/staff` (staff run their own console), mirroring AnonAuthGate's path-exclusion.
 *
 * Cart is a LINK, not a live counter: `useCart()`/TableCartProvider wrap only the menu subtree, so a
 * root-layout bar has no provider on `/cart`/`/track`/`/account`. The menu publishes its cart id to the store
 * (CartPublisher), so the link shows off-menu after any menu session (the bottom CartBar owns the live count).
 *
 * Live status (single-pay AND split-tender) comes from `useActiveOrderStatus`, which resolves the split order
 * id server-side. The hook subscribes only where the pill can show (`track`) — not on `/`/`/track`, where the
 * homepage card / OrderTracker already track — so there's one realtime channel per route.
 */
export function AppHeader() {
  const pathname = usePathname();
  const hidden = pathname?.startsWith("/staff") ?? false;

  const { cartId } = useActiveOrder();
  const track = !hidden && pathname !== "/" && pathname !== "/track";
  const { order, statusWord, ready, isDone } = useActiveOrderStatus(track);

  const [badge, setBadge] = useState<RewardsBadge | null>(null);
  const orderKey = order?.paymentIntent ?? order?.cartId ?? null;
  // Refetch on mount, a new order (orderKey), and route change — the Star may be stamped by the webhook
  // AFTER the diner leaves /track, so a route change back to /menu should refresh the count. Async setState
  // (in .then) → lint-safe; a transient failure just leaves the plain "Rewards" label.
  useEffect(() => {
    if (hidden) return;
    let active = true;
    getRewardsBadge()
      .then((b) => {
        if (active) setBadge(b);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [hidden, orderKey, pathname]);

  // React to AUTH changes (anon→account upgrade): the header is mounted once in the root layout and
  // `router.refresh()` re-runs only Server Components — NOT this client effect — so without this the "Save
  // your Stars" nudge + Star count stay stale after sign-in until a full reload. Subscribe to the
  // browserClient() singleton's auth events (it receives the ones AccountUpgrade fires) and refetch, so
  // `isUpgraded` flips true and the nudge disappears the instant the account confirms. Mirrors useAnonSession.
  useEffect(() => {
    if (hidden) return;
    let active = true;
    const supa = browserClient();
    const {
      data: { subscription },
    } = supa.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "USER_UPDATED" || event === "TOKEN_REFRESHED") {
        getRewardsBadge()
          .then((b) => {
            if (active) setBadge(b);
          })
          .catch(() => {});
      }
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [hidden]);

  if (hidden) return null;

  // The order pill is redundant on the homepage (the resume card lives there) and on /track (you're already
  // watching it); `track` already excludes both, so show it everywhere else while an order is live.
  const showOrder = !!order && !isDone && track;
  const onMenu = pathname === "/menu";
  const showCart = !!cartId && !order && !onMenu && pathname !== "/cart";

  const mode = order?.mode ?? "scango";
  const base = mode === "pickup" ? "Pickup" : "Your order";
  // statusWord (base + status split) lets the status word drop on very narrow phones (the colored dot still
  // conveys ready-ness) without truncating the whole label; it now covers split-tender too.
  const orderLabel = statusWord ? `${base} · ${statusWord}` : base;
  const orderHref = order?.paymentIntent
    ? `/track?payment_intent=${encodeURIComponent(order.paymentIntent)}&redirect_status=succeeded${order.cartId ? `&cart=${encodeURIComponent(order.cartId)}` : ""}`
    : `/track?cart=${encodeURIComponent(order?.cartId ?? "")}&paid=1`;

  const anonWithStars = !!badge && !badge.isUpgraded && badge.stars > 0;
  const rewardsAria = badge
    ? `Rewards, ${badge.stars} ${badge.stars === 1 ? "Star" : "Stars"}${anonWithStars ? " — save them to an account" : ""}`
    : "Rewards and account";

  return (
    <header className={`app-header${showOrder ? " app-header--has-order" : ""}`}>
      <Link href="/" className="app-header-brand" aria-label="Mandalay Morning Star — home">
        <span className="app-header-star" aria-hidden>
          ✦
        </span>
        <span className="app-header-brand-word">Morning Star</span>
      </Link>

      <nav className="app-header-actions" aria-label="Account and order">
        {showOrder && (
          <Link
            href={orderHref}
            className={`app-header-order${ready ? " app-header-order-ready" : ""}`}
            aria-label={`${orderLabel} — view status`}
          >
            <span className="app-header-order-dot" aria-hidden />
            {/* `.vt-order-status` (J1): on the pill→/track cut this label MORPHS into the tracker's
                status chip — the diner follows their order's status across the navigation. The pill
                hides on /track, so the view-transition name is never duplicated in one document. */}
            <span className="app-header-order-label vt-order-status">
              {base}
              {statusWord && <span className="app-header-order-status"> · {statusWord}</span>}
            </span>
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
        {/* K3a: a SIGNED-IN diner gets the persistent tier-tinted wallet chip (recognition); an
            anonymous diner keeps the quiet ✦ + count + "Save" nudge (the pitch, gated on !isUpgraded). */}
        {badge?.isUpgraded ? (
          <WalletChip badge={badge} />
        ) : (
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
        )}
      </nav>
    </header>
  );
}
