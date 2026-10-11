/** @vitest-environment jsdom */
import { StrictMode } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGuideFirstRun } from "./useGuideFirstRun";
import { GUIDE_SEEN_MARK, guideSeenKey } from "../guide-seen";

const KEY = guideSeenKey("counter", 1, "0b6e1c2a-5f4e-4c7b-9a1d-3e2f1a0b9c8d");

function Probe({ k = KEY, quiet = () => true }: { k?: string | null; quiet?: () => boolean }) {
  const { shown, dismiss } = useGuideFirstRun(k, quiet);
  return shown ? (
    <button type="button" onClick={dismiss}>
      guide
    </button>
  ) : (
    <p>idle</p>
  );
}
const settle = () => act(async () => {});

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useGuideFirstRun — the one at-open seam", () => {
  it("shows on the first quiet mount, marked before it shows; never on the next", async () => {
    const { unmount } = render(<Probe />);
    expect(screen.getByText("idle")).not.toBeNull(); // the server render and the first client render agree
    await settle();
    expect(screen.getByRole("button", { name: "guide" })).not.toBeNull();
    expect(localStorage.getItem(KEY)).toBe(GUIDE_SEEN_MARK);
    unmount();
    render(<Probe />);
    await settle();
    expect(screen.queryByRole("button", { name: "guide" })).toBeNull();
  });

  it("still shows under StrictMode — the claim rides the LIVE pass, never the discarded one", async () => {
    render(
      <StrictMode>
        <Probe />
      </StrictMode>,
    );
    await settle();
    expect(screen.getByRole("button", { name: "guide" })).not.toBeNull();
    expect(localStorage.getItem(KEY)).toBe(GUIDE_SEEN_MARK);
  });

  it("a host gone before the claim marks NOTHING — a mark for a guide that never showed would hide it for good", async () => {
    const { unmount } = render(<Probe />);
    unmount(); // the screen left (or the key changed) before the microtask ran
    await settle();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("a busy mount shows nothing and marks nothing; the quiet is read once, at the claim", async () => {
    const quiet = vi.fn(() => false);
    render(<Probe quiet={quiet} />);
    await settle();
    expect(screen.queryByRole("button", { name: "guide" })).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(quiet).toHaveBeenCalledTimes(1);
  });

  it("a refused store never shows it by itself", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    render(<Probe />);
    await settle();
    expect(screen.queryByRole("button", { name: "guide" })).toBeNull();
  });

  it("no key (a station not shipped, nobody signed in): nothing is read or shown", async () => {
    const read = vi.spyOn(Storage.prototype, "getItem");
    render(<Probe k={null} />);
    await settle();
    expect(screen.queryByRole("button", { name: "guide" })).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });

  it("dismiss hides it for good — the mark stays", async () => {
    render(<Probe />);
    await settle();
    act(() => screen.getByRole("button", { name: "guide" }).click());
    expect(screen.getByText("idle")).not.toBeNull();
    expect(localStorage.getItem(KEY)).toBe(GUIDE_SEEN_MARK);
  });
});
