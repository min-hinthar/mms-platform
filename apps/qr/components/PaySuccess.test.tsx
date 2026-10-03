/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";

/**
 * Phase 1c · account-star — A RESUME IS NOT AN ARRIVAL, for the browser's own Back. /track → /account
 * (to save the Stars) → Back lands on Stripe's return URL again, which carries no `resume=1`; before
 * the latch that remount replayed the confetti, the celebrate haptic and the paid chime for a payment
 * that moved no money this time. The latch is per PAYMENT (a different key celebrates) and fails
 * toward celebrating (a throwing sessionStorage behaves exactly as before).
 */
const h = vi.hoisted(() => ({ haptic: vi.fn(), chime: vi.fn() }));
vi.mock("@/lib/haptics", () => ({ haptic: h.haptic }));
vi.mock("@/lib/diner-sound", () => ({ chime: h.chime }));
// A motion-on, capable device — so the confetti gate is decided by the latch alone.
vi.mock("@mms/ui", () => ({
  useAnimationPreference: () => ({ shouldAnimate: true }),
  useDeviceTier: () => "high",
}));
vi.mock("./Confetti", () => ({ Confetti: () => <div data-testid="confetti" /> }));

const { PaySuccess } = await import("./PaySuccess");
const { CART } = await import("@/lib/i18n/cart");

beforeEach(() => {
  window.sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  h.haptic.mockReset();
  h.chime.mockReset();
});

/** Mount, let the effects run, and report whether confetti rendered; then unmount. */
function visit(celebrationKey: string | null) {
  const r = render(<PaySuccess starsEarned={1} celebrationKey={celebrationKey} />);
  const confetti = r.queryByTestId("confetti") !== null;
  act(() => r.unmount());
  return confetti;
}

describe("the celebration latch — one celebration per payment per tab", () => {
  it("a remount of the SAME payment replays nothing", () => {
    // RED when the latch is ignored: haptic and chime each fire twice, confetti renders twice.
    expect(visit("pi_A")).toBe(true);
    expect(visit("pi_A")).toBe(false);
    expect(h.haptic.mock.calls.filter(([m]) => m === "celebrate")).toHaveLength(1);
    expect(h.chime.mock.calls.filter(([m]) => m === "paid")).toHaveLength(1);
  });

  it("a DIFFERENT payment celebrates again", () => {
    visit("pi_A");
    expect(visit("pi_B")).toBe(true);
    expect(h.haptic.mock.calls.filter(([m]) => m === "celebrate")).toHaveLength(2);
    expect(h.chime.mock.calls.filter(([m]) => m === "paid")).toHaveLength(2);
  });

  it("with sessionStorage throwing, every mount celebrates — exactly as before the latch", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(visit("pi_A")).toBe(true);
    expect(visit("pi_A")).toBe(true);
    expect(h.haptic.mock.calls.filter(([m]) => m === "celebrate")).toHaveLength(2);
    expect(h.chime.mock.calls.filter(([m]) => m === "paid")).toHaveLength(2);
  });

  it("no key → no latch (celebrates on every mount, as before)", () => {
    visit(null);
    visit(null);
    expect(h.haptic.mock.calls.filter(([m]) => m === "celebrate")).toHaveLength(2);
  });
});

describe("the latch waits for the money (manual capture)", () => {
  it("a reload BEFORE the capture lands still rings the paid chime when it does", () => {
    // RED when the latch is recorded at mount: the awaiting-capture visit marks the payment
    // celebrated, the reload reads `replay`, and the chime — which waits for the capture — never
    // rings for this payment at all.
    const first = render(<PaySuccess starsEarned={1} celebrationKey="pi_M" awaitingCapture />);
    expect(h.chime).not.toHaveBeenCalled();
    act(() => first.unmount());
    // The reload, still awaiting…
    const again = render(<PaySuccess starsEarned={1} celebrationKey="pi_M" awaitingCapture />);
    expect(h.chime).not.toHaveBeenCalled();
    // …and then the capture lands.
    again.rerender(<PaySuccess starsEarned={1} celebrationKey="pi_M" awaitingCapture={false} />);
    expect(h.chime.mock.calls.filter(([m]) => m === "paid")).toHaveLength(1);
    act(() => again.unmount());
    // Once it has rung, the payment IS celebrated: a later Back replays nothing.
    expect(visit("pi_M")).toBe(false);
    expect(h.chime.mock.calls.filter(([m]) => m === "paid")).toHaveLength(1);
  });
});

describe("the paid headline (Phase 3b, D12 graft)", () => {
  it("reads the dictionary's paidThankYou pair — English first, the Burmese beneath with its lang", () => {
    const { container } = render(<PaySuccess starsEarned={1} celebrationKey="pi_H" />);
    const h1 = container.querySelector("h1")!;
    expect(CART.paidThankYou.en).toBe("Paid — thank you!"); // v7.2:468 verbatim
    // A space between the two: the Burmese is a CSS block, and name-from-content may not insert one
    // at a style boundary (blind pass on 3b).
    expect(h1.textContent).toBe(`${CART.paidThankYou.en} ${CART.paidThankYou.my}`);
    const my = h1.querySelectorAll('[lang="my"]');
    expect(my).toHaveLength(1);
    expect(my[0]!.textContent).toBe(CART.paidThankYou.my);
  });
  it("the awaiting-capture arm keeps its shipped English line", () => {
    const { container } = render(
      <PaySuccess starsEarned={1} celebrationKey="pi_H2" awaitingCapture />,
    );
    const h1 = container.querySelector("h1")!;
    expect(h1.textContent).toBe("Order sent — thank you!");
    expect(h1.querySelector('[lang="my"]')).toBeNull();
  });
});
