import type { CSSProperties } from "react";
import { TransitionLink as Link } from "./nav/TransitionNav"; // J1 journey grammar
import type { OrderHistoryEntry } from "@/lib/rewards";
import { formatSlotLong } from "@/lib/pickupTime";
import { Card } from "@mms/ui";

/**
 * Order history (M4 P4.2 · elevated) — the diner's own past PAID orders, server-rendered from the uid-scoped
 * read. Grouped by month, each order an expandable receipt (native `<details>` — free disclosure a11y, zero
 * client JS, honoring the server-first rule): the collapsed summary shows date · #ref · total · a line
 * summary · tender/fulfillment chips; expanding reveals per-line qty/name/modifiers/price + the full
 * server-derived breakdown (subtotal/discount/service/tax/tip/total). Totals are PRESENTATION-ONLY — the
 * cents are rendered verbatim, never recomputed. A real empty state invites a first-time diner to the menu.
 */
const dollars = (c: number) => `$${(c / 100).toFixed(2)}`;
const TENDER_LABEL: Record<string, string> = { card: "Card", cash: "Cash" };
const TENDER_ICON: Record<string, string> = { card: "💳", cash: "💵" };
const FULFILL_LABEL: Record<string, string> = { togo: "To go", grocery: "Grocery" };

// The Covina teahouse's local time — dates + month grouping reflect the RESTAURANT's day regardless of the
// server's timezone (Vercel runs UTC), so an evening order never drifts into the next day/month.
const TZ = "America/Los_Angeles";
const fmtMonth = new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "long", year: "numeric" });
const fmtDay = new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric" });
const fmtFull = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function groupByMonth(entries: OrderHistoryEntry[]) {
  const groups: { label: string; orders: { e: OrderHistoryEntry; gIndex: number }[] }[] = [];
  entries.forEach((e, gIndex) => {
    const label = fmtMonth.format(new Date(e.createdAt));
    const last = groups[groups.length - 1];
    if (!last || last.label !== label) groups.push({ label, orders: [{ e, gIndex }] });
    else last.orders.push({ e, gIndex });
  });
  return groups;
}

