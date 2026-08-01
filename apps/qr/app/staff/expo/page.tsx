import { type CSSProperties } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaffPage } from "@/lib/staff";
import { getExpoQueue } from "@/lib/expo";
import { RoleBadge } from "@/components/staff/RoleBadge";
import { ExpoBoard } from "@/components/staff/ExpoBoard";
import { StaffOutageShell } from "@/components/staff/StaffOutageShell";

export const metadata = { title: "Expo — Mandalay Morning Star" };
export const dynamic = "force-dynamic";

/**
 * The expo / bagging station (S4.3a) — the takeaway counterpart to the KDS. Same verified-staff gate as
 * the floor + kitchen (requireStaffPage). The takeaway queue is the server-rendered initial
 * snapshot, kept live client-side (ExpoBoard) on the proven postgres_changes read path. The poll gate
 * discriminant can only trip here on a lock/session race — send it to the honest surface.
 */
export default async function ExpoPage() {
  const caller = await requireStaffPage();
  // W10b: outage keeps the URL — one tap of retry re-enters the expo the moment we're back.
  if (!caller) return <StaffOutageShell what="the expo board" />;
  const res = await getExpoQueue();
  if (!res.ok) {
    if (res.reason === "outage") return <StaffOutageShell what="the expo board" />;
    redirect(res.reason === "locked" ? "/staff/lock" : "/staff/login");
  }

  return (
    <main style={wrap}>
      <header style={header}>
        <div>
          <p className="eyebrow" style={{ marginBottom: 4 }}>
            Expo
          </p>
          <h1 style={h1}>
            Takeaway bags <RoleBadge role={caller.role} />
          </h1>
        </div>
        <Link href="/staff" style={backLink}>
          <span aria-hidden>←</span> Floor
        </Link>
      </header>

      <ExpoBoard initial={res.queue} />
    </main>
  );
}

const wrap: CSSProperties = {
  maxWidth: 1100,
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
  fontSize: "var(--fs-h1)",
  display: "flex",
  alignItems: "center",
  gap: "var(--s3)",
};
const backLink: CSSProperties = {
  fontSize: "var(--fs-sm)",
  fontWeight: 600,
  color: "var(--ac-strong)",
  textDecoration: "none",
  minHeight: 44,
  display: "inline-flex",
  alignItems: "center",
};
