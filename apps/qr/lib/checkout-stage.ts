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

/**
 * W12 review HIGH — what "Send to kitchen" actually SENDS. `mms_fire_cart` fires ONLY
 * fulfillment='dinein' drafts (to-go waits for checkout / make-it-now; grocery never fires), so
 * the CTA count, its render gate, and the View-bill promotion must bind to this predicate — an
 * all-drafts count promises sends the server will not perform, and a lone to-go/grocery draft
 * would pin the promotion forever. Counted in UNITS (qty), matching the header cart badge.
 */
export function kitchenDraftQty(
  items: ReadonlyArray<Pick<CartItem, "lineState" | "fulfillment" | "qty">>,
): number {
  return items
    .filter((i) => i.lineState === "draft" && i.fulfillment === "dinein")
    .reduce((a, i) => a + i.qty, 0);
}

/**
 * W19 — what the Bill moment must WARN about (owner: "What if customers forget to send items to
 * kitchen and move forward to pay?"). Every still-draft FOOD line (dinein + togo, never grocery) is
 * charged at pay and then fired by `mms_fire_pending_food` the moment the payment lands — money is
 * safe, but the kitchen only starts those dishes AFTER payment, so the diner deserves to be told
 * before the charge, not discover it on the tracker.
 *
 * Deliberately a DIFFERENT predicate from `kitchenDraftQty` (dinein-only, bound to what the host's
 * Send button fires): a lone to-go draft is also charged-then-fired and deserves the same notice.
 * Counted in UNITS (qty), matching the badge and the send count.
 */
export function unsentFoodQty(
  items: ReadonlyArray<Pick<CartItem, "lineState" | "fulfillment" | "qty">>,
): number {
  return items
    .filter((i) => i.lineState === "draft" && i.fulfillment !== "grocery")
    .reduce((a, i) => a + i.qty, 0);
}
