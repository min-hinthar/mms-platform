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

/**
 * Blind pass on #300 — the count the header may CLAIM. A dine-in cart is SHARED: every seat edits it,
 * and this device's last-seen count goes stale the moment a tablemate adds a dish while this phone is
 * on /account. So for dine-in the count is unknown (no number, and never hidden as "empty"); only a
 * single-device cart (pickup, scan-and-go) can state one.
 */
export function slotCount(mode: string | null | undefined, count: number | null): number | null {
  return mode === "dinein" ? null : count;
}

/** The stored `<cartId>:<count>` pair. A count belongs to ONE cart id; anything malformed, negative,
 *  fractional or for another cart is unknown (null), never zero. */
export function decodeCartCount(raw: string | null, cartId: string | null): number | null {
  if (!raw || !cartId) return null;
  const at = raw.lastIndexOf(":");
  if (at <= 0 || raw.slice(0, at) !== cartId) return null;
  const tail = raw.slice(at + 1);
  if (!/^\d+$/.test(tail)) return null;
  return Number(tail);
}

export function encodeCartCount(cartId: string, count: number): string {
  return `${cartId}:${count}`;
}
