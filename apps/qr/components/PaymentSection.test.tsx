/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { CartTotals } from "@mms/db";

/**
 * Phase 1b — the card Pay button charges on ONE tap (the W16c charge confirm is retired). Pinned:
 * the tap reaches `confirmPayment` directly, the button names the sum, and the W19 unsent-dishes
 * disclosure stands above it BEFORE the tap. Stripe is stubbed at the module seam — the iframe is
 * not what this file guards.
 */
const h = vi.hoisted(() => ({ confirmPayment: vi.fn() }));
vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ExpressCheckoutElement: () => null,
  PaymentElement: () => null,
  useStripe: () => ({ confirmPayment: h.confirmPayment }),
  useElements: () => ({}),
}));
vi.mock("@/lib/stripe-client", () => ({
  getStripePromise: () => Promise.resolve({}),
  stripeAppearance: () => ({}),
}));

const { PaymentSection } = await import("./PaymentSection");

const TOTALS = { totalCents: 4210 } as CartTotals;

afterEach(() => {
  cleanup();
  h.confirmPayment.mockReset();
});

const mount = (unsentCount = 0) =>
  render(
    <PaymentSection
      cartId="cart-1"
      clientSecret="pi_1_secret_x"
      totals={TOTALS}
      unsentCount={unsentCount}
      onEdit={() => {}}
    />,
  );

describe("Phase 1b — the card charge is one tap", () => {
  it("charges on the FIRST tap, with the sum on the button", async () => {
    // MUTATION: restore a confirm step (submit opens a question instead of confirming) — one tap
    // no longer reaches Stripe; red.
    h.confirmPayment.mockResolvedValue({ error: { message: "Your card was declined." } });
    mount();
    const pay = screen.getByRole("button", { name: "Pay $42.10" });
    await act(async () => {
      fireEvent.click(pay);
    });
    expect(h.confirmPayment).toHaveBeenCalledTimes(1);
    // A declined card returns the live Pay button for a retry, with the reason.
    expect(screen.getByRole("status").textContent).toBe("Your card was declined.");
    expect(screen.getByRole("button", { name: "Pay $42.10" })).toBeTruthy();
  });

  it("names unsent dishes above the Pay button before the tap (W19)", () => {
    // MUTATION: stop rendering the note — paying with drafts becomes a surprise again; red.
    mount(2);
    expect(document.body.textContent).toContain("Includes 2 items not sent yet");
  });

  it("says nothing about unsent dishes when there are none", () => {
    mount(0);
    expect(document.body.textContent).not.toContain("not sent yet");
  });
});
