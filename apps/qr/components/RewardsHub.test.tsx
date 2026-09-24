/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { RewardsState } from "@/lib/rewards";

/**
 * Phase 1c · account-star — the hub is split so /account can order it by what a returning diner comes
 * for. What that split must keep: the rewards the diner can spend TODAY sit directly under the
 * progress toward the next one (in the summary), and the reference cards — the tier ladder, "How it
 * works" — sit in the details, below history. The page's own order is pinned by
 * app/account/page.test.tsx; this pins what each half contains, in order.
 */
vi.mock("./TierUpCelebration", () => ({ TierUpCelebration: () => null }));
vi.mock("./StarsRing", () => ({ StarsRing: () => null }));
vi.mock("@mms/ui", () => ({
  Card: ({
    as: As = "div",
    textured: _textured,
    ...rest
  }: {
    as?: React.ElementType;
    textured?: boolean;
    [k: string]: unknown;
  }) => <As {...rest} />,
  NumberFlow: ({ value }: { value: number }) => <span>{value}</span>,
}));

const { RewardsDetails, RewardsSummary } = await import("./RewardsHub");

afterEach(cleanup);

const STATE: RewardsState = {
  isUpgraded: false,
  email: null,
  displayName: null,
  memberSince: null,
  stars: 7,
  spendCents: 12_345,
  tierId: "jade",
  milestoneStep: 5,
  ordersToNext: 3,
  coupons: [{ code: "KZP-1", amountCents: 500, expiresAt: "2026-12-31T00:00:00.000Z" }],
};
const headings = (c: HTMLElement) => [...c.querySelectorAll("h2")].map((h) => h.textContent);

describe("the split hub — spendable rewards high, reference low", () => {
  it("RewardsSummary: the Stars ring, then the coupons you can spend today", () => {
    // RED when the wallet is left after "How it works" (in the details half).
    const { container } = render(<RewardsSummary state={STATE} />);
    expect(headings(container)).toEqual(["Stars", "Your rewards"]);
  });

  it("RewardsSummary without coupons shows only the ring", () => {
    const { container } = render(<RewardsSummary state={{ ...STATE, coupons: [] }} />);
    expect(headings(container)).toEqual(["Stars"]);
  });

  it("RewardsDetails: the tier ladder, then how it works", () => {
    const { container } = render(<RewardsDetails state={STATE} />);
    expect(headings(container)).toEqual(["Your tier", "How it works"]);
  });
});
