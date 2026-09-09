"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { serviceClient } from "@mms/db/server";
import { provisionStaffInput, setStaffActiveInput, setStaffRoleInput } from "@mms/db/schemas";
import { canActOn, getStaffAuth, roleAtLeast, STAFF_WRITE_OUTAGE } from "./staff";
import type { StaffRole } from "./staff";
import { sendStaffInviteEmail, sendStaffDeactivatedEmail } from "./email";
import { getPostHogClient } from "./posthog-server";

// Provisioning is rare + bursty (onboarding a few at once); 20/hour per CALLER bounds an
// email-enumeration probe (S1-audit S7) without blocking legitimate team setup.
const PROVISION_MAX = 20;
const PROVISION_WINDOW_S = 3600;

/** A6 — ONE floor-refusal sentence for all three team actions. Named once because it is the string a
 *  server sees when they POST at a screen they cannot open, and three hand-copied versions is how
 *  one of them ends up still saying "Owners only." after the floor moved. */
const MANAGERS_ONLY = "That needs a manager — ask one to step in.";

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
 * Staff provisioning (S1.1a), opened to MANAGERS by A6. Server Actions are public POST endpoints
 * (IDOR by default), so every action re-resolves the caller from the session before touching auth or
 * the staff table — the client UI gating is cosmetic, this is the authority. Pricing/money paths are
 * untouched; this manages who may later read the floor + act on a table.
 *
 * ⚠️ A6 REPLACED A ROLE FLOOR WITH A ROLE CEILING, and the difference is the whole safety argument.
 * The floor (`manager`) says who may open the door; the ceiling (`canActOn`) says how far in they
 * may reach — nobody creates, promotes to, demotes from, or deactivates a role above their own, so
 * a manager can neither mint an owner nor unseat one, and cannot promote themselves. Both halves
 * live in TypeScript ALONE: `staff` carries exactly one RLS policy, a SELECT (`staff_read_self`),
 * and these writes go through the service-role client, so a missing check here is not caught
 * anywhere downstream. Every refusal below is the last line, not the first.
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

  // Deliberate collapse of anon/not-staff/below-the-floor into one sentence (the Team UI is itself
  // gated, so anyone reaching this below the floor is a direct POST edge). W10b: the OUTAGE case is
  // the one that must NOT collapse — it's not a verdict about the caller.
  const auth = await getStaffAuth();
  if (auth.kind === "unavailable") return { ok: false, error: STAFF_WRITE_OUTAGE };
  const caller =
    auth.kind === "staff" && roleAtLeast(auth.caller.role, "manager") ? auth.caller : null;
  if (!caller) return { ok: false, error: MANAGERS_ONLY };

  // A6 — the ceiling, checked on the REQUESTED role. Without it the lowered floor would hand every
  // manager the `owner` option in the same form, i.e. self-promotion in two taps: invite an owner at
  // an address you control, sign in as them. A distinct sentence from the floor refusal because the
  // caller IS allowed to be here — it is the role they picked that is out of reach.
  if (!canActOn(caller.role, parsed.data.role))
    return { ok: false, error: "Only the owner can add another owner." };

  const db = serviceClient();
  // Coarse per-CALLER rate limit (S1-audit S7) — bounds repeated createUser probes. ⚠️ A6 made this
  // a manager path, so the bucket is keyed per manager and the fleet-wide ceiling on the
  // email-existence oracle now scales with the number of managers rather than with one owner. Still
  // fail-open on an RPC error (defense-in-depth, and a hiccup must not block a real hire), and a
  // hard `false` (over the cap) refuses without leaking why. The durable audit this leans on is
  // OPEN-ITEMS A6b — today the only record is a best-effort PostHog event.
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
 * A manager or owner offboards (or reinstates) a staff member by flipping `active` — the row is kept
 * so the audit trail (and any future void/refund history, S2) stays intact. Guards against
 * deactivating your OWN account, so the person at the keyboard can't lock themselves out mid-shift,
 * and against reaching a role above your own (A6).
 *
 * ⚠️ REINSTATEMENT RUNS THROUGH THE SAME ACTION AS OFFBOARDING, so a manager can switch a member
 * back on that another manager switched off. Within the ceiling that is intended — the rung manages
 * itself — but an OWNER's offboarding of a non-owner is reversible by a manager, and the only record
 * of either is a best-effort analytics event (OPEN-ITEMS M205, which is the durable audit row this
 * wants and needs a prod migration). Named here because the ceiling reasons about ROLES, and this is
 * the one authority question it does not answer.
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
    auth.kind === "staff" && roleAtLeast(auth.caller.role, "manager") ? auth.caller : null;
  if (!caller) return { ok: false, error: MANAGERS_ONLY };

  const db = serviceClient();
  // Fetch the target row first: the self-check must compare by EMAIL (and uid), because a Google/
  // magic-link owner's session uid can differ from the uid stamped on their staff row — comparing
  // userId alone would miss "this is me" and let an owner lock themselves out.
  const { data: target, error: targetError } = await db
    .from("staff")
    .select("user_id,email,active,role")
    .eq("user_id", parsed.data.userId)
    .maybeSingle();
  // W10b — an unread row is not "no such staff member"; and the self-check below can't run blind.
  if (targetError) return { ok: false, error: STAFF_WRITE_OUTAGE };
  if (!target) return { ok: false, error: "No such staff member." };
  const isSelf =
    target.user_id === caller.uid ||
    (!!target.email && !!caller.email && target.email.toLowerCase() === caller.email);
  if (isSelf) return { ok: false, error: "You can’t deactivate your own account." };
  // A6 — the ceiling, on the TARGET's CURRENT role, which is why the row has to be read first. The
  // owner-on-owner precedent in the note above is exactly what makes this necessary once managers
  // are through the door: without it, the same two taps that offboard a server would offboard every
  // owner, and the account that could reinstate them is the one just switched off.
  if (!canActOn(caller.role, target.role as StaffRole))
    return { ok: false, error: "Only the owner can change an owner’s account." };

  // A6 — the SAME two protections `setStaffRole` carries, and for the same reason: the ceiling above
  // was decided against a role read a moment ago, so the write repeats it as `.eq("role", …)` in the
  // STATEMENT. Without that, a target promoted to owner between the read and the write is
  // deactivated by a manager whose permission was granted for a server. And `.select("user_id")`
  // because `.update()` reports no row count — a write the guard refused would otherwise answer ok
  // and the console would show a member switched off who is still on.
  const { data: rows, error } = await db
    .from("staff")
    .update({ active: parsed.data.active, updated_at: new Date().toISOString() })
    .eq("user_id", parsed.data.userId)
    .eq("role", target.role)
    .select("user_id");
  if (error) return { ok: false, error: "Couldn’t update that member. Try again." };
  if (!rows || rows.length === 0)
    return { ok: false, error: "That member just changed — reload and try again." };

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

