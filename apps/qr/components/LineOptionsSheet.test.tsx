/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { CartItem } from "@mms/db";

/**
 * Phase 3c-i (D17) — the line is a receipt row; its For here / To go and "Send to kitchen now" live
 * behind a 44px ⋯ in ONE sheet. What this pins: the group and its lit-cap vocabulary, a choice
 * closes, pills stay RENDERED and `aria-disabled` under a freeze (never native, nothing reaches the
 * parent), "Send to kitchen now" only for a to-go line and GUARDED (the sheet is busy for the one
 * bounded round trip — a fire is one-way for the guest who tapped it), and the sheet's own single
 * live region carrying the view's sentence.
 */
const { LineOptionsSheet } = await import("./LineOptionsSheet");

afterEach(cleanup);

const LINE: CartItem = {
  id: "line-mohinga",
  menuItemId: "menu-mohinga",
  name: "Mohinga",
  nameMy: "မုန့်ဟင်းခါး",
  qty: 1,
  modifiers: [],
  unitPriceCents: 1200,
  taxCents: 0,
  lineState: "draft",
  fulfillment: "dinein",
};

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function mount(over: Partial<Parameters<typeof LineOptionsSheet>[0]> = {}) {
  const onChoose = vi.fn();
  const onMakeNow = vi.fn(() => Promise.resolve());
  const onOpenChange = vi.fn();
  render(
    <LineOptionsSheet
      line={LINE}
      open
      frozen={false}
      prepMinutes={12}
      notice={null}
      onOpenChange={onOpenChange}
      onChoose={onChoose}
      onMakeNow={onMakeNow}
      {...over}
    />,
  );
  return { onChoose, onMakeNow, onOpenChange, dialog: screen.getByRole("dialog") };
}

describe("LineOptionsSheet — where the dish goes", () => {
  it("is named by the dish (both tongues) and carries the one selection vocabulary", () => {
    const { dialog } = mount();
    expect(within(dialog).getByText("Mohinga")).toBeTruthy();
    expect(dialog.querySelector('[lang="my"]')?.textContent).toBe("မုန့်ဟင်းခါး");
    const group = within(dialog).getByRole("group", { name: "Where Mohinga goes" });
    const here = within(group).getByRole("button", { name: "For here" });
    const togo = within(group).getByRole("button", { name: "To go" });
    expect(here.getAttribute("aria-pressed")).toBe("true");
    expect(togo.getAttribute("aria-pressed")).toBe("false");
    // The lit-gold cap is the ONE selection vocabulary — on the pressed pill only.
    expect(here.classList.contains("checkout-pill-on")).toBe(true);
    expect(togo.classList.contains("checkout-pill-on")).toBe(false);
    // A dine-in line has no early fire — that is the to-go line's option.
    expect(within(dialog).queryByRole("button", { name: /Send to kitchen now/i })).toBeNull();
    // Exactly ONE polite region, inside the sheet (Radix hides the page's).
    expect(within(dialog).getAllByRole("status")).toHaveLength(1);
  });

  it("a choice reaches the parent once — the parent closes and toggles", () => {
    const { onChoose, dialog } = mount();
    fireEvent.click(within(dialog).getByRole("button", { name: "To go" }));
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith("togo");
  });

  it("under a freeze the pills stay RENDERED and aria-disabled — never native — and nothing reaches the parent", () => {
    const { onChoose, onMakeNow, dialog } = mount({
      frozen: true,
      line: { ...LINE, fulfillment: "togo" },
    });
    const togoPill = within(dialog).getByRole("button", { name: "For here" });
    const now = within(dialog).getByRole("button", { name: /Send to kitchen now/i });
    // MUTATION (line-sheet/pills-live-under-a-freeze): aria-disabled dropped — the control reads
    // live while the server has already decided against its write; red.
    expect(togoPill.getAttribute("aria-disabled")).toBe("true");
    expect(togoPill.hasAttribute("disabled")).toBe(false);
    expect(now.getAttribute("aria-disabled")).toBe("true");
    expect(now.hasAttribute("disabled")).toBe(false);
    fireEvent.click(togoPill);
    fireEvent.click(now);
    expect(onChoose).not.toHaveBeenCalled();
    expect(onMakeNow).not.toHaveBeenCalled();
  });

  it("'Send to kitchen now · usually ~N min' is the to-go line's option, and the sheet is BUSY for the bounded round trip", async () => {
    const fire = deferred<void>();
    const onMakeNow = vi.fn(() => fire.promise);
    const { dialog } = mount({ line: { ...LINE, fulfillment: "togo" }, onMakeNow });
    const now = within(dialog).getByRole("button", {
      name: "Send to kitchen now · usually ~12 min",
    });
    await act(async () => {
      fireEvent.click(now);
    });
    expect(onMakeNow).toHaveBeenCalledTimes(1);
    // M82 — a fire is one-way: the ✕ reads unavailable (aria-disabled, never native) until the
    // write answers, and the label says what is happening.
    const close = within(dialog).getByRole("button", { name: /Close — finishing/i });
    expect(close.getAttribute("aria-disabled")).toBe("true");
    expect(within(dialog).getByRole("button", { name: "Sending…" })).toBeTruthy();
    // A second tap while busy is refused without a second write.
    fireEvent.click(within(dialog).getByRole("button", { name: "Sending…" }));
    expect(onMakeNow).toHaveBeenCalledTimes(1);
    await act(async () => {
      fire.resolve();
      await fire.promise;
    });
    expect(within(dialog).getByRole("button", { name: "Close" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: /Send to kitchen now/i })).toBeTruthy();
  });

  it("the sheet's region carries the view's sentence", () => {
    const { dialog } = mount({
      notice: "That didn’t go through — the order’s locked while someone checks out",
    });
    expect(within(dialog).getByRole("status").textContent).toContain("didn’t go through");
  });
});
