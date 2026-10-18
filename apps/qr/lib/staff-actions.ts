"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { serviceClient } from "@mms/db/server";
import { provisionStaffInput, setStaffActiveInput, setStaffRoleInput } from "@mms/db/schemas";
import { canActOn, getStaffAuth, roleAtLeast, STAFF_WRITE_OUTAGE } from "./staff";
import type { StaffRole } from "./staff";
import { sendStaffInviteEmail, sendStaffDeactivatedEmail } from "./email";
import { getPostHogClient } from "./posthog-server";
import {
  INVITE_CREATE_FAILED,
  MANAGERS_ONLY,
  provisionOutcome,
  readProvisionVerdict,
  readSetVerdict,
  setOutcome,
} from "./staff-team-outcome";
import type { StaffActionResult } from "./staff-team-outcome";

// Provisioning is rare + bursty (onboarding a few at once); 20/hour per CALLER bounds an
// email-enumeration probe (S1-audit S7) without blocking legitimate team setup.
const PROVISION_MAX = 20;
const PROVISION_WINDOW_S = 3600;

// MANAGERS_ONLY — A6's ONE floor-refusal sentence — lives in `lib/staff-team-outcome.ts` since M210,
// beside every other sentence a team write can end in, so the database's verdicts and this file's
// own pre-checks speak with one voice.
/**
 * M209 — the refusal for "we could not check", which is NOT the refusal for "you may not".
 * Naming the outage keeps a database hiccup from telling a manager they are not one, while still
 * refusing the write it could not authorize.
 *
 * Imported from `lib/staff-outage` rather than written here: this module is `"use server"`, so a
 * client renderer cannot reach it, and `<OutageText>` picks the Burmese twin by string IDENTITY.
 * A literal defined here would have been correct English and silently untranslated — which is what
 * Codex round 1 on #279 caught, on the one console whose job is telling someone their authority.
 */
import { AUTHORITY_UNCONFIRMED } from "./staff-outage";
/** The one mapping from a refused authority refresh to what the console should say. */
function authorityRefusal(reason: "revoked" | "outage"): string {
  return reason === "outage" ? AUTHORITY_UNCONFIRMED : MANAGERS_ONLY;
}

/**
 * A6 — RE-READ THE CALLER'S OWN AUTHORITY BEFORE THE INVITE'S SIDE EFFECT, AND RETURN THE ROLE IT
 * FOUND.
 *
 * ⚠️ M208 MOVED THE DECISION, AND THIS IS NOW A PRE-FLIGHT. Since `20261018130000_m210_team_safety
 * .sql` the database decides every team write — `mms_staff_set` and `mms_staff_provision` read the
 * caller's row under a lock, in the same transaction as the write — so no revocation can land between
 * the decision and the write. This re-read survives on ONE path, `provisionStaff`, for a reason the
 * database cannot serve: the invite's auth user is created BEFORE its staff row (GoTrue is not SQL),
 * so a refusal decided only in SQL would first mint an account and then delete it. Refusing here,
 * before `createUser`, keeps a revoked or out-of-reach invite from ever creating one; the RPC then
 * decides again, under its lock, and is the one that counts.
 *
 * `getStaffAuth()` resolves the caller once, at the top of the action, and the invite lands several
 * round trips later. In that window an owner can demote or deactivate the caller.
 *
 * ⚠️ RETURNING THE REFRESHED ROLE IS THE WHOLE POINT, and the first version of this helper got it
 * wrong in a way that mattered: it answered a plain boolean, checked only the `manager` FLOOR, and
 * threw the rank away — so an OWNER demoted to manager mid-request still passed (they are a manager)
 * while every ceiling decision below went on using the stale `caller.role === "owner"`. The
 * now-manager could still mint an owner or modify an owner's account: a narrower window on one hole
 * and a wider one on another. Every caller re-runs `canActOn` against `role` from here, never
 * against the session's copy.
 *
 * ⚠️ ON ITS OWN THIS NARROWS THE WINDOW, IT DOES NOT CLOSE IT: the check and `createUser` are still
 * two statements. What closes it is the RPC's own decision behind it (M208, above).
 *
 * ⚠️ M209 — AND AN UNREADABLE ROW REFUSES RATHER THAN PROCEEDING. The first shipped version answered
 * `{ ok: true }` on a read error, on the reasoning that a hiccup is not a revocation. That reasoning
 * is sound and its conclusion was still wrong: it authorized an authority write on a rank the code
 * had explicitly failed to confirm, which is the one thing this helper exists to stop. The answer is
 * neither arm of that fork — it refuses, and `reason` carries WHY so the console can say "we couldn't
 * confirm your access" instead of telling a manager they are not one.
 */
