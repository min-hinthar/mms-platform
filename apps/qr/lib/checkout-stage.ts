import type { CartItem } from "@mms/db";

/**
 * W12 — the two-moment checkout's ONE behavioral rule, kept pure so it can be pinned by a unit
 * test (the repo has no .test.tsx runner — decision logic lives in lib/, the W10d M46 rule).
 *
 * The dine-in cart opens on the moment the diner is most likely in:
 *  - anything still DRAFT → the Order moment (they're building a round — steppers, Send);
 *  - everything with the kitchen → the Bill moment (the mid-meal settle-nudge journey lands
 *    ready to pay, not back on a spent ordering screen).
 * An empty cart answers "order" but never renders a stage (the empty state returns first).
 * The diner can flip stages freely afterward — this only picks the landing.
 */
export type CheckoutStage = "order" | "bill";

export function initialStage(items: ReadonlyArray<Pick<CartItem, "lineState">>): CheckoutStage {
  if (items.length === 0) return "order";
  return items.some((i) => i.lineState === "draft") ? "order" : "bill";
}
