import { describe, expect, it } from "vitest";
import {
  handoffRefunded,
  handoffStillCurrent,
  serverCounterHandoff,
  serverCounterOutcome,
  settlePrimary,
} from "./register-ui";

/**
 * Phase 2c · register — the settle section's UI decisions, pure. A mutate-set module since Phase 2d
 * (`p2d-cx1/…`) and Phase 2g (`p2g-code/…`): nothing here charges anything, but which paid card a
 * screen shows — and whether an order row may read "Paid" at all — is a money fact on a screen.
 * The 2c cases were red-first by hand, noted per case; the 2g ones are pinned by mutants.
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

// ── Phase 2g · P2em (D2) — the #CODE card from the ORDER ROW ─────────────────────────────────────────
describe("serverCounterHandoff — a counter order's paid card, from its persisted row", () => {
  // A tip and an id whose tail is the #CODE; figures chosen so total, total − tip and total + tip all
  // differ (a card built off anything but `total_cents` reads a different number).
  const ROW = {
    id: "o-00a1b2c3",
    total_cents: 5330,
    tip_cents: 300,
    status: "paid",
    refunded_cents: 0,
    cart_id: "c-9",
  };

  it("a paid, unrefunded row is the card: the row's figures verbatim, a counter card, its cart", () => {
    // MUTANT p2g-code/closed-handoff-pi-amount — a total from anything but the row; red.
    expect(serverCounterHandoff(ROW)).toEqual({
      orderId: "o-00a1b2c3",
      totalCents: 5330,
      tipCents: 300,
      tenderedCents: null,
      isCounter: true,
      cartId: "c-9",
      sentEarly: false,
    });
  });

  it("claims no tender (no change) and never that the food went out early — neither is persisted", () => {
    // MUTANT p2g-code/closed-handoff-tendered-invented — a tender read off the total: the card
    // prints "Cash received" and a $0.00 change nobody counted; red.
    const h = serverCounterHandoff(ROW)!;
    expect(h.tenderedCents).toBeNull();
    // MUTANT p2g-code/closed-handoff-sent-early-invented — the card points at the lane on a guess; red.
    expect(h.sentEarly).toBe(false);
  });

  it("a PARTLY refunded order (status still 'paid') is never shown as Paid", () => {
    // MUTANT p2g-code/closed-handoff-partial-refund-reads-paid — only a FULL refund gated; red.
    expect(serverCounterHandoff({ ...ROW, refunded_cents: 1200 })).toBeNull();
  });

  it("a row refunded IN FULL by amount, a beat before the webhook flips its status, is never Paid", () => {
    // MUTANT p2g-code/closed-handoff-amount-full-refund-reads-paid — `status === "paid"` alone; red.
    expect(serverCounterHandoff({ ...ROW, refunded_cents: 5330 })).toBeNull();
  });

  it("a row whose status says refunded is never Paid, even with no ledger amount recorded", () => {
    expect(serverCounterHandoff({ ...ROW, status: "refunded" })).toBeNull();
  });

  it("no row, no card; a null refunded column reads as nothing came back", () => {
    expect(serverCounterHandoff(null)).toBeNull();
    expect(serverCounterHandoff({ ...ROW, refunded_cents: null })?.totalCents).toBe(5330);
  });
});

// ── Phase 2g · review (M2 · PT-3 · PT-7) — the refund STATE beside the card, and its veto ────────────
describe("serverCounterOutcome — the card and the refund state of the SAME row, from one derivation", () => {
  const ROW = {
    id: "o-00a1b2c3",
    total_cents: 5330,
    tip_cents: 300,
    status: "paid",
    refunded_cents: 0,
    cart_id: "c-9",
  };

  it("unrefunded: the card, refund none, the row's id", () => {
    const o = serverCounterOutcome(ROW);
    expect(o.refund).toBe("none");
    expect(o.orderId).toBe("o-00a1b2c3");
    expect(o.handoff).toEqual(serverCounterHandoff(ROW));
    expect(o.handoff).not.toBeNull();
  });

  it("partly refunded: no card, the state SAID as partial, the id kept for the #CODE", () => {
    // MUTANT p2g-fix-code/outcome-partial-reads-unknown — the state is dropped on a refunded row:
    // the pane hedges like an unreadable order and the stale "Paid" stash is never vetoed; red.
    expect(serverCounterOutcome({ ...ROW, refunded_cents: 1200 })).toEqual({
      handoff: null,
      refund: "partial",
      orderId: "o-00a1b2c3",
    });
  });

  it("fully refunded — by status, or by amount a beat before the status flip — reads full", () => {
    expect(serverCounterOutcome({ ...ROW, status: "refunded" }).refund).toBe("full");
    expect(serverCounterOutcome({ ...ROW, refunded_cents: 5330 }).refund).toBe("full");
    expect(serverCounterOutcome({ ...ROW, refunded_cents: 5330 }).handoff).toBeNull();
  });

  it("no row (none read, or the read failed): everything unknown — never 'none'", () => {
    // MUTANT p2g-fix-code/outcome-no-row-reads-none — an unread order would read as "nothing came
    // back", which is a claim the server never made; red.
    expect(serverCounterOutcome(null)).toEqual({ handoff: null, refund: null, orderId: null });
  });
});

describe("handoffRefunded — the server's refund verdict vetoes the tab's card for the SAME order", () => {
  const card = { orderId: "o1" };
  it("a partial or full refund of the card's own order vetoes it", () => {
    // MUTANT p2g-fix-code/veto-partial-ignored — only a FULL refund vetoes: a partly refunded
    // order keeps "Paid · $X" from the tab's stash; red.
    expect(handoffRefunded(card, { orderId: "o1", refund: "partial" })).toBe(true);
    expect(handoffRefunded(card, { orderId: "o1", refund: "full" })).toBe(true);
  });
  it("never while the server says nothing came back, or cannot say (the tab's card wins)", () => {
    // MUTANT p2g-fix-code/veto-on-unknown — an unread order vetoes the cashier's own card; red.
    expect(handoffRefunded(card, { orderId: "o1", refund: "none" })).toBe(false);
    expect(handoffRefunded(card, { orderId: "o1", refund: null })).toBe(false);
    expect(handoffRefunded(card, { orderId: null, refund: null })).toBe(false);
  });
  it("never over ANOTHER order's refund (a read this card's landing post-dates)", () => {
    // MUTANT p2g-fix-code/veto-any-order — the order check dropped: a refund of a different order
    // takes the card for this one; red.
    expect(handoffRefunded(card, { orderId: "o2", refund: "full" })).toBe(false);
  });
});
