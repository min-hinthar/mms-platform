import { liveOrderTrackHref } from "./live-order";
import { menuHref } from "./menu-href";
import { orderNoun, slotCount } from "./order-noun";

/**
 * Phase 3a (D1, `docs/PHASE3_JOURNEYS.md`) — the diner spine's decisions, pure.
 *
 * The v7.2 prototype's persistent tab bar (Order · Track · Rewards · Account) was never built; the
 * app shipped a top header whose order slot, rewards chip and cart link appeared and vanished by
 * route, so no screen answered "where am I, where can I go" without reading. Four tabs, always the
 * same four, on every diner route:
 *
 *   Menu    — the diner's own menu (`menuHref` carries the mode; unknown → the door picker). In the
 *             market the first tab IS the market: "Market" → /grocery.
 *   Order   — the open cart, named by the mode's noun (`orderNoun`: Order / Basket). The count it may
 *             claim is `slotCount`'s rule (never a shared dine-in cart's, never a zero).
 *   Track   — the live order (this device's, with its dot) or the plain /track page, whose own empty
 *             slip is honest about having nothing to show.
 *   Account — the Rewards & account hub, carrying the Star count when there is one.
 *
 * Nothing here fetches: the inputs are the wayfinding store (mode · cart · order) and the rewards
 * badge the header used to carry. A tab never appears or disappears — only its target and its
 * claim change — so the map is stable under the thumb.
 */
export type DinerTabKey = "menu" | "order" | "track" | "account";

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

export function activeDinerTab(pathname: string | null): DinerTabKey | null {
  switch (pathname) {
    case "/":
    case "/dine-in":
    case "/menu":
    case "/grocery":
      return "menu";
    case "/cart":
      return "order";
    case "/track":
      return "track";
    case "/account":
    case "/rewards":
      return "account";
    default:
      return null;
  }
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
  mode: string | null;
  cartId: string | null;
  cartCount: number | null;
  order: { paymentIntent: string | null; cartId: string | null } | null;
  stars: number | null;
}): DinerTab[] {
  const active = activeDinerTab(s.pathname);
  const mode = tabsMode(s.pathname, s.mode);
  const count = slotCount(mode, s.cartCount);
  return [
    {
      key: "menu",
      label: mode === "scango" ? "Market" : "Menu",
      href: menuHref(mode),
      badge: null,
      current: active === "menu",
    },
    {
      key: "order",
      label: orderNoun(mode),
      href: s.cartId ? `/cart?cart=${encodeURIComponent(s.cartId)}` : "/cart",
      // A count belongs to ONE cart id (`decodeCartCount`); with no cart there is nothing to count.
      badge: s.cartId && count !== null && count > 0 ? count : null,
      current: active === "order",
    },
    {
      key: "track",
      label: "Track",
      href: s.order ? liveOrderTrackHref(s.order) : "/track",
      badge: s.order ? "dot" : null,
      current: active === "track",
    },
    {
      key: "account",
      label: "Account",
      href: "/account",
      badge: s.stars !== null && s.stars > 0 ? s.stars : null,
      current: active === "account",
    },
  ];
}
