import { type CSSProperties } from "react";
import Link from "next/link";
import { requireStaffPage, listStaff } from "@/lib/staff";
import { TeamManager } from "@/components/staff/TeamManager";

export const metadata = { title: "Staff — Mandalay Morning Star" };

/**
 * Team management (S1.1a) — OWNER-only. Provision staff (the email becomes their magic-link login),
 * assign a role, and offboard/reinstate. Gated three ways: requireStaffPage here (default floor — any
 * active staff may LAND here, because a non-owner sees an honest "owners only", not a silent bounce),
 * requireStaff('owner') inside listStaff + every action, and the staff_read_self RLS policy.
 */
export default async function TeamPage() {
  const caller = await requireStaffPage();

  if (caller.role !== "owner") {
    return (
      <main style={wrap}>
        <h1 style={{ fontSize: "var(--fs-h2)", margin: "0 0 8px" }}>Owners only</h1>
        <p style={{ color: "var(--t2)", fontSize: "var(--fs-sm)", marginBottom: "var(--s5)" }}>
          Managing the team is limited to owners.
        </p>
        <Link href="/staff" style={back}>
          ← Back to the floor
        </Link>
      </main>
    );
  }

  const staff = await listStaff();
  return (
    <main style={wrap}>
      <Link href="/staff" style={{ ...back, marginBottom: "var(--s4)" }}>
        ← Floor
      </Link>
      <h1 style={{ fontSize: "var(--fs-h1)", margin: "0 0 4px" }}>Team</h1>
      <p style={{ color: "var(--t2)", fontSize: "var(--fs-sm)", margin: "0 0 var(--s6)" }}>
        Add staff by email — they’ll sign in with a one-time code. Deactivate to offboard without
        losing history.
      </p>
      <TeamManager initial={staff} selfUid={caller.uid} selfEmail={caller.email} />
    </main>
  );
}

const wrap: CSSProperties = { maxWidth: 640, margin: "0 auto", padding: "var(--s6)" };
const back: CSSProperties = {
  display: "inline-flex",
  minHeight: 44,
  alignItems: "center",
  color: "var(--ac)",
  fontSize: "var(--fs-sm)",
  fontWeight: 600,
  textDecoration: "none",
};
