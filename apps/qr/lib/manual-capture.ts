/**
 * W23c — the authorization window, and what to do with it (registry M69).
 *
 * W23a put an availability gate immediately before `paymentIntents.create`, which bounded the
 * exposure to the seconds between the mint and the charge but could not remove it: the diner still
 * spends a minute entering card details, and an 86 landing in THAT window produced a real charge
 * for a dish the kitchen could not make. A gate cannot close it — by the time anyone knows, the
 * money has moved, and the only remedy left is the refund this whole track exists to avoid.
 *
 * Manual capture removes the window instead of narrowing it. A pickup order is AUTHORIZED at the
 * tap and captured a beat later, and in between the app gets one more look at the live catalog:
 *
 *   • everything still available → capture the full authorization; identical to today.
 *   • something ran out        → void those lines, capture the REDUCED total. The guest is charged
 *                                for what they are actually getting, and no refund ever exists.
 *   • nothing survives         → cancel the authorization. Not a refund — a hold that quietly
 *                                disappears, which on a bank statement is the difference between
 *                                "we took your money and gave it back" and nothing at all.
 *
 * PURE MODULE — no imports, no I/O. The decision lives here so it can carry `verify:slice` mutants;
 * the Stripe calls and the reads live in `manual-capture-run.ts`. Same split as `availability.ts`.
 *
 * ⚠️ You can capture LESS than you authorized, never more. Every rule below is downstream of that
 * one asymmetry — it is why a live total above the authorization is a refusal rather than a
 * top-up, and why the tip is recomputed at the chosen RATE rather than carried as a fixed amount
 * (a frozen tip on a shrunken basket is the W17 round-up defect, and it would also breach the
 * ceiling on the way up).
 */

/**
 * Which orders take the manual-capture path.
 *
 * PICKUP only, deliberately. Dine-in already settles after the meal, so it has no window to close.
 * Scan-and-go is goods in the shopper's hands — there is nothing for the kitchen to run out of, and
 * a hold on a basket someone is standing there holding is worse service, not better. That leaves
 * pickup, which is the one mode where the guest pays before the food exists.
 *
 * The 2-day scheduling horizon (`pickup_config.horizon_days`) sits comfortably inside a card
 * authorization's ~7-day life, so no pickup slot this app offers can outlive its own hold. If that
 * horizon is ever widened past a week, THIS is the assumption that breaks first.
 */
export function manualCaptureMode(mode: string): boolean {
  return mode === "pickup";
}

export type CapturePlan =
  | { action: "capture"; amountCents: number; partial: boolean }
  | { action: "cancel"; reason: "nothing_left" | "over_authorized" };

/**
 * What to do with a held authorization, given what the basket is now worth.
 *
 * `liveTotalCents` is re-derived by `getCartTotals` AFTER the unavailable lines are voided, so the
 * tip has already been recomputed at the diner's chosen rate against the reduced base — this
 * function never does money arithmetic of its own, it only decides.
 *
 * The `over_authorized` arm should be unreachable: voiding lines can only shrink a basket. It
 * refuses anyway rather than clamping to the authorization, because a live total ABOVE the hold
 * means the basket changed in some way this path does not model, and capturing "as much as we're
 * allowed" would charge a number nobody derived. Stripe would reject an over-capture regardless;
 * the point of naming it here is that the failure becomes a decision with a reason rather than an
 * API error with a stack trace.
 */
export function planCapture(authorizedCents: number, liveTotalCents: number): CapturePlan {
  if (liveTotalCents <= 0) return { action: "cancel", reason: "nothing_left" };
  if (liveTotalCents > authorizedCents) return { action: "cancel", reason: "over_authorized" };
  return {
    action: "capture",
    amountCents: liveTotalCents,
    partial: liveTotalCents < authorizedCents,
  };
}

/**
 * What the diner is told when the kitchen ran out between their tap and the charge.
 *
 * Names the dish, states that they were not charged for it, and promises nothing about timing —
 * there is no refund to wait for, which is the whole point and the one thing worth saying plainly.
 * A guest who reads "refunded" starts watching their statement for money that was never taken.
 */
export function droppedLineNotice(names: readonly string[]): string | null {
  if (names.length === 0) return null;
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return names.length === 1
    ? `${list} ran out just as you ordered — it’s off your order and you weren’t charged for it.`
    : `${list} ran out just as you ordered — they’re off your order and you weren’t charged for them.`;
}
