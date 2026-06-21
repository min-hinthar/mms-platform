import { type CSSProperties } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getStaffCaller, listStaff } from "@/lib/staff";
import { TeamManager } from "@/components/staff/TeamManager";

export const metadata = { title: "Staff — Mandalay Morning Star" };

/**
 * Team management (S1.1a) — OWNER-only. Provision staff (the email becomes their magic-link login),
 * assign a role, and offboard/reinstate. Gated three ways: getStaffCaller here, requireStaff('owner')
 * inside listStaff + every action, and the staff_read_self RLS policy. A non-owner sees an honest
 * "owners only", not a silent bounce.
 */
export default async function TeamPage() {
  const caller = await getStaffCaller();
  if (!caller) redirect("/staff/login");

  if (caller.role !== "owner") {
    return (
      <main style={wrap}>
        <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>Owners only</h1>
        <p style={{ color: "var(--t2)", fontSize: 14, marginBottom: "var(--s5)" }}>
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
      <h1 style={{ fontSize: 24, margin: "0 0 4px" }}>Team</h1>
      <p style={{ color: "var(--t2)", fontSize: 14, margin: "0 0 var(--s6)" }}>
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
  fontSize: 14,
  fontWeight: 600,
  textDecoration: "none",
};
