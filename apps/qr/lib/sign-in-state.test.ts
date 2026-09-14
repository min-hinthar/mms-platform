import { describe, expect, it } from "vitest";
import type { StaffAuth } from "./staff";
import { LOCK_ROUTE, resolveSignInState } from "./sign-in-state";

/**
 * A4·4 — the sign-in screen is ONE route with states, and this is the rule that picks the state.
 *
 * What is worth pinning is the ORDER of the staff arms, because it is a behaviour the old page
 * had and a merged page could silently lose: an explicit `?next=` still wins over everything (a
 * bookmarked `/staff/login?next=/kiosk` on the lobby iPad stays idempotent, and the lock is a
 * `/staff`-scoped cookie the kiosk never sees — so the destination gates itself, exactly as before);
 * only a visit with NO destination lands on the signed-in state, and a locked tablet goes to the
 * lock first, because every other console page does.
 */
const STAFF: StaffAuth = {
  kind: "staff",
  caller: {
    uid: "u1",
    staffId: "s1",
    role: "server",
    displayName: "Daw Aye",
    email: "aye@example.com",
  },
};

describe("resolveSignInState", () => {
  it("an unknowable answer is the outage, never the form — a form here reads as 'you were signed out'", () => {
    expect(
      resolveSignInState({ kind: "unavailable" }, { locked: false, next: null, denied: false }),
    ).toEqual({ kind: "outage" });
    // …and no `next` or lock changes that: nothing is known about the person.
    expect(
      resolveSignInState({ kind: "unavailable" }, { locked: true, next: "/kiosk", denied: true }),
    ).toEqual({ kind: "outage" });
  });

  it("no session → the form; `?denied=1` is carried so a bounce still explains itself", () => {
    expect(
      resolveSignInState({ kind: "anon" }, { locked: false, next: null, denied: false }),
    ).toEqual({ kind: "form", denied: false });
    expect(
      resolveSignInState({ kind: "anon" }, { locked: false, next: "/staff", denied: true }),
    ).toEqual({ kind: "form", denied: true });
  });

  it("a real account with no staff row → the form, DENIED, whatever the URL said", () => {
    expect(
      resolveSignInState({ kind: "not_staff" }, { locked: false, next: null, denied: false }),
    ).toEqual({ kind: "form", denied: true });
    // The lock cookie can be set on a tablet a wrong account signed into — it must not turn the
    // denied form into a lock screen the wrong account could never unlock.
    expect(
      resolveSignInState({ kind: "not_staff" }, { locked: true, next: "/kiosk", denied: false }),
    ).toEqual({ kind: "form", denied: true });
  });

  it("staff with an explicit destination → that destination, even on a locked tablet (it gates itself)", () => {
    expect(resolveSignInState(STAFF, { locked: false, next: "/kiosk", denied: false })).toEqual({
      kind: "redirect",
      to: "/kiosk",
    });
    expect(
      resolveSignInState(STAFF, { locked: true, next: "/board?k=abc", denied: false }),
    ).toEqual({ kind: "redirect", to: "/board?k=abc" });
    // A `?next=/staff` written out is still a destination: the person came to sign in FOR the console.
    expect(resolveSignInState(STAFF, { locked: false, next: "/staff", denied: true })).toEqual({
      kind: "redirect",
      to: "/staff",
    });
  });

  it("staff with no destination on a LOCKED tablet → the lock, like every other console page", () => {
    expect(resolveSignInState(STAFF, { locked: true, next: null, denied: false })).toEqual({
      kind: "redirect",
      to: LOCK_ROUTE,
    });
    expect(LOCK_ROUTE).toBe("/staff/lock");
  });

  it("staff with no destination, unlocked → the signed-in state; a stale `?denied=1` is ignored", () => {
    expect(resolveSignInState(STAFF, { locked: false, next: null, denied: false })).toEqual({
      kind: "me",
      caller: STAFF.caller,
    });
    expect(resolveSignInState(STAFF, { locked: false, next: null, denied: true })).toEqual({
      kind: "me",
      caller: STAFF.caller,
    });
  });
});
