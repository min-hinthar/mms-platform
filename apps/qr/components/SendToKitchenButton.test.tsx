/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

/**
 * Phase 1b — Send to kitchen is ONE tap (the W16c confirm is retired; the server-clocked undo is the
 * safety net). What this pins is the wiring nothing else can see: the tap reaches the server, the
 * success line carries the owner's own Burmese, and a frozen cart is refused at the door.
 */
const h = vi.hoisted(() => ({ sendToKitchen: vi.fn(), undoFire: vi.fn() }));
vi.mock("@/lib/cart", () => ({ sendToKitchen: h.sendToKitchen, undoFire: h.undoFire }));
vi.mock("@/lib/diner-sound", () => ({ chime: () => {} }));

const { SendToKitchenButton } = await import("./SendToKitchenButton");

afterEach(() => {
  cleanup();
  h.sendToKitchen.mockReset();
});

const mount = (frozen = false) =>
  render(
    <SendToKitchenButton
      cartId="cart-1"
      hasDraft
      draftCount={3}
      frozen={frozen}
      onChanged={() => {}}
    />,
  );

describe("Phase 1b — one tap sends", () => {
  it("sends on the FIRST tap and says so in both tongues", async () => {
    // MUTATION: restore a confirm step (the tap opens a question instead of sending) — the server
    // is never reached by one tap; red.
    h.sendToKitchen.mockResolvedValue({
      ok: true,
      fired: 3,
      undoUntil: null,
      serverNow: new Date().toISOString(),
      undoBatch: null,
    });
    mount();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Send to kitchen/i }));
    });
    expect(h.sendToKitchen).toHaveBeenCalledTimes(1);
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Sent to the kitchen — 3 items on the way.");
    // MUTATION: drop the `my` half of the outcome — the owner's own words vanish; red.
    expect(status.textContent).toContain("Kitchen သို့ မှာယူရန် အတည်ပြုပါပြီ");
  });

  it("a frozen cart is refused at the door — nothing reaches the server", async () => {
    mount(true);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Send to kitchen/i }));
    });
    expect(h.sendToKitchen).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("locked");
  });
});
