import { type CSSProperties } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getStaffAuth } from "@/lib/staff";
import { isConsoleLocked } from "@/lib/staff-lock";
import { getExpoQueue } from "@/lib/expo";
import { RoleBadge } from "@/components/staff/RoleBadge";
import { ExpoBoard } from "@/components/staff/ExpoBoard";

export const metadata = { title: "Expo — Mandalay Morning Star" };
export const dynamic = "force-dynamic";

/**
 * The expo / bagging station (S4.3a) — the takeaway counterpart to the KDS. Same verified-staff gate as
 * the floor + kitchen (the staff row, not a client claim): anon → sign-in, a real-but-not-staff account →
 * sign-in with a reason, a locked tablet → PIN. The takeaway queue is the server-rendered initial
 * snapshot, kept live client-side (ExpoBoard) on the proven postgres_changes read path.
 */
export default async function ExpoPage() {
  const auth = await getStaffAuth();
  if (auth.kind === "anon") redirect("/staff/login");
  if (auth.kind === "not_staff") redirect("/staff/login?denied=1");
  if (await isConsoleLocked()) redirect("/staff/lock");
  const caller = auth.caller;
  const queue = await getExpoQueue();

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

      <ExpoBoard initial={queue} />
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
