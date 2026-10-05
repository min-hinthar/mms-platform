/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deviceSessionKeys } from "@/lib/device-session";

/**
 * Codex round 4 on #312 (P2) — the one-shot evaluates only where it can be seen. Inside a hidden
 * account panel it must neither record the baseline nor show; once that panel is selected it does
 * both. Outside a hub (no provider) it behaves as it always has.
 *
 * Deep pass on #312: the `tierMeta` mock has the REAL shape (the first one returned fields the
 * component never read, so the overlay rendered "undefined · undefined" and no copy regression could
 * fail here); the baseline key sits inside the handover boundary; the once-guard is reachable; a
 * panel hidden mid-celebration dismisses it without yanking focus.
 */
vi.mock("@mms/ui", () => ({
  useAnimationPreference: () => ({ shouldAnimate: false }),
  useDeviceTier: () => "low",
}));
vi.mock("./Confetti", () => ({ Confetti: () => null }));
vi.mock("@/lib/rewards-tiers", () => ({
  tierMeta: (id: string) => ({
    id,
    name: id,
    english: id.toUpperCase(),
    emoji: "✦",
    minSpendCents: 0,
  }),
}));

const { TierUpCelebration } = await import("./TierUpCelebration");
const { AccountPanelVisible } = await import("./AccountPanelVisible");

const SEEN = "mms.qr.seen_tier";
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
  it("keeps its baseline INSIDE the handover boundary — `clearDeviceSession` drops it on Switch account", () => {
    // `mms_qr_seen_tier` (underscores) sat one character outside the `mms.qr.` prefix, so Alice's
    // baseline survived Bob's sign-in and her return fired "Tier unlocked" for a climb she never made.
    expect(deviceSessionKeys([SEEN, "mms_qr_seen_tier", "unrelated"])).toEqual([SEEN]);
  });
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
    // The overlay names the tier from the ONE tier table: gem name · English gloss.
    expect(screen.getByRole("status").textContent).toContain("jade · JADE");
  });
  it("outside a hub it evaluates on mount, as before", async () => {
    render(<TierUpCelebration tierId="jade" />);
    await frames();
    expect(localStorage.getItem(SEEN)).toBe("1");
    expect(screen.getByRole("status")).toBeTruthy();
  });
  it("evaluates ONCE per mount: hiding and re-showing the panel after a dismissal does not re-fire", async () => {
    // The effect's deps are [tierId, visible]; a same-props rerender never re-ran it, so the old
    // version of this case proved React, not the guard. Toggling `visible` reaches the guard.
    const { rerender } = render(
      <AccountPanelVisible value={true}>
        <TierUpCelebration tierId="jade" />
      </AccountPanelVisible>,
    );
    await frames();
    act(() => {
      screen.getByRole("status").click(); // tap-anywhere dismisses
    });
    expect(screen.queryByRole("status")).toBeNull();
    localStorage.setItem(SEEN, "0"); // even a rewound baseline cannot re-fire this mount
    rerender(
      <AccountPanelVisible value={false}>
        <TierUpCelebration tierId="jade" />
      </AccountPanelVisible>,
    );
    rerender(
      <AccountPanelVisible value={true}>
        <TierUpCelebration tierId="jade" />
      </AccountPanelVisible>,
    );
    await frames();
    expect(screen.queryByRole("status")).toBeNull();
    expect(localStorage.getItem(SEEN)).toBe("0");
  });
  it("a panel hidden mid-celebration dismisses it WITHOUT yanking focus back to where it came from (deep pass on #312)", async () => {
    // The diner taps Rewards (focus lands on that tab), the card shows (focus moves to "Nice!"),
    // then taps Orders within 5.2 s: the overlay sits in a hidden subtree with its timer and Escape
    // listener alive, and when the timer fired the "restore" put focus back on the Rewards tab.
    const from = document.createElement("button");
    from.textContent = "Rewards tab";
    document.body.appendChild(from);
    from.focus();
    const { rerender } = render(
      <AccountPanelVisible value={true}>
        <TierUpCelebration tierId="jade" />
      </AccountPanelVisible>,
    );
    await frames();
    expect(screen.getByRole("status")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /Nice/i }));
    rerender(
      <AccountPanelVisible value={false}>
        <TierUpCelebration tierId="jade" />
      </AccountPanelVisible>,
    );
    await frames();
    expect(screen.queryByRole("status")).toBeNull();
    expect(document.activeElement).not.toBe(from);
    from.remove();
  });
});
