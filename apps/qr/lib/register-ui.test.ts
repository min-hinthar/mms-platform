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
  const c1 = { isCounter: false, cartId: "c1", orderId: "o1" };
  it("a counter card always stands — the counter session is one order", () => {
    expect(handoffStillCurrent({ ...c1, isCounter: true }, "c2", null)).toBe(true);
    expect(handoffStillCurrent({ ...c1, isCounter: true }, null, "o2")).toBe(true);
  });
  it("a table card stands while the table is on the cart it paid, or settled on its own order", () => {
    expect(handoffStillCurrent(c1, "c1", null)).toBe(true);
    expect(handoffStillCurrent(c1, null, "o1")).toBe(true);
    // An unknown latest keeps the card: it was just set from a settle this screen watched land.
    expect(handoffStillCurrent(c1, null, null)).toBe(true);
  });
  it("a table card goes once a DIFFERENT cart opens on the session (the second round)", () => {
    // By hand: drop the cart comparison — last round's change sits under the new round's settle; red.
    expect(handoffStillCurrent(c1, "c2", "o1")).toBe(false);
    expect(handoffStillCurrent({ ...c1, cartId: null }, "c2", null)).toBe(false);
  });
  // MUTANT p2d-cx1/handoff-settled-ignores-the-order — Codex #306 round 1, the residual: a round that
  // opened AND paid while the screen looked elsewhere is never a live cart, only a newer paid order.
  it("a table card goes once the table's latest paid order is not its own (a round paid unseen)", () => {
    expect(handoffStillCurrent(c1, null, "o2")).toBe(false);
  });
});
