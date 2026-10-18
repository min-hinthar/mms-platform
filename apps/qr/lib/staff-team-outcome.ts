/**
 * M210 · M208 · M205 — what the console says after the database decided a team write.
 *
 * Since `20261018130000_m210_team_safety.sql` the AUTHORITY for a role change, an active flip and an
 * invite's staff row is decided in SQL (`mms_staff_set`, `mms_staff_provision`), under the team lock
 * and both row locks, in the same transaction as the write and its `staff_audit` row. The server
 * actions in `lib/staff-actions.ts` only send the request and read the verdict back. This module is
 * that reading, and nothing else — a PLAIN module (no "use server"), so each status → sentence
 * mapping is falsified by a VALUE in `staff-team-outcome.test.ts` rather than through a render and
 * five mocks (CLAUDE.md, "Decision logic belongs in lib/").
 *
 * ⚠️ AN UNREADABLE VERDICT IS NOT A SUCCESS. The RPC answers jsonb; a transport hiccup, a shape this
 * code does not know, or a status a later migration adds all read as "we could not save it" — never
 * as `ok`, which would show the console a change nobody stored (the W17 rule that a blocked write
 * must not answer ok, one layer up).
 */

export type StaffActionResult = { ok: true } | { ok: false; error: string };

/** A6 — ONE floor-refusal sentence for all three team actions. Named once because it is the string a
 *  server sees when they POST at a screen they cannot open, and three hand-copied versions is how
 *  one of them ends up still saying "Owners only." after the floor moved. */
export const MANAGERS_ONLY = "That needs a manager — ask one to step in.";

/** The generic failure for a role change or an active flip the database did not confirm. */
export const TEAM_UPDATE_FAILED = "Couldn’t update that member. Try again.";
/** The invite's: ONE sentence for every create failure, so it is no account-existence oracle
 *  (S1-audit S7) — a duplicate reads exactly like any other refusal to create. */
export const INVITE_CREATE_FAILED = "Couldn’t create that account. Check the email and try again.";
/** The invite's staff row did not save (an outage, an unknown answer). */
export const INVITE_SAVE_FAILED = "Couldn’t save the staff role. Try again.";

const SET_STATUSES = [
  "ok",
  "noop",
  "not_authorized",
  "not_found",
  "self",
  "changed",
  "ceiling",
] as const;
const PROVISION_STATUSES = ["ok", "not_authorized", "ceiling", "exists"] as const;
export type StaffSetStatus = (typeof SET_STATUSES)[number];
export type StaffProvisionStatus = (typeof PROVISION_STATUSES)[number];

/** The verdict `mms_staff_set` returned, or null when it cannot be read as one. */
export function readSetVerdict(
  data: unknown,
): { status: StaffSetStatus; email: string | null } | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const { status, email } = data as { status?: unknown; email?: unknown };
  if (!SET_STATUSES.includes(status as StaffSetStatus)) return null;
  return {
    status: status as StaffSetStatus,
    email: typeof email === "string" && email.length > 0 ? email : null,
  };
}

/** The verdict `mms_staff_provision` returned, or null when it cannot be read as one. */
export function readProvisionVerdict(data: unknown): StaffProvisionStatus | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const { status } = data as { status?: unknown };
  return PROVISION_STATUSES.includes(status as StaffProvisionStatus)
    ? (status as StaffProvisionStatus)
    : null;
}

/**
 * A role change (`kind: "role"`) or an active flip (`"active"`), as the console reports it. Three
 * refusals differ by kind because the person has to know which one they hit: changing your OWN role
 * is the self-promotion guard, switching yourself off is the lockout guard, and the ceiling names
 * what the owner holds. `noop` is success: the member is already where they were asked to be.
 */
export function setOutcome(
  kind: "role" | "active",
  verdict: { status: StaffSetStatus } | null,
): StaffActionResult {
  switch (verdict?.status) {
    case "ok":
    case "noop":
      return { ok: true };
    case "not_authorized":
      return { ok: false, error: MANAGERS_ONLY };
    case "not_found":
      return { ok: false, error: "No such staff member." };
    case "self":
      return {
        ok: false,
        error:
          kind === "role"
            ? "You can’t change your own role."
            : "You can’t deactivate your own account.",
      };
    case "changed":
      return {
        ok: false,
        error:
          kind === "role"
            ? "That role just changed — reload and try again."
            : "That member just changed — reload and try again.",
      };
    case "ceiling":
      return {
        ok: false,
        error:
          kind === "role"
            ? "Only the owner can change an owner’s role."
            : "Only the owner can change an owner’s account.",
      };
    default:
      return { ok: false, error: TEAM_UPDATE_FAILED };
  }
}

/** The invite's staff row, as the console reports it. Every refusal here leaves an auth user the
 *  action must delete — `provisionStaff` does that before it answers. */
export function provisionOutcome(status: StaffProvisionStatus | null): StaffActionResult {
  switch (status) {
    case "ok":
      return { ok: true };
    case "not_authorized":
      return { ok: false, error: MANAGERS_ONLY };
    case "ceiling":
      return { ok: false, error: "Only the owner can add another owner." };
    case "exists":
      return { ok: false, error: INVITE_CREATE_FAILED };
    default:
      return { ok: false, error: INVITE_SAVE_FAILED };
  }
}
