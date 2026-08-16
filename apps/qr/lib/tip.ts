/**
 * W17c — the tip ask's decision logic, pure (owner: "maybe enhance the tipping features"; the
 * AskUserQuestion answer selected round-up + smarter defaults among the four).
 *
 * Why this is a module and not inline JSX: it is arithmetic with real edge cases (a 50% server cap,
 * a basket small enough that percentages are meaningless, a total that is already whole), and
 * arithmetic that decides a charged amount belongs somewhere it can be tested without a DOM.
 *
 * ⚠️ Everything here produces a **rate**, never an amount. The charge authority is `computeTotals`
 * (`tipCents = round(netCents × tipRate)`), the intent is minted from it, and the webhook recomputes
 * the same breakdown from `metadata.tipRate`. A rate is the only thing the client may assert. The
 * `.toFixed`-style previews the UI shows from these are hints — the server's number is the number.
 */

/**
 * The ceiling a chip must respect. There are TWO caps in the schema, deliberately different:
 * single-pay `createIntentInput` allows up to **1.0**, while split `shareIntentInput` allows **0.5**
 * because that rate is written to `qr_cart_shares.tip_rate`, whose column CHECK is `<= 0.5`.
 *
 * These presets are offered on a cart that the table may settle EITHER way — a diner picks a tip and
 * only then discovers whether the table splits — so the binding constraint is the tighter one. A chip
 * valid single-pay but refused on the split path would 400 the share mint, and a bound surfacing as a
 * failed payment reads as a bug in the app.
 *
 * Pinned against BOTH schemas by test, so neither can drift away from this without reddening.
 */
export const TIP_RATE_MAX = 0.5;

/** Below this basket size, a percentage is the wrong unit. 18% of a $4 tea is 72¢ — a chip nobody
 *  taps, presented in a form that reads as an ask. Flat dollars are what a counter tip actually is. */
export const SMALL_BASKET_CEILING_CENTS = 2000;

export type TipPreset = {
  /** What the chip says. Latin digits only — the money-path rule (W16b). */
  label: string;
  /** What is sent. `round(net × rate)` reproduces the labelled amount exactly for the flat presets. */
  rate: number;
};

/**
 * The preset chips for a basket, sized to it.
 *
 * A percentage ask on a small basket is noise, and a flat-dollar ask on a large one is a rounding
 * error — so the unit changes with the amount. Either way every preset is checked against the server
 * ceiling before it is offered: on a very small net, $3 is more than 50% and is simply not shown,
 * rather than shown and refused.
 *
 * `net` is the tip BASE the server uses: subtotal − discount, before tax. Returns [] for a
 * non-positive base (a rate is undefined against 0, and there is nothing to tip on).
 */
export function tipPresets(netCents: number): TipPreset[] {
  if (!Number.isFinite(netCents) || netCents <= 0) return [];
  const candidates: TipPreset[] =
    netCents < SMALL_BASKET_CEILING_CENTS
      ? [100, 200, 300].map((cents) => ({ label: dollars(cents), rate: cents / netCents }))
      : [0.15, 0.18, 0.2].map((rate) => ({ label: `${Math.round(rate * 100)}%`, rate }));
  return candidates.filter((p) => p.rate <= TIP_RATE_MAX);
}

export type RoundUp = {
  /** The rate that produces exactly `tipCents` against this net. */
  rate: number;
  /** The tip the round-up adds, in cents — shown so nothing about it is implicit. */
  tipCents: number;
  /** The whole-dollar total it lands on. The chip NAMES this, so the diner is told the destination. */
  targetCents: number;
};

/**
 * "Round up to $32.00" — the frictionless small tip.
 *
 * `dueCents` is what the diner owes with NO tip: net + tax, discount already applied. The round-up is
 * whatever brings that to the next whole dollar.
 *
 * Returns null — i.e. no chip — when there is nothing honest to offer:
 *   - a non-positive net or due (no base to express a rate against);
 *   - a total that is ALREADY whole, where "rounding up" would silently mean "add a dollar". That is
 *     a different, larger ask wearing the round-up's clothes, so it is not offered under this label;
 *   - a rate above the server's 50% ceiling, which can happen on a tiny basket (a $1.10 due wants a
 *     90¢ round-up). Offering a chip the mint would refuse turns a bound into what looks like a bug.
 */
export function roundUpTip(netCents: number, dueCents: number): RoundUp | null {
  if (!Number.isFinite(netCents) || !Number.isFinite(dueCents)) return null;
  if (netCents <= 0 || dueCents <= 0) return null;
  const remainder = dueCents % 100;
  if (remainder === 0) return null;
  const tipCents = 100 - remainder;
  const rate = tipCents / netCents;
  if (rate > TIP_RATE_MAX) return null;
  return { rate, tipCents, targetCents: dueCents + tipCents };
}

/** Latin digits, integer cents — never a locale-formatted numeral on the money path (W16b). */
export const dollars = (cents: number): string => `$${(cents / 100).toFixed(2)}`;
