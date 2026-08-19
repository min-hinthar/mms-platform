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
 * ⚠️ The `over_authorized` arm is REACHABLE, and not for the reason it looks like (Codex #203 P2).
 * "Voiding can only shrink a basket" is false: `mms_promo_discount` drops a promotion once the
 * subtotal falls under its `min_subtotal_cents`, so removing a line can RAISE the total. Worked
 * example — a $30 basket with a $10-off promo requiring $25 authorizes $20; void a $6 sold-out line
 * and the $24 subtotal no longer clears the threshold, so the promo lapses and the live total is
 * $24 on a hold of $20.
 *
 * Cancelling is what this returns, and it is the SAFE answer rather than the good one. The guest is
 * never charged a number they did not agree to: capturing $24 is impossible, and capturing the $20
 * hold would bill the full agreed price for a smaller order. The service cost is real — one $6
 * shortage cancels the whole order and the guest must re-order — and it is bounded to baskets whose
 * promo sits within the shortage's value of its threshold.
 *
 * The good answer is to HONOUR the already-authorized promotion through settlement, which means
 * teaching the discount authority that a granted promo survives a shortage. That is a change to the
 * one place discounts are derived, on the money path, and it is filed as its own slice rather than
 * improvised here (`docs/OPEN-ITEMS.md` M70). Until then this refuses loudly instead of guessing.
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

/*
 * ⚠️ NOT HERE: what the diner is TOLD when a line was dropped.
 *
 * A first draft of this module exported a `droppedLineNotice` string builder that nothing called.
 * That is the W23a defect exactly — a function whose existence implies a shipped behaviour, sitting
 * next to code that does not ship it — so it is gone rather than dressed up as coverage.
 *
 * The gap it papered over is real and filed as W23d (`docs/OPEN-ITEMS.md` M71). The receipt is not
 * dishonest today: it lists what the guest got and the amount they were actually charged, both
 * correct. It is SILENT about the change, and in the all-dropped case there is no order at all, so
 * the tracker polls to its timeout with no explanation. Closing that needs `qr_dropped_lines` to
 * reach a diner-readable surface — a join by `cart_id` for the receipt, and an RLS decision for the
 * live tracker — which is a slice, not a line.
 */
