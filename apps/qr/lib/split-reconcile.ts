/**
 * Does the split share ledger still add up to what the cart says the table owes? (W10d, M1 + M25.)
 *
 * `mms_fulfill_split_order` has always raised when the captured sum disagreed with the total it was
 * told to expect — but its caller produced that expected value by summing the very rows the function
 * then re-sums, so the check compared a number to itself and could never fire. This is the arithmetic
 * that gives it a real second opinion: the cart's own authoritative total (the same `getCartTotals`
 * that mints every Stripe amount) plus the per-payer tips, which live only on the share rows.
 *
 * It is pure so it can be mutation-tested. The decision about WHAT to do with a mismatch is the
 * caller's, and it is load-bearing: this must be consulted BEFORE the first capture. A ledger check
 * that can only run at fulfillment time is one that can only fire once every card has already been
 * charged, which turns a discrepancy into money-taken-with-no-order — the exact state the split path
 * has spent several slices eliminating. Refusing to capture leaves every authorization untouched.
 */
export type LedgerCheck = {
  ok: boolean;
  /** Σ of what the payers' PaymentIntents are actually for (base + their own tip). */
  ledgerCents: number;
  /** What the cart says is owed right now, plus those same tips. */
  expectedCents: number;
};

export function checkShareLedger(
  shares: readonly { amountCents: number; tipCents: number }[],
  cartTotalCents: number,
): LedgerCheck {
  // Tips are NOT part of the cart total — each payer chooses their own when they mint their intent —
  // so they have to be added back before the two sides are comparable. Getting this backwards would
  // make every tipped table look like a mismatch.
  const tipsCents = shares.reduce((a, s) => a + s.tipCents, 0);
  const ledgerCents = shares.reduce((a, s) => a + s.amountCents, 0);
  const expectedCents = cartTotalCents + tipsCents;
  return { ok: ledgerCents === expectedCents, ledgerCents, expectedCents };
}
