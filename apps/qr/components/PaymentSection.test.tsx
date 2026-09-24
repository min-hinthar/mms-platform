/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { CartTotals } from "@mms/db";
import { PAY_ELEMENT_TIMING } from "@/lib/pay-element";

/**
 * The pay step's WIRING (the rules themselves are values in `lib/pay-element.test.ts`).
 *
 * Phase 1b — the card Pay button charges on ONE tap (the W16c charge confirm is retired). Pinned:
 * the tap reaches `confirmPayment` directly, the button names the sum, and the W19 unsent-dishes
 * disclosure stands above it BEFORE the tap.
 *
 * Phase 1c — the tap reaches it only once the card form THIS mount created is ready, the wallet has
 * settled (or its grace passed) and the layout has held still for `settleMs`; a confirm can never
 * latch; a load failure is an inline card whose one button can work; and the whole step remounts
 * on a new clientSecret. Stripe is stubbed at the module seam — the iframe is not what this file
 * guards. `stripe-client`'s appearance/fonts run FOR REAL (jsdom has no `matchMedia`, which proves
 * its guard), with only the loader replaced.
 */
const h = vi.hoisted(() => {
  const confirmPayment = vi.fn();
  return {
    confirmPayment,
    stripe: { confirmPayment },
    elements: {},
    getStripePromise: vi.fn<() => Promise<unknown> | null>(),
    reset: vi.fn(),
    diagnose: vi.fn(async () => "unknown" as const),
    truth: "unknown" as "unknown" | "you-offline" | "we-down",
    mounts: [] as { options: Record<string, unknown> }[],
    card: null as null | Record<string, (...a: unknown[]) => unknown>,
    express: null as null | Record<string, (...a: unknown[]) => unknown>,
  };
});
vi.mock("@stripe/react-stripe-js", async () => {
  const React = await import("react");
  return {
    Elements: ({
      children,
      options,
    }: {
      children: React.ReactNode;
      options: Record<string, unknown>;
    }) => {
      // One entry per MOUNT (a re-key is a remount; a re-render is not).
      React.useEffect(() => {
        h.mounts.push({ options });
      }, []); // eslint-disable-line react-hooks/exhaustive-deps
      return <>{children}</>;
    },
    ExpressCheckoutElement: (props: Record<string, (...a: unknown[]) => unknown>) => {
      h.express = props;
      return null;
    },
    PaymentElement: (props: Record<string, (...a: unknown[]) => unknown>) => {
      h.card = props;
      return null;
    },
    useStripe: () => h.stripe,
    useElements: () => h.elements,
  };
});
// The real module's `@stripe/stripe-js` import would inject js.stripe.com into jsdom.
vi.mock("@stripe/stripe-js", () => ({ loadStripe: vi.fn() }));
vi.mock("@/lib/stripe-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/stripe-client")>()),
  getStripePromise: () => h.getStripePromise(),
  resetStripePromise: h.reset,
}));
vi.mock("@/lib/useConnectionTruth", () => ({
  useConnectionTruth: () => ({ truth: h.truth, diagnose: h.diagnose }),
}));

const { PaymentSection } = await import("./PaymentSection");

const TOTALS = { totalCents: 4210 } as CartTotals;
const onEdit = vi.fn();
const onPayingChange = vi.fn();

/** A rejected load, marked handled so the runner reports no unhandled rejection. */
const rejected = () => {
  const p = Promise.reject(new Error("Failed to load Stripe.js"));
  p.catch(() => {});
  return p;
};

beforeEach(() => {
  vi.useFakeTimers();
  h.getStripePromise.mockReset();
  h.getStripePromise.mockImplementation(() => Promise.resolve(h.stripe));
  h.mounts.length = 0;
  h.card = null;
  h.express = null;
  h.truth = "unknown";
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  h.confirmPayment.mockReset();
  h.reset.mockReset();
  h.diagnose.mockClear();
  onEdit.mockReset();
  onPayingChange.mockReset();
});

const mount = (
  extra: {
    unsentCount?: number;
    counterDoor?: boolean;
    clientSecret?: string;
    hold?: boolean;
  } = {},
) =>
  render(
    <PaymentSection
      cartId="cart-1"
      clientSecret={extra.clientSecret ?? "pi_1_secret_x"}
      totals={TOTALS}
      unsentCount={extra.unsentCount ?? 0}
      counterDoor={extra.counterDoor}
      hold={extra.hold}
      onEdit={onEdit}
      onPayingChange={onPayingChange}
    />,
  );
