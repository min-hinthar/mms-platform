import { Button, Hr, Section, Text } from "@react-email/components";
import type { CSSProperties } from "react";
import { MmsEmailLayout } from "./MmsEmailLayout";
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
import { droppedLineLabel, droppedNoticeHeading, DROPPED_NOTICE_BODY } from "@/lib/dropped-view";

/**
 * W7a — the diner receipt (the artifact S1 named missing; the W2e spec's `OrderReceiptEmail`).
 * Same pure model as the on-screen artifact (lib/receipt-view), so the email can never disagree
 * with the page: itemized lines, zero-gated breakdown, ONE tax row (M7), the SB-1524 disclosure
 * riding the fee (DESIGN-RESEARCH: fees that surface only on the emailed receipt are the
 * north-star teardown's named failure — so the explanation ships IN the email), and the durable
 * `?r=` link as the primary action. Literal colors are the email-client sanctioned exception.
 */
export function OrderReceiptEmail({
  entry,
  receiptUrl,
}: {
  entry: ReceiptEntry;
  receiptUrl: string;
}) {
  // W23b — the same splice as the artifact. This email is the copy a guest keeps and forwards to
  // their bank; a partial refund it does not mention is the one place the omission is permanent.
  const rows = [
    ...buildReceiptRows(entry.breakdown, entry.totalCents),
    ...buildRefundRows(entry.refund),
  ];
  const groups = groupReceiptLines(entry.lines);
  return (
    <MmsEmailLayout
      preview={
        entry.refund.state === "none"
          ? `Your receipt — ${dollars(entry.totalCents)} · #${entry.code}`
          : // The preview line is the only part of a receipt many people ever read. An order with
            // money returned should say so there rather than in the body alone.
            `Your receipt — ${dollars(entry.refund.refundedCents)} refunded · #${entry.code}`
      }
      reason="You’re receiving this because you asked for your receipt when you ordered with us."
    >
      <Text style={h1}>Your receipt</Text>
      <Text style={meta}>
        {receiptDateLabel(entry.createdAt)} · Order #{entry.code}
        {entry.tableNumber != null ? ` · Table ${entry.tableNumber}` : ""}
        {entry.customerName ? ` · For ${entry.customerName}` : ""}
      </Text>

      <Section style={slip}>
        {/* W22r — the same destination grouping + kitchen notes as the artifact (one shared
            derivation — the email can never disagree with the page). */}
        {groups.map((g) => (
          <Section key={g.key}>
            {g.label && <Text style={groupHead}>{g.label}</Text>}
            {g.lines.map((l, i) => (
              <table key={i} width="100%" cellPadding={0} cellSpacing={0} role="presentation">
                <tbody>
                  <tr>
                    <td style={lineName}>
                      {l.qty}× {l.name}
                      {l.mods.length > 0 && <span style={lineMods}> — {l.mods.join(" · ")}</span>}
                      {l.notes ? <span style={lineNote}>“{l.notes}”</span> : null}
                      {lineRefundLabel(l.refundedCents) ? (
                        <span style={lineRefund}>{lineRefundLabel(l.refundedCents)}</span>
                      ) : null}
                    </td>
                    <td style={lineAmount}>{dollars(l.unitPriceCents * l.qty)}</td>
                  </tr>
                </tbody>
              </table>
            ))}
          </Section>
        ))}
        <Hr style={rule} />
        {rows.map((r) => (
          <table key={r.key} width="100%" cellPadding={0} cellSpacing={0} role="presentation">
            <tbody>
              <tr>
                <td style={r.grand ? rowLabelGrand : rowLabel}>{r.label}</td>
                <td style={r.grand ? rowAmountGrand : rowAmount}>
                  {r.negative ? "−" : ""}
                  {dollars(r.amountCents)}
                </td>
              </tr>
            </tbody>
          </table>
        ))}
        <Text style={paid}>{receiptStatusLabel(entry.refund, entry.tender)}</Text>
      </Section>

      {entry.refund.state === "partial" && <Text style={fine}>{PARTIAL_REFUND_NOTE}</Text>}

      {/* W23d — the emailed copy carries the same disclosure as the durable page (registry M71).
          Email clients strip most of what a list is, so the lines ride one Text as a comma series
          rather than a <ul> that half the world renders as run-together paragraphs. No dollar
          figure: nothing was charged for these. */}
      {entry.dropped.count > 0 && (
        <Text style={fine}>
          {droppedNoticeHeading(entry.dropped)}
          {entry.dropped.lines.length > 0
            ? ` — ${entry.dropped.lines.map(droppedLineLabel).join(", ")}.`
            : "."}{" "}
          {DROPPED_NOTICE_BODY}
        </Text>
      )}

      {serviceDisclosed(entry.breakdown) && <Text style={fine}>{SERVICE_CHARGE_DISCLOSURE}</Text>}

      <Section style={{ marginTop: "20px" }}>
        <Button href={receiptUrl} style={button}>
          View or print your receipt
        </Button>
      </Section>
      <Text style={fine}>
        That link is your lasting copy — it works for 90 days, no sign-in needed.
      </Text>

      <Text style={farewell}>Thank you — see you again soon. ကျေးဇူးတင်ပါတယ်</Text>
    </MmsEmailLayout>
  );
}