type CallerAuthority = { ok: true; role: StaffRole } | { ok: false; reason: "revoked" | "outage" };

async function refreshCallerAuthority(
  db: ReturnType<typeof serviceClient>,
  caller: { staffId: string; role: StaffRole },
): Promise<CallerAuthority> {
  const { data, error } = await db
    .from("staff")
    .select("role,active")
    .eq("user_id", caller.staffId)
    .maybeSingle();
  // ⚠️ M209 — AN UNREADABLE ROW REFUSES, AND IT SAYS WHY. This used to answer `{ ok: true }` on the
  // session's role, reasoning that a hiccup is not a revocation. Both arms of that fork are wrong.
  // Proceeding authorizes a write on a role we explicitly FAILED to confirm, so a caller demoted or
  // deactivated mid-request still provisions staff, changes a role, or deactivates a colleague — on a
  // path with no database gate behind it, where these refusals are the whole authority model.
  // Refusing with MANAGERS_ONLY is the other wrong arm: it tells a manager they are not one, which is
  // the fabricated-diagnosis shape M116/M119 b-e closed across this codebase.
  //
  // So it refuses and NAMES THE OUTAGE. "We couldn't confirm your access" is true, actionable, and
  // accuses nobody of lacking a permission they hold. The distinction is carried in `reason` rather
  // than left to the call site, because every one of the four call sites had written the same
  // MANAGERS_ONLY on both.
  if (error) return { ok: false, reason: "outage" };
  if (!data) return { ok: false, reason: "revoked" }; // the row is gone: no staff row, no authority
  if (data.active !== true) return { ok: false, reason: "revoked" };
  const role = data.role as StaffRole;
  if (!roleAtLeast(role, "manager")) return { ok: false, reason: "revoked" };
  return { ok: true, role };
}

/** Best-effort ANALYTICS of a staff-management mutation (parity with clear/merge/settle telemetry —
 *  S1-audit S7). Decoupled via after(); never fails the action on a capture error.
 *
 *  M205 — this is the SECONDARY record now. The durable one is the `staff_audit` row the RPC writes
 *  in the same transaction as the change, which exists whether or not analytics is configured; this
 *  event still returns early without `NEXT_PUBLIC_POSTHOG_KEY`, and that is fine because nothing
 *  depends on it any more. */
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
 * a manager can neither mint an owner nor unseat one, and cannot promote themselves.
 *
 * ⚠️ M208 · M210 MOVED BOTH HALVES INTO THE DATABASE. Until `20261018130000_m210_team_safety.sql`
 * they lived in TypeScript alone (`staff` carries one RLS policy, a SELECT, and these writes use the
 * service-role client), decided a round trip or more before the write — so a revocation could land
 * between them (M208), and two owners demoting each other could both pass and leave the restaurant
 * with no owner (M210). Now `mms_staff_set` / `mms_staff_provision` decide the caller, the target,
 * the ceiling and the write in ONE transaction under the team lock, write the `staff_audit` row in it
 * (M205), and a trigger refuses any write that ends the last active owner. What remains here is the
 * floor at the door (`getStaffAuth`), the session-aware self check (the e-mail arm only the session
 * knows), the invite's pre-flight (`refreshCallerAuthority`), and reading the verdict back.
 *
 * Bootstrap note: the FIRST owner is created out-of-band (Supabase dashboard auth user + a one-time
 * `insert into staff … role='owner'`) — there is deliberately NO self-serve "claim the first owner"
 * code path, since that would let any visitor seize ownership before setup. See docs/HANDOFF.md.
 */

