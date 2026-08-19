import type { CSSProperties } from "react";
import type { ReceiptEntry } from "@/lib/receipt-entry";
import {
  buildReceiptRows,
  dollars,
  groupReceiptLines,
  receiptDateLabel,
  SERVICE_CHARGE_DISCLOSURE,
  serviceDisclosed,
} from "@/lib/receipt-view";
import {
  buildRefundRows,
  lineRefundLabel,
  PARTIAL_REFUND_NOTE,
  receiptStatusLabel,
} from "@/lib/refund-view";
import { formatSlotLong } from "@/lib/pickupTime";
import {
  BRAND_ADDRESS,
  BRAND_EMAIL,
  BRAND_NAME,
  BRAND_PHONE_DISPLAY,
  BRAND_PHONE_TEL,
} from "@/lib/brand";

/**
 * W7a → W22r — the receipt ARTIFACT: one full itemized rendering shared by the session-less `?r=`
 * view (and reused by the email's web-view link). Server component, zero client JS — a receipt is
 * a document, and now a COMPLETE one (owner: "as detailed … as delivery app with restaurant logos,
 * addresses, contact information"): the brand lockup carries the badge, and the foot carries the
 * full address + phone + email — every identity string verbatim from lib/brand (the delivery
 * repo's production constants; nothing invented).
 *
 * Money discipline: every figure is the fulfillment-time snapshot rendered verbatim
 * (lib/receipt-view builds the rows; nothing recomputes). M7: line amounts + ONE tax row.
 * W22r detail: destination group headings (only when the basket spans 2+ — the Bill rule),
 * per-line kitchen notes, the pickup contact name.
 */
