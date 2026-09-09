import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A6 — THE THREE TEAM ACTIONS, AGAINST THE CEILING THEY ENFORCE.
 *
 * `staff-role-ceiling.test.ts` proves `canActOn` answers correctly. This proves each action ASKS it
 * the right question, which is where a privilege escalation actually ships: passing the caller's own
 * role as the target, checking the target's current role but not the requested one, or checking one
 * action and not its sibling. All three read as sensible code and all three hand a manager the owner
 * seat.
 *
 * The real ladder is used (`./staff-roles` is imported inside the ./staff mock factory) — mocking
 * `canActOn` here would test the wiring against a predicate that is not the shipped one.
 *
 * ⚠️ There is NO database backstop. Prod's `staff` table carries a single RLS policy and it is a
 * SELECT; these writes use the service-role client, which bypasses RLS regardless. A refusal that is
 * missing here is missing everywhere.
 */

// Real UUIDs: `setStaffActiveInput`/`setStaffRoleInput` bound `userId` with `uuid`, so a readable
// placeholder is rejected at the transport rail and every action answers "Invalid request." —
// which passes an `ok === false` assertion while proving nothing about the ceiling behind it.
const TARGET = "11111111-1111-4111-8111-111111111111";
const CALLER = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const ABSENT = "44444444-4444-4444-8444-444444444444";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));
vi.mock("./posthog-server", () => ({
  getPostHogClient: () => ({ capture() {}, flush: () => Promise.resolve() }),
}));
vi.mock("./email", () => ({
  sendStaffInviteEmail: () => Promise.resolve(),
  sendStaffDeactivatedEmail: () => Promise.resolve(),
}));

type Role = "server" | "manager" | "owner";
let callerRole: Role = "owner";
let authKind: "staff" | "anon" | "unavailable" = "staff";

vi.mock("./staff", async () => {
  // The REAL ladder — the point of the suite is the wiring around it, not a stand-in for it.
  const roles = await import("./staff-roles");
  return {
    canActOn: roles.canActOn,
    roleAtLeast: roles.roleAtLeast,
    STAFF_WRITE_OUTAGE: "outage",
    getStaffAuth: () =>
      Promise.resolve(
        authKind === "staff"
          ? {
              kind: "staff",
              caller: {
                uid: CALLER,
                staffId: "caller-staff",
                role: callerRole,
                displayName: "Caller",
                email: "caller@example.com",
              },
            }
          : { kind: authKind },
      ),
  };
});

type Row = Record<string, unknown>;
let targetRow: Row | null = null;
let updateFilters: [string, unknown][] = [];
let updatePatch: Row | null = null;
let updatedRows: Row[] = [];
let insertPatch: Row | null = null;
let createdUserId: string | null = "new-uid";
// The CONCURRENT CHANGE, modelled rather than asserted about: when set, the target's role moves the
// instant after the action reads it, so the read succeeds (the ceiling and the self-check both run
// on a real row) and the guarded UPDATE then matches nothing. Without this the "blocked write"
// case can only be reached with a MISSING row, which the earlier `maybeSingle` refuses first — a
// degenerate fixture that let the row-count check be deleted with the suite still green.
let raceRoleAfterRead: string | null = null;

function staffApi() {
  const eqs: [string, unknown][] = [];
  let mode: "select" | "update" = "select";
  const api: Record<string, unknown> = {
    select() {
      // `.select("id")` AFTER an update is the row-count read, not a new query — the W17 rule that a
      // blocked write still answers ok. Distinguished by `mode`, set when update() was called.
      if (mode === "update") {
        // Apply the statement's OWN guards, so a mutant that drops `.eq("role", current)` returns a
        // row it should not have matched.
        const hit =
          targetRow !== null &&
          eqs.every(([c, v]) => !(c in (targetRow as Row)) || (targetRow as Row)[c] === v);
        updatedRows = hit ? [{ user_id: TARGET }] : [];
        return Promise.resolve({ data: updatedRows, error: null });
      }
      return api;
    },
    eq(col: string, val: unknown) {
      eqs.push([col, val]);
      if (mode === "update") updateFilters.push([col, val]);
      return api;
    },
    update(patch: Row) {
      mode = "update";
      updatePatch = patch;
      return api;
    },
    insert(patch: Row) {
      insertPatch = patch;
      return Promise.resolve({ error: null });
    },
    maybeSingle() {
      const r = targetRow;
      const hit = r !== null && eqs.every(([c, v]) => !(c in r) || r[c] === v);
      // A COPY of the row is handed back before the race is applied, so the action holds the value
      // it genuinely read while the stored row moves under it — which is what a concurrent change
      // does. Returning the live object would let the mutation rewrite history.
      const snapshot = hit && r ? { ...r } : null;
      if (hit && r && raceRoleAfterRead !== null) targetRow = { ...r, role: raceRoleAfterRead };
      return Promise.resolve({ data: snapshot, error: null });
    },
    then(resolve: (r: { data: Row[]; error: null }) => void) {
      resolve({ data: [], error: null });
    },
  };
  return api;
}

vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: () => staffApi(),
    rpc: () => Promise.resolve({ data: true, error: null }),
    auth: {
      admin: {
        createUser: () =>
          Promise.resolve(
            createdUserId
              ? { data: { user: { id: createdUserId } }, error: null }
              : { data: null, error: { message: "nope" } },
          ),
        deleteUser: () => Promise.resolve({ error: null }),
      },
    },
  }),
}));

const { provisionStaff, setStaffActive, setStaffRole } = await import("./staff-actions");

beforeEach(() => {
  callerRole = "owner";
  authKind = "staff";
  targetRow = {
    user_id: TARGET,
    email: "target@example.com",
    active: true,
    role: "server",
  };
  updateFilters = [];
  updatePatch = null;
  raceRoleAfterRead = null;
  updatedRows = [];
  insertPatch = null;
  createdUserId = "new-uid";
});

describe("provisionStaff — a manager may invite, but never mint an owner", () => {
  it("lets a manager add a server", async () => {
    callerRole = "manager";
    const res = await provisionStaff({
      email: "New@Example.com",
      displayName: "New Person",
      role: "server",
    });
    expect(res).toEqual({ ok: true });
    expect(insertPatch?.role).toBe("server");
  });

  it("REFUSES a manager adding an owner, and writes nothing", async () => {
    // The escalation in two taps: invite an owner at an address you control, then sign in as them.
    callerRole = "manager";
    const res = await provisionStaff({
      email: "me2@example.com",
      displayName: "Me Again",
      role: "owner",
    });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable: asserted a refusal above");
    expect(res.error).toBe("Only the owner can add another owner.");
    // The refusal must land BEFORE the auth user is created — a rolled-back orphan is not the same
    // as never creating one, and `createUser` is the side effect that would leak an invite email.
    expect(insertPatch).toBeNull();
  });

  it("still lets the OWNER add an owner — the ceiling is not a blanket ban", async () => {
    callerRole = "owner";
    const res = await provisionStaff({
      email: "coowner@example.com",
      displayName: "Co Owner",
      role: "owner",
    });
    expect(res).toEqual({ ok: true });
    expect(insertPatch?.role).toBe("owner");
  });

  it("refuses a SERVER outright — the floor still exists under the ceiling", async () => {
    callerRole = "server";
    const res = await provisionStaff({
      email: "x@example.com",
      displayName: "X",
      role: "server",
    });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable: asserted a refusal above");
    expect(res.error).toBe("That needs a manager — ask one to step in.");
  });

  it("reports an OUTAGE rather than a refusal when the session is unreadable", async () => {
    // W10b — "you may not" is a verdict about the caller; an unreachable platform is not.
    authKind = "unavailable";
    const res = await provisionStaff({ email: "x@example.com", displayName: "X", role: "server" });
    expect(res).toEqual({ ok: false, error: "outage" });
  });
});

describe("setStaffActive — a manager may offboard a server, never an owner", () => {
  it("lets a manager deactivate a server", async () => {
    callerRole = "manager";
    const res = await setStaffActive({ userId: TARGET, active: false });
    expect(res).toEqual({ ok: true });
    expect(updatePatch?.active).toBe(false);
  });

  it("REFUSES a manager deactivating an owner", async () => {
    // Without this, the same two taps that offboard a server offboard every owner — and the account
    // that could reinstate them is the one just switched off.
    callerRole = "manager";
    targetRow = { ...(targetRow as Row), role: "owner" };
    const res = await setStaffActive({ userId: TARGET, active: false });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable: asserted a refusal above");
    expect(res.error).toBe("Only the owner can change an owner’s account.");
    expect(updatePatch).toBeNull();
  });

  it("guards the write on the role it read, and reports the RACE rather than success", async () => {
    // The sibling of `setStaffRole`'s statement guard, and it was MISSING on the first pass: the
    // ceiling is decided against a role read a moment earlier, so a target promoted to owner in
    // that window would be deactivated by a manager whose permission was granted for a server.
    // `.update()` reports no row count, so the refused write would otherwise answer ok and the
    // console would show a member switched off who is still on.
    callerRole = "manager";
    raceRoleAfterRead = "owner";
    const res = await setStaffActive({ userId: TARGET, active: false });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable: asserted a refusal above");
    expect(res.error).toBe("That member just changed — reload and try again.");
    expect(updateFilters).toContainEqual(["role", "server"]);
  });

  it("keeps the self-lockout guard ahead of the ceiling", async () => {
    callerRole = "owner";
    targetRow = { ...(targetRow as Row), user_id: CALLER, role: "owner" };
    const res = await setStaffActive({ userId: CALLER, active: false });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable: asserted a refusal above");
    expect(res.error).toBe("You can’t deactivate your own account.");
  });
});

