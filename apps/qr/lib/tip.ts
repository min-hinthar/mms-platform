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

/**
 * The house tip ladder — OWNER-SET (2026-08-16): "tip should be 15%, 20%, 30% options."
 *
 * This replaced W17c-1's basket-size fork (flat dollars under $20, percentages above), which existed
 * because 18% of a $4 tea is a meaningless 72¢. The owner's ladder makes that fork unnecessary
 * rather than merely overruled: 30% of the same $4 tea is $1.20, an amount a counter tipper would
 * actually leave. One ladder on every surface — diner checkout, kiosk, register — because a house
 * that asks differently depending on where you stand is not one house.
 *
 * Every rate here is well inside `TIP_RATE_MAX`, so no basket size can make one un-offerable; the
 * filter below stays as the standing guarantee, not as dead code for these three values.
 */
export const TIP_LADDER = [0.15, 0.2, 0.3] as const;

export type TipPreset = {
  /** What the chip says. Latin digits only — the money-path rule (W16b). */
  label: string;
  /** What is sent. The charge is `round(net × rate)`; the label is a promise about that number. */
  rate: number;
};

/**
 * The preset chips. One ladder, every surface (see TIP_LADDER).
 *
 * Each preset is still checked against the server ceiling before it is offered — a chip the mint
 * would refuse turns a bound into what looks like a broken app at the last tap. Today's ladder tops
 * out at 30%, comfortably under the 50% cap, so nothing is filtered; the check remains because the
 * ladder is a value someone will change.
 *
 * `net` is the tip BASE the server uses: subtotal − discount, before tax. Returns [] for a
 * non-positive base (a rate is undefined against 0, and there is nothing to tip on).
 */
export function tipPresets(netCents: number): TipPreset[] {
  if (!Number.isFinite(netCents) || netCents <= 0) return [];
  return TIP_LADDER.map((rate) => ({ label: `${Math.round(rate * 100)}%`, rate })).filter(
    (p) => p.rate <= TIP_RATE_MAX,
  );
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

/**
 * The ONE decision about what rate is actually in effect, given everything the tip UI can be in the
 * middle of. It lives here, not in the component, for a reason the W17c review found the hard way:
 * the round-up's rate DEPENDS ON THE BASKET, so storing the number the way a percentage preset can
 * be stored desyncs it from the total it names the instant the cart moves — a promo lands, a qty
 * changes, a group peer edits — and the diner is charged a tip that no longer rounds to anything,
 * with no chip lit to show a tip is even active. Percentages had never exposed this because 18% is
 * 18% whatever the basket does.
 *
 * So: the component stores the CHOICE, this derives the rate from the CURRENT numbers, and the same
 * value drives both the pressed state and the charge. They cannot disagree.
 *
 * `roundUp` is the offer for the current cart (null when there is nothing to round) — when the
 * choice is round-up and the offer has since evaporated, the effective rate is 0, which is the
 * truth: there is nothing to round, so nothing is added.
 */
export function effectiveTipRate(s: {
  /** A pure-grocery basket takes no tip at all — the server force-zeros it, and so do we. */
  pureGrocery: boolean;
  /** The custom-dollar field is open; its typed rate wins while it is. */
  customTipOpen: boolean;
  customRate: number;
  /** The diner chose round-up, and the live offer (null = nothing left to round). */
  roundUpOn: boolean;
  roundUp: RoundUp | null;
  /** The last tapped preset (0 = None). */
  presetRate: number;
}): number {
  if (s.pureGrocery) return 0;
  if (s.customTipOpen) return s.customRate;
  if (s.roundUpOn) return s.roundUp?.rate ?? 0;
  return s.presetRate;
}
