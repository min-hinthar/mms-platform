import { describe, expect, it } from "vitest";
import { inertReason, type CartInertState } from "./inert-reason";

// W9b — the guards here are about a PROMISE, not arithmetic: that every ordering control on the diner
// journey explains itself, and that they all explain themselves the SAME way. Two things can break
// that silently — a component growing its own copy of the ladder (which is why this module exists),
// and the precedence quietly flipping so a settling table reports a peer's checkout instead. Both are
// pinned below with literal strings, so a copy edit has to come through this file.

const NONE: CartInertState = { minting: false, locked: false, settling: false };
const state = (o: Partial<CartInertState>): CartInertState => ({ ...NONE, ...o });

describe("inertReason — an idle cart says nothing", () => {
  it("returns null when nothing is blocking", () => {
    expect(inertReason(NONE)).toBeNull();
  });
});

describe("inertReason — each state names itself", () => {
  it("settling names the TABLE, not a person: the freeze is table-wide", () => {
    expect(inertReason(state({ settling: true }))).toBe("the order’s locked while your table pays");
  });

  it("locked names a person: the pay-window lock is one member's, and it passes", () => {
    expect(inertReason(state({ locked: true }))).toBe(
      "the order’s locked while someone checks out",
    );
  });

  it("minting is the mint window — a wait, not a refusal", () => {
    expect(inertReason(state({ minting: true }))).toBe("setting up your table…");
  });

  it("every reason is a clause that reads after a dish name, never a bare sentence", () => {
    // The components render `${name} — ${reason}`, so a reason that starts capitalised or ends in a
    // full stop produces "Tea Leaf Salad — The order's locked." Guard the shape, not just the text.
    for (const s of [{ settling: true }, { locked: true }, { minting: true }] as const) {
      const r = inertReason(state(s));
      expect(r).not.toBeNull();
      expect(r![0]).toBe(r![0]!.toLowerCase());
      expect(r!.endsWith(".")).toBe(false);
    }
  });
});

describe("inertReason — precedence is widest-first", () => {
  // `acquireCartLock` makes these mutually exclusive server-side, but a client view can hold a stale
  // pair for a beat. In that window the table-wide state is the honest answer: it outlives the other
  // and it is the one the diner can act on (their share is waiting on the board).
  it("settling outranks locked", () => {
    expect(inertReason(state({ settling: true, locked: true }))).toBe(
      "the order’s locked while your table pays",
    );
  });

  it("settling outranks minting", () => {
    expect(inertReason(state({ settling: true, minting: true }))).toBe(
      "the order’s locked while your table pays",
    );
  });

  it("locked outranks minting", () => {
    expect(inertReason(state({ locked: true, minting: true }))).toBe(
      "the order’s locked while someone checks out",
    );
  });

  it("all three at once still reports the table", () => {
    expect(inertReason({ minting: true, locked: true, settling: true })).toBe(
      "the order’s locked while your table pays",
    );
  });
});
