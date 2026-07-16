"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
// J1: header navs ride the journey grammar (direction-stamped view transitions) — drop-in Link swap.
import { TransitionLink as Link } from "./nav/TransitionNav";
import { browserClient } from "@mms/db";
import { useActiveOrder } from "./ActiveOrderProvider";
import { useActiveOrderStatus } from "./useActiveOrderStatus";
import { useLiveOrders } from "@/lib/useLiveOrders";
import { liveOrderTrackHref } from "@/lib/live-order";
import { getRewardsBadge, type RewardsBadge } from "@/lib/rewards";
import { WalletChip } from "./WalletChip";
import { OrdersTray } from "./OrdersTray";

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
  // Staff run their own console; /board (W3e) is a wall TV — diner wayfinding chrome on either is noise.
  const hidden = (pathname?.startsWith("/staff") || pathname?.startsWith("/board")) ?? false;

  const { cartId } = useActiveOrder();
  // The order affordance is redundant where a dedicated surface already shows it: the homepage resume card
  // (`/`), the live tracker (`/track`), and the /account "Today" section — so hide it (and skip its fetch)
  // on all three.
  const track = !hidden && pathname !== "/" && pathname !== "/track" && pathname !== "/account";
  const { order, statusWord, ready, isDone } = useActiveOrderStatus(track);

  const [badge, setBadge] = useState<RewardsBadge | null>(null);
  const orderKey = order?.paymentIntent ?? order?.cartId ?? null;
  // K4 — the diner's LIVE orders (server-derived), refetched on visibility/focus + when the poke changes:
  // a new order (orderKey) or an in-app navigation (pathname, matching the rewards badge's freshness). Only
  // fetched where the pill can show (`track`); no new realtime channels.
  const { orders: liveOrders } = useLiveOrders(track, `${orderKey ?? ""}:${pathname ?? ""}`);
  const [trayOpen, setTrayOpen] = useState(false);
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

  // The order affordance is redundant on the homepage (the resume card lives there) and on /track (you're
  // already watching it); `track` excludes both, so show it everywhere else while an order is live.
  const onMenu = pathname === "/menu";

  // K4 — one affordance for however many orders are in flight:
  //  • ≥2 live  → a count-badged pill that opens the tray (it earns its ink only when it disambiguates).
  //  • ≤1 live  → the single pill: this device's own just-placed order (instant, realtime status word) if
  //    known, else the lone server order (a cross-device order this device didn't place).
  //  • 0        → nothing.
  const liveCount = liveOrders.length;
  const clientLive = !!order && !isDone; // this device's order — realtime status, shows instantly on pay
  const showTray = track && liveCount >= 2;
  const serverSingle = !clientLive && liveCount === 1 ? liveOrders[0]! : null;
  const showSingle = track && !showTray && (clientLive || !!serverSingle);
  const hasOrderPill = showSingle || showTray;

  // The single pill's link + label: from the client order (realtime status) or the lone server order.
  let singleHref = "";
  let singleBase = "Your order";
  let singleWord: string | null = null;
  let singleReady = false;
  if (clientLive && order) {
    singleHref = liveOrderTrackHref(order);
    singleBase = order.mode === "pickup" ? "Pickup" : "Your order";
    singleWord = statusWord; // the base+status split lets the word drop on very narrow phones (dot stays)
    singleReady = ready;
  } else if (serverSingle) {
    singleHref = liveOrderTrackHref(serverSingle);
    singleBase = serverSingle.kind === "pickup" ? "Pickup" : "Your order";
    singleWord = serverSingle.statusWord;
    singleReady = serverSingle.togoStatus === "ready";
  }

  // Cart affordance yields to ANY order pill (single or tray) — an order supersedes its now-placed cart.
  const showCart = !!cartId && !showSingle && !showTray && !onMenu && pathname !== "/cart";

  const anonWithStars = !!badge && !badge.isUpgraded && badge.stars > 0;
  const rewardsAria = badge
    ? `Rewards, ${badge.stars} ${badge.stars === 1 ? "Star" : "Stars"}${anonWithStars ? " — save them to an account" : ""}`
    : "Rewards and account";

  return (
    <header className={`app-header${hasOrderPill ? " app-header--has-order" : ""}`}>
      <Link href="/" className="app-header-brand" aria-label="Mandalay Morning Star — home">
        <span className="app-header-star" aria-hidden>
          ✦
        </span>
        <span className="app-header-brand-word">Morning Star</span>
      </Link>

      <nav className="app-header-actions" aria-label="Account and order">
        {showSingle && (
          <Link
            href={singleHref}
            className={`app-header-order${singleReady ? " app-header-order-ready" : ""}`}
            aria-label={`${singleBase}${singleWord ? ` · ${singleWord}` : ""} — view status`}
          >
            <span className="app-header-order-dot" aria-hidden />
            {/* `.vt-order-status` (J1): on the pill→/track cut this label MORPHS into the tracker's
                status chip — the diner follows their order's status across the navigation. The pill
                hides on /track, so the view-transition name is never duplicated in one document. */}
            <span className="app-header-order-label vt-order-status">
              {singleBase}
              {singleWord && <span className="app-header-order-status"> · {singleWord}</span>}
            </span>
          </Link>
        )}
        {showTray && (
          <button
            type="button"
            onClick={() => setTrayOpen(true)}
            className="app-header-order app-header-order-tray"
            aria-haspopup="dialog"
            aria-expanded={trayOpen}
            aria-label={`${liveCount} orders in progress — open your orders`}
          >
            <span className="app-header-order-dot" aria-hidden />
            <span className="app-header-order-label">Orders</span>
            <span className="app-header-order-count" aria-hidden>
              {liveCount}
            </span>
          </button>
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
      {/* Radix portals the sheet to <body>; `open` folds to false when there's nothing to show, so a
          completing order can't leave the tray stranded open. */}
      <OrdersTray
        open={trayOpen && liveOrders.length > 0}
        onOpenChange={setTrayOpen}
        orders={liveOrders}
      />
    </header>
  );
}
