import { type CSSProperties } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getStaffAuth, roleAtLeast } from "@/lib/staff";
import { staffHasPin } from "@/lib/staff-pin";
import { isConsoleLocked } from "@/lib/staff-lock";
import { getFloorView } from "@/lib/floor";
import { countPendingApprovals } from "@/lib/approvals";
import { RoleBadge } from "@/components/staff/RoleBadge";
import { StaffSignOut } from "@/components/staff/StaffSignOut";
import { LockButton } from "@/components/staff/LockButton";
import { FloorBoard } from "@/components/staff/FloorBoard";

export const metadata = { title: "Floor — Mandalay Morning Star" };
export const dynamic = "force-dynamic";

/**
 * Staff console home + live floor (S1.1a shell · S1.2 floor). Gates on a VERIFIED staff identity (the
 * staff row, not a client claim): an anon/no session goes to sign-in; a real account that isn't staff
 * goes to sign-in with a clear reason (?denied) so it can recover instead of looping; a locked tablet
 * goes to the PIN screen. The floor itself is the server-rendered initial snapshot, kept live client-side.
 */
export default async function StaffHome() {
  const auth = await getStaffAuth();
  if (auth.kind === "anon") redirect("/staff/login");
  if (auth.kind === "not_staff") redirect("/staff/login?denied=1");
  if (await isConsoleLocked()) redirect("/staff/lock");
  const caller = auth.caller;
  const isManager = roleAtLeast(caller.role, "manager");
  const [hasPin, floor, pendingApprovals] = await Promise.all([
    staffHasPin(caller.staffId),
    getFloorView(),
    isManager ? countPendingApprovals() : Promise.resolve(0),
  ]);

  return (
    <main style={wrap}>
      <header style={header}>
        <div>
          <p className="eyebrow" style={{ marginBottom: 4 }}>
            Floor
          </p>
          <h1 style={h1}>
            Hi, {caller.displayName} <RoleBadge role={caller.role} />
          </h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s3)", flexWrap: "wrap" }}>
          {hasPin && <LockButton />}
          <StaffSignOut />
        </div>
      </header>

      <FloorBoard initial={floor} />

      <nav
        aria-label="Staff tools"
        style={{ marginTop: "var(--s6)", display: "flex", gap: "var(--s3)", flexWrap: "wrap" }}
      >
        <Link href="/staff/kitchen" style={ownerLink}>
          Kitchen →
        </Link>
        <Link href="/staff/expo" style={ownerLink}>
          Expo →
        </Link>
        {isManager && (
          <Link href="/staff/approvals" style={ownerLink}>
            Approvals{pendingApprovals > 0 ? ` (${pendingApprovals})` : ""} →
          </Link>
        )}
        {isManager && (
          <Link href="/staff/feedback" style={ownerLink}>
            Feedback →
          </Link>
        )}
        <Link href="/staff/profile" style={ownerLink}>
          {hasPin ? "Your PIN →" : "Set a tablet PIN →"}
        </Link>
        {caller.role === "owner" && (
          <Link href="/staff/team" style={ownerLink}>
            Manage staff →
          </Link>
        )}
      </nav>
    </main>
  );
}

const wrap: CSSProperties = { maxWidth: 720, margin: "0 auto", padding: "var(--s6)" };
const header: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "var(--s4)",
  marginBottom: "var(--s6)",
};
const h1: CSSProperties = {
  fontSize: 24,
  margin: 0,
  display: "flex",
  alignItems: "center",
  gap: 10,
};
const ownerLink: CSSProperties = {
  display: "inline-flex",
  minHeight: 44,
  alignItems: "center",
  padding: "0 18px",
  borderRadius: "var(--r-full)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  color: "var(--ac)",
  fontSize: 14,
  fontWeight: 700,
  textDecoration: "none",
};
