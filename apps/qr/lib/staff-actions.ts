"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { serviceClient } from "@mms/db/server";
import { provisionStaffInput, setStaffActiveInput } from "@mms/db/schemas";
import { getStaffAuth, roleAtLeast, STAFF_WRITE_OUTAGE } from "./staff";
import { sendStaffInviteEmail, sendStaffDeactivatedEmail } from "./email";
import { getPostHogClient } from "./posthog-server";

// Owner provisioning is rare + bursty (onboarding a few at once); 20/hour per owner bounds an
// email-enumeration probe (S1-audit S7) without blocking legitimate team setup.
const PROVISION_MAX = 20;
const PROVISION_WINDOW_S = 3600;

/** Best-effort audit of an owner staff-management mutation (parity with clear/merge/settle telemetry —
 *  S1-audit S7). Decoupled via after(); never fails the action on a capture error. */
function auditStaffAction(
  event: string,
  byStaffId: string,
  props: Record<string, string | number | boolean>,
) {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  after(async () => {
    try {
      const ph = getPostHogClient();
      ph.capture({ distinctId: `staff:${byStaffId}`, event, properties: props });
      await ph.flush();
    } catch {
      /* analytics best-effort */
    }
  });
}

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

  // Deliberate collapse of anon/not-staff/not-owner into "Owners only." (the Team UI is itself
  // owner-gated, so a non-owner reaching this is a direct POST edge). W10b: the OUTAGE case is the
  // one that must NOT collapse — it's not a verdict about the caller.
  const auth = await getStaffAuth();
  if (auth.kind === "unavailable") return { ok: false, error: STAFF_WRITE_OUTAGE };
  const caller =
    auth.kind === "staff" && roleAtLeast(auth.caller.role, "owner") ? auth.caller : null;
  if (!caller) return { ok: false, error: "Owners only." };

  const db = serviceClient();
  // Coarse per-owner rate limit (S1-audit S7) — bounds repeated createUser probes. Fail-open on an RPC
  // error (this is an owner-only path + defense-in-depth; don't block legit onboarding on a hiccup), but
  // a hard `false` (over the cap) refuses without leaking why.
  const { data: allowed, error: rlErr } = await db.rpc("mms_rate_limit", {
    p_bucket: "staff_provision",
    p_key: caller.staffId,
    p_max: PROVISION_MAX,
    p_window_seconds: PROVISION_WINDOW_S,
  });
  if (rlErr) console.error("[staff-actions] rate-limit check failed (allowing)", rlErr.message);
  if (allowed === false)
    return { ok: false, error: "Too many attempts just now — wait a minute and try again." };

  // Email-only identity, pre-confirmed: no password is set — staff sign in with a one-time code.
  // Two-system write (auth user + staff row) isn't transactional: the rowErr branch below rolls back
  // the orphan auth user, but a process crash BETWEEN the two leaves an orphan auth user with no staff
  // row — harmless (it can't sign in to anything staff-gated). Re-provisioning that email then fails on
  // the generic message below; the bootstrap doc notes the manual cleanup.
  const { data: created, error: createErr } = await db.auth.admin.createUser({
    email: parsed.data.email,
    email_confirm: true,
  });
  if (createErr || !created?.user) {
    // GENERIC message (S1-audit S7): do NOT reveal whether the email already exists — that's an account-
    // existence oracle (even owner-only, it's needless disclosure). One message for every create failure.
    return { ok: false, error: "Couldn’t create that account. Check the email and try again." };
  }

  const { error: rowErr } = await db.from("staff").insert({
    user_id: created.user.id,
    email: parsed.data.email, // the allowlist key — matches a Google/magic-link sign-in by email
    role: parsed.data.role,
    display_name: parsed.data.displayName,
  });
  if (rowErr) {
    // Roll back the orphan auth user so a failed provision leaves nothing behind.
    await db.auth.admin.deleteUser(created.user.id).catch(() => {});
    return { ok: false, error: "Couldn’t save the staff role. Try again." };
  }

  auditStaffAction("staff_provisioned", caller.staffId, {
    role: parsed.data.role,
    new_user_id: created.user.id,
  });

  // Welcome the new staff member (best-effort, decoupled): the account is already saved, so an email
  // outage must not fail provisioning — after() runs it post-response and sendStaffInviteEmail never throws.
  after(() =>
    sendStaffInviteEmail({
      to: parsed.data.email,
      displayName: parsed.data.displayName,
      role: parsed.data.role,
    }),
  );
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

  // Deliberate collapse of the 401/403 distinction (same rationale as provisionStaff); outage stays
  // distinct (W10b). Note: two owners can deactivate EACH OTHER down to one (the last is
  // self-protected below) — no full lockout, but recovery from an accidental over-deactivation is the
  // out-of-band `update public.staff set active=true …` documented in the bootstrap notes.
  const auth = await getStaffAuth();
  if (auth.kind === "unavailable") return { ok: false, error: STAFF_WRITE_OUTAGE };
  const caller =
    auth.kind === "staff" && roleAtLeast(auth.caller.role, "owner") ? auth.caller : null;
  if (!caller) return { ok: false, error: "Owners only." };

  const db = serviceClient();
  // Fetch the target row first: the self-check must compare by EMAIL (and uid), because a Google/
  // magic-link owner's session uid can differ from the uid stamped on their staff row — comparing
  // userId alone would miss "this is me" and let an owner lock themselves out.
  const { data: target, error: targetError } = await db
    .from("staff")
    .select("user_id,email,active")
    .eq("user_id", parsed.data.userId)
    .maybeSingle();
  // W10b — an unread row is not "no such staff member"; and the self-check below can't run blind.
  if (targetError) return { ok: false, error: STAFF_WRITE_OUTAGE };
  if (!target) return { ok: false, error: "No such staff member." };
  const isSelf =
    target.user_id === caller.uid ||
    (!!target.email && !!caller.email && target.email.toLowerCase() === caller.email);
  if (isSelf) return { ok: false, error: "You can’t deactivate your own account." };

  const { error } = await db
    .from("staff")
    .update({ active: parsed.data.active, updated_at: new Date().toISOString() })
    .eq("user_id", parsed.data.userId);
  if (error) return { ok: false, error: "Couldn’t update that member. Try again." };

  auditStaffAction(parsed.data.active ? "staff_reactivated" : "staff_deactivated", caller.staffId, {
    target_user_id: parsed.data.userId,
  });

  // On DEACTIVATION only, send an honest heads-up (best-effort, decoupled) to the row's stored email.
  if (!parsed.data.active && target.email) {
    const to = target.email;
    after(() => sendStaffDeactivatedEmail({ to }));
  }
  revalidatePath("/staff/team");
  return { ok: true };
}