export type { StaffActionResult };

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

  const db = serviceClient();
  // Coarse per-CALLER rate limit (S1-audit S7) — bounds repeated createUser probes. ⚠️ A6 made this
  // a manager path, so the bucket is keyed per manager and the fleet-wide ceiling on the
  // email-existence oracle now scales with the number of managers rather than with one owner. Still
  // fail-open on an RPC error (defense-in-depth, and a hiccup must not block a real hire), and a
  // hard `false` (over the cap) refuses without leaking why. The durable audit this leans on is the
  // `staff_audit` row `mms_staff_provision` writes beside every staff row it creates (M205).
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
  // A6 — THE CEILING, DECIDED ONCE, ON THE FRESHEST ROLE, AND BEFORE THE SIDE EFFECT.
  //
  // Without it the lowered floor would hand every manager the `owner` option in the same form they
  // use to add a server: invite an owner at an address you control, sign in as them. A distinct
  // sentence from the floor refusal because the caller IS allowed to be here — it is the role they
  // picked that is out of reach.
  //
  // ⚠️ ORDER MATTERS TWICE OVER. It reads the caller's row again first, because the session's copy
  // can be stale (see `refreshCallerAuthority`) — an owner demoted mid-request is a manager now and
  // may not mint an owner. And both run BEFORE `createUser`, so a refusal leaves no auth account
  // behind: an orphan one cannot sign in to anything, but it also cannot be re-provisioned at that
  // address, so the invite silently fails forever for the person it was meant for.
  //
  // An earlier version checked the ceiling here on the SESSION's role and again after the account
  // existed on the fresh one. Two decisions, same answer — which made the first unfalsifiable (its
  // mutant survived, correctly) and bought a rollback path for a side effect that need never have
  // happened.
  const fresh = await refreshCallerAuthority(db, caller);
  if (!fresh.ok) return { ok: false, error: authorityRefusal(fresh.reason) };
  if (!canActOn(fresh.role, parsed.data.role))
    return { ok: false, error: "Only the owner can add another owner." };

  const { data: created, error: createErr } = await db.auth.admin.createUser({
    email: parsed.data.email,
    email_confirm: true,
  });
  if (createErr || !created?.user) {
    // GENERIC message (S1-audit S7): do NOT reveal whether the email already exists — that's an account-
    // existence oracle (even owner-only, it's needless disclosure). One message for every create failure.
    return { ok: false, error: INVITE_CREATE_FAILED };
  }

  // M208 · M205 — the staff row through the RPC, which decides the caller and the ceiling AGAIN under
  // the caller's row lock (the pre-flight above can be overtaken by a revocation; this cannot) and
  // writes the `staff_audit` row in the same transaction. Anything but `ok` — a refusal, a duplicate,
  // an outage, an answer we cannot read — rolls back the auth user, so a failed provision leaves
  // nothing behind.
  const { data: verdict, error: rowErr } = await db.rpc("mms_staff_provision", {
    p_caller: caller.staffId,
    p_user_id: created.user.id,
    p_email: parsed.data.email, // the allowlist key — matches a Google/magic-link sign-in by email
    p_role: parsed.data.role,
    p_display_name: parsed.data.displayName,
  });
  const status = rowErr ? null : readProvisionVerdict(verdict);
  const outcome = provisionOutcome(status);
  if (!outcome.ok) {
    // An UNREADABLE answer (a transport drop, a shape we do not know) is not a refusal: the RPC may
    // have committed and its reply been lost. Deleting the auth user then would cascade away a
    // member who WAS added, leaving their `invited` ledger row and a console that says it failed.
    // So the row decides — present, it is the success it was; absent or unreadable, nothing landed
    // that we can see, and the account goes (if a row did land after all, the cascade's delete is
    // itself recorded by `staff_audit_direct` as a removal, so the ledger still tells the truth).
    // A READABLE refusal is the RPC saying it wrote nothing, and is never second-guessed.
    const landed =
      status === null &&
      !!(await db.from("staff").select("user_id").eq("user_id", created.user.id).maybeSingle())
        .data;
    if (!landed) {
      await db.auth.admin.deleteUser(created.user.id).catch(() => {});
      return outcome;
    }
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
  revalidatePath("/staff/login"); // A4·4 — the roster is a zone of the sign-in screen
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
 * itself — but an OWNER's offboarding of a non-owner is reversible by a manager. Since M205 both
 * leave a durable `staff_audit` row (who, whom, when), so the question is at least answerable. Named
 * here because the ceiling reasons about ROLES, and this is the one authority question it does not
 * answer.
 */
export async function setStaffActive(raw: unknown): Promise<StaffActionResult> {
  const parsed = setStaffActiveInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  // Deliberate collapse of the 401/403 distinction (same rationale as provisionStaff); outage stays
  // distinct (W10b). Two owners deactivating EACH OTHER at once can no longer reach zero (M210): the
  // RPC serializes them under the team lock and the second, now off, is refused — and a trigger
  // refuses any write, through any path, that ends the last active owner.
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

  // M208 · M210 · M205 — ONE call decides and writes. `mms_staff_set` takes the team lock, the
  // caller's row FOR SHARE (their authority, which nothing can revoke mid-call) and the target's FOR
  // UPDATE, then refuses — before any write — a caller gone, off or below the floor, the caller
  // themselves, a role that is no longer `seenRole` (the one the CONSOLE showed: a member promoted
  // to owner since the screen loaded is not offboarded on a server's permission), and A6's ceiling
  // on the target's CURRENT role. The flip and its `staff_audit` row commit together.
  //
  // ⚠️ `p_seen_role` is the console's value, never `target.role`: the read above is milliseconds
  // old, so a guard fed from it could not fail (the blind pass on #366 — the claim was made, the
  // wiring did not keep it). A `changed` answer asks the console to re-read the roster.
  //
  // The verdict is READ, never assumed: the RPC answers jsonb, and anything it does not say is `ok`
  // or `noop` — an error, an unknown status, a shape we cannot parse — reports a failure rather than
  // a member switched off who is still on (the W17 rule, one layer up).
  const { data: verdictData, error } = await db.rpc("mms_staff_set", {
    p_caller: caller.staffId,
    p_target: parsed.data.userId,
    p_seen_role: parsed.data.seenRole,
    p_active: parsed.data.active,
  });
  const verdict = error ? null : readSetVerdict(verdictData);
  const outcome = setOutcome("active", verdict);
  if (!outcome.ok || verdict?.status !== "ok") return outcome; // a no-op changed nothing to announce

  auditStaffAction(parsed.data.active ? "staff_reactivated" : "staff_deactivated", caller.staffId, {
    target_user_id: parsed.data.userId,
  });

  // On DEACTIVATION only, send an honest heads-up (best-effort, decoupled) to the address the row held
  // when the RPC switched it off — its own answer, not the read above, which may be a moment stale.
  if (!parsed.data.active && verdict.email) {
    const to = verdict.email;
    after(() => sendStaffDeactivatedEmail({ to }));
  }
  revalidatePath("/staff/login"); // A4·4 — the roster is a zone of the sign-in screen
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
 * Since M208 · M210 all three are decided again — and finally — by `mms_staff_set`, in the same
 * transaction as the write, under the target's row lock: the role the console showed (`seenRole`,
 * sent by the Team screen) must still be the role (`p_seen_role`), or the call answers `changed`,
 * writes nothing, and the console re-reads the roster. That is the statement
 * guard the old `.eq("role", current)` was, moved to where nothing can change the row between the
 * decision and the write.
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
    .select("user_id,email")
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

  // A request for the role the console already showed is still ASKED: the database decides the
  // ceiling before the no-op, so `ok` never answers for an account outside the caller's reach, and a
  // member whose role moved since the screen loaded answers `changed`. The console never sends one
  // (`TeamManager` returns before the call); a direct POST gets the database's answer.
  const seen: StaffRole = parsed.data.seenRole;

  // M208 · M210 · M205 — ONE call decides and writes (see `setStaffActive` for the locks). The
  // ceiling is decided there on BOTH halves — the target's current role and the requested one — on
  // the caller's role as committed, so an owner demoted mid-request (or by a concurrent demotion from
  // the co-owner they are demoting: M210) is a manager by then and meets it.
  const { data: verdictData, error } = await db.rpc("mms_staff_set", {
    p_caller: caller.staffId,
    p_target: parsed.data.userId,
    p_seen_role: seen,
    p_role: parsed.data.role,
  });
  const verdict = error ? null : readSetVerdict(verdictData);
  const outcome = setOutcome("role", verdict);
  if (!outcome.ok || verdict?.status !== "ok") return outcome; // a no-op changed nothing to announce

  auditStaffAction("staff_role_changed", caller.staffId, {
    target_user_id: parsed.data.userId,
    from_role: seen, // `ok` proves the row WAS `seen` when the RPC wrote over it
    to_role: parsed.data.role,
  });
  revalidatePath("/staff/login"); // A4·4 — the roster is a zone of the sign-in screen
  return { ok: true };
}
