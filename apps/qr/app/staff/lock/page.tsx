import { redirect } from "next/navigation";
import { getStaffAuth } from "@/lib/staff";
import { isConsoleLocked } from "@/lib/staff-lock";
import { PinUnlock } from "@/components/staff/PinUnlock";
import { StaffOutageShell } from "@/components/staff/StaffOutageShell";
import { StaffBar } from "@/components/staff/StaffBar";
import { readStaffLang } from "@/lib/staff-lang-server";

export const metadata = { title: "Locked — Mandalay Morning Star" };
export const dynamic = "force-dynamic";

/**
 * The shared-tablet lock screen (S1.1b). Reachable only when the device is locked AND a real staff
 * session is present: a signed-out / non-staff visitor goes to login (the lock cookie alone never
 * exposes anything), and an UNlocked staff member is sent back to the floor so this can't be used as a
 * dead end. The PIN verify + lockout are server-side (PinUnlock → unlockConsole).
 *
 * P7·2 — the same bar as every other page: a static lock mark where the Screens circle would be
 * (there is nothing behind the doors until the PIN is right), the title, and the language switch —
 * which matters MORE here than on most surfaces: a locked tablet is the one screen a person can reach
 * without being able to change anything else, so if the language is wrong this is where they must be
 * able to fix it. No Lock circle, for the obvious reason.
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
    <main className="staff-main">
      <StaffBar lang={lang} title="entry.lock.title" leading={{ kind: "here", icon: "lock" }} />
      <div className="staff-col entry-col">
        <PinUnlock lang={lang} displayName={auth.caller.displayName} />
      </div>
    </main>
  );
}
