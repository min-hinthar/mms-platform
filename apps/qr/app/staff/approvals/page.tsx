import { type CSSProperties } from "react";
import Link from "next/link";
import { requireStaffPage } from "@/lib/staff";
import { listPendingApprovals } from "@/lib/approvals";
import { listApprovers } from "@/lib/voids";
import { RoleBadge } from "@/components/staff/RoleBadge";
import { ApprovalsBoard } from "@/components/staff/ApprovalsBoard";

export const metadata = { title: "Approvals — Mandalay Morning Star" };
export const dynamic = "force-dynamic";

/**
 * The manager approvals queue (S2.4) — the deferred sibling of the inline manager-PIN void/comp. Same
 * verified-staff gate as the floor/KDS, plus a MANAGER+ role floor (a server is bounced to the floor):
 * resolving a loss request is a manager decision. The queue is the server-rendered snapshot, kept live by
 * a poll (the audit table is owner-read RLS, so it's not on the realtime publication — see ApprovalsBoard).
 */
export default async function ApprovalsPage() {
  const caller = await requireStaffPage("manager");

  const [pending, approvers] = await Promise.all([listPendingApprovals(), listApprovers()]);

  return (
    <main style={wrap}>
      <header style={header}>
        <div>
          <p className="eyebrow" style={{ marginBottom: 4 }}>
            Approvals
          </p>
          <h1 style={h1}>
            Pending requests <RoleBadge role={caller.role} />
          </h1>
        </div>
        <Link href="/staff" style={backLink}>
          ← Floor
        </Link>
      </header>

      <ApprovalsBoard initial={pending} approvers={approvers} />
    </main>
  );
}

const wrap: CSSProperties = {
  maxWidth: 820,
  margin: "0 auto",
  padding: "var(--s5) var(--s4) var(--s8)",
};
const header: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "var(--s4)",
  marginBottom: "var(--s5)",
  flexWrap: "wrap",
};
const h1: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-display)",
  fontSize: 26,
  display: "flex",
  alignItems: "center",
  gap: "var(--s3)",
};
const backLink: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: "var(--ac-strong)",
  textDecoration: "none",
  minHeight: 44,
  display: "inline-flex",
  alignItems: "center",
};
