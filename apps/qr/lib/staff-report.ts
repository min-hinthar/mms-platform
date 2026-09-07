import type { StaffKey } from "@/lib/i18n/staff";
import type { HelpScreen } from "@/lib/help";

/**
 * P7·4 — "Something's wrong": the pure part of the staff report. The shapes, the bounds (mirrored
 * as CHECKs on `qr_staff_reports` and as the Zod rail `staffReportInput`), the short id the sheet
 * and the email quote, the dictionary keys a status and a connection state render through, and the
 * GitHub issue's title + body — derived ONCE here so the email, the issue and the row cannot
 * describe the same report three different ways.
 *
 * Nothing here touches the network or the database; `lib/staff-report-actions.ts` does, behind the
 * staff gate, and `lib/github-issues.ts` / `lib/email.tsx` deliver.
 */

export const REPORT_MESSAGE_MAX = 2000;
/** How many of the reporter's own reports the sheet lists — "a row you can see". */
export const REPORT_LIST_LIMIT = 10;

export const REPORT_CONNECTIONS = ["live", "not_updating", "page"] as const;
export type ReportConnection = (typeof REPORT_CONNECTIONS)[number];

export const REPORT_STATUSES = ["open", "triaged", "fixed"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** What the client can see about itself. Every key optional; the Zod rail bounds each value. */
export type StaffReportDevice = {
  ua?: string;
  viewport?: string;
  online?: boolean;
  tz?: string;
  clientTime?: string;
  posthogDistinctId?: string;
  posthogSessionId?: string;
};

/** The client's half of a report. The reporter's identity is NOT here — the server adds it. */
export type StaffReportDraft = {
  screen: HelpScreen;
  message: string;
  lang: "en" | "my";
  path: string;
  connection: ReportConnection;
  appVersion: string | null;
  device: StaffReportDevice;
};

/** A saved report as the three deliveries see it: the draft plus what the server knows. */
export type StaffReportRecord = StaffReportDraft & {
  id: string;
  createdAt: string;
  staffName: string;
};

/** The id a person reads back to us: the first eight hex characters, upper-cased. */
export function shortReportId(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

/** EXACT equality; anything else — an older build's value, a hand edit — reads as open. */
export function parseReportStatus(value: string): ReportStatus {
  return value === "triaged" || value === "fixed" ? value : "open";
}

export function reportStatusKey(value: string): StaffKey {
  const status = parseReportStatus(value);
  return status === "triaged"
    ? "report.status.triaged"
    : status === "fixed"
      ? "report.status.fixed"
      : "report.status.open";
}

export function connectionKey(connection: ReportConnection): StaffKey {
  return connection === "live"
    ? "report.conn.live"
    : connection === "not_updating"
      ? "report.conn.notUpdating"
      : "report.conn.page";
}

/** The issue title: the screen and the first line of the person's words, bounded. */
export function staffReportTitle(r: Pick<StaffReportRecord, "screen" | "message">): string {
  const first = r.message.split(/\r?\n/, 1)[0]!.trim();
  const head = first.length > 72 ? `${first.slice(0, 71).trimEnd()}…` : first;
  return `[staff report] ${r.screen}: ${head}`;
}

/** Fence the person's words so a message that happens to contain markdown cannot restyle the issue
 *  — and a message that contains a fence cannot close ours. */
function fenced(text: string): string {
  return "```text\n" + text.replace(/```/g, "` ` `") + "\n```";
}

/** The diagnostics as label/value pairs, ONE order for the issue and the email. No email address,
 *  no secret: the staff name and the ids the app already holds. */
export function staffReportFacts(r: StaffReportRecord): [label: string, value: string][] {
  const d = r.device;
  const facts: [string, string][] = [
    ["Report", shortReportId(r.id)],
    ["Created", r.createdAt],
    ["Screen", r.screen],
    ["Path", r.path],
    ["Connection", r.connection],
    ["Language", r.lang],
    ["Version", r.appVersion ?? "unknown"],
    ["Reported by", r.staffName],
  ];
  if (d.online !== undefined) facts.push(["Online", d.online ? "yes" : "no"]);
  if (d.viewport) facts.push(["Viewport", d.viewport]);
  if (d.tz) facts.push(["Timezone", d.tz]);
  if (d.clientTime) facts.push(["Device clock", d.clientTime]);
  if (d.ua) facts.push(["User agent", d.ua]);
  if (d.posthogDistinctId) facts.push(["PostHog distinct id", d.posthogDistinctId]);
  if (d.posthogSessionId) facts.push(["PostHog session id", d.posthogSessionId]);
  return facts;
}

/** The GitHub issue, derived once. */
export function staffReportIssue(r: StaffReportRecord): { title: string; body: string } {
  const rows = staffReportFacts(r)
    .map(([k, v]) => `| ${k} | ${v.replace(/\|/g, "\\|").replace(/\r?\n/g, " ")} |`)
    .join("\n");
  const body = [
    "## What happened",
    "",
    fenced(r.message),
    "",
    "## Diagnostics",
    "",
    "| Field | Value |",
    "| --- | --- |",
    rows,
    "",
    `Row \`${r.id}\` in \`qr_staff_reports\` (status \`open\`). Filed automatically from the staff console's Help sheet.`,
  ].join("\n");
  return { title: staffReportTitle(r), body };
}
