import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A6 · M208 · M210 · M205 — THE THREE TEAM ACTIONS, AGAINST THE DATABASE THAT NOW DECIDES THEM.
 *
 * Since `20261018130000_m210_team_safety.sql` the caller's authority, the self rule, the role the
 * console showed and A6's ceiling are decided by `mms_staff_set` / `mms_staff_provision`, in the same
 * transaction as the write and its `staff_audit` row — proved against the real database by
 * `supabase/tests/m210_team_safety_test.sql` and, for the orders, `scripts/verify-team-race.mjs`.
 * What is left HERE is the wiring, which is where a hole ships just as well:
 *   · the RPC is asked about the right people — the caller's ROW (`staffId`), never the session's
 *     uid, and the role the action READ as the role the console showed;
 *   · its verdict is READ — a refusal, an error or an answer we cannot parse never reports ok, a
 *     no-op announces nothing, and a failed invite deletes the auth user it made;
 *   · the session-aware checks that stay in TypeScript: the floor at the door, the self check's
 *     e-mail arm (only the session knows its e-mail), and the invite's pre-flight before `createUser`.
 *
 * The real ladder is used (`./staff-roles` is imported inside the ./staff mock factory) — mocking
 * `canActOn` here would test the pre-flight against a predicate that is not the shipped one.
 */

