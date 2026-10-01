import { type CSSProperties } from "react";
import { STAFF_DOOR_TARGET } from "@/lib/staff-door";
import { redirect } from "next/navigation";
import { requireStaffPage } from "@/lib/staff";
import { getTableDetail } from "@/lib/floor";
import { FloorDetailLive } from "@/components/staff/FloorDetailLive";
import { ClosedHandoffCard } from "@/components/staff/HandoffCard";
import { StaffOutageShell } from "@/components/staff/StaffOutageShell";
import { StaffBar } from "@/components/staff/StaffBar";
import { staffHasPin } from "@/lib/staff-pin";
import { Chrome } from "@/components/staff/Chrome";
import { readStaffLang } from "@/lib/staff-lang-server";

export const metadata = { title: "Table — Mandalay Morning Star" };
export const dynamic = "force-dynamic";

/**
 * Read-only per-table drill-down (S1.2). Staff-gated + lock-gated like the rest of the console. A
 * missing/closed session (a cleared or expired table) renders an honest "this table is closed" with a
 * way back, never a stale order — and ONLY a genuine `closed` says that (W10b): an unreadable table
 * renders the outage shell in place, keeping the URL. The live detail + clear-table live in
 * FloorDetailLive. Phase 2g · P2em (D2) — a closed COUNTER order whose verdict carries its paid card
 * (built on the server from the order row) shows that card instead: "Paid · $X · #CODE", the call-out
 * and the way back to the counter, on any device, with no panel and no stash.
 */
export default async function TablePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  // Phase 2a · send — `?send=1` is the add page's "Review · N not sent →": land focused on the Send.
  // Phase 2c · register — `?settle=1` is the order pad's Settle: land focused on the settle section.
  // ONE read of the params, two focus targets (FloorDetailLive's arrival effect picks one).
  searchParams: Promise<{ send?: string | string[]; settle?: string | string[] }>;
}) {
  const caller = await requireStaffPage();
  const { id } = await params;
  const sp = await searchParams;
  if (!caller) return <StaffOutageShell what="what.table" />;
  const hasPin = await staffHasPin(caller.staffId);

  const res = await getTableDetail(id);
  if (res.kind === "outage") return <StaffOutageShell what="what.table" />;
  if (res.kind === "signin") redirect("/staff/login"); // gate race between requireStaffPage and the read
  if (res.kind === "closed") {
    // P2 — the closed surface speaks the device language too. P2e — like every in-service bar it
    // mounts no language control; its Back pill leads to the counter, whose Help sheet has the
    // Language row (`check-staff-lang` rule 4d holds this arm's leading to that way up).
    const lang = await readStaffLang();
    // Phase 2g · P2em (D2) — the counter order's paid card from its order row, when the verdict
    // carries one (null for a table, a refunded order, or an order read that failed).
    const handoff = res.handoff ?? null;
    return (
      <main className="staff-main">
        <StaffBar
          lang={lang}
          title={handoff ? "floor.pane.closed.counterTitle" : "table.detail.closed.title"}
          leading={{ kind: "back", href: STAFF_DOOR_TARGET.counter, k: "floor.back" }}
          lock={hasPin}
        />
        <div className="staff-col" style={wrap}>
          {handoff ? (
            <ClosedHandoffCard lang={lang} sessionId={id} handoff={handoff} />
          ) : (
            <p style={{ color: "var(--t2)", fontSize: "var(--fs-sm)", margin: 0 }}>
              <Chrome lang={lang} k="table.detail.closed.body" echo="stack" />
            </p>
          )}
        </div>
      </main>
    );
  }

  return (
    <FloorDetailLive
      initial={res.detail}
      sessionId={id}
      hasPin={hasPin}
      arrivedToSend={sp.send === "1"}
      focusSettle={sp.settle === "1"}
      // W6c: the reader id is server-only config; the client gets only the boolean.
      terminalReady={Boolean(process.env.STRIPE_TERMINAL_READER_ID)}
    />
  );
}

const wrap: CSSProperties = { maxWidth: 640, margin: "0 auto" };
