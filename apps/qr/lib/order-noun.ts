/**
 * Phase 1a — ONE word for the thing a diner is building, per door. The menu's bar already said
 * "View order" and the market's said "Review basket"; the header alone said "Cart", and "Pickup",
 * "Your order" and "Cart" all named the same object on one screen. Every surface that names the
 * open cart reads this.
 */
export function orderNoun(mode: string | null | undefined): "Order" | "Basket" {
  return mode === "scango" ? "Basket" : "Order";
}

/** The header slot's visible label and its accessible name. `count` null = not known on this
 *  device (a cart reached by URL), so the slot names the object without claiming a number. */
export function orderSlot(
  mode: string | null | undefined,
  count: number | null,
): { label: string; aria: string } {
  const noun = orderNoun(mode);
  if (count === null)
    return { label: `Your ${noun.toLowerCase()}`, aria: `Your ${noun.toLowerCase()}` };
  const items = `${count} ${count === 1 ? "item" : "items"}`;
  return { label: `Your ${noun.toLowerCase()}`, aria: `Your ${noun.toLowerCase()} — ${items}` };
}

/** Whether the header offers the slot at all: never for a cart KNOWN to be empty (viewing the menu
 *  used to publish an empty cart and light "Cart" on every other page). */
export function showOrderSlot(cartId: string | null, count: number | null): boolean {
  return !!cartId && count !== 0;
}