// Real UUIDs: `setStaffActiveInput`/`setStaffRoleInput` bound `userId` with `uuid`, so a readable
// placeholder is rejected at the transport rail and every action answers "Invalid request." —
// which passes an `ok === false` assertion while proving nothing about what is behind it.
const TARGET = "11111111-1111-4111-8111-111111111111";
const CALLER = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const ABSENT = "44444444-4444-4444-8444-444444444444";
// `staff.user_id` of the caller's own row. Deliberately NOT `CALLER`: a Google/magic-link session
// mints a uid the provisioned row does not carry, and every authority read is keyed on the ROW.
const CALLER_STAFF = "55555555-5555-4555-8555-555555555555";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));
// The SECONDARY record (M205 made `staff_audit` the durable one). Recorded so a no-op can be shown
// to announce nothing — the heads-up e-mail alone cannot show it: a no-op carries no address.
let analytics: string[] = [];
vi.mock("./posthog-server", () => ({
  getPostHogClient: () => ({
    capture({ event }: { event: string }) {
      analytics.push(event);
    },
    flush: () => Promise.resolve(),
  }),
}));
let deactivationEmails: string[] = [];
vi.mock("./email", () => ({
  sendStaffInviteEmail: () => Promise.resolve(),
  sendStaffDeactivatedEmail: ({ to }: { to: string }) => {
    deactivationEmails.push(to);
    return Promise.resolve();
  },
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
                staffId: CALLER_STAFF,
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
let targetRowUnreadable = false;
// The caller's own staff row, read again before the INVITE's side effect (the pre-flight). `null`
// models a caller whose row is gone; `active: false` or a lower role models a revocation.
let callerRow: Row | null = null;
let callerRowUnreadable = false;
// What the database answers. `rpcError` models a transport failure; the verdicts model each status.
let setVerdict: unknown = { status: "ok", email: "target@example.com" };
let provisionVerdict: unknown = { status: "ok" };
let rpcError = false;
let rpcCalls: [string, Row][] = [];
let createdUserId: string | null = "new-uid";
let createUserCalls = 0;
let deletedUsers: string[] = [];

function staffApi() {
  const eqs: [string, unknown][] = [];
  const api: Record<string, unknown> = {
    select() {
      return api;
    },
    eq(col: string, val: unknown) {
      eqs.push([col, val]);
      return api;
    },
    update() {
      throw new Error("a team write must go through the RPC, never a direct .update()");
    },
    insert() {
      throw new Error("a team write must go through the RPC, never a direct .insert()");
    },
    maybeSingle() {
      // Keyed by user_id, so the caller's re-read and the target read are told apart the way the
      // real queries are — a fake that answered `targetRow` to both could not see a revoked caller.
      const wantsCaller = eqs.some(([c, v]) => c === "user_id" && v === CALLER_STAFF);
      if (wantsCaller) {
        if (callerRowUnreadable)
          return Promise.resolve({ data: null, error: { message: "caller row unreadable" } });
        return Promise.resolve({
          data: callerRow === null ? null : { ...callerRow, role: callerRow.role ?? callerRole },
          error: null,
        });
      }
      if (targetRowUnreadable)
        return Promise.resolve({ data: null, error: { message: "target row unreadable" } });
      const r = targetRow;
      const hit = r !== null && eqs.every(([c, v]) => !(c in r) || r[c] === v);
      return Promise.resolve({ data: hit && r ? { ...r } : null, error: null });
    },
  };
  return api;
}

vi.mock("@mms/db/server", () => ({
  serviceClient: () => ({
    from: () => staffApi(),
    rpc: (name: string, args: Row) => {
      rpcCalls.push([name, args]);
      if (name === "mms_rate_limit") return Promise.resolve({ data: true, error: null });
      if (rpcError) return Promise.resolve({ data: null, error: { message: "rpc down" } });
      if (name === "mms_staff_set") return Promise.resolve({ data: setVerdict, error: null });
      if (name === "mms_staff_provision")
        return Promise.resolve({ data: provisionVerdict, error: null });
      throw new Error(`unexpected rpc ${name}`);
    },
    auth: {
      admin: {
        createUser: () => {
          createUserCalls++;
          return Promise.resolve(
            createdUserId
              ? { data: { user: { id: createdUserId } }, error: null }
              : { data: null, error: { message: "nope" } },
          );
        },
        deleteUser: (id: string) => {
          deletedUsers.push(id);
          return Promise.resolve({ error: null });
        },
      },
    },
  }),
}));

const { provisionStaff, setStaffActive, setStaffRole } = await import("./staff-actions");

/** The team RPC calls made (the rate limit is not one). */
const teamCalls = () => rpcCalls.filter(([n]) => n !== "mms_rate_limit");

beforeEach(() => {
  callerRole = "owner";
  authKind = "staff";
  targetRow = {
    user_id: TARGET,
    email: "target@example.com",
    active: true,
    role: "server",
  };
  targetRowUnreadable = false;
  callerRow = { user_id: CALLER_STAFF, role: null, active: true }; // role: null → follows `callerRole`
  callerRowUnreadable = false;
  setVerdict = { status: "ok", email: "target@example.com" };
  provisionVerdict = { status: "ok" };
  rpcError = false;
  rpcCalls = [];
  createdUserId = "new-uid";
  createUserCalls = 0;
  deletedUsers = [];
  deactivationEmails = [];
  analytics = [];
  process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test"; // the analytics event fires only with a key
});
const POSTHOG_KEY_BEFORE = process.env.NEXT_PUBLIC_POSTHOG_KEY;
afterEach(() => {
  // Never leak the key into another file sharing this worker.
  if (POSTHOG_KEY_BEFORE === undefined) delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
  else process.env.NEXT_PUBLIC_POSTHOG_KEY = POSTHOG_KEY_BEFORE;
});

const invite = (role: Role = "server") =>
  provisionStaff({ email: "New@Example.com", displayName: "New Person", role });

describe("provisionStaff — the staff row goes through the RPC, and a refusal leaves nothing", () => {
  it("lets a manager add a server, asking the RPC about the caller's ROW", async () => {
    callerRole = "manager";
    const res = await invite("server");
    expect(res).toEqual({ ok: true });
    expect(teamCalls()).toEqual([
      [
        "mms_staff_provision",
        {
          p_caller: CALLER_STAFF,
          p_user_id: "new-uid",
          p_email: "new@example.com",
          p_role: "server",
          p_display_name: "New Person",
        },
      ],
    ]);
    expect(deletedUsers).toEqual([]);
  });

  it("REFUSES a manager adding an owner BEFORE any account exists (the pre-flight)", async () => {
    // The escalation in two taps: invite an owner at an address you control, then sign in as them.
    // The RPC would refuse it too — but only after `createUser` had minted the account.
    callerRole = "manager";
    const res = await invite("owner");
    expect(res).toEqual({ ok: false, error: "Only the owner can add another owner." });
    expect(createUserCalls).toBe(0);
    expect(teamCalls()).toEqual([]);
  });

  it("still lets the OWNER add an owner — the ceiling is not a blanket ban", async () => {
    const res = await invite("owner");
    expect(res).toEqual({ ok: true });
    expect(teamCalls()[0]?.[1]?.p_role).toBe("owner");
  });

  it("refuses a SERVER outright — the floor still exists under the ceiling", async () => {
    callerRole = "server";
    const res = await invite("server");
    expect(res).toEqual({ ok: false, error: "That needs a manager — ask one to step in." });
    expect(createUserCalls).toBe(0);
  });

  it("reports an OUTAGE rather than a refusal when the session is unreadable", async () => {
    // W10b — "you may not" is a verdict about the caller; an unreachable platform is not.
    authKind = "unavailable";
    expect(await invite("server")).toEqual({ ok: false, error: "outage" });
  });

  it("refuses an invite by a caller revoked BEFORE the pre-flight, with no account made", async () => {
    callerRole = "manager";
    callerRow = { user_id: CALLER_STAFF, role: "manager", active: false };
    const res = await invite("server");
    expect(res).toEqual({ ok: false, error: "That needs a manager — ask one to step in." });
    expect(createUserCalls).toBe(0);
  });

  it("refuses an OWNER demoted to manager mid-request from minting another owner (pre-flight)", async () => {
    // Codex P1 on #278's merge head: the pre-flight decides on the REFRESHED role, never the session's.
    callerRole = "owner";
    callerRow = { user_id: CALLER_STAFF, role: "manager", active: true };
    const res = await invite("owner");
    expect(res).toEqual({ ok: false, error: "Only the owner can add another owner." });
    expect(createUserCalls).toBe(0);
  });

  it("REFUSES an unreadable caller row — and names the outage, not a missing permission (M209)", async () => {
    callerRole = "manager";
    callerRowUnreadable = true;
    const res = await invite("server");
    expect(res).toEqual({
      ok: false,
      error: "We couldn’t confirm your access just now — try again in a moment.",
    });
    expect(createUserCalls).toBe(0);
  });

  describe("the RPC's own refusal (a revocation that landed after the pre-flight) deletes the account", () => {
    const cases: [unknown, string][] = [
      [{ status: "not_authorized" }, "That needs a manager — ask one to step in."],
      [{ status: "ceiling" }, "Only the owner can add another owner."],
      // ONE sentence with every other create failure — the invite is no account-existence oracle.
      [{ status: "exists" }, "Couldn’t create that account. Check the email and try again."],
      [{ status: "granted" }, "Couldn’t save the staff role. Try again."],
      [null, "Couldn’t save the staff role. Try again."],
    ];
    for (const [verdict, error] of cases) {
      it(`${JSON.stringify(verdict)} → "${error}"`, async () => {
        callerRole = "manager";
        provisionVerdict = verdict;
        const res = await invite("server");
        expect(res).toEqual({ ok: false, error });
        expect(deletedUsers).toEqual(["new-uid"]);
      });
    }
    it("an RPC error is a failed save, and deletes the account too", async () => {
      rpcError = true;
      const res = await invite("server");
      expect(res).toEqual({ ok: false, error: "Couldn’t save the staff role. Try again." });
      expect(deletedUsers).toEqual(["new-uid"]);
    });
  });
});

describe("setStaffActive — one RPC call decides and writes", () => {
  it("asks about the caller's ROW, the member, the role it READ, and the flag", async () => {
    callerRole = "manager";
    const res = await setStaffActive({ userId: TARGET, active: false });
    expect(res).toEqual({ ok: true });
    expect(teamCalls()).toEqual([
      [
        "mms_staff_set",
        { p_caller: CALLER_STAFF, p_target: TARGET, p_seen_role: "server", p_active: false },
      ],
    ]);
  });

  it("records the change it made as the secondary analytics event", async () => {
    await setStaffActive({ userId: TARGET, active: false });
    expect(analytics).toEqual(["staff_deactivated"]);
  });

  it("tells the address the RPC switched off, not the one read a moment earlier", async () => {
    setVerdict = { status: "ok", email: "current@example.com" };
    await setStaffActive({ userId: TARGET, active: false });
    expect(deactivationEmails).toEqual(["current@example.com"]);
  });

  it("sends no heads-up on a reactivation", async () => {
    await setStaffActive({ userId: TARGET, active: true });
    expect(deactivationEmails).toEqual([]);
  });

  it("a no-op is success, and announces nothing", async () => {
    setVerdict = { status: "noop", role: "server", active: false };
    const res = await setStaffActive({ userId: TARGET, active: false });
    expect(res).toEqual({ ok: true });
    expect(deactivationEmails).toEqual([]);
    expect(analytics).toEqual([]);
  });

  const refusals: [unknown, string][] = [
    [{ status: "ceiling" }, "Only the owner can change an owner’s account."],
    [{ status: "changed", role: "owner" }, "That member just changed — reload and try again."],
    [{ status: "not_authorized" }, "That needs a manager — ask one to step in."],
    [{ status: "self" }, "You can’t deactivate your own account."],
    [{ status: "not_found" }, "No such staff member."],
    [{ status: "deactivated" }, "Couldn’t update that member. Try again."],
    [[], "Couldn’t update that member. Try again."],
  ];
  for (const [verdict, error] of refusals) {
    it(`the database's ${JSON.stringify(verdict)} → "${error}", and no heads-up`, async () => {
      setVerdict = verdict;
      const res = await setStaffActive({ userId: TARGET, active: false });
      expect(res).toEqual({ ok: false, error });
      expect(deactivationEmails).toEqual([]);
    });
  }

  it("an RPC error is a failure, never ok", async () => {
    rpcError = true;
    const res = await setStaffActive({ userId: TARGET, active: false });
    expect(res).toEqual({ ok: false, error: "Couldn’t update that member. Try again." });
  });

  it("refuses YOUR OWN account by the session's e-mail before asking — the arm only the session knows", async () => {
    // The database refuses self by ROW; a session whose e-mail names this row while its uid does not
    // (an allowlisted Google sign-in) is caught here or nowhere.
    targetRow = { user_id: OTHER, email: "Caller@Example.com", active: true, role: "manager" };
    const res = await setStaffActive({ userId: OTHER, active: false });
    expect(res).toEqual({ ok: false, error: "You can’t deactivate your own account." });
    expect(teamCalls()).toEqual([]);
  });

  it("refuses a member who is not there at all, without asking", async () => {
    const res = await setStaffActive({ userId: ABSENT, active: false });
    expect(res).toEqual({ ok: false, error: "No such staff member." });
    expect(teamCalls()).toEqual([]);
  });

  it("reports an OUTAGE when the member's row is unreadable, never 'no such member'", async () => {
    targetRowUnreadable = true;
    const res = await setStaffActive({ userId: TARGET, active: false });
    expect(res).toEqual({ ok: false, error: "outage" });
    expect(teamCalls()).toEqual([]);
  });
});

describe("setStaffRole — one RPC call decides and writes", () => {
  it("asks about the caller's ROW, the member, the role it READ, and the role requested", async () => {
    const res = await setStaffRole({ userId: TARGET, role: "manager" });
    expect(res).toEqual({ ok: true });
    expect(teamCalls()).toEqual([
      [
        "mms_staff_set",
        { p_caller: CALLER_STAFF, p_target: TARGET, p_seen_role: "server", p_role: "manager" },
      ],
    ]);
  });

  const refusals: [unknown, string][] = [
    [{ status: "ceiling" }, "Only the owner can change an owner’s role."],
    [{ status: "changed", role: "manager" }, "That role just changed — reload and try again."],
    [{ status: "not_authorized" }, "That needs a manager — ask one to step in."],
    [{ status: "self" }, "You can’t change your own role."],
    [{ status: "not_found" }, "No such staff member."],
    [{ email: "x@example.com" }, "Couldn’t update that member. Try again."],
  ];
  for (const [verdict, error] of refusals) {
    it(`the database's ${JSON.stringify(verdict)} → "${error}"`, async () => {
      setVerdict = verdict;
      expect(await setStaffRole({ userId: TARGET, role: "manager" })).toEqual({ ok: false, error });
    });
  }

  it("REFUSES changing your OWN role, matched by e-mail as well as uid, before asking", async () => {
    // A manager promoting themselves is the shortest path of all; and the sole owner demoting
    // themselves leaves the place with no owner and nobody able to restore one.
    callerRole = "manager";
    targetRow = { user_id: OTHER, email: "caller@example.com", active: true, role: "manager" };
    const res = await setStaffRole({ userId: OTHER, role: "owner" });
    expect(res).toEqual({ ok: false, error: "You can’t change your own role." });
    expect(teamCalls()).toEqual([]);
  });

  it("treats a no-op change as success without asking", async () => {
    const res = await setStaffRole({ userId: TARGET, role: "server" });
    expect(res).toEqual({ ok: true });
    expect(teamCalls()).toEqual([]);
  });

  it("refuses a member who is not there at all", async () => {
    const res = await setStaffRole({ userId: ABSENT, role: "manager" });
    expect(res).toEqual({ ok: false, error: "No such staff member." });
  });

  it("reports an OUTAGE when the session is unreadable", async () => {
    authKind = "unavailable";
    expect(await setStaffRole({ userId: TARGET, role: "manager" })).toEqual({
      ok: false,
      error: "outage",
    });
  });

  it("refuses a server at the door, without asking", async () => {
    callerRole = "server";
    const res = await setStaffRole({ userId: TARGET, role: "manager" });
    expect(res).toEqual({ ok: false, error: "That needs a manager — ask one to step in." });
    expect(teamCalls()).toEqual([]);
  });
});
