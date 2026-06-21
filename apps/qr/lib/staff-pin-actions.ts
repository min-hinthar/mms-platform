"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { setStaffPinInput, verifyStaffPinInput } from "@mms/db/schemas";
import { requireStaff } from "./staff";
import { setStaffPin, clearStaffPin, verifyStaffPin, staffHasPin } from "./staff-pin";
import { LOCK_COOKIE } from "./staff-lock";

/**
 * Staff-PIN + shared-tablet-lock Server Actions (S1.1b). Server Actions are public POST endpoints
 * (IDOR by default), so EVERY action re-verifies the caller is an active staff member (requireStaff)
 * and operates on THEIR OWN resolved staff row (caller.staffId) — never an id from the request body.
 * No money/auth/RLS path is touched: this manages a per-person fast-path credential + a device-local
 * lock affordance, both gated by the existing S1.1a staff identity.
 */

export type PinActionResult = { ok: true } | { ok: false; error: string };

/** Set or rotate the caller's own PIN. The caller is already authenticated in-session (S1.1a), so no
 *  old-PIN challenge is required to rotate — the lock affordance, not this form, is what protects a
 *  walked-away tablet. Format is gated by Zod here and the SQL CHECK as a backstop. */
export async function setPin(raw: unknown): Promise<PinActionResult> {
  const caller = await requireStaff().catch(() => null);
  if (!caller) return { ok: false, error: "Staff sign-in required." };

  const parsed = setStaffPinInput.safeParse(raw);
  if (!parsed.success) {
    // Surface the first honest reason (format vs trivial-PIN) rather than a generic "invalid".
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter a 4–8 digit PIN." };
  }

  const ok = await setStaffPin(caller.staffId, parsed.data.pin);
  if (!ok) return { ok: false, error: "Couldn’t save your PIN. Try again." };
  revalidatePath("/staff/profile");
  return { ok: true };
}

/** Remove the caller's own PIN (turn the fast-path off). */
export async function removePin(): Promise<PinActionResult> {
  const caller = await requireStaff().catch(() => null);
  if (!caller) return { ok: false, error: "Staff sign-in required." };

  const ok = await clearStaffPin(caller.staffId);
  if (!ok) return { ok: false, error: "Couldn’t remove your PIN. Try again." };
  revalidatePath("/staff/profile");
  return { ok: true };
}

/**
 * Lock the console on this device. Refuses if the caller hasn't set a PIN — otherwise they'd lock
 * themselves out with no way back except a full sign-out (the deliberate escape, not the happy path).
 * httpOnly + path-scoped cookie so page JS can't flip it; the unlock requires the server-verified PIN.
 */
export async function lockConsole(): Promise<PinActionResult> {
  const caller = await requireStaff().catch(() => null);
  if (!caller) return { ok: false, error: "Staff sign-in required." };

  if (!(await staffHasPin(caller.staffId)))
    return { ok: false, error: "Set a PIN before locking." };

  (await cookies()).set(LOCK_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/staff",
    // Session cookie (no maxAge): a closed browser drops the lock — the Supabase session gate still applies.
  });
  return { ok: true };
}

export type UnlockResult =
  | { ok: true }
  | { ok: false; reason: "wrong"; attemptsRemaining: number }
  | { ok: false; reason: "locked"; lockedUntil: string }
  | { ok: false; reason: "no_pin" | "error" };

/**
 * Unlock the console: verify the CURRENT staff member's PIN (server-side, lockout-counted) and, only on
 * success, clear the lock cookie. The discriminated result lets the PIN screen show honest copy —
 * remaining attempts, or the lockout expiry — without leaking whether a PIN exists to anyone but the
 * signed-in member (requireStaff already gates that).
 */
export async function unlockConsole(raw: unknown): Promise<UnlockResult> {
  const caller = await requireStaff().catch(() => null);
  if (!caller) return { ok: false, reason: "error" };

  const parsed = verifyStaffPinInput.safeParse(raw);
  // A malformed PIN never reaches verify (no lockout cost for a client-side typo guard); treat as wrong
  // with the full budget unknown — but the field already enforces 4–8 digits, so this is the edge path.
  if (!parsed.success) return { ok: false, reason: "wrong", attemptsRemaining: 0 };

  const result = await verifyStaffPin(caller.staffId, parsed.data.pin);
  if (result.status === "ok") {
    (await cookies()).delete({ name: LOCK_COOKIE, path: "/staff" });
    return { ok: true };
  }
  if (result.status === "wrong")
    return { ok: false, reason: "wrong", attemptsRemaining: result.attemptsRemaining };
  if (result.status === "locked")
    return { ok: false, reason: "locked", lockedUntil: result.lockedUntil };
  return { ok: false, reason: result.status };
}
