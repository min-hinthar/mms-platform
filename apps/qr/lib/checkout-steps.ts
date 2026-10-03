/**
 * Phase 3a (D3, `docs/PHASE3_JOURNEYS.md`) — the checkout's visible step rail.
 *
 * Phase 1b made dine-in a three-stage checkout (Order → Bill → Pay) on one URL, with hash history
 * so the browser's Back walks it — but nothing on screen SAID which step the diner was on; the
 * `.checkout-step` wrapper is an animation, not a claim. This is the claim: it reads the state the
 * component already keeps (`stage`, `step`, the split board) and names the steps, exactly one of
 * them current. To-go and the market have no Bill stage — paying IS ordering there — so they walk
 * two steps, the first named by the mode's noun.
 */
export type CheckoutStepState = "done" | "current" | "next";

export type CheckoutStep = {
  key: "order" | "bill" | "pay";
  label: string;
  state: CheckoutStepState;
};

export function checkoutSteps(s: {
  /** Dine-in: the review is staged Order | Bill. */
  staged: boolean;
  stage: "order" | "bill";
  step: "review" | "pay";
  /** The split settlement board is showing — its own surface, no rail. */
  settle: boolean;
  /** The first step's name (`orderNoun`): "Order" at a table or to-go, "Basket" in the market. */
  noun?: "Order" | "Basket";
}): CheckoutStep[] {
  if (s.settle) return [];
  const first = s.noun ?? "Order";
  const keys: CheckoutStep["key"][] = s.staged ? ["order", "bill", "pay"] : ["order", "pay"];
  // The pay step is the deepest: a table reaches it only through the Bill, so Bill is done there
  // whatever `stage` says (the stage is review-only state).
  const currentKey: CheckoutStep["key"] =
    s.step === "pay" ? "pay" : s.staged && s.stage === "bill" ? "bill" : "order";
  const at = keys.indexOf(currentKey);
  return keys.map((key, i) => ({
    key,
    label: key === "order" ? first : key === "bill" ? "Bill" : "Pay",
    state: i < at ? "done" : i === at ? "current" : "next",
  }));
}
