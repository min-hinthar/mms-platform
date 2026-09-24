/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

/**
 * Phase 1c · account-star — /account's ORDER is the design (now → you → what you own → the record →
 * reference → settings), and W9c's invariant rides inside it: a failed rewards read costs the diner
 * their Stars panel, NEVER their order history. Both are pinned by rendering the page component
 * itself — not an array standing in for it (critique med #6, LEARNINGS #60): every child is a stub
 * that reports its slot, and the test reads the order the real JSX produced.
 */
const h = vi.hoisted(() => ({
  getRewardsState: vi.fn(),
  getOrderHistory: vi.fn(),
  getWelcomeBack: vi.fn(),
  ensureProfile: vi.fn(),
  getSessionKind: vi.fn(),
  getMyLiveOrders: vi.fn(),
  getFavoriteDishes: vi.fn(),
  upgradeProps: [] as { stars: number; chooserStars?: number | null }[],
}));
vi.mock("@/lib/rewards", () => ({
  getRewardsState: h.getRewardsState,
  getOrderHistory: h.getOrderHistory,
  getWelcomeBack: h.getWelcomeBack,
  ensureProfile: h.ensureProfile,
  getSessionKind: h.getSessionKind,
}));
vi.mock("@/lib/orders", () => ({
  getMyLiveOrders: h.getMyLiveOrders,
  readMyLiveOrders: async () => ({ ok: true, orders: [] }),
}));
vi.mock("@/lib/favorites", () => ({ getFavoriteDishes: h.getFavoriteDishes }));

const slot = (s: string) =>
  function Slot() {
    return <section data-s={s} />;
  };
vi.mock("@/components/TodayOrders", () => ({ TodayOrders: slot("live") }));
vi.mock("@/components/AccountUpgrade", () => ({
  AccountUpgrade: (p: { stars: number; chooserStars?: number | null }) => {
    h.upgradeProps.push(p);
    return <section data-s="identity" />;
  },
}));
vi.mock("@/components/AccountStatus", () => ({ AccountStatus: slot("identity") }));
vi.mock("@/components/RememberIdentity", () => ({ RememberIdentity: () => null }));
vi.mock("@/components/RewardsHub", () => ({
  RewardsSummary: slot("summary"),
  RewardsDetails: slot("details"),
}));
vi.mock("@/components/OrderHistory", () => ({ OrderHistory: slot("history") }));
vi.mock("@/components/AccountFavorites", () => ({ AccountFavorites: slot("favorites") }));
vi.mock("@/components/SoundToggle", () => ({ SoundToggle: slot("sound") }));
vi.mock("@/components/PaperAmbient", () => ({ PaperAmbient: () => null }));
vi.mock("@/components/MergeRedeemer", () => ({ MergeRedeemer: () => null }));
vi.mock("@/components/nav/TransitionNav", () => ({
  TransitionLink: ({ href, children }: { href: string; children?: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@mms/ui", () => ({
  PageMasthead: ({ children }: { children?: React.ReactNode }) => <header>{children}</header>,
}));

const { default: Account } = await import("./page");

const GUEST = {
  isUpgraded: false,
  email: null,
  displayName: null,
  memberSince: null,
  stars: 3,
  spendCents: 4200,
  tierId: "new",
  milestoneStep: 5,
  ordersToNext: 2,
  coupons: [],
};
const LIVE = [{ id: "o1" }];

/** The page's content slots in document order; the W9c banner reads as "alert". */
async function slots() {
  const { container } = render(await Account());
  return [...container.querySelectorAll("[data-s], [role='alert']")].map(
    (el) => el.getAttribute("data-s") ?? "alert",
  );
}

beforeEach(() => {
  h.ensureProfile.mockResolvedValue(undefined);
  h.getRewardsState.mockResolvedValue(GUEST);
  h.getOrderHistory.mockResolvedValue([]);
  h.getWelcomeBack.mockResolvedValue(null);
  h.getMyLiveOrders.mockResolvedValue(LIVE);
  h.getFavoriteDishes.mockResolvedValue([]);
  h.getSessionKind.mockResolvedValue("anon");
  h.upgradeProps = [];
});
afterEach(() => {
  cleanup();
  for (const fn of Object.values(h)) if (typeof fn === "function") fn.mockReset();
});

describe("/account — the order is the design", () => {
  it("a healthy guest: now → you → what you own → the record → reference → settings", async () => {
    // RED when history and details swap, or when sound moves.
    expect(await slots()).toEqual([
      "live",
      "identity",
      "summary",
      "history",
      "favorites",
      "details",
      "sound",
    ]);
  });

  it("the healthy guest's chooser note is fed the real Stars (the live count comes from the client list)", async () => {
    await slots();
    expect(h.upgradeProps).toHaveLength(1);
    expect(h.upgradeProps[0]?.stars).toBe(3);
    expect(h.upgradeProps[0]?.chooserStars).toBe(3);
  });

  it("a healthy visit never asks who the viewer is (no extra staff lookup)", async () => {
    // RED when getSessionKind is called unconditionally.
    await slots();
    expect(h.getSessionKind).not.toHaveBeenCalled();
  });
});

describe("W9c — a failed rewards read costs the Stars panel, never the history", () => {
  it("the alert renders BEFORE the history, and the rewards halves are absent", async () => {
    // RED when OrderHistory is moved back under `state &&` (the W9c regression).
    h.getRewardsState.mockResolvedValue(null);
    h.getSessionKind.mockResolvedValue("diner");
    const order = await slots();
    expect(order).toContain("history");
    expect(order.indexOf("alert")).toBeLessThan(order.indexOf("history"));
    expect(order).not.toContain("summary");
    expect(order).not.toContain("details");
  });

  it("a GUEST still gets the save door after the alert — count-free, with the count-free note", async () => {
    h.getRewardsState.mockResolvedValue(null);
    h.getSessionKind.mockResolvedValue("anon");
    expect(await slots()).toEqual(["live", "alert", "identity", "history", "favorites", "sound"]);
    expect(h.upgradeProps).toHaveLength(1);
    expect(h.upgradeProps[0]?.stars).toBe(0);
    // Count-free: the failed read cannot claim a number of Stars.
    expect(h.upgradeProps[0]?.chooserStars).toBeNull();
  });

  it("a signed-in diner on the failed branch gets no identity card, as before", async () => {
    h.getRewardsState.mockResolvedValue(null);
    h.getSessionKind.mockResolvedValue("diner");
    expect(await slots()).toEqual(["live", "alert", "history", "favorites", "sound"]);
  });

  it("a failed 'who is this?' resolves to no card — the page never throws", async () => {
    // RED when the await is unguarded (the page throws and the diner loses their receipts too).
    h.getRewardsState.mockResolvedValue(null);
    h.getSessionKind.mockRejectedValue(new Error("staff lookup failed"));
    expect(await slots()).toEqual(["live", "alert", "history", "favorites", "sound"]);
  });
});
