/**
 * Phase 0 — what an unreadable /cart SAYS. Three states, and the difference between the last two is
 * the whole point (the blind pass on the Phase 0 PR, CRITICAL):
 *
 *  · `none`   — no cart id in the URL at all: there is genuinely no order here yet.
 *  · `closed` — an id this device cannot open: a tablemate reloading after the HOST paid
 *               (`assertCartMember` throws `cart_closed`, and `didIPayForCart` is `earned_by`-scoped),
 *               a tab settled at the counter, or a failed ownership read. The order EXISTS, so
 *               "no order on this device yet … will show up here" would be a false sentence and a
 *               failed read dressed as empty. Say what is true: it is not open HERE.
 *  · `complete` — the caller paid for it themselves.
 */
export type CartEmptyState = "none" | "closed" | "complete";

export function cartEmptyState(hasCartId: boolean, mine: boolean): CartEmptyState {
  if (!hasCartId) return "none";
  return mine ? "complete" : "closed";
}

export const CART_EMPTY_COPY: Record<CartEmptyState, { title: string; subtitle: string }> = {
  none: {
    title: "No order on this device yet",
    subtitle: "Choose dine-in, to-go or the market, and your order will show up here.",
  },
  closed: {
    title: "This order isn’t open on this device",
    subtitle:
      "It may already be paid or closed at your table. If anything looks wrong, our staff can help.",
  },
  complete: {
    title: "This order is complete",
    subtitle: "It’s already paid for — there’s nothing left to check out here.",
  },
};
