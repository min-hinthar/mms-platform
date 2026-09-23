import { describe, expect, it } from "vitest";
import { hashFor, normalizeHash, onHistoryPop } from "./checkout-history";

const at = (o: Partial<Parameters<typeof onHistoryPop>[0]>) =>
  onHistoryPop({ hash: "", stage: "order", step: "review", busy: false, canBill: true, ...o });

describe("checkout history — Back walks the checkout's own steps", () => {
  it("each step has its own entry", () => {
    expect(hashFor("order", "review")).toBe("");
    expect(hashFor("bill", "review")).toBe("#bill");
    expect(hashFor("bill", "pay")).toBe("#pay");
    expect(hashFor("order", "pay")).toBe("#pay");
  });

  it("Back from Pay LEAVES through editOrder — the lock is released, never stranded", () => {
    // MUTATION: answer "none" for a pop that leaves the pay step — the screen stays on Pay while
    // the URL says Bill, and the NEXT Back leaves /cart holding the table's lock; red.
    expect(at({ step: "pay", stage: "bill", hash: "#bill" })).toBe("leavePay");
    expect(at({ step: "pay", stage: "order", hash: "" })).toBe("leavePay");
  });

  it("refuses to leave Pay while a charge is in flight", () => {
    // MUTATION: drop the `busy` arm — Back mid-confirm releases the lock under a live
    // PaymentIntent; red.
    expect(at({ step: "pay", hash: "#bill", busy: true })).toBe("restore");
  });

  it("Back from Bill returns to the Order stage", () => {
    expect(at({ stage: "bill", hash: "" })).toBe("toOrder");
  });

  it("Forward into Bill honours the Bill door; Forward into Pay cannot be replayed", () => {
    // MUTATION: ignore `canBill` — Forward walks past the undo window the View-bill button refuses; red.
    expect(at({ hash: "#bill", canBill: false })).toBe("restore");
    expect(at({ hash: "#bill" })).toBe("toBill");
    expect(at({ hash: "#pay" })).toBe("restore");
  });

  it("an entry that matches the screen is a no-op", () => {
    expect(at({})).toBe("none");
    expect(at({ stage: "bill", hash: "#bill" })).toBe("none");
    expect(at({ step: "pay", hash: "#pay" })).toBe("none");
  });

  it("only its own hashes count", () => {
    expect(normalizeHash("#bill")).toBe("#bill");
    expect(normalizeHash("#top")).toBe("");
    expect(normalizeHash("")).toBe("");
  });
});
