/**
 * W9b — why an ordering control is inert, in ONE place.
 *
 * The cart can refuse a write for three different reasons, and every one of them used to render the
 * same thing: a greyed control with no explanation. The Add pill, the item sheet's CTA and the
 * checkout's steppers all sit on the same journey, so they must not tell a screen-reader user three
 * different stories about the same frozen cart — which is exactly what happens when each component
 * grows its own ternary. This module is the single source; the components read from it.
 *
 * Pure by design (no `server-only`, no `"use server"`): it is imported by client components, and it
 * is the only part of W9b with an executable guard, so the copy and the precedence are pinned by
 * `inert-reason.test.ts` rather than asserted in a comment.
 */

export type CartInertState = {
  /** The session/cart mint is still in flight — there is no cart id to write to yet. */
  minting: boolean;
  /** A member holds the pay-window lock (M3·P3.2-lock): one diner is checking out. */
  locked: boolean;
  /** Is that member the VIEWER? A diner who tapped "Pay · $X" and walked back to the menu
   *  still holds their own lock — telling them "someone is checking out" contradicts the GuestList
   *  banner two elements away, which correctly reads "You're checking out". */
  lockedByYou?: boolean;
  /** The table is settling its split shares (M3·P3.3b) — the whole cart is frozen table-wide. */
  settling: boolean;
};

/**
 * The reason this control can't act, as a clause that reads after a dish name
 * (`"Tea Leaf Salad — the order's locked while your table pays"`), or `null` when nothing is blocking.
 *
 * **Precedence is settling → locked → minting**, deliberately widest-first. `acquireCartLock` makes the
 * freeze and the lock mutually exclusive server-side, so in practice at most one is set; the order
 * still matters because a stale client view can briefly hold both, and in that window the honest
 * answer is the table-wide one — it's the state that outlives the other and the one with somewhere for
 * the diner to go. `minting` ranks last because it can only be true when there is no cart at all.
 */
export function inertReason(s: CartInertState): string | null {
  if (s.settling) return "the order’s locked while your table pays";
  if (s.locked)
    return s.lockedByYou
      ? "the order’s locked while you check out"
      : "the order’s locked while someone checks out";
  if (s.minting) return "setting up your table…";
  return null;
}
