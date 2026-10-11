import type { CartItem } from "@mms/db";

/**
 * PD1 (m1 A5 · B12; DESIGN-LANGUAGE §21 "a count is a claim") — the /menu order bar on a SHARED
 * cart, pure. A dine-in table's cart is a tablemate's tap away from a different count, so the bar
 * names the state in the console's own words instead ("Not sent yet · မပို့ရသေး"), and the host
 * reads "Someone's waiting" while a guest's nudge stands on the cart. Pickup and the market keep
 * their count: that cart is one phone's.
 */

/** A shared cart shows no count (§21): only a dine-in table is shared. */
export function cartBarCountShown(mode: string): boolean {
  return mode !== "dinein";
}

export type CartBarLine2 = "unsent" | "waiting" | null;

/**
 * The bar's second line: the HOST's "Someone's waiting" outranks "Not sent yet"; a guest never
 * reads the waiting line (the nudge is theirs to the host, not news to them); nothing off the table.
 *
 * ⚠️ "WAITING" NEEDS A DISH TO SEND (the blind pass on #335). A stamp does not imply a dish the host
 * owes: the only writer that clears it is the fire, so it outlives a dish that was taken off,
 * voided or moved on by the kitchen — and the bar then said "Someone's waiting" with nothing a Send
 * would move. The waiting line shows only while a dine-in draft is on the cart (the same predicate
 * as "Not sent yet", the one `mms_fire_cart` fires); `mms_nudge_host` refuses a stamp without one.
 */
export function cartBarLine2(s: {
  mode: string;
  role: "host" | "guest" | null;
  items: ReadonlyArray<CartItem>;
  /** `qr_carts.send_nudge_at` stands (the cart view's `sendNudge !== null`). */
  nudgeStanding: boolean;
}): CartBarLine2 {
  if (cartBarCountShown(s.mode)) return null;
  // What the Send would move (`mms_fire_cart`: dine-in drafts) — never a to-go draft, which fires
  // at pay, and never a grocery line.
  const sendable = s.items.some((i) => i.lineState === "draft" && i.fulfillment === "dinein");
  if (!sendable) return null;
  if (s.role === "host" && s.nudgeStanding) return "waiting";
  return "unsent";
}

/** The bar's STATIC accessible name (read on focus; never a live region). */
export function cartBarName(s: {
  shared: boolean;
  count: number;
  line2: CartBarLine2;
  /** The confirmed subtotal, or the dash while a write is in flight (R1). */
  dollars: string;
}): string {
  if (!s.shared)
    return `View order — ${s.count} ${s.count === 1 ? "item" : "items"}, subtotal ${s.dollars}`;
  const state =
    s.line2 === "unsent" ? ", not sent yet" : s.line2 === "waiting" ? ", someone’s waiting" : "";
  return `View order${state} — subtotal ${s.dollars}`;
}
