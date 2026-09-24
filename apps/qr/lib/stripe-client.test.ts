import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 1c — the Stripe.js singleton's reset seam. `getStripePromise()` is called in the RENDER body
 * of SharePay and SecureTabButton, so it must NEVER re-create a failed loader on its own (that would
 * inject a fresh script on every render after a failure); the ONE way to retry is the explicit
 * `resetStripePromise()` PaymentSection calls after Stripe.js itself rejected.
 */
const h = vi.hoisted(() => ({ loadStripe: vi.fn() }));
vi.mock("@stripe/stripe-js", () => ({ loadStripe: h.loadStripe }));
vi.mock("./stripe-env", () => ({ resolvePublishableKey: () => ({ value: "pk_test_x" }) }));

const { getStripePromise, resetStripePromise } = await import("./stripe-client");

beforeEach(() => {
  resetStripePromise();
  h.loadStripe.mockReset();
});

describe("Phase 1c — the Stripe.js loader is re-created only on an explicit reset", () => {
  it("a rejected load stays the SAME promise until reset; after reset a NEW one loads", async () => {
    // MUTATION: auto-reset inside the accessor — the first assertion goes red.
    // MUTATION: reset is a no-op — the second goes red.
    const failed = Promise.reject(new Error("Failed to load Stripe.js"));
    failed.catch(() => {}); // handled here so the runner sees no unhandled rejection
    const stripe = { id: "stripe" };
    h.loadStripe.mockReturnValueOnce(failed).mockReturnValueOnce(Promise.resolve(stripe));

    const first = getStripePromise();
    await expect(first).rejects.toThrow("Failed to load Stripe.js");
    expect(getStripePromise()).toBe(first); // SharePay/SecureTabButton's render-body calls, unchanged
    expect(h.loadStripe).toHaveBeenCalledTimes(1);

    resetStripePromise();
    const second = getStripePromise();
    expect(second).not.toBe(first);
    await expect(second).resolves.toBe(stripe);
    expect(h.loadStripe).toHaveBeenCalledTimes(2);
  });
});
