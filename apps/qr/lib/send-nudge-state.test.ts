import { describe, expect, it } from "vitest";
import {
  chosenName,
  DEFAULT_SEAT_NAME,
  NUDGE_COOLDOWN_MS,
  nudgeOffered,
  nudgeStands,
  waitingLine,
} from "./send-nudge-state";

/**
 * PD1 — "Let Aye know", the rules as VALUES. Each case changes exactly one input against a
 * neighbour, so a mutant that drops one rule changes exactly one verdict.
 */
const guest = {
  role: "guest" as const,
  hostName: "Aye",
  kitchenDraftUnits: 2,
  frozen: false,
};

describe("nudgeOffered — who may nudge", () => {
  it("a guest with waiting dishes at a table that can name its host", () => {
    expect(nudgeOffered(guest)).toBe(true);
  });
  it("never the host — only the host sends, so only a guest waits on one", () => {
    // MUTATION (send-nudge/host-offered-the-nudge): the role check dropped — the host is offered
    // a button to nudge themselves, and the SQL refuses the tap; red.
    expect(nudgeOffered({ ...guest, role: "host" })).toBe(false);
    expect(nudgeOffered({ ...guest, role: null })).toBe(false);
  });
  it("never without a NAMED host — a hostless table has nobody to nudge, and 'Let Guest know' names nobody", () => {
    // MUTATION (send-nudge/offered-without-a-host): the host check dropped — "Let Guest know"
    // ships, and a hostless table's tap answers no_host; red.
    expect(nudgeOffered({ ...guest, hostName: null })).toBe(false);
  });
  it("only while dishes wait, and never under a pay lock (staff cannot send then either — m1 decision 18)", () => {
    expect(nudgeOffered({ ...guest, kitchenDraftUnits: 0 })).toBe(false);
    // MUTATION (send-nudge/offered-under-a-pay-lock): the freeze ignored — a nudge for a send
    // nobody, staff included, can perform until the lock lifts; red.
    expect(nudgeOffered({ ...guest, frozen: true })).toBe(false);
  });
});

describe("nudgeStands — the guest's confirmation follows the stamp, and only THEIR stamp", () => {
  it("shows while the cart's stamp is this seat's", () => {
    expect(nudgeStands({ seat: "s-thiri", at: "2026-10-08T10:00:00Z" }, "s-thiri")).toBe(true);
  });
  it("not for a tablemate's stamp, not without a stamp, not without a seat", () => {
    // MUTATION (send-nudge/confirmation-claims-a-tablemates-nudge): the seat check dropped —
    // every guest reads "Aye can see you're waiting" over a stamp one of them wrote; red.
    expect(nudgeStands({ seat: "s-other", at: "2026-10-08T10:00:00Z" }, "s-thiri")).toBe(false);
    expect(nudgeStands(null, "s-thiri")).toBe(false);
    expect(nudgeStands({ seat: "s-thiri", at: "2026-10-08T10:00:00Z" }, null)).toBe(false);
  });
});

describe("waitingLine — the host's quiet line, from the table's own names", () => {
  const members = [
    { seat: "s-aye", name: "Aye", role: "host" as const },
    { seat: "s-thiri", name: "Thiri", role: "guest" as const },
    { seat: "s-guest", name: DEFAULT_SEAT_NAME, role: "guest" as const },
  ];
  const stamp = { seat: "s-thiri", at: "2026-10-08T10:00:00Z" };
  it("names the waiting guest to the host", () => {
    expect(waitingLine(stamp, members, "host")).toEqual({
      en: "Thiri is waiting on this send.",
      my: "Thiri က ဒီအော်ဒါ ပို့တာကို စောင့်နေပါတယ်",
    });
  });
  it("a seat the table cannot name is 'Someone's waiting'", () => {
    // MUTATION (send-nudge/default-name-read-as-a-person): the default "Guest" is printed as a
    // name — "Guest is waiting on this send."; red.
    expect(waitingLine({ ...stamp, seat: "s-guest" }, members, "host")?.en).toBe(
      "Someone’s waiting",
    );
    expect(waitingLine({ ...stamp, seat: "s-unknown" }, members, "host")?.en).toBe(
      "Someone’s waiting",
    );
  });
  it("draws nothing for a guest's phone or without a stamp — the line is the host's", () => {
    expect(waitingLine(stamp, members, "guest")).toBeNull();
    expect(waitingLine(null, members, "host")).toBeNull();
  });
});

describe("chosenName — the default seat name is a role word, never a person", () => {
  it("a chosen name passes, trimmed", () => {
    expect(chosenName("  Aye ")).toBe("Aye");
  });
  it("the default 'Guest', blank and missing are null", () => {
    // MUTATION (send-nudge/default-name-is-a-name): "Guest" passes through — "Guest sends the
    // table's order to the kitchen" names a person who does not exist; red.
    expect(chosenName(DEFAULT_SEAT_NAME)).toBeNull();
    expect(chosenName("")).toBeNull();
    expect(chosenName("   ")).toBeNull();
    expect(chosenName(null)).toBeNull();
    expect(chosenName(undefined)).toBeNull();
  });
});

describe("the cooldown is one minute", () => {
  it("matches the SQL's interval", () => {
    expect(NUDGE_COOLDOWN_MS).toBe(60_000);
  });
});