export function ReceiptCard({ entry }: { entry: ReceiptEntry }) {
  // W23b — the refund rows follow the Total rather than altering it: the Total is what was charged
  // and stays the fulfillment-time snapshot verbatim; what came back is a LATER fact, and "You paid"
  // is the one derived number (from lib/refund-view, once).
  const rows = [
    ...buildReceiptRows(entry.breakdown, entry.totalCents),
    ...buildRefundRows(entry.refund),
  ];
  const groups = groupReceiptLines(entry.lines);
  return (
    <section className="card card-textured receipt-artifact" aria-labelledby="receipt-h">
      <header style={head}>
        <div style={{ minWidth: 0 }}>
          {/* The brand lockup — badge + name. The logo is decorative (alt="", the name is the
              adjacent text); a plain <img> so the print pipeline carries it onto paper. */}
          <p
            className="eyebrow"
            style={{ margin: "0 0 6px", display: "flex", alignItems: "center", gap: 8 }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- static asset, print-safe */}
            <img src="/logo.png" alt="" width={38} height={25} style={logoImg} />
            <span>
              <span aria-hidden>✦ </span>
              {BRAND_NAME}
            </span>
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
            {/* W22r — the pickup contact (W21's required field): the receipt names who it was
                for, like the counter ticket. Snapshot verbatim; null on dine-in/legacy rows. */}
            {entry.customerName && <> · For {entry.customerName}</>}
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

      {/* W22r — destination groups (the Bill's exact headings, only when the basket spans 2+).
          Each group is its own labeled list; a single-destination order renders one unlabeled
          list, exactly the pre-W22r shape. */}
      {groups.map((g) => (
        <div key={g.key}>
          {g.label && <p style={groupHead}>{g.label}</p>}
          <ul role="list" aria-label={g.label ?? "Items"} style={list}>
            {g.lines.map((l, i) => (
              <li key={i} className="history-line">
                {/* Qty NUMBER stays audible (the amount is qty-multiplied); the × glyph is decor. */}
                <span className="history-line-qty">
                  {l.qty}
                  <span aria-hidden>×</span>
                </span>
                <span>
                  <span style={{ color: "var(--tx)" }}>{l.name}</span>
                  {l.mods.length > 0 && (
                    <span className="history-line-mods">{l.mods.join(" · ")}</span>
                  )}
                  {/* W22r — the kitchen note, verbatim. The item sheet promised the kitchen would
                      see it; the receipt documents that it was on the order. */}
                  {l.notes && <span style={noteLine}>“{l.notes}”</span>}
                  {/* W23b — which dish came back. Stated as an amount, never a strike-through: the
                      over-refund cap can clamp a refund below the line's own price, and a struck
                      line would claim the whole dish returned when only part of it did. */}
                  {lineRefundLabel(l.refundedCents) && (
                    <span style={lineRefund}>{lineRefundLabel(l.refundedCents)}</span>
                  )}
                </span>
                <span style={lineAmount}>{dollars(l.unitPriceCents * l.qty)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}

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

      {/* Review MED — a refunded order KEEPS its receipt (the documentation matters most then)
          but is stamped honestly, never "Paid in full". */}
      <p style={entry.refund.state === "none" ? paidLine : refundedLine}>
        {receiptStatusLabel(entry.refund, entry.tender)}
        {entry.refund.state === "none" && <span aria-hidden> ✦</span>}
      </p>
      {/* Only the PARTIAL case: a full refund's status line already says the whole charge went
          back, and repeating it under a receipt whose every row is moot reads as an apology. */}
      {entry.refund.state === "partial" && <p style={disclosure}>{PARTIAL_REFUND_NOTE}</p>}

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

      {/* W22r — the business foot every real receipt carries: full address + phone + email,
          verbatim from lib/brand. Links stay tappable on screen and legible on paper. */}
      <footer style={identity}>
        <p style={identityLine}>
          {BRAND_NAME} · {BRAND_ADDRESS}
        </p>
        <p style={identityLine}>
          <a href={`tel:${BRAND_PHONE_TEL}`} style={identityLink}>
            {BRAND_PHONE_DISPLAY}
          </a>{" "}
          ·{" "}
          <a href={`mailto:${BRAND_EMAIL}`} style={identityLink}>
            {BRAND_EMAIL}
          </a>
        </p>
      </footer>
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
const logoImg: CSSProperties = { display: "block", flex: "none", borderRadius: 4 };
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
const groupHead: CSSProperties = {
  margin: "10px 0 0",
  fontSize: "var(--fs-xs)",
  fontWeight: 800,
  letterSpacing: "0.07em",
  textTransform: "uppercase",
  color: "var(--t3)",
};
const list: CSSProperties = { listStyle: "none", margin: "6px 0 0", padding: 0 };
const noteLine: CSSProperties = {
  display: "block",
  fontSize: "var(--fs-xs)",
  color: "var(--t3)",
  fontStyle: "italic",
  marginTop: 1,
};
const lineAmount: CSSProperties = { color: "var(--t2)", fontVariantNumeric: "tabular-nums" };
// W23b — the per-line refund mark. `--warn` rather than a red: money coming BACK is not an error
// state, and the receipt should read as an account, not an alarm.
const lineRefund: CSSProperties = {
  display: "block",
  fontSize: "var(--fs-xs)",
  fontWeight: 700,
  color: "var(--warn)",
  fontVariantNumeric: "tabular-nums",
  marginTop: 1,
};
const paidLine: CSSProperties = {
  margin: "12px 0 0",
  fontSize: "var(--fs-sm)",
  fontWeight: 700,
  color: "var(--ac-strong)",
};
const refundedLine: CSSProperties = {
  margin: "12px 0 0",
  fontSize: "var(--fs-sm)",
  fontWeight: 700,
  color: "var(--t2)",
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
const identity: CSSProperties = {
  marginTop: 14,
  paddingTop: 10,
  borderTop: "1px solid var(--bd)",
};
const identityLine: CSSProperties = {
  margin: 0,
  fontSize: "var(--fs-xs)",
  color: "var(--t3)",
  lineHeight: 1.7,
};
// Padded hit area + negative margin (adversarial LOW on #196): ≥44px tap targets on the tel/
// mailto links without inflating the fine-print line box; prints unchanged.
const identityLink: CSSProperties = {
  color: "var(--t2)",
  textDecorationColor: "var(--bd)",
  display: "inline-block",
  padding: "14px 4px",
  margin: "-14px -4px",
};
