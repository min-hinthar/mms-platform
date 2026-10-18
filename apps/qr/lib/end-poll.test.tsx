/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useEndPoll } from "./end-poll";

/**
 * Session truth — the ONE terminal-state probe the menu and the Bill share. jsdom is always
 * "visible", so the visible-only half is driven here by overriding `document.visibilityState`.
 */
let visibility: DocumentVisibilityState = "visible";
beforeEach(() => {
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  });
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function Probe({ delay, tick }: { delay: number | null; tick: () => void }) {
  useEndPoll(delay, tick);
  return null;
}

describe("useEndPoll", () => {
  it("ticks once per window while the page is visible", () => {
    const tick = vi.fn();
    render(<Probe delay={60_000} tick={tick} />);
    act(() => vi.advanceTimersByTime(59_999));
    expect(tick).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(tick).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(60_000));
    expect(tick).toHaveBeenCalledTimes(2);
  });

  it("asks NOTHING while the page is hidden — a pocketed phone polls no server", () => {
    // MUTATION (lcs/poll-runs-while-hidden): drop the visibility check — every phone left on the
    // menu in a pocket asks the server once a minute for as long as the tab lives.
    const tick = vi.fn();
    render(<Probe delay={60_000} tick={tick} />);
    visibility = "hidden";
    act(() => vi.advanceTimersByTime(180_000));
    expect(tick).not.toHaveBeenCalled();
    visibility = "visible";
    act(() => vi.advanceTimersByTime(60_000));
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it("a null delay schedules nothing, and an unmount stops the interval", () => {
    const tick = vi.fn();
    const { rerender, unmount } = render(<Probe delay={null} tick={tick} />);
    act(() => vi.advanceTimersByTime(300_000));
    expect(tick).not.toHaveBeenCalled();
    rerender(<Probe delay={60_000} tick={tick} />);
    unmount();
    act(() => vi.advanceTimersByTime(300_000));
    expect(tick).not.toHaveBeenCalled();
  });

  it("the LATEST tick runs, without restarting the window", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Probe delay={60_000} tick={first} />);
    act(() => vi.advanceTimersByTime(30_000));
    rerender(<Probe delay={60_000} tick={second} />);
    act(() => vi.advanceTimersByTime(30_000));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
