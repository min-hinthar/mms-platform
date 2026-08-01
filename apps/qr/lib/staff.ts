import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { serverClient, serviceClient } from "@mms/db/server";
import { AuthzError, isTransportFailure } from "./authz";
import { isConsoleLocked } from "./staff-lock";
import { STAFF_WRITE_OUTAGE } from "./staff-outage";

// W10b — the shared write-outage sentence lives in ./staff-outage (a plain module) so client
// reason-switches render the SAME copy; re-exported here for the server action files.
export { STAFF_WRITE_OUTAGE };

/**
 * Staff identity helpers (S1.1a) — the server-side mirror of the `is_staff` / `is_staff_at_least`
 * RLS functions (supabase/migrations/20260621100000_staff_identity.sql). Staff are REAL accounts
 * (magic-link / email-OTP), distinct from anonymous diners: a stable, non-anonymous auth.uid() with
 * an ACTIVE row in `staff`. The staff row IS the authority — never a client claim — so an anon diner
 * (uid but no staff row) is excluded for free, and a deactivated member (active=false) loses access
 * immediately without deleting the audit trail. Mutations live in ./staff-actions ("use server").
 */

export type StaffRole = "server" | "manager" | "owner";
export type StaffCaller = {
  uid: string;
  /**
   * The `staff.user_id` of the RESOLVED row — the row's PK, which can DIFFER from `uid` when the row
   * was matched by the email allowlist (a Google/magic-link session mints a fresh uid the provisioned
   * row doesn't carry). Anything keyed on the staff row itself (the PIN, S1.1b) must use THIS, not `uid`.
   */
  staffId: string;
  role: StaffRole;
  displayName: string;
  /** The session's verified email (lower-cased), used for the email-allowlist self-checks. */
  email: string | null;
};

/** Role floor, mirroring the SQL CASE in is_staff_at_least (owner ≥ manager ≥ server). */
const RANK: Record<StaffRole, number> = { server: 1, manager: 2, owner: 3 };
export function roleAtLeast(role: StaffRole, min: StaffRole): boolean {
  return RANK[role] >= RANK[min];
}

/**
 * The auth state behind a /staff request, distinguished FOUR ways so the shells can RECOVER, not
 * loop: `anon` (no/anon session → go sign in), `not_staff` (a real signed-in account with no active
 * staff row → show "not a staff account" + sign-out, never bounce them back into the login silently),
 * `staff` (the verified identity), and `unavailable` (W10b — auth/DB transport failed, so the answer
 * is UNKNOWABLE: never a verdict about the person; boards keep their last-known snapshot and pages
 * render the outage shell instead of a login redirect that destroys mid-service state). Identity is
 * read from the SSR cookie session and VERIFIED by getUser() (not a client claim); the role comes
 * from a service-role lookup so RLS can't hide the row.
 */
export type StaffAuth =
  | { kind: "anon" }
  | { kind: "not_staff" }
  | { kind: "staff"; caller: StaffCaller }
  | { kind: "unavailable" };

export async function getStaffAuth(): Promise<StaffAuth> {
  const supa = serverClient(await cookies());
  const {
    data: { user },
    error: userError,
  } = await supa.auth.getUser();
  // W10b — a transport failure is not "signed out": during the paused-project outage this collapsed
  // to `anon`, and every staff surface redirected to login mid-service (audit M32, HIGH). A
  // non-transport error (missing/invalid session) still means "go sign in".
  if (userError && isTransportFailure(userError)) return { kind: "unavailable" };
  // Anonymous diners have a uid too — treat them as `anon` here (they belong on the diner side).
  if (!user || user.is_anonymous) return { kind: "anon" };
  // Only trust the email for the allowlist if it's CONFIRMED (email_confirmed_at is set for OTP /
  // magic-link / Google — all verify the mailbox). This blocks the "unconfirmed email == staff email"
  // path: were email/password signup ever enabled without confirmation, a session could assert a staff
  // address the holder doesn't own — the verified gate denies it. The uid match below is inherently
  // safe (provisionStaff creates the user with email_confirm:true).
  const email = user.email_confirmed_at ? (user.email?.toLowerCase() ?? null) : null;

  // Resolve the staff row by uid first; fall back to the EMAIL allowlist — Google OAuth / magic-link
  // can mint a fresh uid that isn't the one provisionStaff pre-created, but the verified email still
  // matches the provisioned row (mirrors the is_staff RLS: user_id OR email). Service-role read so the
  // authorization decision is ours, not RLS-hidden.
  const db = serviceClient();
  let row: { user_id: string; role: string; display_name: string; active: boolean } | null = null;
  const byUid = await db
    .from("staff")
    .select("user_id,role,display_name,active")
    .eq("user_id", user.id)
    .maybeSingle();
  // W10b — an UNREAD row is not a verdict: any read error (transport or otherwise) means we cannot
  // know whether this person is staff, and answering `not_staff` bounces a working server to the
  // denied-login screen mid-service. maybeSingle() never errors on zero rows, so `error` here is
  // always a real failure, not "no such staff".
  if (byUid.error) return { kind: "unavailable" };
  row = byUid.data;
  // Mirror the SQL `staff_session_email_match` gate (S1-audit B1): the email-allowlist FALLBACK only
  // trusts a provider-verified OAuth identity (Google), NEVER a public email/password signup — GoTrue
  // auto-confirms those when confirmations are off, so `email_confirmed_at` alone is spoofable. Keeps
  // TS ↔ RLS in sync (else the app could admit a row RLS denies). uid-matched staff (provisioned / OTP
  // into the pre-created user / bootstrapped owner) never reach this branch, so they're unaffected.
  const providerVerified = !!user.app_metadata?.provider && user.app_metadata.provider !== "email";
  if ((!row || !row.active) && email && providerVerified) {
    const byEmail = await db
      .from("staff")
      .select("user_id,role,display_name,active")
      .eq("email", email)
      .maybeSingle();
    // Same rule as byUid: a failed allowlist read can't rule the person OUT — unknowable, not a "no".
    if (byEmail.error) return { kind: "unavailable" };
    row = byEmail.data ?? row;
  }
  if (!row || !row.active) return { kind: "not_staff" };
  return {
    kind: "staff",
    caller: {
      uid: user.id,
      staffId: row.user_id, // the row PK — may differ from uid (email-matched); PIN keys on this
      role: row.role as StaffRole,
      displayName: row.display_name,
      email,
    },
  };
}

