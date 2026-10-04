/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 3a (D4) — the hub's tabs, rendered for real. What is worth pinning (blind pass on #312):
 * the URL is the truth — a tab tap writes `?tab=` with a NULL state (the state Next stamps makes it
 * bail), and `current` is read back from the URL, so a navigation that re-renders with the SAME
 * `initial` but a new `?tab=` still changes the panel (the re-seed defect); Arrow keys move focus
 * WITHOUT selecting (manual activation); hidden panels stay in the DOM in order.
 */
let params = new URLSearchParams();
vi.mock("next/navigation", () => ({ useSearchParams: () => params }));

const { AccountHub } = await import("./AccountHub");

const panels = {
  orders: <p>orders-panel</p>,
  rewards: <p>rewards-panel</p>,
  you: <p>you-panel</p>,
};
const tab = (name: string) => screen.getByRole("tab", { name });
const shown = () =>
  [...document.querySelectorAll("[role=tabpanel]")]
    .filter((s) => !(s as HTMLElement).hidden)
    .map((s) => s.textContent);

let replaced: { state: unknown; url: string }[] = [];
beforeEach(() => {
  params = new URLSearchParams();
  replaced = [];
  vi.spyOn(window.history, "replaceState").mockImplementation((state, _t, url) => {
    replaced.push({ state, url: String(url) });
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AccountHub", () => {
  it("opens on `initial` when the URL names no panel, with every panel in document order", () => {
    render(<AccountHub initial="rewards" panels={panels} />);
    expect(shown()).toEqual(["rewards-panel"]);
    expect([...document.querySelectorAll("[role=tabpanel]")].map((s) => s.textContent)).toEqual([
      "orders-panel",
      "rewards-panel",
      "you-panel",
    ]);
    expect(tab("Rewards").getAttribute("aria-selected")).toBe("true");
    expect(tab("Orders").getAttribute("tabindex")).toBe("-1");
  });

  it("a tap writes ?tab= with a NULL state and shows the panel", () => {
    render(<AccountHub initial="orders" panels={panels} />);
    fireEvent.click(tab("You"));
    expect(shown()).toEqual(["you-panel"]);
    expect(replaced).toHaveLength(1);
    expect(replaced[0]!.state).toBeNull();
    expect(new URL(replaced[0]!.url).searchParams.get("tab")).toBe("you");
  });

  it("the URL wins — the same `initial` with a new ?tab= changes the panel (the re-seed defect)", () => {
    // Arrive on ?tab=you (initial = you), tap Orders, then a navigation re-renders with the SAME
    // initial but the URL now says you again (the Orders panel's save line).
    params = new URLSearchParams("tab=you");
    const { rerender } = render(<AccountHub initial="you" panels={panels} />);
    expect(shown()).toEqual(["you-panel"]);
    params = new URLSearchParams("tab=orders"); // what the patched replaceState makes the router see
    fireEvent.click(tab("Orders"));
    rerender(<AccountHub initial="you" panels={panels} />);
    expect(shown()).toEqual(["orders-panel"]);
    params = new URLSearchParams("tab=you");
    rerender(<AccountHub initial="you" panels={panels} />);
    expect(shown()).toEqual(["you-panel"]);
  });

  it("Arrow keys move focus between tabs without selecting; Enter on the focused tab selects", () => {
    render(<AccountHub initial="orders" panels={panels} />);
    tab("Orders").focus();
    fireEvent.keyDown(tab("Orders"), { key: "ArrowRight" });
    expect(document.activeElement).toBe(tab("Rewards"));
    expect(shown()).toEqual(["orders-panel"]); // manual activation: focus moved, nothing selected
    fireEvent.keyDown(tab("Rewards"), { key: "End" });
    expect(document.activeElement).toBe(tab("You"));
    fireEvent.keyDown(tab("You"), { key: "ArrowRight" });
    expect(document.activeElement).toBe(tab("Orders")); // wraps
    // jsdom does not run an anchor's native Enter activation, so pin the half the component owns:
    // Enter must reach the link untouched (not preventDefault'd by `onKey`) — the browser then
    // clicks it, which is the click below (deep pass on #312: the old comment called it a button).
    expect(fireEvent.keyDown(tab("You"), { key: "Enter" })).toBe(true);
    act(() => {
      fireEvent.click(tab("You"));
    });
    expect(shown()).toEqual(["you-panel"]);
  });

  it("a fresh tap wins over a STALE URL when the history write cannot sync it (deep pass on #312)", () => {
    // Arrived on `/account?tab=rewards` (the /rewards redirect) in a runtime whose replaceState
    // throws: `fromUrl` stays "rewards", so a tap on Orders set `picked` and changed nothing.
    params = new URLSearchParams("tab=rewards");
    vi.spyOn(window.history, "replaceState").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    render(<AccountHub initial="rewards" panels={panels} />);
    expect(shown()).toEqual(["rewards-panel"]);
    fireEvent.click(tab("Orders"));
    expect(shown()).toEqual(["orders-panel"]);
    expect(tab("Orders").getAttribute("aria-selected")).toBe("true");
  });

  it("a bare /account navigation after a tap shows `initial` again — the fallback is spent once the URL caught up (Codex round 2)", () => {
    const { rerender } = render(<AccountHub initial="orders" panels={panels} />);
    fireEvent.click(tab("Rewards"));
    expect(shown()).toEqual(["rewards-panel"]); // the fallback shows it first
    params = new URLSearchParams("tab=rewards"); // then the router catches up
    rerender(<AccountHub initial="orders" panels={panels} />);
    expect(shown()).toEqual(["rewards-panel"]);
    params = new URLSearchParams(); // the Account tab: same path, no ?tab=, the same initial
    rerender(<AccountHub initial="orders" panels={panels} />);
    expect(shown()).toEqual(["orders-panel"]);
  });
  it("a new server render with another `initial` drops a stale fallback", () => {
    vi.spyOn(window.history, "replaceState").mockImplementation(() => {
      throw new Error("no history"); // the fallback is all that shows the panel
    });
    const { rerender } = render(<AccountHub initial="orders" panels={panels} />);
    fireEvent.click(tab("You"));
    expect(shown()).toEqual(["you-panel"]);
    rerender(<AccountHub initial="rewards" panels={panels} />);
    expect(shown()).toEqual(["rewards-panel"]);
  });
  it("each tab is a real link to its panel's URL (the non-JS fallback), and Space selects", () => {
    render(<AccountHub initial="orders" panels={panels} />);
    expect(tab("Rewards").getAttribute("href")).toBe("/account?tab=rewards");
    fireEvent.keyDown(tab("Rewards"), { key: " " });
    expect(shown()).toEqual(["rewards-panel"]);
  });
  it("each panel knows whether it is the one showing (Codex round 4: a hidden panel's one-shots wait)", async () => {
    const { useAccountPanelVisible } = await import("./AccountPanelVisible");
    const Eye = ({ id }: { id: string }) => (
      <p data-eye={id}>{useAccountPanelVisible() ? "seen" : "hidden"}</p>
    );
    render(
      <AccountHub
        initial="orders"
        panels={{ orders: <Eye id="o" />, rewards: <Eye id="r" />, you: <Eye id="y" /> }}
      />,
    );
    const eye = (id: string) => document.querySelector(`[data-eye=${id}]`)!.textContent;
    expect([eye("o"), eye("r"), eye("y")]).toEqual(["seen", "hidden", "hidden"]);
    fireEvent.click(tab("Rewards"));
    expect([eye("o"), eye("r"), eye("y")]).toEqual(["hidden", "seen", "hidden"]);
  });
  it("a replaceState that throws still shows the picked panel", () => {
    vi.spyOn(window.history, "replaceState").mockImplementation(() => {
      throw new Error("no history");
    });
    render(<AccountHub initial="orders" panels={panels} />);
    fireEvent.click(tab("Rewards"));
    expect(shown()).toEqual(["rewards-panel"]);
  });
});
