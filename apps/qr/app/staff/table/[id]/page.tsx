import { type CSSProperties } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getStaffAuth } from "@/lib/staff";
import { isConsoleLocked } from "@/lib/staff-lock";
import { getTableDetail } from "@/lib/floor";
import { FloorDetailLive } from "@/components/staff/FloorDetailLive";

export const metadata = { title: "Table — Mandalay Morning Star" };
export const dynamic = "force-dynamic";

/**
 * Read-only per-table drill-down (S1.2). Staff-gated + lock-gated like the rest of the console. A
 * missing/closed session (a cleared or expired table) renders an honest "this table is closed" with a
 * way back, never a stale order. The live detail + the turnover clear-table live in FloorDetailLive.
 */
export default async function TablePage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await getStaffAuth();
  if (auth.kind === "anon") redirect("/staff/login");
  if (auth.kind === "not_staff") redirect("/staff/login?denied=1");
  if (await isConsoleLocked()) redirect("/staff/lock");

  const { id } = await params;
  const detail = await getTableDetail(id);
  if (!detail) {
    return (
      <main style={wrap}>
        <Link href="/staff" style={back}>
          ← Floor
        </Link>
        <h1 style={{ fontSize: 22, margin: "var(--s4) 0 8px" }}>This table is closed</h1>
        <p style={{ color: "var(--t2)", fontSize: 14, margin: 0 }}>
          It was cleared or its session expired. Head back to the floor for active tables.
        </p>
      </main>
    );
  }

  return <FloorDetailLive initial={detail} sessionId={id} />;
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
