import { describe, expect, it } from "vitest";
import type { CartItem } from "@mms/db";
import { cartBarCountShown, cartBarLine2, cartBarName } from "./cart-bar-state";

/**
 * PD1 (m1 A5 · B12; DESIGN-LANGUAGE §21 "a count is a claim") — the /menu order bar on a SHARED
 * cart: no count, and a second line in the console's own words. Each rule as a value.
 */
const draft: CartItem = {
  id: "a",
  menuItemId: "m",
  name: "Mohinga",
  qty: 2,
  modifiers: [],
  unitPriceCents: 1400,
  taxCents: 0,
  lineState: "draft",
  fulfillment: "dinein",
};
const sent: CartItem = { ...draft, id: "b", lineState: "fired", fireAt: "2026-10-08T10:00:00Z" };
const togoDraft: CartItem = { ...draft, id: "c", fulfillment: "togo" };

describe("cartBarCountShown — a count only where the cart is one phone's", () => {
  it("pickup and the market keep their count; a dine-in table never shows one", () => {
    // MUTATION (cart-bar/count-shown-on-a-shared-cart): the mode check dropped — a shared table's
    // count, a tablemate's tap away from wrong; red.
    expect(cartBarCountShown("dinein")).toBe(false);
    expect(cartBarCountShown("pickup")).toBe(true);
    expect(cartBarCountShown("scango")).toBe(true);
  });
});

describe("cartBarLine2 — the console's own words under 'View order'", () => {
  it("'Not sent yet' while a dine-in draft waits; nothing once everything is with the kitchen", () => {
    expect(
      cartBarLine2({ mode: "dinein", role: "guest", items: [draft, sent], nudgeStanding: false }),
    ).toBe("unsent");
    // MUTATION (cart-bar/togo-draft-reads-as-unsent): a to-go draft (fires at pay) counted as a
    // dish the host owes — "Not sent yet" over nothing the Send would move; red.
    expect(
      cartBarLine2({ mode: "dinein", role: "guest", items: [togoDraft], nudgeStanding: false }),
    ).toBeNull();
    expect(
      cartBarLine2({ mode: "dinein", role: "host", items: [sent], nudgeStanding: false }),
    ).toBeNull();
  });
  it("the HOST reads 'Someone's waiting' while a guest's nudge stands; a guest never does", () => {
    expect(
      cartBarLine2({ mode: "dinein", role: "host", items: [draft], nudgeStanding: true }),
    ).toBe("waiting");
    // MUTATION (cart-bar/waiting-line-shown-to-a-guest): the role check dropped — the nudger
    // reads their own nudge as someone else waiting; red.
    expect(
      cartBarLine2({ mode: "dinein", role: "guest", items: [draft], nudgeStanding: true }),
    ).toBe("unsent");
  });
  it("never on a cart that is one phone's — pickup and the market have no send step", () => {
    expect(
      cartBarLine2({ mode: "pickup", role: null, items: [draft], nudgeStanding: false }),
    ).toBeNull();
  });
});

describe("cartBarName — the static accessible name, counted only off the table", () => {
  it("off the table: 'View order — N items, subtotal $X'", () => {
    expect(cartBarName({ shared: false, count: 2, line2: null, dollars: "$12.00" })).toBe(
      "View order — 2 items, subtotal $12.00",
    );
    expect(cartBarName({ shared: false, count: 1, line2: null, dollars: "$12.00" })).toBe(
      "View order — 1 item, subtotal $12.00",
    );
  });
  it("at the table: the line, never a number", () => {
    // MUTATION (cart-bar/shared-name-carries-a-count): the shared name counts; red.
    expect(cartBarName({ shared: true, count: 3, line2: "unsent", dollars: "$31.50" })).toBe(
      "View order, not sent yet — subtotal $31.50",
    );
    expect(cartBarName({ shared: true, count: 3, line2: "waiting", dollars: "$31.50" })).toBe(
      "View order, someone’s waiting — subtotal $31.50",
    );
    expect(cartBarName({ shared: true, count: 3, line2: null, dollars: "—" })).toBe(
      "View order — subtotal —",
    );
  });
});
