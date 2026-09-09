/**
 * A1 — "Pay at the counter": the decision rules, pure.
 *
 * The ask is a dine-in table saying "we'll settle at the register". It moves no money and freezes
 * nothing, so most of what the action must decide is WHEN the ask makes sense — and those rules are
 * values, which is why they live here rather than inside the Server Action: `verify:slice` can
 * falsify a value with one input where a component needs a render and five mocks (CLAUDE.md,
 * "Decision logic belongs in `lib/`").
 */

export type CounterPayRefusal =
  /** Only a dine-in table has a counter to walk to — pickup and scan-and-go pay before the kitchen
   *  ever sees the order, so an unpaid ask there would be an order nobody makes. */
  | "not_dinein"
  /** A card payment holds the cart (single pay in flight): the register settling underneath it is
   *  the double-collect the pay-lock exists to stop. The same axis `applyPromo` refuses on. */
  | "paying"
  /** A split-tender freeze is open — every payer's hold rides it; a cash settle would strand them. */
  | "settling"
  /** Nothing to settle: the ask on an empty table would light the floor for no reason. */
  | "empty";

export type CounterPayInput = {
  /** The session mode as `assertCartMember` reports it (a `text` column, so `string`). */
  mode: string;
  locked: boolean;
  settling: boolean;
  itemCount: number;
};

/**
 * Why the ask is refused, or `null` when it may proceed. Ordered from the widest condition to the
 * narrowest: a settle freeze is the state with the most at stake, so it is named before the lock
 * (the same rank `inertReason` documents for the diner's own controls).
 */
export function counterPayRefusal(input: CounterPayInput): CounterPayRefusal | null {
  if (input.mode !== "dinein") return "not_dinein";
  if (input.settling) return "settling";
  if (input.locked) return "paying";
  if (input.itemCount <= 0) return "empty";
  return null;
}

/** The sentence each refusal shows on the Bill. Diner-facing, never a code. */
export const COUNTER_PAY_REFUSAL_COPY: Record<CounterPayRefusal, string> = {
  not_dinein: "Paying at the counter is for tables — this order pays here.",
  settling: "The table’s splitting the bill right now — finish or cancel that first.",
  paying: "Someone’s paying on their phone — wait for that to finish.",
  empty: "Nothing to settle yet — add something first.",
};

/**
 * Whether a `counter_requested_at` stamp counts as a live ask. There is no TTL by design: a family
 * that asked for the counter and lingered over tea has not changed its mind, and an ask that
 * expired by arithmetic would vanish from the floor with no one having acted on it. The ask ends
 * only when the diner withdraws it or the register settles the cart.
 */
export function counterAskLive(counterRequestedAt: string | null | undefined): boolean {
  return typeof counterRequestedAt === "string" && counterRequestedAt.length > 0;
}
