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

const onChanged = vi.fn();
function mount() {
  const view = (totalCents: number) => (
    <StaffLangProvider lang="en">
      <CloseSecureTabButton sessionId="s1" totalCents={totalCents} onChanged={onChanged} />
    </StaffLangProvider>
  );
  const r = render(view(4210));
  /** The page's detail re-read moving the prop (the confirm may be open). */
  const rerender = (totalCents: number) => r.rerender(view(totalCents));
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
  return { trigger, charge, rerender };
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
    expect(onChanged).not.toHaveBeenCalled();
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
    // Phase 2c — the landed close re-reads the PAGE's detail (`onChanged`); `router.refresh()`
    // updated nothing FloorDetailLive reads. MUTATION: drop the call — red.
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("CloseSecureTabButton — Buttons, never native `disabled` (Phase 2c · register, K35)", () => {
  it("trigger, Cancel and Charge are @mms/ui Buttons; while charging, Charge is busy and Cancel refuses — no native disabled anywhere", async () => {
    let resolve!: (v: { ok: true }) => void;
    closeSecureTab.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const { trigger } = mount();
    expect(trigger().classList.contains("ui-btn-primary")).toBe(true);
    fireEvent.click(trigger());
    const charge = screen.getByRole("button", { name: /^Charge \$42\.10/ });
    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(charge.classList.contains("ui-btn")).toBe(true);
    await act(async () => {
      fireEvent.click(charge);
    });
    const busy = document.querySelector('[aria-busy="true"]')!;
    expect(busy.textContent).toBe(STAFF["settle.card.charging"].en);
    expect(cancel.getAttribute("aria-disabled")).toBe("true");
    // The whole component, not one control: K35 is "no native disabled on a tapped control".
    expect(document.querySelectorAll("[disabled]")).toHaveLength(0);
    // A second tap while charging never asks twice.
    await act(async () => {
      fireEvent.click(busy);
    });
    expect(closeSecureTab).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve({ ok: true });
    });
  });
});

describe("CloseSecureTabButton — the confirm's quote and a MOVED total (Phase 2c · register, P2aa)", () => {
  it("the charge carries the total the confirm SHOWED as a compare-only quote", async () => {
    closeSecureTab.mockResolvedValueOnce({ ok: true });
    const { charge } = mount();
    await charge();
    // MUTATION: drop `quotedCents` — the server's compare never runs; red.
    expect(closeSecureTab).toHaveBeenCalledWith({ sessionId: "s1", quotedCents: 4210 });
  });

  it("a moved total names both figures, re-reads the page, quotes the server's figure, and the re-tap sends it", async () => {
    closeSecureTab.mockResolvedValueOnce({
      ok: false,
      code: "moved",
      totalCents: 4265,
      error: "The total changed — check the order, then take payment again.",
    });
    const { charge } = mount();
    await charge();
    expect(screen.getByRole("alert").textContent).toBe(
      STAFF["settle.cash.moved"].en.replace("{old}", "$42.10").replace("{m}", "$42.65"),
    );
    expect(onChanged).toHaveBeenCalledTimes(1);
    // The confirm closed (focus back on the trigger), and the trigger now reads the server's figure.
    const trigger = screen.getByRole("button", {
      name: new RegExp(`^${STAFF["settle.card.trigger"].en.replace("{m}", "\\$42\\.65")}`),
    });
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    closeSecureTab.mockResolvedValueOnce({ ok: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Charge \$42\.65/ }));
    });
    expect(closeSecureTab).toHaveBeenLastCalledWith({ sessionId: "s1", quotedCents: 4265 });
  });
});

describe("CloseSecureTabButton — the confirm's figure is FROZEN when it opens (critic finding)", () => {
  it("a total that moves while the confirm is open never changes the charge silently: the alert names both, the tap adopts, only the NEXT tap charges", async () => {
    const { trigger, rerender } = mount();
    fireEvent.click(trigger());
    rerender(4610);
    // MUTATION: bind the confirm to the live prop — it reads "Charge $46.10" with no announcement,
    // and the tap sends a quote that equals the live total, so the compare passes unread; red.
    const charge = screen.getByRole("button", { name: /^Charge \$42\.10/ });
    const moved = STAFF["settle.cash.moved"].en.replace("{old}", "$42.10").replace("{m}", "$46.10");
    expect(screen.getByRole("alert").textContent).toBe(moved);
    await act(async () => {
      fireEvent.click(charge);
    });
    // MUTATION: drop the drift arm — the old quote goes to the server; red.
    expect(closeSecureTab).not.toHaveBeenCalled();
    closeSecureTab.mockResolvedValueOnce({ ok: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Charge \$46\.10/ }));
    });
    expect(closeSecureTab).toHaveBeenCalledWith({ sessionId: "s1", quotedCents: 4610 });
  });
});
