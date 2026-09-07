/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HELP_CARD_COUNT, helpSeenKey } from "@/lib/help";

vi.mock("@/lib/haptics", () => ({ haptic: vi.fn() }));

const { HelpButton } = await import("./HelpButton");

/**
 * P7·3 — the Help door. What is worth pinning: the circle is a named 44px control that opens ONE
 * dialog; the rows lead to the cards and (on the board only) the sizes; the cards page one at a
 * time with focus moved to each; "opens itself the first time" is kept per DEVICE and only once;
 * the size view shows the chosen size pressed and closes on a pick; and the undo card quotes the
 * number the board handed in, never a typed one.
 */
afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
});

const seen = (screen: "kitchen" | "counter" | "expo") =>
  localStorage.setItem(helpSeenKey(screen), "1");
const dialog = () => screen.getByRole("dialog");
const circle = () => screen.getByRole("button", { name: "Help" });

describe("HelpButton", () => {
  it("is a named gold circle that opens the Help sheet onto its rows", async () => {
    seen("expo");
    render(<HelpButton lang="en" screen="expo" />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(circle().className).toContain("staff-circ-gold");
    expect(circle().getAttribute("aria-haspopup")).toBe("dialog");
    fireEvent.click(circle());
    const d = await screen.findByRole("dialog");
    expect(screen.getByRole("list", { name: "Help topics" })).not.toBeNull();
    expect(screen.getByRole("button", { name: /How this screen works/ })).not.toBeNull();
    // No size row on a screen that has no dial.
    expect(screen.queryByRole("button", { name: /Text size/ })).toBeNull();
    expect(d.textContent).toContain("One door for everything");
  });

  it("the first time a DEVICE mounts a screen's door, the cards open by themselves — once", async () => {
    const { unmount } = render(<HelpButton lang="en" screen="kitchen" />);
    await screen.findByRole("dialog");
    expect(screen.getByText(/Food up\? Tap the green button/)).not.toBeNull();
    expect(localStorage.getItem(helpSeenKey("kitchen"))).toBe("1");
    unmount();
    // Second morning: nothing opens.
    render(<HelpButton lang="en" screen="kitchen" />);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("dialog")).toBeNull();
    // …and a DIFFERENT screen on the same device still gets its own first time.
    expect(localStorage.getItem(helpSeenKey("counter"))).toBeNull();
  });

  it("pages the cards one at a time, moves focus to each, and Got it closes on the last", async () => {
    seen("counter");
    render(<HelpButton lang="en" screen="counter" />);
    fireEvent.click(circle());
    fireEvent.click(await screen.findByRole("button", { name: /How this screen works/ }));
    const lede = () => document.getElementById("help-lede")!;
    await waitFor(() => expect(lede().textContent).toMatch(/Tap Register/));
    expect(document.activeElement).toBe(lede());
    expect(screen.getByText(`Step 1 of ${HELP_CARD_COUNT}`)).not.toBeNull();
    for (let n = 2; n <= HELP_CARD_COUNT; n++) {
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
      await waitFor(() =>
        expect(screen.getByText(`Step ${n} of ${HELP_CARD_COUNT}`)).not.toBeNull(),
      );
      expect(document.activeElement).toBe(lede());
    }
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // Re-opening lands on the rows again, not mid-deck.
    fireEvent.click(circle());
    expect((await screen.findByRole("dialog")).textContent).toContain("How this screen works");
  });

  it("Back on the first card returns to the rows; Back later steps back", async () => {
    seen("expo");
    render(<HelpButton lang="en" screen="expo" />);
    fireEvent.click(circle());
    fireEvent.click(await screen.findByRole("button", { name: /How this screen works/ }));
    await screen.findByText(/Step 1 of/);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText(/Step 2 of/);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByText(/Step 1 of/);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByRole("list", { name: "Help topics" });
  });

  it("the undo card quotes the number the board handed in — Burmese numerals under my", async () => {
    seen("kitchen");
    render(<HelpButton lang="my" screen="kitchen" cardVars={{ 2: { n: 6 } }} />);
    fireEvent.click(screen.getByRole("button", { name: "အကူအညီ" }));
    fireEvent.click(await screen.findByRole("button", { name: /ဒီစခရင် ဘယ်လို သုံးရမလဲ/ }));
    await screen.findByText(/အဆင့် ၁ \/ ၄/);
    fireEvent.click(screen.getByRole("button", { name: /ရှေ့ဆက်/ }));
    const lede = await waitFor(() => document.getElementById("help-lede")!);
    await waitFor(() =>
      expect(lede.querySelector('[lang="my"]')?.textContent).toContain("၆ စက္ကန့်"),
    );
    expect(lede.querySelector(".chrome-en")?.textContent).toContain("6 seconds");
    // The picture is decorative: hidden, and its labels are real dictionary text (marked), not art.
    const pic = dialog().querySelector(".help-pic")!;
    expect(pic.getAttribute("aria-hidden")).toBe("true");
    expect(pic.querySelector('[lang="my"]')).not.toBeNull();
  });

  it("on the board the size row shows the current size, the view presses it, and a pick closes the sheet", async () => {
    seen("kitchen");
    const onPick = vi.fn();
    render(<HelpButton lang="en" screen="kitchen" size={{ value: "m", onPick }} />);
    fireEvent.click(circle());
    const row = await screen.findByRole("button", { name: /Text size/ });
    expect(row.textContent).toMatch(/Now: Medium · 34 px/);
    fireEvent.click(row);
    const sizes = await screen.findByRole("group", { name: "Text size" });
    const pressed = sizes.querySelector('[aria-pressed="true"]')!;
    expect(pressed.textContent).toMatch(/Medium/);
    expect(pressed.textContent).toMatch(/34 px · 3 across/);
    expect(sizes.querySelectorAll('[aria-pressed="true"]').length).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: /Large/ }));
    expect(onPick).toHaveBeenCalledWith("l");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("carries a class through the portal for the Night board, and mounts NO live region of its own", async () => {
    seen("kitchen");
    render(<HelpButton lang="en" screen="kitchen" sheetClassName="dark" />);
    fireEvent.click(circle());
    const d = await screen.findByRole("dialog");
    expect(d.closest(".mms-sheet")?.className).toContain("dark");
    expect(document.querySelectorAll('[role="status"], [aria-live]').length).toBe(0);
  });
});
