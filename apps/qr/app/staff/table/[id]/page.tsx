import { type CSSProperties } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaffPage } from "@/lib/staff";
import { getTableDetail } from "@/lib/floor";
import { FloorDetailLive } from "@/components/staff/FloorDetailLive";
import { StaffOutageShell } from "@/components/staff/StaffOutageShell";

export const metadata = { title: "Table — Mandalay Morning Star" };
export const dynamic = "force-dynamic";

/**
 * Read-only per-table drill-down (S1.2). Staff-gated + lock-gated like the rest of the console. A
 * missing/closed session (a cleared or expired table) renders an honest "this table is closed" with a
 * way back, never a stale order — and ONLY a genuine `closed` says that (W10b): an unreadable table
 * renders the outage shell in place, keeping the URL. The live detail + clear-table live in
 * FloorDetailLive.
 */
export default async function TablePage({ params }: { params: Promise<{ id: string }> }) {
  const caller = await requireStaffPage();
  const { id } = await params;
  if (!caller) return <StaffOutageShell what="what.table" />;

  const res = await getTableDetail(id);
  if (res.kind === "outage") return <StaffOutageShell what="what.table" />;
  if (res.kind === "signin") redirect("/staff/login"); // gate race between requireStaffPage and the read
  if (res.kind === "closed") {
    return (
      <main style={wrap}>
        <Link href="/staff" style={back}>
          ← Floor
        </Link>
        <h1 style={{ fontSize: "var(--fs-h2)", margin: "var(--s4) 0 8px" }}>
          This table is closed
        </h1>
        <p style={{ color: "var(--t2)", fontSize: "var(--fs-sm)", margin: 0 }}>
          It was cleared or its session expired. Head back to the floor for active tables.
        </p>
      </main>
    );
  }

  return (
    <FloorDetailLive
      initial={res.detail}
      sessionId={id}
      // W6c: the reader id is server-only config; the client gets only the boolean.
      terminalReady={Boolean(process.env.STRIPE_TERMINAL_READER_ID)}
    />
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
