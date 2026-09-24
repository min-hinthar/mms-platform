import { describe, expect, it, vi } from "vitest";

/**
 * Phase 2a · padserver — the staff add's failure CODE is decided by WHERE the throw happened, never
 * by what its message says (LEARNINGS #60). The write phase is the one that matters most: a throw out
 * of `insertOrIncLine` may have committed (the RPC ran, the response was lost), so calling it `failed`
 * invites a second add under a NEW key — the one outcome the add key exists to make impossible.
 */

vi.mock("server-only", () => ({}));
vi.mock("@mms/db/server", () => ({ serviceClient: () => ({}) }));

const { addFailureCode } = await import("./staff-add-outcome");
const { ItemUnsellableError, ItemUnreadableError, CartClosedError } = await import("./order-lines");

describe("addFailureCode — the write phase", () => {
  it("any throw after pricing is UNCONFIRMED — it may have landed", () => {
    expect(addFailureCode("write", new Error("Cart is no longer open"))).toBe("unconfirmed");
  });

  it("…even when the throw LOOKS like a pricing refusal — the phase decides, not the class", () => {
    // A sold-out error thrown from the write phase is impossible today, but a classifier that read
    // the class first would call a maybe-committed add `sold_out` the day one appears.
    expect(addFailureCode("write", new ItemUnsellableError("x", "sold_out"))).toBe("unconfirmed");
    expect(addFailureCode("write", new ItemUnreadableError("id"))).toBe("unconfirmed");
    expect(addFailureCode("write", "not even an Error")).toBe("unconfirmed");
  });
});

describe("addFailureCode — a DEFINITE refusal from the write", () => {
  it("the insert RPC's typed 'not open' answer is `closed` — the database wrote nothing", () => {
    // MUTATION: drop the arm — a refused add reads `unconfirmed` and staff are told to check the
    // order for a dish that was never added; red.
    expect(addFailureCode("write", new CartClosedError())).toBe("closed");
  });
});

describe("addFailureCode — the price phase (nothing was written)", () => {
  it("a sold-out dish carries its own reason", () => {
    expect(addFailureCode("price", new ItemUnsellableError("x", "sold_out"))).toBe("sold_out");
  });

  it("a delisted dish carries its own reason", () => {
    expect(addFailureCode("price", new ItemUnsellableError("x", "gone"))).toBe("gone");
  });

  it("an unreadable catalog is an OUTAGE, not an availability verdict", () => {
    expect(addFailureCode("price", new ItemUnreadableError("id"))).toBe("outage");
  });

  it("anything else (a cardinality refusal) is a definite FAILED", () => {
    expect(addFailureCode("price", new Error("This item needs a required choice"))).toBe("failed");
    expect(addFailureCode("price", undefined)).toBe("failed");
  });
});