const flush = () =>
  act(async () => {
    await Promise.resolve();
  });
const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
const pay = () => screen.getByRole("button", { name: "Pay $42.10" });
const form = () => pay().closest("form")!;
const submit = () =>
  act(async () => {
    fireEvent.submit(form());
  });
const cardReady = () =>
  act(async () => {
    h.card!.onReady!({});
  });
const walletReady = (available: boolean) =>
  act(async () => {
    h.express!.onReady!({
      availablePaymentMethods: available ? { applePay: true, googlePay: false } : undefined,
    });
  });
const cardError = (type: string) =>
  act(async () => {
    h.card!.onLoadError!({ elementType: "payment", error: { type } });
  });
const status = () => screen.getByRole("status");
const failHeading = () => screen.queryByRole("heading", { level: 2 });

/** Mount → card + wallet ready → the settle window passes: the Pay button is live. */
async function live() {
  mount();
  await flush();
  await cardReady();
  await walletReady(false);
  await advance(PAY_ELEMENT_TIMING.settleMs);
}

describe("Phase 1b — the card charge is one tap", () => {
  it("charges on the FIRST tap, with the sum on the button", async () => {
    // MUTATION: restore a confirm step (submit opens a question instead of confirming) — one tap
    // no longer reaches Stripe; red. (Phase 1c: the form is made ready first — the gate is the
    // subject of the next describe, not this one.)
    h.confirmPayment.mockResolvedValue({ error: { message: "Your card was declined." } });
    await live();
    await act(async () => {
      fireEvent.click(pay());
    });
    expect(h.confirmPayment).toHaveBeenCalledTimes(1);
    // A declined card returns the live Pay button for a retry, with the reason.
    expect(status().textContent).toBe("Your card was declined.");
    expect(pay().getAttribute("aria-disabled")).toBeNull();
    expect(h.mounts).toHaveLength(1); // a decline keeps the mount (lib/lock.ts)
  });

  it("names unsent dishes above the Pay button before the tap (W19)", () => {
    // MUTATION: stop rendering the note — paying with drafts becomes a surprise again; red.
    mount({ unsentCount: 2 });
    expect(document.body.textContent).toContain("Includes 2 items not sent yet");
  });

  it("says nothing about unsent dishes when there are none", () => {
    mount({ unsentCount: 0 });
    expect(document.body.textContent).not.toContain("not sent yet");
  });
});

