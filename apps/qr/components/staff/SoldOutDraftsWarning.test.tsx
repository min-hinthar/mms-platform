/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { tf } from "@/lib/i18n/fill";
import { WRITE_UNCONFIRMED } from "@/lib/staff-outage";

/**
 * #360 — a sold-out DRAFT above the payment doors: named, Remove FIRST (one primary button per dish,
 * the order's own removal), and the doors stay live (PD8's re-warning, never a block). Errors go to
 * the page's one region (`onError`); a landed removal re-reads the page.
 */
vi.mock("server-only", () => ({}));
const staffSetQty = vi.fn(
  (_s: string, _raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> =>
    Promise.resolve({ ok: true }),
);
vi.mock("@/lib/staff-cart", () => ({
  staffSetQty: (s: string, raw: unknown) => staffSetQty(s, raw),
}));
const { SoldOutDraftsWarning } = await import("./SoldOutDraftsWarning");
const { StaffLangProvider } = await import("./StaffLangProvider");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const LINES = [
  { id: "l-1", name: "Mohinga", nameMy: null },
  { id: "l-2", name: "Tea", nameMy: null },
];
function draw(onError = vi.fn(), onChanged = vi.fn()) {
  render(
    <StaffLangProvider lang="en">
      <SoldOutDraftsWarning
        lang="en"
        sessionId="s-1"
        lines={LINES}
        onError={onError}
        onChanged={onChanged}
      />
    </StaffLangProvider>,
  );
  return { onError, onChanged };
}

describe("SoldOutDraftsWarning — remove first, or take payment anyway", () => {
  it("names the dishes and says the dish still goes to the kitchen", () => {
    // lck/sold-out-warning/undrawn — the page never named the dish before the doors; red.
    draw();
    expect(document.body.textContent).toContain(
      tf("en", "settle.soldOut.warn", { x: "Mohinga, Tea" }),
    );
  });

  it("Remove is the PRIMARY action, one per dish, and it removes THAT line — then the page re-reads", async () => {
    // lck/sold-out-warning/remove-unwired — the button removes nothing; red.
    const { onChanged } = draw();
    const btn = screen.getByRole("button", {
      name: tf("en", "settle.soldOut.remove", { x: "Tea" }),
    });
    expect(btn.classList.contains("ui-btn-primary")).toBe(true);
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(staffSetQty).toHaveBeenCalledWith("s-1", { cartItemId: "l-2", qty: 0 });
    expect(onChanged).toHaveBeenCalled();
  });

  it("a refusal and a lost answer are said through the page's region, never dropped", async () => {
    staffSetQty.mockResolvedValueOnce({ ok: false, error: "That item isn’t on this table." });
    const a = draw();
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button")[0]!);
    });
    expect(a.onError).toHaveBeenCalledWith("That item isn’t on this table.");
    cleanup();
    staffSetQty.mockRejectedValueOnce(new Error("lost"));
    const b = draw();
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button")[0]!);
    });
    expect(b.onError).toHaveBeenCalledWith(WRITE_UNCONFIRMED);
    expect(b.onChanged).toHaveBeenCalled();
  });
});
