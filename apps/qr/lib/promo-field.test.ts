import { describe, expect, it } from "vitest";
import type { PromoReason } from "./cart";
import { promoRefusalOnField } from "./promo-field";

/**
 * F20 — the promo refusals that are the CODE's (drawn under the box, the box invalid) and the ones
 * that are the ORDER's or the attempt's (the view's one region, the box left alone). The split is
 * the spec, so it is written out here as one: a code you can fix by retyping, versus a state the
 * code has nothing to do with. An unmet MINIMUM is the order's (blind pass on #355): the code is
 * fine, and the edits that meet it never touch the box.
 */
const THE_CODE: PromoReason[] = [
  "invalid",
  "inactive",
  "not_started",
  "expired",
  "exhausted",
  "session_limit",
];
const NOT_THE_CODE: PromoReason[] = [
  "min_not_met",
  "cart_closed",
  "locked",
  "rate_limited",
  "error",
];

describe("promoRefusalOnField", () => {
  it("binds every refusal ABOUT THE CODE to the box", () => {
    // MUTATION uia11y/f20-promo-invalid-off-the-box: "invalid" leaves the box; red.
    for (const r of THE_CODE) expect(promoRefusalOnField(r), r).toBe(true);
  });

  it("never marks the box invalid for the ORDER's state or the attempt", () => {
    // MUTATION uia11y/f20-promo-lock-on-the-box: "someone's checking out" drawn as a bad code; red.
    // MUTATION uia11y/f20-promo-minimum-on-the-box: a code that may apply marked invalid; red.
    for (const r of NOT_THE_CODE) expect(promoRefusalOnField(r), r).toBe(false);
  });
});
