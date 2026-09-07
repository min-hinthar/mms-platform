import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { createStaffReportIssue, GITHUB_ISSUES_REPO_DEFAULT, STAFF_REPORT_LABEL } =
  await import("./github-issues");

/**
 * P7·4 — the issue client never throws and never pretends: unset token → `unconfigured` with no
 * request; anything but a 201 carrying an issue URL → `failed`. The request shape is pinned because
 * it is the only thing that decides whether the report lands on the team's list.
 */
const fetchMock = vi.fn();
const issue = { title: "[staff report] kitchen: x", body: "## What happened" };

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("GITHUB_ISSUES_TOKEN", "ghp_test");
  vi.stubEnv("GITHUB_ISSUES_REPO", "");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("createStaffReportIssue", () => {
  it("without a token: unconfigured, and NO request leaves", async () => {
    vi.stubEnv("GITHUB_ISSUES_TOKEN", "");
    await expect(createStaffReportIssue(issue)).resolves.toEqual({
      ok: false,
      reason: "unconfigured",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("posts to the default repository with the label, and returns the issue URL on 201", async () => {
    fetchMock.mockResolvedValue({
      status: 201,
      json: async () => ({ html_url: "https://github.com/min-hinthar/mms-platform/issues/300" }),
    });
    await expect(createStaffReportIssue(issue)).resolves.toEqual({
      ok: true,
      url: "https://github.com/min-hinthar/mms-platform/issues/300",
    });
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe(`https://api.github.com/repos/${GITHUB_ISSUES_REPO_DEFAULT}/issues`);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer ghp_test");
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ title: issue.title, body: issue.body, labels: [STAFF_REPORT_LABEL] });
  });
  it("honours GITHUB_ISSUES_REPO", async () => {
    vi.stubEnv("GITHUB_ISSUES_REPO", "someone/elsewhere");
    fetchMock.mockResolvedValue({
      status: 201,
      json: async () => ({ html_url: "https://github.com/someone/elsewhere/issues/1" }),
    });
    await createStaffReportIssue(issue);
    expect(fetchMock.mock.calls[0]![0]).toBe(
      "https://api.github.com/repos/someone/elsewhere/issues",
    );
  });
  it("a refusal is failed with its status; a 201 without a GitHub URL is failed too", async () => {
    fetchMock.mockResolvedValue({ status: 422, json: async () => ({}) });
    await expect(createStaffReportIssue(issue)).resolves.toEqual({
      ok: false,
      reason: "failed",
      status: 422,
    });
    fetchMock.mockResolvedValue({ status: 201, json: async () => ({ html_url: "http://evil/1" }) });
    await expect(createStaffReportIssue(issue)).resolves.toEqual({
      ok: false,
      reason: "failed",
      status: 201,
    });
  });
  it("a thrown fetch is failed, never a throw into the caller", async () => {
    fetchMock.mockRejectedValue(new Error("socket hang up"));
    await expect(createStaffReportIssue(issue)).resolves.toEqual({ ok: false, reason: "failed" });
  });
});
