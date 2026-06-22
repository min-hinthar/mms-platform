import { type CSSProperties } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getStaffAuth } from "@/lib/staff";
import { isConsoleLocked } from "@/lib/staff-lock";
import { getKitchenQueue } from "@/lib/kitchen";
import { RoleBadge } from "@/components/staff/RoleBadge";
import { KdsBoard } from "@/components/staff/KdsBoard";

export const metadata = { title: "Kitchen — Mandalay Morning Star" };
export const dynamic = "force-dynamic";

/**
 * The KDS — kitchen display (S2.1b). Same verified-staff gate as the floor (the staff row, not a client
 * claim): anon → sign-in, a real-but-not-staff account → sign-in with a reason, a locked tablet → PIN.
 * The fire queue is the server-rendered initial snapshot, kept live client-side (KdsBoard). v1 runs on
 * the proven S1.2 postgres_changes read path — no realtime broadcast / privatization needed yet.
 */
export default async function KitchenPage() {
  const auth = await getStaffAuth();
  if (auth.kind === "anon") redirect("/staff/login");
  if (auth.kind === "not_staff") redirect("/staff/login?denied=1");
  if (await isConsoleLocked()) redirect("/staff/lock");
  const caller = auth.caller;
  const queue = await getKitchenQueue();

  return (
    <main style={wrap}>
      <header style={header}>
        <div>
          <p className="eyebrow" style={{ marginBottom: 4 }}>
            Kitchen
          </p>
          <h1 style={h1}>
            Fire queue <RoleBadge role={caller.role} />
          </h1>
        </div>
        <Link href="/staff" style={backLink}>
          ← Floor
        </Link>
      </header>

      <KdsBoard initial={queue} />
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
