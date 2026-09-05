import type { StaffChannel } from "./i18n/staff";

/**
 * P5 — the nightly sheet's one derivation: the day's paid orders bucketed by the door they came in.
 *
 * PURE, and separate from `pilot.ts` for the reason `register-math.ts` is separate from
 * `register.ts` — a rule falsified by a VALUE, not by a render plus five mocks. The reads live next
 * door; nothing here touches the database or the clock.
 *
 * ⚠️ THE ONE RULE THIS FILE EXISTS FOR: an order whose channel is not recorded is COUNTED APART and
 * never folded into a bucket. Splitting unattributed orders across three channels, or silently
 * dropping them so the buckets no longer sum to the day, are the same defect: a number the app
 * invented, on a screen someone reads as a statement of fact. `counted` is what the buckets add up
 * to, and it is deliberately NOT the day's order count — the sheet prints both so the gap is visible
 * rather than reconciled away.
 *
 * ⚠️ WHICH SHAPES ACTUALLY REACH THAT PATH TODAY, stated precisely because the first draft named the
 * wrong one. It claimed a null `session_id` was "a real state, not a theoretical one" — and against
 * the live schema it is not: `table_sessions.mode` is `not null check (mode in
 * ('dinein','scango','pickup'))`, every fulfilment function sets `session_id` from the cart, and the
 * FK carries no `on delete` action so a session row cannot be deleted out from under an order. What
 * DOES reach it is a mode value this map has not learned — the CHECK is one migration away from
 * gaining a fourth — and that is the shape the mutant and the fixtures are aimed at. The nullable
 * column is handled too, because a defensive branch on a nullable type costs one line and a screen
 * that answers "we don't know" is the fail-safe direction; it is not claimed to be reachable today.
 *
 * ⚠️ MONEY IS NOT DERIVED HERE, ON PURPOSE. The day's takings already have one authority —
 * `summarizeDay` behind `getDayCashSummary`, the register's Z-report — and a second derivation of a
 * money figure is the drift the W17 money rules are written about ("a value computed in one place
 * and quoted in another WILL drift. Name it ONCE."). The sheet quotes that summary; it does not
 * recompute it. What is derived here is a COUNT of orders, which the Z-report does not answer.
 */

/** The three modes a session may carry, plus the honest fourth answer. */
export const PILOT_CHANNELS: readonly StaffChannel[] = ["dinein", "pickup", "scango"] as const;

/** One order, as the nightly read projects it. `mode` is `table_sessions.mode`, or null. */
export type PilotOrderRow = { status: string; mode: string | null };

export type ChannelCount = { mode: StaffChannel; orders: number };

export type ChannelSplit = {
  /** Every channel, in a stable order, INCLUDING the ones with no orders — a channel that vanished
   *  from the list would read as "not measured" rather than as "none tonight". */
  channels: ChannelCount[];
  /** Paid orders whose channel could not be read. Never distributed, never dropped. */
  unattributed: number;
  /** Paid orders the buckets account for. `counted + unattributed` is the day's paid orders. */
  counted: number;
};

function isChannel(value: string | null): value is StaffChannel {
  return value !== null && (PILOT_CHANNELS as readonly string[]).includes(value);
}

/**
 * Bucket the day's orders by channel.
 *
 * Only `status === "paid"` counts. A refunded order's money is not in the drawer and its count is
 * not tonight's participation — `summarizeDay` splits it out for the same reason, and the sheet
 * quotes that split rather than blending it in here.
 */
export function bucketByChannel(rows: readonly PilotOrderRow[]): ChannelSplit {
  const tally = new Map<StaffChannel, number>(PILOT_CHANNELS.map((c) => [c, 0]));
  let unattributed = 0;
  for (const row of rows) {
    if (row.status !== "paid") continue;
    if (isChannel(row.mode)) tally.set(row.mode, (tally.get(row.mode) ?? 0) + 1);
    else unattributed++;
  }
  const channels = PILOT_CHANNELS.map((mode) => ({ mode, orders: tally.get(mode) ?? 0 }));
  return {
    channels,
    unattributed,
    counted: channels.reduce((sum, c) => sum + c.orders, 0),
  };
}