describe("Phase 1c — the Pay button cannot charge before its form exists, and never latches", () => {
  it("Pay refuses before the card form is ready", async () => {
    // MUTANT pay-section/submit-ignores-payable — red.
    mount();
    await flush();
    const btn = pay();
    expect(btn.getAttribute("aria-disabled")).toBe("true");
    expect(btn.hasAttribute("disabled")).toBe(false); // K35: focus stays, the refusal is ours
    await submit();
    expect(h.confirmPayment).not.toHaveBeenCalled();
    const desc = document.getElementById(btn.getAttribute("aria-describedby") ?? "");
    expect(desc?.textContent?.startsWith("Loading the secure card form…")).toBe(true);
  });

  it("a submit at settleMs−1 is refused, at settleMs accepted", async () => {
    h.confirmPayment.mockReturnValue(new Promise(() => {}));
    mount();
    await flush();
    await cardReady();
    await walletReady(false);
    await advance(PAY_ELEMENT_TIMING.settleMs - 1);
    expect(pay().getAttribute("aria-disabled")).toBe("true");
    await submit();
    expect(h.confirmPayment).not.toHaveBeenCalled();
    await advance(1);
    expect(pay().getAttribute("aria-disabled")).toBeNull();
    expect(pay().getAttribute("aria-describedby")).toBeNull();
    await submit();
    expect(h.confirmPayment).toHaveBeenCalledTimes(1);
  });

  it("waits for the wallet grace when Express stays silent", async () => {
    // MUTATION: the grace timer is wired to slowMs — red.
    mount();
    await flush();
    await cardReady();
    await advance(PAY_ELEMENT_TIMING.walletGraceMs - 1);
    expect(document.querySelector(".pay-skel")).not.toBeNull(); // still the one honest wait
    expect(pay().getAttribute("aria-disabled")).toBe("true");
    await advance(1); // the grace ends: the form reveals, the settle window opens
    expect(document.querySelector(".pay-skel")).toBeNull();
    expect(pay().getAttribute("aria-disabled")).toBe("true");
    await advance(PAY_ELEMENT_TIMING.settleMs);
    expect(pay().getAttribute("aria-disabled")).toBeNull();
  });

  it("two submits in ONE act charge once", async () => {
    // MUTANT pay-section/double-submit (drop the ref check) — ×2, red.
    h.confirmPayment.mockReturnValue(new Promise(() => {}));
    await live();
    await act(async () => {
      fireEvent.submit(form());
      fireEvent.submit(form());
    });
    expect(h.confirmPayment).toHaveBeenCalledTimes(1);
  });

  it("a rejecting confirmPayment gives the button back", async () => {
    // MUTANT pay-section/throw-latches (drop the rejection clear) — red.
    h.confirmPayment.mockRejectedValue(new Error("IntegrationError"));
    await live();
    await submit();
    await flush();
    expect(pay().getAttribute("aria-busy")).toBe("false");
    expect(pay().getAttribute("aria-disabled")).toBeNull();
    const edit = screen.getByRole("button", { name: /Edit order/ });
    expect(edit.getAttribute("aria-disabled")).toBeNull();
    expect(onPayingChange).toHaveBeenLastCalledWith(false);
    expect(status().textContent).toContain("Payment couldn’t start — try again.");
    // …and the button really is live again: a second tap reaches Stripe.
    await submit();
    expect(h.confirmPayment).toHaveBeenCalledTimes(2);
  });

  it("Express refusal fails the sheet; wallets skip the settle window", async () => {
    // MUTANT pay-section/express-refusal-hangs (drop paymentFailed) — red.
    // MUTATION: the wallet path uses payable — red.
    h.confirmPayment.mockReturnValue(new Promise(() => {}));
    mount();
    await flush();
    const early = vi.fn();
    await act(async () => {
      h.express!.onConfirm!({ paymentFailed: early });
    });
    expect(early).toHaveBeenCalledTimes(1);
    expect(early).toHaveBeenCalledWith({ reason: "fail" });
    expect(h.confirmPayment).not.toHaveBeenCalled();

    await cardReady();
    await walletReady(true); // revealed — the settle window has NOT passed
    expect(pay().getAttribute("aria-disabled")).toBe("true");
    const sheet = vi.fn();
    await act(async () => {
      h.express!.onConfirm!({ paymentFailed: sheet });
    });
    expect(h.confirmPayment).toHaveBeenCalledTimes(1);
    expect(sheet).not.toHaveBeenCalled();
  });
});

describe("Phase 1c — a releasing lock (`hold`) refuses every charge path", () => {
  // The pay button is `aria-disabled`, never native disabled, so a submit still FIRES; `hold` (a
  // leave releasing the pay-window lock, cancelling the intent) must be refused inside confirm().
  // MUTANT pay-section/hold-ignored (drop `|| hold`) — both cases red.
  async function liveHeld() {
    mount({ hold: true });
    await flush();
    await cardReady();
    await walletReady(true);
    await advance(PAY_ELEMENT_TIMING.settleMs);
  }

  it("a card submit under a hold never reaches Stripe", async () => {
    h.confirmPayment.mockReturnValue(new Promise(() => {}));
    await liveHeld();
    await submit();
    expect(h.confirmPayment).not.toHaveBeenCalled();
    expect(onPayingChange).not.toHaveBeenCalledWith(true);
  });

  it("a wallet confirm under a hold fails the sheet and never reaches Stripe", async () => {
    h.confirmPayment.mockReturnValue(new Promise(() => {}));
    await liveHeld();
    const sheet = vi.fn();
    await act(async () => {
      h.express!.onConfirm!({ paymentFailed: sheet });
    });
    expect(h.confirmPayment).not.toHaveBeenCalled();
    expect(sheet).toHaveBeenCalledWith({ reason: "fail" });
  });

  it("a wallet confirm that REJECTS fails the sheet too, and gives the button back", async () => {
    // A rejected confirmPayment never reached Stripe's sheet flow; an untold sheet spins until
    // Stripe's own timeout. RED without the paymentFailed call in the catch.
    h.confirmPayment.mockRejectedValue(new Error("IntegrationError"));
    await live();
    const sheet = vi.fn();
    await act(async () => {
      h.express!.onConfirm!({ paymentFailed: sheet });
    });
    await flush();
    expect(h.confirmPayment).toHaveBeenCalledTimes(1);
    expect(sheet).toHaveBeenCalledWith({ reason: "fail" });
    expect(onPayingChange).toHaveBeenLastCalledWith(false);
  });
});

