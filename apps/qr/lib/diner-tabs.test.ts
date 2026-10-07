import { describe, expect, it } from "vitest";
import { activeDinerTab, dinerTabs, dinerTabsHidden, orderTab } from "./diner-tabs";
import { liveOrderTrackHref } from "./live-order";

/**
 * Phase 3a (D1) → 3b (D7 · D8) — the diner spine's DECISIONS, pure: three PLACES (Menu · Order ·
 * Account), the Order tab a state machine that follows the order (open cart → live order → the bare
 * slip), the threshold (`/`, `/dine-in`) lighting NOTHING and leading "up" to the doors, and where the
 * bar is not drawn at all. Every rule here is watched red by flipping it.
 */
const base = {
  pathname: "/menu",
  mode: "pickup" as string | null,
  cartId: "c1" as string | null,
  cartCount: 2 as number | null,
  order: null as { paymentIntent: string | null; cartId: string | null } | null,
  stars: 0 as number | null,
};
const live = { paymentIntent: "pi_1", cartId: "c9" };

describe("dinerTabsHidden — the bar is diner chrome only", () => {
  it.each(["/staff", "/staff/kitchen", "/board", "/kiosk", "/kit"])("hides on %s", (p) => {
    expect(dinerTabsHidden(p)).toBe(true);
  });
  it.each(["/", "/dine-in", "/menu", "/grocery", "/cart", "/track", "/account"])(
    "shows on %s",
    (p) => {
      expect(dinerTabsHidden(p)).toBe(false);
    },
  );
  it("an unknown pathname (null) draws nothing rather than guessing", () => {
    expect(dinerTabsHidden(null)).toBe(true);
  });
});

describe("activeDinerTab — at most one lit tab per route, none on the threshold (D8)", () => {
  it.each([
    ["/menu", "menu"],
    ["/grocery", "menu"],
    ["/cart", "order"],
    ["/track", "order"],
    ["/account", "account"],
    ["/rewards", "account"],
  ])("%s lights %s", (p, tab) => {
    expect(activeDinerTab(p)).toBe(tab);
  });
  it.each(["/", "/dine-in"])("%s is the threshold — before the map, nothing is lit", (p) => {
    // On /dine-in the lit Menu tab's href was the code-free `/menu?mode=dinein` (J15's phantom table)
    // offered as the current place (Phase 3b panel, diagnosis 1).
    expect(activeDinerTab(p)).toBeNull();
  });
  it("lights nothing on a route the spine does not know", () => {
    expect(activeDinerTab("/not-found-ish")).toBeNull();
  });
});

describe("orderTab — the Order tab follows the order (D7)", () => {
  it("an open cart wins: its href and its count", () => {
    expect(orderTab({ mode: "pickup", cartId: "c1", cartCount: 2, order: live })).toEqual({
      href: "/cart?cart=c1",
      badge: 2,
    });
  });
  it("no cart but a live order: the order's own resume href, with the dot", () => {
    expect(orderTab({ mode: "pickup", cartId: null, cartCount: null, order: live })).toEqual({
      href: liveOrderTrackHref(live),
      badge: "dot",
    });
  });
  it("nothing: the bare /cart (its own honest slip), no claim", () => {
    expect(orderTab({ mode: "pickup", cartId: null, cartCount: null, order: null })).toEqual({
      href: "/cart",
      badge: null,
    });
  });
  it("a cart with no count claims nothing but still opens the cart", () => {
    expect(orderTab({ mode: "pickup", cartId: "c1", cartCount: null, order: live })).toEqual({
      href: "/cart?cart=c1",
      badge: null,
    });
  });
});

