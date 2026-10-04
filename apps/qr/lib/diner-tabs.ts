import { liveOrderTrackHref } from "./live-order";
import { menuHref } from "./menu-href";
import { orderNoun, slotCount } from "./order-noun";

/**
 * Phase 3a (D1) → 3b (D7 · D8, `docs/PHASE3_JOURNEYS.md`) — the diner spine's decisions, pure.
 *
 * The v7.2 prototype's persistent tab bar was never built; the app shipped a top header whose order
 * slot, rewards chip and cart link appeared and vanished by route, so no screen answered "where am I,
 * where can I go" without reading. 3a drew four tabs (Menu · Order · Track · Account); the 3b panel
 * found that Order and Track are ONE object in two states — before paying, Track opened an empty
 * slip; after paying, Order opened "This order is complete" — so at every moment exactly one of them
 * was a dead end, reproducible in two taps. A tab is a PLACE a diner can always go, never a state that
 * is sometimes empty. Three places, always the same three, on every diner route:
 *
 *   Menu    — the diner's own menu (`menuHref` carries the mode; unknown → the door picker). In the
 *             market the first tab IS the market: "Market" → /grocery. On the THRESHOLD (`/`, the
 *             table picker) it leads UP to the doors — never to a menu the route has not entered: on
 *             `/dine-in` the lit tab used to offer the code-free `/menu?mode=dinein`, J15's
 *             phantom-table link, as the current place (D8).
 *   Order   — `orderTab`: the open cart (`/cart?cart=`, `slotCount`'s badge — never a shared dine-in
 *             count, never a zero, never without a cart id); else the live order (its resume href,
 *             the dot); else the bare /cart, whose own slip is honest about having nothing. Named by
 *             the mode's noun (`orderNoun`: Order / Basket) in every state — a tab never changes
 *             shape under the thumb, only its claim. Lit on /cart AND /track.
 *   Account — the Rewards & account hub, carrying the Star count when there is one.
 *
 * Nothing here fetches: the inputs are the wayfinding store (mode · cart · order) and the rewards
 * badge the header used to carry. The threshold lights nothing (D8): before the map, the diner is
 * nowhere on it yet, and a lit tab there was the one lie the bar told.
 *
 * A LIT tab's href is where you are. On /track with a finished order the cart pointer is gone and
 * the tracker has retired the order, so the state machine falls through to the bare /cart — which,
 * offered as the CURRENT place, was a dead end lit gold (blind pass on 3b). So a current Order tab
 * with nothing else to open links to `here` (the route's own URL, query included), never the slip.
 */
export type DinerTabKey = "menu" | "order" | "account";

export type DinerTab = {
  key: DinerTabKey;
  label: string;
  href: string;
  /** A number badge, a plain dot, or nothing. */
  badge: number | "dot" | null;
  current: boolean;
};

/** Staff, the wall TV, the kiosk and the primitives sheet run their own chrome. */
export function dinerTabsHidden(pathname: string | null): boolean {
  if (!pathname) return true;
  return (
    pathname.startsWith("/staff") ||
    pathname.startsWith("/board") ||
    pathname.startsWith("/kiosk") ||
    pathname.startsWith("/kit")
  );
}

/** The threshold: before the map. Nothing is lit here, and Menu leads up to the doors (D8). */
export function isThreshold(pathname: string | null): boolean {
  return pathname === "/" || pathname === "/dine-in";
}

export function activeDinerTab(pathname: string | null): DinerTabKey | null {
  switch (pathname) {
    case "/menu":
    case "/grocery":
      return "menu";
    case "/cart":
    case "/track":
      return "order";
    case "/account":
    case "/rewards":
      return "account";
    default:
      return null; // the threshold (`/`, `/dine-in`) and routes the spine does not know
  }
}

/**
 * The Order tab's state machine (D7): an open cart wins; else the live order; else the bare slip.
 * The cart wins over a PAID order's dot on purpose — the header's live-order chip still carries that
 * order, as it did before 3a — because the thing the diner can still change comes first.
 */
export function orderTab(s: {
  mode: string | null;
  cartId: string | null;
  cartCount: number | null;
  order: { paymentIntent: string | null; cartId: string | null } | null;
}): { href: string; badge: number | "dot" | null } {
  if (s.cartId) {
    const count = slotCount(s.mode, s.cartCount);
    // A count belongs to ONE cart id (`decodeCartCount`); with no cart there is nothing to count.
    return {
      href: `/cart?cart=${encodeURIComponent(s.cartId)}`,
      badge: count !== null && count > 0 ? count : null,
    };
  }
  if (s.order) return { href: liveOrderTrackHref(s.order), badge: "dot" };
  return { href: "/cart", badge: null };
}

/**
 * The mode the tabs REASON with: the route's own door where the route IS a door, else the
 * wayfinding store's remembered mode. `/dine-in` and `/grocery` carry no `?mode=` for the store
 * to read, so after a market visit a diner choosing Dine-in saw the first tab lit as "Market"
 * (→ /grocery) and the Order tab named "Basket" while picking a table (Codex round 1 on #312).
 */
export function tabsMode(pathname: string | null, mode: string | null): string | null {
  if (pathname === "/dine-in") return "dinein";
  if (pathname === "/grocery") return "scango";
  return mode;
}

export function dinerTabs(s: {
  pathname: string | null;
  /** The current URL (path + query) — a lit tab with nothing else to open links back to it. */
  here?: string | null;
  mode: string | null;
  cartId: string | null;
  cartCount: number | null;
  order: { paymentIntent: string | null; cartId: string | null } | null;
  stars: number | null;
}): DinerTab[] {
  const active = activeDinerTab(s.pathname);
  const mode = tabsMode(s.pathname, s.mode);
  const order = orderTab({ mode, cartId: s.cartId, cartCount: s.cartCount, order: s.order });
  return [
    {
      key: "menu",
      label: mode === "scango" ? "Market" : "Menu",
      // On the threshold, "up" is the doors (D8) — the route has entered no menu to return to. A
      // remembered dine-in door with NO cart published through it means no table was entered yet, so
      // Menu leads to the picker — never the code-free `/menu?mode=dinein`, the numberless host-start
      // J15 retired (deep pass on #312). A LIT Menu tab is a self-link to where you are, the Order
      // and Account rule (Codex round 2 on #313): on a table or invite URL (`/menu?mode=dinein&t=…`)
      // the cart is null until the mint lands and CartPublisher publishes, and the picker fallback
      // turned the CURRENT tab into a door out of the join flow for exactly that window.
      href: isThreshold(s.pathname)
        ? "/"
        : active === "menu"
          ? (s.here ?? menuHref(mode))
          : mode === "dinein" && !s.cartId
            ? "/dine-in"
            : menuHref(mode),
      badge: null,
      current: active === "menu",
    },
    {
      key: "order",
      label: orderNoun(mode),
      // A lit tab's href is where you are (docblock): with nothing to open, the route's own URL.
      href: active === "order" && !s.cartId && !s.order ? (s.here ?? order.href) : order.href,
      badge: order.badge,
      current: active === "order",
    },
    {
      key: "account",
      label: "Account",
      // The same rule as Order's: a LIT tab's href is where you are, query included — the bare
      // `/account` would re-render the hub on its default panel under a tab that said "you are here".
      href: active === "account" ? (s.here ?? "/account") : "/account",
      badge: s.stars !== null && s.stars > 0 ? s.stars : null,
      current: active === "account",
    },
  ];
}
