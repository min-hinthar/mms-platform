import { type CSSProperties } from "react";
import { requireStaffPage } from "@/lib/staff";
import { staffHasPin } from "@/lib/staff-pin";
import { RoleBadge } from "@/components/staff/RoleBadge";
import { PinManager } from "@/components/staff/PinManager";
import { StaffSignOut } from "@/components/staff/StaffSignOut";
import { StaffOutageShell } from "@/components/staff/StaffOutageShell";
import { StaffBar } from "@/components/staff/StaffBar";
import { readStaffLang } from "@/lib/staff-lang-server";

export const metadata = { title: "Your PIN — Mandalay Morning Star" };
export const dynamic = "force-dynamic";

/**
 * Staff profile (S1.1b) — manage the shared-tablet PIN. Gated on a verified staff identity, and (like
 * the rest of the console) bounced to the lock screen if the tablet is locked. The Lock control lives
 * here AND on the home shell so a staff member can step away from either screen.
 *
 * P2 — the page's own chrome is one back-link and the person's own name, so the conversion here is
 * that link plus the switch. `PinManager` below is still English this slice (OPEN-ITEMS P2c).
 */
export default async function StaffProfile() {
  const caller = await requireStaffPage();
  // W10b: an unknowable gate keeps the URL and renders the outage shell — never a login redirect.
  if (!caller) return <StaffOutageShell what="what.profile" />;
  // Next request-memoizes `cookies()`, so this costs one read even though the layout read it too.
  const lang = await readStaffLang();
  const hasPin = await staffHasPin(caller.staffId);

  return (
    <main className="staff-main" style={wrap}>
      <StaffBar
        lang={lang}
        titleNode={<span>{caller.displayName}</span>}
        after={<RoleBadge role={caller.role} />}
        lock={hasPin}
      />

      <PinManager hasPin={hasPin} />

      {/* P7·1b — Sign out lives HERE, never in the bar: a mis-tap on it costs a login, where a
          mis-tap on Lock costs a PIN. Last on the page, the way iOS ends Settings. */}
      <div style={{ marginTop: "var(--s8)" }}>
        <StaffSignOut />
      </div>
    </main>
  );
}

const wrap: CSSProperties = { maxWidth: 480, margin: "0 auto" };
