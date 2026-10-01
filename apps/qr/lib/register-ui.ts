/**
 * Phase 2c · register — the settle section's UI decisions, pure and directive-free (it is imported by
 * client components AND by `lib/floor.ts` on the server). In the verify:slice mutate set: nothing here
 * charges anything — what is charged is always the server's — but `handoffStillCurrent` decides which
 * paid card a screen shows (Phase 2d · Codex round 1) and `serverCounterHandoff` decides whether an
 * order row may be shown as "Paid" at all (Phase 2g), and a screen stating the wrong money fact is a
 * product-truth defect the mutants pin. Pinned by `register-ui.test.ts`.
 */
import { summarizeRefund } from "./refund-view";

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
 * table still reads the cart that paid, or reads settled with the card's OWN order as its latest
 * paid one — and stops the moment a DIFFERENT cart opens on the session (K33: a table that settles
 * twice). Otherwise the last round's change would sit under the next round's settle section.
 *
 * Phase 2d · Codex round 1 — "settled" alone is not enough. A round that opens AND pays while this
 * screen looks elsewhere (the pane on another table, a guest paying on their phone) is never seen as
 * a live cart — only as a NEWER paid order — so with no cart open the card is current only while
 * `paidOrderId` (the table's latest paid order) is its own. An unknown latest (null) keeps it: the
 * card was just set from a settle this screen watched land.
 */
export function handoffStillCurrent(
  h: { isCounter: boolean; cartId: string | null; orderId: string },
  liveCartId: string | null,
  paidOrderId: string | null,
): boolean {
  if (h.isCounter) return true;
  if (liveCartId != null) return liveCartId === h.cartId;
  return paidOrderId == null || paidOrderId === h.orderId;
}

/**
 * The paid card's data — the CANONICAL shape (plan: register × tablet-split). Set by
 * `FloorDetailLive` from the cash settle's persisted figures (`CashSettleButton.onSettled`) or a
 * counter reader settle (`landedHandoff`, lib/reader-collect — Phase 2g), and — in 2d — serialized
 * by the pane's sessionStorage stash (whose parser validates every field below). Display-only:
 * nothing here is ever sent back as an amount.
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
  /** Phase 2f · P2v — a counter order whose food went to the kitchen BEFORE it was paid (captured from
   *  `detail.unpaidSent` at the settle tap): the card says so and points at the takeaway lane. Never a
   *  claim that the food is ready. Absent (or false) on every other handoff. */
  sentEarly?: boolean;
};

/** The `qr_orders` columns a server-built paid card reads — the persisted figures, nothing derived. */
export type ServerHandoffRow = {
  id: string;
  total_cents: number;
  tip_cents: number;
  status: string;
  refunded_cents: number | null;
  cart_id: string | null;
};

/**
 * Phase 2g · P2em (decision D2) — a COUNTER order's #CODE card, built from its ORDER ROW, so no
 * mounted panel and no tab's stash is needed to show it: the closed verdict of a counter session (any
 * device, any tab, after a reload) and the settled detail of one the webhook's best-effort close left
 * active both carry it (`getTableDetail`). The caller decides it is a counter order (`isCounterOrder`).
 *
 * Null unless the ONE refund derivation says nothing came back (`summarizeRefund(...).state ===
 * "none"`). Never `status === "paid"` alone: a line-level refund leaves the status at 'paid' (a
 * PARTIAL refund), and the in-app path bumps `refunded_cents` to the whole total a beat before the
 * webhook flips the status (a FULL refund by amount) — either would print "Paid · $X" over money that
 * went back, the defect registry M2 closed on the guest receipt and K33 on the detail.
 *
 * Every figure is the row's, verbatim — `total_cents` (never the PaymentIntent's amount, which equals
 * it only through the webhook's reconcile) and `tip_cents`. `tenderedCents` is null: what the cashier
 * was handed is never persisted, so the card claims no change. `sentEarly` is false: whether the food
 * went to the kitchen before the tap is not persisted either, and the card must never claim the bag is
 * on the lane on a guess (the tab's own card, captured at the tap, carries it and wins where it
 * stands). Display-only, like every `Handoff`.
 */
export function serverCounterHandoff(row: ServerHandoffRow | null): Handoff | null {
  if (row === null) return null;
  const refund = summarizeRefund(row.total_cents, row.refunded_cents ?? 0, row.status);
  if (refund.state !== "none") return null;
  return {
    orderId: row.id,
    totalCents: row.total_cents,
    tipCents: row.tip_cents,
    tenderedCents: null,
    isCounter: true,
    cartId: row.cart_id,
    sentEarly: false,
  };
}
