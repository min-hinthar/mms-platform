import { type CSSProperties } from "react";
import Link from "next/link";
import type { FloorTable } from "@/lib/floor-types";
import { FloorStatusChip } from "./FloorStatusChip";
import { RelativeTime } from "./RelativeTime";

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const MODE_LABEL: Record<FloorTable["mode"], string> = {
  dinein: "Dine-in",
  scango: "Scan & Go",
  pickup: "Pickup",
};

/**
 * One table on the floor (S1.2). The whole card is a link into the read-only drill-down (≥44px tap).
 * Shows the at-a-glance state a server scans: label, status, party, the running "so far" subtotal (or a
 * paid total), and last activity. An accessible name summarizes it so a screen-reader user gets the gist
 * without walking every child node.
 */
export function TableCard({ table, serverNow }: { table: FloorTable; serverNow: string }) {
  const showRunning = table.itemCount > 0;
  const a11yName =
    `Table ${table.label}, ${table.status}, party of ${table.partySize}` +
    (showRunning ? `, ${table.itemCount} items, ${fmt(table.runningSubtotalCents)} so far` : "") +
    (table.paidTotalCents != null ? `, ${fmt(table.paidTotalCents)} paid` : "");

  return (
    <Link href={`/staff/table/${table.sessionId}`} style={card} aria-label={a11yName}>
      <div style={topRow}>
        <span style={label}>{table.label}</span>
        <FloorStatusChip status={table.status} />
      </div>

      <div style={metaRow}>
        <span>{MODE_LABEL[table.mode]}</span>
        <span aria-hidden>·</span>
        <span>
          {table.partySize} {table.partySize === 1 ? "guest" : "guests"}
        </span>
        {table.hostName && (
          <>
            <span aria-hidden>·</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {table.hostName}
            </span>
          </>
        )}
      </div>

      <div style={bottomRow}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>
          {showRunning ? (
            <>
              {fmt(table.runningSubtotalCents)}{" "}
              <span style={{ fontWeight: 500, color: "var(--t2)", fontSize: 13 }}>
                so far · {table.itemCount} {table.itemCount === 1 ? "item" : "items"}
              </span>
            </>
          ) : table.paidTotalCents != null ? (
            <>
              {fmt(table.paidTotalCents)}{" "}
              <span style={{ fontWeight: 500, color: "var(--ok)", fontSize: 13 }}>paid</span>
            </>
          ) : (
            <span style={{ fontWeight: 500, color: "var(--t3)", fontSize: 13 }}>No items yet</span>
          )}
        </span>
        <span style={{ fontSize: 12, color: "var(--t3)" }}>
          <RelativeTime iso={table.lastActivityAt} serverNow={serverNow} />
        </span>
      </div>
    </Link>
  );
}

const card: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  minHeight: 44,
  padding: "var(--s4) var(--s5)",
  borderRadius: "var(--r-card)",
  border: "1px solid var(--bd)",
  background: "var(--cd)",
  boxShadow: "var(--sh)",
  textDecoration: "none",
  color: "var(--tx)",
};
const topRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
};
const label: CSSProperties = { fontFamily: "var(--font-display)", fontSize: 19, fontWeight: 700 };
const metaRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  flexWrap: "wrap",
  fontSize: 13,
  color: "var(--t2)",
};
const bottomRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  marginTop: 2,
};