const h1: CSSProperties = { fontSize: "22px", fontWeight: 800, margin: "0 0 4px" };
const meta: CSSProperties = { fontSize: "13px", color: "#6e6358", margin: "0 0 16px" };
const slip: CSSProperties = {
  backgroundColor: "#ffffff",
  border: "1px solid #e8e2d9",
  borderRadius: "12px",
  padding: "16px 18px",
};
const groupHead: CSSProperties = {
  fontSize: "10px",
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#9b8f82",
  margin: "8px 0 2px",
};
const lineName: CSSProperties = { fontSize: "14px", color: "#1b1714", padding: "3px 0" };
const lineMods: CSSProperties = { fontSize: "12px", color: "#6e6358" };
const lineNote: CSSProperties = {
  display: "block",
  fontSize: "12px",
  fontStyle: "italic",
  color: "#9b8f82",
};
// W23b — the per-line refund mark. A warm clay rather than a red: money coming back is an account
// entry, not an error. Literal colors are the email-client sanctioned exception (no CSS vars).
const lineRefund: CSSProperties = {
  display: "block",
  fontSize: "12px",
  fontWeight: 700,
  color: "#a44b34",
};
const lineAmount: CSSProperties = {
  fontSize: "14px",
  color: "#1b1714",
  textAlign: "right" as const,
  whiteSpace: "nowrap" as const,
  padding: "3px 0 3px 12px",
};
const rule: CSSProperties = { borderColor: "#e8e2d9", margin: "10px 0" };
const rowLabel: CSSProperties = { fontSize: "13px", color: "#6e6358", padding: "2px 0" };
const rowAmount: CSSProperties = {
  fontSize: "13px",
  color: "#1b1714",
  textAlign: "right" as const,
  padding: "2px 0 2px 12px",
};
const rowLabelGrand: CSSProperties = {
  fontSize: "15px",
  fontWeight: 800,
  color: "#1b1714",
  padding: "6px 0 2px",
};
const rowAmountGrand: CSSProperties = {
  fontSize: "15px",
  fontWeight: 800,
  color: "#1b1714",
  textAlign: "right" as const,
  padding: "6px 0 2px 12px",
};
const paid: CSSProperties = {
  fontSize: "13px",
  fontWeight: 700,
  color: "#a65f10",
  margin: "10px 0 0",
};
const fine: CSSProperties = {
  fontSize: "12px",
  color: "#6e6358",
  margin: "10px 0 0",
  lineHeight: "1.5",
};
const button: CSSProperties = {
  backgroundColor: "#1b1714",
  color: "#faf9f5",
  fontSize: "14px",
  fontWeight: 700,
  borderRadius: "10px",
  padding: "12px 20px",
};
const farewell: CSSProperties = { fontSize: "13px", color: "#6e6358", margin: "18px 0 0" };
