/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RefundResult, SettledLine, SettledOrder } from "@/lib/refunds";
import { STAFF } from "@/lib/i18n/staff";

/**
 * manager-5 — the refund sheet's PIN discipline, pinned where it lives: a refused PIN leaves the
 * masked field (the next tap used to re-send the same wrong digits and burn an attempt toward the
 * lockout) with focus back in it; a lockout makes the field READ-ONLY and refuses the submit
 * (§17 — never native `disabled`, and `locked` was never read here at all).
 */
const refundLine = vi.fn(
  (): Promise<RefundResult> =>
    Promise.resolve({ ok: false, reason: "pin_wrong", attemptsRemaining: 2 }),
);
vi.mock("@/lib/refunds", () => ({ refundLine: (...a: unknown[]) => refundLine(...(a as [])) }));
vi.mock("./TicketText", () => ({ ExpoLineMy: () => null }));

const { StaffLangProvider } = await import("./StaffLangProvider");
const { RefundActionSheet } = await import("./RefundActionSheet");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const line = {
  id: "li1",
  name: "Mohinga",
  nameMy: null,
  qty: 1,
  unitPriceCents: 1200,
  taxCents: 100,
  modifiers: [],
  modifiersMy: [],
  notes: null,
  fulfillment: "dinein",
  refundedCents: 0,
  refunded: false,
  offeredCents: 1300,
  offerClamped: false,
} as SettledLine;
const order = {
  id: "o1",
  code: "AB12",
  tableNumber: 4,
  refundPath: "app",
  lines: [line],
} as unknown as SettledOrder;

function mount() {
  render(
    <StaffLangProvider lang="en">
      <RefundActionSheet order={order} line={line} onClose={() => {}} onDone={() => {}} />
    </StaffLangProvider>,
  );
  const pin = () => document.getElementById("refund-pin") as HTMLInputElement;
  const refund = () =>
    screen.getByRole("button", { name: /Refund \$13\.00|Refunding/ }) as HTMLButtonElement;
  return { pin, refund };
}

describe("RefundActionSheet — the PIN discipline", () => {
  it("a wrong PIN empties the field and hands focus back to it; the Refund button is aria-disabled, never native", async () => {
    const { pin, refund } = mount();
    fireEvent.change(pin(), { target: { value: "1234" } });
    expect(refund().getAttribute("aria-disabled")).toBeNull();
    await act(async () => {
      fireEvent.click(refund());
    });
    expect(refundLine).toHaveBeenCalledTimes(1);
    // MUTATION: drop `setPin("")` from the refusal — the field keeps "1234" and this reddens.
    expect(pin().value).toBe("");
    expect(document.activeElement).toBe(pin());
    expect(refund().disabled).toBe(false);
    expect(refund().getAttribute("aria-disabled")).toBe("true"); // empty PIN — a stated refusal
    expect(document.querySelector('[role="status"]')?.textContent).toContain("2");
  });

  it("a lockout makes the field read-only and refuses the submit until it lifts", async () => {
    const { pin, refund } = mount();
    fireEvent.change(pin(), { target: { value: "1234" } });
    refundLine.mockResolvedValueOnce({
      ok: false,
      reason: "pin_locked",
      lockedUntil: new Date(Date.now() + 30_000).toISOString(),
    });
    await act(async () => {
      fireEvent.click(refund());
    });
    expect(refundLine).toHaveBeenCalledTimes(1);
    // MUTATION: leave `locked` out of `useLockout`'s destructure — the field stays editable and the
    // button live, and this reddens on both.
    expect(pin().readOnly).toBe(true);
    expect(pin().disabled).toBe(false);
    fireEvent.change(pin(), { target: { value: "5678" } });
    expect(refund().getAttribute("aria-disabled")).toBe("true");
    await act(async () => {
      fireEvent.click(refund());
    });
    expect(refundLine).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="status"]')?.textContent).toMatch(
      new RegExp(STAFF["pin.lockedFor"].en.split("{x}")[0]!.trim()),
    );
  });

  it("§17 — while the refund runs the button is aria-disabled + busy and says a stated word", async () => {
    let release: ((r: RefundResult) => void) | null = null;
    refundLine.mockReturnValueOnce(
      new Promise<RefundResult>((r) => {
        release = r;
      }),
    );
    const { pin, refund } = mount();
    fireEvent.change(pin(), { target: { value: "1234" } });
    await act(async () => {
      fireEvent.click(refund());
    });
    expect(refund().disabled).toBe(false);
    expect(refund().getAttribute("aria-busy")).toBe("true");
    expect(refund().textContent).toContain(STAFF["floor.refund.working"].en);
    await act(async () => {
      fireEvent.click(refund());
    });
    expect(refundLine).toHaveBeenCalledTimes(1);
    await act(async () => {
      release!({ ok: true, amountCents: 1300 });
    });
  });
});
