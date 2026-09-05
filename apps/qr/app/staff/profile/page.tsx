import { type CSSProperties } from "react";
import Link from "next/link";
import { requireStaffPage } from "@/lib/staff";
import { staffHasPin } from "@/lib/staff-pin";
import { RoleBadge } from "@/components/staff/RoleBadge";
import { PinManager } from "@/components/staff/PinManager";
import { LockButton } from "@/components/staff/LockButton";
import { StaffOutageShell } from "@/components/staff/StaffOutageShell";

export const metadata = { title: "Your PIN — Mandalay Morning Star" };
export const dynamic = "force-dynamic";

/**
 * Staff profile (S1.1b) — manage the shared-tablet PIN. Gated on a verified staff identity, and (like
 * the rest of the console) bounced to the lock screen if the tablet is locked. The Lock control lives
 * here AND on the home shell so a staff member can step away from either screen.
 */
export default async function StaffProfile() {
  const caller = await requireStaffPage();
  // W10b: an unknowable gate keeps the URL and renders the outage shell — never a login redirect.
  if (!caller) return <StaffOutageShell what="what.profile" />;
  const hasPin = await staffHasPin(caller.staffId);

  return (
    <main style={wrap}>
      <header style={header}>
        <div>
          <p className="eyebrow" style={{ marginBottom: 4 }}>
            <Link href="/staff" style={{ color: "var(--t2)", textDecoration: "none" }}>
              ← Floor
            </Link>
          </p>
          <h1 style={h1}>
            {caller.displayName} <RoleBadge role={caller.role} />
          </h1>
        </div>
        {hasPin && <LockButton />}
      </header>

      <PinManager hasPin={hasPin} />
    </main>
  );
}

const wrap: CSSProperties = { maxWidth: 480, margin: "0 auto", padding: "var(--s6)" };
const header: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "var(--s4)",
  marginBottom: "var(--s6)",
};
const h1: CSSProperties = {
  fontSize: "var(--fs-h2)",
  margin: 0,
  display: "flex",
  alignItems: "center",
  gap: 10,
};
