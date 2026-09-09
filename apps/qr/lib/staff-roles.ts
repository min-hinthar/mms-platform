/**
 * The staff role ladder (S1.1a · A6). A PLAIN module — no "use server" / "server-only" — so the
 * server authority (lib/staff.ts, lib/staff-actions.ts) and the client console (TeamManager) read
 * the SAME ladder, the way `lib/floor-types.ts` is shared by the floor's data layer and its screens.
 *
 * ⚠️ THIS SPLIT IS LOAD-BEARING, not tidiness. `lib/staff.ts` reaches `authz.ts` → `staff-lock.ts` →
 * `@mms/db/server`, so a client component importing a VALUE from it pulls the service-role client
 * into the browser bundle and the build fails outright. Type-only imports erase and hid that for as
 * long as the client needed nothing but types; `canActOn` is the first value it needs. Add a new
 * role RULE here, never at a call site — the whole point is that the console's menu and the action's
 * refusal are the same function.
 */
export type StaffRole = "server" | "manager" | "owner";

/** Role floor, mirroring the SQL CASE in is_staff_at_least (owner ≥ manager ≥ server). */
const RANK: Record<StaffRole, number> = { server: 1, manager: 2, owner: 3 };

export function roleAtLeast(role: StaffRole, min: StaffRole): boolean {
  return RANK[role] >= RANK[min];
}

/**
 * A6 — THE GRANT CEILING, and the only expression of it. Nobody may create, promote to, demote from,
 * or deactivate a role ABOVE their own.
 *
 * The team screen opened to managers (owner, 2026-09-09: "managers should also be able to invite
 * users and assign roles"), and the whole safety of that rests here: `staff` carries RLS with a
 * SELECT policy and NOTHING else (measured on prod — `staff_read_self` is the only row in pg_policy
 * for the table), and every write goes through the service-role client, so the database refuses
 * nothing. There is no second gate behind this one.
 *
 * ONE predicate rather than a comparison re-derived at each call site, because it answers three
 * different questions with the same rule and they must not drift apart: may I GRANT this role, may I
 * act on THIS member, and may I move them to that new role. A manager acting on a peer manager is
 * allowed (the equality) — that mirrors the long-standing owner-on-owner precedent in
 * `setStaffActive` — while acting on YOURSELF is refused separately by each action, since the reason
 * differs (lockout vs. self-promotion) and the caller's own row passes this test trivially.
 */
export function canActOn(callerRole: StaffRole, targetRole: StaffRole): boolean {
  return RANK[callerRole] >= RANK[targetRole];
}

/** Highest → lowest. The console renders role menus from this, so a new rung appears in the UI and
 *  in the ladder together rather than in one of them. */
export const ROLE_ORDER: StaffRole[] = ["owner", "manager", "server"];
