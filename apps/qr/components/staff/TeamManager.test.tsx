/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/staff-actions", () => ({
  provisionStaff: vi.fn(),
  setStaffActive: vi.fn(),
  setStaffRole: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

const { StaffLangProvider } = await import("./StaffLangProvider");
const { TeamManager } = await import("./TeamManager");

/**
 * A4·4 — the roster is a ZONE of the sign-in screen, and two things changed with the move: a
 * failed read prints one honest line under the zone's heading (never an empty roster, never the
 * error boundary — the person's own card is above it), and the heading takes focus on arrival at
 * `#team-h` and on a same-page jump (WCAG 2.4.3 — a fragment scrolls but does not move focus).
 */
afterEach(() => {
  cleanup();
  window.location.hash = "";
});

const ROW = {
  userId: "u2",
  role: "server" as const,
  displayName: "Ko Ko",
  email: "koko@example.com",
  active: true,
  createdAt: "2026-09-01T00:00:00Z",
};
const mount = (initial: (typeof ROW)[] | null) =>
  render(
    <StaffLangProvider lang="en">
      <TeamManager initial={initial} selfUid="u1" selfEmail="me@example.com" callerRole="manager" />
    </StaffLangProvider>,
  );

describe("TeamManager as the sign-in screen's roster zone", () => {
  it("is a zone named by its own heading, with the roster and the add form when the read succeeded", () => {
    mount([ROW]);
    const zone = screen.getByRole("region", { name: "Team" });
    expect(zone.querySelector("#team-h")?.textContent).toBe("Team");
    expect(screen.getByRole("list", { name: "Staff" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Add/ })).toBeTruthy();
    expect(screen.getByText("Ko Ko")).toBeTruthy();
  });

  it("a FAILED read (null) prints the outage line — no form, no list — and promises nothing about the card above", () => {
    mount(null);
    expect(screen.getByRole("region", { name: "Team" })).toBeTruthy();
    expect(
      screen.getByText(
        "We can’t reach the ordering system — the roster can’t load right now. Try again in a moment.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByRole("button", { name: /Add/ })).toBeNull();
    expect(document.querySelectorAll('[role="status"]').length).toBe(0);
  });

  it("takes focus on the heading when it arrives at #team-h, and again on a same-page jump", async () => {
    window.location.hash = "#team-h";
    mount([ROW]);
    const h2 = document.getElementById("team-h")!;
    expect(document.activeElement).toBe(h2);
    (document.querySelector("#ts-name") as HTMLElement).focus();
    expect(document.activeElement).not.toBe(h2);
    await act(async () => {
      window.location.hash = "#other";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(document.activeElement).not.toBe(h2); // another fragment is not ours
    await act(async () => {
      window.location.hash = "#team-h";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(document.activeElement).toBe(h2);
  });

  it("does NOT steal focus when the page was opened without the fragment", () => {
    mount([ROW]);
    expect(document.activeElement).toBe(document.body);
  });
});
