import "server-only";
import { serviceClient } from "@mms/db/server";

/**
 * Staff-PIN primitive (S1.1b) — the server-side wrapper over the atomic SQL functions
 * (supabase/migrations/20260621130000_staff_pin.sql). The PIN is "sudo on the existing role model"
 * (ORDER-MODEL.md): a shared-tablet fast-path a staff member sets AFTER a real S1.1a sign-in, never a
 * standalone identity. Three operations, all keyed by the RESOLVED staff row id (StaffCaller.staffId,
 * which can differ from the session uid for an email-matched account):
 *
 *   - setStaffPin / clearStaffPin — rotate or turn off the PIN (the caller, for themselves).
 *   - verifyStaffPin — the load-bearing check: bcrypt compare + lockout, ATOMIC in the DB so no app
 *     path can skip the rate limit. THIS is the exact primitive S2's manager step-up (cooked-item
 *     void / refund) will reuse — verify the manager's PIN before the loss-gated mutation.
 *
 * The raw PIN crosses to Postgres only over the service-role TLS connection (same posture as a password
 * to GoTrue); the hash never leaves the DB, and staff_pins is service-role-only (default-deny RLS).
 */

export type PinVerifyResult =
  | { status: "ok" }
  | { status: "wrong"; attemptsRemaining: number }
  | { status: "locked"; lockedUntil: string }
  | { status: "no_pin" }
  | { status: "error" };

/** Set or rotate the caller's PIN. Returns false on a DB error or a format rejection (the Zod parse at
 *  the action is the first gate; the SQL `pin_format` raise is the backstop) so the action can recover. */
export async function setStaffPin(staffId: string, pin: string): Promise<boolean> {
  const { error } = await serviceClient().rpc("mms_staff_set_pin", {
    p_staff_id: staffId,
    p_pin: pin,
  });
  if (error) {
    console.error("[staff-pin] set failed", error.message);
    return false;
  }
  return true;
}

/** Remove the caller's PIN (turn the fast-path off). Idempotent; false only on a DB error. */
export async function clearStaffPin(staffId: string): Promise<boolean> {
  const { error } = await serviceClient().rpc("mms_staff_clear_pin", { p_staff_id: staffId });
  if (error) {
    console.error("[staff-pin] clear failed", error.message);
    return false;
  }
  return true;
}

/**
 * Verify a PIN against the staff member's hash, advancing the lockout counter atomically. FAIL-CLOSED:
 * a DB/RPC error returns `error` (NOT a pass) — unlike the diner rate limiter, a PIN check guards a
 * privileged step-up, so a glitch must never read as success. The caller maps each status to honest copy.
 */
export async function verifyStaffPin(staffId: string, pin: string): Promise<PinVerifyResult> {
  const { data, error } = await serviceClient().rpc("mms_staff_verify_pin", {
    p_staff_id: staffId,
    p_pin: pin,
  });
  const row = data?.[0];
  if (error || !row) {
    if (error) console.error("[staff-pin] verify failed", error.message);
    return { status: "error" };
  }
  switch (row.status) {
    case "ok":
      return { status: "ok" };
    case "wrong":
      return { status: "wrong", attemptsRemaining: row.attempts_remaining ?? 0 };
    case "locked":
      // locked_until is always present on a 'locked' status from the SQL; default defensively.
      return { status: "locked", lockedUntil: row.locked_until ?? new Date().toISOString() };
    case "no_pin":
      return { status: "no_pin" };
    default:
      return { status: "error" };
  }
}

/** Whether the staff member has a PIN set (drives the management UI's set-vs-change copy). */
export async function staffHasPin(staffId: string): Promise<boolean> {
  const { data, error } = await serviceClient()
    .from("staff_pins")
    .select("staff_id")
    .eq("staff_id", staffId)
    .maybeSingle();
  if (error) {
    console.error("[staff-pin] hasPin check failed", error.message);
    return false;
  }
  return !!data;
}
