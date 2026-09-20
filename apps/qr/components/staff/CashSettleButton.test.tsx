/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STAFF_WRITE_OUTAGE } from "@/lib/staff-outage";

/**
 * K29(b) — the cash confirm is the shared sheet. What the move had to keep, and what it changed
 * on purpose (see the component's docblock): the trigger's place, the tip wiring, a refusal read
 * INSIDE the sheet, §17 on Cancel/Settle, and a handoff that UNMOUNTS the sheet rather than
 * closing it (the parent's #CODE card must be focused on an un-hidden page).
 */
const settleCash = vi.fn();
vi.mock("@/lib/staff-cart", () => ({ settleCash: (...a: unknown[]) => settleCash(...(a as [])) }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

/** Radix Presence compares `event.animationName` through `CSS.escape`; jsdom has no `CSS`. */
if (typeof globalThis.CSS === "undefined" || typeof globalThis.CSS.escape !== "function")
  (globalThis as unknown as { CSS: { escape: (s: string) => string } }).CSS = {
    escape: (s: string) => s,
  };
/** A stylesheet's answer: the computed `animationName` follows `data-state` (SheetExit.test). With
 *  it, a CLOSED sheet is held until `animationend` — so "gone at once" proves an UNMOUNT. */
function stubComputedStyle() {
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element) => {
    const style = real(el);
    const node = el as HTMLElement;
    if (!node.classList?.contains("mms-sheet") && !node.classList?.contains("mms-scrim"))
      return style;
    return new Proxy(style, {
      get(target, key) {
        if (key === "animationName")
          return node.getAttribute("data-state") === "closed" ? "sheetDown" : "up";
        const v = Reflect.get(target, key);
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
  });
}

/** Radix's FocusScope restores focus in a `setTimeout(0)` AFTER the sheet unmounts — a focus
 *  assertion made synchronously after a close sees the moment BEFORE any restore and passes for
 *  the wrong code (the M10 mutant survived exactly that way). Flush it first. */
const settleFocus = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const { StaffLangProvider } = await import("./StaffLangProvider");
const { CashSettleButton } = await import("./CashSettleButton");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

function mount(props: Partial<Parameters<typeof CashSettleButton>[0]> = {}) {
  const onHandoff = vi.fn();
  render(
    <StaffLangProvider lang="en">
      <CashSettleButton
        sessionId="s1"
        totalCents={4210}
        tipBaseCents={4000}
        handoff
        onHandoff={onHandoff}
        {...props}
      />
    </StaffLangProvider>,
  );
  const trigger = () => screen.getByRole("button", { name: /Settle in cash · \$42\.10/ });
  const open = () => {
    fireEvent.click(trigger()); // a tap — never focused first, the WebKit shape
    return screen.getByRole("dialog", { name: "Settle in cash" });
  };
  const settle = () => screen.getByRole("button", { name: /^Settle \$|^Settling…/ });
  const cancel = () => screen.getByRole("button", { name: "Cancel" });
  return { trigger, open, settle, cancel, onHandoff };
}

describe("CashSettleButton — the confirm is a sheet", () => {
  it("the trigger opens the named sheet; Cancel closes it and hands focus back to the trigger even though the tap never focused it", async () => {
    const { trigger, open, cancel } = mount();
    expect(document.activeElement).toBe(document.body);
    const dialog = open();
    expect(within(dialog).getByText(/Take \$42\.10 in cash\?/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(cancel());
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    await settleFocus();
    // MUTATION: drop `onCloseAutoFocus` — the primitive's captured opener is <body>, red.
    expect(document.activeElement).toBe(trigger());
  });

  it("a refused settle keeps the sheet open with the reason inside it, and Settle live again", async () => {
    settleCash.mockResolvedValueOnce({ ok: false, error: "Card reader offline" });
    const { open, settle } = mount();
    const dialog = open();
    await act(async () => {
      fireEvent.click(settle());
    });
    // MUTATION: `setConfirming(false)` on the error path — the dialog is gone, red.
    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(within(dialog).getByRole("alert").textContent).toContain("Card reader offline");
    expect(settle().getAttribute("aria-disabled")).toBeNull();
    expect(settle().getAttribute("aria-busy")).toBeNull();
  });

  it("a settle that REJECTS (a lost connection) is a refusal read in the sheet — never a locked sheet", async () => {
    settleCash.mockRejectedValueOnce(new Error("fetch failed"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { open, settle } = mount();
    const dialog = open();
    await act(async () => {
      fireEvent.click(settle());
    });
    // MUTATION: drop the try/catch around `settleCash` — nothing sets the error, the lock is
    // whatever React does with an escaped action, and the alert below is absent; red.
    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(within(dialog).getByRole("alert").textContent).toContain(STAFF_WRITE_OUTAGE);
    expect(settle().getAttribute("aria-busy")).toBeNull();
    expect(settle().getAttribute("aria-disabled")).toBeNull();
    expect(logged).toHaveBeenCalled();
  });

  it("while the settle runs: Settle is aria-disabled + aria-busy and refuses a second tap; the ✕ says so; a landed handoff UNMOUNTS the sheet and leaves focus for the parent's card", async () => {
    stubComputedStyle();
    const d = deferred<{ ok: true; orderId: string; totalCents: number }>();
    settleCash.mockReturnValueOnce(d.promise);
    const { open, settle, onHandoff, trigger } = mount();
    open();
    await act(async () => {
      fireEvent.click(settle());
    });
    expect(settleCash).toHaveBeenCalledTimes(1);
    expect(settleCash).toHaveBeenCalledWith({ sessionId: "s1", tipCents: 0 });
    expect(settle().getAttribute("aria-busy")).toBe("true");
    expect(settle().getAttribute("aria-disabled")).toBe("true");
    expect(settle().textContent).toBe("Settling…");
    expect(
      screen
        .getByRole("button", { name: "Close — finishing, please wait" })
        .getAttribute("aria-disabled"),
    ).toBe("true");
    await act(async () => {
      fireEvent.click(settle());
    });
    // MUTATION: drop `if (!canSettle) return` from `confirm()` — two settles, red.
    expect(settleCash).toHaveBeenCalledTimes(1);
    await act(async () => {
      d.resolve({ ok: true, orderId: "o1", totalCents: 4210 });
    });
    // MUTATION: `{!landed && …}` → always render the sheet — closed, not unmounted, it is HELD by
    // the stubbed exit animation (no `animationend` fired here), so the dialog is still there; red.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onHandoff).toHaveBeenCalledWith({ orderId: "o1", totalCents: 4210, changeCents: null });
    expect(refresh).toHaveBeenCalledTimes(1);
    await settleFocus();
    // MUTATION: focus the trigger regardless of `landedRef` — the parent's card focus is fought
    // (FloorDetailLive focuses the #CODE card in its own effect); red.
    expect(document.activeElement).not.toBe(trigger());
    expect(document.activeElement).toBe(document.body);
  });

  it("a quick-tip chip fills the field and lights; the settle carries its cents, nothing else", async () => {
    settleCash.mockReturnValueOnce(new Promise(() => {}));
    const { open, settle } = mount();
    const dialog = open();
    const chip = within(dialog).getByRole("button", { name: /^20%/ });
    fireEvent.click(chip);
    expect((document.getElementById("cash-tip") as HTMLInputElement).value).toBe("8.00");
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    expect(settle().textContent).toBe("Settle $50.10");
    await act(async () => {
      fireEvent.click(settle());
    });
    // MUTATION: `tipCents: 0` in the call — red. The amount itself never travels (server-derived).
    expect(settleCash).toHaveBeenCalledWith({ sessionId: "s1", tipCents: 800 });
  });

  it("an over-cap tip dims Settle with the cap named, and the tap is refused", async () => {
    const { open, settle } = mount();
    open();
    fireEvent.change(document.getElementById("cash-tip")!, { target: { value: "1001" } });
    expect(settle().getAttribute("aria-disabled")).toBe("true");
    expect(document.getElementById("cash-tip-cap")?.textContent).toContain("$1,000.00");
    await act(async () => {
      fireEvent.click(settle());
    });
    // MUTATION: drop `tipValid` from `canSettle` — the settle is sent, red.
    expect(settleCash).not.toHaveBeenCalled();
  });
});
