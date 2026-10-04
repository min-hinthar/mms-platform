/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 3a (D1) — the tab bar rendered for real: four links, the lit one `aria-current="page"`, the
 * claims in the accessible names, hidden on staff chrome, and (blind pass on #312, critical 2) no
 * dot and no resume href for an order the status hook reads as DONE on /account.
 */
let pathname = "/menu";
let search = "";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(search),
}));
const push = vi.fn();
vi.mock("./TransitionNav", async () => {
  // The mock keeps the ONE rule of the real grammar that this bar's drain depends on: an in-tab click
  // bumps the epoch AFTER the consumer's handler ran and only if that handler did not take the
  // navigation over (deep pass on #312 — a bare `<a>` here let a double tap pass while the shipped
  // bar navigated zero times).
  const { navEpoch } = await vi.importActual<typeof import("@/lib/nav-epoch")>("@/lib/nav-epoch");
  return {
    useJourneyRouter: () => ({ push }),
    TransitionLink: ({
      href,
      children,
      onClick,
      ...rest
    }: {
      href: string;
      children?: React.ReactNode;
      onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
      [k: string]: unknown;
    }) => (
      <a
        href={href}
        {...(rest as object)}
        onClick={(e) => {
          onClick?.(e);
          const inTab = e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
          if (inTab && !e.defaultPrevented) navEpoch.bump();
        }}
      >
        {children}
      </a>
    ),
  };
});
const drain = vi.fn<() => Promise<void>>();
const store = {
  cartId: "c1" as string | null,
  cartCount: 2 as number | null,
  mode: "pickup" as string | null,
  order: null as { paymentIntent: string | null; cartId: string | null } | null,
  drain: () => drain(),
};
vi.mock("../ActiveOrderProvider", () => ({ useActiveOrder: () => store }));
let isDone = false;
const statusCalls: boolean[] = [];
vi.mock("../useActiveOrderStatus", () => ({
  useActiveOrderStatus: (track: boolean) => {
    statusCalls.push(track);
    return { isDone };
  },
}));
const badge = vi.fn();
vi.mock("@/lib/rewards", () => ({ getRewardsBadge: () => badge() }));
const unsubscribe = vi.fn();
vi.mock("@mms/db", () => ({
  browserClient: () => ({
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe } } }) },
  }),
}));

const { DinerTabs } = await import("./DinerTabs");

