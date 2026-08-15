import type { CSSProperties } from "react";
import type { OrderHistoryEntry } from "@/lib/rewards";
import {
  buildReceiptRows,
  dollars,
  receiptDateLabel,
  SERVICE_CHARGE_DISCLOSURE,
  serviceDisclosed,
  tenderLabel,
} from "@/lib/receipt-view";
import { formatSlotLong } from "@/lib/pickupTime";

/**
 * W7a — the receipt ARTIFACT: one full itemized rendering shared by the session-less `?r=` view
 * (and reused by the email's web-view link). Server component, zero client JS — a receipt is a
 * document. The DESIGN-RESEARCH receipt language: flat paper surface, no food photos in the
 * payment phase, dotted-leader rows (the history/checkout receipt families), the SB-1524
 * disclosure riding the fee it explains, brand dominant.
 *
 * Money discipline: every figure is the fulfillment-time snapshot rendered verbatim
 * (lib/receipt-view builds the rows; nothing recomputes). M7: line amounts + ONE tax row.
 */
export function ReceiptCard({ entry }: { entry: OrderHistoryEntry }) {
  const rows = buildReceiptRows(entry.breakdown, entry.totalCents);
  return (
    <section className="card card-textured receipt-artifact" aria-labelledby="receipt-h">
      <header style={head}>
        <div style={{ minWidth: 0 }}>
          <p className="eyebrow" style={{ margin: "0 0 4px" }}>
            <span aria-hidden>✦ </span>Mandalay Morning Star
          </p>
          <h1 id="receipt-h" style={h1}>
            Your receipt
            {/* The W12 bill vocabulary (သင့်ဘောက်ချာ) — one concept, one Burmese name (S14a). */}
            <span lang="my" style={h1My}>
              သင့်ဘောက်ချာ
            </span>
          </h1>
          <p style={meta}>
            {receiptDateLabel(entry.createdAt)}
            {entry.tableNumber != null && <> · Table {entry.tableNumber}</>}
            {entry.pickupSlot && <> · Pickup {formatSlotLong(entry.pickupSlot)}</>}
          </p>
        </div>
        {/* The order reference — the same aria pattern as the /track card: visible tail hidden
            from AT, an sr-only sibling reads it as spaced characters. */}
        <div style={{ textAlign: "right", flex: "none" }}>
          <div aria-hidden style={codeLabel}>
            Order
          </div>
          <div aria-hidden style={codeValue}>
            #{entry.code}
          </div>
          <span className="sr-only">{`Order reference ${entry.code.split("").join(" ")}`}</span>
        </div>
      </header>

      <ul role="list" aria-label="Items" style={list}>
        {entry.lines.map((l, i) => (
          <li key={i} className="history-line">
            {/* Qty NUMBER stays audible (the amount is qty-multiplied); the × glyph is decor. */}
            <span className="history-line-qty">
              {l.qty}
              <span aria-hidden>×</span>
            </span>
            <span>
              <span style={{ color: "var(--tx)" }}>{l.name}</span>
              {l.mods.length > 0 && <span className="history-line-mods">{l.mods.join(" · ")}</span>}
            </span>
            <span style={lineAmount}>{dollars(l.unitPriceCents * l.qty)}</span>
          </li>
        ))}
      </ul>

      <dl className="history-totals">
        {rows.map((r) => (
          <div
            key={r.key}
            className={r.grand ? "history-totals-row history-totals-grand" : "history-totals-row"}
          >
            <dt>{r.label}</dt>
            <dd>{`${r.negative ? "−" : ""}${dollars(r.amountCents)}`}</dd>
          </div>
        ))}
      </dl>

      <p style={paidLine}>
        Paid in full · {tenderLabel(entry.tender)}
        <span aria-hidden> ✦</span>
      </p>

      {/* SB-1524 — the fee never surfaces without its explanation (the north-star teardown's
          named failure is fees that appear only on the emailed receipt; this artifact IS that
          receipt, so the disclosure is structural, not optional). Verbatim from checkout. */}
      {serviceDisclosed(entry.breakdown) && <p style={disclosure}>{SERVICE_CHARGE_DISCLOSURE}</p>}

      <p style={farewell}>
        Thank you — see you again soon.{" "}
        <span lang="my" style={{ fontFamily: "var(--font-my)" }}>
          ကျေးဇူးတင်ပါတယ်
        </span>
      </p>
    </section>
  );
}

// Surface (bg/border/radius/shadow) comes from `.card`; layout only. The print block in
// globals.css flattens `.receipt-artifact` to plain paper.
const head: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  marginBottom: 10,
};
const h1: CSSProperties = {
  margin: 0,
  fontSize: "var(--fs-h2)",
  fontWeight: 900,
  color: "var(--tx)",
};
const h1My: CSSProperties = {
  display: "block",
  fontFamily: "var(--font-my)",
  fontSize: "var(--fs-sm)",
  fontWeight: 400,
  color: "var(--t2)",
  marginTop: 2,
};
const meta: CSSProperties = {
  margin: "6px 0 0",
  fontSize: "var(--fs-sm)",
  color: "var(--t2)",
};
const codeLabel: CSSProperties = {
  fontSize: "var(--fs-xs)",
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--t3)",
};
const codeValue: CSSProperties = {
  fontWeight: 800,
  fontSize: "var(--fs-sm)",
  letterSpacing: "0.04em",
  color: "var(--tx)",
};
const list: CSSProperties = { listStyle: "none", margin: "6px 0 0", padding: 0 };
const lineAmount: CSSProperties = { color: "var(--t2)", fontVariantNumeric: "tabular-nums" };
const paidLine: CSSProperties = {
  margin: "12px 0 0",
  fontSize: "var(--fs-sm)",
  fontWeight: 700,
  color: "var(--ac-strong)",
};
const disclosure: CSSProperties = {
  fontSize: "var(--fs-xs)",
  color: "var(--t3)",
  margin: "8px 2px 0",
  lineHeight: 1.5,
};
const farewell: CSSProperties = {
  margin: "14px 0 0",
  fontSize: "var(--fs-sm)",
  color: "var(--t2)",
};
