/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { RewardsProgress } from "@/lib/rewards";

/**
 * Phase 1c · account-star — ONE rewards door at a time. `door` is decided once, in
 * `successRewardsDoor` (lib/save-stars.ts, pinned by value there); this pins that GoodbyeBeat OBEYS it:
 * no /account link while attribution is pending, and neither the link nor the guest "with your
 * rewards" reassurance while the save card is the door.
 */
vi.mock("./nav/TransitionNav", () => ({
  TransitionLink: ({ href, children }: { href: string; children?: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("./StarsRing", () => ({ StarsRing: () => null }));

const { GoodbyeBeat } = await import("./GoodbyeBeat");

afterEach(cleanup);

const GUEST_EARNER: RewardsProgress = {
  stars: 3,
  milestoneStep: 5,
  ordersToNext: 2,
  tierId: "new",
  earnedThisOrder: true,
  isUpgraded: false,
};
const accountLink = (c: HTMLElement) => c.querySelector('a[href="/account"]');

describe("GoodbyeBeat obeys the one-door decision", () => {
  it("'none' — the save card is the door: no link and no 'with your rewards' line", () => {
    // RED when the prop is ignored (today's link and reassurance render under the card's warning).
    const { container } = render(<GoodbyeBeat progress={GUEST_EARNER} door="none" />);
    expect(accountLink(container)).toBeNull();
    expect(container.textContent).not.toContain("with your rewards");
    // The farewell itself always stays — it is the flow's last warm word.
    expect(container.textContent).toContain("see you next time");
  });

  it("'pending' — attribution undecided: no link that could vanish underfoot", () => {
    const { container } = render(<GoodbyeBeat progress={GUEST_EARNER} door="pending" />);
    expect(accountLink(container)).toBeNull();
  });

  it("'link' — today's link and line, unchanged", () => {
    const { container } = render(<GoodbyeBeat progress={GUEST_EARNER} door="link" />);
    expect(accountLink(container)?.textContent).toContain("See them in your rewards");
    expect(container.textContent).toContain("Your Star and this receipt are with your rewards.");
  });

  it("'link' for a viewer with no progress still offers the rewards door", () => {
    const { container } = render(<GoodbyeBeat progress={null} door="link" />);
    expect(accountLink(container)?.textContent).toContain("View your rewards");
  });
});
