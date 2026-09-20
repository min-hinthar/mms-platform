/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TableLineView } from "@/lib/floor-types";
import { STAFF } from "@/lib/i18n/staff";

/**
 * manager-2 (K35) — the drill-down's line controls are §17 through the shared `Stepper` primitive:
 * a tapped stepper button is `aria-disabled` while the write is in flight, never natively disabled
 * (which dropped keyboard/AT focus to <body> on every qty tap), and refuses a second tap; the note
 * save says a stated word while it saves, never "…" (its content IS its accessible name).
 */
type WriteResult = { ok: true } | { ok: false; error: string };
const staffSetQty = vi.fn((): Promise<WriteResult> => Promise.resolve({ ok: true }));
const setLineNotes = vi.fn((): Promise<WriteResult> => Promise.resolve({ ok: true }));
vi.mock("@/lib/staff-cart", () => ({
  staffSetQty: (...a: unknown[]) => staffSetQty(...(a as [])),
  setLineNotes: (...a: unknown[]) => setLineNotes(...(a as [])),
}));
vi.mock("./LossActionSheet", () => ({ LossActionSheet: () => null }));

const { StaffLangProvider } = await import("./StaffLangProvider");
const { StaffLineEditor } = await import("./StaffLineEditor");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const line = {
  id: "l1",
  name: "Mohinga",
  qty: 2,
  unitPriceCents: 1200,
  bySeatName: null,
  soldOut: false,
  state: "draft",
  comped: false,
  pendingApproval: false,
  notes: null,
  modifiers: [],
  refundedCents: 0,
} as unknown as TableLineView;

function mount() {
  render(
    <StaffLangProvider lang="en">
      <ul>
        <StaffLineEditor sessionId="s1" line={line} disabled={false} onError={() => {}} />
      </ul>
    </StaffLangProvider>,
  );
  return {
    inc: () =>
      screen.getByRole("button", { name: "Increase Mohinga quantity" }) as HTMLButtonElement,
    dec: () =>
      screen.getByRole("button", { name: "Decrease Mohinga quantity" }) as HTMLButtonElement,
  };
}

describe("StaffLineEditor — §17 through the stepper", () => {
  it("a qty tap leaves BOTH stepper buttons aria-disabled, never native, and refuses a second tap mid-flight", async () => {
    let release: ((r: WriteResult) => void) | null = null;
    staffSetQty.mockReturnValueOnce(
      new Promise<WriteResult>((r) => {
        release = r;
      }),
    );
    const { inc, dec } = mount();
    inc().focus();
    await act(async () => {
      fireEvent.click(inc());
    });
    expect(staffSetQty).toHaveBeenCalledTimes(1);
    // MUTATION: `disabled={disabled}` back on the primitive's buttons — `disabled` reads true, red.
    for (const b of [inc(), dec()]) {
      expect(b.disabled).toBe(false);
      expect(b.getAttribute("aria-disabled")).toBe("true");
    }
    expect(document.activeElement).toBe(inc());
    await act(async () => {
      fireEvent.click(inc());
    });
    expect(staffSetQty).toHaveBeenCalledTimes(1);
    await act(async () => {
      release!({ ok: true });
    });
    expect(inc().getAttribute("aria-disabled")).toBeNull();
  });

  it("the note save says a stated word while it saves — never an ellipsis — and is aria-busy", async () => {
    let release: ((r: WriteResult) => void) | null = null;
    setLineNotes.mockReturnValueOnce(
      new Promise<WriteResult>((r) => {
        release = r;
      }),
    );
    mount();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /note/i }));
    });
    const save = screen.getByRole("button", {
      name: STAFF["table.line.save"].en,
    }) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(save);
    });
    expect(setLineNotes).toHaveBeenCalledTimes(1);
    // MUTATION: `{notePending ? "…" : …}` — the name is "…" and this reddens.
    expect(save.textContent).toBe(STAFF["table.line.saving"].en);
    expect(save.disabled).toBe(false);
    expect(save.getAttribute("aria-busy")).toBe("true");
    await act(async () => {
      fireEvent.click(save);
    });
    expect(setLineNotes).toHaveBeenCalledTimes(1);
    await act(async () => {
      release!({ ok: true });
    });
  });
});
