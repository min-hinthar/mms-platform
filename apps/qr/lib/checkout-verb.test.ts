import { describe, expect, it } from "vitest";
import { TABLE_STARTER } from "./confirm-copy";
import { billDoorLabel, orderStageHero, payBlock, payBlockCopy } from "./checkout-verb";

/**
 * Phase 3c-i (D13 · D16) — the dine-in checkout's one hero verb per state, Pay's one reason, and the
 * door's honest label. Every arm is a VALUE here, so a mutant on any of them is red without a render.
 */
describe("orderStageHero — one verb per state (D13)", () => {
  it("a host with drafts and no grace open is offered Send", () => {
    expect(
      orderStageHero({ canSend: true, kitchenDraftUnits: 2, graceOpen: false, hostPresent: true }),
    ).toBe("send");
  });

  it("an open undo window is Undo — even with drafts still to send", () => {
    // MUTATION (checkout-verb/send-offered-during-grace): hero returns 'send' while graceOpen —
    // a filled Send beside "Undo — Ns" makes forfeiting the undo the visual hero; red.
    expect(
      orderStageHero({ canSend: true, kitchenDraftUnits: 2, graceOpen: true, hostPresent: true }),
    ).toBe("undo");
    expect(
      orderStageHero({ canSend: true, kitchenDraftUnits: 0, graceOpen: true, hostPresent: true }),
    ).toBe("undo");
  });

  it("everything sent → the bill is the hero", () => {
    expect(
      orderStageHero({ canSend: true, kitchenDraftUnits: 0, graceOpen: false, hostPresent: true }),
    ).toBe("bill");
  });

  it("a GUEST with drafts is never offered Send — only the host fires the table", () => {
    // MUTATION (checkout-verb/guest-offered-send): canSend dropped from the send arm — a guest
    // sees a filled Send that `mms_fire_cart` refuses; red.
    expect(
      orderStageHero({ canSend: false, kitchenDraftUnits: 3, graceOpen: false, hostPresent: true }),
    ).not.toBe("send");
  });

  it("PD1 — a GUEST whose dishes wait on a host's Send WAITS: 'Show a server' is their hero (amends D13)", () => {
    // MUTATION (checkout-verb/wait-arm-dropped): the arm deleted — the guest's hero is the bill
    // door again, leading them to a Bill whose next step is someone else's; red.
    expect(
      orderStageHero({ canSend: false, kitchenDraftUnits: 3, graceOpen: false, hostPresent: true }),
    ).toBe("wait");
    // Nothing waits once everything is sent.
    expect(
      orderStageHero({ canSend: false, kitchenDraftUnits: 0, graceOpen: false, hostPresent: true }),
    ).toBe("bill");
  });

  it("PD1 — a HOSTLESS table with drafts keeps the bill: nobody at the table sends, so nobody waits", () => {
    // MUTATION (checkout-verb/wait-offered-on-a-hostless-table): the host check dropped — a guest
    // at a staff-opened table is told to wait on a person who does not exist; red.
    expect(
      orderStageHero({
        canSend: false,
        kitchenDraftUnits: 1,
        graceOpen: false,
        hostPresent: false,
      }),
    ).toBe("bill");
  });

  it("PD1 — the HOST never waits on themselves: with drafts the host Sends", () => {
    // MUTATION (checkout-verb/send-outranks-wait): the wait arm hoisted above Send — the host is
    // handed "Show a server" for dishes only they can send; red.
    expect(
      orderStageHero({ canSend: true, kitchenDraftUnits: 2, graceOpen: false, hostPresent: true }),
    ).toBe("send");
  });
});

describe("payBlock — Pay's one reason, in precedence (D16)", () => {
  const none = { frozenByPeer: false, unsentBlocks: false, graceOpen: false, undoInFlight: false };

  it("peer > unsent > grace", () => {
    // MUTATION (checkout-verb/peer-lock-dropped-from-pay): the peer arm deleted — a tablemate's
    // lock is answered with the unsent sentence, or with nothing; red.
    expect(
      payBlock({
        ...none,
        frozenByPeer: true,
        unsentBlocks: true,
        graceOpen: true,
      }),
    ).toBe("peer");
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
  // The door as it stands after C2's flip: no ask, the phone-pay door open.
  const open = { counterAsk: false, phonePayOpen: true };

  it("promises pay only when nothing blocks it", () => {
    expect(billDoorLabel(null, open)).toBe("viewBillAndPay");
  });

  it("any block → 'View bill'", () => {
    // MUTATION (checkout-verb/door-promises-pay-while-held): billDoorLabel ignores the block —
    // "View bill & pay" over a Bill whose Pay is dimmed; red.
    expect(billDoorLabel("peer", open)).toBe("viewBill");
    expect(billDoorLabel("unsent", open)).toBe("viewBill");
    expect(billDoorLabel("grace", open)).toBe("viewBill");
  });
  it("a standing counter ask hides Pay behind the counter card — the door may not promise '& pay' over it either (Codex round 3 on #313)", () => {
    // MUTATION (checkout-verb/door-promises-pay-under-a-counter-ask): the ask ignored — "View bill
    // & pay" leads to a Bill with no Pay on it; red.
    expect(billDoorLabel(null, { ...open, counterAsk: true })).toBe("viewBill");
    expect(billDoorLabel(null, open)).toBe("viewBillAndPay");
    expect(billDoorLabel("unsent", { ...open, counterAsk: true })).toBe("viewBill");
  });
  it("PD2 — while the phone-pay door is PARKED the door reads 'View bill' in EVERY arm (m1 B9, reconciliation 3)", () => {
    // MUTATION (checkout-verb/door-promises-pay-while-parked): the flag ignored — a hostless
    // table, or a guest after the host's send, is led by "View bill & pay" to a Bill that has no
    // Pay on it at all; red.
    const parked = { counterAsk: false, phonePayOpen: false };
    expect(billDoorLabel(null, parked)).toBe("viewBill");
    expect(billDoorLabel("unsent", parked)).toBe("viewBill");
    expect(billDoorLabel(null, { ...parked, counterAsk: true })).toBe("viewBill");
    // …and the flip restores "& pay" with nothing else changed (the flag is the only input).
    expect(billDoorLabel(null, { ...parked, phonePayOpen: true })).toBe("viewBillAndPay");
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
