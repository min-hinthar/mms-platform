import { describe, expect, it } from "vitest";
import { canActOn, roleAtLeast, ROLE_ORDER, type StaffRole } from "./staff-roles";

/**
 * A6 — THE GRANT CEILING, and it is the whole gate.
 *
 * `staff` carries exactly one RLS policy on prod and it is a SELECT (`staff_read_self`); every team
 * write goes through the service-role client, which bypasses RLS anyway. So there is no database
 * refusal behind these predicates — if `canActOn` says yes, the row changes. That is why the ladder
 * is tested as a TABLE over every ordered pair rather than on the two cases the feature happened to
 * need: the escalation this guards against is a manager reaching a role above their own, and the
 * cheapest way for that to ship is a new rung, or a flipped comparison, that only one direction of
 * one pair would have caught.
 */

const ROLES: StaffRole[] = ["server", "manager", "owner"];

describe("canActOn — nobody reaches above their own role", () => {
  it("refuses every caller a role STRICTLY above their own, in both directions of every pair", () => {
    // Built from ROLE_ORDER, not from a hand-written expectation table: a transcribed table is how a
    // fourth rung gets added to the ladder and silently not to the guard.
    const rankOf = (r: StaffRole) => ROLE_ORDER.length - 1 - ROLE_ORDER.indexOf(r);
    const seen: string[] = [];
    for (const caller of ROLES) {
      for (const target of ROLES) {
        seen.push(`${caller}->${target}`);
        expect(canActOn(caller, target)).toBe(rankOf(caller) >= rankOf(target));
      }
    }
    // The pair count is measured from the ladder itself, so a rung added to ROLE_ORDER without a
    // matching entry in ROLES fails here instead of quietly shrinking the sweep.
    expect(seen).toHaveLength(ROLE_ORDER.length * ROLE_ORDER.length);
  });

  it("lets a manager act on a server and on a peer manager, and NEVER on an owner", () => {
    // The three answers the feature turns on, stated as themselves — the sweep above proves the
    // rule, this proves the rule is the one the product wanted.
    expect(canActOn("manager", "server")).toBe(true);
    expect(canActOn("manager", "manager")).toBe(true);
    expect(canActOn("manager", "owner")).toBe(false);
  });

  it("keeps the owner able to grant every role, including another owner", () => {
    // The mirror of the rule above, and the reason the transport enum still admits "owner": a
    // ceiling that also stopped the owner would look like a security fix and be a lost power.
    for (const target of ROLES) expect(canActOn("owner", target)).toBe(true);
  });

  it("is NOT the same predicate as the role floor — they answer opposite questions", () => {
    // `roleAtLeast(role, min)` asks "is this caller high enough to be here"; `canActOn(caller,
    // target)` asks "is this target within reach". They coincide on the diagonal and diverge off it,
    // and swapping one for the other is the plausible refactor: a manager IS at least a server
    // (floor), and CAN act on a server (ceiling) — but an owner is not "at least" a manager in the
    // direction the ceiling reads. The asymmetric pair below separates them.
    expect(roleAtLeast("manager", "owner")).toBe(false);
    expect(canActOn("manager", "owner")).toBe(false);
    expect(roleAtLeast("owner", "manager")).toBe(true);
    expect(canActOn("owner", "manager")).toBe(true);
    // …and the one that would survive a swapped implementation only if the arguments were also
    // swapped, which is exactly the mistake being guarded.
    expect(canActOn("server", "manager")).toBe(false);
  });

  it("orders roles highest-first, so the console's menu and the roster agree", () => {
    // ROLE_ORDER drives BOTH the role <select> and listStaff's sort. Reversed, the roster puts
    // servers above the owner and the add-staff menu opens on the lowest role — cosmetic apart, but
    // together they are the screen telling a manager the wrong thing about who runs the place.
    expect(ROLE_ORDER[0]).toBe("owner");
    expect(ROLE_ORDER[ROLE_ORDER.length - 1]).toBe("server");
    // Every role the ladder knows appears exactly once — a duplicate would render twice in the menu.
    expect(new Set(ROLE_ORDER).size).toBe(ROLE_ORDER.length);
    expect([...ROLE_ORDER].sort()).toEqual([...ROLES].sort());
  });
});
