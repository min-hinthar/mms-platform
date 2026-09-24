/**
 * Phase 1c — what a diner is TOLD when they add a dish, named once.
 *
 * PURE: copy and one decision, no clock, no window, no analytics. The add moment has three layers
 * and this module owns the words of the first and the verdict of the third:
 *
 *   1. INTENT (the tap) — the claim spoken the instant the diner acts. `pillAddClaim` and
 *      `stepClaim` are QUIET (spoken through the view's one live region, never drawn): the change is
 *      already visible where the diner's thumb is — the pill morphs, the digit pops. `sheetAddClaim`
 *      is VISIBLE, because the sheet closes on the tap and takes the place the diner acted with it,
 *      so only words can say WHICH configured dish went in.
 *   2. RECEIPT (the server view returns) — the CartBar's subtotal roll. Nothing here.
 *   3. REVERSAL (the write did not land) — `createRevertCue` decides whether the "+" glyph may play
 *      its "set back down" cue. The named correction itself is `namedRefusedWriteNotice` /
 *      `namedUnconfirmedWriteNotice`, beside the sentences they parallel.
 *
 * ⚠️ A CLAIM IS NOT AN AMOUNT. Nothing here states a price, a total or a basket count — v7.2's
 * quickAdd said "${n} added, ${cartCount()} items", and in dine-in that count is a tablemate's tap
 * away from wrong the moment it is spoken (DESIGN-LANGUAGE §21). The dish name is the one fact the
 * diner supplied themselves.
 *
 * The Burmese half of the add claims is the shipped, K15-trusted "ထည့်ပြီးပါပြီ" — NOT a new string —
 * so no K15 entry is added here. The stepper lines stay English-only, as the "−" has been since R5c;
 * a quantity pattern in Burmese waits for K15.
 */
import { freshnessDurationMs } from "./catalog-freshness";
import type { WriteResult } from "./write-outcome";

/** What the provider's `add` speaks on the diner's behalf — or `null` when the caller already did. */
export type CartClaim = {
  text: string;
  /** The Burmese half, rendered in its own `lang="my"` span. */
  my?: string;
  /** Spoken, not drawn — for a change the diner can already see where they acted. */
  quiet?: boolean;
  /** How long the slot holds it. */
  ms?: number;
};

/** The trusted, shipped Burmese "added" — the MY half every add claim has carried since W13. */
const ADDED_MY = "ထည့်ပြီးပါပြီ";

/** The pill's 0→1 tap: the dish, by name, quietly. */
export function pillAddClaim(name: string): CartClaim {
  return { text: `${name} added`, my: ADDED_MY, quiet: true, ms: 2000 };
}

/**
 * A stepper step, spoken at the TAP. `qty` is the OPTIMISTIC aggregate after the step — the digit the
 * diner is looking at — never the server's, which trails a queued tap by a round trip.
 *
 * Shared by "+" and "−" (the copy the "−" inlined since R5c), so the two directions of one control
 * cannot drift into two vocabularies. "quantity", not v7.2's "qty": some screen readers spell the
 * abbreviation letter by letter.
 */
export function stepClaim(name: string, qty: number): CartClaim {
  return qty <= 0
    ? { text: `Removed ${name}`, quiet: true, ms: 2000 }
    : { text: `${name}, quantity ${qty}`, quiet: true, ms: 2000 };
}

/**
 * The correction for a stepper claim that was spoken at the tap but never sent: by the time the
 * queued step ran, the line it meant had changed underneath it (a host fired or comped it, a
 * tablemate's view moved on). Not "we couldn't reach your order" — the order WAS reached — and no
 * count: the rows below are the truth. English only, like the step claims it retracts (K15).
 */
export function stepOvertakenNotice(name: string): string {
  return `${name} changed before your tap reached it — the order below is up to date.`;
}

/**
 * A configured dish from the item sheet: VISIBLE, because the sheet closed on the tap and the row it
 * opened from may be scrolled away. "2 Mohinga added", never "2 × Mohinga" — VoiceOver reads the
 * sign as "times". Held for as long as the sentence takes to read (`freshnessDurationMs`, the one
 * reading-rate rule), so a long dish name is not gone before it is read.
 */
export function sheetAddClaim(name: string, qty: number): CartClaim {
  const text = qty > 1 ? `${qty} ${name} added` : `${name} added`;
  return { text, my: ADDED_MY, ms: freshnessDurationMs(text) };
}

/**
 * May the "+" glyph play its "set back down" cue after a pill create settled?
 *
 * Only for a DEFINITE non-landing:
 *   • `refused` — the cart was read and this write is not in it;
 *   • `applied` whose CURRENT view shows no own line — a write that committed and moved nothing of
 *     ours (the T25 comped-sibling no-op, where the provider also says "Nothing was added").
 *
 * Never for `unconfirmed` — the write may well be on the bill, and a cue that reads "it didn't land"
 * over a dish that did is the fabricated-diagnosis class. Never for `lineVisible: null` — the seat
 * is unknown (session recovery blanks it) or the view was overtaken, so there is nothing to read the
 * line off, and a success must never be drawn as a failure.
 */
export function createRevertCue(input: {
  state: WriteResult<unknown>["state"];
  lineVisible: boolean | null;
}): boolean {
  return input.state === "refused" || (input.state === "applied" && input.lineVisible === false);
}
