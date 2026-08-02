import { describe, expect, it } from "vitest";
import { checkShareLedger } from "./split-reconcile";

/**
 * W10d (M1 + M25). Every fixture below is chosen so the two sides of the comparison can DISAGREE —
 * the failure this replaces was a check whose operands were derived from the same rows, so it could
 * only ever be equal. A fixture where tips are 0, or where every share is identical, would reproduce
 * that degeneracy in the test instead of the code.
 */
describe("checkShareLedger — the ledger must be checkable against something other than itself", () => {
  it("reconciles a tipped table (tips are on the shares, not in the cart total)", () => {
    // Three payers, DIFFERENT bases and DIFFERENT tips: if the tip term were dropped or the sides
    // swapped, no arrangement of these numbers still balances.
    const shares = [
      { amountCents: 1200, tipCents: 200 },
      { amountCents: 2500, tipCents: 500 },
      { amountCents: 900, tipCents: 0 },
    ];
    const bases = 1000 + 2000 + 900; // what the cart itself is worth, tips excluded
    const r = checkShareLedger(shares, bases);
    expect(r.ok).toBe(true);
    expect(r.ledgerCents).toBe(4600);
    expect(r.expectedCents).toBe(4600);
  });

  it("catches a cart that shrank under the ledger (the staff-void case)", () => {
    // The reachable drift: a server voids a line mid-settle, so the cart is now worth less than the
    // amounts the payers' PaymentIntents were minted for. Capturing here overcharges the table.
    const shares = [
      { amountCents: 1200, tipCents: 200 },
      { amountCents: 2500, tipCents: 500 },
    ];
    const r = checkShareLedger(shares, 1000 + 2000 - 450); // a 450¢ line voided
    expect(r.ok).toBe(false);
    // Both numbers are reported because the log is the only place a human learns what happened.
    expect(r.ledgerCents - r.expectedCents).toBe(450);
  });

  it("catches a cart that grew under the ledger", () => {
    const shares = [{ amountCents: 1200, tipCents: 200 }];
    const r = checkShareLedger(shares, 1000 + 300);
    expect(r.ok).toBe(false);
    expect(r.expectedCents - r.ledgerCents).toBe(300);
  });

  it("is not fooled by tips that happen to equal the drift", () => {
    // The sharpest degenerate case: if the implementation ADDED tips to the ledger side instead of the
    // cart side, this exact input would balance and the mismatch would go unnoticed.
    const shares = [{ amountCents: 1000, tipCents: 300 }];
    const r = checkShareLedger(shares, 1000);
    expect(r.ok).toBe(false);
    expect(r.ledgerCents).toBe(1000);
    expect(r.expectedCents).toBe(1300);
  });

  it("balances an untipped table", () => {
    const shares = [
      { amountCents: 1500, tipCents: 0 },
      { amountCents: 1500, tipCents: 0 },
    ];
    expect(checkShareLedger(shares, 3000).ok).toBe(true);
  });

  it("treats an empty ledger against a non-empty cart as a mismatch", () => {
    // Never let "no shares" read as "nothing owed" — that is the shape of every W10 bug in this arc.
    expect(checkShareLedger([], 2500).ok).toBe(false);
  });
});
