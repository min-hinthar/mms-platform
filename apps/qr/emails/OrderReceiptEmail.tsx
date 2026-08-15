import { Button, Hr, Section, Text } from "@react-email/components";
import type { CSSProperties } from "react";
import { MmsEmailLayout } from "./MmsEmailLayout";
import type { OrderHistoryEntry } from "@/lib/rewards";
import {
  buildReceiptRows,
  dollars,
  receiptDateLabel,
  SERVICE_CHARGE_DISCLOSURE,
  serviceDisclosed,
  tenderLabel,
} from "@/lib/receipt-view";

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
  entry: OrderHistoryEntry;
  receiptUrl: string;
}) {
  const rows = buildReceiptRows(entry.breakdown, entry.totalCents);
  return (
    <MmsEmailLayout preview={`Your receipt — ${dollars(entry.totalCents)} · #${entry.code}`}>
      <Text style={h1}>Your receipt</Text>
      <Text style={meta}>
        {receiptDateLabel(entry.createdAt)} · Order #{entry.code}
        {entry.tableNumber != null ? ` · Table ${entry.tableNumber}` : ""}
      </Text>

      <Section style={slip}>
        {entry.lines.map((l, i) => (
          <table key={i} width="100%" cellPadding={0} cellSpacing={0} role="presentation">
            <tbody>
              <tr>
                <td style={lineName}>
                  {l.qty}× {l.name}
                  {l.mods.length > 0 && <span style={lineMods}> — {l.mods.join(" · ")}</span>}
                </td>
                <td style={lineAmount}>{dollars(l.unitPriceCents * l.qty)}</td>
              </tr>
            </tbody>
          </table>
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
        <Text style={paid}>Paid in full · {tenderLabel(entry.tender)}</Text>
      </Section>

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
const lineName: CSSProperties = { fontSize: "14px", color: "#1b1714", padding: "3px 0" };
const lineMods: CSSProperties = { fontSize: "12px", color: "#6e6358" };
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
