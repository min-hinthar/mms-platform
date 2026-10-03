/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 3a (D1) — the tab bar rendered for real: four links, the lit one `aria-current="page"`, the
 * claims in the accessible names, hidden on staff chrome, and (blind pass on #312, critical 2) no
 * dot and no resume href for an order the status hook reads as DONE on /account.
 */
let pathname = "/menu";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("./TransitionNav", () => ({
  TransitionLink: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children?: React.ReactNode;
    [k: string]: unknown;
  }) => (
    <a href={href} {...(rest as object)}>
      {children}
    </a>
  ),
}));
const store = {
  cartId: "c1" as string | null,
  cartCount: 2 as number | null,
  mode: "pickup" as string | null,
  order: null as { paymentIntent: string | null; cartId: string | null } | null,
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
  store.cartId = "c1";
  store.cartCount = 2;
  store.mode = "pickup";
  store.order = null;
  isDone = false;
  statusCalls.length = 0;
  badge.mockResolvedValue({ stars: 4, tierId: "new", isUpgraded: false });
});
afterEach(cleanup);

describe("DinerTabs", () => {
  it("four links, the current one marked, the claims in the names", async () => {
    render(<DinerTabs />);
    const links = screen.getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/menu?mode=pickup",
      "/cart?cart=c1",
      "/track",
      "/account",
    ]);
    expect(links.map((a) => a.getAttribute("aria-current"))).toEqual(["page", null, null, null]);
    expect(links[1]!.getAttribute("aria-label")).toBe("Order — 2 items");
    await waitFor(() => expect(links[3]!.getAttribute("aria-label")).toBe("Account — 4 Stars"));
  });
  it("draws nothing on staff chrome, and opens no status subscription there", () => {
    pathname = "/staff/kitchen";
    const { container } = render(<DinerTabs />);
    expect(container.querySelector("nav")).toBeNull();
    expect(statusCalls.every((t) => t === false)).toBe(true);
  });
  it("a live order lights Track's dot and resumes it; a DONE one on /account does neither", () => {
    store.order = { paymentIntent: "pi_1", cartId: "c1" };
    render(<DinerTabs />);
    expect(
      screen.getByRole("link", { name: "Track — an order in progress" }).getAttribute("href"),
    ).toContain("payment_intent=pi_1");
    cleanup();
    pathname = "/account";
    isDone = true;
    render(<DinerTabs />);
    expect(screen.getByRole("link", { name: "Track" }).getAttribute("href")).toBe("/track");
    // On /account the bar is the one subscriber (the header's pill is off there).
    expect(statusCalls.at(-1)).toBe(true);
  });
  it("subscribes to the status only on /account — one channel per route", () => {
    render(<DinerTabs />);
    expect(statusCalls.every((t) => t === false)).toBe(true);
  });
  it("a failed badge read leaves the plain Account label", async () => {
    badge.mockRejectedValue(new Error("down"));
    render(<DinerTabs />);
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.getByRole("link", { name: "Account" })).toBeTruthy();
  });
});
