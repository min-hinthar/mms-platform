import { type CSSProperties } from "react";
import Link from "next/link";
import { type FloorTable, tableDisplay } from "@/lib/floor-types";
import { FloorStatusChip } from "./FloorStatusChip";
import { RelativeTime } from "./RelativeTime";
import { LiveMoney } from "./LiveMoney";
import { Badge, Card, Icon } from "@mms/ui";

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const MODE_LABEL: Record<FloorTable["mode"], string> = {
  dinein: "Dine-in",
  scango: "Scan & Go",
  pickup: "Pickup",
};

/**
 * One table on the floor (S1.2 · enriched R9). The whole card is a link into the read-only drill-down
 * (≥44px tap) — so it opts into `interactive` (hover-lift + press) honestly, plus a `textured` layered
 * surface. Shows the at-a-glance state a server scans: label, status, party, the running "so far" subtotal
 * (rolling + flashing via `LiveMoney`), or a paid total, and last activity. `pulse` (a per-transition nonce
 * from FloorBoard's status diff) renders a KEYED one-shot accent ring — the peripheral "this table just
 * moved" cue; keying by the nonce restarts the ring even on a rapid second transition (a plain class toggle
 * would no-op). An accessible name summarizes the card so a screen-reader user gets the gist without walking
 * every child.
 */
export function TableCard({
  table,
  serverNow,
  pulse,
}: {
  table: FloorTable;
  serverNow: string;
  /** A per-transition nonce (FloorBoard diff) → a keyed one-shot ring overlay; undefined = no pulse. */
  pulse?: number;
}) {
  const showRunning = table.itemCount > 0;
  // K2: the real table number ("Table 7") at last; an unregistered/legacy sticker falls back to its
  // raw token, flagged so staff map it in the registry.
  const td = tableDisplay(table);
  const a11yName =
    `Table ${td.text}${td.unregistered ? ", unregistered sticker" : ""}, ${table.status}${table.tab !== "none" ? ", tab open" : ""}${table.tabOverCeiling ? ", over tab limit" : ""}, party of ${table.partySize}` +
    (showRunning ? `, ${table.itemCount} items, ${fmt(table.runningSubtotalCents)} so far` : "") +
    (table.paidTotalCents != null ? `, ${fmt(table.paidTotalCents)} paid` : "");

  return (
    <Card
      as={Link}
      href={`/staff/table/${table.sessionId}`}
      interactive
      textured
      style={card}
      aria-label={a11yName}
    >
      {/* Keyed one-shot status ring — remounts per transition nonce so it restarts on rapid changes.
          Decorative (aria-hidden); CSS `@media (prefers-reduced-motion)` off-switch. */}
      {pulse != null && <span key={pulse} className="floor-card-pulse" aria-hidden />}
      <div style={topRow}>
        <span style={label}>
          Table {td.text}
          {td.unregistered && (
            <span
              style={{
                marginLeft: 6,
                fontFamily: "var(--font-body)",
                fontSize: "var(--fs-xs)",
                color: "var(--warn)",
                fontWeight: 700,
              }}
            >
              unregistered
            </span>
          )}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {table.tab !== "none" && (
            // Decorative: the card's aria-label already says "tab open" / "over tab limit".
            // Warn keeps a non-color shape cue (alert glyph) too — never color-alone, for color-blind floor staff.
            // `bordered` matches the sibling FloorStatusChip's outlined look.
            <Badge tone={table.tabOverCeiling ? "warn" : "accent"} bordered decorative>
              {table.tabOverCeiling ? (
                <>
                  Tab <Icon name="alert" size={13} strokeWidth={2} />
                </>
              ) : (
                "Tab"
              )}
            </Badge>
          )}
          <FloorStatusChip status={table.status} />
        </span>
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
        <span style={{ fontWeight: 700, fontSize: "var(--fs-body)" }}>
          {showRunning ? (
            <>
              <LiveMoney cents={table.runningSubtotalCents} srHidden />{" "}
              <span style={{ fontWeight: 500, color: "var(--t2)", fontSize: "var(--fs-sm)" }}>
                so far · {table.itemCount} {table.itemCount === 1 ? "item" : "items"}
              </span>
            </>
          ) : table.paidTotalCents != null ? (
            <>
              {fmt(table.paidTotalCents)}{" "}
              <span style={{ fontWeight: 500, color: "var(--ok)", fontSize: "var(--fs-sm)" }}>
                paid
              </span>
            </>
          ) : (
            <span style={{ fontWeight: 500, color: "var(--t3)", fontSize: "var(--fs-sm)" }}>
              No items yet
            </span>
          )}
        </span>
        <span style={{ fontSize: "var(--fs-sm)", color: "var(--t3)" }}>
          <RelativeTime iso={table.lastActivityAt} serverNow={serverNow} />
        </span>
      </div>
    </Card>
  );
}

// Surface (bg/border/radius/shadow) comes from `.card` via <Card as={Link}>; layout + link reset only.
const card: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  minHeight: 44,
  padding: "var(--s4) var(--s5)",
  textDecoration: "none",
  color: "var(--tx)",
};
const topRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
};
const label: CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "var(--fs-h3)",
  fontWeight: 700,
};
const metaRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  flexWrap: "wrap",
  fontSize: "var(--fs-sm)",
  color: "var(--t2)",
};
const bottomRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  marginTop: 2,
};
