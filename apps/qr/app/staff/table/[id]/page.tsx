import { type CSSProperties } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaffPage } from "@/lib/staff";
import { getTableDetail } from "@/lib/floor";
import { FloorDetailLive } from "@/components/staff/FloorDetailLive";
import { StaffOutageShell } from "@/components/staff/StaffOutageShell";
import { StaffLangSwitch } from "@/components/staff/StaffLangSwitch";
import { Chrome } from "@/components/staff/Chrome";
import { readStaffLang } from "@/lib/staff-lang-server";

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
    // P2 — the closed surface speaks the device language too, and mounts the control itself: this
    // branch renders INSTEAD of FloorDetailLive, so a person who lands here from a stale bookmark
    // would otherwise have no way to change the language of the only screen in front of them.
    const lang = await readStaffLang();
    return (
      <main style={wrap}>
        <div style={topRow}>
          <Link href="/staff" style={back}>
            {/* The arrow belongs to the label and lives inside the dictionary value (`kds.back`). */}
            <Chrome lang={lang} k="floor.back" />
          </Link>
          <StaffLangSwitch lang={lang} />
        </div>
        <h1 style={{ fontSize: "var(--fs-h2)", margin: "var(--s4) 0 8px" }}>
          <Chrome lang={lang} k="table.detail.closed.title" echo="stack" />
        </h1>
        <p style={{ color: "var(--t2)", fontSize: "var(--fs-sm)", margin: 0 }}>
          <Chrome lang={lang} k="table.detail.closed.body" echo="stack" />
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
const topRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--s3)",
  flexWrap: "wrap",
};
const back: CSSProperties = {
  display: "inline-flex",
  minHeight: 44,
  alignItems: "center",
  color: "var(--ac)",
  fontSize: "var(--fs-sm)",
  fontWeight: 600,
  textDecoration: "none",
};
