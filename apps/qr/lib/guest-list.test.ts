import { describe, expect, it } from "vitest";
import { MAX_PARTY_SIZE } from "./limits";
import { guestListAtCap, guestListSeats } from "./guest-list";

/** The guest row's party — the ONE "is the table full?" that GuestList and PD11's guide both read. */
const seat = (n: number) => ({ seat: `s${n}`, name: `Guest ${n}` });
const peers = (n: number) => Array.from({ length: n }, (_, i) => seat(i + 1));

describe("guestListSeats", () => {
  it("self first, peers de-duplicated by seat (presence echoes self too)", () => {
    const me = seat(0);
    expect(guestListSeats(me, [seat(1), me, seat(1), seat(2)]).map((s) => s.seat)).toEqual([
      "s0",
      "s1",
      "s2",
    ]);
  });
});

describe("guestListAtCap", () => {
  it("full exactly at the party cap, counting self once", () => {
    const me = seat(0);
    // MUTATION (pd11/guest-list/cap-strict): `>` — the row offers Invite to a table the server
    // already refuses joins at, and the guide teaches it; red.
    expect(guestListAtCap(me, peers(MAX_PARTY_SIZE - 1))).toBe(true);
    expect(guestListAtCap(me, peers(MAX_PARTY_SIZE - 2))).toBe(false);
    // Self echoed in presence does not count twice.
    expect(guestListAtCap(me, [...peers(MAX_PARTY_SIZE - 2), me])).toBe(false);
  });

  it("no viewer seat yet is never full (the row is not drawn)", () => {
    expect(guestListAtCap(null, peers(MAX_PARTY_SIZE + 3))).toBe(false);
  });
});
