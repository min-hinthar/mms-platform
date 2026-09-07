import { describe, expect, it } from "vitest";
import {
  connectionKey,
  parseReportStatus,
  reportStatusKey,
  shortReportId,
  staffReportFacts,
  staffReportIssue,
  staffReportTitle,
  type StaffReportRecord,
} from "./staff-report";

/**
 * P7·4 — the pure half of the report: the id a person reads back, the exact status parse, the
 * dictionary keys a chip renders through, and the ONE derivation of the issue's title and body.
 */
const base: StaffReportRecord = {
  id: "9f1c2a3b-4d5e-4f60-8a7b-0c1d2e3f4a5b",
  createdAt: "2026-09-07T05:30:00.000Z",
  staffName: "Daw Aye",
  screen: "kitchen",
  message: "Bump did nothing on T4",
  lang: "my",
  path: "/staff/kitchen",
  connection: "not_updating",
  appVersion: "7640e01",
  device: {},
};

describe("staff-report — ids, statuses, keys", () => {
  it("the short id is the first eight hex characters, upper-cased", () => {
    expect(shortReportId(base.id)).toBe("9F1C2A3B");
    expect(shortReportId("abcdef01-2345-6789-abcd-ef0123456789")).toBe("ABCDEF01");
  });
  it("status parses EXACTLY; anything else reads as open", () => {
    expect(parseReportStatus("triaged")).toBe("triaged");
    expect(parseReportStatus("fixed")).toBe("fixed");
    for (const junk of ["open", "Fixed", " fixed", "done", "", "closed"])
      expect(parseReportStatus(junk)).toBe("open");
    expect(reportStatusKey("triaged")).toBe("report.status.triaged");
    expect(reportStatusKey("fixed")).toBe("report.status.fixed");
    expect(reportStatusKey("anything")).toBe("report.status.open");
  });
  it("each connection state has its own key", () => {
    expect(connectionKey("live")).toBe("report.conn.live");
    expect(connectionKey("not_updating")).toBe("report.conn.notUpdating");
    expect(connectionKey("page")).toBe("report.conn.page");
  });
});

describe("staff-report — the issue, derived once", () => {
  it("titles with the screen and the FIRST line, bounded at 72", () => {
    expect(staffReportTitle(base)).toBe("[staff report] kitchen: Bump did nothing on T4");
    expect(staffReportTitle({ screen: "expo", message: "first line\nsecond line" })).toBe(
      "[staff report] expo: first line",
    );
    const long = "x".repeat(100);
    const t = staffReportTitle({ screen: "counter", message: long });
    expect(t.endsWith("…")).toBe(true);
    expect(t.length).toBe("[staff report] counter: ".length + 72);
  });
  it("fences the person's words so their markdown cannot restyle the issue, and a fence cannot close ours", () => {
    const { body } = staffReportIssue({ ...base, message: "## not a heading\n```\nrm -rf\n```" });
    expect(body).toContain("```text\n## not a heading\n` ` `\nrm -rf\n` ` `\n```");
    expect(body.match(/```/g)?.length).toBe(2);
  });
  it("carries the facts as a table — the report id, no email address, pipes escaped", () => {
    const rec = { ...base, device: { ua: "Safari | iPad", viewport: "1024×768", online: true } };
    const { body } = staffReportIssue(rec);
    expect(body).toContain("| Report | 9F1C2A3B |");
    expect(body).toContain("| Connection | not_updating |");
    expect(body).toContain("| Reported by | Daw Aye |");
    expect(body).toContain("| User agent | Safari \\| iPad |");
    expect(body).toContain("| Online | yes |");
    expect(body).toContain("Row `9f1c2a3b-4d5e-4f60-8a7b-0c1d2e3f4a5b` in `qr_staff_reports`");
    expect(staffReportFacts(rec).map(([k]) => k)).not.toContain("Email");
  });
  it("optional device facts appear only when present; a missing version reads as unknown", () => {
    const labels = staffReportFacts({ ...base, appVersion: null }).map(([k]) => k);
    expect(labels).toEqual([
      "Report",
      "Created",
      "Screen",
      "Path",
      "Connection",
      "Language",
      "Version",
      "Reported by",
    ]);
    expect(staffReportFacts({ ...base, appVersion: null })).toContainEqual(["Version", "unknown"]);
    const withIds = staffReportFacts({
      ...base,
      device: { posthogDistinctId: "d-1", posthogSessionId: "s-1", tz: "America/Los_Angeles" },
    });
    expect(withIds).toContainEqual(["PostHog distinct id", "d-1"]);
    expect(withIds).toContainEqual(["PostHog session id", "s-1"]);
    expect(withIds).toContainEqual(["Timezone", "America/Los_Angeles"]);
  });
});