/**
 * Throwing guard for Server Actions (public POST endpoints → IDOR by default): the caller must be an
 * active staff member, optionally at/above `minRole`. 401 when not signed in / not staff (distinct
 * from a diner's 401 path); 403 when the role is insufficient (e.g. a server hitting an owner
 * action); 503 `code:"unavailable"` when the answer is UNKNOWABLE (W10b) — catch arms must
 * discriminate on `code`, never collapse it into "sign-in required".
 */
export async function requireStaff(minRole: StaffRole = "server"): Promise<StaffCaller> {
  const auth = await getStaffAuth();
  if (auth.kind === "unavailable")
    throw new AuthzError("We can’t reach the ordering system right now", 503, "unavailable");
  if (auth.kind !== "staff") throw new AuthzError("Staff sign-in required", 401);
  if (!roleAtLeast(auth.caller.role, minRole)) throw new AuthzError("Insufficient role", 403);
  return auth.caller;
}

/**
 * W10b — the mutation-arm gate that keeps the WHY. The 24 `requireStaff().catch(() => null)` arms
 * all collapsed every failure — outage included — into "Staff sign-in required.", telling a
 * signed-in server mid-outage to go sign in (a loop that ends in a destroyed board). Arms do:
 *
 *   const gate = await staffGate();
 *   if (!gate.ok) return { ok: false, error: gate.error };
 *
 * `error` is ready-to-render copy: the outage truth, the sign-in ask, or the role floor — each an
 * honest, distinct sentence.
 */
export async function staffGate(
  minRole: StaffRole = "server",
  // The outage sentence defaults to the ORDER-flow one ("keep it on paper"), which is the right
  // advice for a cart/table/kitchen write but nonsense for a PIN or a device lock — those callers
  // pass their own (pre-merge review).
  outageCopy: string = STAFF_WRITE_OUTAGE,
): Promise<{ ok: true; caller: StaffCaller } | { ok: false; error: string }> {
  const auth = await getStaffAuth();
  if (auth.kind === "unavailable") return { ok: false, error: outageCopy };
  if (auth.kind !== "staff") return { ok: false, error: "Staff sign-in required." };
  if (!roleAtLeast(auth.caller.role, minRole))
    return {
      ok: false,
      error:
        minRole === "owner"
          ? "That needs the owner — ask them to step in."
          : "That needs a manager — ask one to step in.",
    };
  return { ok: true, caller: auth.caller };
}

/**
 * Redirecting gate for /staff PAGES (W1·Q11): the ONE canonical auth sequence — verified staff row →
 * console lock → optional role floor — replacing the hand-copied triplet on every staff page (a
 * drifted copy is exactly how a page silently ships ungated). Server Components only; Server Actions
 * keep the throwing `requireStaff`. Returns the resolved caller for the page header/UI — or `null`
 * (W10b) when the platform is unreachable: the page renders `StaffOutageShell` in place, KEEPING the
 * URL, so recovery is one tap of retry instead of a login round-trip that loses where you were. The
 * lock check is a pure cookie read (staff-lock.ts) — it cannot fail during an outage, so its
 * position after the unavailable return never masks one.
 */
export async function requireStaffPage(minRole: StaffRole = "server"): Promise<StaffCaller | null> {
  const auth = await getStaffAuth();
  if (auth.kind === "unavailable") return null;
  if (auth.kind === "anon") redirect("/staff/login");
  if (auth.kind === "not_staff") redirect("/staff/login?denied=1");
  if (await isConsoleLocked()) redirect("/staff/lock");
  if (!roleAtLeast(auth.caller.role, minRole)) redirect("/staff");
  return auth.caller;
}

export type StaffRow = {
  userId: string;
  role: StaffRole;
  displayName: string;
  email: string | null;
  active: boolean;
  createdAt: string;
};

/**
 * Owner-gated roster read (the Team view server component). Ordered by role (owner→server) then
 * oldest first, so the people who run the place sit at the top. Owner-gating is enforced here AND by
 * the staff_read_self RLS policy — defense in depth.
 */
export async function listStaff(): Promise<StaffRow[]> {
  await requireStaff("owner");
  // The roster is small by design (a family-run teahouse has a handful of staff); the explicit cap
  // keeps the query bounded at the DB regardless, per the project's "bound every query" standard.
  const { data, error } = await serviceClient()
    .from("staff")
    .select("user_id,role,display_name,email,active,created_at")
    .limit(500);
  // W10b — a failed read must not render as an EMPTY roster (the owner would read "no staff" as
  // real). Throw to the staff error boundary, which owns the honest outage copy.
  if (error)
    throw new AuthzError("We can’t reach the ordering system right now", 503, "unavailable");
  const rows = (data ?? []).map((r) => ({
    userId: r.user_id,
    role: r.role as StaffRole,
    displayName: r.display_name,
    email: r.email,
    active: r.active,
    createdAt: r.created_at,
  }));
  return rows.sort((a, b) => RANK[b.role] - RANK[a.role] || a.createdAt.localeCompare(b.createdAt));
}
