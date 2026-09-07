import "server-only";

/**
 * P7·4 — open a GitHub issue for a staff report, so the report lands where the fixes are made.
 *
 * Best-effort and NEVER throws: the row is the record and is already saved before this runs. The
 * token is the owner's (a fine-grained PAT with Issues: write on the repository — OPEN-ITEMS C17);
 * unset means `unconfigured`, which the caller records as "no issue" rather than pretending.
 * A plain `fetch` against the REST API — one endpoint, no SDK to carry for it.
 */
export type CreateIssueResult =
  | { ok: true; url: string }
  | { ok: false; reason: "unconfigured" | "failed"; status?: number };

export const GITHUB_ISSUES_REPO_DEFAULT = "min-hinthar/mms-platform";
export const STAFF_REPORT_LABEL = "staff-report";

export async function createStaffReportIssue(issue: {
  title: string;
  body: string;
}): Promise<CreateIssueResult> {
  const token = process.env.GITHUB_ISSUES_TOKEN;
  const repo = process.env.GITHUB_ISSUES_REPO || GITHUB_ISSUES_REPO_DEFAULT;
  if (!token) {
    console.warn("[staff-report] GITHUB_ISSUES_TOKEN unset — no issue opened");
    return { ok: false, reason: "unconfigured" };
  }
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "mms-qr-staff-report",
      },
      body: JSON.stringify({ title: issue.title, body: issue.body, labels: [STAFF_REPORT_LABEL] }),
      // Inside the function's `after()` budget with the email and the row update still to run
      // (no `maxDuration` is set, so the platform default — 10–15 s — is the ceiling): a slow GitHub
      // must not leave an opened issue unrecorded because the function was reaped before the update.
      signal: AbortSignal.timeout(6_000),
    });
    if (res.status !== 201) {
      console.error("[staff-report] GitHub refused the issue", res.status);
      return { ok: false, reason: "failed", status: res.status };
    }
    const json = (await res.json()) as { html_url?: unknown };
    if (typeof json.html_url !== "string" || !json.html_url.startsWith("https://github.com/")) {
      console.error("[staff-report] GitHub answered 201 without an issue URL");
      return { ok: false, reason: "failed", status: 201 };
    }
    return { ok: true, url: json.html_url };
  } catch (e) {
    console.error("[staff-report] GitHub issue threw", (e as Error).message);
    return { ok: false, reason: "failed" };
  }
}
