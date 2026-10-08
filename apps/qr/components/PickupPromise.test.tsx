/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { TrackedOrder } from "@/lib/track-order";
import { pendingArrivalKey } from "@/lib/arrival-pending";

/**
 * PD3 — the WIRING that has nowhere else to live (the T18 rule): the one-slot swap behind the
 * same-gesture guard, the take-back window's commit, the pending record written at the COMMIT and
 * never at the tap (m3 §G1), cleared by an answer (§G2), and the reconcile on a revisit (§F). The
 * rules themselves are pinned by value in lib/pickup-promise.test.ts and lib/arrival-pending.test.ts;
 * this file pins that the component OBEYS them.
 */
/** Did focus arrive the keyboard way? jsdom answers `:focus-visible` true for ANY focus, which is
 *  not a browser's heuristic (a touch tap's programmatic focus is not focus-visible) — so the suite
 *  says which it is: `false` is a touch (the window runs), `true` a keyboard user (the window holds). */
let keyboardFocus = false;
vi.mock("@mms/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@mms/ui")>()),
  // jsdom has no matchMedia; reduced motion here, so the TURN is the instant swap (the base style).
  useAnimationPreference: () => ({ shouldAnimate: false }),
  matchesFocusVisible: () => keyboardFocus,
}));
const announceArrival = vi.fn<(raw: { orderId: string }) => Promise<unknown>>();
vi.mock("@/lib/arrival-action", () => ({
  announceArrival: (raw: { orderId: string }) => announceArrival(raw),
}));

const { PickupPromise } = await import("./PickupPromise");

// 6:20 PM PDT on Oct 8 = 01:20Z Oct 9. "Now" starts at 6:01 PM the same evening.
const SLOT = "2026-10-09T01:20:00.000Z";
const NOW = Date.parse("2026-10-09T01:01:00.000Z");
const ORDER: TrackedOrder = {
  id: "0b6c1e58-0000-4000-8000-0000000a1b2c",
  status: "paid",
  totalCents: 2418,
  itemCount: 3,
  pickupSlot: SLOT,
  fireAt: null,
  togoStatus: "preparing",
  hasTogoFood: true,
  hasDineInFood: false,
  arrivedAt: null,
  hasGrocery: false,
  tableNumber: null,
  lines: [],
  breakdown: {
    subtotalCents: 2200,
    discountCents: 0,
    serviceChargeCents: 0,
    taxCents: 218,
    tipCents: 0,
  },
  refund: { state: "none", refundedCents: 0, netPaidCents: 2418 },
  dropped: { count: 0, lines: [] },
  tender: "card",
  createdAt: "2026-10-09T00:58:00.000Z",
  customerName: "Aye Aye",
  togoReadyAt: null,
  togoPickedUpAt: null,
};
const KEY = pendingArrivalKey(ORDER.id);

const mount = (o: Partial<TrackedOrder> = {}, live = true) =>
  render(
    <PickupPromise order={{ ...ORDER, ...o }} justPaid={false} live={live} onWake={() => {}} />,
  );
const button = (c: HTMLElement, text: string) =>
  [...c.querySelectorAll("button")].find((b) => b.textContent?.includes(text)) ?? null;
const region = (c: HTMLElement) => c.querySelector('[role="status"]')?.textContent ?? "";

