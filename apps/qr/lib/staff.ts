import "server-only";
import { cookies } from "next/headers";
import { serverClient, serviceClient } from "@mms/db/server";
import { AuthzError } from "./authz";

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
 * The auth state behind a /staff request, distinguished three ways so the shells can RECOVER, not
 * loop: `anon` (no/anon session → go sign in), `not_staff` (a real signed-in account with no active
 * staff row → show "not a staff account" + sign-out, never bounce them back into the login silently),
 * and `staff` (the verified identity). Identity is read from the SSR cookie session and VERIFIED by
 * getUser() (not a client claim); the role comes from a service-role lookup so RLS can't hide the row.
 */
export type StaffAuth =
  | { kind: "anon" }
  | { kind: "not_staff" }
  | { kind: "staff"; caller: StaffCaller };

export async function getStaffAuth(): Promise<StaffAuth> {
  const supa = serverClient(await cookies());
  const {
    data: { user },
  } = await supa.auth.getUser();
  // Anonymous diners have a uid too — treat them as `anon` here (they belong on the diner side).
  if (!user || user.is_anonymous) return { kind: "anon" };
  const email = user.email?.toLowerCase() ?? null;

  // Resolve the staff row by uid first; fall back to the EMAIL allowlist — Google OAuth / magic-link
  // can mint a fresh uid that isn't the one provisionStaff pre-created, but the verified email still
  // matches the provisioned row (mirrors the is_staff RLS: user_id OR email). Service-role read so the
  // authorization decision is ours, not RLS-hidden.
  const db = serviceClient();
  let row: { role: string; display_name: string; active: boolean } | null = null;
  const byUid = await db
    .from("staff")
    .select("role,display_name,active")
    .eq("user_id", user.id)
    .maybeSingle();
  row = byUid.data;
  if ((!row || !row.active) && email) {
    const byEmail = await db
      .from("staff")
      .select("role,display_name,active")
      .eq("email", email)
      .maybeSingle();
    row = byEmail.data ?? row;
  }
  if (!row || !row.active) return { kind: "not_staff" };
  return {
    kind: "staff",
    caller: { uid: user.id, role: row.role as StaffRole, displayName: row.display_name, email },
  };
}

/** The verified staff identity, or `null`. Convenience over getStaffAuth for callers that don't need
 *  to tell `anon` from `not_staff` (the Team view, requireStaff). */
export async function getStaffCaller(): Promise<StaffCaller | null> {
  const auth = await getStaffAuth();
  return auth.kind === "staff" ? auth.caller : null;
}

/**
 * Throwing guard for Server Actions (public POST endpoints → IDOR by default): the caller must be an
 * active staff member, optionally at/above `minRole`. 401 when not signed in / not staff (distinct
 * from a diner's 401 path); 403 when the role is insufficient (e.g. a server hitting an owner action).
 */
export async function requireStaff(minRole: StaffRole = "server"): Promise<StaffCaller> {
  const caller = await getStaffCaller();
  if (!caller) throw new AuthzError("Staff sign-in required", 401);
  if (!roleAtLeast(caller.role, minRole)) throw new AuthzError("Insufficient role", 403);
  return caller;
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
  const { data } = await serviceClient()
    .from("staff")
    .select("user_id,role,display_name,email,active,created_at")
    .limit(500);
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
