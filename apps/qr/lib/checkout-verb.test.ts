import { describe, expect, it } from "vitest";
import { TABLE_STARTER } from "./confirm-copy";
import { billDoorLabel, orderStageHero, payBlock, payBlockCopy } from "./checkout-verb";

/**
 * Phase 3c-i (D13 · D16) — the dine-in checkout's one hero verb per state, Pay's one reason, and the
 * door's honest label. Every arm is a VALUE here, so a mutant on any of them is red without a render.
 */
describe("orderStageHero — one verb per state (D13)", () => {
  it("a host with drafts and no grace open is offered Send", () => {
    expect(orderStageHero({ canSend: true, kitchenDraftUnits: 2, graceOpen: false })).toBe("send");
  });

  it("an open undo window is Undo — even with drafts still to send", () => {
    // MUTATION (checkout-verb/send-offered-during-grace): hero returns 'send' while graceOpen —
    // a filled Send beside "Undo — Ns" makes forfeiting the undo the visual hero; red.
    expect(orderStageHero({ canSend: true, kitchenDraftUnits: 2, graceOpen: true })).toBe("undo");
    expect(orderStageHero({ canSend: true, kitchenDraftUnits: 0, graceOpen: true })).toBe("undo");
  });

  it("everything sent → the bill is the hero", () => {
    expect(orderStageHero({ canSend: true, kitchenDraftUnits: 0, graceOpen: false })).toBe("bill");
  });

  it("a GUEST with drafts is never offered Send — only the host fires the table", () => {
    // MUTATION (checkout-verb/guest-offered-send): canSend dropped from the send arm — a guest
    // sees a filled Send that `mms_fire_cart` refuses; red.
    expect(orderStageHero({ canSend: false, kitchenDraftUnits: 3, graceOpen: false })).toBe("bill");
  });

  it("a hostless table with drafts is the bill (pay fires them)", () => {
    expect(orderStageHero({ canSend: false, kitchenDraftUnits: 1, graceOpen: false })).toBe("bill");
  });
});

describe("payBlock — Pay's one reason, in precedence (D16)", () => {
  const none = { frozenByPeer: false, unsentBlocks: false, graceOpen: false, undoInFlight: false };

  it("peer > unsent > grace", () => {
    // MUTATION (checkout-verb/peer-lock-dropped-from-pay): the peer arm deleted — a tablemate's
    // lock is answered with the unsent sentence, or with nothing; red.
    expect(payBlock({ ...none, frozenByPeer: true, unsentBlocks: true, graceOpen: true })).toBe(
      "peer",
    );
    // MUTATION (checkout-verb/grace-outranks-unsent): the two returns swapped — the Send still
    // owed reopens the window, so "Pay opens when the undo window closes" would be a lie; red.
    expect(payBlock({ ...none, unsentBlocks: true, graceOpen: true })).toBe("unsent");
    expect(payBlock({ ...none, graceOpen: true })).toBe("grace");
  });

  it("an undo in flight alone is the grace reason", () => {
    // MUTATION (checkout-verb/in-flight-undo-not-a-window): undoInFlight dropped — the window
    // has closed, the undo has not answered, and Pay mints over lines that may come back; red.
    expect(payBlock({ ...none, undoInFlight: true })).toBe("grace");
  });

  it("nothing blocks → null", () => {
    // MUTATION (checkout-verb/grace-does-not-wait-pay): the graceOpen||undoInFlight arm → null
    // — Pay charges in-grace lines the diner can still pull back; red (the cases above).
    expect(payBlock(none)).toBeNull();
  });
});

describe("billDoorLabel — the door never promises a verb the next screen refuses (D14)", () => {
  it("promises pay only when nothing blocks it", () => {
    expect(billDoorLabel(null)).toBe("viewBillAndPay");
  });

  it("any block → 'View bill'", () => {
    // MUTATION (checkout-verb/door-promises-pay-while-held): billDoorLabel ignores the block —
    // "View bill & pay" over a Bill whose Pay is dimmed; red.
    expect(billDoorLabel("peer")).toBe("viewBill");
    expect(billDoorLabel("unsent")).toBe("viewBill");
    expect(billDoorLabel("grace")).toBe("viewBill");
  });
  it("a standing counter ask hides Pay behind the counter card — the door may not promise '& pay' over it either (Codex round 3 on #313)", () => {
    // MUTATION (checkout-verb/door-promises-pay-under-a-counter-ask): the ask ignored — "View bill
    // & pay" leads to a Bill with no Pay on it; red.
    expect(billDoorLabel(null, true)).toBe("viewBill");
    expect(billDoorLabel(null, false)).toBe("viewBillAndPay");
    expect(billDoorLabel("unsent", true)).toBe("viewBill");
  });
});

describe("payBlockCopy — one sentence per state", () => {
  const ctx = { lockedByName: "Tin", canSend: true, hostName: "Aung" };

  it("peer: names who is finishing", () => {
    expect(payBlockCopy("peer", ctx)).toBe("Waiting for Tin to finish");
    // The shipped fallback when the lock has no name (Checkout's own `?? "Someone"`).
    expect(payBlockCopy("peer", { ...ctx, lockedByName: null })).toBe(
      "Waiting for Someone to finish",
    );
  });

  it("unsent: the host is told to send; a guest is told who does", () => {
    expect(payBlockCopy("unsent", ctx)).toBe(
      "Send everything to the kitchen first — then the bill is ready to pay.",
    );
    // MUTATION (checkout-verb/guest-unsent-copy-orders-the-guest-to-send): canSend ignored — a
    // guest is told to send dishes only the host can; red.
    expect(payBlockCopy("unsent", { ...ctx, canSend: false })).toBe(
      "Aung sends them — then the bill is ready to pay.",
    );
    expect(payBlockCopy("unsent", { ...ctx, canSend: false, hostName: null })).toBe(
      `${TABLE_STARTER} sends them — then the bill is ready to pay.`,
    );
  });

  it("grace: Pay waits for the window", () => {
    expect(payBlockCopy("grace", ctx)).toBe("Pay opens when the undo window closes.");
  });
});
