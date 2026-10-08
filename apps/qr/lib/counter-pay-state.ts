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
  | "empty"
  /** Phase 2c · gate — dishes the table can send have not gone to the kitchen. The register would
   *  refuse the settle anyway (the staff gate), and a family walking up to pay for dishes nobody is
   *  cooking is the Bill's own Pay rule (`payBlockedByUnsent`) broken at its other door. */
  | "unsent";

export type CounterPayInput = {
  /** The session mode as `assertCartMember` reports it (a `text` column, so `string`). */
  mode: string;
  locked: boolean;
  settling: boolean;
  itemCount: number;
  /** Phase 2c · gate — `payBlockedByUnsent(mode, kitchenDraftUnits, hostPresent)`: the SAME binding
   *  the Bill's Pay button and create-intent read, computed by the caller (which owns the reads). */
  unsentBlocks: boolean;
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
  if (input.unsentBlocks) return "unsent";
  return null;
}

/** The sentence each refusal shows on the Bill. Diner-facing, never a code. */
export const COUNTER_PAY_REFUSAL_COPY: Record<CounterPayRefusal, string> = {
  not_dinein: "Paying at the counter is for tables — this order pays here.",
  settling: "The table’s splitting the bill right now — finish or cancel that first.",
  paying: "Someone’s paying on their phone — wait for that to finish.",
  empty: "Nothing to pay yet — add something first.",
  // Phase 2c · gate — the server returns this to WHOEVER asked, host or guest, so it orders nobody
  // to send (only the host can); the Bill's own tap names who does (`counterUnsentTapCopy`).
  unsent: "Everything has to go to the kitchen first — then pay at the counter.",
};

/**
 * PD2 (m2 decision 15) — the sentence a `settling` refusal shows depends on WHO holds the freeze.
 * While the self-serve split is parked (`SURFACES.selfServeSplit`, A1) nothing but the REGISTER
 * takes the settlement freeze (`settleCash` / the reader / the secure-tab close acquire it for the
 * length of their write), so "The table's splitting the bill" was a sentence about a door that no
 * phone can open. The flag is an input, never read here, so the test flips it; the register
 * sentence is the Bill's own held reason (`registerSettling`, lib/i18n/cart) and the ask's refusal
 * says the same thing, once.
 */
export const REGISTER_SETTLING_COPY =
  "The counter is taking your table’s payment right now — this screen updates when it’s done.";

export function counterPayRefusalCopy(
  refusal: CounterPayRefusal,
  selfServeSplitOpen: boolean,
): string {
  if (refusal === "settling" && !selfServeSplitOpen) return REGISTER_SETTLING_COPY;
  return COUNTER_PAY_REFUSAL_COPY[refusal];
}

/**
 * PD2 (m2 decision 7, the "tender truth") — does the register take a CARD today? Derived, never a
 * literal in copy: the Bill's one sentence says "The counter takes cash." only while this is false,
 * and the pass says the shipped "cash or card, either works" only while it is true. `COUNTER_TENDERS`
 * cannot drive it — it lists `terminal` whether or not a reader exists. Two sources: the Stripe
 * Terminal reader env the staff page already reads (`STRIPE_TERMINAL_READER_ID`, passed in by the
 * server page — a client component cannot read it), OR a card taken outside the app, which the
 * owner has NOT named (ruling #11, 2026-10-07: the counter is cash only by default; #26: no reader
 * within a month) — so that half is a parked constant beside the rule it belongs to, flipped by a
 * one-line commit when the owner says otherwise.
 */
export const COUNTER_CARD_OUTSIDE_APP = false;

export function counterTakesCard(readerConfigured: boolean): boolean {
  return readerConfigured || COUNTER_CARD_OUTSIDE_APP;
}

/**
 * Phase 2c · gate — what a tap on the Bill's dimmed "Pay at the counter" says: the host is told the
 * fix (they can send), a guest is told WHO sends (they cannot) — the unsent note's own split above
 * the button. `sender` is null for the person who can send, else the name the note uses.
 */
export function counterUnsentTapCopy(sender: string | null): string {
  return sender === null
    ? "Send everything to the kitchen first — then pay at the counter."
    : `${sender} sends everything to the kitchen first — then pay at the counter.`;
}

/**
 * Whether a `counter_requested_at` stamp counts as a live ask. There is no TTL by design: a family
 * that asked for the counter and lingered over tea has not changed its mind, and an ask that
 * expired by arithmetic would vanish from the floor with no one having acted on it. The ask ends
 * only when the diner withdraws it or the register settles the cart.
 */
export function counterAskLive(counterRequestedAt: string | null | undefined): boolean {
  return typeof counterRequestedAt === "string" && counterRequestedAt.length > 0;
}
