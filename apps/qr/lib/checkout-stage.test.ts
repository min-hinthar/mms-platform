import { describe, expect, it } from "vitest";
import { initialStage, kitchenDraftQty, unsentFoodQty } from "./checkout-stage";

/**
 * W12 — the two-moment landing rule, pinned:
 *   drafts → Order (still building a round); fired-only → Bill (came back to pay);
 *   empty → Order (the empty state renders first anyway — never a $0 bill).
 */
const line = (lineState: "draft" | "fired" | "in_progress" | "served" | "voided") => ({
  lineState,
});

describe("initialStage — where the dine-in cart lands", () => {
  it("any draft line lands on the Order moment (a round is still being built)", () => {
    expect(initialStage([line("fired"), line("served"), line("draft")])).toBe("order");
  });
  it("everything with the kitchen lands on the Bill moment (the settle-nudge journey)", () => {
    expect(initialStage([line("fired"), line("in_progress"), line("served")])).toBe("bill");
  });
  it("an empty cart answers Order — the bill of nothing is never the landing", () => {
    expect(initialStage([])).toBe("order");
  });
  it("voided-only still answers Bill — the record of the table, not a fresh round", () => {
    expect(initialStage([line("voided")])).toBe("bill");
  });
});

describe("kitchenDraftQty — the Send CTA counts only what mms_fire_cart fires", () => {
  const l = (
    lineState: "draft" | "fired",
    fulfillment: "dinein" | "togo" | "grocery",
    qty: number,
  ) => ({ lineState, fulfillment, qty });
  it("counts dine-in draft UNITS only — to-go waits for checkout, grocery never fires", () => {
    // 2× curry (dinein draft) + 1 dessert (togo draft) + 1 jar (grocery draft) + a fired line
    expect(
      kitchenDraftQty([
        l("draft", "dinein", 2),
        l("draft", "togo", 1),
        l("draft", "grocery", 1),
        l("fired", "dinein", 3),
      ]),
    ).toBe(2);
  });
  it("a lone to-go/grocery draft is ZERO — the kitchen verb is spent, the bill door promotes", () => {
    expect(kitchenDraftQty([l("draft", "togo", 1), l("fired", "dinein", 2)])).toBe(0);
  });
});

describe("unsentFoodQty — what the Bill moment warns about (W19)", () => {
  const l = (
    lineState: "draft" | "fired" | "served",
    fulfillment: "dinein" | "togo" | "grocery",
    qty: number,
  ) => ({ lineState, fulfillment, qty });

  it("counts EVERY draft food unit — dinein AND togo — matching mms_fire_pending_food", () => {
    // 2× curry (dinein draft) + 1 dessert (togo draft) → both are charged-then-fired at pay.
    // This is deliberately BROADER than kitchenDraftQty: the same fixture answers 2 there
    // (see above) and 3 here — the two predicates must be separable or one mutant survives.
    expect(
      unsentFoodQty([l("draft", "dinein", 2), l("draft", "togo", 1), l("fired", "dinein", 3)]),
    ).toBe(3);
  });

  it("grocery never fires — a self-scanned jar is not an unsent dish", () => {
    expect(unsentFoodQty([l("draft", "grocery", 4)])).toBe(0);
  });

  it("nothing unsent → zero (no notice, no confirm line)", () => {
    expect(unsentFoodQty([l("fired", "dinein", 2), l("served", "togo", 1)])).toBe(0);
  });
});