describe("dinerTabs — three places, their hrefs and claims", () => {
  it("is exactly Menu · Order · Account, in that order", () => {
    expect(dinerTabs(base).map((t) => t.key)).toEqual(["menu", "order", "account"]);
  });
  it("Menu carries the diner's mode; a known-empty mode goes to the door picker", () => {
    expect(dinerTabs({ ...base, mode: "dinein" })[0]).toMatchObject({
      key: "menu",
      label: "Menu",
      href: "/menu?mode=dinein",
    });
    expect(dinerTabs({ ...base, mode: null })[0]).toMatchObject({ href: "/" });
  });
  it.each(["/", "/dine-in"])(
    "on the threshold (%s) the Menu tab leads UP to the doors — never to a menu the route has not entered",
    (pathname) => {
      const t = dinerTabs({ ...base, pathname, mode: "dinein", cartCount: 3 });
      expect(t[0]).toMatchObject({ label: "Menu", href: "/", current: false });
      expect(t[0]!.href).not.toMatch(/^\/menu\?mode=dinein/); // J15's phantom-table link, retired
      expect(t.filter((x) => x.current)).toEqual([]);
    },
  );
  it("on /dine-in the tabs still reason with the route's door, not a stale remembered mode (Codex round 1 on #312)", () => {
    const t = dinerTabs({ ...base, pathname: "/dine-in", mode: "scango", cartCount: 3 });
    expect(t[0]!.label).toBe("Menu");
    expect(t[1]!.label).toBe("Order");
    expect(t[1]!.badge).toBeNull(); // a dine-in cart is shared: no count claimed
  });
  it("on /grocery the route is the market whatever the store remembers", () => {
    const t = dinerTabs({ ...base, pathname: "/grocery", mode: "dinein" });
    expect(t[0]).toMatchObject({ label: "Market", href: "/grocery", current: true });
    expect(t[1]!.label).toBe("Basket");
  });
  it("in the market the first tab IS the market", () => {
    expect(dinerTabs({ ...base, mode: "scango" })[0]).toMatchObject({
      label: "Market",
      href: "/grocery",
    });
  });
  it("Order opens the published cart, else the live order, else the bare /cart", () => {
    expect(dinerTabs(base)[1]).toMatchObject({ key: "order", href: "/cart?cart=c1", badge: 2 });
    expect(dinerTabs({ ...base, cartId: null, order: live })[1]).toMatchObject({
      key: "order",
      href: liveOrderTrackHref(live),
      badge: "dot",
    });
    expect(dinerTabs({ ...base, cartId: null })[1]).toMatchObject({ href: "/cart", badge: null });
  });
  it("Order is named by the mode's noun in every state — a tab never changes shape under the thumb", () => {
    expect(dinerTabs({ ...base, mode: "scango" })[1]!.label).toBe("Basket");
    expect(dinerTabs({ ...base, mode: "scango", cartId: null, order: live })[1]!.label).toBe(
      "Basket",
    );
    expect(dinerTabs({ ...base, mode: "dinein", cartId: null })[1]!.label).toBe("Order");
  });
  it("Order never claims a count for a SHARED dine-in cart, and never a zero", () => {
    expect(dinerTabs({ ...base, mode: "dinein" })[1]!.badge).toBeNull();
    expect(dinerTabs({ ...base, cartCount: 0 })[1]!.badge).toBeNull();
    expect(dinerTabs({ ...base, cartCount: null })[1]!.badge).toBeNull();
  });
  it("a LIT Order tab with nothing to open is a self-link to where you are — never the empty slip (blind pass on 3b)", () => {
    // /track with a finished order: the cart pointer is gone and the tracker retired the order, so
    // the state machine falls through to the bare /cart — a dead end offered as the current place.
    const here = "/track?payment_intent=pi_1&redirect_status=succeeded&resume=1";
    const t = dinerTabs({ ...base, pathname: "/track", here, cartId: null, order: null })[1]!;
    expect(t).toMatchObject({ key: "order", current: true, href: here, badge: null });
    // Unlit, the same state is still the bare slip — the rule is about the lit tab's claim.
    expect(dinerTabs({ ...base, pathname: "/menu", here: "/menu", cartId: null })[1]!.href).toBe(
      "/cart",
    );
    // Lit WITH something to open keeps opening it.
    expect(dinerTabs({ ...base, pathname: "/track", here, cartId: "c1" })[1]!.href).toBe(
      "/cart?cart=c1",
    );
  });
  it("Order is lit on /cart AND on /track — one object, two states, one place", () => {
    expect(dinerTabs({ ...base, pathname: "/cart" })[1]!.current).toBe(true);
    expect(dinerTabs({ ...base, pathname: "/track", cartId: null, order: live })[1]!.current).toBe(
      true,
    );
  });
  it("Account carries the Star count only when there is one", () => {
    expect(dinerTabs({ ...base, stars: 7 })[2]).toMatchObject({
      key: "account",
      href: "/account",
      badge: 7,
    });
    expect(dinerTabs({ ...base, stars: 0 })[2]!.badge).toBeNull();
    expect(dinerTabs({ ...base, stars: null })[2]!.badge).toBeNull();
  });
  it("a dine-in diner with no cart gets the dine-in menu like every door — never the retired /dine-in redirect (J39)", () => {
    // 3c-ii (D27): the dine-in menu is browse-first and `/dine-in` only redirects into it, so a tab
    // that linked it cost a redirect hop. The tab cannot name the session — the menu resolves the
    // persisted code exactly as the door does (J15, at the server) — and a tab tap is not an
    // entrance, so it carries no `door` tag (K0: unclaimed is null). Cart or not, the same menu.
    const base = {
      pathname: "/account",
      mode: "dinein",
      cartCount: null,
      order: null,
      stars: null,
    };
    // MUTATION diner-tabs/menu-tab-takes-the-retired-redirect → "/dine-in"; red.
    expect(dinerTabs({ ...base, cartId: null })[0]).toMatchObject({
      label: "Menu",
      href: "/menu?mode=dinein",
    });
    expect(dinerTabs({ ...base, cartId: "c1" })[0]).toMatchObject({
      label: "Menu",
      href: "/menu?mode=dinein",
    });
    // Every door keeps its menu whether or not a cart exists: nothing to enter first.
    expect(dinerTabs({ ...base, mode: "pickup", cartId: null })[0]?.href).toBe("/menu?mode=pickup");
  });
  it("a LIT Menu tab is a self-link to where you are — on a table or invite URL it keeps the URL's code while the mint still runs (Codex round 2 on #313)", () => {
    // `/menu?mode=dinein&t=…`: cartId is null until useTableSession mints and CartPublisher publishes.
    // Before J39 the current tab's href in that window was `/dine-in`; any non-self href (the bare
    // menu included) drops the URL's `t=` code, so a re-tap would abandon the scanned flow.
    // MUTATION diner-tabs/lit-menu-tab-leaves-the-join → "/menu?mode=dinein"; red.
    const here = "/menu?mode=dinein&t=TBL7";
    expect(
      dinerTabs({ ...base, pathname: "/menu", here, mode: "dinein", cartId: null })[0],
    ).toMatchObject({ key: "menu", current: true, href: here });
    // Off the menu the tab is the bare dine-in menu (J39): the lit tab's code-carrying href is the
    // current place's own, never a destination offered from elsewhere.
    expect(
      dinerTabs({
        ...base,
        pathname: "/account",
        here: "/account",
        mode: "dinein",
        cartId: null,
      })[0]?.href,
    ).toBe("/menu?mode=dinein");
  });
  it("a LIT Account tab is a self-link to where you are — the Rewards panel stays put (deep pass on #312)", () => {
    const base = { mode: "pickup", cartId: null, cartCount: null, order: null, stars: null };
    expect(
      dinerTabs({ ...base, pathname: "/account", here: "/account?tab=rewards" })[2]?.href,
    ).toBe("/account?tab=rewards");
    expect(dinerTabs({ ...base, pathname: "/menu", here: "/menu?mode=pickup" })[2]?.href).toBe(
      "/account",
    );
  });
  it("exactly one tab is current where one is, and it matches activeDinerTab", () => {
    const tabs = dinerTabs({ ...base, pathname: "/cart" });
    expect(tabs.filter((t) => t.current).map((t) => t.key)).toEqual(["order"]);
  });
});
