import { describe, expect, it } from "vitest";
import { handoffStillCurrent, settlePrimary } from "./register-ui";

/**
 * Phase 2c · register — the settle section's two UI decisions, pure. Not a mutate-set module (no
 * money rule lives here — what is charged is the server's); red-first by hand, noted per case.
 */
describe("settlePrimary — ONE filled action per settle section (§20)", () => {
  it("a secure running bill closes on the card on file; everything else takes cash first", () => {
    // By hand: return "cash" unconditionally — the secure bill loses its primary; red.
    expect(settlePrimary("secure")).toBe("secureTab");
    expect(settlePrimary("none")).toBe("cash");
    expect(settlePrimary("trust")).toBe("cash");
  });
});

describe("handoffStillCurrent — the paid card leaves when the table's next round opens (K33)", () => {
  it("a counter card always stands — the counter session is one order", () => {
    expect(handoffStillCurrent({ isCounter: true, cartId: "c1" }, "c2")).toBe(true);
    expect(handoffStillCurrent({ isCounter: true, cartId: "c1" }, null)).toBe(true);
  });
  it("a table card stands while the table is settled or still on the cart it paid", () => {
    expect(handoffStillCurrent({ isCounter: false, cartId: "c1" }, null)).toBe(true);
    expect(handoffStillCurrent({ isCounter: false, cartId: "c1" }, "c1")).toBe(true);
  });
  it("a table card goes once a DIFFERENT cart opens on the session (the second round)", () => {
    // By hand: drop the cart comparison — last round's change sits under the new round's settle; red.
    expect(handoffStillCurrent({ isCounter: false, cartId: "c1" }, "c2")).toBe(false);
    expect(handoffStillCurrent({ isCounter: false, cartId: null }, "c2")).toBe(false);
  });
});
