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

/** What the campaign row says about itself, reduced to the three states the sheet can speak about. */
export type PromoState = "live" | "off" | "unset";

/**
 * The promo cell's contents: whether tonight's redemption count is PRINTED, and the campaign state
 * printed beside or instead of it.
 */
export type PromoFigure =
  | { show: true; redemptions: number; state: PromoState }
  | { show: false; state: "off" | "unset" };

/**
 * Decide whether tonight's redemption count reaches the paper.
 *
 * ⚠️ THIS LIVES HERE, AND IT USED TO LIVE IN JSX — that is the whole finding. The first cut wrote
 * `night.promo.exists && night.promo.active ? <Figure …/> : <sentence/>` in `PilotNightSheet.tsx`,
 * so a campaign state change DELETED an already-measured number: flip `active = false` at 20:00 on
 * a day that had already taken N redemptions and the manager's 9pm read shows no participation
 * figure at all, replaced by "PILOT15 is switched off". `docs/PILOT_PLAN.md` §3 says the redemption
 * count IS the participation count, and `active = false` is the pilot's documented emergency
 * off-switch — so the one evening someone pulls that lever is exactly the evening the sheet erases
 * the measurement. A rendering decision about a measured number belongs where a VALUE can falsify
 * it, with a mutant on it; in JSX nothing could.
 *
 * THE RULE, and why it is not "show the count whenever we have one":
 *
 *   • A measured NON-ZERO is never erased. Whatever the campaign is doing now, N guests used the
 *     code today and that happened. The state is printed beside it, not instead of it — the screen
 *     has room for both facts and they are different facts.
 *   • A ZERO is printed only when the campaign is LIVE, where it carries its plain meaning: the
 *     offer stood all evening and nobody took it. That is a fact about the guests, and it is the
 *     one the reader will act on.
 *   • A zero under an OFF or ABSENT campaign is suppressed, because there it is true and
 *     misleading at once — it reads as "nobody used it" (about the guests) when the honest sentence
 *     is "it wasn't discounting anything" (about the campaign). Those call for opposite actions at
 *     9pm, which is the original reason this branch exists at all.
 *
 * `state` is a description of the row, never a verdict on whether the code would apply to a basket:
 * `mms_promo_check` is the only authority on that, and a second copy of its rule on a reporting
 * surface is the drift the W17 money rules forbid.
 */
export function promoFigure(
  promo: { exists: false } | { exists: true; active: boolean },
  redemptionsToday: number,
): PromoFigure {
  const state: PromoState = !promo.exists ? "unset" : promo.active ? "live" : "off";
  if (redemptionsToday > 0 || state === "live")
    return { show: true, redemptions: redemptionsToday, state };
  return { show: false, state };
}
