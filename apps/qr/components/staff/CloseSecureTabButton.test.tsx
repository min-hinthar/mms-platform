/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STAFF } from "@/lib/i18n/staff";
import { STAFF_WRITE_OUTAGE } from "@/lib/staff-outage";

/**
 * Phase 2a · register — a secure-tab close whose Server Action REJECTS (the connection dropped
 * mid-charge) used to latch the confirm on "Charging…" with both buttons disabled and focus on
 * <body> until a reload. The charge's outcome is UNKNOWN there — the server arm holds the freeze —
 * so the sentence is the unknown-outcome one, never the write-outage twin.
 */
const closeSecureTab = vi.fn();
vi.mock("@/lib/staff-cart", () => ({
  closeSecureTab: (...a: unknown[]) => closeSecureTab(...(a as [])),
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const { StaffLangProvider } = await import("./StaffLangProvider");
const { CloseSecureTabButton } = await import("./CloseSecureTabButton");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

function mount() {
  render(
    <StaffLangProvider lang="en">
      <CloseSecureTabButton sessionId="s1" totalCents={4210} />
    </StaffLangProvider>,
  );
  const trigger = () =>
    screen.getByRole("button", {
      name: new RegExp(`^${STAFF["settle.card.trigger"].en.replace("{m}", "\\$42\\.10")}`),
    });
  const charge = async () => {
    fireEvent.click(trigger());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Charge \$42\.10/ }));
    });
  };
  return { trigger, charge };
}

describe("CloseSecureTabButton — a rejected close never latches", () => {
  it("a REJECTING closeSecureTab clears busy, closes the confirm, returns focus to the trigger and says the outcome is unknown", async () => {
    closeSecureTab.mockRejectedValueOnce(new Error("fetch failed"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { trigger, charge } = mount();
    await charge();
    // MUTATION: remove the catch — the rejection escapes, busy stays true and the confirm stays
    // open on "Charging…" with focus on <body>; red.
    expect(screen.queryByRole("group")).toBeNull();
    expect(screen.queryByText("Charging…")).toBeNull();
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    expect(document.activeElement).toBe(trigger());
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe(STAFF["settle.card.unknown"].en);
    expect(alert.textContent).not.toContain(STAFF_WRITE_OUTAGE);
    expect(refresh).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalled();
  });

  it("a server refusal still reads the server's sentence (OutageText), not the unknown-outcome one", async () => {
    closeSecureTab.mockResolvedValueOnce({
      ok: false,
      error: "The card on file was declined — settle by cash or a fresh card.",
    });
    const { trigger, charge } = mount();
    await charge();
    expect(screen.queryByRole("group")).toBeNull();
    expect(document.activeElement).toBe(trigger());
    expect(screen.getByRole("alert").textContent).toBe(
      "The card on file was declined — settle by cash or a fresh card.",
    );
  });

  it("the next attempt clears the last one's alert", async () => {
    closeSecureTab.mockRejectedValueOnce(new Error("fetch failed"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { charge } = mount();
    await charge();
    expect(screen.getByRole("alert")).toBeTruthy();
    closeSecureTab.mockResolvedValueOnce({ ok: true });
    await charge();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
