"use server";
import { revalidatePath } from "next/cache";
import { serviceClient } from "@mms/db/server";
import { provisionStaffInput, setStaffActiveInput } from "@mms/db/schemas";
import { requireStaff } from "./staff";

/**
 * Owner-only staff provisioning (S1.1a). Server Actions are public POST endpoints (IDOR by default),
 * so every action re-checks the caller is an OWNER (requireStaff('owner')) before touching auth or
 * the staff table — the client UI gating is cosmetic, this is the authority. Pricing/money paths are
 * untouched; this manages who may later read the floor + act on a table.
 *
 * Bootstrap note: the FIRST owner is created out-of-band (Supabase dashboard auth user + a one-time
 * `insert into staff … role='owner'`) — there is deliberately NO self-serve "claim the first owner"
 * code path, since that would let any visitor seize ownership before setup. See docs/HANDOFF.md.
 */

export type StaffActionResult = { ok: true } | { ok: false; error: string };

/**
 * An owner provisions a staff account: the email is the magic-link / OTP login identity, created
 * here (no password, pre-confirmed) alongside the `staff` row. Best-effort atomic — if the staff-row
 * insert fails, the orphan auth user is deleted so a half-provisioned account can't linger and OTP in.
 */
export async function provisionStaff(raw: unknown): Promise<StaffActionResult> {
  const parsed = provisionStaffInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Enter a valid email, name, and role." };

  // Deliberate swallow: requireStaff throws AuthzError 401 (not staff) vs 403 (not owner); the Team UI
  // is itself owner-gated, so a caller reaching this action who isn't an owner is an edge (a direct
  // POST) and "Owners only." is the right answer for both — collapse them.
  const caller = await requireStaff("owner").catch(() => null);
  if (!caller) return { ok: false, error: "Owners only." };

  const db = serviceClient();
  // Email-only identity, pre-confirmed: no password is set — staff sign in with a one-time code.
  // Two-system write (auth user + staff row) isn't transactional: the rowErr branch below rolls back
  // the orphan auth user, but a process crash BETWEEN the two leaves an orphan auth user with no staff
  // row — harmless (it can't sign in to anything staff-gated) and re-provisioning surfaces "already has
  // an account". Acceptable for an owner-only admin path; the bootstrap doc notes the manual cleanup.
  const { data: created, error: createErr } = await db.auth.admin.createUser({
    email: parsed.data.email,
    email_confirm: true,
  });
  if (createErr || !created?.user) {
    const msg = createErr?.message ?? "";
    if (/registered|already|exists/i.test(msg))
      return { ok: false, error: "That email already has an account." };
    return { ok: false, error: "Couldn’t create that account. Try again." };
  }

  const { error: rowErr } = await db.from("staff").insert({
    user_id: created.user.id,
    role: parsed.data.role,
    display_name: parsed.data.displayName,
  });
  if (rowErr) {
    // Roll back the orphan auth user so a failed provision leaves nothing behind.
    await db.auth.admin.deleteUser(created.user.id).catch(() => {});
    return { ok: false, error: "Couldn’t save the staff role. Try again." };
  }

  revalidatePath("/staff/team");
  return { ok: true };
}

/**
 * An owner offboards (or reinstates) a staff member by flipping `active` — the row is kept so the
 * audit trail (and any future void/refund history, S2) stays intact. Guards against an owner
 * deactivating their OWN account, so the person at the keyboard can't lock themselves out mid-shift.
 */
export async function setStaffActive(raw: unknown): Promise<StaffActionResult> {
  const parsed = setStaffActiveInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  // Deliberate swallow of the 401/403 distinction (same rationale as provisionStaff): owner-gated UI,
  // so "Owners only." covers both. Note: two owners can deactivate EACH OTHER down to one (the last is
  // self-protected below) — no full lockout, but recovery from an accidental over-deactivation is the
  // out-of-band `update public.staff set active=true …` documented in the bootstrap notes.
  const caller = await requireStaff("owner").catch(() => null);
  if (!caller) return { ok: false, error: "Owners only." };
  if (parsed.data.userId === caller.uid)
    return { ok: false, error: "You can’t deactivate your own account." };

  const { error } = await serviceClient()
    .from("staff")
    .update({ active: parsed.data.active, updated_at: new Date().toISOString() })
    .eq("user_id", parsed.data.userId);
  if (error) return { ok: false, error: "Couldn’t update that member. Try again." };

  revalidatePath("/staff/team");
  return { ok: true };
}
