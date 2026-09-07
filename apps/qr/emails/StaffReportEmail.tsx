import { Heading, Link, Section, Text } from "@react-email/components";
import type { CSSProperties } from "react";
import { MmsEmailLayout } from "./MmsEmailLayout";
import { EMAIL } from "./palette";

/**
 * P7·4 — a staff member's "Something's wrong" report, to the restaurant's admin address. The
 * person's words first, then the facts the app attached (the SAME list the GitHub issue carries —
 * `staffReportFacts`), then where it went: the issue link when one was opened, an honest line when
 * not. Best-effort, sent AFTER the row exists.
 */
export function StaffReportEmail({
  shortId,
  screen,
  message,
  facts,
  issueUrl,
}: {
  shortId: string;
  screen: string;
  message: string;
  facts: [label: string, value: string][];
  issueUrl: string | null;
}) {
  return (
    <MmsEmailLayout
      preview={`Something's wrong on the ${screen} screen — report ${shortId}`}
      reason="You’re receiving this because a staff member sent a report from the console’s Help sheet."
    >
      <Heading style={h1}>Something’s wrong on the {screen} screen</Heading>
      <Text style={lede}>Report {shortId} — in their words:</Text>
      <Section style={quote}>
        {message.split(/\r?\n/).map((line, i) => (
          <Text key={i} style={quoteText}>
            {line || " "}
          </Text>
        ))}
      </Section>
      <Text style={label}>Sent with it</Text>
      <table style={table} cellPadding={0} cellSpacing={0} role="presentation">
        <tbody>
          {facts.map(([k, v]) => (
            <tr key={k}>
              <td style={cellKey}>{k}</td>
              <td style={cellVal}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {issueUrl ? (
        <Text style={fine}>
          Task opened: <Link href={issueUrl}>{issueUrl}</Link>
        </Text>
      ) : (
        <Text style={fine}>
          No task was opened for this one (the GitHub token is unset or the request failed) — the
          row is still in qr_staff_reports.
        </Text>
      )}
    </MmsEmailLayout>
  );
}

const h1: CSSProperties = {
  fontFamily: "Georgia,'Times New Roman',serif",
  fontSize: "23px",
  fontWeight: 700,
  margin: "0 0 8px",
  color: EMAIL.tx,
};
const lede: CSSProperties = {
  fontSize: "15px",
  lineHeight: "1.6",
  color: EMAIL.t2,
  margin: "0 0 10px",
};
const quote: CSSProperties = {
  margin: "0 0 22px",
  padding: "12px 16px",
  borderLeft: `4px solid ${EMAIL.ac}`,
  backgroundColor: EMAIL.pg,
};
const quoteText: CSSProperties = {
  fontSize: "16px",
  lineHeight: "1.6",
  color: EMAIL.tx,
  margin: 0,
  whiteSpace: "pre-wrap",
};
const label: CSSProperties = {
  fontSize: "12px",
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: EMAIL.t2,
  margin: "0 0 6px",
};
const table: CSSProperties = { width: "100%", margin: "0 0 18px", borderCollapse: "collapse" };
const cellKey: CSSProperties = {
  fontSize: "13px",
  color: EMAIL.t2,
  padding: "4px 12px 4px 0",
  verticalAlign: "top",
  whiteSpace: "nowrap",
};
const cellVal: CSSProperties = {
  fontSize: "13px",
  color: EMAIL.tx,
  padding: "4px 0",
  verticalAlign: "top",
  wordBreak: "break-word",
};
const fine: CSSProperties = { fontSize: "13px", color: EMAIL.t2, margin: 0 };