describe("Phase 1c — a failure is an inline card whose one button can work", () => {
  it("Stripe.js failing shows the failure card, not a dead button", async () => {
    // MUTATION: remove the promise dispatch — red. MUTATION: role=alert on the card — red.
    h.getStripePromise.mockImplementation(rejected);
    const { container } = mount();
    await flush();
    expect(failHeading()?.textContent).toContain("The card form didn’t load");
    expect(status().textContent).toContain("The card form didn’t load");
    expect(status().textContent).toContain("Nothing is lost — try again in a moment.");
    expect(container.querySelectorAll("[role=status]")).toHaveLength(1);
    expect(container.querySelectorAll("[role=alert]")).toHaveLength(0);
    expect(screen.getByRole("button", { name: /^Try again/ })).toBeTruthy();
    expect(pay().getAttribute("aria-disabled")).toBe("true");
    expect(h.diagnose).toHaveBeenCalled();
  });

  it("Try again survives its own tap and remounts Elements", async () => {
    // MUTATION: no key bump — red. MUTATION: unmount the card while retrying — focus leaves, red.
    // MUTATION: skip the reset — red.
    h.getStripePromise.mockImplementationOnce(rejected);
    h.getStripePromise.mockImplementation(() => new Promise(() => {})); // the retry is in flight
    mount();
    await flush();
    expect(h.mounts).toHaveLength(1);
    const btn = screen.getByRole("button", { name: /^Try again/ });
    btn.focus();
    await act(async () => {
      fireEvent.click(btn);
    });
    const after = screen.getByRole("button", { name: /^Trying…/ });
    expect(after).toBe(btn); // the SAME node — focus survives its own tap
    expect(after.getAttribute("aria-busy")).toBe("true");
    expect(document.activeElement).toBe(btn);
    expect(h.reset).toHaveBeenCalledTimes(1);
    expect(h.mounts).toHaveLength(2);
    expect(h.mounts[1]!.options.clientSecret).toBe(h.mounts[0]!.options.clientSecret);
    // The status region was cleared for the retry, so an identical failure re-announces.
    expect(status().textContent).toBe("");
  });

  it("network escalates to Back to review after two failed retries", async () => {
    h.getStripePromise.mockImplementation(rejected);
    mount();
    await flush();
    for (let i = 0; i < 2; i++) {
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /^Try again/ }));
      });
      await flush();
    }
    const back = screen.getByRole("button", { name: /^Back to review/ });
    expect(screen.queryByRole("button", { name: /^Try again/ })).toBeNull();
    await act(async () => {
      fireEvent.click(back);
    });
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("an ended intent routes to Back to review", async () => {
    // MUTATION: the classify swap — red.
    mount();
    await flush();
    await cardError("invalid_request_error");
    expect(failHeading()?.textContent).toContain("This payment can’t continue");
    expect(document.body.textContent).toContain(
      "Go back to review to see where your order stands.",
    );
    expect(screen.getByRole("button", { name: /^Back to review/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Try again/ })).toBeNull();
  });

  it("config: authentication_error or a missing key offers no retry", async () => {
    // MUTATION: the old role=alert branch — red.
    h.getStripePromise.mockImplementation(() => null);
    const { container } = mount({ counterDoor: true });
    await flush();
    expect(failHeading()?.textContent).toContain("Card payment isn’t available right now");
    expect(screen.getByRole("button", { name: /^Back to review/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Edit order/ })).toBeTruthy();
    expect(container.textContent).toContain("pay at the counter");
    expect(container.querySelectorAll("[role=alert]")).toHaveLength(0);
    expect(h.mounts).toHaveLength(0); // no loader, nothing to mount
    cleanup();

    h.getStripePromise.mockImplementation(() => Promise.resolve(h.stripe));
    mount({ counterDoor: false });
    await flush();
    await cardError("authentication_error");
    expect(failHeading()?.textContent).toContain("Card payment isn’t available right now");
    expect(document.body.textContent).not.toContain("pay at the counter");
    expect(screen.queryByRole("button", { name: /^Try again/ })).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Back to review/ }));
    });
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("slow note at slowMs, timeout card at stallMs, NO remount, late ready recovers, announces and moves focus", async () => {
    // MUTATION: the stall timer is wired to slowMs — the card appears at slowMs, red.
    // MUTATION: the timeout remounts — count 2, red.
    mount();
    await flush();
    await advance(PAY_ELEMENT_TIMING.slowMs - 1);
    expect(document.body.textContent).toContain("Loading the secure card form…");
    await advance(1);
    expect(document.body.textContent).toContain("Still loading — this can take a moment.");
    expect(failHeading()).toBeNull();
    await advance(PAY_ELEMENT_TIMING.stallMs - PAY_ELEMENT_TIMING.slowMs - 1);
    expect(failHeading()).toBeNull();
    await advance(1);
    expect(failHeading()?.textContent).toContain("The card form is taking too long");
    expect(h.mounts).toHaveLength(1);
    const back = screen.getByRole("button", { name: /^Back to review/ });
    back.focus();
    expect(document.activeElement).toBe(back);

    await cardReady();
    await walletReady(false);
    expect(failHeading()).toBeNull();
    expect(document.activeElement).toBe(document.querySelector(".pay-stage"));
    expect(status().textContent).toContain("Card form ready.");
    expect(h.mounts).toHaveLength(1);
  });

  it("offline at mount shows the offline note, and the online event auto-retries", async () => {
    // MUTATION: no auto-retry — red.
    // An OWN property shadows jsdom's prototype getter; deleting it restores the real one.
    Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => false });
    try {
      mount();
      await flush();
      expect(document.body.textContent).toContain(
        "You look offline — we’ll try again when you reconnect.",
      );
      expect(h.mounts).toHaveLength(1);
      Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => true });
      await act(async () => {
        window.dispatchEvent(new Event("online"));
      });
      expect(h.mounts).toHaveLength(2);
      expect(document.body.textContent).toContain("Loading the secure card form…");
    } finally {
      delete (window.navigator as unknown as Record<string, unknown>).onLine;
    }
  });

  it("a new clientSecret remounts the step", async () => {
    // MUTATION: drop the PayStep key — red.
    const view = mount();
    await flush();
    await cardReady();
    await walletReady(false);
    expect(document.querySelector(".pay-skel")).toBeNull();
    view.rerender(
      <PaymentSection
        cartId="cart-1"
        clientSecret="pi_2_secret_y"
        totals={TOTALS}
        onEdit={onEdit}
        onPayingChange={onPayingChange}
      />,
    );
    await flush();
    expect(h.mounts.at(-1)!.options.clientSecret).toBe("pi_2_secret_y");
    expect(document.querySelector(".pay-skel")).not.toBeNull();
    expect(pay().getAttribute("aria-disabled")).toBe("true");
  });

  it("the SAQ-A tripwire: no onChange on either element; our loader off; our font in", async () => {
    // MUTATION: add onChange — red. MUTATION: drop fonts — red.
    expect(window.matchMedia).toBeUndefined(); // …so the real appearance ran through its guard
    mount();
    await flush();
    expect(h.card).not.toBeNull();
    expect("onChange" in h.card!).toBe(false);
    expect("onChange" in h.express!).toBe(false);
    const options = h.mounts[0]!.options as {
      loader?: string;
      fonts?: { family: string; src: string }[];
      appearance?: { disableAnimations?: boolean };
    };
    expect(options.loader).toBe("never");
    expect(options.fonts?.[0]?.family).toBe("Hanken Grotesk");
    expect(options.fonts?.[0]?.src).toContain("/fonts/hanken-grotesk-latin-wght-v1.woff2");
    expect(options.appearance?.disableAnimations).toBe(false);
  });
});