describe("setStaffRole — the half of 'assign roles' that did not exist", () => {
  it("promotes a server to manager and guards the write on the role it read", async () => {
    const res = await setStaffRole({ userId: TARGET, role: "manager" });
    expect(res).toEqual({ ok: true });
    expect(updatePatch?.role).toBe("manager");
    // The guard in the STATEMENT, not merely in the code above it: the ceiling was decided against
    // a role read a moment earlier, and a concurrent change in that window would apply this decision
    // to a role it was never made about.
    expect(updateFilters).toContainEqual(["role", "server"]);
    expect(updateFilters).toContainEqual(["user_id", TARGET]);
  });

  it("REFUSES a manager promoting anyone to owner", async () => {
    // Checking only the TARGET's current role would let this through: a server is within reach, and
    // the role they are being moved to is not checked at all.
    callerRole = "manager";
    const res = await setStaffRole({ userId: TARGET, role: "owner" });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable: asserted a refusal above");
    expect(res.error).toBe("Only the owner can change an owner’s role.");
    expect(updatePatch).toBeNull();
  });

  it("REFUSES a manager demoting an owner", async () => {
    // The mirror hole: checking only the REQUESTED role would let this through, because `server` is
    // within a manager's reach — and it hands the place to whoever ran it.
    callerRole = "manager";
    targetRow = { ...(targetRow as Row), role: "owner" };
    const res = await setStaffRole({ userId: TARGET, role: "server" });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable: asserted a refusal above");
    expect(res.error).toBe("Only the owner can change an owner’s role.");
    expect(updatePatch).toBeNull();
  });

  it("REFUSES changing your OWN role, matched by email as well as uid", async () => {
    // A manager promoting themselves is the shortest path of all; and the sole owner demoting
    // themselves leaves the place with no owner and nobody able to restore one. Matched by email
    // because an allowlisted Google/magic-link session's uid differs from the uid on the row.
    callerRole = "manager";
    targetRow = {
      user_id: OTHER,
      email: "caller@example.com",
      active: true,
      role: "manager",
    };
    const res = await setStaffRole({ userId: OTHER, role: "manager" });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable: asserted a refusal above");
    expect(res.error).toBe("You can’t change your own role.");
    expect(updatePatch).toBeNull();
  });

  it("refuses a member who is not there at all", async () => {
    const res = await setStaffRole({ userId: ABSENT, role: "manager" });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable: asserted a refusal above");
    expect(res.error).toBe("No such staff member.");
  });

  it("reports the RACE rather than success when the guarded write matches nothing", async () => {
    // The row EXISTS and is reachable, so the ceiling and the self-check both pass on a real row —
    // and then its role moves before the UPDATE lands, so the statement's own `.eq("role", …)`
    // matches nothing. `.update()` returns no row count, so without the row check this answers ok
    // and the console renders a role nobody stored, which reverts on the next reload.
    //
    // ⚠️ The ABSENT-row case above CANNOT stand in for this: `maybeSingle` refuses it first, so the
    // row-count check is never reached and the mutant that deletes it survives. That is precisely
    // what happened on the first pass.
    raceRoleAfterRead = "manager";
    const res = await setStaffRole({ userId: TARGET, role: "manager" });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable: asserted a refusal above");
    expect(res.error).toBe("That role just changed — reload and try again.");
  });

  it("treats a no-op change as success without writing", async () => {
    const res = await setStaffRole({ userId: TARGET, role: "server" });
    expect(res).toEqual({ ok: true });
    expect(updatePatch).toBeNull();
  });

  it("reports an OUTAGE when the target row is unreadable, never 'no such member'", async () => {
    authKind = "unavailable";
    const res = await setStaffRole({ userId: TARGET, role: "manager" });
    expect(res).toEqual({ ok: false, error: "outage" });
  });
});
