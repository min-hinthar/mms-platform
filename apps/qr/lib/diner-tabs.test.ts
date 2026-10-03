import { describe, expect, it } from "vitest";
import { activeDinerTab, dinerTabs, dinerTabsHidden } from "./diner-tabs";

/**
 * Phase 3a (D1) — the diner spine's DECISIONS, pure: where each tab goes, which one is lit, what
 * each may claim, and where the bar is not drawn at all.
 */
const base = {
  pathname: "/menu",
  mode: "pickup" as string | null,
  cartId: "c1" as string | null,
  cartCount: 2 as number | null,
  order: null as { paymentIntent: string | null; cartId: string | null } | null,
  stars: 0 as number | null,
};

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

describe("activeDinerTab — one lit tab per route", () => {
  it.each([
    ["/", "menu"],
    ["/dine-in", "menu"],
    ["/menu", "menu"],
    ["/grocery", "menu"],
    ["/cart", "order"],
    ["/track", "track"],
    ["/account", "account"],
    ["/rewards", "account"],
  ])("%s lights %s", (p, tab) => {
    expect(activeDinerTab(p)).toBe(tab);
  });
  it("lights nothing on a route the spine does not know", () => {
    expect(activeDinerTab("/not-found-ish")).toBeNull();
  });
});

describe("dinerTabs — hrefs and claims", () => {
  it("Menu carries the diner's mode; a known-empty mode goes to the door picker", () => {
    expect(dinerTabs({ ...base, mode: "dinein" })[0]).toMatchObject({
      key: "menu",
      label: "Menu",
      href: "/menu?mode=dinein",
    });
    expect(dinerTabs({ ...base, mode: null })[0]).toMatchObject({ href: "/" });
  });
  it("on /dine-in the route's door wins over a stale remembered mode (Codex round 1 on #312)", () => {
    const t = dinerTabs({ ...base, pathname: "/dine-in", mode: "scango", cartCount: 3 });
    expect(t[0]).toMatchObject({ label: "Menu", href: "/menu?mode=dinein", current: true });
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
  it("Order opens the published cart, else the bare /cart (its own empty slip)", () => {
    expect(dinerTabs(base)[1]).toMatchObject({ key: "order", href: "/cart?cart=c1", badge: 2 });
    expect(dinerTabs({ ...base, cartId: null })[1]).toMatchObject({ href: "/cart", badge: null });
  });
  it("Order is named by the mode's noun", () => {
    expect(dinerTabs({ ...base, mode: "scango" })[1]!.label).toBe("Basket");
    expect(dinerTabs({ ...base, mode: "dinein" })[1]!.label).toBe("Order");
  });
  it("Order never claims a count for a SHARED dine-in cart, and never a zero", () => {
    expect(dinerTabs({ ...base, mode: "dinein" })[1]!.badge).toBeNull();
    expect(dinerTabs({ ...base, cartCount: 0 })[1]!.badge).toBeNull();
    expect(dinerTabs({ ...base, cartCount: null })[1]!.badge).toBeNull();
  });
  it("Track resumes the live order when there is one, with its dot", () => {
    const t = dinerTabs({ ...base, order: { paymentIntent: "pi_1", cartId: "c1" } })[2]!;
    expect(t.key).toBe("track");
    expect(t.href).toContain("payment_intent=pi_1");
    expect(t.href).toContain("resume=1");
    expect(t.badge).toBe("dot");
  });
  it("Track with nothing live is the plain page (its own empty slip)", () => {
    expect(dinerTabs(base)[2]).toMatchObject({ href: "/track", badge: null });
  });
  it("Account carries the Star count only when there is one", () => {
    expect(dinerTabs({ ...base, stars: 7 })[3]).toMatchObject({
      key: "account",
      href: "/account",
      badge: 7,
    });
    expect(dinerTabs({ ...base, stars: 0 })[3]!.badge).toBeNull();
    expect(dinerTabs({ ...base, stars: null })[3]!.badge).toBeNull();
  });
  it("exactly one tab is current, and it matches activeDinerTab", () => {
    const tabs = dinerTabs({ ...base, pathname: "/cart" });
    expect(tabs.filter((t) => t.current).map((t) => t.key)).toEqual(["order"]);
  });
});
