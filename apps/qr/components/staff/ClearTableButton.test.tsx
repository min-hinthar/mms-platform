/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STAFF_DOOR_TARGET } from "@/lib/staff-door";

/**
 * Phase 2a · tablet — a cleared table returns to the FLOOR, asked for by name. A bare `/staff`
 * resolves by the door cookie: on a tablet whose Counter tap was refused (or never written) it lands
 * on the doors screen, so every clear dropped the server out of the floor they were working.
 */
const clearTable = vi.fn();
vi.mock("@/lib/floor", () => ({ clearTable: (...a: unknown[]) => clearTable(...(a as [])) }));
const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));

const { StaffLangProvider } = await import("./StaffLangProvider");
const { ClearTableButton } = await import("./ClearTableButton");
const { ts } = await import("@/lib/i18n/staff");

afterEach(() => {
  cleanup();
  clearTable.mockReset();
  replace.mockReset();
  refresh.mockReset();
});

describe("ClearTableButton — a successful clear", () => {
  it("replaces to the floor (STAFF_DOOR_TARGET.counter), never a bare /staff", async () => {
    clearTable.mockResolvedValue({ ok: true });
    render(
      <StaffLangProvider lang="en">
        <ClearTableButton sessionId="s1" label="4" paymentInFlight={false} />
      </StaffLangProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: ts("en", "settle.clear.btn") }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: ts("en", "settle.confirm") }));
    });
    expect(clearTable).toHaveBeenCalledWith({ sessionId: "s1" });
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(STAFF_DOOR_TARGET.counter);
  });

  it("a refused clear stays put — no navigation", async () => {
    clearTable.mockResolvedValue({ ok: false, error: "Invalid request." });
    render(
      <StaffLangProvider lang="en">
        <ClearTableButton sessionId="s1" label="4" paymentInFlight={false} />
      </StaffLangProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: ts("en", "settle.clear.btn") }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: ts("en", "settle.confirm") }));
    });
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});
