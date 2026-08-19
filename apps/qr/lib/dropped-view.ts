/**
 * W23d — what the diner is TOLD when the settlement dropped a line (registry M71).
 *
 * W23c's `manual-capture.ts` ends with a note explaining why a `droppedLineNotice` builder was
 * DELETED from it rather than left as implied coverage: an exported string builder that nothing
 * calls is a shipped behaviour that isn't. This is that function, arriving with its callers —
 * every diner surface, in the same commit.
 *
 * PURE MODULE, mirroring `refund-view.ts`. The decisions live here so the /track slip, the durable
 * `?r=` receipt, the emailed receipt and the /account history answer identically, and so the rules
 * can carry `verify:slice` mutants. The reads are in `track-order.ts` / `receipt-entry.ts` /
 * `rewards.ts` / `dropped-read.ts`.
 *
 * ── The money-copy rule, stated once and enforced below ──────────────────────────────────────────
 * A dropped line is NEVER a `ReceiptRow` and NEVER carries a dollar figure. Two reasons, and both
 * have shipped as bugs elsewhere in this repo's history: a figure printed beside the receipt rows
 * for money that was never charged reads as a refund line (W23b spent a whole slice on the
 * difference), and `buildReceiptRows` is a verbatim fulfillment-time snapshot that nothing is
 * allowed to append to. The amount stays in the staff ledger (`qr_dropped_lines.amount_cents`),
 * which is why `mms_dropped_snapshot` projects name + qty and nothing else.
 */

/** One line the settlement removed. Name + qty only — see the money-copy rule above. */
export type DroppedLine = { name: string; qty: number };

/**
 * What was dropped, and how much of it we can actually name.
 *
 * `count` comes from the RAW array length, not from `lines.length`, and that difference is the
 * whole design of this type. A malformed element must degrade to "2 dishes sold out" rather than to
 * silence: silence on this surface is indistinguishable from "nothing happened", which is the false
 * claim the slice exists to remove. Same rule as `availability-read.ts`'s outcome, one layer in — a
 * failure must never read as empty.
 */
export type DroppedSummary = { count: number; lines: DroppedLine[] };

export const NO_DROPS: DroppedSummary = { count: 0, lines: [] };

/**
 * Read `qr_orders.dropped_lines` (or the same shape from `mms_dropped_snapshot`) into the summary.
 *
 * Anything that is not an array is treated as nothing dropped — a corrupt column must not make the
 * receipt claim a shortage that never happened. Within an array, an element that does not carry a
 * usable name is COUNTED but not named, per the type's contract above.
 */
export function parseDroppedLines(raw: unknown): DroppedSummary {
  if (!Array.isArray(raw)) return NO_DROPS;
  const lines: DroppedLine[] = [];
  for (const el of raw) {
    if (!el || typeof el !== "object") continue;
    const name = (el as { name?: unknown }).name;
    const qty = (el as { qty?: unknown }).qty;
    if (typeof name !== "string" || name.trim() === "") continue;
    lines.push({ name, qty: typeof qty === "number" && qty > 0 ? Math.trunc(qty) : 1 });
  }
  return { count: raw.length, lines };
}

/** `Tea Leaf Salad ×2` — the visible form of one dropped line. Qty is always shown, including ×1: a
 *  guest reconciling a receipt against what they ordered is counting, and an implicit 1 is the one
 *  number they then have to supply themselves. */
export function droppedLineLabel(line: DroppedLine): string {
  return `${line.name} ×${line.qty}`;
}

/**
 * The heading over the notice on an order that WAS charged (the partial case).
 *
 * Plural-aware because the singular case is the common one and "1 dishes" is the kind of detail
 * that makes a guest trust the rest of the receipt less.
 */
export function droppedNoticeHeading(summary: DroppedSummary): string {
  return summary.count === 1 ? "One dish sold out" : `${summary.count} dishes sold out`;
}

/**
 * The body of that notice.
 *
 * Says the two things a guest needs and nothing it cannot keep: the basket changed, and the charge
 * followed the basket rather than the original order. The capture amount really is re-derived from
 * the reduced cart by `getCartTotals` after the void (`manual-capture-run.ts`), so "only charged
 * you for the rest" is a promise the code keeps.
 *
 * No apology-shaped filler and no ETA: nothing here knows when the dish comes back.
 */
export const DROPPED_NOTICE_BODY =
  "We ran out while your payment was going through, so these came off your order and you were only charged for the rest.";

/**
 * The clause spliced into a collapsed row's accessible name, or "" when nothing was dropped.
 *
 * A screen-reader user must not have to expand a card to learn their order changed, so the fact
 * goes in the name even though the visible chip carries only the count.
 */
export function droppedSpokenClause(summary: DroppedSummary): string {
  if (summary.count === 0) return "";
  if (summary.lines.length === 0)
    return `, ${summary.count} ${summary.count === 1 ? "dish" : "dishes"} sold out and came off this order`;
  return `, sold out and removed: ${summary.lines.map(droppedLineLabel).join(", ")}`;
}

/**
 * The whole fact as one SENTENCE, for the tracker's single `role="status"` region — "" when nothing
 * was dropped.
 *
 * Distinct from `droppedSpokenClause` above, and the difference is grammatical rather than
 * informational: that one is a leading-comma fragment spliced into a longer composed name (an
 * /account row), this one follows a complete sentence. Both are built from the same heading and the
 * same body constant, so the spoken text can never drift from the visible block.
 */
export function droppedSpokenNotice(summary: DroppedSummary): string {
  if (summary.count === 0) return "";
  return ` ${droppedNoticeHeading(summary)}. ${DROPPED_NOTICE_BODY}`;
}

