/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { RECEIPT_SETTLE_BOUND_MS } from "@/lib/save-stars";

/**
 * Phase 1c · account-star — ReceiptActions reports when its mint has SETTLED, exactly once, whatever
 * the answer. The save-your-Stars card waits for that report (so the receipt row it sits under is
 * already in place), which makes a missing report a STRANDED card: a refused or failed mint must
 * report too, with the email capture off.
 */
const h = vi.hoisted(() => ({ getReceiptLink: vi.fn() }));
vi.mock("@/lib/receipt", () => ({
  getReceiptLink: h.getReceiptLink,
  setReceiptEmail: vi.fn(),
}));

const { ReceiptActions } = await import("./ReceiptActions");

afterEach(() => {
  cleanup();
  h.getReceiptLink.mockReset();
});

const settle = async (answer: () => Promise<unknown>) => {
  h.getReceiptLink.mockImplementation(answer);
  const onSettled = vi.fn();
  render(<ReceiptActions orderId="11111111-1111-4111-8111-111111111111" onSettled={onSettled} />);
  await waitFor(() => expect(onSettled).toHaveBeenCalled());
  // One more turn, so a second (duplicate) report would have landed before the count is read.
  await new Promise((r) => setTimeout(r, 20));
  return onSettled;
};

describe("onSettled — once per mount, whatever the mint answers", () => {
  it("a minted link with email capture on reports emailEnabled: true", async () => {
    const onSettled = await settle(() =>
      Promise.resolve({
        ok: true,
        path: "/r/abc",
        accountEmail: null,
        emailedTo: null,
        emailEnabled: true,
      }),
    );
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledWith({ emailEnabled: true });
  });

  it("a minted link with the email half OFF reports emailEnabled: false", async () => {
    const onSettled = await settle(() =>
      Promise.resolve({
        ok: true,
        path: "/r/abc",
        accountEmail: null,
        emailedTo: null,
        emailEnabled: false,
      }),
    );
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledWith({ emailEnabled: false });
  });

  it("a REFUSED mint still reports — the card must never wait forever", async () => {
    // RED when onSettled is called only on ok.
    const onSettled = await settle(() => Promise.resolve({ ok: false, reason: "refused" }));
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledWith({ emailEnabled: false });
  });

  it("a FAILED mint (rejection) still reports", async () => {
    // RED when the catch arm does not report.
    const onSettled = await settle(() => Promise.reject(new Error("network")));
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledWith({ emailEnabled: false });
  });
});

describe("onSettled — BOUNDED, so a stalled mint never hides every rewards door", () => {
  it("a mint that never answers reports emailEnabled:false at the bound, and a late answer adds nothing", async () => {
    // Codex round 1 — RED without the bound: a stalled Server Action never settles, the tracker's
    // `successRewardsDoor` stays `pending`, and the success screen shows NO rewards door at all.
    vi.useFakeTimers();
    let answer: (v: unknown) => void = () => {};
    h.getReceiptLink.mockImplementation(
      () =>
        new Promise((r) => {
          answer = r;
        }),
    );
    const onSettled = vi.fn();
    render(<ReceiptActions orderId="11111111-1111-4111-8111-111111111111" onSettled={onSettled} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RECEIPT_SETTLE_BOUND_MS - 1);
    });
    expect(onSettled).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledWith({ emailEnabled: false });
    // The mint lands late: the row may render, but the report stays exactly once.
    await act(async () => {
      answer({ ok: true, path: "/r/abc", accountEmail: null, emailEnabled: true, emailedTo: null });
      await Promise.resolve();
    });
    expect(onSettled).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
