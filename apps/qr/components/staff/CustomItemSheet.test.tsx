/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StaffWriteResult } from "@/lib/staff-cart";
import { STAFF } from "@/lib/i18n/staff";
import { tf } from "@/lib/i18n/fill";

/**
 * The custom item's sheet (owner, 2026-10-24): every refusal stated in its ONE region, the price
 * held to the menu's bounds, and an add whose answer was lost keeps its key so Add again can never
 * ring it twice. Each rule carries a `custom-sheet/*` mutant.
 */
const add = vi.fn((): Promise<StaffWriteResult> => Promise.resolve({ ok: true }));
vi.mock("@/lib/staff-cart", () => ({ staffAddCustomItem: (...a: unknown[]) => add(...(a as [])) }));

const { StaffLangProvider } = await import("./StaffLangProvider");
const { CustomItemSheet } = await import("./CustomItemSheet");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function mount() {
  const onAdded = vi.fn();
  const onClose = vi.fn();
  render(
    <StaffLangProvider lang="en">
      <CustomItemSheet open sessionId="s-1" onClose={onClose} onAdded={onAdded} />
    </StaffLangProvider>,
  );
  return { onAdded, onClose };
}
const region = () => document.querySelector('[role="dialog"] [role="status"]')!;
const submit = () =>
  act(async () => {
    fireEvent.submit(document.querySelector('[role="dialog"] form')!);
  });
const type = (id: string, value: string) =>
  fireEvent.change(document.getElementById(id)!, { target: { value } });

describe("CustomItemSheet", () => {
  it("a blank name is refused out loud and nothing is sent; the Add key is aria-disabled, never native", async () => {
    mount();
    const btn = document.querySelector<HTMLButtonElement>('[role="dialog"] button[type="submit"]')!;
    expect(btn.disabled).toBe(false);
    expect(btn.getAttribute("aria-disabled")).toBe("true");
    await submit();
    expect(add).not.toHaveBeenCalled();
    expect(region().textContent).toBe(STAFF["pad.custom.err.name"].en);
  });

  it("a price below the menu's floor says the floor and sends nothing", async () => {
    mount();
    type("custom-name", "Cake");
    type("custom-price", "0.10");
    await submit();
    expect(add).not.toHaveBeenCalled();
    expect(region().textContent).toBe(tf("en", "browse.price.draft.below", { m: "$0.25" }));
  });

  it("a landed add sends the cents, the qty and the trimmed name, then closes through the parent", async () => {
    const { onAdded, onClose } = mount();
    type("custom-name", "  Birthday  cake ");
    type("custom-price", "12.5");
    fireEvent.click(screen.getByRole("button", { name: STAFF["pad.custom.more"].en }));
    expect(
      screen.getByRole("button", { name: tf("en", "pad.custom.add", { n: 2, m: "$25.00" }) }),
    ).toBeTruthy();
    await submit();
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "s-1",
        name: "Birthday cake",
        priceCents: 1250,
        qty: 2,
      }),
    );
    expect(onAdded).toHaveBeenCalledWith("Birthday cake");
    expect(onClose).toHaveBeenCalled();
  });

  it("an UNCONFIRMED add keeps its key — Add again is the same add (`custom-sheet/unconfirmed-new-key`)", async () => {
    add.mockResolvedValueOnce({ ok: false, error: "x", code: "unconfirmed" });
    mount();
    type("custom-name", "Cake");
    type("custom-price", "12");
    await submit();
    expect(region().textContent).toBe(tf("en", "pad.err.add.unconfirmed", { x: "Cake" }));
    await submit();
    const keys = add.mock.calls.map((c) => (c as unknown as [{ addKey: string }])[0].addKey);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it("a DEFINITE refusal mints a new key, and says the shipped sentence naming the item", async () => {
    add.mockResolvedValueOnce({ ok: false, error: "x", code: "paying" });
    mount();
    type("custom-name", "Cake");
    type("custom-price", "12");
    await submit();
    expect(region().textContent).toBe(tf("en", "pad.err.add.paying", { x: "Cake" }));
    await submit();
    const keys = add.mock.calls.map((c) => (c as unknown as [{ addKey: string }])[0].addKey);
    expect(keys[0]).not.toBe(keys[1]);
  });
});
