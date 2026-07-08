import type { CSSProperties } from "react";
import type { OrderHistoryEntry } from "@/lib/rewards";
import { Card } from "@mms/ui";

const dollars = (c: number) => `$${(c / 100).toFixed(2)}`;
const TENDER_LABEL: Record<string, string> = { card: "Card", cash: "Cash", split: "Split" };
// Decorative tender glyph (aria-hidden) — the label carries the meaning for AT.
const TENDER_ICON: Record<string, string> = { card: "💳", cash: "💵", split: "🧾" };

/**
 * Order history (M4 P4.2) — the diner's own past orders, server-rendered from the uid-scoped read. Read-
 * only: date, total, tender, and a short item summary. Honest — only the orders they paid for (no reorder
 * promise here; reorder is a later slice that needs an active table cart).
 */
export function OrderHistory({ entries }: { entries: OrderHistoryEntry[] }) {
  return (
    <Card as="section" style={card} aria-labelledby="history-h">
      <h2 id="history-h" style={cardH}>
        Your orders
      </h2>
      <ul
        role="list"
        style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}
      >
        {entries.map((o, i) => {
          const summary = o.lines.map((l) => `${l.qty}× ${l.name}`).join(" · ");
          return (
            // Rise-in on mount (server-rendered once — no re-animate concern); the stagger delay is
            // capped so a long history doesn't crawl. `.mms-stagger` carries the reduced-motion switch;
            // `.history-row` adds the lifted-receipt sheen + hover deepen.
            <li
              key={o.id}
              className="mms-stagger history-row"
              style={{ animationDelay: `${Math.min(i, 6) * 45}ms` }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <span style={{ fontWeight: 700, color: "var(--tx)" }}>
                  {new Date(o.createdAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
                <span
                  style={{
                    fontWeight: 800,
                    color: "var(--tx)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {dollars(o.totalCents)}
                </span>
              </div>
              <p style={{ margin: "3px 0 8px", fontSize: 12.5, color: "var(--t2)", lineHeight: 1.5 }}>
                {summary || "—"}
              </p>
              <span
                className="history-badge"
                aria-label={`Paid with ${TENDER_LABEL[o.tender] ?? o.tender}`}
              >
                <span aria-hidden>{TENDER_ICON[o.tender] ?? "✓"}</span>
                Paid · {TENDER_LABEL[o.tender] ?? o.tender}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

// Surface (bg/border/radius/shadow) comes from `.card` via <Card>; this is layout only.
const card: CSSProperties = {
  padding: "var(--s5)",
  marginBottom: "var(--s4)",
};
const cardH: CSSProperties = {
  margin: "0 0 12px",
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: 0.3,
  textTransform: "uppercase",
  color: "var(--t2)",
};
