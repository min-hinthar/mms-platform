import { describe, expect, it } from "vitest";
import { MAX_PARTY_SIZE } from "./limits";
import { guestListAtCap, guestListSeats, joinFailureArm } from "./guest-list";
import { SESSION_REFUSALS } from "./session-refusal";

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

describe("joinFailureArm (J16) — the failed join's way out, by the route's WORD", () => {
  const offers = (r: Parameters<typeof joinFailureArm>[0]) => joinFailureArm(r);

  it("the SEATED race: the route's sentence and the party's code (JoinTable) — never a retry that 409s forever", () => {
    // MUTATION (j16-reason/arm-seated-generic): the race falls to the generic arm — "Couldn't
    // join this table. Try again" again, the very defect J16 names.
    expect(offers("seated")).toEqual({ serverSays: true, retry: false, joinTable: true });
  });

  it("a DE-REGISTERED table: the route's sentence and a code, no retry (the number is refused again)", () => {
    // MUTATION (j16-reason/arm-unregistered-generic).
    expect(offers("table_not_registered")).toEqual({
      serverSays: true,
      retry: false,
      joinTable: true,
    });
  });

  it("a FULL table is terminal: the sentence only — no retry can free a seat, no code joins it", () => {
    // MUTATION (j16-reason/arm-full-generic).
    expect(offers("full")).toEqual({ serverSays: true, retry: false, joinTable: false });
  });

  it("a code that joins nothing (or a reserved one) offers a different code; a table a server or a kiosk holds, or a staff-only order, offers nothing but its sentence", () => {
    for (const r of ["code_not_found", "code_invalid"] as const)
      expect(offers(r)).toEqual({ serverSays: true, retry: false, joinTable: true });
    for (const r of ["kiosk_order", "table_held", "staff_only"] as const)
      expect(offers(r)).toEqual({ serverSays: true, retry: false, joinTable: false });
  });

  it("the transient words — and null (an older server, an unreadable body, an unknown word) — are the generic sentence with a retry, never a verdict", () => {
    // MUTATION (j16-reason/arm-unknown-verbatim): null shows whatever text came back — a raw
    // "HTTP 502" or a parse error read to the diner as if the route had said it.
    for (const r of [
      "try_again",
      "unavailable",
      "rate_limited",
      "unauthenticated",
      "bad_request",
      null,
    ] as const)
      expect(offers(r)).toEqual({ serverSays: false, retry: true, joinTable: false });
  });

  it("every word the route can say has a decided arm (the list is the route's, read once)", () => {
    for (const r of SESSION_REFUSALS) {
      const a = offers(r);
      // A terminal arm always speaks: an arm that neither retries nor offers a code shows the
      // sentence that says what to do instead.
      if (!a.retry && !a.joinTable) expect(a.serverSays).toBe(true);
      // Retry and a verdict never stand together: a retry is offered only where the route said
      // nothing a re-ask would repeat.
      if (a.retry) expect(a.serverSays).toBe(false);
    }
  });
});
