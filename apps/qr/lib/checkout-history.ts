/**
 * Phase 1b — the browser's Back button walks the checkout's own steps: Order → Bill → Pay, and back.
 *
 * Why this exists: the Bill stage and the Pay step are STATE, not routes, so the platform Back
 * button skipped all of them and left /cart outright. From the pay step that was worse than
 * disorienting — it stranded the pay-window lock (taken at create-intent) and froze the whole
 * table's cart until the TTL, the defect the in-page "Back to review" control was built around.
 *
 * Each step gets a HASH history entry (`#bill`, `#pay`). A hash, never a bare same-path push:
 * next-view-transitions resolves a popstate's pending transition in an effect keyed on
 * `[hash, pathname]`, so a same-path, same-hash entry hangs the next Back ~4s (TransitionNav.tsx,
 * track/page.tsx). A hash change re-fires that effect.
 *
 * This module is the DECISION — pure, so every arm can be watched failing without a browser.
 * Checkout wires it to `popstate`.
 */
export type CheckoutHash = "" | "#bill" | "#pay";

export function normalizeHash(raw: string): CheckoutHash {
  return raw === "#bill" || raw === "#pay" ? raw : "";
}

/** The history entry a (stage, step) pair lives at. */
export function hashFor(stage: "order" | "bill", step: "review" | "pay"): CheckoutHash {
  if (step === "pay") return "#pay";
  return stage === "bill" ? "#bill" : "";
}

export type PopAction =
  /** Already where the URL says. */
  | "none"
  /** Bill → Order (Back from the Bill stage). */
  | "toOrder"
  /** Order → Bill (the Forward button), only when the Bill door is open. */
  | "toBill"
  /** Leave the pay step through `editOrder` — the SAME path as the in-page control, so the
   *  pay-window lock is released, never stranded. */
  | "leavePay"
  /** Refuse, and put the URL back where the screen is: a charge is in flight (leaving would release
   *  the lock under a live PaymentIntent), or the target cannot be entered from history (Pay needs
   *  a fresh intent; Bill is shut during the send's undo window). */
  | "restore";

export function onHistoryPop(s: {
  hash: CheckoutHash;
  stage: "order" | "bill";
  step: "review" | "pay";
  /** A PaymentIntent confirm is in flight, or a leave is already running. */
  busy: boolean;
  /** The Bill door is open (the View-bill button's own gate — false during the undo window). */
  canBill: boolean;
}): PopAction {
  if (s.step === "pay") {
    if (s.hash === "#pay") return "none";
    return s.busy ? "restore" : "leavePay";
  }
  if (s.hash === "#pay") return "restore";
  if (s.hash === "#bill") return s.stage === "bill" ? "none" : s.canBill ? "toBill" : "restore";
  return s.stage === "bill" ? "toOrder" : "none";
}
