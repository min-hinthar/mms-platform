/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STAFF } from "@/lib/i18n/staff";
import type { StaffWriteResult } from "@/lib/staff-cart";

/**
 * Phase 2a (Codex round 1, P1) — the one-tap staff add carries an ADD KEY whose lifetime is the
 * intent's (`lib/staff-add-key.ts`): a re-tap after an UNKNOWN outcome resends the same key (the
 * ledger turns a landed first attempt into a no-op), a definite outcome retires it. The unknown is
 * said honestly — never "couldn't add, try again", which reads as "nothing landed" — and the page
 * re-reads so the bridge count ("Review · N not sent") tells the truth.
 */
const add = vi.fn<(raw: { addKey?: string }) => Promise<StaffWriteResult>>();
vi.mock("@/lib/staff-cart", () => ({ staffAddItem: (raw: { addKey?: string }) => add(raw) }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const { StaffLangProvider } = await import("./StaffLangProvider");
const { StaffAddButton } = await import("./StaffAddButton");

const SESSION = "11111111-1111-4111-8111-111111111111";
const ITEM = "33333333-3333-4333-8333-333333333333";

let n = 0;
beforeEach(() => {
  n = 0;
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
      <StaffAddButton sessionId={SESSION} menuItemId={ITEM} name="Mohinga" soldOut={false} />
    </StaffLangProvider>,
  );
  return () => document.querySelector<HTMLButtonElement>("button.staff-btn")!;
}
const tap = async (btn: HTMLButtonElement) => {
  await act(async () => {
    fireEvent.click(btn);
  });
};
const keyOf = (i: number) => add.mock.calls[i]![0].addKey;

describe("StaffAddButton — the add key", () => {
  it("a lost-response retry resends the SAME key", async () => {
    const btn = mount();
    add.mockRejectedValueOnce(new Error("network"));
    await tap(btn());
    add.mockResolvedValueOnce({ ok: true });
    await tap(btn());
    expect(add).toHaveBeenCalledTimes(2);
    expect(keyOf(0)).toMatch(/^[0-9a-f-]{36}$/);
    // MUTATION: send no key / mint per tap — the retry adds the dish a second time; red.
    expect(keyOf(1)).toBe(keyOf(0));
  });

  it("an `unconfirmed` answer is retried under the same key too", async () => {
    const btn = mount();
    add.mockResolvedValueOnce({ ok: false, error: "Couldn’t add that item.", code: "unconfirmed" });
    await tap(btn());
    add.mockResolvedValueOnce({ ok: true });
    await tap(btn());
    expect(keyOf(0)).toBeTruthy();
    expect(keyOf(1)).toBe(keyOf(0));
  });

  it("an ok add, then a second tap, is a NEW add under a NEW key", async () => {
    const btn = mount();
    add.mockResolvedValue({ ok: true });
    await tap(btn());
    await tap(btn());
    expect(keyOf(0)).toBeTruthy();
    expect(keyOf(1)).toBeTruthy();
    expect(keyOf(1)).not.toBe(keyOf(0));
  });

  it("a definite refusal retires the key", async () => {
    const btn = mount();
    add.mockResolvedValueOnce({ ok: false, error: "That table is closed.", code: "closed" });
    await tap(btn());
    add.mockResolvedValueOnce({ ok: true });
    await tap(btn());
    expect(keyOf(1)).not.toBe(keyOf(0));
  });
});

describe("StaffAddButton — the outcome, said honestly", () => {
  it("an unknown outcome says 'couldn't confirm — check the order', and re-reads the page", async () => {
    const btn = mount();
    add.mockRejectedValueOnce(new Error("network"));
    await tap(btn());
    // MUTATION: the old "Couldn't add that — try again" — an invitation to add it twice; red.
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(
      STAFF["browse.add.unconfirmed"].en,
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("an ok add re-reads the page, so the 'not sent' bridge count is current", async () => {
    const btn = mount();
    add.mockResolvedValueOnce({ ok: true });
    await tap(btn());
    // MUTATION: no router.refresh() after an ok add — "Review · N not sent" stays stale; red.
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
