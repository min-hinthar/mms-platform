import { redirect } from "next/navigation";
import { getStaffAuth } from "@/lib/staff";
import { isConsoleLocked } from "@/lib/staff-lock";
import { PinUnlock } from "@/components/staff/PinUnlock";
import { StaffOutageShell } from "@/components/staff/StaffOutageShell";

export const metadata = { title: "Locked — Mandalay Morning Star" };
export const dynamic = "force-dynamic";

/**
 * The shared-tablet lock screen (S1.1b). Reachable only when the device is locked AND a real staff
 * session is present: a signed-out / non-staff visitor goes to login (the lock cookie alone never
 * exposes anything), and an UNlocked staff member is sent back to the floor so this can't be used as a
 * dead end. The PIN verify + lockout are server-side (PinUnlock → unlockConsole).
 */
export default async function StaffLockScreen() {
  const auth = await getStaffAuth();
  // W10b: unknowable ≠ signed out — the tablet stays locked (the lock is a local cookie) and the
  // shell's retry re-enters here; a PIN couldn't be verified mid-outage anyway.
  if (auth.kind === "unavailable") return <StaffOutageShell what="what.lock" />;
  if (auth.kind === "anon") redirect("/staff/login");
  if (auth.kind === "not_staff") redirect("/staff/login?denied=1");
  if (!(await isConsoleLocked())) redirect("/staff");

  return <PinUnlock displayName={auth.caller.displayName} />;
}
