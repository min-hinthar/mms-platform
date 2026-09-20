"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { setStaffPinInput, verifyStaffPinInput } from "@mms/db/schemas";
import { getStaffAuth } from "./staff";
import { setStaffPin, clearStaffPin, verifyStaffPin, staffHasPin } from "./staff-pin";
import { LOCK_COOKIE } from "./staff-lock";

/**
 * Staff-PIN + shared-tablet-lock Server Actions (S1.1b). Server Actions are public POST endpoints
 * (IDOR by default), so EVERY action re-verifies the caller is an active staff member (requireStaff)
 * and operates on THEIR OWN resolved staff row (caller.staffId) — never an id from the request body.
 * No money/auth/RLS path is touched: this manages a per-person fast-path credential + a device-local
 * lock affordance, both gated by the existing S1.1a staff identity.
 */

/**
 * A4·4 — the set/remove answers are REASON CODES, not sentences: the signed-in card renders each
 * as a dictionary key, so a refusal is never English under the Burmese switch (P2m's defect, on the
 * last surface that had it — the old `PinManager` showed `res.error` verbatim). The lock answers
 * the same way since signin-3 (`LockResult` below) — it was the last action here still handing a
 * sentence to the bar.
 *
 *   · `invalid`  — the format failed the server's own check (the field enforces 4–8 digits, so this
 *                  is the edge path — a hand-built POST);
 *   · `trivial`  — the guessability refine (0000, 1234, 9876 at any length);
 *   · `outage`   — the gate could not verify the caller (W10b: nothing was checked, nothing saved);
 *   · `auth`     — no staff session behind the POST (the card refreshes the page, which re-gates);
 *   · `save`     — the write itself failed.
 */
export type PinSetResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "trivial" | "outage" | "auth" | "save" };

/** Set or rotate the caller's own PIN. The caller is already authenticated in-session (S1.1a), so no
 *  old-PIN challenge is required to rotate — the lock affordance, not this form, is what protects a
 *  walked-away tablet. Format is gated by Zod here and the SQL CHECK as a backstop. */
export async function setPin(raw: unknown): Promise<PinSetResult> {
  const auth = await getStaffAuth();
  if (auth.kind === "unavailable") return { ok: false, reason: "outage" };
  if (auth.kind !== "staff") return { ok: false, reason: "auth" };
  const caller = auth.caller;

  const parsed = setStaffPinInput.safeParse(raw);
  if (!parsed.success) {
    // Zod's issue CODE, never its message: the 4–8 digit regex fails as `invalid_string`, the
    // guessability refine as `custom`. A refine still runs on a dirty string, so a value that fails
    // both is reported as the format — the reason the person can act on first.
    const invalid = parsed.error.issues.some((i) => i.code === "invalid_string");
    return { ok: false, reason: invalid ? "invalid" : "trivial" };
  }

  const ok = await setStaffPin(caller.staffId, parsed.data.pin);
  if (!ok) return { ok: false, reason: "save" };
  revalidatePath("/staff/login"); // A4·4 — the PIN form lives on the sign-in screen
  return { ok: true };
}

/** Remove the caller's own PIN (turn the fast-path off). */
export async function removePin(): Promise<PinSetResult> {
  const auth = await getStaffAuth();
  if (auth.kind === "unavailable") return { ok: false, reason: "outage" };
  if (auth.kind !== "staff") return { ok: false, reason: "auth" };
  const caller = auth.caller;

  const ok = await clearStaffPin(caller.staffId);
  if (!ok) return { ok: false, reason: "save" };
  revalidatePath("/staff/login");
  return { ok: true };
}

/**
 * signin-3 — the lock's answers are REASON CODES like `setPin`'s. The sentence shape that stood here
 * was the P2m defect kept alive on the bar: `LockButton` rendered `res.error` verbatim, English
 * under the Burmese switch, inside the bar's tail.
 *
 *   · `outage` — the gate could not verify the caller (W10b: nothing was checked, nothing locked);
 *   · `auth`   — no staff session behind the POST (the circle refreshes; the page re-gates);
 *   · `no_pin` — the caller has no PIN. The circle only mounts when one exists, so this is the
 *                hand-built-POST arm — and the one refusal that would strand the device.
 */
export type LockResult = { ok: true } | { ok: false; reason: "outage" | "auth" | "no_pin" };

/**
 * Lock the console on this device. Refuses if the caller hasn't set a PIN — otherwise they'd lock
 * themselves out with no way back except a full sign-out (the deliberate escape, not the happy path).
 * httpOnly + path-scoped cookie so page JS can't flip it; the unlock requires the server-verified PIN.
 * Every staff role may lock (the floor is `server`, the ladder's lowest rung), so the auth read is
 * the whole gate — the same three-way read `setPin` and `removePin` make.
 */
export async function lockConsole(): Promise<LockResult> {
  const auth = await getStaffAuth();
  if (auth.kind === "unavailable") return { ok: false, reason: "outage" };
  if (auth.kind !== "staff") return { ok: false, reason: "auth" };
  const caller = auth.caller;

  if (!(await staffHasPin(caller.staffId))) return { ok: false, reason: "no_pin" };

  (await cookies()).set(LOCK_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/staff",
    // Session cookie (no maxAge): a closed browser drops the lock — the Supabase session gate still applies.
  });
  return { ok: true };
}

/**
 * P7·2 — release the device lock once the session that locked it is GONE.
 *
 * The lock is an httpOnly device cookie (`lockConsole` above), not a property of the session:
 * `browserClient().auth.signOut()` clears the auth cookies it set and cannot touch this one. So a
 * tablet stayed locked through a sign-out, the next sign-in landed on `/staff/lock` (`requireStaffPage`
 * redirects there before any page), and a person without a working PIN had no way in — "Forgot PIN?
 * Sign out", the escape the lock screen names, was a loop (blind pass, CRITICAL).
 *
 * This is a public POST, so it releases ONLY when the server itself can see no session: a live
 * session keeps its lock (calling this from a locked, signed-in tablet changes nothing), and an
 * unknowable answer keeps it too — an outage must never read as "signed out". The lock guards a
 * session's data from the next pair of hands; with the session destroyed there is nothing left to
 * guard, which is why the release is safe and the loop was not.
 */
export async function releaseLockAfterSignOut(): Promise<{ released: boolean }> {
  const auth = await getStaffAuth();
  if (auth.kind !== "anon") return { released: false };
  (await cookies()).delete({ name: LOCK_COOKIE, path: "/staff" });
  return { released: true };
}

export type UnlockResult =
  | { ok: true }
  | { ok: false; reason: "wrong"; attemptsRemaining: number }
  | { ok: false; reason: "locked"; lockedUntil: string }
  // W10b `outage`: the platform is unreachable — NOT a wrong PIN, and the person is still staff. The
  // lock screen says so instead of burning their attempt budget's trust on a fiction.
  | { ok: false; reason: "no_pin" | "error" | "outage" };

/**
 * Unlock the console: verify the CURRENT staff member's PIN (server-side, lockout-counted) and, only on
 * success, clear the lock cookie. The discriminated result lets the PIN screen show honest copy —
 * remaining attempts, or the lockout expiry — without leaking whether a PIN exists to anyone but the
 * signed-in member (requireStaff already gates that).
 */
export async function unlockConsole(raw: unknown): Promise<UnlockResult> {
  const auth = await getStaffAuth();
  if (auth.kind === "unavailable") return { ok: false, reason: "outage" };
  if (auth.kind !== "staff") return { ok: false, reason: "error" };
  const caller = auth.caller;

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
