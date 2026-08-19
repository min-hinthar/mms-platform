import { type CSSProperties } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaffPage, roleAtLeast } from "@/lib/staff";
import { staffHasPin } from "@/lib/staff-pin";
import { getFloorView } from "@/lib/floor";
import { countPendingApprovals } from "@/lib/approvals";
import { RoleBadge } from "@/components/staff/RoleBadge";
import { StaffSignOut } from "@/components/staff/StaffSignOut";
import { LockButton } from "@/components/staff/LockButton";
import { FloorBoard } from "@/components/staff/FloorBoard";
import { StaffOutageShell } from "@/components/staff/StaffOutageShell";

export const metadata = { title: "Floor — Mandalay Morning Star" };
export const dynamic = "force-dynamic";

/**
 * Staff console home + live floor (S1.1a shell · S1.2 floor). Gated by requireStaffPage (verified
 * staff row → console lock). The floor itself is the server-rendered initial snapshot, kept live
 * client-side.
 */
export default async function StaffHome() {
  const caller = await requireStaffPage();
  // W10b: an unknowable gate renders the outage shell in place (URL kept) — never a login redirect.
  if (!caller) return <StaffOutageShell what="the floor" />;
  const isManager = roleAtLeast(caller.role, "manager");
  const [hasPin, floor, pendingApprovals] = await Promise.all([
    staffHasPin(caller.staffId),
    getFloorView(),
    isManager ? countPendingApprovals() : Promise.resolve(0),
  ]);
  if (!floor.ok) {
    if (floor.reason === "outage") return <StaffOutageShell what="the floor" />;
    redirect("/staff/login"); // gate race between requireStaffPage and the read
  }

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

      <FloorBoard initial={floor.snapshot} />

      <nav
        aria-label="Staff tools"
        style={{ marginTop: "var(--s6)", display: "flex", gap: "var(--s3)", flexWrap: "wrap" }}
      >
        <Link href="/staff/register" style={ownerLink}>
          Register →
        </Link>
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
        {isManager && (
          <Link href="/staff/orders" style={ownerLink}>
            Orders & refunds →
          </Link>
        )}
        {/* W23a (Codex P2) — everyone sees this: the page renders the 86 control for every staff
            member and the price editor only for managers, so the link is safe to show to all. A
            server who runs out at the counter needs a menu-wide surface, not just whatever dish
            happens to be on a KDS ticket. */}
        <Link href="/staff/menu" style={ownerLink}>
          {isManager ? "Menu prices →" : "Menu availability →"}
        </Link>
        {/* W17c-4 — everyone sees this: a server sees their own line, a manager the whole team's.
            The role rule lives in getDayTips, so the link is safe to show to all staff. */}
        <Link href="/staff/tips" style={ownerLink}>
          Tips today →
        </Link>
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
  fontSize: "var(--fs-h1)",
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
  fontSize: "var(--fs-sm)",
  fontWeight: 700,
  textDecoration: "none",
};