beforeEach(() => {
  keyboardFocus = false;
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  window.localStorage.clear();
  window.sessionStorage.clear();
  announceArrival.mockReset();
  announceArrival.mockResolvedValue({ ok: true });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the page while cooking", () => {
  it("says NOW once as the h1 — the shipped pair — with the booked time on the ticket and the real clock on the path", () => {
    const { container } = mount();
    const h1 = container.querySelector("h1");
    expect(h1?.textContent).toContain("Your order’s with the kitchen.");
    expect(h1?.querySelector('[lang="my"]')?.textContent).toBe(
      "သင့်အော်ဒါ မီးဖိုချောင်ထဲ ရောက်နေပါပြီနော်",
    );
    // The ticket: Dad's words, the slot, the countdown, the stub with the name and the code.
    const ticket = container.querySelector(".claim-ticket")!;
    expect(ticket.getAttribute("data-face")).toBe("time");
    expect(ticket.querySelector("h2")?.textContent).toContain("Pickup");
    expect(ticket.querySelector("h2")?.textContent).toContain("လာယူချိန်");
    expect(ticket.querySelector(".claim-figure")?.textContent).toBe("6:20 PM");
    expect(ticket.querySelector(".claim-countdown")?.textContent).toContain("in ~19 min");
    expect(ticket.querySelector(".claim-stub")?.classList.contains("ph-no-capture")).toBe(true);
    expect(ticket.querySelector(".claim-stub")?.textContent).toContain("Aye Aye");
    expect(ticket.querySelector(".claim-stub")?.textContent).toContain("#0A1B2C");
    expect(ticket.querySelector(".sr-only")?.textContent).toBe("Order reference 0 A 1 B 2 C");
    // The path: "In the kitchen" is the current stop; a check marks the done one; one clock.
    const now = container.querySelector('[aria-current="step"]');
    expect(now?.textContent).toContain("In the kitchen");
    expect(container.querySelector('[data-state="done"] svg')).not.toBeNull();
    expect(container.querySelector('[data-state="done"]')?.textContent).toContain("5:58 PM");
    // No eyebrow, no apology, no ETA words anywhere.
    expect(container.textContent).not.toMatch(/any minute|sorry/i);
    expect(button(container, "I’m here")).not.toBeNull();
  });
});

describe("'I’m here' — the one-slot swap, the same-gesture guard, the take-back", () => {
  it("a tap swaps in Undo; a tap inside the same gesture is ignored; after it, Undo takes the tap back with nothing written", async () => {
    const { container } = mount();
    fireEvent.click(button(container, "I’m here")!);
    const undo = button(container, "Undo");
    expect(undo).not.toBeNull();
    expect(undo!.classList.contains("arrival-undo")).toBe(true);
    // The name is "Undo ပြန်ဖျက်": the seconds ride an aria-hidden leaf.
    expect(undo!.querySelector("[aria-hidden]")?.textContent).toMatch(/ — \ds/);
    expect(region(container)).toContain("We’ll tell the counter you’re here.");
    expect(document.activeElement).toBe(undo);
    // RED when the guard is dropped: the second half of a double-tap would un-ring the arrival.
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    fireEvent.click(button(container, "Undo")!);
    expect(button(container, "Undo")).not.toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    fireEvent.click(button(container, "Undo")!);
    expect(button(container, "I’m here")).not.toBeNull();
    expect(region(container)).toContain("Okay — we didn’t tell the counter.");
    // Nothing was written: no send, no pending record (§G1 — never at the tap).
    expect(announceArrival).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(KEY)).toBeNull();
    // And the re-offered "I’m here" is held for the same gesture too.
    fireEvent.click(button(container, "I’m here")!);
    expect(button(container, "Undo")).toBeNull();
  });

  it("the window commits at six seconds: the record is written BEFORE the send and cleared by the ok answer", async () => {
    const { container } = mount();
    let recordAtSend: string | null = "unread";
    announceArrival.mockImplementation(async () => {
      recordAtSend = window.localStorage.getItem(KEY);
      return { ok: true };
    });
    fireEvent.click(button(container, "I’m here")!);
    await act(async () => {
      vi.advanceTimersByTime(5_900);
    });
    expect(announceArrival).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(KEY)).toBeNull(); // still only a tap, nothing committed
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(announceArrival).toHaveBeenCalledTimes(1);
    expect(recordAtSend).not.toBeNull(); // the commit wrote it first (§G1)
    await act(async () => {
      await Promise.resolve();
    });
    expect(window.localStorage.getItem(KEY)).toBeNull(); // the answer cleared it (§F1)
    expect(container.textContent).toContain("The counter knows you’re here — hang tight.");
    expect(button(container, "I’m here")).toBeNull();
    expect(button(container, "Undo")).toBeNull();
  });

  it("a REFUSED answer clears the record and returns the card to the question (§G2)", async () => {
    const { container } = mount();
    announceArrival.mockResolvedValue({
      ok: false,
      error: "Couldn’t let the counter know — try again.",
      reason: "not_today",
    });
    fireEvent.click(button(container, "I’m here")!);
    await act(async () => {
      vi.advanceTimersByTime(6_300);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(button(container, "I’m here")).not.toBeNull();
    expect(container.textContent).toContain("Couldn’t let the counter know — try again.");
  });

  it("a keyboard user parked on Undo HOLDS the window (WCAG 2.2.1); leaving it lets the window run on", async () => {
    keyboardFocus = true;
    const { container } = mount();
    fireEvent.click(button(container, "I’m here")!);
    // Focus moved onto Undo the keyboard way: the window stops running under them.
    await act(async () => {
      vi.advanceTimersByTime(9_000);
    });
    expect(announceArrival).not.toHaveBeenCalled();
    expect(button(container, "Undo")).not.toBeNull();
    // RED when the hold is ignored: the arrival would have gone through at six seconds.
    fireEvent.blur(button(container, "Undo")!);
    await act(async () => {
      vi.advanceTimersByTime(6_300);
    });
    expect(announceArrival).toHaveBeenCalledTimes(1);
  });

  it("a send with NO answer keeps the record for the next visit", async () => {
    const { container } = mount();
    announceArrival.mockRejectedValue(new Error("offline"));
    fireEvent.click(button(container, "I’m here")!);
    await act(async () => {
      vi.advanceTimersByTime(6_300);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(window.localStorage.getItem(KEY)).not.toBeNull();
  });
});

describe("the revisit: a committed arrival nobody answered is re-sent, once", () => {
  it("posts the pending record to the route and clears it on an ok answer", async () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ orderId: ORDER.id, committedAt: "2026-10-09T01:00:00.000Z" }),
    );
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const { container } = mount();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe("/api/track/arrival");
    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(container.textContent).toContain("The counter knows you’re here — hang tight.");
    vi.unstubAllGlobals();
  });
  it("a stamped order retires its stale record without a send", () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ orderId: ORDER.id, committedAt: "2026-10-09T01:00:00.000Z" }),
    );
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    mount({ arrivedAt: "2026-10-09T01:00:30.000Z" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(KEY)).toBeNull();
    vi.unstubAllGlobals();
  });
});