export function OrderHistory({ entries }: { entries: OrderHistoryEntry[] }) {
  // `.vt-receipt` (J4): the /track receipt card (earner, fresh payment) MORPHS into this card on the
  // track→account cut — the receipt visibly tucks into the diner's own history. Exactly one instance
  // per document (the two branches are exclusive); unpaired on other routes, which is harmless.
  if (entries.length === 0) {
    return (
      <Card as="section" className="vt-receipt" style={card} aria-labelledby="history-h">
        <h2 id="history-h" style={cardH}>
          Your orders
        </h2>
        <div className="track-notice" style={{ padding: "16px 8px 6px", marginTop: 0 }}>
          <div className="track-notice-medallion" aria-hidden>
            🧾
          </div>
          <p style={emptyTitle}>No orders yet</p>
          <p style={emptySub}>When you order at the table, your receipts live here.</p>
          <Link href="/menu" className="nav-link">
            Browse the menu{" "}
            <span aria-hidden className="nav-arrow nav-arrow-fwd">
              →
            </span>
          </Link>
        </div>
      </Card>
    );
  }

  const groups = groupByMonth(entries);

  return (
    <Card as="section" className="vt-receipt" style={card} aria-labelledby="history-h">
      <h2 id="history-h" style={cardH}>
        Your orders
      </h2>
      {groups.map((g) => (
        <section key={g.label}>
          <h3 className="history-month">
            {g.label}
            <span aria-hidden style={{ color: "var(--t3)", fontWeight: 700 }}>
              {g.orders.length}
            </span>
          </h3>
          <ul role="list" style={list}>
            {g.orders.map(({ e: o, gIndex }) => {
              const day = fmtDay.format(new Date(o.createdAt));
              const full = fmtFull.format(new Date(o.createdAt));
              const itemCount = o.lines.reduce((a, l) => a + l.qty, 0);
              const summary = o.lines.map((l) => `${l.qty}× ${l.name}`).join(" · ") || "—";
              const kind = o.lines.some((l) => l.fulfillment === "grocery")
                ? "grocery"
                : o.lines.some((l) => l.fulfillment === "togo")
                  ? "togo"
                  : null;
              return (
                <li
                  key={o.id}
                  className="mms-stagger"
                  style={{ animationDelay: `${Math.min(gIndex, 8) * 40}ms` }}
                >
                  <details className="history-card">
                    <summary
                      className="history-summary"
                      aria-label={`Order ${o.code}, ${full}, total ${dollars(o.totalCents)}, paid ${TENDER_LABEL[o.tender] ?? o.tender}${kind ? `, ${FULFILL_LABEL[kind]}` : ""}. Show items.`}
                    >
                      <div style={rowTop}>
                        <span style={{ fontWeight: 700, color: "var(--tx)" }}>
                          {day} <span style={codeStyle}>#{o.code}</span>
                        </span>
                        <span style={totalStyle}>{dollars(o.totalCents)}</span>
                      </div>
                      <div style={rowMid}>
                        <span style={summaryStyle}>{summary}</span>
                        <span className="history-chev" aria-hidden>
                          ›
                        </span>
                      </div>
                      <div style={chipRow}>
                        <span className="history-badge">
                          <span aria-hidden>{TENDER_ICON[o.tender] ?? "✓"}</span>
                          Paid · {TENDER_LABEL[o.tender] ?? o.tender}
                        </span>
                        {kind && <span className="history-fulfill">{FULFILL_LABEL[kind]}</span>}
                        <span style={itemCountStyle}>
                          {itemCount} {itemCount === 1 ? "item" : "items"}
                        </span>
                      </div>
                    </summary>
                    <div className="history-detail">
                      <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                        {o.lines.map((l, li) => (
                          <li key={li} className="history-line">
                            {/* Keep the qty NUMBER audible (the price is qty-multiplied — hiding it would
                                read "Latte $9.00" for a 2× line); only the × glyph is decorative. */}
                            <span className="history-line-qty">
                              {l.qty}
                              <span aria-hidden>×</span>
                            </span>
                            <span>
                              <span style={{ color: "var(--tx)" }}>{l.name}</span>
                              {l.mods.length > 0 && (
                                <span className="history-line-mods">{l.mods.join(" · ")}</span>
                              )}
                            </span>
                            <span style={linePrice}>{dollars(l.unitPriceCents * l.qty)}</span>
                          </li>
                        ))}
                      </ul>
                      <dl className="history-totals">
                        <TotalRow label="Subtotal" value={dollars(o.breakdown.subtotalCents)} />
                        {o.breakdown.discountCents > 0 && (
                          <TotalRow
                            label="Discount"
                            value={`−${dollars(o.breakdown.discountCents)}`}
                          />
                        )}
                        {o.breakdown.serviceChargeCents > 0 && (
                          <TotalRow
                            label="Service"
                            value={dollars(o.breakdown.serviceChargeCents)}
                          />
                        )}
                        {o.breakdown.taxCents > 0 && (
                          <TotalRow label="Tax" value={dollars(o.breakdown.taxCents)} />
                        )}
                        {o.breakdown.tipCents > 0 && (
                          <TotalRow label="Tip" value={dollars(o.breakdown.tipCents)} />
                        )}
                        <TotalRow label="Total" value={dollars(o.totalCents)} grand />
                      </dl>
                      <p style={detailMeta}>
                        {full}
                        {o.pickupSlot ? ` · Pickup ${formatSlotLong(o.pickupSlot)}` : ""}
                      </p>
                      {/* J5 — reorder "your usual": lands on the menu, which runs the earner-gated
                          server reorder once the session's cart is ready (every price re-derived at
                          TODAY's menu — never these historical figures) and says exactly what came
                          back and what didn't. The card stays server-rendered — the TransitionLink
                          is its only client island.
                          A pickup order carries mode=pickup so the slot picker is part of the flow
                          (a bare /menu is scan&go — no slot, and the bag would fire immediately on
                          payment). Other orders land scan&go: we can't know from here whether a
                          dine-in table session is live on this device, and minting a phantom dine-in
                          table from home would be worse than a visible device cart. */}
                      <Link
                        href={`/menu?reorder=${encodeURIComponent(o.id)}${o.pickupSlot ? "&mode=pickup" : ""}`}
                        className="nav-link"
                      >
                        Order this again{" "}
                        <span aria-hidden className="nav-arrow nav-arrow-fwd">
                          →
                        </span>
                      </Link>
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </Card>
  );
}

function TotalRow({ label, value, grand }: { label: string; value: string; grand?: boolean }) {
  return (
    <div className={grand ? "history-totals-row history-totals-grand" : "history-totals-row"}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

// Surface (bg/border/radius/shadow) comes from `.card` via <Card>; this is layout only.
const card: CSSProperties = { padding: "var(--s5)", marginBottom: "var(--s4)" };
const cardH: CSSProperties = {
  margin: "0 0 4px",
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: 0.3,
  textTransform: "uppercase",
  color: "var(--t2)",
};
// minmax(0,1fr) so the receipt cards can't be widened past this column by a long nowrap summary line
// (the implicit `auto` grid track sizes to max-content → a mobile horizontal overflow). Pairs with the
// same guard on `.history-summary`'s own grid.
const list: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: 8,
};
const rowTop: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  gap: 10,
};
const totalStyle: CSSProperties = {
  fontWeight: 800,
  color: "var(--tx)",
  fontVariantNumeric: "tabular-nums",
};
const codeStyle: CSSProperties = {
  fontFamily: "var(--font-body)",
  fontWeight: 600,
  fontSize: 11.5,
  color: "var(--t3)",
  letterSpacing: 0.4,
};
const rowMid: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
};
const summaryStyle: CSSProperties = {
  fontSize: 12.5,
  color: "var(--t2)",
  lineHeight: 1.45,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  minWidth: 0,
};
const chipRow: CSSProperties = { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 };
const itemCountStyle: CSSProperties = { fontSize: 11.5, color: "var(--t3)" };
const linePrice: CSSProperties = { color: "var(--t2)", fontVariantNumeric: "tabular-nums" };
const detailMeta: CSSProperties = { margin: "10px 0 0", fontSize: 11.5, color: "var(--t3)" };
const emptyTitle: CSSProperties = { margin: 0, fontSize: 16, fontWeight: 800, color: "var(--tx)" };
const emptySub: CSSProperties = {
  margin: "4px 0 12px",
  fontSize: 13,
  color: "var(--t2)",
  lineHeight: 1.5,
};