/** The chip on a COLLAPSED /account row, or null when nothing was dropped. Derived from the state
 *  rather than tested at the call site — the W23b `refundChipLabel` lesson, where a call site's own
 *  `state === "partial"` check suppressed the chip for a whole class of order. */
export function droppedChipLabel(summary: DroppedSummary): string | null {
  if (summary.count === 0) return null;
  return summary.count === 1 ? "1 sold out" : `${summary.count} sold out`;
}

// ── The cancelled hold: no order exists, and none ever will ──────────────────────────────────────

/**
 * Why a pickup authorization was cancelled instead of captured.
 *
 * `unknown` is not a stored value — the column's CHECK refuses it. It is what an unrecognised code
 * degrades to, so the first reason someone adds to the SQL side cannot reach a guest as raw
 * database text. A recorded cancellation with an unreadable reason is still a cancellation, so the
 * fallback is neutral copy, never silence.
 */
export type SettleCancelReason =
  | "nothing_left"
  | "over_authorized"
  | "cart_not_open"
  | "superseded"
  | "unknown";

const KNOWN_REASONS = new Set<SettleCancelReason>([
  "nothing_left",
  "over_authorized",
  "cart_not_open",
  "superseded",
]);

export function settleCancelReason(raw: string): SettleCancelReason {
  return KNOWN_REASONS.has(raw as SettleCancelReason) ? (raw as SettleCancelReason) : "unknown";
}

/** A recorded cancellation, as the diner surfaces receive it. */
export type SettleCanceled = { reason: SettleCancelReason; dropped: DroppedSummary };

/**
 * The one sentence every cancelled arm ends on, and the most load-bearing string in this file.
 *
 * It has to be true in BOTH intermediate states, because the verdict is recorded BEFORE
 * `paymentIntents.cancel` is called (a failed cancel is retryable; a lost verdict is not — see the
 * migration's §5). So it claims the thing that is already certain — no capture ever happened — and
 * describes the hold as being released rather than gone. Promising a timing the bank owns is the
 * `PARTIAL_REFUND_NOTE` rule: "your bank decides when it lands", stated the other way round.
 */
export const SETTLE_CANCELED_NOTE =
  "No payment was taken. If your bank is showing a pending hold, it’s being released — your bank decides when it disappears.";

/**
 * Heading + body for a cancelled hold.
 *
 * Each arm names what actually happened, because they are not the same event and one explanation
 * would have to be false for three of them. In particular `over_authorized` must NOT blame a
 * sold-out dish: on that arm the lines usually SURVIVE and the trigger is a lapsed promotion or a
 * price that moved (registry M70), so "everything sold out" would be a fabricated explanation on a
 * screen a guest reads to find out where their money went.
 *
 * Every arm must also read correctly with ZERO dropped lines, which is why no body refers to "these
 * dishes" — the list is rendered separately, and only when there is one.
 */
export function settleCanceledCopy(reason: SettleCancelReason): { heading: string; body: string } {
  switch (reason) {
    case "nothing_left":
      return {
        heading: "Everything on your order sold out",
        body: "The last of it went while your payment was going through, so there was nothing left for us to make — and we didn’t charge you.",
      };
    case "over_authorized":
      return {
        heading: "Your total changed before we could take it",
        body: "The price came out higher than the amount you approved — an offer expiring is the usual reason — so we stopped rather than charge you something you hadn’t agreed to.",
      };
    case "cart_not_open":
      return {
        heading: "This order was already settled",
        body: "It went through another way — at the counter, or on another device — so we didn’t take this payment on top of it.",
      };
    case "superseded":
      // ⚠️ Claim ONLY what the verdict proves (Codex #205 P2). `superseded` means the cart's lock no
      // longer matches this attempt — which covers a later checkout by the same diner, a takeover by
      // another payer, AND a lock that was simply released. None of those is evidence that a
      // successor payment SUCCEEDED, so the first draft's "we kept the newer payment" asserted an
      // order that may never have been placed. Same failure as blaming a shortage on the
      // over_authorized arm, and it is the reason both arms are written separately at all.
      return {
        heading: "This payment was replaced",
        body: "Another checkout took over this order after this attempt started, so we stopped this one. If you finished the newer one, that’s the payment to look for.",
      };
    default:
      return {
        heading: "We couldn’t complete this payment",
        body: "Something went wrong on our side between your tap and the charge, so we stopped rather than take money for an order we couldn’t place.",
      };
  }
}

/**
 * The "what happens next on this screen" line beneath a cancelled hold.
 *
 * It lives HERE rather than inline in the tracker because the tracker's trailing helper paragraph is
 * a five-arm chain whose default is "Status updates here as the kitchen works on it — keep this open"
 * — a promise about an order that will never exist. Its timed-out arm is no better: it points at a
 * "Refresh above" that this state deliberately does not render. Both are the same defect the visible
 * banner and the live region already had, one paragraph lower, and the reason it survived the first
 * two fixes is that the rule sat in a component where no test could reach it.
 *
 * So the STRING is a module constant with a test on it, even though the branch that selects it is
 * still JSX: promise no update, name no control that is not on the screen, and say what the guest
 * can actually do.
 */
export const SETTLE_CANCELED_NEXT =
  "Nothing else will happen on this screen — there’s no order to follow. Start a new one whenever you’re ready.";

/** What the single `role="status"` region announces for a cancelled hold. One string: the region is
 *  the view's only live region (QA-CHECKLIST §A), so it carries the whole verdict, not a fragment. */
export function settleCanceledSpoken(settle: SettleCanceled): string {
  const { heading, body } = settleCanceledCopy(settle.reason);
  return `${heading}. ${body} ${SETTLE_CANCELED_NOTE}`;
}
