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
 * single-pay `createIntentInput` bounds the AMOUNT at $1,000 (TIP_AMOUNT_MAX_CENTS, enforced on the
 * derived cents in create-intent — W19), while split `shareIntentInput` allows a rate of **0.5**
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
export function tipPresets(
  netCents: number,
  // The ladder is a PARAMETER, defaulted, for one reason: the cap filter below is unreachable with
  // today's 15/20/30 and an unreachable guard cannot be watched failing (its mutant survived). A
  // test can pass a ladder that breaches the cap and see it dropped, so the protection is real for
  // whoever raises the ladder next instead of being decorative. Callers pass nothing.
  ladder: readonly number[] = TIP_LADDER,
): TipPreset[] {
  if (!Number.isFinite(netCents) || netCents <= 0) return [];
  return ladder
    .map((rate) => ({ label: `${Math.round(rate * 100)}%`, rate }))
    .filter((p) => p.rate <= TIP_RATE_MAX);
}

/**
 * W19 — the custom tip's ceiling is a DOLLAR amount, not a share of the order (owner: "no limit to
 * custom or capped amount"). The old 100%-of-order clamp silently shrank a generous tip on a small
 * order; the bound that actually matters is absolute. $1,000 is the CASH tip's own ceiling
 * (`settleCashInput.tipCents`, W17c-2) — far above any real tip, low enough that a fat-finger or a
 * hostile client can't mint a five-figure PaymentIntent through the tip field. A rate cannot express
 * a dollar cap (rate = cents/net — $1,000 on a $5 net is rate 200), so create-intent enforces this
 * on the DERIVED amount after getCartTotals, exactly like the cash path.
 */
export const TIP_AMOUNT_MAX_CENTS = 100_000;

/** The create-intent amount gate: true when the derived tip is inside the house ceiling. */
export function tipWithinAmountCap(tipCents: number): boolean {
  return tipCents <= TIP_AMOUNT_MAX_CENTS;
}

/** Latin digits, integer cents — never a locale-formatted numeral on the money path (W16b). */
export const dollars = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

export type TipReaction = { en: string; my: string };

/**
 * W20 (owner: "texts change with % selections") — the ask REACTS to the choice, warmer as the
 * ladder climbs. Pure and pinned so the reaction can never drift from the rung it thanks for.
 * Deliberate absences: rate 0 (None) returns null — declining must never be met with silence that
 * reads as a sulk OR a guilt line, so the UI simply shows nothing; a custom amount gets the warm
 * generic (its rate is arbitrary, so rung-matching would misfire).
 */
export function tipReaction(rate: number, custom = false): TipReaction | null {
  if (!Number.isFinite(rate) || rate <= 0) return null;
  if (custom) return { en: "Thank you so much!", my: "ကျေးဇူး အများကြီးတင်ပါတယ်နော်" };
  if (rate >= 0.3)
    return {
      en: "Wow — the team will be thrilled!",
      my: "ဝိုး — အဖွဲ့သားတွေ အရမ်းဝမ်းသာသွားမှာပါ!",
    };
  if (rate >= 0.2)
    return { en: "That’s generous — thank you!", my: "ရက်ရောလိုက်တာ — ကျေးဇူးအများကြီးတင်ပါတယ်!" };
  return { en: "With thanks from the kitchen", my: "မီးဖိုအဖွဲ့က ကျေးဇူးတင်ပါတယ်နော်" };
}

/**
 * The ONE decision about what rate is actually in effect, given everything the tip UI can be in the
 * middle of. It lives here, not in the component (the W17c review's "name it once" rule): the
 * component stores the CHOICE, this derives the rate from the CURRENT numbers, and the same value
 * drives both the pressed state and the charge — they cannot disagree.
 *
 * (W18 note: the round-up branch is retired WITH its feature — the owner: "never capped or round
 * up". Its lesson stays recorded on this docstring's history and in CLAUDE.md: a basket-dependent
 * rate must be derived at read time, never stored.)
 */
export function effectiveTipRate(s: {
  /** A pure-grocery basket takes no tip at all — the server force-zeros it, and so do we. */
  pureGrocery: boolean;
  /** The custom-dollar field is open; its typed rate wins while it is. */
  customTipOpen: boolean;
  customRate: number;
  /** The last tapped preset (0 = None). */
  presetRate: number;
}): number {
  if (s.pureGrocery) return 0;
  if (s.customTipOpen) return s.customRate;
  return s.presetRate;
}
