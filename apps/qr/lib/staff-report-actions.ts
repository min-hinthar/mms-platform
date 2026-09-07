"use server";
import { after } from "next/server";
import { serviceClient } from "@mms/db/server";
import { staffReportInput } from "@mms/db/schemas";
import { getStaffAuth } from "./staff";
import { sendStaffReportEmail } from "./email";
import { createStaffReportIssue } from "./github-issues";
import {
  REPORT_LIST_LIMIT,
  REPORT_RATE_MAX,
  REPORT_RATE_WINDOW_MS,
  shortReportId,
  staffReportIssue,
  type StaffReportRecord,
} from "./staff-report";

/**
 * P7·4 — "Something's wrong": the gated writer and the reporter's own list.
 *
 * ORDER IS THE CONTRACT. The row is written FIRST and answered; the email and the GitHub issue run
 * in `after()`, post-response, and what they achieved is RECORDED on the row (`emailed_at`,
 * `issue_url`) — never assumed. A report whose deliveries both failed is still a report, and the
 * sheet's list shows only what the row says.
 *
 * The reporter's identity comes from the VERIFIED session (`getStaffAuth`), never from the input —
 * `staffReportInput` has no identity field to forge. The three refusals are keyed, not sentences,
 * so the sheet renders them in the device language: `outage` (the answer is unknowable — the same
 * W10b distinction every staff arm keeps), `auth` (no staff session), `invalid`, `rate` (five per
 * person per ten minutes — the list is public and a stuck tap must not flood it), `save`.
 *
 * THE ISSUE IS PUBLIC: this repository is public on GitHub, so the issue carries only the words and
 * the five facts a bug needs (`staffReportIssueFacts`); the reporter's name, the device and the
 * PostHog ids go to the row and the email alone.
 */
export type SubmitStaffReportResult =
  | { ok: true; id: string; shortId: string }
  | { ok: false; reason: "outage" | "auth" | "invalid" | "rate" | "save" };

export type StaffReportRow = {
  id: string;
  shortId: string;
  createdAt: string;
  message: string;
  status: string;
  issueUrl: string | null;
};

export type ListMyStaffReportsResult =
  | { ok: true; rows: StaffReportRow[] }
  | { ok: false; reason: "outage" | "auth" | "read" };

export async function submitStaffReport(input: unknown): Promise<SubmitStaffReportResult> {
  const auth = await getStaffAuth();
  if (auth.kind === "unavailable") return { ok: false, reason: "outage" };
  if (auth.kind !== "staff") return { ok: false, reason: "auth" };
  const parsed = staffReportInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const d = parsed.data;
  const db = serviceClient();

  // The ceiling: a stuck tap or a bored thumb must not flood the team's list. A failed COUNT never
  // blocks a report — the row matters more than the ceiling — so only a real count refuses.
  const since = new Date(Date.now() - REPORT_RATE_WINDOW_MS).toISOString();
  const { count, error: countErr } = await db
    .from("qr_staff_reports")
    .select("id", { count: "exact", head: true })
    .eq("staff_id", auth.caller.staffId)
    .gte("created_at", since);
  if (!countErr && (count ?? 0) >= REPORT_RATE_MAX) return { ok: false, reason: "rate" };

  const { data: row, error } = await db
    .from("qr_staff_reports")
    .insert({
      staff_id: auth.caller.staffId,
      staff_name: auth.caller.displayName,
      screen: d.screen,
      path: d.path,
      message: d.message,
      lang: d.lang,
      connection: d.connection,
      app_version: d.appVersion,
      device: d.device,
    })
    .select("id, created_at")
    .single();
  if (error || !row) {
    console.error("[staff-report] insert failed", error?.message);
    return { ok: false, reason: "save" };
  }

  const record: StaffReportRecord = {
    ...d,
    id: row.id,
    createdAt: row.created_at,
    staffName: auth.caller.displayName,
  };
  // Post-response: the person has their id already; delivery cannot make the report un-happen.
  after(() => deliverStaffReport(record));
  return { ok: true, id: row.id, shortId: shortReportId(row.id) };
}

/**
 * Best-effort delivery, recorded honestly. The issue goes first so the email can link it; each
 * step's outcome is written to the row as it was, not as it was hoped. Never throws.
 */
async function deliverStaffReport(r: StaffReportRecord): Promise<void> {
  const issue = await createStaffReportIssue(staffReportIssue(r));
  const email = await sendStaffReportEmail({
    ...r,
    shortId: shortReportId(r.id),
    issueUrl: issue.ok ? issue.url : null,
  });
  const { data, error } = await serviceClient()
    .from("qr_staff_reports")
    .update({
      issue_url: issue.ok ? issue.url : null,
      emailed_at: email.ok ? new Date().toISOString() : null,
    })
    .eq("id", r.id)
    .select("id");
  // `.update()` reports no row count — a blocked write would read as success without this.
  if (error || !data || data.length === 0)
    console.error("[staff-report] could not record delivery", r.id, error?.message ?? "no row");
}

/** The reporter's own reports, newest first — "a row you can see". */
export async function listMyStaffReports(): Promise<ListMyStaffReportsResult> {
  const auth = await getStaffAuth();
  if (auth.kind === "unavailable") return { ok: false, reason: "outage" };
  if (auth.kind !== "staff") return { ok: false, reason: "auth" };
  const { data, error } = await serviceClient()
    .from("qr_staff_reports")
    .select("id, created_at, message, status, issue_url")
    .eq("staff_id", auth.caller.staffId)
    .order("created_at", { ascending: false })
    .limit(REPORT_LIST_LIMIT);
  if (error || !data) return { ok: false, reason: "read" };
  return {
    ok: true,
    rows: data.map((r) => ({
      id: r.id,
      shortId: shortReportId(r.id),
      createdAt: r.created_at,
      message: r.message,
      status: r.status,
      issueUrl: r.issue_url,
    })),
  };
}
