import { describe, expect, it } from "vitest";
import { CART_EMPTY_COPY, cartEmptyState } from "./cart-empty-copy";

describe("cartEmptyState — an unreadable /cart never claims there is no order", () => {
  it("says 'no order yet' ONLY when the URL carried no cart at all", () => {
    expect(cartEmptyState(false, false)).toBe("none");
  });

  it("an id this device cannot open is CLOSED here, not empty (the tablemate after the host paid)", () => {
    // MUTATION: collapse `closed` into `none` (the first Phase 0 draft) → red.
    expect(cartEmptyState(true, false)).toBe("closed");
    expect(CART_EMPTY_COPY.closed.title).not.toMatch(/no order/i);
    expect(CART_EMPTY_COPY.closed.subtitle).not.toMatch(/will show up/i);
  });

  it("the payer sees it complete", () => {
    expect(cartEmptyState(true, true)).toBe("complete");
  });
});
