/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Codex round 4 on #312 (P2) — the one-shot evaluates only where it can be seen. Inside a hidden
 * account panel it must neither record the baseline nor show; once that panel is selected it does
 * both. Outside a hub (no provider) it behaves as it always has.
 */
vi.mock("@mms/ui", () => ({
  useAnimationPreference: () => ({ shouldAnimate: false }),
  useDeviceTier: () => "low",
}));
vi.mock("./Confetti", () => ({ Confetti: () => null }));
vi.mock("@/lib/rewards-tiers", () => ({
  tierMeta: (id: string) => ({ label: id, emoji: "✦", nameMy: id }),
}));

const { TierUpCelebration } = await import("./TierUpCelebration");
const { AccountPanelVisible } = await import("./AccountPanelVisible");

const SEEN = "mms_qr_seen_tier";
const frames = () =>
  act(async () => {
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    await new Promise((r) => setTimeout(r, 0));
  });

beforeEach(() => {
  localStorage.setItem(SEEN, "0"); // last seen: `new`; a `jade` visit is a climb
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("TierUpCelebration", () => {
  it("in a HIDDEN panel it neither records the baseline nor shows; selecting the panel does both", async () => {
    const { rerender } = render(
      <AccountPanelVisible value={false}>
        <TierUpCelebration tierId="jade" />
      </AccountPanelVisible>,
    );
    await frames();
    expect(localStorage.getItem(SEEN)).toBe("0"); // untouched — the climb is still owed
    expect(screen.queryByRole("status")).toBeNull();
    rerender(
      <AccountPanelVisible value={true}>
        <TierUpCelebration tierId="jade" />
      </AccountPanelVisible>,
    );
    await frames();
    expect(localStorage.getItem(SEEN)).toBe("1");
    expect(screen.getByRole("status")).toBeTruthy();
  });
  it("outside a hub it evaluates on mount, as before", async () => {
    render(<TierUpCelebration tierId="jade" />);
    await frames();
    expect(localStorage.getItem(SEEN)).toBe("1");
    expect(screen.getByRole("status")).toBeTruthy();
  });
  it("evaluates ONCE: a re-render while visible does not re-fire after a dismissal", async () => {
    const { rerender } = render(<TierUpCelebration tierId="jade" />);
    await frames();
    act(() => {
      screen.getByRole("status").click(); // tap-anywhere dismisses
    });
    expect(screen.queryByRole("status")).toBeNull();
    localStorage.setItem(SEEN, "0"); // even a rewound baseline cannot re-fire this mount
    rerender(<TierUpCelebration tierId="jade" />);
    await frames();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
