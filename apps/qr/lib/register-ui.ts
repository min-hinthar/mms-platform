/**
 * Phase 2c · register — the settle section's UI decisions, pure and directive-free (it is imported by
 * client components). NOT in the verify:slice mutate set on purpose: nothing here names, derives or
 * gates an amount — what is charged is always the server's. Pinned by `register-ui.test.ts`.
 */

/** A table's running-bill kind, as `TableDetail.tab` carries it. */
export type SettleTab = "none" | "trust" | "secure";

/**
 * Which settle control is the section's ONE primary (DESIGN-LANGUAGE §20: one filled action per
 * section). A SECURE running bill closes on the card on file; everything else takes cash first. The
 * reader is never primary (owner decision 8: until DayCash shows reader orders outnumbering cash for
 * a week — then it is this one line).
 */
export function settlePrimary(tab: SettleTab): "secureTab" | "cash" {
  return tab === "secure" ? "secureTab" : "cash";
}

/**
 * Whether the paid card still describes the table in front of the cashier. A counter card always
 * does (a counter session is one order; its detail closes behind it). A table card does while the
 * table reads settled (no open cart) or still reads the cart that paid — and stops the moment a
 * DIFFERENT cart opens on the session (K33: a table that settles twice). Otherwise the last round's
 * change would sit under the next round's settle section.
 */
export function handoffStillCurrent(
  h: { isCounter: boolean; cartId: string | null },
  liveCartId: string | null,
): boolean {
  return h.isCounter || liveCartId == null || liveCartId === h.cartId;
}

/**
 * The paid card's data — the CANONICAL shape (plan: register × tablet-split). Set by
 * `FloorDetailLive` from the cash settle's persisted figures (`CashSettleButton.onSettled`) or a
 * counter reader settle (`TerminalCollectPanel.onDone`), and — in 2d — serialized by the pane's
 * sessionStorage stash (whose parser validates every field below). Display-only: nothing here is
 * ever sent back as an amount.
 */
export type Handoff = {
  orderId: string;
  /** The PERSISTED all-in total (tip included). */
  totalCents: number;
  /** The persisted tip; null when the settle path records none (the reader). */
  tipCents: number | null;
  /** What the cashier said was handed over; null when no tender was entered. */
  tenderedCents: number | null;
  /** A counter order: #CODE, the call-out and "Back to the counter"; it also holds the closed-table
   *  bounce while it stands (a counter session closes behind its settle). */
  isCounter: boolean;
  /** The cart that paid — `handoffStillCurrent` hides a table's card once a different one opens. */
  cartId: string | null;
};
