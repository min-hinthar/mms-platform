import { redirect } from "next/navigation";
import { getStaffAuth } from "@/lib/staff";
import { isConsoleLocked } from "@/lib/staff-lock";
import { PinUnlock } from "@/components/staff/PinUnlock";
import { StaffOutageShell } from "@/components/staff/StaffOutageShell";
import { StaffLangSwitch } from "@/components/staff/StaffLangSwitch";
import { readStaffLang } from "@/lib/staff-lang-server";

export const metadata = { title: "Locked — Mandalay Morning Star" };
export const dynamic = "force-dynamic";

/**
 * The shared-tablet lock screen (S1.1b). Reachable only when the device is locked AND a real staff
 * session is present: a signed-out / non-staff visitor goes to login (the lock cookie alone never
 * exposes anything), and an UNlocked staff member is sent back to the floor so this can't be used as a
 * dead end. The PIN verify + lockout are server-side (PinUnlock → unlockConsole).
 *
 * P2 — the switch is mounted as a strip ABOVE `PinUnlock`, exactly the shape `/staff/login` uses,
 * and for the same reason: this is a gate-less screen whose whole body is one owned component, so
 * there is no header of its own to put the control in. It matters MORE here than on most surfaces —
 * a locked tablet is the one screen a person can reach without being able to change anything else,
 * so if the language is wrong this is where they must be able to fix it. `PinUnlock`'s own copy is
 * still English this slice (OPEN-ITEMS P2c); the control does not have to wait for it.
 */
export default async function StaffLockScreen() {
  const auth = await getStaffAuth();
  // W10b: unknowable ≠ signed out — the tablet stays locked (the lock is a local cookie) and the
  // shell's retry re-enters here; a PIN couldn't be verified mid-outage anyway.
  if (auth.kind === "unavailable") return <StaffOutageShell what="what.lock" />;
  if (auth.kind === "anon") redirect("/staff/login");
  if (auth.kind === "not_staff") redirect("/staff/login?denied=1");
  if (!(await isConsoleLocked())) redirect("/staff");

  // Next request-memoizes `cookies()`, so this costs one read even though the layout read it too.
  const lang = await readStaffLang();
  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "12px 16px 0" }}>
        <StaffLangSwitch lang={lang} />
      </div>
      <PinUnlock displayName={auth.caller.displayName} />
    </>
  );
}
