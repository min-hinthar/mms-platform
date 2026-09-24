/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StaffWriteResult } from "@/lib/staff-cart";
import type { StaffMenuItem } from "./StaffMenuBrowser";

/**
 * Phase 2a (Codex round 1, P1) — the modifier sheet's add carries an ADD KEY whose lifetime is the
 * INTENT's (dish + choices + qty + note, `lib/staff-add-key.ts`): a retry after an unknown outcome
 * resends the same key; a definite outcome, or a CHANGED choice, gets a new one. The sheet itself is
 * stubbed to a button that submits a fixed choice and a line that names the failure it was handed.
 */
const add = vi.fn<(raw: { addKey?: string }) => Promise<StaffWriteResult>>();
vi.mock("@/lib/staff-cart", () => ({ staffAddItem: (raw: { addKey?: string }) => add(raw) }));
vi.mock("@/lib/register", () => ({ setCartCustomerName: vi.fn() }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
let choice: { modifierIds: string[]; qty: number; notes?: string } = {
  modifierIds: ["o1"],
  qty: 1,
};
vi.mock("./StaffModSheet", () => ({
  StaffModSheet: (p: { onAdd: (c: typeof choice) => void; error: null | { kind: string } }) => (
    <div>
      <button type="button" data-testid="sheet-add" onClick={() => p.onAdd(choice)}>
        add
      </button>
      <p data-testid="sheet-error">{p.error ? p.error.kind : ""}</p>
    </div>
  ),
}));

const { StaffLangProvider } = await import("./StaffLangProvider");
const { StaffMenuBrowser } = await import("./StaffMenuBrowser");

const SESSION = "11111111-1111-4111-8111-111111111111";
const ITEM: StaffMenuItem = {
  id: "33333333-3333-4333-8333-333333333333",
  nameEn: "Chicken Curry",
  nameMy: null,
  priceCents: 1450,
  imageUrl: null,
  soldOut: false,
  category: "Curries",
  groups: [
    {
      id: "g1",
      slug: "style",
      name: "Style",
      nameMy: null,
      selectionType: "single",
      minSelect: 1,
      maxSelect: 1,
      options: [],
    } as never,
  ],
};

let n = 0;
beforeEach(() => {
  n = 0;
  choice = { modifierIds: ["o1"], qty: 1 };
  vi.spyOn(crypto, "randomUUID").mockImplementation(
    () =>
      `00000000-0000-4000-8000-00000000000${++n}` as `${string}-${string}-${string}-${string}-${string}`,
  );
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

function mount() {
  render(
    <StaffLangProvider lang="en">
      <StaffMenuBrowser
        sessionId={SESSION}
        items={[ITEM]}
        categories={["Curries"]}
        counterOrder={false}
        initialName={null}
      />
    </StaffLangProvider>,
  );
}
async function openAndAdd() {
  const choose = document.querySelector<HTMLButtonElement>("li button.staff-btn");
  if (choose) fireEvent.click(choose);
  await act(async () => {
    fireEvent.click(document.querySelector('[data-testid="sheet-add"]')!);
  });
}
const keyOf = (i: number) => add.mock.calls[i]![0].addKey;

describe("StaffMenuBrowser — the sheet add's key", () => {
  it("a lost-response retry of the SAME choice resends the SAME key", async () => {
    mount();
    add.mockRejectedValueOnce(new Error("network"));
    await openAndAdd();
    add.mockResolvedValueOnce({ ok: true });
    await openAndAdd();
    expect(keyOf(0)).toBeTruthy();
    // MUTATION: mint per tap / send no key — the retry adds a second curry; red.
    expect(keyOf(1)).toBe(keyOf(0));
  });

  it("a CHANGED choice after an unknown outcome is a new add under a new key", async () => {
    mount();
    add.mockResolvedValueOnce({ ok: false, error: "x", code: "unconfirmed" });
    await openAndAdd();
    choice = { modifierIds: ["o2"], qty: 1 };
    add.mockResolvedValueOnce({ ok: true });
    await openAndAdd();
    expect(keyOf(0)).toBeTruthy();
    expect(keyOf(1)).not.toBe(keyOf(0));
  });

  it("an ok add, then the same choice again, is a NEW key", async () => {
    mount();
    add.mockResolvedValue({ ok: true });
    await openAndAdd();
    await openAndAdd();
    expect(keyOf(0)).toBeTruthy();
    expect(keyOf(1)).not.toBe(keyOf(0));
  });

  it("an unknown outcome is handed to the sheet as `unconfirmed`, and the page re-reads", async () => {
    mount();
    add.mockRejectedValueOnce(new Error("network"));
    await openAndAdd();
    expect(document.querySelector('[data-testid="sheet-error"]')?.textContent).toBe("unconfirmed");
    expect(refresh).toHaveBeenCalled();
  });
});
