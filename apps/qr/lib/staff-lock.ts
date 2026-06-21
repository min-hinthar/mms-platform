import "server-only";
import { cookies } from "next/headers";

/**
 * Shared-tablet lock state (S1.1b). When a staff member taps "Lock" on the floor console, an httpOnly
 * cookie marks the tablet locked; the staff shell pages redirect to /staff/lock until the SAME staff
 * member re-enters their PIN. This is an ATTRIBUTION / quick-privacy affordance for a shared device —
 * NOT a hard security boundary. The real boundary stays the Supabase session + the staff-row gate
 * (getStaffAuth): the cookie is httpOnly so page JS can't flip it, but the legitimately signed-in
 * person could clear it via devtools, and that's fine — they could just sign in again anyway. On a
 * kiosk-locked floor tablet devtools aren't exposed; the PIN's real teeth (server-verified, lockout)
 * are in mms_staff_verify_pin, which S2's manager step-up reuses as a genuine server-side gate.
 */
export const LOCK_COOKIE = "mms_staff_lock";

/** Is the console currently locked on this device? Cheap cookie read for the shell server components. */
export async function isConsoleLocked(): Promise<boolean> {
  return (await cookies()).get(LOCK_COOKIE)?.value === "1";
}