describe("Ready and late", () => {
  it("at Ready the ticket shows the code face and the tab title names it; the arrival is still offered", () => {
    const { container } = mount({ togoStatus: "ready", togoReadyAt: "2026-10-09T01:14:00.000Z" });
    const ticket = container.querySelector(".claim-ticket")!;
    expect(ticket.getAttribute("data-face")).toBe("code");
    expect(ticket.querySelector("h2")?.textContent).toContain("Ready for pickup");
    expect(ticket.querySelector(".claim-figure")?.textContent).toBe("#0A1B2C");
    expect(ticket.querySelector(".claim-figure")?.classList.contains("ph-no-capture")).toBe(true);
    expect(container.querySelector("h1")?.textContent).toContain("Your order is ready.");
    expect(document.title).toBe("Ready for pickup · Morning Star");
    expect(button(container, "I’m here")).not.toBeNull();
  });
  it("fifteen minutes past the slot, unbagged: honest words, the door LAST, no ETA", () => {
    vi.setSystemTime(Date.parse(SLOT) + 17 * 60_000);
    const { container } = mount();
    expect(container.querySelector("h1")?.textContent).toContain(
      "Your 6:20 PM order isn’t bagged yet.",
    );
    expect(container.textContent).toContain("It shows here the moment it is.");
    const door = container.querySelector('a[href="tel:+16266655317"]');
    expect(door?.getAttribute("aria-label")).toBe("Call (626) 665-5317");
    // The door is the guide card's LAST child, under the hero (B10).
    const card = container.querySelector(".pickup-guide")!;
    expect(card.lastElementChild).toBe(door);
    expect(container.querySelector(".claim-countdown")).toBeNull();
  });
  it("never offers the arrival on another day", () => {
    vi.setSystemTime(Date.parse("2026-10-08T06:00:00.000Z")); // 11 PM PDT the night before
    const { container } = mount();
    expect(button(container, "I’m here")).toBeNull();
  });
});
