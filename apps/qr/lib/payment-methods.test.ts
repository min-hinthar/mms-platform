import { describe, expect, it } from "vitest";
import { MEAL_PAYMENT_METHOD_TYPES } from "./payment-methods";

/**
 * M155 — the owner's ruling, pinned as a value (OWNER_RULINGS_2026-10-07 #7): "Phone payments for
 * meals take card only (Apple Pay and Google Pay ride the card method). No bank debits."
 *
 * The route suites (create-intent, create-share-intent, setup-intent) assert each create sends THIS
 * constant; this file asserts what the constant IS, so widening it is a decision someone has to make
 * in a test, not a line that slides through with every route still green.
 */
describe("MEAL_PAYMENT_METHOD_TYPES", () => {
  it("is card, and card alone — the wallets ride it, a bank debit never does", () => {
    expect([...MEAL_PAYMENT_METHOD_TYPES]).toEqual(["card"]);
  });
});
