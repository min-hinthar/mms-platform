import { type CSSProperties } from "react";
import Link from "next/link";
import { type FloorTable, tableDisplay } from "@/lib/floor-types";
import { al } from "@/lib/staff-labels";
import { plural, tf } from "@/lib/i18n/fill";
import type { StaffLang } from "@/lib/staff-lang";
import { Chrome } from "./Chrome";
import { FloorStatusChip } from "./FloorStatusChip";
import { RelativeTime } from "./RelativeTime";
import { LiveMoney } from "./LiveMoney";
import { Badge, Card, Icon } from "@mms/ui";

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const MODE_KEY = {
  dinein: "floor.mode.dinein",
  scango: "floor.mode.scango",
  pickup: "floor.mode.pickup",
} as const satisfies Record<FloorTable["mode"], string>;

/**
 * One table on the floor (S1.2 · enriched R9). The whole card is a link into the read-only drill-down
 * (≥44px tap) — so it opts into `interactive` (hover-lift + press) honestly, plus a `textured` layered
 * surface. Shows the at-a-glance state a server scans: label, status, party, the running "so far" subtotal
 * (rolling + flashing via `LiveMoney`), or a paid total, and last activity. `pulse` (a per-transition nonce
 * from FloorBoard's status diff) renders a KEYED one-shot accent ring — the peripheral "this table just
 * moved" cue; keying by the nonce restarts the ring even on a rapid second transition (a plain class toggle
 * would no-op). An accessible name summarizes the card so a screen-reader user gets the gist without walking
 * every child.
 *
 * P2 · OPEN-ITEMS P2g — that name used to be built HERE, and it interpolated `table.status` RAW: a
 * splitting table announced "settling" while the chip beside it read "Splitting". A WCAG 2.5.3
 * mismatch in ENGLISH, present before this slice and invisible to every guard, because a name
 * assembled in a local `const` is a string nothing can hold to the label it is supposed to contain.
 * It now comes from `al()`, which reads the SAME `FLOOR_STATUS_KEY` the chip renders.
 */
export function TableCard({
  table,
  serverNow,
  pulse,
  lang,
}: {
  table: FloorTable;
  serverNow: string;
  /** A per-transition nonce (FloorBoard diff) → a keyed one-shot ring overlay; undefined = no pulse. */
  pulse?: number;
  /** The staff device language, from `FloorBoard` (which reads it once from the provider). */
  lang: StaffLang;
}) {
  const showRunning = table.itemCount > 0;
  // K2: the real table number ("Table 7") at last; an unregistered/legacy sticker falls back to its
  // raw token, flagged so staff map it in the registry.
  const td = tableDisplay(table);
  const { aria } = al(lang, {
    kind: "table",
    label: td.text,
    unregistered: td.unregistered,
    status: table.status,
    tabOpen: table.tab !== "none",
    tabOverCeiling: table.tabOverCeiling,
    partySize: table.partySize,
    itemCount: table.itemCount,
    runningSubtotal: fmt(table.runningSubtotalCents),
    paidTotal: table.paidTotalCents != null ? fmt(table.paidTotalCents) : null,
  });

  return (
    <Card
      as={Link}
      href={`/staff/table/${table.sessionId}`}
      interactive
      textured
      style={card}
      aria-label={aria}
    >
      {/* Keyed one-shot status ring — remounts per transition nonce so it restarts on rapid changes.
          Decorative (aria-hidden); CSS `@media (prefers-reduced-motion)` off-switch. */}
      {pulse != null && <span key={pulse} className="floor-card-pulse" aria-hidden />}
      <div style={topRow}>
        {/* The SAME key `al()` used for the name's leading fragment, rendered through <Chrome> so the
            Latin table number inside the Burmese run keeps its own `lang="en"` — a flat string
            could not carry that, and `$`-free though it is, `Table 7` still needs the body face. */}
        <span style={label}>
          <Chrome lang={lang} k="floor.table" vars={{ id: td.text }} />
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
              <Chrome lang={lang} k="floor.unregistered" />
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
                  <Chrome lang={lang} k="floor.tab" />{" "}
                  <Icon name="alert" size={13} strokeWidth={2} />
                </>
              ) : (
                <Chrome lang={lang} k="floor.tab" />
              )}
            </Badge>
          )}
          <FloorStatusChip status={table.status} lang={lang} />
        </span>
      </div>

      <div style={metaRow}>
        <span>
          <Chrome lang={lang} k={MODE_KEY[table.mode]} />
        </span>
        <span aria-hidden>·</span>
        <span lang={lang === "my" ? "my" : undefined}>
          {tf(lang, "floor.party", { n: table.partySize })}
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
              <span
                style={{ fontWeight: 500, color: "var(--t2)", fontSize: "var(--fs-sm)" }}
                lang={lang === "my" ? "my" : undefined}
              >
                <Chrome lang={lang} k="floor.card.soFarLabel" /> ·{" "}
                {tf(lang, plural(table.itemCount, "floor.card.item.one", "floor.card.item.many"), {
                  n: table.itemCount,
                })}
              </span>
            </>
          ) : table.paidTotalCents != null ? (
            <>
              {fmt(table.paidTotalCents)}{" "}
              <span style={{ fontWeight: 500, color: "var(--ok)", fontSize: "var(--fs-sm)" }}>
                <Chrome lang={lang} k="floor.status.paid" />
              </span>
            </>
          ) : (
            <span style={{ fontWeight: 500, color: "var(--t3)", fontSize: "var(--fs-sm)" }}>
              <Chrome lang={lang} k="floor.card.empty" />
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
  fontSize: "var(--fs-h2)",
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
