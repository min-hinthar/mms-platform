import { describe, expect, it } from "vitest";
import { checkoutSteps } from "./checkout-steps";

/**
 * Phase 3a (D3) — the checkout's visible step rail reads the state Phase 1b keeps (`stage`, `step`)
 * and claims exactly where the diner is. Pure, so each arm is watched failing without a render.
 */
const states = (r: ReturnType<typeof checkoutSteps>) => r.map((s) => `${s.label}:${s.state}`);

describe("checkoutSteps", () => {
  it("a table walks Order → Bill → Pay", () => {
    expect(
      states(checkoutSteps({ staged: true, stage: "order", step: "review", settle: false })),
    ).toEqual(["Order:current", "Bill:next", "Pay:next"]);
    expect(
      states(checkoutSteps({ staged: true, stage: "bill", step: "review", settle: false })),
    ).toEqual(["Order:done", "Bill:current", "Pay:next"]);
    expect(
      states(checkoutSteps({ staged: true, stage: "bill", step: "pay", settle: false })),
    ).toEqual(["Order:done", "Bill:done", "Pay:current"]);
  });
  it("the pay step wins over the stage (a table can only reach Pay from the Bill)", () => {
    expect(
      states(checkoutSteps({ staged: true, stage: "order", step: "pay", settle: false })),
    ).toEqual(["Order:done", "Bill:done", "Pay:current"]);
  });
  it("to-go walks Order → Pay; the market walks Basket → Pay", () => {
    expect(
      states(checkoutSteps({ staged: false, stage: "order", step: "review", settle: false })),
    ).toEqual(["Order:current", "Pay:next"]);
    expect(
      states(
        checkoutSteps({
          staged: false,
          stage: "order",
          step: "pay",
          settle: false,
          noun: "Basket",
        }),
      ),
    ).toEqual(["Basket:done", "Pay:current"]);
  });
  it("the split board is its own surface — no rail", () => {
    expect(checkoutSteps({ staged: true, stage: "bill", step: "review", settle: true })).toEqual(
      [],
    );
  });
  const combos = [true, false].flatMap((staged) =>
    (["order", "bill"] as const).flatMap((stage) =>
      (["review", "pay"] as const).map((step) => ({ staged, stage, step })),
    ),
  );
  it.each(combos)("exactly one step is current whenever the rail is drawn: %o", (c) => {
    const r = checkoutSteps({ ...c, settle: false });
    expect(r.filter((s) => s.state === "current")).toHaveLength(1);
  });
});