beforeEach(() => {
  pathname = "/menu";
  search = "";
  store.cartId = "c1";
  store.cartCount = 2;
  store.mode = "pickup";
  store.order = null;
  isDone = false;
  statusCalls.length = 0;
  badge.mockResolvedValue({ stars: 4, tierId: "new", isUpgraded: false });
  push.mockReset();
  drain.mockReset();
  drain.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("DinerTabs", () => {
  it("three links, the current one marked, the claims in the names (Phase 3b, D7)", async () => {
    render(<DinerTabs />);
    const links = screen.getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/menu?mode=pickup",
      "/cart?cart=c1",
      "/account",
    ]);
    expect(links.map((a) => a.getAttribute("aria-current"))).toEqual(["page", null, null]);
    expect(links[1]!.getAttribute("aria-label")).toBe("Order — 2 items");
    await waitFor(() => expect(links[2]!.getAttribute("aria-label")).toBe("Account — 4 Stars"));
  });
  it("with no cart the Order tab follows the live order — its resume href, its dot, the mode's noun", () => {
    store.cartId = null;
    store.cartCount = null;
    store.order = { paymentIntent: "pi_1", cartId: "c1" };
    render(<DinerTabs />);
    const order = screen.getByRole("link", { name: "Order — an order in progress" });
    expect(order.getAttribute("href")).toContain("payment_intent=pi_1");
    expect(order.getAttribute("data-tab")).toBe("order");
    expect(screen.queryByRole("link", { name: /Track/ })).toBeNull();
  });
  it("on the threshold nothing is lit and the Menu tab leads up to the doors (D8)", () => {
    pathname = "/dine-in";
    render(<DinerTabs />);
    const links = screen.getAllByRole("link");
    expect(links.map((a) => a.getAttribute("aria-current"))).toEqual([null, null, null]);
    expect(links[0]!.getAttribute("href")).toBe("/");
  });
  it("draws nothing on staff chrome, and opens no status subscription there", () => {
    pathname = "/staff/kitchen";
    const { container } = render(<DinerTabs />);
    expect(container.querySelector("nav")).toBeNull();
    expect(statusCalls.every((t) => t === false)).toBe(true);
  });
  it("a live order lights the Order tab's dot and resumes it; a DONE one on /account does neither", () => {
    store.cartId = null;
    store.cartCount = null;
    store.order = { paymentIntent: "pi_1", cartId: "c1" };
    render(<DinerTabs />);
    expect(
      screen.getByRole("link", { name: "Order — an order in progress" }).getAttribute("href"),
    ).toContain("payment_intent=pi_1");
    cleanup();
    pathname = "/account";
    isDone = true;
    render(<DinerTabs />);
    expect(screen.getByRole("link", { name: "Order" }).getAttribute("href")).toBe("/cart");
    // On /account the bar is the one subscriber (the header's pill is off there).
    expect(statusCalls.at(-1)).toBe(true);
  });
  it("subscribes to the status only on /account — one channel per route", () => {
    render(<DinerTabs />);
    expect(statusCalls.every((t) => t === false)).toBe(true);
  });
  it("the Order tab DRAINS the cart's in-flight writes before it navigates (Codex round 3)", async () => {
    // CartBar's W21 rule, on the one other door to /cart: an add still in flight when the tab is
    // tapped could be missed by /cart's first read or refused by its create-intent lock. The link
    // is intercepted, the barrier awaited, and only then does the journey push.
    let release!: () => void;
    drain.mockReturnValue(
      new Promise<void>((r) => {
        release = r;
      }),
    );
    render(<DinerTabs />);
    const order = screen.getByRole("link", { name: "Order — 2 items" });
    const ev = fireEvent.click(order);
    expect(ev).toBe(false); // the link's own navigation is cancelled — the push is the navigation
    expect(drain).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
    await waitFor(() => expect(order.getAttribute("aria-busy")).toBe("true"));
    release();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/cart?cart=c1"));
    expect(order.getAttribute("aria-busy")).toBeNull();
    // A second tap during the drain is ONE navigation, not two — and not zero: the impatient
    // re-tap must neither start a second drain nor cancel the first (deep pass on #312).
    push.mockClear();
    let release2!: () => void;
    drain.mockReturnValue(
      new Promise<void>((r) => {
        release2 = r;
      }),
    );
    fireEvent.click(order);
    fireEvent.click(order);
    expect(drain).toHaveBeenCalledTimes(2);
    release2();
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    expect(push).toHaveBeenCalledWith("/cart?cart=c1");
  });
  it("on /track with nothing left to open, the lit Order tab is a self-link to the tracker's own URL (blind pass on 3b)", () => {
    pathname = "/track";
    search = "payment_intent=pi_1&redirect_status=succeeded&resume=1";
    store.cartId = null;
    store.cartCount = null;
    store.order = null;
    render(<DinerTabs />);
    const order = screen.getByRole("link", { name: "Order" });
    expect(order.getAttribute("aria-current")).toBe("page");
    expect(order.getAttribute("href")).toBe(
      "/track?payment_intent=pi_1&redirect_status=succeeded&resume=1",
    );
  });
  it("a competing navigation during the drain CANCELS the queued push — the diner is never yanked back (Codex round 1 on 3b)", async () => {
    let release!: () => void;
    drain.mockReturnValue(
      new Promise<void>((r) => {
        release = r;
      }),
    );
    const { rerender } = render(<DinerTabs />);
    fireEvent.click(screen.getByRole("link", { name: "Order — 2 items" }));
    expect(drain).toHaveBeenCalledTimes(1);
    // The diner taps Account (or the header, or Back) while the write still drains: the route moves.
    pathname = "/account";
    rerender(<DinerTabs />);
    release();
    await new Promise((r) => setTimeout(r, 10));
    expect(push).not.toHaveBeenCalled();
    expect(
      screen.getByRole("link", { name: "Order — 2 items" }).getAttribute("aria-busy"),
    ).toBeNull();
  });
  it("a navigation that merely STARTED during the drain cancels the push — before any route commits (Codex round 2 on 3b)", async () => {
    // `hereRef` moves only when `usePathname()` commits; TransitionLink starts the transition router
    // on the click. In that window the route is unchanged and the old guard let the push through.
    const { navEpoch } = await import("@/lib/nav-epoch");
    let release!: () => void;
    drain.mockReturnValue(
      new Promise<void>((r) => {
        release = r;
      }),
    );
    render(<DinerTabs />);
    fireEvent.click(screen.getByRole("link", { name: "Order — 2 items" }));
    navEpoch.bump(); // the header brand, a TransitionLink elsewhere, Back — any navigation starting
    release();
    await new Promise((r) => setTimeout(r, 10));
    expect(push).not.toHaveBeenCalled();
  });
  it("a modified click on the Order tab is the link it is — no drain, no push", () => {
    render(<DinerTabs />);
    const order = screen.getByRole("link", { name: "Order — 2 items" });
    expect(fireEvent.click(order, { metaKey: true })).toBe(true);
    expect(drain).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
  it("a failed badge read leaves the plain Account label", async () => {
    badge.mockRejectedValue(new Error("down"));
    render(<DinerTabs />);
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.getByRole("link", { name: "Account" })).toBeTruthy();
  });
});