/**
 * A6 — CHANGE AN EXISTING MEMBER'S ROLE. The half of "assign roles" that did not exist: a role was
 * chosen once at provision time and never again, so promoting a server meant deactivating them and
 * re-inviting the same address — which fails, because the auth user already exists.
 *
 * Three refusals, and they are three because the reasons differ and a person has to know which one
 * they hit:
 *   · the FLOOR — you are not a manager;
 *   · SELF — you may not change your own role. This is the self-promotion guard AND a lockout guard:
 *     the sole owner demoting themselves would leave the place with no owner and no way back, since
 *     nobody left could restore the role. It is checked by uid OR email, because an allowlisted
 *     Google/magic-link session's uid differs from the uid stamped on the row (the same reason
 *     `setStaffActive` compares both);
 *   · the CEILING — twice: on the target's CURRENT role, so a manager cannot demote an owner, and on
 *     the REQUESTED role, so a manager cannot promote anyone into one. Either alone leaks: checking
 *     only the current role lets a manager raise a fellow server to owner and sign in as them;
 *     checking only the requested role lets a manager demote the owner to server and take the place
 *     over from below.
 *
 * The write is status-guarded in the STATEMENT (`.eq("role", target.role)`), not merely in the code
 * above it: the ceiling was decided against the role read a moment earlier, and a concurrent change
 * in that window would apply this decision to a role it was never made about. `.select("id")`
 * because `.update()` reports success for a write that matched nothing (the W17 rule).
 */
export async function setStaffRole(raw: unknown): Promise<StaffActionResult> {
  const parsed = setStaffRoleInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const auth = await getStaffAuth();
  if (auth.kind === "unavailable") return { ok: false, error: STAFF_WRITE_OUTAGE };
  const caller =
    auth.kind === "staff" && roleAtLeast(auth.caller.role, "manager") ? auth.caller : null;
  if (!caller) return { ok: false, error: MANAGERS_ONLY };

  const db = serviceClient();
  const { data: target, error: targetError } = await db
    .from("staff")
    .select("user_id,email,role")
    .eq("user_id", parsed.data.userId)
    .maybeSingle();
  // W10b — an unread row is not "no such staff member", and neither the self-check nor the ceiling
  // can be decided blind. Refusing here is the only honest answer.
  if (targetError) return { ok: false, error: STAFF_WRITE_OUTAGE };
  if (!target) return { ok: false, error: "No such staff member." };

  const isSelf =
    target.user_id === caller.uid ||
    (!!target.email && !!caller.email && target.email.toLowerCase() === caller.email);
  if (isSelf) return { ok: false, error: "You can’t change your own role." };

  const current = target.role as StaffRole;
  if (!canActOn(caller.role, current) || !canActOn(caller.role, parsed.data.role))
    return { ok: false, error: "Only the owner can change an owner’s role." };
  if (current === parsed.data.role) return { ok: true }; // already there — a no-op, not a failure

  const { data: rows, error } = await db
    .from("staff")
    .update({ role: parsed.data.role, updated_at: new Date().toISOString() })
    .eq("user_id", parsed.data.userId)
    .eq("role", current)
    .select("user_id");
  if (error) return { ok: false, error: "Couldn’t update that member. Try again." };
  // Zero rows means the guard in the statement refused: the role moved under us between the read and
  // the write. Reporting `ok` here would show the console a role nobody stored.
  if (!rows || rows.length === 0)
    return { ok: false, error: "That role just changed — reload and try again." };

  auditStaffAction("staff_role_changed", caller.staffId, {
    target_user_id: parsed.data.userId,
    from_role: current,
    to_role: parsed.data.role,
  });
  revalidatePath("/staff/team");
  return { ok: true };
}
